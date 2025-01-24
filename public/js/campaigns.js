// campaigns.js - Enhanced with debugging
const campaignManagement = {
    app: null,
    component: {
        data() {
            return {
                campaigns: {},
                loading: false,
                editingCampaign: null,
                error: null,
                displayDebug: true // Debug flag
            };
        },
        methods: {
            async loadCampaigns() {
                console.group('Campaign Loading Process');
                this.loading = true;
                
                try {
                    console.log('Fetching campaigns from Firebase...');
                    const snapshot = await firebase.database().ref('campaigns').once('value');
                    const campaignData = snapshot.val();
                    console.log('Raw campaign data:', campaignData);

                    if (!campaignData) {
                        console.warn('No campaign data returned from Firebase');
                        this.campaigns = {};
                        return;
                    }

                    // Validate campaign data structure
                    const validatedCampaigns = {};
                    Object.entries(campaignData).forEach(([id, campaign]) => {
                        if (this.validateCampaignFields(campaign)) {
                            validatedCampaigns[id] = campaign;
                            console.log(`Campaign validated: ${campaign.name}`);
                        } else {
                            console.warn(`Invalid campaign data:`, campaign);
                        }
                    });

                    this.campaigns = validatedCampaigns;
                    console.log('Processed campaigns:', this.campaigns);
                    
                    // Verify DOM update
                    this.$nextTick(() => {
                        console.log('DOM updated with campaigns:', 
                            document.querySelector('.campaigns-list')?.children.length);
                    });

                } catch (error) {
                    console.error('Campaign loading error:', error);
                    this.error = `Failed to load campaigns: ${error.message}`;
                } finally {
                    this.loading = false;
                    console.groupEnd();
                }
            },

            validateCampaignFields(campaign) {
                const requiredFields = ['name', 'startDate', 'endDate', 'status'];
                return requiredFields.every(field => {
                    const hasField = campaign.hasOwnProperty(field) && campaign[field] !== null;
                    if (!hasField) {
                        console.warn(`Missing required field: ${field}`);
                    }
                    return hasField;
                });
            }
        },
        mounted() {
            console.log('Campaign component mounting...');
            this.loadCampaigns();
        },
        template: `
            <div class="campaign-container" style="display: block !important;">
                <div v-if="displayDebug" class="debug-info">
                    <p>Loading: {{ loading }}</p>
                    <p>Campaign Count: {{ Object.keys(campaigns).length }}</p>
                    <p>Error: {{ error }}</p>
                </div>
                
                <div v-if="loading" class="loading-spinner">
                    Loading campaigns...
                </div>
                
                <div v-else-if="error" class="error-message alert alert-danger">
                    {{ error }}
                </div>
                
                <div v-else class="campaigns-list">
                    <template v-if="Object.keys(campaigns).length === 0">
                        <div class="alert alert-info">
                            No campaigns found. Please add a campaign.
                        </div>
                    </template>
                    
                    <div v-else v-for="(campaign, id) in campaigns" 
                         :key="id" 
                         class="campaign-card"
                         :data-campaign-id="id">
                        <h3>{{ campaign.name }}</h3>
                        <p>{{ campaign.description || 'No description available' }}</p>
                        <div class="campaign-metadata">
                            <span class="badge" 
                                  :class="{'badge-success': campaign.status === 'active',
                                          'badge-secondary': campaign.status !== 'active'}">
                                {{ campaign.status }}
                            </span>
                            <span>{{ new Date(campaign.startDate).toLocaleDateString() }} - 
                                  {{ new Date(campaign.endDate).toLocaleDateString() }}</span>
                        </div>
                    </div>
                </div>
            </div>
        `
    }
};

export function initializeCampaignManagement() {
    console.group('Campaign Management Initialization');
    
    const root = document.getElementById('campaignManagementRoot');
    if (!root) {
        console.error('Campaign management root element missing');
        console.groupEnd();
        return null;
    }

    try {
        console.log('Creating Vue app...');
        const app = Vue.createApp(campaignManagement.component);
        
        console.log('Mounting Vue app...');
        const instance = app.mount('#campaignManagementRoot');
        
        // Store reference for debugging
        window.__campaignApp = instance;
        
        console.log('Campaign management initialized successfully');
        return instance;
    } catch (error) {
        console.error('Campaign management initialization failed:', error);
        return null;
    } finally {
        console.groupEnd();
    }
}

// Add CSS to ensure visibility
const style = document.createElement('style');
style.textContent = `
    .campaign-container {
        display: block !important;
        visibility: visible !important;
        min-height: 200px;
        padding: 20px;
    }
    
    .debug-info {
        background: #f8f9fa;
        padding: 10px;
        margin-bottom: 15px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
    }
    
    .campaign-card {
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 15px;
        margin-bottom: 15px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
`;
document.head.appendChild(style);