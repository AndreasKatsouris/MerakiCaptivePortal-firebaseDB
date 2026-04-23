import { defineStore } from 'pinia'
import { getWeeklyBrief } from './service.js'

export const useWeeklyBriefStore = defineStore('weeklyBrief', {
  state: () => ({
    data: null,
    week: 17,
    loading: false,
    error: null,
    _token: 0,
  }),
  actions: {
    async load(week = this.week) {
      const t = ++this._token
      this.loading = true
      this.error = null
      this.week = week
      try {
        const d = await getWeeklyBrief({ week })
        if (t !== this._token) return
        this.data = d
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        if (t === this._token) this.loading = false
      }
    },
  },
})
