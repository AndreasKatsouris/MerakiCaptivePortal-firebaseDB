// Campaign Management Module
let app = null;
export function initializeCampaignManagement() {
    const app = Vue.createApp({
        data() {
            return {
                campaigns: [],
                loading: false,
                showModal: false,
                currentCampaign: null,
                formData: {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: '',
                    endDate: '',
                    status: 'active',
                    minPurchaseAmount: 0,
                    requiredItems: []
                }
            };
        },
        methods: {
            async loadCampaigns() {
                this.loading = true;
                try {
                    const snapshot = await firebase.database().ref('campaigns').once('value');
                    const data = snapshot.val() || {};
                    this.campaigns = Object.entries(data).map(([id, campaign]) => ({
                        id,
                        ...campaign
                    }));
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                    this.showError('Failed to load campaigns');
                } finally {
                    this.loading = false;
                }
            },
            
            openCreateModal() {
                this.currentCampaign = null;
                this.resetForm();
                this.showModal = true;
            },

            async saveCampaign() {
                if (!this.validateForm()) return;

                try {
                    const campaignData = {
                        ...this.formData,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };

                    if (this.currentCampaign) {
                        await firebase.database()
                            .ref(`campaigns/${this.currentCampaign.id}`)
                            .update(campaignData);
                    } else {
                        await firebase.database()
                            .ref('campaigns')
                            .push(campaignData);
                    }

                    this.showModal = false;
                    await this.loadCampaigns();
                    this.showSuccess('Campaign saved successfully');
                } catch (error) {
                    console.error('Error saving campaign:', error);
                    this.showError('Failed to save campaign');
                }
            },

            validateForm() {
                if (!this.formData.name || !this.formData.brandName) {
                    this.showError('Campaign name and brand are required');
                    return false;
                }

                const startDate = new Date(this.formData.startDate);
                const endDate = new Date(this.formData.endDate);
                if (endDate < startDate) {
                    this.showError('End date must be after start date');
                    return false;
                }

                return true;
            },

            resetForm() {
                this.formData = {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: '',
                    endDate: '',
                    status: 'active',
                    minPurchaseAmount: 0,
                    requiredItems: []
                };
            },

            showError(message) {
                Swal.fire('Error', message, 'error');
            },

            showSuccess(message) {
                Swal.fire('Success', message, 'success');
            }
        },
        mounted() {
            this.loadCampaigns();
        },
        template: `
            <div class="campaign-management">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2>Campaign Management</h2>
                    <button class="btn btn-primary" @click="openCreateModal">
                        <i class="fas fa-plus"></i> Create Campaign
                    </button>
                </div>

                <!-- Loading State -->
                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="sr-only">Loading...</span>
                    </div>
                </div>

                <!-- Campaigns Table -->
                <div v-else class="table-responsive">
                    <table class="table table-hover">
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
                            <tr v-for="campaign in campaigns" :key="campaign.id">
                                <td>{{ campaign.name }}</td>
                                <td>{{ campaign.brandName }}</td>
                                <td>{{ campaign.storeName || 'All Stores' }}</td>
                                <td>{{ new Date(campaign.startDate).toLocaleDateString() }}</td>
                                <td>{{ new Date(campaign.endDate).toLocaleDateString() }}</td>
                                <td>
                                    <span :class="'badge badge-' + campaign.status">
                                        {{ campaign.status }}
                                    </span>
                                </td>
                                <td>
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-warning" @click="editCampaign(campaign)">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-danger" @click="deleteCampaign(campaign)">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Campaign Modal -->
                <div class="modal fade" :class="{ show: showModal }" tabindex="-1" v-if="showModal">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ currentCampaign ? 'Edit' : 'Create' }} Campaign</h5>
                                <button type="button" class="btn-close" @click="showModal = false"></button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="saveCampaign">
                                    <div class="mb-3">
                                        <label class="form-label" for="campaign_name">
                                            Campaign Name
                                            <input type="text" 
                                                   class="form-control" 
                                                   id="campaign_name" 
                                                   name="campaign_name" 
                                                   v-model="formData.name" 
                                                   required
                                                   aria-required="true">
                                        </label>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="brand_name">
                                            Brand Name
                                            <input type="text" 
                                                   class="form-control" 
                                                   id="brand_name" 
                                                   name="brand_name" 
                                                   v-model="formData.brandName" 
                                                   required
                                                   aria-required="true">
                                        </label>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="store_name">
                                            Store Name (Optional)
                                            <input type="text" 
                                                   class="form-control" 
                                                   id="store_name" 
                                                   name="store_name" 
                                                   v-model="formData.storeName"
                                                   aria-required="false">
                                        </label>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="start_date">
                                            Start Date
                                            <input type="date" 
                                                   class="form-control" 
                                                   id="start_date" 
                                                   name="start_date" 
                                                   v-model="formData.startDate" 
                                                   required
                                                   aria-required="true">
                                        </label>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="end_date">
                                            End Date
                                            <input type="date" 
                                                   class="form-control" 
                                                   id="end_date" 
                                                   name="end_date" 
                                                   v-model="formData.endDate" 
                                                   required
                                                   aria-required="true">
                                        </label>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="min_purchase_amount">
                                            Minimum Purchase Amount
                                            <input type="number" 
                                                   class="form-control" 
                                                   id="min_purchase_amount" 
                                                   name="min_purchase_amount" 
                                                   v-model="formData.minPurchaseAmount"
                                                   aria-required="false">
                                        </label>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="campaign_status">
                                            Status
                                            <select class="form-control" 
                                                    id="campaign_status" 
                                                    name="campaign_status" 
                                                    v-model="formData.status"
                                                    aria-required="true">
                                                <option value="active">Active</option>
                                                <option value="inactive">Inactive</option>
                                            </select>
                                        </label>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" @click="showModal = false">Cancel</button>
                                <button type="button" class="btn btn-primary" @click="saveCampaign">Save Campaign</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `
    });

    try {
        app.mount('#campaignManagementRoot');
        console.log('Campaign management component mounted successfully');
    } catch (error) {
        console.error('Error mounting campaign management:', error);
    }
}

export function loadCampaigns() {
    if (app) {
        const instance = app._instance;
        if (instance && instance.proxy) {
            instance.proxy.loadCampaigns();
        }
    }
}