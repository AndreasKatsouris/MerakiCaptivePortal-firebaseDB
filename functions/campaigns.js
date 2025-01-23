const campaignManagement = {
    app: null,
    component: {
        template: `
            <div class="container-fluid">
                <!-- Header -->
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2>Campaign Management</h2>
                    <button class="btn btn-primary" @click="showCreateCampaignModal">
                        <i class="fas fa-plus"></i> Create Campaign
                    </button>
                </div>

                <!-- Loading State -->
                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary"></div>
                </div>

                <!-- Campaigns Table -->
                <div v-else class="card">
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Campaign Name</th>
                                        <th>Brand</th>
                                        <th>Store</th>
                                        <th>Start Date</th>
                                        <th>End Date</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(campaign, key) in campaigns" :key="key">
                                        <td>{{ campaign.name }}</td>
                                        <td>{{ campaign.brandName }}</td>
                                        <td>{{ campaign.storeName || 'All Stores' }}</td>
                                        <td>{{ formatDate(campaign.startDate) }}</td>
                                        <td>{{ formatDate(campaign.endDate) }}</td>
                                        <td>
                                            <div class="custom-control custom-switch">
                                                <input type="checkbox" class="custom-control-input"
                                                    :id="'statusToggle_' + key"
                                                    :checked="campaign.status === 'active'"
                                                    @change="toggleCampaignStatus(key, $event.target.checked)">
                                                <label class="custom-control-label" :for="'statusToggle_' + key">
                                                    <span :class="'badge badge-' + getStatusBadgeClass(campaign.status)">
                                                        {{ campaign.status }}
                                                    </span>
                                                </label>
                                            </div>
                                        </td>
                                        <td>
                                            <div class="btn-group btn-group-sm">
                                                <button class="btn btn-info" @click="viewCampaign(key)">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                <button class="btn btn-warning" @click="editCampaign(key)">
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
                    </div>
                </div>

                <!-- Campaign Form Modal -->
                <div class="modal fade" id="campaignFormModal">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ editingCampaign ? 'Edit' : 'Create' }} Campaign</h5>
                                <button type="button" class="close" data-dismiss="modal">&times;</button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="saveCampaign">
                                    <div class="form-group">
                                        <label>Campaign Name</label>
                                        <input type="text" class="form-control" v-model="campaignForm.name" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Brand Name</label>
                                        <input type="text" class="form-control" v-model="campaignForm.brandName" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Store Name (Optional)</label>
                                        <input type="text" class="form-control" v-model="campaignForm.storeName">
                                    </div>
                                    <div class="form-group">
                                        <label>Start Date</label>
                                        <input type="date" class="form-control" v-model="campaignForm.startDate" required>
                                    </div>
                                    <div class="form-group">
                                        <label>End Date</label>
                                        <input type="date" class="form-control" v-model="campaignForm.endDate" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Status</label>
                                        <select class="form-control" v-model="campaignForm.status">
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                    <!-- Required Items Section -->
                                    <div class="form-group">
                                        <label>Required Items</label>
                                        <div class="input-group mb-2">
                                            <input type="text" class="form-control" v-model="newItem.name" placeholder="Item name">
                                            <input type="number" class="form-control" v-model="newItem.quantity" min="1" value="1">
                                            <div class="input-group-append">
                                                <button type="button" class="btn btn-success" @click="addRequiredItem">
                                                    <i class="fas fa-plus"></i> Add
                                                </button>
                                            </div>
                                        </div>
                                        <div class="list-group">
                                            <div v-for="(item, index) in campaignForm.requiredItems" 
                                                 :key="index" 
                                                 class="list-group-item d-flex justify-content-between align-items-center">
                                                {{ item.name }} (Qty: {{ item.quantity }})
                                                <button type="button" class="btn btn-sm btn-danger" @click="removeRequiredItem(index)">
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
            </div>
        `,

        data() {
            return {
                campaigns: {},
                loading: false,
                editingCampaign: null,
                campaignForm: this.getEmptyCampaignForm(),
                newItem: {
                    name: '',
                    quantity: 1
                }
            };
        },

        methods: {
            async loadCampaigns() {
                this.loading = true;
                try {
                    const snapshot = await firebase.database().ref('campaigns').once('value');
                    this.campaigns = snapshot.val() || {};
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                    this.showError('Failed to load campaigns');
                } finally {
                    this.loading = false;
                }
            },

            getEmptyCampaignForm() {
                return {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: '',
                    endDate: '',
                    status: 'active',
                    requiredItems: []
                };
            },

            showCreateCampaignModal() {
                this.editingCampaign = null;
                this.campaignForm = this.getEmptyCampaignForm();
                $('#campaignFormModal').modal('show');
            },

            async saveCampaign() {
                try {
                    const campaignData = {...this.campaignForm, createdAt: Date.now()};
                    
                    if (this.editingCampaign) {
                        await firebase.database()
                            .ref(`campaigns/${this.editingCampaign}`)
                            .update({...campaignData, updatedAt: Date.now()});
                    } else {
                        await firebase.database().ref('campaigns').push(campaignData);
                    }

                    $('#campaignFormModal').modal('hide');
                    await this.loadCampaigns();
                    this.showSuccess('Campaign saved successfully');
                } catch (error) {
                    console.error('Error saving campaign:', error);
                    this.showError('Failed to save campaign');
                }
            },

            async editCampaign(key) {
                this.editingCampaign = key;
                this.campaignForm = {...this.campaigns[key]};
                $('#campaignFormModal').modal('show');
            },

            async deleteCampaign(key) {
                if (await this.confirm('Delete Campaign?', 'Are you sure you want to delete this campaign?')) {
                    try {
                        await firebase.database().ref(`campaigns/${key}`).remove();
                        await this.loadCampaigns();
                        this.showSuccess('Campaign deleted successfully');
                    } catch (error) {
                        console.error('Error deleting campaign:', error);
                        this.showError('Failed to delete campaign');
                    }
                }
            },

            async toggleCampaignStatus(key, isActive) {
                try {
                    await firebase.database().ref(`campaigns/${key}`).update({
                        status: isActive ? 'active' : 'inactive',
                        updatedAt: Date.now()
                    });
                    this.campaigns[key].status = isActive ? 'active' : 'inactive';
                } catch (error) {
                    console.error('Error updating status:', error);
                    this.showError('Failed to update status');
                }
            },

            addRequiredItem() {
                if (this.newItem.name.trim()) {
                    this.campaignForm.requiredItems.push({...this.newItem});
                    this.newItem = { name: '', quantity: 1 };
                }
            },

            removeRequiredItem(index) {
                this.campaignForm.requiredItems.splice(index, 1);
            },

            formatDate(date) {
                return new Date(date).toLocaleDateString();
            },

            getStatusBadgeClass(status) {
                return status === 'active' ? 'success' : 'secondary';
            },

            showError(message) {
                Swal.fire('Error', message, 'error');
            },

            showSuccess(message) {
                Swal.fire('Success', message, 'success');
            },

            async confirm(title, text) {
                const result = await Swal.fire({
                    title,
                    text,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#dc3545',
                    confirmButtonText: 'Yes, delete it!'
                });
                return result.isConfirmed;
            }
        },

        mounted() {
            this.loadCampaigns();
        }
    }
};

export function initializeCampaignManagement() {
    const app = Vue.createApp(campaignManagement.component);
    campaignManagement.app = app.mount('#campaignManagementRoot');
}