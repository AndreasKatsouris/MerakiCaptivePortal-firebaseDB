import { defineStore } from 'pinia'
import { getInbox, getReceiptDetail } from './service.js'

export const useReceiptsInboxStore = defineStore('receiptsInbox', {
  state: () => ({
    inbox: null,
    filter: 'pending',
    selectedId: 'r1',
    detail: null,
    loading: { inbox: false, detail: false },
    error: null,
    _inboxToken: 0,
    _detailToken: 0,
  }),
  actions: {
    async loadInbox() {
      const t = ++this._inboxToken
      this.loading.inbox = true
      try {
        const res = await getInbox({ filter: this.filter })
        if (t !== this._inboxToken) return
        this.inbox = res
        if (!res.rows.some(r => r.id === this.selectedId) && res.rows[0]) {
          this.selectedId = res.rows[0].id
          this.loadDetail()
        }
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        if (t === this._inboxToken) this.loading.inbox = false
      }
    },
    async loadDetail() {
      const t = ++this._detailToken
      this.loading.detail = true
      try {
        const d = await getReceiptDetail(this.selectedId)
        if (t !== this._detailToken) return
        this.detail = d
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        if (t === this._detailToken) this.loading.detail = false
      }
    },
    setFilter(f) { this.filter = f; this.loadInbox() },
    selectReceipt(id) { this.selectedId = id; this.loadDetail() },
  },
})
