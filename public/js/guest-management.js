// Import Firebase dependencies
import { auth, rtdb, ref, get, push, set, update, remove, query, orderByChild, orderByKey, startAt, endAt, equalTo, limitToFirst, startAfter } from './config/firebase-config.js';
// Import subscription service for limit checking
import { canAddGuest } from './modules/access-control/services/subscription-service.js';
// Import pagination utility
import { DatabasePaginator } from './utils/database-paginator.js';

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

/**
 * Format phone number for display (ensure + prefix for international numbers)
 * @param {string} phoneNumber - Phone number to format
 * @returns {string} Display-formatted phone number
 */
function formatPhoneNumberForDisplay(phoneNumber) {
    if (!phoneNumber) return '';
    const normalized = normalizePhoneNumber(phoneNumber);
    // The new normalization already ensures + prefix, so just return it
    return normalized;
}

/**
 * Validate phone number format (accepts various formats)
 * @param {string} phoneNumber - Phone number to validate
 * @returns {Object} Validation result with isValid and normalized phone
 */
function validatePhoneNumber(phoneNumber) {
    if (!phoneNumber) {
        return { isValid: false, error: 'Phone number is required', normalized: '' };
    }
    
    const normalized = normalizePhoneNumber(phoneNumber);
    
    // Check if it's a valid South African number (starts with 27)
    if (!normalized.startsWith('27') || normalized.length < 11) {
        return { 
            isValid: false, 
            error: 'Phone number must be a valid South African number (e.g., +27827001116 or 27827001116)', 
            normalized: normalized 
        };
    }
    
    return { isValid: true, normalized: normalized };
}

// Add the cascading update function before the guestManagement object
/**
 * Cascading update function to sync guest name changes to related records
 * This function addresses the denormalization issue where guestName is stored
 * in multiple places (rewards, receipts, etc.) and needs to be updated when
 * the guest's name is changed in the main guest record.
 * 
 * @param {string} phoneNumber - The normalized phone number (used as the key)
 * @param {string} oldName - The old guest name (for logging/verification)
 * @param {string} newName - The new guest name to propagate
 * @returns {Promise<Object>} - Result object with success status and details
 */
async function cascadeGuestNameUpdate(phoneNumber, oldName, newName) {
    console.log('🔄 Starting cascading guest name update:', {
        phoneNumber,
        oldName,
        newName
    });
    
    const results = {
        success: false,
        errors: [],
        updatedRecords: {
            rewards: 0,
            receipts: 0,
            other: 0
        },
        details: []
    };
    
    try {
        // Step 1: Update all rewards with this guest's phone number
        console.log('1️⃣ Updating rewards...');
        const rewardsSnapshot = await get(ref(rtdb, 'rewards'));
        const rewardsData = rewardsSnapshot.val() || {};
        
        const rewardUpdates = {};
        let rewardUpdateCount = 0;
        
        Object.entries(rewardsData).forEach(([rewardId, reward]) => {
            if (reward.guestPhone === phoneNumber && reward.guestName !== newName) {
                rewardUpdates[`rewards/${rewardId}/guestName`] = newName;
                rewardUpdates[`rewards/${rewardId}/updatedAt`] = Date.now();
                rewardUpdates[`rewards/${rewardId}/lastCascadeUpdate`] = Date.now();
                rewardUpdateCount++;
                console.log(`   - Reward ${rewardId}: "${reward.guestName}" -> "${newName}"`);
            }
        });
        
        if (rewardUpdateCount > 0) {
            await update(ref(rtdb), rewardUpdates);
            results.updatedRecords.rewards = rewardUpdateCount;
            results.details.push(`Updated ${rewardUpdateCount} reward record(s)`);
        }
        
        // Step 2: Check for any other places where guest name might be stored
        // Look for any receipt fields that might have guest name (less common but possible)
        console.log('2️⃣ Checking receipts for guest name fields...');
        const receiptsSnapshot = await get(ref(rtdb, 'receipts'));
        const receiptsData = receiptsSnapshot.val() || {};
        
        const receiptUpdates = {};
        let receiptUpdateCount = 0;
        
        Object.entries(receiptsData).forEach(([receiptId, receipt]) => {
            if (receipt.guestPhoneNumber === phoneNumber) {
                // Check if receipt has a guestName field (some might, some might not)
                if (receipt.guestName && receipt.guestName !== newName) {
                    receiptUpdates[`receipts/${receiptId}/guestName`] = newName;
                    receiptUpdates[`receipts/${receiptId}/updatedAt`] = Date.now();
                    receiptUpdates[`receipts/${receiptId}/lastCascadeUpdate`] = Date.now();
                    receiptUpdateCount++;
                    console.log(`   - Receipt ${receiptId}: "${receipt.guestName}" -> "${newName}"`);
                }
            }
        });
        
        if (receiptUpdateCount > 0) {
            await update(ref(rtdb), receiptUpdates);
            results.updatedRecords.receipts = receiptUpdateCount;
            results.details.push(`Updated ${receiptUpdateCount} receipt record(s)`);
        }
        
        // Step 3: Check for any other collections that might have guest name
        // This is a safety check for any future extensions
        console.log('3️⃣ Checking other potential collections...');
        const otherCollections = ['vouchers', 'notifications', 'analytics-cache'];
        
        for (const collection of otherCollections) {
            try {
                const collectionSnapshot = await get(ref(rtdb, collection));
                const collectionData = collectionSnapshot.val() || {};
                
                const collectionUpdates = {};
                let collectionUpdateCount = 0;
                
                Object.entries(collectionData).forEach(([recordId, record]) => {
                    if (record.guestPhone === phoneNumber || record.guestPhoneNumber === phoneNumber) {
                        if (record.guestName && record.guestName !== newName) {
                            collectionUpdates[`${collection}/${recordId}/guestName`] = newName;
                            collectionUpdates[`${collection}/${recordId}/updatedAt`] = Date.now();
                            collectionUpdates[`${collection}/${recordId}/lastCascadeUpdate`] = Date.now();
                            collectionUpdateCount++;
                            console.log(`   - ${collection} ${recordId}: "${record.guestName}" -> "${newName}"`);
                        }
                    }
                });
                
                if (collectionUpdateCount > 0) {
                    await update(ref(rtdb), collectionUpdates);
                    results.updatedRecords.other += collectionUpdateCount;
                    results.details.push(`Updated ${collectionUpdateCount} ${collection} record(s)`);
                }
            } catch (error) {
                console.warn(`Warning: Could not process ${collection} collection:`, error);
                // Don't fail the entire operation for missing collections
            }
        }
        
        // Step 4: Update the main guest record to mark that a cascade update occurred
        console.log('4️⃣ Marking cascade update in guest record...');
        const guestRef = ref(rtdb, `guests/${phoneNumber}`);
        await update(guestRef, {
            lastCascadeUpdate: Date.now(),
            nameUpdateHistory: {
                [Date.now()]: {
                    oldName,
                    newName,
                    updatedRecords: results.updatedRecords
                }
            }
        });
        
        results.success = true;
        const totalUpdated = results.updatedRecords.rewards + results.updatedRecords.receipts + results.updatedRecords.other;
        
        console.log('✅ Cascade update completed successfully:', {
            totalUpdated,
            breakdown: results.updatedRecords
        });
        
        return results;
        
    } catch (error) {
        console.error('❌ Error in cascade update:', error);
        results.errors.push(`Cascade update failed: ${error.message}`);
        results.success = false;
        return results;
    }
}

