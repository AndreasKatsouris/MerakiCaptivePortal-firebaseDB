import { auth, rtdb, ref, get, set, update, push, onValue, off, serverTimestamp } from '../config/firebase-config.js';
import { FeatureGuard } from './access-control/components/feature-guard.js';
import AccessControl from './access-control/services/access-control-service.js';
import { AdminClaims } from '../auth/admin-claims.js';
import { BookingPermissionService } from '../services/booking-permission-service.js';

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

// Booking Management Vue Component
const BookingManagementApp = {
    name: 'BookingManagementApp',
    components: {
        FeatureGuard
    },
    template: `
        <FeatureGuard 
            feature="bookingManagement" 
            :show-placeholder="true"
            :show-upgrade-button="true"
            placeholder-message="Booking Management System is available for Professional and Enterprise plans. Upgrade to manage restaurant bookings and reservations with advanced features.">
            <div class="booking-management-container">
                <!-- Statistics Cards -->
                <div class="row mb-4">
                    <div class="col-lg-3 col-md-6 mb-3">
                        <div class="card bg-primary text-white">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h3 class="mb-0">{{ bookingStats.total }}</h3>
                                        <small>Total Bookings</small>
                                    </div>
                                    <div class="opacity-50">
                                        <i class="fas fa-calendar-alt fa-2x"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-3 col-md-6 mb-3">
                        <div class="card bg-warning text-white">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h3 class="mb-0">{{ bookingStats.pending }}</h3>
                                        <small>Pending</small>
                                    </div>
                                    <div class="opacity-50">
                                        <i class="fas fa-clock fa-2x"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-3 col-md-6 mb-3">
                        <div class="card bg-success text-white">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h3 class="mb-0">{{ bookingStats.confirmed }}</h3>
                                        <small>Confirmed</small>
                                    </div>
                                    <div class="opacity-50">
                                        <i class="fas fa-check-circle fa-2x"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-lg-3 col-md-6 mb-3">
                        <div class="card bg-info text-white">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h3 class="mb-0">{{ bookingStats.today }}</h3>
                                        <small>Today</small>
                                    </div>
                                    <div class="opacity-50">
                                        <i class="fas fa-calendar-day fa-2x"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Filters and Controls -->
                <div class="card mb-4">
                    <div class="card-body">
                        <div class="row align-items-end">
                            <div class="col-md-3">
                                <label class="form-label">Date Filter</label>
                                <input type="date" class="form-control" v-model="filters.date">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Location</label>
                                <select class="form-select" v-model="filters.location">
                                    <option value="">All Locations</option>
                                    <option v-for="location in locations" :key="location.id" :value="location.name">
                                        {{ location.name }}
                                    </option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Status</label>
                                <select class="form-select" v-model="filters.status">
                                    <option value="">All Status</option>
                                    <option value="pending">Pending</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">Actions</label>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-primary" @click="showCreateBookingModal" :disabled="isLoading">
                                        <i class="fas fa-plus me-2"></i>New Booking
                                    </button>
                                    <button class="btn btn-outline-secondary" @click="refreshBookings" :disabled="isLoading">
                                        <i class="fas fa-sync-alt me-2" :class="{'fa-spin': isLoading}"></i>Refresh
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Bookings List -->
                <div class="card">
                    <div class="card-header">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">
                                <i class="fas fa-list me-2"></i>Bookings
                                <span class="badge bg-secondary ms-2">{{ filteredBookings.length }}</span>
                            </h5>
                            <div class="btn-group" role="group">
                                <button type="button" class="btn btn-sm btn-outline-secondary" 
                                        :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'">
                                    <i class="fas fa-th"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary" 
                                        :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'">
                                    <i class="fas fa-list"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div v-if="isLoading" class="text-center py-4">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                        
                        <div v-else-if="filteredBookings.length === 0" class="text-center py-4">
                            <i class="fas fa-calendar-times fa-3x text-muted mb-3"></i>
                            <p class="text-muted">No bookings found</p>
                            <button class="btn btn-primary" @click="showCreateBookingModal">
                                <i class="fas fa-plus me-2"></i>Create First Booking
                            </button>
                        </div>
                        
                        <div v-else>
                            <!-- Grid View -->
                            <div v-if="viewMode === 'grid'" class="row">
                                <div v-for="booking in filteredBookings" :key="booking.id" 
                                     class="col-xl-4 col-lg-6 col-md-6 mb-4">
                                    <div class="card h-100" :class="getBookingCardClass(booking.status)">
                                        <div class="card-body">
                                            <div class="d-flex justify-content-between align-items-start mb-3">
                                                <h6 class="card-title mb-0">{{ booking.guestName }}</h6>
                                                <span class="badge" :class="getStatusBadgeClass(booking.status)">
                                                    {{ booking.status }}
                                                </span>
                                            </div>
                                            <div class="mb-2">
                                                <small class="text-muted">
                                                    <i class="fas fa-phone me-2"></i>{{ booking.phoneNumber }}
                                                </small>
                                            </div>
                                            <div class="mb-2">
                                                <small class="text-muted">
                                                    <i class="fas fa-calendar me-2"></i>{{ formatDate(booking.date) }}
                                                    <i class="fas fa-clock ms-3 me-2"></i>{{ booking.time }}
                                                </small>
                                            </div>
                                            <div class="mb-2">
                                                <small class="text-muted">
                                                    <i class="fas fa-map-marker-alt me-2"></i>{{ booking.location }}
                                                </small>
                                            </div>
                                            <div class="mb-3">
                                                <small class="text-muted">
                                                    <i class="fas fa-users me-2"></i>{{ booking.numberOfGuests }} guests
                                                </small>
                                            </div>
                                            <div class="btn-group w-100" role="group">
                                                <button class="btn btn-sm btn-outline-primary" 
                                                        @click="editBooking(booking)">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button v-if="booking.status === 'pending'" 
                                                        class="btn btn-sm btn-success" 
                                                        @click="updateBookingStatus(booking.id, 'confirmed')">
                                                    <i class="fas fa-check"></i>
                                                </button>
                                                <button v-if="booking.status !== 'cancelled'" 
                                                        class="btn btn-sm btn-danger" 
                                                        @click="updateBookingStatus(booking.id, 'cancelled')">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                                <button class="btn btn-sm btn-info" 
                                                        @click="notifyGuest(booking)">
                                                    <i class="fas fa-bell"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- List View -->
                            <div v-else class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Guest</th>
                                            <th>Phone</th>
                                            <th>Date & Time</th>
                                            <th>Location</th>
                                            <th>Guests</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="booking in filteredBookings" :key="booking.id">
                                            <td>
                                                <strong>{{ booking.guestName }}</strong>
                                                <div v-if="booking.specialRequests" class="text-muted small">
                                                    <i class="fas fa-star me-1"></i>{{ booking.specialRequests }}
                                                </div>
                                            </td>
                                            <td>{{ booking.phoneNumber }}</td>
                                            <td>
                                                {{ formatDate(booking.date) }}<br>
                                                <small class="text-muted">{{ booking.time }}</small>
                                            </td>
                                            <td>{{ booking.location }}</td>
                                            <td>{{ booking.numberOfGuests }}</td>
                                            <td>
                                                <span class="badge" :class="getStatusBadgeClass(booking.status)">
                                                    {{ booking.status }}
                                                </span>
                                            </td>
                                            <td>
                                                <div class="btn-group" role="group">
                                                    <button class="btn btn-sm btn-outline-primary" 
                                                            @click="editBooking(booking)">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button v-if="booking.status === 'pending'" 
                                                            class="btn btn-sm btn-success" 
                                                            @click="updateBookingStatus(booking.id, 'confirmed')">
                                                        <i class="fas fa-check"></i>
                                                    </button>
                                                    <button v-if="booking.status !== 'cancelled'" 
                                                            class="btn btn-sm btn-danger" 
                                                            @click="updateBookingStatus(booking.id, 'cancelled')">
                                                        <i class="fas fa-times"></i>
                                                    </button>
                                                    <button class="btn btn-sm btn-info" 
                                                            @click="notifyGuest(booking)">
                                                        <i class="fas fa-bell"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Create/Edit Booking Modal -->
                <div v-if="showBookingModal" class="modal d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">
                                    <i class="fas fa-calendar-plus me-2"></i>
                                    {{ isEditMode ? 'Edit Booking' : 'Create New Booking' }}
                                </h5>
                                <button type="button" class="btn-close" @click="closeBookingModal"></button>
                            </div>
                            <div class="modal-body">
                                <div v-if="error" class="alert alert-danger">{{ error }}</div>
                                
                                <form @submit.prevent="saveBooking">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label class="form-label">Guest Name *</label>
                                                <input type="text" class="form-control" v-model="bookingForm.guestName" required>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label class="form-label">Phone Number *</label>
                                                <input type="tel" class="form-control" v-model="bookingForm.phoneNumber" required>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label class="form-label">Date *</label>
                                                <input type="date" class="form-control" v-model="bookingForm.date" required>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label class="form-label">Time *</label>
                                                <input type="time" class="form-control" v-model="bookingForm.time" required>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label class="form-label">Location *</label>
                                                <select class="form-select" v-model="bookingForm.location" required>
                                                    <option value="">Select location...</option>
                                                    <option v-for="location in locations" :key="location.id" :value="location.name">
                                                        {{ location.name }}
                                                    </option>
                                                </select>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="mb-3">
                                                <label class="form-label">Number of Guests *</label>
                                                <input type="number" class="form-control" v-model="bookingForm.numberOfGuests" 
                                                       min="1" max="20" required>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Section</label>
                                        <select class="form-select" v-model="bookingForm.section">
                                            <option value="">Select section...</option>
                                            <option value="Inside">Inside</option>
                                            <option value="Outside/Patio">Outside/Patio</option>
                                            <option value="Bar Area">Bar Area</option>
                                            <option value="Private Dining">Private Dining</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Status</label>
                                        <select class="form-select" v-model="bookingForm.status">
                                            <option value="pending">Pending</option>
                                            <option value="confirmed">Confirmed</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">Special Requests</label>
                                        <textarea class="form-control" v-model="bookingForm.specialRequests" rows="3" 
                                                  placeholder="Birthday celebration, anniversary, allergies, etc."></textarea>
                                    </div>
                                </form>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" @click="closeBookingModal">Cancel</button>
                                <button type="button" class="btn btn-primary" @click="saveBooking" :disabled="isLoading">
                                    <span v-if="isLoading" class="spinner-border spinner-border-sm me-2"></span>
                                    <i class="fas fa-save me-2"></i>{{ isEditMode ? 'Update' : 'Create' }} Booking
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
            bookings: [],
            locations: [],
            isLoading: false,
            error: null,
            showBookingModal: false,
            isEditMode: false,
            currentBookingId: null,
            viewMode: 'grid',
            filters: {
                date: '',
                location: '',
                status: ''
            },
            bookingForm: {
                guestName: '',
                phoneNumber: '',
                date: '',
                time: '',
                location: '',
                section: '',
                numberOfGuests: 1,
                status: 'pending',
                specialRequests: ''
            },
            subscription: null,
            bookingListener: null
        };
    },
    computed: {
        filteredBookings() {
            return this.bookings.filter(booking => {
                const dateMatch = !this.filters.date || booking.date === this.filters.date;
                const locationMatch = !this.filters.location || booking.location === this.filters.location;
                const statusMatch = !this.filters.status || booking.status === this.filters.status;

                return dateMatch && locationMatch && statusMatch;
            }).sort((a, b) => {
                // Sort by date and time
                const dateA = new Date(`${a.date} ${a.time}`);
                const dateB = new Date(`${b.date} ${b.time}`);
                return dateB - dateA; // Most recent first
            });
        },
        bookingStats() {
            const today = new Date().toISOString().split('T')[0];
            return {
                total: this.bookings.length,
                pending: this.bookings.filter(b => b.status === 'pending').length,
                confirmed: this.bookings.filter(b => b.status === 'confirmed').length,
                today: this.bookings.filter(b => b.date === today).length
            };
        }
    },
    async mounted() {
        await this.loadSubscriptionData();
        await this.loadLocations();
        this.setupBookingListener();
        // Set default date for new bookings
        this.bookingForm.date = new Date().toISOString().split('T')[0];
    },
    beforeUnmount() {
        this.cleanupListeners();
    },
    methods: {
        async loadSubscriptionData() {
            try {
                this.subscription = await AccessControl.getCurrentSubscription();
            } catch (error) {
                console.error('Error loading subscription data:', error);
            }
        },

        async loadLocations() {
            console.log('[BookingManagement] loadLocations called');
            try {
                const currentUser = auth.currentUser;
                console.log('[BookingManagement] Current user:', currentUser?.uid);
                if (!currentUser) {
                    console.warn('[BookingManagement] No authenticated user, cannot load locations');
                    return;
                }

                // Get user's accessible locations first
                const userLocationsRef = ref(rtdb, `userLocations/${currentUser.uid}`);
                const userLocationsSnapshot = await get(userLocationsRef);

                if (!userLocationsSnapshot.exists()) {
                    console.warn('[BookingManagement] User has no location access defined');
                    this.locations = [];
                    return;
                }

                const accessibleLocationIds = Object.keys(userLocationsSnapshot.val());
                console.log('[BookingManagement] User has access to locations:', accessibleLocationIds);

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

                    console.log(`[BookingManagement] Loaded ${this.locations.length} accessible locations for user`);

                    // Auto-select if only one location
                    if (this.locations.length === 1) {
                        this.bookingForm.location = this.locations[0].name;
                        console.log('[BookingManagement] Auto-selected single location:', this.bookingForm.location);
                    }
                } else {
                    console.warn('[BookingManagement] No locations found in database');
                    this.locations = [];
                }
            } catch (error) {
                console.error('[BookingManagement] Error loading locations:', error);
                this.error = 'Failed to load locations';
            }
        },

        setupBookingListener() {
            this.cleanupListeners();

            // PERFORMANCE FIX: Debounce listener updates to prevent handler violations
            let debounceTimer = null;

            const bookingsRef = ref(rtdb, 'bookings');
            this.bookingListener = onValue(bookingsRef, (snapshot) => {
                // Clear existing debounce timer
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }

                // Debounce the processing to avoid rapid updates
                debounceTimer = setTimeout(() => {
                    this.processBookingSnapshot(snapshot);
                }, 50); // Process after 50ms of no updates
            }, (error) => {
                console.error('Booking listener error:', error);
                this.error = 'Failed to load booking data';
            });
        },

        processBookingSnapshot(snapshot) {
            const bookingsData = snapshot.val() || {};
            this.bookings = Object.entries(bookingsData).map(([id, booking]) => ({
                id,
                ...booking
            }));
        },

        cleanupListeners() {
            if (this.bookingListener) {
                off(ref(rtdb, 'bookings'), 'value', this.bookingListener);
                this.bookingListener = null;
            }
        },

        async refreshBookings() {
            this.isLoading = true;
            try {
                // Force refresh by re-setting up the listener
                this.setupBookingListener();
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('Booking data refreshed successfully');
            } catch (error) {
                console.error('Error refreshing bookings:', error);
                this.error = 'Failed to refresh booking data';
            } finally {
                this.isLoading = false;
            }
        },

        showCreateBookingModal() {
            this.isEditMode = false;
            this.currentBookingId = null;
            this.resetBookingForm();
            this.showBookingModal = true;
        },

        editBooking(booking) {
            this.isEditMode = true;
            this.currentBookingId = booking.id;
            this.populateBookingForm(booking);
            this.showBookingModal = true;
        },

        populateBookingForm(booking) {
            this.bookingForm = {
                guestName: booking.guestName || '',
                phoneNumber: booking.phoneNumber || '',
                date: booking.date || '',
                time: booking.time || '',
                location: booking.location || '',
                section: booking.section || '',
                numberOfGuests: booking.numberOfGuests || 1,
                status: booking.status || 'pending',
                specialRequests: booking.specialRequests || ''
            };
        },

        resetBookingForm() {
            this.bookingForm = {
                guestName: '',
                phoneNumber: '',
                date: new Date().toISOString().split('T')[0],
                time: '',
                location: '',
                section: '',
                numberOfGuests: 1,
                status: 'pending',
                specialRequests: ''
            };
        },

        closeBookingModal() {
            this.showBookingModal = false;
            this.error = null;
            this.resetBookingForm();
        },

        async saveBooking() {
            if (!this.bookingForm.guestName || !this.bookingForm.phoneNumber || !this.bookingForm.date ||
                !this.bookingForm.time || !this.bookingForm.location) {
                this.error = 'Please fill in all required fields';
                return;
            }

            this.isLoading = true;
            this.error = null;

            try {
                const currentUser = auth.currentUser;
                if (!currentUser) {
                    throw new Error('User not authenticated');
                }

                // Verify booking permissions (admin or location-based)
                console.log('[BookingManager] Verifying booking management permissions...');
                const bookingForPermissionCheck = { location: this.bookingForm.location };
                const permissionResult = await BookingPermissionService.canManageBooking(bookingForPermissionCheck, currentUser);

                if (!permissionResult.hasAccess) {
                    throw new Error(`Booking management permissions required. ${permissionResult.reason}. Please contact your administrator if you should have access to this location.`);
                }

                console.log('[BookingManager] Permission granted:', permissionResult.reason);

                const bookingData = {
                    guestName: this.bookingForm.guestName,
                    phoneNumber: normalizePhoneNumber(this.bookingForm.phoneNumber),
                    date: this.bookingForm.date,
                    time: this.bookingForm.time,
                    location: this.bookingForm.location,
                    section: this.bookingForm.section,
                    numberOfGuests: parseInt(this.bookingForm.numberOfGuests),
                    status: this.bookingForm.status,
                    specialRequests: this.bookingForm.specialRequests,
                    updatedAt: serverTimestamp(),
                    updatedBy: currentUser.uid
                };

                console.log('[BookingManager] Admin verification successful, saving booking...');
                if (this.isEditMode) {
                    await update(ref(rtdb, `bookings/${this.currentBookingId}`), bookingData);
                    this.showSuccessMessage('Booking updated successfully');
                } else {
                    const newBookingRef = push(ref(rtdb, 'bookings'));
                    bookingData.createdAt = serverTimestamp();
                    bookingData.createdBy = currentUser.uid;

                    await set(newBookingRef, bookingData);
                    this.showSuccessMessage('Booking created successfully');

                    // Send notification to guest
                    await this.sendBookingNotification({ id: newBookingRef.key, ...bookingData });
                }

                this.closeBookingModal();

            } catch (error) {
                console.error('Error saving booking:', error);

                // Enhanced error handling with specific permission guidance
                let errorMessage = 'Failed to save booking: ' + error.message;
                if (error.message.includes('permissions required') || error.message.includes('PERMISSION_DENIED')) {
                    errorMessage = 'You do not have permission to manage bookings for this location. Please contact your administrator to grant access.';
                }

                this.error = errorMessage;
            } finally {
                this.isLoading = false;
            }
        },

        async updateBookingStatus(bookingId, newStatus) {
            const result = await Swal.fire({
                title: 'Confirm Status Change',
                text: `Are you sure you want to ${newStatus} this booking?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: newStatus === 'confirmed' ? '#28a745' : '#dc3545',
                cancelButtonColor: '#6c757d',
                confirmButtonText: `Yes, ${newStatus} it!`
            });

            if (result.isConfirmed) {
                try {
                    const currentUser = auth.currentUser;
                    if (!currentUser) {
                        throw new Error('User not authenticated');
                    }

                    // Verify booking permissions before updating
                    console.log('[BookingManager] Verifying booking management permissions for update...');
                    const booking = this.bookings.find(b => b.id === bookingId);
                    const permissionResult = await BookingPermissionService.canManageBooking(booking, currentUser);

                    if (!permissionResult.hasAccess) {
                        throw new Error(`Booking management permissions required. ${permissionResult.reason}. Please contact your administrator if you should have access to this location.`);
                    }

                    console.log('[BookingManager] Admin verification successful, updating booking status...');
                    await update(ref(rtdb, `bookings/${bookingId}`), {
                        status: newStatus,
                        updatedAt: serverTimestamp(),
                        updatedBy: currentUser.uid
                    });

                    this.showSuccessMessage(`Booking ${newStatus} successfully`);

                    // Send notification to guest
                    if (booking) {
                        await this.sendStatusUpdateNotification({ ...booking, status: newStatus });
                    }

                } catch (error) {
                    console.error('Error updating booking status:', error);

                    // Enhanced error handling with specific permission guidance
                    let errorMessage = 'Failed to update booking status';
                    if (error.message.includes('permissions required') || error.message.includes('PERMISSION_DENIED')) {
                        errorMessage = 'You do not have permission to manage bookings for this location. Please contact your administrator to grant access.';
                    }

                    Swal.fire({
                        title: 'Error!',
                        text: errorMessage,
                        icon: 'error',
                        confirmButtonText: 'OK'
                    });
                }
            }
        },

        async notifyGuest(booking) {
            try {
                await this.sendBookingNotification(booking);
                this.showSuccessMessage('Guest notification sent successfully');
            } catch (error) {
                console.error('Error sending notification:', error);
                Swal.fire('Error!', 'Failed to send notification', 'error');
            }
        },

        async sendBookingNotification(booking) {
            try {
                const response = await fetch('https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/sendGuestBookingNotification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(booking)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to send notification');
                }

                const result = await response.json();
                console.log('Booking notification sent successfully:', result);

            } catch (error) {
                console.error('Error sending booking notification:', error);
                throw error;
            }
        },

        async sendStatusUpdateNotification(booking) {
            try {
                const response = await fetch('https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net/sendGuestStatusNotification', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(booking)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to send status update notification');
                }

                const result = await response.json();
                console.log('Status notification sent successfully:', result);

            } catch (error) {
                console.error('Error sending status notification:', error);
                throw error;
            }
        },

        showSuccessMessage(message) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Success!',
                    text: message,
                    icon: 'success',
                    timer: 3000,
                    showConfirmButton: false
                });
            }
        },

        formatDate(dateString) {
            if (!dateString) return '';
            const date = new Date(dateString);
            return date.toLocaleDateString();
        },

        getBookingCardClass(status) {
            switch (status) {
                case 'pending': return 'border-warning';
                case 'confirmed': return 'border-success';
                case 'cancelled': return 'border-danger';
                default: return '';
            }
        },

        getStatusBadgeClass(status) {
            switch (status) {
                case 'pending': return 'bg-warning text-dark';
                case 'confirmed': return 'bg-success';
                case 'cancelled': return 'bg-danger';
                default: return 'bg-secondary';
            }
        }
    }
};

