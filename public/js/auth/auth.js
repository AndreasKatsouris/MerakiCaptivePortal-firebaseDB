// Core authentication module
import { auth, rtdb, ref, set, update, get, signInWithEmailAndPassword, signOut } from '../config/firebase-config.js';

class AuthManager {
    constructor() {
        this.user = null;
        this.authStateListeners = new Set();
        this.initialized = false;  // ADDED: Track initialization state
        this.syncInProgress = false;  // ADDED: Prevent concurrent sync operations
    }

    /**
     * Initialize authentication state - FIXED VERSION
     */
    async initialize() {
        // FIXED: Prevent duplicate initialization
        if (this.initialized) {
            console.log('🔄 [AuthManager] Already initialized, returning current user');
            return this.user;
        }

        console.log('🔧 [AuthManager] Initializing authentication state...');
        this.initialized = true;

        return new Promise((resolve) => {
            // FIXED: Only set up ONE auth state listener
            auth.onAuthStateChanged(async (user) => {
                console.log('🔄 [AuthManager] Auth state changed:', user ? `User: ${user.uid}` : 'No user');
                
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
     * Sync user data to Realtime Database - FIXED VERSION WITH CONCURRENCY PROTECTION
     * @param {Object} user 
     */
    async syncUserData(user) {
        // FIXED: Prevent concurrent sync operations
        if (this.syncInProgress) {
            console.log('⚠️ [AuthManager] Sync already in progress, skipping duplicate sync for:', user.uid);
            return;
        }

        this.syncInProgress = true;
        
        try {
            const userRef = ref(rtdb, `users/${user.uid}`);
            
            // FIXED: Get existing user data first to preserve all fields
            const userSnapshot = await get(userRef);
            const existingUserData = userSnapshot.val();
            
            if (!existingUserData) {
                // User doesn't exist, create new record
                console.log(`🆕 [AuthManager] Creating new user record for: ${user.uid}`);
                await set(userRef, {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    lastSignInTime: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            } else {
                // FIXED: User exists, preserve ALL existing data and only update auth-related fields
                console.log(`🔄 [AuthManager] Syncing auth data for existing user: ${user.uid}`);
                
                // SAFETY CHECK: Log if phoneNumber exists to monitor preservation
                if (existingUserData.phoneNumber) {
                    console.log(`✅ [AuthManager] Preserving phoneNumber for user ${user.uid}:`, existingUserData.phoneNumber);
                }
                
                // Only update auth-specific fields, preserve everything else
                const authUpdates = {
                    email: user.email,
                    displayName: user.displayName,
                    lastSignInTime: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                // VALIDATION: Verify critical fields are preserved
                const criticalFields = ['phoneNumber', 'phone', 'businessPhone', 'role', 'isAdmin', 'businessInfo'];
                let preservedCount = 0;
                criticalFields.forEach(field => {
                    if (existingUserData[field]) {
                        preservedCount++;
                    }
                });
                
                console.log(`📝 [AuthManager] Syncing user ${user.uid} - preserving ${preservedCount} critical fields:`, {
                    updatingFields: Object.keys(authUpdates),
                    hasPhoneNumber: !!(existingUserData.phoneNumber || existingUserData.phone || existingUserData.businessPhone),
                    hasRole: !!existingUserData.role,
                    hasAdminStatus: !!existingUserData.isAdmin
                });
                
                // FIXED: Use update() instead of set() to preserve existing data
                await update(userRef, authUpdates);
            }
        } catch (error) {
            console.error('❌ [AuthManager] Error syncing user data:', error);
        } finally {
            // FIXED: Always reset sync flag
            this.syncInProgress = false;
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
     * Basic sign in functionality - FIXED VERSION
     * @param {string} email 
     * @param {string} password 
     */
    async signIn(email, password) {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await userCredential.user.getIdToken(true); // Force token refresh
        
        // FIXED: Don't call syncUserData here - the auth state change listener will handle it
        // This prevents duplicate sync calls
        console.log('📝 [AuthManager] Sign in successful, auth state listener will handle sync');
        
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