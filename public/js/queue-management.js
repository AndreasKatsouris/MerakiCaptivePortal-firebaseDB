import { rtdb, ref, get, set, update, remove, onValue, off, serverTimestamp, query, orderByChild, push, auth } from './config/firebase-config.js';
import { FeatureGuard } from './modules/access-control/components/feature-guard.js';
import AccessControl from './modules/access-control/services/access-control-service.js';

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

// Queue Management Vue Component
const QueueManagementApp = {
    name: 'QueueManagementApp',
    components: {
        FeatureGuard
    },
    template: `
        <FeatureGuard 
            feature="qmsBasic" 
            :show-placeholder="true"
            :show-upgrade-button="true"
            placeholder-message="Queue Management System is available for paid plans. Upgrade to manage your restaurant queue efficiently with real-time notifications and analytics.">
            <div class="queue-management-container">
            <div class="row mb-4">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Queue Statistics</h5>
                            <div class="row">
                                <div class="col-4">
                                    <div class="text-center">
                                        <h3 class="text-primary">{{ queueStats.totalGuests }}</h3>
                                        <small>Total Guests</small>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="text-center">
                                        <h3 class="text-warning">{{ queueStats.averageWait }}</h3>
                                        <small>Avg Wait (min)</small>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="text-center">
                                        <h3 class="text-success">{{ queueStats.totalPartySize }}</h3>
                                        <small>Total Party Size</small>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Tier-specific analytics access message -->
                            <div v-if="!canUseAnalytics" class="mt-3 alert alert-info alert-sm">
                                <i class="fas fa-chart-line me-2"></i>
                                <strong>Advanced Analytics:</strong> Upgrade to Professional for detailed queue analytics, trends, and reporting.
                                <button class="btn btn-sm btn-outline-primary ms-2" @click="showAnalyticsUpgradePrompt">
                                    <i class="fas fa-arrow-up me-1"></i>Upgrade
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Filters & Usage</h5>
                            <div class="row">
                                <div class="col-md-6">
                                    <label class="form-label">Date</label>
                                    <input type="date" class="form-control" v-model="currentDate">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">Location</label>
                                    <select class="form-select" v-model="selectedLocation">
                                        <option value="">All Locations</option>
                                        <option v-for="location in locations" :key="location.id" :value="location.id">
                                            {{ location.name }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                            
                            <!-- Tier Usage Display -->
                            <div class="mt-3">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <span class="badge bg-info">{{ subscription?.tierId || 'Free' }} Plan</span>
                                    <small class="text-muted">Today's Usage</small>
                                </div>
                                
                                <!-- Daily entries progress -->
                                <div class="mb-2">
                                    <div class="d-flex justify-content-between">
                                        <small>Queue Entries</small>
                                        <small>{{ queueUsage.todayEntries }} / {{ queueLimits.entries === -1 ? '∞' : queueLimits.entries }}</small>
                                    </div>
                                    <div class="progress" style="height: 6px;">
                                        <div class="progress-bar" 
                                             :class="queueLimits && queueUsage ? getUsageProgressClass('entries') : 'bg-secondary'"
                                             :style="{ width: (queueLimits && queueUsage ? getUsagePercentage('entries') : 0) + '%' }">
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Location usage -->
                                <div class="mb-2">
                                    <div class="d-flex justify-content-between">
                                        <small>Active Locations</small>
                                        <small>{{ queueUsage.activeLocations }} / {{ queueLimits.locations === -1 ? '∞' : queueLimits.locations }}</small>
                                    </div>
                                    <div class="progress" style="height: 6px;">
                                        <div class="progress-bar" 
                                             :class="queueLimits && queueUsage ? getUsageProgressClass('locations') : 'bg-secondary'"
                                             :style="{ width: (queueLimits && queueUsage ? getUsagePercentage('locations') : 0) + '%' }">
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Upgrade reminder for limits -->
                                <div v-if="isApproachingLimit()" class="alert alert-warning alert-sm p-2 mt-2">
                                    <i class="fas fa-exclamation-triangle me-1"></i>
                                    <small>{{ limitWarningMessage() }}</small>
                                    <button class="btn btn-xs btn-outline-warning ms-2" @click="showLimitUpgradePrompt">
                                        <i class="fas fa-arrow-up me-1"></i>Upgrade
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row mb-3">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center">
                        <h4>Today's Queue</h4>
                        <div class="btn-group">
                            <button type="button" class="btn btn-outline-secondary" @click="refreshQueue" :disabled="isLoading">
                                <i class="fas fa-sync-alt me-2" :class="{'fa-spin': isLoading}"></i>Refresh
                            </button>
                            <button type="button" 
                                    class="btn" 
                                    :class="canAddGuest ? 'btn-primary' : 'btn-outline-primary'"
                                    @click="handleAddGuestClick"
                                    :disabled="isLoading">
                                <i class="fas fa-plus me-2"></i>Add Guest
                                <span v-if="!canAddGuest" class="badge bg-warning ms-2">{{ entriesRemaining }} left</span>
                            </button>
                            
                            <!-- WhatsApp Integration Button -->
                            <div class="btn-group" v-if="canUseWhatsAppIntegration">
                                <button type="button" class="btn btn-outline-success" @click="showWhatsAppSettings">
                                    <i class="fab fa-whatsapp me-2"></i>WhatsApp
                                </button>
                            </div>
                            <div v-else class="btn-group">
                                <button type="button" class="btn btn-outline-secondary" @click="showWhatsAppUpgradePrompt" disabled>
                                    <i class="fab fa-whatsapp me-2"></i>WhatsApp
                                    <i class="fas fa-lock ms-1"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Queue Table -->
            <div class="card">
                <div class="card-body">
                    <div v-if="isLoading" class="text-center py-4">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                    
                    <div v-else-if="filteredQueue.length === 0" class="text-center py-4">
                        <i class="fas fa-clock fa-3x text-muted mb-3"></i>
                        <p class="text-muted">No guests in queue for selected date/location</p>
                        
                        <!-- Feature discovery for empty state -->
                        <div v-if="!canUseWhatsAppIntegration" class="mt-4 p-3 bg-light rounded">
                            <h6 class="mb-2">💡 Pro Tip: Enable WhatsApp Integration</h6>
                            <p class="text-muted mb-2">Let guests join your queue via WhatsApp and receive automatic notifications!</p>
                            <button class="btn btn-sm btn-outline-primary" @click="showWhatsAppUpgradePrompt">
                                <i class="fab fa-whatsapp me-1"></i>Learn More
                            </button>
                        </div>
                    </div>
                    
                    <div v-else class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Position</th>
                                    <th>Guest Name</th>
                                    <th>Phone</th>
                                    <th>Party Size</th>
                                    <th>Check-in Time</th>
                                    <th>Estimated Time</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                    <!-- Analytics column only for Pro+ -->
                                    <th v-if="canUseAnalytics">Insights</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(guest, index) in filteredQueue" :key="guest.id">
                                    <td>{{ guest.position || index + 1 }}</td>
                                    <td>
                                        <strong>{{ guest.name || guest.guestName }}</strong>
                                        <div v-if="guest.notes || guest.specialRequests" class="text-muted small">
                                            <i class="fas fa-sticky-note me-1"></i>{{ guest.notes || guest.specialRequests }}
                                        </div>
                                    </td>
                                    <td>{{ formatPhoneNumber(guest.phone || guest.phoneNumber) }}</td>
                                    <td>{{ guest.partySize }}</td>
                                    <td>{{ formatTime(guest.createdAt || guest.addedAt) }}</td>
                                    <td>{{ guest.estimatedWait || guest.estimatedWaitTime || 'N/A' }} min</td>
                                    <td>
                                        <span class="badge" :class="getStatusBadgeClass(guest.status)">
                                            {{ guest.status }}
                                        </span>
                                    </td>
                                    <td>
                                        <div class="btn-group" role="group">
                                            <button type="button" 
                                                    class="btn btn-sm" 
                                                    :class="canUseWhatsAppIntegration ? 'btn-outline-info' : 'btn-outline-secondary'"
                                                    @click="notifyGuest(guest)"
                                                    :disabled="guest.status === 'called' || guest.status === 'seated' || !canUseWhatsAppIntegration"
                                                    :title="!canUseWhatsAppIntegration ? 'WhatsApp notifications require Starter plan or higher' : ''">
                                                <i class="fas fa-bell"></i>
                                                <i v-if="!canUseWhatsAppIntegration" class="fas fa-lock ms-1" style="font-size: 0.7em;"></i>
                                            </button>
                                            <button type="button" class="btn btn-sm btn-outline-danger" 
                                                    @click="removeGuest(guest)">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                    <!-- Analytics insights for Pro+ users -->
                                    <td v-if="canUseAnalytics">
                                        <div class="btn-group" role="group">
                                            <button type="button" class="btn btn-sm btn-outline-info" 
                                                    @click="showGuestInsights(guest)"
                                                    title="View guest insights">
                                                <i class="fas fa-chart-line"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        
                        <!-- Feature discovery at bottom of table -->
                        <div v-if="!canUseAnalytics && filteredQueue.length > 10" class="mt-3 p-3 bg-light rounded">
                            <div class="row align-items-center">
                                <div class="col-md-8">
                                    <h6 class="mb-1">📊 Unlock Queue Analytics</h6>
                                    <p class="text-muted mb-0">Track trends, optimize wait times, and improve customer satisfaction with detailed analytics.</p>
                                </div>
                                <div class="col-md-4 text-end">
                                    <button class="btn btn-sm btn-outline-primary" @click="showAnalyticsUpgradePrompt">
                                        <i class="fas fa-arrow-up me-1"></i>Upgrade
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Add Guest Modal -->
            <div v-if="showAddGuestModal" class="modal d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Add Guest to Queue</h5>
                            <button type="button" class="btn-close" @click="showAddGuestModal = false"></button>
                        </div>
                        <div class="modal-body">
                            <div v-if="error" class="alert alert-danger">{{ error }}</div>
                            
                            <div class="mb-3">
                                <label class="form-label">Phone Number Lookup</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" v-model="searchPhone" 
                                           placeholder="Search by phone number">
                                    <button type="button" class="btn btn-outline-secondary" 
                                            @click="searchGuests" :disabled="isLookingUp">
                                        <i class="fas fa-search"></i>
                                    </button>
                                </div>
                                <div v-if="guestLookupResults.length > 0" class="mt-2">
                                    <small class="text-muted">Found guests:</small>
                                    <div class="list-group mt-1">
                                        <button type="button" class="list-group-item list-group-item-action" 
                                                v-for="guest in guestLookupResults" :key="guest.id"
                                                @click="selectGuestFromLookup(guest)">
                                            {{ guest.name }} - {{ formatPhoneNumber(guest.phone) }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Guest Name *</label>
                                        <input type="text" class="form-control" v-model="newGuest.name" required>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Phone Number *</label>
                                        <input type="tel" class="form-control" v-model="newGuest.phone" required>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Party Size</label>
                                        <input type="number" class="form-control" v-model="newGuest.partySize" min="1" max="20">
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="mb-3">
                                        <label class="form-label">Estimated Wait (minutes)</label>
                                        <input type="number" class="form-control" v-model="newGuest.estimatedWait" min="5" max="120">
                                    </div>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Notes</label>
                                <textarea class="form-control" v-model="newGuest.notes" rows="2" 
                                          placeholder="Any special requests or notes..."></textarea>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Location</label>
                                <select class="form-select" v-model="selectedLocation" required>
                                    <option value="">Select Location</option>
                                    <option v-for="location in locations" :key="location.id" :value="location.id">
                                        {{ location.name }}
                                    </option>
                                </select>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" @click="showAddGuestModal = false">Cancel</button>
                            <button type="button" class="btn btn-primary" @click="addGuest" :disabled="isLoading">
                                <span v-if="isLoading" class="spinner-border spinner-border-sm me-2"></span>
                                Add to Queue
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        </FeatureGuard>
    `,
    data() {
        return {
            queue: [],
            locations: [],
            selectedLocation: '',
            isLoading: false,
            error: null,
            queueListener: null,
            showAddGuestModal: false,
            newGuest: {
                name: '',
                phone: '',
                partySize: 1,
                estimatedWait: 15,
                notes: ''
            },
            guestLookupResults: [],
            isLookingUp: false,
            searchPhone: '',
            currentDate: new Date().toISOString().split('T')[0],
            // Access control data
            subscription: null,
            queueLimits: {
                entries: 0,
                locations: 0,
                historyDays: 0
            },
            queueUsage: {
                todayEntries: 0,
                activeLocations: 0
            }
        };
    },
    computed: {
        filteredQueue() {
            return this.queue
                .filter(guest => {
                    // Filter by date
                    const dateMatch = guest.date === this.currentDate;

                    // Filter by location (if selected)
                    const locationMatch = !this.selectedLocation || guest.location === this.selectedLocation;

                    // Only show active entries (not removed)
                    const statusMatch = guest.status !== 'removed';

                    return dateMatch && locationMatch && statusMatch;
                })
                .sort((a, b) => {
                    // Sort by position first, then by addedAt timestamp
                    if (a.position !== b.position) {
                        return a.position - b.position;
                    }
                    return new Date(a.addedAt || a.createdAt) - new Date(b.addedAt || b.createdAt);
                });
        },
        queueStats() {
            const totalGuests = this.filteredQueue.length;
            const averageWait = totalGuests > 0
                ? Math.round(this.filteredQueue.reduce((sum, guest) => {
                    const waitTime = guest.estimatedWait || guest.estimatedWaitTime || 0;
                    return sum + waitTime;
                }, 0) / totalGuests)
                : 0;
            const totalPartySize = this.filteredQueue.reduce((sum, guest) => sum + (guest.partySize || 0), 0);

            return {
                totalGuests,
                averageWait,
                totalPartySize
            };
        },

        // Access control computed properties
        canAddGuest() {
            return this.queueUsage.todayEntries < this.queueLimits.entries;
        },

        canUseMultipleLocations() {
            return this.queueUsage.activeLocations < this.queueLimits.locations;
        },

        canUseWhatsAppIntegration() {
            return this.subscription && AccessControl.canUseFeature('qmsWhatsAppIntegration');
        },

        canUseAnalytics() {
            return this.subscription && AccessControl.canUseFeature('qmsAnalytics');
        },

        entriesRemaining() {
            return Math.max(0, this.queueLimits.entries - this.queueUsage.todayEntries);
        },


    },
    async mounted() {
        await this.loadSubscriptionData();
        await this.loadLocations();
        this.setupQueueListener();
        await this.updateQueueUsage();
    },
    beforeUnmount() {
        this.cleanupListeners();
    },
    methods: {
        async loadLocations() {
            try {
                const currentUser = auth.currentUser;
                if (!currentUser) {
                    console.warn('No authenticated user, cannot load locations');
                    return;
                }

                // Get user's accessible locations first
                const userLocationsRef = ref(rtdb, `userLocations/${currentUser.uid}`);
                const userLocationsSnapshot = await get(userLocationsRef);

                if (!userLocationsSnapshot.exists()) {
                    console.warn('User has no location access defined');
                    this.locations = [];
                    return;
                }

                const accessibleLocationIds = Object.keys(userLocationsSnapshot.val());
                console.log('User has access to locations:', accessibleLocationIds);

                // Now load only the accessible locations
                const locationsRef = ref(rtdb, 'locations');
                const snapshot = await get(locationsRef);

                if (snapshot.exists()) {
                    // Filter locations to only those the user has access to
                    this.locations = Object.entries(snapshot.val())
                        .filter(([id]) => accessibleLocationIds.includes(id))
                        .map(([id, data]) => ({
                            id,
                            ...data
                        }));

                    console.log(`Loaded ${this.locations.length} accessible locations for user`);

                    // Auto-select if only one location
                    if (this.locations.length === 1) {
                        this.selectedLocation = this.locations[0].id;
                        console.log('Auto-selected single location:', this.selectedLocation);
                    }
                }
            } catch (error) {
                console.error('Error loading locations:', error);
                this.error = 'Failed to load locations';
            }
        },

        setupQueueListener() {
            this.cleanupListeners();

            // PERFORMANCE FIX: Debounce listener updates to prevent handler violations
            let debounceTimer = null;

            // Set up listener for the correct WhatsApp queue path structure
            const queuesRef = ref(rtdb, 'queues');
            this.queueListener = onValue(queuesRef, (snapshot) => {
                // Clear existing debounce timer
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }

                // Debounce the processing to avoid rapid updates
                debounceTimer = setTimeout(() => {
                    this.processQueueSnapshot(snapshot);
                }, 50); // Process after 50ms of no updates
            }, (error) => {
                console.error('Queue listener error:', error);
                this.error = 'Failed to load queue data';
            });
        },

        processQueueSnapshot(snapshot) {
            const allQueues = [];

            if (snapshot.exists()) {
                const queuesData = snapshot.val();

                // Process each location's queue data
                Object.entries(queuesData).forEach(([locationId, locationData]) => {
                    Object.entries(locationData).forEach(([date, dateData]) => {
                        if (dateData.entries) {
                            // Convert entries to array and add location/date context
                            Object.entries(dateData.entries).forEach(([entryId, entry]) => {
                                allQueues.push({
                                    id: entryId,
                                    location: locationId,
                                    date: date,
                                    name: entry.guestName,
                                    guestName: entry.guestName,
                                    phone: entry.phoneNumber,
                                    phoneNumber: entry.phoneNumber,
                                    partySize: entry.partySize,
                                    status: entry.status,
                                    position: entry.position,
                                    estimatedWait: entry.estimatedWaitTime,
                                    estimatedWaitTime: entry.estimatedWaitTime,
                                    createdAt: entry.addedAt,
                                    addedAt: entry.addedAt,
                                    notes: entry.specialRequests,
                                    specialRequests: entry.specialRequests
                                });
                            });
                        }
                    });
                });
            }

            this.queue = allQueues;
        },

        cleanupListeners() {
            if (this.queueListener) {
                off(ref(rtdb, 'queues'), 'value', this.queueListener);
                this.queueListener = null;
            }
        },

        async refreshQueue() {
            this.isLoading = true;
            this.error = null;

            try {
                // Force refresh by re-setting up the listener
                this.setupQueueListener();

                // Give it a moment to load
                await new Promise(resolve => setTimeout(resolve, 1000));

                console.log('Queue data refreshed successfully');
            } catch (error) {
                console.error('Error refreshing queue:', error);
                this.error = 'Failed to refresh queue data';
            } finally {
                this.isLoading = false;
            }
        },

        async addGuest() {
            if (!this.newGuest.name || !this.newGuest.phone || !this.selectedLocation) {
                this.error = 'Name, phone number, and location are required';
                return;
            }

            // Check subscription limits before adding
            const canAdd = await this.checkAddGuestLimits();
            if (!canAdd) {
                return;
            }

            // Validate phone number format
            const phoneNumber = this.newGuest.phone.trim();
            if (!this.isValidPhoneNumber(phoneNumber)) {
                this.error = 'Please enter a valid phone number (e.g., +27812345678 or 0812345678)';
                return;
            }

            this.isLoading = true;
            this.error = null;

            try {
                const today = new Date().toISOString().split('T')[0];
                const entriesRef = ref(rtdb, `queues/${this.selectedLocation}/${today}/entries`);

                // Get current entries to calculate position
                const snapshot = await get(entriesRef);
                const existingEntries = snapshot.val() || {};
                const activeEntries = Object.values(existingEntries).filter(entry => entry.status === 'waiting');
                const position = activeEntries.length + 1;

                // Normalize phone number for database storage
                const normalizedPhone = normalizePhoneNumber(this.newGuest.phone);

                const guestData = {
                    guestName: this.newGuest.name,
                    phoneNumber: normalizedPhone,
                    partySize: parseInt(this.newGuest.partySize),
                    estimatedWaitTime: parseInt(this.newGuest.estimatedWait),
                    specialRequests: this.newGuest.notes,
                    status: 'waiting',
                    position: position,
                    addedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    addedBy: 'admin',
                    notificationsSent: {
                        added: false,
                        positionUpdate: false,
                        called: false,
                        reminder: false
                    }
                };

                // Push to create new entry with auto-generated ID
                const newEntryRef = await push(entriesRef, guestData);

                // Update metadata
                const metadataRef = ref(rtdb, `queues/${this.selectedLocation}/${today}/metadata`);
                await update(metadataRef, {
                    currentCount: position,
                    updatedAt: serverTimestamp()
                });

                // Send WhatsApp notification for manual addition
                await this.sendManualAdditionNotification({
                    phoneNumber: normalizedPhone,
                    guestName: this.newGuest.name,
                    locationName: this.getLocationName(this.selectedLocation),
                    position: position,
                    partySize: parseInt(this.newGuest.partySize),
                    estimatedWaitTime: parseInt(this.newGuest.estimatedWait),
                    specialRequests: this.newGuest.notes
                });

                // Mark notification as sent
                await update(ref(rtdb, `queues/${this.selectedLocation}/${today}/entries/${newEntryRef.key}/notificationsSent`), {
                    added: true,
                    manually_added: true
                });

                this.resetNewGuestForm();
                this.showAddGuestModal = false;

                // Update queue usage after successful addition
                await this.updateQueueUsage();

                Swal.fire({
                    title: 'Success!',
                    text: `${this.newGuest.name} has been added to the queue at position ${position} and notified via WhatsApp`,
                    icon: 'success',
                    timer: 3000,
                    showConfirmButton: false
                });

            } catch (error) {
                console.error('Error adding guest:', error);
                this.error = 'Failed to add guest to queue';
            } finally {
                this.isLoading = false;
            }
        },

        async removeGuest(guest) {
            const result = await Swal.fire({
                title: 'Remove Guest?',
                text: `Remove ${guest.name || guest.guestName} from the queue?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Yes, remove'
            });

            if (result.isConfirmed) {
                try {
                    const guestRef = ref(rtdb, `queues/${guest.location}/${guest.date}/entries/${guest.id}`);
                    await update(guestRef, {
                        status: 'removed',
                        removedAt: serverTimestamp(),
                        removalReason: 'admin_removed',
                        updatedAt: serverTimestamp()
                    });

                    Swal.fire({
                        title: 'Removed!',
                        text: `${guest.name || guest.guestName} has been removed from the queue`,
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                    });

                } catch (error) {
                    console.error('Error removing guest:', error);
                    Swal.fire('Error!', 'Failed to remove guest from queue', 'error');
                }
            }
        },

        async notifyGuest(guest) {
            // Check WhatsApp access first
            if (!this.canUseWhatsAppIntegration) {
                await this.showWhatsAppUpgradePrompt();
                return;
            }

            const result = await Swal.fire({
                title: 'Notify Guest?',
                text: `Send WhatsApp notification to ${guest.name || guest.guestName} (${guest.phone || guest.phoneNumber})?`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonColor: '#28a745',
                cancelButtonColor: '#6c757d',
                confirmButtonText: 'Send Notification'
            });

            if (result.isConfirmed) {
                try {
                    // Update guest status to 'called'
                    const guestRef = ref(rtdb, `queues/${guest.location}/${guest.date}/entries/${guest.id}`);
                    await update(guestRef, {
                        status: 'called',
                        calledAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        'notificationsSent/called': true
                    });

                    // Call Firebase Function to send WhatsApp notification
                    await this.sendQueueNotification(guest);

                    Swal.fire({
                        title: 'Notification Sent!',
                        text: `${guest.name || guest.guestName} has been notified via WhatsApp`,
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                    });

                } catch (error) {
                    console.error('Error notifying guest:', error);
                    Swal.fire('Error!', 'Failed to send notification', 'error');
                }
            }
        },

        async sendQueueNotification(guest) {
            try {
                const currentUser = auth.currentUser;
                if (!currentUser) {
                    throw new Error('No authenticated user');
                }

                const idToken = await currentUser.getIdToken();
                const guestName = guest.name || guest.guestName;
                const phoneNumber = guest.phone || guest.phoneNumber;

                // Get location name from locations array
                const location = this.locations.find(loc => loc.id === guest.location);
                const locationName = location ? location.name : 'Unknown Location';

                const queueData = {
                    guestName: guestName,
                    phoneNumber: phoneNumber,
                    position: guest.position,
                    estimatedWaitTime: guest.estimatedWait || guest.estimatedWaitTime,
                    locationName: locationName,
                    partySize: guest.partySize
                };

                const response = await fetch('https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/sendQueueNotification', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        phoneNumber: phoneNumber,
                        notificationType: 'called',
                        queueData: queueData
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to send notification');
                }

                const result = await response.json();
                console.log('Queue notification sent successfully:', result);

            } catch (error) {
                console.error('Error sending queue notification:', error);
                throw error;
            }
        },

        async searchGuests() {
            if (!this.searchPhone) return;

            this.isLookingUp = true;
            this.guestLookupResults = [];

            try {
                const normalizedSearchPhone = normalizePhoneNumber(this.searchPhone);

                // First, try direct lookup with normalized phone number
                const directGuestRef = ref(rtdb, `guests/${normalizedSearchPhone}`);
                const directSnapshot = await get(directGuestRef);

                if (directSnapshot.exists()) {
                    const guestData = directSnapshot.val();
                    this.guestLookupResults = [{
                        id: normalizedSearchPhone,
                        phone: guestData.phone || normalizedSearchPhone,
                        name: guestData.name || guestData.guestName || 'Unknown Guest',
                        ...guestData
                    }];
                } else {
                    // Fallback to searching all guests
                    const guestsRef = ref(rtdb, 'guests');
                    const snapshot = await get(guestsRef);

                    if (snapshot.exists()) {
                        const guests = snapshot.val();

                        // Search by normalized phone number key or phone field
                        this.guestLookupResults = Object.entries(guests)
                            .filter(([phoneKey, guest]) => {
                                const phone = guest.phone || phoneKey;
                                const normalizedPhone = normalizePhoneNumber(phone);
                                const cleanedSearchPhone = this.searchPhone.replace(/\D/g, '');

                                return phone && (
                                    phone.includes(this.searchPhone) ||
                                    phoneKey.includes(this.searchPhone) ||
                                    normalizedPhone.includes(this.searchPhone) ||
                                    normalizedPhone.replace(/\D/g, '').includes(cleanedSearchPhone) ||
                                    phone.replace(/\D/g, '').includes(cleanedSearchPhone)
                                );
                            })
                            .map(([phoneKey, guest]) => ({
                                id: phoneKey,
                                phone: guest.phone || phoneKey,
                                name: guest.name || guest.guestName || 'Unknown Guest',
                                ...guest
                            }));
                    }
                }
            } catch (error) {
                console.error('Error searching guests:', error);
                this.error = 'Failed to search guests';
            } finally {
                this.isLookingUp = false;
            }
        },

        selectGuestFromLookup(guest) {
            this.newGuest.name = guest.name || guest.guestName || '';
            this.newGuest.phone = guest.phone || guest.phoneNumber || '';
            this.guestLookupResults = [];
            this.searchPhone = '';
        },

        resetNewGuestForm() {
            this.newGuest = {
                name: '',
                phone: '',
                partySize: 1,
                estimatedWait: 15,
                notes: ''
            };
            this.guestLookupResults = [];
            this.searchPhone = '';
        },

        formatTime(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },

        formatPhoneNumber(phone) {
            if (!phone) return '';
            const cleaned = phone.replace(/\D/g, '');
            const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
            return match ? `(${match[1]}) ${match[2]}-${match[3]}` : phone;
        },

        getStatusBadgeClass(status) {
            switch (status) {
                case 'waiting': return 'bg-warning';
                case 'notified': return 'bg-info';
                case 'seated': return 'bg-success';
                case 'no-show': return 'bg-danger';
                default: return 'bg-secondary';
            }
        },

        getEstimatedTime(guest) {
            const createdAt = guest.createdAt || guest.addedAt;
            const waitTime = guest.estimatedWait || guest.estimatedWaitTime;

            if (!createdAt || !waitTime) return 'N/A';

            const created = new Date(createdAt);
            const estimated = new Date(created.getTime() + waitTime * 60000);
            return estimated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },

        getLocationName(locationId) {
            const location = this.locations.find(loc => loc.id === locationId);
            return location ? location.name : 'Unknown Location';
        },

        isValidPhoneNumber(phone) {
            if (!phone || phone.trim() === '') return false;

            const cleaned = phone.trim();

            // South African phone number patterns
            const patterns = [
                /^\+27\d{9}$/,        // +27812345678
                /^27\d{9}$/,          // 27812345678
                /^0\d{9}$/,           // 0812345678
                /^\d{10}$/            // 812345678 (10 digits)
            ];

            return patterns.some(pattern => pattern.test(cleaned));
        },

        // Usage percentage calculations
        getUsagePercentage(type) {
            if (!this.queueLimits || !this.queueUsage) return 0;

            if (type === 'entries') {
                return this.queueLimits.entries === -1 ? 0 : (this.queueUsage.todayEntries / this.queueLimits.entries) * 100;
            }
            if (type === 'locations') {
                return this.queueLimits.locations === -1 ? 0 : (this.queueUsage.activeLocations / this.queueLimits.locations) * 100;
            }
            return 0;
        },

        getUsageProgressClass(type) {
            if (!this.queueLimits || !this.queueUsage) return 'bg-secondary';

            const percentage = this.getUsagePercentage(type);
            if (percentage >= 90) return 'bg-danger';
            if (percentage >= 75) return 'bg-warning';
            return 'bg-success';
        },

        // Limit warning system
        isApproachingLimit() {
            if (!this.queueLimits || !this.queueUsage) return false;

            const entriesPercentage = this.getUsagePercentage('entries');
            const locationsPercentage = this.getUsagePercentage('locations');
            return entriesPercentage >= 75 || locationsPercentage >= 75;
        },

        limitWarningMessage() {
            if (!this.queueLimits || !this.queueUsage) return '';

            const entriesPercentage = this.getUsagePercentage('entries');
            const locationsPercentage = this.getUsagePercentage('locations');

            if (entriesPercentage >= 90) {
                return `You've used ${Math.round(entriesPercentage)}% of your daily queue entries. Consider upgrading for higher limits.`;
            }
            if (locationsPercentage >= 90) {
                return `You've used ${Math.round(locationsPercentage)}% of your location quota. Upgrade for more locations.`;
            }
            if (entriesPercentage >= 75) {
                return `You've used ${Math.round(entriesPercentage)}% of your daily queue entries.`;
            }
            if (locationsPercentage >= 75) {
                return `You've used ${Math.round(locationsPercentage)}% of your location quota.`;
            }
            return '';
        },

        // Access control methods
        async loadSubscriptionData() {
            try {
                this.subscription = await AccessControl.getCurrentSubscription();
                if (this.subscription) {
                    this.queueLimits.entries = await AccessControl.getLimit('queueEntries');
                    this.queueLimits.locations = await AccessControl.getLimit('queueLocations');
                    this.queueLimits.historyDays = await AccessControl.getLimit('queueHistoryDays');
                }
            } catch (error) {
                console.error('Error loading subscription data:', error);
                // Set default free tier limits
                this.queueLimits.entries = 25;
                this.queueLimits.locations = 1;
                this.queueLimits.historyDays = 7;
            }
        },

        async updateQueueUsage() {
            try {
                // Count today's entries
                const todayString = this.currentDate;
                const todayEntries = this.queue.filter(guest => guest.date === todayString).length;
                this.queueUsage.todayEntries = todayEntries;

                // Count active locations
                const activeLocations = new Set(this.queue.map(guest => guest.locationId)).size;
                this.queueUsage.activeLocations = Math.max(1, activeLocations);

            } catch (error) {
                console.error('Error updating queue usage:', error);
            }
        },

        async checkAddGuestLimits() {
            if (!this.canAddGuest) {
                const upgradeMessage = this.subscription?.tierId === 'free'
                    ? 'You have reached the daily limit of 25 queue entries for the free plan. Upgrade to Starter for 100 daily entries.'
                    : `You have reached your daily limit of ${this.queueLimits.entries} queue entries. Upgrade your plan for higher limits.`;

                Swal.fire({
                    title: 'Queue Limit Reached',
                    text: upgradeMessage,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Upgrade Now',
                    cancelButtonText: 'Close'
                }).then((result) => {
                    if (result.isConfirmed) {
                        window.location.href = '/user-subscription.html';
                    }
                });
                return false;
            }
            return true;
        },

        async sendManualAdditionNotification(notificationData) {
            try {
                const currentUser = auth.currentUser;
                if (!currentUser) {
                    throw new Error('No authenticated user');
                }

                const idToken = await currentUser.getIdToken();

                console.log('[sendManualAdditionNotification] Sending notification:', notificationData);

                const response = await fetch('https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/sendManualQueueAdditionNotification', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify(notificationData)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to send notification');
                }

                const result = await response.json();
                console.log('[sendManualAdditionNotification] Notification sent successfully:', result);

            } catch (error) {
                console.error('[sendManualAdditionNotification] Error:', error);
                // Don't throw error to prevent blocking the queue addition
                // Just log and show a warning
                Swal.fire({
                    title: 'Warning!',
                    text: 'Guest was added to queue but WhatsApp notification failed to send.',
                    icon: 'warning',
                    timer: 3000,
                    showConfirmButton: false
                });
            }
        },

        // Enhanced UI interaction methods
        async handleAddGuestClick() {
            if (!this.canAddGuest) {
                await this.showLimitUpgradePrompt();
                return;
            }
            this.showAddGuestModal = true;
        },

        async showAnalyticsUpgradePrompt() {
            const upgradeOptions = [
                {
                    name: 'Professional',
                    features: ['Advanced Queue Analytics', 'Detailed Reports', 'Trend Analysis'],
                    price: '$49/month'
                },
                {
                    name: 'Enterprise',
                    features: ['All Professional Features', 'Custom Analytics', 'API Access'],
                    price: '$99/month'
                }
            ];

            let message = '<p>Unlock powerful queue analytics and insights with our advanced plans:</p>';
            upgradeOptions.forEach(option => {
                message += `<div class="mb-3">
                    <h6>${option.name} - ${option.price}</h6>
                    <ul class="list-unstyled">`;
                option.features.forEach(feature => {
                    message += `<li><i class="fas fa-check text-success me-2"></i>${feature}</li>`;
                });
                message += '</ul></div>';
            });

            Swal.fire({
                title: 'Upgrade for Advanced Analytics',
                html: message,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'View Upgrade Options',
                cancelButtonText: 'Maybe Later'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.location.href = '/user-subscription.html?feature=qmsAnalytics';
                }
            });
        },

        async showWhatsAppUpgradePrompt() {
            Swal.fire({
                title: 'WhatsApp Integration',
                html: `<p>Enable WhatsApp notifications for your queue management:</p>
                       <div class="mb-3">
                           <h6>Starter Plan - $19/month</h6>
                           <ul class="list-unstyled">
                               <li><i class="fas fa-check text-success me-2"></i>WhatsApp notifications</li>
                               <li><i class="fas fa-check text-success me-2"></i>100 daily queue entries</li>
                               <li><i class="fas fa-check text-success me-2"></i>2 locations</li>
                           </ul>
                       </div>`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Upgrade to Starter',
                cancelButtonText: 'Not Now'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.location.href = '/user-subscription.html?feature=qmsWhatsAppIntegration';
                }
            });
        },

        async showLimitUpgradePrompt() {
            const currentTier = this.subscription?.tierId || 'Free';
            const currentEntries = this.queueLimits.entries;
            const currentLocations = this.queueLimits.locations;

            let upgradeOptions = [];

            if (currentTier === 'Free') {
                upgradeOptions = [
                    { name: 'Starter', entries: 100, locations: 2, price: '$19/month' },
                    { name: 'Professional', entries: 500, locations: 5, price: '$49/month' },
                    { name: 'Enterprise', entries: 'Unlimited', locations: 'Unlimited', price: '$99/month' }
                ];
            } else if (currentTier === 'Starter') {
                upgradeOptions = [
                    { name: 'Professional', entries: 500, locations: 5, price: '$49/month' },
                    { name: 'Enterprise', entries: 'Unlimited', locations: 'Unlimited', price: '$99/month' }
                ];
            } else if (currentTier === 'Professional') {
                upgradeOptions = [
                    { name: 'Enterprise', entries: 'Unlimited', locations: 'Unlimited', price: '$99/month' }
                ];
            }

            let message = `<p>You're currently on the <strong>${currentTier}</strong> plan with ${currentEntries} daily entries and ${currentLocations} locations.</p>`;

            if (upgradeOptions.length > 0) {
                message += '<p>Upgrade to increase your limits:</p>';
                upgradeOptions.forEach(option => {
                    message += `<div class="mb-2">
                        <strong>${option.name}</strong> - ${option.price}<br>
                        <small class="text-muted">${option.entries} daily entries, ${option.locations} locations</small>
                    </div>`;
                });
            }

            Swal.fire({
                title: 'Upgrade Your Queue Limits',
                html: message,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Upgrade Now',
                cancelButtonText: 'Continue with Current Plan'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.location.href = '/user-subscription.html?feature=qmsBasic';
                }
            });
        },

        async showWhatsAppSettings() {
            Swal.fire({
                title: 'WhatsApp Integration Settings',
                html: `<p>WhatsApp notifications are enabled for your queue management.</p>
                       <div class="form-check">
                           <input class="form-check-input" type="checkbox" id="autoNotify" checked>
                           <label class="form-check-label" for="autoNotify">
                               Auto-notify guests when added to queue
                           </label>
                       </div>
                       <div class="form-check">
                           <input class="form-check-input" type="checkbox" id="reminders" checked>
                           <label class="form-check-label" for="reminders">
                               Send wait time reminders
                           </label>
                       </div>`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Save Settings',
                cancelButtonText: 'Close'
            }).then((result) => {
                if (result.isConfirmed) {
                    // Save WhatsApp settings
                    console.log('WhatsApp settings saved');
                }
            });
        },

        async fetchGuestInsights(guest) {
            try {
                const phoneNumber = guest.phoneNumber || guest.phone;
                if (!phoneNumber) return null;

                // Fetch guest history from queue_history
                const historyRef = ref(rtdb, 'queue_history');
                const historyQuery = query(
                    historyRef,
                    orderByChild('phoneNumber'),
                    equalTo(phoneNumber)
                );
                const historySnapshot = await get(historyQuery);

                if (!historySnapshot.exists()) {
                    return null;
                }

                const visits = [];
                const waitTimes = [];
                historySnapshot.forEach(childSnapshot => {
                    const visit = childSnapshot.val();
                    visits.push(visit);
                    if (visit.waitTime) {
                        waitTimes.push(visit.waitTime);
                    }
                });

                // Calculate insights
                const avgWaitTime = waitTimes.length > 0
                    ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
                    : 0;

                // Find most recent visit
                const sortedVisits = visits.sort((a, b) =>
                    (b.timestamp || 0) - (a.timestamp || 0)
                );
                const lastVisit = sortedVisits[0]?.timestamp
                    ? new Date(sortedVisits[0].timestamp).toLocaleDateString()
                    : 'N/A';

                // Find preferred time (most common hour)
                const hourCounts = {};
                visits.forEach(visit => {
                    if (visit.timestamp) {
                        const hour = new Date(visit.timestamp).getHours();
                        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
                    }
                });
                const preferredHour = Object.keys(hourCounts).reduce((a, b) =>
                    hourCounts[a] > hourCounts[b] ? a : b, 0
                );
                const preferredTime = `${preferredHour}:00`;

                // Calculate satisfaction (based on completed vs cancelled)
                const completed = visits.filter(v => v.status === 'seated' || v.status === 'completed').length;
                const cancelled = visits.filter(v => v.status === 'cancelled' || v.status === 'no-show').length;
                const satisfaction = completed > 0 ? (completed / (completed + cancelled)) * 5 : 0;

                return {
                    visitHistory: visits.length,
                    avgWaitTime,
                    lastVisit,
                    preferredTime,
                    satisfaction: satisfaction.toFixed(1)
                };
            } catch (error) {
                console.error('Error fetching guest insights:', error);
                return null;
            }
        },

        async showGuestInsights(guest) {
            if (!this.canUseAnalytics) {
                await this.showAnalyticsUpgradePrompt();
                return;
            }

            // Fetch real guest insights from Firebase
            const insights = await this.fetchGuestInsights(guest);
            if (!insights) {
                Swal.fire({
                    icon: 'info',
                    title: 'No Data Available',
                    text: 'No historical data found for this guest.'
                });
                return;
            }

            Swal.fire({
                title: `Guest Insights: ${guest.name || guest.guestName}`,
                html: `
                    <div class="row text-start">
                        <div class="col-6">
                            <h6>Visit History</h6>
                            <p class="text-muted">${insights.visitHistory} previous visits</p>
                        </div>
                        <div class="col-6">
                            <h6>Average Wait Time</h6>
                            <p class="text-muted">${insights.avgWaitTime} minutes</p>
                        </div>
                        <div class="col-6">
                            <h6>Last Visit</h6>
                            <p class="text-muted">${insights.lastVisit}</p>
                        </div>
                        <div class="col-6">
                            <h6>Preferred Time</h6>
                            <p class="text-muted">${insights.preferredTime}</p>
                        </div>
                        <div class="col-12">
                            <h6>Satisfaction Score</h6>
                            <div class="d-flex align-items-center">
                                <span class="text-warning me-2">⭐⭐⭐⭐⭐</span>
                                <span class="text-muted">${insights.satisfaction}/5</span>
                            </div>
                        </div>
                    </div>
                `,
                icon: 'info',
                confirmButtonText: 'Close'
            });
        }
    }
};

