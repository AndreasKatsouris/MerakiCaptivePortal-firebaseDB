// Campaign Management Module
let app = null;
function initializeCampaignManagement() {
    console.log('Starting campaign management initialization');
    console.log('Checking for mount point:', document.getElementById('campaignManagementRoot'));
    const app = Vue.createApp({
        data() {
            return {
                campaigns: [],
                loading: false,
                showModal: false,
                modalMode: '',
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
                modalInstance: null
            };
        },

        computed: {
            filteredCampaigns() {
                if (!this.searchQuery) return this.campaigns;
                const query = this.searchQuery.toLowerCase();
                return this.campaigns.filter(campaign => 
                    campaign.name?.toLowerCase().includes(query) ||
                    campaign.brandName?.toLowerCase().includes(query)
                );
            }
        },

        watch: {
            showModal(newValue) {
                console.log('Modal visibility changed:', newValue);
                this.$nextTick(() => {
                    if (newValue) {
                        this.initializeModal();
                    }
                });
            }
        },

        methods: {
            initializeModal() {
                console.log('Initializing Bootstrap modal');
                const modalElement = document.querySelector('#campaignModal');
                if (modalElement) {
                    this.modalInstance = new bootstrap.Modal(modalElement, {
                        backdrop: 'static',
                        keyboard: false
                    });
                    this.modalInstance.show();
                } else {
                    console.error('Modal element not found');
                }
            },

            closeModal() {
                console.log('Closing modal');
                if (this.modalInstance) {
                    this.modalInstance.hide();
                }
                this.showModal = false;
                this.modalMode = '';
                console.log('Modal state after close:', this.showModal);
            },

            openAddModal() {
                console.log('Opening add modal');
                this.currentCampaign = null;
                this.modalMode = 'add';
                this.resetForm();
                this.formData = {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: new Date().toISOString().split('T')[0],
                    endDate: '', 
                    status: 'active',
                    minPurchaseAmount: 0,
                    requiredItems: []
                };
                this.showModal = true;
                console.log('Show modal set to:', this.showModal);
            },

            viewCampaign(campaign) {
                console.log('View campaign:', campaign);
                this.currentCampaign = campaign;
                this.modalMode = 'view';
                this.formData = { ...campaign };
                this.showModal = true;
                console.log('Show modal set to:', this.showModal);
            },

            editCampaign(campaign) {
                console.log('Edit campaign:', campaign);
                this.currentCampaign = campaign;
                this.modalMode = 'edit';
                this.formData = { ...campaign };
                this.showModal = true;
                console.log('Show modal set to:', this.showModal);
            },

            async saveCampaign() {
                if (!this.validateForm()) return;

                try {
                    console.log('Saving campaign in mode:', this.modalMode);
                    const campaignData = {
                        ...this.formData,
                        updatedAt: Date.now()
                    };

                    if (this.modalMode === 'add') {
                        campaignData.createdAt = Date.now();
                        await firebase.database()
                            .ref('campaigns')
                            .push(campaignData);
                        this.showSuccess('Campaign created successfully');
                    } else if (this.modalMode === 'edit' && this.currentCampaign) {
                        await firebase.database()
                            .ref(`campaigns/${this.currentCampaign.id}`)
                            .update(campaignData);
                        this.showSuccess('Campaign updated successfully');
                    }

                    this.closeModal();
                    await this.loadCampaigns();
                } catch (error) {
                    console.error('Error saving campaign:', error);
                    this.showError('Failed to save campaign');
                }
            },

            async loadCampaigns() {
                console.log('Loading campaigns...');
                this.loading = true;
                try {
                    const snapshot = await firebase.database().ref('campaigns').once('value');
                    const data = snapshot.val() || {};
                    this.campaigns = Object.entries(data).map(([id, campaign]) => ({
                        id,
                        ...campaign
                    }));
                    console.log('Campaigns loaded:', this.campaigns.length);
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                    this.showError('Failed to load campaigns');
                } finally {
                    this.loading = false;
                }
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
            },

            deleteCampaign(campaign) {
                Swal.fire({
                    title: 'Delete Campaign?',
                    text: 'This action cannot be undone.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#dc3545',
                    confirmButtonText: 'Yes, delete it'
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            await firebase.database().ref(`campaigns/${campaign.id}`).remove();
                            await this.loadCampaigns();
                            this.showSuccess('Campaign deleted successfully');
                        } catch (error) {
                            console.error('Error deleting campaign:', error);
                            this.showError('Failed to delete campaign');
                        }
                    }
                });
            }
        },

        mounted() {
            console.log('Campaign Management component mounted');
            console.log('Component element:', this.$el);
            console.log('Current campaigns:', this.campaigns);
            this.loadCampaigns();
            
            const modalElement = document.querySelector('#campaignModal');
            if (modalElement) {
                modalElement.addEventListener('hidden.bs.modal', () => {
                    this.showModal = false;
                    this.modalMode = '';
                });
            }
        },
        
        beforeUnmount() {
            if (this.modalInstance) {
                this.modalInstance.dispose();
            }
        },

        template: `
            <div class="campaign-management">
                <div class="header">
                    <h2>Campaign Management</h2>
                    <div class="d-flex align-items-center">
                        <input 
                            type="text" 
                            class="form-control search-box me-2" 
                            v-model="searchQuery" 
                            placeholder="Search campaigns..."
                        >
                        <button class="btn btn-primary" @click="openAddModal">
                            <i class="fas fa-plus"></i> Add Campaign
                        </button>
                    </div>
                </div>

                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="sr-only">Loading...</span>
                    </div>
                </div>

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
                                        <button class="btn btn-info btn-sm" @click="viewCampaign(campaign)" title="View">
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

                <div id="campaignModal" class="modal fade" tabindex="-1" role="dialog" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">
                                    {{ modalMode === 'view' ? 'View Campaign' : 
                                       modalMode === 'add' ? 'Add New Campaign' :
                                       'Edit Campaign' }}
                                </h5>
                                <button type="button" class="btn-close" @click="closeModal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="saveCampaign">
                                    <div class="form-group mb-3">
                                        <label>Campaign Name *</label>
                                        <input 
                                            type="text" 
                                            class="form-control" 
                                            v-model="formData.name" 
                                            :readonly="modalMode === 'view'"
                                            required
                                        >
                                    </div>
                                    <div class="form-group mb-3">
                                        <label>Brand Name *</label>
                                        <input 
                                            type="text" 
                                            class="form-control" 
                                            v-model="formData.brandName" 
                                            :readonly="modalMode === 'view'"
                                            required
                                        >
                                    </div>
                                    <div class="form-group mb-3">
                                        <label>Store Name</label>
                                        <input 
                                            type="text" 
                                            class="form-control" 
                                            v-model="formData.storeName"
                                            :readonly="modalMode === 'view'"
                                        >
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="form-group mb-3">
                                                <label>Start Date *</label>
                                                <input 
                                                    type="date" 
                                                    class="form-control" 
                                                    v-model="formData.startDate"
                                                    :readonly="modalMode === 'view'"
                                                    required
                                                >
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-group mb-3">
                                                <label>End Date *</label>
                                                <input 
                                                    type="date" 
                                                    class="form-control" 
                                                    v-model="formData.endDate"
                                                    :readonly="modalMode === 'view'"
                                                    required
                                                >
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-group mb-3">
                                        <label>Minimum Purchase Amount</label>
                                        <input 
                                            type="number" 
                                            class="form-control" 
                                            v-model="formData.minPurchaseAmount"
                                            :readonly="modalMode === 'view'"
                                            min="0" 
                                            step="0.01"
                                        >
                                    </div>
                                    <div class="form-group mb-3">
                                        <label>Status</label>
                                        <select 
                                            class="form-control" 
                                            v-model="formData.status"
                                            :disabled="modalMode === 'view'"
                                        >
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                    <div class="modal-footer">
                                        <button type="button" class="btn btn-secondary" @click="closeModal">
                                            {{ modalMode === 'view' ? 'Close' : 'Cancel' }}
                                        </button>
                                        <button 
                                            v-if="modalMode !== 'view'" 
                                            type="submit" 
                                            class="btn btn-primary"
                                        >
                                            {{ modalMode === 'add' ? 'Create Campaign' : 'Update Campaign' }}
                                        </button>
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
        return app;
    } catch (error) {
        console.error('Error mounting campaign management:', error);
        throw error;
    }
}

function loadCampaigns() {
    if (app && app._instance) {
        app._instance.proxy.loadCampaigns();
    }
}

export { initializeCampaignManagement, loadCampaigns };