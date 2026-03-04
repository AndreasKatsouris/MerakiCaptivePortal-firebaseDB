import { auth, rtdb, ref, get, set, update, remove } from '../config/firebase-config.js';
import { AdminClaims } from '../auth/admin-claims.js';

export class AdminUserManagement {
    /**
     * Initialize the admin user management interface
     * @param {string} containerId - The ID of the container element to render the interface in
     * @returns {Promise<void>}
     */
    static async initialize(containerId) {
        try {
            console.log('[AdminUserManagement] Initializing admin user management interface');
            const container = document.getElementById(containerId);
            if (!container) {
                throw new Error(`Container with ID "${containerId}" not found`);
            }

            // Show loading state
            container.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Admin User Management</h5>
                    </div>
                    <div class="card-body">
                        <div id="admin-users-loading" class="text-center py-4">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                            <p class="mt-2">Loading admin users...</p>
                        </div>
                        <div id="admin-users-content" style="display: none;">
                            <div class="mb-4">
                                <h6>Add New Admin</h6>
                                <div class="input-group">
                                    <input type="text" id="new-admin-uid" class="form-control" placeholder="User ID">
                                    <button id="add-admin-btn" class="btn btn-primary">Add Admin</button>
                                </div>
                                <small class="form-text text-muted">Enter the Firebase UID of the user to grant admin privileges</small>
                            </div>
                            <h6>Current Admins</h6>
                            <div class="table-responsive">
                                <table class="table table-striped">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Last Sign In</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="admin-users-table">
                                        <!-- Admin users will be loaded here -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div id="admin-users-error" class="alert alert-danger" style="display: none;"></div>
                    </div>
                </div>
            `;

            // Set up event listeners
            const addAdminBtn = document.getElementById('add-admin-btn');
            const newAdminUidInput = document.getElementById('new-admin-uid');
            
            if (addAdminBtn && newAdminUidInput) {
                addAdminBtn.addEventListener('click', async () => {
                    const uid = newAdminUidInput.value.trim();
                    if (!uid) {
                        alert('Please enter a valid user ID');
                        return;
                    }
                    
                    try {
                        addAdminBtn.disabled = true;
                        addAdminBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
                        
                        await this.setUserAdminStatus(uid, true);
                        newAdminUidInput.value = '';
                        await this.loadAdminUsers();
                        
                        // Show success message
                        const successAlert = document.createElement('div');
                        successAlert.className = 'alert alert-success alert-dismissible fade show mt-3';
                        successAlert.innerHTML = `
                            <strong>Success!</strong> Admin privileges granted to user.
                            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                        `;
                        container.querySelector('.card-body').prepend(successAlert);
                    } catch (error) {
                        console.error('Error adding admin:', error);
                        alert(`Failed to add admin: ${error.message}`);
                    } finally {
                        addAdminBtn.disabled = false;
                        addAdminBtn.textContent = 'Add Admin';
                    }
                });
            }
            
            // Load admin users
            await this.loadAdminUsers();
            
        } catch (error) {
            console.error('[AdminUserManagement] Initialization error:', error);
            const errorContainer = document.getElementById('admin-users-error');
            if (errorContainer) {
                errorContainer.textContent = `Error: ${error.message}`;
                errorContainer.style.display = 'block';
            }
        }
    }
    
    /**
     * Load and display admin users in the table
     */
    static async loadAdminUsers() {
        const loadingElement = document.getElementById('admin-users-loading');
        const contentElement = document.getElementById('admin-users-content');
        const errorElement = document.getElementById('admin-users-error');
        const tableBody = document.getElementById('admin-users-table');
        
        if (!tableBody) return;
        
        try {
            // Show loading, hide content and error
            if (loadingElement) loadingElement.style.display = 'block';
            if (contentElement) contentElement.style.display = 'none';
            if (errorElement) errorElement.style.display = 'none';
            
            // Get admin users
            const adminUsers = await this.getAdminUsers();
            
            // Render table rows
            tableBody.innerHTML = '';
            
            if (adminUsers.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="4" class="text-center">No admin users found</td></tr>';
            } else {
                adminUsers.forEach(user => {
                    const row = document.createElement('tr');
                    
                    // Format last sign in time
                    let lastSignIn = 'Never';
                    if (user.lastSignInTime) {
                        const date = new Date(user.lastSignInTime);
                        lastSignIn = date.toLocaleString();
                    }
                    
                    row.innerHTML = `
                        <td>${user.displayName || 'N/A'}</td>
                        <td>${user.email || 'N/A'}</td>
                        <td>${lastSignIn}</td>
                        <td>
                            <button class="btn btn-sm btn-danger remove-admin-btn" data-uid="${user.uid}">
                                Remove Admin
                            </button>
                        </td>
                    `;
                    
                    tableBody.appendChild(row);
                });
                
                // Add event listeners to remove buttons
                document.querySelectorAll('.remove-admin-btn').forEach(button => {
                    button.addEventListener('click', async (e) => {
                        const uid = e.target.getAttribute('data-uid');
                        if (confirm('Are you sure you want to remove admin privileges from this user?')) {
                            try {
                                button.disabled = true;
                                button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
                                
                                await this.removeAdminPrivileges(uid);
                                await this.loadAdminUsers();
                            } catch (error) {
                                console.error('Error removing admin:', error);
                                alert(`Failed to remove admin: ${error.message}`);
                                button.disabled = false;
                                button.textContent = 'Remove Admin';
                            }
                        }
                    });
                });
            }
            
            // Hide loading, show content
            if (loadingElement) loadingElement.style.display = 'none';
            if (contentElement) contentElement.style.display = 'block';
            
        } catch (error) {
            console.error('Error loading admin users:', error);
            
            // Hide loading, show error
            if (loadingElement) loadingElement.style.display = 'none';
            if (contentElement) contentElement.style.display = 'none';
            if (errorElement) {
                errorElement.textContent = `Error loading admin users: ${error.message}`;
                errorElement.style.display = 'block';
            }
        }
    }

    /**
     * Set admin privileges for a user - FIXED VERSION
     * @param {string} uid - The user ID to grant admin privileges to
     * @param {boolean} isAdmin - Whether to grant or revoke admin privileges
     * @returns {Promise<Object>} Response from the operation
     */
    static async setUserAdminStatus(uid, isAdmin = true) {
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error('No user is currently signed in');
            }

            // Verify the current user has admin privileges
            const hasAdminRights = await AdminClaims.verifyAdminStatus(currentUser);
            if (!hasAdminRights) {
                throw new Error('Current user does not have admin privileges');
            }

            console.log(`🔧 [AdminUserManagement] ${isAdmin ? 'Granting' : 'Removing'} admin privileges for user: ${uid}`);

            // FIXED: Get existing user data to preserve all fields
            const userRef = ref(rtdb, `users/${uid}`);
            const userSnapshot = await get(userRef);
            const existingUserData = userSnapshot.val();

            if (!existingUserData) {
                // User doesn't exist, create minimal user record
                console.log(`📝 [AdminUserManagement] Creating new user record for: ${uid}`);
                
                // SAFETY CHECK: Double-check if user exists with minimal delay
                await new Promise(resolve => setTimeout(resolve, 100));
                const doubleCheckSnapshot = await get(userRef);
                if (doubleCheckSnapshot.exists()) {
                    console.log(`⚠️ [AdminUserManagement] User ${uid} created during operation, switching to update mode`);
                    // User was created during our operation, preserve existing data
                    const existingData = doubleCheckSnapshot.val();
                    const userUpdates = {
                        ...existingData,
                        role: isAdmin ? 'admin' : 'user',
                        isAdmin: isAdmin,
                        updatedAt: Date.now(),
                        updatedBy: currentUser.uid
                    };
                    await update(userRef, userUpdates);
                } else {
                    // Safe to create new user
                    const newUserData = {
                        uid: uid,
                        role: isAdmin ? 'admin' : 'user',
                        isAdmin: isAdmin,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        updatedBy: currentUser.uid
                    };
                    await set(userRef, newUserData);
                }
            } else {
                // FIXED: User exists, preserve ALL existing data including phone numbers
                console.log(`📝 [AdminUserManagement] Updating existing user record for: ${uid}`);
                
                // SAFETY CHECK: Log if phoneNumber exists to monitor preservation
                if (existingUserData.phoneNumber) {
                    console.log(`✅ [AdminUserManagement] Preserving phoneNumber for user ${uid}:`, existingUserData.phoneNumber);
                }

                // Start with ALL existing user data
                const userUpdates = {
                    ...existingUserData,
                    // Only update admin-related fields
                    role: isAdmin ? 'admin' : 'user',
                    isAdmin: isAdmin,
                    updatedAt: Date.now(),
                    updatedBy: currentUser.uid
                };

                // VALIDATION: Verify critical fields are preserved
                const criticalFields = ['phoneNumber', 'phone', 'businessPhone', 'email', 'displayName', 'uid'];
                criticalFields.forEach(field => {
                    if (existingUserData[field] && !userUpdates[field]) {
                        console.warn(`⚠️ [AdminUserManagement] Critical field '${field}' missing from update for user ${uid}`);
                        userUpdates[field] = existingUserData[field];
                    }
                });

                console.log(`📝 [AdminUserManagement] Updating user ${uid} with preserved fields:`, {
                    preservedFields: Object.keys(existingUserData),
                    updatedFields: ['role', 'isAdmin', 'updatedAt', 'updatedBy'],
                    hasPhoneNumber: !!(userUpdates.phoneNumber || userUpdates.phone || userUpdates.businessPhone)
                });

                await update(userRef, userUpdates);
            }

            // Update admin-claims collection
            const adminClaimsRef = ref(rtdb, `admin-claims/${uid}`);
            if (isAdmin) {
                console.log(`📝 [AdminUserManagement] Adding user to admin-claims: ${uid}`);
                await set(adminClaimsRef, true);
            } else {
                console.log(`📝 [AdminUserManagement] Removing user from admin-claims: ${uid}`);
                await remove(adminClaimsRef);
            }

            console.log(`✅ [AdminUserManagement] Successfully ${isAdmin ? 'granted' : 'removed'} admin privileges for user: ${uid}`);

            return {
                success: true,
                message: `Successfully ${isAdmin ? 'granted' : 'removed'} admin privileges for user ${uid}`,
                uid: uid,
                isAdmin: isAdmin
            };
        } catch (error) {
            console.error('❌ [AdminUserManagement] Error setting admin status:', error);
            throw error;
        }
    }

    /**
     * Get a list of all admin users
     * @returns {Promise<Array>} List of admin users
     */
    static async getAdminUsers() {
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error('No user is currently signed in');
            }

            // Verify admin status
            const hasAdminRights = await AdminClaims.verifyAdminStatus(currentUser);
            if (!hasAdminRights) {
                throw new Error('Current user does not have admin privileges');
            }

            // Get admin users from admin-claims node
            const adminClaimsRef = ref(rtdb, 'admin-claims');
            const snapshot = await get(adminClaimsRef);
            const adminClaims = snapshot.val() || {};

            // Get user details from users node in Realtime Database
            const adminUsers = await Promise.all(
                Object.keys(adminClaims).map(async (uid) => {
                    try {
                        const userRef = ref(rtdb, `users/${uid}`);
                        const userSnapshot = await get(userRef);
                        const userData = userSnapshot.val();
                        
                        if (!userData) {
                            console.warn(`No user data found for ${uid}`);
                            return null;
                        }

                        return {
                            uid,
                            email: userData.email,
                            displayName: userData.displayName,
                            lastSignInTime: userData.lastSignInTime
                        };
                    } catch (error) {
                        console.warn(`Could not fetch user details for ${uid}:`, error);
                        return null;
                    }
                })
            );

            return adminUsers.filter(user => user !== null);
        } catch (error) {
            console.error('Error fetching admin users:', error);
            throw error;
        }
    }

    /**
     * Remove admin privileges from a user
     * @param {string} uid - The user ID to remove admin privileges from
     * @returns {Promise<Object>} Response from the operation
     */
    static async removeAdminPrivileges(uid) {
        return this.setUserAdminStatus(uid, false);
    }
}
