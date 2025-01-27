// Campaign Management Module

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
                },
                errorMessage: '',
                successMessage: ''
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
                <div class="header">
                    <h2>Campaign Management</h2>
                    <div class="d-flex align-items-center">
                        <input 
                            type="text" 
                            class="form-control search-box" 
                            v-model="searchQuery" 
                            placeholder="Search campaigns..."
                        >
                        <button class="btn btn-primary" @click="openAddModal">
                            + Add Campaign
                        </button>
                    </div>
                </div>

                <!-- Loading State -->
                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="sr-only">Loading...</span>
                    </div>
                </div>

                <!-- Table -->
                <div v-else class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Brand</th>
                                <th>Store</th>
                                <th>Duration</th>
                                <th>Min. Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="campaign in filteredCampaigns" :key="campaign.id">
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
                                    <div class="btn-group">
                                        <button class="btn btn-info btn-sm" @click="editCampaign(campaign)" title="View">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-warning btn-sm" @click="editCampaign(campaign)" title="Edit">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-danger btn-sm" @click="deleteCampaign(campaign)" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Campaign Modal -->
                <div class="modal fade" v-if="showModal" tabindex="-1" role="dialog">
                    <div class="modal-dialog" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ currentCampaign ? 'Edit Campaign' : 'Add Campaign' }}</h5>
                                <button type="button" class="close" @click="showModal = false">
                                    <span>&times;</span>
                                </button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="saveCampaign">
                                    <div class="form-group">
                                        <label>Campaign Name</label>
                                        <input type="text" class="form-control" v-model="formData.name" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Brand Name</label>
                                        <input type="text" class="form-control" v-model="formData.brandName" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Store Name</label>
                                        <input type="text" class="form-control" v-model="formData.storeName">
                                    </div>
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
                                    <div class="form-group">
                                        <label>Minimum Purchase Amount</label>
                                        <input type="number" class="form-control" v-model="formData.minPurchaseAmount" min="0" step="0.01">
                                    </div>
                                    <div class="form-group">
                                        <label>Status</label>
                                        <select class="form-control" v-model="formData.status">
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-secondary" @click="showModal = false">Cancel</button>
                                        <button type="submit" class="btn btn-primary">Save</button>
                                    </div>
                                </form>
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
    if (app && app._instance) {
        app._instance.proxy.loadCampaigns();
    }
}