<!-- CampaignManager.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import { useCampaignStore } from '../stores/campaign.store'
import { storeToRefs } from 'pinia'

// Store setup
const campaignStore = useCampaignStore()
const { campaigns, loading, error } = storeToRefs(campaignStore)

// Local state
const searchQuery = ref('')
const showModal = ref(false)
const selectedCampaign = ref(null)

// Computed state for filtered campaigns
const filteredCampaigns = computed(() => {
  if (!searchQuery.value) return campaigns.value
  
  const query = searchQuery.value.toLowerCase()
  return campaigns.value.filter(campaign => 
    campaign.name.toLowerCase().includes(query) ||
    campaign.brandName.toLowerCase().includes(query)
  )
})

// Methods
const fetchCampaigns = async () => {
  try {
    await campaignStore.fetchCampaigns()
  } catch (err) {
    console.error('Error fetching campaigns:', err)
  }
}

const showAddCampaignModal = () => {
  selectedCampaign.value = null
  showModal.value = true
}

const viewCampaign = (campaign) => {
  selectedCampaign.value = campaign
  showModal.value = true
}

// Lifecycle hooks
onMounted(() => {
  fetchCampaigns()
})
</script>

<template>
  <div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h2>Campaign Management</h2>
      <div class="d-flex gap-2">
        <input 
          type="text"
          v-model="searchQuery"
          class="form-control"
          placeholder="Search campaigns..."
        >
        <button 
          @click="showAddCampaignModal"
          class="btn btn-primary"
          :disabled="loading"
        >
          <i class="fas fa-plus"></i> Add Campaign
        </button>
      </div>
    </div>

    <!-- Error Alert -->
    <div v-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <!-- Main Table -->
    <div v-else class="card">
      <div class="card-body">
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Brand</th>
                <th>Status</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="campaign in filteredCampaigns" :key="campaign.id">
                <td>{{ campaign.name }}</td>
                <td>{{ campaign.brandName }}</td>
                <td>
                  <span :class="['badge', `badge-${campaign.status === 'active' ? 'success' : 'secondary'}`]">
                    {{ campaign.status }}
                  </span>
                </td>
                <td>{{ new Date(campaign.startDate).toLocaleDateString() }}</td>
                <td>{{ new Date(campaign.endDate).toLocaleDateString() }}</td>
                <td>
                  <div class="btn-group btn-group-sm">
                    <button 
                      @click="viewCampaign(campaign)"
                      class="btn btn-info"
                      title="View Campaign"
                    >
                      <i class="fas fa-eye"></i>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="filteredCampaigns.length === 0">
                <td colspan="6" class="text-center py-4">
                  No campaigns found
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gap-2 {
  gap: 0.5rem;
}

.badge {
  padding: 0.5em 0.75em;
  font-weight: 500;
}

.badge-success {
  background-color: #28a745;
  color: white;
}

.badge-secondary {
  background-color: #6c757d;
  color: white;
}
</style>