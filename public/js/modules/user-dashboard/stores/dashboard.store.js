/**
 * Dashboard Store
 * Main Pinia store for user dashboard data
 */

import { defineStore } from 'pinia'
import { runCompleteDatabaseFix } from '../../../utils/subscription-tier-fix.js'
import { showToast } from '../../../utils/toast.js'
import { STATUS_MAP, LOCATION_TYPE_MAP } from '../constants/dashboard.constants.js'
import {
  fetchUserData,
  fetchSubscriptionData,
  fetchTierData,
  checkOnboardingComplete,
  signOut
} from '../services/user-service.js'
import {
  fetchUserLocations,
  createLocation,
  removeLocation
} from '../services/location-service.js'
import { fetchDashboardStatistics } from '../services/statistics-service.js'
import { fetchWhatsAppMappings } from '../services/whatsapp-service.js'
import { checkAllFeatures, showUpgradePrompt } from '../services/feature-service.js'

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    currentUser: null,
    userData: null,
    subscription: null,
    tierData: null,
    maxLocations: 1,
    locations: [],
    whatsappMappings: [],
    whatsappTierLimits: {},
    featureAccess: {},
    statistics: {
      totalGuests: 0,
      activeCampaigns: 0,
      totalRewards: 0,
      engagementRate: 0
    },
    isInitialized: false,
    error: null
  }),

  getters: {
    userName(state) {
      return state.userData?.firstName || state.userData?.displayName || 'User'
    },

    displayName(state) {
      return state.userData?.displayName || state.userData?.email || 'User'
    },

    planName(state) {
      return state.tierData?.name || 'No Plan'
    },

    subscriptionStatus(state) {
      const status = state.subscription?.status || 'none'
      return STATUS_MAP[status] || status
    },

    locationCountDisplay(state) {
      return `${state.locations.length} / ${state.maxLocations}`
    },

    hasFeature(state) {
      return (featureId) => !!state.featureAccess[featureId]
    },

    canAddLocation(state) {
      return state.locations.length < state.maxLocations ||
        !!state.featureAccess.multiLocation
    },

    getWhatsAppMapping(state) {
      return (locationId) => state.whatsappMappings.find(m => m.locationId === locationId)
    },

    formatLocationType() {
      return (type) => LOCATION_TYPE_MAP[type] || type
    }
  },

  actions: {
    async initialize(user) {
      this.currentUser = user
      this.error = null

      try {
        const onboardingComplete = await checkOnboardingComplete(user.uid)
        if (!onboardingComplete) {
          window.location.href = '/onboarding-wizard.html'
          return
        }

        await runCompleteDatabaseFix()

        await Promise.all([
          this.loadUserData(),
          this.loadFeatureAccess()
        ])

        await Promise.all([
          this.loadSubscription(),
          this.loadLocations(),
          this.loadWhatsAppMappings(),
          this.loadStatistics()
        ])

        this.isInitialized = true
      } catch (error) {
        console.error('[Dashboard] Error initializing:', error)
        this.error = error.message
        showToast('Error loading dashboard. Please refresh the page.', 'error')
        throw error
      }
    },

    async loadUserData() {
      const userData = await fetchUserData(this.currentUser.uid)
      if (!userData) {
        throw new Error('User data not found')
      }
      this.userData = userData
    },

    async loadFeatureAccess() {
      this.featureAccess = await checkAllFeatures()
    },

    async loadSubscription() {
      this.subscription = await fetchSubscriptionData(this.currentUser.uid)

      if (!this.subscription) return

      const tierId = this.subscription.tierId || this.subscription.tier || 'free'
      const tierData = await fetchTierData(tierId)

      if (tierData) {
        this.tierData = tierData
        this.maxLocations = tierData.maxLocations || 1
      }
    },

    async loadLocations() {
      try {
        this.locations = await fetchUserLocations(this.currentUser.uid)
      } catch (error) {
        console.error('[Dashboard] Error loading locations:', error)
        showToast('Error loading locations', 'error')
      }
    },

    async loadWhatsAppMappings() {
      try {
        const result = await fetchWhatsAppMappings()
        this.whatsappMappings = result.locationMappings
        this.whatsappTierLimits = result.tierLimits
      } catch (error) {
        console.error('[Dashboard] Error loading WhatsApp mappings:', error)
        this.whatsappMappings = []
      }
    },

    async loadStatistics() {
      try {
        const locationIds = this.locations.map(loc => loc.id)
        this.statistics = await fetchDashboardStatistics(locationIds)
      } catch (error) {
        console.error('[Dashboard] Error loading statistics:', error)
        this.statistics = {
          totalGuests: 0,
          activeCampaigns: 0,
          totalRewards: 0,
          engagementRate: 0
        }
      }
    },

    async saveLocation(locationData) {
      const newLocation = await createLocation(this.currentUser.uid, locationData)
      this.locations = [...this.locations, newLocation]
      return newLocation
    },

    async deleteLocation(locationId) {
      await removeLocation(this.currentUser.uid, locationId)
      this.locations = this.locations.filter(l => l.id !== locationId)
    },

    triggerUpgradePrompt(featureId) {
      showUpgradePrompt(featureId)
    },

    async logout() {
      await signOut()
      window.location.href = '/user-login.html?message=logout'
    }
  }
})
