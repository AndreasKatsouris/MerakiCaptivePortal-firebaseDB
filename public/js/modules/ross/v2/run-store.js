import { defineStore } from 'pinia'
import { createRun } from './run-service.js'
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
  },
})
