<template>
  <div>
    <LoadingOverlay :is-loading="uiStore.isLoading" />

    <AppSidebar
      :collapsed="uiStore.sidebarCollapsed"
      @toggle="uiStore.toggleSidebar()"
    />

    <TopNavbar
      :display-name="store.displayName"
      :locations="store.locations"
      :selected-location-id="uiStore.selectedLocationId"
      @logout="store.logout()"
      @location-change="handleLocationChange"
      @search="uiStore.setSearchTerm($event)"
    />

    <div class="main-container">
      <div class="container-fluid">
        <WelcomeSection :user-name="store.userName" />

        <SubscriptionCard
          :plan-name="store.planName"
          :status="store.subscriptionStatus"
          :location-count="store.locationCountDisplay"
          :feature-access="store.featureAccess"
          @upgrade="store.triggerUpgradePrompt($event)"
        />

        <QuickActions
          :feature-access="store.featureAccess"
          :can-add-location="store.canAddLocation"
          @action="handleAction"
          @upgrade="store.triggerUpgradePrompt($event)"
        />

        <StatisticsRow
          :statistics="store.statistics"
          :locked="!store.hasFeature('analyticsBasic')"
          @upgrade="store.triggerUpgradePrompt($event)"
        />

        <LocationsList
          :locations="store.locations"
          :whatsapp-mappings="store.whatsappMappings"
          :can-add="store.canAddLocation"
          @add="handleAddLocation"
          @edit="handleEditLocation"
          @delete="handleDeleteLocation"
          @view-analytics="handleViewAnalytics"
          @manage-whatsapp="openManageWhatsApp"
          @setup-whatsapp="openSetupWhatsApp"
        />
      </div>
    </div>

    <MobileBottomNav />

    <!-- Modals -->
    <AddLocationModal
      :show="uiStore.showAddLocationModal"
      @close="uiStore.closeAddLocationModal()"
      @save="handleSaveLocation"
    />

    <WhatsAppSetupModal
      :show="whatsappSetup.show"
      :location-name="whatsappSetup.locationName"
      @close="whatsappSetup.show = false"
    />

    <WhatsAppManageModal
      :show="whatsappManage.show"
      :location-name="whatsappManage.locationName"
      :phone-number="whatsappManage.phoneNumber"
      @close="whatsappManage.show = false"
    />

    <UpgradePromptModal
      :show="upgradeModal.show"
      :title="upgradeModal.title"
      :message="upgradeModal.message"
      :show-plans="upgradeModal.showPlans"
      :upgrade-url="upgradeModal.upgradeUrl"
      @close="upgradeModal.show = false"
    />
  </div>
</template>

<script>
import { showToast } from '../../../utils/toast.js'
import { useDashboardStore } from '../stores/dashboard.store.js'
import { useUiStore } from '../stores/ui.store.js'

import LoadingOverlay from './sections/LoadingOverlay.vue'
import WelcomeSection from './sections/WelcomeSection.vue'
import SubscriptionCard from './sections/SubscriptionCard.vue'
import QuickActions from './sections/QuickActions.vue'
import StatisticsRow from './sections/StatisticsRow.vue'
import LocationsList from './sections/LocationsList.vue'
import AppSidebar from './layout/AppSidebar.vue'
import TopNavbar from './layout/TopNavbar.vue'
import MobileBottomNav from './layout/MobileBottomNav.vue'
import AddLocationModal from './modals/AddLocationModal.vue'
import WhatsAppSetupModal from './modals/WhatsAppSetupModal.vue'
import WhatsAppManageModal from './modals/WhatsAppManageModal.vue'
import UpgradePromptModal from './modals/UpgradePromptModal.vue'

