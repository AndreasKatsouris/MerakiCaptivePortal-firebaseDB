const campaignManagement = {
    app: null,
    component: {
        data() {
            return {
                campaigns: {},
                loading: false,
                error: null
            };
        },
        methods: {
            async loadCampaigns() {
                console.log('Starting campaign load');
                this.loading = true;
                try {
                    const snapshot = await firebase.database().ref('campaigns').once('value');
                    this.campaigns = snapshot.val() || {};
                    console.log('Loaded campaigns:', this.campaigns);
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                    this.error = error.message;
                } finally {
                    this.loading = false;
                }
            }
        },
        mounted() {
            console.log('Campaign component mounted');
            this.loadCampaigns();
        },
        template: `
            <div class="campaign-container">
                <div v-if="loading" class="loading-spinner">Loading...</div>
                <div v-else-if="error" class="error-message">{{ error }}</div>
                <div v-else>
                    <div v-if="Object.keys(campaigns).length === 0" class="no-data">
                        No campaigns found
                    </div>
                    <div v-else class="campaigns-list">
                        <div v-for="(campaign, id) in campaigns" :key="id" class="campaign-card">
                            <h3>{{ campaign.name }}</h3>
                            <p>{{ campaign.description }}</p>
                            <div class="campaign-status">
                                Status: {{ campaign.status }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `
    }
};


window.addEventListener('error', (event) => {
    console.error('Campaign Management Global Error:', {
        message: event.error?.message,
        filename: event.filename,
        lineno: event.lineno
    });
});

firebase.database().ref('.info/connected').on('value', (snapshot) => {
    const connected = snapshot.val();
    console.log(`Firebase Connection Status: ${connected ? 'Connected' : 'Disconnected'}`);
});
async function testFirebaseConnection() {
    try {
        const snapshot = await firebase.database().ref('campaigns').once('value');
        console.log('Campaign Data Test:', snapshot.val());
    } catch (error) {
        console.error('Firebase Connection Test Failed:', error);
    }
}

// Call during initialization
testFirebaseConnection();

export function initializeCampaignManagement() {
    console.log('Initializing campaign management');
    
    const root = document.getElementById('campaignManagementRoot');
    if (!root) {
        console.error('CRITICAL: Campaign management root element not found');
        return null;
    }

    try {
        const app = Vue.createApp({
            data() {
                return {
                    campaigns: {},
                    loading: false,
                    error: null
                };
            },
            methods: {
                async loadCampaigns() {
                    console.log('Starting campaign load');
                    this.loading = true;
                    this.error = null;
                    
                    try {
                        const snapshot = await firebase.database().ref('campaigns').once('value');
                        const campaignData = snapshot.val();
                        console.log('Raw campaign data:', campaignData);
                        
                        if (campaignData) {
                            this.campaigns = campaignData;
                            console.log('Processed campaigns:', this.campaigns);
                        } else {
                            console.warn('No campaign data found');
                        }
                    } catch (error) {
                        console.error('Campaign load error:', error);
                        this.error = error.message;
                    } finally {
                        this.loading = false;
                    }
                }
            },
            mounted() {
                console.log('Campaign management component mounted');
                this.loadCampaigns();
            },
            template: `
                <div class="campaign-container">
                    <div v-if="loading" class="loading-spinner">Loading...</div>
                    <div v-else-if="error" class="error-message">{{ error }}</div>
                    <div v-else>
                        <div v-if="Object.keys(campaigns).length === 0" class="no-data">
                            No campaigns found
                        </div>
                        <div v-else class="campaigns-list">
                            <div v-for="(campaign, id) in campaigns" :key="id" class="campaign-card">
                                <h3>{{ campaign.name }}</h3>
                                <p>{{ campaign.description }}</p>
                                <div class="campaign-status">
                                    Status: {{ campaign.status }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `
        });

        const instance = app.mount('#campaignManagementRoot');
        console.log('Campaign management instance:', instance);
        
        // Store instance for debugging
        root.__vue_instance__ = instance;
        
        return instance;
    } catch (error) {
        console.error('Campaign management initialization FAILED:', error);
        return null;
    }
}

