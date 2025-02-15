// js/admin/DashboardAuth.js

import { authManager } from '../auth/AuthManager.js';
import { routeGuard } from '../auth/RouteGuard.js';
import { AuthErrorHandler } from '../auth/AuthErrors.js';

class DashboardAuth {
    constructor() {
        this.initialized = false;
        this.unsubscribeAuth = null;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Initialize auth
            await authManager.initialize();
            await routeGuard.initialize();

            // Setup auth state listener
            this.unsubscribeAuth = authManager.onAuthStateChanged(
                this.handleAuthStateChange.bind(this)
            );

            // Register dashboard routes
            this.registerDashboardRoutes();

            // Initialize current user
            await this.initializeUserState();

            this.initialized = true;
            console.log('Dashboard auth initialized successfully');

        } catch (error) {
            const handledError = AuthErrorHandler.handleError(error, 'dashboard-init');
            console.error('Dashboard initialization failed:', handledError);
            this.handleInitError(handledError);
        }
    }

    async initializeUserState() {
        const user = authManager.getCurrentUser();
        if (!user) {
            throw new Error('No authenticated user');
        }

        // Get fresh token
        const token = await user.getIdToken(true);

        // Update user info in UI
        this.updateUserInfo(user);

        // Start session monitoring
        this.startSessionMonitoring();
    }

    updateUserInfo(user) {
        // Update profile section
        const profileSection = document.querySelector('.user-profile');
        if (profileSection) {
            profileSection.innerHTML = `
                <img src="${user.photoURL || '/images/avatar.png'}" alt="User Avatar">
                <span class="d-none d-md-inline">${user.email}</span>
            `;
        }
    }

    registerDashboardRoutes() {
        // Register main dashboard routes
        routeGuard.registerRoute('/admin-dashboard.html', async () => {
            await this.loadDashboardContent();
        });

        // Register section routes
        const sections = [
            'dashboard', 'projects', 'campaigns', 'guests', 
            'rewards', 'settings', 'reviews'
        ];

        sections.forEach(section => {
            routeGuard.registerRoute(`/admin/${section}`, async () => {
                await this.loadSection(section);
            });
        });
    }

    async loadDashboardContent() {
        try {
            // Show loading state
            this.showLoading();

            // Hide all sections
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = 'none';
            });

            // Show dashboard section
            const dashboardSection = document.getElementById('dashboardContent');
            if (dashboardSection) {
                dashboardSection.style.display = 'block';
            }

            // Initialize dashboard data
            if (typeof updateDashboardStats === 'function') {
                await updateDashboardStats();
            }

        } catch (error) {
            const handledError = AuthErrorHandler.handleError(error, 'dashboard-load');
            console.error('Failed to load dashboard:', handledError);
        } finally {
            this.hideLoading();
        }
    }

    async loadSection(sectionName) {
        try {
            this.showLoading();

            // Hide all sections
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = 'none';
            });

            // Show requested section
            const section = document.getElementById(`${sectionName}Content`);
            if (section) {
                section.style.display = 'block';

                // Initialize section if needed
                const initFunction = window[`initialize${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)}`];
                if (typeof initFunction === 'function') {
                    await initFunction();
                }
            }

        } catch (error) {
            const handledError = AuthErrorHandler.handleError(error, 'section-load');
            console.error(`Failed to load section ${sectionName}:`, handledError);
        } finally {
            this.hideLoading();
        }
    }

    handleAuthStateChange(user) {
        if (!user) {
            // User signed out - redirect handled by AuthGuard
            return;
        }

        // Update UI with new user info
        this.updateUserInfo(user);
    }

    startSessionMonitoring() {
        // Monitor for token expiration
        setInterval(async () => {
            try {
                const user = authManager.getCurrentUser();
                if (user) {
                    // This will refresh the token if needed
                    await user.getIdToken(true);
                }
            } catch (error) {
                console.error('Token refresh failed:', error);
                // AuthManager will handle the redirect
            }
        }, 10 * 60 * 1000); // Check every 10 minutes
    }

    handleInitError(error) {
        console.error('Dashboard initialization error:', error);
        
        // Show error in UI
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger m-3';
        errorDiv.textContent = 'Failed to initialize dashboard. Please refresh the page.';
        document.body.prepend(errorDiv);

        // Hide loading
        this.hideLoading();
    }

    showLoading() {
        const overlay = document.getElementById('globalLoadingOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    hideLoading() {
        const overlay = document.getElementById('globalLoadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    destroy() {
        if (this.unsubscribeAuth) {
            this.unsubscribeAuth();
            this.unsubscribeAuth = null;
        }
        this.initialized = false;
    }
}

// Create and export singleton
const dashboardAuth = new DashboardAuth();
Object.freeze(dashboardAuth);

export { dashboardAuth };