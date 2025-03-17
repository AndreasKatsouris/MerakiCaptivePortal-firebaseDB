import { auth, functions, httpsCallable, rtdb, ref, remove } from './config/firebase-config.js';
import { AdminClaims } from './auth/admin-claims.js';
import { AdminUserManagement } from './admin/user-management.js';
import { initializeDashboard } from './dashboard.js';
import { initializeProjectManagement } from './project-management.js';
import { initializeGuestManagement, cleanupGuestManagement } from './guest-management.js';
import { initializeCampaignManagement, cleanupCampaignManagement } from './campaigns/campaigns.js';
import { initializeRewardTypes } from './reward-types.js';
import { initializeReceiptManagement, cleanupReceiptManagement } from './receipt-management.js';
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
        this.showSection('dashboardContent');
    }

    registerSections() {
        this.sections.set('dashboardContent', {
            menuId: 'dashboardMenu',
            contentId: 'dashboardContent',
            init: initializeDashboard
        });

        this.sections.set('campaignsContent', {
            menuId: 'campaignsMenu',
            contentId: 'campaignsContent',
            init: initializeCampaignManagement,
            willDestroy: cleanupCampaignManagement
        });

        this.sections.set('guestManagementContent', {
            menuId: 'guestManagementMenu',
            contentId: 'guestManagementContent',
            init: initializeGuestManagement,
            cleanup: cleanupGuestManagement
        });

        this.sections.set('analyticsContent', {
            menuId: 'analyticsMenu',
            contentId: 'analyticsContent'
        });

        this.sections.set('adminUsersContent', {
            menuId: 'adminUsersMenu',
            contentId: 'adminUsersContent',
            init: () => this.initializeAdminUsersSection()
        });

        this.sections.set('projectManagementContent', {
            menuId: 'projectManagementMenu',
            contentId: 'projectManagementContent',
            init: initializeProjectManagement
        });

        this.sections.set('receiptManagementContent', {
            menuId: 'receiptManagementMenu',
            contentId: 'receiptManagementContent',
            init: initializeReceiptManagement,
            cleanup: cleanupReceiptManagement
        });

        this.sections.set('settingsContent', {
            menuId: 'settingsMenu',
            contentId: 'settingsContent',
            hasSubmenu: true
        });

        this.sections.set('databaseManagementContent', {
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
        console.log('Setting up event listeners');
        
        // Add click listeners to all menu items
        this.sections.forEach((section, name) => {
            const menuElement = document.getElementById(section.menuId);
            if (menuElement) {
                menuElement.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (!section.hasSubmenu) {
                        this.showSection(section.contentId);
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
        
        // Clear scanning data button - add specific handler for this button
        console.log('Looking for clearScanningDataBtn');
        const clearScanningDataBtn = document.getElementById('clearScanningDataBtn');
        if (clearScanningDataBtn) {
            console.log('Found clearScanningDataBtn, adding event listener');
            clearScanningDataBtn.addEventListener('click', () => {
                console.log('Clear Scanning Data button clicked');
                this.handleClearScanningData();
            });
        } else {
            console.warn('clearScanningDataBtn not found in the DOM');
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

    async showSection(sectionId) {
        console.log('Showing section:', sectionId);
        
        if (this.currentSection === sectionId) {
            console.log('Section already active:', sectionId);
            return;
        }

        // Clean up current section if needed
        if (this.currentSection) {
            const currentSection = this.sections.get(this.currentSection);
            if (currentSection && currentSection.cleanup) {
                console.log('Cleaning up section:', this.currentSection);
                await currentSection.cleanup();
            }
        }

        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.style.display = 'none';
        });

        // Show selected section
        const selectedSection = document.getElementById(sectionId);
        if (selectedSection) {
            selectedSection.style.display = 'block';
        }

        // Remove active class from all menu items
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // Add active class to current menu item
        const section = this.sections.get(sectionId);
        if (section) {
            const menuElement = document.getElementById(section.menuId);
            if (menuElement) {
                menuElement.classList.add('active');
            }
        }

        // Initialize section if needed
        try {
            console.log('Checking initialization for section:', sectionId);
            
            switch (sectionId) {
                case 'dashboardContent':
                    await initializeDashboard();
                    break;
                case 'campaignsContent':
                    await initializeCampaignManagement();
                    break;
                case 'receiptManagementContent':
                    console.log('Initializing receipt management section...');
                    await initializeReceiptManagement();
                    break;
                case 'guestManagementContent':
                    await initializeGuestManagement();
                    break;
                case 'projectManagementContent':
                    await initializeProjectManagement();
                    break;
            }
        } catch (error) {
            console.error('Error initializing section:', sectionId, error);
        }

        this.currentSection = sectionId;
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
        console.log('handleClearScanningData method called');
        
        if (!window.Swal) {
            console.error('SweetAlert2 library not loaded');
            alert('An error occurred. SweetAlert2 library is not available. Please refresh the page and try again.');
            return;
        }

        try {
            // Confirm before proceeding
            const confirmation = await Swal.fire({
                title: 'Clear Scanning Data?',
                text: 'This will permanently delete all scanning data. This action cannot be undone.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Yes, delete it!'
            });

            if (!confirmation.isConfirmed) {
                console.log('User cancelled the operation');
                return;
            }

            // Show loading state
            Swal.fire({
                title: 'Processing...',
                text: 'Clearing scanning data...',
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            console.log('Attempting to clear scanning data from Firebase...');
            
            // Direct database operation for immediate feedback
            await remove(ref(rtdb, 'scanningData'));
            console.log('Successfully removed scanning data from rtdb');
            
            // Also try to call the Cloud Function if it exists
            try {
                console.log('Attempting to call clearScanningData cloud function...');
                const clearScanningDataFunction = httpsCallable(functions, 'clearScanningData');
                await clearScanningDataFunction();
                console.log('Cloud function clearScanningData executed successfully');
            } catch (functionError) {
                console.warn('Cloud function not available or failed, using direct database operation only', functionError);
                // Continue anyway since we already did the direct database operation
            }

            // Show success message
            console.log('Operation completed, showing success message');
            await Swal.fire({
                title: 'Success!',
                text: 'Scanning data has been cleared successfully.',
                icon: 'success'
            });
            
        } catch (error) {
            console.error('Error in handleClearScanningData:', error);
            
            // Show error message
            await Swal.fire({
                title: 'Error',
                text: `Failed to clear scanning data: ${error.message || 'Unknown error'}`,
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