//import { showLoading, hideLoading } from './admin-dashboard.js';
let managementApp = null;
const campaignManagement = {
    app: null,
    component: {
        data() {
            return {
                campaigns: {},
                loading: false,
                editingCampaign: null,
                campaignForm: {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: '',
                    endDate: '',
                    status: 'active',
                    minPurchaseAmount: null,
                    requiredItems: []
                },
                newItem: {
                    name: '',
                    quantity: 1
                }
            };
        },

        mounted() {
            this.loadCampaigns();
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

            showCreateCampaignModal() {
                this.editingCampaign = null;
                this.resetForm();
                $('#campaignFormModal').modal('show');
            },

            resetForm() {
                this.campaignForm = {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: '',
                    endDate: '',
                    status: 'active',
                    minPurchaseAmount: null,
                    requiredItems: []
                };
                this.newItem = { name: '', quantity: 1 };
            },

            addRequiredItem() {
                if (!this.newItem.name.trim()) return;
                this.campaignForm.requiredItems.push({...this.newItem});
                this.newItem = { name: '', quantity: 1 };
            },

            removeRequiredItem(index) {
                this.campaignForm.requiredItems.splice(index, 1);
            },

            async saveCampaign() {
                try {
                    if (!this.validateForm()) return;

                    const campaignData = {
                        ...this.campaignForm,
                        createdAt: Date.now()
                    };

                    if (this.editingCampaign) {
                        await firebase.database()
                            .ref(`campaigns/${this.editingCampaign}`)
                            .update(campaignData);
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

            validateForm() {
                if (!this.campaignForm.name || !this.campaignForm.brandName) {
                    this.showError('Campaign name and brand are required');
                    return false;
                }

                const startDate = new Date(this.campaignForm.startDate);
                const endDate = new Date(this.campaignForm.endDate);

                if (endDate < startDate) {
                    this.showError('End date must be after start date');
                    return false;
                }

                return true;
            },

            handleView(key) {
                const campaign = this.campaigns[key];
                if (!campaign) return;

                Swal.fire({
                    title: campaign.name,
                    html: this.generateCampaignDetails(campaign),
                    width: 600
                });
            },

            generateCampaignDetails(campaign) {
                return `
                    <div class="text-left">
                        <p><strong>Brand:</strong> ${campaign.brandName}</p>
                        <p><strong>Store:</strong> ${campaign.storeName || 'All Stores'}</p>
                        <p><strong>Duration:</strong> ${this.formatDate(campaign.startDate)} - ${this.formatDate(campaign.endDate)}</p>
                        <p><strong>Status:</strong> ${campaign.status}</p>
                        ${campaign.minPurchaseAmount ? `<p><strong>Minimum Purchase:</strong> R${campaign.minPurchaseAmount}</p>` : ''}
                        ${this.generateRequiredItemsHtml(campaign.requiredItems)}
                    </div>
                `;
            },

            generateRequiredItemsHtml(items) {
                if (!items?.length) return '';
                return `
                    <p><strong>Required Items:</strong></p>
                    <ul>
                        ${items.map(item => `<li>${item.name} (Qty: ${item.quantity})</li>`).join('')}
                    </ul>
                `;
            },

            handleEdit(key) {
                const campaign = this.campaigns[key];
                if (!campaign) return;

                this.editingCampaign = key;
                this.campaignForm = {...campaign};
                $('#campaignFormModal').modal('show');
            },

            async handleDelete(key) {
                const result = await Swal.fire({
                    title: 'Delete Campaign?',
                    text: 'This action cannot be undone.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#dc3545',
                    confirmButtonText: 'Yes, delete it!'
                });

                if (result.isConfirmed) {
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

            formatDate(date) {
                return new Date(date).toLocaleDateString();
            },

            showError(message) {
                Swal.fire('Error', message, 'error');
            },

            showSuccess(message) {
                Swal.fire('Success', message, 'success');
            }
        },

        template: `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2>Campaign Management</h2>
                    <button class="btn btn-primary" @click="showCreateCampaignModal">
                        <i class="fas fa-plus"></i> Create Campaign
                    </button>
                </div>

                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary"></div>
                </div>

                <div v-else class="table-responsive">
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
                                    <span :class="'badge badge-' + (campaign.status === 'active' ? 'success' : 'secondary')">
                                        {{ campaign.status }}
                                    </span>
                                </td>
                                <td>
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-info" @click="handleView(key)">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-warning" @click="handleEdit(key)">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-danger" @click="handleDelete(key)">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Campaign Form Modal -->
                <div class="modal fade" id="campaignFormModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ editingCampaign ? 'Edit' : 'Create' }} Campaign</h5>
                                <button type="button" class="close" data-dismiss="modal">×</button>
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
                                        <label>Store (Optional)</label>
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
                                        <label>Minimum Purchase Amount</label>
                                        <input type="number" class="form-control" v-model="campaignForm.minPurchaseAmount">
                                    </div>
                                    <div class="form-group">
                                        <label>Status</label>
                                        <select class="form-control" v-model="campaignForm.status">
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label>Required Items</label>
                                        <div class="input-group mb-2">
                                            <input type="text" class="form-control" v-model="newItem.name" 
                                                   placeholder="Item name">
                                            <input type="number" class="form-control" v-model="newItem.quantity" 
                                                   min="1" style="max-width: 100px;">
                                            <div class="input-group-append">
                                                <button type="button" class="btn btn-success" @click="addRequiredItem">
                                                    <i class="fas fa-plus"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <div v-if="campaignForm.requiredItems.length" class="list-group">
                                            <div v-for="(item, index) in campaignForm.requiredItems" 
                                                 :key="index" 
                                                 class="list-group-item d-flex justify-content-between align-items-center">
                                                {{ item.name }} (Qty: {{ item.quantity }})
                                                <button type="button" class="btn btn-sm btn-danger" 
                                                        @click="removeRequiredItem(index)">
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
        `
    }
};

export function initializeCampaignManagement() {
    managementApp = Vue.createApp(campaignComponent);
    return managementApp.mount('#campaignManagementRoot');
}

export function loadCampaigns() {
    if (managementApp) {
        return managementApp.$refs.component.loadCampaigns();
    }
}