// Booking tab support variables
let bookingTabInitialized = false;
let currentUser = null;

// Booking tab functionality
async function initializeAdminDashboardBookingSupport() {
    console.log('🔧 [QueueManagement] Setting up admin dashboard booking support...');

    try {
        // Import required modules
        const [
            { auth, onAuthStateChanged },
            AccessControl,
            { AdminClaims }
        ] = await Promise.all([
            import('./config/firebase-config.js'),
            import('./modules/access-control/services/access-control-service.js'),
            import('./auth/admin-claims.js')
        ]);

        // Check if there's a container where we should add the booking tab
        const queueManagementSection = document.querySelector('#queueManagementContent') ||
            document.querySelector('.queue-management-container');

        console.log('🔧 [QueueManagement] Admin dashboard setup:', {
            hasQueueSection: !!queueManagementSection,
            queueSectionId: queueManagementSection?.id,
            currentUser: currentUser?.uid,
            authCurrentUser: auth.currentUser?.uid
        });

        if (queueManagementSection) {
            // Add booking tab to admin dashboard if it doesn't exist
            let adminTabs = queueManagementSection.querySelector('.nav-tabs');
            let adminQueueContent = queueManagementSection.querySelector('#queueManagementVueContent');
            let adminBookingContent = queueManagementSection.querySelector('#adminBookingManagementContent');

            console.log('🔧 [QueueManagement] Admin tabs check:', {
                hasAdminTabs: !!adminTabs,
                hasAdminQueueContent: !!adminQueueContent,
                hasAdminBookingContent: !!adminBookingContent,
                queueSectionChildren: queueManagementSection.children.length,
                queueSectionHTML: queueManagementSection.innerHTML.length
            });

            // Check if we have proper admin tab structure (not just any tabs)
            const hasProperAdminStructure = adminTabs && adminQueueContent && adminBookingContent;

            if (!hasProperAdminStructure) {
                console.log('🔧 [QueueManagement] Incomplete admin tab structure detected, creating proper tab structure...');

                // Clear any existing tab structures first and reset booking initialization state
                const existingTabs = queueManagementSection.querySelector('.nav-tabs');
                const existingTabContent = queueManagementSection.querySelector('.tab-content');
                if (existingTabs) {
                    existingTabs.remove();
                    console.log('🔧 [QueueManagement] Removed existing tabs');
                }
                if (existingTabContent) {
                    existingTabContent.remove();
                    console.log('🔧 [QueueManagement] Removed existing tab content');
                    // Reset booking initialization since content was destroyed
                    bookingTabInitialized = false;
                    console.log('🔧 [QueueManagement] Reset booking tab initialization state');
                }

                // Create tab structure for admin dashboard
                const tabContainer = document.createElement('div');
                tabContainer.innerHTML = `
                    <ul class="nav nav-tabs nav-tabs-custom mb-3" id="adminQmsTabsNav" role="tablist">
                        <li class="nav-item" role="presentation">
                            <button class="nav-link active" id="admin-queue-tab" data-bs-toggle="tab" data-bs-target="#admin-queue-pane" type="button" role="tab">
                                <i class="fas fa-clock me-2"></i>Queue Management
                            </button>
                        </li>
                        <li class="nav-item" role="presentation" id="admin-booking-tab-container">
                            <button class="nav-link" id="admin-booking-tab" data-bs-toggle="tab" data-bs-target="#admin-booking-pane" type="button" role="tab">
                                <i class="fas fa-calendar-alt me-2"></i>Booking Management
                                <i class="fas fa-lock ms-2 d-none" id="admin-booking-lock-icon"></i>
                            </button>
                        </li>
                    </ul>
                    <div class="tab-content" id="adminQmsTabsContent">
                        <div class="tab-pane fade show active" id="admin-queue-pane" role="tabpanel">
                            <!-- Original queue content will be moved here -->
                        </div>
                        <div class="tab-pane fade" id="admin-booking-pane" role="tabpanel">
                            <div id="adminBookingManagementContent">
                                <div class="booking-tab-loading">
                                    <div class="spinner-border text-primary mb-3" role="status">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                    <p class="text-muted">Loading booking management...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                // Move existing content to queue tab
                const existingContent = Array.from(queueManagementSection.children);
                const queuePane = tabContainer.querySelector('#admin-queue-pane');
                existingContent.forEach(element => {
                    queuePane.appendChild(element);
                });

                // Add tab structure
                queueManagementSection.appendChild(tabContainer);
                console.log('🔧 [QueueManagement] Created admin dashboard tab structure');
            }

            // Set up booking access check for admin dashboard
            const currentUser = auth.currentUser;
            if (currentUser) {
                await waitForSubscriptionReady(AccessControl);
                await checkAdminBookingAccess(AccessControl, AdminClaims, currentUser);
            }

            // Set up tab click handler for admin dashboard
            setupAdminBookingTabHandler(AccessControl, AdminClaims);
        }

        console.log('🔧 [QueueManagement] ✅ Admin dashboard booking support initialized');

    } catch (error) {
        console.error('🔧 [QueueManagement] Error setting up admin dashboard booking support:', error);
    }
}

async function checkAdminBookingAccess(AccessControl, AdminClaims, user) {
    try {
        console.log('🔧 [QueueManagement] Checking admin booking access...');

        const subscription = await AccessControl.getCurrentSubscription();
        const hasBookingFeature = await AccessControl.canUseFeature('bookingManagement');

        console.log('🔧 [QueueManagement] Admin access check:', {
            hasBookingFeature,
            tier: subscription?.tierId,
            billingCycle: subscription?.billingCycle,
            userId: user.uid,
            subscriptionFeatures: subscription?.features,
            subscriptionData: subscription
        });

        const bookingTab = document.getElementById('admin-booking-tab');
        const bookingLockIcon = document.getElementById('admin-booking-lock-icon');

        if (!bookingTab) return;

        // Access based solely on subscription tier features
        if (hasBookingFeature) {
            bookingTab.classList.remove('disabled');
            if (bookingLockIcon) bookingLockIcon.classList.add('d-none');
            bookingTab.title = '';
            console.log('🔧 [QueueManagement] Admin booking tab UNLOCKED - Has booking feature');
        } else {
            bookingTab.classList.add('disabled');
            if (bookingLockIcon) bookingLockIcon.classList.remove('d-none');
            bookingTab.title = 'Upgrade required for booking management';
            console.log('🔧 [QueueManagement] Admin booking tab LOCKED - Subscription upgrade required');
        }

    } catch (error) {
        console.error('🔧 [QueueManagement] Error checking admin booking access:', error);
    }
}

function setupAdminBookingTabHandler(AccessControl, AdminClaims) {
    const bookingTab = document.getElementById('admin-booking-tab');
    if (!bookingTab) return;

    bookingTab.addEventListener('click', async function (e) {
        if (this.classList.contains('disabled')) {
            e.preventDefault();
            e.stopPropagation();
            await showBookingAccessMessage(AccessControl, AdminClaims);
            return false;
        }

        // Load booking management if not disabled
        if (!bookingTabInitialized && !this.classList.contains('disabled')) {
            await initializeAdminBookingTab();
        }
    });
}

async function initializeAdminBookingTab() {
    if (bookingTabInitialized) return;

    try {
        const bookingContainer = document.getElementById('adminBookingManagementContent');
        if (!bookingContainer) return;

        bookingContainer.innerHTML = '<div class="booking-tab-loading"><div class="spinner-border text-primary mb-3"><span class="visually-hidden">Loading...</span></div><p class="text-muted">Initializing booking management...</p></div>';

        // Load booking management component with cache-busting
        const bookingModule = await import(`./modules/booking-management.js?v=${Date.now()}`);

        // Change the container ID temporarily for initialization
        bookingContainer.id = 'bookingManagementContent';
        await bookingModule.initializeBookingManagement();
        bookingContainer.id = 'adminBookingManagementContent';

        bookingTabInitialized = true;
        console.log('🔧 [QueueManagement] Admin booking management initialized');

    } catch (error) {
        console.error('🔧 [QueueManagement] Error initializing admin booking tab:', error);
        const errorContainer = document.getElementById('adminBookingManagementContent');
        if (errorContainer) {
            errorContainer.innerHTML = `
                <div class="alert alert-danger">
                    <h5><i class="fas fa-exclamation-triangle me-2"></i>Error Loading Booking Management</h5>
                    <p>Failed to load booking management: ${error.message}</p>
                    <button class="btn btn-outline-danger" onclick="location.reload()">
                        <i class="fas fa-refresh me-2"></i>Retry
                    </button>
                </div>
            `;
        }
    }
}

async function initializeBookingTabSupport() {
    console.log('🔧 [QueueManagement] Initializing booking tab support...');

    // Check if booking tab elements exist
    const bookingTab = document.getElementById('booking-tab');
    if (!bookingTab) {
        console.log('🔧 [QueueManagement] No booking tab found, skipping booking support');
        return;
    }

    try {
        // Import required modules dynamically
        const [
            { auth, onAuthStateChanged },
            AccessControl,
            { AdminClaims }
        ] = await Promise.all([
            import('./config/firebase-config.js'),
            import('./modules/access-control/services/access-control-service.js'),
            import('./auth/admin-claims.js')
        ]);

        // Set up authentication listener if not already set
        if (!currentUser) {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    currentUser = user;
                    // Wait for subscription system to be ready
                    await waitForSubscriptionReady(AccessControl);
                    await checkBookingAccess(AccessControl, AdminClaims);
                }
            });
        } else {
            // Wait for subscription system to be ready
            await waitForSubscriptionReady(AccessControl);
            await checkBookingAccess(AccessControl, AdminClaims);
        }

        // Set up tab click handler
        setupBookingTabHandler(AccessControl, AdminClaims);

        console.log('🔧 [QueueManagement] ✅ Booking tab support initialized');

    } catch (error) {
        console.error('🔧 [QueueManagement] Error initializing booking tab support:', error);
    }
}

async function waitForSubscriptionReady(AccessControl, maxRetries = 10) {
    console.log('🔧 [QueueManagement] Waiting for subscription system to be ready...');

    for (let i = 0; i < maxRetries; i++) {
        try {
            const subscription = await AccessControl.getCurrentSubscription();
            const tierId = subscription?.tierId || subscription?.tier;
            if (subscription && tierId) {
                console.log('🔧 [QueueManagement] Subscription system ready:', tierId);
                return subscription;
            }
        } catch (error) {
            console.log('🔧 [QueueManagement] Subscription not ready yet, retrying...', i + 1);
        }

        // Wait 500ms between retries
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.warn('🔧 [QueueManagement] Subscription system not ready after retries, continuing anyway');
    return null;
}

async function checkBookingAccess(AccessControl, AdminClaims) {
    try {
        console.log('🔧 [QueueManagement] Checking booking access for user:', currentUser?.uid);

        // Debug subscription info
        const subscription = await AccessControl.getCurrentSubscription();
        console.log('🔧 [QueueManagement] Current subscription:', subscription);

        const hasBookingFeature = await AccessControl.canUseFeature('bookingManagement');

        console.log('🔧 [QueueManagement] Access check results:', {
            hasBookingFeature,
            userTier: subscription?.tierId,
            userPlan: subscription?.tier,
            subscriptionFeatures: subscription?.features
        });

        const bookingTab = document.getElementById('booking-tab');
        const bookingLockIcon = document.getElementById('booking-lock-icon');

        if (!bookingTab) return;

        // Access based solely on subscription tier features
        const shouldAllowBooking = hasBookingFeature;

        if (shouldAllowBooking) {
            bookingTab.classList.remove('disabled');
            if (bookingLockIcon) bookingLockIcon.classList.add('d-none');
            bookingTab.title = '';
            console.log('🔧 [QueueManagement] Booking tab UNLOCKED - Has booking feature');
        } else {
            bookingTab.classList.add('disabled');
            if (bookingLockIcon) bookingLockIcon.classList.remove('d-none');
            bookingTab.title = 'Upgrade required for booking management';
            console.log('🔧 [QueueManagement] Booking tab LOCKED - Subscription upgrade required');
        }

        console.log('🔧 [QueueManagement] Booking access checked:', {
            hasBookingFeature,
            disabled: bookingTab.classList.contains('disabled')
        });

    } catch (error) {
        console.error('🔧 [QueueManagement] Error checking booking access:', error);
    }
}

function setupBookingTabHandler(AccessControl, AdminClaims) {
    const bookingTab = document.getElementById('booking-tab');
    if (!bookingTab) return;

    bookingTab.addEventListener('click', async function (e) {
        if (this.classList.contains('disabled')) {
            e.preventDefault();
            e.stopPropagation();
            await showBookingAccessMessage(AccessControl, AdminClaims);
            return false;
        }

        // If not disabled and not initialized, load booking management
        if (!bookingTabInitialized && !this.classList.contains('disabled')) {
            await initializeBookingTab();
        }
    });
}

async function showBookingAccessMessage(AccessControl, AdminClaims) {
    try {
        const subscription = await AccessControl.getCurrentSubscription();
        const hasBookingFeature = await AccessControl.canUseFeature('bookingManagement');

        let message, title, redirectUrl;

        if (!hasBookingFeature) {
            title = 'Booking Management Locked';
            message = 'Booking Management is available for Professional and Enterprise plans. Upgrade to manage restaurant bookings and reservations.';
            redirectUrl = '/user-subscription.html?feature=bookingManagement';
        } else {
            // This shouldn't happen, but just in case
            title = 'Access Issue';
            message = 'There was an issue accessing Booking Management. Please contact support.';
            redirectUrl = '/user-dashboard.html';
        }

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: title,
                text: message,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: 'Upgrade Plan',
                cancelButtonText: 'Cancel'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.location.href = redirectUrl;
                }
            });
        } else {
            alert(message);
        }
    } catch (error) {
        console.error('🔧 [QueueManagement] Error showing booking access message:', error);
    }
}

function addTabStyles() {
    // Check if styles already exist
    if (document.getElementById('qms-tab-styles')) return;

    const style = document.createElement('style');
    style.id = 'qms-tab-styles';
    style.textContent = `
        /* Tab Navigation Styles */
        .nav-tabs-custom {
            border-bottom: 2px solid #e9ecef;
            margin-bottom: 30px;
        }
        .nav-tabs-custom .nav-link {
            color: #6c757d;
            border: none;
            border-bottom: 2px solid transparent;
            font-weight: 500;
            padding: 15px 25px;
            transition: all 0.3s ease;
        }
        .nav-tabs-custom .nav-link:hover {
            border-color: transparent;
            color: #667eea;
        }
        .nav-tabs-custom .nav-link.active {
            color: #667eea;
            border-bottom-color: #667eea;
            background: none;
        }
        .nav-tabs-custom .nav-link.disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .tab-pane {
            animation: fadeIn 0.3s ease-in;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        /* Booking tab loading state */
        .booking-tab-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 300px;
            flex-direction: column;
        }
        .booking-tab-loading .spinner-border {
            width: 3rem;
            height: 3rem;
        }
    `;
    document.head.appendChild(style);
    console.log('🔧 [QueueManagement] Tab styles added');
}

async function initializeBookingTab() {
    if (bookingTabInitialized) return;

    try {
        const bookingContainer = document.getElementById('bookingManagementContent');
        if (!bookingContainer) return;

        bookingContainer.innerHTML = '<div class="booking-tab-loading"><div class="spinner-border text-primary mb-3"><span class="visually-hidden">Loading...</span></div><p class="text-muted">Initializing booking management...</p></div>';

        // Dynamically load booking management component
        const bookingModule = await import('./modules/booking-management.js');
        await bookingModule.initializeBookingManagement();

        bookingTabInitialized = true;
        console.log('🔧 [QueueManagement] Booking management tab initialized successfully');

    } catch (error) {
        console.error('🔧 [QueueManagement] Error initializing booking tab:', error);
        const bookingContainer = document.getElementById('bookingManagementContent');
        if (bookingContainer) {
            bookingContainer.innerHTML = `
                <div class="alert alert-danger">
                    <h5><i class="fas fa-exclamation-triangle me-2"></i>Error Loading Booking Management</h5>
                    <p>Failed to load booking management: ${error.message}</p>
                    <button class="btn btn-outline-danger" onclick="location.reload()">
                        <i class="fas fa-refresh me-2"></i>Retry
                    </button>
                </div>
            `;
        }
    }
}

// Initialize Queue Management
let queueManagementApp = null;

export async function initializeQueueManagement() {
    console.log('🔧 [QueueManagement] Initializing...');

    const container = document.getElementById('queueManagementContent');
    if (!container) {
        console.error('🔧 [QueueManagement] ❌ Container not found');
        return;
    }

    console.log('🔧 [QueueManagement] Container state:', {
        display: window.getComputedStyle(container).display,
        visibility: window.getComputedStyle(container).visibility,
        children: container.children.length,
        hasExistingApp: !!container.querySelector('#queue-management-app')
    });

    // Clean up any existing Vue app first
    if (queueManagementApp) {
        console.log('🔧 [QueueManagement] Cleaning up existing app...');
        queueManagementApp.unmount();
        queueManagementApp = null;
    }

    // Find existing app container or create new one
    let appContainer = container.querySelector('#queue-management-app');
    if (!appContainer) {
        // Simplified tab structure detection
        const isInAdminDashboard = window.location.pathname.includes('admin-dashboard');
        const staticContent = container.querySelector('.container-fluid');
        // Check for tabs in the entire document, not just inside this container
        // (standalone HTML has tabs at parent level)
        const existingTabs = document.querySelector('#qmsTabsNav') || document.querySelector('#adminQmsTabsNav');

        console.log('🔧 [QueueManagement] Structure detection:', {
            isInAdminDashboard,
            hasStaticContent: !!staticContent,
            hasExistingTabs: !!existingTabs,
            existingTabsId: existingTabs?.id,
            willCreateStructure: !staticContent && !existingTabs
        });

        if (!staticContent && !existingTabs) {
            if (isInAdminDashboard) {
                // In admin dashboard - create tab structure
                console.log('🔧 [QueueManagement] Creating admin dashboard tab structure');
                container.innerHTML = `
                    <div class="container-fluid">
                        <!-- Tab Navigation -->
                        <ul class="nav nav-tabs nav-tabs-custom mb-3" id="adminQmsTabsNav" role="tablist">
                            <li class="nav-item" role="presentation">
                                <button class="nav-link active" id="admin-queue-tab" data-bs-toggle="tab" data-bs-target="#admin-queue-pane" type="button" role="tab">
                                    <i class="fas fa-clock me-2"></i>Queue Management
                                </button>
                            </li>
                            <li class="nav-item" role="presentation" id="admin-booking-tab-container">
                                <button class="nav-link" id="admin-booking-tab" data-bs-toggle="tab" data-bs-target="#admin-booking-pane" type="button" role="tab">
                                    <i class="fas fa-calendar-alt me-2"></i>Booking Management
                                    <i class="fas fa-lock ms-2 d-none" id="admin-booking-lock-icon"></i>
                                </button>
                            </li>
                        </ul>
                        
                        <!-- Tab Content -->
                        <div class="tab-content" id="adminQmsTabsContent">
                            <!-- Queue Management Tab -->
                            <div class="tab-pane fade show active" id="admin-queue-pane" role="tabpanel">
                                <div id="queueManagementVueContent">
                                    <!-- Vue Queue Management App will mount here -->
                                </div>
                            </div>

                            <!-- Booking Management Tab -->
                            <div class="tab-pane fade" id="admin-booking-pane" role="tabpanel">
                                <div id="adminBookingManagementContent">
                                    <div class="booking-tab-loading">
                                        <div class="spinner-border text-primary mb-3" role="status">
                                            <span class="visually-hidden">Loading...</span>
                                        </div>
                                        <p class="text-muted">Loading booking management...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // Standalone page - create full structure with header
                container.innerHTML = `
                    <div class="container-fluid">
                        <div class="row">
                            <div class="col-12">
                                <div class="d-flex justify-content-between align-items-center mb-4">
                                    <h2><i class="fas fa-clock me-2"></i>Queue Management</h2>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Tab Navigation -->
                        <ul class="nav nav-tabs nav-tabs-custom" id="qmsTabsNav" role="tablist">
                            <li class="nav-item" role="presentation">
                                <button class="nav-link active" id="queue-tab" data-bs-toggle="tab" data-bs-target="#queue-pane" type="button" role="tab">
                                    <i class="fas fa-clock me-2"></i>Queue Management
                                </button>
                            </li>
                            <li class="nav-item" role="presentation" id="booking-tab-container">
                                <button class="nav-link" id="booking-tab" data-bs-toggle="tab" data-bs-target="#booking-pane" type="button" role="tab">
                                    <i class="fas fa-calendar-alt me-2"></i>Booking Management
                                    <i class="fas fa-lock ms-2 d-none" id="booking-lock-icon"></i>
                                </button>
                            </li>
                        </ul>

                        <!-- Tab Content -->
                        <div class="tab-content" id="qmsTabsContent">
                            <!-- Queue Management Tab -->
                            <div class="tab-pane fade show active" id="queue-pane" role="tabpanel">
                                <div id="queueManagementVueContent">
                                    <!-- Vue Queue Management App will mount here -->
                                </div>
                            </div>

                            <!-- Booking Management Tab -->
                            <div class="tab-pane fade" id="booking-pane" role="tabpanel">
                                <div id="bookingManagementContent">
                                    <!-- Booking Management will be loaded here dynamically -->
                                    <div class="booking-tab-loading">
                                        <div class="spinner-border text-primary mb-3" role="status">
                                            <span class="visually-hidden">Loading...</span>
                                        </div>
                                        <p class="text-muted">Loading booking management...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        } else {
            console.log('🔧 [QueueManagement] Using existing HTML structure (tabs already exist)');
        }

        // Simplified container selection logic
        appContainer = document.createElement('div');
        appContainer.id = 'queue-management-app';

        // Simple priority-based container selection
        const vueContent = container.querySelector('#queueManagementVueContent');
        if (vueContent) {
            vueContent.appendChild(appContainer);
            console.log('🔧 [QueueManagement] Mounted Vue app in queueManagementVueContent');
        } else {
            container.appendChild(appContainer);
            console.log('🔧 [QueueManagement] Mounted Vue app directly in main container');
        }

        console.log('🔧 [QueueManagement] Created new app container');
    } else {
        // Clear existing content and reuse container
        appContainer.innerHTML = '';
        console.log('🔧 [QueueManagement] Cleared existing app container');
    }

    // Create and mount Vue app with error handling
    try {
        const mountTarget = document.querySelector('#queue-management-app');
        if (!mountTarget || !mountTarget.isConnected) {
            throw new Error('Mount target not available or not connected to DOM');
        }

        queueManagementApp = Vue.createApp(QueueManagementApp);
        queueManagementApp.mount('#queue-management-app');
        console.log('🔧 [QueueManagement] ✅ Vue app mounted successfully');
    } catch (error) {
        console.error('🔧 [QueueManagement] ❌ Vue mounting failed:', error);

        // Fallback: Create minimal functional UI
        const fallbackContainer = document.querySelector('#queue-management-app');
        if (fallbackContainer) {
            fallbackContainer.innerHTML = `
                <div class="alert alert-warning">
                    <h5><i class="fas fa-exclamation-triangle me-2"></i>Loading Issue</h5>
                    <p>The queue management system is having trouble loading. Please refresh the page.</p>
                    <button class="btn btn-outline-warning" onclick="location.reload()">
                        <i class="fas fa-refresh me-2"></i>Refresh Page
                    </button>
                </div>
            `;
        }
        throw new Error(`Vue mounting failed: ${error.message}`);
    }

    // Add tab CSS if not already present
    addTabStyles();

    // Initialize booking tab functionality
    // NOTE: Don't check container.id === 'queueManagementContent' - standalone page uses this ID too
    const isInAdminDashboard = container.closest('.admin-dashboard') ||
        document.querySelector('.admin-dashboard') ||
        document.querySelector('.navbar-brand[href*="admin"]') ||
        window.location.pathname.includes('admin-dashboard');

    console.log('🔧 [QueueManagement] Context detection:', {
        isInAdminDashboard,
        containerId: container.id,
        containerClass: container.className,
        pathname: window.location.pathname
    });

    if (!isInAdminDashboard) {
        // User dashboard - use existing booking tab support
        await initializeBookingTabSupport();
    } else {
        // Admin dashboard - add booking tab if it doesn't exist, then initialize support
        console.log('🔧 [QueueManagement] Initializing booking support for admin dashboard');
        await initializeAdminDashboardBookingSupport();
    }

    console.log('🔧 [QueueManagement] ✅ Successfully initialized and mounted');
    return queueManagementApp;
}

export function cleanupQueueManagement() {
    console.log('🔧 [QueueManagement] Cleaning up...');

    if (queueManagementApp) {
        console.log('🔧 [QueueManagement] Unmounting Vue app...');
        queueManagementApp.unmount();
        queueManagementApp = null;
        console.log('🔧 [QueueManagement] ✅ Vue app unmounted');
    }

    // Reset booking initialization state on cleanup
    bookingTabInitialized = false;
    console.log('🔧 [QueueManagement] Reset booking initialization state on cleanup');

    // Clean up the DOM element as well
    const appContainer = document.getElementById('queue-management-app');
    if (appContainer) {
        console.log('🔧 [QueueManagement] Removing app container...');
        appContainer.remove();
        console.log('🔧 [QueueManagement] ✅ App container removed');
    }
}