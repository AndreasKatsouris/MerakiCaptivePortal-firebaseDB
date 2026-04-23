import { defineStore } from 'pinia'
import { listGuests, getGuest } from './service.js'

export const useGuestsStore = defineStore('guests', {
  state: () => ({
    list: null,
    filter: 'vip',
    query: '',
    selectedId: 'ef',
    profile: null,
    loading: { list: false, profile: false },
    error: null,
    _listToken: 0,
    _profileToken: 0,
  }),
  actions: {
    async loadList() {
      const t = ++this._listToken
      this.loading.list = true
      try {
        const res = await listGuests({ filter: this.filter, query: this.query })
        if (t !== this._listToken) return
        this.list = res
        // Keep the current selection if it's still in the filtered set,
        // otherwise fall back to the first row.
        if (!res.rows.some(r => r.id === this.selectedId) && res.rows[0]) {
          this.selectedId = res.rows[0].id
          this.loadProfile()
        }
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        if (t === this._listToken) this.loading.list = false
      }
    },
    async loadProfile() {
      const t = ++this._profileToken
      this.loading.profile = true
      try {
        const p = await getGuest(this.selectedId)
        if (t !== this._profileToken) return
        this.profile = p
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        if (t === this._profileToken) this.loading.profile = false
      }
    },
    setFilter(f) { this.filter = f; this.loadList() },
    setQuery(q) { this.query = q; this.loadList() },
    selectGuest(id) { this.selectedId = id; this.loadProfile() },
  },
})
