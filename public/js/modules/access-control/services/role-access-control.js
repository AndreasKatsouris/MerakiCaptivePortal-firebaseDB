/**
 * Role-Based Access Control Service
 * Manages user access to UI elements and features based on their assigned role
 *
 * Roles:
 * - restaurant_owner: Full access to all features
 * - general_manager: Manages locations, cannot modify billing
 * - kitchen_manager: Food cost analytics, stock management
 * - floor_manager: Queue, bookings, guest management
 * - platform_admin: Platform-wide super admin
 */

import { auth, rtdb, ref, get, set, update } from '../../../config/firebase-config.js';

/**
 * Role definitions and their permissions
 */
const ROLE_PERMISSIONS = {
  restaurant_owner: {
    name: 'Restaurant Owner',
    permissions: [
      'dashboard',
      'queue_management',
      'booking_management',
      'guest_management',
      'food_cost_analytics',
      'campaigns',
      'analytics',
      'subscription',
      'receipt_settings',
      'pos_integration',
      'labour_integration',
      'okr_management'
    ],
    canAccessFinancial: true,
    canAccessGuestData: true,
    canAccessCampaigns: true,
    canManageSubscription: true
  },
  general_manager: {
    name: 'General Manager',
    permissions: [
      'dashboard',
      'queue_management',
      'booking_management',
      'guest_management',
      'food_cost_analytics',
      'campaigns',
      'analytics',
      'receipt_settings',
      'okr_management'
    ],
    canAccessFinancial: true,
    canAccessGuestData: true,
    canAccessCampaigns: true,
    canManageSubscription: false
  },
  kitchen_manager: {
    name: 'Kitchen Manager',
    permissions: [
      'dashboard',
      'food_cost_analytics',
      'receipt_settings',
      'analytics' // Limited to food cost analytics only
    ],
    canAccessFinancial: true,
    canAccessGuestData: false,
    canAccessCampaigns: false,
    canManageSubscription: false
  },
  floor_manager: {
    name: 'Floor Manager',
    permissions: [
      'dashboard',
      'queue_management',
      'booking_management',
      'guest_management',
      'analytics' // Limited to guest/service analytics only
    ],
    canAccessFinancial: false,
    canAccessGuestData: true,
    canAccessCampaigns: false,
    canManageSubscription: false
  },
  platform_admin: {
    name: 'Platform Admin',
    permissions: ['*'], // Full access
    canAccessFinancial: true,
    canAccessGuestData: true,
    canAccessCampaigns: true,
    canManageSubscription: true
  }
};

/**
 * Feature to module mapping
 */
const FEATURE_MODULES = {
  dashboard: {
    id: 'dashboard',
    name: 'Dashboard',
    icon: 'fas fa-tachometer-alt',
    route: '/user-dashboard.html'
  },
  queue_management: {
    id: 'queue_management',
    name: 'Queue Management',
    icon: 'fas fa-users',
    route: '/queue-management.html'
  },
  booking_management: {
    id: 'booking_management',
    name: 'Bookings',
    icon: 'fas fa-calendar',
    route: '/bookings.html'
  },
  guest_management: {
    id: 'guest_management',
    name: 'Guests',
    icon: 'fas fa-address-book',
    route: '/guest-management.html'
  },
  food_cost_analytics: {
    id: 'food_cost_analytics',
    name: 'Food Cost Analytics',
    icon: 'fas fa-utensils',
    route: '/food-cost-analytics.html'
  },
  campaigns: {
    id: 'campaigns',
    name: 'Campaigns',
    icon: 'fas fa-bullhorn',
    route: '/campaigns.html'
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics',
    icon: 'fas fa-chart-line',
    route: '/analytics.html'
  },
  subscription: {
    id: 'subscription',
    name: 'Subscription',
    icon: 'fas fa-credit-card',
    route: '/user-subscription.html'
  },
  receipt_settings: {
    id: 'receipt_settings',
    name: 'Receipt Settings',
    icon: 'fas fa-receipt',
    route: '/receipt-settings.html'
  },
  pos_integration: {
    id: 'pos_integration',
    name: 'POS Integration',
    icon: 'fas fa-cash-register',
    route: '/pos-integration.html'
  },
  labour_integration: {
    id: 'labour_integration',
    name: 'Labour Integration',
    icon: 'fas fa-user-clock',
    route: '/labour-integration.html'
  },
  okr_management: {
    id: 'okr_management',
    name: 'OKR Management',
    icon: 'fas fa-bullseye',
    route: '/okr-management.html'
  }
};

/**
 * Role-Based Access Control Service
 */
