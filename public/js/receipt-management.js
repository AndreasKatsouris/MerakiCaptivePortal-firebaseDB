import { auth } from './config/firebase-config.js';

export function initializeReceiptManagement() {
    console.log('Initializing receipt management...');
    
    const app = Vue.createApp({
        data() {
            return {
                receipts: [],
                loading: false,
                error: null,
                filters: {
                    status: '',
                    guestName: '',
                    campaignId: ''
                },
                campaigns: []
            };
        },

        methods: {
            async loadReceipts() {
                this.loading = true;
                try {
                    const snapshot = await firebase.database().ref('receipts').once('value');
                    const data = snapshot.val() || {};
                    this.receipts = Object.entries(data).map(([id, receipt]) => ({
                        id,
                        ...receipt
                    }));
                } catch (error) {
                    console.error('Error loading receipts:', error);
                    this.error = 'Failed to load receipts';
                } finally {
                    this.loading = false;
                }
            },

            async loadCampaigns() {
                try {
                    const snapshot = await firebase.database().ref('campaigns').once('value');
                    const data = snapshot.val() || {};
                    this.campaigns = Object.entries(data).map(([id, campaign]) => ({
                        id,
                        ...campaign
                    }));
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                }
            },

            getStatusBadgeClass(status) {
                const classes = {
                    pending: 'bg-warning',
                    validated: 'bg-success',
                    rejected: 'bg-danger',
                    default: 'bg-secondary'
                };
                return classes[status] || classes.default;
            }
        },

        mounted() {
            console.log('Receipt management component mounted');
            this.loadReceipts();
            this.loadCampaigns();
        }
    });

    // Mount the app
    const mountPoint = document.getElementById('receiptManagementContent');
    if (mountPoint) {
        app.mount(mountPoint);
        console.log('Receipt management initialized');
    } else {
        console.error('Receipt management mount point not found');
    }

    return app;
} 