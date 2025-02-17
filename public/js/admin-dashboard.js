import { initializeDashboard } from './dashboard.js';
import { initializeProjectManagement } from './project-management.js';
import { initializeGuestManagement } from './guest-management.js';
import { initializeCampaignManagement } from './campaigns/campaigns.js';
import { initializeRewardTypes } from './reward-types.js';
import { initializeReceiptManagement } from './receipt-management.js';
import { initializeRewardManagement } from './reward-management.js';
import { authManager } from './auth/auth.js';
import { auth } from './config/firebase-config.js';
import { AdminClaims } from './auth/admin-claims.js';

async function verifyAdminAccess() {
    const hasAccess = await AdminClaims.checkAndRedirect();
    if (!hasAccess) {
        return false;
    }
    return true;
}

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
            auth.onAuthStateChanged(async (user) => {
                if (!user) {
                    window.location.href = '/admin-login.html';
                    return;
                }

                // Force token refresh to get latest claims
                await user.getIdToken(true);
                
                // Verify admin access
                const hasAccess = await AdminClaims.verifyAdminStatus(user);
                if (!hasAccess) {
                    console.error('User does not have admin access');
                    await auth.signOut();
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
        this.setupSubmenuListeners();
        // Show default section (dashboard)
        this.showSection('dashboard');
    }

    registerSections() {
        const sections = {
            // Main Dashboard
            dashboard: {
                menuId: 'dashboardMenu',
                contentId: 'dashboardContent',
                initialize: initializeDashboard
            },
            // Loyalty Program Sections
            campaigns: {
                menuId: 'campaignManagementMenu',
                contentId: 'campaignManagementContent',
                initialize: initializeCampaignManagement,
                parent: 'loyaltySubmenu'
            },
            rewardTypes: {
                menuId: 'rewardTypesMenu',
                contentId: 'rewardTypesContent',
                initialize: initializeRewardTypes,
                parent: 'loyaltySubmenu'
            },
            receipts: {
                menuId: 'receiptManagementMenu',
                contentId: 'receiptManagementContent',
                initialize: initializeReceiptManagement,
                parent: 'loyaltySubmenu'
            },
            //points: {
            //    menuId: 'pointManagementMenu',
            //    contentId: 'pointManagementContent',
            //    initialize: initializePointManagement,
            //    parent: 'loyaltySubmenu'
          //  },
            rewards: {
                menuId: 'rewardManagementMenu',
                contentId: 'rewardManagementContent',
                initialize: initializeRewardManagement,
                parent: 'loyaltySubmenu'
            },
            // Other Sections
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

    setupSubmenuListeners() {
        // Handle submenu toggles
        document.querySelectorAll('[data-toggle="collapse"]').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = toggle.getAttribute('data-target');
                const submenu = document.querySelector(targetId);
                if (submenu) {
                    // Close other submenus
                    document.querySelectorAll('.submenu.show').forEach(menu => {
                        if (menu !== submenu) {
                            menu.classList.remove('show');
                            const parentToggle = menu.previousElementSibling;
                            parentToggle?.querySelector('.fas.fa-chevron-down')?.classList.remove('rotate');
                        }
                    });
                    // Toggle current submenu
                    submenu.classList.toggle('show');
                    toggle.querySelector('.fas.fa-chevron-down')?.classList.toggle('rotate');
                }
            });
        });

        // Handle all submenu items
        document.querySelectorAll('.submenu').forEach(submenu => {
            submenu.addEventListener('click', (e) => {
                const menuItem = e.target.closest('a');
                if (menuItem) {
                    e.preventDefault();
                    const menuId = menuItem.id;
                    const sectionName = this.getSectionNameFromMenuId(menuId);
                    if (sectionName) {
                        this.showSection(sectionName);
                    }
                }
            });
        });
    }

    getSectionNameFromMenuId(menuId) {
        for (const [name, section] of this.sections) {
            if (section.menuId === menuId) {
                return name;
            }
        }
        return null;
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