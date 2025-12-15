import { auth, rtdb, ref, get, set, update, remove } from './config/firebase-config.js';

export function initializeRewardManagement() {
    console.log('Initializing reward management...');
    
    // Clean up any existing instance
    if (window.rewardManagementApp) {
        console.log('Cleaning up existing reward management app...');
        try {
            window.rewardManagementApp.unmount();
        } catch (error) {
            console.warn('Error unmounting existing app:', error);
        }
        window.rewardManagementApp = null;
    }
    
    // Ensure the mount point exists and is clean
    const mountPoint = document.getElementById('reward-management-app');
    if (!mountPoint) {
        console.error('Reward management mount point not found');
        return null;
    }
    
    // Clear any existing content to prevent conflicts
    mountPoint.innerHTML = '';
    
    const app = Vue.createApp({
        template: `
            <!-- Filters -->
            <div class="card mb-4">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="card-title mb-0">Filters</h5>
                        <button @click="loadRewards" class="btn btn-primary btn-sm" :disabled="loading">
                            <i class="fas fa-sync-alt" :class="{ 'fa-spin': loading }"></i>
                            {{ loading ? 'Loading...' : 'Refresh' }}
                        </button>
                    </div>
                    <div class="row g-3">
                        <div class="col-md-3">
                            <label class="form-label">Status</label>
                            <select v-model="filters.status" class="form-select">
                                <option value="">All</option>
                                <option value="pending">Pending</option>
                                <option value="available">Available</option>
                                <option value="redeemed">Redeemed</option>
                                <option value="expired">Expired</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Guest Name</label>
                            <input type="text" v-model="filters.guestName" class="form-control" placeholder="Search guest...">
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Reward Type</label>
                            <select v-model="filters.rewardType" class="form-select">
                                <option value="">All Types</option>
                                <option v-for="type in rewardTypes" :key="type.id" :value="type.id">
                                    {{ type.name }}
                                </option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Date Range</label>
                            <div class="input-group">
                                <input type="date" v-model="filters.dateRange.start" class="form-control">
                                <input type="date" v-model="filters.dateRange.end" class="form-control">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Debug Info -->
            <div class="alert alert-info" v-if="rewards.length > 0 || error">
                <strong>Debug Info:</strong> 
                Total rewards loaded: {{ rewards.length }} | 
                Filtered rewards: {{ filteredRewards.length }} | 
                Status: {{ error || 'OK' }}
            </div>

            <!-- Rewards Table -->
            <div class="card">
                <div class="card-body">
                    <div v-if="loading" class="text-center py-4">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                    
                    <div v-else-if="error" class="alert alert-danger" role="alert">
                        {{ error }}
                    </div>
                    
                    <div v-else>
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Guest</th>
                                        <th>Campaign</th>
                                        <th>Type</th>
                                        <th>Reward ID</th>
                                        <th>Value</th>
                                        <th>Status</th>
                                        <th>Expires</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="reward in filteredRewards" :key="reward.id">
                                        <td>{{ formatDate(reward.createdAt) }}</td>
                                        <td>{{ reward.guestName }}</td>
                                        <td>{{ reward.campaignName }}</td>
                                        <td>{{ reward.metadata?.description || 'Standard Reward' }}</td>
                                        <td><code>{{ reward.id }}</code></td>
                                        <td>{{ formatRewardValue(reward) }}</td>
                                        <td>
                                            <span :class="['badge', getStatusBadgeClass(reward.status)]">
                                                {{ reward.status }}
                                            </span>
                                        </td>
                                        <td>{{ formatDate(reward.expiresAt) }}</td>
                                        <td>
                                            <div class="btn-group btn-group-sm" role="group">
                                                <button @click="showRewardDetails(reward)" 
                                                        class="btn btn-outline-primary" title="View Details">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                <button v-if="reward.status === 'pending' || reward.status === 'available'"
                                                        @click="markRewardAsRedeemed(reward)"
                                                        class="btn btn-outline-success" title="Mark as Redeemed">
                                                    <i class="fas fa-check"></i>
                                                </button>
                                                <button v-if="reward.status !== 'expired'"
                                                        @click="expireReward(reward)"
                                                        class="btn btn-outline-warning" title="Expire Reward">
                                                    <i class="fas fa-clock"></i>
                                                </button>
                                                <button @click="deleteReward(reward)"
                                                        class="btn btn-outline-danger" title="Delete Reward">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        
                        <div v-if="filteredRewards.length === 0" class="text-center py-4">
                            <p class="text-muted">No rewards found matching the current filters.</p>
                        </div>
                    </div>
                </div>
            </div>
        `,
        data() {
            return {
                rewards: [],
                loading: false,
                error: null,
                filters: {
                    status: '',
                    guestName: '',
                    rewardType: '',
                    dateRange: {
                        start: '',
                        end: ''
                    }
                },
                rewardTypes: [],
                campaigns: [],
                statistics: {
                    total: 0,
                    pending: 0,
                    redeemed: 0,
                    expired: 0
                }
            };
        },

        methods: {
            async loadRewards() {
                this.loading = true;
                this.error = null;
                try {
                    console.log('Loading rewards from database...');
                    const rewardsRef = ref(rtdb, 'rewards');
                    console.log('Database path:', 'rewards');
                    
                    const snapshot = await get(rewardsRef);
                    console.log('Snapshot received - exists:', snapshot.exists());
                    console.log('Snapshot exists:', snapshot.exists());
                    
                    const data = snapshot.val() || {};
                    console.log('Raw rewards data:', data);
                    console.log('Number of rewards in database:', Object.keys(data).length);
                    
                    this.rewards = Object.entries(data).map(([id, reward]) => {
                        console.log(`Processing reward ${id}:`, reward);
                        return {
                            id,
                            ...reward
                        };
                    });
                    
                    console.log('Processed rewards:', this.rewards);
                    console.log('Final rewards count:', this.rewards.length);
                    
                    this.updateStatistics();
                } catch (error) {
                    console.error('Error loading rewards:', error);
                    console.error('Error details:', error.message);
                    this.error = `Failed to load rewards: ${error.message}`;
                } finally {
                    this.loading = false;
                }
            },

            async loadRewardTypes() {
                try {
                    const snapshot = await get(ref(rtdb, 'rewardTypes'));
                    const data = snapshot.val() || {};
                    this.rewardTypes = Object.entries(data).map(([id, type]) => ({
                        id,
                        ...type
                    }));
                } catch (error) {
                    console.error('Error loading reward types:', error);
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

            updateStatistics() {
                this.statistics.total = this.rewards.length;
                this.statistics.pending = this.rewards.filter(r => r.status === 'pending').length;
                this.statistics.redeemed = this.rewards.filter(r => r.status === 'redeemed').length;
                this.statistics.expired = this.rewards.filter(r => r.status === 'expired').length;
                
                // Update the DOM counters
                this.updateCounter('totalRewardsCount', this.statistics.total);
                this.updateCounter('pendingRewardsCount', this.statistics.pending);
                this.updateCounter('redeemedRewardsCount', this.statistics.redeemed);
                this.updateCounter('expiredRewardsCount', this.statistics.expired);
            },

            updateCounter(elementId, value) {
                const element = document.getElementById(elementId);
                if (element) {
                    element.textContent = value;
                }
            },

            async markRewardAsRedeemed(reward) {
                try {
                    const result = await Swal.fire({
                        title: 'Mark as Redeemed?',
                        text: `Mark reward for ${reward.guestName} as redeemed?`,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonColor: '#28a745',
                        confirmButtonText: 'Yes, mark as redeemed'
                    });

                    if (result.isConfirmed) {
                        await update(ref(rtdb, `rewards/${reward.id}`), {
                            status: 'redeemed',
                            redeemedAt: Date.now(),
                            updatedAt: Date.now()
                        });
                        
                        await this.loadRewards();
                        Swal.fire('Success!', 'Reward marked as redeemed', 'success');
                    }
                } catch (error) {
                    console.error('Error marking reward as redeemed:', error);
                    Swal.fire('Error', 'Failed to update reward status', 'error');
                }
            },

            async expireReward(reward) {
                try {
                    const result = await Swal.fire({
                        title: 'Expire Reward?',
                        text: `Expire reward for ${reward.guestName}?`,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#ffc107',
                        confirmButtonText: 'Yes, expire it'
                    });

                    if (result.isConfirmed) {
                        await update(ref(rtdb, `rewards/${reward.id}`), {
                            status: 'expired',
                            expiredAt: Date.now(),
                            updatedAt: Date.now()
                        });
                        
                        await this.loadRewards();
                        Swal.fire('Success!', 'Reward expired', 'success');
                    }
                } catch (error) {
                    console.error('Error expiring reward:', error);
                    Swal.fire('Error', 'Failed to expire reward', 'error');
                }
            },

            async deleteReward(reward) {
                try {
                    const result = await Swal.fire({
                        title: 'Delete Reward?',
                        text: `Permanently delete reward for ${reward.guestName}? This cannot be undone.`,
                        icon: 'error',
                        showCancelButton: true,
                        confirmButtonColor: '#dc3545',
                        confirmButtonText: 'Yes, delete it',
                        cancelButtonText: 'Cancel'
                    });

                    if (result.isConfirmed) {
                        // Remove from main rewards collection
                        await remove(ref(rtdb, `rewards/${reward.id}`));
                        
                        // Remove from guest-rewards index
                        if (reward.guestPhone) {
                            await remove(ref(rtdb, `guest-rewards/${reward.guestPhone}/${reward.id}`));
                        }
                        
                        // Remove from campaign-rewards index
                        if (reward.campaignId) {
                            await remove(ref(rtdb, `campaign-rewards/${reward.campaignId}/${reward.id}`));
                        }
                        
                        await this.loadRewards();
                        Swal.fire('Deleted!', 'Reward has been deleted', 'success');
                    }
                } catch (error) {
                    console.error('Error deleting reward:', error);
                    Swal.fire('Error', 'Failed to delete reward', 'error');
                }
            },

            async showRewardDetails(reward) {
                const formatValue = this.formatRewardValue(reward);
                const receiptDetails = reward.receiptAmount ? `<p><strong>Receipt Amount:</strong> R${reward.receiptAmount}</p>` : '';
                const voucherDetails = reward.voucherCode ? `<p><strong>Voucher Code:</strong> <code>${reward.voucherCode}</code></p>` : '';
                
                Swal.fire({
                    title: 'Reward Details',
                    html: `
                        <div class="text-start">
                            <p><strong>Reward ID:</strong> <code>${reward.id}</code></p>
                            <p><strong>Guest:</strong> ${reward.guestName}</p>
                            <p><strong>Phone:</strong> ${reward.guestPhone}</p>
                            <p><strong>Campaign:</strong> ${reward.campaignName}</p>
                            <p><strong>Type:</strong> ${reward.metadata?.description || 'Standard Reward'}</p>
                            <p><strong>Value:</strong> ${formatValue}</p>
                            <p><strong>Status:</strong> <span class="badge bg-${this.getStatusBadgeColor(reward.status)}">${reward.status}</span></p>
                            <p><strong>Created:</strong> ${this.formatDate(reward.createdAt)}</p>
                            <p><strong>Expires:</strong> ${this.formatDate(reward.expiresAt)}</p>
                            ${receiptDetails}
                            ${voucherDetails}
                            ${reward.redeemedAt ? `<p><strong>Redeemed:</strong> ${this.formatDate(reward.redeemedAt)}</p>` : ''}
                        </div>
                    `,
                    width: 600,
                    confirmButtonText: 'Close'
                });
            },

            getStatusBadgeClass(status) {
                const classes = {
                    pending: 'bg-warning',
                    available: 'bg-success',
                    redeemed: 'bg-primary',
                    expired: 'bg-danger'
                };
                return classes[status] || 'bg-secondary';
            },

            getStatusBadgeColor(status) {
                const colors = {
                    pending: 'warning',
                    available: 'success',
                    redeemed: 'primary',
                    expired: 'danger'
                };
                return colors[status] || 'secondary';
            },

            formatDate(timestamp) {
                if (!timestamp) return 'N/A';
                return new Date(timestamp).toLocaleString();
            },

            formatRewardValue(reward) {
                if (!reward.value) return 'N/A';
                
                const type = reward.metadata?.type || 'standard';
                switch (type) {
                    case 'points':
                        return `${reward.value} points`;
                    case 'discount_percent':
                        return `${reward.value}% off`;
                    case 'discount_amount':
                        return `R${reward.value} off`;
                    case 'free_item':
                        return 'Free item';
                    default:
                                                 return `R${reward.value}`;
                 }
             },

            async verifyGuest(phoneNumber) {
                try {
                    const guestSnapshot = await get(ref(rtdb, `guests/${phoneNumber}`));
                    return guestSnapshot.val();
                } catch (error) {
                    console.error('Error verifying guest:', error);
                    return null;
                }
            },

            async showManualRewardModal() {
                const rewardTypeOptions = this.rewardTypes.length > 0 
                    ? this.rewardTypes.map(type => `<option value="${type.id}">${type.name}</option>`).join('')
                    : '<option value="">No reward types available</option>';

                const campaignOptions = this.campaigns.length > 0
                    ? this.campaigns.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
                    : '<option value="">No campaigns available</option>';

                const { value: formValues } = await Swal.fire({
                    title: 'Issue Manual Reward',
                    html: `
                        <div class="text-start">
                            <div class="mb-3">
                                <label class="form-label">Guest Phone Number *</label>
                                <div class="input-group">
                                    <input id="guestPhone" class="form-control" placeholder="+27123456789" required>
                                    <button type="button" id="verifyGuestBtn" class="btn btn-outline-primary">
                                        <i class="fas fa-search"></i> Verify
                                    </button>
                                </div>
                                <div id="guestStatus" class="form-text"></div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Guest Name *</label>
                                <input id="guestName" class="form-control" placeholder="John Doe" required readonly>
                                <div class="form-text">Will be auto-populated when guest is verified</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Campaign *</label>
                                <select id="campaignId" class="form-select" required>
                                    <option value="">Select Campaign</option>
                                    ${campaignOptions}
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Reward Type *</label>
                                <select id="rewardType" class="form-select" required>
                                    <option value="">Select Reward Type</option>
                                    ${rewardTypeOptions}
                                </select>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Value</label>
                                <input id="rewardValue" type="number" class="form-control" placeholder="100" step="0.01">
                                <div class="form-text">Leave empty for default reward value</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Description</label>
                                <input id="rewardDescription" class="form-control" placeholder="Manual reward description">
                                <div class="form-text">Optional custom description</div>
                            </div>
                        </div>
                    `,
                    width: 600,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonText: 'Issue Reward',
                    cancelButtonText: 'Cancel',
                    didOpen: () => {
                        const verifyBtn = document.getElementById('verifyGuestBtn');
                        const guestPhoneInput = document.getElementById('guestPhone');
                        const guestNameInput = document.getElementById('guestName');
                        const guestStatus = document.getElementById('guestStatus');
                        
                        let isGuestVerified = false;

                        // Guest verification function
                        const verifyGuest = async () => {
                            const phoneNumber = guestPhoneInput.value.trim();
                            if (!phoneNumber) {
                                guestStatus.innerHTML = '<span class="text-danger">Please enter a phone number</span>';
                                return;
                            }

                            verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
                            verifyBtn.disabled = true;
                            guestStatus.innerHTML = '<span class="text-info">Checking guest...</span>';

                            try {
                                const guest = await this.verifyGuest(phoneNumber);
                                
                                if (guest) {
                                    // Guest exists - populate data
                                    guestNameInput.value = guest.name || '';
                                    guestNameInput.readOnly = true;
                                    guestStatus.innerHTML = '<span class="text-success"><i class="fas fa-check"></i> Guest found and verified</span>';
                                    isGuestVerified = true;
                                } else {
                                    // Guest doesn't exist - offer to create
                                    guestNameInput.readOnly = false;
                                    guestStatus.innerHTML = `
                                        <span class="text-warning">
                                            <i class="fas fa-exclamation-triangle"></i> 
                                            Guest not found. Please enter their name below to create a new guest account.
                                        </span>
                                    `;
                                    isGuestVerified = false;
                                }
                            } catch (error) {
                                guestStatus.innerHTML = '<span class="text-danger">Error verifying guest. Please try again.</span>';
                                isGuestVerified = false;
                            } finally {
                                verifyBtn.innerHTML = '<i class="fas fa-search"></i> Verify';
                                verifyBtn.disabled = false;
                            }
                        };

                        // Event listeners
                        verifyBtn.addEventListener('click', verifyGuest);
                        
                        // Verify on Enter key
                        guestPhoneInput.addEventListener('keypress', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                verifyGuest();
                            }
                        });

                        // Reset verification when phone number changes
                        guestPhoneInput.addEventListener('input', () => {
                            isGuestVerified = false;
                            guestNameInput.value = '';
                            guestNameInput.readOnly = true;
                            guestStatus.innerHTML = '';
                        });

                        // Store verification state for validation
                        window.isGuestVerified = () => isGuestVerified || guestNameInput.value.trim();
                    },
                    preConfirm: () => {
                        const guestPhone = document.getElementById('guestPhone').value.trim();
                        const guestName = document.getElementById('guestName').value.trim();
                        const campaignId = document.getElementById('campaignId').value;
                        const rewardType = document.getElementById('rewardType').value;
                        const rewardValue = document.getElementById('rewardValue').value;
                        const description = document.getElementById('rewardDescription').value.trim();

                        // Validation
                        if (!guestPhone) {
                            Swal.showValidationMessage('Please enter a guest phone number');
                            return false;
                        }
                        if (!guestName) {
                            Swal.showValidationMessage('Please enter or verify the guest name');
                            return false;
                        }
                        if (!campaignId) {
                            Swal.showValidationMessage('Please select a campaign');
                            return false;
                        }
                        if (!rewardType) {
                            Swal.showValidationMessage('Please select a reward type');
                            return false;
                        }

                        return {
                            guestPhone,
                            guestName,
                            campaignId,
                            rewardType,
                            value: rewardValue ? parseFloat(rewardValue) : null,
                            description: description || null
                        };
                    }
                });

                if (formValues) {
                    await this.issueManualReward(formValues);
                }
            },

            async issueManualReward(data) {
                try {
                    // 1. Verify/Create guest
                    let guest = await this.verifyGuest(data.guestPhone);
                    let isNewGuest = false;
                    
                    if (!guest) {
                        // Create new guest
                        console.log('Creating new guest:', data.guestPhone, data.guestName);
                        const guestData = {
                            name: data.guestName,
                            phoneNumber: data.guestPhone,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            tier: 'Bronze', // Default tier
                            consent: {
                                status: 'pending',
                                platform: 'admin_manual',
                                timestamp: Date.now(),
                                version: '1.0'
                            }
                        };
                        
                        await set(ref(rtdb, `guests/${data.guestPhone}`), guestData);
                        guest = guestData;
                        isNewGuest = true;
                        console.log('New guest created successfully');
                    }

                    // 2. Get campaign and reward type details
                    const campaign = this.campaigns.find(c => c.id === data.campaignId);
                    const rewardType = this.rewardTypes.find(rt => rt.id === data.rewardType);
                    
                    if (!campaign) {
                        throw new Error('Campaign not found');
                    }
                    if (!rewardType) {
                        throw new Error('Reward type not found');
                    }

                    // 3. Calculate reward value and expiry
                    const defaultValue = this.calculateDefaultRewardValue(rewardType);
                    const finalValue = data.value !== null ? data.value : defaultValue;
                    const expiryDays = rewardType.validityDays || 30;
                    
                    // 4. Create reward object
                    const rewardId = `manual_${Date.now()}`;
                    const rewardData = {
                        id: rewardId,
                        typeId: data.rewardType,
                        guestPhone: data.guestPhone,
                        guestName: data.guestName,
                        campaignId: data.campaignId,
                        campaignName: campaign.name,
                        status: 'available',
                        value: finalValue,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        expiresAt: Date.now() + (expiryDays * 24 * 60 * 60 * 1000),
                        metadata: {
                            type: rewardType.category || 'standard',
                            description: data.description || rewardType.description || rewardType.name,
                            isManual: true,
                            createdBy: 'admin',
                            rewardTypeName: rewardType.name
                        }
                    };

                    // 5. Save to database
                    await set(ref(rtdb, `rewards/${rewardId}`), rewardData);
                    
                    // 6. Create indexes
                    await set(ref(rtdb, `guest-rewards/${data.guestPhone}/${rewardId}`), true);
                    await set(ref(rtdb, `campaign-rewards/${data.campaignId}/${rewardId}`), true);
                    
                    // 7. Refresh data and notify
                    await this.loadRewards();
                    
                    const successMessage = isNewGuest 
                        ? `Manual reward issued successfully!\n\nNew guest "${data.guestName}" was also created.`
                        : 'Manual reward issued successfully!';
                    
                    Swal.fire('Success!', successMessage, 'success');
                    
                } catch (error) {
                    console.error('Error issuing manual reward:', error);
                    Swal.fire('Error', `Failed to issue manual reward: ${error.message}`, 'error');
                }
            },

            calculateDefaultRewardValue(rewardType) {
                // Calculate a sensible default value based on reward type
                switch (rewardType.category) {
                    case 'discount':
                        return parseFloat(rewardType.value) || 10; // 10% default
                    case 'voucher':
                        return parseFloat(rewardType.value) || 50; // R50 default
                    case 'points':
                        return parseFloat(rewardType.value) || 100; // 100 points default
                    case 'freeItem':
                        return 1; // 1 free item
                    default:
                        return parseFloat(rewardType.value) || 0;
                }
            }
        },

        computed: {
            filteredRewards() {
                const filtered = this.rewards.filter(reward => {
                    // Status filter
                    if (this.filters.status && reward.status !== this.filters.status) {
                        return false;
                    }
                    
                    // Guest name filter
                    if (this.filters.guestName && 
                        !reward.guestName?.toLowerCase().includes(this.filters.guestName.toLowerCase())) {
                        return false;
                    }
                    
                    // Reward type filter
                    if (this.filters.rewardType && reward.typeId !== this.filters.rewardType) {
                        return false;
                    }
                    
                    // Date range filter
                    if (this.filters.dateRange.start || this.filters.dateRange.end) {
                        const rewardDate = new Date(reward.createdAt);
                        if (this.filters.dateRange.start) {
                            const startDate = new Date(this.filters.dateRange.start);
                            if (rewardDate < startDate) return false;
                        }
                        if (this.filters.dateRange.end) {
                            const endDate = new Date(this.filters.dateRange.end);
                            endDate.setHours(23, 59, 59, 999); // End of day
                            if (rewardDate > endDate) return false;
                        }
                    }
                    
                    return true;
                });
                
                console.log('Filtered rewards:', filtered.length, 'of', this.rewards.length);
                return filtered;
            }
        },

        async mounted() {
            console.log('Reward management component mounted');
            
            // Check authentication
            console.log('Current user:', auth.currentUser);
            console.log('User authenticated:', !!auth.currentUser);
            
            if (!auth.currentUser) {
                console.warn('No authenticated user found for reward management');
                this.error = 'Authentication required. Please log in as an admin.';
                return;
            }
            
            // Debug DOM visibility
            const appElement = document.getElementById('reward-management-app');
            console.log('App element found:', !!appElement);
            console.log('App element visible:', appElement ? getComputedStyle(appElement).display : 'N/A');
            console.log('App element classes:', appElement ? appElement.className : 'N/A');
            console.log('App element innerHTML length:', appElement ? appElement.innerHTML.length : 'N/A');
            
            await this.loadRewards();
            await this.loadRewardTypes();
            await this.loadCampaigns();
            
            // Setup manual reward button
            const manualRewardBtn = document.getElementById('manualReward-btn');
            if (manualRewardBtn) {
                manualRewardBtn.addEventListener('click', () => {
                    this.showManualRewardModal();
                });
            }
            
            // Ensure visibility after mounting
            setTimeout(() => {
                if (appElement) {
                    appElement.style.display = 'block';
                    appElement.style.visibility = 'visible';
                    console.log('Forced app element visibility');
                }
            }, 100);
        }
    });

    // Mount the app
    try {
        app.mount(mountPoint);
        window.rewardManagementApp = app; // Store the app instance, not the mounted component
        console.log('Reward management initialized successfully');
        return app;
    } catch (error) {
        console.error('Error mounting reward management app:', error);
        return null;
    }
} 