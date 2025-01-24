// Campaign Management Vue Component
const campaignManagement = {
    // Component State
    data() {
        return {
            campaigns: [],
            loading: false,
            error: null,
            editingCampaign: null,
            filters: {
                status: '',
                search: ''
            },
            formData: {
                name: '',
                brandName: '',
                storeName: '',
                startDate: '',
                endDate: '',
                status: 'active',
                minPurchaseAmount: null,
                requiredItems: []
            }
        };
    },

    // Computed Properties
    computed: {
        filteredCampaigns() {
            return this.campaigns.filter(campaign => {
                const matchesStatus = !this.filters.status || campaign.status === this.filters.status;
                const matchesSearch = !this.filters.search || 
                    campaign.name.toLowerCase().includes(this.filters.search.toLowerCase()) ||
                    campaign.brandName.toLowerCase().includes(this.filters.search.toLowerCase());
                return matchesStatus && matchesSearch;
            });
        }
    },

    // Lifecycle Hooks
    mounted() {
        console.log('Campaign component mounted');
        this.loadCampaigns();
    },

    // Methods
    methods: {
        formatDate(dateString) {
            if (!dateString) return 'N/A';
            return new Date(dateString).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        },

        getStatusBadgeClass(status) {
            const statusClasses = {
                active: 'success',
                inactive: 'secondary',
                draft: 'warning'
            };
            return statusClasses[status] || 'secondary';
        },

        async loadCampaigns() {
            console.log('Loading campaigns...');
            this.loading = true;
            this.error = null;

            try {
                const snapshot = await firebase.database().ref('campaigns').once('value');
                const data = snapshot.val();
                
                if (data) {
                    this.campaigns = Object.entries(data).map(([id, campaign]) => ({
                        id,
                        ...campaign
                    }));
                    console.log('Campaigns loaded:', this.campaigns.length);
                } else {
                    console.log('No campaigns found');
                    this.campaigns = [];
                }
            } catch (error) {
                console.error('Error loading campaigns:', error);
                this.error = 'Failed to load campaigns';
            } finally {
                this.loading = false;
            }
        },

        showCreateCampaignModal() {
            this.editingCampaign = null;
            this.resetForm();
            this.$nextTick(() => {
                $('#campaignFormModal').modal('show');
            });
        },

        resetForm() {
            this.formData = {
                name: '',
                brandName: '',
                storeName: '',
                startDate: '',
                endDate: '',
                status: 'active',
                minPurchaseAmount: null,
                requiredItems: []
            };
        },

        async saveCampaign() {
            try {
                if (!this.validateForm()) return;

                const campaignData = {
                    ...this.formData,
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

        async deleteCampaign(campaignId) {
            try {
                const result = await Swal.fire({
                    title: 'Delete Campaign?',
                    text: 'This action cannot be undone.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#dc3545',
                    confirmButtonText: 'Yes, delete it!'
                });

                if (result.isConfirmed) {
                    await firebase.database().ref(`campaigns/${campaignId}`).remove();
                    await this.loadCampaigns();
                    this.showSuccess('Campaign deleted successfully');
                }
            } catch (error) {
                console.error('Error deleting campaign:', error);
                this.showError('Failed to delete campaign');
            }
        },

        showError(message) {
            Swal.fire('Error', message, 'error');
        },

        showSuccess(message) {
            Swal.fire('Success', message, 'success');
        }
    },

    // Template
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
                <div class="spinner-border text-primary" role="status">
                    <span class="sr-only">Loading...</span>
                </div>
            </div>

            <!-- Error State -->
            <div v-if="error" class="alert alert-danger" role="alert">
                {{ error }}
            </div>

            <!-- Filters -->
            <div class="row mb-4">
                <div class="col-md-6">
                    <input 
                        type="text" 
                        v-model="filters.search" 
                        class="form-control" 
                        placeholder="Search campaigns..."
                    >
                </div>
                <div class="col-md-6">
                    <select v-model="filters.status" class="form-control">
                        <option value="">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="draft">Draft</option>
                    </select>
                </div>
            </div>

            <!-- Campaigns List -->
            <div v-if="!loading && !error">
                <div v-if="filteredCampaigns.length === 0" class="alert alert-info">
                    No campaigns found.
                </div>
                <div v-else class="row">
                    <div v-for="campaign in filteredCampaigns" 
                         :key="campaign.id" 
                         class="col-md-6 mb-4">
                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <h5 class="mb-0">{{ campaign.name }}</h5>
                                <div class="btn-group">
                                    <button class="btn btn-sm btn-info" @click="editCampaign(campaign)">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-danger" @click="deleteCampaign(campaign.id)">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="card-body">
                                <p><strong>Brand:</strong> {{ campaign.brandName }}</p>
                                <p><strong>Store:</strong> {{ campaign.storeName || 'All Stores' }}</p>
                                <p><strong>Duration:</strong> {{ formatDate(campaign.startDate) }} - {{ formatDate(campaign.endDate) }}</p>
                                <p><strong>Status:</strong> 
                                    <span :class="'badge badge-' + getStatusBadgeClass(campaign.status)">
                                        {{ campaign.status }}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};

// Initialize campaign management
export function initializeCampaignManagement() {
    console.log('Initializing campaign management...');
    
    const root = document.getElementById('campaignManagementRoot');
    if (!root) {
        console.error('Campaign management root element not found');
        return null;
    }

    try {
        const app = Vue.createApp(campaignManagement);
        const instance = app.mount('#campaignManagementRoot');
        console.log('Campaign management initialized successfully');
        return instance;
    } catch (error) {
        console.error('Error initializing campaign management:', error);
        return null;
    }
}

// Export the component
export {
    campaignManagement
};