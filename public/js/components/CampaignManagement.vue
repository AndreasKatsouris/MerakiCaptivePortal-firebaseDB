<template>
  <div class="campaign-management">
    <!-- Header with Create Button -->
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h2>Campaign Management</h2>
      <button class="btn btn-primary" @click="showCreateModal">
        <i class="fas fa-plus"></i> Create Campaign
      </button>
    </div>

    <!-- Campaigns Table -->
    <div class="table-responsive">
      <table id="campaignTable" class="table table-striped">
        <thead>
          <tr>
            <th>Name</th>
            <th>Brand</th>
            <th>Store</th>
            <th>Start Date</th>
            <th>End Date</th>
            <th>Active Days</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8" class="text-center">
              <div class="spinner-border text-primary" role="status">
                <span class="sr-only">Loading...</span>
              </div>
            </td>
          </tr>
          <tr v-else-if="!campaigns.length">
            <td colspan="8" class="text-center">No campaigns found</td>
          </tr>
          <tr v-else v-for="(campaign, key) in campaigns" :key="key">
            <td>{{ campaign.name || 'Unnamed Campaign' }}</td>
            <td>{{ campaign.brandName || 'No Brand' }}</td>
            <td>{{ campaign.storeName || 'All Stores' }}</td>
            <td>{{ formatDate(campaign.startDate) }}</td>
            <td>{{ formatDate(campaign.endDate) }}</td>
            <td>{{ formatActiveDays(campaign.activeDays) }}</td>
            <td>
              <div class="custom-control custom-switch">
                <input type="checkbox" class="custom-control-input"
                       :id="'statusToggle_' + key"
                       v-model="campaign.status"
                       @change="updateStatus(key, campaign.status)"
                       :true-value="'active'"
                       :false-value="'inactive'">
                <label class="custom-control-label" :for="'statusToggle_' + key">
                  <span :class="'badge badge-' + (campaign.status === 'active' ? 'success' : 'secondary')">
                    {{ campaign.status === 'active' ? 'Active' : 'Inactive' }}
                  </span>
                </label>
              </div>
            </td>
            <td>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-info" @click="viewCampaign(key, campaign)">
                  <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-warning" @click="editCampaign(key, campaign)">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger" @click="deleteCampaign(key)">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Campaign Form Modal -->
    <div class="modal fade" id="campaignFormModal" ref="formModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ editingKey ? 'Edit' : 'Create' }} Campaign</h5>
            <button type="button" class="close" data-dismiss="modal">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <form @submit.prevent="saveCampaign" id="campaignForm">
              <!-- Basic Info -->
              <div class="form-group">
                <label>Campaign Name</label>
                <input type="text" class="form-control" v-model="formData.name" required>
              </div>
              <div class="form-group">
                <label>Brand Name</label>
                <input type="text" class="form-control" v-model="formData.brandName" required>
              </div>
              <div class="form-group">
                <label>Store Name (Optional)</label>
                <input type="text" class="form-control" v-model="formData.storeName">
              </div>

              <!-- Date Range -->
              <div class="row">
                <div class="col-md-6">
                  <div class="form-group">
                    <label>Start Date</label>
                    <input type="date" class="form-control" v-model="formData.startDate" required>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="form-group">
                    <label>End Date</label>
                    <input type="date" class="form-control" v-model="formData.endDate" required>
                  </div>
                </div>
              </div>

              <!-- Active Days -->
              <div class="form-group">
                <label>Active Days</label>
                <div class="btn-group-toggle" data-toggle="buttons">
                  <div class="btn-group btn-group-sm">
                    <label v-for="(day, index) in daysOfWeek" 
                           :key="index" 
                           class="btn btn-outline-primary"
                           :class="{ active: formData.activeDays.includes(index) }">
                      <input type="checkbox" 
                             :value="index" 
                             v-model="formData.activeDays">
                      {{ day }}
                    </label>
                  </div>
                </div>
              </div>

              <!-- Minimum Purchase Amount -->
              <div class="form-group">
                <label>Minimum Purchase Amount (R)</label>
                <input type="number" class="form-control" 
                       v-model.number="formData.minPurchaseAmount" 
                       min="0" step="0.01">
              </div>

              <!-- Campaign Status -->
              <div class="form-group">
                <label>Status</label>
                <select class="form-control" v-model="formData.status">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <!-- Required Items -->
              <div class="form-group">
                <label>Required Items</label>
                <div class="input-group mb-2">
                  <input type="text" class="form-control" 
                         v-model="newItem.name" 
                         placeholder="Item name">
                  <input type="number" class="form-control" 
                         v-model.number="newItem.quantity" 
                         min="1" value="1">
                  <div class="input-group-append">
                    <button type="button" class="btn btn-primary" @click="addItem">
                      Add Item
                    </button>
                  </div>
                </div>
                <div class="list-group">
                  <div v-for="(item, index) in formData.requiredItems" 
                       :key="index" 
                       class="list-group-item d-flex justify-content-between align-items-center">
                    {{ item.name }} (Qty: {{ item.quantity }})
                    <button type="button" class="btn btn-sm btn-danger" 
                            @click="removeItem(index)">
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveCampaign">Save Campaign</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Campaign Details Modal -->
    <div class="modal fade" id="campaignDetailsModal" ref="detailsModal" tabindex="-1">
      <!-- ... (keep existing modal structure, update to use v-if/v-show for content) ... -->
    </div>
  </div>
