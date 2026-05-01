import { defineStore } from 'pinia'
import {
  getPlaybookWorkflows, getPlaybookTemplates,
  createWorkflow, updateWorkflow, deleteWorkflow, activateWorkflow,
  createTemplate, updateTemplate, deleteTemplate,
  manageTask,
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

    // --- Template editor state (Phase 4d.2, superAdmin only) ------
    // editingTemplateId === 'new' means create form; any other id means
    // edit. Mutually exclusive with the workflow editor — opening one
    // closes the other so the panel never shows two editors.
    editingTemplateId: null,
    templateSaving: false,
    templateSaveError: null,

    // superAdmin status for the current user. Lazily loaded once per
    // session via loadSuperAdminStatus(). UI hides template CRUD when
    // false; the server always enforces.
    isSuperAdmin: false,
    _superAdminLoaded: false,

    // --- Task editor state (Phase 4e.1) --------------------------
    // editingTasksFor binds to a specific (workflowId, locationId)
    // pair — null means closed. Mutually exclusive with workflow +
    // template editors so only one editing surface ever shows on
    // the panel at a time.
    editingTasksFor: null,            // { workflowId, locationId } | null
    taskSaving: false,                // any task op in flight
    taskSavingTaskId: null,           // which row is currently saving
    taskSaveError: null,              // panel-level banner (e.g. add/delete fail)
    taskRowErrors: {},                // { [taskId|_uid]: string } — per-row error
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
      this.editingTemplateId = null
      this.templateSaveError = null
      this.editingTasksFor = null
      this.taskSaveError = null
      this.taskRowErrors = {}
      this.loadLocations()
    },
    openEdit(workflowId) {
      this.editingWorkflowId = workflowId
      this.activateTemplateId = null
      this.saveError = null
      this.editingTemplateId = null
      this.templateSaveError = null
      this.editingTasksFor = null
      this.taskSaveError = null
      this.taskRowErrors = {}
      this.loadLocations()
    },
    openActivateTemplate(templateId) {
      this.editingWorkflowId = 'new'
      this.activateTemplateId = templateId
      this.saveError = null
      this.editingTemplateId = null
      this.templateSaveError = null
      this.editingTasksFor = null
      this.taskSaveError = null
      this.taskRowErrors = {}
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

    // --- SuperAdmin gate ------------------------------------------
    // Reads admins/{uid}.superAdmin once. Server is the source of truth
    // (verifySuperAdmin in functions/ross.js); this read only decides
    // whether to render the template CRUD UI. A non-superAdmin who
    // somehow triggers a CF call still gets a 403 from the server.
    async loadSuperAdminStatus() {
      if (this._superAdminLoaded) return
      const user = auth.currentUser
      if (!user) return
      try {
        const snap = await get(ref(rtdb, `admins/${user.uid}`))
        const v = snap.val()
        // admins/{uid} can be `true` (legacy boolean admin) or
        // `{ superAdmin: true, ... }`. Only the object shape carries
        // superAdmin status.
        this.isSuperAdmin = !!(v && typeof v === 'object' && v.superAdmin)
        this._superAdminLoaded = true
      } catch (_) {
        // Permission denied for non-admins is expected; treat as
        // not-superAdmin.
        this.isSuperAdmin = false
        this._superAdminLoaded = true
      }
    },

    // --- Template editor lifecycle --------------------------------
    openCreateTemplate() {
      this.editingTemplateId = 'new'
      this.templateSaveError = null
      // Closing the workflow + task editors keeps the panel single-instance.
      this.editingWorkflowId = null
      this.activateTemplateId = null
      this.saveError = null
      this.editingTasksFor = null
      this.taskSaveError = null
      this.taskRowErrors = {}
    },
    openEditTemplate(templateId) {
      this.editingTemplateId = templateId
      this.templateSaveError = null
      this.editingWorkflowId = null
      this.activateTemplateId = null
      this.saveError = null
      this.editingTasksFor = null
      this.taskSaveError = null
      this.taskRowErrors = {}
    },
    closeTemplateEditor() {
      this.editingTemplateId = null
      this.templateSaveError = null
    },

    // --- Template mutations ---------------------------------------
    async createTemplate(payload) {
      this.templateSaving = true
      this.templateSaveError = null
      try {
        await createTemplate(payload)
        await this.load()
        this.closeTemplateEditor()
      } catch (e) {
        this.templateSaveError = e.message || String(e)
        throw e
      } finally {
        this.templateSaving = false
      }
    },

    async updateTemplate(templateId, updates) {
      this.templateSaving = true
      this.templateSaveError = null
      try {
        await updateTemplate({ templateId, updates })
        await this.load()
        this.closeTemplateEditor()
      } catch (e) {
        this.templateSaveError = e.message || String(e)
        throw e
      } finally {
        this.templateSaving = false
      }
    },

    async deleteTemplate(templateId) {
      this.templateSaving = true
      this.templateSaveError = null
      try {
        await deleteTemplate({ templateId })
        await this.load()
      } catch (e) {
        this.templateSaveError = e.message || String(e)
        throw e
      } finally {
        this.templateSaving = false
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

    // --- Task editor lifecycle (Phase 4e.1) -----------------------
    // Each playbook card binds to one (workflowId, locationId). The
    // task editor is per-pair so editing tasks at venue A doesn't
    // touch venue B's instance of the same workflow (server scopes
    // tasksRef to ross/workflows/{uid}/{workflowId}/locations/{locId}).
    openTasksEditor(workflowId, locationId) {
      if (!workflowId || !locationId) return
      this.editingTasksFor = { workflowId, locationId }
      this.taskSaveError = null
      this.taskRowErrors = {}
      // Mutually exclude with workflow + template editors.
      this.editingWorkflowId = null
      this.activateTemplateId = null
      this.saveError = null
      this.editingTemplateId = null
      this.templateSaveError = null
    },
    closeTasksEditor() {
      this.editingTasksFor = null
      this.taskSaveError = null
      this.taskRowErrors = {}
    },
    clearTaskRowError(rowKey) {
      if (!(rowKey in this.taskRowErrors)) return
      const next = { ...this.taskRowErrors }
      delete next[rowKey]
      this.taskRowErrors = next
    },

    // --- Task mutations -------------------------------------------
    // All wrap rossManageTask. Server validates inputType against
    // VALID_INPUT_TYPES; inputConfig is stored verbatim. After every
    // success we reload the workflow list so the card's tasks map
    // reflects the new server state. Pattern matches the workflow +
    // template mutation actions above.
    async createTask({ workflowId, locationId, taskData }) {
      this.taskSaving = true
      this.taskSavingTaskId = null
      this.taskSaveError = null
      try {
        await manageTask({ workflowId, locationId, action: 'create', taskData })
        await this.load()
      } catch (e) {
        this.taskSaveError = e.message || String(e)
        throw e
      } finally {
        this.taskSaving = false
        this.taskSavingTaskId = null
      }
    },

    async updateTask({ workflowId, locationId, taskId, taskData }) {
      this.taskSaving = true
      this.taskSavingTaskId = taskId
      this.taskSaveError = null
      try {
        await manageTask({ workflowId, locationId, action: 'update', taskId, taskData })
        await this.load()
      } catch (e) {
        // Per-row error so other rows aren't blocked. Caller can also
        // surface taskSaveError if it wants a panel-level banner.
        this.taskRowErrors = { ...this.taskRowErrors, [taskId]: e.message || String(e) }
        throw e
      } finally {
        this.taskSaving = false
        this.taskSavingTaskId = null
      }
    },

    async deleteTask({ workflowId, locationId, taskId }) {
      this.taskSaving = true
      this.taskSavingTaskId = taskId
      this.taskSaveError = null
      try {
        await manageTask({ workflowId, locationId, action: 'delete', taskId })
        await this.load()
      } catch (e) {
        this.taskRowErrors = { ...this.taskRowErrors, [taskId]: e.message || String(e) }
        throw e
      } finally {
        this.taskSaving = false
        this.taskSavingTaskId = null
      }
    },
  },
})
