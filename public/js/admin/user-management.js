import { auth, rtdb, ref, get } from '../config/firebase-config.js';
import { AdminClaims } from '../auth/admin-claims.js';

export class AdminUserManagement {
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
