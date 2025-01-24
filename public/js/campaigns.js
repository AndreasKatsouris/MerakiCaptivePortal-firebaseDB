// Campaign Management Module
let app = null;
// campaigns.js
export function initializeCampaignManagement() {
    const app = Vue.createApp({
        data() {
            return {
                campaigns: [],
                loading: false,
                showModal: false,
                currentCampaign: null,
                searchQuery: '',
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
        computed: {
            filteredCampaigns() {
                if (!this.searchQuery) return this.campaigns;
                const query = this.searchQuery.toLowerCase();
                return this.campaigns.filter(campaign => 
                    campaign.name.toLowerCase().includes(query) ||
                    campaign.brandName.toLowerCase().includes(query)
                );
            }
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
            
            openAddModal() {
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
                    this.showSuccess(this.currentCampaign ? 'Campaign updated successfully' : 'Campaign added successfully');
                } catch (error) {
                    console.error('Error saving campaign:', error);
                    this.showError('Failed to save campaign');
                }
            },

            async deleteCampaign(campaign) {
                try {
                    const result = await Swal.fire({
                        title: 'Delete Campaign?',
                        text: 'This action cannot be undone.',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#dc3545',
                        confirmButtonText: 'Yes, delete it'
                    });

                    if (result.isConfirmed) {
                        await firebase.database().ref(`campaigns/${campaign.id}`).remove();
                        await this.loadCampaigns();
                        this.showSuccess('Campaign deleted successfully');
                    }
                } catch (error) {
                    console.error('Error deleting campaign:', error);
                    this.showError('Failed to delete campaign');
                }
            },

            editCampaign(campaign) {
                this.currentCampaign = campaign;
                this.formData = { ...campaign };
                this.showModal = true;
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

            formatDate(timestamp) {
                return new Date(timestamp).toLocaleDateString();
            },

            formatCurrency(amount) {
                return `R${Number(amount).toFixed(2)}`;
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
                <!-- Header with search and add button -->
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2>Campaign Management</h2>
                    <div class="d-flex gap-2">
                        <input 
                            type="text" 
                            class="form-control" 
                            v-model="searchQuery" 
                            placeholder="Search campaigns..."
                        >
                        <button class="btn btn-primary" @click="openAddModal">
                            + Add Campaign
                        </button>
                    </div>
                </div>

                <!-- Table -->
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Brand</th>
                                <th>Store</th>
                                <th>Duration</th>
                                <th>Min. Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody v-if="!loading">
                            <tr v-for="campaign in filteredCampaigns" :key="campaign.id">
                                <td>{{ campaign.name }}</td>
                                <td>{{ campaign.brandName }}</td>
                                <td>{{ campaign.storeName || 'All Stores' }}</td>
                                <td>{{ formatDate(campaign.startDate) }} - {{ formatDate(campaign.endDate) }}</td>
                                <td>{{ formatCurrency(campaign.minPurchaseAmount) }}</td>
                                <td>
                                    <span :class="'badge badge-' + campaign.status">
                                        {{ campaign.status }}
                                    </span>
                                </td>
                                <td>
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-info" @click="editCampaign(campaign)" title="View Campaign">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-warning" @click="editCampaign(campaign)" title="Edit Campaign">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-danger" @click="deleteCampaign(campaign)" title="Delete Campaign">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="filteredCampaigns.length === 0">
                                <td colspan="7" class="text-center">No campaigns found</td>
                            </tr>
                        </tbody>
                        <tbody v-else>
                            <tr>
                                <td colspan="7" class="text-center">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="sr-only">Loading...</span>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Add/Edit Campaign Modal -->
                <div class="modal fade" :class="{ show: showModal }" tabindex="-1" v-if="showModal">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ currentCampaign ? 'Edit' : 'Add' }} Campaign</h5>
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
                                                   v-model="formData.storeName">
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
                                                   required>
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
                                                   required>
                                        </label>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="min_amount">
                                            Minimum Purchase Amount
                                            <input type="number" 
                                                   class="form-control" 
                                                   id="min_amount" 
                                                   name="min_amount" 
                                                   v-model="formData.minPurchaseAmount">
                                        </label>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="status">
                                            Status
                                            <select class="form-control" 
                                                    id="status" 
                                                    name="status" 
                                                    v-model="formData.status">
                                                <option value="active">Active</option>
                                                <option value="inactive">Inactive</option>
                                            </select>
                                        </label>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" @click="showModal = false">Cancel</button>
                                <button type="button" class="btn btn-primary" @click="saveCampaign">
                                    {{ currentCampaign ? 'Update' : 'Add' }} Campaign
                                </button>
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