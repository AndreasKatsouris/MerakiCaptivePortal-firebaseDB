/**
 * Subscription Tier Data Fix Utility
 * 
 * This utility creates proper subscription tier data and fixes user subscription synchronization issues
 * Addresses the user dashboard synchronization problem by ensuring consistent data structure
 */

import { rtdb, ref, set, get, update, remove, auth, onAuthStateChanged } from '../config/firebase-config.js';

// Default tier definitions with proper structure
const DEFAULT_SUBSCRIPTION_TIERS = {
    'free': {
        name: 'Free Tier',
        description: 'Basic features for small businesses',
        monthlyPrice: 0,
        annualPrice: 0,
        maxLocations: 1,
        active: true,
        features: {
            wifiBasic: true,
            analyticsBasic: true
        },
        limits: {
            locations: 1,
            sessionTime: 30,
            guestRecords: 100
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
    },
    'starter': {
        name: 'Starter Plan',
        description: 'Perfect for growing businesses',
        monthlyPrice: 29,
        annualPrice: 299,
        maxLocations: 3,
        active: true,
        features: {
            wifiBasic: true,
            analyticsBasic: true,
            campaignBasic: true,
            rewardsBasic: true,
            guestInsights: true
        },
        limits: {
            locations: 3,
            sessionTime: 120,
            guestRecords: 1000
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
    },
    'professional': {
        name: 'Professional Plan',
        description: 'Advanced features for serious businesses',
        monthlyPrice: 99,
        annualPrice: 999,
        maxLocations: 10,
        active: true,
        features: {
            wifiBasic: true,
            analyticsBasic: true,
            campaignBasic: true,
            rewardsBasic: true,
            guestInsights: true,
            multiLocation: true,
            foodCostBasic: true,
            foodCostAdvanced: true,
            wifiAnalytics: true
        },
        limits: {
            locations: 10,
            sessionTime: 240,
            guestRecords: 10000
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
    },
    'enterprise': {
        name: 'Enterprise Plan',
        description: 'Full-featured plan for large organizations',
        monthlyPrice: 299,
        annualPrice: 2999,
        maxLocations: 999,
        active: true,
        features: {
            wifiBasic: true,
            analyticsBasic: true,
            campaignBasic: true,
            rewardsBasic: true,
            guestInsights: true,
            multiLocation: true,
            foodCostBasic: true,
            foodCostAdvanced: true,
            foodCostAnalytics: true,
            wifiAnalytics: true
        },
        limits: {
            locations: 999,
            sessionTime: 480,
            guestRecords: 100000
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
    }
};

/**
 * Initialize subscription tier data in Firebase
 * @returns {Promise<{success: boolean, hasAdminAccess: boolean}>}
 */
export async function initializeSubscriptionTiers() {
    console.log('[TierFix] Initializing subscription tier data...');

    try {
        // Check if tiers already exist
        const tiersSnapshot = await get(ref(rtdb, 'subscriptionTiers'));

        if (!tiersSnapshot.exists()) {
            console.log('[TierFix] No existing tiers found, creating default tiers...');
            try {
                await set(ref(rtdb, 'subscriptionTiers'), DEFAULT_SUBSCRIPTION_TIERS);
                console.log('[TierFix] Default subscription tiers created successfully');
                return { success: true, hasAdminAccess: true };
            } catch (error) {
                if (error.code === 'PERMISSION_DENIED') {
                    console.log('[TierFix] No admin privileges - cannot create subscription tiers');
                    return { success: false, hasAdminAccess: false };
                }
                throw error;
            }
        } else {
            console.log('[TierFix] Subscription tiers already exist');
            // Optionally update existing tiers with missing fields
            const updateResult = await updateExistingTiers();
            return updateResult;
        }

    } catch (error) {
        console.error('[TierFix] Error initializing subscription tiers:', error);
        return { success: false, hasAdminAccess: false };
    }
}

/**
 * Update existing tiers to ensure they have all required fields
 * @returns {Promise<{success: boolean, hasAdminAccess: boolean}>}
 */
async function updateExistingTiers() {
    console.log('[TierFix] Updating existing tiers...');

    try {
        // First check if user has admin privileges by testing write access to subscriptionTiers
        const testRef = ref(rtdb, 'subscriptionTiers/test-permission');
        try {
            await set(testRef, { test: true });
            await remove(testRef); // Clean up test
        } catch (permissionError) {
            if (permissionError.code === 'PERMISSION_DENIED') {
                console.log('[TierFix] No admin privileges - skipping tier updates (subscription tiers are read-only for regular users)');
                return { success: true, hasAdminAccess: false };
            }
            throw permissionError;
        }
        const tiersSnapshot = await get(ref(rtdb, 'subscriptionTiers'));
        const existingTiers = tiersSnapshot.val();

        const updates = {};

        // Ensure each tier has all required fields
        Object.entries(DEFAULT_SUBSCRIPTION_TIERS).forEach(([tierId, defaultTier]) => {
            if (!existingTiers[tierId]) {
                // Tier doesn't exist, create it
                updates[`subscriptionTiers/${tierId}`] = defaultTier;
            } else {
                // Tier exists, ensure it has all required fields
                const existingTier = existingTiers[tierId];
                const updatedTier = {
                    ...defaultTier,
                    ...existingTier,
                    features: {
                        ...defaultTier.features,
                        ...(existingTier.features || {})
                    },
                    limits: {
                        ...defaultTier.limits,
                        ...(existingTier.limits || {})
                    },
                    updatedAt: Date.now()
                };

                updates[`subscriptionTiers/${tierId}`] = updatedTier;
            }
        });

        if (Object.keys(updates).length > 0) {
            // Try to update individual tier nodes instead of root to avoid permission issues
            const updatePromises = [];
            for (const path in updates) {
                if (path.startsWith('subscriptionTiers/')) {
                    const tierPath = path.replace('subscriptionTiers/', '');
                    updatePromises.push(
                        update(ref(rtdb, `subscriptionTiers/${tierPath}`), updates[path])
                    );
                }
            }

            if (updatePromises.length > 0) {
                await Promise.all(updatePromises);
                console.log('[TierFix] Updated', updatePromises.length, 'tier nodes individually');
            } else {
                // Fallback to original method if no subscription tier updates
                await update(ref(rtdb, '/'), updates);
                console.log('[TierFix] Updated', Object.keys(updates).length, 'tiers via root');
            }
        }

        return { success: true, hasAdminAccess: true };

    } catch (error) {
        if (error.code === 'PERMISSION_DENIED') {
            console.log('[TierFix] Permission denied for tier updates (requires admin privileges) - skipping tier updates');
            return { success: true, hasAdminAccess: false };
        } else {
            console.error('[TierFix] Error updating existing tiers:', error);
            return { success: false, hasAdminAccess: false };
        }
    }
}

/**
 * Fix user subscription data to ensure proper structure
 */
export async function fixUserSubscriptionData(userId) {
    console.log('[TierFix] Fixing subscription data for user:', userId);
    
    try {
        const userSubscriptionRef = ref(rtdb, `subscriptions/${userId}`);
        const subscriptionSnapshot = await get(userSubscriptionRef);
        
        if (!subscriptionSnapshot.exists()) {
            console.log('[TierFix] No subscription found for user, creating default free subscription');
            const defaultSubscription = {
                tierId: 'free',
                status: 'active',
                paymentStatus: 'none',
                monthlyPrice: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            await set(userSubscriptionRef, defaultSubscription);
            console.log('[TierFix] Created default subscription for user');
            return defaultSubscription;
        } else {
            const subscription = subscriptionSnapshot.val();
            console.log('[TierFix] Existing subscription:', subscription);
            
            // Normalize subscription data - standardize on tierId
            const updates = {};
            let needsUpdate = false;

            // Ensure tierId field exists (standardized field)
            if (!subscription.tierId) {
                if (subscription.tier) {
                    updates[`subscriptions/${userId}/tierId`] = subscription.tier;
                    updates[`subscriptions/${userId}/tier`] = null; // Remove conflicting field
                    needsUpdate = true;
                    console.log('[TierFix] Converting tier field to tierId:', subscription.tier);
                } else if (subscription.metadata?.initialTier) {
                    // CRITICAL FIX: For old subscriptions, use metadata.initialTier
                    updates[`subscriptions/${userId}/tierId`] = subscription.metadata.initialTier;
                    needsUpdate = true;
                    console.log('[TierFix] No tierId/tier found, using metadata.initialTier:', subscription.metadata.initialTier);
                } else {
                    updates[`subscriptions/${userId}/tierId`] = 'free';
                    needsUpdate = true;
                    console.log('[TierFix] No tier information found, defaulting to free');
                }
            } else if (subscription.tier && subscription.tier !== subscription.tierId) {
                // Remove conflicting tier field if it exists and conflicts
                updates[`subscriptions/${userId}/tier`] = null;
                needsUpdate = true;
                console.log('[TierFix] Removing conflicting tier field, keeping tierId:', subscription.tierId);
            }
            
            // Ensure status field exists
            if (!subscription.status) {
                updates[`subscriptions/${userId}/status`] = 'active';
                needsUpdate = true;
            }
            
            // Ensure updatedAt field exists
            if (!subscription.updatedAt) {
                updates[`subscriptions/${userId}/updatedAt`] = Date.now();
                needsUpdate = true;
            }
            
            if (needsUpdate) {
                await update(ref(rtdb, '/'), updates);
                console.log('[TierFix] Updated subscription data for user');

                // Re-fetch to get the clean data after updates
                const updatedSnapshot = await get(userSubscriptionRef);
                const updatedSubscription = updatedSnapshot.val();

                // Safety check: Ensure tierId exists in returned object
                if (!updatedSubscription.tierId) {
                    console.warn('[TierFix] WARNING: Updated subscription still missing tierId, adding fallback');
                    updatedSubscription.tierId = updatedSubscription.tier
                                               || updatedSubscription.metadata?.initialTier
                                               || 'free';
                }

                return updatedSubscription;
            }

            // Safety check: Ensure tierId exists in returned object even if no update needed
            if (!subscription.tierId) {
                console.log('[TierFix] Adding tierId to return object from fallback sources');
                return {
                    ...subscription,
                    tierId: subscription.tier || subscription.metadata?.initialTier || 'free'
                };
            }

            return subscription;
        }
        
    } catch (error) {
        console.error('[TierFix] Error fixing user subscription data:', error);
        return null;
    }
}

/**
 * Fix all existing user subscriptions
 */
export async function fixAllUserSubscriptions() {
    console.log('[TierFix] Fixing all user subscriptions...');
    
    try {
        const usersSnapshot = await get(ref(rtdb, 'users'));
        const users = usersSnapshot.val();
        
        if (!users) {
            console.log('[TierFix] No users found');
            return;
        }
        
        const userIds = Object.keys(users);
        console.log('[TierFix] Found', userIds.length, 'users to process');
        
        for (const userId of userIds) {
            await fixUserSubscriptionData(userId);
        }
        
        console.log('[TierFix] Completed fixing all user subscriptions');
        
    } catch (error) {
        console.error('[TierFix] Error fixing all user subscriptions:', error);
    }
}

/**
 * Create a test user with proper subscription data
 */
export async function createTestUserWithSubscription(email, tierId = 'free') {
    console.log('[TierFix] Creating test user with subscription:', email, tierId);
    
    try {
        // Generate a test user ID
        const testUserId = 'test-' + Date.now();
        
        // Create user data
        const userData = {
            email: email,
            displayName: email.split('@')[0],
            firstName: email.split('@')[0],
            createdAt: Date.now(),
            lastLogin: Date.now()
        };
        
        // Create subscription data
        const subscriptionData = {
            tierId: tierId,
            status: 'active',
            paymentStatus: tierId === 'free' ? 'none' : 'active',
            monthlyPrice: DEFAULT_SUBSCRIPTION_TIERS[tierId]?.monthlyPrice || 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        // Save to database
        const updates = {};
        updates[`users/${testUserId}`] = userData;
        updates[`subscriptions/${testUserId}`] = subscriptionData;
        
        await update(ref(rtdb, '/'), updates);
        
        console.log('[TierFix] Created test user:', testUserId);
        console.log('[TierFix] User data:', userData);
        console.log('[TierFix] Subscription data:', subscriptionData);
        
        return { userId: testUserId, userData, subscriptionData };
        
    } catch (error) {
        console.error('[TierFix] Error creating test user:', error);
        return null;
    }
}

/**
 * Run complete database fix
 */
export async function runCompleteDatabaseFix() {
    console.log('[TierFix] Running complete database fix...');

    try {
        // Step 1: Initialize subscription tiers
        console.log('[TierFix] Step 1: Initializing subscription tiers...');
        const tierResult = await initializeSubscriptionTiers();

        // Step 2: Fix all user subscriptions (only if user has admin access)
        if (tierResult.hasAdminAccess) {
            console.log('[TierFix] Step 2: Fixing all user subscriptions...');
            await fixAllUserSubscriptions();
            console.log('[TierFix] ✅ Complete database fix completed successfully!');
        } else {
            console.log('[TierFix] No admin privileges - skipping user subscription fixes');
            console.log('[TierFix] ✅ Database fix completed (admin-only steps skipped)');
        }

        return {
            success: true,
            message: tierResult.hasAdminAccess
                ? 'Database fix completed successfully'
                : 'Database fix completed (admin-only steps skipped)',
            hasAdminAccess: tierResult.hasAdminAccess,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error('[TierFix] ❌ Error during complete database fix:', error);

        return {
            success: false,
            message: 'Database fix failed: ' + error.message,
            timestamp: Date.now()
        };
    }
}

/**
 * Get current user's subscription with proper error handling
 */
export async function getCurrentUserSubscriptionFixed() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                reject(new Error('No user authenticated'));
                return;
            }
            
            try {
                console.log('[TierFix] Getting subscription for user:', user.uid);
                
                // First, ensure the user has a proper subscription
                const subscription = await fixUserSubscriptionData(user.uid);
                
                if (!subscription) {
                    reject(new Error('Could not create or fix user subscription'));
                    return;
                }
                
                // Get tier details
                const tierSnapshot = await get(ref(rtdb, `subscriptionTiers/${subscription.tierId}`));
                const tier = tierSnapshot.val();
                
                if (!tier) {
                    console.warn('[TierFix] Tier not found, initializing tiers...');
                    await initializeSubscriptionTiers();
                    
                    // Try again
                    const retryTierSnapshot = await get(ref(rtdb, `subscriptionTiers/${subscription.tierId}`));
                    const retryTier = retryTierSnapshot.val();
                    
                    if (!retryTier) {
                        reject(new Error('Could not load tier data'));
                        return;
                    }
                    
                    resolve({
                        ...subscription,
                        tier: retryTier
                    });
                } else {
                    resolve({
                        ...subscription,
                        tier: tier
                    });
                }
                
            } catch (error) {
                console.error('[TierFix] Error getting user subscription:', error);
                reject(error);
            }
        });
    });
}

// Make functions available globally for testing
if (typeof window !== 'undefined') {
    window.subscriptionTierFix = {
        initializeSubscriptionTiers,
        fixUserSubscriptionData,
        fixAllUserSubscriptions,
        createTestUserWithSubscription,
        runCompleteDatabaseFix,
        getCurrentUserSubscriptionFixed,
        getSubscriptionTierId,
        getSubscriptionTierData,
        getSubscriptionInfo
    };
}

/**
 * Get subscription tier ID from a subscription object
 * Handles both tier and tierId field names with fallback to 'free'
 * @param {Object} subscription - Subscription object
 * @returns {string} Tier ID (e.g., 'free', 'bronze', 'silver', 'gold', 'platinum')
 */
export function getSubscriptionTierId(subscription) {
    if (!subscription) {
        return 'free';
    }
    return subscription.tierId || subscription.tier || 'free';
}

/**
 * Get subscription tier data from the database
 * @param {string} tierId - Tier ID to fetch
 * @returns {Promise<Object|null>} Tier data object or null if not found
 */
export async function getSubscriptionTierData(tierId) {
    try {
        if (!tierId) {
            tierId = 'free';
        }
        const tierSnapshot = await get(ref(rtdb, `subscriptionTiers/${tierId}`));
        return tierSnapshot.val();
    } catch (error) {
        console.error('[TierFix] Error fetching tier data for', tierId, error);
        return null;
    }
}

/**
 * Get subscription tier ID and data in one call
 * @param {Object} subscription - Subscription object
 * @returns {Promise<{tierId: string, tierData: Object|null}>}
 */
export async function getSubscriptionInfo(subscription) {
    const tierId = getSubscriptionTierId(subscription);
    const tierData = await getSubscriptionTierData(tierId);
    return { tierId, tierData };
}

export default {
    initializeSubscriptionTiers,
    fixUserSubscriptionData,
    fixAllUserSubscriptions,
    createTestUserWithSubscription,
    runCompleteDatabaseFix,
    getCurrentUserSubscriptionFixed,
    getSubscriptionTierId,
    getSubscriptionTierData,
    getSubscriptionInfo
};