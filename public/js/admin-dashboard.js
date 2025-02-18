import { auth, functions, httpsCallable } from './config/firebase-config.js';
import { AdminClaims } from './auth/admin-claims.js';
import { AdminUserManagement } from './admin/user-management.js';
import { initializeDashboard } from './dashboard.js';
import { initializeProjectManagement } from './project-management.js';
import { initializeGuestManagement, cleanupGuestManagement } from './guest-management.js';
import { initializeCampaignManagement, cleanupCampaignManagement } from './campaigns/campaigns.js';
import { initializeRewardTypes } from './reward-types.js';
import { initializeReceiptManagement } from './receipt-management.js';
import { initializeRewardManagement } from './reward-management.js';
import { authManager } from './auth/auth.js';

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
            // Initialize auth and wait for state
            const user = await authManager.initialize();
            
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

            // Set up auth state listener for future changes
            auth.onAuthStateChanged(async (user) => {
                if (!user) {
                    window.location.href = '/admin-login.html';
                    return;
                }
            });

            // Initialize Bootstrap modal
            this.modal = new bootstrap.Modal(document.getElementById('add-admin-modal'));

            this.setupDashboard();
            this.initialized = true;
            console.log('Dashboard initialized');
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            window.location.href = '/admin-login.html';
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
        this.sections.set('dashboard', {
            menuId: 'dashboardMenu',
            contentId: 'dashboardContent',
            init: initializeDashboard
        });
        
        this.sections.set('campaigns', {
            menuId: 'campaignsMenu',
            contentId: 'campaignsContent',
            init: initializeCampaignManagement,
            cleanup: cleanupCampaignManagement
        });

        this.sections.set('guestManagement', {
            menuId: 'guestManagementMenu',
            contentId: 'guestManagementContent',
            init: initializeGuestManagement,
            cleanup: cleanupGuestManagement
        });

        this.sections.set('analytics', {
            menuId: 'analyticsMenu',
            contentId: 'analyticsContent'
        });

        this.sections.set('adminUsers', {
            menuId: 'adminUsersMenu',
            contentId: 'adminUsersContent',
            init: () => this.initializeAdminUsersSection()
        });

        this.sections.set('projects', {
            menuId: 'projectManagementMenu',
            contentId: 'projectManagementContent',
            init: initializeProjectManagement
        });

        this.sections.set('settings', {
            menuId: 'settingsMenu',
            contentId: 'settingsContent',
            hasSubmenu: true
        });

        this.sections.set('databaseManagement', {
            menuId: 'databaseManagementMenu',
            contentId: 'databaseManagementContent',
            parent: 'settingsSubmenu',
            init: () => {
                const clearScanningDataBtn = document.getElementById('clearScanningDataBtn');
                if (clearScanningDataBtn) {
                    clearScanningDataBtn.addEventListener('click', this.handleClearScanningData.bind(this));
                }
            }
        });
    }

    setupEventListeners() {
        // Add click listeners to all menu items
        this.sections.forEach((section, name) => {
            const menuElement = document.getElementById(section.menuId);
            if (menuElement) {
                menuElement.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (!section.hasSubmenu) {
                        this.showSection(name);
                    }
                });
            }
        });

        // Handle logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }

        // Handle sidebar collapse
        const sidebarCollapse = document.getElementById('sidebarCollapse');
        const sidebar = document.getElementById('sidebar');
        if (sidebarCollapse && sidebar) {
            sidebarCollapse.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                document.getElementById('content').classList.toggle('expanded');
            });
        }
    }

    setupSubmenuListeners() {
        // Handle settings submenu
        const settingsLink = document.querySelector('[href="#settingsSubmenu"]');
        if (settingsLink) {
            settingsLink.addEventListener('click', (e) => {
                e.preventDefault();
                const submenu = document.getElementById('settingsSubmenu');
                if (submenu) {
                    submenu.classList.toggle('show');
                    settingsLink.querySelector('.fa-chevron-down')?.classList.toggle('rotate');
                }
            });
        }

        // Handle submenu items
        document.querySelectorAll('.submenu .nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const sectionName = this.getSectionNameFromMenuId(link.id);
                if (sectionName) {
                    this.showSection(sectionName);
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

        // Cleanup previous section if needed
        if (this.currentSection === 'campaigns' && sectionName !== 'campaigns') {
            cleanupCampaignManagement();
        }

        if (this.currentSection === 'guestManagement' && sectionName !== 'guestManagement') {
            cleanupGuestManagement();
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
        if (!section.initialized && section.init) {
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

    async handleClearScanningData() {
        try {
            Swal.fire({
                title: 'Processing...',
                text: 'Clearing scanning data...',
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                willOpen: () => {
                    Swal.showLoading();
                }
            });

            const clearScanningDataFunction = httpsCallable(functions, 'clearScanningData');
            const result = await clearScanningDataFunction();

            if (result.data.success) {
                await Swal.fire({
                    title: 'Success!',
                    text: 'Scanning data has been cleared successfully.',
                    icon: 'success'
                });
            } else {
                throw new Error(result.data.error || 'Unknown error occurred');
            }
        } catch (error) {
            console.error('Error clearing scanning data:', error);
            await Swal.fire({
                title: 'Error',
                text: 'Failed to clear scanning data: ' + error.message,
                icon: 'error'
            });
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