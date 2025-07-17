// DOM Structure Fix - ensure sections are properly positioned
// This must run early to fix DOM structure issues
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Checking DOM structure...');
    
    // Fix the rewardTypesContent positioning issue
    const rewardTypesContent = document.getElementById('rewardTypesContent');
    const adminToolsContent = document.getElementById('adminToolsContent');
    const contentContainer = document.getElementById('content');
    
    if (rewardTypesContent && adminToolsContent && contentContainer) {
        // Check if rewardTypesContent is incorrectly nested inside adminToolsContent
        const parentOfRewardTypes = rewardTypesContent.parentElement;
        
        console.log('🔧 Current parent of rewardTypesContent:', parentOfRewardTypes?.id || 'unknown');
        console.log('🔧 Expected parent should be:', contentContainer.id);
        
        if (parentOfRewardTypes && parentOfRewardTypes.id === 'adminToolsContent') {
            console.log('🚨 FIXING: rewardTypesContent is incorrectly nested inside adminToolsContent');
            
            // Move rewardTypesContent to be a direct child of content container
            // Insert it right after adminToolsContent
            contentContainer.insertBefore(rewardTypesContent, adminToolsContent.nextSibling);
            
            console.log('✅ FIXED: rewardTypesContent moved to correct position');
            console.log('🔧 New parent of rewardTypesContent:', rewardTypesContent.parentElement?.id || 'unknown');
        } else if (parentOfRewardTypes && parentOfRewardTypes.id === 'content') {
            console.log('✅ rewardTypesContent is correctly positioned');
        } else {
            console.warn('⚠️ Unexpected parent for rewardTypesContent:', parentOfRewardTypes?.id);
        }
    } else {
        console.warn('⚠️ Could not find required elements for DOM structure fix');
    }
    
    // Add comprehensive DOM structure validation and fixing system
    window.validateAndFixDOMStructure = function() {
        console.log('🔍 COMPREHENSIVE DOM STRUCTURE VALIDATION');
        
        const contentContainer = document.getElementById('content');
        if (!contentContainer) {
            console.error('❌ Main content container not found');
            return;
        }
        
        const expectedSections = [
            'dashboardContent', 'campaignsContent', 'guestManagementContent', 
            'queueManagementContent', 'voucherManagementContent', 'analyticsContent',
            'adminUsersContent', 'adminActivityMonitorContent', 'projectManagementContent',
            'foodCostContent', 'receiptManagementContent', 'rewardManagementContent',
            'settingsContent', 'databaseManagementContent', 'tierManagementContent',
            'userSubscriptionManagementContent', 'usersLocationsContent', 'adminToolsContent',
            'whatsappManagementContent', 'rewardTypesContent'
        ];
        
        const issues = [];
        const fixes = [];
        
        expectedSections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (!section) {
                issues.push(`❌ Section ${sectionId} not found in DOM`);
                return;
            }
            
            // Check if section is direct child of content
            if (section.parentElement !== contentContainer) {
                issues.push(`❌ Section ${sectionId} is not a direct child of #content`);
                issues.push(`   Current parent: ${section.parentElement?.id || 'unknown'}`);
                
                // Fix the nesting issue
                console.log(`🔧 FIXING: Moving ${sectionId} to be direct child of #content`);
                contentContainer.appendChild(section);
                fixes.push(`✅ Moved ${sectionId} to correct position`);
            }
            
            // Check for nested content sections within this section
            const nestedSections = section.querySelectorAll('.content-section');
            if (nestedSections.length > 0) {
                nestedSections.forEach(nested => {
                    if (nested !== section) {
                        issues.push(`❌ Section ${nested.id} is nested inside ${sectionId}`);
                        
                        // Fix nested section
                        console.log(`🔧 FIXING: Moving ${nested.id} out of ${sectionId}`);
                        contentContainer.appendChild(nested);
                        fixes.push(`✅ Moved ${nested.id} out of ${sectionId}`);
                    }
                });
            }
        });
        
        // Report results
        if (issues.length === 0) {
            console.log('✅ DOM structure is healthy - no issues found');
        } else {
            console.log('🚨 DOM STRUCTURE ISSUES FOUND:');
            issues.forEach(issue => console.log(issue));
            console.log('🔧 FIXES APPLIED:');
            fixes.forEach(fix => console.log(fix));
        }
        
        return { issues, fixes };
    };
    
    // Run validation on page load
    window.validateAndFixDOMStructure();
    
    // Add emergency force visibility function
    window.forceShowRewardTypes = function() {
        console.log('🚨 FORCE SHOWING REWARD TYPES...');
        
        const rewardTypesContent = document.getElementById('rewardTypesContent');
        const rewardTypesApp = document.getElementById('reward-types-app');
        
        if (rewardTypesContent) {
            // Remove d-none class
            rewardTypesContent.classList.remove('d-none');
            
            // Force CSS visibility
            rewardTypesContent.style.display = 'block !important';
            rewardTypesContent.style.visibility = 'visible !important';
            rewardTypesContent.style.opacity = '1 !important';
            rewardTypesContent.style.position = 'relative !important';
            rewardTypesContent.style.zIndex = '999 !important';
            
            console.log('✅ Force visibility applied to rewardTypesContent');
            
            // Hide other sections
            const allSections = document.querySelectorAll('.content-section');
            allSections.forEach(section => {
                if (section.id !== 'rewardTypesContent') {
                    section.classList.add('d-none');
                }
            });
            
            console.log('✅ Other sections hidden');
        }
        
        if (rewardTypesApp) {
            rewardTypesApp.style.display = 'block !important';
            rewardTypesApp.style.visibility = 'visible !important';
            rewardTypesApp.style.opacity = '1 !important';
            rewardTypesApp.style.minHeight = '400px !important';
            
            console.log('✅ Force visibility applied to reward-types-app');
        }
        
        // Try to initialize if not done
        if (window.adminDashboard && window.adminDashboard.showSection) {
            window.adminDashboard.showSection('rewardTypesContent');
            console.log('✅ showSection called');
        }
        
        // Manual Vue initialization if needed
        if (typeof Vue !== 'undefined' && !window.rewardTypesVueApp) {
            console.log('🔧 Attempting manual Vue initialization...');
            try {
                import('./reward-types.js').then(module => {
                    if (module.initializeRewardTypes) {
                        module.initializeRewardTypes();
                        console.log('✅ Manual Vue initialization attempted');
                    }
                });
            } catch (error) {
                console.error('❌ Manual Vue initialization failed:', error);
            }
        }
        
        console.log('🚨 FORCE SHOW COMPLETE!');
        console.log('📋 If still not visible, check Network tab for failed requests');
    };
    
    // Add to global scope for easy access
    window.debugRewardTypes = function() {
        console.log('🔍 REWARD TYPES DEBUG:');
        console.log('rewardTypesContent:', document.getElementById('rewardTypesContent'));
        console.log('reward-types-app:', document.getElementById('reward-types-app'));
        console.log('Vue available:', typeof Vue);
        console.log('adminDashboard available:', typeof window.adminDashboard);
        
        const rewardTypesContent = document.getElementById('rewardTypesContent');
        if (rewardTypesContent) {
            const styles = window.getComputedStyle(rewardTypesContent);
            console.log('Current styles:', {
                display: styles.display,
                visibility: styles.visibility,
                opacity: styles.opacity,
                position: styles.position,
                zIndex: styles.zIndex
            });
        }
    };
    
    console.log('🔧 Emergency functions added:');
    console.log('🔧 - window.forceShowRewardTypes() - Force show reward types');
    console.log('🔧 - window.debugRewardTypes() - Quick debug info');
});

