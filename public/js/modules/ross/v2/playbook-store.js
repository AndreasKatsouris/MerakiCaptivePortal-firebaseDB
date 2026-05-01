import { defineStore } from 'pinia'
import {
  getPlaybookWorkflows, getPlaybookTemplates,
  createWorkflow, updateWorkflow, deleteWorkflow, activateWorkflow,
} from './playbook-service.js'
import { auth, rtdb, ref, get } from '../../../config/firebase-config.js'
import { fetchLocationNames } from './utils/location-names.js'

// VALID_CATEGORIES / VALID_RECURRENCES mirror functions/ross.js so the
// editor can validate before the round trip. Keep in sync if the server
// list changes.
export const VALID_CATEGORIES = ['compliance', 'operations', 'growth', 'finance', 'hr', 'maintenance']
export const VALID_RECURRENCES = ['once', 'daily', 'weekly', 'monthly', 'quarterly', 'annually']

// rossUpdateWorkflow allowedFields (functions/ross.js). Only these
// fields can be edited on an existing workflow — category, recurrence,
// description, locations, and subtasks are NOT editable. Surfaced as a
// passive caption in the editor so the user knows what they can change.
export const UPDATABLE_FIELDS = ['name', 'notificationChannels', 'notifyPhone', 'notifyEmail', 'daysBeforeAlert', 'status']

/**
 * Read userLocations/{uid} → enrich each id with locations/{id}/name.
 * Mirrors people-store.fetchUserLocations. Best-effort: returns whatever
 * was readable.
 */
async function fetchUserLocations() {
  const user = auth.currentUser
  if (!user) return []
  const snap = await get(ref(rtdb, `userLocations/${user.uid}`))
  if (!snap.exists()) return []
  const ids = Object.keys(snap.val() || {})
  return Promise.all(ids.map(async (id) => {
    let name = id
    try {
      const ns = await get(ref(rtdb, `locations/${id}/name`))
      if (ns.exists() && typeof ns.val() === 'string') name = ns.val()
    } catch (_) { /* keep id as fallback */ }
    return { id, name }
  }))
}

export const usePlaybookStore = defineStore('rossPlaybook', {
  state: () => ({
    workflows: [],
    templates: [],
    loading: { workflows: false, templates: false },
    error: null,
    _token: 0,

    // Editor state — single-instance: at most one open at a time.
    // editingWorkflowId === 'new' means create form; any other id
    // means edit. activateTemplateId means the editor is populated
    // for an activate-from-template flow (subtasks come from the
    // template; only locations/dates/notifications are user inputs).
    editingWorkflowId: null,
    activateTemplateId: null,

    saving: false,
    saveError: null,

    // Location picker — lazily loaded when the editor opens.
    locations: [],
    locationsLoading: false,
    locationsError: null,
    _locationsLoaded: false,
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
    // The flat list returned by rossGetWorkflows has one entry per
    // (workflowId, locationId). De-duplicate by workflowId for editor
    // lookups.
    workflowById(state) {
      const map = new Map()
      for (const w of state.workflows) {
        if (!map.has(w.workflowId)) map.set(w.workflowId, w)
      }
      return map
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

    async loadLocations() {
      // Once-per-session cache. If a location is added in another tab
      // the picker won't reflect it until the user reloads — acceptable
      // tradeoff vs re-reading userLocations every time the editor
      // opens. Bump this if the v2 surface grows a "locations changed"
      // signal.
      if (this._locationsLoaded || this.locationsLoading) return
      this.locationsLoading = true
      this.locationsError = null
      try {
        const locs = await fetchUserLocations()
        locs.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
        this.locations = locs
        this._locationsLoaded = true
      } catch (e) {
        this.locationsError = e.message || String(e)
      } finally {
        this.locationsLoading = false
      }
    },

    // --- Editor lifecycle -----------------------------------------
    openCreate() {
      this.editingWorkflowId = 'new'
      this.activateTemplateId = null
      this.saveError = null
      this.loadLocations()
    },
    openEdit(workflowId) {
      this.editingWorkflowId = workflowId
      this.activateTemplateId = null
      this.saveError = null
      this.loadLocations()
    },
    openActivateTemplate(templateId) {
      this.editingWorkflowId = 'new'
      this.activateTemplateId = templateId
      this.saveError = null
      this.loadLocations()
    },
    closeEditor() {
      this.editingWorkflowId = null
      this.activateTemplateId = null
      this.saveError = null
    },

    // --- Mutations ------------------------------------------------
    // All four mutation actions follow the same pattern: set saving,
    // call CF, reload list on success, surface server error in
    // saveError. Editor + inline confirm strip read saveError to
    // render banners; closing the editor on success means the user
    // sees the refreshed list.
    async createWorkflow(payload) {
      this.saving = true
      this.saveError = null
      try {
        await createWorkflow(payload)
        await this.load()
        this.closeEditor()
      } catch (e) {
        this.saveError = e.message || String(e)
        throw e
      } finally {
        this.saving = false
      }
    },

    async updateWorkflow(workflowId, updates) {
      this.saving = true
      this.saveError = null
      try {
        await updateWorkflow({ workflowId, updates })
        await this.load()
        this.closeEditor()
      } catch (e) {
        this.saveError = e.message || String(e)
        throw e
      } finally {
        this.saving = false
      }
    },

    async deleteWorkflow(workflowId) {
      this.saving = true
      this.saveError = null
      try {
        await deleteWorkflow({ workflowId })
        await this.load()
      } catch (e) {
        this.saveError = e.message || String(e)
        throw e
      } finally {
        this.saving = false
      }
    },

    async setStatus(workflowId, status) {
      if (!['active', 'paused'].includes(status)) {
        throw new Error('status must be active or paused')
      }
      this.saving = true
      this.saveError = null
      try {
        await updateWorkflow({ workflowId, updates: { status } })
        await this.load()
      } catch (e) {
        this.saveError = e.message || String(e)
        throw e
      } finally {
        this.saving = false
      }
    },

    async activateTemplate(payload) {
      // payload: { templateId, locationIds, locationNames, name?, description?,
      //            nextDueDate, daysBeforeAlert?, notifyPhone?, notifyEmail?,
      //            customInterval? }
      this.saving = true
      this.saveError = null
      try {
        await activateWorkflow(payload)
        await this.load()
        this.closeEditor()
      } catch (e) {
        this.saveError = e.message || String(e)
        throw e
      } finally {
        this.saving = false
      }
    },
  },
})
