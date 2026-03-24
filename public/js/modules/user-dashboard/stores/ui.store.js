/**
 * UI Store
 * Pinia store for dashboard UI state
 */

import { defineStore } from 'pinia'

export const useUiStore = defineStore('dashboardUi', {
  state: () => ({
    isLoading: true,
    sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
    searchTerm: '',
    selectedLocationId: 'all',
    showAddLocationModal: false
  }),

  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
      localStorage.setItem('sidebarCollapsed', String(this.sidebarCollapsed))
    },

    setLoading(val) {
      this.isLoading = val
    },

    setSearchTerm(term) {
      this.searchTerm = term
    },

    selectLocation(locationId) {
      this.selectedLocationId = locationId
    },

    openAddLocationModal() {
      this.showAddLocationModal = true
    },

    closeAddLocationModal() {
      this.showAddLocationModal = false
    }
  }
})
