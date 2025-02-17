import { auth, signOut } from '../config/firebase-config.js';

export class AdminClaims {
    static async verifyAdminStatus(user) {
        try {
            const idToken = await user.getIdToken();
            
            const response = await fetch('/verifyAdminStatus', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to verify admin status');
            }

            const result = await response.json();
            return result.isAdmin;
        } catch (error) {
            console.error('Error verifying admin status:', error);
            return false;
        }
    }

    static async refreshToken(user) {
        try {
            // Force token refresh to get latest claims
            await user.getIdToken(true);
            return true;
        } catch (error) {
            console.error('Error refreshing token:', error);
            return false;
        }
    }

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
