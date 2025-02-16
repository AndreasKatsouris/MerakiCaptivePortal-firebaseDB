// auth/AuthGuard.js

import { authManager } from './AuthManager.js';
import { AuthErrorHandler } from './AuthErrors.js';

class AuthGuard {
    #unsubscribe = null; // Private field for subscription
    #initialized = false;
    #state = {
        protectedPaths: new Set([
            '/admin-dashboard.html',
            '/admin/dashboard',
            '/admin/settings'
        ]),
        publicPaths: new Set([
            '/admin-login.html',
            '/login',
            '/forgot-password'
        ])
    };

    constructor() {
        // Initialize with immutable properties only
        Object.freeze(this.#state.protectedPaths);
        Object.freeze(this.#state.publicPaths);
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Initialize auth manager if not already initialized
            //await authManager.initialize();
            //console.log('AuthGuard: AuthManager initialized AGAIN successfully');
            // Store unsubscribe function in private field
            this.#unsubscribe = authManager.onAuthStateChanged(
                this.handleAuthStateChange.bind(this)
            );

            // Check current route
            await this.validateCurrentRoute();
            this.#initialized = true;


            console.log('AuthGuard initialized successfully');
        } catch (error) {
            const handledError = AuthErrorHandler.handleError(error, 'auth-guard-init');
            console.error('AuthGuard initialization failed:', handledError);
            this.redirectToLogin(handledError.message);
        }
    }
    get initialized() {
        return this.#initialized;
    }

    get protectedPaths() {
        return this.#state.protectedPaths;
    }

    get publicPaths() {
        return this.#state.publicPaths;
    }

    destroy() {
        if (this.#unsubscribe) {
            this.#unsubscribe();
            this.#unsubscribe = null;
        }
        this.#initialized = false;
    }
    async validateCurrentRoute() {
        const currentPath = window.location.pathname;

        // Don't check public paths
        if (this.isPublicPath(currentPath)) {
            return true;
        }

        // Check if route needs protection
        if (this.isProtectedPath(currentPath)) {
            const user = authManager.getCurrentUser();
            
            if (!user) {
                this.redirectToLogin('Authentication required');
                return false;
            }

            try {
                await this.validateAccess(user);
                return true;
            } catch (error) {
                this.redirectToLogin(error.message);
                return false;
            }
        }

        return true;
    }

    async validateAccess(user) {
        try {
            // Ensure fresh token
            await user.getIdToken(true);
            
            // Get token results and validate claims
            const tokenResult = await user.getIdTokenResult();
            
            if (!tokenResult.claims.admin) {
                throw new Error('Admin access required');
            }

            // Update last access timestamp
            await this.updateLastAccess(user.uid);

            return true;
        } catch (error) {
            throw AuthErrorHandler.handleError(error, 'access-validation');
        }
    }

    async updateLastAccess(uid) {
        try {
            await firebase.database()
                .ref(`adminUsers/${uid}/lastAccess`)
                .set(firebase.database.ServerValue.TIMESTAMP);
        } catch (error) {
            console.error('Failed to update last access:', error);
            // Non-critical error, don't throw
        }
    }

    handleAuthStateChange(user) {
        if (!user && !this.isPublicPath(window.location.pathname)) {
            this.redirectToLogin('Session ended');
        }
    }

    redirectToLogin(reason) {
        // Prevent redirect loops
        if (this.isPublicPath(window.location.pathname)) {
            return;
        }

        // Store current path for redirect after login
        if (reason !== 'Session ended') {
            sessionStorage.setItem('redirectPath', window.location.pathname);
        }

        // Store logout reason
        sessionStorage.setItem('logoutReason', reason);

        // Redirect to login
        window.location.href = '/admin-login.html';
    }

    isProtectedPath(path) {
        return this.protectedPaths.has(path) || path.startsWith('/admin/');
    }

    isPublicPath(path) {
        return this.publicPaths.has(path);
    }

    addProtectedPath(path) {
        this.protectedPaths.add(path);
    }

    addPublicPath(path) {
        this.publicPaths.add(path);
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        this.initialized = false;
    }

    // Static method to create and initialize guard
    static async create() {
        const guard = new AuthGuard();
        await guard.initialize();
        return guard;
    }
}

// Create singleton instance
const authGuard = new AuthGuard();

export { authGuard };