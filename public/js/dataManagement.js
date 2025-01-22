const admin = require('firebase-admin');

/**
 * Delete all data associated with a guest
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Object>} Result of deletion operation
 */
async function deleteUserData(phoneNumber) {
    console.log(`Starting data deletion for user: ${phoneNumber}`);
    
    try {
        // Get guest rewards to clean up campaign indices
        const rewardsSnapshot = await admin.database().ref(`guest-rewards/${phoneNumber}`).once('value');
        const rewards = rewardsSnapshot.val() || {};

        // Get guest receipts to clean up related data
        const receiptsSnapshot = await admin.database().ref(`guest-receipts/${phoneNumber}`).once('value');
        const receipts = receiptsSnapshot.val() || {};

        // Prepare deletion operations
        const updates = {
            // Delete main user profile
            [`guests/${phoneNumber}`]: null,
            
            // Delete user indices
            [`guest-receipts/${phoneNumber}`]: null,
            [`guest-rewards/${phoneNumber}`]: null,
            [`guest-points/${phoneNumber}`]: null,
            
            // Delete user preferences/settings if any
            [`guest-preferences/${phoneNumber}`]: null,
            [`guest-notifications/${phoneNumber}`]: null
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

        console.log(`Successfully deleted all data for ${phoneNumber}`);
        
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
    try {
        const exportData = {};
        
        // Gather all user data
        const [
            profileSnapshot,
            rewardsSnapshot,
            receiptsSnapshot
        ] = await Promise.all([
            admin.database().ref(`guests/${phoneNumber}`).once('value'),
            admin.database().ref(`guest-rewards/${phoneNumber}`).once('value'),
            admin.database().ref(`guest-receipts/${phoneNumber}`).once('value')
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
                updates[`guests/${userSnapshot.key}/name`] = null;
                updates[`guests/${userSnapshot.key}/email`] = null;
                updates[`guests/${userSnapshot.key}/personalData`] = null;
                count++;
            }
        });

        if (count > 0) {
            await admin.database().ref().update(updates);
        }

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
    anonymizeInactiveUsers
};