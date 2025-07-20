/**
 * Feature Access Control Service
 * Manages user access to platform features based on their subscription tier
 */

import { auth, rtdb, ref, get } from '../../../config/firebase-config.js';
import { PLATFORM_FEATURES } from './platform-features.js';

/**
 * Feature Access Control Service
 */
export const featureAccessControl = {
  // Cache for user subscription data
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
   * Get the current user's subscription
   * @returns {Promise<Object|null>} User subscription data or null
   */
  async getCurrentUserSubscription() {
    if (!auth.currentUser) {
      console.log('[FeatureAccess] No current user authenticated');
      return null;
    }
    
    const userId = auth.currentUser.uid;
    const cacheKey = `subscription_${userId}`;
    console.log('[FeatureAccess] Getting subscription for user:', userId);
    
    // Clear any existing cache for this user to ensure fresh data
    this.cache.delete(cacheKey);
    this.cacheTimestamps.delete(cacheKey);
    console.log('[FeatureAccess] Cleared existing cache for fresh admin check');
    
    // CRITICAL FIX: Consolidate admin verification into single try-catch block
    let isAdmin = false;
    let adminVerificationFailed = false;
    
    try {
      console.log('[FeatureAccess] Importing AdminClaims module...');
      const { AdminClaims } = await import(`../../../auth/admin-claims.js?v=${Date.now()}`);
      console.log('[FeatureAccess] Verifying admin status...');
      isAdmin = await AdminClaims.verifyAdminStatus(auth.currentUser);
      console.log('[FeatureAccess] Admin verification result:', isAdmin);
    } catch (error) {
      console.error('[FeatureAccess] CRITICAL: Admin verification failed:', error);
      adminVerificationFailed = true;
      // Do not proceed with regular flow if admin verification failed - try fallback
    }
    
    // If admin verification failed, try fallback admin detection
    if (adminVerificationFailed) {
      console.log('[FeatureAccess] Attempting fallback admin detection...');
      try {
        // Check if user email ends with admin domain or has admin in custom claims
        const user = auth.currentUser;
        const idTokenResult = await user.getIdTokenResult(true);
        
        // Check custom claims for admin flag
        if (idTokenResult.claims.admin === true || idTokenResult.claims.role === 'admin') {
          console.log('[FeatureAccess] Fallback: Admin detected via custom claims');
          isAdmin = true;
        }
        
        // Check email-based admin detection as last resort
        if (!isAdmin && user.email) {
          const adminEmails = ['admin@', 'support@', 'tech@'];
          const isAdminEmail = adminEmails.some(prefix => user.email.startsWith(prefix));
          if (isAdminEmail) {
            console.log('[FeatureAccess] Fallback: Admin detected via email pattern');
            isAdmin = true;
          }
        }
      } catch (fallbackError) {
        console.error('[FeatureAccess] Fallback admin detection also failed:', fallbackError);
      }
    }
    
    // For admin users, always check fresh (no cache) to ensure enterprise override
    if (isAdmin) {
      console.log('[FeatureAccess] Admin user detected - skipping cache to provide fresh enterprise subscription');
    } else {
      // Check cache for non-admin users only
      const cached = this.cache.get(cacheKey);
      const cacheTimestamp = this.cacheTimestamps.get(cacheKey);
      
      if (cached && cacheTimestamp && (Date.now() - cacheTimestamp < this.CACHE_DURATION)) {
        console.log('[FeatureAccess] Returning cached subscription:', cached);
        return cached;
      }
    }
    
    try {
      // ADMIN OVERRIDE LOGIC - MOVED OUTSIDE OF NESTED TRY-CATCH
      if (isAdmin) {
        console.log('[FeatureAccess] Admin user detected - providing enterprise-level subscription');
        const enterpriseTierSnapshot = await get(ref(rtdb, 'subscriptionTiers/enterprise'));
        const enterpriseTier = enterpriseTierSnapshot.val();
        
        if (!enterpriseTier) {
          console.error('[FeatureAccess] Enterprise tier not found in database - creating default');
          const defaultEnterpriseTier = {
            name: 'Enterprise',
            description: 'Complete solution for larger operations',
            monthlyPrice: 199.99,
            features: {
              analyticsBasic: true,
              analyticsAdvanced: true,
              analyticsExport: true,
              guestManagementBasic: true,
              guestManagementAdvanced: true,
              campaignsBasic: true,
              campaignsAdvanced: true,
              campaignsCustom: true,
              rewardsBasic: true,
              rewardsAdvanced: true,
              rewardsCustom: true,
              whatsappBasic: true,
              whatsappAdvanced: true,
              foodCostBasic: true,
              advancedFoodCostCalculation: true,
              bookingManagement: true,
              bookingAdvanced: true,
              bookingAnalytics: true,
              receiptProcessingManual: true,
              receiptProcessingAutomated: true,
              multiLocation: true,
              qmsBasic: true,
              qmsAdvanced: true
            }
          };
          
          // Save the default tier
          await set(ref(rtdb, 'subscriptionTiers/enterprise'), defaultEnterpriseTier);
          
          const adminSubscription = {
            tierId: 'enterprise',
            tier: defaultEnterpriseTier,
            status: 'active',
            isAdminOverride: true,
            createdAt: Date.now()
          };
          
          console.log('[FeatureAccess] Admin subscription created with default enterprise tier:', adminSubscription);
          
          // Cache the admin result
          this.cache.set(cacheKey, adminSubscription);
          this.cacheTimestamps.set(cacheKey, Date.now());
          
          return adminSubscription;
        }
        
        const adminSubscription = {
          tierId: 'enterprise',
          tier: enterpriseTier,
          status: 'active',
          isAdminOverride: true,
          createdAt: Date.now()
        };
        
        console.log('[FeatureAccess] Admin subscription created:', adminSubscription);
        
        // Cache the admin result
        this.cache.set(cacheKey, adminSubscription);
        this.cacheTimestamps.set(cacheKey, Date.now());
        
        return adminSubscription;
      }
      
      // Get user subscription directly from Firebase for non-admin users
      console.log('[FeatureAccess] Fetching subscription from database...');
      const subscriptionSnapshot = await get(ref(rtdb, `subscriptions/${userId}`));
      const subscription = subscriptionSnapshot.val();
      console.log('[FeatureAccess] Raw subscription data:', subscription);
      
      if (!subscription) {
        console.log('[FeatureAccess] No subscription found for user');
        return null;
      }
      
      // Get tier details
      const tierId = subscription.tier || 'free'; // Standardized on tier field
      console.log('[FeatureAccess] Resolved tier ID:', tierId);
      
      if (!tierId) {
        console.warn('[FeatureAccess] Subscription has no tier ID');
        return null;
      }
      
      console.log('[FeatureAccess] Fetching tier details...');
      const tierSnapshot = await get(ref(rtdb, `subscriptionTiers/${tierId}`));
      const tier = tierSnapshot.val();
      console.log('[FeatureAccess] Tier data:', tier);
      
      if (!tier) {
        console.warn(`[FeatureAccess] Tier not found: ${tierId}`);
        return null;
      }
      
      const result = {
        ...subscription,
        tierId: tierId,
        tier: tier
      };
      
      console.log('[FeatureAccess] Final subscription result:', result);
      
      // Cache the result
      this.cache.set(cacheKey, result);
      this.cacheTimestamps.set(cacheKey, Date.now());
      
      return result;
    } catch (error) {
      console.error('[FeatureAccess] Error getting user subscription:', error);
      return null;
    }
  },

  /**
   * Check if user has access to a specific feature
   * @param {string} featureId - Feature identifier
   * @returns {Promise<{hasAccess: boolean, tier: object|null, feature: object|null}>}
   */
  async checkFeatureAccess(featureId) {
    try {
      // Validate feature exists
      const feature = PLATFORM_FEATURES[featureId];
      if (!feature) {
        console.warn(`[FeatureAccess] Unknown feature: ${featureId}`);
        return { hasAccess: false, tier: null, feature: null };
      }

      // Get user subscription
      const subscription = await this.getCurrentUserSubscription();
      if (!subscription || !subscription.tier) {
        console.log('[FeatureAccess] User has no active subscription');
        return { hasAccess: false, tier: null, feature };
      }

      // Check if user has access to feature using tier object
      // subscription.tier is now an object, not a string ID
      const tier = subscription.tier;
      const hasAccess = tier && tier.features && tier.features[featureId] === true;
      
      return { hasAccess, tier, feature };
    } catch (error) {
      console.error('[FeatureAccess] Error checking feature access:', error);
      return { hasAccess: false, tier: null, feature: null };
    }
  },

  /**
   * Get all features available to the current user
   * @returns {Promise<Array>} Array of available feature objects
   */
  async getAvailableFeatures() {
    try {
      const subscription = await this.getCurrentUserSubscription();
      if (!subscription || !subscription.tier) {
        return [];
      }

      // subscription.tier is now an object, not a string ID
      const tier = subscription.tier;
      
      if (!tier || !tier.features) {
        return [];
      }

      // Return feature objects for enabled features
      return Object.keys(tier.features)
        .filter(featureId => tier.features[featureId] === true)
        .map(featureId => PLATFORM_FEATURES[featureId])
        .filter(feature => feature !== undefined);
    } catch (error) {
      console.error('[FeatureAccess] Error getting available features:', error);
      return [];
    }
  },

  /**
   * Check if user has access to any of the specified features
   * @param {string[]} featureIds - Array of feature identifiers
   * @returns {Promise<boolean>}
   */
  async hasAnyFeature(featureIds) {
    const results = await Promise.all(
      featureIds.map(id => this.checkFeatureAccess(id))
    );
    return results.some(result => result.hasAccess);
  },

  /**
   * Check if user has access to all specified features
   * @param {string[]} featureIds - Array of feature identifiers
   * @returns {Promise<boolean>}
   */
  async hasAllFeatures(featureIds) {
    const results = await Promise.all(
      featureIds.map(id => this.checkFeatureAccess(id))
    );
    return results.every(result => result.hasAccess);
  },

  /**
   * Get upgrade options for a specific feature
   * @param {string} featureId - Feature identifier
   * @returns {Promise<Array>} Array of tiers that include this feature
   */
  async getUpgradeOptionsForFeature(featureId) {
    try {
      const feature = PLATFORM_FEATURES[featureId];
      if (!feature) {
        return [];
      }

      // Get all tiers
      const tiersSnapshot = await get(ref(rtdb, 'subscriptionTiers'));
      const tiers = tiersSnapshot.val() || {};

      // Get current subscription
      const subscription = await this.getCurrentUserSubscription();
      const currentTierId = subscription?.tierId; // Use tierId (string) not tier (object)

      // Find tiers that have this feature
      const upgradeOptions = [];
      for (const [tierId, tier] of Object.entries(tiers)) {
        if (tier.features && tier.features[featureId] === true && tierId !== currentTierId) {
          upgradeOptions.push({
            tierId,
            ...tier
          });
        }
      }

      // Sort by monthly price
      upgradeOptions.sort((a, b) => (a.monthlyPrice || 0) - (b.monthlyPrice || 0));
      
      return upgradeOptions;
    } catch (error) {
      console.error('[FeatureAccess] Error getting upgrade options:', error);
      return [];
    }
  },

  /**
   * Show feature access denied message with upgrade options
   * @param {string} featureId - Feature identifier
   * @param {object} options - Display options
   */
  async showAccessDeniedMessage(featureId, options = {}) {
    const feature = PLATFORM_FEATURES[featureId];
    if (!feature) {
      console.error('[FeatureAccess] Unknown feature:', featureId);
      return;
    }

    const upgradeOptions = await this.getUpgradeOptionsForFeature(featureId);
    
    // Create message content
    let message = `<p>The <strong>${feature.name}</strong> feature requires an upgrade to access.</p>`;
    message += `<p class="text-muted">${feature.description}</p>`;
    
    if (upgradeOptions.length > 0) {
      message += '<p class="mt-3"><strong>Available in these plans:</strong></p>';
      message += '<ul class="list-unstyled">';
      upgradeOptions.forEach(tier => {
        message += `<li class="mb-2">
          <strong>${tier.name}</strong> - $${tier.monthlyPrice}/month
          <br><small class="text-muted">${tier.description}</small>
        </li>`;
      });
      message += '</ul>';
    }

    // Show message using SweetAlert2 if available, otherwise use alert
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Feature Not Available',
        html: message,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'View Upgrade Options',
        cancelButtonText: 'Close',
        ...options
      }).then((result) => {
        if (result.isConfirmed && options.onUpgradeClick) {
          options.onUpgradeClick();
        }
      });
    } else {
      alert(`Feature Not Available\n\n${feature.name} requires an upgrade to access.`);
    }
  },

  /**
   * Alias for showAccessDeniedMessage for backward compatibility
   * @param {string} featureId - Feature identifier
   * @param {object} options - Display options
   */
  async showUpgradePrompt(featureId, options = {}) {
    return this.showAccessDeniedMessage(featureId, options);
  },

  /**
   * Initialize feature access control with auth state listener
   */
  initialize() {
    // Clear cache when auth state changes
    auth.onAuthStateChanged(() => {
      this.clearCache();
    });
  }
};

// Initialize on module load
featureAccessControl.initialize();

// Export for use in other modules
export default featureAccessControl;
