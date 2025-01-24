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
            },
            debug: {
                renderCount: 0,
                lastUpdate: null
            }
        };
    },

    // Computed Properties
    computed: {
        filteredCampaigns() {
            console.log("Computing filtered campaigns with data:", this.campaigns);
            return this.campaigns.filter(campaign => {
                const matchesStatus = !this.filters.status || campaign.status === this.filters.status;
                const matchesSearch = !this.filters.search || 
                    campaign.name.toLowerCase().includes(this.filters.search.toLowerCase()) ||
                    campaign.brandName.toLowerCase().includes(this.filters.search.toLowerCase());
                return matchesStatus && matchesSearch;
            });
        },

        hasCampaigns() {
            return this.campaigns && this.campaigns.length > 0;
        }
    },

    // Watchers
    watch: {
        campaigns: {
            handler(newValue) {
                console.log("Campaigns data updated:", newValue);
                this.debug.lastUpdate = new Date().toISOString();
                this.debug.renderCount++;
            },
            deep: true
        }
    },

    // Lifecycle Hooks
    created() {
        console.log("Campaign component created");
    },

    mounted() {
        console.log("Campaign component mounted, initializing...");
        this.loadCampaigns();

        // Test reactive updates
        if (process.env.NODE_ENV === 'development') {
            this.testReactiveUpdates();
        }
    },

    updated() {
        console.log("Component updated, render count:", this.debug.renderCount);
    },

    // Methods
    methods: {
        formatDate(dateString) {
            if (!dateString) return 'N/A';
            try {
                return new Date(dateString).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            } catch (error) {
                console.error('Date formatting error:', error);
                return 'Invalid Date';
            }
        },

        getStatusBadgeClass(status) {
            const statusClasses = {
                active: 'success',
                inactive: 'secondary',
                draft: 'warning',
                upcoming: 'info'
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
                
                console.log('Raw campaign data:', data);
                
                if (data) {
                    // Transform and validate data
                    this.campaigns = Object.entries(data).map(([id, campaign]) => {
                        const validatedCampaign = this.validateCampaignData({id, ...campaign});
                        console.log('Validated campaign:', validatedCampaign);
                        return validatedCampaign;
                    });
                } else {
                    console.log('No campaigns found');
                    this.campaigns = [];
                }

                // Test data binding
                this.$nextTick(() => {
                    console.log('Campaigns bound to component:', this.campaigns);
                });
            } catch (error) {
                console.error('Error loading campaigns:', error);
                this.error = 'Failed to load campaigns: ' + error.message;
            } finally {
                this.loading = false;
            }
        },

        validateCampaignData(campaign) {
            // Ensure required fields have default values if missing
            return {
                id: campaign.id || Date.now().toString(),
                name: campaign.name || 'Untitled Campaign',
                brandName: campaign.brandName || 'Unknown Brand',
                storeName: campaign.storeName || 'All Stores',
                startDate: campaign.startDate || new Date().toISOString(),
                endDate: campaign.endDate || new Date().toISOString(),
                status: campaign.status || 'draft',
                minPurchaseAmount: campaign.minPurchaseAmount || 0,
                requiredItems: Array.isArray(campaign.requiredItems) ? campaign.requiredItems : []
            };
        },

        testReactiveUpdates() {
            console.log('Testing reactive updates...');
            setTimeout(() => {
                if (this.campaigns.length > 0) {
                    const testCampaign = {
                        name: "Test Campaign " + Date.now(),
                        startDate: "2024-02-01",
                        status: "upcoming"
                    };
                    this.campaigns.push(this.validateCampaignData(testCampaign));
                    console.log('Added test campaign, new length:', this.campaigns.length);
                }
            }, 2000);
        },

        showError(message) {
            console.error('Error:', message);
            Swal.fire({
                title: 'Error',
                text: message,
                icon: 'error',
                customClass: {
                    container: 'campaign-error-modal'
                }
            });
        }
    },

    template: `
        <div class="container-fluid campaign-management">
            <!-- Debug Info (Development Only) -->
            <div v-if="process.env.NODE_ENV === 'development'" 
                 class="debug-info alert alert-info mb-3">
                <small>
                    Render Count: {{ debug.renderCount }}<br>
                    Last Update: {{ debug.lastUpdate }}
                </small>
            </div>

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
                <i class="fas fa-exclamation-triangle"></i> {{ error }}
                <button @click="loadCampaigns" class="btn btn-sm btn-outline-danger float-end">
                    Retry
                </button>
            </div>

            <!-- Content Area -->
            <div v-if="!loading && !error" class="campaign-content">
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
                <div v-if="!hasCampaigns" class="alert alert-info">
                    <i class="fas fa-info-circle"></i> No campaigns found.
                </div>
                <div v-else class="row">
                    <div v-for="campaign in filteredCampaigns" 
                         :key="campaign.id" 
                         class="col-md-6 mb-4">
                        <div class="card campaign-card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <h5 class="mb-0">{{ campaign.name }}</h5>
                                <div class="btn-group">
                                    <button class="btn btn-sm btn-info" 
                                            @click="editCampaign(campaign)"
                                            title="Edit Campaign">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-danger" 
                                            @click="deleteCampaign(campaign.id)"
                                            title="Delete Campaign">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="card-body">
                                <p><strong>Brand:</strong> {{ campaign.brandName }}</p>
                                <p><strong>Store:</strong> {{ campaign.storeName || 'All Stores' }}</p>
                                <p><strong>Duration:</strong> 
                                    {{ formatDate(campaign.startDate) }} - {{ formatDate(campaign.endDate) }}
                                </p>
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