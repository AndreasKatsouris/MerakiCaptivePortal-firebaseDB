(function(Vue) {
    // CampaignManager Component Definition
    const CampaignManager = {
        data() {
            return {
                campaigns: [],
                loading: false,
                error: null,
                filters: {
                    status: '',
                    brandName: '',
                    dateRange: null
                }
            }
        },

        template: `
            <div class="campaign-management">
                <div class="header d-flex justify-content-between align-items-center mb-4">
                    <h2>Campaign Management</h2>
                    <div class="controls d-flex gap-2">
                        <input 
                            type="text" 
                            class="form-control" 
                            v-model="filters.brandName" 
                            placeholder="Search campaigns...">
                        <select 
                            class="form-select" 
                            v-model="filters.status">
                            <option value="">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="draft">Draft</option>
                        </select>
                        <button 
                            class="btn btn-primary"
                            @click="showAddCampaignModal">
                            <i class="fas fa-plus"></i> New Campaign
                        </button>
                    </div>
                </div>

                <!-- Loading State -->
                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary"></div>
                    <p class="mt-2">Loading campaigns...</p>
                </div>

                <!-- Error State -->
                <div v-else-if="error" class="alert alert-danger">
                    {{ error }}
                </div>

                <!-- Campaign List -->
                <div v-else class="campaign-list">
                    <div v-if="filteredCampaigns.length === 0" class="alert alert-info">
                        No campaigns found. Click "New Campaign" to create one.
                    </div>
                    <div v-else class="row">
                        <div v-for="campaign in filteredCampaigns" 
                             :key="campaign.id"
                             class="col-md-6 col-lg-4 mb-4">
                            <div class="card h-100">
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <h5 class="mb-0">{{ campaign.name }}</h5>
                                    <span :class="getStatusBadgeClass(campaign.status)">
                                        {{ campaign.status }}
                                    </span>
                                </div>
                                <div class="card-body">
                                    <p><strong>Brand:</strong> {{ campaign.brandName }}</p>
                                    <p><strong>Store:</strong> {{ campaign.storeName || 'All Stores' }}</p>
                                    <p><strong>Duration:</strong> {{ formatDate(campaign.startDate) }} - {{ formatDate(campaign.endDate) }}</p>
                                    <p v-if="campaign.minPurchaseAmount">
                                        <strong>Min. Purchase:</strong> R{{ campaign.minPurchaseAmount }}
                                    </p>
                                </div>
                                <div class="card-footer">
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-info" @click="viewCampaign(campaign)">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-warning" @click="editCampaign(campaign)">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-danger" @click="deleteCampaign(campaign)">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,

        computed: {
            filteredCampaigns() {
                return this.campaigns.filter(campaign => {
                    const matchesStatus = !this.filters.status || 
                                        campaign.status === this.filters.status;
                    const matchesBrand = !this.filters.brandName || 
                                       campaign.brandName.toLowerCase().includes(this.filters.brandName.toLowerCase());
                    return matchesStatus && matchesBrand;
                });
            }
        },

        methods: {
            async loadCampaigns() {
                this.loading = true;
                try {
                    const snapshot = await firebase.database().ref('campaigns').once('value');
                    const campaigns = snapshot.val();
                    this.campaigns = campaigns ? Object.entries(campaigns).map(([id, data]) => ({
                        id,
                        ...data
                    })) : [];
                    console.log('Loaded campaigns:', this.campaigns);
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                    this.error = 'Failed to load campaigns';
                } finally {
                    this.loading = false;
                }
            },

            formatDate(date) {
                if (!date) return 'N/A';
                return new Date(date).toLocaleDateString();
            },

            getStatusBadgeClass(status) {
                const classes = {
                    active: 'badge bg-success',
                    inactive: 'badge bg-secondary',
                    draft: 'badge bg-warning',
                    default: 'badge bg-secondary'
                };
                return classes[status] || classes.default;
            },

            async showAddCampaignModal() {
                Swal.fire({
                    title: 'Create New Campaign',
                    html: `
                        <input id="campaignName" class="swal2-input" placeholder="Campaign Name">
                        <input id="brandName" class="swal2-input" placeholder="Brand Name">
                        <input id="storeName" class="swal2-input" placeholder="Store Name (optional)">
                        <input id="minPurchase" class="swal2-input" type="number" placeholder="Minimum Purchase Amount">
                        <input id="startDate" class="swal2-input" type="date">
                        <input id="endDate" class="swal2-input" type="date">
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'Create',
                    preConfirm: () => ({
                        name: document.getElementById('campaignName').value,
                        brandName: document.getElementById('brandName').value,
                        storeName: document.getElementById('storeName').value,
                        minPurchaseAmount: parseFloat(document.getElementById('minPurchase').value),
                        startDate: document.getElementById('startDate').value,
                        endDate: document.getElementById('endDate').value,
                        status: 'active'
                    })
                }).then((result) => {
                    if (result.isConfirmed) {
                        this.createCampaign(result.value);
                    }
                });
            },

            async createCampaign(campaignData) {
                try {
                    const campaignRef = firebase.database().ref('campaigns').push();
                    await campaignRef.set({
                        ...campaignData,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    });
                    await this.loadCampaigns();
                    Swal.fire('Success', 'Campaign created successfully', 'success');
                } catch (error) {
                    console.error('Error creating campaign:', error);
                    Swal.fire('Error', 'Failed to create campaign', 'error');
                }
            },

            viewCampaign(campaign) {
                Swal.fire({
                    title: campaign.name,
                    html: `
                        <div class="text-left">
                            <p><strong>Brand:</strong> ${campaign.brandName}</p>
                            <p><strong>Store:</strong> ${campaign.storeName || 'All Stores'}</p>
                            <p><strong>Duration:</strong> ${this.formatDate(campaign.startDate)} - ${this.formatDate(campaign.endDate)}</p>
                            <p><strong>Minimum Purchase:</strong> R${campaign.minPurchaseAmount || 0}</p>
                            <p><strong>Status:</strong> ${campaign.status}</p>
                            <p><strong>Created:</strong> ${this.formatDate(campaign.createdAt)}</p>
                        </div>
                    `,
                    width: '600px'
                });
            },

            editCampaign(campaign) {
                // Implementation for edit campaign
                console.log('Edit campaign:', campaign);
            },

            async deleteCampaign(campaign) {
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
                        await firebase.database().ref(`campaigns/${campaign.id}`).remove();
                        await this.loadCampaigns();
                        Swal.fire('Deleted!', 'Campaign has been deleted.', 'success');
                    } catch (error) {
                        console.error('Error deleting campaign:', error);
                        Swal.fire('Error', 'Failed to delete campaign', 'error');
                    }
                }
            }
        },

        mounted() {
            console.log('CampaignManager component mounted');
            this.loadCampaigns();
        }
    };

    // Initialize function that can be called from the vanilla JS world
    window.CampaignManager = {
        init: function(containerId) {
            console.log('Initializing Campaign Manager on:', containerId);
            const app = Vue.createApp(CampaignManager);
            app.mount(`#${containerId}`);
            return app;
        }
    };

})(Vue);