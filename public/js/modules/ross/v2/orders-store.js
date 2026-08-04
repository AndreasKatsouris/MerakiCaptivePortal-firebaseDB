// Orders store — the D1 supplier book.
// Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §4.2.
//
// Holds the supplier book, the seed PREVIEW the owner is reviewing, and the
// loading/error state for both. Products are fetched per-supplier on demand
// rather than held here — D1 has no products screen (operator decision
// 2026-08-04), and the CFs exist for D2's draft builder to consume.

import { defineStore } from 'pinia'
import { auth, rtdb, ref, get } from '../../../config/firebase-config.js'
import { fetchLocationNames } from './utils/location-names.js'
import {
  listSuppliers as apiListSuppliers,
  saveSupplier as apiSaveSupplier,
  archiveSupplier as apiArchiveSupplier,
  previewSeed as apiPreviewSeed,
  commitSeed as apiCommitSeed,
} from './orders-service.js'

function messageFor(err) {
  return (err && err.message) || 'Something went wrong. Please try again.'
}

/**
 * Read userLocations/{uid}, then enrich the ids via the SHARED name helper
 * rather than re-implementing the per-id read a third time (people-store still
 * carries its own inline copy; this is the extracted one).
 * Best-effort: returns whatever was readable.
 */
async function fetchUserLocations() {
  const user = auth.currentUser
  if (!user) return []
  const snap = await get(ref(rtdb, `userLocations/${user.uid}`))
  if (!snap.exists()) return []
  const ids = Object.keys(snap.val() || {})
  const names = await fetchLocationNames(ids)
  return ids.map((id) => ({ id, name: names.get(id) || id }))
}

