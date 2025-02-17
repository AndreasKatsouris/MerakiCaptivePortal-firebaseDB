// Core authentication module
import { auth, signInWithEmailAndPassword, signOut } from '../config/firebase-config.js';

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
            auth.onAuthStateChanged((user) => {
                this.user = user;
                this.notifyListeners(user);
                resolve(user);
            });
        });
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