/**
 * Phone Number Protection Utilities
 * Provides validation and monitoring for phone number preservation
 */

/**
 * Validates that phone numbers are preserved in user updates
 * @param {Object} existingData - Current user data
 * @param {Object} updateData - Data to be updated
 * @param {string} userId - User ID for logging
 * @returns {Object} Validated update data with phone numbers preserved
 */
function validatePhoneNumberPreservation(existingData, updateData, userId) {
    if (!existingData || !updateData) {
        console.error('❌ [PhoneProtection] Missing data for validation');
        return updateData;
    }

    const phoneFields = ['phoneNumber', 'phone', 'businessPhone'];
    const preservedFields = {};
    let hasPhoneNumbers = false;

    // Check each phone field
    phoneFields.forEach(field => {
        if (existingData[field]) {
            hasPhoneNumbers = true;
            if (!updateData[field]) {
                console.warn(`⚠️ [PhoneProtection] Preserving ${field} for user ${userId}:`, existingData[field]);
                preservedFields[field] = existingData[field];
            } else if (updateData[field] !== existingData[field]) {
                console.warn(`🔄 [PhoneProtection] Phone number change detected for user ${userId}:`, {
                    field,
                    old: existingData[field],
                    new: updateData[field],
                    timestamp: new Date().toISOString()
                });
            }
        }
    });

    if (hasPhoneNumbers) {
        console.log(`✅ [PhoneProtection] User ${userId} has phone numbers - validation complete`);
    }

    return {
        ...updateData,
        ...preservedFields
    };
}

/**
 * Logs phone number changes for audit trail
 * @param {string} userId - User ID
 * @param {Object} oldData - Previous user data
 * @param {Object} newData - New user data
 * @param {string} operation - Type of operation (auth, admin, login, etc.)
 */
function logPhoneNumberChange(userId, oldData, newData, operation) {
    const phoneFields = ['phoneNumber', 'phone', 'businessPhone'];
    const changes = [];

    phoneFields.forEach(field => {
        const oldValue = oldData?.[field];
        const newValue = newData?.[field];
        
        if (oldValue !== newValue) {
            changes.push({
                field,
                old: oldValue,
                new: newValue,
                type: oldValue && !newValue ? 'DELETED' : 
                      !oldValue && newValue ? 'ADDED' : 'CHANGED'
            });
        }
    });

    if (changes.length > 0) {
        console.error(`🚨 [PhoneProtection] PHONE NUMBER CHANGES DETECTED:`, {
            userId,
            operation,
            changes,
            timestamp: new Date().toISOString(),
            stack: new Error().stack
        });

        // Send to monitoring if available
        if (typeof window !== 'undefined' && window.analytics) {
            window.analytics.track('phone_number_change', {
                userId,
                operation,
                changes: changes.length,
                timestamp: new Date().toISOString()
            });
        }
    }
}

/**
 * Creates a safe update object that preserves phone numbers
 * @param {Object} existingData - Current user data
 * @param {Object} updateData - Data to be updated
 * @param {string} userId - User ID for logging
 * @returns {Object} Safe update object
 */
function createSafeUpdate(existingData, updateData, userId) {
    const safeUpdate = validatePhoneNumberPreservation(existingData, updateData, userId);
    
    // Log the operation
    logPhoneNumberChange(userId, existingData, safeUpdate, 'safe_update');
    
    return safeUpdate;
}

/**
 * Database operation wrapper that ensures phone number preservation
 * @param {Object} ref - Firebase database reference
 * @param {Object} updateData - Data to update
 * @param {string} userId - User ID
 * @param {string} operation - Operation type for logging
 */
async function safeUpdate(ref, updateData, userId, operation = 'unknown') {
    try {
        // Get existing data first
        const snapshot = await get(ref);
        const existingData = snapshot.exists() ? snapshot.val() : {};
        
        // Create safe update
        const safeUpdateData = createSafeUpdate(existingData, updateData, userId);
        
        // Perform update
        await update(ref, safeUpdateData);
        
        console.log(`✅ [PhoneProtection] Safe update completed for user ${userId} (${operation})`);
        
    } catch (error) {
        console.error(`❌ [PhoneProtection] Safe update failed for user ${userId} (${operation}):`, error);
        throw error;
    }
}

/**
 * Validates that no phone numbers are being deleted
 * @param {Object} existingData - Current user data
 * @param {Object} updateData - Data to be updated
 * @throws {Error} If phone numbers would be deleted
 */
function preventPhoneNumberDeletion(existingData, updateData) {
    const phoneFields = ['phoneNumber', 'phone', 'businessPhone'];
    const deletions = [];

    phoneFields.forEach(field => {
        if (existingData?.[field] && !updateData?.[field]) {
            deletions.push(field);
        }
    });

    if (deletions.length > 0) {
        const error = new Error(`Phone number deletion prevented: ${deletions.join(', ')}`);
        error.code = 'PHONE_DELETION_PREVENTED';
        error.deletions = deletions;
        throw error;
    }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        validatePhoneNumberPreservation,
        logPhoneNumberChange,
        createSafeUpdate,
        safeUpdate,
        preventPhoneNumberDeletion
    };
} else if (typeof window !== 'undefined') {
    window.PhoneNumberProtection = {
        validatePhoneNumberPreservation,
        logPhoneNumberChange,
        createSafeUpdate,
        safeUpdate,
        preventPhoneNumberDeletion
    };
}