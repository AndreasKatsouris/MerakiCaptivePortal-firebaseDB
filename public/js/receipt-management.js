import { auth, rtdb, ref, get, update, push } from './config/firebase-config.js';

export function initializeReceiptManagement() {
    console.log('Initializing receipt management...', {
        auth: !!auth,
        rtdb: !!rtdb,
        Vue: typeof Vue !== 'undefined' ? 'loaded' : 'not loaded'
    });
    
    if (typeof Vue === 'undefined') {
        console.error('Vue is not loaded. Make sure Vue.js script is included and loaded before initializing receipt management.');
        return;
    }

    const app = Vue.createApp({
        data() {
            return {
                receipts: [],
                loading: false,
                error: null,
                filters: {
                    status: '',
                    dateRange: {
                        start: '',
                        end: ''
                    },
                    guestName: '',
                    campaignId: ''
                },
                campaigns: [],
                selectedReceipt: null,
                processingReceipt: false
            };
        },

        computed: {
            filteredReceipts() {
                return this.receipts.filter(receipt => {
                    const matchesStatus = !this.filters.status || receipt.status === this.filters.status;
                    const matchesGuest = !this.filters.guestName || 
                        receipt.guestName.toLowerCase().includes(this.filters.guestName.toLowerCase());
                    const matchesCampaign = !this.filters.campaignId || receipt.campaignId === this.filters.campaignId;
                    
                    let matchesDate = true;
                    if (this.filters.dateRange.start && this.filters.dateRange.end) {
                        const receiptDate = new Date(receipt.timestamp);
                        const startDate = new Date(this.filters.dateRange.start);
                        const endDate = new Date(this.filters.dateRange.end);
                        matchesDate = receiptDate >= startDate && receiptDate <= endDate;
                    }

                    return matchesStatus && matchesGuest && matchesCampaign && matchesDate;
                });
            }
        },

        methods: {
            async loadReceipts() {
                this.loading = true;
                try {
                    const snapshot = await get(ref(rtdb, 'receipts'));
                    const data = snapshot.val() || {};
                    this.receipts = Object.entries(data).map(([id, receipt]) => ({
                        id,
                        ...receipt,
                        timestamp: receipt.timestamp || Date.now()
                    })).sort((a, b) => b.timestamp - a.timestamp);
                } catch (error) {
                    console.error('Error loading receipts:', error);
                    this.error = 'Failed to load receipts';
                } finally {
                    this.loading = false;
                }
            },

            async loadCampaigns() {
                try {
                    const snapshot = await get(ref(rtdb, 'campaigns'));
                    const data = snapshot.val() || {};
                    this.campaigns = Object.entries(data).map(([id, campaign]) => ({
                        id,
                        ...campaign
                    }));
                } catch (error) {
                    console.error('Error loading campaigns:', error);
                }
            },

            async validateReceipt(receipt) {
                if (!receipt || this.processingReceipt) return;
                
                this.processingReceipt = true;
                try {
                    await update(ref(rtdb, `receipts/${receipt.id}`), {
                        status: 'validated',
                        validatedAt: Date.now(),
                        validatedBy: auth.currentUser.uid
                    });
                    
                    // Update local state
                    const index = this.receipts.findIndex(r => r.id === receipt.id);
                    if (index !== -1) {
                        this.receipts[index] = {
                            ...receipt,
                            status: 'validated',
                            validatedAt: Date.now(),
                            validatedBy: auth.currentUser.uid
                        };
                    }
                    
                    await this.processRewards(receipt);
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'Receipt Validated',
                        text: 'The receipt has been validated and rewards have been processed.'
                    });
                } catch (error) {
                    console.error('Error validating receipt:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Validation Failed',
                        text: 'Failed to validate the receipt. Please try again.'
                    });
                } finally {
                    this.processingReceipt = false;
                }
            },

            async rejectReceipt(receipt, reason) {
                if (!receipt || this.processingReceipt) return;
                
                this.processingReceipt = true;
                try {
                    await update(ref(rtdb, `receipts/${receipt.id}`), {
                        status: 'rejected',
                        rejectedAt: Date.now(),
                        rejectedBy: auth.currentUser.uid,
                        rejectionReason: reason
                    });
                    
                    // Update local state
                    const index = this.receipts.findIndex(r => r.id === receipt.id);
                    if (index !== -1) {
                        this.receipts[index] = {
                            ...receipt,
                            status: 'rejected',
                            rejectedAt: Date.now(),
                            rejectedBy: auth.currentUser.uid,
                            rejectionReason: reason
                        };
                    }
                    
                    Swal.fire({
                        icon: 'success',
                        title: 'Receipt Rejected',
                        text: 'The receipt has been marked as rejected.'
                    });
                } catch (error) {
                    console.error('Error rejecting receipt:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Rejection Failed',
                        text: 'Failed to reject the receipt. Please try again.'
                    });
                } finally {
                    this.processingReceipt = false;
                }
            },

            async processRewards(receipt) {
                // Find the associated campaign
                const campaign = this.campaigns.find(c => c.id === receipt.campaignId);
                if (!campaign) {
                    console.error('Campaign not found for receipt:', receipt.id);
                    return;
                }

                try {
                    // Create reward entry
                    const rewardData = {
                        receiptId: receipt.id,
                        campaignId: campaign.id,
                        guestId: receipt.guestId,
                        amount: receipt.amount,
                        type: campaign.rewardType,
                        status: 'pending',
                        createdAt: Date.now(),
                        createdBy: auth.currentUser.uid
                    };

                    await push(ref(rtdb, 'rewards'), rewardData);
                } catch (error) {
                    console.error('Error processing rewards:', error);
                    throw error; // Propagate error to calling function
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
            },

            formatDate(timestamp) {
                return new Date(timestamp).toLocaleString();
            },

            async showReceiptDetails(receipt) {
                this.selectedReceipt = receipt;
                
                // Show receipt details modal
                const result = await Swal.fire({
                    title: 'Receipt Details',
                    html: `
                        <div class="receipt-details">
                            <p><strong>Guest:</strong> ${receipt.guestName}</p>
                            <p><strong>Amount:</strong> ${receipt.amount}</p>
                            <p><strong>Date:</strong> ${this.formatDate(receipt.timestamp)}</p>
                            <p><strong>Status:</strong> ${receipt.status}</p>
                            ${receipt.imageUrl ? `<img src="${receipt.imageUrl}" alt="Receipt" class="img-fluid">` : ''}
                        </div>
                    `,
                    showCancelButton: true,
                    showDenyButton: receipt.status === 'pending',
                    confirmButtonText: receipt.status === 'pending' ? 'Validate' : 'Close',
                    denyButtonText: 'Reject',
                    denyButtonColor: '#dc3545'
                });

                if (result.isConfirmed && receipt.status === 'pending') {
                    await this.validateReceipt(receipt);
                } else if (result.isDenied) {
                    const reason = await Swal.fire({
                        title: 'Rejection Reason',
                        input: 'text',
                        inputLabel: 'Please provide a reason for rejection',
                        inputValidator: (value) => {
                            if (!value) {
                                return 'You need to provide a reason!';
                            }
                        }
                    });
                    
                    if (reason.value) {
                        await this.rejectReceipt(receipt, reason.value);
                    }
                }
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