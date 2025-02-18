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
                                        <td>{{ guest.phoneNumber }}</td>
                                        <td>{{ guest.metrics.visitCount }} visits</td>
                                        <td>R{{ guest.metrics.averageSpend.toFixed(2) }}</td>
                                        <td>R{{ guest.metrics.lifetimeValue.toFixed(2) }}</td>
                                        <td>
                                            <div class="d-flex align-items-center">
                                                <div class="progress flex-grow-1" style="height: 8px;">
                                                    <div 
                                                        class="progress-bar" 
                                                        :class="getEngagementClass(guest.metrics.engagementScore)"
                                                        :style="{ width: guest.metrics.engagementScore + '%' }"
                                                    ></div>
                                                </div>
                                                <span class="ms-2">{{ guest.metrics.engagementScore }}%</span>
                                            </div>
                                        </td>
                                        <td>{{ guest.metrics.favoriteStore }}</td>
                                        <td>{{ formatDate(guest.metrics.lastVisitDate) }}</td>
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
                searchQuery: '',
                sortConfig: {
                    key: 'name',
                    direction: 'asc'
                },
                loading: false,
                currentAnalyticsGuest: null
            }
        },

        computed: {
            filteredGuests() {
                // Keep existing filtered guests logic
                let result = this.guests;

                if (this.searchQuery) {
                    const query = this.searchQuery.toLowerCase();
                    result = result.filter(guest => 
                        guest.name?.toLowerCase().includes(query) ||
                        guest.phoneNumber.includes(query)
                    );
                }

                result = [...result].sort((a, b) => {
                    let aVal = this.getSortValue(a, this.sortConfig.key);
                    let bVal = this.getSortValue(b, this.sortConfig.key);

                    if (aVal < bVal) return this.sortConfig.direction === 'asc' ? -1 : 1;
                    if (aVal > bVal) return this.sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                });

                return result;
            },

            // New computed properties for analytics summary
            activeGuestsCount() {
                const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
                return this.guests.filter(guest => 
                    guest.metrics.lastVisitDate > thirtyDaysAgo
                ).length;
            },

            averageEngagement() {
                if (this.guests.length === 0) return 0;
                const totalEngagement = this.guests.reduce((sum, guest) => 
                    sum + guest.metrics.engagementScore, 0
                );
                return Math.round(totalEngagement / this.guests.length);
            },

            totalRevenue() {
                return this.guests.reduce((sum, guest) => 
                    sum + guest.metrics.lifetimeValue, 0
                );
            }
        },

        methods: {
            async loadGuests() {
                this.loading = true;
                try {
                    const snapshot = await get(ref(rtdb, 'guests'));
                    const guests = snapshot.val();
                    
                    if (guests) {
                        this.guests = await Promise.all(Object.entries(guests).map(async ([phoneNumber, data]) => {
                            const receipts = await this.getGuestReceipts(phoneNumber);
                            const metrics = await this.calculateGuestMetrics({
                                ...data,
                                receipts,
                                phoneNumber
                            });

                            return {
                                phoneNumber,
                                ...data,
                                receipts,
                                metrics
                            };
                        }));
                    }
                } catch (error) {
                    console.error('Error loading guests:', error);
                    Swal.fire('Error', 'Failed to load guests', 'error');
                } finally {
                    this.loading = false;
                }
            },

            async getGuestReceipts(phoneNumber) {
                try {
                    // Debug authentication state
                    const currentUser = auth.currentUser;
                    console.log('Current user:', currentUser);
                    console.log('Auth token claims:', await currentUser?.getIdTokenResult());
                    
                    // Normalize phone number by ensuring it has a + prefix
                    const normalizedPhone = phoneNumber.startsWith('+') ? 
                        phoneNumber : 
                        `+${phoneNumber}`;
                        
                    console.log('Attempting to access:', normalizedPhone);
                    
                    // First check guest-receipts index
                    const receiptIndexSnapshot = await get(ref(rtdb, `guest-receipts/${normalizedPhone}`));
                    
                    const receiptIds = Object.keys(receiptIndexSnapshot.val() || {});
                    
                    // Fetch full receipt details
                    const receiptsData = await Promise.all(
                        receiptIds.map(async id => {
                            const receiptSnapshot = await get(ref(rtdb, `receipts/${id}`));
                            return { id, ...receiptSnapshot.val() };
                        })
                    );

                    return receiptsData;
                } catch (error) {
                    console.error('Error retrieving receipts:', error, {
                        phoneNumber,
                        authState: auth.currentUser?.uid,
                        claims: await auth.currentUser?.getIdTokenResult()
                    });
                    return [];
                }
            },

            calculateGuestMetrics(guestData) {
                if (!guestData || !guestData.receipts) {
                    return {
                        visitCount: 0,
                        totalSpent: 0,
                        averageSpend: 0,
                        lastVisit: null,
                        engagementScore: 0
                    };
                }

                const receipts = Object.values(guestData.receipts || {});
                const now = new Date();
                
                // Basic metrics
                const visitCount = receipts.length;
                const totalSpent = receipts.reduce((sum, receipt) => sum + (receipt.total || 0), 0);
                const averageSpend = visitCount > 0 ? totalSpent / visitCount : 0;
                const lastVisit = receipts.length > 0 
                    ? new Date(Math.max(...receipts.map(r => new Date(r.timestamp))))
                    : null;

                // Visit frequency (last 30 days)
                const recentReceipts = receipts.filter(r => {
                    const receiptDate = new Date(r.timestamp);
                    return (now - receiptDate) <= 30 * 24 * 60 * 60 * 1000;
                });

                // Group visits by day
                const visitsByDay = {};
                recentReceipts.forEach(receipt => {
                    const day = new Date(receipt.timestamp).toDateString();
                    visitsByDay[day] = (visitsByDay[day] || 0) + 1;
                });

                // Calculate engagement score (0-100)
                let engagementScore = 0;
                if (visitCount > 0) {
                    // Frequency component (40%)
                    const frequencyScore = Math.min(Object.keys(visitsByDay).length / 30 * 100, 100) * 0.4;
                    
                    // Recency component (30%)
                    const daysSinceLastVisit = lastVisit ? (now - lastVisit) / (24 * 60 * 60 * 1000) : 30;
                    const recencyScore = Math.max(0, (30 - daysSinceLastVisit) / 30 * 100) * 0.3;
                    
                    // Spend component (30%)
                    const spendScore = Math.min(averageSpend / 1000 * 100, 100) * 0.3;
                    
                    engagementScore = Math.round(frequencyScore + recencyScore + spendScore);
                }

                return {
                    visitCount,
                    totalSpent,
                    averageSpend,
                    lastVisit,
                    engagementScore
                };
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
                        
                        return { name, phoneNumber };
                    }
                });

                if (formValues) {
                    try {
                        const guestRef = ref(rtdb, `guests/${formValues.phoneNumber}`);
                        await set(guestRef, {
                            name: formValues.name,
                            phoneNumber: formValues.phoneNumber,
                            createdAt: new Date().toISOString(),
                            metrics: {
                                visitCount: 0,
                                totalSpent: 0,
                                lastVisit: null
                            }
                        });
                        
                        await this.loadGuests();
                        Swal.fire('Success', 'Guest added successfully', 'success');
                    } catch (error) {
                        console.error('Error adding guest:', error);
                        Swal.fire('Error', 'Failed to add guest', 'error');
                    }
                }
            },

            async viewGuest(guest) {
                const { metrics, receipts } = guest;
                
                // Calculate receipt patterns
                const dayOfWeekCount = {};
                receipts.forEach(receipt => {
                    const day = new Date(receipt.timestamp).getDay();
                    dayOfWeekCount[day] = (dayOfWeekCount[day] || 0) + 1;
                });

                const timeOfDayCount = {};
                receipts.forEach(receipt => {
                    const hour = new Date(receipt.timestamp).getHours();
                    if (hour < 12) timeOfDayCount['morning'] = (timeOfDayCount['morning'] || 0) + 1;
                    else if (hour < 17) timeOfDayCount['afternoon'] = (timeOfDayCount['afternoon'] || 0) + 1;
                    else timeOfDayCount['evening'] = (timeOfDayCount['evening'] || 0) + 1;
                });

                const html = `
                    <div class="guest-details">
                        <div class="row mb-4">
                            <div class="col-md-6">
                                <h6 class="text-muted">Basic Information</h6>
                                <p><strong>Name:</strong> ${guest.name || 'N/A'}</p>
                                <p><strong>Phone:</strong> ${guest.phoneNumber}</p>
                                <p><strong>Loyalty Tier:</strong> ${guest.metrics.tier}</p>
                                <p><strong>Joined:</strong> ${this.formatDate(guest.metrics.firstVisitDate)}</p>
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-muted">Visit Statistics</h6>
                                <p><strong>Total Visits:</strong> ${guest.metrics.visitCount}</p>
                                <p><strong>Average Spend:</strong> R${guest.metrics.averageSpend.toFixed(2)}</p>
                                <p><strong>Total Spend:</strong> R${guest.metrics.totalSpent.toFixed(2)}</p>
                                <p><strong>Last Visit:</strong> ${this.formatDate(guest.metrics.lastVisitDate)}</p>
                            </div>
                        </div>
                        <div class="row mb-4">
                            <div class="col-md-6">
                                <h6 class="text-muted">Store Preferences</h6>
                                ${Object.entries(guest.metrics.storePreferences || {}).map(([store, visits]) => `
                                    <div class="d-flex justify-content-between mb-2">
                                        <span>${store}</span>
                                        <span>${visits} visits</span>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-muted">Visit Patterns</h6>
                                <p><strong>Preferred Days:</strong></p>
                                ${Object.entries(dayOfWeekCount).map(([day, count]) => 
                                    `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}: ${count}`
                                ).join(', ')}
                                <p class="mt-2"><strong>Time of Day:</strong></p>
                                ${Object.entries(timeOfDayCount).map(([time, count]) => 
                                    `${_.capitalize(time)}: ${count}`
                                ).join(', ')}
                            </div>
                        </div>
                    </div>
                `;

                Swal.fire({
                    title: 'Guest Details',
                    html,
                    width: '800px',
                    showConfirmButton: false,
                    showCloseButton: true
                });
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

            async editGuest(guest) {
                const { value: formValues } = await Swal.fire({
                    title: 'Edit Guest',
                    html: `
                        <input id="editName" class="swal2-input" value="${guest.name || ''}" placeholder="Guest Name">
                        <input id="editPhone" class="swal2-input" value="${guest.phoneNumber}" readonly>
                        <select id="editTier" class="swal2-select">
                            <option value="BRONZE" ${guest.metrics.tier === 'BRONZE' ? 'selected' : ''}>Bronze</option>
                            <option value="SILVER" ${guest.metrics.tier === 'SILVER' ? 'selected' : ''}>Silver</option>
                            <option value="GOLD" ${guest.metrics.tier === 'GOLD' ? 'selected' : ''}>Gold</option>
                            <option value="PLATINUM" ${guest.metrics.tier === 'PLATINUM' ? 'selected' : ''}>Platinum</option>
                        </select>
                    `,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonText: 'Update',
                    preConfirm: () => ({
                        name: document.getElementById('editName').value,
                        phoneNumber: guest.phoneNumber,
                        tier: document.getElementById('editTier').value
                    })
                });

                if (formValues) {
                    try {
                        // Update guest data
                        await update(ref(rtdb, `guests/${guest.phoneNumber}`), {
                            name: formValues.name,
                            tier: formValues.tier,
                            updatedAt: Date.now()
                        });

                        // Reload guests data
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
                    title: 'Delete Guest?',
                    text: 'This will permanently remove all guest data and history. This action cannot be undone.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#dc3545',
                    confirmButtonText: 'Yes, delete guest'
                });

                if (result.isConfirmed) {
                    try {
                        // Delete guest data and related records
                        const updates = {
                            [`guests/${guest.phoneNumber}`]: null,
                            [`guest-receipts/${guest.phoneNumber}`]: null
                        };

                        await update(ref(rtdb), updates);
                        await this.loadGuests();
                        
                        Swal.fire('Deleted!', 'Guest has been deleted.', 'success');
                    } catch (error) {
                        console.error('Error deleting guest:', error);
                        Swal.fire('Error', 'Failed to delete guest', 'error');
                    }
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
        guestManagement.app = app.mount('#guest-management-app');
    }
}

// Export the initialization function for use in admin-dashboard.js
export { initializeGuestManagement };

// Add cleanup function
export function cleanupGuestManagement() {
    if (guestManagement.app) {
        guestManagement.app.unmount();
        guestManagement.app = null;
    }
}