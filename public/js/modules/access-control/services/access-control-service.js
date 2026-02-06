/**
 * Access Control Service
 * Version: 1.0.0-2025-04-24
 * 
 * Provides centralized access control for feature gating based on user subscription tiers
 * Implements the core permission checking logic for the tiered access system
 */

import { rtdb, ref, get, onValue, auth } from '../../../config/firebase-config.js';
import { authManager } from '../../../auth/auth.js?v=20250131-fix';

// Cache duration in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Access tiers in ascending order of features
const TIERS = ['free', 'starter', 'professional', 'enterprise'];

// Feature definitions by minimum tier required
const FEATURE_TIERS = {
  // Analytics features
  'analyticsBasic': 'free',
  'analyticsExport': 'professional',
  'analyticsAdvanced': 'professional',

  // WiFi features
  'wifiBasic': 'free',
  'wifiAdvancedCollection': 'starter',

  // Guest management
  'guestManagementBasic': 'free',
  'guestManagementAdvanced': 'professional',

  // Campaign features
  'campaignsBasic': 'starter',
  'campaignsAdvanced': 'professional',
  'campaignsCustom': 'enterprise',

  // Rewards features
  'rewardsBasic': 'starter',
  'rewardsAdvanced': 'professional',
  'rewardsCustom': 'enterprise',

  // Receipt processing
  'receiptProcessingManual': 'free',
  'receiptProcessingAutomated': 'professional',

  // WhatsApp features
  'whatsappBasic': 'starter',
  'whatsappAdvanced': 'professional',

  // Food cost management
  'foodCostBasic': 'professional',
  'advancedFoodCostCalculation': 'enterprise',

  // Multi-location
  'multiLocation': 'starter',

  // Queue Management System (QMS) features
  'qmsBasic': 'free',
  'qmsAdvanced': 'starter',
  'qmsWhatsAppIntegration': 'starter',
  'qmsAnalytics': 'professional',
  'qmsAutomation': 'enterprise',

  // Booking Management features
  'bookingManagement': 'free', // Enable for free tier for testing
  'bookingAdvanced': 'professional',
  'bookingAnalytics': 'professional'
};

// Resource limits by tier
const TIER_LIMITS = {
  'free': {
    guestRecords: 500,
    locations: 1,
    receiptProcessing: 50,
    campaignTemplates: 2,
    queueEntries: 25,
    queueLocations: 1,
    queueHistoryDays: 7,
    bookingEntries: 50,
    bookingHistoryDays: 30
  },
  'starter': {
    guestRecords: 2000,
    locations: 2,
    receiptProcessing: 200,
    campaignTemplates: 5,
    queueEntries: 100,
    queueLocations: 2,
    queueHistoryDays: 30,
    bookingEntries: 200,
    bookingHistoryDays: 60
  },
  'professional': {
    guestRecords: 10000,
    locations: 5,
    receiptProcessing: 500,
    campaignTemplates: 20,
    queueEntries: 500,
    queueLocations: 5,
    queueHistoryDays: 90,
    bookingEntries: 1000,
    bookingHistoryDays: 365
  },
  'enterprise': {
    guestRecords: Infinity,
    locations: Infinity,
    receiptProcessing: Infinity,
    campaignTemplates: Infinity,
    queueEntries: Infinity,
    queueLocations: Infinity,
    queueHistoryDays: Infinity,
    bookingEntries: Infinity,
    bookingHistoryDays: Infinity
  }
};

// Cache for user subscription data
const subscriptionCache = {
  data: null,
  timestamp: 0,
  userId: null
};

// Reference to the current subscription listener
let currentSubscriptionListener = null;

/**
 * Get the user's current subscription data
 * @returns {Promise<Object|null>} The user's subscription data or null if not found
 */
