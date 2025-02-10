const _ = window._;

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
                    const snapshot = await firebase.database().ref('guests').once('value');
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
                    const currentUser = firebase.auth().currentUser;
                    console.log('Current user:', currentUser);
                    console.log('Auth token claims:', await currentUser?.getIdTokenResult());
                    
                    // Normalize phone number by ensuring it has a + prefix
                    const normalizedPhone = phoneNumber.startsWith('+') ? 
                        phoneNumber : 
                        `+${phoneNumber}`;
                        
                    console.log('Attempting to access:', normalizedPhone);
                    
                    // First check guest-receipts index
                    const receiptIndexSnapshot = await firebase.database()
                        .ref('guest-receipts')
                        .child(normalizedPhone)
                        .once('value');
                    
                    const receiptIds = Object.keys(receiptIndexSnapshot.val() || {});
                    
                    // Fetch full receipt details
                    const receiptsData = await Promise.all(
                        receiptIds.map(async id => {
                            const receiptSnapshot = await firebase.database()
                                .ref('receipts')
                                .child(id)
                                .once('value');
                            return { id, ...receiptSnapshot.val() };
                        })
                    );

                    return receiptsData;
                } catch (error) {
                    console.error('Error retrieving receipts:', error, {
                        phoneNumber,
                        authState: firebase.auth().currentUser?.uid,
                        claims: await firebase.auth().currentUser?.getIdTokenResult()
                    });
                    return [];
                }
            },

            async calculateGuestMetrics(guestData) {
                const receipts = guestData.receipts || [];
                const now = Date.now();
                
                // Calculate basic metrics
                const totalSpend = receipts.reduce((sum, receipt) => 
                    sum + (receipt.totalAmount || 0), 0
                );
                
                const visitCount = receipts.length;
                const averageSpend = visitCount > 0 ? totalSpend / visitCount : 0;

                // Calculate time-based metrics
                const receiptDates = receipts
                    .map(r => new Date(r.processedAt).getTime())
                    .sort();
                
                const firstVisit = receiptDates[0];
                const lastVisit = receiptDates[receiptDates.length - 1];

                // Calculate visit frequency
                const visitFrequency = visitCount > 1 ? 
                    Math.round((lastVisit - firstVisit) / (1000 * 60 * 60 * 24 * (visitCount - 1))) : 
                    0;

                // Analyze store preferences
                const storeVisits = _.groupBy(receipts, 'storeName');
                const storeStats = Object.entries(storeVisits)
                    .map(([store, visits]) => ({
                        store,
                        visits: visits.length,
                        totalSpend: visits.reduce((sum, visit) => 
                            sum + (visit.totalAmount || 0), 0
                        )
                    }))
                    .sort((a, b) => b.visits - a.visits);

                // Calculate engagement score
                const daysSinceLastVisit = lastVisit ? 
                    Math.floor((now - lastVisit) / (1000 * 60 * 60 * 24)) : 
                    Infinity;

                const recencyScore = Math.max(0, 100 - (daysSinceLastVisit * 2));
                const frequencyScore = Math.min(100, visitFrequency ? (30 / visitFrequency) * 100 : 0);
                const monetaryScore = Math.min(100, (totalSpend / 10000) * 100);

                const engagementScore = Math.round(
                    (recencyScore * 0.4) + (frequencyScore * 0.3) + (monetaryScore * 0.3)
                );

                return {
                    visitCount,
                    totalSpend,
                    averageSpend,
                    lifetimeValue: totalSpend,
                    firstVisitDate: firstVisit,
                    lastVisitDate: lastVisit,
                    visitFrequency,
                    daysSinceLastVisit,
                    favoriteStore: storeStats[0]?.store || 'N/A',
                    storePreferences: storeStats,
                    engagementScore,
                    tier: this.calculateLoyaltyTier(totalSpend, visitCount)
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
                return _.get(guest, key);
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
                const { metrics, receipts } = guest;
                
                // Calculate receipt patterns
                const dayOfWeekCount = _.countBy(receipts, r => 
                    new Date(r.processedAt).getDay()
                );
                
                const timeOfDayCount = _.countBy(receipts, r => {
                    const hour = new Date(r.processedAt).getHours();
                    if (hour < 12) return 'morning';
                    if (hour < 17) return 'afternoon';
                    return 'evening';
                });

                const html = `
                    <div class="guest-details">
                        <div class="row mb-4">
                            <div class="col-md-6">
                                <h6 class="text-muted">Basic Information</h6>
                                <p><strong>Name:</strong> ${guest.name || 'N/A'}</p>
                                <p><strong>Phone:</strong> ${guest.phoneNumber}</p>
                                <p><strong>Loyalty Tier:</strong> ${metrics.tier}</p>
                                <p><strong>Joined:</strong> ${this.formatDate(metrics.firstVisitDate)}</p>
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-muted">Visit Statistics</h6>
                                <p><strong>Total Visits:</strong> ${metrics.visitCount}</p>
                                <p><strong>Average Spend:</strong> R${metrics.averageSpend.toFixed(2)}</p>
                                <p><strong>Total Spend:</strong> R${metrics.totalSpend.toFixed(2)}</p>
                                <p><strong>Last Visit:</strong> ${this.formatDate(metrics.lastVisitDate)}</p>
                            </div>
                        </div>
                        <div class="row mb-4">
                            <div class="col-md-6">
                                <h6 class="text-muted">Store Preferences</h6>
                                ${metrics.storePreferences.map(store => `
                                    <div class="d-flex justify-content-between mb-2">
                                        <span>${store.store}</span>
                                        <span>${store.visits} visits</span>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="col-md-6">
                                <h6 class="text-muted">Visit Patterns</h6>
                                <p><strong>Preferred Days:</strong></p>
                                ${Object.entries(dayOfWeekCount)
                                    .map(([day, count]) => 
                                        `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]}: ${count}`
                                    )
                                    .join(', ')}
                                <p class="mt-2"><strong>Time of Day:</strong></p>
                                ${Object.entries(timeOfDayCount)
                                    .map(([time, count]) => 
                                        `${_.capitalize(time)}: ${count}`
                                    )
                                    .join(', ')}
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
                        await firebase.database().ref(`guests/${guest.phoneNumber}`).update({
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

                        await firebase.database().ref().update(updates);
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
        guestManagement.app = app.mount('#guestManagementRoot');
    }
}

// Export the initialization function for use in admin-dashboard.js
export { initializeGuestManagement };