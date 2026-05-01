import { defineStore } from 'pinia'
import { auth, rtdb, ref, get } from '../../../config/firebase-config.js'
import { getStaffForLocation, manageStaff } from './people-service.js'

// Server stores `phone` raw — Twilio downstream needs E.164. Mirrors the SA
// rule used by the v1 modules (guest/queue/booking/receipt management).
function normalizePhone(input) {
  if (!input) return null
  const cleaned = String(input).replace(/[\s().-]/g, '').trim()
  if (!cleaned) return null
  if (cleaned.startsWith('+')) return cleaned
  if (/^27\d{9}$/.test(cleaned)) return '+' + cleaned
  if (/^0\d{9}$/.test(cleaned)) return '+27' + cleaned.slice(1)
  return cleaned
}

/**
 * Read userLocations/{uid} → enrich each id with locations/{id}/name.
 * Best-effort: returns whatever was readable.
 */
async function fetchUserLocations() {
  const user = auth.currentUser
  if (!user) return []
  const snap = await get(ref(rtdb, `userLocations/${user.uid}`))
  if (!snap.exists()) return []
  const ids = Object.keys(snap.val() || {})
  return Promise.all(ids.map(async (id) => {
    let name = id
    try {
      const ns = await get(ref(rtdb, `locations/${id}/name`))
      if (ns.exists() && typeof ns.val() === 'string') name = ns.val()
    } catch (_) { /* keep id as fallback */ }
    return { id, name }
  }))
}

export const usePeopleStore = defineStore('rossPeople', {
  state: () => ({
    locations: [],
    locationsLoading: false,
    locationsError: null,

    selectedLocationId: null,

    staff: [],
    staffLoading: false,
    staffError: null,

    saving: false,
    saveError: null,

    _staffToken: 0,
  }),
  getters: {
    selectedLocation(state) {
      return state.locations.find((l) => l.id === state.selectedLocationId) || null
    },
  },
  actions: {
    async loadLocations() {
      this.locationsLoading = true
      this.locationsError = null
      try {
        const locs = await fetchUserLocations()
        // Stable order: by name, falling back to id.
        locs.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
        this.locations = locs
        // Auto-select if there's only one — saves a click.
        if (!this.selectedLocationId && locs.length === 1) {
          this.selectedLocationId = locs[0].id
          await this.loadStaff()
        }
      } catch (e) {
        this.locationsError = e.message || String(e)
      } finally {
        this.locationsLoading = false
      }
    },

    async selectLocation(locationId) {
      if (this.selectedLocationId === locationId) return
      this.selectedLocationId = locationId
      this.staff = []
      this.staffError = null
      if (locationId) await this.loadStaff()
    },

    async loadStaff() {
      const locId = this.selectedLocationId
      if (!locId) return
      const token = ++this._staffToken
      this.staffLoading = true
      this.staffError = null
      try {
        const list = await getStaffForLocation(locId)
        if (token !== this._staffToken) return
        this.staff = list
      } catch (e) {
        if (token === this._staffToken) this.staffError = e.message || String(e)
      } finally {
        if (token === this._staffToken) this.staffLoading = false
      }
    },

    async createStaff(staffData) {
      if (!this.selectedLocationId) throw new Error('Pick a location first')
      this.saving = true
      this.saveError = null
      try {
        const payload = { ...staffData, phone: normalizePhone(staffData.phone) }
        await manageStaff({ locationId: this.selectedLocationId, action: 'create', staffData: payload })
        await this.loadStaff()
      } catch (e) {
        this.saveError = e.message || String(e)
        throw e
      } finally {
        this.saving = false
      }
    },

    async updateStaff(staffId, staffData) {
      if (!this.selectedLocationId) throw new Error('Pick a location first')
      if (!staffId) throw new Error('staffId required')
      this.saving = true
      this.saveError = null
      try {
        const payload = { ...staffData, phone: normalizePhone(staffData.phone) }
        await manageStaff({ locationId: this.selectedLocationId, action: 'update', staffId, staffData: payload })
        await this.loadStaff()
      } catch (e) {
        this.saveError = e.message || String(e)
        throw e
      } finally {
        this.saving = false
      }
    },

    async deleteStaff(staffId) {
      if (!this.selectedLocationId) throw new Error('Pick a location first')
      if (!staffId) throw new Error('staffId required')
      this.saving = true
      this.saveError = null
      try {
        await manageStaff({ locationId: this.selectedLocationId, action: 'delete', staffId })
        await this.loadStaff()
      } catch (e) {
        this.saveError = e.message || String(e)
        throw e
      } finally {
        this.saving = false
      }
    },
  },
})
