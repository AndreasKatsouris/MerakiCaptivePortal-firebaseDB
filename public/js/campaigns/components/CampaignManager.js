// components/CampaignManager.js
const CampaignManager = {
  name: 'CampaignManager',
  
  data() {
      return {
          campaigns: [],
          loading: false,
          error: null,
          filters: {
              status: null,
              brandName: null,
              dateRange: null
          }
      };
  },

  computed: {
      filteredCampaigns() {
          let filtered = [...this.campaigns];

          if (this.filters.status) {
              filtered = filtered.filter(campaign => 
                  campaign.status === this.filters.status
              );
          }

          if (this.filters.brandName) {
              filtered = filtered.filter(campaign => 
                  campaign.brandName.toLowerCase().includes(this.filters.brandName.toLowerCase())
              );
          }

          return filtered;
      }
  },

  methods: {
      async fetchCampaigns() {
          this.loading = true;
          try {
              const snapshot = await firebase.database()
                  .ref('campaigns')
                  .once('value');
              
              const campaignsData = snapshot.val() || {};
              this.campaigns = Object.entries(campaignsData)
                  .map(([id, data]) => ({
                      id,
                      ...data
                  }));
          } catch (error) {
              console.error('Error fetching campaigns:', error);
              this.error = 'Failed to fetch campaigns';
          } finally {
              this.loading = false;
          }
      },

      updateFilters(newFilters) {
          this.filters = {
              ...this.filters,
              ...newFilters
          };
      },

      async handleCreateCampaign(campaignData) {
          this.loading = true;
          try {
              const campaignRef = firebase.database().ref('campaigns').push();
              await campaignRef.set({
                  ...campaignData,
                  createdAt: firebase.database.ServerValue.TIMESTAMP,
                  updatedAt: firebase.database.ServerValue.TIMESTAMP
              });
              await this.fetchCampaigns();
              this.showSuccess('Campaign created successfully');
          } catch (error) {
              console.error('Error creating campaign:', error);
              this.showError('Failed to create campaign');
          } finally {
              this.loading = false;
          }
      },

      async handleUpdateCampaign(campaignId, updateData) {
          this.loading = true;
          try {
              await firebase.database()
                  .ref(`campaigns/${campaignId}`)
                  .update({
                      ...updateData,
                      updatedAt: firebase.database.ServerValue.TIMESTAMP
                  });
              await this.fetchCampaigns();
              this.showSuccess('Campaign updated successfully');
          } catch (error) {
              console.error('Error updating campaign:', error);
              this.showError('Failed to update campaign');
          } finally {
              this.loading = false;
          }
      },

      async handleDeleteCampaign(campaignId) {
          if (!confirm('Are you sure you want to delete this campaign?')) {
              return;
          }

          this.loading = true;
          try {
              await firebase.database()
                  .ref(`campaigns/${campaignId}`)
                  .remove();
              await this.fetchCampaigns();
              this.showSuccess('Campaign deleted successfully');
          } catch (error) {
              console.error('Error deleting campaign:', error);
              this.showError('Failed to delete campaign');
          } finally {
              this.loading = false;
          }
      },

      showSuccess(message) {
          Swal.fire('Success', message, 'success');
      },

      showError(message) {
          Swal.fire('Error', message, 'error');
      }
  },

  mounted() {
      this.fetchCampaigns();
  },

  template: `
      <div class="campaign-management">
          <div class="header">
              <h2>Campaign Management</h2>
              <div class="d-flex align-items-center">
                  <input 
                      type="text" 
                      class="form-control search-box me-2" 
                      v-model="filters.brandName" 
                      @input="updateFilters({ brandName: $event.target.value })"
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
                  <thead>
                      <tr>
                          <th>Brand</th>
                          <th>Store</th>
                          <th>Duration</th>
                          <th>Status</th>
                          <th>Actions</th>
                      </tr>
                  </thead>
                  <tbody>
                      <tr v-for="campaign in filteredCampaigns" :key="campaign.id">
                          <td>{{ campaign.brandName }}</td>
                          <td>{{ campaign.storeName || 'All Stores' }}</td>
                          <td>{{ campaign.startDate }} - {{ campaign.endDate }}</td>
                          <td>
                              <span :class="'badge badge-' + campaign.status">
                                  {{ campaign.status }}
                              </span>
                          </td>
                          <td>
                              <div class="btn-group">
                                  <button 
                                      class="btn btn-info btn-sm" 
                                      @click="viewCampaign(campaign)"
                                      title="View">
                                      <i class="fas fa-eye"></i>
                                  </button>
                                  <button 
                                      class="btn btn-warning btn-sm" 
                                      @click="handleUpdateCampaign(campaign.id)"
                                      title="Edit">
                                      <i class="fas fa-edit"></i>
                                  </button>
                                  <button 
                                      class="btn btn-danger btn-sm" 
                                      @click="handleDeleteCampaign(campaign.id)"
                                      title="Delete">
                                      <i class="fas fa-trash"></i>
                                  </button>
                              </div>
                          </td>
                      </tr>
                  </tbody>
              </table>
          </div>
      </div>
  `
};

// Make it globally available
window.CampaignManager = CampaignManager;