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
     * Unassigned stock items grouped by category, so a file with no supplier
     * column becomes a manageable number of decisions instead of one per item.
     *
     * This is the whole reason D1.1 exists: the supplier column is auto-detected
     * by header name and is frequently absent, which puts EVERY item here — and
     * nobody hand-assigns 388 rows. Category is already parsed from the CSV, so
     * grouping by it costs nothing and typically collapses hundreds of items
     * into ten or twenty groups.
     */
    seedUnassignedGroups: (state) => {
      const items = state.seedPreview?.unassigned?.items
      if (!Array.isArray(items) || !items.length) return []

      const byCategory = new Map()
      for (const it of items) {
        const key = it.category || 'Uncategorized'
        if (!byCategory.has(key)) byCategory.set(key, [])
        byCategory.get(key).push(it)
      }

      return [...byCategory.entries()]
        .map(([category, members]) => ({
          category,
          itemCount: members.length,
          keys: members.map((m) => m.key),
          // Enough to recognise the group without opening it.
          sample: members.slice(0, 3).map((m) => m.description),
        }))
        .sort((a, b) => b.itemCount - a.itemCount)
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
