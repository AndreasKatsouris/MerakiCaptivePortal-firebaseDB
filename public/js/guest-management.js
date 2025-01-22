// Guest Management State
const guestManagement = {
    app: null,
    component: {
        template: `
            <div class="container-fluid">
                <!-- Header Section -->
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

                <!-- Loading State -->
                <div v-if="loading" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="sr-only">Loading...</span>
                    </div>
                </div>

                <!-- Main Table -->
                <div v-else class="card">
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
                                        <th @click="sort('visitCount')">
                                            Visit Frequency 
                                            <i :class="getSortIcon('visitCount')"></i>
                                        </th>
                                        <th @click="sort('averageSpend')">
                                            Avg. Spend 
                                            <i :class="getSortIcon('averageSpend')"></i>
                                        </th>
                                        <th @click="sort('lifetimeValue')">
                                            Lifetime Value 
                                            <i :class="getSortIcon('lifetimeValue')"></i>
                                        </th>
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
                                            <div class="btn-group btn-group-sm">
                                                <button 
                                                    @click="viewGuest(guest)" 
                                                    class="btn btn-info"
                                                    title="View Guest"
                                                >
                                                    <i class="fas fa-eye"></i>
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
                loading: false
            }
        },

        computed: {
            filteredGuests() {
                let result = this.guests;

                // Apply search filter
                if (this.searchQuery) {
                    const query = this.searchQuery.toLowerCase();
                    result = result.filter(guest => 
                        guest.name?.toLowerCase().includes(query) ||
                        guest.phoneNumber.includes(query)
                    );
                }

                // Apply sorting
                result = [...result].sort((a, b) => {
                    let aVal = this.getSortValue(a, this.sortConfig.key);
                    let bVal = this.getSortValue(b, this.sortConfig.key);

                    if (aVal < bVal) return this.sortConfig.direction === 'asc' ? -1 : 1;
                    if (aVal > bVal) return this.sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                });

                return result;
            }
        },

        methods: {
            async loadGuests() {
                this.loading = true;
                try {
                    const snapshot = await firebase.database().ref('guests').once('value');
                    const guests = snapshot.val();
                    
                    if (guests) {
                        this.guests = Object.entries(guests).map(([phoneNumber, data]) => ({
                            phoneNumber,
                            ...data,
                            metrics: this.calculateGuestMetrics(data)
                        }));
                    }
                } catch (error) {
                    console.error('Error loading guests:', error);
                    Swal.fire('Error', 'Failed to load guests', 'error');
                } finally {
                    this.loading = false;
                }
            },

            calculateGuestMetrics(guestData) {
                const visits = guestData.visits || [];
                const receipts = guestData.receipts || {};
                
                const totalSpend = visits.reduce((sum, visit) => sum + (visit.amount || 0), 0) +
                                 Object.values(receipts).reduce((sum, receipt) => sum + (receipt.totalAmount || 0), 0);
                
                const frequency = visits.length + Object.keys(receipts).length;
                
                return {
                    visitCount: frequency,
                    averageSpend: frequency > 0 ? totalSpend / frequency : 0,
                    lifetimeValue: totalSpend,
                    lastVisit: visits.length > 0 ? Math.max(...visits.map(v => v.date)) : null,
                    points: guestData.points || 0,
                    tier: this.calculateLoyaltyTier(totalSpend, frequency)
                };
            },

            calculateLoyaltyTier(totalSpend, frequency) {
                if (totalSpend > 10000 && frequency > 20) return 'PLATINUM';
                if (totalSpend > 5000 && frequency > 10) return 'GOLD';
                if (totalSpend > 2000 && frequency > 5) return 'SILVER';
                return 'BRONZE';
            },

            getSortValue(guest, key) {
                switch (key) {
                    case 'visitCount':
                        return guest.metrics.visitCount;
                    case 'averageSpend':
                        return guest.metrics.averageSpend;
                    case 'lifetimeValue':
                        return guest.metrics.lifetimeValue;
                    default:
                        return guest[key];
                }
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
                Swal.fire({
                    title: guest.name || 'Guest Details',
                    html: `
                        <div class="guest-details">
                            <p><strong>Phone:</strong> ${guest.phoneNumber}</p>
                            <p><strong>Visit Count:</strong> ${guest.metrics.visitCount}</p>
                            <p><strong>Average Spend:</strong> R${guest.metrics.averageSpend.toFixed(2)}</p>
                            <p><strong>Lifetime Value:</strong> R${guest.metrics.lifetimeValue.toFixed(2)}</p>
                            <p><strong>Last Visit:</strong> ${guest.metrics.lastVisit ? new Date(guest.metrics.lastVisit).toLocaleDateString() : 'Never'}</p>
                            <p><strong>Loyalty Tier:</strong> ${guest.metrics.tier}</p>
                            <p><strong>Points:</strong> ${guest.metrics.points}</p>
                        </div>
                    `,
                    width: '600px'
                });
            },

            async editGuest(guest) {
                const { value: formValues } = await Swal.fire({
                    title: 'Edit Guest',
                    html: `
                        <input id="editName" class="swal2-input" value="${guest.name || ''}" placeholder="Guest Name">
                        <input id="editPhone" class="swal2-input" value="${guest.phoneNumber}" readonly>
                    `,
                    focusConfirm: false,
                    showCancelButton: true,
                    preConfirm: () => ({
                        name: document.getElementById('editName').value,
                        phoneNumber: guest.phoneNumber
                    })
                });

                if (formValues) {
                    try {
                        await firebase.database().ref(`guests/${guest.phoneNumber}`).update({
                            name: formValues.name,
                            updatedAt: Date.now()
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
                    title: 'Delete Guest?',
                    text: 'This action cannot be undone.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#dc3545',
                    confirmButtonText: 'Yes, delete guest'
                });

                if (result.isConfirmed) {
                    try {
                        await firebase.database().ref(`guests/${guest.phoneNumber}`).remove();
                        await this.loadGuests();
                        Swal.fire('Deleted!', 'Guest has been deleted.', 'success');
                    } catch (error) {
                        console.error('Error deleting guest:', error);
                        Swal.fire('Error', 'Failed to delete guest', 'error');
                    }
                }
            }
        },

        mounted() {
            this.loadGuests();
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

export { initializeGuestManagement };