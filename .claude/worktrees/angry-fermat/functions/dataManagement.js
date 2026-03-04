const admin = require('firebase-admin');

/**
 * Normalize phone number format by removing + prefix and whatsapp: prefix
 * @param {string} phoneNumber - Phone number to normalize  
 * @returns {string} Normalized phone number without + prefix
 */
function normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';
    // Only remove WhatsApp prefix, preserve + for international numbers
    let cleaned = phoneNumber.replace(/^whatsapp:/, '').trim();

    // Ensure + prefix for international numbers (South African numbers)
    if (/^27\d{9}$/.test(cleaned)) {
        // If it's a 27xxxxxxxxx number without +, add it
        cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+') && /^\d+$/.test(cleaned)) {
        // If it's all digits without +, assume it's South African
        cleaned = '+27' + cleaned.replace(/^0+/, ''); // Remove leading zeros
    }

    return cleaned;
}

/**
 * Delete all data associated with a guest
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Object>} Result of deletion operation
 */
async function deleteUserData(phoneNumber) {
    // Normalize phone number for consistent database operations
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log(`Starting data deletion for user: ${normalizedPhone} (original: ${phoneNumber})`);

    try {
        // Get guest rewards to clean up campaign indices
        const rewardsSnapshot = await admin.database().ref(`guest-rewards/${normalizedPhone}`).once('value');
        const rewards = rewardsSnapshot.val() || {};

        // Get guest receipts from main receipts collection
        const receiptsSnapshot = await admin.database().ref('receipts')
            .orderByChild('guestPhoneNumber')
            .equalTo(normalizedPhone)
            .once('value');
        const receipts = receiptsSnapshot.val() || {};

        // Prepare deletion operations using normalized phone number
        const updates = {
            // Delete main user profile
            [`guests/${normalizedPhone}`]: null,

            // Delete user indices
            [`guest-receipts/${normalizedPhone}`]: null,
            [`guest-rewards/${normalizedPhone}`]: null,
            [`guest-points/${normalizedPhone}`]: null,

            // Delete user preferences/settings if any
            [`guest-preferences/${normalizedPhone}`]: null,
            [`guest-notifications/${normalizedPhone}`]: null
        };

        // Clean up rewards references
        Object.keys(rewards).forEach(rewardId => {
            updates[`rewards/${rewardId}/guestPhone`] = null;
            updates[`rewards/${rewardId}/guestName`] = null;
            updates[`rewards/${rewardId}/personalData`] = null;
        });

        // Clean up receipt references
        Object.keys(receipts).forEach(receiptId => {
            updates[`receipts/${receiptId}/guestPhone`] = null;
            updates[`receipts/${receiptId}/guestName`] = null;
            updates[`receipts/${receiptId}/personalData`] = null;
        });

        // Execute all deletions in a single transaction
        await admin.database().ref().update(updates);

        console.log(`Successfully deleted all data for ${normalizedPhone}`);

        return {
            success: true,
            message: "Your personal information has been deleted from our system. If you wish to use our services again in the future, you'll need to provide your details again."
        };

    } catch (error) {
        console.error('Error during data deletion:', error);
        return {
            success: false,
            message: "Sorry, we encountered an error while trying to delete your information. Please try again later."
        };
    }
}

/**
 * Export guest data in a portable format
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Object>} Exported data
 */
async function exportUserData(phoneNumber) {
    // Normalize phone number for consistent database operations
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log(`Exporting data for user: ${normalizedPhone} (original: ${phoneNumber})`);

    try {
        const exportData = {};

        // Gather all user data using normalized phone number
        const [
            profileSnapshot,
            rewardsSnapshot,
            receiptsSnapshot
        ] = await Promise.all([
            admin.database().ref(`guests/${normalizedPhone}`).once('value'),
            admin.database().ref(`guest-rewards/${normalizedPhone}`).once('value'),
            admin.database().ref('receipts').orderByChild('guestPhoneNumber').equalTo(normalizedPhone).once('value')
        ]);

        exportData.profile = profileSnapshot.val();
        exportData.rewards = rewardsSnapshot.val();
        exportData.receipts = receiptsSnapshot.val();

        return {
            success: true,
            data: exportData,
            message: "Your data has been exported successfully."
        };

    } catch (error) {
        console.error('Error exporting user data:', error);
        return {
            success: false,
            message: "Failed to export your data. Please try again later."
        };
    }
}

/**
 * Anonymize inactive user data
 * @param {number} inactiveDays - Number of days of inactivity before anonymizing
 * @returns {Promise<Object>} Result of anonymization operation
 */
async function anonymizeInactiveUsers(inactiveDays = 365) {
    try {
        const cutoffTime = Date.now() - (inactiveDays * 24 * 60 * 60 * 1000);

        // Find inactive users
        const usersSnapshot = await admin.database()
            .ref('guests')
            .orderByChild('lastActivity')
            .endAt(cutoffTime)
            .once('value');

        const updates = {};
        let count = 0;

        usersSnapshot.forEach(userSnapshot => {
            const userData = userSnapshot.val();
            if (userData && userData.lastActivity < cutoffTime) {
                // Use the phone number key as-is since it's already stored in normalized format
                const phoneKey = userSnapshot.key;
                updates[`guests/${phoneKey}/name`] = null;
                updates[`guests/${phoneKey}/email`] = null;
                updates[`guests/${phoneKey}/personalData`] = null;
                count++;
            }
        });

        if (count > 0) {
            await admin.database().ref().update(updates);
        }

        console.log(`Anonymized ${count} inactive users older than ${inactiveDays} days`);

        return {
            success: true,
            message: `Anonymized ${count} inactive users.`
        };

    } catch (error) {
        console.error('Error anonymizing inactive users:', error);
        return {
            success: false,
            message: "Failed to anonymize inactive users."
        };
    }
}

module.exports = {
    deleteUserData,
    exportUserData,
    anonymizeInactiveUsers,
    normalizePhoneNumber
};