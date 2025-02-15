// auth/AuthManager.js

import { AuthErrorHandler, ERROR_CATEGORIES } from './AuthErrors.js';

class AuthManager {
    constructor() {
        // Core state
        this.initialized = false;
        this.isRedirecting = false;
        this.currentUser = null;
        
        // Configuration
        this.config = {
            sessionTimeout: 30 * 60 * 1000, // 30 minutes
            sessionCheckInterval: 5 * 60 * 1000, // 5 minutes
            initTimeout: 10000, // 10 seconds
            maxRetries: 3,
            retryDelay: 1000, // 1 second
            adminEmailDomain: 'askgroupholdings.com'
        };
        
        // Listeners and intervals
        this.authStateListeners = new Set();
        this.sessionCheckInterval = null;
        this.initializePromise = null;
    }

    async initialize() {
        // Prevent multiple initializations
        if (this.initializePromise) {
            return this.initializePromise;
        }
    
        const initPromise = (async () => {
            try {
                if (this.initialized) {
                    console.warn('AuthManager already initialized');
                    return;
                }
    
                await this.initializeWithTimeout();
                this.setupAuthStateMonitoring();
                await this.checkExistingSession();
    
                this.initialized = true;
                console.log('AuthManager initialized successfully');
            } catch (error) {
                this.initialized = false;
                throw AuthErrorHandler.handleError(error, 'initialization');
            }
        })();
    
        this.initializePromise = initPromise;
    
        return initPromise;
    }

