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
  
  // Session-level caches for performance optimization
  adminStatusCache: null,
  subscriptionCache: null,
  tierDataCache: null,
  sessionCacheTimestamp: null,
  SESSION_CACHE_DURATION: 30 * 60 * 1000, // 30 minutes
  
  // Request deduplication for admin verification and subscription data
  adminVerificationPromise: null,
  subscriptionFetchPromise: null,

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
  },

  /**
   * Clear session-level caches
   */
  clearSessionCache() {
    this.adminStatusCache = null;
    this.subscriptionCache = null;
    this.tierDataCache = null;
    this.sessionCacheTimestamp = null;
    this.adminVerificationPromise = null;
    this.subscriptionFetchPromise = null;
    console.log('[FeatureAccess] Session cache cleared');
  },

  /**
   * Check if session cache is valid
   */
  isSessionCacheValid() {
    if (!this.sessionCacheTimestamp) return false;
    return (Date.now() - this.sessionCacheTimestamp) < this.SESSION_CACHE_DURATION;
  },

  /**
   * Perform admin verification (deduplicated)
   */
  async performAdminVerification(userId) {
    try {
      console.log('[FeatureAccess] Importing AdminClaims module...');
      const { AdminClaims } = await import(`../../../auth/admin-claims.js?v=${Date.now()}`);
      console.log('[FeatureAccess] Verifying admin status...');
      const isAdmin = await AdminClaims.verifyAdminStatus(auth.currentUser);
      console.log('[FeatureAccess] Admin verification result:', isAdmin);
      
      // Cache the admin status for session
      this.adminStatusCache = {
        userId: userId,
        isAdmin: isAdmin
      };
      if (!this.sessionCacheTimestamp) {
        this.sessionCacheTimestamp = Date.now();
      }
      console.log('[FeatureAccess] Admin status cached for session');
      
      return isAdmin;
    } catch (error) {
      console.error('[FeatureAccess] Admin verification failed:', error);
      throw error;
    }
  },

  /**
   * Perform subscription data fetch (deduplicated)
   */
  async performSubscriptionFetch(userId, cacheKey) {
    try {
      // Get user subscription directly from Firebase for non-admin users
      console.log('[FeatureAccess] Fetching subscription from database...');
      const subscriptionSnapshot = await get(ref(rtdb, `subscriptions/${userId}`));
      const subscription = subscriptionSnapshot.val();
      console.log('[FeatureAccess] Raw subscription data:', subscription);
      
      if (!subscription) {
        console.log('[FeatureAccess] No subscription found for user');
        return null;
      }
      
      // Get tier details - use tierId field which is the database standard
      // For old subscriptions created before tier system, check metadata.initialTier
      const tierId = subscription.tierId
                  || subscription.tier
                  || subscription.metadata?.initialTier  // Check old subscription format
                  || 'free'; // Final fallback
      console.log('[FeatureAccess] Resolved tier ID:', tierId, '(from:',
                  subscription.tierId ? 'tierId' :
                  subscription.tier ? 'tier' :
                  subscription.metadata?.initialTier ? 'metadata.initialTier' :
                  'default)', ')');
      
      if (!tierId) {
        console.warn('[FeatureAccess] Subscription has no tier ID');
        return null;
      }
      
      // PERFORMANCE OPTIMIZATION: Check tier data cache
      let tier;
      if (this.tierDataCache && this.tierDataCache.tierId === tierId && this.isSessionCacheValid()) {
        console.log('[FeatureAccess] Using cached tier data for:', tierId);
        tier = this.tierDataCache.data;
      } else {
        console.log('[FeatureAccess] Fetching tier details...');
        const tierSnapshot = await get(ref(rtdb, `subscriptionTiers/${tierId}`));
        tier = tierSnapshot.val();
        console.log('[FeatureAccess] Tier data:', tier);
        
        // Cache tier data for session
        this.tierDataCache = {
          tierId: tierId,
          data: tier
        };
        console.log('[FeatureAccess] Tier data cached for session');
      }
      
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
      
      // Cache the result in both regular cache and session cache
      this.cache.set(cacheKey, result);
      this.cacheTimestamps.set(cacheKey, Date.now());
      
      // Session-level cache for performance
      this.subscriptionCache = {
        userId: userId,
        data: result
      };
      if (!this.sessionCacheTimestamp) {
        this.sessionCacheTimestamp = Date.now();
      }
      console.log('[FeatureAccess] Subscription data cached for session');
      
      return result;
    } catch (error) {
      console.error('[FeatureAccess] Subscription fetch failed:', error);
      throw error;
    }
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
    
    // Don't return cached subscription data early - we need to check admin status first for consistency
    
    // PERFORMANCE OPTIMIZATION: Use cached admin status if available
    let isAdmin = false;
    let adminVerificationFailed = false;
    
    if (this.isSessionCacheValid() && this.adminStatusCache && this.adminStatusCache.userId === userId) {
      console.log('[FeatureAccess] Using cached admin status');
      isAdmin = this.adminStatusCache.isAdmin;
    } else {
      // Request deduplication: if admin verification is already in progress, wait for it
      if (this.adminVerificationPromise) {
        console.log('[FeatureAccess] Admin verification in progress, waiting...');
        try {
          isAdmin = await this.adminVerificationPromise;
          console.log('[FeatureAccess] Using admin verification result from parallel request');
        } catch (error) {
          console.error('[FeatureAccess] Parallel admin verification failed:', error);
          adminVerificationFailed = true;
        }
      } else {
        console.log('[FeatureAccess] Starting fresh admin verification');
        // Start admin verification and cache the promise for other parallel requests
        this.adminVerificationPromise = this.performAdminVerification(userId);
        try {
          isAdmin = await this.adminVerificationPromise;
          console.log('[FeatureAccess] Fresh admin verification completed');
        } catch (error) {
          console.error('[FeatureAccess] CRITICAL: Admin verification failed:', error);
          adminVerificationFailed = true;
        } finally {
          // Clear the promise so future requests can start fresh verification if needed
          this.adminVerificationPromise = null;
        }
      }
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
      
      // PERFORMANCE OPTIMIZATION: Check session cache for non-admin users
      if (this.isSessionCacheValid() && this.subscriptionCache && this.subscriptionCache.userId === userId) {
        console.log('[FeatureAccess] Returning cached subscription: ', this.subscriptionCache.data);
        return this.subscriptionCache.data;
      }
      
      // Request deduplication: if subscription fetching is already in progress, wait for it
      if (this.subscriptionFetchPromise) {
        console.log('[FeatureAccess] Subscription fetch in progress, waiting...');
        try {
          const result = await this.subscriptionFetchPromise;
          console.log('[FeatureAccess] Using subscription result from parallel request');
          return result;
        } catch (error) {
          console.error('[FeatureAccess] Parallel subscription fetch failed:', error);
          return null;
        }
      } else {
        console.log('[FeatureAccess] Starting fresh subscription fetch');
        // Start subscription fetch and cache the promise for other parallel requests
        this.subscriptionFetchPromise = this.performSubscriptionFetch(userId, cacheKey);
        try {
          const result = await this.subscriptionFetchPromise;
          console.log('[FeatureAccess] Fresh subscription fetch completed');
          return result;
        } catch (error) {
          console.error('[FeatureAccess] Subscription fetch failed:', error);
          return null;
        } finally {
          // Clear the promise so future requests can start fresh fetch if needed
          this.subscriptionFetchPromise = null;
        }
      }
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