// Guest Management State
const guestManagement = {
    app: null,
    component: {
        template: `
            <div class="container-fluid">
                <!-- Header Section (keep existing) -->
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2>Guest Management</h2>
                    <div class="d-flex gap-2">
                        <select
                            v-model="statusFilter"
                            @change="applyStatusFilter"
                            class="form-select"
                            style="width: auto;"
                            title="Filter by guest status"
                        >
                            <option value="all">All Guests</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        <input
                            type="text"
                            v-model="searchQuery"
                            class="form-control"
                            placeholder="Search guests (name or phone)..."
                        >
                        <button
                            @click="refreshData"
                            class="btn btn-outline-primary"
                            title="Refresh guest data"
                            :disabled="loading"
                        >
                            <i class="fas" :class="loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i>
                            {{ loading ? 'Refreshing...' : 'Refresh' }}
                        </button>
                        <button 
                            @click="showAddGuestModal" 
                            class="btn btn-primary"
                        >
                            <i class="fas fa-plus"></i> Add Guest
                        </button>
                        <button 
                            @click="debugGuestData" 
                            class="btn btn-outline-secondary"
                            title="Debug guest data inconsistencies"
                        >
                            <i class="fas fa-bug"></i> Debug
                        </button>
                        <button 
                            @click="fixDataConsistency" 
                            class="btn btn-warning"
                            title="Fix guest name inconsistencies in related records"
                        >
                            <i class="fas fa-sync-alt"></i> Fix Name Consistency
                        </button>
                    </div>
                </div>

                <!-- Add Analytics Summary -->
                <div class="row mb-4">
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body">
                                <h6 class="card-subtitle mb-2 text-muted">Total Guests</h6>
                                <h3 class="card-title mb-0">{{ guests.length }}</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body">
                                <h6 class="card-subtitle mb-2 text-muted">Active This Month</h6>
                                <h3 class="card-title mb-0">{{ activeGuestsCount }}</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body">
                                <h6 class="card-subtitle mb-2 text-muted">Avg Engagement</h6>
                                <h3 class="card-title mb-0">{{ averageEngagement }}%</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card">
                            <div class="card-body">
                                <h6 class="card-subtitle mb-2 text-muted">Total Revenue</h6>
                                <h3 class="card-title mb-0">R{{ totalRevenue.toFixed(2) }}</h3>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Main Table (Enhanced) -->
                <div class="card">
                    <div class="card-body">
                        <!-- Empty State -->
                        <div v-if="filteredGuests.length === 0 && !loading" class="text-center py-5">
                            <div class="mb-4">
                                <i class="fas fa-users" style="font-size: 4rem; color: #ccc;"></i>
                            </div>
                            <h4 class="text-muted mb-3">No guests yet</h4>
                            <p class="text-muted mb-4">
                                {{ searchQuery ? 'No guests match your search criteria.' : 'Start building your guest database by adding your first guest.' }}
                            </p>
                            <button v-if="!searchQuery" @click="showAddGuestModal" class="btn btn-primary btn-lg">
                                <i class="fas fa-plus me-2"></i>Add Guest
                            </button>
                            <button v-else @click="searchQuery = ''" class="btn btn-outline-secondary">
                                <i class="fas fa-times me-2"></i>Clear Search
                            </button>
                        </div>

                        <!-- Guest Table -->
                        <div v-else class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th @click="sort('name')">
                                            Name
                                            <i :class="getSortIcon('name')"></i>
                                        </th>
                                        <th @click="sort('phoneNumber')">
                                            Phone
                                            <i :class="getSortIcon('phoneNumber')"></i>
                                        </th>
                                        <th @click="sort('metrics.visitCount')">
                                            Visit Frequency
                                            <i :class="getSortIcon('metrics.visitCount')"></i>
                                        </th>
                                        <th @click="sort('metrics.totalSpent')">
                                            Total Spent
                                            <i :class="getSortIcon('metrics.totalSpent')"></i>
                                        </th>
                                        <th @click="sort('metrics.averageSpend')">
                                            Avg. Spend
                                            <i :class="getSortIcon('metrics.averageSpend')"></i>
                                        </th>
                                        <th @click="sort('metrics.engagementScore')">
                                            Engagement
                                            <i :class="getSortIcon('metrics.engagementScore')"></i>
                                        </th>
                                        <th>Favorite Store</th>
                                        <th>Last Visit</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="guest in filteredGuests" :key="guest.phoneNumber">
                                        <td>
                                            <span v-if="guest.name === '(Name Pending)'" class="text-muted fst-italic">
                                                {{ guest.name }}
                                            </span>
                                            <span v-else>
                                                {{ guest.name }}
                                            </span>
                                        </td>
                                        <td>{{ formatPhoneForDisplay(guest.phoneNumber) }}</td>
                                        <td>{{ guest.metrics?.visitCount || 0 }} visits</td>
                                        <td>R{{ (guest.metrics?.totalSpent || 0).toFixed(2) }}</td>
                                        <td>R{{ (guest.metrics?.averageSpend || 0).toFixed(2) }}</td>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="progress flex-grow-1" style="height: 8px;">
                                                    <div
                                                        class="progress-bar"
                                                        :class="getEngagementClass(guest.metrics?.engagementScore || 0)"
                                                        :style="{ width: (guest.metrics?.engagementScore || 0) + '%' }"
                                                    ></div>
                                                </div>
                                                <span class="ms-2">{{ guest.metrics?.engagementScore || 0 }}%</span>
                                            </div>
                                        </td>
                                        <td>{{ guest.metrics?.favoriteStore }}</td>
                                        <td>{{ formatDate(guest.metrics?.lastVisit) }}</td>
                                        <td>
                                            <div class="btn-group btn-group-sm">
                                                <button
                                                    @click="viewGuest(guest)"
                                                    class="btn btn-info"
                                                    title="View Guest"
                                                >
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                <button
                                                    @click="viewAnalytics(guest)"
                                                    class="btn btn-primary"
                                                    title="View Analytics"
                                                >
                                                    <i class="fas fa-chart-line"></i>
                                                </button>
                                                <button
                                                    @click="editGuest(guest)"
                                                    class="btn btn-warning"
                                                    title="Edit Guest"
                                                >
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button
                                                    @click="deleteGuest(guest)"
                                                    class="btn btn-danger"
                                                    title="Delete Guest"
                                                >
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <!-- Pagination Controls -->
                        <div v-if="pagination.enabled && filteredGuests.length > 0" class="d-flex justify-content-between align-items-center mt-4">
                            <div class="text-muted">
                                Showing {{ (pagination.currentPage - 1) * pagination.pageSize + 1 }}
                                to {{ Math.min(pagination.currentPage * pagination.pageSize, (pagination.currentPage - 1) * pagination.pageSize + filteredGuests.length) }}
                                of {{ pagination.totalGuests }} guests
                            </div>
                            <nav>
                                <ul class="pagination mb-0">
                                    <li class="page-item" :class="{ disabled: pagination.currentPage === 1 }">
                                        <button class="page-link" @click="goToFirstPage" :disabled="pagination.currentPage === 1">
                                            <i class="fas fa-step-backward"></i> First
                                        </button>
                                    </li>
                                    <li class="page-item" :class="{ disabled: pagination.currentPage === 1 }">
                                        <button class="page-link" @click="goToPrevPage" :disabled="pagination.currentPage === 1">
                                            <i class="fas fa-chevron-left"></i> Previous
                                        </button>
                                    </li>
                                    <li class="page-item active">
                                        <span class="page-link">
                                            Page {{ pagination.currentPage }}
                                        </span>
                                    </li>
                                    <li class="page-item" :class="{ disabled: !pagination.hasMore }">
                                        <button class="page-link" @click="goToNextPage" :disabled="!pagination.hasMore">
                                            Next <i class="fas fa-chevron-right"></i>
                                        </button>
                                    </li>
                                </ul>
                            </nav>
                            <div>
                                <select v-model.number="pagination.pageSize" @change="onPageSizeChange" class="form-select form-select-sm">
                                    <option :value="10">10 per page</option>
                                    <option :value="25">25 per page</option>
                                    <option :value="50">50 per page</option>
                                    <option :value="100">100 per page</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Analytics Modal -->
                <div class="modal fade" id="analyticsModal" tabindex="-1">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Guest Analytics</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div id="guestAnalyticsRoot"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `,

        data() {
            return {
                guests: [],
                loading: false,
                error: null,
                searchQuery: '',
                statusFilter: 'all', // Filter for guest status (all, active, inactive)
                sortConfig: {
                    key: 'name',
                    direction: 'asc'
                },
                currentAnalyticsGuest: null,
                searchDebounceTimer: null,
                // Pagination state
                pagination: {
                    enabled: true,
                    currentPage: 1,
                    pageSize: 25,
                    totalGuests: 0,
                    hasMore: false,
                    lastKey: null,
                    paginationHistory: [] // Track keys for going back
                },
                paginator: new DatabasePaginator(),
                // Idempotency flags to prevent double-click issues
                isSubmittingGuest: false,
                isDeletingGuest: false
            };
        },

        computed: {
            filteredGuests() {
                if (!Array.isArray(this.guests)) return [];

                // Firebase queries handle search and initial ordering
                // We only need to apply direction (asc/desc) client-side for Firebase-sorted data
                let result = [...this.guests];

                // Apply status filter
                if (this.statusFilter && this.statusFilter !== 'all') {
                    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
                    result = result.filter(guest => {
                        const lastVisit = guest?.metrics?.lastVisit;
                        const hasRecentActivity = lastVisit && new Date(lastVisit).getTime() > ninetyDaysAgo;

                        if (this.statusFilter === 'active') {
                            return hasRecentActivity;
                        } else if (this.statusFilter === 'inactive') {
                            return !hasRecentActivity;
                        }
                        return true;
                    });
                }

                const key = this.sortConfig?.key || 'name';
                const direction = this.sortConfig?.direction || 'asc';

                // Apply client-side sorting direction
                // (Firebase queries are always ascending, so we reverse for descending)
                result = result.sort((a, b) => {
                    let aVal = this.getSortValue(a, key) || '';
                    let bVal = this.getSortValue(b, key) || '';

                    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
                    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
                    return 0;
                });

                return result;
            },

            activeGuestsCount() {
                if (!Array.isArray(this.guests)) return 0;
                
                const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                return this.guests.filter(guest => {
                    const lastVisit = guest?.metrics?.lastVisit;
                    if (!lastVisit) return false;
                    return new Date(lastVisit).getTime() > thirtyDaysAgo;
                }).length;
            },

            averageEngagement() {
                if (!Array.isArray(this.guests) || this.guests.length === 0) return 0;
                
                const totalEngagement = this.guests.reduce((sum, guest) => 
                    sum + (guest?.metrics?.engagementScore || 0), 0
                );
                return Math.round(totalEngagement / this.guests.length);
            },

            totalRevenue() {
                if (!Array.isArray(this.guests)) return 0;
                
                return this.guests.reduce((sum, guest) => 
                    sum + (guest?.metrics?.totalSpent || 0), 0
                );
            }
        },

        methods: {
            formatPhoneForDisplay(phoneNumber) {
                return formatPhoneNumberForDisplay(phoneNumber);
            },

            /**
             * Read filter values from URL parameters and apply them
             */
            readFiltersFromURL() {
                const urlParams = new URLSearchParams(window.location.search);
                const statusParam = urlParams.get('status');

                if (statusParam && ['all', 'active', 'inactive'].includes(statusParam)) {
                    this.statusFilter = statusParam;
                    console.log('📋 Applied filter from URL:', statusParam);
                }
            },

            /**
             * Update URL when status filter changes
             */
            updateURLWithFilters() {
                const url = new URL(window.location.href);

                if (this.statusFilter && this.statusFilter !== 'all') {
                    url.searchParams.set('status', this.statusFilter);
                } else {
                    url.searchParams.delete('status');
                }

                // Update URL without reloading the page
                window.history.pushState({}, '', url);
                console.log('🔗 Updated URL with filter:', this.statusFilter);
            },

            /**
             * Handle status filter change
             */
            applyStatusFilter() {
                console.log('🎯 Status filter changed to:', this.statusFilter);
                this.updateURLWithFilters();
                this.loadGuests();
            },

            async refreshData() {
                console.log('Refreshing guest data...');
                await this.loadGuests();
                
                // Show a success toast notification
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'Guest data refreshed successfully',
                        showConfirmButton: false,
                        timer: 2000,
                        timerProgressBar: true
                    });
                }
            },

            async loadGuests() {
                this.loading = true;
                this.error = null;
                try {
                    console.log('🔄 Loading guests with Firebase query...', {
                        searchQuery: this.searchQuery,
                        sortConfig: this.sortConfig,
                        pagination: {
                            currentPage: this.pagination.currentPage,
                            pageSize: this.pagination.pageSize,
                            lastKey: this.pagination.lastKey
                        }
                    });

                    let guestsQuery = ref(rtdb, 'guests');
                    let guestsData = {};

                    // Build Firebase query based on search and sort configuration
                    // Note: Firebase RTDB can only order by one child at a time
                    if (this.searchQuery && this.searchQuery.trim()) {
                        const searchTerm = this.searchQuery.trim().toLowerCase();
                        console.log('🔍 Applying search filter:', searchTerm);

                        // For name search, use orderByChild with startAt/endAt for prefix matching
                        // Firebase requires the search term to match the beginning of the value
                        guestsQuery = query(
                            ref(rtdb, 'guests'),
                            orderByChild('name'),
                            startAt(searchTerm),
                            endAt(searchTerm + '\uf8ff') // Unicode character that sorts after all printable characters
                        );

                        const snapshot = await get(guestsQuery);
                        guestsData = snapshot.val() || {};
                        console.log('📊 Firebase name search results:', Object.keys(guestsData).length);

                        // Additionally search by phone number (key search)
                        // Check if search term could be a phone number
                        if (/^\d+/.test(searchTerm)) {
                            console.log('🔍 Also searching by phone number...');
                            const allGuestsSnapshot = await get(ref(rtdb, 'guests'));
                            const allGuests = allGuestsSnapshot.val() || {};

                            // Find guests by phone number (keys that contain the search term)
                            Object.entries(allGuests).forEach(([phoneKey, guestData]) => {
                                if (phoneKey.includes(searchTerm) || phoneKey.toLowerCase().includes(searchTerm)) {
                                    if (!guestsData[phoneKey]) {
                                        guestsData[phoneKey] = guestData;
                                        console.log('📞 Found by phone:', phoneKey);
                                    }
                                }
                            });
                        }
                    } else if (this.sortConfig?.key) {
                        // Apply Firebase sorting when no search is active
                        const sortKey = this.sortConfig.key;
                        console.log('📊 Applying Firebase sort:', sortKey);

                        // Map UI sort keys to Firebase child keys
                        // PAGINATION: Use limitToFirst() for all queries
                        if (sortKey === 'phoneNumber') {
                            // Phone number is the key, so use orderByKey with pagination
                            if (this.pagination.lastKey && this.pagination.currentPage > 1) {
                                guestsQuery = query(
                                    ref(rtdb, 'guests'),
                                    orderByKey(),
                                    startAfter(this.pagination.lastKey),
                                    limitToFirst(this.pagination.pageSize + 1) // +1 to check hasMore
                                );
                            } else {
                                guestsQuery = query(
                                    ref(rtdb, 'guests'),
                                    orderByKey(),
                                    limitToFirst(this.pagination.pageSize + 1)
                                );
                            }
                            const snapshot = await get(guestsQuery);
                            guestsData = snapshot.val() || {};
                            console.log(`📊 Firebase orderByKey with limitToFirst(${this.pagination.pageSize}) results:`, Object.keys(guestsData).length);
                        } else if (sortKey.startsWith('metrics.')) {
                            // Metrics are calculated client-side, cannot sort by Firebase
                            // Load paginated guests and sort client-side
                            console.log(`📊 Metrics sort - loading page ${this.pagination.currentPage} for client-side sorting`);
                            if (this.pagination.lastKey && this.pagination.currentPage > 1) {
                                guestsQuery = query(
                                    ref(rtdb, 'guests'),
                                    orderByKey(),
                                    startAfter(this.pagination.lastKey),
                                    limitToFirst(this.pagination.pageSize + 1)
                                );
                            } else {
                                guestsQuery = query(
                                    ref(rtdb, 'guests'),
                                    orderByKey(),
                                    limitToFirst(this.pagination.pageSize + 1)
                                );
                            }
                            const snapshot = await get(guestsQuery);
                            guestsData = snapshot.val() || {};
                            console.log(`📊 Loaded ${Object.keys(guestsData).length} guests for metrics sort (page ${this.pagination.currentPage})`);
                        } else if (sortKey === 'name' || sortKey === 'createdAt') {
                            // Sort by name or createdAt using Firebase orderByChild with pagination
                            if (this.pagination.lastKey && this.pagination.currentPage > 1) {
                                guestsQuery = query(
                                    ref(rtdb, 'guests'),
                                    orderByChild(sortKey),
                                    startAfter(this.pagination.lastKey),
                                    limitToFirst(this.pagination.pageSize + 1)
                                );
                            } else {
                                guestsQuery = query(
                                    ref(rtdb, 'guests'),
                                    orderByChild(sortKey),
                                    limitToFirst(this.pagination.pageSize + 1)
                                );
                            }
                            const snapshot = await get(guestsQuery);
                            guestsData = snapshot.val() || {};
                            console.log(`📊 Firebase orderByChild('${sortKey}') with limitToFirst(${this.pagination.pageSize}) results:`, Object.keys(guestsData).length);
                        } else {
                            // Unknown sort key - load paginated guests
                            console.log(`📊 Unknown sort key, loading page ${this.pagination.currentPage}`);
                            if (this.pagination.lastKey && this.pagination.currentPage > 1) {
                                guestsQuery = query(
                                    ref(rtdb, 'guests'),
                                    orderByKey(),
                                    startAfter(this.pagination.lastKey),
                                    limitToFirst(this.pagination.pageSize + 1)
                                );
                            } else {
                                guestsQuery = query(
                                    ref(rtdb, 'guests'),
                                    orderByKey(),
                                    limitToFirst(this.pagination.pageSize + 1)
                                );
                            }
                            const snapshot = await get(guestsQuery);
                            guestsData = snapshot.val() || {};
                        }
                    } else {
                        // No search or sort - load paginated guests
                        console.log(`📥 Loading page ${this.pagination.currentPage} (${this.pagination.pageSize} guests)`);
                        if (this.pagination.lastKey && this.pagination.currentPage > 1) {
                            guestsQuery = query(
                                ref(rtdb, 'guests'),
                                orderByKey(),
                                startAfter(this.pagination.lastKey),
                                limitToFirst(this.pagination.pageSize + 1)
                            );
                        } else {
                            guestsQuery = query(
                                ref(rtdb, 'guests'),
                                orderByKey(),
                                limitToFirst(this.pagination.pageSize + 1)
                            );
                        }
                        const snapshot = await get(guestsQuery);
                        guestsData = snapshot.val() || {};
                    }

                    console.log('✅ Firebase query complete, processing guests...');

                    // Handle pagination: Check if we have more data (we fetched pageSize + 1)
                    const guestKeys = Object.keys(guestsData);
                    this.pagination.hasMore = guestKeys.length > this.pagination.pageSize;

                    if (this.pagination.hasMore) {
                        // Remove the extra item (used to detect "has more")
                        const lastKeyToRemove = guestKeys.pop();
                        delete guestsData[lastKeyToRemove];
                        console.log('📄 Pagination: More data available, removed extra item');
                    }

                    // Store last key for next page navigation
                    const remainingKeys = Object.keys(guestsData);
                    if (remainingKeys.length > 0) {
                        this.pagination.lastKey = remainingKeys[remainingKeys.length - 1];
                        console.log('📄 Pagination: Last key for next page:', this.pagination.lastKey);
                    }

                    // Map guests, phoneNumber keys should already be normalized in database
                    const guestPromises = Object.entries(guestsData).map(async ([phoneNumber, data]) => {
                        // Add phoneNumber to data for metrics calculation
                        const guestDataWithPhone = { ...data, phoneNumber };

                        // Get guest receipts and calculate metrics
                        const metrics = await this.calculateGuestMetrics(guestDataWithPhone);

                        return {
                            phoneNumber, // This should already be normalized from database
                            name: data.name && data.name !== 'N/A' ? data.name : '(Name Pending)',
                            createdAt: data.createdAt,
                            lastConsentPrompt: data.lastConsentPrompt,
                            consent: data.consent || false,
                            tier: data.tier || 'Bronze',
                            updatedAt: data.updatedAt,
                            metrics
                        };
                    });

                    // Wait for all guest metrics to be calculated
                    this.guests = await Promise.all(guestPromises);
                    console.log('✅ Guests loaded and metrics calculated:', this.guests.length);

                    // Update total count (for pagination display)
                    // Only do this on first page to avoid unnecessary queries
                    if (this.pagination.currentPage === 1 || this.pagination.totalGuests === 0) {
                        await this.updateTotalGuestCount();
                    }
                } catch (error) {
                    console.error('❌ Error loading guests:', error);
                    console.error('❌ Error message:', error.message);
                    console.error('❌ Error stack:', error.stack);
                    this.error = 'Failed to load guests. Please try again.';
                    this.guests = [];
                } finally {
                    this.loading = false;
                }
            },

            async updateTotalGuestCount() {
                try {
                    const snapshot = await get(ref(rtdb, 'guests'));
                    this.pagination.totalGuests = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
                    console.log('📊 Total guests in database:', this.pagination.totalGuests);
                } catch (error) {
                    console.error('Error getting total guest count:', error);
                    this.pagination.totalGuests = 0;
                }
            },

            async calculateGuestMetrics(guestData) {
                if (!guestData || !guestData.phoneNumber) {
                    console.log('📊 No guest data or phone number for metrics calculation');
                    return {
                        visitCount: 0,
                        totalSpent: 0,
                        averageSpend: 0,
                        lastVisit: null,
                        favoriteStore: null,
                        engagementScore: this.calculateEngagementScore(guestData)
                    };
                }

                try {
                    // Normalize phone number for consistent lookup
                    const normalizedPhone = normalizePhoneNumber(guestData.phoneNumber);
                    console.log('📊 Calculating metrics for:', normalizedPhone);
                    
                    // Query receipts for this guest
                    const receiptsSnapshot = await get(ref(rtdb, 'receipts'));
                    const allReceipts = receiptsSnapshot.val() || {};
                    console.log('📊 Total receipts in database:', Object.keys(allReceipts).length);
                    
                    // Debug: Log sample receipt structure (only once)
                    if (!this.receiptStructureLogged) {
                        const sampleReceipt = Object.values(allReceipts)[0];
                        if (sampleReceipt) {
                            console.log('📊 Sample receipt full structure:', JSON.stringify(sampleReceipt, null, 2));
                            console.log('📊 Sample receipt keys:', Object.keys(sampleReceipt));
                            this.receiptStructureLogged = true;
                        }
                    }
                    
                    // Filter receipts for this guest (only validated receipts)
                    const guestReceipts = Object.values(allReceipts).filter(receipt => {
                        // Normalize receipt phone numbers for comparison
                        const receiptPhone = normalizePhoneNumber(receipt.guestPhoneNumber || receipt.phoneNumber || '');
                        const phoneMatch = receiptPhone === normalizedPhone;
                        const statusMatch = receipt.status === 'validated' || receipt.status === 'pending_validation' || !receipt.status; // Include receipts without status
                        
                        if (phoneMatch) {
                            console.log('📊 Phone match found:', receiptPhone, '(original:', receipt.guestPhoneNumber, ') status:', receipt.status);
                        }
                        
                        return phoneMatch && statusMatch;
                    });
                    
                    console.log('📊 Found receipts for', normalizedPhone, ':', guestReceipts.length);

                    if (guestReceipts.length === 0) {
                        const lastActivity = guestData.lastConsentPrompt || guestData.createdAt;
                        return {
                            visitCount: 0,
                            totalSpent: 0,
                            averageSpend: 0,
                            lastVisit: lastActivity,
                            favoriteStore: null,
                            engagementScore: this.calculateEngagementScore(guestData)
                        };
                    }

                    // Calculate metrics from actual receipt data
                    const totalSpent = guestReceipts.reduce((sum, receipt) => {
                        const amount = receipt.totalAmount || 0;
                        return sum + (typeof amount === 'number' ? amount : 0);
                    }, 0);

                    const visitCount = guestReceipts.length;
                    const averageSpend = visitCount > 0 ? totalSpent / visitCount : 0;

                    // Find most recent visit
                    const receiptDates = guestReceipts
                        .map(r => r.processedAt || r.createdAt)
                        .filter(date => date)
                        .sort((a, b) => b - a);
                    
                    const lastVisit = receiptDates.length > 0 ? 
                        new Date(receiptDates[0]).toISOString() : 
                        (guestData.lastConsentPrompt || guestData.createdAt);

                    // Calculate favorite store
                    const storeVisits = {};
                    guestReceipts.forEach(receipt => {
                        const storeName = receipt.fullStoreName || receipt.storeName || 'Unknown Store';
                        storeVisits[storeName] = (storeVisits[storeName] || 0) + 1;
                    });

                    const favoriteStore = Object.keys(storeVisits).length > 0 ?
                        Object.keys(storeVisits).reduce((a, b) => 
                            storeVisits[a] > storeVisits[b] ? a : b
                        ) : null;

                    const result = {
                        visitCount,
                        totalSpent: Math.round(totalSpent * 100) / 100, // Round to 2 decimal places
                        averageSpend: Math.round(averageSpend * 100) / 100,
                        lastVisit,
                        favoriteStore,
                        engagementScore: this.calculateEngagementScore(guestData)
                    };
                    
                    console.log('📊 Calculated metrics for', normalizedPhone, ':', result);
                    return result;

                } catch (error) {
                    console.error('Error calculating guest metrics:', error);
                    // Fall back to basic data if calculation fails
                    const lastActivity = guestData.lastConsentPrompt || guestData.createdAt;
                    return {
                        visitCount: 0,
                        totalSpent: 0,
                        averageSpend: 0,
                        lastVisit: lastActivity,
                        favoriteStore: null,
                        engagementScore: this.calculateEngagementScore(guestData)
                    };
                }
            },

            calculateEngagementScore(guestData) {
                if (!guestData) return 0;

                const now = new Date();
                const lastActivity = guestData.lastConsentPrompt || guestData.createdAt;
                if (!lastActivity) return 0;

                // Convert lastActivity to Date object if it's a string
                const lastActivityDate = new Date(lastActivity);
                
                // Calculate days since last activity
                const daysSinceLastActivity = (now - lastActivityDate) / (1000 * 60 * 60 * 24);
                
                // Score based on recency (max 100 points, decays over 30 days)
                const recencyScore = Math.max(0, 100 - (daysSinceLastActivity * (100 / 30)));
                
                // Score based on consent (additional 20 points if they've given consent)
                const consentScore = guestData.consent ? 20 : 0;
                
                // Calculate final score (weighted average)
                const finalScore = Math.round((recencyScore * 0.8) + (consentScore * 0.2));
                
                return Math.min(100, Math.max(0, finalScore));
            },

            async showAddGuestModal() {
                // Check guest limits before showing modal
                try {
                    const limitCheck = await canAddGuest();

                    // Only block if the limit is truly reached (not an error case)
                    if (!limitCheck.canAdd && !limitCheck.error) {
                        await Swal.fire({
                            title: 'Guest Limit Reached',
                            html: `
                                <div class="text-center">
                                    <p>${limitCheck.message}</p>
                                    <p class="mt-3"><strong>Current: ${limitCheck.currentCount} / ${limitCheck.limit}</strong></p>
                                </div>
                            `,
                            icon: 'warning',
                            showCancelButton: true,
                            confirmButtonText: 'Upgrade Plan',
                            cancelButtonText: 'Close'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                window.location.href = '/user-subscription.html';
                            }
                        });
                        return;
                    }
                    // If there's an error checking the limit, allow proceeding
                    if (limitCheck.error) {
                        console.warn('Guest limit check failed, allowing guest creation:', limitCheck.error);
                    }
                } catch (error) {
                    console.error('Error checking guest limits:', error);
                    // Allow proceeding if limit check fails
                }

                const { value: formValues } = await Swal.fire({
                    title: 'Add New Guest',
                    html: `
                        <div class="form-group mb-3">
                            <label for="name">Name</label>
                            <input id="name" class="form-control" placeholder="Guest Name">
                        </div>
                        <div class="form-group mb-3">
                            <label for="phoneNumber">Phone Number</label>
                            <input id="phoneNumber" class="form-control" placeholder="Phone number (e.g., +27827001116 or 27827001116)">
                            <small class="form-text text-muted">Accepts formats: +27827001116, 27827001116, or whatsapp:+27827001116</small>
                        </div>
                    `,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonText: 'Add',
                    cancelButtonText: 'Cancel',
                    preConfirm: () => {
                        // Prevent double submission
                        if (this.isSubmittingGuest) {
                            Swal.showValidationMessage('Please wait, submitting...');
                            return false;
                        }

                        const name = Swal.getPopup().querySelector('#name').value;
                        const phoneNumber = Swal.getPopup().querySelector('#phoneNumber').value;

                        if (!name || !phoneNumber) {
                            Swal.showValidationMessage('Please fill in all fields');
                            return false;
                        }

                        // Validate phone number format
                        const validation = validatePhoneNumber(phoneNumber);
                        if (!validation.isValid) {
                            Swal.showValidationMessage(validation.error);
                            return false;
                        }

                        return { name, phoneNumber: validation.normalized };
                    }
                });

                if (formValues) {
                    // Prevent double submission with flag
                    if (this.isSubmittingGuest) {
                        console.warn('Guest submission already in progress, ignoring duplicate request');
                        return;
                    }

                    this.isSubmittingGuest = true;
                    try {
                        const now = new Date().toISOString();
                        // Use normalized phone number as database key
                        const guestRef = ref(rtdb, `guests/${formValues.phoneNumber}`);

                        // DUPLICATE CHECK: Prevent duplicate phone numbers
                        const existingGuestSnapshot = await get(guestRef);

                        if (existingGuestSnapshot.exists()) {
                            // Guest already exists - show error and prevent creation
                            const existingGuest = existingGuestSnapshot.val();
                            await Swal.fire({
                                title: 'Guest Already Exists',
                                html: `
                                    <div class="text-center">
                                        <p>A guest with this phone number already exists:</p>
                                        <div class="alert alert-info mt-3">
                                            <strong>Name:</strong> ${existingGuest.name || 'N/A'}<br>
                                            <strong>Phone:</strong> ${formatPhoneNumberForDisplay(formValues.phoneNumber)}<br>
                                            <strong>Created:</strong> ${existingGuest.createdAt ? new Date(existingGuest.createdAt).toLocaleDateString() : 'N/A'}
                                        </div>
                                        <p class="mt-3">Please use a different phone number or edit the existing guest.</p>
                                    </div>
                                `,
                                icon: 'error',
                                confirmButtonText: 'OK'
                            });
                            return; // Exit without creating duplicate
                        }

                        // Create new guest (no existing guest found)
                        const guestData = {
                            name: formValues.name,
                            phoneNumber: formValues.phoneNumber, // Store normalized format
                            createdAt: now,
                            updatedAt: now,
                            consent: false,
                            tier: 'Bronze',
                            lastConsentPrompt: null
                        };

                        // Use set() for new guests to ensure clean creation
                        await set(guestRef, guestData);

                        await this.loadGuests();
                        Swal.fire('Success', 'Guest added successfully', 'success');
                    } catch (error) {
                        console.error('Error adding guest:', error);
                        Swal.fire('Error', 'Failed to add guest', 'error');
                    } finally {
                        // Always reset the flag, even if error occurred
                        this.isSubmittingGuest = false;
                    }
                }
            },

            async getGuestReceipts(phoneNumber) {
                try {
                    // Use normalized phone number for database operations
                    const normalizedPhone = normalizePhoneNumber(phoneNumber);
                    const receiptsRef = ref(rtdb, `receipts/${normalizedPhone}`);
                    const snapshot = await get(receiptsRef);
                    return snapshot.val() || {};
                } catch (error) {
                    console.error(`Error fetching receipts for ${phoneNumber}:`, error);
                    return {};
                }
            },

            getEngagementClass(score) {
                if (score >= 80) return 'bg-success';
                if (score >= 60) return 'bg-info';
                if (score >= 40) return 'bg-warning';
                return 'bg-danger';
            },

            formatDate(timestamp) {
                if (!timestamp) return 'Never';
                return new Date(timestamp).toLocaleDateString();
            },

            getSortValue(guest, key) {
                return guest[key];
            },

            sort(key) {
                if (this.sortConfig.key === key) {
                    this.sortConfig.direction = this.sortConfig.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortConfig.key = key;
                    this.sortConfig.direction = 'asc';
                }
            },

            getSortIcon(column) {
                if (this.sortConfig.key !== column) return 'fas fa-sort';
                return this.sortConfig.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            },

            async viewGuest(guest) {
                const html = `
                    <div class="container">
                        <div class="row mb-4">
                            <div class="col-md-6">
                                <h6 class="text-muted">Basic Information</h6>
                                <p><strong>Name:</strong> ${guest.name || 'N/A'}</p>
                                <p><strong>Phone:</strong> ${this.formatPhoneForDisplay(guest.phoneNumber)}</p>
                                <p><strong>Phone (DB Format):</strong> <code>${guest.phoneNumber}</code></p>
                                <p><strong>Loyalty Tier:</strong> ${guest.tier}</p>
                                <p><strong>Joined:</strong> ${this.formatDate(guest.createdAt)}</p>
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-muted">Engagement Information</h6>
                                <p><strong>Consent Status:</strong> ${guest.consent ? 'Given' : 'Not Given'}</p>
                                <p><strong>Last Consent Prompt:</strong> ${this.formatDate(guest.lastConsentPrompt)}</p>
                                <p><strong>Last Updated:</strong> ${this.formatDate(guest.updatedAt)}</p>
                                <p><strong>Engagement Score:</strong> 
                                    <span class="${this.getEngagementClass(guest.metrics.engagementScore)}">
                                        ${guest.metrics.engagementScore}%
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>`;

                await Swal.fire({
                    title: guest.name || 'Guest Details',
                    html: html,
                    width: '800px',
                    confirmButtonText: 'Close'
                });
            },

            async editGuest(guest) {
                const { value: formValues } = await Swal.fire({
                    title: 'Edit Guest',
                    html: `
                        <div class="form-group mb-3">
                            <label for="editName">Name</label>
                            <input id="editName" class="form-control" value="${guest.name || ''}" placeholder="Guest Name">
                        </div>
                        <div class="form-group mb-3">
                            <label for="editPhone">Phone Number</label>
                            <input id="editPhone" class="form-control" value="${this.formatPhoneForDisplay(guest.phoneNumber)}" readonly>
                            <small class="form-text text-muted">Phone number cannot be changed after creation</small>
                        </div>
                        <div class="form-group mb-3">
                            <label for="editTier">Loyalty Tier</label>
                            <select id="editTier" class="form-control">
                                <option value="Bronze" ${guest.tier === 'Bronze' ? 'selected' : ''}>Bronze</option>
                                <option value="Silver" ${guest.tier === 'Silver' ? 'selected' : ''}>Silver</option>
                                <option value="Gold" ${guest.tier === 'Gold' ? 'selected' : ''}>Gold</option>
                                <option value="Platinum" ${guest.tier === 'Platinum' ? 'selected' : ''}>Platinum</option>
                            </select>
                        </div>
                        <div class="form-group mb-3">
                            <label for="editConsent">Consent Status</label>
                            <select id="editConsent" class="form-control">
                                <option value="true" ${guest.consent ? 'selected' : ''}>Given</option>
                                <option value="false" ${!guest.consent ? 'selected' : ''}>Not Given</option>
                            </select>
                        </div>
                    `,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonText: 'Save',
                    cancelButtonText: 'Cancel',
                    preConfirm: () => {
                        const name = Swal.getPopup().querySelector('#editName').value;
                        const tier = Swal.getPopup().querySelector('#editTier').value;
                        const consent = Swal.getPopup().querySelector('#editConsent').value === 'true';
                        
                        if (!name) {
                            Swal.showValidationMessage('Please fill in all fields');
                            return false;
                        }
                        
                        return { name, tier, consent };
                    }
                });

                if (formValues) {
                    try {
                        // Use normalized phone number for database operations
                        const normalizedPhone = normalizePhoneNumber(guest.phoneNumber);
                        const guestRef = ref(rtdb, `guests/${normalizedPhone}`);
                        
                        // Check if name has changed to trigger cascade update
                        const nameChanged = guest.name !== formValues.name;
                        
                        if (nameChanged) {
                            // Show confirmation dialog about cascade update
                            const confirmCascade = await Swal.fire({
                                title: 'Name Change Detected',
                                html: `
                                    <p>You are changing the name from <strong>"${guest.name}"</strong> to <strong>"${formValues.name}"</strong>.</p>
                                    <p>This will also update the name in all related records (rewards, receipts, etc.) to maintain consistency.</p>
                                    <div class="alert alert-info mt-3">
                                        <i class="fas fa-info-circle"></i> This ensures all your data remains consistent across the platform.
                                    </div>
                                `,
                                icon: 'question',
                                showCancelButton: true,
                                confirmButtonText: 'Continue with Update',
                                cancelButtonText: 'Cancel',
                                confirmButtonColor: '#3085d6'
                            });
                            
                            if (!confirmCascade.isConfirmed) {
                                return; // User cancelled the operation
                            }
                        }
                        
                        // Update the main guest record
                        await update(guestRef, {
                            name: formValues.name,
                            tier: formValues.tier,
                            consent: formValues.consent,
                            updatedAt: new Date().toISOString(),
                            lastConsentPrompt: formValues.consent !== guest.consent ? new Date().toISOString() : guest.lastConsentPrompt
                        });
                        
                        // If name changed, perform cascade update
                        if (nameChanged) {
                            console.log('Name changed, performing cascade update...');
                            const cascadeResult = await cascadeGuestNameUpdate(
                                normalizedPhone,
                                guest.name,
                                formValues.name
                            );
                            
                            if (cascadeResult.success) {
                                const totalUpdated = cascadeResult.updatedRecords.rewards + 
                                                  cascadeResult.updatedRecords.receipts + 
                                                  cascadeResult.updatedRecords.other;
                                
                                if (totalUpdated > 0) {
                                    await Swal.fire({
                                        title: 'Update Complete',
                                        html: `
                                            <div class="text-start">
                                                <p><strong>Guest information updated successfully!</strong></p>
                                                <p>Related records updated:</p>
                                                <ul>
                                                    <li>Rewards: ${cascadeResult.updatedRecords.rewards}</li>
                                                    <li>Receipts: ${cascadeResult.updatedRecords.receipts}</li>
                                                    <li>Other: ${cascadeResult.updatedRecords.other}</li>
                                                </ul>
                                                <p class="text-muted">All data is now consistent across the platform.</p>
                                            </div>
                                        `,
                                        icon: 'success',
                                        confirmButtonText: 'Great!'
                                    });
                                } else {
                                    await Swal.fire('Success', 'Guest updated successfully (no related records needed updating)', 'success');
                                }
                            } else {
                                console.error('Cascade update failed:', cascadeResult.errors);
                                await Swal.fire({
                                    title: 'Partial Update',
                                    html: `
                                        <div class="text-start">
                                            <p>Guest information was updated, but there were some issues updating related records:</p>
                                            <ul>
                                                ${cascadeResult.errors.map(error => `<li class="text-danger">${error}</li>`).join('')}
                                            </ul>
                                            <p class="text-muted">You may need to use the "Fix Name Consistency" tool to resolve any remaining issues.</p>
                                        </div>
                                    `,
                                    icon: 'warning',
                                    confirmButtonText: 'I Understand'
                                });
                            }
                        } else {
                            await Swal.fire('Success', 'Guest updated successfully', 'success');
                        }
                        
                        await this.loadGuests();
                        
                    } catch (error) {
                        console.error('Error updating guest:', error);
                        Swal.fire('Error', `Failed to update guest: ${error.message}`, 'error');
                    }
                }
            },

            async deleteGuest(guest) {
                // Prevent double deletion
                if (this.isDeletingGuest) {
                    console.warn('Delete operation already in progress, ignoring duplicate request');
                    return;
                }

                console.log('🗑️ Starting guest deletion process...');
                console.log('Guest data:', {
                    name: guest.name,
                    phoneNumber: guest.phoneNumber,
                    displayPhone: this.formatPhoneForDisplay(guest.phoneNumber)
                });

                const result = await Swal.fire({
                    title: 'Delete Guest',
                    html: `
                        <p>Are you sure you want to delete <strong>${guest.name || 'this guest'}</strong>?</p>
                        <p><strong>Phone:</strong> ${this.formatPhoneForDisplay(guest.phoneNumber)}</p>
                        <p><strong>DB Key:</strong> <code>${guest.phoneNumber}</code></p>
                        <div class="alert alert-warning mt-3">
                            <strong>Warning:</strong> This will only delete the guest record. 
                            For complete data deletion including rewards and receipts, 
                            use the data management tools.
                        </div>
                    `,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Delete Guest Record',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#dc3545'
                });

                if (result.isConfirmed) {
                    // Set the flag to prevent duplicate deletes
                    this.isDeletingGuest = true;
                    try {
                        console.log('✅ User confirmed deletion, proceeding...');
                        
                        // Use the guest's phoneNumber directly as it's the exact database key
                        const originalPhone = guest.phoneNumber;
                        const databaseKey = guest.phoneNumber; // Don't normalize - use exact database key
                        
                        console.log('📱 Phone number processing:', {
                            original: originalPhone,
                            databaseKey: databaseKey,
                            areSame: originalPhone === databaseKey
                        });

                        const databasePath = `guests/${databaseKey}`;
                        console.log('🎯 Database path for deletion:', databasePath);
                        
                        // Check if guest exists before deletion
                        console.log('🔍 Pre-deletion verification...');
                        const preCheckRef = ref(rtdb, databasePath);
                        const preCheckSnapshot = await get(preCheckRef);
                        const preCheckExists = preCheckSnapshot.exists();
                        console.log('Pre-deletion check:', {
                            exists: preCheckExists,
                            data: preCheckSnapshot.val()
                        });
                        
                        if (!preCheckExists) {
                            console.error('❌ Guest not found in database at path:', databasePath);
                            Swal.fire('Error', 'Guest not found in database. Please refresh and try again.', 'error');
                            return;
                        }
                        
                        // Perform the deletion
                        console.log('🗑️ Executing deletion...');
                        const guestRef = ref(rtdb, databasePath);
                        await remove(guestRef);
                        console.log('✅ Delete operation completed');
                        
                        // Verify deletion
                        console.log('🔍 Post-deletion verification...');
                        const postCheckSnapshot = await get(preCheckRef);
                        const postCheckExists = postCheckSnapshot.exists();
                        console.log('Post-deletion check:', {
                            exists: postCheckExists,
                            data: postCheckSnapshot.val()
                        });
                        
                        if (postCheckExists) {
                            console.error('❌ Guest still exists after deletion!');
                            Swal.fire('Error', 'Failed to delete guest from database', 'error');
                            return;
                        }
                        
                        console.log('🔄 Refreshing guest list...');
                        await this.loadGuests();
                        console.log('✅ Guest list refreshed');
                        
                        // Check if guest still exists in local state
                        const stillInLocalState = this.guests.find(g => g.phoneNumber === originalPhone);
                        console.log('Local state check:', {
                            stillExists: !!stillInLocalState,
                            totalGuests: this.guests.length
                        });
                        
                        if (stillInLocalState) {
                            console.error('❌ Guest still exists in local state after refresh!');
                            Swal.fire('Warning', 'Guest may still appear due to caching. Please refresh the page.', 'warning');
                        } else {
                            console.log('✅ Guest successfully removed from local state');
                            Swal.fire('Success', 'Guest deleted successfully', 'success');
                        }
                        
                    } catch (error) {
                        console.error('❌ Error deleting guest:', error);
                        console.error('Error details:', {
                            message: error.message,
                            stack: error.stack,
                            code: error.code
                        });
                        Swal.fire('Error', `Failed to delete guest: ${error.message}`, 'error');
                    } finally {
                        // Always reset the flag, even if error occurred
                        this.isDeletingGuest = false;
                    }
                }
            },

            async viewAnalytics(guest) {
                this.currentAnalyticsGuest = guest;
                const modal = new bootstrap.Modal(document.getElementById('analyticsModal'));
                modal.show();
                
                // Initialize the analytics component using the global reference
                const analyticsRoot = document.getElementById('guestAnalyticsRoot');
                if (analyticsRoot && window.GuestAnalytics) {
                    // Pass normalized phone number to analytics component
                    const normalizedPhone = normalizePhoneNumber(guest.phoneNumber);
                    ReactDOM.render(
                        React.createElement(window.GuestAnalytics, { phoneNumber: normalizedPhone }),
                        analyticsRoot
                    );
                } else {
                    console.error('GuestAnalytics component not found');
                    Swal.fire('Error', 'Analytics component failed to load', 'error');
                }
            },

            calculateLoyaltyTier(totalSpend, visitCount) {
                if (totalSpend > 10000 && visitCount > 20) return 'PLATINUM';
                if (totalSpend > 5000 && visitCount > 10) return 'GOLD';
                if (totalSpend > 2000 && visitCount > 5) return 'SILVER';
                return 'BRONZE';
            },

            async debugGuestData() {
                console.log('🐛 Starting guest data debug...');
                
                try {
                    // Get raw database data
                    const snapshot = await get(ref(rtdb, 'guests'));
                    const rawDatabaseData = snapshot.val() || {};
                    
                    console.log('📊 Database vs UI comparison:');
                    console.log('Raw database guests:', Object.keys(rawDatabaseData).length);
                    console.log('UI guests:', this.guests.length);
                    
                    console.log('📋 Database phone numbers:');
                    Object.keys(rawDatabaseData).forEach((phoneKey, index) => {
                        const guestData = rawDatabaseData[phoneKey];
                        console.log(`${index + 1}. Database key: "${phoneKey}" | Name: "${guestData.name}" | Phone field: "${guestData.phoneNumber}"`);
                    });
                    
                    console.log('📋 UI phone numbers:');
                    this.guests.forEach((guest, index) => {
                        console.log(`${index + 1}. Phone: "${guest.phoneNumber}" | Name: "${guest.name}" | Display: "${this.formatPhoneForDisplay(guest.phoneNumber)}"`);
                    });
                    
                    // Find mismatches
                    const databaseKeys = Object.keys(rawDatabaseData);
                    const uiPhones = this.guests.map(g => g.phoneNumber);
                    
                    const onlyInDatabase = databaseKeys.filter(dbKey => !uiPhones.includes(dbKey));
                    const onlyInUI = uiPhones.filter(uiPhone => !databaseKeys.includes(uiPhone));
                    
                    console.log('🔍 Mismatches found:');
                    console.log('Only in database:', onlyInDatabase);
                    console.log('Only in UI:', onlyInUI);
                    
                    // Check for specific user
                    const testUserPhone = '27827001116';
                    const testUserInDb = rawDatabaseData[testUserPhone];
                    const testUserInUI = this.guests.find(g => g.phoneNumber === testUserPhone);
                    
                    console.log('🧪 Test user check (27827001116):');
                    console.log('In database:', !!testUserInDb, testUserInDb);
                    console.log('In UI:', !!testUserInUI, testUserInUI);
                    
                    // Show summary in alert
                    const summary = `
                        <div class="text-start">
                            <h6>Database vs UI Comparison:</h6>
                            <p><strong>Database guests:</strong> ${Object.keys(rawDatabaseData).length}</p>
                            <p><strong>UI guests:</strong> ${this.guests.length}</p>
                            
                            ${onlyInDatabase.length > 0 ? `
                                <div class="alert alert-warning">
                                    <strong>Only in Database:</strong><br>
                                    ${onlyInDatabase.map(phone => `• ${phone} (${rawDatabaseData[phone]?.name})`).join('<br>')}
                                </div>
                            ` : ''}
                            
                            ${onlyInUI.length > 0 ? `
                                <div class="alert alert-danger">
                                    <strong>Only in UI:</strong><br>
                                    ${onlyInUI.join('<br>')}
                                </div>
                            ` : ''}
                            
                            <div class="alert alert-info">
                                <strong>Test User (27827001116):</strong><br>
                                Database: ${testUserInDb ? '✅ Found' : '❌ Not found'}<br>
                                UI: ${testUserInUI ? '✅ Found' : '❌ Not found'}
                            </div>
                        </div>
                    `;
                    
                    await Swal.fire({
                        title: 'Guest Data Debug Report',
                        html: summary,
                        width: '600px',
                        confirmButtonText: 'Close'
                    });
                    
                } catch (error) {
                    console.error('❌ Debug error:', error);
                    Swal.fire('Error', 'Failed to debug guest data', 'error');
                }
            },

            // Pagination methods
            async goToFirstPage() {
                this.pagination.currentPage = 1;
                this.pagination.lastKey = null;
                this.pagination.paginationHistory = [];
                await this.loadGuests();
            },

            async goToPrevPage() {
                if (this.pagination.currentPage > 1) {
                    this.pagination.currentPage--;
                    // Restore previous page key
                    const historyIndex = this.pagination.currentPage - 2;
                    this.pagination.lastKey = historyIndex >= 0 ? this.pagination.paginationHistory[historyIndex] : null;
                    await this.loadGuests();
                }
            },

            async goToNextPage() {
                if (this.pagination.hasMore) {
                    // Store current last key in history before moving forward
                    this.pagination.paginationHistory[this.pagination.currentPage - 1] = this.pagination.lastKey;
                    this.pagination.currentPage++;
                    await this.loadGuests();
                }
            },

            async onPageSizeChange() {
                // Reset to first page when page size changes
                this.pagination.currentPage = 1;
                this.pagination.lastKey = null;
                this.pagination.paginationHistory = [];
                await this.loadGuests();
            },

            async fixDataConsistency() {
                console.log('🔧 Starting data consistency fix...');
                
                const result = await Swal.fire({
                    title: 'Fix Name Consistency',
                    html: `
                        <div class="text-start">
                            <p>This tool will scan all guests and ensure their names are consistent across all related records (rewards, receipts, etc.).</p>
                            <div class="alert alert-info">
                                <i class="fas fa-info-circle"></i> This process will:
                                <ul>
                                    <li>Check all guest records</li>
                                    <li>Find related rewards and receipts</li>
                                    <li>Update any inconsistent names</li>
                                    <li>Provide a detailed report</li>
                                </ul>
                            </div>
                            <div class="alert alert-warning">
                                <i class="fas fa-exclamation-triangle"></i> <strong>Warning:</strong> This will update existing data. Make sure you have backups if needed.
                            </div>
                        </div>
                    `,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Start Consistency Fix',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#ffc107'
                });

                if (!result.isConfirmed) return;

                try {
                    // Show loading
                    Swal.fire({
                        title: 'Fixing Data Consistency...',
                        html: 'Please wait while we check and fix any inconsistencies.',
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });

                    const allResults = {
                        processed: 0,
                        updated: 0,
                        errors: 0,
                        details: []
                    };

                    // Get all guests
                    const guestsSnapshot = await get(ref(rtdb, 'guests'));
                    const guestsData = guestsSnapshot.val() || {};
                    const guestEntries = Object.entries(guestsData);

                    console.log(`🔍 Processing ${guestEntries.length} guests...`);

                    // Process each guest
                    for (const [phoneNumber, guestData] of guestEntries) {
                        try {
                            allResults.processed++;
                            
                            // Skip if guest has no name
                            if (!guestData.name || guestData.name.trim() === '') {
                                console.log(`⏭️ Skipping guest ${phoneNumber} (no name)`);
                                continue;
                            }

                            console.log(`🔍 Processing guest ${phoneNumber}: ${guestData.name}`);

                            // Run cascade update (this will find and fix inconsistencies)
                            const cascadeResult = await cascadeGuestNameUpdate(
                                phoneNumber,
                                guestData.name, // Use current name as both old and new
                                guestData.name  // This will ensure consistency
                            );

                            if (cascadeResult.success) {
                                const totalUpdated = cascadeResult.updatedRecords.rewards + 
                                                  cascadeResult.updatedRecords.receipts + 
                                                  cascadeResult.updatedRecords.other;

                                if (totalUpdated > 0) {
                                    allResults.updated++;
                                    allResults.details.push({
                                        phoneNumber,
                                        name: guestData.name,
                                        updatedRecords: cascadeResult.updatedRecords,
                                        totalUpdated
                                    });
                                    console.log(`✅ Fixed ${totalUpdated} records for ${guestData.name}`);
                                }
                            } else {
                                allResults.errors++;
                                console.error(`❌ Failed to fix data for ${guestData.name}:`, cascadeResult.errors);
                            }

                            // Small delay to prevent overwhelming the database
                            await new Promise(resolve => setTimeout(resolve, 100));

                        } catch (error) {
                            allResults.errors++;
                            console.error(`❌ Error processing guest ${phoneNumber}:`, error);
                        }
                    }

                    // Show results
                    const totalFixed = allResults.details.reduce((sum, detail) => sum + detail.totalUpdated, 0);
                    
                    let resultsHtml = `
                        <div class="text-start">
                            <h6>Consistency Fix Results:</h6>
                            <p><strong>Guests processed:</strong> ${allResults.processed}</p>
                            <p><strong>Guests with fixes:</strong> ${allResults.updated}</p>
                            <p><strong>Total records fixed:</strong> ${totalFixed}</p>
                            <p><strong>Errors:</strong> ${allResults.errors}</p>
                    `;

                    if (allResults.details.length > 0) {
                        resultsHtml += `
                            <div class="mt-3">
                                <h6>Details:</h6>
                                <div style="max-height: 200px; overflow-y: auto;">
                        `;

                        allResults.details.forEach(detail => {
                            resultsHtml += `
                                <div class="alert alert-success p-2 mb-2">
                                    <strong>${detail.name}</strong> (${detail.phoneNumber})<br>
                                    <small>
                                        Rewards: ${detail.updatedRecords.rewards}, 
                                        Receipts: ${detail.updatedRecords.receipts}, 
                                        Other: ${detail.updatedRecords.other}
                                    </small>
                                </div>
                            `;
                        });

                        resultsHtml += `
                                </div>
                            </div>
                        `;
                    }

                    resultsHtml += `</div>`;

                    await Swal.fire({
                        title: 'Consistency Fix Complete',
                        html: resultsHtml,
                        icon: totalFixed > 0 ? 'success' : 'info',
                        confirmButtonText: 'Close',
                        width: '600px'
                    });

                } catch (error) {
                    console.error('❌ Error in consistency fix:', error);
                    await Swal.fire({
                        title: 'Error',
                        text: `Failed to fix data consistency: ${error.message}`,
                        icon: 'error',
                        confirmButtonText: 'Close'
                    });
                }
            }
        },

        watch: {
            searchQuery: {
                handler(newValue, oldValue) {
                    console.log('🔍 Search query changed:', newValue);
                    // Debounce search to avoid too many Firebase queries
                    if (this.searchDebounceTimer) {
                        clearTimeout(this.searchDebounceTimer);
                    }
                    this.searchDebounceTimer = setTimeout(() => {
                        this.loadGuests();
                    }, 300); // 300ms debounce
                }
            },
            sortConfig: {
                handler(newValue, oldValue) {
                    console.log('📊 Sort config changed:', newValue);
                    this.loadGuests();
                },
                deep: true
            }
        },

        mounted() {
            // Read URL parameters and apply filters
            this.readFiltersFromURL();

            this.loadGuests();

            // Initialize tooltips
            const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltipTriggerList.map(tooltipTriggerEl =>
                new bootstrap.Tooltip(tooltipTriggerEl)
            );
        }
    }
};

