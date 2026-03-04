// Consent Management Vue Component
const ConsentManagement = {
    template: `
        <div class="consent-management">
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Consent Management</h5>
                    <button class="btn btn-primary" @click="showUpdateConsentModal">
                        <i class="fas fa-edit"></i> Update Consent Settings
                    </button>
                </div>
                <div class="card-body">
                    <!-- Consent Status Overview -->
                    <div class="row mb-4">
                        <div class="col-md-3">
                            <div class="stats-card bg-light p-3 rounded">
                                <h6>Total Guests</h6>
                                <h3>{{ totalGuests }}</h3>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="stats-card bg-success bg-opacity-10 p-3 rounded">
                                <h6>Consented</h6>
                                <h3>{{ consentedGuests }}</h3>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="stats-card bg-danger bg-opacity-10 p-3 rounded">
                                <h6>Declined</h6>
                                <h3>{{ declinedGuests }}</h3>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="stats-card bg-warning bg-opacity-10 p-3 rounded">
                                <h6>Pending</h6>
                                <h3>{{ pendingGuests }}</h3>
                            </div>
                        </div>
                    </div>

                    <!-- Consent Records Table -->
                    <div class="table-responsive">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Guest</th>
                                    <th>Status</th>
                                    <th>Platform</th>
                                    <th>Version</th>
                                    <th>Last Updated</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="guest in filteredGuests" :key="guest.phoneNumber">
                                    <td>
                                        {{ guest.name }}<br>
                                        <small class="text-muted">{{ guest.phoneNumber }}</small>
                                    </td>
                                    <td>
                                        <span :class="getStatusBadgeClass(guest.consent?.status)">
                                            {{ guest.consent?.status || 'pending' }}
                                        </span>
                                    </td>
                                    <td>{{ guest.consent?.platform || 'N/A' }}</td>
                                    <td>{{ guest.consent?.version || 'N/A' }}</td>
                                    <td>{{ formatDate(guest.consent?.timestamp) }}</td>
                                    <td>
                                        <div class="btn-group btn-group-sm">
                                            <button class="btn btn-info" @click="viewConsentHistory(guest)">
                                                <i class="fas fa-history"></i>
                                            </button>
                                            <button class="btn btn-warning" @click="resetConsent(guest)">
                                                <i class="fas fa-redo"></i>
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
            consentHistory: {},
            loading: false,
            error: null
        };
    },

    computed: {
        totalGuests() {
            return this.guests.length;
        },
        consentedGuests() {
            return this.guests.filter(g => g.consent?.status === 'accepted').length;
        },
        declinedGuests() {
            return this.guests.filter(g => g.consent?.status === 'declined').length;
        },
        pendingGuests() {
            return this.guests.filter(g => !g.consent).length;
        },
        filteredGuests() {
            return this.guests;
        }
    },

    methods: {
        async loadGuests() {
            this.loading = true;
            try {
                const snapshot = await firebase.database().ref('guests').once('value');
                const guests = snapshot.val() || {};
                
                this.guests = Object.entries(guests).map(([phoneNumber, data]) => ({
                    phoneNumber,
                    ...data
                }));
            } catch (error) {
                console.error('Error loading guests:', error);
                this.error = 'Failed to load guest data';
            } finally {
                this.loading = false;
            }
        },

        getStatusBadgeClass(status) {
            const classes = {
                accepted: 'badge bg-success',
                declined: 'badge bg-danger',
                pending: 'badge bg-warning'
            };
            return classes[status] || classes.pending;
        },

        formatDate(timestamp) {
            if (!timestamp) return 'N/A';
            return new Date(timestamp).toLocaleDateString();
        },

        async viewConsentHistory(guest) {
            try {
                const snapshot = await firebase.database()
                    .ref(`consent-history/${guest.phoneNumber}`)
                    .once('value');
                
                const history = snapshot.val() || [];
                
                Swal.fire({
                    title: 'Consent History',
                    html: `
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th>Platform</th>
                                        <th>Version</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${history.map(record => `
                                        <tr>
                                            <td>${this.formatDate(record.timestamp)}</td>
                                            <td>${record.status}</td>
                                            <td>${record.platform}</td>
                                            <td>${record.version}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `,
                    width: '600px'
                });
            } catch (error) {
                console.error('Error loading consent history:', error);
                Swal.fire('Error', 'Failed to load consent history', 'error');
            }
        },

        async resetConsent(guest) {
            try {
                const result = await Swal.fire({
                    title: 'Reset Consent Status?',
                    text: 'This will require the guest to provide consent again.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#dc3545',
                    confirmButtonText: 'Yes, reset it'
                });

                if (result.isConfirmed) {
                    // Archive current consent status
                    if (guest.consent) {
                        await firebase.database()
                            .ref(`consent-history/${guest.phoneNumber}`)
                            .push(guest.consent);
                    }

                    // Remove current consent
                    await firebase.database()
                        .ref(`guests/${guest.phoneNumber}/consent`)
                        .remove();

                    await this.loadGuests();
                    Swal.fire('Reset', 'Consent status has been reset', 'success');
                }
            } catch (error) {
                console.error('Error resetting consent:', error);
                Swal.fire('Error', 'Failed to reset consent status', 'error');
            }
        },

        async showUpdateConsentModal() {
            const { value: settings } = await Swal.fire({
                title: 'Update Consent Settings',
                html: `
                    <div class="mb-3">
                        <label class="form-label">Consent Version</label>
                        <input id="consentVersion" class="form-control" value="1.0">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Privacy Policy URL</label>
                        <input id="privacyUrl" class="form-control" value="/privacy">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Consent Message</label>
                        <textarea id="consentMessage" class="form-control" rows="4">We value your privacy and want to be transparent about how we use your data to provide you with the best experience.</textarea>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'Update'
            });

            if (settings) {
                try {
                    await firebase.database().ref('settings/consent').set({
                        version: document.getElementById('consentVersion').value,
                        privacyUrl: document.getElementById('privacyUrl').value,
                        message: document.getElementById('consentMessage').value,
                        updatedAt: Date.now()
                    });

                    Swal.fire('Updated', 'Consent settings have been updated', 'success');
                } catch (error) {
                    console.error('Error updating consent settings:', error);
                    Swal.fire('Error', 'Failed to update settings', 'error');
                }
            }
        }
    },

    mounted() {
        this.loadGuests();
    }
};

// Export for use in admin dashboard
export default ConsentManagement;