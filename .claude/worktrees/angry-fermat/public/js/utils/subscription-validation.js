/**
 * Subscription Data Validation
 * Prevents tier/tierId conflicts by enforcing tierId-only subscriptions
 */

import { rtdb, ref, get, update, push } from '../config/firebase-config.js';

/**
 * Validate subscription data before database writes
 * @param {Object} subscriptionData - Subscription data to validate
 * @param {string} userId - User ID for context
 * @returns {Object} Validation result with cleaned data
 */
export function validateSubscriptionData(subscriptionData, userId) {
    const result = {
        isValid: false,
        cleanedData: null,
        warnings: [],
        errors: []
    };

    try {
        // Create a cleaned copy of the data
        const cleaned = { ...subscriptionData };
        
        // CRITICAL: Check for tier/tierId conflicts
        const hasTier = cleaned.tier !== undefined && cleaned.tier !== null;
        const hasTierId = cleaned.tierId !== undefined && cleaned.tierId !== null;
        
        if (hasTier && hasTierId) {
            // Both fields exist - this is forbidden
            if (cleaned.tier === cleaned.tierId) {
                // Same value - remove tier field, keep tierId
                result.warnings.push(`Removing redundant 'tier' field for user ${userId}. Using tierId="${cleaned.tierId}"`);
                delete cleaned.tier;
            } else {
                // Different values - this is a critical error
                result.errors.push(`CONFLICT: tier="${cleaned.tier}" vs tierId="${cleaned.tierId}" for user ${userId}. Use tierId only.`);
                return result;
            }
        } else if (hasTier && !hasTierId) {
            // Legacy tier field - convert to tierId
            result.warnings.push(`Converting legacy 'tier' field to 'tierId' for user ${userId}: "${cleaned.tier}"`);
            cleaned.tierId = cleaned.tier;
            delete cleaned.tier;
        } else if (!hasTierId) {
            // No tier information - set default
            result.warnings.push(`No tier information found for user ${userId}. Setting tierId="free"`);
            cleaned.tierId = 'free';
        }

        // Validate tierId value
        const validTierIds = ['free', 'starter', 'professional', 'enterprise'];
        if (!validTierIds.includes(cleaned.tierId)) {
            result.errors.push(`Invalid tierId "${cleaned.tierId}" for user ${userId}. Must be one of: ${validTierIds.join(', ')}`);
            return result;
        }

        // Ensure status is valid
        const validStatuses = ['active', 'trial', 'canceled', 'expired', 'pending'];
        if (cleaned.status && !validStatuses.includes(cleaned.status)) {
            result.errors.push(`Invalid status "${cleaned.status}" for user ${userId}. Must be one of: ${validStatuses.join(', ')}`);
            return result;
        }

        // Set default status if missing
        if (!cleaned.status) {
            cleaned.status = 'active';
            result.warnings.push(`Setting default status="active" for user ${userId}`);
        }

        // Add validation metadata
        cleaned.lastValidated = Date.now();
        cleaned.validationVersion = '1.0.0';

        result.isValid = true;
        result.cleanedData = cleaned;
        
        return result;
        
    } catch (error) {
        result.errors.push(`Validation error for user ${userId}: ${error.message}`);
        return result;
    }
}

/**
 * Safe subscription update with validation
 * @param {string} userId - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Update result
 */