import { auth, functions, httpsCallable, rtdb, ref, remove } from './config/firebase-config.js';
// Import the Analytics module directly with a named import to ensure it's loaded
import { DataProcessor, DatabaseOperations, ChartManager, Utilities } from './modules/analytics/index.js';
import { AdminClaims } from './auth/admin-claims.js';
import { AdminUserManagement } from './admin/user-management.js';
import { initializeUsersLocationsManagement } from './admin/users-locations-management.js';
import { initializeDashboard } from './dashboard.js';
import { initializeProjectManagement } from './project-management.js';
import { initializeGuestManagement, cleanupGuestManagement } from './guest-management.js';
import { initializeQueueManagement, cleanupQueueManagement } from './queue-management.js';
import { initializeCampaignManagement, cleanupCampaignManagement } from './campaigns/campaigns.js';
import { initializeRewardTypes, cleanupRewardTypes } from './reward-types.js';
import { initializeReceiptManagement, cleanupReceiptManagement } from './receipt-management.js';
import { initializeRewardManagement } from './reward-management.js';
import { authManager } from './auth/auth.js?v=20250131-fix';
// Import Access Control Admin Initializers
import { initializeAdminTierManagement } from './modules/access-control/admin/tier-management.js';
import { initializeEnhancedUserSubscriptionManager, cleanupEnhancedUserSubscriptionManager } from './modules/access-control/admin/enhanced-user-subscription-manager.js';

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
        this.eventListenersSetup = false;
        this.submenuListenersSetup = false;
        
        // Section initialization tracking
        this.sectionInitialized = {
            foodCostContent: false,
            analyticsContent: false,
            foodCostAnalyticsContent: false,
            tierManagementContent: false,
            userSubscriptionManagementContent: false,
            dashboardContent: false,
            projectManagementContent: false,
            adminUsersContent: false,
            adminActivityMonitorContent: false,
            usersLocationsContent: false,
            adminToolsContent: false,
            rewardManagementContent: false,
            rewardTypesContent: false,
            voucherManagementContent: false,
            queueManagementContent: false,
            whatsappManagementContent: false
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

            // Make the admin dashboard instance globally accessible for debugging
            window.adminDashboard = this;
            
            // Expose the debug tool globally for easy access
            window.debugModule = AdminDashboard.debugModule;
            
            // Quick debug shortcut for current active section
            window.debug = () => AdminDashboard.debugModule();
            
            console.log('🔧 Debug tools available:');
            console.log('🔧 - window.debugModule("sectionId") - Debug specific section');
            console.log('🔧 - window.debug() - Debug current active section');
            console.log('🔧 - AdminDashboard.debugModule("sectionId") - Full debug method');
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

        this.sections.set('queueManagementContent', {
            menuId: 'queueManagementMenu',
            contentId: 'queueManagementContent',
            init: initializeQueueManagement,
            cleanup: cleanupQueueManagement,
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

        this.sections.set('adminActivityMonitorContent', {
            menuId: 'adminActivityMonitorMenu',
            contentId: 'adminActivityMonitorContent',
            init: () => this.initializeAdminActivityMonitorSection(),
            parent: 'settingsSubmenu'
        });

        this.sections.set('usersLocationsContent', {
            menuId: 'usersLocationsMenu',
            contentId: 'usersLocationsContent',
            init: () => initializeUsersLocationsManagement('usersLocationsContent'),
            cleanup: () => {
                if (window.usersLocationsManager) {
                    window.usersLocationsManager.destroy();
                }
            },
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

        this.sections.set('rewardManagementContent', {
            menuId: 'rewardManagementMenu',
            contentId: 'rewardManagementContent',
            init: initializeRewardManagement,
            cleanup: () => {
                // Cleanup Vue instance if it exists
                if (window.rewardManagementApp) {
                    try {
                        window.rewardManagementApp.unmount();
                    } catch (error) {
                        console.warn('Error unmounting reward management app:', error);
                    }
                    window.rewardManagementApp = null;
                }
                // Reset initialization flag
                if (window.dashboard && window.dashboard.sectionInitialized) {
                    window.dashboard.sectionInitialized.rewardManagementContent = false;
                }
            },
            parent: 'engageSubmenu'
        });

        this.sections.set('voucherManagementContent', {
            menuId: 'voucherManagementMenu',
            contentId: 'voucherManagementContent',
            init: () => {
                // Initialize voucher management when section is shown
                if (window.initializeVoucherManagementSection) {
                    return window.initializeVoucherManagementSection();
                } else {
                    console.warn('Voucher management initialization function not available');
                }
            },
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
            init: () => initializeEnhancedUserSubscriptionManager('userSubscriptionManagementContent'),
            cleanup: () => {
                if (typeof cleanupEnhancedUserSubscriptionManager === 'function') {
                    cleanupEnhancedUserSubscriptionManager();
                }
            },
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

        this.sections.set('rewardTypesContent', {
            menuId: 'rewardTypesMenu',
            contentId: 'rewardTypesContent',
            init: initializeRewardTypes,
            cleanup: cleanupRewardTypes,
            parent: 'settingsSubmenu'
        });

        this.sections.set('adminToolsContent', {
            menuId: 'adminToolsMenu',
            contentId: 'adminToolsContent',
            parent: 'settingsSubmenu',
            init: () => this.initializeAdminToolsSection()
        });
        this.sections.set('whatsappManagementContent', {
            menuId: 'whatsappManagementMenu',
            contentId: 'whatsappManagementContent',
            parent: 'settingsSubmenu',
            init: () => this.initializeWhatsAppManagementSection()
        });
    }

    setupEventListeners() {
        console.log('Setting up event listeners');
        
        // Prevent duplicate event listener setup
        if (this.eventListenersSetup) {
            console.log('Event listeners already set up, skipping...');
            return;
        }
        
        // Add click listeners to all menu items
        this.sections.forEach((section, name) => {
            const menuElement = document.getElementById(section.menuId);
            if (menuElement) {
                // Remove any existing listeners first
                menuElement.removeEventListener('click', this.boundClickHandler);
                
                // Create a bound handler that we can remove later
                const clickHandler = (e) => {
                    e.preventDefault();
                    if (!section.hasSubmenu) {
                        this.showSection(section.contentId);
                    }
                };
                
                menuElement.addEventListener('click', clickHandler);
                menuElement._clickHandler = clickHandler; // Store reference for cleanup
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
        
        // Mark event listeners as set up
        this.eventListenersSetup = true;
    }

    setupSubmenuListeners() {
        // Prevent duplicate submenu listener setup
        if (this.submenuListenersSetup) {
            console.log('Submenu listeners already set up, skipping...');
            return;
        }
        
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

        // Handle submenu item clicks (but only if not already handled in setupEventListeners)
        this.sections.forEach((section, sectionId) => {
            if (section.parent) {
                const menuItem = document.getElementById(section.menuId);
                if (menuItem && !menuItem._clickHandler) { // Only add if not already added
                    menuItem.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation(); // Prevent triggering parent click
                        this.showSection(sectionId);
                    });
                }
            }
        });
        
        // Mark submenu listeners as set up
        this.submenuListenersSetup = true;
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
            // Still need to check if it was properly initialized
            if (sectionId === 'adminToolsContent' && !this.sectionInitialized.adminToolsContent) {
                console.log('[AdminDashboard] Admin tools section is active but not initialized, forcing initialization...');
                this.navigationInProgress = true;
                try {
                    await this.initializeAdminToolsSection();
                    this.sectionInitialized.adminToolsContent = true;
                } catch (error) {
                    console.error('[AdminDashboard] Error force-initializing admin tools:', error);
                }
                this.navigationInProgress = false;
            } else if (sectionId === 'rewardManagementContent' && !this.sectionInitialized.rewardManagementContent) {
                console.log('[AdminDashboard] Reward management section is active but not initialized, forcing initialization...');
                this.navigationInProgress = true;
                try {
                    console.log('Initializing reward management section...');
                    await initializeRewardManagement();
                    this.sectionInitialized.rewardManagementContent = true;
                    console.log('Reward management section initialized successfully');
                } catch (error) {
                    console.error('[AdminDashboard] Error force-initializing reward management:', error);
                }
                this.navigationInProgress = false;
            }
            return;
        }
        
        // Set navigation in progress
        this.navigationInProgress = true;
        
        try {
            // Clean up the current section if it has a cleanup method
            if (this.activeSection && this.activeSection !== sectionId) {
                const currentSection = this.sections.get(this.activeSection);
                if (currentSection && currentSection.cleanup) {
                    console.log(`[AdminDashboard] Cleaning up section: ${this.activeSection}`);
                    currentSection.cleanup();
                }
            }
            
            // First, hide ALL content sections by direct style manipulation AND class
            console.log(`[AdminDashboard] Hiding all sections before showing ${sectionId}...`);
            document.querySelectorAll('.admin-section, [id$="Content"]').forEach(el => {
                // Skip hiding the section we're about to show
                if (el.id === sectionId) {
                    console.log(`[AdminDashboard] Skipping section to be shown: ${el.id}`);
                    return;
                }
                // Use both methods for maximum compatibility
                el.classList.add('d-none');
                el.style.display = 'none';
                console.log(`[AdminDashboard] Hidden section: ${el.id}`);
            });
            
            // Additional aggressive hiding for admin tools content that might be bleeding through
            const adminToolsContainer = document.getElementById('admin-tools-container');
            if (adminToolsContainer && sectionId !== 'adminToolsContent') {
                console.log('[AdminDashboard] Forcefully hiding admin tools container');
                adminToolsContainer.style.display = 'none !important';
                adminToolsContainer.style.visibility = 'hidden !important';
                adminToolsContainer.style.opacity = '0 !important';
                adminToolsContainer.style.height = '0 !important';
                adminToolsContainer.style.overflow = 'hidden !important';
                
                // Also hide all child elements within admin tools
                const adminToolsChildren = adminToolsContainer.querySelectorAll('*');
                adminToolsChildren.forEach(child => {
                    child.style.display = 'none !important';
                    child.style.visibility = 'hidden !important';
                    child.style.opacity = '0 !important';
                });
            } else if (adminToolsContainer && sectionId === 'adminToolsContent') {
                console.log('[AdminDashboard] Ensuring admin tools container is visible');
                // Clear any forced hiding styles when showing admin tools
                adminToolsContainer.style.cssText = `
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    height: auto !important;
                    overflow: visible !important;
                `;
            }
            
            // Specifically hide the entire adminToolsContent section when not active
            const adminToolsSection = document.getElementById('adminToolsContent');
            if (adminToolsSection && sectionId !== 'adminToolsContent') {
                console.log('[AdminDashboard] Forcefully hiding entire admin tools section');
                adminToolsSection.style.display = 'none !important';
                adminToolsSection.style.visibility = 'hidden !important';
                adminToolsSection.style.opacity = '0 !important';
                adminToolsSection.style.height = '0 !important';
                adminToolsSection.style.overflow = 'hidden !important';
                adminToolsSection.style.position = 'absolute !important';
                adminToolsSection.style.left = '-9999px !important';
                
                // Hide all child elements
                const allChildren = adminToolsSection.querySelectorAll('*');
                allChildren.forEach(child => {
                    child.style.display = 'none !important';
                    child.style.visibility = 'hidden !important';
                    child.style.opacity = '0 !important';
                });
            } else if (adminToolsSection && sectionId === 'adminToolsContent') {
                console.log('[AdminDashboard] Ensuring admin tools section is visible');
                // Clear any forced hiding styles when showing admin tools
                adminToolsSection.style.cssText = `
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    height: auto !important;
                    overflow: visible !important;
                    position: relative !important;
                    left: auto !important;
                `;
            }
            
            // Hide any other containers that might be bleeding through
            const potentialContainers = [
                'admin-tools-container',
                'voucher-management-container', 
                'food-cost-app',
                'reward-management-app'
            ];
            
            potentialContainers.forEach(containerId => {
                const container = document.getElementById(containerId);
                
                // Fixed logic: check for proper section matching
                let shouldHide = true;
                if (containerId === 'admin-tools-container' && sectionId === 'adminToolsContent') {
                    shouldHide = false;
                } else if (containerId === 'voucher-management-container' && sectionId === 'voucherManagementContent') {
                    shouldHide = false;
                } else if (containerId === 'food-cost-app' && sectionId === 'foodCostContent') {
                    shouldHide = false;
                } else if (containerId === 'reward-management-app' && sectionId === 'rewardManagementContent') {
                    shouldHide = false;
                }
                
                if (container && shouldHide) {
                    console.log(`[AdminDashboard] Forcefully hiding container: ${containerId}`);
                    container.style.display = 'none !important';
                    container.style.visibility = 'hidden !important';
                    container.style.opacity = '0 !important';
                } else if (container && !shouldHide) {
                    console.log(`[AdminDashboard] Keeping container visible: ${containerId} for section: ${sectionId}`);
                }
            });
            
            // Remove CSS injection approach and use direct DOM manipulation instead
            // First remove any existing admin tools hiding CSS
            document.querySelectorAll('style[id^="hide-admin-tools-"]').forEach(style => style.remove());
            
            // Direct DOM manipulation for admin tools hiding (more reliable than CSS injection)
            if (sectionId !== 'adminToolsContent') {
                const adminElements = [
                    document.getElementById('adminToolsContent'),
                    document.getElementById('admin-tools-container')
                ];
                
                adminElements.forEach(element => {
                    if (element) {
                        element.style.cssText = `
                            display: none !important;
                            visibility: hidden !important;
                            opacity: 0 !important;
                            height: 0 !important;
                            position: absolute !important;
                            left: -9999px !important;
                            top: -9999px !important;
                            z-index: -999 !important;
                        `;
                        console.log('[AdminDashboard] Applied direct hiding to:', element.id);
                    }
                });
            } else {
                console.log('[AdminDashboard] Skipping admin tools hiding - showing adminToolsContent');
            }
            
            // Remove active class from all nav items
            document.querySelectorAll('.dashboard-nav-link').forEach(link => {
                link.classList.remove('active');
            });
            
            // Show the selected section reliably by ID using both class and style
            const contentElement = document.getElementById(sectionId);
            if (contentElement) {
                console.log(`[AdminDashboard] Showing section ${sectionId}...`);
                
                // Debug: Check current state
                console.log(`[AdminDashboard] BEFORE changes - ${sectionId}:`, {
                    display: window.getComputedStyle(contentElement).display,
                    visibility: window.getComputedStyle(contentElement).visibility,
                    opacity: window.getComputedStyle(contentElement).opacity,
                    classList: Array.from(contentElement.classList),
                    hasChildren: contentElement.children.length
                });
                
                contentElement.classList.remove('d-none');
                
                // Apply stronger visibility styles with !important via inline style
                contentElement.style.cssText = `
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    position: relative !important;
                    z-index: 10 !important;
                    width: 100% !important;
                    height: auto !important;
                    min-height: 200px !important;
                `;
                
                // Debug: Check after changes
                setTimeout(() => {
                    console.log(`[AdminDashboard] AFTER changes - ${sectionId}:`, {
                        display: window.getComputedStyle(contentElement).display,
                        visibility: window.getComputedStyle(contentElement).visibility,
                        opacity: window.getComputedStyle(contentElement).opacity,
                        zIndex: window.getComputedStyle(contentElement).zIndex,
                        width: window.getComputedStyle(contentElement).width,
                        height: window.getComputedStyle(contentElement).height
                    });
                }, 50);
                
                // Special handling for tier management section which might need Vue to render properly
                if (sectionId === 'tierManagementContent') {
                    console.log('[AdminDashboard] Special handling for tierManagementContent');
                    setTimeout(() => {
                        // Double-check visibility after a short delay
                        contentElement.setAttribute('style', 'display: block !important; visibility: visible !important; opacity: 1 !important;');
                        console.log('[AdminDashboard] Applied forced visibility to tierManagementContent');
                    }, 200);
                }
                
                // Special handling for rewards management section which might need Vue to render properly
                if (sectionId === 'rewardManagementContent') {
                    console.log('[AdminDashboard] Special handling for rewardManagementContent');
                    setTimeout(() => {
                        // Double-check visibility after a short delay
                        contentElement.setAttribute('style', 'display: block !important; visibility: visible !important; opacity: 1 !important;');
                        console.log('[AdminDashboard] Applied forced visibility to rewardManagementContent');
                        
                        // Also ensure the Vue app container is visible
                        const vueContainer = document.getElementById('reward-management-app');
                        if (vueContainer) {
                            vueContainer.style.display = 'block';
                            vueContainer.style.visibility = 'visible';
                            vueContainer.style.opacity = '1';
                            console.log('[AdminDashboard] Applied forced visibility to Vue container');
                        }
                    }, 200);
                }
                
                // Special handling for food cost section with feature guard
                if (sectionId === 'foodCostContent') {
                    console.log('[AdminDashboard] Special handling for foodCostContent with feature guard');
                    // Initialize food cost module with feature access control
                    if (typeof window.initializeFoodCostWithGuard === 'function') {
                        setTimeout(async () => {
                            console.log('[AdminDashboard] Initializing food cost module with feature guard...');
                            await window.initializeFoodCostWithGuard();
                        }, 100);
                    } else {
                        console.warn('[AdminDashboard] initializeFoodCostWithGuard function not found');
                    }
                }
                
                // Special handling for reward types to ensure visibility
                if (sectionId === 'rewardTypesContent') {
                    console.log('[AdminDashboard] Special handling for rewardTypesContent');
                    setTimeout(() => {
                        // Triple-check visibility with aggressive styles
                        contentElement.style.cssText = `
                            display: block !important;
                            visibility: visible !important;
                            opacity: 1 !important;
                            position: relative !important;
                            z-index: 999 !important;
                            width: 100% !important;
                            height: auto !important;
                            min-height: 500px !important;
                            background-color: #f8f9fa !important;
                            border: 3px solid #28a745 !important;
                            padding: 20px !important;
                        `;
                        console.log('[AdminDashboard] Applied ULTRA AGGRESSIVE visibility to rewardTypesContent');
                        
                        // Also ensure the Vue app container is visible
                        const vueContainer = document.getElementById('reward-types-app');
                        if (vueContainer) {
                            vueContainer.style.cssText = `
                                display: block !important;
                                visibility: visible !important;
                                opacity: 1 !important;
                                position: relative !important;
                                z-index: 1000 !important;
                                width: 100% !important;
                                height: auto !important;
                                min-height: 300px !important;
                                background-color: #ffffff !important;
                                border: 2px solid #007bff !important;
                                padding: 15px !important;
                            `;
                            console.log('[AdminDashboard] Applied ULTRA AGGRESSIVE visibility to Vue container');
                            
                            // Debug Vue container
                            setTimeout(() => {
                                console.log('[AdminDashboard] Vue container final state:', {
                                    display: window.getComputedStyle(vueContainer).display,
                                    visibility: window.getComputedStyle(vueContainer).visibility,
                                    opacity: window.getComputedStyle(vueContainer).opacity,
                                    innerHTML: vueContainer.innerHTML.length + ' characters',
                                    firstChild: vueContainer.firstElementChild?.tagName || 'none'
                                });
                            }, 100);
                        } else {
                            console.error('[AdminDashboard] Vue container #reward-types-app NOT FOUND!');
                        }
                    }, 100);
                }
                
                // Special handling for settings section to ensure Admin Activity Monitor is visible
                if (sectionId === 'settingsContent') {
                    console.log('[AdminDashboard] Special handling for settingsContent - ensuring Admin Activity Monitor visibility');
                    setTimeout(() => {
                        // Find and force visibility of Admin Activity Monitor content
                        const adminActivityCards = document.querySelectorAll('#settingsContent .card');
                        adminActivityCards.forEach((card, index) => {
                            const header = card.querySelector('.card-header');
                            if (header && header.textContent.includes('Admin Activity Monitor')) {
                                console.log('[AdminDashboard] Found Admin Activity Monitor card at index:', index);
                                
                                // Force visibility of the entire card
                                card.style.cssText = `
                                    display: block !important;
                                    visibility: visible !important;
                                    opacity: 1 !important;
                                    position: relative !important;
                                    z-index: 1000 !important;
                                    width: 100% !important;
                                    height: auto !important;
                                    min-height: 400px !important;
                                    margin-bottom: 20px !important;
                                `;
                                
                                // Force visibility of card body and all children
                                const cardBody = card.querySelector('.card-body');
                                if (cardBody) {
                                    cardBody.style.cssText = `
                                        display: block !important;
                                        visibility: visible !important;
                                        opacity: 1 !important;
                                        position: relative !important;
                                        z-index: 1001 !important;
                                        width: 100% !important;
                                        height: auto !important;
                                        min-height: 300px !important;
                                        padding: 15px !important;
                                    `;
                                    
                                    // Force visibility of all child elements
                                    const allChildren = cardBody.querySelectorAll('*');
                                    allChildren.forEach(child => {
                                        if (child.style.display === 'none' || child.classList.contains('d-none')) {
                                            child.style.display = 'block';
                                            child.classList.remove('d-none');
                                        }
                                        child.style.visibility = 'visible';
                                        child.style.opacity = '1';
                                    });
                                    
                                    console.log('[AdminDashboard] Forced visibility of Admin Activity Monitor card and all children');
                                    console.log('[AdminDashboard] Card body HTML length:', cardBody.innerHTML.length);
                                } else {
                                    console.error('[AdminDashboard] Admin Activity Monitor card body not found!');
                                }
                            }
                        });
                        
                        // Also ensure settings content container itself is fully visible
                        const settingsContainer = document.getElementById('settingsContent');
                        if (settingsContainer) {
                            settingsContainer.style.cssText = `
                                display: block !important;
                                visibility: visible !important;
                                opacity: 1 !important;
                                position: relative !important;
                                z-index: 999 !important;
                                width: 100% !important;
                                height: auto !important;
                                min-height: 200px !important;
                            `;
                            console.log('[AdminDashboard] Forced settings container visibility');
                        }
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
                case 'rewardManagementContent':
                    if (!this.sectionInitialized.rewardManagementContent) {
                        console.log('Initializing reward management section...');
                        await initializeRewardManagement();
                        this.sectionInitialized.rewardManagementContent = true;
                    }
                    break;
                case 'guestManagementContent':
                    await initializeGuestManagement();
                    break;
                case 'queueManagementContent':
                    // Always reinitialize queue management to ensure Vue app is properly mounted
                    await initializeQueueManagement();
                    this.sectionInitialized.queueManagementContent = true;
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
                case 'adminActivityMonitorContent':
                    if (!this.sectionInitialized.adminActivityMonitorContent) {
                        await this.initializeAdminActivityMonitorSection();
                        this.sectionInitialized.adminActivityMonitorContent = true;
                    }
                    break;
                case 'usersLocationsContent':
                    console.log('[AdminDashboard] Initializing users & locations management...');
                    // Always re-initialize to ensure fresh data
                    initializeUsersLocationsManagement('usersLocationsContent');
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
                    console.log('[AdminDashboard] Initializing user subscription management section...');
                    // Always re-initialize to ensure fresh data and proper Vue 3 setup
                    if (typeof cleanupEnhancedUserSubscriptionManager === 'function') {
                        cleanupEnhancedUserSubscriptionManager();
                    }
                    initializeEnhancedUserSubscriptionManager(sectionId); 
                    break;
                case 'rewardTypesContent':
                    console.log('[AdminDashboard] 🎯 REWARD TYPES CASE TRIGGERED');
                    console.log('[AdminDashboard] Current initialization state:', this.sectionInitialized.rewardTypesContent);
                    
                    // Always initialize reward types to ensure it's properly loaded
                    // The module has its own cleanup mechanism
                    console.log('[AdminDashboard] Initializing reward types section...');
                    
                    // Ensure Vue.js and SweetAlert2 are loaded
                    if (typeof Vue === 'undefined') {
                        console.error('Vue.js not loaded - cannot initialize reward types');
                        const container = document.getElementById('reward-types-app');
                        if (container) {
                            container.innerHTML = '<div class="alert alert-danger">Vue.js is required for reward types management. Please ensure Vue.js is loaded.</div>';
                        }
                        break;
                    }
                    
                    if (typeof Swal === 'undefined') {
                        console.error('SweetAlert2 not loaded - cannot initialize reward types');
                        const container = document.getElementById('reward-types-app');
                        if (container) {
                            container.innerHTML = '<div class="alert alert-danger">SweetAlert2 is required for reward types management. Please ensure SweetAlert2 is loaded.</div>';
                        }
                        break;
                    }
                    
                    try {
                        console.log('[AdminDashboard] 🎯 Calling initializeRewardTypes()...');
                        await initializeRewardTypes();
                        this.sectionInitialized.rewardTypesContent = true;
                        console.log('[AdminDashboard] 🎯 Reward types section initialized successfully');
                        
                        // Apply visibility fix to ensure the section is visible
                        const rewardTypesSection = document.getElementById('rewardTypesContent');
                        const rewardTypesApp = document.getElementById('reward-types-app');
                        
                        if (rewardTypesSection) {
                            rewardTypesSection.style.cssText = `
                                display: block !important;
                                visibility: visible !important;
                                opacity: 1 !important;
                                position: relative !important;
                                z-index: 999 !important;
                                width: 100% !important;
                                height: auto !important;
                                min-height: 500px !important;
                                background-color: #f8f9fa !important;
                                border: 3px solid #28a745 !important;
                                padding: 20px !important;
                            `;
                            console.log('[AdminDashboard] 🎯 Applied visibility fix to rewardTypesContent');
                        }
                        
                        if (rewardTypesApp) {
                            rewardTypesApp.style.cssText = `
                                display: block !important;
                                visibility: visible !important;
                                opacity: 1 !important;
                                position: relative !important;
                                z-index: 1000 !important;
                                width: 100% !important;
                                height: auto !important;
                                min-height: 300px !important;
                                background-color: #ffffff !important;
                                border: 2px solid #007bff !important;
                                padding: 15px !important;
                            `;
                            console.log('[AdminDashboard] 🎯 Applied visibility fix to reward-types-app');
                        }
                        
                    } catch (error) {
                        console.error('[AdminDashboard] Error initializing reward types:', error);
                        const container = document.getElementById('reward-types-app');
                        if (container) {
                            container.innerHTML = `<div class="alert alert-danger">Failed to initialize reward types: ${error.message}</div>`;
                        }
                    }
                    break;
                case 'adminToolsContent':
                    if (!this.sectionInitialized.adminToolsContent) {
                        console.log('[AdminDashboard] Initializing admin tools section...');
                        await this.initializeAdminToolsSection();
                        this.sectionInitialized.adminToolsContent = true;
                    }
                    break;
                case 'voucherManagementContent':
                    if (!this.sectionInitialized.voucherManagementContent) {
                        console.log('[AdminDashboard] Initializing voucher management section...');
                        if (window.initializeVoucherManagementSection) {
                            await window.initializeVoucherManagementSection();
                            this.sectionInitialized.voucherManagementContent = true;
                        } else {
                            console.warn('[AdminDashboard] Voucher management initialization function not available');
                        }
                    }
                    break;
                case 'whatsappManagementContent':
                    if (!this.sectionInitialized.whatsappManagementContent) {
                        console.log('[AdminDashboard] Initializing WhatsApp management section...');
                        await this.initializeWhatsAppManagementSection();
                        this.sectionInitialized.whatsappManagementContent = true;
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
                            const moduleInstance = await window.FoodCost.initializeFoodCostModule('Food-CostApp');
                            
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
    
    /**
     * Comprehensive Module Debug Tool
     * Diagnoses any display issues with modules in the admin dashboard
     * Usage: window.debugModule('sectionId') or window.debugModule() for current active
     */
    static debugModule(sectionId = null) {
        const targetSection = sectionId || window.adminDashboard?.activeSection;
        
        if (!targetSection) {
            console.error('🔧 DEBUG: No section specified and no active section found');
            return;
        }
        
        console.log(`🔧 ========== MODULE DEBUG REPORT: ${targetSection} ==========`);
        
        // 1. DOM STRUCTURE ANALYSIS
        console.log('🔧 1. DOM STRUCTURE ANALYSIS:');
        const sectionElement = document.getElementById(targetSection);
        
        if (!sectionElement) {
            console.error(`🔧 ❌ CRITICAL: Section element #${targetSection} NOT FOUND in DOM`);
            console.log('🔧 Available sections:', Array.from(document.querySelectorAll('[id$="Content"]')).map(el => el.id));
            return;
        }
        
        console.log('🔧 ✅ Section element exists:', sectionElement);
        console.log('🔧 Element classes:', Array.from(sectionElement.classList));
        console.log('🔧 Element innerHTML length:', sectionElement.innerHTML.length, 'characters');
        console.log('🔧 Child elements count:', sectionElement.children.length);
        
        // 2. CSS VISIBILITY ANALYSIS
        console.log('🔧 2. CSS VISIBILITY ANALYSIS:');
        const computedStyle = window.getComputedStyle(sectionElement);
        const visibilityData = {
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: computedStyle.opacity,
            position: computedStyle.position,
            zIndex: computedStyle.zIndex,
            width: computedStyle.width,
            height: computedStyle.height,
            top: computedStyle.top,
            left: computedStyle.left,
            transform: computedStyle.transform,
            overflow: computedStyle.overflow
        };
        
        console.log('🔧 Computed styles:', visibilityData);
        
        // Analyze visibility issues
        const issues = [];
        if (computedStyle.display === 'none') issues.push('❌ display: none');
        if (computedStyle.visibility === 'hidden') issues.push('❌ visibility: hidden');
        if (computedStyle.opacity === '0') issues.push('❌ opacity: 0');
        if (computedStyle.width === '0px') issues.push('❌ width: 0');
        if (computedStyle.height === '0px') issues.push('❌ height: 0');
        if (computedStyle.position === 'absolute' && (computedStyle.left.includes('-') || computedStyle.top.includes('-'))) {
            issues.push('❌ positioned off-screen');
        }
        
        if (issues.length > 0) {
            console.error('🔧 VISIBILITY ISSUES FOUND:', issues);
        } else {
            console.log('🔧 ✅ No obvious CSS visibility issues');
        }
        
        // 3. PARENT HIERARCHY ANALYSIS
        console.log('🔧 3. PARENT HIERARCHY ANALYSIS:');
        let parent = sectionElement.parentElement;
        let level = 1;
        
        while (parent && level <= 5) {
            const parentStyle = window.getComputedStyle(parent);
            console.log(`🔧 Parent Level ${level} (${parent.tagName}#${parent.id || 'no-id'}):`, {
                display: parentStyle.display,
                visibility: parentStyle.visibility,
                opacity: parentStyle.opacity,
                overflow: parentStyle.overflow
            });
            
            if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || parentStyle.opacity === '0') {
                console.error(`🔧 ❌ CRITICAL: Parent level ${level} is hiding content!`);
            }
            
            parent = parent.parentElement;
            level++;
        }
        
        // 4. FRAMEWORK DETECTION
        console.log('🔧 4. FRAMEWORK DETECTION:');
        const frameworkData = {
            hasVueApp: sectionElement.hasAttribute('data-v-app') || sectionElement.querySelector('[data-v-app]'),
            hasReactRoot: sectionElement.querySelector('[data-reactroot]'),
            hasBootstrapClasses: sectionElement.className.includes('bootstrap') || sectionElement.querySelector('[class*="btn"], [class*="card"], [class*="col-"]'),
            hasCustomScripts: Array.from(document.scripts).filter(s => s.src.includes(targetSection.replace('Content', ''))).length
        };
        
        console.log('🔧 Framework detection:', frameworkData);
        
        // Vue-specific debugging
        if (frameworkData.hasVueApp) {
            console.log('🔧 VUE.JS ANALYSIS:');
            const vueContainers = sectionElement.querySelectorAll('[data-v-app]');
            vueContainers.forEach((container, index) => {
                console.log(`🔧 Vue container ${index + 1}:`, {
                    element: container,
                    innerHTML: container.innerHTML.length + ' characters',
                    hasContent: container.innerHTML.trim().length > 0,
                    firstChild: container.firstElementChild?.tagName || 'none'
                });
            });
        }
        
        // 5. SECTION REGISTRATION ANALYSIS
        console.log('🔧 5. SECTION REGISTRATION ANALYSIS:');
        const dashboard = window.adminDashboard;
        if (dashboard) {
            const sectionInfo = dashboard.sections.get(targetSection);
            const isInitialized = dashboard.sectionInitialized[targetSection];
            
            console.log('🔧 Section registration:', {
                isRegistered: !!sectionInfo,
                sectionInfo: sectionInfo,
                isInitialized: isInitialized,
                hasInitFunction: sectionInfo?.init ? 'yes' : 'no',
                hasCleanupFunction: sectionInfo?.cleanup ? 'yes' : 'no'
            });
            
            if (!sectionInfo) {
                console.error('🔧 ❌ CRITICAL: Section not registered in dashboard.sections!');
                console.log('🔧 Available sections:', Array.from(dashboard.sections.keys()));
            }
        }
        
        // 6. CONTENT ANALYSIS
        console.log('🔧 6. CONTENT ANALYSIS:');
        const contentData = {
            totalHTML: sectionElement.innerHTML.length,
            visibleText: sectionElement.textContent.trim().length,
            images: sectionElement.querySelectorAll('img').length,
            buttons: sectionElement.querySelectorAll('button').length,
            forms: sectionElement.querySelectorAll('form').length,
            scripts: sectionElement.querySelectorAll('script').length,
            loadingSpinners: sectionElement.querySelectorAll('.spinner-border, .loading').length
        };
        
        console.log('🔧 Content statistics:', contentData);
        
        if (contentData.totalHTML === 0) {
            console.error('🔧 ❌ CRITICAL: Section has NO HTML content!');
        } else if (contentData.visibleText === 0) {
            console.warn('🔧 ⚠️ WARNING: Section has HTML but no visible text');
        }
        
        // 7. NAVIGATION STATE
        console.log('🔧 7. NAVIGATION STATE:');
        const navItem = document.querySelector(`[data-section="${targetSection}"]`);
        console.log('🔧 Navigation item:', {
            exists: !!navItem,
            isActive: navItem?.classList.contains('active'),
            element: navItem
        });
        
        // 8. SUGGESTIONS
        console.log('🔧 8. DIAGNOSTIC SUGGESTIONS:');
        const suggestions = [];
        
        if (issues.length > 0) {
            suggestions.push('🔧 Fix CSS visibility issues listed above');
        }
        
        if (contentData.totalHTML === 0) {
            suggestions.push('🔧 Check module initialization - content may not be loading');
        }
        
        if (frameworkData.hasVueApp && contentData.visibleText === 0) {
            suggestions.push('🔧 Vue app mounted but not rendering - check Vue data and template');
        }
        
        if (!dashboard?.sectionInitialized[targetSection]) {
            suggestions.push('🔧 Section may not be properly initialized - check showSection() logic');
        }
        
        if (suggestions.length > 0) {
            console.log('🔧 RECOMMENDED ACTIONS:', suggestions);
        } else {
            console.log('🔧 ✅ No obvious issues detected - module should be visible');
        }
        
        console.log(`🔧 ========== END DEBUG REPORT: ${targetSection} ==========`);
        
        return {
            sectionId: targetSection,
            element: sectionElement,
            visibility: visibilityData,
            content: contentData,
            framework: frameworkData,
            issues: issues,
            suggestions: suggestions
        };
    }
    
    // Helper method to load all required Food Cost Module scripts in the correct order
    async loadRequiredScripts() {
        // Load dependencies in the proper order for modules
        const scripts = [
            // Load the Firebase config first to ensure it's available for all modules
            { src: '/js/config/firebase-config.js', type: 'module' },
            { src: '/js/modules/food-cost/utilities.js?v=2.1.4-20250605', type: 'module' },
            { src: '/js/modules/food-cost/firebase-helpers.js?v=2.1.4-20250605', type: 'module' },
            { src: '/js/modules/food-cost/database-operations.js?v=2.1.4-20250605', type: 'module' },
            { src: '/js/modules/food-cost/data-processor.js?v=2.1.4-20250605', type: 'module' },
            { src: '/js/modules/food-cost/chart-manager.js?v=2.1.4-20250605', type: 'module' },
            { src: '/js/modules/food-cost/services/data-service.js?v=2.1.4-20250605', type: 'module' },
            { src: '/js/modules/food-cost/services/location-service.js?v=2.1.4-20250605', type: 'module' },
            { src: '/js/modules/food-cost/refactored-app-component.js?v=2.1.4-20250605', type: 'module' },
            { src: '/js/modules/food-cost/index.js?v=2.1.4-20250605', type: 'module' }
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
            console.log('[AdminDashboard] Initializing admin users section using AdminUserManagement class');
            
            // FIXED: Use the centralized AdminUserManagement class instead of duplicate implementation
            // This prevents race conditions and ensures phone number preservation
            await AdminUserManagement.initialize('adminUsersContent');
            
            console.log('[AdminDashboard] Admin users section initialized successfully');
            
        } catch (error) {
            console.error('[AdminDashboard] Error initializing admin users section:', error);
            
            // Show error in the admin users container
            const container = document.getElementById('adminUsersContent');
            if (container) {
                container.innerHTML = `
                    <div class="alert alert-danger">
                        <h4><i class="fas fa-exclamation-triangle me-2"></i> Error</h4>
                        <p>Failed to initialize admin user management. Please try again.</p>
                        <p class="text-muted small">Error details: ${error.message}</p>
                    </div>
                `;
            }
        }
    }

    async initializeAdminActivityMonitorSection() {
        try {
            console.log('[AdminDashboard] Initializing Admin Activity Monitor section');
            
            // Ensure the Admin Activity Monitor is initialized and ready
            if (typeof window.AdminActivityMonitor !== 'undefined') {
                console.log('[AdminDashboard] Admin Activity Monitor utility is available');
                
                // Initialize the monitoring system
                window.AdminActivityMonitor.initialize();
                
                // Update the display with current data
                window.AdminActivityMonitor.updateActiveAdmins();
                window.AdminActivityMonitor.updatePhoneNumberStatus();
                window.AdminActivityMonitor.updateStatistics();
                
                console.log('[AdminDashboard] Admin Activity Monitor section initialized successfully');
            } else {
                console.warn('[AdminDashboard] Admin Activity Monitor utility not found - it will be loaded with the page');
            }
            
        } catch (error) {
            console.error('[AdminDashboard] Error initializing Admin Activity Monitor section:', error);
            
            // Show error in the container
            const container = document.getElementById('adminActivityMonitorContent');
            if (container) {
                container.innerHTML = `
                    <div class="alert alert-danger">
                        <h4><i class="fas fa-exclamation-triangle me-2"></i> Error</h4>
                        <p>Failed to initialize Admin Activity Monitor. Please try refreshing the page.</p>
                        <p class="text-muted small">Error details: ${error.message}</p>
                    </div>
                `;
            }
        }
    }

    async initializeAdminToolsSection() {
        console.log('Initializing admin tools section');
        const adminToolsElement = document.getElementById('admin-tools-container');
        if (!adminToolsElement) {
            console.error('Admin tools container not found');
            return;
        }
        
        try {
            // Load the admin tools content dynamically
            console.log('Fetching admin tools content from: admin_tools/index.html');
            const response = await fetch('admin_tools/index.html');
            
            if (!response.ok) {
                throw new Error(`Failed to fetch admin tools: ${response.status} ${response.statusText}`);
            }
            
            console.log('Admin tools content fetched successfully');
            const htmlContent = await response.text();
            
            // Create a temporary DOM to parse the content
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            
            // Extract the main content (everything inside the container)
            const mainContent = tempDiv.querySelector('.container');
            if (mainContent) {
                // Remove the back button since we're inside the dashboard
                const backButton = mainContent.querySelector('.back-button');
                if (backButton) {
                    backButton.remove();
                }
                
                // Update relative paths for admin_tools resources
                const links = mainContent.querySelectorAll('a[href^="test-"], a[href^="check-"], a[href^="generate-"], a[href^="verify-"], a[href^="fix-"], a[href^="setup-"], a[href^="admin-"], a[href^="temp-"], a[href^="allocate-"], a[href^="ocean_"], a[href^="food-"]');
                links.forEach(link => {
                    const currentHref = link.getAttribute('href');
                    if (!currentHref.startsWith('http') && !currentHref.startsWith('../')) {
                        link.setAttribute('href', 'admin_tools/' + currentHref);
                        // Make links open in new tab since they are individual tools
                        link.setAttribute('target', '_blank');
                    }
                });
                
                // Update paths for food cost module tools
                const foodCostLinks = mainContent.querySelectorAll('a[href^="../js/modules/food-cost/"]');
                foodCostLinks.forEach(link => {
                    link.setAttribute('target', '_blank');
                });
                
                // Insert the content
                adminToolsElement.innerHTML = mainContent.innerHTML;
                
                // Run DOM structure validation after loading dynamic content
                console.log('🔍 Running DOM validation after admin tools loading...');
                setTimeout(() => {
                    window.validateAndFixDOMStructure();
                }, 100);
                
                // Re-initialize the search functionality
                this.initializeAdminToolsSearch();
                
            } else {
                adminToolsElement.innerHTML = '<p>Error loading admin tools content</p>';
            }
        } catch (error) {
            console.error('Error loading admin tools:', error);
            adminToolsElement.innerHTML = '<p>Error loading admin tools</p>';
        }
    }

    initializeAdminToolsSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                const searchTerm = e.target.value.toLowerCase();
                const toolCards = document.querySelectorAll('.tool-card');
                const categories = document.querySelectorAll('.category-section');
                
                toolCards.forEach(card => {
                    const title = card.querySelector('.card-title').textContent.toLowerCase();
                    const description = card.querySelector('.card-text').textContent.toLowerCase();
                    const isVisible = title.includes(searchTerm) || description.includes(searchTerm);
                    
                    card.closest('.col-md-6, .col-lg-4').style.display = isVisible ? 'block' : 'none';
                });
                
                // Hide categories with no visible tools
                categories.forEach(category => {
                    const hasVisibleTools = Array.from(category.querySelectorAll('.col-md-6, .col-lg-4')).some(col => col.style.display !== 'none');
                    category.style.display = hasVisibleTools ? 'block' : 'none';
                });
            });
        }
        
        // Initialize clear search function
        window.clearSearch = function() {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = '';
                document.querySelectorAll('.tool-card').forEach(card => {
                    card.closest('.col-md-6, .col-lg-4').style.display = 'block';
                });
                document.querySelectorAll('.category-section').forEach(category => {
                    category.style.display = 'block';
                });
            }
        };
    }

    /**
     * Initialize the WhatsApp Management section
     */
    async initializeWhatsAppManagementSection() {
        console.log('🚀 [WhatsApp] Initializing WhatsApp Management section');
        
        try {
            // Check if the content area exists
            const container = document.getElementById('whatsappManagementContent');
            if (!container) {
                throw new Error('WhatsApp management content container not found');
            }
            
            console.log('🚀 [WhatsApp] Container found, creating WhatsApp manager...');
            
            // Initialize WhatsApp manager
            if (!window.whatsappManager) {
                console.log('🚀 [WhatsApp] Creating new WhatsAppManager instance...');
                window.whatsappManager = new WhatsAppManager();
            } else {
                console.log('🚀 [WhatsApp] Using existing WhatsAppManager instance');
            }
            
            // Load WhatsApp data and populate the dashboard
            console.log('🚀 [WhatsApp] Loading WhatsApp data...');
            await window.whatsappManager.loadData();
            
            console.log('✅ [WhatsApp] WhatsApp Management section initialized successfully');
            
            // Debug visibility after successful initialization
            console.log('🔍 [WhatsApp] Checking visibility after initialization...');
            const whatsappContainer = document.getElementById('whatsappManagementContent');
            if (whatsappContainer) {
                const computedStyle = window.getComputedStyle(whatsappContainer);
                const debugInfo = {
                    display: computedStyle.display,
                    visibility: computedStyle.visibility,
                    opacity: computedStyle.opacity,
                    height: computedStyle.height,
                    width: computedStyle.width,
                    hasClass_dNone: whatsappContainer.classList.contains('d-none'),
                    classList: Array.from(whatsappContainer.classList),
                    innerHTML_length: whatsappContainer.innerHTML.length,
                    offsetHeight: whatsappContainer.offsetHeight,
                    offsetWidth: whatsappContainer.offsetWidth
                };
                console.log('🔍 [WhatsApp] Container visibility debug:');
                console.log('  - display:', debugInfo.display);
                console.log('  - visibility:', debugInfo.visibility);
                console.log('  - opacity:', debugInfo.opacity);
                console.log('  - height:', debugInfo.height);
                console.log('  - width:', debugInfo.width);
                console.log('  - hasClass_dNone:', debugInfo.hasClass_dNone);
                console.log('  - classList:', debugInfo.classList);
                console.log('  - innerHTML_length:', debugInfo.innerHTML_length);
                console.log('  - offsetHeight:', debugInfo.offsetHeight);
                console.log('  - offsetWidth:', debugInfo.offsetWidth);
                
                // Debug parent container hierarchy to find what's collapsing the container
                console.log('🔍 [WhatsApp] Checking parent container hierarchy...');
                let parent = whatsappContainer.parentElement;
                let level = 1;
                while (parent && level <= 5) {
                    const parentStyle = window.getComputedStyle(parent);
                    console.log(`  Parent ${level} (${parent.id || parent.className}):`, {
                        display: parentStyle.display,
                        height: parentStyle.height,
                        overflow: parentStyle.overflow,
                        position: parentStyle.position,
                        offsetHeight: parent.offsetHeight,
                        offsetWidth: parent.offsetWidth
                    });
                    parent = parent.parentElement;
                    level++;
                }
                
                // Fix DOM structure issue - move WhatsApp container out of adminToolsContent
                const parentOfWhatsApp = whatsappContainer.parentElement;
                const contentContainer = document.getElementById('content');
                const adminToolsContent = document.getElementById('adminToolsContent');
                
                if (parentOfWhatsApp && parentOfWhatsApp.id === 'adminToolsContent' && contentContainer) {
                    console.log('🚨 [WhatsApp] FIXING: whatsappManagementContent is incorrectly nested inside adminToolsContent');
                    
                    // Move WhatsApp container to be a direct child of content container
                    // Insert it right after adminToolsContent
                    contentContainer.insertBefore(whatsappContainer, adminToolsContent.nextSibling);
                    
                    console.log('✅ [WhatsApp] FIXED: whatsappManagementContent moved to correct position');
                    console.log('🔧 [WhatsApp] New parent:', whatsappContainer.parentElement?.id || 'unknown');
                }
                
                // Force minimum height and width to make it visible
                if (debugInfo.offsetHeight === 0 || debugInfo.offsetWidth === 0) {
                    console.log('🚨 [WhatsApp] Container has zero dimensions! Forcing size...');
                    whatsappContainer.style.minHeight = '600px';
                    whatsappContainer.style.height = 'auto';
                    whatsappContainer.style.width = '100%';
                    whatsappContainer.style.display = 'block';
                    whatsappContainer.style.position = 'relative';
                    whatsappContainer.style.overflow = 'visible';
                    console.log('✅ [WhatsApp] Forced container dimensions');
                }
                
                // Force visibility if hidden
                if (whatsappContainer.classList.contains('d-none') || computedStyle.display === 'none') {
                    console.log('🚨 [WhatsApp] Container is hidden! Forcing visibility...');
                    whatsappContainer.classList.remove('d-none');
                    whatsappContainer.style.display = 'block';
                    whatsappContainer.style.visibility = 'visible';
                    whatsappContainer.style.opacity = '1';
                    whatsappContainer.style.minHeight = '400px';
                    console.log('✅ [WhatsApp] Forced container visibility');
                }
            }
            
        } catch (error) {
            console.error('Error initializing WhatsApp Management section:', error);
            
            // Show error in the container
            const container = document.getElementById('whatsappManagementContent');
            if (container) {
                container.innerHTML = `
                    <div class="alert alert-danger">
                        <h4><i class="fas fa-exclamation-triangle me-2"></i> Error</h4>
                        <p>Failed to initialize WhatsApp Management. Please try refreshing the page.</p>
                        <p class="text-muted small">Error details: ${error.message}</p>
                    </div>
                `;
            }
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
window.dashboard = dashboard; // Make available globally for cleanup functions

// Export for module usage
export { dashboard };

// Initialize dashboard when DOM is ready - ONLY ONCE
document.addEventListener('DOMContentLoaded', () => {
    dashboard.initialize();
});

// Debug function - add this at the end of the file
window.debugSections = function() {
    console.log('=== SECTION DEBUG REPORT ===');
    
    const sections = document.querySelectorAll('.content-section');
    console.log(`Found ${sections.length} content sections:`);
    
    sections.forEach(section => {
        const computedStyle = window.getComputedStyle(section);
        console.log(`\n${section.id}:`, {
            classes: Array.from(section.classList),
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: computedStyle.opacity,
            zIndex: computedStyle.zIndex,
            position: computedStyle.position,
            hasContent: section.innerHTML.length > 0,
            children: section.children.length
        });
    });
    
    console.log('\n=== ACTIVE SECTION ===');
    const activeSection = window.adminDashboard?.activeSection;
    console.log('Active section:', activeSection);
    
    if (activeSection) {
        const activeEl = document.getElementById(activeSection);
        if (activeEl) {
            console.log('Active element state:', {
                display: window.getComputedStyle(activeEl).display,
                visibility: window.getComputedStyle(activeEl).visibility,
                opacity: window.getComputedStyle(activeEl).opacity,
                classList: Array.from(activeEl.classList)
            });
        }
    }
    
    console.log('\n=== QUICK FIXES ===');
    console.log('To force show a section: window.forceShowSection("sectionId")');
    console.log('To hide all sections: window.hideAllSections()');
    console.log('=== END DEBUG REPORT ===');
};

// Quick fix functions
window.forceShowSection = function(sectionId) {
    console.log('Force showing section:', sectionId);
    
    // Hide all sections first
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('d-none');
        section.style.display = 'none';
    });
    
    // Show the target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.remove('d-none');
        targetSection.style.cssText = `
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: relative !important;
            z-index: 10 !important;
        `;
        
        console.log('Section should now be visible:', sectionId);
        
        // Update navigation
        document.querySelectorAll('.dashboard-nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        const navLink = document.querySelector(`[data-section="${sectionId}"]`);
        if (navLink) {
            navLink.classList.add('active');
        }
    } else {
        console.error('Section not found:', sectionId);
    }
};

window.hideAllSections = function() {
    console.log('Hiding all sections');
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('d-none');
        section.style.display = 'none';
    });
};

/**
 * WhatsApp Manager Class
 * Handles WhatsApp management dashboard functionality
 */
class WhatsAppManager {
    constructor() {
        this.whatsappNumbers = new Map();
        this.locations = new Map();
        this.recentActivity = [];
        this.stats = {
            totalNumbers: 0,
            activeLocations: 0,
            messagesVolume: 0,
            systemHealth: 'Active'
        };
    }

    /**
     * Load WhatsApp data from Firebase
     */
    async loadData() {
        console.log('Loading WhatsApp data...');
        
        try {
            // Load from Firebase (placeholder for now)
            await this.loadWhatsAppNumbers();
            await this.loadLocationMappings();
            await this.loadRecentActivity();
            await this.loadStats();
            
            // Update UI
            this.updateOverviewStats();
            this.updateLocationMappingTable();
            this.updateRecentActivityFeed();
            this.updateMigrationStatus();
            
        } catch (error) {
            console.error('Error loading WhatsApp data:', error);
            throw error;
        }
    }

    /**
     * Load WhatsApp numbers from Firebase
     */
    async loadWhatsAppNumbers() {
        try {
            console.log('🔄 [WhatsApp] Loading WhatsApp numbers from Firebase...');
            
            // Clear existing data
            this.whatsappNumbers.clear();
            
            // Import Firebase functions
            const { rtdb, ref, get } = await import('../config/firebase-config.js');
            
            // Get reference to whatsapp-numbers collection
            const numbersRef = ref(rtdb, 'whatsapp-numbers');
            const snapshot = await get(numbersRef);
            
            if (snapshot.exists()) {
                const numbersData = snapshot.val();
                console.log('🔄 [WhatsApp] Raw numbers data:', numbersData);
                
                // Process each WhatsApp number
                Object.entries(numbersData).forEach(([numberId, numberData]) => {
                    if (numberData && numberData.phoneNumber) {
                        this.whatsappNumbers.set(numberData.phoneNumber, {
                            id: numberId,
                            number: numberData.phoneNumber,
                            displayName: numberData.displayName || 'Unknown',
                            userId: numberData.userId || '',
                            status: numberData.status || 'inactive',
                            createdAt: numberData.createdAt || new Date().toISOString(),
                            messagesCount: 0 // Will be calculated from message history
                        });
                    }
                });
                
                console.log('✅ [WhatsApp] Loaded', this.whatsappNumbers.size, 'WhatsApp numbers');
            } else {
                console.log('ℹ️ [WhatsApp] No WhatsApp numbers found in Firebase');
            }
        } catch (error) {
            console.error('❌ [WhatsApp] Error loading WhatsApp numbers:', error);
            throw error;
        }
    }

    /**
     * Load location mappings
     */
    async loadLocationMappings() {
        try {
            console.log('🔄 [WhatsApp] Loading location mappings from Firebase...');
            
            // Clear existing data
            this.locations.clear();
            
            // Import Firebase functions
            const { rtdb, ref, get } = await import('../config/firebase-config.js');
            
            // Load location mappings
            const mappingsRef = ref(rtdb, 'location-whatsapp-mapping');
            const mappingsSnapshot = await get(mappingsRef);
            
            // Load locations data
            const locationsRef = ref(rtdb, 'locations');
            const locationsSnapshot = await get(locationsRef);
            
            const mappingsData = mappingsSnapshot.exists() ? mappingsSnapshot.val() : {};
            const locationsData = locationsSnapshot.exists() ? locationsSnapshot.val() : {};
            
            console.log('🔄 [WhatsApp] Raw mappings data:', mappingsData);
            console.log('🔄 [WhatsApp] Raw locations data:', locationsData);
            
            // Process location mappings
            Object.entries(mappingsData).forEach(([mappingId, mapping]) => {
                if (mapping && mapping.locationId) {
                    const locationData = locationsData[mapping.locationId];
                    const locationName = locationData ? locationData.name : mapping.locationId;
                    
                    this.locations.set(locationName, {
                        id: mapping.locationId,
                        name: locationName,
                        whatsappNumber: mapping.phoneNumber || 'Not assigned',
                        whatsappNumberId: mapping.whatsappNumberId || '',
                        status: mapping.status || 'inactive',
                        assignedAt: mapping.assignedAt || new Date().toISOString(),
                        messagesCount: 0 // Will be calculated from message history
                    });
                }
            });
            
            // Add locations that don't have WhatsApp mappings
            Object.entries(locationsData).forEach(([locationId, locationData]) => {
                if (locationData && locationData.name) {
                    const locationName = locationData.name;
                    if (!this.locations.has(locationName)) {
                        this.locations.set(locationName, {
                            id: locationId,
                            name: locationName,
                            whatsappNumber: 'Not assigned',
                            whatsappNumberId: '',
                            status: 'inactive',
                            assignedAt: null,
                            messagesCount: 0
                        });
                    }
                }
            });
            
            console.log('✅ [WhatsApp] Loaded', this.locations.size, 'location mappings');
        } catch (error) {
            console.error('❌ [WhatsApp] Error loading location mappings:', error);
            throw error;
        }
    }

    /**
     * Load recent activity and message volume statistics
     */
    async loadRecentActivity() {
        try {
            console.log('🔄 [WhatsApp] Loading recent activity and message volumes...');
            
            // Clear existing data
            this.recentActivity = [];
            
            // Import Firebase functions
            const { rtdb, ref, get, query, orderByChild, limitToLast } = await import('../config/firebase-config.js');
            
            // Get today's date range
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const endOfDay = startOfDay + (24 * 60 * 60 * 1000) - 1;
            
            // Load message history for today
            const messageHistoryRef = ref(rtdb, 'whatsapp-message-history');
            const recentMessagesQuery = query(messageHistoryRef, orderByChild('timestamp'), limitToLast(50));
            const messagesSnapshot = await get(recentMessagesQuery);
            
            let todayMessageCount = 0;
            const locationMessageCounts = new Map();
            
            if (messagesSnapshot.exists()) {
                const messagesData = messagesSnapshot.val();
                
                Object.entries(messagesData).forEach(([messageId, messageData]) => {
                    if (messageData && messageData.timestamp) {
                        const messageTime = new Date(messageData.timestamp).getTime();
                        
                        // Count today's messages
                        if (messageTime >= startOfDay && messageTime <= endOfDay) {
                            todayMessageCount++;
                            
                            // Count by location
                            const locationId = messageData.locationId || 'unknown';
                            locationMessageCounts.set(locationId, (locationMessageCounts.get(locationId) || 0) + 1);
                        }
                        
                        // Add to recent activity (last 20 messages)
                        if (this.recentActivity.length < 20) {
                            const timeAgo = this.getTimeAgo(new Date(messageData.timestamp));
                            const messageType = messageData.messageType || 'message';
                            
                            this.recentActivity.push({
                                type: messageType,
                                icon: this.getMessageIcon(messageType),
                                iconClass: this.getMessageIconClass(messageType),
                                text: this.formatActivityText(messageData),
                                time: timeAgo,
                                timestamp: messageData.timestamp
                            });
                        }
                    }
                });
            }
            
            // Update location message counts
            this.locations.forEach((location, locationName) => {
                const locationId = location.id;
                location.messagesCount = locationMessageCounts.get(locationId) || 0;
            });
            
            // Update WhatsApp number message counts
            this.whatsappNumbers.forEach((number, phoneNumber) => {
                // Find location for this number and get its message count
                let messageCount = 0;
                this.locations.forEach((location) => {
                    if (location.whatsappNumber === phoneNumber) {
                        messageCount = location.messagesCount;
                    }
                });
                number.messagesCount = messageCount;
            });
            
            // Store today's message count for stats
            this.todayMessageCount = todayMessageCount;
            
            // Sort recent activity by timestamp (newest first)
            this.recentActivity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            console.log('✅ [WhatsApp] Loaded message statistics:', {
                todayMessages: todayMessageCount,
                recentActivityItems: this.recentActivity.length,
                locationCounts: Array.from(locationMessageCounts.entries())
            });
            
        } catch (error) {
            console.error('❌ [WhatsApp] Error loading recent activity:', error);
            this.recentActivity = [];
            this.todayMessageCount = 0;
        }
    }

    /**
     * Load stats
     */
    async loadStats() {
        try {
            // Calculate active locations (those with WhatsApp numbers assigned)
            const activeLocations = Array.from(this.locations.values())
                .filter(location => location.whatsappNumber && location.whatsappNumber !== 'Not assigned').length;
            
            // Calculate total messages today
            const messagesVolume = this.todayMessageCount || 0;
            
            // Determine system health based on data
            let systemHealth = 'Active';
            if (this.whatsappNumbers.size === 0) {
                systemHealth = 'Warning';
            } else if (activeLocations === 0) {
                systemHealth = 'Warning';
            }
            
            this.stats = {
                totalNumbers: this.whatsappNumbers.size,
                activeLocations: activeLocations,
                messagesVolume: messagesVolume,
                systemHealth: systemHealth
            };
            
            console.log('✅ [WhatsApp] Calculated stats:', this.stats);
        } catch (error) {
            console.error('❌ [WhatsApp] Error calculating stats:', error);
            this.stats = {
                totalNumbers: 0,
                activeLocations: 0,
                messagesVolume: 0,
                systemHealth: 'Error'
            };
        }
    }

    /**
     * Helper function to get time ago text
     */
    getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        return `${Math.floor(diffInSeconds / 86400)} days ago`;
    }

    /**
     * Helper function to get message icon based on type
     */
    getMessageIcon(messageType) {
        switch (messageType) {
            case 'receipt': return 'fas fa-receipt';
            case 'welcome': return 'fas fa-hand-wave';
            case 'voucher': return 'fas fa-ticket-alt';
            case 'menu': return 'fas fa-utensils';
            case 'booking': return 'fas fa-calendar-check';
            default: return 'fas fa-comment';
        }
    }

    /**
     * Helper function to get message icon class based on type
     */
    getMessageIconClass(messageType) {
        switch (messageType) {
            case 'receipt': return 'success';
            case 'welcome': return 'info';
            case 'voucher': return 'warning';
            case 'menu': return 'primary';
            case 'booking': return 'success';
            default: return 'secondary';
        }
    }

    /**
     * Helper function to format activity text
     */
    formatActivityText(messageData) {
        const messageType = messageData.messageType || 'message';
        const phoneNumber = messageData.phoneNumber || 'Unknown';
        const locationName = this.getLocationNameById(messageData.locationId) || 'Unknown Location';
        
        switch (messageType) {
            case 'receipt':
                return `Receipt processed for ${phoneNumber} at ${locationName}`;
            case 'welcome':
                return `Welcome message sent to ${phoneNumber} at ${locationName}`;
            case 'voucher':
                return `Voucher message sent to ${phoneNumber} at ${locationName}`;
            case 'menu':
                return `Menu request from ${phoneNumber} at ${locationName}`;
            case 'booking':
                return `Booking request from ${phoneNumber} at ${locationName}`;
            default:
                return `Message from ${phoneNumber} at ${locationName}`;
        }
    }

    /**
     * Helper function to get location name by ID
     */
    getLocationNameById(locationId) {
        if (!locationId) return null;
        
        for (const [name, location] of this.locations) {
            if (location.id === locationId) {
                return name;
            }
        }
        return locationId; // Return ID if name not found
    }

    /**
     * Update overview stats cards
     */
    updateOverviewStats() {
        console.log('🔄 [WhatsApp] Updating overview stats with:', this.stats);
        
        const totalNumbersEl = document.getElementById('totalNumbers');
        const activeLocationsEl = document.getElementById('activeLocations');
        const messagesVolumeEl = document.getElementById('messagesVolume');
        const systemHealthEl = document.getElementById('systemHealth');

        console.log('🔄 [WhatsApp] DOM elements found:', {
            totalNumbers: !!totalNumbersEl,
            activeLocations: !!activeLocationsEl,
            messagesVolume: !!messagesVolumeEl,
            systemHealth: !!systemHealthEl
        });

        if (totalNumbersEl) {
            totalNumbersEl.textContent = this.stats.totalNumbers;
            console.log('✅ [WhatsApp] Updated totalNumbers to:', this.stats.totalNumbers);
        }
        if (activeLocationsEl) {
            activeLocationsEl.textContent = this.stats.activeLocations;
            console.log('✅ [WhatsApp] Updated activeLocations to:', this.stats.activeLocations);
        }
        if (messagesVolumeEl) {
            messagesVolumeEl.textContent = this.stats.messagesVolume;
            console.log('✅ [WhatsApp] Updated messagesVolume to:', this.stats.messagesVolume);
        }
        if (systemHealthEl) {
            systemHealthEl.innerHTML = `<span class="status-indicator status-active"></span>${this.stats.systemHealth}`;
            console.log('✅ [WhatsApp] Updated systemHealth to:', this.stats.systemHealth);
        }
    }

    /**
     * Update location mapping table
     */
    updateLocationMappingTable() {
        const tableBody = document.getElementById('locationMappingTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        
        this.locations.forEach((location, name) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${location.name}</td>
                <td class="number-input">${location.whatsappNumber}</td>
                <td>
                    <span class="status-indicator status-${location.status}"></span>
                    ${location.status.charAt(0).toUpperCase() + location.status.slice(1)}
                </td>
                <td>${location.messagesCount}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="whatsappManager.editLocation('${name}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="whatsappManager.removeLocation('${name}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    /**
     * Update recent activity feed
     */
    updateRecentActivityFeed() {
        const feedContainer = document.getElementById('recentActivityFeed');
        if (!feedContainer) return;

        feedContainer.innerHTML = '';
        
        if (this.recentActivity.length === 0) {
            feedContainer.innerHTML = '<p class="text-muted text-center">No recent activity</p>';
            return;
        }

        this.recentActivity.forEach(activity => {
            const activityItem = document.createElement('div');
            activityItem.className = 'activity-item';
            activityItem.innerHTML = `
                <div class="activity-icon ${activity.iconClass}">
                    <i class="${activity.icon}"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-text">${activity.text}</div>
                    <div class="activity-time">${activity.time}</div>
                </div>
            `;
            feedContainer.appendChild(activityItem);
        });
    }

    /**
     * Update migration status
     */
    updateMigrationStatus() {
        const migrationProgress = document.getElementById('migrationProgress');
        const migrationProgressBar = document.getElementById('migrationProgressBar');
        const numbersMigrated = document.getElementById('numbersMigrated');
        const locationsMapped = document.getElementById('locationsMapped');
        const templatesSetup = document.getElementById('templatesSetup');

        if (migrationProgress) migrationProgress.textContent = '100%';
        if (migrationProgressBar) migrationProgressBar.style.width = '100%';
        if (numbersMigrated) numbersMigrated.textContent = this.stats.totalNumbers;
        if (locationsMapped) locationsMapped.textContent = this.stats.activeLocations;
        if (templatesSetup) templatesSetup.textContent = '5';
    }

    /**
     * Show add number modal
     */
    showAddNumberModal() {
        try {
            console.log('Show add number modal');
            
            // Reset form
            const form = document.getElementById('whatsapp-add-number-form');
            if (form) {
                form.reset();
            }
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('whatsapp-add-number-modal'));
            modal.show();
            
            // Setup form submission
            const confirmBtn = document.getElementById('confirm-add-whatsapp-number');
            if (confirmBtn) {
                confirmBtn.onclick = () => this.handleAddNumber(modal);
            }
            
        } catch (error) {
            console.error('Error showing add number modal:', error);
            alert('Error opening add number dialog');
        }
    }

    /**
     * Show assign location modal
     */
    showAssignLocationModal() {
        try {
            console.log('Show assign location modal');
            
            // Reset form
            const form = document.getElementById('whatsapp-assign-location-form');
            if (form) {
                form.reset();
            }
            
            // Populate location dropdown
            this.populateLocationDropdown();
            
            // Populate number dropdown
            this.populateNumberDropdown();
            
            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('whatsapp-assign-location-modal'));
            modal.show();
            
            // Setup form submission
            const confirmBtn = document.getElementById('confirm-assign-location');
            if (confirmBtn) {
                confirmBtn.onclick = () => this.handleAssignLocation(modal);
            }
            
        } catch (error) {
            console.error('Error showing assign location modal:', error);
            alert('Error opening assign location dialog');
        }
    }

    /**
     * Handle adding a new WhatsApp number
     */
    async handleAddNumber(modal) {
        try {
            const phoneNumber = document.getElementById('whatsapp-phone-number').value.trim();
            const displayName = document.getElementById('whatsapp-display-name').value.trim();
            const status = document.getElementById('whatsapp-status').value;
            
            if (!phoneNumber || !displayName) {
                alert('Please fill in all required fields');
                return;
            }
            
            // Validate phone number format
            if (!this.isValidPhoneNumber(phoneNumber)) {
                alert('Please enter a valid phone number with country code (e.g., +27123456789)');
                return;
            }
            
            // Check if number already exists
            if (this.whatsappNumbers.has(phoneNumber)) {
                alert('This WhatsApp number already exists');
                return;
            }
            
            // Import Firebase functions
            const { rtdb, ref, push } = await import('../config/firebase-config.js');
            const { auth } = await import('../config/firebase-config.js');
            
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error('User not authenticated');
            }
            
            // Create new number data
            const numberData = {
                phoneNumber: phoneNumber,
                displayName: displayName,
                userId: currentUser.uid,
                status: status,
                createdAt: new Date().toISOString()
            };
            
            // Save to Firebase
            const numbersRef = ref(rtdb, 'whatsapp-numbers');
            const newNumberRef = await push(numbersRef, numberData);
            
            // Add to local data
            this.whatsappNumbers.set(phoneNumber, {
                id: newNumberRef.key,
                number: phoneNumber,
                displayName: displayName,
                userId: currentUser.uid,
                status: status,
                createdAt: numberData.createdAt,
                messagesCount: 0
            });
            
            // Update UI
            this.updateOverviewStats();
            
            // Close modal
            modal.hide();
            
            alert(`Successfully added WhatsApp number: ${phoneNumber}`);
            
        } catch (error) {
            console.error('Error adding WhatsApp number:', error);
            alert('Error adding WhatsApp number');
        }
    }

    /**
     * Handle assigning a location
     */
    async handleAssignLocation(modal) {
        try {
            const locationSelect = document.getElementById('assign-location-select');
            const numberSelect = document.getElementById('assign-number-select');
            const reassignCheckbox = document.getElementById('reassign-existing');
            
            const selectedLocationName = locationSelect.value;
            const selectedPhoneNumber = numberSelect.value;
            
            if (!selectedLocationName || !selectedPhoneNumber) {
                alert('Please select both a location and a WhatsApp number');
                return;
            }
            
            // Check if number is already assigned
            if (this.isNumberAssigned(selectedPhoneNumber) && !reassignCheckbox.checked) {
                alert('This number is already assigned to another location. Check "Allow reassigning" to proceed.');
                return;
            }
            
            // Unassign from previous location if reassigning
            if (reassignCheckbox.checked) {
                await this.unassignNumberFromPrevious(selectedPhoneNumber);
            }
            
            // Assign to new location
            await this.assignNumberToLocation(selectedLocationName, selectedPhoneNumber);
            
            // Close modal
            modal.hide();
            
        } catch (error) {
            console.error('Error assigning location:', error);
            alert('Error assigning location');
        }
    }

    /**
     * Populate location dropdown
     */
    populateLocationDropdown() {
        const locationSelect = document.getElementById('assign-location-select');
        if (!locationSelect) return;
        
        // Clear existing options except first one
        locationSelect.innerHTML = '<option value="">Select a location...</option>';
        
        // Add locations
        this.locations.forEach((location, name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            locationSelect.appendChild(option);
        });
    }

    /**
     * Populate number dropdown
     */
    populateNumberDropdown() {
        const numberSelect = document.getElementById('assign-number-select');
        if (!numberSelect) return;
        
        // Clear existing options except first one
        numberSelect.innerHTML = '<option value="">Select a number...</option>';
        
        // Add numbers
        this.whatsappNumbers.forEach((number, phoneNumber) => {
            const option = document.createElement('option');
            option.value = phoneNumber;
            option.textContent = `${phoneNumber} (${number.displayName})`;
            numberSelect.appendChild(option);
        });
    }

    /**
     * Validate phone number format
     */
    isValidPhoneNumber(phoneNumber) {
        // Basic validation for international format
        const phoneRegex = /^\+\d{10,15}$/;
        return phoneRegex.test(phoneNumber);
    }

    /**
     * Unassign number from previous location
     */
    async unassignNumberFromPrevious(phoneNumber) {
        for (const [locationName, location] of this.locations) {
            if (location.whatsappNumber === phoneNumber) {
                await this.unassignNumberFromLocation(locationName);
                break;
            }
        }
    }

    /**
     * Show analytics
     */
    showAnalytics() {
        try {
            console.log('Show analytics');
            
            // Generate analytics report
            const analyticsData = this.generateAnalyticsReport();
            
            // Create analytics content
            const analyticsContent = this.createAnalyticsContent(analyticsData);
            
            // Show in alert (in a real implementation, this would be a modal or new page)
            alert('Analytics Report:\n\n' + analyticsContent);
            
        } catch (error) {
            console.error('Error showing analytics:', error);
            alert('Error generating analytics report');
        }
    }

    /**
     * Generate analytics report
     */
    generateAnalyticsReport() {
        const report = {
            totalNumbers: this.whatsappNumbers.size,
            activeNumbers: Array.from(this.whatsappNumbers.values()).filter(n => n.status === 'active').length,
            totalLocations: this.locations.size,
            mappedLocations: Array.from(this.locations.values()).filter(l => l.whatsappNumber !== 'Not assigned').length,
            todayMessages: this.todayMessageCount || 0,
            averageMessagesPerLocation: 0,
            topLocations: [],
            numberUtilization: 0
        };
        
        // Calculate average messages per location
        if (report.mappedLocations > 0) {
            report.averageMessagesPerLocation = Math.round(report.todayMessages / report.mappedLocations);
        }
        
        // Get top locations by message count
        const locationsByMessages = Array.from(this.locations.values())
            .filter(l => l.messagesCount > 0)
            .sort((a, b) => b.messagesCount - a.messagesCount)
            .slice(0, 3);
        
        report.topLocations = locationsByMessages.map(l => ({
            name: l.name,
            messages: l.messagesCount,
            number: l.whatsappNumber
        }));
        
        // Calculate number utilization
        if (report.totalNumbers > 0) {
            report.numberUtilization = Math.round((report.mappedLocations / report.totalNumbers) * 100);
        }
        
        return report;
    }

    /**
     * Create analytics content for display
     */
    createAnalyticsContent(data) {
        let content = '';
        
        content += `=== WhatsApp Management Analytics ===\n\n`;
        
        content += `📊 OVERVIEW:\n`;
        content += `• Total WhatsApp Numbers: ${data.totalNumbers}\n`;
        content += `• Active Numbers: ${data.activeNumbers}\n`;
        content += `• Total Locations: ${data.totalLocations}\n`;
        content += `• Mapped Locations: ${data.mappedLocations}\n`;
        content += `• Number Utilization: ${data.numberUtilization}%\n\n`;
        
        content += `📈 TODAY'S ACTIVITY:\n`;
        content += `• Total Messages: ${data.todayMessages}\n`;
        content += `• Average per Location: ${data.averageMessagesPerLocation}\n\n`;
        
        if (data.topLocations.length > 0) {
            content += `🏆 TOP LOCATIONS (by messages):\n`;
            data.topLocations.forEach((loc, index) => {
                content += `${index + 1}. ${loc.name}: ${loc.messages} messages\n`;
            });
            content += `\n`;
        }
        
        content += `💡 INSIGHTS:\n`;
        if (data.numberUtilization < 50) {
            content += `• Low number utilization - consider assigning more numbers\n`;
        } else if (data.numberUtilization === 100) {
            content += `• All numbers are assigned - great utilization!\n`;
        }
        
        if (data.todayMessages === 0) {
            content += `• No messages today - check system connectivity\n`;
        } else if (data.todayMessages > 50) {
            content += `• High message volume - system performing well\n`;
        }
        
        if (data.mappedLocations === 0) {
            content += `• No locations mapped - start by assigning numbers\n`;
        }
        
        return content;
    }

    /**
     * Edit location WhatsApp assignment
     */
    async editLocation(locationName) {
        try {
            console.log('Edit location:', locationName);
            
            const location = this.locations.get(locationName);
            if (!location) {
                alert('Location not found');
                return;
            }
            
            // Get available WhatsApp numbers
            const availableNumbers = Array.from(this.whatsappNumbers.keys()).filter(number => {
                // Include unassigned numbers or the currently assigned number
                return !this.isNumberAssigned(number) || number === location.whatsappNumber;
            });
            
            if (availableNumbers.length === 0) {
                alert('No available WhatsApp numbers. Please add a number first.');
                return;
            }
            
            // Show selection dialog
            const selectedNumber = prompt(
                `Select WhatsApp number for "${locationName}":\n\n` +
                availableNumbers.map((num, i) => `${i + 1}. ${num}`).join('\n') +
                '\n\nEnter the number (1-' + availableNumbers.length + ') or enter 0 to unassign:',
                location.whatsappNumber ? String(availableNumbers.indexOf(location.whatsappNumber) + 1) : '0'
            );
            
            if (selectedNumber === null) return; // User cancelled
            
            const selectedIndex = parseInt(selectedNumber) - 1;
            
            if (selectedNumber === '0') {
                // Unassign number
                await this.unassignNumberFromLocation(locationName);
            } else if (selectedIndex >= 0 && selectedIndex < availableNumbers.length) {
                // Assign selected number
                await this.assignNumberToLocation(locationName, availableNumbers[selectedIndex]);
            } else {
                alert('Invalid selection');
            }
            
        } catch (error) {
            console.error('Error editing location:', error);
            alert('Error updating location assignment');
        }
    }

    /**
     * Remove WhatsApp number assignment from location
     */
    async removeLocation(locationName) {
        try {
            console.log('Remove location:', locationName);
            
            const location = this.locations.get(locationName);
            if (!location) {
                alert('Location not found');
                return;
            }
            
            if (location.whatsappNumber === 'Not assigned') {
                alert('This location does not have a WhatsApp number assigned');
                return;
            }
            
            if (confirm(`Are you sure you want to remove the WhatsApp number from "${locationName}"?`)) {
                await this.unassignNumberFromLocation(locationName);
            }
            
        } catch (error) {
            console.error('Error removing location assignment:', error);
            alert('Error removing location assignment');
        }
    }

    /**
     * Check if a WhatsApp number is already assigned to a location
     */
    isNumberAssigned(phoneNumber) {
        for (const [name, location] of this.locations) {
            if (location.whatsappNumber === phoneNumber) {
                return true;
            }
        }
        return false;
    }

    /**
     * Assign a WhatsApp number to a location
     */
    async assignNumberToLocation(locationName, phoneNumber) {
        try {
            console.log('Assigning number', phoneNumber, 'to location', locationName);
            
            // Import Firebase functions
            const { rtdb, ref, set, get, push } = await import('../config/firebase-config.js');
            const { auth } = await import('../config/firebase-config.js');
            
            const currentUser = auth.currentUser;
            if (!currentUser) {
                throw new Error('User not authenticated');
            }
            
            const location = this.locations.get(locationName);
            if (!location) {
                throw new Error('Location not found');
            }
            
            const whatsappNumber = this.whatsappNumbers.get(phoneNumber);
            if (!whatsappNumber) {
                throw new Error('WhatsApp number not found');
            }
            
            // Create or update location mapping
            const mappingData = {\n                locationId: location.id,\n                whatsappNumberId: whatsappNumber.id,\n                phoneNumber: phoneNumber,\n                userId: currentUser.uid,\n                assignedAt: new Date().toISOString(),\n                status: 'active'\n            };\n            \n            // Use location ID as the key for mapping\n            const mappingRef = ref(rtdb, `location-whatsapp-mapping/${location.id}`);\n            await set(mappingRef, mappingData);\n            \n            // Update local data\n            location.whatsappNumber = phoneNumber;\n            location.whatsappNumberId = whatsappNumber.id;\n            location.status = 'active';\n            location.assignedAt = mappingData.assignedAt;\n            \n            // Update UI\n            this.updateLocationMappingTable();\n            this.updateOverviewStats();\n            \n            alert(`Successfully assigned ${phoneNumber} to ${locationName}`);\n            \n        } catch (error) {\n            console.error('Error assigning number to location:', error);\n            throw error;\n        }\n    }\n\n    /**\n     * Unassign WhatsApp number from location\n     */\n    async unassignNumberFromLocation(locationName) {\n        try {\n            console.log('Unassigning number from location', locationName);\n            \n            // Import Firebase functions\n            const { rtdb, ref, remove } = await import('../config/firebase-config.js');\n            \n            const location = this.locations.get(locationName);\n            if (!location) {\n                throw new Error('Location not found');\n            }\n            \n            // Remove from Firebase\n            const mappingRef = ref(rtdb, `location-whatsapp-mapping/${location.id}`);\n            await remove(mappingRef);\n            \n            // Update local data\n            location.whatsappNumber = 'Not assigned';\n            location.whatsappNumberId = '';\n            location.status = 'inactive';\n            location.assignedAt = null;\n            \n            // Update UI\n            this.updateLocationMappingTable();\n            this.updateOverviewStats();\n            \n            alert(`Successfully unassigned WhatsApp number from ${locationName}`);\n            \n        } catch (error) {\n            console.error('Error unassigning number from location:', error);\n            throw error;\n        }
            
            // Update the table
            this.updateLocationMappingTable();
            
            // Update stats
            this.loadStats().then(() => {
                this.updateOverviewStats();
                this.updateMigrationStatus();
            });
        }
    }
}

console.log('✅ Debug functions loaded. Use window.debugSections() to check section states.');