export async function getCurrentSubscription() {
  // Try Firebase Auth first, fallback to authManager
  const user = auth.currentUser || authManager.getCurrentUser();

  if (!user) {
    console.warn('Access Control: No user authenticated');
    return null;
  }

  // Use cached data if valid
  if (
    subscriptionCache.data &&
    subscriptionCache.userId === user.uid &&
    Date.now() - subscriptionCache.timestamp < CACHE_TTL
  ) {
    return subscriptionCache.data;
  }

  try {
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
    let subscription = snapshot.val();

    // Handle expired subscriptions - fall back to free tier
    if (subscription && subscription.status === 'expired') {
      console.warn('Access Control: Subscription expired, falling back to free tier');
      subscription = {
        ...subscription,
        tierId: 'free',
        tier: 'free',
        features: TIER_LIMITS.free, // Use free tier limits
        limits: TIER_LIMITS.free
      };
    }

    // Update cache
    subscriptionCache.data = subscription || { tier: 'free' }; // Default to free tier
    subscriptionCache.timestamp = Date.now();
    subscriptionCache.userId = user.uid;

    return subscriptionCache.data;
  } catch (error) {
    console.error('Access Control: Failed to get subscription', error);
    return { tier: 'free' }; // Fail safe to free tier
  }
}

/**
 * Subscribe to changes in the user's subscription
 * @param {Function} callback Function to call when subscription changes
 * @returns {Promise<Function>} Unsubscribe function
 */
export async function subscribeToSubscription(callback) {
  // Try Firebase Auth first, fallback to authManager
  const user = auth.currentUser || authManager.getCurrentUser();

  if (!user) {
    console.warn('Access Control: No user authenticated');
    return () => { };
  }

  // Remove any existing listener by calling the unsubscribe function directly
  if (currentSubscriptionListener) {
    console.log('Detaching previous subscription listener.');
    currentSubscriptionListener(); // Call the function returned by onValue
    currentSubscriptionListener = null;
  }

  const subscriptionRef = ref(rtdb, `subscriptions/${user.uid}`);

  // Set up the new listener
  currentSubscriptionListener = onValue(subscriptionRef, (snapshot) => {
    let subscription = snapshot.val() || { tier: 'free' };

    // Handle expired subscriptions - fall back to free tier
    if (subscription && subscription.status === 'expired') {
      console.warn('Access Control: Subscription expired, falling back to free tier');
      subscription = {
        ...subscription,
        tierId: 'free',
        tier: 'free',
        features: TIER_LIMITS.free, // Use free tier limits
        limits: TIER_LIMITS.free
      };
    }

    // Update cache
    subscriptionCache.data = subscription;
    subscriptionCache.timestamp = Date.now();
    subscriptionCache.userId = user.uid;

    // Invoke callback
    callback(subscription);
  });

  // Return unsubscribe function
  return () => currentSubscriptionListener();
}

/**
 * Check if the user can use a specific feature
 * @param {string} featureId The ID of the feature to check
 * @returns {Promise<boolean>} Whether the user can use the feature
 */
export async function canUseFeature(featureId) {
  const subscription = await getCurrentSubscription();

  if (!subscription) {
    return false;
  }

  // Check direct feature flag first (for overrides)
  if (subscription.features && subscription.features[featureId] !== undefined) {
    return subscription.features[featureId];
  }

  // Check tier-based access
  const requiredTier = FEATURE_TIERS[featureId] || 'enterprise';
  // Support both 'tier' and 'tierId' fields for backwards compatibility
  const userTier = subscription.tierId || subscription.tier || 'free';
  const userTierIndex = TIERS.indexOf(userTier);
  const requiredTierIndex = TIERS.indexOf(requiredTier);

  // User can access the feature if their tier is equal to or higher than the required tier
  return userTierIndex >= requiredTierIndex;
}

/**
 * Get the user's limit for a specific resource
 * @param {string} limitId The ID of the limit to check
 * @returns {Promise<number>} The user's limit for the resource
 */
