// Core authentication module
import { auth, rtdb, ref, set, signInWithEmailAndPassword, signOut } from '../config/firebase-config.js';

class AuthManager {
    constructor() {
        this.user = null;
        this.authStateListeners = new Set();
    }

    /**
     * Initialize authentication state
     */
    async initialize() {
        return new Promise((resolve) => {
            auth.onAuthStateChanged(async (user) => {
                this.user = user;
                if (user) {
                    // Sync user data to Realtime Database
                    await this.syncUserData(user);
                }
                this.notifyListeners(user);
                resolve(user);
            });
        });
    }

    /**
     * Sync user data to Realtime Database
     * @param {Object} user 
     */
    async syncUserData(user) {
        try {
            const userRef = ref(rtdb, `users/${user.uid}`);
            await set(userRef, {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                lastSignInTime: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error syncing user data:', error);
        }
    }

    /**
     * Add auth state change listener
     * @param {Function} listener 
     */
    addAuthStateListener(listener) {
        this.authStateListeners.add(listener);
    }

    /**
     * Remove auth state change listener
     * @param {Function} listener 
     */
    removeAuthStateListener(listener) {
        this.authStateListeners.delete(listener);
    }

    /**
     * Notify all listeners of auth state change
     * @param {Object} user 
     */
    notifyListeners(user) {
        this.authStateListeners.forEach(listener => listener(user));
    }

    /**
     * Get current user
     * @returns {Object|null}
     */
    getCurrentUser() {
        return this.user;
    }

    /**
     * Basic sign in functionality
     * @param {string} email 
     * @param {string} password 
     */
    async signIn(email, password) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await userCredential.user.getIdToken(true); // Force token refresh
        await this.syncUserData(userCredential.user); // Sync user data on sign in
        return userCredential.user;
    }

    /**
     * Sign out functionality
     */
    async signOut() {
        await signOut(auth);
    }

    /**
     * Refresh user token
     */
    async refreshToken() {
        if (this.user) {
            await this.user.getIdToken(true);
        }
    }
}

// Export singleton instance
export const authManager = new AuthManager();