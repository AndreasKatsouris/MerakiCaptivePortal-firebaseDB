/**
 * User Dashboard - Vue 3 App Bootstrap
 * Entry point for the user dashboard module
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { auth, onAuthStateChanged } from '../../config/firebase-config.js'
import { initSessionExpiryHandler } from '../../auth/session-expiry-handler.js'
import DashboardApp from './components/DashboardApp.vue'
import { useDashboardStore } from './stores/dashboard.store.js'
import { useUiStore } from './stores/ui.store.js'

// DEV_MOCK: set to true to bypass auth and render with mock data for visual testing
const DEV_MOCK = new URLSearchParams(window.location.search).has('mock')

function loadMockData(dashboardStore, uiStore) {
  dashboardStore.$patch({
    currentUser: { uid: 'mock-uid' },
    userData: { firstName: 'Demo', displayName: 'Demo User', email: 'demo@sparks.co.za' },
    subscription: { status: 'active', tierId: 'silver' },
    tierData: { name: 'Silver', maxLocations: 3 },
    maxLocations: 3,
    locations: [
      { id: 'loc1', name: 'Main Restaurant', address: '123 Long St, Cape Town', phone: '+27 21 123 4567', type: 'restaurant' },
      { id: 'loc2', name: 'Waterfront Branch', address: '45 V&A Waterfront, Cape Town', phone: '+27 21 987 6543', type: 'cafe' }
    ],
    whatsappMappings: [
      { locationId: 'loc1', phoneNumber: '+27 60 123 4567', isActive: true }
    ],
    whatsappTierLimits: { whatsappNumbers: 2 },
    featureAccess: {
      analyticsBasic: true, campaignBasic: true, wifiAnalytics: false,
      rewardsBasic: true, guestInsights: false, multiLocation: true,
      foodCostBasic: true, foodCostAdvanced: false, foodCostAnalytics: false,
      qmsBasic: true, qmsAdvanced: false, qmsWhatsAppIntegration: false,
      qmsAnalytics: false, qmsAutomation: false, salesForecastingBasic: true
    },
    statistics: { totalGuests: 1247, activeCampaigns: 3, totalRewards: 89, engagementRate: 7 },
    isInitialized: true
  })
  uiStore.setLoading(false)
}

function initDashboard() {
  if (!DEV_MOCK) {
    initSessionExpiryHandler()
  }

  const app = createApp(DashboardApp)
  const pinia = createPinia()

  app.use(pinia)

  const mountedApp = app.mount('#dashboard-app')

  const dashboardStore = useDashboardStore()
  const uiStore = useUiStore()

  if (DEV_MOCK) {
    console.log('[Dashboard] DEV_MOCK mode — loading mock data')
    loadMockData(dashboardStore, uiStore)
    return
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await dashboardStore.initialize(user)
      } catch (error) {
        console.error('[Dashboard] Initialization error:', error)
      } finally {
        uiStore.setLoading(false)
      }
    } else {
      window.location.href = '/user-login.html?message=unauthorized'
    }
  })
}

initDashboard()
