import { auth, signOut } from '../config/firebase-config.js';

// Get Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyBqXVRPtq-DGbXMUAhxHH8B10MOV5OZkzI",
    authDomain: "merakicaptiveportal-firebasedb.firebaseapp.com",
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    projectId: "merakicaptiveportal-firebasedb",
    storageBucket: "merakicaptiveportal-firebasedb.appspot.com",
    messagingSenderId: "854311920907",
    appId: "1:854311920907:web:dd6e51c7f0989887c6c3bc"
};

export class AdminClaims {
    /**
     * Get the Firebase Functions base URL
     * @returns {string} The base URL for Firebase Functions
     */
    static getFunctionsBaseUrl() {
        const region = 'us-central1'; // Default Firebase Functions region
        return `https://${region}-${firebaseConfig.projectId}.cloudfunctions.net`;
    }

    /**
     * Verify if a user has admin privileges
     * @param {Object} user - Firebase user object
     * @returns {Promise<boolean>} True if user is admin, false otherwise
     */
    static async verifyAdminStatus(user) {
        if (!user) {
            console.error('No user provided to verifyAdminStatus');
            return false;
        }

        try {
            // Get a fresh token to ensure latest claims
            const idToken = await user.getIdToken(true);
            
            // Use the full Firebase Functions URL
            const functionsBaseUrl = this.getFunctionsBaseUrl();
            const response = await fetch(`${functionsBaseUrl}/verifyAdminStatus`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            // Log the response for debugging
            console.log('Admin verification response:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });

            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                let errorMessage;
                
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorMessage = errorData.error;
                } else {
                    const textContent = await response.text();
                    console.error('Unexpected response format:', textContent);
                    errorMessage = 'Server returned an invalid response format';
                }
                
                throw new Error(errorMessage || 'Failed to verify admin status');
            }

            const result = await response.json();
            return result.isAdmin === true;
        } catch (error) {
            console.error('Error verifying admin status:', error);
            // Don't throw, just return false for non-admin
            return false;
        }
    }

    /**
     * Refresh the user's token to get latest claims
     * @param {Object} user - Firebase user object
     * @returns {Promise<boolean>} True if refresh successful
     */
    static async refreshToken(user) {
        if (!user) return false;

        try {
            // Force token refresh to get latest claims
            await user.getIdToken(true);
            return true;
        } catch (error) {
            console.error('Error refreshing token:', error);
            return false;
        }
    }

    /**
     * Check admin status and redirect if not admin
     * @returns {Promise<boolean>} True if user is admin
     */
    static async checkAndRedirect() {
        const user = auth.currentUser;
        if (!user) {
            window.location.href = '/admin-login.html';
            return false;
        }

        const isAdmin = await this.verifyAdminStatus(user);
        if (!isAdmin) {
            alert('You do not have admin privileges');
            await signOut(auth);
            window.location.href = '/admin-login.html';
            return false;
        }

        return true;
    }
}
