const campaignManagement = {
    app: null,
    component: {
        data() {
            return {
                campaigns: {},
                loading: false,
                editingCampaign: null,
                campaignForm: {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: '',
                    endDate: '',
                    status: 'active',
                    minPurchaseAmount: null,
                    requiredItems: []
                },
                newItem: {
                    name: '',
                    quantity: 1
                }
            };
        },

        mounted() {
            this.loadCampaigns();
        },

        methods: {
            async loadCampaigns() {
                this.loading = true;
                try {
                    const snapshot = await firebase.database().ref('campaigns').once('value');
                    this.campaigns = snapshot.val() || {};
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                    this.showError('Failed to load campaigns');
                } finally {
                    this.loading = false;
                }
            },

            showCreateCampaignModal() {
                this.editingCampaign = null;
                this.resetForm();
                $('#campaignFormModal').modal('show');
            },

            resetForm() {
                this.campaignForm = {
                    name: '',
                    brandName: '',
                    storeName: '',
                    startDate: '',
                    endDate: '',
                    status: 'active',
                    minPurchaseAmount: null,
                    requiredItems: []
                };
                this.newItem = { name: '', quantity: 1 };
            },

            addRequiredItem() {
                if (!this.newItem.name.trim()) return;
                this.campaignForm.requiredItems.push({...this.newItem});
                this.newItem = { name: '', quantity: 1 };
            },

            removeRequiredItem(index) {
                this.campaignForm.requiredItems.splice(index, 1);
            },

            async saveCampaign() {
                try {
                    if (!this.validateForm()) return;

                    const campaignData = {
                        ...this.campaignForm,
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
                if (!this.campaignForm.name || !this.campaignForm.brandName) {
                    this.showError('Campaign name and brand are required');
                    return false;
                }

                const startDate = new Date(this.campaignForm.startDate);
                const endDate = new Date(this.campaignForm.endDate);

                if (endDate < startDate) {
                    this.showError('End date must be after start date');
                    return false;
                }

                return true;
            },

            handleView(key) {
                const campaign = this.campaigns[key];
                if (!campaign) return;

                Swal.fire({
                    title: campaign.name,
                    html: this.generateCampaignDetails(campaign),
                    width: 600
                });
            },

            generateCampaignDetails(campaign) {
                return `
                    <div class="text-left">
                        <p><strong>Brand:</strong> ${campaign.brandName}</p>
                        <p><strong>Store:</strong> ${campaign.storeName || 'All Stores'}</p>
                        <p><strong>Duration:</strong> ${this.formatDate(campaign.startDate)} - ${this.formatDate(campaign.endDate)}</p>
                        <p><strong>Status:</strong> ${campaign.status}</p>
                        ${campaign.minPurchaseAmount ? `<p><strong>Minimum Purchase:</strong> R${campaign.minPurchaseAmount}</p>` : ''}
                        ${this.generateRequiredItemsHtml(campaign.requiredItems)}
                    </div>
                `;
            },

            generateRequiredItemsHtml(items) {
                if (!items?.length) return '';
                return `
                    <p><strong>Required Items:</strong></p>
                    <ul>
                        ${items.map(item => `<li>${item.name} (Qty: ${item.quantity})</li>`).join('')}
                    </ul>
                `;
            },

            handleEdit(key) {
                const campaign = this.campaigns[key];
                if (!campaign) return;

                this.editingCampaign = key;
                this.campaignForm = {...campaign};
                $('#campaignFormModal').modal('show');
            },

            async handleDelete(key) {
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
                        await firebase.database().ref(`campaigns/${key}`).remove();
                        await this.loadCampaigns();
                        this.showSuccess('Campaign deleted successfully');
                    } catch (error) {
                        console.error('Error deleting campaign:', error);
                        this.showError('Failed to delete campaign');
                    }
                }
            },

            formatDate(date) {
                return new Date(date).toLocaleDateString();
            },

            showError(message) {
                Swal.fire('Error', message, 'error');
            },

            showSuccess(message) {
                Swal.fire('Success', message, 'success');
            }
        },

        template: `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2>Campaign Management</h2>
                    <button class="btn btn-primary" @click="showCreateCampaignModal">
                        <i class="fas fa-plus"></i> Create Campaign
                    </button>
                </div>

                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary"></div>
                </div>

                <div v-else class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Campaign Name</th>
                                <th>Brand</th>
                                <th>Store</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(campaign, key) in campaigns" :key="key">
                                <td>{{ campaign.name }}</td>
                                <td>{{ campaign.brandName }}</td>
                                <td>{{ campaign.storeName || 'All Stores' }}</td>
                                <td>{{ formatDate(campaign.startDate) }}</td>
                                <td>{{ formatDate(campaign.endDate) }}</td>
                                <td>
                                    <span :class="'badge badge-' + (campaign.status === 'active' ? 'success' : 'secondary')">
                                        {{ campaign.status }}
                                    </span>
                                </td>
                                <td>
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-info" @click="handleView(key)">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-warning" @click="handleEdit(key)">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-danger" @click="handleDelete(key)">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Campaign Form Modal -->
                <div class="modal fade" id="campaignFormModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ editingCampaign ? 'Edit' : 'Create' }} Campaign</h5>
                                <button type="button" class="close" data-dismiss="modal">×</button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="saveCampaign">
                                    <div class="form-group">
                                        <label>Campaign Name</label>
                                        <input type="text" class="form-control" v-model="campaignForm.name" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Brand Name</label>
                                        <input type="text" class="form-control" v-model="campaignForm.brandName" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Store (Optional)</label>
                                        <input type="text" class="form-control" v-model="campaignForm.storeName">
                                    </div>
                                    <div class="form-group">
                                        <label>Start Date</label>
                                        <input type="date" class="form-control" v-model="campaignForm.startDate" required>
                                    </div>
                                    <div class="form-group">
                                        <label>End Date</label>
                                        <input type="date" class="form-control" v-model="campaignForm.endDate" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Minimum Purchase Amount</label>
                                        <input type="number" class="form-control" v-model="campaignForm.minPurchaseAmount">
                                    </div>
                                    <div class="form-group">
                                        <label>Status</label>
                                        <select class="form-control" v-model="campaignForm.status">
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label>Required Items</label>
                                        <div class="input-group mb-2">
                                            <input type="text" class="form-control" v-model="newItem.name" 
                                                   placeholder="Item name">
                                            <input type="number" class="form-control" v-model="newItem.quantity" 
                                                   min="1" style="max-width: 100px;">
                                            <div class="input-group-append">
                                                <button type="button" class="btn btn-success" @click="addRequiredItem">
                                                    <i class="fas fa-plus"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <div v-if="campaignForm.requiredItems.length" class="list-group">
                                            <div v-for="(item, index) in campaignForm.requiredItems" 
                                                 :key="index" 
                                                 class="list-group-item d-flex justify-content-between align-items-center">
                                                {{ item.name }} (Qty: {{ item.quantity }})
                                                <button type="button" class="btn btn-sm btn-danger" 
                                                        @click="removeRequiredItem(index)">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-primary" @click="saveCampaign">Save Campaign</button>
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
        console.error('FATAL: Campaign management root element not found');
        return null;
    }

    try {
        const app = Vue.createApp({
            template: `
                <div>
                    <div v-if="loading">Loading...</div>
                    <div v-else>
                        Campaigns Loaded: {{ Object.keys(campaigns).length }}
                    </div>
                </div>
            `,
            data() {
                return {
                    campaigns: {},
                    loading: false
                }
            },
            methods: {
                async loadCampaigns() {
                    this.loading = true;
                    try {
                        const snapshot = await firebase.database().ref('campaigns').once('value');
                        this.campaigns = snapshot.val() || {};
                        console.log('Campaigns loaded:', Object.keys(this.campaigns).length);
                    } catch (error) {
                        console.error('Campaign load error:', error);
                    } finally {
                        this.loading = false;
                    }
                }
            },
            mounted() {
                console.log('Campaign management component mounted');
                this.loadCampaigns();
            }
        });

        const instance = app.mount('#campaignManagementRoot');
        console.log('Campaign management instance:', instance);
        
        // Attach instance to the root element for easier access
        root.__vue_instance__ = instance;
        
        return instance;
    } catch (error) {
        console.error('Campaign management initialization FAILED:', error);
        return null;
    }
}

export function loadCampaigns() {
    const root = document.getElementById('campaignManagementRoot');
    if (!root) {
        console.error('Campaign management root element not found');
        return;
    }

    // Try multiple ways to access the Vue instance
    const vueInstance = 
        root.__vue_instance__ || 
        root.__vue_app__ || 
        document.querySelector('#campaignManagementRoot')?.__vue_instance__;

    if (!vueInstance) {
        console.error('CRITICAL: Cannot find Vue instance by any method');
        return;
    }

    try {
        // Different strategies to call loadCampaigns
        if (typeof vueInstance.loadCampaigns === 'function') {
            vueInstance.loadCampaigns();
        } else if (vueInstance.$refs && typeof vueInstance.$refs.loadCampaigns === 'function') {
            vueInstance.$refs.loadCampaigns();
        } else if (vueInstance._instance?.proxy?.loadCampaigns) {
            vueInstance._instance.proxy.loadCampaigns();
        } else {
            console.error('NO METHOD FOUND to call loadCampaigns');
        }
    } catch (error) {
        console.error('Error calling loadCampaigns:', error);
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