export const roleAccessControl = {
  // Cache for user role data
  cache: new Map(),
  cacheTimestamps: new Map(),
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
  },

  /**
   * Get current user's role from database
   * @returns {Promise<string|null>} User role or null if not found
   */
  async getUserRole() {
    const user = auth.currentUser;
    if (!user) {
      console.log('[RoleAccess] No authenticated user');
      return null;
    }

    const cacheKey = `role_${user.uid}`;
    const cachedData = this.cache.get(cacheKey);
    const cachedTimestamp = this.cacheTimestamps.get(cacheKey);

    // Return cached data if valid
    if (cachedData && cachedTimestamp && (Date.now() - cachedTimestamp) < this.CACHE_DURATION) {
      console.log('[RoleAccess] Returning cached role:', cachedData);
      return cachedData;
    }

    try {
      // Get user data from database
      console.log('[RoleAccess] Fetching role from database for user:', user.uid);
      const userSnapshot = await get(ref(rtdb, `users/${user.uid}`));
      const userData = userSnapshot.val();

      if (!userData) {
        console.log('[RoleAccess] No user data found in database');
        return null;
      }

      const role = userData.role || 'restaurant_owner'; // Default to restaurant_owner
      console.log('[RoleAccess] User role:', role);

      // Cache the role
      this.cache.set(cacheKey, role);
      this.cacheTimestamps.set(cacheKey, Date.now());

      return role;
    } catch (error) {
      console.error('[RoleAccess] Error fetching user role:', error);
      throw error;
    }
  },

  /**
   * Set user role in database
   * @param {string} userId - User ID
   * @param {string} role - Role to assign
   * @returns {Promise<void>}
   */
  async setUserRole(userId, role) {
    if (!ROLE_PERMISSIONS[role]) {
      throw new Error(`Invalid role: ${role}`);
    }

    try {
      await update(ref(rtdb, `users/${userId}`), {
        role: role,
        roleUpdatedAt: Date.now()
      });

      // Clear cache for this user
      const cacheKey = `role_${userId}`;
      this.cache.delete(cacheKey);
      this.cacheTimestamps.delete(cacheKey);

      console.log('[RoleAccess] Role updated:', userId, role);
    } catch (error) {
      console.error('[RoleAccess] Error setting user role:', error);
      throw error;
    }
  },

  /**
   * Check if user has access to a specific feature
   * @param {string} featureId - Feature ID
   * @returns {Promise<boolean>}
   */
  async hasFeatureAccess(featureId) {
    const role = await this.getUserRole();
    if (!role) {
      return false;
    }

    const rolePermissions = ROLE_PERMISSIONS[role];
    if (!rolePermissions) {
      console.error('[RoleAccess] Unknown role:', role);
      return false;
    }

    // Platform admin has access to everything
    if (rolePermissions.permissions.includes('*')) {
      return true;
    }

    // Check if feature is in permissions list
    return rolePermissions.permissions.includes(featureId);
  },

  /**
   * Get all accessible features for current user
   * @returns {Promise<Array>} Array of accessible feature objects
   */
  async getAccessibleFeatures() {
    const role = await this.getUserRole();
    if (!role) {
      return [];
    }

    const rolePermissions = ROLE_PERMISSIONS[role];
    if (!rolePermissions) {
      return [];
    }

    // Platform admin has access to all features
    if (rolePermissions.permissions.includes('*')) {
      return Object.values(FEATURE_MODULES);
    }

    // Filter features based on permissions
    return Object.values(FEATURE_MODULES).filter(feature =>
      rolePermissions.permissions.includes(feature.id)
    );
  },

  /**
   * Get role permissions object
   * @param {string} role - Role name
   * @returns {Object|null} Role permissions object or null
   */
  getRolePermissions(role) {
    return ROLE_PERMISSIONS[role] || null;
  },

  /**
   * Get current user's permissions
   * @returns {Promise<Object|null>}
   */
  async getUserPermissions() {
    const role = await this.getUserRole();
    return this.getRolePermissions(role);
  },

  /**
   * Check if user can access financial data
   * @returns {Promise<boolean>}
   */
  async canAccessFinancial() {
    const permissions = await this.getUserPermissions();
    return permissions ? permissions.canAccessFinancial : false;
  },

  /**
   * Check if user can access guest data
   * @returns {Promise<boolean>}
   */
  async canAccessGuestData() {
    const permissions = await this.getUserPermissions();
    return permissions ? permissions.canAccessGuestData : false;
  },

  /**
   * Check if user can access campaigns
   * @returns {Promise<boolean>}
   */
  async canAccessCampaigns() {
    const permissions = await this.getUserPermissions();
    return permissions ? permissions.canAccessCampaigns : false;
  },

  /**
   * Check if user can manage subscription
   * @returns {Promise<boolean>}
   */
  async canManageSubscription() {
    const permissions = await this.getUserPermissions();
    return permissions ? permissions.canManageSubscription : false;
  },

  /**
   * Get all available roles
   * @returns {Array} Array of role objects
   */
  getAllRoles() {
    return Object.keys(ROLE_PERMISSIONS).map(roleId => ({
      id: roleId,
      name: ROLE_PERMISSIONS[roleId].name,
      permissions: ROLE_PERMISSIONS[roleId].permissions
    }));
  },

  /**
   * Hide/show UI element based on feature access
   * @param {string} elementId - DOM element ID
   * @param {string} featureId - Feature ID
   * @returns {Promise<void>}
   */
  async hideElementIfNoAccess(elementId, featureId) {
    const hasAccess = await this.hasFeatureAccess(featureId);
    const element = document.getElementById(elementId);

    if (element) {
      element.style.display = hasAccess ? '' : 'none';
    }
  },

  /**
   * Add CSS class to element based on feature access
   * @param {string} elementId - DOM element ID
   * @param {string} featureId - Feature ID
   * @param {string} className - CSS class to add if no access
   * @returns {Promise<void>}
   */
  async disableElementIfNoAccess(elementId, featureId, className = 'disabled') {
    const hasAccess = await this.hasFeatureAccess(featureId);
    const element = document.getElementById(elementId);

    if (element && !hasAccess) {
      element.classList.add(className);
      element.style.pointerEvents = 'none';
      element.style.opacity = '0.5';
    }
  },

  /**
   * Get feature modules mapping
   * @returns {Object} Feature modules
   */
  getFeatureModules() {
    return FEATURE_MODULES;
  }
};

// Export for global access
if (typeof window !== 'undefined') {
  window.roleAccessControl = roleAccessControl;
}
