import { AuthErrorHandler} from './AuthErrors.js';

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

// Update the existing initialize method to properly chain the initialization steps
async initialize() {
    if (this.initializePromise) {
        return this.initializePromise;
    }

    this.initializePromise = (async () => {
        try {
            if (this.initialized) {
                console.warn('AuthManager already initialized');
                return;
            }

            // Initialize Firebase first
            await this.initializeWithTimeout();
            
            // Setup auth state monitoring
            this.setupAuthStateMonitoring();
            
            // Check existing session
            const hasValidSession = await this.checkExistingSession();
            
            // Set initialized flag
            this.initialized = true;
            
            console.log('AuthManager initialized successfully');
            
            return hasValidSession;
            
        } catch (error) {
            const handledError = AuthErrorHandler.handleError(error, 'initialization');
            console.error('AuthManager initialization failed:', handledError);
            throw handledError;
        }
    })();

    return this.initializePromise;
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
    async checkExistingSession() {
        try {
            const user = firebase.auth().currentUser;
            
            if (!user) {
                return false;
            }
    
            // Check for existing session data
            const sessionData = this.getStoredSessionData();
            
            if (!sessionData) {
                return false;
            }
    
            // Validate session
            const isValid = await this.validateSession(user);
            
            if (!isValid) {
                await this.endSession('Invalid session');
                return false;
            }
    
            // Check session expiry
            if (this.isSessionExpired(sessionData)) {
                await this.endSession('Session expired');
                return false;
            }
    
            // Session is valid - update timestamp
            this.updateSessionTimestamp();
            return true;
    
        } catch (error) {
            console.error('Error checking existing session:', error);
            await this.endSession('Session check failed');
            return false;
        }
    }
    getStoredSessionData() {
        try {
            const sessionStr = localStorage.getItem('adminSession');
            if (!sessionStr) {
                return null;
            }
            return JSON.parse(sessionStr);
        } catch (error) {
            console.error('Error parsing session data:', error);
            return null;
        }
    }
    isSessionExpired(sessionData) {
        if (!sessionData || !sessionData.lastActivity) {
            return true;
        }
    
        const lastActivity = new Date(sessionData.lastActivity);
        const now = new Date();
        const timeDiff = now - lastActivity;
    
        return timeDiff > this.config.sessionTimeout;
    }
    
    updateSessionTimestamp() {
        try {
            const sessionData = this.getStoredSessionData() || {};
            sessionData.lastActivity = new Date().toISOString();
            localStorage.setItem('adminSession', JSON.stringify(sessionData));
        } catch (error) {
            console.error('Error updating session timestamp:', error);
        }
    }
    /**
    async setAdminClaim(user) {
        try {
            // Call the Cloud Function to set admin claim
            const setAdminClaimFunction = firebase.functions().httpsCallable('setAdminClaim');
            const result = await setAdminClaimFunction({ idToken: await user.getIdToken() });
    
            if (!result.data.success) {
                throw new Error(result.data.error || 'Failed to set admin claim');
            }
    
            // Force token refresh to get the new claim
            await user.getIdToken(true);
            return result.data;
        } catch (error) {
            throw AuthErrorHandler.handleError(error, 'set-admin-claim');
        }
    }
 */
    async login(email, password) {
        try {
            if (!email || !password) {
                throw new Error('Email and password are required');
            }
    
            // Attempt login
            const userCredential = await firebase.auth()
                .signInWithEmailAndPassword(email, password);
            
            console.log('User logged in:', userCredential.user.email);
    
            // Check if email domain is allowed
            if (!this.isAllowedAdminDomain(userCredential.user.email)) {
                await this.signOut('Unauthorized email domain');
                throw new Error('admin/unauthorized-domain');
            }
            console.log('ID Token before calling setAdminClaim:', await userCredential.user.getIdToken());
            // Set admin claims
            const setAdminClaimFunction = firebase.functions().httpsCallable('setAdminClaim');
            // Add a small delay (500ms) to ensure token propagation
            await new Promise(resolve => setTimeout(resolve, 500));
            const result = await setAdminClaimFunction({
                idToken: await userCredential.user.getIdToken()
            });
    
            console.log('Claim setting result:', result.data);
    
            if (!result.data.success) {
                await this.signOut('Failed to verify admin status');
                throw new Error('admin/claim-failed');
            }
    
            if (!result.data.isAdmin) {
                await this.signOut('Admin access required');
                throw new Error('admin/insufficient-privileges');
            }
    
            // Force token refresh to get new claims
            await userCredential.user.getIdToken(true);
    
            // Update metadata and session
            await this.updateUserMetadata(userCredential.user);
            this.updateSessionTimestamp();
    
            // If successful, redirect to dashboard
            window.location.href = '/admin-dashboard.html';
    
            return {
                success: true,
                user: userCredential.user
            };
    
        } catch (error) {
            console.error('Login error:', error);
            throw AuthErrorHandler.handleError(error, 'login');
        }
    }
    isAllowedAdminDomain(email) {
        return email.endsWith(this.config.adminEmailDomain);
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
            // Force token refresh
            await user.getIdToken(true);
            const tokenResult = await user.getIdTokenResult();
            
            console.log('Validating session:', {
                email: user.email,
                claims: tokenResult.claims
            });
    
            if (!tokenResult.claims.admin) {
                throw new Error('admin/insufficient-privileges');
            }
    
            // Verify token expiration
            const tokenExp = new Date(tokenResult.claims.exp * 1000);
            if (tokenExp <= new Date()) {
                throw new Error('session/expired');
            }
    
            // Update session timestamp
            this.updateSessionTimestamp();
            return true;
    
        } catch (error) {
            console.error('Session validation failed:', error);
            throw AuthErrorHandler.handleError(error, 'session-validation');
        }
    }
    async handleNetworkError(error) {
        const handledError = AuthErrorHandler.handleError(error, 'network');
        if (AuthErrorHandler.isNetworkError(handledError)) {
            // Handle offline scenario
            this.handleOfflineMode();
        }
        throw handledError;
    }

    handleOfflineMode() {
        // Implement offline mode handling
        console.warn('Application is in offline mode');
        // Additional offline mode logic
    }

    async getAdminTokenResult(user, forceRefresh = false) {
        try {
            const tokenResult = await user.getIdTokenResult(forceRefresh);
            console.log('Token result:', {
                claims: tokenResult.claims,
                signInProvider: tokenResult.signInProvider,
                issuedAt: tokenResult.issuedAtTime,
                expirationTime: tokenResult.expirationTime
            });
    
            const isAdmin = this.validateAdminClaims(tokenResult.claims);
            console.log('Admin validation result:', {
                isAdmin,
                email: user.email
            });
    
            return {
                success: true,
                tokenResult,
                isAdmin
            };
        } catch (error) {
            console.error('Error getting token result:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    validateAdminClaims(claims) {
        console.log('Raw claims:', claims);
    
        // Check for explicit admin claim
        const hasAdminClaim = claims?.admin === true;
        
        // Check email domain
        const hasValidEmail = claims?.email?.endsWith(this.config.adminEmailDomain);
        
        // Check role
        const hasAdminRole = claims?.role === 'admin';
        
        console.log('Validating admin claims:', {
            claims,
            hasAdminClaim,
            hasValidEmail,
            hasAdminRole,
            requiredDomain: this.config.adminEmailDomain
        });
    
        return hasAdminClaim && hasValidEmail;
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
//Object.freeze(authManager);