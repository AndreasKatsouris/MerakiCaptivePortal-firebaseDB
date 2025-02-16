// Core authentication module
import { auth, signInWithEmailAndPassword, signOut } from '../config/firebase-config.js';

class AuthManager {
    constructor() {
        this.user = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            // Initialize Firebase Auth
            auth.onAuthStateChanged((user) => {
                this.user = user;
                console.log('Auth state changed:', user ? 'User logged in' : 'No user');
            });
            
            this.initialized = true;
        } catch (error) {
            console.error('Auth initialization failed:', error);
            throw error;
        }
    }

    // Basic authentication methods
    async login(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return userCredential.user;
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    }

    async logout() {
        try {
            await signOut(auth);
            this.user = null;
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        }
    }

    getCurrentUser() {
        return this.user;
    }
}

// Export a single instance
export const authManager = new AuthManager(); 