import { defineStore } from 'pinia'
import { getPlaybookWorkflows, getPlaybookTemplates } from './playbook-service.js'

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
        this.workflows = workflows
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
