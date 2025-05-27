import { auth, functions, httpsCallable, rtdb, ref, remove } from './config/firebase-config.js';
// Import the Analytics module directly with a named import to ensure it's loaded
import { DataProcessor, DatabaseOperations, ChartManager, Utilities } from './modules/analytics/index.js';
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
// Import Access Control Admin Initializers
import { initializeAdminTierManagement } from './modules/access-control/admin/tier-management.js';
import { initializeEnhancedUserSubscriptionManager } from './modules/access-control/admin/enhanced-user-subscription-manager.js';

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
        this.activeSection = null;
        this.navigationInProgress = false;
        this.pendingSectionId = null;
        this.foodCostInitialized = false;
        this.foodCostInstance = null;
        
        // Section initialization tracking
        this.sectionInitialized = {
            foodCostContent: false,
            analyticsContent: false,
            foodCostAnalyticsContent: false,
            tierManagementContent: false,
            userSubscriptionManagementContent: false,
            dashboardContent: false,
            projectManagementContent: false,
            adminUsersContent: false
        };
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
            willDestroy: cleanupCampaignManagement,
            parent: 'engageSubmenu'
        });

        this.sections.set('guestManagementContent', {
            menuId: 'guestManagementMenu',
            contentId: 'guestManagementContent',
            init: initializeGuestManagement,
            cleanup: cleanupGuestManagement,
            parent: 'engageSubmenu'
        });

        this.sections.set('analyticsContent', {
            menuId: 'analyticsMenu',
            contentId: 'analyticsContent',
            parent: 'driversSubmenu',
            init: () => this.initializeAnalyticsSection(),
            hasSubmodules: true
        });
        
        this.sections.set('foodCostAnalyticsContent', {
            menuId: 'foodCostAnalyticsTab',
            contentId: 'foodCostAnalyticsContent',
            parent: 'analyticsContent',
            init: () => this.initializeFoodCostAnalyticsSection()
        });

        this.sections.set('adminUsersContent', {
            menuId: 'adminUsersMenu',
            contentId: 'adminUsersContent',
            init: () => this.initializeAdminUsersSection(),
            parent: 'settingsSubmenu'
        });

        this.sections.set('projectManagementContent', {
            menuId: 'projectManagementMenu',
            contentId: 'projectManagementContent',
            init: initializeProjectManagement,
            parent: 'driversSubmenu'
        });

        this.sections.set('receiptManagementContent', {
            menuId: 'receiptManagementMenu',
            contentId: 'receiptManagementContent',
            init: initializeReceiptManagement,
            cleanup: cleanupReceiptManagement,
            parent: 'engageSubmenu'
        });

        this.sections.set('foodCostContent', {
            menuId: 'foodCostMenu',
            contentId: 'foodCostContent',
            init: () => {
                // Create a new Vue instance for the Food Cost module
                console.log('Creating Food Cost Vue instance');
                return window.initializeFoodCostModule('foodCostContent');
            },
            cleanup: window.cleanupFoodCostModule,
            parent: 'driversSubmenu'
        });

        // Register Access Control Admin Sections
        this.sections.set('tierManagementContent', {
            menuId: 'tierManagementMenu',
            contentId: 'tierManagementContent',
            init: () => initializeAdminTierManagement('tierManagementContent'),
            parent: 'settingsSubmenu'
        });

        this.sections.set('userSubscriptionManagementContent', {
            menuId: 'userSubscriptionManagementMenu',
            contentId: 'userSubscriptionManagementContent',
            init: () => initializeAdminUserSubscriptionManager('userSubscriptionManagementContent'),
            parent: 'settingsSubmenu'
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

        // Handle engage submenu
        const engageLink = document.querySelector('[href="#engageSubmenu"]');
        if (engageLink) {
            engageLink.addEventListener('click', (e) => {
                e.preventDefault();
                const submenu = document.getElementById('engageSubmenu');
                if (submenu) {
                    submenu.classList.toggle('show');
                    engageLink.querySelector('.fa-chevron-down')?.classList.toggle('rotate');
                }
            });
        }

        // Handle drivers submenu
        const driversLink = document.querySelector('[href="#driversSubmenu"]');
        if (driversLink) {
            driversLink.addEventListener('click', (e) => {
                e.preventDefault();
                const submenu = document.getElementById('driversSubmenu');
                if (submenu) {
                    submenu.classList.toggle('show');
                    driversLink.querySelector('.fa-chevron-down')?.classList.toggle('rotate');
                }
            });
        }

        // Handle submenu item clicks
        this.sections.forEach((section, sectionId) => {
            if (section.parent) {
                const menuItem = document.getElementById(section.menuId);
                if (menuItem) {
                    menuItem.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation(); // Prevent triggering parent click
                        this.showSection(sectionId);
                    });
                }
            }
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
        console.log(`[AdminDashboard] showSection called with ID: ${sectionId}. Current active: ${this.activeSection}`);
        
        // Cancel if still loading another section
        if (this.navigationInProgress) {
            console.log('[AdminDashboard] Navigation in progress, queuing section:', sectionId);
            this.pendingSectionId = sectionId;
            return;
        }
        
        console.log('[AdminDashboard] Showing section:', sectionId);
        
        // Check if section is already active
        if (this.activeSection === sectionId) {
            console.log('[AdminDashboard] Section already active:', sectionId);
            return;
        }
        
        // Set navigation in progress
        this.navigationInProgress = true;
        
        try {
            // First, hide ALL content sections by direct style manipulation AND class
            console.log(`[AdminDashboard] Hiding all sections before showing ${sectionId}...`);
            document.querySelectorAll('.admin-section, [id$="Content"]').forEach(el => {
                // Use both methods for maximum compatibility
                el.classList.add('d-none');
                el.style.display = 'none';
                console.log(`[AdminDashboard] Hidden section: ${el.id}`);
            });
            
            // Remove active class from all nav items
            document.querySelectorAll('.dashboard-nav-link').forEach(link => {
                link.classList.remove('active');
            });
            
            // Show the selected section reliably by ID using both class and style
            const contentElement = document.getElementById(sectionId);
            if (contentElement) {
                console.log(`[AdminDashboard] Showing section ${sectionId}...`);
                contentElement.classList.remove('d-none');
                
                // Apply stronger visibility styles with !important via inline style
                // This ensures the section is visible regardless of other style rules
                contentElement.setAttribute('style', 'display: block !important; visibility: visible !important; opacity: 1 !important;');
                
                // Special handling for tier management section which might need Vue to render properly
                if (sectionId === 'tierManagementContent') {
                    console.log('[AdminDashboard] Special handling for tierManagementContent');
                    setTimeout(() => {
                        // Double-check visibility after a short delay
                        contentElement.setAttribute('style', 'display: block !important; visibility: visible !important; opacity: 1 !important;');
                        console.log('[AdminDashboard] Applied forced visibility to tierManagementContent');
                    }, 200);
                }
                
                this.activeSection = sectionId;
            } else {
                console.warn(`[AdminDashboard] Section element with ID '${sectionId}' not found for showing.`);
            }

            // Mark nav item as active
            const navItem = document.querySelector(`.dashboard-nav-link[data-section="${sectionId}"]`);
            if (navItem) {
                navItem.classList.add('active');
            }
            
            // Update active section
            this.activeSection = sectionId;
        } catch (err) {
            console.error('[AdminDashboard] Error in showSection:', err);
        }
        
        // Check if section needs initialization
        console.log('Checking initialization for section:', sectionId);
        try {
            switch (sectionId) {
                case 'dashboardContent':
                    if (!this.sectionInitialized.dashboardContent) { 
                        await initializeDashboard();
                        this.sectionInitialized.dashboardContent = true; 
                    }
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
                    if (!this.sectionInitialized.projectManagementContent) {
                        await initializeProjectManagement();
                        this.sectionInitialized.projectManagementContent = true;
                    }
                    break;
                case 'adminUsersContent':
                    if (!this.sectionInitialized.adminUsersContent) {
                        AdminUserManagement.initialize('adminUsersContent');
                        this.sectionInitialized.adminUsersContent = true;
                    }
                    break;
                case 'tierManagementContent': 
                    if (!this.sectionInitialized.tierManagementContent) {
                        console.log('[AdminDashboard] Initializing tier management section...');
                        
                        // Clear container and show loading state
                        const tierContainer = document.getElementById(sectionId);
                        if (tierContainer) {
                            tierContainer.innerHTML = '<div class="d-flex justify-content-center align-items-center" style="min-height: 300px;">' +
                                '<div class="text-center">' +
                                '<div class="spinner-border text-primary mb-3" role="status">' +
                                '<span class="visually-hidden">Loading...</span>' +
                                '</div>' +
                                '<p>Loading Tier Management Dashboard...</p>' +
                                '</div>' +
                                '</div>';
                            
                            // Set explicit display
                            tierContainer.style.display = 'block';
                            tierContainer.style.visibility = 'visible';
                            tierContainer.style.opacity = '1';
                        }
                        
                        try {
                            console.log('[AdminDashboard] Checking if tier management module is available...');
                            if (typeof initializeAdminTierManagement !== 'function') {
                                console.error('[AdminDashboard] Tier management initialization function not found!');
                                throw new Error('Tier management module not properly loaded');
                            }
                            
                            // Use a timeout to ensure the DOM is ready
                            setTimeout(() => {
                                try {
                                    console.log('[AdminDashboard] Calling initializeAdminTierManagement with:', 'tierManagementContent');
                                    initializeAdminTierManagement('tierManagementContent');
                                    console.log('[AdminDashboard] Tier management initialized successfully');
                                    this.sectionInitialized.tierManagementContent = true;
                                } catch (innerError) {
                                    console.error('[AdminDashboard] Error during tier initialization:', innerError);
                                    if (tierContainer) {
                                        tierContainer.innerHTML = '<div class="alert alert-danger">' +
                                            '<h4>Tier Management Error</h4>' +
                                            '<p>Failed to initialize: ' + innerError.message + '</p>' +
                                            '</div>';
                                    }
                                }
                            }, 200);
                        } catch (error) {
                            console.error('[AdminDashboard] Error setting up tier management:', error);
                            if (tierContainer) {
                                tierContainer.innerHTML = '<div class="alert alert-danger">' +
                                    '<h4>Module Initialization Error</h4>' +
                                    '<p>Failed to initialize the Tier Management Module: ' + error.message + '</p>' +
                                    '</div>';
                            }
                        }
                    }
                    break;
                case 'userSubscriptionManagementContent': 
                    if (!this.sectionInitialized.userSubscriptionManagementContent) {
                        console.log('[AdminDashboard] Initializing user subscription management section...');
                        initializeEnhancedUserSubscriptionManager(sectionId); 
                        this.sectionInitialized.userSubscriptionManagementContent = true;
                    }
                    break;
                case 'analyticsContent': {
                    if (!this.sectionInitialized.analyticsContent) {
                        console.log('Initializing analytics section...');
                        this.initializeAnalyticsSection();
                        this.sectionInitialized.analyticsContent = true;
                    }
                    break;
                }
                case 'foodCostContent': {
                    if (!this.foodCostInitialized) {
                        console.log('Initializing food cost module...');
                        
                        // Clear container
                        const container = document.getElementById('food-cost-app');
                        if (container) {
                            container.innerHTML = '<div class="d-flex justify-content-center align-items-center" style="min-height: 300px;">' +
                                '<div class="text-center">' +
                                '<div class="spinner-border text-primary mb-3" role="status">' +
                                '<span class="visually-hidden">Loading...</span>' +
                                '</div>' +
                                '<p>Loading Food Cost Dashboard...</p>' +
                                '</div>' +
                                '</div>';
                        }
                        
                        try {
                            // Load module files using explicit <script> tags before mounting
                            await this.loadRequiredScripts();
                            
                            // Access FoodCost global namespace
                            if (typeof window.FoodCost === 'undefined' || 
                                typeof window.FoodCost.initializeFoodCostModule !== 'function') {
                                throw new Error('Food Cost Module not properly loaded');
                            }
                            
                            // Initialize using the global namespace function
                            const moduleInstance = await window.FoodCost.initializeFoodCostModule('food-cost-app');
                            
                            this.foodCostInitialized = true;
                            this.foodCostInstance = moduleInstance;
                            
                            console.log('Food Cost Module initialized successfully');
                        } catch (foodCostError) {
                            console.error('Error initializing Food Cost Module:', foodCostError);
                            
                            // Show error in container
                            if (container) {
                                container.innerHTML = '<div class="alert alert-danger">' +
                                    '<h4>Module Initialization Error</h4>' +
                                    '<p>Failed to initialize the Food Cost Module: ' + foodCostError.message + '</p>' +
                                    '<button class="btn btn-primary mt-2" onclick="location.reload()">Refresh Page</button>' +
                                    '</div>';
                            }
                        }
                    }
                    break;
                }
                
                // Add other cases here...
            }
        } catch (error) {
            console.error('Error initializing section:', sectionId, error);
        }

        // Reset navigation in progress
        this.navigationInProgress = false;
        
        // Check if there's a pending section request
        if (this.pendingSectionId) {
            console.log('Pending section request found:', this.pendingSectionId);
            this.showSection(this.pendingSectionId);
            this.pendingSectionId = null;
        }
    }
    
    // Helper method to load all required Food Cost Module scripts in the correct order
    async loadRequiredScripts() {
        // Load dependencies in the proper order for modules
        const scripts = [
            // Load the Firebase config first to ensure it's available for all modules
            { src: '/js/config/firebase-config.js', type: 'module' },
            { src: '/js/modules/food-cost/utilities.js', type: 'module' },
            { src: '/js/modules/food-cost/firebase-helpers.js', type: 'module' },
            { src: '/js/modules/food-cost/database-operations.js', type: 'module' },
            { src: '/js/modules/food-cost/data-processor.js', type: 'module' },
            { src: '/js/modules/food-cost/chart-manager.js', type: 'module' },
            { src: '/js/modules/food-cost/services/data-service.js', type: 'module' },
            { src: '/js/modules/food-cost/refactored-app-component.js', type: 'module' },
            { src: '/js/modules/food-cost/index.js', type: 'module' }
        ];
        
        // Load scripts sequentially to ensure proper initialization
        for (const script of scripts) {
            console.log(`Loading script: ${script.src}`);
            await this.loadScriptAsync(script.src, script.type);
        }
        
        // Wait a moment for scripts to be processed
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return true;
    }
    
    // Helper to load a script and wait for it to load
    loadScriptAsync(src, type = '') {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            if (type) script.type = type;
            
            script.onload = () => resolve();
            script.onerror = (e) => reject(new Error(`Failed to load script: ${src}`));
            
            document.head.appendChild(script);
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

    /**
     * Initialize the Analytics section
     */
    initializeAnalyticsSection() {
        console.log('Initializing Analytics section');
        
        if (this.sectionInitialized.analyticsContent) {
            console.log('Analytics section already initialized');
            return;
        }
        
        try {
            // Set up tab event listeners
            const tabElements = document.querySelectorAll('#analyticsNavTabs button[data-bs-toggle="tab"]');
            
            tabElements.forEach(tab => {
                tab.addEventListener('shown.bs.tab', (event) => {
                    // Get the activated tab content ID
                    const targetId = event.target.dataset.bsTarget.substring(1); // Remove the #
                    
                    // Save active tab to localStorage
                    localStorage.setItem('analyticsContent_activeTab', targetId);
                    
                    // Initialize the tab content if needed
                    const section = Array.from(this.sections.entries())
                        .find(([id, info]) => id === targetId);
                    
                    if (section && section[1].init && !this.sectionInitialized[targetId]) {
                        section[1].init();
                        this.sectionInitialized[targetId] = true;
                    }
                });
            });
            
            // Initialize the default tab (Overview)
            const activeTabId = localStorage.getItem('analyticsContent_activeTab') || 'overviewContent';
            const activeTab = document.querySelector(`button[data-bs-target="#${activeTabId}"]`);
            if (activeTab) {
                const tabInstance = new bootstrap.Tab(activeTab);
                tabInstance.show();
            }
            
            this.sectionInitialized.analyticsContent = true;
        } catch (error) {
            console.error('Error initializing Analytics section:', error);
        }
    }
    /**
     * Initialize the Food Cost Analytics section
     */
    async initializeFoodCostAnalyticsSection() {
        console.log('Initializing Food Cost Analytics section');
        
        if (this.sectionInitialized.foodCostAnalyticsContent) {
            console.log('Food Cost Analytics section already initialized');
            return;
        }
        
        try {
            const container = document.getElementById('foodCostAnalyticsContent');
            if (!container) {
                console.error('Food Cost Analytics container not found');
                return;
            }
            
            // Show loading indicator
            container.innerHTML = `
                <div class="d-flex justify-content-center align-items-center" style="height: 200px;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="ms-3 mb-0">Initializing Food Cost Analytics...</p>
                </div>
            `;
            
            console.log('Loading all required Food Cost Analytics components...');
            
            // Pre-load all required components first to ensure everything is available
            try {
                // First load and initialize the main analytics module
                await import('./modules/analytics/index.js');
                
                // Now load all Food Cost Analytics components
                await Promise.all([
                    import('./modules/analytics/components/food-cost-analytics/dashboard-component.js'),
                    import('./modules/analytics/components/food-cost-analytics/trends-component.js'),
                    import('./modules/analytics/components/food-cost-analytics/insights-component.js'),
                    import('./modules/analytics/components/food-cost-analytics/forecast-component.js')
                ]);
                
                console.log('All Food Cost Analytics components loaded successfully');
            } catch (importError) {
                console.error('Failed to import Food Cost Analytics components:', importError);
                throw new Error(`Failed to load Food Cost Analytics components: ${importError.message}`);
            }
            
            // Ensure Analytics namespace is available
            if (!window.Analytics) {
                console.error('Analytics namespace not available after imports');
                window.Analytics = {}; // Create it if it doesn't exist
            }
            
            // Make sure initializeAnalyticsModule is attached to both window and window.Analytics
            if (typeof window.initializeAnalyticsModule === 'function') {
                window.Analytics.initializeAnalyticsModule = window.initializeAnalyticsModule;
            } else {
                console.error('initializeAnalyticsModule function not found after imports');
                throw new Error('Analytics module initialization function not available');
            }
            
            // Initialize main analytics if not already done
            if (!window.Analytics._appInstance) {
                console.log('Initializing main Analytics module...');
                window.initializeAnalyticsModule('analyticsContent');
            }
            
            // Ensure FoodCostAnalytics namespace exists
            if (!window.Analytics.FoodCostAnalytics) {
                console.error('FoodCostAnalytics namespace not found after imports');
                window.Analytics.FoodCostAnalytics = {};
            }
            
            // If initialize method doesn't exist, create one using the FoodCostAnalyticsDashboard component
            if (!window.Analytics.FoodCostAnalytics.initialize) {
                console.log('Creating FoodCostAnalytics.initialize method dynamically');
                
                // Import dashboard component again to make sure it's available
                const dashboardModule = await import('./modules/analytics/components/food-cost-analytics/dashboard-component.js');
                
                // Create initialize method
                window.Analytics.FoodCostAnalytics.initialize = async function(targetContainer) {
                    console.log('Dynamic initialize method called for Food Cost Analytics');
                    
                    // Get the dashboard component
                    const FoodCostAnalyticsDashboard = dashboardModule.FoodCostAnalyticsDashboard;
                    
                    // Ensure the container is completely empty before we begin
                    // (the container should already be empty from the earlier clear,
                    // but this ensures we don't have any stray elements)
                    targetContainer.innerHTML = '';
                    
                    // Create container for Vue app
                    const appContainer = document.createElement('div');
                    appContainer.id = 'food-cost-analytics-app';
                    targetContainer.appendChild(appContainer);
                    
                    // Create default date range for last 30 days
                    const dateRange = {
                        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
                        endDate: new Date().toISOString().split('T')[0]
                    };
                    
                    // Create and mount Vue app
                    const app = Vue.createApp(FoodCostAnalyticsDashboard, { dateRange }).mount('#food-cost-analytics-app');
                    window.Analytics.FoodCostAnalytics._appInstance = app;
                    return app;
                };
            }
            
            console.log('Calling FoodCostAnalytics.initialize...');
            
            // First, make sure the container is empty by removing the loading indicator
            // This is critical to avoid duplicate content
            container.innerHTML = '';
            
            // Now initialize the Food Cost Analytics component
            await window.Analytics.FoodCostAnalytics.initialize(container);
            this.sectionInitialized.foodCostAnalyticsContent = true;
            console.log('Food Cost Analytics initialized successfully');
        } catch (error) {
            console.error('Error initializing Food Cost Analytics:', error);
            const container = document.getElementById('foodCostAnalyticsContent');
            if (container) {
                container.innerHTML = `
                    <div class="alert alert-danger">
                        <h4><i class="fas fa-exclamation-triangle me-2"></i> Error</h4>
                        <p>Failed to initialize Food Cost Analytics. Please try again.</p>
                        <p class="text-muted small">Error details: ${error.message}</p>
                    </div>
                `;
            }
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

    loadScriptAsync(src, type = '') {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            if (type) script.type = type;
            
            script.onload = () => resolve();
            script.onerror = (e) => reject(new Error(`Failed to load script: ${src}`));
            
            document.head.appendChild(script);
        });
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