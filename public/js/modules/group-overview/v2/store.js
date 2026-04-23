import { defineStore } from 'pinia'
import { getGroupOverview } from './service.js'

export const useGroupOverviewStore = defineStore('groupOverview', {
  state: () => ({
    data: null,
    range: 'M',
    loading: false,
    error: null,
    _token: 0,
  }),
  actions: {
    async load(range = this.range) {
      const token = ++this._token
      this.loading = true
      this.error = null
      this.range = range
      try {
        const data = await getGroupOverview({ range })
        if (token !== this._token) return
        this.data = data
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        if (token === this._token) this.loading = false
      }
    },
  },
})
