import { rtdb, ref, onValue, off, update, remove, get, set, auth, push } from '../config/firebase-config.js';

export class UsersLocationsManagement {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.users = new Map();
        this.locations = new Map();
        this.listeners = [];
        this.currentFilter = '';
        this.currentSort = { field: 'displayName', order: 'asc' };
        this.selectedUserId = null;
        this.filterType = ''; // Initialize filter type
    }

    async initialize() {
        try {
            this.showLoading();
            
            // Test Firebase connection first
            console.log('[UsersLocationsManagement] Testing Firebase connection...');
            const testRef = ref(rtdb, 'test');
            try {
                await get(testRef);
                console.log('[UsersLocationsManagement] Firebase connection successful');
            } catch (testError) {
                console.error('[UsersLocationsManagement] Firebase connection test failed:', testError);
            }
            
            // Setup UI first so DOM elements exist
            console.log('[UsersLocationsManagement] Rendering UI...');
            this.render();
            console.log('[UsersLocationsManagement] Attaching event listeners...');
            this.attachEventListeners();
            
            // Then load data
            console.log('[UsersLocationsManagement] Starting to load locations...');
            await this.loadLocations();
            console.log('[UsersLocationsManagement] Locations loaded successfully');
            
            console.log('[UsersLocationsManagement] Starting to load users...');
            await this.loadUsers();
            console.log('[UsersLocationsManagement] Users loaded successfully');
            
            // Update locations UI on load
            this.updateLocationsUI();
            
            console.log('[UsersLocationsManagement] Initialization complete');
        } catch (error) {
            console.error('Error initializing users & locations:', error);
            this.showError('Failed to load users and locations data');
        }
    }

    showLoading() {
        this.container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center" style="min-height: 400px;">
                <div class="text-center">
                    <div class="spinner-border text-primary mb-3" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p>Loading users and locations...</p>
                </div>
            </div>
        `;
    }

    showError(message) {
        this.container.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ${message}
            </div>
        `;
    }

    async loadLocations() {
        try {
            // Fetch all locations directly from Firebase
            const locationsRef = ref(rtdb, 'locations');
            const snapshot = await get(locationsRef);
            
            this.locations.clear();
            
            if (snapshot.exists()) {
                const locationsData = snapshot.val();
                Object.entries(locationsData).forEach(([locationId, locationData]) => {
                    this.locations.set(locationId, {
                        id: locationId,
                        ...locationData,
                        name: locationData.name || locationId
                    });
                });
            }
            
            console.log('[UsersLocationsManagement] Loaded locations:', this.locations.size);
        } catch (error) {
            console.error('Error loading locations:', error);
            throw error;
        }
    }

    async loadUsers() {
        try {
            const usersRef = ref(rtdb, 'users');
            console.log('[UsersLocationsManagement] Loading users...');
            
            // Check current auth state
            const currentUser = auth.currentUser;
            console.log('[UsersLocationsManagement] Current user:', currentUser?.uid);
            
            if (!currentUser) {
                throw new Error('User not authenticated');
            }
            
            // Use get() to fetch users data
            const snapshot = await get(usersRef);
            
            if (snapshot.exists()) {
                const usersData = snapshot.val();
                console.log('[UsersLocationsManagement] Found users data:', Object.keys(usersData).length, 'users');
                this.users.clear();
                
                // Process each user
                for (const [uid, userData] of Object.entries(usersData)) {
                    // Get user's locations
                    const userLocationsSnapshot = await get(ref(rtdb, `userLocations/${uid}`));
                    const userLocations = userLocationsSnapshot.exists() ? 
                        Object.keys(userLocationsSnapshot.val()) : [];
                    
                    // Check if user is admin
                    const adminSnapshot = await get(ref(rtdb, `admins/${uid}`));
                    const isAdmin = adminSnapshot.exists();
                    
                    this.users.set(uid, {
                        uid,
                        ...userData,
                        locations: userLocations,
                        isAdmin,
                        lastSignIn: userData.lastSignIn || 'Never'
                    });
                }
                
                console.log('[UsersLocationsManagement] Loaded users:', this.users.size);
            } else {
                console.log('[UsersLocationsManagement] No users found in database');
            }
            
            // Set up real-time listener after initial load
            const unsubscribe = onValue(usersRef, async (snapshot) => {
                console.log('[UsersLocationsManagement] Users data changed, reloading...');
                await this.processUsersSnapshot(snapshot);
                this.updateUI();
            });
            
            this.listeners.push({ ref: usersRef, callback: unsubscribe });
            
            // Update UI after initial load
            this.updateUI();
            
        } catch (error) {
            console.error('[UsersLocationsManagement] Error loading users:', error);
            throw error;
        }
    }

    async processUsersSnapshot(snapshot) {
        if (!snapshot.exists()) {
            this.users.clear();
            return;
        }
        
        const usersData = snapshot.val();
        this.users.clear();
        
        for (const [uid, userData] of Object.entries(usersData)) {
            // Get user's locations
            const userLocationsSnapshot = await get(ref(rtdb, `userLocations/${uid}`));
            const userLocations = userLocationsSnapshot.exists() ? 
                Object.keys(userLocationsSnapshot.val()) : [];
            
            // Check if user is admin
            const adminSnapshot = await get(ref(rtdb, `admins/${uid}`));
            const isAdmin = adminSnapshot.exists();
            
            this.users.set(uid, {
                uid,
                ...userData,
                locations: userLocations,
                isAdmin,
                lastSignIn: userData.lastSignIn || 'Never'
            });
        }
    }

    render() {
        this.container.innerHTML = `
            <div class="users-locations-management">
                <div class="section-header mb-4">
                    <h2>Users & Locations Management</h2>
                    <p class="text-muted">Manage user accounts and their location access</p>
                </div>

                <!-- Navigation Tabs -->
                <ul class="nav nav-tabs mb-4" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active" id="users-tab" data-bs-toggle="tab" data-bs-target="#users-panel" type="button" role="tab">
                            <i class="fas fa-users me-2"></i>Users
                        </button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="locations-tab" data-bs-toggle="tab" data-bs-target="#locations-panel" type="button" role="tab">
                            <i class="fas fa-map-marker-alt me-2"></i>Locations
                        </button>
                    </li>
                </ul>

                <!-- Tab Content -->
                <div class="tab-content">
                    <!-- Users Panel -->
                    <div class="tab-pane fade show active" id="users-panel" role="tabpanel">

                <!-- Search and Filter Bar with Create User Button -->
                <div class="card mb-4">
                    <div class="card-body">
                        <div class="row g-3 align-items-center">
                            <div class="col-md-5">
                                <div class="input-group">
                                    <span class="input-group-text"><i class="fas fa-search"></i></span>
                                    <input type="text"
                                           id="userSearchInput"
                                           class="form-control"
                                           placeholder="Search users by name, email, or business...">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <select id="sortSelect" class="form-select">
                                    <option value="displayName:asc">Name (A-Z)</option>
                                    <option value="displayName:desc">Name (Z-A)</option>
                                    <option value="email:asc">Email (A-Z)</option>
                                    <option value="email:desc">Email (Z-A)</option>
                                    <option value="lastSignIn:desc">Last Sign In (Recent)</option>
                                    <option value="lastSignIn:asc">Last Sign In (Oldest)</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <select id="filterSelect" class="form-select">
                                    <option value="">All Users</option>
                                    <option value="admin">Admin Users</option>
                                    <option value="regular">Regular Users</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <button class="btn btn-primary w-100" id="createUserBtn">
                                    <i class="fas fa-user-plus me-2"></i>Create User
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Users Table -->
                <div class="card">
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Email</th>
                                        <th>Business</th>
                                        <th>Role</th>
                                        <th>Locations</th>
                                        <th>Last Sign In</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="usersTableBody">
                                    <!-- Users will be populated here -->
                                </tbody>
                            </table>
                        </div>
                        
                        <div id="noUsersMessage" class="text-center py-4 d-none">
                            <p class="text-muted">No users found matching your criteria.</p>
                        </div>
                    </div>
                </div>

                    </div>
                    <!-- End Users Panel -->

                    <!-- Locations Panel -->
                    <div class="tab-pane fade" id="locations-panel" role="tabpanel">
                        <!-- Add Location Button -->
                        <div class="mb-4">
                            <button class="btn btn-primary" id="addLocationBtn">
                                <i class="fas fa-plus me-2"></i>Add New Location
                            </button>
                        </div>

                        <!-- Locations Table -->
                        <div class="card">
                            <div class="card-body">
                                <div class="table-responsive">
                                    <table class="table table-hover">
                                        <thead>
                                            <tr>
                                                <th>Location Name</th>
                                                <th>Address</th>
                                                <th>Users</th>
                                                <th>Created</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody id="locationsTableBody">
                                            <!-- Locations will be populated here -->
                                        </tbody>
                                    </table>
                                </div>
                                
                                <div id="noLocationsMessage" class="text-center py-4 d-none">
                                    <p class="text-muted">No locations created yet.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- End Locations Panel -->
                </div>
                <!-- End Tab Content -->
            </div>

            <!-- User Details Modal -->
            <div class="modal fade" id="userDetailsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">User Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="userDetailsContent">
                            <!-- User details will be populated here -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-primary" id="saveUserChanges">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Delete Confirmation Modal -->
            <div class="modal fade" id="deleteUserModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title"><i class="fas fa-exclamation-triangle me-2"></i>Delete User</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>Are you sure you want to delete this user?</p>
                            <div class="alert alert-warning">
                                <strong>Warning:</strong> This action cannot be undone. All user data and location access will be permanently removed.
                            </div>
                            <div id="deleteUserInfo" class="mb-3">
                                <!-- User info will be populated here -->
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-danger" id="confirmDeleteUser">Delete User</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Create User Modal -->
            <div class="modal fade" id="createUserModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title"><i class="fas fa-user-plus me-2"></i>Create New User</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="createUserForm">
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">First Name *</label>
                                        <input type="text" id="newUserFirstName" class="form-control" required placeholder="John">
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Last Name *</label>
                                        <input type="text" id="newUserLastName" class="form-control" required placeholder="Doe">
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Email *</label>
                                    <input type="email" id="newUserEmail" class="form-control" required placeholder="user@example.com">
                                    <small class="form-text text-muted">This will be the user's login email</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Temporary Password *</label>
                                    <input type="password" id="newUserPassword" class="form-control" required minlength="6" placeholder="Min 6 characters">
                                    <small class="form-text text-muted">User should change this after first login</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Business Name</label>
                                    <input type="text" id="newUserBusiness" class="form-control" placeholder="Business Name">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Phone Number</label>
                                    <input type="tel" id="newUserPhone" class="form-control" placeholder="+1234567890">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Subscription Tier *</label>
                                    <select id="newUserTier" class="form-select" required>
                                        <option value="">Loading tiers...</option>
                                    </select>
                                    <small class="form-text text-muted">Tiers loaded from platform configuration</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Assign to Location(s)</label>
                                    <select id="newUserLocations" class="form-select" multiple size="4">
                                        <option value="">Loading locations...</option>
                                    </select>
                                    <small class="form-text text-muted">Hold Ctrl/Cmd to select multiple. Location limit depends on tier.</small>
                                    <div id="locationLimitWarning" class="alert alert-warning mt-2 d-none">
                                        <i class="fas fa-exclamation-triangle me-2"></i>
                                        <span id="locationLimitText"></span>
                                    </div>
                                </div>
                                <div class="form-check mb-3">
                                    <input class="form-check-input" type="checkbox" id="newUserIsAdmin">
                                    <label class="form-check-label" for="newUserIsAdmin">
                                        Admin User (Full system access)
                                    </label>
                                </div>
                                <div class="alert alert-info">
                                    <i class="fas fa-info-circle me-2"></i>
                                    <strong>Note:</strong> The user will receive their login credentials and can change their password after first login.
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmCreateUser">
                                <i class="fas fa-user-plus me-2"></i>Create User
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Add Location Modal -->
            <div class="modal fade" id="addLocationModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Add New Location</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Location Name *</label>
                                <input type="text" id="newLocationName" class="form-control" placeholder="e.g., Main Store">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Address</label>
                                <input type="text" id="newLocationAddress" class="form-control" placeholder="123 Main St">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">City</label>
                                <input type="text" id="newLocationCity" class="form-control" placeholder="City">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Country</label>
                                <input type="text" id="newLocationCountry" class="form-control" placeholder="Country">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmAddLocation">Add Location</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Edit Location Modal -->
            <div class="modal fade" id="editLocationModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Edit Location</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Location Name *</label>
                                <input type="text" id="editLocationName" class="form-control" placeholder="e.g., Main Store">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Address</label>
                                <input type="text" id="editLocationAddress" class="form-control" placeholder="123 Main St">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">City</label>
                                <input type="text" id="editLocationCity" class="form-control" placeholder="City">
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Country</label>
                                <input type="text" id="editLocationCountry" class="form-control" placeholder="Country">
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="confirmEditLocation">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Delete Location Confirmation Modal -->
            <div class="modal fade" id="deleteLocationModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title"><i class="fas fa-exclamation-triangle me-2"></i>Delete Location</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p>Are you sure you want to delete this location?</p>
                            <div class="alert alert-warning">
                                <strong>Warning:</strong> This action cannot be undone.
                            </div>
                            <div id="deleteLocationInfo" class="mb-3">
                                <!-- Location info will be populated here -->
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-danger" id="confirmDeleteLocation">Delete Location</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('userSearchInput');
        searchInput?.addEventListener('input', (e) => {
            this.currentFilter = e.target.value.toLowerCase();
            this.updateUI();
        });

        // Sort functionality
        const sortSelect = document.getElementById('sortSelect');
        sortSelect?.addEventListener('change', (e) => {
            const [field, order] = e.target.value.split(':');
            this.currentSort = { field, order };
            this.updateUI();
        });

        // Filter functionality
        const filterSelect = document.getElementById('filterSelect');
        filterSelect?.addEventListener('change', (e) => {
            this.filterType = e.target.value;
            this.updateUI();
        });

        // Save user changes
        const saveButton = document.getElementById('saveUserChanges');
        saveButton?.addEventListener('click', () => this.saveUserChanges());

        // Confirm delete
        const confirmDeleteButton = document.getElementById('confirmDeleteUser');
        confirmDeleteButton?.addEventListener('click', () => this.confirmDeleteUser());

        // Add location button
        const addLocationBtn = document.getElementById('addLocationBtn');
        addLocationBtn?.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('addLocationModal'));
            modal.show();
        });

        // Confirm add location
        const confirmAddLocationButton = document.getElementById('confirmAddLocation');
        confirmAddLocationButton?.addEventListener('click', () => this.createNewLocation());

        // Tab change event
        const locationsTab = document.getElementById('locations-tab');
        locationsTab?.addEventListener('shown.bs.tab', () => {
            this.updateLocationsUI();
        });

        // Confirm edit location
        const confirmEditLocationButton = document.getElementById('confirmEditLocation');
        confirmEditLocationButton?.addEventListener('click', () => this.saveLocationChanges());

        // Confirm delete location
        const confirmDeleteLocationButton = document.getElementById('confirmDeleteLocation');
        confirmDeleteLocationButton?.addEventListener('click', () => this.confirmDeleteLocation());

        // Create user button - load tiers and locations when modal opens
        const createUserBtn = document.getElementById('createUserBtn');
        createUserBtn?.addEventListener('click', async () => {
            await Promise.all([
                this.loadSubscriptionTiers(),
                this.loadLocationsForDropdown()
            ]);
            this.resetCreateUserForm();
            const modal = new bootstrap.Modal(document.getElementById('createUserModal'));
            modal.show();
        });

        // Tier change - update location limit warning
        const tierSelect = document.getElementById('newUserTier');
        tierSelect?.addEventListener('change', () => this.updateLocationLimitWarning());

        // Location selection change - check against tier limit
        const locationSelect = document.getElementById('newUserLocations');
        locationSelect?.addEventListener('change', () => this.validateLocationSelection());

        // Confirm create user
        const confirmCreateUserButton = document.getElementById('confirmCreateUser');
        confirmCreateUserButton?.addEventListener('click', () => this.createNewUser());
    }

    updateUI() {
        const tbody = document.getElementById('usersTableBody');
        const noUsersMessage = document.getElementById('noUsersMessage');
        
        console.log('[UsersLocationsManagement] UpdateUI called. Users count:', this.users.size);
        
        if (!tbody) {
            console.error('[UsersLocationsManagement] Table body not found!');
            return;
        }

        // Filter and sort users
        let filteredUsers = Array.from(this.users.values());

        // Apply role filter
        if (this.filterType === 'admin') {
            filteredUsers = filteredUsers.filter(user => user.isAdmin);
        } else if (this.filterType === 'regular') {
            filteredUsers = filteredUsers.filter(user => !user.isAdmin);
        }

        // Apply search filter
        if (this.currentFilter) {
            filteredUsers = filteredUsers.filter(user => {
                const searchableText = `
                    ${user.displayName || ''} 
                    ${user.email || ''} 
                    ${user.businessName || ''}
                `.toLowerCase();
                return searchableText.includes(this.currentFilter);
            });
        }

        // Sort users
        filteredUsers.sort((a, b) => {
            let aVal = a[this.currentSort.field] || '';
            let bVal = b[this.currentSort.field] || '';
            
            if (this.currentSort.field === 'lastSignIn') {
                aVal = new Date(aVal).getTime() || 0;
                bVal = new Date(bVal).getTime() || 0;
            }
            
            if (this.currentSort.order === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });

        // Render table
        if (filteredUsers.length === 0) {
            tbody.innerHTML = '';
            noUsersMessage?.classList.remove('d-none');
        } else {
            noUsersMessage?.classList.add('d-none');
            tbody.innerHTML = filteredUsers.map(user => this.renderUserRow(user)).join('');
            
            // Attach row-specific event listeners
            this.attachRowEventListeners();
        }
    }

    renderUserRow(user) {
        const locationNames = user.locations
            .map(locId => this.locations.get(locId)?.name || locId)
            .join(', ') || 'No locations assigned';

        const lastSignIn = user.lastSignIn !== 'Never' ? 
            new Date(user.lastSignIn).toLocaleDateString() : 'Never';

        return `
            <tr data-user-id="${user.uid}">
                <td>
                    <div class="d-flex align-items-center">
                        <div class="avatar-sm me-2">
                            <i class="fas fa-user-circle fa-2x text-secondary"></i>
                        </div>
                        <div>
                            <div class="fw-semibold">${user.displayName || 'No name'}</div>
                            <small class="text-muted">${user.uid}</small>
                        </div>
                    </div>
                </td>
                <td>${user.email || 'No email'}</td>
                <td>${user.businessName || '-'}</td>
                <td>
                    <span class="badge ${user.isAdmin ? 'bg-danger' : 'bg-primary'}">
                        ${user.isAdmin ? 'Admin' : 'User'}
                    </span>
                </td>
                <td>
                    <small class="text-muted">${locationNames}</small>
                </td>
                <td>${lastSignIn}</td>
                <td>
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-outline-primary view-user" 
                                data-user-id="${user.uid}"
                                title="View Details">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-warning toggle-admin" 
                                data-user-id="${user.uid}"
                                data-is-admin="${user.isAdmin}"
                                title="${user.isAdmin ? 'Remove Admin' : 'Make Admin'}">
                            <i class="fas fa-user-shield"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-user" 
                                data-user-id="${user.uid}"
                                title="Delete User">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    attachRowEventListeners() {
        // View user details
        const viewButtons = document.querySelectorAll('.view-user');
        console.log('[DEBUG] Found view buttons:', viewButtons.length);
        
        viewButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                console.log('[DEBUG] View button clicked');
                e.preventDefault();
                e.stopPropagation();
                const userId = e.currentTarget.dataset.userId;
                console.log('[DEBUG] Calling showUserDetails with userId:', userId);
                this.showUserDetails(userId);
            });
        });

        // Toggle admin status
        document.querySelectorAll('.toggle-admin').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = e.currentTarget.dataset.userId;
                const isAdmin = e.currentTarget.dataset.isAdmin === 'true';
                await this.toggleAdminStatus(userId, isAdmin);
            });
        });

        // Delete user
        document.querySelectorAll('.delete-user').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const userId = e.currentTarget.dataset.userId;
                this.showDeleteConfirmation(userId);
            });
        });
    }

    showUserDetails(userId) {
        console.log('[DEBUG] showUserDetails called with userId:', userId);
        const user = this.users.get(userId);
        if (!user) {
            console.error('[DEBUG] User not found:', userId);
            return;
        }

        this.selectedUserId = userId;
        const modalElement = document.getElementById('userDetailsModal');
        
        // Ensure modal element exists and is accessible
        if (!modalElement) {
            console.error('[DEBUG] Modal element not found');
            return;
        }

        console.log('[DEBUG] Modal element found, creating modal instance');
        
        // Remove any existing modal instance to prevent conflicts
        const existingModal = bootstrap.Modal.getInstance(modalElement);
        if (existingModal) {
            console.log('[DEBUG] Disposing existing modal instance');
            existingModal.dispose();
        }

        const modal = new bootstrap.Modal(modalElement, {
            backdrop: 'static',
            keyboard: true,
            focus: true
        });
        
        console.log('[DEBUG] Modal instance created, populating content');
        const content = document.getElementById('userDetailsContent');
        content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6 class="text-muted mb-3">User Information</h6>
                    <div class="mb-3">
                        <label class="form-label">Display Name</label>
                        <input type="text" 
                               id="editDisplayName" 
                               class="form-control" 
                               value="${user.displayName || ''}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Email</label>
                        <input type="email" 
                               id="editEmail" 
                               class="form-control" 
                               value="${user.email || ''}"
                               readonly>
                        <small class="text-muted">Email cannot be changed</small>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Business Name</label>
                        <input type="text" 
                               id="editBusinessName" 
                               class="form-control" 
                               value="${user.businessName || ''}">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Role</label>
                        <div class="form-check form-switch">
                            <input class="form-check-input" 
                                   type="checkbox" 
                                   id="editIsAdmin" 
                                   ${user.isAdmin ? 'checked' : ''}>
                            <label class="form-check-label" for="editIsAdmin">
                                Administrator Access
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="col-md-6">
                    <h6 class="text-muted mb-3">Location Access</h6>
                    <div class="mb-3">
                        <label class="form-label">Assigned Locations</label>
                        <div id="locationsList" class="border rounded p-2" style="max-height: 200px; overflow-y: auto;">
                            ${this.renderLocationCheckboxes(user.locations)}
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Add New Location</label>
                        <select id="addLocationSelect" class="form-select">
                            <option value="">Select a location...</option>
                            ${this.renderAvailableLocations(user.locations)}
                        </select>
                        <button class="btn btn-sm btn-primary mt-2" onclick="window.usersLocationsManager.addLocationToUser()">
                            <i class="fas fa-plus me-1"></i>Add Location
                        </button>
                    </div>
                </div>
            </div>
            
            <hr>
            
            <div class="row">
                <div class="col-12">
                    <h6 class="text-muted mb-3">Account Information</h6>
                    <div class="row text-sm">
                        <div class="col-md-6">
                            <p><strong>User ID:</strong> ${user.uid}</p>
                            <p><strong>Created:</strong> ${user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Unknown'}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Last Sign In:</strong> ${user.lastSignIn !== 'Never' ? new Date(user.lastSignIn).toLocaleString() : 'Never'}</p>
                            <p><strong>Account Status:</strong> <span class="badge bg-success">Active</span></p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Attach location removal listeners
        this.attachLocationListeners();
        
        // Add event listeners to ensure modal is accessible
        modalElement.addEventListener('shown.bs.modal', () => {
            console.log('[DEBUG] Modal shown event triggered');
            
            // Ensure modal is on top and focusable
            modalElement.style.zIndex = '1056';
            modalElement.style.pointerEvents = 'auto';
            
            // Fix backdrop pointer events
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.style.pointerEvents = 'none';
                console.log('[DEBUG] Fixed backdrop pointer events');
            }
            
            // Ensure modal content is clickable
            const modalContent = modalElement.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.pointerEvents = 'auto';
                modalContent.style.zIndex = '1057';
                console.log('[DEBUG] Fixed modal content pointer events');
            }
            
            // Focus on first input or the modal itself
            const firstInput = modalElement.querySelector('input, select, button');
            if (firstInput) {
                firstInput.focus();
                console.log('[DEBUG] Focused on first input element');
            } else {
                modalElement.focus();
                console.log('[DEBUG] Focused on modal element');
            }
        });
        
        modalElement.addEventListener('show.bs.modal', () => {
            console.log('[DEBUG] Modal show event triggered');
        });
        
        modalElement.addEventListener('hidden.bs.modal', () => {
            console.log('[DEBUG] Modal hidden event triggered');
        });
        
        console.log('[DEBUG] About to show modal');
        try {
            modal.show();
            console.log('[DEBUG] Modal.show() called successfully');
            
            // Force immediate fix after show - multiple attempts
            setTimeout(() => {
                console.log('[DEBUG] Applying emergency modal fixes - attempt 1');
                this.forceModalInteractive(modalElement);
            }, 50);
            
            setTimeout(() => {
                console.log('[DEBUG] Applying emergency modal fixes - attempt 2');
                this.forceModalInteractive(modalElement);
            }, 200);
            
            setTimeout(() => {
                console.log('[DEBUG] Applying emergency modal fixes - attempt 3');
                this.forceModalInteractive(modalElement);
            }, 500);
            
        } catch (error) {
            console.error('[DEBUG] Error showing modal:', error);
        }
    }

    forceModalInteractive(modalElement) {
        console.log('[DEBUG] Forcing modal to be interactive');
        
        // Force modal to be visible and interactive
        modalElement.style.display = 'block !important';
        modalElement.style.zIndex = '1056 !important';
        modalElement.style.pointerEvents = 'auto !important';
        modalElement.classList.add('show');
        
        // Force backdrop to be non-interactive
        const backdrops = document.querySelectorAll('.modal-backdrop');
        console.log('[DEBUG] Found backdrops:', backdrops.length);
        backdrops.forEach((backdrop, index) => {
            console.log(`[DEBUG] Fixing backdrop ${index}`);
            backdrop.style.pointerEvents = 'none !important';
            backdrop.style.zIndex = '1050 !important';
        });
        
        // Force modal content to be interactive
        const modalContent = modalElement.querySelector('.modal-content');
        if (modalContent) {
            console.log('[DEBUG] Fixing modal content');
            modalContent.style.pointerEvents = 'auto !important';
            modalContent.style.zIndex = '1057 !important';
            modalContent.style.position = 'relative !important';
        }
        
        // Force all interactive elements to be clickable
        const interactiveElements = modalElement.querySelectorAll('input, select, button, textarea, .btn, .form-control');
        console.log('[DEBUG] Found interactive elements:', interactiveElements.length);
        interactiveElements.forEach((element, index) => {
            element.style.pointerEvents = 'auto !important';
            element.style.zIndex = '1058 !important';
            element.style.position = 'relative !important';
        });
        
        // NUCLEAR option - remove all backdrop elements
        const allBackdrops = document.querySelectorAll('.modal-backdrop');
        allBackdrops.forEach((backdrop, index) => {
            console.log(`[DEBUG] Removing backdrop ${index}`);
            backdrop.remove();
        });
        
        console.log('[DEBUG] Modal force fixes completed');
    }

    renderLocationCheckboxes(userLocations) {
        if (userLocations.length === 0) {
            return '<p class="text-muted mb-0">No locations assigned</p>';
        }

        return userLocations.map(locId => {
            const location = this.locations.get(locId);
            return `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span>${location ? location.name : locId}</span>
                    <button class="btn btn-sm btn-outline-danger remove-location" 
                            data-location-id="${locId}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    renderAvailableLocations(userLocations) {
        const availableLocations = Array.from(this.locations.values())
            .filter(loc => !userLocations.includes(loc.id));

        return availableLocations.map(loc => 
            `<option value="${loc.id}">${loc.name}</option>`
        ).join('');
    }

    attachLocationListeners() {
        document.querySelectorAll('.remove-location').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const locationId = e.currentTarget.dataset.locationId;
                this.removeLocationFromUser(locationId);
            });
        });
    }

    async addLocationToUser() {
        const select = document.getElementById('addLocationSelect');
        const locationId = select.value;
        
        if (!locationId || !this.selectedUserId) {
            console.error('[UsersLocationsManagement] Cannot add location - missing locationId or userId');
            return;
        }

        console.log('[UsersLocationsManagement] Adding location', locationId, 'to user', this.selectedUserId);

        try {
            // Add location to user using set instead of update to ensure it's created if doesn't exist
            await set(ref(rtdb, `userLocations/${this.selectedUserId}/${locationId}`), true);
            console.log('[UsersLocationsManagement] Location added successfully');

            // Update local data
            const user = this.users.get(this.selectedUserId);
            if (user && !user.locations.includes(locationId)) {
                user.locations.push(locationId);
                console.log('[UsersLocationsManagement] Updated local user locations:', user.locations);
            }

            // Refresh the modal
            this.showUserDetails(this.selectedUserId);
            
            // Show success message
            this.showSuccessMessage('Location added successfully');
        } catch (error) {
            console.error('[UsersLocationsManagement] Error adding location:', error);
            alert(`Failed to add location: ${error.message}`);
        }
    }

    async removeLocationFromUser(locationId) {
        if (!this.selectedUserId || !locationId) {
            console.error('[UsersLocationsManagement] Cannot remove location - missing locationId or userId');
            return;
        }

        console.log('[UsersLocationsManagement] Removing location', locationId, 'from user', this.selectedUserId);

        try {
            // Remove location from user
            await remove(ref(rtdb, `userLocations/${this.selectedUserId}/${locationId}`));
            console.log('[UsersLocationsManagement] Location removed successfully');

            // Update local data
            const user = this.users.get(this.selectedUserId);
            if (user) {
                user.locations = user.locations.filter(id => id !== locationId);
                console.log('[UsersLocationsManagement] Updated local user locations:', user.locations);
            }

            // Refresh the modal
            this.showUserDetails(this.selectedUserId);
            
            // Show success message
            this.showSuccessMessage('Location removed successfully');
        } catch (error) {
            console.error('[UsersLocationsManagement] Error removing location:', error);
            alert(`Failed to remove location: ${error.message}`);
        }
    }

    async saveUserChanges() {
        if (!this.selectedUserId) {
            console.error('[UsersLocationsManagement] No user selected for saving changes');
            return;
        }

        const displayName = document.getElementById('editDisplayName').value;
        const businessName = document.getElementById('editBusinessName').value;
        const isAdmin = document.getElementById('editIsAdmin').checked;

        console.log('[UsersLocationsManagement] Saving changes for user:', this.selectedUserId, {
            displayName,
            businessName,
            isAdmin
        });

        try {
            // FIXED: Get current user data to preserve existing fields
            const currentUser = this.users.get(this.selectedUserId);
            if (!currentUser) {
                throw new Error('User data not found');
            }

            // FIXED: Start with existing user data to preserve all fields
            const userUpdates = {
                // Preserve all existing user data
                ...currentUser,
                // Override only the fields being edited
                displayName: displayName,
                businessName: businessName,
                updatedAt: Date.now(),
                updatedBy: auth.currentUser?.uid || 'admin'
            };

            // SAFETY CHECK: Log if phoneNumber exists to monitor preservation
            if (currentUser.phoneNumber) {
                console.log(`✅ [USER UPDATE] Preserving phoneNumber for user ${this.selectedUserId}:`, currentUser.phoneNumber);
            }

            // VALIDATION: Verify critical fields are preserved
            const criticalFields = ['phoneNumber', 'phone', 'businessPhone', 'email', 'role', 'isAdmin', 'uid'];
            criticalFields.forEach(field => {
                if (currentUser[field] && !userUpdates[field]) {
                    console.warn(`⚠️ [USER UPDATE] Critical field '${field}' missing from update for user ${this.selectedUserId}`);
                    userUpdates[field] = currentUser[field];
                }
            });

            console.log(`📝 [USER UPDATE] Updating user ${this.selectedUserId} with preserved fields:`, {
                preservedFields: Object.keys(currentUser),
                updatedFields: ['displayName', 'businessName'],
                hasPhoneNumber: !!(userUpdates.phoneNumber || userUpdates.phone || userUpdates.businessPhone)
            });
            
            console.log('[UsersLocationsManagement] Updating user data:', userUpdates);
            await update(ref(rtdb, `users/${this.selectedUserId}`), userUpdates);
            console.log('[UsersLocationsManagement] User data updated successfully');

            // Update admin status
            if (currentUser.isAdmin !== isAdmin) {
                console.log('[UsersLocationsManagement] Updating admin status to:', isAdmin);
                if (isAdmin) {
                    await set(ref(rtdb, `admins/${this.selectedUserId}`), true);
                } else {
                    await remove(ref(rtdb, `admins/${this.selectedUserId}`));
                }
                console.log('[UsersLocationsManagement] Admin status updated successfully');
            }

            // Update local data to reflect changes immediately
            if (currentUser) {
                currentUser.displayName = displayName;
                currentUser.businessName = businessName;
                currentUser.isAdmin = isAdmin;
            }

            // Close modal
            const modalElement = document.getElementById('userDetailsModal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) {
                modalInstance.hide();
            }
            
            // Show success message
            this.showSuccessMessage('User updated successfully');
            
            // Force UI update to show changes
            this.updateUI();
        } catch (error) {
            console.error('[UsersLocationsManagement] Error saving user changes:', error);
            alert(`Failed to save changes: ${error.message}`);
        }
    }

    async toggleAdminStatus(userId, currentIsAdmin) {
        const user = this.users.get(userId);
        if (!user) return;

        const action = currentIsAdmin ? 'remove admin access from' : 'grant admin access to';
        
        if (confirm(`Are you sure you want to ${action} ${user.displayName || user.email}?`)) {
            try {
                if (currentIsAdmin) {
                    await remove(ref(rtdb, `admins/${userId}`));
                } else {
                    await set(ref(rtdb, `admins/${userId}`), true);
                }
                
                this.showSuccessMessage(`Admin status updated successfully`);
            } catch (error) {
                console.error('Error toggling admin status:', error);
                alert('Failed to update admin status');
            }
        }
    }

    showDeleteConfirmation(userId) {
        const user = this.users.get(userId);
        if (!user) return;

        this.userToDelete = userId;
        
        const deleteInfo = document.getElementById('deleteUserInfo');
        deleteInfo.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <p><strong>Name:</strong> ${user.displayName || 'No name'}</p>
                    <p><strong>Email:</strong> ${user.email || 'No email'}</p>
                    <p><strong>Business:</strong> ${user.businessName || '-'}</p>
                    <p><strong>Locations:</strong> ${user.locations.length} assigned</p>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('deleteUserModal'));
        modal.show();
    }

    async confirmDeleteUser() {
        if (!this.userToDelete) return;

        try {
            // Remove user data
            await remove(ref(rtdb, `users/${this.userToDelete}`));
            
            // Remove user locations
            await remove(ref(rtdb, `userLocations/${this.userToDelete}`));
            
            // Remove admin status if exists
            await remove(ref(rtdb, `admins/${this.userToDelete}`));
            
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('deleteUserModal')).hide();
            
            // Show success message
            this.showSuccessMessage('User deleted successfully');
            
            this.userToDelete = null;
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Failed to delete user');
        }
    }

    showSuccessMessage(message) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3';
        alertDiv.style.zIndex = '9999';
        alertDiv.innerHTML = `
            <i class="fas fa-check-circle me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
            alertDiv.remove();
        }, 3000);
    }

    async loadSubscriptionTiers() {
        const tierSelect = document.getElementById('newUserTier');
        if (!tierSelect) return;

        try {
            console.log('[UsersLocationsManagement] Loading subscription tiers from database...');
            const tiersRef = ref(rtdb, 'subscriptionTiers');
            const snapshot = await get(tiersRef);

            if (!snapshot.exists()) {
                console.warn('[UsersLocationsManagement] No subscription tiers found in database');
                tierSelect.innerHTML = '<option value="">No tiers available</option>';
                return;
            }

            const tiers = snapshot.val();
            // Store tiers for limit checking
            this.subscriptionTiers = tiers;
            console.log('[UsersLocationsManagement] Loaded tiers:', Object.keys(tiers));

            // Sort tiers by monthlyPrice (ascending) for logical display order
            const sortedTiers = Object.entries(tiers)
                .filter(([id, tier]) => tier.active !== false) // Only show active tiers
                .sort((a, b) => (a[1].monthlyPrice || 0) - (b[1].monthlyPrice || 0));

            // Build dropdown options with location limit info
            let optionsHtml = '<option value="">Select Tier</option>';
            sortedTiers.forEach(([tierId, tierData]) => {
                const name = tierData.name || tierId;
                const price = tierData.monthlyPrice || 0;
                const maxLocs = tierData.limits?.locations || tierData.limits?.maxLocations || 1;
                const locText = maxLocs === Infinity || maxLocs > 100 ? 'unlimited' : maxLocs;
                const priceText = price > 0 ? ` - $${price}/mo` : ' - Free';
                optionsHtml += `<option value="${tierId}" data-max-locations="${maxLocs}">${name}${priceText} (${locText} loc)</option>`;
            });

            tierSelect.innerHTML = optionsHtml;
            console.log('[UsersLocationsManagement] Tier dropdown populated with', sortedTiers.length, 'tiers');

        } catch (error) {
            console.error('[UsersLocationsManagement] Error loading subscription tiers:', error);
            tierSelect.innerHTML = '<option value="">Error loading tiers</option>';
        }
    }

    async loadLocationsForDropdown() {
        const locationSelect = document.getElementById('newUserLocations');
        if (!locationSelect) return;

        try {
            // Use already loaded locations from this.locations
            if (this.locations.size === 0) {
                await this.loadLocations();
            }

            let optionsHtml = '';
            this.locations.forEach((location, locationId) => {
                const name = location.name || locationId;
                const city = location.city ? ` (${location.city})` : '';
                optionsHtml += `<option value="${locationId}">${name}${city}</option>`;
            });

            if (optionsHtml === '') {
                optionsHtml = '<option value="" disabled>No locations available</option>';
            }

            locationSelect.innerHTML = optionsHtml;
            console.log('[UsersLocationsManagement] Location dropdown populated with', this.locations.size, 'locations');

        } catch (error) {
            console.error('[UsersLocationsManagement] Error loading locations for dropdown:', error);
            locationSelect.innerHTML = '<option value="">Error loading locations</option>';
        }
    }

    getSelectedTierMaxLocations() {
        const tierSelect = document.getElementById('newUserTier');
        if (!tierSelect || !tierSelect.value) return 1;

        const tierId = tierSelect.value;
        const tierData = this.subscriptionTiers?.[tierId];
        if (!tierData) return 1;

        return tierData.limits?.locations || tierData.limits?.maxLocations || 1;
    }

    updateLocationLimitWarning() {
        const maxLocations = this.getSelectedTierMaxLocations();
        const warningDiv = document.getElementById('locationLimitWarning');
        const warningText = document.getElementById('locationLimitText');

        if (!warningDiv || !warningText) return;

        if (maxLocations === Infinity || maxLocations > 100) {
            warningDiv.classList.add('d-none');
        } else {
            warningText.textContent = `This tier allows up to ${maxLocations} location${maxLocations > 1 ? 's' : ''}.`;
            warningDiv.classList.remove('d-none');
            warningDiv.classList.remove('alert-danger');
            warningDiv.classList.add('alert-warning');
        }

        // Re-validate current selection
        this.validateLocationSelection();
    }

    validateLocationSelection() {
        const locationSelect = document.getElementById('newUserLocations');
        const warningDiv = document.getElementById('locationLimitWarning');
        const warningText = document.getElementById('locationLimitText');

        if (!locationSelect) return true;

        const selectedLocations = Array.from(locationSelect.selectedOptions).map(opt => opt.value);
        const maxLocations = this.getSelectedTierMaxLocations();

        if (maxLocations !== Infinity && maxLocations <= 100 && selectedLocations.length > maxLocations) {
            warningText.textContent = `Selected ${selectedLocations.length} locations, but this tier only allows ${maxLocations}. Please deselect some.`;
            warningDiv.classList.remove('d-none', 'alert-warning');
            warningDiv.classList.add('alert-danger');
            return false;
        } else if (maxLocations !== Infinity && maxLocations <= 100) {
            warningText.textContent = `This tier allows up to ${maxLocations} location${maxLocations > 1 ? 's' : ''}. (${selectedLocations.length} selected)`;
            warningDiv.classList.remove('d-none', 'alert-danger');
            warningDiv.classList.add('alert-warning');
        }

        return true;
    }

    resetCreateUserForm() {
        document.getElementById('newUserFirstName').value = '';
        document.getElementById('newUserLastName').value = '';
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserPassword').value = '';
        document.getElementById('newUserBusiness').value = '';
        document.getElementById('newUserPhone').value = '';
        document.getElementById('newUserTier').value = '';
        document.getElementById('newUserIsAdmin').checked = false;

        const locationSelect = document.getElementById('newUserLocations');
        if (locationSelect) {
            Array.from(locationSelect.options).forEach(opt => opt.selected = false);
        }

        const warningDiv = document.getElementById('locationLimitWarning');
        if (warningDiv) {
            warningDiv.classList.add('d-none');
        }
    }

    async createNewUser() {
        const firstName = document.getElementById('newUserFirstName').value.trim();
        const lastName = document.getElementById('newUserLastName').value.trim();
        const email = document.getElementById('newUserEmail').value.trim();
        const password = document.getElementById('newUserPassword').value;
        const business = document.getElementById('newUserBusiness').value.trim();
        const phone = document.getElementById('newUserPhone').value.trim();
        const tier = document.getElementById('newUserTier').value;
        const isAdmin = document.getElementById('newUserIsAdmin').checked;

        // Get selected locations
        const locationSelect = document.getElementById('newUserLocations');
        const selectedLocations = locationSelect
            ? Array.from(locationSelect.selectedOptions).map(opt => opt.value).filter(v => v)
            : [];

        // Validation
        if (!firstName || !lastName || !email || !password || !tier) {
            alert('Please fill in all required fields');
            return;
        }

        if (password.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }

        // Validate location count against tier limit
        if (!this.validateLocationSelection()) {
            alert('Selected locations exceed the tier limit. Please deselect some locations.');
            return;
        }

        try {
            console.log('[UsersLocationsManagement] Creating new user:', { email, tier, isAdmin, locationCount: selectedLocations.length });

            // Call Firebase Function to create user
            const idToken = await auth.currentUser.getIdToken();
            const functionsUrl = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net';

            const response = await fetch(`${functionsUrl}/createUserAccount`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    email,
                    password,
                    firstName,
                    lastName,
                    businessName: business,
                    phoneNumber: phone,
                    tier,
                    isAdmin,
                    locationIds: selectedLocations
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to create user');
            }

            console.log('[UsersLocationsManagement] User created successfully:', result);

            // Close modal
            const modalElement = document.getElementById('createUserModal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) {
                modalInstance.hide();
            }

            // Clear form
            this.resetCreateUserForm();

            // Show success message
            const locText = selectedLocations.length > 0 ? ` with ${selectedLocations.length} location(s)` : '';
            this.showSuccessMessage(`User ${email} created successfully${locText}!`);

            // Reload users
            await this.loadUsers();

        } catch (error) {
            console.error('[UsersLocationsManagement] Error creating user:', error);
            alert(`Failed to create user: ${error.message}`);
        }
    }

    async createNewLocation() {
        const name = document.getElementById('newLocationName').value.trim();
        const address = document.getElementById('newLocationAddress').value.trim();
        const city = document.getElementById('newLocationCity').value.trim();
        const country = document.getElementById('newLocationCountry').value.trim();

        if (!name) {
            alert('Location name is required');
            return;
        }

        try {
            // Create new location
            const newLocationRef = push(ref(rtdb, 'locations'));
            const locationData = {
                name: name,
                address: address || '',
                city: city || '',
                country: country || '',
                createdAt: Date.now(),
                createdBy: auth.currentUser?.uid || 'admin'
            };

            console.log('[UsersLocationsManagement] Creating new location:', locationData);
            await set(newLocationRef, locationData);
            
            // Close modal
            const modalElement = document.getElementById('addLocationModal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) {
                modalInstance.hide();
            }
            
            // Clear form
            document.getElementById('newLocationName').value = '';
            document.getElementById('newLocationAddress').value = '';
            document.getElementById('newLocationCity').value = '';
            document.getElementById('newLocationCountry').value = '';
            
            // Show success message
            this.showSuccessMessage('Location created successfully');
            
            // Reload locations
            await this.loadLocations();
            this.updateLocationsUI();
            this.updateUI(); // Also update users UI to reflect new location in dropdowns
            
        } catch (error) {
            console.error('[UsersLocationsManagement] Error creating location:', error);
            alert(`Failed to create location: ${error.message}`);
        }
    }

    updateLocationsUI() {
        const tbody = document.getElementById('locationsTableBody');
        const noLocationsMessage = document.getElementById('noLocationsMessage');
        
        if (!tbody) return;
        
        const locations = Array.from(this.locations.values());
        
        if (locations.length === 0) {
            tbody.innerHTML = '';
            noLocationsMessage?.classList.remove('d-none');
        } else {
            noLocationsMessage?.classList.add('d-none');
            tbody.innerHTML = locations.map(location => this.renderLocationRow(location)).join('');
            
            // Attach event listeners to location action buttons
            this.attachLocationActionListeners();
        }
    }

    renderLocationRow(location) {
        // Count users assigned to this location
        const userCount = Array.from(this.users.values())
            .filter(user => user.locations.includes(location.id)).length;
        
        const createdDate = location.createdAt ? 
            new Date(location.createdAt).toLocaleDateString() : 'Unknown';
        
        return `
            <tr data-location-id="${location.id}">
                <td>
                    <div class="fw-semibold">${location.name}</div>
                    <small class="text-muted">${location.id}</small>
                </td>
                <td>
                    ${location.address ? 
                        `<div>${location.address}</div>` : ''}
                    ${location.city ? 
                        `<div>${location.city}</div>` : ''}
                    ${location.country ? 
                        `<div>${location.country}</div>` : ''}
                    ${!location.address && !location.city && !location.country ? '-' : ''}
                </td>
                <td>
                    <span class="badge bg-info">${userCount} users</span>
                </td>
                <td>${createdDate}</td>
                <td>
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-outline-primary edit-location" 
                                data-location-id="${location.id}"
                                title="Edit Location">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-location" 
                                data-location-id="${location.id}"
                                title="Delete Location"
                                ${userCount > 0 ? 'disabled' : ''}>
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    attachLocationActionListeners() {
        // Edit location buttons
        document.querySelectorAll('.edit-location').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const locationId = e.currentTarget.dataset.locationId;
                this.editLocation(locationId);
            });
        });

        // Delete location buttons
        document.querySelectorAll('.delete-location').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const locationId = e.currentTarget.dataset.locationId;
                this.deleteLocation(locationId);
            });
        });
    }

    editLocation(locationId) {
        const location = this.locations.get(locationId);
        if (!location) return;

        this.selectedLocationId = locationId;

        // Populate the edit form
        document.getElementById('editLocationName').value = location.name || '';
        document.getElementById('editLocationAddress').value = location.address || '';
        document.getElementById('editLocationCity').value = location.city || '';
        document.getElementById('editLocationCountry').value = location.country || '';

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('editLocationModal'));
        modal.show();
    }

    async saveLocationChanges() {
        if (!this.selectedLocationId) return;

        const name = document.getElementById('editLocationName').value.trim();
        const address = document.getElementById('editLocationAddress').value.trim();
        const city = document.getElementById('editLocationCity').value.trim();
        const country = document.getElementById('editLocationCountry').value.trim();

        if (!name) {
            alert('Location name is required');
            return;
        }

        try {
            // Update location data
            const updateData = {
                name: name,
                address: address || '',
                city: city || '',
                country: country || '',
                updatedAt: Date.now(),
                updatedBy: auth.currentUser?.uid || 'admin'
            };

            console.log('[UsersLocationsManagement] Updating location:', this.selectedLocationId, updateData);
            await update(ref(rtdb, `locations/${this.selectedLocationId}`), updateData);

            // Close modal
            const modalElement = document.getElementById('editLocationModal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) {
                modalInstance.hide();
            }

            // Show success message
            this.showSuccessMessage('Location updated successfully');

            // Reload locations
            await this.loadLocations();
            this.updateLocationsUI();

        } catch (error) {
            console.error('[UsersLocationsManagement] Error updating location:', error);
            alert(`Failed to update location: ${error.message}`);
        }
    }

    deleteLocation(locationId) {
        const location = this.locations.get(locationId);
        if (!location) return;

        this.locationToDelete = locationId;

        // Check if any users are assigned to this location
        const userCount = Array.from(this.users.values())
            .filter(user => user.locations.includes(locationId)).length;

        if (userCount > 0) {
            alert(`Cannot delete this location. ${userCount} user(s) are assigned to it.`);
            return;
        }

        // Show location info in the delete modal
        const deleteInfo = document.getElementById('deleteLocationInfo');
        deleteInfo.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <p><strong>Name:</strong> ${location.name}</p>
                    <p><strong>Address:</strong> ${location.address || 'N/A'}</p>
                    <p><strong>City:</strong> ${location.city || 'N/A'}</p>
                    <p><strong>Country:</strong> ${location.country || 'N/A'}</p>
                </div>
            </div>
        `;

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('deleteLocationModal'));
        modal.show();
    }

    async confirmDeleteLocation() {
        if (!this.locationToDelete) return;

        try {
            // Delete the location
            await remove(ref(rtdb, `locations/${this.locationToDelete}`));

            // Close modal
            const modalElement = document.getElementById('deleteLocationModal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) {
                modalInstance.hide();
            }

            // Show success message
            this.showSuccessMessage('Location deleted successfully');

            this.locationToDelete = null;

            // Reload locations
            await this.loadLocations();
            this.updateLocationsUI();

        } catch (error) {
            console.error('[UsersLocationsManagement] Error deleting location:', error);
            alert(`Failed to delete location: ${error.message}`);
        }
    }

    destroy() {
        // Clean up listeners
        this.listeners.forEach(({ ref, callback }) => {
            off(ref, callback);
        });
        this.listeners = [];
        
        // Clear data
        this.users.clear();
        this.locations.clear();
        
        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// Create a global instance for inline event handlers
window.usersLocationsManager = null;

// Export initialization function
export function initializeUsersLocationsManagement(containerId) {
    // Clean up previous instance
    if (window.usersLocationsManager) {
        window.usersLocationsManager.destroy();
    }
    
    // Create new instance
    window.usersLocationsManager = new UsersLocationsManagement(containerId);
    window.usersLocationsManager.initialize();
    
    return window.usersLocationsManager;
}
