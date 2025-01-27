// Campaign Management Module

export function initializeCampaignManagement() {
    const app = Vue.createApp({
        data() {
            return {
                campaigns: [],
                loading: false,
                showModal: false,
                modalMode: '', // 'view' or 'edit'
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
                console.log('Opening add modal');
                this.currentCampaign = null;
                this.modalMode = 'add';
                this.resetForm();
                // Set default values for new campaign
                this.formData = {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: new Date().toISOString().split('T')[0], // Today's date
                    endDate: '', 
                    status: 'active',
                    minPurchaseAmount: 0,
                    requiredItems: []
                };
                this.showModal = true;

                // Ensure form is editable
                this.$nextTick(() => {
                    const formInputs = document.querySelectorAll('.modal-body input, .modal-body select');
                    formInputs.forEach(input => {
                        input.removeAttribute('readonly');
                        input.removeAttribute('disabled');
                    });
                });
            },

            closeModal() {
                console.log('Closing modal');
                this.showModal = false;
                this.modalMode = '';
                this.$nextTick(() => {
                    const formInputs = document.querySelectorAll('.modal-body input, .modal-body select');
                    formInputs.forEach(input => input.removeAttribute('readonly'));
                });
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

            viewCampaign(campaign) {
                console.log('View campaign:', campaign);
                this.currentCampaign = campaign;
                this.formData = { ...campaign };
                this.showModal = true;
                // Set form to readonly for view mode
                this.$nextTick(() => {
                    const formInputs = document.querySelectorAll('.modal-body input, .modal-body select');
                    formInputs.forEach(input => input.setAttribute('readonly', true));
                });
            },

            editCampaign(campaign) {
                console.log('Edit campaign:', campaign);
                this.currentCampaign = campaign;
                this.formData = { ...campaign };
                this.showModal = true;
                // Ensure form is editable
                this.$nextTick(() => {
                    const formInputs = document.querySelectorAll('.modal-body input, .modal-body select');
                    formInputs.forEach(input => input.removeAttribute('readonly'));
                });
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
                <!-- Button Bar -->
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

                <!-- Campaign Modal -->
                <div class="modal fade" v-if="showModal" tabindex="-1" role="dialog">
                    <div class="modal-dialog" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">
                                    {{ modalMode === 'view' ? 'View Campaign' : 
                                       modalMode === 'add' ? 'Add New Campaign' :
                                       'Edit Campaign' }}
                                </h5>
                                <button type="button" class="close" @click="closeModal">
                                    <span>&times;</span>
                                </button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="saveCampaign">
                                    <!-- Form fields -->
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
    } catch (error) {
        console.error('Error mounting campaign management:', error);
    }
}

export function loadCampaigns() {
    if (app && app._instance) {
        app._instance.proxy.loadCampaigns();
    }
}