import { defineStore } from 'pinia'
import { getProjectStatus } from './service.js'

export const useProjectStatusStore = defineStore('projectStatus', {
  state: () => ({
    data: null,
    loading: false,
    error: null,
    _token: 0,
  }),
  actions: {
    async load() {
      const token = ++this._token
      this.loading = true
      this.error = null
      try {
        const data = await getProjectStatus()
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
