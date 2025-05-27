/**
 * Subscription Service
 * Version: 1.0.0-2025-04-24
 * 
 * Manages user subscription tiers and subscriptions lifecycle
 * Handles subscription changes, upgrades, downgrades, and payment status
 */

import { rtdb, ref, get, set, update, push, serverTimestamp } from '../../../config/firebase-config.js';
import { authManager } from '../../../auth/auth.js';
import AccessControl from './access-control-service.js';

// Subscription tiers with metadata
const SUBSCRIPTION_TIERS = {
  free: {
    name: 'Free',
    description: 'Basic features for small operations',
    monthlyPrice: 0,
    annualPrice: 0,
    features: {
      // Basic features included in free tier
      analyticsBasic: true,
      wifiBasic: true,
      guestManagementBasic: true,
      receiptProcessingManual: true
    },
    limits: {
      guestRecords: 500,
      locations: 1,
      receiptProcessing: 50,
      campaignTemplates: 2
    }
  },
  starter: {
    name: 'Starter',
    description: 'Essential features for growing businesses',
    monthlyPrice: 49.99,
    annualPrice: 499.99, // 2 months free
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
    features: {
      // All starter features plus these
      analyticsExport: true,
      analyticsAdvanced: true,
      guestManagementAdvanced: true,
      campaignsAdvanced: true,
      rewardsAdvanced: true,
      receiptProcessingAutomated: true,
      whatsappAdvanced: true,
      foodCostBasic: true
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
    tier: tierId,
    startDate: now,
    renewalDate,
    billingCycle,
    paymentStatus: 'active',
    features: { ...SUBSCRIPTION_TIERS[tierId].features },
    limits: { ...SUBSCRIPTION_TIERS[tierId].limits },
    history: {
      [now]: {
        action: 'created',
        tier: tierId,
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
      tier: tierId,
      features: { ...SUBSCRIPTION_TIERS[tierId].features },
      limits: { ...SUBSCRIPTION_TIERS[tierId].limits },
      [`history/${now}`]: {
        action: 'updated',
        previousTier: currentSubscription.tier,
        tier: tierId,
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
        previousTier: currentSubscription.tier,
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
    
    if (currentSubscription && currentSubscription.tier !== 'free') {
      throw new Error('User already has an active subscription');
    }
    
    const now = Date.now();
    const trialEndDate = now + (trialDays * 24 * 60 * 60 * 1000);
    
    const subscriptionData = {
      tier: tierId,
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
          tier: tierId,
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
      tier: subscription.tier,
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

// Create the main service object to expose
const SubscriptionService = {
  getSubscriptionTiers,
  getTierDetails,
  createSubscription,
  updateSubscription,
  cancelSubscription,
  getSubscriptionHistory,
  startFreeTrial,
  getTrialStatus
};

export default SubscriptionService;