    async initializeWithTimeout() {
        return Promise.race([
            this.initializeFirebase(),
            new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error('auth/timeout'));
                }, this.config.initTimeout);
            })
        ]);
    }

    initializeFirebase() {
        return new Promise(async (resolve, reject) => {
            let retryCount = 0;
    
            while (retryCount < this.config.maxRetries) {
                try {
                    if (!firebase?.auth) {
                        throw new Error('Firebase SDK not loaded');
                    }
    
                    if (firebase.apps.length === 0) {
                        throw new Error('Firebase not initialized');
                    }
    
                    resolve(true);
                    return;
                } catch (error) {
                    retryCount++;
                    if (retryCount === this.config.maxRetries) {
                        reject(error);
                        return;
                    }
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                }
            }
        });
    }

    async login(email, password) {
        try {
            // Validate input
            if (!email || !password) {
                throw new Error('Email and password are required');
            }

            // Attempt login
            const userCredential = await firebase.auth()
                .signInWithEmailAndPassword(email, password);
            
            // Validate admin status
            const tokenResult = await this.getAdminTokenResult(userCredential.user, true);
            
            if (!tokenResult.success || !tokenResult.isAdmin) {
                await this.signOut('Admin access required');
                throw new Error('admin/insufficient-privileges');
            }

            // Update last login timestamp
            await this.updateUserMetadata(userCredential.user);

            return {
                success: true,
                user: userCredential.user
            };
        } catch (error) {
            const handledError = AuthErrorHandler.handleError(error, 'login');
            throw handledError;
        }
    }

    async signOut(reason = 'User logout') {
        if (this.isRedirecting) return;
        
        try {
            await this.endSession(reason);
            return { success: true };
        } catch (error) {
            throw AuthErrorHandler.handleError(error, 'logout');
        }
    }

    setupAuthStateMonitoring() {
        firebase.auth().onAuthStateChanged(async (user) => {
            try {
                const previousUser = this.currentUser;
                this.currentUser = user;

                if (user) {
                    if (!previousUser) {
                        await this.handleSignIn(user);
                    }
                } else {
                    if (previousUser) {
                        await this.handleSignOut();
                    }
                }

                this.notifyAuthStateListeners(user);
            } catch (error) {
                AuthErrorHandler.handleError(error, 'auth-state-change');
            }
        });
    }

    async handleSignIn(user) {
        try {
            await this.validateSession(user);
            this.startSessionMonitoring();
        } catch (error) {
            await this.signOut('Session validation failed');
            throw error;
        }
    }

    async handleSignOut() {
        this.stopSessionMonitoring();
        this.clearApplicationState();
    }

    async validateSession(user) {
        try {
            const tokenResult = await this.getAdminTokenResult(user);
            
            if (!tokenResult.success || !tokenResult.isAdmin) {
                throw new Error('admin/insufficient-privileges');
            }

            // Verify token expiration
            const tokenExp = new Date(tokenResult.tokenResult.claims.exp * 1000);
            if (tokenExp <= new Date()) {
                throw new Error('session/expired');
            }

            return true;
        } catch (error) {
            throw AuthErrorHandler.handleError(error, 'session-validation');
        }
    }

    async getAdminTokenResult(user, forceRefresh = false) {
        try {
            const tokenResult = await user.getIdTokenResult(forceRefresh);
            const isAdmin = this.validateAdminClaims(tokenResult.claims);

            return {
                success: true,
                tokenResult,
                isAdmin
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    validateAdminClaims(claims) {
        return claims.admin === true && 
               claims.email?.endsWith(this.config.adminEmailDomain);
    }

    startSessionMonitoring() {
        this.stopSessionMonitoring();

        this.sessionCheckInterval = setInterval(async () => {
            try {
                const user = this.currentUser;
                if (!user) {
                    await this.signOut('Session expired');
                    return;
                }

                const isValid = await this.validateSession(user);
                if (!isValid) {
                    await this.signOut('Session validation failed');
                }
            } catch (error) {
                console.error('Session check error:', error);
                await this.signOut('Session check failed');
            }
        }, this.config.sessionCheckInterval);
    }

    stopSessionMonitoring() {
        if (this.sessionCheckInterval) {
            clearInterval(this.sessionCheckInterval);
            this.sessionCheckInterval = null;
        }
    }

    async updateUserMetadata(user) {
        try {
            const userRef = firebase.database().ref(`adminUsers/${user.uid}`);
            await userRef.update({
                lastLogin: firebase.database.ServerValue.TIMESTAMP,
                email: user.email,
            });
        } catch (error) {
            console.error('Error updating user metadata:', error);
            // Non-critical error, don't throw
        }
    }

    async endSession(reason) {
        this.isRedirecting = true;

        try {
            this.stopSessionMonitoring();
            this.clearApplicationState();

            await firebase.auth().signOut();
            sessionStorage.setItem('logoutReason', reason);
            window.location.href = '/admin-login.html';
        } catch (error) {
            console.error('Session end error:', error);
            window.location.reload();
        }
    }

    clearApplicationState() {
        this.currentUser = null;
        this.authStateListeners.clear();
        
        // Clear sensitive data
        sessionStorage.removeItem('adminToken');
        localStorage.removeItem('adminSession');
        
        // Clear caches
        if (window.caches) {
            caches.keys().then(keys => {
                keys.forEach(key => caches.delete(key));
            });
        }
    }

    notifyAuthStateListeners(user) {
        this.authStateListeners.forEach(listener => {
            try {
                listener(user);
            } catch (error) {
                console.error('Error in auth state listener:', error);
            }
        });
    }

    // Public API
    onAuthStateChanged(listener) {
        if (typeof listener === 'function') {
            this.authStateListeners.add(listener);
            return () => this.authStateListeners.delete(listener);
        }
        return () => {};
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return !!this.currentUser;
    }

    isInitialized() {
        return this.initialized;
    }

    async refreshToken() {
        const user = this.currentUser;
        if (!user) {
            throw new Error('No authenticated user');
        }

        try {
            await user.getIdToken(true);
            return this.validateSession(user);
        } catch (error) {
            throw AuthErrorHandler.handleError(error, 'token-refresh');
        }
    }
}

// Export singleton instance
export const authManager = new AuthManager();

// Prevent modifications to the instance
Object.freeze(authManager);