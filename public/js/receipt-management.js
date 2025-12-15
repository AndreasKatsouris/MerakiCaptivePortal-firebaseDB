import { auth, rtdb, ref, get, update, push, remove } from './config/firebase-config.js';

/**
 * Normalize phone number format by removing + prefix and whatsapp: prefix
 * @param {string} phoneNumber - Phone number to normalize  
 * @returns {string} Normalized phone number without + prefix
 */
function normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';
    // Only remove WhatsApp prefix, preserve + for international numbers
    let cleaned = phoneNumber.replace(/^whatsapp:/, '').trim();

    // Ensure + prefix for international numbers (South African numbers)
    if (/^27\d{9}$/.test(cleaned)) {
        // If it's a 27xxxxxxxxx number without +, add it
        cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+') && /^\d+$/.test(cleaned)) {
        // If it's all digits without +, assume it's South African
        cleaned = '+27' + cleaned.replace(/^0+/, ''); // Remove leading zeros
    }

    return cleaned;
}

export function initializeReceiptManagement() {
    console.log('Initializing receipt management...');

    if (typeof Vue === 'undefined') {
        console.error('Vue is not loaded');
        return;
    }

    const mountPoint = document.getElementById('receiptManagementContent');
    if (!mountPoint) {
        console.error('Receipt management mount point not found');
        return;
    }

    if (mountPoint.__vue_app__) {
        mountPoint.__vue_app__.unmount();
    }

    const app = Vue.createApp({
        template: `
            <div class="receipt-management">
                <div class="filters mb-4">
                    <div class="row g-3">
                        <div class="col-md-2">
                            <label class="form-label">Status</label>
                            <select v-model="filters.status" class="form-select">
                                <option value="">All</option>
                                <option value="pending">Pending</option>
                                <option value="validated">Validated</option>
                                <option value="rejected">Rejected</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Guest Name</label>
                            <input type="text" v-model="filters.guestName" class="form-control" placeholder="Search guest...">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Campaign</label>
                            <select v-model="filters.campaignId" class="form-select">
                                <option value="">All Campaigns</option>
                                <option v-for="campaign in campaigns" :key="campaign.id" :value="campaign.id">
                                    {{ campaign.name }}
                                </option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">Date Range</label>
                            <div class="d-flex gap-2">
                                <input type="date" v-model="filters.dateRange.start" class="form-control">
                                <input type="date" v-model="filters.dateRange.end" class="form-control">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Debug and Admin Controls -->
                    <div class="row g-2 mt-3">
                        <div class="col-auto">
                            <button @click="forceRefreshReceipts" class="btn btn-outline-primary btn-sm">
                                <i class="fas fa-sync"></i> Refresh Data
                            </button>
                        </div>
                        <div class="col-auto">
                            <button @click="debugFirebasePermissions" class="btn btn-outline-warning btn-sm">
                                <i class="fas fa-bug"></i> Debug Firebase
                            </button>
                        </div>
                        <div class="col-auto">
                            <button @click="checkSpecificReceipt('00398182')" class="btn btn-outline-info btn-sm">
                                <i class="fas fa-search"></i> Check Receipt 00398182
                            </button>
                        </div>
                        <div class="col-auto">
                            <button @click="examineLocalState" class="btn btn-outline-secondary btn-sm">
                                <i class="fas fa-microscope"></i> Examine Local Data
                            </button>
                        </div>
                        <div class="col-auto">
                            <button @click="cleanupCorruptedData" class="btn btn-outline-danger btn-sm">
                                <i class="fas fa-broom"></i> Clean Database
                            </button>
                        </div>
                        <div class="col-auto">
                            <button @click="fixDuplicateReceipts" class="btn btn-outline-warning btn-sm">
                                <i class="fas fa-tools"></i> Fix Duplicates
                            </button>
                        </div>
                        <div class="col-auto">
                            <button @click="testReceiptFlow" class="btn btn-outline-success btn-sm">
                                <i class="fas fa-vial"></i> Test Flow
                            </button>
                        </div>
                        <div class="col-auto">
                            <button @click="cleanupOrphanedIndexes" class="btn btn-outline-info btn-sm">
                                <i class="fas fa-unlink"></i> Clean Indexes
                            </button>
                        </div>
                        <div class="col-auto">
                            <small class="text-muted">Total receipts: {{ receipts.length }}</small>
                        </div>
                        <div class="col-auto">
                            <small class="text-muted">Filtered: {{ filteredReceipts.length }}</small>
                        </div>
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Invoice #</th>
                                <th>Firebase ID</th>
                                <th>Guest Full Name</th>
                                <th>Campaign</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="loading">
                                <td colspan="7" class="text-center py-4">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                </td>
                            </tr>
                            <tr v-else-if="error">
                                <td colspan="7" class="text-center text-danger">{{ error }}</td>
                            </tr>
                            <tr v-else-if="filteredReceipts.length === 0">
                                <td colspan="7" class="text-center">No receipts found</td>
                            </tr>
                            <tr v-for="receipt in filteredReceipts" :key="receipt.id">
                                <td>{{ formatDate(receipt.date) }}</td>
                                <td>{{ receipt.invoiceNumber }}</td>
                                <td><code style="font-size: 11px;">{{ receipt.id }}</code></td>
                                <td>{{ receipt.guestName }}</td>
                                <td>{{ getCampaignName(receipt.campaignId) }}</td>
                                <td>
                                    <span :class="getStatusBadgeClass(receipt.status)">
                                        {{ receipt.status }}
                                    </span>
                                </td>
                                <td>
                                    <div class="btn-group" role="group">
                                        <button class="btn btn-sm btn-primary" @click="viewReceipt(receipt)" title="View Receipt">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button v-if="receipt.status === 'pending'"
                                                class="btn btn-sm btn-success"
                                                @click="validateReceipt(receipt)" title="Validate Receipt">
                                            <i class="fas fa-check"></i>
                                        </button>
                                        <button v-if="receipt.status === 'pending'"
                                                class="btn btn-sm btn-warning"
                                                @click="promptRejectReceipt(receipt)" title="Reject Receipt">
                                            <i class="fas fa-times"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger"
                                                @click="promptDeleteReceipt(receipt)" 
                                                title="Delete Receipt & Associated Rewards"
                                                :disabled="processingReceipt">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `,
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
        methods: {
            formatDate(date) {
                if (!date) return 'N/A';
                return new Date(date).toLocaleDateString();
            },
            getStatusBadgeClass(status) {
                const classes = {
                    pending: 'badge bg-warning',
                    validated: 'badge bg-success',
                    rejected: 'badge bg-danger'
                };
                return classes[status] || 'badge bg-secondary';
            },
            getCampaignName(campaignId) {
                const campaign = this.campaigns.find(c => c.id === campaignId);
                return campaign ? campaign.name : 'Unmatched Campaign';
            },
            async backfillMissingGuestNames(receiptsData) {
                console.log('🔄 Checking for receipts missing guest names...');

                // Find receipts without guest names
                const receiptsNeedingNames = Object.entries(receiptsData).filter(([firebaseId, receipt]) =>
                    !receipt.guestName && receipt.guestPhoneNumber
                );

                if (receiptsNeedingNames.length === 0) {
                    console.log('✅ All receipts already have guest names');
                    return;
                }

                console.log(`📝 Found ${receiptsNeedingNames.length} receipts missing guest names, backfilling...`);

                // Load all guests data
                const guestsSnapshot = await get(ref(rtdb, 'guests'));
                const guestsData = guestsSnapshot.val() || {};

                // Process each receipt that needs a guest name
                for (const [firebaseId, receipt] of receiptsNeedingNames) {
                    const normalizedPhone = this.normalizePhoneNumber(receipt.guestPhoneNumber);
                    const guestData = guestsData[normalizedPhone];

                    if (guestData && guestData.name) {
                        console.log(`📝 Updating receipt ${firebaseId} with guest name: ${guestData.name}`);

                        // Update the receipt in Firebase
                        await update(ref(rtdb, `receipts/${firebaseId}`), {
                            guestName: guestData.name
                        });

                        // Update the local data for immediate display
                        receipt.guestName = guestData.name;
                    } else {
                        console.log(`⚠️ No guest found for phone ${normalizedPhone} (receipt ${firebaseId})`);
                    }
                }

                console.log('✅ Guest name backfill completed');
            },
            normalizePhoneNumber(phoneNumber) {
                if (!phoneNumber) return '';
                // Remove WhatsApp prefix and ensure + for international numbers
                let cleaned = phoneNumber.replace(/^whatsapp:/, '').trim();

                // Ensure + prefix for international numbers (South African numbers)
                if (/^27\d{9}$/.test(cleaned)) {
                    // If it's a 27xxxxxxxxx number without +, add it
                    cleaned = '+' + cleaned;
                } else if (!cleaned.startsWith('+') && /^\d+$/.test(cleaned)) {
                    // If it's all digits without +, assume it's South African
                    cleaned = '+27' + cleaned.replace(/^0+/, ''); // Remove leading zeros
                }

                return cleaned;
            },
            async loadReceipts() {
                this.loading = true;
                console.log('📥 Loading receipts from database...');
                try {
                    const snapshot = await get(ref(rtdb, 'receipts'));
                    const data = snapshot.val() || {};

                    console.log('📊 Raw receipts data from database:', {
                        totalReceipts: Object.keys(data).length,
                        receiptIds: Object.keys(data),
                        sampleData: Object.keys(data).length > 0 ? Object.entries(data)[0] : 'No data'
                    });

                    // Check specifically for the problematic receipt
                    const problematicReceiptId = '00398182';
                    if (data[problematicReceiptId]) {
                        console.log(`🔍 Found problematic receipt ${problematicReceiptId} in database:`, data[problematicReceiptId]);
                    } else {
                        console.log(`❌ Problematic receipt ${problematicReceiptId} NOT found in database`);
                    }

                    // Check for missing guest names and backfill them
                    await this.backfillMissingGuestNames(data);

                    this.receipts = Object.entries(data).map(([firebaseId, receipt]) => {
                        console.log(`📄 Processing receipt ${firebaseId}:`, {
                            firebaseId: firebaseId,
                            invoiceNumber: receipt.invoiceNumber,
                            guestPhoneNumber: receipt.guestPhoneNumber,
                            guestName: receipt.guestName,
                            status: receipt.status,
                            createdAt: receipt.createdAt,
                            hasIdField: 'id' in receipt,
                            hasReceiptIdField: 'receiptId' in receipt,
                            receiptIdField: receipt.receiptId
                        });

                        // Use Firebase ID as primary identifier, preserve receipt data structure
                        return {
                            id: firebaseId, // Primary identifier for UI operations
                            firebaseId: firebaseId, // Explicit Firebase ID
                            receiptId: receipt.receiptId || firebaseId, // Legacy support
                            ...receipt, // Preserve all receipt data
                            createdAt: receipt.createdAt || Date.now()
                        };
                    }).sort((a, b) => b.createdAt - a.createdAt);

                    console.log('✅ Receipts loaded and processed:', {
                        totalProcessed: this.receipts.length,
                        receiptsWithIds: this.receipts.map(r => ({ id: r.id, invoice: r.invoiceNumber }))
                    });

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

            async deleteReceipt(receipt) {
                if (!receipt || this.processingReceipt) return;

                this.processingReceipt = true;
                try {
                    console.log('🗑️ Starting receipt deletion process for:', receipt.id);
                    console.log('📱 Receipt phone number:', receipt.guestPhoneNumber);

                    // Normalize phone number for consistent database operations
                    const normalizedPhone = normalizePhoneNumber(receipt.guestPhoneNumber);
                    console.log('📱 Normalized phone number:', normalizedPhone);

                    // Verify receipt exists before deletion
                    console.log('🔍 Verifying receipt exists in database...');
                    const receiptCheck = await get(ref(rtdb, `receipts/${receipt.id}`));
                    if (!receiptCheck.exists()) {
                        console.warn('⚠️ Receipt not found in database, may already be deleted');

                        // Force refresh the data to sync with database
                        console.log('🔄 Forcing data refresh to sync with database...');
                        await this.loadReceipts();

                        // Check if it's still in local state after refresh
                        const stillExists = this.receipts.find(r => r.id === receipt.id);
                        if (stillExists) {
                            console.log('❌ Receipt still in local state after refresh - data sync issue');
                            Swal.fire({
                                icon: 'warning',
                                title: 'Data Sync Issue',
                                html: `
                                    <p>The receipt appears to be deleted from the database but still shows in the interface.</p>
                                    <p>This suggests a data synchronization issue.</p>
                                    <p><strong>Try refreshing the page or clicking "Refresh Data"</strong></p>
                                `
                            });
                        } else {
                            console.log('✅ Receipt removed from local state after refresh');
                            Swal.fire({
                                icon: 'success',
                                title: 'Receipt Already Deleted',
                                text: 'The receipt was already deleted from the database. Interface has been updated.'
                            });
                        }
                        return;
                    }
                    console.log('✅ Receipt exists in database');

                    // Also check if receipt exists in its expected structure
                    const receiptData = receiptCheck.val();
                    console.log('📄 Receipt data preview:', {
                        id: receipt.id,
                        guestPhoneNumber: receiptData.guestPhoneNumber,
                        invoiceNumber: receiptData.invoiceNumber,
                        status: receiptData.status
                    });

                    // Find and collect all associated rewards
                    console.log('🔍 Finding associated rewards...');
                    const associatedRewards = await this.findAssociatedRewards(receipt.id, normalizedPhone);
                    console.log(`📊 Found ${associatedRewards.length} associated rewards:`, associatedRewards);

                    // Try batch deletion first
                    let deletionSuccessful = false;
                    try {
                        console.log('🔄 Attempting batch deletion...');

                        // Prepare batch updates for deletion
                        const deletionUpdates = {};

                        // Delete the receipt itself
                        deletionUpdates[`receipts/${receipt.id}`] = null;
                        console.log('📝 Added receipt deletion to batch:', `receipts/${receipt.id}`);

                        // Delete guest-receipt index
                        deletionUpdates[`guest-receipts/${normalizedPhone}/${receipt.id}`] = null;
                        console.log('📝 Added guest-receipt index deletion to batch:', `guest-receipts/${normalizedPhone}/${receipt.id}`);

                        // Delete all associated rewards and their references
                        associatedRewards.forEach(rewardId => {
                            // Delete the reward itself
                            deletionUpdates[`rewards/${rewardId}`] = null;
                            console.log('📝 Added reward deletion to batch:', `rewards/${rewardId}`);

                            // Delete guest-rewards reference
                            deletionUpdates[`guest-rewards/${normalizedPhone}/${rewardId}`] = null;
                            console.log('📝 Added guest-reward deletion to batch:', `guest-rewards/${normalizedPhone}/${rewardId}`);

                            // Delete campaign-rewards reference if campaign exists
                            if (receipt.campaignId) {
                                deletionUpdates[`campaign-rewards/${receipt.campaignId}/${rewardId}`] = null;
                                console.log('📝 Added campaign-reward deletion to batch:', `campaign-rewards/${receipt.campaignId}/${rewardId}`);
                            }
                        });

                        console.log('📦 Batch update object:', deletionUpdates);
                        console.log('🚀 Executing batch deletion...');

                        // Execute batch deletion
                        await update(ref(rtdb), deletionUpdates);

                        console.log('✅ Batch deletion completed');
                        deletionSuccessful = true;

                    } catch (batchError) {
                        console.error('❌ Batch deletion failed:', batchError);

                        // Try individual deletions as fallback
                        console.log('🔄 Attempting individual deletions as fallback...');

                        try {
                            // Delete receipt
                            console.log('🗑️ Deleting receipt individually...');
                            await update(ref(rtdb, `receipts/${receipt.id}`), null);

                            // Also clean up guest-receipt index
                            console.log('🧹 Cleaning up guest-receipt index...');
                            await update(ref(rtdb, `guest-receipts/${normalizedPhone}/${receipt.id}`), null);

                            // Delete each reward individually
                            for (const rewardId of associatedRewards) {
                                console.log(`🗑️ Deleting reward ${rewardId} individually...`);

                                // Delete the reward itself
                                await update(ref(rtdb, `rewards/${rewardId}`), null);

                                // Delete guest-rewards reference
                                await update(ref(rtdb, `guest-rewards/${normalizedPhone}/${rewardId}`), null);

                                // Delete campaign-rewards reference if campaign exists
                                if (receipt.campaignId) {
                                    await update(ref(rtdb, `campaign-rewards/${receipt.campaignId}/${rewardId}`), null);
                                }
                            }

                            console.log('✅ Individual deletions completed');
                            deletionSuccessful = true;

                        } catch (individualError) {
                            console.error('❌ Individual deletions also failed:', individualError);
                            throw new Error(`Both batch and individual deletions failed. Batch error: ${batchError.message}, Individual error: ${individualError.message}`);
                        }
                    }

                    if (deletionSuccessful) {
                        // Verify deletion worked
                        console.log('🔍 Verifying deletion...');
                        const verificationCheck = await get(ref(rtdb, `receipts/${receipt.id}`));

                        if (verificationCheck.exists()) {
                            console.error('❌ Verification failed: Receipt still exists in database');
                            throw new Error('Deletion verification failed - receipt still exists in database');
                        } else {
                            console.log('✅ Deletion verified successfully');
                        }

                        // Double-check reward deletions
                        let rewardVerificationFailed = false;
                        for (const rewardId of associatedRewards) {
                            const rewardCheck = await get(ref(rtdb, `rewards/${rewardId}`));
                            if (rewardCheck.exists()) {
                                console.error(`❌ Reward ${rewardId} still exists after deletion`);
                                rewardVerificationFailed = true;
                            }
                        }

                        if (rewardVerificationFailed) {
                            console.error('❌ Some rewards were not properly deleted');
                            Swal.fire({
                                icon: 'warning',
                                title: 'Partial Deletion',
                                text: 'Receipt was deleted but some associated rewards may still exist. Check the console for details.'
                            });
                        }

                        // Update local state only after successful verification
                        const index = this.receipts.findIndex(r => r.id === receipt.id);
                        if (index !== -1) {
                            this.receipts.splice(index, 1);
                            console.log('✅ Removed receipt from local state');
                        }

                        // Force a refresh to ensure data is in sync
                        console.log('🔄 Refreshing data to ensure synchronization...');
                        setTimeout(async () => {
                            await this.loadReceipts();
                            console.log('✅ Data refreshed after deletion');
                        }, 1000); // Small delay to ensure database propagation

                        Swal.fire({
                            icon: 'success',
                            title: 'Receipt Deleted',
                            html: `
                                <p>✅ Receipt successfully deleted</p>
                                <p>✅ ${associatedRewards.length} associated rewards deleted</p>
                                <p><small>Data will refresh automatically in a moment</small></p>
                            `
                        });
                    }

                } catch (error) {
                    console.error('💥 Error deleting receipt:', error);
                    console.error('💥 Error stack:', error.stack);

                    // Show detailed error information
                    Swal.fire({
                        icon: 'error',
                        title: 'Deletion Failed',
                        html: `
                            <p>Failed to delete the receipt. Please try again.</p>
                            <details>
                                <summary>Technical Details</summary>
                                <pre style="text-align: left; font-size: 12px;">${error.message}</pre>
                            </details>
                        `,
                        width: '600px'
                    });
                } finally {
                    this.processingReceipt = false;
                }
            },

            async findAssociatedRewards(receiptId, normalizedPhone) {
                const associatedRewards = [];

                try {
                    // Method 1: Look for rewards with matching receiptId
                    const rewardsSnapshot = await get(ref(rtdb, 'rewards'));
                    const rewardsData = rewardsSnapshot.val() || {};

                    Object.entries(rewardsData).forEach(([rewardId, reward]) => {
                        if (reward.receiptId === receiptId) {
                            associatedRewards.push(rewardId);
                            console.log('Found reward by receiptId:', rewardId);
                        }
                    });

                    // Method 2: Look for rewards in guest-rewards index
                    const guestRewardsSnapshot = await get(ref(rtdb, `guest-rewards/${normalizedPhone}`));
                    const guestRewardsData = guestRewardsSnapshot.val() || {};

                    for (const rewardId of Object.keys(guestRewardsData)) {
                        // Check if this reward is associated with our receipt
                        const rewardSnapshot = await get(ref(rtdb, `rewards/${rewardId}`));
                        const rewardData = rewardSnapshot.val();

                        if (rewardData && rewardData.receiptId === receiptId && !associatedRewards.includes(rewardId)) {
                            associatedRewards.push(rewardId);
                            console.log('Found reward by guest-rewards index:', rewardId);
                        }
                    }

                } catch (error) {
                    console.error('Error finding associated rewards:', error);
                }

                return associatedRewards;
            },

            async debugFirebasePermissions() {
                console.log('🔧 Starting Firebase permissions debug...');

                try {
                    // Test current user and admin status
                    console.log('👤 Current user:', auth.currentUser?.uid);
                    console.log('📧 Current email:', auth.currentUser?.email);

                    // Get and check the ID token
                    const idToken = await auth.currentUser?.getIdToken(true);
                    console.log('🔑 ID Token length:', idToken?.length);

                    // Decode the token to check claims (this is for debugging only)
                    if (idToken) {
                        try {
                            // Basic token parsing (not secure, just for debugging)
                            const tokenParts = idToken.split('.');
                            const payload = JSON.parse(atob(tokenParts[1]));
                            console.log('🏷️ Token claims:', {
                                admin: payload.admin,
                                phone_number: payload.phone_number,
                                exp: new Date(payload.exp * 1000),
                                iat: new Date(payload.iat * 1000)
                            });
                        } catch (e) {
                            console.log('⚠️ Could not decode token for inspection');
                        }
                    }

                    // Test basic read permission
                    console.log('📖 Testing read permissions...');
                    const testRead = await get(ref(rtdb, 'receipts'));
                    console.log('✅ Read permission: OK');

                    // Test basic write permission
                    console.log('✏️ Testing write permissions...');
                    const testPath = `debug-test/${Date.now()}`;
                    await update(ref(rtdb, testPath), { test: true, timestamp: Date.now() });
                    console.log('✅ Write permission: OK');

                    // Test delete permission using correct method
                    console.log('🗑️ Testing delete permissions...');
                    await remove(ref(rtdb, testPath));
                    console.log('✅ Delete permission: OK');

                    // Test admin-specific paths
                    console.log('🔐 Testing admin paths...');
                    try {
                        const adminTestPath = `campaign-rewards/test-campaign/test-reward`;
                        await update(ref(rtdb, adminTestPath), { test: true, timestamp: Date.now() });
                        await remove(ref(rtdb, adminTestPath));
                        console.log('✅ Admin paths: OK');
                    } catch (adminError) {
                        console.error('❌ Admin paths failed:', adminError.message);
                    }

                    // Test batch update with null values (deletion format)
                    console.log('🔄 Testing batch deletion format...');
                    try {
                        const batchTestPath = `batch-test/${Date.now()}`;
                        // First create some test data
                        await update(ref(rtdb), {
                            [`${batchTestPath}/item1`]: { test: true },
                            [`${batchTestPath}/item2`]: { test: true }
                        });
                        // Then delete using batch format
                        await update(ref(rtdb), {
                            [`${batchTestPath}/item1`]: null,
                            [`${batchTestPath}/item2`]: null
                        });
                        console.log('✅ Batch deletion format: OK');
                    } catch (batchError) {
                        console.error('❌ Batch deletion failed:', batchError.message);
                    }

                    Swal.fire({
                        icon: 'success',
                        title: 'Firebase Debug Complete',
                        text: 'Check console for detailed permissions analysis.'
                    });

                } catch (error) {
                    console.error('💥 Firebase permissions error:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Firebase Permission Issue',
                        html: `
                            <p>Found a permissions issue:</p>
                            <pre style="text-align: left; font-size: 12px;">${error.message}</pre>
                        `
                    });
                }
            },

            async forceRefreshReceipts() {
                console.log('🔄 Force refreshing receipts from database...');
                await this.loadReceipts();
                console.log('✅ Receipts refreshed');
            },

            examineLocalState() {
                console.log('🔍 Examining local receipts state for ID issues...');
                console.log('📊 Total receipts in local state:', this.receipts.length);

                this.receipts.forEach((receipt, index) => {
                    console.log(`📄 Receipt ${index + 1}:`, {
                        arrayIndex: index,
                        id: receipt.id,
                        invoiceNumber: receipt.invoiceNumber,
                        guestName: receipt.guestName,
                        status: receipt.status,
                        isFirebaseId: receipt.id && receipt.id.startsWith('-'),
                        idLooksLikeInvoice: receipt.id && /^\d+$/.test(receipt.id)
                    });

                    // Check for problematic patterns
                    if (receipt.id === '00398182') {
                        console.error(`❌ FOUND PROBLEMATIC RECEIPT: Receipt has ID "00398182" which should be the invoice number, not the Firebase ID!`);
                        console.error('Full receipt data:', receipt);
                    }

                    if (receipt.id && /^\d+$/.test(receipt.id) && !receipt.id.startsWith('-')) {
                        console.warn(`⚠️ Suspicious ID detected: ${receipt.id} looks like an invoice number, not a Firebase ID`);
                    }
                });

                // Look for duplicates
                const ids = this.receipts.map(r => r.id);
                const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
                if (duplicates.length > 0) {
                    console.error('❌ Duplicate IDs found:', duplicates);
                }

                Swal.fire({
                    icon: 'info',
                    title: 'Local State Examination Complete',
                    text: 'Check console for detailed analysis of receipt IDs and potential mismatches.'
                });
            },

            async checkSpecificReceipt(receiptId = '00398182') {
                console.log(`🔍 Checking specific receipt: ${receiptId}`);

                try {
                    // Direct database check
                    const directCheck = await get(ref(rtdb, `receipts/${receiptId}`));
                    console.log(`📍 Direct check for ${receiptId}:`, {
                        exists: directCheck.exists(),
                        data: directCheck.exists() ? directCheck.val() : null
                    });

                    // Check if it exists in any other paths
                    console.log('🔍 Checking alternative paths...');

                    // Check if it's in guest-receipts
                    const allGuestReceipts = await get(ref(rtdb, 'guest-receipts'));
                    const guestReceiptsData = allGuestReceipts.val() || {};
                    let foundInGuestReceipts = false;

                    Object.entries(guestReceiptsData).forEach(([phone, receipts]) => {
                        if (receipts && receipts[receiptId]) {
                            console.log(`📱 Found ${receiptId} in guest-receipts/${phone}`);
                            foundInGuestReceipts = true;
                        }
                    });

                    if (!foundInGuestReceipts) {
                        console.log('❌ Receipt not found in guest-receipts');
                    }

                    // Check if any receipt has this as invoice number
                    console.log('🔍 Checking if this is an invoice number instead of ID...');
                    const allReceipts = await get(ref(rtdb, 'receipts'));
                    const allReceiptsData = allReceipts.val() || {};
                    let foundAsInvoiceNumber = null;

                    Object.entries(allReceiptsData).forEach(([realId, receiptData]) => {
                        if (receiptData.invoiceNumber === receiptId) {
                            console.log(`💡 Found receipt with invoice number ${receiptId}:`, {
                                realFirebaseId: realId,
                                invoiceNumber: receiptData.invoiceNumber,
                                guestPhoneNumber: receiptData.guestPhoneNumber,
                                status: receiptData.status
                            });
                            foundAsInvoiceNumber = { realId, data: receiptData };
                        }
                    });

                    // Check current local state
                    const localReceipt = this.receipts.find(r => r.id === receiptId);
                    console.log(`💾 Local state check for ${receiptId}:`, {
                        found: !!localReceipt,
                        data: localReceipt ? {
                            id: localReceipt.id,
                            invoiceNumber: localReceipt.invoiceNumber,
                            status: localReceipt.status
                        } : null
                    });

                    // Also check if any local receipt has this as invoice number
                    const localReceiptByInvoice = this.receipts.find(r => r.invoiceNumber === receiptId);
                    console.log(`💾 Local state check by invoice number ${receiptId}:`, {
                        found: !!localReceiptByInvoice,
                        data: localReceiptByInvoice ? {
                            id: localReceiptByInvoice.id,
                            invoiceNumber: localReceiptByInvoice.invoiceNumber,
                            status: localReceiptByInvoice.status
                        } : null
                    });

                    Swal.fire({
                        icon: 'info',
                        title: 'Specific Receipt Check Complete',
                        html: `
                            <div style="text-align: left; font-size: 14px;">
                                <p><strong>Searched for:</strong> ${receiptId}</p>
                                <p><strong>In main receipts table (as ID):</strong> ${directCheck.exists() ? '✅ YES' : '❌ NO'}</p>
                                <p><strong>In guest-receipts:</strong> ${foundInGuestReceipts ? '✅ YES' : '❌ NO'}</p>
                                <p><strong>As invoice number:</strong> ${foundAsInvoiceNumber ? `✅ YES (Real ID: ${foundAsInvoiceNumber.realId})` : '❌ NO'}</p>
                                <p><strong>In local state (as ID):</strong> ${localReceipt ? '✅ YES' : '❌ NO'}</p>
                                <p><strong>In local state (as invoice):</strong> ${localReceiptByInvoice ? `✅ YES (ID: ${localReceiptByInvoice.id})` : '❌ NO'}</p>
                                ${foundAsInvoiceNumber ? `<p><strong style="color: red;">⚠️ ID MISMATCH DETECTED!</strong><br>UI shows: ${receiptId}<br>Real Firebase ID: ${foundAsInvoiceNumber.realId}</p>` : ''}
                            </div>
                        `
                    });

                } catch (error) {
                    console.error('Error checking specific receipt:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Check Failed',
                        text: error.message
                    });
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

                    // Normalize phone number for consistent database operations
                    const normalizedPhone = normalizePhoneNumber(receipt.guestPhoneNumber);

                    const rewardData = {
                        receiptId: receipt.id,
                        campaignId: campaign.id,
                        guestPhoneNumber: normalizedPhone,
                        totalAmount: receipt.totalAmount,
                        status: 'pending',
                        createdAt: Date.now(),
                        createdBy: auth.currentUser.uid
                    };

                    // Update rewards node
                    await update(ref(rtdb, `rewards/${rewardId}`), rewardData);

                    // Update campaign-rewards mapping
                    await update(ref(rtdb, `campaign-rewards/${campaign.id}/${rewardId}`), true);

                    // Update guest-rewards mapping with normalized phone
                    await update(ref(rtdb, `guest-rewards/${normalizedPhone}/${rewardId}`), true);

                } catch (error) {
                    console.error('Error processing rewards:', error);
                    throw error;
                }
            },

            async viewReceipt(receipt) {
                this.selectedReceipt = receipt;

                // Format items for display
                const itemsHtml = receipt.items ? receipt.items.map(item => `
                    <tr>
                        <td>${item.name || 'N/A'}</td>
                        <td>${item.quantity || 0}</td>
                        <td>R${(item.unitPrice || 0).toFixed(2)}</td>
                        <td>R${(item.totalPrice || 0).toFixed(2)}</td>
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
                                <p><strong>Subtotal:</strong> R${(receipt.subtotal || 0).toFixed(2)}</p>
                                <p><strong>VAT (15%):</strong> R${(receipt.vatAmount || 0).toFixed(2)}</p>
                                <p><strong>Total Amount:</strong> R${(receipt.totalAmount || 0).toFixed(2)}</p>
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
            },

            async promptDeleteReceipt(receipt) {
                // First, check how many associated rewards exist
                const normalizedPhone = normalizePhoneNumber(receipt.guestPhoneNumber);
                const associatedRewards = await this.findAssociatedRewards(receipt.id, normalizedPhone);

                const result = await Swal.fire({
                    title: 'Delete Receipt?',
                    html: `
                        <div class="text-start">
                            <p><strong>Are you sure you want to permanently delete this receipt?</strong></p>
                            <p><strong>Receipt:</strong> ${receipt.invoiceNumber}</p>
                            <p><strong>Guest:</strong> ${receipt.guestName || 'N/A'}</p>
                            <p><strong>Date:</strong> ${receipt.date}</p>
                            <p><strong>Status:</strong> ${receipt.status}</p>
                            <p><strong>Associated Rewards:</strong> ${associatedRewards.length}</p>
                            <br>
                            <div class="alert alert-danger">
                                <strong>⚠️ Warning:</strong> This action will permanently delete:
                                <ul>
                                    <li>The receipt record</li>
                                    <li>All associated rewards (${associatedRewards.length})</li>
                                    <li>All reward references in guest and campaign indexes</li>
                                </ul>
                                This action cannot be undone.
                            </div>
                        </div>
                    `,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Yes, Delete Everything',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#dc3545',
                    cancelButtonColor: '#6c757d',
                    reverseButtons: true
                });

                if (result.isConfirmed) {
                    await this.deleteReceipt(receipt);
                }
            },

            promptRejectReceipt(receipt) {
                Swal.fire({
                    title: 'Reject Receipt',
                    text: 'Are you sure you want to reject this receipt?',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Reject',
                    cancelButtonText: 'Cancel',
                    reverseButtons: true
                }).then(async (result) => {
                    if (result.isConfirmed) {
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
                });
            },

            async cleanupCorruptedData() {
                console.log('🧹 Starting cleanup of corrupted receipt data...');

                try {
                    const snapshot = await get(ref(rtdb, 'receipts'));
                    const data = snapshot.val() || {};
                    const corruptedEntries = [];

                    // Find entries with invalid Firebase IDs
                    Object.entries(data).forEach(([firebaseId, receipt]) => {
                        // Check for suspicious patterns that indicate corruption
                        if (
                            !firebaseId.startsWith('-') ||  // Not a Firebase ID
                            firebaseId.includes('#') ||     // Has # prefix
                            firebaseId.match(/^\d+$/) ||    // Pure numbers (invoice numbers)
                            firebaseId.length < 10          // Too short to be Firebase ID
                        ) {
                            console.warn('🔍 Found corrupted entry:', firebaseId, receipt);
                            corruptedEntries.push(firebaseId);
                        }
                    });

                    if (corruptedEntries.length === 0) {
                        console.log('✅ No corrupted entries found in database');
                        Swal.fire({
                            icon: 'success',
                            title: 'Database Clean',
                            text: 'No corrupted receipt entries found in the database.'
                        });
                        return;
                    }

                    // Show confirmation before cleanup
                    const result = await Swal.fire({
                        title: 'Corrupted Data Found',
                        html: `
                            <div class="text-start">
                                <p>Found ${corruptedEntries.length} corrupted receipt entries with invalid Firebase IDs:</p>
                                <ul>
                                    ${corruptedEntries.map(id => `<li><code>${id}</code></li>`).join('')}
                                </ul>
                                <p><strong>⚠️ These entries have invalid Firebase IDs and should be removed.</strong></p>
                                <p>Do you want to delete these corrupted entries?</p>
                            </div>
                        `,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Yes, Clean Database',
                        cancelButtonText: 'Cancel',
                        confirmButtonColor: '#dc3545'
                    });

                    if (!result.isConfirmed) {
                        return;
                    }

                    // Delete corrupted entries
                    const deletionUpdates = {};
                    corruptedEntries.forEach(corruptedId => {
                        deletionUpdates[`receipts/${corruptedId}`] = null;
                    });

                    console.log('🗑️ Deleting corrupted entries:', deletionUpdates);
                    await update(ref(rtdb), deletionUpdates);

                    console.log('✅ Corrupted data cleanup completed');

                    // Refresh the display
                    await this.loadReceipts();

                    Swal.fire({
                        icon: 'success',
                        title: 'Cleanup Complete',
                        html: `
                            <p>Successfully cleaned up ${corruptedEntries.length} corrupted receipt entries.</p>
                            <p>The receipt list has been refreshed.</p>
                        `
                    });

                } catch (error) {
                    console.error('❌ Error during cleanup:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Cleanup Failed',
                        text: 'Failed to clean up corrupted data: ' + error.message
                    });
                }
            },

            async fixDuplicateReceipts() {
                console.log('🔧 Starting duplicate receipt detection and fix...');

                try {
                    // Get all receipts
                    const receiptsSnapshot = await get(ref(rtdb, 'receipts'));
                    const receiptsData = receiptsSnapshot.val() || {};

                    // Get all guest-receipts
                    const guestReceiptsSnapshot = await get(ref(rtdb, 'guest-receipts'));
                    const guestReceiptsData = guestReceiptsSnapshot.val() || {};

                    console.log('📊 Analysis:', {
                        totalReceipts: Object.keys(receiptsData).length,
                        totalGuestReceiptEntries: Object.keys(guestReceiptsData).length
                    });

                    // Find duplicates by invoice number + phone number + date
                    const duplicateGroups = new Map();
                    const corruptedReceipts = [];

                    Object.entries(receiptsData).forEach(([firebaseId, receipt]) => {
                        const key = `${receipt.guestPhoneNumber}-${receipt.invoiceNumber}-${receipt.date}`;

                        // Check for corrupted Firebase IDs (using invoice numbers as IDs)
                        if (!firebaseId.startsWith('-') || firebaseId.match(/^\d+$/)) {
                            corruptedReceipts.push({
                                firebaseId,
                                receipt,
                                reason: 'Invalid Firebase ID - using invoice number as ID'
                            });
                        }

                        if (!duplicateGroups.has(key)) {
                            duplicateGroups.set(key, []);
                        }

                        duplicateGroups.get(key).push({
                            firebaseId,
                            receipt
                        });
                    });

                    // Find actual duplicates (groups with more than 1 receipt)
                    const actualDuplicates = Array.from(duplicateGroups.entries())
                        .filter(([key, receipts]) => receipts.length > 1);

                    console.log('🔍 Found issues:', {
                        duplicateGroups: actualDuplicates.length,
                        corruptedReceipts: corruptedReceipts.length
                    });

                    if (actualDuplicates.length === 0 && corruptedReceipts.length === 0) {
                        Swal.fire({
                            icon: 'success',
                            title: 'No Issues Found',
                            text: 'No duplicate receipts or corrupted IDs detected.'
                        });
                        return;
                    }

                    // Show issues found
                    let issuesHtml = '<div class="text-start">';

                    if (actualDuplicates.length > 0) {
                        issuesHtml += `<h6>🔄 Duplicate Receipt Groups (${actualDuplicates.length}):</h6><ul>`;
                        actualDuplicates.forEach(([key, receipts]) => {
                            issuesHtml += `<li>${key} - ${receipts.length} copies</li>`;
                        });
                        issuesHtml += '</ul>';
                    }

                    if (corruptedReceipts.length > 0) {
                        issuesHtml += `<h6>🔧 Corrupted Receipt IDs (${corruptedReceipts.length}):</h6><ul>`;
                        corruptedReceipts.forEach(item => {
                            issuesHtml += `<li><code>${item.firebaseId}</code> - ${item.reason}</li>`;
                        });
                        issuesHtml += '</ul>';
                    }

                    issuesHtml += '</div>';

                    const result = await Swal.fire({
                        title: 'Receipt Issues Detected',
                        html: issuesHtml + `
                            <div class="alert alert-warning mt-3">
                                <strong>Recommended Actions:</strong>
                                <ul class="text-start">
                                    <li>Keep the newest receipt from each duplicate group</li>
                                    <li>Remove receipts with corrupted Firebase IDs</li>
                                    <li>Preserve all associated rewards and data</li>
                                </ul>
                            </div>
                        `,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Fix Issues',
                        cancelButtonText: 'Cancel',
                        confirmButtonColor: '#ffc107'
                    });

                    if (!result.isConfirmed) {
                        return;
                    }

                    const deletionUpdates = {};
                    let deletedCount = 0;

                    // Handle duplicates - keep the newest one
                    actualDuplicates.forEach(([key, receipts]) => {
                        // Sort by createdAt descending to keep the newest
                        const sorted = receipts.sort((a, b) => (b.receipt.createdAt || 0) - (a.receipt.createdAt || 0));
                        const toKeep = sorted[0];
                        const toDelete = sorted.slice(1);

                        console.log(`📝 For duplicate group ${key}:`);
                        console.log(`  ✅ Keeping: ${toKeep.firebaseId}`);
                        console.log(`  🗑️ Deleting: ${toDelete.map(r => r.firebaseId).join(', ')}`);

                        toDelete.forEach(item => {
                            deletionUpdates[`receipts/${item.firebaseId}`] = null;
                            deletedCount++;
                        });
                    });

                    // Handle corrupted receipts
                    corruptedReceipts.forEach(item => {
                        console.log(`🗑️ Deleting corrupted receipt: ${item.firebaseId}`);
                        deletionUpdates[`receipts/${item.firebaseId}`] = null;
                        deletedCount++;
                    });

                    // Execute deletions
                    if (Object.keys(deletionUpdates).length > 0) {
                        console.log('🚀 Executing cleanup:', deletionUpdates);
                        await update(ref(rtdb), deletionUpdates);
                    }

                    console.log('✅ Duplicate fix completed');

                    // Refresh the display
                    await this.loadReceipts();

                    Swal.fire({
                        icon: 'success',
                        title: 'Issues Fixed',
                        html: `
                            <p>Successfully cleaned up:</p>
                            <ul>
                                <li>${actualDuplicates.length} duplicate groups</li>
                                <li>${corruptedReceipts.length} corrupted receipt IDs</li>
                                <li>${deletedCount} total receipts removed</li>
                            </ul>
                            <p>The receipt list has been refreshed.</p>
                        `
                    });

                } catch (error) {
                    console.error('❌ Error during duplicate fix:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Fix Failed',
                        text: 'Failed to fix duplicate receipts: ' + error.message
                    });
                }
            },

            async testReceiptFlow() {
                console.log('🧪 Testing complete receipt flow...');

                try {
                    // Test 1: Verify receipt structure consistency
                    console.log('📋 Test 1: Receipt structure consistency');
                    const receiptsSnapshot = await get(ref(rtdb, 'receipts'));
                    const receiptsData = receiptsSnapshot.val() || {};

                    let structureIssues = 0;
                    let validReceipts = 0;

                    Object.entries(receiptsData).forEach(([firebaseId, receipt]) => {
                        // Updated test: only check for proper Firebase ID and basic id field
                        // receiptId is a legacy field that's no longer required
                        if (firebaseId.startsWith('-') && receipt.id) {
                            validReceipts++;
                        } else {
                            structureIssues++;
                            console.warn('⚠️ Structure issue:', firebaseId, {
                                hasProperFirebaseId: firebaseId.startsWith('-'),
                                hasIdField: !!receipt.id,
                                issue: !firebaseId.startsWith('-') ? 'Invalid Firebase ID format' : 'Missing id field'
                            });
                        }
                    });

                    // Test 2: Verify no duplicate detection false positives
                    console.log('🔍 Test 2: Duplicate detection accuracy');
                    let duplicateTests = 0;
                    let falsePositives = 0;

                    const receiptEntries = Object.entries(receiptsData);
                    for (let i = 0; i < Math.min(5, receiptEntries.length); i++) {
                        const [firebaseId, receipt] = receiptEntries[i];
                        if (receipt.invoiceNumber && receipt.guestPhoneNumber && receipt.date) {
                            duplicateTests++;

                            // Simulate duplicate check
                            const duplicateCheck = Object.entries(receiptsData).filter(([otherId, otherReceipt]) =>
                                otherId !== firebaseId &&
                                otherReceipt.guestPhoneNumber === receipt.guestPhoneNumber &&
                                otherReceipt.invoiceNumber === receipt.invoiceNumber &&
                                otherReceipt.date === receipt.date
                            );

                            if (duplicateCheck.length > 0) {
                                falsePositives++;
                                console.warn('🚨 Duplicate found:', {
                                    original: firebaseId,
                                    duplicates: duplicateCheck.map(([id]) => id)
                                });
                            }
                        }
                    }

                    // Test 3: Check guest-receipts index consistency
                    console.log('📇 Test 3: Guest-receipts index consistency');
                    const guestReceiptsSnapshot = await get(ref(rtdb, 'guest-receipts'));
                    const guestReceiptsData = guestReceiptsSnapshot.val() || {};

                    let indexIssues = 0;
                    let validIndexes = 0;

                    Object.entries(guestReceiptsData).forEach(([phone, receipts]) => {
                        Object.entries(receipts || {}).forEach(([receiptId, indexData]) => {
                            // Check if receipt exists in main collection
                            if (receiptsData[receiptId]) {
                                validIndexes++;
                            } else {
                                indexIssues++;
                                console.warn('🔗 Orphaned index:', phone, receiptId);
                            }
                        });
                    });

                    // Test 4: Verify Firebase ID format compliance
                    console.log('🆔 Test 4: Firebase ID format compliance');
                    const invalidIds = Object.keys(receiptsData).filter(id =>
                        !id.startsWith('-') || id.length < 10 || id.match(/^\d+$/)
                    );

                    // Show results
                    const results = {
                        structureTest: {
                            valid: validReceipts,
                            issues: structureIssues,
                            passed: structureIssues === 0
                        },
                        duplicateTest: {
                            tested: duplicateTests,
                            falsePositives: falsePositives,
                            passed: falsePositives === 0
                        },
                        indexTest: {
                            validIndexes: validIndexes,
                            orphanedIndexes: indexIssues,
                            passed: indexIssues === 0
                        },
                        idFormatTest: {
                            totalReceipts: Object.keys(receiptsData).length,
                            invalidIds: invalidIds.length,
                            passed: invalidIds.length === 0
                        }
                    };

                    console.log('🧪 Test Results:', results);

                    const allTestsPassed = Object.values(results).every(test => test.passed);

                    let resultsHtml = '<div class="text-start">';
                    resultsHtml += `<h6>📊 Test Results Summary</h6>`;
                    resultsHtml += `<table class="table table-sm">`;
                    resultsHtml += `<tr><td>Structure Consistency</td><td>${results.structureTest.passed ? '✅ PASS' : '❌ FAIL'}</td><td>${results.structureTest.valid}/${results.structureTest.valid + results.structureTest.issues}</td></tr>`;
                    resultsHtml += `<tr><td>Duplicate Detection</td><td>${results.duplicateTest.passed ? '✅ PASS' : '❌ FAIL'}</td><td>${results.duplicateTest.falsePositives} false positives</td></tr>`;
                    resultsHtml += `<tr><td>Index Consistency</td><td>${results.indexTest.passed ? '✅ PASS' : '❌ FAIL'}</td><td>${results.indexTest.orphanedIndexes} orphaned</td></tr>`;
                    resultsHtml += `<tr><td>ID Format Compliance</td><td>${results.idFormatTest.passed ? '✅ PASS' : '❌ FAIL'}</td><td>${results.idFormatTest.invalidIds} invalid</td></tr>`;
                    resultsHtml += `</table>`;
                    resultsHtml += '</div>';

                    Swal.fire({
                        icon: allTestsPassed ? 'success' : 'warning',
                        title: allTestsPassed ? 'All Tests Passed!' : 'Issues Found',
                        html: resultsHtml + (allTestsPassed ?
                            '<p class="text-success mt-3"><strong>🎉 Receipt flow is working correctly!</strong></p>' :
                            '<p class="text-warning mt-3"><strong>⚠️ Some issues need attention. Check console for details.</strong></p>'
                        )
                    });

                } catch (error) {
                    console.error('❌ Error during receipt flow test:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Test Failed',
                        text: 'Failed to run receipt flow test: ' + error.message
                    });
                }
            },

            async cleanupOrphanedIndexes() {
                console.log('🧹 Starting cleanup of orphaned guest-receipt indexes...');

                try {
                    // Get all receipts and guest-receipts
                    const [receiptsSnapshot, guestReceiptsSnapshot] = await Promise.all([
                        get(ref(rtdb, 'receipts')),
                        get(ref(rtdb, 'guest-receipts'))
                    ]);

                    const receiptsData = receiptsSnapshot.val() || {};
                    const guestReceiptsData = guestReceiptsSnapshot.val() || {};

                    console.log('📊 Current state:', {
                        totalReceipts: Object.keys(receiptsData).length,
                        totalGuestReceiptUsers: Object.keys(guestReceiptsData).length
                    });

                    const orphanedIndexes = [];
                    const deletionUpdates = {};
                    const usersToDelete = [];

                    // Check each guest-receipt index
                    Object.entries(guestReceiptsData).forEach(([phone, receipts]) => {
                        const userOrphans = [];
                        const validReceipts = [];

                        Object.entries(receipts || {}).forEach(([receiptId, indexData]) => {
                            // Check if this receipt ID exists in main receipts collection
                            if (!receiptsData[receiptId]) {
                                userOrphans.push({
                                    phone: phone,
                                    receiptId: receiptId,
                                    indexData: indexData
                                });
                            } else {
                                validReceipts.push(receiptId);
                            }
                        });

                        // Add orphans to main list
                        orphanedIndexes.push(...userOrphans);

                        // Decide deletion strategy per user
                        if (validReceipts.length === 0 && userOrphans.length > 0) {
                            // All receipts are orphaned - delete entire user node
                            console.log(`🧹 User ${phone} has no valid receipts, will remove entire user node`);
                            usersToDelete.push(phone);
                            deletionUpdates[`guest-receipts/${phone}`] = null;
                        } else if (userOrphans.length > 0) {
                            // Some receipts are orphaned - delete individual orphans
                            console.log(`🧹 User ${phone} has ${userOrphans.length} orphaned receipts, will remove individually`);
                            userOrphans.forEach(orphan => {
                                deletionUpdates[`guest-receipts/${phone}/${orphan.receiptId}`] = null;
                            });
                        }
                    });

                    if (orphanedIndexes.length === 0) {
                        Swal.fire({
                            icon: 'success',
                            title: 'No Orphaned Indexes',
                            text: 'All guest-receipt indexes are properly linked to existing receipts.'
                        });
                        return;
                    }

                    console.log('🔍 Found orphaned indexes:', orphanedIndexes);

                    // Group by phone for display
                    const orphansByPhone = orphanedIndexes.reduce((acc, item) => {
                        if (!acc[item.phone]) acc[item.phone] = [];
                        acc[item.phone].push(item.receiptId);
                        return acc;
                    }, {});

                    let orphansHtml = '<div class="text-start">';
                    orphansHtml += `<h6>🔗 Found ${orphanedIndexes.length} Orphaned Indexes:</h6>`;

                    if (usersToDelete.length > 0) {
                        orphansHtml += `<h6 class="text-danger">🗑️ Users to be completely removed (${usersToDelete.length}):</h6>`;
                        orphansHtml += '<ul>';
                        usersToDelete.forEach(phone => {
                            const receiptIds = orphansByPhone[phone] || [];
                            orphansHtml += `<li><strong>${phone}:</strong> All ${receiptIds.length} receipts orphaned - removing entire user</li>`;
                        });
                        orphansHtml += '</ul>';
                    }

                    const partialUsers = Object.keys(orphansByPhone).filter(phone => !usersToDelete.includes(phone));
                    if (partialUsers.length > 0) {
                        orphansHtml += `<h6 class="text-warning">🔧 Users with partial cleanup (${partialUsers.length}):</h6>`;
                        orphansHtml += '<ul>';
                        partialUsers.forEach(phone => {
                            const receiptIds = orphansByPhone[phone] || [];
                            orphansHtml += `<li><strong>${phone}:</strong> Removing ${receiptIds.join(', ')}</li>`;
                        });
                        orphansHtml += '</ul>';
                    }

                    orphansHtml += '<p class="text-muted">These indexes point to receipts that no longer exist in the main collection.</p>';
                    orphansHtml += '</div>';

                    const result = await Swal.fire({
                        title: 'Orphaned Indexes Found',
                        html: orphansHtml,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Clean Up Indexes',
                        cancelButtonText: 'Cancel',
                        confirmButtonColor: '#17a2b8'
                    });

                    if (!result.isConfirmed) {
                        return;
                    }

                    // Execute cleanup
                    console.log('🚀 Executing orphaned index cleanup:', deletionUpdates);
                    await update(ref(rtdb), deletionUpdates);

                    console.log('✅ Orphaned index cleanup completed');

                    // Refresh the display
                    await this.loadReceipts();

                    Swal.fire({
                        icon: 'success',
                        title: 'Cleanup Complete',
                        html: `
                            <p>Successfully cleaned up:</p>
                            <ul>
                                <li>${orphanedIndexes.length} orphaned receipt indexes</li>
                                <li>${usersToDelete.length} user(s) completely removed</li>
                                <li>${Object.keys(orphansByPhone).filter(phone => !usersToDelete.includes(phone)).length} user(s) partially cleaned</li>
                            </ul>
                            <p>All guest-receipt indexes now properly link to existing receipts.</p>
                        `
                    });

                } catch (error) {
                    console.error('❌ Error during orphaned index cleanup:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Cleanup Failed',
                        text: 'Failed to clean up orphaned indexes: ' + error.message
                    });
                }
            }
        },
        computed: {
            filteredReceipts() {
                return this.receipts.filter(receipt => {
                    const matchesStatus = !this.filters.status || receipt.status === this.filters.status;
                    const matchesGuest = !this.filters.guestName ||
                        (receipt.guestName && receipt.guestName.toLowerCase().includes(this.filters.guestName.toLowerCase()));
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
        mounted() {
            this.loadReceipts();
            this.loadCampaigns();
        }
    });

    app.mount('#receiptManagementContent');
}

export function cleanupReceiptManagement() {
    const mountPoint = document.getElementById('receiptManagementContent');
    if (mountPoint && mountPoint.__vue_app__) {
        mountPoint.__vue_app__.unmount();
    }
}