</template>

<script>
import { validateCampaignData } from '../../../functions/guardRail';
import { ref, onMounted } from 'vue';
import firebase from 'firebase/app';
import 'firebase/database';

export default {
  name: 'CampaignManagement',
  
  setup() {
    const campaigns = ref([]);
    const loading = ref(false);
    const editingKey = ref(null);
    const formModal = ref(null);
    const detailsModal = ref(null);

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const formData = ref({
      name: '',
      brandName: '',
      storeName: '',
      startDate: '',
      endDate: '',
      status: 'inactive',
      minPurchaseAmount: null,
      activeDays: [],
      requiredItems: []
    });

    const newItem = ref({
      name: '',
      quantity: 1
    });

    // Methods
    const loadCampaigns = async () => {
      loading.value = true;
      try {
        const snapshot = await firebase.database().ref('campaigns').once('value');
        campaigns.value = snapshot.val() || {};
      } catch (error) {
        console.error('Error loading campaigns:', error);
        // TODO: Add error handling/notification
      } finally {
        loading.value = false;
      }
    };

    const showCreateModal = () => {
      editingKey.value = null;
      resetForm();
      $(formModal.value).modal('show');
    };

    const resetForm = () => {
      formData.value = {
        name: '',
        brandName: '',
        storeName: '',
        startDate: '',
        endDate: '',
        status: 'inactive',
        minPurchaseAmount: null,
        activeDays: [],
        requiredItems: []
      };
      newItem.value = { name: '', quantity: 1 };
    };

    const saveCampaign = async () => {
      try {
        const errors = validateCampaignData(formData.value);
        if (errors.length) {
          throw new Error(errors.join('\n'));
        }

        const campaignData = {
          ...formData.value,
          createdAt: Date.now()
        };

        if (editingKey.value) {
          await firebase.database()
            .ref(`campaigns/${editingKey.value}`)
            .update({
              ...campaignData,
              updatedAt: Date.now()
            });
        } else {
          await firebase.database()
            .ref('campaigns')
            .push(campaignData);
        }

        $(formModal.value).modal('hide');
        await loadCampaigns();
        // TODO: Add success notification

      } catch (error) {
        console.error('Error saving campaign:', error);
        // TODO: Add error notification
      }
    };

    // Lifecycle hooks
    onMounted(() => {
      loadCampaigns();
    });

    return {
      campaigns,
      loading,
      editingKey,
      formModal,
      detailsModal,
      formData,
      newItem,
      daysOfWeek,
      loadCampaigns,
      showCreateModal,
      saveCampaign,
      // ... other methods
    };
  },

  methods: {
    formatDate(date) {
      return new Date(date).toLocaleDateString();
    },

    formatActiveDays(days) {
      if (!days || !days.length) return 'All days';
      return days.map(day => this.daysOfWeek[day]).join(', ');
    },

    addItem() {
      if (this.newItem.name && this.newItem.quantity > 0) {
        this.formData.requiredItems.push({ ...this.newItem });
        this.newItem.name = '';
        this.newItem.quantity = 1;
      }
    },

    removeItem(index) {
      this.formData.requiredItems.splice(index, 1);
    },

    // ... other helper methods
  }
};
</script>

<style scoped>
.campaign-management {
  padding: 20px;
}

.btn-group-toggle .btn {
  margin-right: 5px;
}

.list-group-item button {
  margin-left: 10px;
}
</style> 