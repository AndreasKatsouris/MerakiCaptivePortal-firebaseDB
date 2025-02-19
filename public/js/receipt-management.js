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

    // Check for existing app instance
    const mountPoint = document.getElementById('receiptManagementContent');
    if (!mountPoint) {
        console.error('Receipt management mount point not found');
        return;
    }

    // Clean up any existing app instance
    if (mountPoint.__vue_app__) {
        console.log('Cleaning up existing Vue app instance');
        mountPoint.__vue_app__.unmount();
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
                        (receipt.guestPhoneNumber && receipt.guestPhoneNumber.includes(this.filters.guestName));
                    const matchesCampaign = !this.filters.campaignId || receipt.campaignId === this.filters.campaignId;
                    
                    let matchesDate = true;
                    if (this.filters.dateRange.start && this.filters.dateRange.end) {
                        const receiptDate = new Date(receipt.date);
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
                        createdAt: receipt.createdAt || Date.now()
                    })).sort((a, b) => b.createdAt - a.createdAt);
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
                    const rewardRef = push(ref(rtdb, 'rewards'));
                    const rewardId = rewardRef.key;
                    
                    const rewardData = {
                        receiptId: receipt.id,
                        campaignId: campaign.id,
                        guestPhoneNumber: receipt.guestPhoneNumber,
                        totalAmount: receipt.totalAmount,
                        status: 'pending',
                        createdAt: Date.now(),
                        createdBy: auth.currentUser.uid
                    };

                    // Update rewards node
                    await update(ref(rtdb, `rewards/${rewardId}`), rewardData);
                    
                    // Update campaign-rewards mapping
                    await update(ref(rtdb, `campaign-rewards/${campaign.id}/${rewardId}`), true);
                    
                    // Update guest-rewards mapping
                    await update(ref(rtdb, `guest-rewards/${receipt.guestPhoneNumber}/${rewardId}`), true);
                    
                } catch (error) {
                    console.error('Error processing rewards:', error);
                    throw error;
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
                
                // Format items for display
                const itemsHtml = receipt.items ? receipt.items.map(item => `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.quantity}</td>
                        <td>R${item.unitPrice.toFixed(2)}</td>
                        <td>R${item.totalPrice.toFixed(2)}</td>
                    </tr>
                `).join('') : '';
                
                // Show receipt details modal
                const result = await Swal.fire({
                    title: 'Receipt Details',
                    html: `
                        <div class="receipt-details">
                            <div class="store-info mb-3">
                                <h5>${receipt.fullStoreName || receipt.brandName}</h5>
                                <p>${receipt.storeAddress || ''}</p>
                            </div>
                            
                            <div class="receipt-meta mb-3">
                                <p><strong>Invoice Number:</strong> ${receipt.invoiceNumber}</p>
                                <p><strong>Date:</strong> ${receipt.date} ${receipt.time || ''}</p>
                                <p><strong>Guest Phone:</strong> ${receipt.guestPhoneNumber}</p>
                                <p><strong>Table:</strong> ${receipt.tableNumber || 'N/A'}</p>
                                <p><strong>Waiter:</strong> ${receipt.waiterName || 'N/A'}</p>
                                <p><strong>Status:</strong> <span class="badge ${this.getStatusBadgeClass(receipt.status)}">${receipt.status}</span></p>
                            </div>
                            
                            <div class="items-table mb-3">
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Qty</th>
                                            <th>Unit Price</th>
                                            <th>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${itemsHtml}
                                    </tbody>
                                </table>
                            </div>
                            
                            <div class="totals mb-3">
                                <p><strong>Subtotal:</strong> R${receipt.subtotal.toFixed(2)}</p>
                                <p><strong>VAT (15%):</strong> R${receipt.vatAmount.toFixed(2)}</p>
                                <p><strong>Total Amount:</strong> R${receipt.totalAmount.toFixed(2)}</p>
                            </div>
                            
                            ${receipt.imageUrl ? `
                                <div class="receipt-image mb-3">
                                    <h6>Receipt Image</h6>
                                    <img src="${receipt.imageUrl}" alt="Receipt" class="img-fluid">
                                </div>
                            ` : ''}
                        </div>
                    `,
                    width: '800px',
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

    // Mount the app and store the instance
    app.mount(mountPoint);
    mountPoint.__vue_app__ = app;
    console.log('Receipt management initialized');
    
    // Return cleanup function
    return () => {
        console.log('Cleaning up receipt management...');
        if (mountPoint.__vue_app__) {
            mountPoint.__vue_app__.unmount();
            delete mountPoint.__vue_app__;
        }
    };
}

// Export cleanup function for use in admin-dashboard
export function cleanupReceiptManagement() {
    const mountPoint = document.getElementById('receiptManagementContent');
    if (mountPoint && mountPoint.__vue_app__) {
        console.log('Cleaning up receipt management...');
        mountPoint.__vue_app__.unmount();
        delete mountPoint.__vue_app__;
    }
}