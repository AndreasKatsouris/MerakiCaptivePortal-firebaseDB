import { defineStore } from 'pinia'
import { subscribeFloor } from './service.js'

export const useQueueFloorStore = defineStore('queueFloor', {
  state: () => ({
    locationId: 'ocean-club',
    data: null,
    freshness: 'just now',
    _unsub: null,
    _clockTimer: null,
  }),
  actions: {
    start() {
      if (this._unsub) return
      this._unsub = subscribeFloor(this.locationId, (snap) => {
        this.data = snap
        this.refreshFreshness()
      })
      // Update the "X seconds ago" readout once per second; cheap because
      // the string diff is tiny and only this store's consumers re-render.
      this._clockTimer = setInterval(() => this.refreshFreshness(), 1000)
    },
    stop() {
      if (this._unsub) { this._unsub(); this._unsub = null }
      if (this._clockTimer) { clearInterval(this._clockTimer); this._clockTimer = null }
    },
    refreshFreshness() {
      if (!this.data) { this.freshness = '—'; return }
      const delta = Math.max(0, Date.now() - this.data.lastUpdated)
      const secs = Math.floor(delta / 1000)
      if (secs < 5)   this.freshness = 'just now'
      else if (secs < 60) this.freshness = `${secs}s ago`
      else                this.freshness = `${Math.floor(secs / 60)}m ago`
    },
    setZone(zoneId) {
      if (!this.data) return
      this.data.venue.zones = this.data.venue.zones.map(z => ({ ...z, active: z.id === zoneId }))
    },
  },
})
