import { defineStore } from 'pinia'
import { getPlaybookWorkflows, getPlaybookTemplates } from './playbook-service.js'
import { rtdb, ref, get } from '../../../config/firebase-config.js'

/**
 * Best-effort location-name enrichment. Older workflows were created
 * with locationName === locationId (functions/ross.js:348 fallback when
 * the create call didn't pass locationNames). Read locations/{id}/name
 * directly to recover the human-readable name. Returns a Map keyed by
 * locationId. Always resolves — failures yield an empty entry.
 *
 * Mirrors the same helper in activity-store.js. Kept duplicated for now
 * (two call-sites). Factor out into a shared util once a third lands.
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

export const usePlaybookStore = defineStore('rossPlaybook', {
  state: () => ({
    workflows: [],
    templates: [],
    loading: { workflows: false, templates: false },
    error: null,
    _token: 0,
  }),
  getters: {
    workflowsByCategory(state) {
      const by = {}
      for (const w of state.workflows) {
        const k = w.category || 'uncategorised'
        ;(by[k] = by[k] || []).push(w)
      }
      return by
    },
    activeCount(state) {
      return state.workflows.filter((w) => w.status !== 'paused' && w.status !== 'archived').length
    },
    overdueCount(state) {
      return state.workflows.filter((w) => w.status === 'overdue').length
    },
  },
  actions: {
    async load() {
      const token = ++this._token
      this.loading.workflows = true
      this.loading.templates = true
      this.error = null
      try {
        // Don't swallow individual rejections — let the outer catch set
        // this.error so the UI's error/Retry path is reachable. If we
        // need partial success in future, gate it on a flag rather than
        // make failure invisible.
        const [workflows, templates] = await Promise.all([
          getPlaybookWorkflows(),
          getPlaybookTemplates(),
        ])
        if (token !== this._token) return

        // Same legacy quirk as Activity: rossGetWorkflows returns the
        // locationId as the name when the workflow was created without
        // explicit locationNames. Enrich from locations/{id}/name.
        const idsNeedingName = Array.from(new Set(
          workflows
            .filter((w) => !w.locationName || w.locationName === w.locationId)
            .map((w) => w.locationId)
            .filter(Boolean)
        ))
        const nameMap = idsNeedingName.length
          ? await fetchLocationNames(idsNeedingName)
          : new Map()
        if (token !== this._token) return

        this.workflows = workflows.map((w) => {
          const real = nameMap.get(w.locationId)
          return real ? { ...w, locationName: real } : w
        })
        this.templates = templates
      } catch (e) {
        if (token === this._token) {
          this.error = e.message || String(e)
        }
      } finally {
        if (token === this._token) {
          this.loading.workflows = false
          this.loading.templates = false
        }
      }
    },
  },
})
