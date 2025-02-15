// auth/RouteGuard.js

import { authGuard } from './AuthGuard.js';
import { AuthErrorHandler } from './AuthErrors.js';

export class RouteGuard {
    constructor() {
        this.initialized = false;
        this.routes = new Map();
        this.fallbackRoute = '/admin-login.html';
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Initialize auth guard
            await authGuard.initialize();

            // Setup navigation handler
            this.setupNavigationHandler();

            this.initialized = true;
            console.log('RouteGuard initialized successfully');
        } catch (error) {
            const handledError = AuthErrorHandler.handleError(error, 'route-guard-init');
            console.error('RouteGuard initialization failed:', handledError);
            throw handledError;
        }
    }

    setupNavigationHandler() {
        // Handle clicks on links
        document.addEventListener('click', async (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href || href.startsWith('http') || href.startsWith('#')) {
                return;
            }

            e.preventDefault();
            await this.navigateTo(href);
        });

        // Handle browser back/forward
        window.addEventListener('popstate', async (e) => {
            await this.handleRouteChange(window.location.pathname);
        });
    }

    async navigateTo(path) {
        try {
            // Check if route is registered
            if (!this.routes.has(path)) {
                console.warn(`Route not registered: ${path}`);
                path = this.fallbackRoute;
            }

            // Validate access
            const canAccess = await this.validateRouteAccess(path);
            if (!canAccess) {
                return;
            }

            // Update URL
            window.history.pushState({}, '', path);

            // Handle route change
            await this.handleRouteChange(path);

        } catch (error) {
            const handledError = AuthErrorHandler.handleError(error, 'navigation');
            console.error('Navigation failed:', handledError);
        }
    }

    async handleRouteChange(path) {
        try {
            const routeHandler = this.routes.get(path);
            if (routeHandler) {
                // Hide all sections first
                document.querySelectorAll('.content-section').forEach(section => {
                    section.style.display = 'none';
                });

                // Execute route handler
                await routeHandler();
            }
        } catch (error) {
            const handledError = AuthErrorHandler.handleError(error, 'route-change');
            console.error('Route change failed:', handledError);
        }
    }

    async validateRouteAccess(path) {
        // Public routes don't need validation
        if (authGuard.isPublicPath(path)) {
            return true;
        }

        try {
            const user = firebase.auth().currentUser;
            if (!user) {
                authGuard.redirectToLogin('Authentication required');
                return false;
            }

            await authGuard.validateAccess(user);
            return true;
        } catch (error) {
            const handledError = AuthErrorHandler.handleError(error, 'route-access');
            console.error('Route access validation failed:', handledError);
            authGuard.redirectToLogin(handledError.message);
            return false;
        }
    }

    registerRoute(path, handler) {
        if (typeof handler !== 'function') {
            throw new Error('Route handler must be a function');
        }
        this.routes.set(path, handler);
    }

    setFallbackRoute(path) {
        this.fallbackRoute = path;
    }

    // Static method to create and initialize guard
    static async create() {
        const guard = new RouteGuard();
        await guard.initialize();
        return guard;
    }
}

// Create and export singleton instance
const routeGuard = new RouteGuard();

// Register default routes
routeGuard.registerRoute('/admin-dashboard.html', async () => {
    const dashboardSection = document.getElementById('dashboardContent');
    if (dashboardSection) {
        dashboardSection.style.display = 'block';
        // Initialize dashboard if needed
        if (typeof initializeDashboard === 'function') {
            await initializeDashboard();
        }
    }
});

routeGuard.registerRoute('/admin-login.html', () => {
    const loginSection = document.getElementById('adminLoginApp');
    if (loginSection) {
        loginSection.style.display = 'block';
    }
});

// Prevent modifications
Object.freeze(routeGuard);

export { routeGuard };