export async function safeSubscriptionUpdate(userId, updateData) {
    try {
        console.log(`[SubscriptionValidation] Validating update for user ${userId}:`, updateData);
        
        // Get current subscription
        const currentRef = ref(rtdb, `subscriptions/${userId}`);
        const currentSnapshot = await get(currentRef);
        const currentData = currentSnapshot.val() || {};
        
        // Merge with current data
        const mergedData = { ...currentData, ...updateData };
        
        // Validate merged data
        const validation = validateSubscriptionData(mergedData, userId);
        
        if (!validation.isValid) {
            console.error(`[SubscriptionValidation] Validation failed for user ${userId}:`, validation.errors);
            throw new Error(`Subscription validation failed: ${validation.errors.join('; ')}`);
        }
        
        // Log warnings
        if (validation.warnings.length > 0) {
            console.warn(`[SubscriptionValidation] Warnings for user ${userId}:`, validation.warnings);
        }
        
        // Update database with cleaned data
        await update(currentRef, validation.cleanedData);
        
        console.log(`[SubscriptionValidation] Successfully updated subscription for user ${userId}`);
        
        return {
            success: true,
            data: validation.cleanedData,
            warnings: validation.warnings
        };
        
    } catch (error) {
        console.error(`[SubscriptionValidation] Failed to update subscription for user ${userId}:`, error);
        
        // Log error for monitoring
        const errorRef = ref(rtdb, `_system/subscription-validation-errors`);
        await push(errorRef, {
            userId,
            error: error.message,
            attemptedUpdate: updateData,
            timestamp: Date.now()
        });
        
        throw error;
    }
}

/**
 * Detect and report subscription data issues across all users
 * @returns {Promise<Object>} Issues report
 */
export async function auditAllSubscriptions() {
    const report = {
        totalSubscriptions: 0,
        validSubscriptions: 0,
        issuesFound: {
            conflicts: [],
            missingTierIds: [],
            invalidTierIds: [],
            invalidStatuses: []
        },
        timestamp: Date.now()
    };

    try {
        console.log('[SubscriptionValidation] Starting subscription audit...');
        
        const subscriptionsRef = ref(rtdb, 'subscriptions');
        const snapshot = await get(subscriptionsRef);
        
        if (!snapshot.exists()) {
            console.log('[SubscriptionValidation] No subscriptions found');
            return report;
        }

        const subscriptions = snapshot.val();
        report.totalSubscriptions = Object.keys(subscriptions).length;
        
        for (const [userId, subscription] of Object.entries(subscriptions)) {
            const validation = validateSubscriptionData(subscription, userId);
            
            if (validation.isValid) {
                report.validSubscriptions++;
            } else {
                // Categorize issues
                validation.errors.forEach(error => {
                    if (error.includes('CONFLICT')) {
                        report.issuesFound.conflicts.push({ userId, error, data: subscription });
                    } else if (error.includes('Invalid tierId')) {
                        report.issuesFound.invalidTierIds.push({ userId, error, data: subscription });
                    } else if (error.includes('Invalid status')) {
                        report.issuesFound.invalidStatuses.push({ userId, error, data: subscription });
                    }
                });
            }
            
            // Check for missing tierId specifically
            if (!subscription.tierId) {
                report.issuesFound.missingTierIds.push({ 
                    userId, 
                    error: 'Missing tierId field', 
                    data: subscription 
                });
            }
        }

        console.log(`[SubscriptionValidation] Audit complete: ${report.validSubscriptions}/${report.totalSubscriptions} subscriptions valid`);
        
        // Save audit report
        const auditRef = ref(rtdb, `_system/subscription-audit-reports/${Date.now()}`);
        await update(auditRef, report);
        
        return report;
        
    } catch (error) {
        console.error('[SubscriptionValidation] Audit failed:', error);
        throw error;
    }
}

/**
 * Subscription data utilities
 */
export const SubscriptionValidation = {
    validateSubscriptionData,
    safeSubscriptionUpdate,
    auditAllSubscriptions,
    
    // Helper constants
    VALID_TIER_IDS: ['free', 'starter', 'professional', 'enterprise'],
    VALID_STATUSES: ['active', 'trial', 'canceled', 'expired', 'pending'],
    
    // Quick validation check
    isValidTierId: (tierId) => ['free', 'starter', 'professional', 'enterprise'].includes(tierId),
    isValidStatus: (status) => ['active', 'trial', 'canceled', 'expired', 'pending'].includes(status)
};

export default SubscriptionValidation;