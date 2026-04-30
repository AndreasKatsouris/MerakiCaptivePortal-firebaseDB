import { defineStore } from 'pinia'
import { getActivityReport, getWorkflowRunHistory } from './activity-service.js'
import { rtdb, ref, get } from '../../../config/firebase-config.js'

/**
 * Best-effort location-name enrichment. Older workflows were created
 * with locationName === locationId (functions/ross.js:348 fallback when
 * the create call didn't pass locationNames). Read locations/{id}/name
 * directly to recover the human-readable name. Returns a Map keyed by
 * locationId. Always resolves — failures yield an empty entry, never
 * throw, so the store load doesn't fail just because some locations
 * aren't readable.
 */
async function fetchLocationNames(locationIds) {
  const out = new Map()
  await Promise.all(locationIds.map(async (locId) => {
    try {
      const snap = await get(ref(rtdb, `locations/${locId}/name`))
      if (snap.exists() && typeof snap.val() === 'string') {
        out.set(locId, snap.val())
      }
    } catch (_) { /* leave empty */ }
  }))
  return out
}

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

        // Enrich locationName when the server returned the locationId as
        // the name (legacy workflows). Look up locations/{id}/name and
        // overwrite where we have a real name.
        const idsNeedingName = Array.from(new Set(
          rows
            .filter((r) => !r.locationName || r.locationName === r.locationId)
            .map((r) => r.locationId)
            .filter(Boolean)
        ))
        const nameMap = idsNeedingName.length
          ? await fetchLocationNames(idsNeedingName)
          : new Map()
        if (token !== this._token) return

        this.rows = rows.map((r) => {
          const real = nameMap.get(r.locationId)
          return real ? { ...r, locationName: real } : r
        })
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
