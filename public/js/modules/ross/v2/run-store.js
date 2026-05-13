import { defineStore } from 'pinia'
import { createRun, submitResponse } from './run-service.js'
import { getPlaybookWorkflows } from './playbook-service.js'

// playbook-service.js returns tasks as an object keyed by taskId (RTDB
// native shape, see playbook-service.js:103). The Run UI iterates tasks
// as an array sorted by `order`. Normalize on ingest.
function normalizeTasks(rawTasks) {
  if (Array.isArray(rawTasks)) return rawTasks
  if (!rawTasks || typeof rawTasks !== 'object') return []
  return Object.entries(rawTasks)
    .map(([id, t]) => ({ id, ...(t || {}) }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export const useRunStore = defineStore('ross-run', {
  state: () => ({
    currentRun: null,
    workflow: null,
    responses: {},
    saveStatus: {},
    errors: {},
    loading: false,
    loadError: null,
  }),

  actions: {
    async initRun(workflowId, locationId) {
      this.loading = true
      this.loadError = null
      try {
        const run = await createRun({ workflowId, locationId })
        const workflows = await getPlaybookWorkflows()
        const wf = workflows.find(
          w => w.workflowId === workflowId && w.locationId === locationId,
        )
        if (!wf) {
          this.loadError = 'Workflow not found at this location.'
          return
        }
        this.workflow = { ...wf, tasks: normalizeTasks(wf.tasks) }
        this.currentRun = run
        this.responses = run.responses || {}
      } catch (err) {
        this.loadError = err.message || 'Failed to start run.'
      } finally {
        this.loading = false
      }
    },

    reset() {
      this.currentRun = null
      this.workflow = null
      this.responses = {}
      this.saveStatus = {}
      this.errors = {}
      this.loading = false
      this.loadError = null
    },

    async commitResponse(taskId, value, note) {
      if (!this.currentRun?.runId || !this.workflow) return
      this.saveStatus = { ...this.saveStatus, [taskId]: 'saving' }
      this.errors = { ...this.errors, [taskId]: null }
      try {
        const out = await submitResponse({
          workflowId: this.workflow.workflowId,
          locationId: this.workflow.locationId,
          runId: this.currentRun.runId,
          taskId,
          value,
          note,
        })
        if (out.status === 422 && out.requiredNote) {
          this.saveStatus = { ...this.saveStatus, [taskId]: 'idle' }
          return { requiredNote: true }
        }
        // 200 — server returns { success, taskId, flagged, runCompleted }
        // (functions/ross.js:1337). Server does NOT return the full responses
        // map, so build the response object client-side from the values we
        // submitted plus server's flagged flag.
        const result = out.result
        const builtResponse = {
          taskId,
          value,
          note: note ?? null,
          flagged: !!result.flagged,
          submittedAt: Date.now(),
        }
        this.responses = { ...this.responses, [taskId]: builtResponse }

        // Server signals completion via runCompleted boolean. Reflect it on
        // currentRun so the UI can swap the summary bar for the completion
        // banner. completedAt is stamped now (client clock — close enough
        // for UX; the server timestamp lands on getRun if we ever refresh).
        if (result.runCompleted) {
          const flaggedCount = Object.values({ ...this.responses }).filter(r => r.flagged).length
          // onTime is optimistic (true). Computing it accurately requires the
          // workflow's nextDueDate at activation time, which we don't carry
          // in client state. A future getRun refresh would correct it.
          this.currentRun = {
            ...this.currentRun,
            completedAt: Date.now(),
            onTime: true,
            flaggedCount,
          }
        }
        this.saveStatus = { ...this.saveStatus, [taskId]: 'saved' }
      } catch (err) {
        this.saveStatus = { ...this.saveStatus, [taskId]: 'error' }
        this.errors = { ...this.errors, [taskId]: err.message || 'Save failed' }
      }
    },

    dismissError(taskId) {
      this.errors = { ...this.errors, [taskId]: null }
      this.saveStatus = { ...this.saveStatus, [taskId]: 'idle' }
    },
  },
})
