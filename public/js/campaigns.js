// Campaign Management Module
let app = null;

export function initializeCampaignManagement() {
    console.log('Initializing campaign management...');
    
    // Get root element
    const root = document.getElementById('campaignManagementRoot');
    if (!root) {
        console.error('Campaign management root element not found');
        return;
    }

    // Define the Vue component
    const CampaignManagement = {
        data() {
            return {
                campaigns: [],
                loading: false,
                error: null,
                filters: {
                    status: '',
                    search: ''
                },
                form: {
                    name: '',
                    brandName: '',
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
                return this.campaigns.filter(campaign => {
                    const matchesStatus = !this.filters.status || 
                        campaign.status === this.filters.status;
                    const matchesSearch = !this.filters.search || 
                        campaign.name.toLowerCase().includes(this.filters.search.toLowerCase()) ||
                        campaign.brandName.toLowerCase().includes(this.filters.search.toLowerCase());
                    return matchesStatus && matchesSearch;
                });
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
                    this.error = 'Failed to load campaigns';
                } finally {
                    this.loading = false;
                }
            },

            async saveCampaign() {
                try {
                    if (!this.validateForm()) return;

                    const campaignData = {
                        ...this.form,
                        createdAt: Date.now()
                    };

                    await firebase.database().ref('campaigns').push(campaignData);
                    await this.loadCampaigns();
                    this.resetForm();
                    this.showSuccess('Campaign saved successfully');
                } catch (error) {
                    console.error('Error saving campaign:', error);
                    this.showError('Failed to save campaign');
                }
            },

            validateForm() {
                if (!this.form.name || !this.form.brandName) {
                    this.showError('Campaign name and brand are required');
                    return false;
                }

                const startDate = new Date(this.form.startDate);
                const endDate = new Date(this.form.endDate);
                if (endDate < startDate) {
                    this.showError('End date must be after start date');
                    return false;
                }

                return true;
            },

            resetForm() {
                this.form = {
                    name: '',
                    brandName: '',
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

            showError(message) {
                Swal.fire('Error', message, 'error');
            },

            showSuccess(message) {
                Swal.fire('Success', message, 'success');
            }
        },

        mounted() {
            console.log('Campaign management component mounted');
            this.loadCampaigns();
        },

        template: `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2>Campaign Management</h2>
                    <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#campaignModal">
                        <i class="fas fa-plus"></i> Create Campaign
                    </button>
                </div>

                <!-- Loading State -->
                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary"></div>
                </div>

                <!-- Error State -->
                <div v-if="error" class="alert alert-danger">
                    {{ error }}
                </div>

                <!-- Content -->
                <div v-if="!loading && !error">
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
                            </select>
                        </div>
                    </div>

                    <!-- Campaigns List -->
                    <div class="row">
                        <div v-for="campaign in filteredCampaigns" 
                             :key="campaign.id" 
                             class="col-md-6 mb-4">
                            <div class="card">
                                <div class="card-header">
                                    <h5 class="mb-0">{{ campaign.name }}</h5>
                                </div>
                                <div class="card-body">
                                    <p><strong>Brand:</strong> {{ campaign.brandName }}</p>
                                    <p><strong>Start Date:</strong> {{ formatDate(campaign.startDate) }}</p>
                                    <p><strong>End Date:</strong> {{ formatDate(campaign.endDate) }}</p>
                                    <p><strong>Status:</strong> 
                                        <span :class="'badge badge-' + campaign.status">
                                            {{ campaign.status }}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Campaign Modal -->
                <div class="modal fade" id="campaignModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Create Campaign</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="saveCampaign">
                                    <div class="mb-3">
                                        <label class="form-label">Campaign Name</label>
                                        <input type="text" class="form-control" v-model="form.name" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Brand Name</label>
                                        <input type="text" class="form-control" v-model="form.brandName" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Start Date</label>
                                        <input type="date" class="form-control" v-model="form.startDate" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">End Date</label>
                                        <input type="date" class="form-control" v-model="form.endDate" required>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Minimum Purchase Amount</label>
                                        <input type="number" class="form-control" v-model="form.minPurchaseAmount">
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-primary" @click="saveCampaign">Save Campaign</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `
    };

    // Create and mount Vue app
    try {
        app = Vue.createApp(CampaignManagement);
        app.mount('#campaignManagementRoot');
        console.log('Campaign management initialized successfully');
    } catch (error) {
        console.error('Error initializing campaign management:', error);
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