export async function getLimit(limitId) {
  const subscription = await getCurrentSubscription();

  if (!subscription) {
    return TIER_LIMITS.free[limitId] || 0;
  }

  // Check direct limit override first
  if (subscription.limits && subscription.limits[limitId] !== undefined) {
    return subscription.limits[limitId];
  }

  // Return tier-based limit
  return TIER_LIMITS[subscription.tier]?.[limitId] ||
    TIER_LIMITS.free[limitId] ||
    0;
}

/**
 * Check if the user is at or exceeding a resource limit
 * @param {string} limitId The ID of the limit to check
 * @param {number} currentUsage The current usage amount
 * @returns {Promise<boolean>} Whether the user is at or exceeding the limit
 */
export async function isAtLimit(limitId, currentUsage) {
  const limit = await getLimit(limitId);
  return currentUsage >= limit;
}

/**
 * Get all available features for the user's current subscription
 * @returns {Promise<Object>} Object with feature IDs as keys and boolean access as values
 */
export async function getAllFeatures() {
  const subscription = await getCurrentSubscription();
  const result = {};

  // Process all defined features
  for (const featureId in FEATURE_TIERS) {
    // Check direct feature flag first (for overrides)
    if (subscription?.features && subscription.features[featureId] !== undefined) {
      result[featureId] = subscription.features[featureId];
      continue;
    }

    // Check tier-based access
    const requiredTier = FEATURE_TIERS[featureId];
    // Support both 'tier' and 'tierId' fields for backwards compatibility
    const userTier = subscription?.tierId || subscription?.tier || 'free';
    const userTierIndex = TIERS.indexOf(userTier);
    const requiredTierIndex = TIERS.indexOf(requiredTier);

    result[featureId] = userTierIndex >= requiredTierIndex;
  }

  return result;
}

/**
 * Check if a subscription tier is higher than or equal to another tier
 * @param {string} tierA First tier to compare
 * @param {string} tierB Second tier to compare
 * @returns {boolean} Whether tierA is greater than or equal to tierB
 */
export function isTierAtLeast(tierA, tierB) {
  const tierAIndex = TIERS.indexOf(tierA);
  const tierBIndex = TIERS.indexOf(tierB);

  return tierAIndex >= tierBIndex;
}

/**
 * Reset the subscription cache
 * Useful when testing or when subscription changes are made outside normal flow
 */
export function resetCache() {
  subscriptionCache.data = null;
  subscriptionCache.timestamp = 0;
  subscriptionCache.userId = null;
}

// Create main API to expose to window object
const AccessControl = {
  canUseFeature,
  getLimit,
  isAtLimit,
  getCurrentSubscription,
  getAllFeatures,
  resetCache,

  // Additional utility methods
  getAvailableTiers: () => [...TIERS],
  getFeatureDefinitions: () => ({ ...FEATURE_TIERS }),
  getTierLimits: (tier) => ({ ...TIER_LIMITS[tier || 'free'] }),

  /**
   * Render an upgrade prompt for a specific feature
   * @param {string} featureId The feature ID that requires upgrade
   * @param {HTMLElement} container The container to render the prompt in
   */
  async showUpgradePrompt(featureId, container) {
    if (!container) return;

    const requiredTier = FEATURE_TIERS[featureId] || 'enterprise';
    const subscription = await getCurrentSubscription();
    const currentTier = subscription?.tier || 'free';

    // Only show if user doesn't have access
    if (isTierAtLeast(currentTier, requiredTier)) {
      container.innerHTML = '';
      return;
    }

    // Simple upgrade prompt
    container.innerHTML = `
      <div class="upgrade-prompt">
        <p>This feature requires the ${requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)} plan or higher.</p>
        <button class="btn btn-primary upgrade-button">Upgrade Now</button>
      </div>
    `;

    // Add event listener to upgrade button
    const upgradeButton = container.querySelector('.upgrade-button');
    if (upgradeButton) {
      upgradeButton.addEventListener('click', () => {
        // Navigate to subscription page
        window.location.href = '/subscription?feature=' + featureId;
      });
    }
  }
};

// Export for module usage
export default AccessControl;

// Make available globally
window.AccessControl = AccessControl;
