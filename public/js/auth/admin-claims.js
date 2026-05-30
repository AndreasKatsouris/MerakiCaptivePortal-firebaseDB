import { auth, signOut, app } from '../config/firebase-config.js';
// Use the single shared Firebase app — no second inline config. The previous
// inline firebaseConfig carried a different apiKey + messagingSenderId (a stale
// config from another project) and only its projectId was ever read.

export class AdminClaims {
    /**
     * Get the Firebase Functions base URL
     * @returns {string} The base URL for Firebase Functions
     */
    static getFunctionsBaseUrl() {
        const region = 'us-central1';
        const baseUrl = `https://${region}-${app.options.projectId}.cloudfunctions.net`;
        console.log('[AdminClaims] Functions base URL:', baseUrl);
        return baseUrl;
    }

    /**
     * Verify if a user has admin privileges
     * @param {Object} user - Firebase user object
     * @returns {Promise<boolean>} True if user is admin, false otherwise
     */
    static async verifyAdminStatus(user) {
        console.log('[AdminClaims] Starting admin verification for user:', user?.uid);
        
        if (!user) {
            console.error('[AdminClaims] No user provided to verifyAdminStatus');
            return false;
        }

        try {
            console.log('[AdminClaims] Getting fresh ID token...');
            const idToken = await user.getIdToken(true);
            console.log('[AdminClaims] Successfully got fresh token');
            
            const functionsBaseUrl = this.getFunctionsBaseUrl();
            const url = `${functionsBaseUrl}/verifyAdminStatus`;
            console.log('[AdminClaims] Making request to:', url);

            console.log('[AdminClaims] Sending verification request...');
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            console.log('[AdminClaims] Response received:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });

            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                let errorMessage;
                
                if (contentType && contentType.includes('application/json')) {
                    console.log('[AdminClaims] Parsing JSON error response...');
                    const errorData = await response.json();
                    errorMessage = errorData.error;
                } else {
                    console.error('[AdminClaims] Received non-JSON response');
                    const textContent = await response.text();
                    console.error('[AdminClaims] Response content:', textContent);
                    errorMessage = 'Server returned an invalid response format';
                }
                
                throw new Error(errorMessage || 'Failed to verify admin status');
            }

            console.log('[AdminClaims] Parsing successful response...');
            const result = await response.json();
            console.log('[AdminClaims] Admin verification result:', result);
            
            return result.isAdmin === true;
        } catch (error) {
            console.error('[AdminClaims] Error verifying admin status:', error);
            return false;
        }
    }

    /**
     * Refresh the user's token to get latest claims
     * @param {Object} user - Firebase user object
     * @returns {Promise<boolean>} True if refresh successful
     */
    static async refreshToken(user) {
        console.log('[AdminClaims] Starting token refresh for user:', user?.uid);
        
        if (!user) {
            console.error('[AdminClaims] No user provided for token refresh');
            return false;
        }

        try {
            console.log('[AdminClaims] Forcing token refresh...');
            await user.getIdToken(true);
            console.log('[AdminClaims] Token refresh successful');
            return true;
        } catch (error) {
            console.error('[AdminClaims] Error refreshing token:', error);
            return false;
        }
    }

    /**
     * Check admin status and redirect if not admin
     * @returns {Promise<boolean>} True if user is admin
     */
    static async checkAndRedirect() {
        console.log('[AdminClaims] Checking admin status for redirect...');
        
        const user = auth.currentUser;
        if (!user) {
            console.log('[AdminClaims] No user found, redirecting to login');
            window.location.href = '/admin-login.html';
            return false;
        }

        console.log('[AdminClaims] Verifying admin status...');
        const isAdmin = await this.verifyAdminStatus(user);
        
        if (!isAdmin) {
            console.log('[AdminClaims] User is not admin, signing out and redirecting');
            alert('You do not have admin privileges');
            await signOut(auth);
            window.location.href = '/admin-login.html';
            return false;
        }

        console.log('[AdminClaims] Admin status verified successfully');
        return true;
    }
}
