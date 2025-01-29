// Initialize Campaign Manager as a global object
(function(Vue) {
    // CampaignManager Component Definition
    const CampaignManager = {
        data() {
            return {
                campaigns: [],
                loading: false,
                error: null,
                filters: {
                    status: null,
                    brandName: null,
                    dateRange: null
                }
            }
        },

        template: `
            <div class="campaign-management">
                <div class="header">
                    <h2>Campaign Management</h2>
                    <div class="controls">
                        <input type="text" class="form-control search-box" 
                               v-model="filters.brandName" 
                               placeholder="Search campaigns...">
                        <button class="btn btn-primary" @click="showAddCampaignModal">
                            <i class="fas fa-plus"></i> New Campaign
                        </button>
                    </div>
                </div>
                
                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary"></div>
                </div>
                
                <div v-else class="campaign-list">
                    <!-- Campaign list will go here -->
                </div>
            </div>
        `,

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
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                    this.error = 'Failed to load campaigns';
                } finally {
                    this.loading = false;
                }
            },

            showAddCampaignModal() {
                // Implementation for showing add campaign modal
                console.log('Show add campaign modal');
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
        },

        // Add other methods that might be needed by existing code
        createCampaign: async function(campaignData) {
            console.log('Creating campaign:', campaignData);
            // Implementation
        },

        updateCampaign: async function(campaignId, updateData) {
            console.log('Updating campaign:', campaignId, updateData);
            // Implementation
        },

        deleteCampaign: async function(campaignId) {
            console.log('Deleting campaign:', campaignId);
            // Implementation
        }
    };

})(Vue); // Pass Vue as a dependency