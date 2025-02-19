// Import Firebase dependencies
import { auth, rtdb, ref, get, push, set, update, remove } from './config/firebase-config.js';

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
                        <input 
                            type="text" 
                            v-model="searchQuery" 
                            class="form-control" 
                            placeholder="Search guests..."
                        >
                        <button 
                            @click="showAddGuestModal" 
                            class="btn btn-primary"
                        >
                            <i class="fas fa-plus"></i> Add Guest
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
                        <div class="table-responsive">
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
                                        <th @click="sort('metrics.averageSpend')">
                                            Avg. Spend 
                                            <i :class="getSortIcon('metrics.averageSpend')"></i>
                                        </th>
                                        <th @click="sort('metrics.lifetimeValue')">
                                            Lifetime Value 
                                            <i :class="getSortIcon('metrics.lifetimeValue')"></i>
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
                                        <td>{{ guest.name || 'N/A' }}</td>
                                        <td>{{ guest.phoneNumber || 'N/A' }}</td>
                                        <td>{{ guest.metrics?.visitCount || 0 }} visits</td>
                                        <td>R{{ (guest.metrics?.totalSpent || 0).toFixed(2) }}</td>
                                        <td>R{{ (guest.metrics?.lifetimeValue || 0).toFixed(2) }}</td>
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
                                        <td>{{ formatDate(guest.metrics?.lastVisitDate) }}</td>
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
                sortConfig: {
                    key: 'name',
                    direction: 'asc'
                },
                currentAnalyticsGuest: null,
                showAddGuestModal: false
            };
        },

        computed: {
            filteredGuests() {
                if (!Array.isArray(this.guests)) return [];
                
                let result = this.guests;

                if (this.searchQuery) {
                    const query = this.searchQuery.toLowerCase();
                    result = result.filter(guest => {
                        const name = guest?.name || '';
                        const phone = guest?.phoneNumber || '';
                        return name.toLowerCase().includes(query) || phone.includes(query);
                    });
                }

                const key = this.sortConfig?.key || 'name';
                const direction = this.sortConfig?.direction || 'asc';

                result = [...result].sort((a, b) => {
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
            async loadGuests() {
                this.loading = true;
                this.error = null;
                try {
                    const snapshot = await get(ref(rtdb, 'guests'));
                    const guestsData = snapshot.val() || {};
                    
                    this.guests = Object.entries(guestsData).map(([phoneNumber, data]) => {
                        // Get guest receipts and calculate metrics
                        const metrics = this.calculateGuestMetrics(data);
                        
                        return {
                            phoneNumber,
                            name: data.name || 'N/A',
                            createdAt: data.createdAt,
                            lastConsentPrompt: data.lastConsentPrompt,
                            consent: data.consent || false,
                            tier: data.tier || 'Bronze',
                            updatedAt: data.updatedAt,
                            metrics
                        };
                    });
                } catch (error) {
                    console.error('Error loading guests:', error);
                    this.error = 'Failed to load guests. Please try again.';
                    this.guests = [];
                } finally {
                    this.loading = false;
                }
            },

            calculateGuestMetrics(guestData) {
                if (!guestData) return {
                    visitCount: 0,
                    totalSpent: 0,
                    averageSpend: 0,
                    lastVisit: null,
                    engagementScore: this.calculateEngagementScore(guestData)
                };

                const now = new Date();
                const lastActivity = guestData.lastConsentPrompt || guestData.createdAt;
                
                return {
                    visitCount: 0, // Will implement when receipt tracking is added
                    totalSpent: 0, // Will implement when receipt tracking is added
                    averageSpend: 0, // Will implement when receipt tracking is added
                    lastVisit: lastActivity,
                    engagementScore: this.calculateEngagementScore(guestData)
                };
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
                const { value: formValues } = await Swal.fire({
                    title: 'Add New Guest',
                    html: `
                        <div class="form-group mb-3">
                            <label for="name">Name</label>
                            <input id="name" class="form-control" placeholder="Guest Name">
                        </div>
                        <div class="form-group mb-3">
                            <label for="phoneNumber">Phone Number</label>
                            <input id="phoneNumber" class="form-control" placeholder="+27 Phone Number">
                        </div>
                    `,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonText: 'Add',
                    cancelButtonText: 'Cancel',
                    preConfirm: () => {
                        const name = Swal.getPopup().querySelector('#name').value;
                        const phoneNumber = Swal.getPopup().querySelector('#phoneNumber').value;
                        
                        if (!name || !phoneNumber) {
                            Swal.showValidationMessage('Please fill in all fields');
                            return false;
                        }
                        
                        // Validate phone number format
                        if (!phoneNumber.startsWith('+27')) {
                            Swal.showValidationMessage('Phone number must start with +27');
                            return false;
                        }
                        
                        return { name, phoneNumber };
                    }
                });

                if (formValues) {
                    try {
                        const now = new Date().toISOString();
                        const guestRef = ref(rtdb, `guests/${formValues.phoneNumber}`);
                        await set(guestRef, {
                            name: formValues.name,
                            phoneNumber: formValues.phoneNumber,
                            createdAt: now,
                            updatedAt: now,
                            consent: false,
                            tier: 'Bronze',
                            lastConsentPrompt: null
                        });
                        
                        await this.loadGuests();
                        Swal.fire('Success', 'Guest added successfully', 'success');
                    } catch (error) {
                        console.error('Error adding guest:', error);
                        Swal.fire('Error', 'Failed to add guest', 'error');
                    }
                }
            },

            async getGuestReceipts(phoneNumber) {
                try {
                    const receiptsRef = ref(rtdb, `receipts/${phoneNumber}`);
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
                                <p><strong>Phone:</strong> ${guest.phoneNumber}</p>
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
                            <input id="editPhone" class="form-control" value="${guest.phoneNumber}" readonly>
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
                        const guestRef = ref(rtdb, `guests/${guest.phoneNumber}`);
                        await update(guestRef, {
                            name: formValues.name,
                            tier: formValues.tier,
                            consent: formValues.consent,
                            updatedAt: new Date().toISOString(),
                            lastConsentPrompt: formValues.consent !== guest.consent ? new Date().toISOString() : guest.lastConsentPrompt
                        });
                        
                        await this.loadGuests();
                        Swal.fire('Success', 'Guest updated successfully', 'success');
                    } catch (error) {
                        console.error('Error updating guest:', error);
                        Swal.fire('Error', 'Failed to update guest', 'error');
                    }
                }
            },

            async deleteGuest(guest) {
                const result = await Swal.fire({
                    title: 'Delete Guest',
                    text: `Are you sure you want to delete ${guest.name || 'this guest'}?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Delete',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#dc3545'
                });

                if (result.isConfirmed) {
                    try {
                        const guestRef = ref(rtdb, `guests/${guest.phoneNumber}`);
                        await remove(guestRef);
                        
                        await this.loadGuests();
                        Swal.fire('Success', 'Guest deleted successfully', 'success');
                    } catch (error) {
                        console.error('Error deleting guest:', error);
                        Swal.fire('Error', 'Failed to delete guest', 'error');
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
                    ReactDOM.render(
                        React.createElement(window.GuestAnalytics, { phoneNumber: guest.phoneNumber }),
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
            }
        },

        mounted() {
            this.loadGuests();
            
            // Initialize tooltips
            const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltipTriggerList.map(tooltipTriggerEl => 
                new bootstrap.Tooltip(tooltipTriggerEl)
            );
        }
    }
};

function initializeGuestManagement() {
    // Guest menu click handler
    const guestManagementMenu = document.getElementById('guestManagementMenu');
    if (guestManagementMenu) {
        guestManagementMenu.addEventListener('click', function(e) {
            e.preventDefault();
            showGuestManagement();
        });
    }
}

function showGuestManagement() {
    // Hide other sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
    });

    // Show guest management section
    const guestSection = document.getElementById('guestManagementContent');
    if (guestSection) {
        guestSection.style.display = 'block';
    }

    // Initialize Vue app if not already done
    if (!guestManagement.app) {
        const app = Vue.createApp(guestManagement.component);
        const mountPoint = document.getElementById('guest-management-app');
        if (mountPoint) {
            guestManagement.app = app;
            guestManagement.app.mount('#guest-management-app');
        }
    }
}

// Export initialization and cleanup functions
export { initializeGuestManagement };

function cleanupGuestManagement() {
    if (guestManagement.app) {
        guestManagement.app.unmount();
        guestManagement.app = null;
    }
}