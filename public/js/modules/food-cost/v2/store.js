import { defineStore } from 'pinia'
import { getFoodCostOverview } from './service.js'

export const useFoodCostStore = defineStore('foodCost', {
  state: () => ({
    data: null,
    locationId: 'ocean-club',
    range: '30d',
    filter: 'drifting',
    loading: false,
    error: null,
    _token: 0,
  }),
  getters: {
    filteredMenu(state) {
      if (!state.data) return []
      const rows = state.data.menu.rows
      if (state.filter === 'drifting') return rows.filter(r => r.drift < -1.5)
      if (state.filter === 'stable')   return rows.filter(r => r.drift >= -1.5)
      return rows
    },
  },
  actions: {
    async load({ locationId, range } = {}) {
      if (locationId) this.locationId = locationId
      if (range)      this.range = range
      const token = ++this._token
      this.loading = true
      this.error = null
      try {
        const data = await getFoodCostOverview({ locationId: this.locationId, range: this.range })
        if (token !== this._token) return
        this.data = data
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        if (token === this._token) this.loading = false
      }
    },
    setFilter(f) { this.filter = f },
  },
})