function cleanupGuestManagement() {
    if (guestManagement.app) {
        console.log('Cleaning up guest management app...');
        try {
            guestManagement.app.unmount();
        } catch (error) {
            console.warn('Error unmounting guest management app:', error);
        }
        guestManagement.app = null;
    }
}

function initializeGuestManagement() {
    console.log('Initializing guest management...');
    
    // Clean up any existing instance
    if (guestManagement.app) {
        console.log('Cleaning up existing guest management app...');
        try {
            guestManagement.app.unmount();
        } catch (error) {
            console.warn('Error unmounting existing app:', error);
        }
        guestManagement.app = null;
    }
    
    // Ensure the mount point exists and is clean
    const mountPoint = document.getElementById('guest-management-app');
    if (!mountPoint) {
        console.error('Guest management mount point not found');
        return null;
    }
    
    // Clear any existing content to prevent conflicts
    mountPoint.innerHTML = '';
    
    // Create and mount the Vue app
    try {
        const app = Vue.createApp(guestManagement.component);
        app.mount(mountPoint);
        guestManagement.app = app;
        console.log('Guest management initialized successfully');
        return app;
    } catch (error) {
        console.error('Error mounting guest management app:', error);
        return null;
    }
}

// Export initialization and cleanup functions
export { initializeGuestManagement, cleanupGuestManagement };