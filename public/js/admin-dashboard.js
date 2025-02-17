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
import { AdminUserManagement } from './admin/user-management.js';

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
        this.modal = null;
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

            // Initialize Bootstrap modal
            this.modal = new bootstrap.Modal(document.getElementById('add-admin-modal'));

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
            },
            adminUsers: {
                menuId: 'adminUsersMenu',
                contentId: 'adminUsersContent',
                init: () => this.initializeAdminUsersSection()
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
        } else if (!section.initialized && section.init) {
            try {
                await section.init();
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

    async initializeAdminUsersSection() {
        try {
            // Add event listeners
            document.getElementById('add-admin-btn').addEventListener('click', () => {
                this.modal.show();
            });

            document.getElementById('confirm-add-admin').addEventListener('click', async () => {
                await this.handleAddAdmin();
            });

            // Load admin users
            await this.loadAdminUsers();
        } catch (error) {
            console.error('Error initializing admin users section:', error);
        }
    }

    async loadAdminUsers() {
        try {
            const adminUsers = await AdminUserManagement.getAdminUsers();
            const tableBody = document.getElementById('admin-users-table-body');
            tableBody.innerHTML = '';

            adminUsers.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.email}</td>
                    <td>${user.displayName || 'N/A'}</td>
                    <td>${new Date(user.lastSignInTime).toLocaleString()}</td>
                    <td>
                        <button class="btn btn-danger btn-sm remove-admin" data-uid="${user.uid}">
                            Remove Admin
                        </button>
                    </td>
                `;

                // Add event listener for remove button
                row.querySelector('.remove-admin').addEventListener('click', async (e) => {
                    const uid = e.target.dataset.uid;
                    if (confirm('Are you sure you want to remove admin privileges from this user?')) {
                        await this.handleRemoveAdmin(uid);
                    }
                });

                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Error loading admin users:', error);
        }
    }

    async handleAddAdmin() {
        const emailInput = document.getElementById('admin-email');
        const email = emailInput.value.trim();

        try {
            // Get user by email
            const userRecord = await auth.getUserByEmail(email);
            
            // Set admin privileges
            await AdminUserManagement.setUserAdminStatus(userRecord.uid, true);
            
            // Refresh the list
            await this.loadAdminUsers();
            
            // Close modal and reset form
            this.modal.hide();
            emailInput.value = '';
            
            // Show success message
            alert('Admin privileges granted successfully');
        } catch (error) {
            console.error('Error adding admin:', error);
            alert(error.message);
        }
    }

    async handleRemoveAdmin(uid) {
        try {
            await AdminUserManagement.removeAdminPrivileges(uid);
            await this.loadAdminUsers();
            alert('Admin privileges removed successfully');
        } catch (error) {
            console.error('Error removing admin:', error);
            alert(error.message);
        }
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

// Clear Scanning Data functionality
const clearScanningDataBtn = document.getElementById('clearScanningDataBtn');
const clearStatus = document.getElementById('clearStatus');

async function clearScanningData() {
    try {
        clearScanningDataBtn.disabled = true;
        clearScanningDataBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Clearing...';
        clearStatus.style.display = 'none';

        const user = auth.currentUser;
        if (!user) {
            throw new Error('You must be logged in to perform this action');
        }

        const idToken = await user.getIdToken();
        const response = await fetch('/clearScanningData', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to clear scanning data');
        }

        clearStatus.className = 'alert alert-success mt-3';
        clearStatus.textContent = `Successfully cleared ${result.recordsCleared} records at ${new Date(result.timestamp).toLocaleString()}`;
        clearStatus.style.display = 'block';
    } catch (error) {
        console.error('Error clearing scanning data:', error);
        clearStatus.className = 'alert alert-danger mt-3';
        clearStatus.textContent = error.message;
        clearStatus.style.display = 'block';
    } finally {
        clearScanningDataBtn.disabled = false;
        clearScanningDataBtn.innerHTML = '<i class="fas fa-trash-alt me-2"></i>Clear Scanning Data';
    }
}

clearScanningDataBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all scanning data? This action cannot be undone!')) {
        clearScanningData();
    }
});