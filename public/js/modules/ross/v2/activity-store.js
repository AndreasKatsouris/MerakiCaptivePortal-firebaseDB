import { defineStore } from 'pinia'
import { getActivityReport, getWorkflowRunHistory } from './activity-service.js'

export const useActivityStore = defineStore('rossActivity', {
  state: () => ({
    rows: [],
    loading: false,
    error: null,
    _token: 0,
    // Drill-down (Phase 4b lite — populated when the user opens a row)
    drillKey: null,            // `${workflowId}::${locationId}` or null
    drillRuns: [],
    drillLoading: false,
    drillError: null,
  }),
  getters: {
    totalWorkflows(state) {
      // Distinct workflow ids — many rows can share a workflowId across locations
      const ids = new Set(state.rows.map((r) => r.workflowId))
      return ids.size
    },
    overdueRows(state) {
      return state.rows.filter((r) => r.status === 'overdue')
    },
    onTrackRows(state) {
      return state.rows.filter((r) => r.status !== 'overdue' && r.status !== 'paused')
    },
    averageCompletion(state) {
      if (!state.rows.length) return 0
      const sum = state.rows.reduce((s, r) => s + (Number(r.completionRate) || 0), 0)
      return Math.round(sum / state.rows.length)
    },
    recentHistory(state) {
      // Flatten all per-row history records into one feed, newest first.
      // History entries vary in shape; we surface { completedAt, name, locationName, source }.
      const feed = []
      for (const r of state.rows) {
        const items = Array.isArray(r.history) ? r.history : []
        for (const h of items) {
          const ts = Number(h?.completedAt) || 0
          if (!ts) continue
          feed.push({
            completedAt: ts,
            workflowId: r.workflowId,
            workflowName: r.name,
            locationId: r.locationId,
            locationName: r.locationName || '—',
            category: r.category,
            actorUid: h.completedBy || h.actorUid || null,
          })
        }
      }
      feed.sort((a, b) => b.completedAt - a.completedAt)
      return feed.slice(0, 20)
    },
  },
  actions: {
    async load() {
      const token = ++this._token
      this.loading = true
      this.error = null
      try {
        const rows = await getActivityReport()
        if (token !== this._token) return
        this.rows = rows
      } catch (e) {
        if (token === this._token) this.error = e.message || String(e)
      } finally {
        if (token === this._token) this.loading = false
      }
    },
    async loadDrill({ workflowId, locationId }) {
      if (!workflowId || !locationId) return
      const key = `${workflowId}::${locationId}`
      this.drillKey = key
      this.drillRuns = []
      this.drillError = null
      this.drillLoading = true
      try {
        const runs = await getWorkflowRunHistory({ workflowId, locationId, limit: 20 })
        if (this.drillKey !== key) return
        this.drillRuns = runs
      } catch (e) {
        if (this.drillKey === key) this.drillError = e.message || String(e)
      } finally {
        if (this.drillKey === key) this.drillLoading = false
      }
    },
    closeDrill() {
      this.drillKey = null
      this.drillRuns = []
      this.drillError = null
      this.drillLoading = false
    },
  },
})
