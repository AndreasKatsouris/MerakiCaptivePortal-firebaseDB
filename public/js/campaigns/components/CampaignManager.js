// components/CampaignManager.js
import { defineComponent } from 'vue';
import { useCampaignStore } from '../stores/campaign.store';
import { storeToRefs } from 'pinia';

export default defineComponent({
  name: 'CampaignManager',

  setup() {
    const store = useCampaignStore();
    
    // Destructure what we need from store
    // storeToRefs maintains reactivity
    const { 
      campaigns,
      loading,
      error,
      currentCampaign,
      filteredCampaigns
    } = storeToRefs(store);

    // Initialize data
    onMounted(async () => {
      try {
        await store.fetchCampaigns();
      } catch (error) {
        console.error('Failed to fetch campaigns:', error);
      }
    });

    // Methods
    const handleCreateCampaign = async (campaignData) => {
      try {
        await store.createCampaign(campaignData);
        showSuccessMessage('Campaign created successfully');
      } catch (error) {
        showErrorMessage(error.message);
      }
    };

    const handleUpdateCampaign = async (campaignId, updateData) => {
      try {
        await store.updateCampaign(campaignId, updateData);
        showSuccessMessage('Campaign updated successfully');
      } catch (error) {
        showErrorMessage(error.message);
      }
    };

    const handleDeleteCampaign = async (campaignId) => {
      try {
        if (await confirmDelete()) {
          await store.deleteCampaign(campaignId);
          showSuccessMessage('Campaign deleted successfully');
        }
      } catch (error) {
        showErrorMessage(error.message);
      }
    };

    const handleFilterChange = (filters) => {
      store.updateFilters(filters);
    };

    // UI Helper methods
    const showSuccessMessage = (message) => {
      // Implementation using your UI library
    };

    const showErrorMessage = (message) => {
      // Implementation using your UI library
    };

    const confirmDelete = async () => {
      // Implementation using your UI library
      return true;
    };

    // Cleanup
    onUnmounted(() => {
      store.resetState();
    });

    return {
      // State
      campaigns,
      loading,
      error,
      currentCampaign,
      filteredCampaigns,

      // Methods
      handleCreateCampaign,
      handleUpdateCampaign,
      handleDeleteCampaign,
      handleFilterChange
    };
  },

  template: `
    <div class="campaign-management">
      <!-- Your existing template here, but using store variables -->
      <div class="header">
        <h2>Campaign Management</h2>
        <div class="d-flex align-items-center">
          <input 
            type="text" 
            class="form-control search-box me-2" 
            v-model="filters.brandName" 
            @input="handleFilterChange({ brandName: $event.target.value })"
            placeholder="Search campaigns..."
          >
          <button class="btn btn-primary" @click="handleCreateCampaign">
            <i class="fas fa-plus"></i> Add Campaign
          </button>
        </div>
      </div>

      <div v-if="loading" class="text-center py-4">
        <div class="spinner-border text-primary" role="status">
          <span class="sr-only">Loading...</span>
        </div>
      </div>

      <div v-else-if="error" class="alert alert-danger" role="alert">
        {{ error }}
      </div>

      <div v-else class="table-responsive">
        <table class="table">
          <!-- Your existing table structure -->
          <tbody>
            <tr v-for="campaign in filteredCampaigns" :key="campaign.id">
              <!-- Your existing row template -->
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
});