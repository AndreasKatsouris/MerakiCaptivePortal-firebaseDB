import { initializeDashboard } from './dashboard.js';
import { initializeProjectManagement } from './project-management.js';
import { initializeGuestManagement } from './guest-management.js';
import { initializeCampaignManagement } from './campaigns/campaigns.js';
import { authManager } from './auth/auth.js';
import { auth } from './config/firebase-config.js';

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
                this.setupDashboard();
            });

            this.initialized = true;
            console.log('Dashboard initialized');
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            throw error;
        }
    }

    setupDashboard() {
        this.registerSections();
        this.setupEventListeners();
        // Show default section (dashboard)
        this.showSection('dashboard');
    }

    registerSections() {
        const sections = {
            dashboard: {
                menuId: 'dashboardMenu',
                contentId: 'dashboardContent',
                initialize: initializeDashboard
            },
            campaigns: {
                menuId: 'campaignManagementMenu',
                contentId: 'campaignManagementContent',
                initialize: initializeCampaignManagement
            },
            projects: {
                menuId: 'projectManagementMenu',
                contentId: 'projectManagementContent',
                initialize: initializeProjectManagement
            },
            guests: {
                menuId: 'guestManagementMenu',
                contentId: 'guestManagementContent',
                initialize: initializeGuestManagement
            }
        };

        Object.entries(sections).forEach(([name, config]) => {
            this.sections.set(name, { ...config, initialized: false });
        });
    }

    setupEventListeners() {
        // Add click listeners to all menu items
        this.sections.forEach((section, name) => {
            const menuElement = document.getElementById(section.menuId);
            if (menuElement) {
                menuElement.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showSection(name);
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
        console.log(`Showing section: ${sectionName}`);
        const section = this.sections.get(sectionName);
        
        if (!section) {
            console.error(`Section ${sectionName} not found`);
            return;
        }

        // Hide all sections
        document.querySelectorAll('.content-section').forEach(el => {
            el.style.display = 'none';
        });

        // Show selected section
        const contentElement = document.getElementById(section.contentId);
        if (contentElement) {
            contentElement.style.display = 'block';
        }

        // Initialize section if not already initialized
        if (!section.initialized && section.initialize) {
            try {
                await section.initialize();
                section.initialized = true;
            } catch (error) {
                console.error(`Error initializing ${sectionName}:`, error);
            }
        }

        this.currentSection = sectionName;
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