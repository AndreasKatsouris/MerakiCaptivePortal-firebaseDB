/**
 * Subscription Service
 * Version: 1.0.0-2025-04-24
 * 
 * Manages user subscription tiers and subscriptions lifecycle
 * Handles subscription changes, upgrades, downgrades, and payment status
 */

import { rtdb, ref, get, set, update, push, serverTimestamp } from '../../../config/firebase-config.js';
import { authManager } from '../../../auth/auth.js?v=20250131-fix';
import AccessControl from './access-control-service.js';

// Subscription tiers with metadata
const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    description: 'Basic features for small operations',
    monthlyPrice: 0,
    annualPrice: 0,
    isVisible: true, // Always visible
    features: {
      // Basic features included in free tier
      analyticsBasic: true,
      wifiBasic: true,
      guestManagementBasic: true,
      receiptProcessingManual: true,
      bookingManagement: true // Enable for testing
    },
    limits: {
      guestRecords: 500,
      locations: 1,
      receiptProcessing: 50,
      campaignTemplates: 2,
      bookingEntries: 50,
      bookingHistoryDays: 30
    }
  },
  starter: {
    name: 'Starter',
    description: 'Essential features for growing businesses',
    monthlyPrice: 49.99,
    annualPrice: 499.99, // 2 months free
    isVisible: true, // Public tier
    features: {
      // All free features plus these
      campaignsBasic: true,
      rewardsBasic: true,
      whatsappBasic: true,
      multiLocation: true
    },
    limits: {
      guestRecords: 2000,
      locations: 2,
      receiptProcessing: 200,
      campaignTemplates: 5
    }
  },
  professional: {
    name: 'Professional',
    description: 'Advanced features for established businesses',
    monthlyPrice: 99.99,
    annualPrice: 999.99, // 2 months free
    isVisible: true, // Public tier
    features: {
      // All starter features plus these
      analyticsExport: true,
      analyticsAdvanced: true,
      guestManagementAdvanced: true,
      campaignsAdvanced: true,
      rewardsAdvanced: true,
      receiptProcessingAutomated: true,
      whatsappAdvanced: true,
      foodCostBasic: true,
      bookingManagement: true,
      bookingAdvanced: true,
      bookingAnalytics: true
    },
    limits: {
      guestRecords: 10000,
      locations: 5,
      receiptProcessing: 500,
      campaignTemplates: 20
    }
  },
  enterprise: {
    name: 'Enterprise',
    description: 'Complete solution for larger operations',
    monthlyPrice: 199.99,
    annualPrice: 1999.99, // 2 months free
    isVisible: false, // Hidden tier - contact sales only
    features: {
      // All professional features plus these
      campaignsCustom: true,
      rewardsCustom: true,
      advancedFoodCostCalculation: true
    },
    limits: {
      guestRecords: Infinity,
      locations: Infinity,
      receiptProcessing: Infinity,
      campaignTemplates: Infinity
    }
  }
};

/**
 * Get all available subscription tiers with details
 * @returns {Object} Subscription tier definitions
 */
export function getSubscriptionTiers() {
  return { ...SUBSCRIPTION_TIERS };
}

/**
 * Get only visible subscription tiers for public display
 * @returns {Object} Visible subscription tier definitions
 */
export function getVisibleSubscriptionTiers() {
  const visibleTiers = {};
  Object.entries(SUBSCRIPTION_TIERS).forEach(([id, tier]) => {
    if (tier.isVisible !== false) {
      visibleTiers[id] = { ...tier };
    }
  });
  return visibleTiers;
}

/**
 * Get details for a specific subscription tier
 * @param {string} tierId The ID of the tier to retrieve
 * @returns {Object|null} Tier details or null if not found
 */
export function getTierDetails(tierId) {
  return SUBSCRIPTION_TIERS[tierId] || null;
}

/**
 * Create a subscription for a user
 * @param {string} tierId The ID of the tier to subscribe to
 * @param {string} billingCycle 'monthly' or 'annual'
 * @param {Object} paymentDetails Payment details (will depend on payment provider)
 * @returns {Promise<Object>} Result of the operation
 */
