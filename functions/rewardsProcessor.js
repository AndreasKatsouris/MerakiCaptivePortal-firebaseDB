const admin = require('firebase-admin');

/**
 * Process rewards for validated receipts
 * @param {Object} guest - Guest information object
 * @param {Object} campaign - Campaign information object
 * @param {Object} receiptData - Validated receipt data
 * @returns {Promise<Object>} Processed reward data
 */
async function processReward(guest, campaign, receiptData) {
    try {
        // Input validation
        if (!guest?.phoneNumber) {
            throw new Error('Guest data is missing or invalid');
        }

        if (!campaign?.name) {
            throw new Error('Campaign data is missing or invalid');
        }

        if (!receiptData?.receiptId) {
            throw new Error('Receipt data is missing or invalid');
        }

        console.log('Starting reward processing with:', {
            guest,
            campaign,
            receiptData
        });

        // Create reward reference
        const rewardRef = admin.database().ref('rewards').push();
        console.log('Created reward reference:', rewardRef.key);

        // Prepare reward data
        const rewardData = {
            // Guest Information
            guestPhone: guest.phoneNumber,
            guestName: guest.name || 'Unknown Guest',
            
            // Campaign Information
            campaignId: campaign.id || rewardRef.key,
            campaignName: campaign.name,
            
            // Receipt Information
            receiptId: receiptData.receiptId,
            receiptAmount: receiptData.totalAmount || 0,
            receiptNumber: receiptData.invoiceNumber || 'Unknown',
            
            // Reward Status
            status: 'pending',
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            
            // Additional tracking
            processedAt: Date.now(),
            processedBy: 'system'
        };

        // Prepare database updates
        const updates = {
            [`rewards/${rewardRef.key}`]: rewardData,
            [`guest-rewards/${guest.phoneNumber}/${rewardRef.key}`]: true,
            [`campaign-rewards/${campaign.id}/${rewardRef.key}`]: true,
            [`receipt-rewards/${receiptData.receiptId}`]: rewardRef.key,
            [`receipts/${receiptData.receiptId}/status`]: 'validated',
            [`receipts/${receiptData.receiptId}/validatedAt`]: admin.database.ServerValue.TIMESTAMP,
            [`receipts/${receiptData.receiptId}/campaignId`]: campaign.id
        };

        // Execute all updates in a single transaction
        await admin.database().ref().update(updates);
        console.log('Successfully processed reward:', rewardRef.key);

        return rewardData;

    } catch (error) {
        console.error('Error in processReward:', error);
        throw error;
    }
}

module.exports = { processReward };