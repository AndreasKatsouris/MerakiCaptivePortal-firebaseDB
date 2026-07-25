// Food Cost v2 overview store (D3 T4).
//
// Contract kept: the component calls store.load() (optionally with
// {locationId, daysToNextDelivery}) and reads store.data. Reshape from the
// scripted A2 version, documented:
//   - `range` is GONE — the CF takes {locationId, daysToNextDelivery?}
//     (functions/food-cost-overview.js:205-222), not a range.
//   - `locationId` no longer defaults to the scripted 'ocean-club'; T5 must
//     pass a real location on first load() or set it beforehand.
//   - `data` is now the §5 CF payload ({hasData, asOf, dataAgeDays, kpis,
//     summary, order, runway} — functions/food-cost-overview.js:178-197).
//   - `empty` is a NEW flag: the CF returned bare {hasData:false} (no data /
//     no access / not entitled — indistinguishable by design). NOT an error.
//   - `filter` / `setFilter` / `filteredMenu` are TRANSITIONAL shims for the
//     pre-T5 scripted component (menu card is CUT per D3-1); filteredMenu is
//     null-safe against the new payload. T5 deletes all three.

import { defineStore } from 'pinia'
import { getFoodCostOverview } from './service.js'

export const useFoodCostStore = defineStore('foodCost', {
  state: () => ({
    data: null,               // §5 payload when hasData:true, else null
    locationId: null,
    daysToNextDelivery: null, // null → omitted; CF applies its own default
    empty: false,             // CF said {hasData:false} without an error
    loading: false,
    error: null,
    filter: 'drifting',       // transitional shim (T5 removes)
    _token: 0,
  }),
  getters: {
    // Transitional shim: real payloads carry no `menu` (D3-1 cut). T5 removes.
    filteredMenu(state) {
      const rows = state.data?.menu?.rows
      if (!rows) return []
      if (state.filter === 'drifting') return rows.filter(r => r.drift < -1.5)
      if (state.filter === 'stable')   return rows.filter(r => r.drift >= -1.5)
      return rows
    },
  },
  actions: {
    async load({ locationId, daysToNextDelivery } = {}) {
      if (locationId) this.locationId = locationId
      if (daysToNextDelivery !== undefined) this.daysToNextDelivery = daysToNextDelivery
      if (!this.locationId) {
        this.error = 'No location selected'
        this.loading = false
        return
      }
      const token = ++this._token
      this.loading = true
      this.error = null
      try {
        const res = await getFoodCostOverview({
          locationId: this.locationId,
          ...(this.daysToNextDelivery != null
            ? { daysToNextDelivery: this.daysToNextDelivery }
            : {}),
        })
        if (token !== this._token) return // stale response — a newer load() won
        if (res && res.hasData) {
          this.data = res
          this.empty = false
        } else if (res && res.error) {
          this.data = null
          this.empty = false
          this.error = res.error
        } else {
          this.data = null
          this.empty = true
        }
      } catch (e) {
        // getFoodCostOverview is never-throws; this is belt-and-braces.
        if (token === this._token) this.error = e.message || String(e)
      } finally {
        if (token === this._token) this.loading = false
      }
    },
    setFilter(f) { this.filter = f }, // transitional shim (T5 removes)
  },
})