export async function createSubscription(tierId, billingCycle = 'monthly', paymentDetails = {}) {
  const user = authManager.getCurrentUser();
  
  if (!user) {
    throw new Error('User must be authenticated to create a subscription');
  }
  
  // Validate tier
  if (!SUBSCRIPTION_TIERS[tierId]) {
    throw new Error(`Invalid subscription tier: ${tierId}`);
  }
  
  // In a real implementation, this would integrate with a payment provider
  // For now, we'll just create the subscription record
  
  const now = Date.now();
  // Calculate renewal date (30 days for monthly, 365 for annual)
  const renewalDate = billingCycle === 'annual' 
    ? now + (365 * 24 * 60 * 60 * 1000) 
    : now + (30 * 24 * 60 * 60 * 1000);
  
  const subscriptionData = {
    tierId: tierId,
    startDate: now,
    renewalDate,
    billingCycle,
    paymentStatus: 'active',
    features: { ...SUBSCRIPTION_TIERS[tierId].features },
    limits: { ...SUBSCRIPTION_TIERS[tierId].limits },
    history: {
      [now]: {
        action: 'created',
        tierId: tierId,
        timestamp: now
      }
    },
    paymentDetails: {
      // In a real implementation, we'd store a reference to the payment provider's data
      // For now, just store a placeholder
      provider: paymentDetails.provider || 'placeholder',
      lastFour: paymentDetails.lastFour || '0000',
      paymentMethod: paymentDetails.method || 'card'
    }
  };
  
  try {
    // Save to Firebase
    await set(ref(rtdb, `subscriptions/${user.uid}`), subscriptionData);
    
    // Reset the access control cache
    AccessControl.resetCache();
    
    return {
      success: true,
      subscription: subscriptionData
    };
  } catch (error) {
    console.error('Failed to create subscription:', error);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update a user's subscription
 * @param {string} tierId The new tier ID
 * @param {string} billingCycle The new billing cycle (optional)
 * @returns {Promise<Object>} Result of the operation
 */
export async function updateSubscription(tierId, billingCycle = null) {
  const user = authManager.getCurrentUser();
  
  if (!user) {
    throw new Error('User must be authenticated to update a subscription');
  }
  
  // Validate tier
  if (!SUBSCRIPTION_TIERS[tierId]) {
    throw new Error(`Invalid subscription tier: ${tierId}`);
  }
  
  try {
    // Get current subscription
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
    const currentSubscription = snapshot.val();
    
    if (!currentSubscription) {
      throw new Error('No existing subscription found');
    }
    
    const now = Date.now();
    const updates = {
      tierId: tierId,
      features: { ...SUBSCRIPTION_TIERS[tierId].features },
      limits: { ...SUBSCRIPTION_TIERS[tierId].limits },
      [`history/${now}`]: {
        action: 'updated',
        previousTier: currentSubscription.tierId,
        tierId: tierId,
        timestamp: now
      }
    };
    
    // Update billing cycle if provided
    if (billingCycle) {
      // Calculate new renewal date
      const renewalDate = billingCycle === 'annual' 
        ? now + (365 * 24 * 60 * 60 * 1000) 
        : now + (30 * 24 * 60 * 60 * 1000);
      
      updates.billingCycle = billingCycle;
      updates.renewalDate = renewalDate;
    }
    
    // Update in Firebase
    await update(ref(rtdb, `subscriptions/${user.uid}`), updates);
    
    // Reset the access control cache
    AccessControl.resetCache();
    
    return {
      success: true,
      tier: tierId
    };
  } catch (error) {
    console.error('Failed to update subscription:', error);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Cancel a user's subscription
 * @param {string} reason Reason for cancellation
 * @returns {Promise<Object>} Result of the operation
 */
export async function cancelSubscription(reason = '') {
  const user = authManager.getCurrentUser();
  
  if (!user) {
    throw new Error('User must be authenticated to cancel a subscription');
  }
  
  try {
    // Get current subscription
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
    const currentSubscription = snapshot.val();
    
    if (!currentSubscription) {
      throw new Error('No existing subscription found');
    }
    
    const now = Date.now();
    const updates = {
      paymentStatus: 'canceled',
      cancellationDate: now,
      [`history/${now}`]: {
        action: 'canceled',
        previousTier: currentSubscription.tierId,
        reason,
        timestamp: now
      }
    };
    
    // Update in Firebase
    await update(ref(rtdb, `subscriptions/${user.uid}`), updates);
    
    // Reset the access control cache
    AccessControl.resetCache();
    
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get subscription history for a user
 * @returns {Promise<Array>} Array of subscription history events
 */
export async function getSubscriptionHistory() {
  const user = authManager.getCurrentUser();
  
  if (!user) {
    throw new Error('User must be authenticated to get subscription history');
  }
  
  try {
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}/history`));
    const history = snapshot.val() || {};
    
    // Convert to array and sort by timestamp
    return Object.entries(history)
      .map(([key, event]) => ({
        id: key,
        ...event
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to get subscription history:', error);
    return [];
  }
}

/**
 * Start a free trial for a user
 * @param {string} tierId The tier to trial
 * @param {number} trialDays Number of days for the trial
 * @returns {Promise<Object>} Result of the operation
 */
export async function startFreeTrial(tierId, trialDays = 14) {
  const user = authManager.getCurrentUser();
  
  if (!user) {
    throw new Error('User must be authenticated to start a trial');
  }
  
  // Validate tier
  if (!SUBSCRIPTION_TIERS[tierId] || tierId === 'free') {
    throw new Error(`Invalid subscription tier for trial: ${tierId}`);
  }
  
  try {
    // Check if user already has a subscription
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
    const currentSubscription = snapshot.val();
    
    if (currentSubscription && currentSubscription.tierId !== 'free') {
      throw new Error('User already has an active subscription');
    }
    
    const now = Date.now();
    const trialEndDate = now + (trialDays * 24 * 60 * 60 * 1000);
    
    const subscriptionData = {
      tierId: tierId,
      startDate: now,
      renewalDate: trialEndDate,
      isTrial: true,
      trialEndDate,
      paymentStatus: 'trial',
      features: { ...SUBSCRIPTION_TIERS[tierId].features },
      limits: { ...SUBSCRIPTION_TIERS[tierId].limits },
      history: {
        [now]: {
          action: 'trial_started',
          tierId: tierId,
          trialDays,
          timestamp: now
        }
      }
    };
    
    // Save to Firebase
    await set(ref(rtdb, `subscriptions/${user.uid}`), subscriptionData);
    
    // Reset the access control cache
    AccessControl.resetCache();
    
    return {
      success: true,
      subscription: subscriptionData
    };
  } catch (error) {
    console.error('Failed to start free trial:', error);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check the status of a user's trial
 * @returns {Promise<Object>} Trial status information
 */
export async function getTrialStatus() {
  const user = authManager.getCurrentUser();
  
  if (!user) {
    throw new Error('User must be authenticated to check trial status');
  }
  
  try {
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
    const subscription = snapshot.val();
    
    if (!subscription || !subscription.isTrial) {
      return {
        isInTrial: false
      };
    }
    
    const now = Date.now();
    const daysLeft = Math.max(0, Math.ceil((subscription.trialEndDate - now) / (24 * 60 * 60 * 1000)));
    
    return {
      isInTrial: true,
      tierId: subscription.tierId,
      daysLeft,
      endDate: subscription.trialEndDate
    };
  } catch (error) {
    console.error('Failed to get trial status:', error);

    return {
      isInTrial: false,
      error: error.message
    };
  }
}

/**
 * Get locations associated with the current user's subscription
 * @returns {Promise<Array>} Array of location IDs
 */
export async function getSubscriptionLocations() {
  const user = authManager.getCurrentUser();

  if (!user) {
    throw new Error('User must be authenticated');
  }

  try {
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}/locationIds`));
    return snapshot.val() || [];
  } catch (error) {
    console.error('Failed to get subscription locations:', error);
    return [];
  }
}

/**
 * Add a location to the current user's subscription
 * @param {string} locationId The location ID to add
 * @returns {Promise<Object>} Result of the operation
 */
export async function addLocationToSubscription(locationId) {
  const user = authManager.getCurrentUser();

  if (!user) {
    throw new Error('User must be authenticated');
  }

  try {
    // Get current subscription
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
    const subscription = snapshot.val();

    if (!subscription) {
      throw new Error('No subscription found');
    }

    // Check location limit
    const currentLocations = subscription.locationIds || [];
    const maxLocations = subscription.limits?.locations || subscription.limits?.maxLocations || 1;

    if (currentLocations.includes(locationId)) {
      return { success: true, message: 'Location already assigned' };
    }

    if (maxLocations !== Infinity && currentLocations.length >= maxLocations) {
      throw new Error(`Location limit reached. Your tier allows ${maxLocations} location(s).`);
    }

    // Add location
    const newLocations = [...currentLocations, locationId];
    await update(ref(rtdb, `subscriptions/${user.uid}`), { locationIds: newLocations });

    // Also add to userLocations
    await set(ref(rtdb, `userLocations/${user.uid}/${locationId}`), {
      role: 'owner',
      addedAt: Date.now(),
      addedBy: user.uid
    });

    // Reset cache
    AccessControl.resetCache();

    return { success: true, locationIds: newLocations };
  } catch (error) {
    console.error('Failed to add location:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove a location from the current user's subscription
 * @param {string} locationId The location ID to remove
 * @returns {Promise<Object>} Result of the operation
 */
export async function removeLocationFromSubscription(locationId) {
  const user = authManager.getCurrentUser();

  if (!user) {
    throw new Error('User must be authenticated');
  }

  try {
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}/locationIds`));
    const currentLocations = snapshot.val() || [];

    const newLocations = currentLocations.filter(id => id !== locationId);
    await update(ref(rtdb, `subscriptions/${user.uid}`), { locationIds: newLocations });

    // Reset cache
    AccessControl.resetCache();

    return { success: true, locationIds: newLocations };
  } catch (error) {
    console.error('Failed to remove location:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if a location is within the user's subscription
 * @param {string} locationId The location to check
 * @returns {Promise<boolean>} Whether the location is accessible
 */
export async function hasLocationAccess(locationId) {
  const user = authManager.getCurrentUser();

  if (!user) return false;

  try {
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
    const subscription = snapshot.val();

    if (!subscription) return false;

    const locationIds = subscription.locationIds || [];
    const maxLocations = subscription.limits?.locations || subscription.limits?.maxLocations || 1;

    // Enterprise/unlimited tiers have access to all locations
    if (maxLocations === Infinity || maxLocations > 100) {
      return true;
    }

    return locationIds.includes(locationId);
  } catch (error) {
    console.error('Failed to check location access:', error);
    return false;
  }
}

/**
 * Get remaining location slots for the subscription
 * @returns {Promise<Object>} Object with used, max, and remaining counts
 */
export async function getLocationQuota() {
  const user = authManager.getCurrentUser();

  if (!user) {
    throw new Error('User must be authenticated');
  }

  try {
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
    const subscription = snapshot.val();

    if (!subscription) {
      return { used: 0, max: 1, remaining: 1, unlimited: false };
    }

    const locationIds = subscription.locationIds || [];
    const maxLocations = subscription.limits?.locations || subscription.limits?.maxLocations || 1;
    const isUnlimited = maxLocations === Infinity || maxLocations > 100;

    return {
      used: locationIds.length,
      max: isUnlimited ? 'unlimited' : maxLocations,
      remaining: isUnlimited ? 'unlimited' : Math.max(0, maxLocations - locationIds.length),
      unlimited: isUnlimited
    };
  } catch (error) {
    console.error('Failed to get location quota:', error);
    return { used: 0, max: 1, remaining: 1, unlimited: false, error: error.message };
  }
}

/**
 * Get guest record quota for the current user's subscription
 * @returns {Promise<Object>} Object with used, max, and remaining counts
 */
export async function getGuestQuota() {
  const user = authManager.getCurrentUser();

  if (!user) {
    throw new Error('User must be authenticated');
  }

  try {
    const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
    const subscription = snapshot.val();

    if (!subscription) {
      return { used: 0, max: 500, remaining: 500, unlimited: false };
    }

    // Count guests owned by this user
    const guestsSnapshot = await get(ref(rtdb, 'guests'));
    const allGuests = guestsSnapshot.val() || {};

    // For now, count all guests (in a real system, we'd filter by locationIds)
    // Later we can add user-specific filtering
    const guestCount = Object.keys(allGuests).length;

    const maxGuests = subscription.limits?.guestRecords || 500;
    const isUnlimited = maxGuests === Infinity || maxGuests > 100000;

    return {
      used: guestCount,
      max: isUnlimited ? 'unlimited' : maxGuests,
      remaining: isUnlimited ? 'unlimited' : Math.max(0, maxGuests - guestCount),
      unlimited: isUnlimited
    };
  } catch (error) {
    console.error('Failed to get guest quota:', error);
    return { used: 0, max: 500, remaining: 500, unlimited: false, error: error.message };
  }
}

/**
 * Check if user can add a new guest record
 * @returns {Promise<Object>} Object with canAdd boolean and message
 */
export async function canAddGuest() {
  try {
    const quota = await getGuestQuota();

    if (quota.unlimited) {
      return { canAdd: true };
    }

    if (quota.remaining <= 0) {
      const user = authManager.getCurrentUser();
      const snapshot = await get(ref(rtdb, `subscriptions/${user.uid}`));
      const subscription = snapshot.val();
      const tierName = SUBSCRIPTION_TIERS[subscription?.tierId]?.name || 'Free';

      return {
        canAdd: false,
        message: `Guest limit reached. Your ${tierName} tier allows ${quota.max} guest records. Upgrade to add more locations.`,
        currentCount: quota.used,
        limit: quota.max
      };
    }

    return { canAdd: true, remaining: quota.remaining };
  } catch (error) {
    console.error('Failed to check guest limit:', error);
    return { canAdd: false, message: 'Error checking guest limit', error: error.message };
  }
}

// Create the main service object to expose
const SubscriptionService = {
  getSubscriptionTiers,
  getVisibleSubscriptionTiers,
  getTierDetails,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getSubscriptionHistory,
  startFreeTrial,
  getTrialStatus,
  // Location management
  getSubscriptionLocations,
  addLocationToSubscription,
  removeLocationFromSubscription,
  hasLocationAccess,
  getLocationQuota,
  // Guest management
  getGuestQuota,
  canAddGuest
};

// Export both as default and named export for compatibility
export default SubscriptionService;
export const subscriptionService = SubscriptionService;
