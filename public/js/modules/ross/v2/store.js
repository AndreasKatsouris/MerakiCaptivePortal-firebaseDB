// Pinia store for Ross home + onboarding. Holds loaded feed and
// exposes refresh actions. Guards against racing fetches by version-
// stamping each load so a late response from a stale call can't
// overwrite fresher state.

import { defineStore } from 'pinia'
import { getHomeFeed, getHomeSidebar, getFirstRunFindings } from './ross-service.js'

export const useRossStore = defineStore('ross', {
  state: () => ({
    feed: null,
    sidebar: null,
    findings: null,
    loading: {
      feed: false,
      sidebar: false,
      findings: false,
    },
    error: null,
    _loadToken: 0,
  }),
  actions: {
    async loadHome() {
      const token = ++this._loadToken
      this.loading.feed = true
      this.loading.sidebar = true
      this.error = null
      try {
        const [feed, sidebar] = await Promise.all([getHomeFeed(), getHomeSidebar()])
        if (token !== this._loadToken) return
        this.feed = feed
        this.sidebar = sidebar
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        this.loading.feed = false
        this.loading.sidebar = false
      }
    },
    async loadFindings() {
      this.loading.findings = true
      this.error = null
      try {
        this.findings = await getFirstRunFindings()
      } catch (e) {
        this.error = e.message || String(e)
      } finally {
        this.loading.findings = false
      }
    },
  },
})
