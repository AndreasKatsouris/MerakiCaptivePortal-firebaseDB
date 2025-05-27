/**
 * User Dashboard Module
 * Manages the user dashboard interface and location management
 */

import { auth, rtdb, ref, get, set, push, update, remove, onAuthStateChanged } from './config/firebase-config.js';
import { showToast } from './utils/toast.js';

class UserDashboard {
    constructor() {
        this.currentUser = null;
        this.userData = null;
        this.subscription = null;
        this.locations = [];
        this.init();
    }

    async init() {
        // Check authentication
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.currentUser = user;
                await this.loadUserData();
                await this.loadDashboard();
            } else {
                // Redirect to login
                window.location.href = '/user-login.html?message=unauthorized';
            }
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleLogout();
        });

        // Add location buttons
        document.getElementById('addLocationBtn').addEventListener('click', () => {
            this.showAddLocationModal();
        });

        document.getElementById('addLocationAction').addEventListener('click', (e) => {
            e.preventDefault();
            this.showAddLocationModal();
        });

        // Save location button
        document.getElementById('saveLocationBtn').addEventListener('click', async () => {
            await this.saveLocation();
        });

        // Upgrade button
        document.getElementById('upgradeBtn').addEventListener('click', () => {
            this.showUpgradeOptions();
        });
    }

    async loadUserData() {
        try {
            // Load user data
            const userSnapshot = await get(ref(rtdb, `users/${this.currentUser.uid}`));
            this.userData = userSnapshot.val();

            if (!this.userData) {
                throw new Error('User data not found');
            }

            // Load subscription data
            const subscriptionSnapshot = await get(ref(rtdb, `subscriptions/${this.currentUser.uid}`));
            this.subscription = subscriptionSnapshot.val();

            // Update UI with user info
            document.getElementById('userDisplayName').textContent = this.userData.displayName || this.userData.email;
            document.getElementById('welcomeUserName').textContent = this.userData.firstName || this.userData.displayName || 'User';

        } catch (error) {
            console.error('Error loading user data:', error);
            showToast('Error loading user data', 'error');
        }
    }

    async loadDashboard() {
        try {
            // Load subscription info
            await this.loadSubscriptionInfo();

            // Load locations
            await this.loadLocations();

            // Load statistics
            await this.loadStatistics();

        } catch (error) {
            console.error('Error loading dashboard:', error);
            showToast('Error loading dashboard', 'error');
        }
    }

    async loadSubscriptionInfo() {
        if (!this.subscription) {
            document.getElementById('currentPlan').textContent = 'No Plan';
            document.getElementById('subscriptionStatus').textContent = 'Inactive';
            document.getElementById('locationCount').textContent = '0 / 0';
            return;
        }

        // Get tier details
        const tierSnapshot = await get(ref(rtdb, `subscriptionTiers/${this.subscription.tier}`));
        const tierData = tierSnapshot.val();

        if (tierData) {
            document.getElementById('currentPlan').textContent = tierData.name || this.subscription.tier;
            document.getElementById('subscriptionStatus').textContent = this.formatStatus(this.subscription.status);
            
            // Update location count later after loading locations
            this.maxLocations = tierData.maxLocations || 1;
        }
    }

    async loadLocations() {
        try {
            const locationsSnapshot = await get(ref(rtdb, `userLocations/${this.currentUser.uid}`));
            const locationsData = locationsSnapshot.val();

            this.locations = [];
            if (locationsData) {
                this.locations = Object.entries(locationsData).map(([id, data]) => ({
                    id,
                    ...data
                }));
            }

            // Update location count
            document.getElementById('locationCount').textContent = `${this.locations.length} / ${this.maxLocations || 1}`;

            // Render locations
            this.renderLocations();

        } catch (error) {
            console.error('Error loading locations:', error);
            showToast('Error loading locations', 'error');
        }
    }

    renderLocations() {
        const locationsList = document.getElementById('locationsList');
        
        if (this.locations.length === 0) {
            locationsList.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-store fa-3x text-muted mb-3"></i>
                    <p class="text-muted">No locations added yet. Click "Add Location" to get started!</p>
                </div>
            `;
            return;
        }

        locationsList.innerHTML = this.locations.map(location => `
            <div class="location-card">
                <span class="badge bg-success">Active</span>
                <h5>${location.name}</h5>
                <p class="mb-2"><i class="fas fa-map-marker-alt me-2"></i>${location.address}</p>
                <p class="mb-2"><i class="fas fa-phone me-2"></i>${location.phone}</p>
                <p class="mb-2"><i class="fas fa-building me-2"></i>${this.formatLocationType(location.type)}</p>
                <div class="mt-3">
                    <button class="btn btn-sm btn-outline-primary" onclick="dashboard.editLocation('${location.id}')">
                        <i class="fas fa-edit me-1"></i>Edit
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="dashboard.deleteLocation('${location.id}')">
                        <i class="fas fa-trash me-1"></i>Delete
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="dashboard.viewLocationDetails('${location.id}')">
                        <i class="fas fa-chart-bar me-1"></i>Analytics
                    </button>
                </div>
            </div>
        `).join('');
    }

    async loadStatistics() {
        try {
            // Load guest count
            const guestsSnapshot = await get(ref(rtdb, `guests`));
            const guestsData = guestsSnapshot.val();
            let guestCount = 0;
            
            if (guestsData) {
                // Count guests for user's locations
                const locationIds = this.locations.map(loc => loc.id);
                Object.values(guestsData).forEach(guest => {
                    if (guest.locationId && locationIds.includes(guest.locationId)) {
                        guestCount++;
                    }
                });
            }
            
            document.getElementById('totalGuests').textContent = guestCount;

            // Load campaigns count
            const campaignsSnapshot = await get(ref(rtdb, `campaigns`));
            const campaignsData = campaignsSnapshot.val();
            let activeCampaigns = 0;
            
            if (campaignsData) {
                Object.values(campaignsData).forEach(campaign => {
                    if (campaign.userId === this.currentUser.uid && campaign.status === 'active') {
                        activeCampaigns++;
                    }
                });
            }
            
            document.getElementById('activeCampaigns').textContent = activeCampaigns;

            // Load rewards count
            const rewardsSnapshot = await get(ref(rtdb, `rewards`));
            const rewardsData = rewardsSnapshot.val();
            let rewardsCount = 0;
            
            if (rewardsData) {
                Object.values(rewardsData).forEach(reward => {
                    if (reward.userId === this.currentUser.uid) {
                        rewardsCount++;
                    }
                });
            }
            
            document.getElementById('totalRewards').textContent = rewardsCount;

            // Calculate engagement rate
            const engagementRate = guestCount > 0 ? Math.round((rewardsCount / guestCount) * 100) : 0;
            document.getElementById('engagementRate').textContent = `${engagementRate}%`;

        } catch (error) {
            console.error('Error loading statistics:', error);
            // Set default values on error
            document.getElementById('totalGuests').textContent = '0';
            document.getElementById('activeCampaigns').textContent = '0';
            document.getElementById('totalRewards').textContent = '0';
            document.getElementById('engagementRate').textContent = '0%';
        }
    }

    showAddLocationModal() {
        // Check if user can add more locations
        if (this.locations.length >= (this.maxLocations || 1)) {
            Swal.fire({
                title: 'Location Limit Reached',
                text: `Your current plan allows up to ${this.maxLocations || 1} location(s). Upgrade your plan to add more locations.`,
                icon: 'warning',
                confirmButtonText: 'Upgrade Plan',
                showCancelButton: true,
                cancelButtonText: 'Cancel'
            }).then((result) => {
                if (result.isConfirmed) {
                    this.showUpgradeOptions();
                }
            });
            return;
        }

        // Reset form
        document.getElementById('addLocationForm').reset();
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('addLocationModal'));
        modal.show();
    }

    async saveLocation() {
        const saveBtn = document.getElementById('saveLocationBtn');
        const saveBtnText = document.getElementById('saveLocationBtnText');
        const saveSpinner = document.getElementById('saveLocationSpinner');

        // Get form values
        const name = document.getElementById('locationName').value.trim();
        const address = document.getElementById('locationAddress').value.trim();
        const phone = document.getElementById('locationPhone').value.trim();
        const type = document.getElementById('locationType').value;
        const timezone = document.getElementById('locationTimezone').value;

        // Validate
        if (!name || !address || !phone || !type) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        // Show loading state
        saveBtn.disabled = true;
        saveBtnText.textContent = 'Saving...';
        saveSpinner.style.display = 'inline-block';

        try {
            // Create location data
            const locationData = {
                name,
                address,
                phone,
                type,
                timezone,
                status: 'active',
                createdAt: Date.now(),
                createdBy: this.currentUser.uid,
                userId: this.currentUser.uid
            };

            // Save to database
            await push(ref(rtdb, `userLocations/${this.currentUser.uid}`), locationData);

            showToast('Location added successfully!', 'success');

            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('addLocationModal')).hide();

            // Reload locations
            await this.loadLocations();

        } catch (error) {
            console.error('Error saving location:', error);
            showToast('Error saving location', 'error');
        } finally {
            // Reset button state
            saveBtn.disabled = false;
            saveBtnText.textContent = 'Save Location';
            saveSpinner.style.display = 'none';
        }
    }

    async editLocation(locationId) {
        // TODO: Implement edit location functionality
        showToast('Edit location feature coming soon!', 'info');
    }

    async deleteLocation(locationId) {
        const confirmed = await Swal.fire({
            title: 'Delete Location?',
            text: 'This action cannot be undone. All data associated with this location will be deleted.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Yes, delete it',
            cancelButtonText: 'Cancel'
        });

        if (!confirmed.isConfirmed) return;

        try {
            await remove(ref(rtdb, `userLocations/${this.currentUser.uid}/${locationId}`));
            showToast('Location deleted successfully', 'success');
            await this.loadLocations();
        } catch (error) {
            console.error('Error deleting location:', error);
            showToast('Error deleting location', 'error');
        }
    }

    viewLocationDetails(locationId) {
        // TODO: Implement location analytics view
        showToast('Location analytics coming soon!', 'info');
    }

    showUpgradeOptions() {
        // TODO: Implement upgrade flow
        showToast('Upgrade options coming soon!', 'info');
    }

    formatStatus(status) {
        const statusMap = {
            'active': 'Active',
            'trial': 'Trial',
            'pastDue': 'Past Due',
            'canceled': 'Canceled',
            'none': 'None'
        };
        return statusMap[status] || status;
    }

    formatLocationType(type) {
        const typeMap = {
            'restaurant': 'Restaurant',
            'cafe': 'Cafe',
            'bar': 'Bar',
            'hotel': 'Hotel',
            'retail': 'Retail Store',
            'other': 'Other'
        };
        return typeMap[type] || type;
    }

    async handleLogout() {
        try {
            await auth.signOut();
            window.location.href = '/user-login.html?message=logout';
        } catch (error) {
            console.error('Error logging out:', error);
            showToast('Error logging out', 'error');
        }
    }
}

// Initialize dashboard and make it globally accessible
window.dashboard = new UserDashboard();