// Enhanced loadCampaigns with improved error handling
export function loadCampaigns() {
    console.log('Triggering campaign load');
    const root = document.getElementById('campaignManagementRoot');
    
    if (!root) {
        console.error('Campaign management root element not found');
        return;
    }

    const vueInstance = root.__vue_instance__;
    if (!vueInstance) {
        console.error('Vue instance not found');
        return;
    }

    try {
        vueInstance.loadCampaigns();
    } catch (error) {
        console.error('Error loading campaigns:', error);
    }
}
// Comprehensive Campaign Management Diagnostic Script
const CampaignDiagnostic = {
    // Comprehensive Firebase Connection Test
    async testFirebaseConnection() {
        console.group('🔍 Firebase Connection Diagnostic');
        try {
            // Check Firebase initialization
            if (!firebase.apps.length) {
                console.error('❌ Firebase Not Initialized');
                return false;
            }

            // Test database connectivity
            const startTime = Date.now();
            const snapshot = await firebase.database().ref('.info/connected').once('value');
            const connectionStatus = snapshot.val();
            const responseTime = Date.now() - startTime;

            console.log('✅ Firebase Connection Status:', connectionStatus);
            console.log('⏱️ Response Time:', `${responseTime}ms`);

            // Detailed connection diagnostics
            const connectionDetails = {
                status: connectionStatus,
                responseTime: responseTime,
                timestamp: new Date().toISOString()
            };
            console.table(connectionDetails);

            return connectionStatus;
        } catch (error) {
            console.error('❌ Firebase Connection Error:', error);
            return false;
        } finally {
            console.groupEnd();
        }
    },

    // Comprehensive Campaign Data Retrieval Diagnostic
    async diagnosticCampaignRetrieval() {
        console.group('🕵️ Campaign Data Diagnostic');
        try {
            const snapshot = await firebase.database().ref('campaigns').once('value');
            const campaigns = snapshot.val();

            console.log('📊 Raw Campaign Data:', campaigns);

            if (!campaigns) {
                console.warn('⚠️ No campaigns found in database');
                return null;
            }

            // Detailed campaign data analysis
            const campaignAnalysis = {
                totalCampaigns: Object.keys(campaigns).length,
                activeCampaigns: Object.values(campaigns).filter(c => c.status === 'active').length,
                inactiveCampaigns: Object.values(campaigns).filter(c => c.status !== 'active').length,
                dataIntegrity: this.validateCampaignData(campaigns)
            };

            console.log('🔍 Campaign Data Analysis:');
            console.table(campaignAnalysis);

            return campaigns;
        } catch (error) {
            console.error('❌ Campaign Retrieval Error:', error);
            return null;
        } finally {
            console.groupEnd();
        }
    },

    // Campaign Data Validation
    validateCampaignData(campaigns) {
        const validationResults = {
            missingFields: 0,
            invalidDates: 0,
            invalidStatus: 0
        };

        Object.values(campaigns).forEach(campaign => {
            // Check for required fields
            const requiredFields = ['name', 'brandName', 'startDate', 'endDate', 'status'];
            requiredFields.forEach(field => {
                if (!campaign[field]) validationResults.missingFields++;
            });

            // Validate dates
            const startDate = new Date(campaign.startDate);
            const endDate = new Date(campaign.endDate);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                validationResults.invalidDates++;
            }

            // Validate status
            const validStatuses = ['active', 'inactive', 'pending'];
            if (!validStatuses.includes(campaign.status)) {
                validationResults.invalidStatus++;
            }
        });

        return validationResults;
    },

    // UI Rendering Diagnostic
    diagnosticUIRendering() {
        console.group('🖥️ UI Rendering Diagnostic');
        
        // Check critical DOM elements
        const criticalElements = [
            '#campaignManagementContent',
            '#campaignManagementRoot'
        ];

        const elementDiagnostics = criticalElements.map(selector => {
            const element = document.querySelector(selector);
            return {
                selector,
                exists: !!element,
                visible: element ? window.getComputedStyle(element).display !== 'none' : false,
                children: element ? element.children.length : 0
            };
        });

        console.table(elementDiagnostics);

        // Vue component diagnostic
        const vueApp = document.querySelector('#campaignManagementRoot')?.__vue_app__;
        console.log('Vue App Status:', vueApp ? '✅ Mounted' : '❌ Not Mounted');

        console.groupEnd();
    },

    // Comprehensive Diagnostic Runner
    async runFullDiagnostic() {
        console.group('🚀 Full Campaign Management Diagnostic');
        
        console.log('🕒 Diagnostic Started:', new Date().toLocaleString());

        // Run diagnostics sequentially
        const firebaseConnected = await this.testFirebaseConnection();
        if (!firebaseConnected) {
            console.error('❌ Cannot proceed with further diagnostics');
            return;
        }

        const campaignData = await this.diagnosticCampaignRetrieval();
        this.diagnosticUIRendering();

        console.log('🏁 Diagnostic Complete');
        console.groupEnd();

        return {
            firebaseConnected,
            campaignData
        };
    }
};

// Immediate Diagnostic Trigger
document.addEventListener('DOMContentLoaded', () => {
    window.CampaignDiagnostic = CampaignDiagnostic;
    CampaignDiagnostic.runFullDiagnostic();
});