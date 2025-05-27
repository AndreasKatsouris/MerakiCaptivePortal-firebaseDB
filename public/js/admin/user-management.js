import { auth, rtdb, ref, get } from '../config/firebase-config.js';
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
     * Set admin privileges for a user
     * @param {string} uid - The user ID to grant admin privileges to
     * @param {boolean} isAdmin - Whether to grant or revoke admin privileges
     * @returns {Promise<Object>} Response from the server
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

            const idToken = await currentUser.getIdToken();
            const response = await fetch('/setAdminClaim', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uid,
                    isAdmin
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to set admin status');
            }

            return await response.json();
        } catch (error) {
            console.error('Error setting admin status:', error);
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
     * @returns {Promise<Object>} Response from the server
     */
    static async removeAdminPrivileges(uid) {
        return this.setUserAdminStatus(uid, false);
    }
}
