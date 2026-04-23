import { defineStore } from 'pinia'
import { getCampaignDraft } from './service.js'

export const useCampaignsComposeStore = defineStore('campaignsCompose', {
  state: () => ({
    data: null,
    activeChannel: 'email',
    activeTiming: 'ross',
    loading: false,
    error: null,
    _token: 0,
  }),
  actions: {
    async load(segmentId) {
      const t = ++this._token
      this.loading = true
      try {
        const d = await getCampaignDraft({ segmentId })
        if (t !== this._token) return
        this.data = d
        this.activeChannel = d.message.channels.find(c => c.active)?.id ?? 'email'
        this.activeTiming  = d.timing.options.find(o => o.active)?.id ?? 'ross'
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        if (t === this._token) this.loading = false
      }
    },
    setChannel(id) { this.activeChannel = id },
    setTiming(id) { this.activeTiming = id },
  },
})