// Initialize Booking Management
let bookingManagementApp = null;

// Booking Management Module Initialization
export async function initializeBookingManagement() {
    console.log('🔧 [BookingManagement] Initializing... (v' + new Date().getTime() + ')');
    console.log('🔧 [BookingManagement] Module loaded with location filtering enabled');

    const container = document.getElementById('bookingManagementContent');
    if (!container) {
        console.error('🔧 [BookingManagement] ❌ Container not found');
        return;
    }

    // Clean up any existing Vue app first
    if (bookingManagementApp) {
        console.log('🔧 [BookingManagement] Cleaning up existing app...');
        bookingManagementApp.unmount();
        bookingManagementApp = null;
    }

    // Clear container and create Vue app container
    container.innerHTML = '<div id="booking-management-app"></div>';

    // Create and mount Vue app
    bookingManagementApp = Vue.createApp(BookingManagementApp);
    bookingManagementApp.mount('#booking-management-app');

    console.log('🔧 [BookingManagement] ✅ Successfully initialized and mounted');
    return bookingManagementApp;
}

export function cleanupBookingManagement() {
    console.log('🔧 [BookingManagement] Cleaning up...');

    if (bookingManagementApp) {
        console.log('🔧 [BookingManagement] Unmounting Vue app...');
        bookingManagementApp.unmount();
        bookingManagementApp = null;
        console.log('🔧 [BookingManagement] ✅ Vue app unmounted');
    }

    // Clean up the DOM element as well
    const appContainer = document.getElementById('booking-management-app');
    if (appContainer) {
        console.log('🔧 [BookingManagement] Removing app container...');
        appContainer.remove();
        console.log('🔧 [BookingManagement] ✅ App container removed');
    }
}