export const useOrdersStore = defineStore('rossOrders', {
  state: () => ({
    locations: [],
    locationsLoading: false,
    locationsError: '',
    selectedLocationId: null,

    suppliers: [],
    loading: false,
    error: '',

    // The derived book awaiting review. NEVER written until the owner commits.
    seedPreview: null,
    seedLoading: false,
    // `true` once a preview came back with no stock counts to derive from. This
    // is an empty state, NOT an error — a location with no food-cost uploads is
    // perfectly normal and the owner can still build the book by hand.
    seedUnavailable: false,

    // Monotonic token guarding against a stale in-flight load overwriting a
    // newer one when the operator switches location mid-request.
    _loadToken: 0,
  }),

  getters: {
    selectedLocation: (state) => state.locations.find((l) => l.id === state.selectedLocationId) || null,

    // A supplier with no email can be exported but not emailed (design §3 R3).
    // DERIVED server-side from an empty email and passed through — never stored.
    needsEmailCount: (state) => state.suppliers.filter((s) => s.needsEmail).length,

    /**
     * Every item in the reviewed stock count, assigned and unassigned alike, as
     * one flat list the owner can filter and multi-select.
     *
     * Deliberately NOT grouped by category. Grouping was the first attempt and
     * it was wrong: a category like "Butchery" routinely spans several
     * suppliers, so assigning a whole category is too blunt to be correct.
     * Category and cost centre are FILTERS here, not units of assignment.
     */
    seedAllItems: (state) => {
      const p = state.seedPreview
      if (!p) return []
      const assigned = Array.isArray(p.items) ? p.items : []
      const unassigned = Array.isArray(p.unassigned?.items) ? p.unassigned.items : []
      return [...assigned, ...unassigned]
        .map((i) => ({ ...i, assigned: !!i.supplierName }))
        .sort((a, b) => String(a.description).localeCompare(String(b.description)))
    },

    /** Distinct filter values, so the UI never invents a chip with nothing behind it. */
    seedFilterOptions() {
      const cats = new Set()
      const centres = new Set()
      for (const i of this.seedAllItems) {
        if (i.category) cats.add(i.category)
        if (i.costCenter) centres.add(i.costCenter)
      }
      return {
        categories: [...cats].sort((a, b) => a.localeCompare(b)),
        costCentres: [...centres].sort((a, b) => a.localeCompare(b)),
      }
    },

    /**
     * Derived supplier names that look like the same company, grouped so the
     * review screen can offer a one-action merge. The server supplies `mergeKey`
     * (case, accent and punctuation folded); grouping is a UI affordance only —
     * nothing merges until the owner says so, because "Cape Fruit" and "Cape
     * Fruit Wholesale" may be two real companies.
     */
    seedDuplicateGroups: (state) => {
      const rows = state.seedPreview?.suppliers
      if (!Array.isArray(rows)) return []

      const byKey = new Map()
      for (const s of rows) {
        const key = s.mergeKey || s.name
        if (!byKey.has(key)) byKey.set(key, [])
        byKey.get(key).push(s)
      }

      return [...byKey.entries()]
        .filter(([, members]) => members.length > 1)
        .map(([mergeKey, members]) => {
          const byUse = [...members].sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0))
          return {
            mergeKey,
            names: members.map((m) => m.name),
            itemCount: members.reduce((n, m) => n + (m.itemCount || 0), 0),
            // The most-used spelling is the sensible default canonical name.
            suggestedName: byUse[0].name,
          }
        })
        .sort((a, b) => b.itemCount - a.itemCount)
    },
  },

  actions: {
    async loadLocations() {
      this.locationsLoading = true
      this.locationsError = ''
      try {
        const locs = await fetchUserLocations()
        locs.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
        this.locations = locs
        // Auto-select when there's only one — saves a click for the common case
        // of a single-restaurant owner.
        if (!this.selectedLocationId && locs.length === 1) {
          await this.selectLocation(locs[0].id)
        }
      } catch (err) {
        this.locationsError = messageFor(err)
      } finally {
        this.locationsLoading = false
      }
    },

    async selectLocation(locationId) {
      if (this.selectedLocationId === locationId) return
      this.selectedLocationId = locationId
      // A preview belongs to the location it was derived from — carrying one
      // across a switch would let the owner commit another location's book.
      this.clearSeedPreview()
      this.suppliers = []
      await this.loadSuppliers(locationId)
    },

    async loadSuppliers(locationId) {
      if (!locationId) {
        this.error = 'Choose a location first.'
        return
      }
      const token = ++this._loadToken
      this.loading = true
      this.error = ''
      try {
        const suppliers = await apiListSuppliers(locationId)
        // Drop a response that a newer load has already superseded.
        if (token !== this._loadToken) return
        this.suppliers = suppliers
      } catch (err) {
        if (token !== this._loadToken) return
        this.error = messageFor(err)
      } finally {
        if (token === this._loadToken) this.loading = false
      }
    },

    /** @returns {Promise<boolean>} whether the save landed */
    async saveSupplier({ locationId, supplierId, supplier }) {
      this.error = ''
      try {
        await apiSaveSupplier({ locationId, supplierId, supplier })
      } catch (err) {
        this.error = messageFor(err)
        return false
      }
      await this.loadSuppliers(locationId)
      return true
    },

    /** @returns {Promise<boolean>} whether the archive landed */
    async archiveSupplier({ locationId, supplierId }) {
      this.error = ''
      try {
        await apiArchiveSupplier({ locationId, supplierId })
      } catch (err) {
        this.error = messageFor(err)
        return false
      }
      await this.loadSuppliers(locationId)
      return true
    },

    async loadSeedPreview(locationId) {
      if (!locationId) {
        this.error = 'Choose a location first.'
        return
      }
      this.seedLoading = true
      this.seedUnavailable = false
      this.error = ''
      try {
        const out = await apiPreviewSeed(locationId)
        if (out && out.hasData) {
          this.seedPreview = out
        } else {
          // Bare {hasData:false} covers no-access, not-entitled and no-data
          // alike (anti-enumeration) — so the UI must not claim to know which.
          this.seedPreview = null
          this.seedUnavailable = true
        }
      } catch (err) {
        this.error = messageFor(err)
      } finally {
        this.seedLoading = false
      }
    },

    clearSeedPreview() {
      this.seedPreview = null
      this.seedUnavailable = false
    },

    /**
     * Commit the reviewed book. Pass `selections:[{name, sourceNames}]` to carry
     * renames and merges, or `supplierNames:[]` for a plain tick.
     * @returns {Promise<object|null>} the server summary, or null on failure
     */
    async commitSeed({ locationId, selections, supplierNames }) {
      this.error = ''
      let out
      try {
        out = await apiCommitSeed(
          selections ? { locationId, selections } : { locationId, supplierNames },
        )
      } catch (err) {
        // Keep the preview: the owner is mid-review and losing their ticks,
        // renames and merges to a transient failure would be worse than the
        // failure itself.
        this.error = messageFor(err)
        return null
      }
      this.clearSeedPreview()
      await this.loadSuppliers(locationId)
      return out
    },
  },
})
