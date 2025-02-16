import { initializeDashboard } from './dashboard.js';
import { initializeProjectManagement } from './project-management.js';
import { initializeGuestManagement } from './guest-management.js';
import { initializeCampaignManagement } from './campaigns/campaigns.js';
import { authManager } from './auth/auth.js';
//import { routeGuard } from './auth/RouteGuard.js';

class AdminDashboard {
    constructor() {
        this.sections = new Map();
        this.currentSection = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Initialize auth
            await authManager.initialize();
            
            // Set up auth state listener
            auth.onAuthStateChanged((user) => {
                if (!user) {
                    window.location.href = '/admin-login.html';
                    return;
                }
                this.loadDashboardContent();
            });

            this.initialized = true;
            console.log('Dashboard initialized');
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            throw error;
        }
    }

    loadDashboardContent() {
        // Show dashboard content
        document.getElementById('dashboardContent').style.display = 'block';
        // Hide other content sections
        document.querySelectorAll('.content-section').forEach(section => {
            if (section.id !== 'dashboardContent') {
                section.style.display = 'none';
            }
        });
    }

    registerSections() {
        // Define all sections with their initialization functions
        const sectionConfigs = {
            dashboard: {
                menuId: 'dashboardMenu',
                contentId: 'dashboardContent',
                init: initializeDashboard
            },
            projects: {
                menuId: 'projectManagementMenu',
                contentId: 'projectManagementContent',
                init: initializeProjectManagement
            },
            campaigns: {
                menuId: 'campaignManagementMenu',
                contentId: 'campaignManagementContent',
                init: initializeCampaignManagement
            },
            guests: {
                menuId: 'guestManagementMenu',
                contentId: 'guestManagementContent',
                init: initializeGuestManagement
            }
            // Add other sections as needed
        };

        // Register each section
        Object.entries(sectionConfigs).forEach(([name, config]) => {
            this.sections.set(name, {
                name,
                initialized: false,
                ...config
            });
        });
    }

    setupEventListeners() {
        // Handle menu clicks
        this.sections.forEach(section => {
            const menuElement = document.getElementById(section.menuId);
            if (menuElement) {
                menuElement.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await this.showSection(section.name);
                });
            }
        });

        // Handle logout
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleLogout();
            });
        }

        // Handle mobile menu toggle
        const mobileToggle = document.getElementById('mobileSidebarToggle');
        const sidebar = document.getElementById('sidebar');
        if (mobileToggle && sidebar) {
            mobileToggle.addEventListener('click', () => {
                sidebar.classList.toggle('active');
            });
        }
    }

    async showSection(sectionName) {
        try {
            const section = this.sections.get(sectionName);
            if (!section) {
                console.warn(`Section ${sectionName} not found`);
                return;
            }

            // Hide all sections
            this.hideAllSections();

            // Show selected section
            const contentElement = document.getElementById(section.contentId);
            if (contentElement) {
                contentElement.style.display = 'block';
            }

            // Initialize section if needed
            if (!section.initialized && section.init) {
                await section.init();
                section.initialized = true;
            }

            this.currentSection = sectionName;

        } catch (error) {
            console.error(`Error showing section ${sectionName}:`, error);
            this.handleError(error);
        }
    }

    hideAllSections() {
        document.querySelectorAll('.content-section').forEach(section => {
            section.style.display = 'none';
        });
    }

    async handleLogout() {
        try {
            await authManager.signOut('User logged out');
        } catch (error) {
            console.error('Logout failed:', error);
            this.handleError(error);
        }
    }

    updateUserInfo(user) {
        const profileElement = document.querySelector('.user-profile');
        if (profileElement && user) {
            profileElement.innerHTML = `
                <img src="${user.photoURL || '/images/avatar.png'}" alt="User Avatar">
                <span class="d-none d-md-inline">${user.email}</span>
            `;
        }
    }

    handleError(error) {
        // Show error message to user
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger alert-dismissible fade show m-3';
        errorDiv.innerHTML = `
            <strong>Error:</strong> ${error.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.prepend(errorDiv);
    }

    destroy() {
        // Cleanup each section
        this.sections.forEach(section => {
            const menuElement = document.getElementById(section.menuId);
            if (menuElement) {
                menuElement.removeEventListener('click');
            }
        });

        // Clear sections
        this.sections.clear();
        this.currentSection = null;
        this.initialized = false;
    }
}

// Initialize dashboard
const dashboard = new AdminDashboard();
dashboard.initialize().catch(console.error);

// Export for module usage
export { dashboard };

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    dashboard.initialize();
});