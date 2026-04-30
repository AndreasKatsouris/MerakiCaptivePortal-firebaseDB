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
        const [workflows, templates] = await Promise.all([
          getPlaybookWorkflows().catch((e) => { console.warn('[playbook] workflows failed', e); return [] }),
          getPlaybookTemplates().catch((e) => { console.warn('[playbook] templates failed', e); return [] }),
        ])
        if (token !== this._token) return
        this.workflows = workflows
        this.templates = templates
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        if (token === this._token) {
          this.loading.workflows = false
          this.loading.templates = false
        }
      }
    },
  },
})