export default {
  name: 'DashboardApp',
  components: {
    LoadingOverlay,
    WelcomeSection,
    SubscriptionCard,
    QuickActions,
    StatisticsRow,
    LocationsList,
    AppSidebar,
    TopNavbar,
    MobileBottomNav,
    AddLocationModal,
    WhatsAppSetupModal,
    WhatsAppManageModal,
    UpgradePromptModal
  },
  setup() {
    const store = useDashboardStore()
    const uiStore = useUiStore()
    return { store, uiStore }
  },
  data() {
    return {
      whatsappSetup: { show: false, locationName: '' },
      whatsappManage: { show: false, locationName: '', phoneNumber: '' },
      upgradeModal: {
        show: false,
        title: 'Upgrade Required',
        message: '',
        showPlans: false,
        upgradeUrl: '/user-subscription.html'
      }
    }
  },
  watch: {
    'uiStore.sidebarCollapsed'(collapsed) {
      document.body.classList.toggle('sidebar-collapsed', collapsed)
    }
  },
  mounted() {
    if (this.uiStore.sidebarCollapsed) {
      document.body.classList.add('sidebar-collapsed')
    }
  },
  methods: {
    handleLocationChange(locationId) {
      this.uiStore.selectLocation(locationId)
      const loc = this.store.locations.find(l => l.id === locationId)
      const name = loc ? loc.name : 'All Locations'
      showToast('info', 'Location Selected', `Viewing data for: ${name}`)
    },

    handleAction(actionType) {
      if (actionType === 'addLocation') {
        this.handleAddLocation()
      }
    },

    handleAddLocation() {
      if (!this.store.canAddLocation) {
        Swal.fire({
          title: 'Location Limit Reached',
          text: `Your current plan allows up to ${this.store.maxLocations} location(s). Upgrade your plan to add more locations.`,
          icon: 'warning',
          confirmButtonText: 'Upgrade Plan',
          showCancelButton: true,
          cancelButtonText: 'Cancel'
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.href = '/user-subscription.html'
          }
        })
        return
      }
      this.uiStore.openAddLocationModal()
    },

    async handleSaveLocation(locationData) {
      try {
        await this.store.saveLocation(locationData)
        showToast('Location added successfully!', 'success')
        this.uiStore.closeAddLocationModal()
      } catch (error) {
        console.error('Error saving location:', error)
        showToast('Error saving location', 'error')
      }
    },

    handleEditLocation(locationId) {
      showToast('Edit location feature coming soon!', 'info')
    },

    async handleDeleteLocation(locationId) {
      const confirmed = await Swal.fire({
        title: 'Delete Location?',
        text: 'This action cannot be undone. All data associated with this location will be deleted.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, delete it',
        cancelButtonText: 'Cancel'
      })

      if (!confirmed.isConfirmed) return

      try {
        await this.store.deleteLocation(locationId)
        showToast('Location deleted successfully', 'success')
      } catch (error) {
        console.error('Error deleting location:', error)
        showToast('Error deleting location', 'error')
      }
    },

    handleViewAnalytics(locationId) {
      showToast('Location analytics coming soon!', 'info')
    },

    openSetupWhatsApp(locationId) {
      if (!this.store.whatsappTierLimits || this.store.whatsappTierLimits.whatsappNumbers === 0) {
        this.upgradeModal = {
          show: true,
          title: 'WhatsApp Messaging Not Available',
          message: 'WhatsApp messaging is not available in your current plan.',
          showPlans: true,
          upgradeUrl: '/user-subscription.html?upgrade=starter'
        }
        return
      }

      const location = this.store.locations.find(l => l.id === locationId)
      if (!location) return

      this.whatsappSetup = {
        show: true,
        locationName: location.name
      }
    },

    openManageWhatsApp(locationId) {
      const location = this.store.locations.find(l => l.id === locationId)
      const mapping = this.store.getWhatsAppMapping(locationId)
      if (!location || !mapping) return

      this.whatsappManage = {
        show: true,
        locationName: location.name,
        phoneNumber: mapping.phoneNumber
      }
    }
  }
}
</script>
