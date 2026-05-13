import { defineStore } from 'pinia'
import { createRun, submitResponse } from './run-service.js'
import { getPlaybookWorkflows } from './playbook-service.js'

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
        this.workflow = wf
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
        // 200
        const result = out.result
        if (result.responses && result.responses[taskId]) {
          this.responses = { ...this.responses, [taskId]: result.responses[taskId] }
        }
        if (result.status === 'completed') {
          this.currentRun = { ...this.currentRun, ...result }
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
