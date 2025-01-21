const admin = require('firebase-admin');
async function processReward(guest, campaign, receiptData) {
    try {
        console.log('Starting reward processing with inputs:', {
            guest,
            campaign,
            receiptData
        });

        // Guest validation
        if (!guest?.phoneNumber) {
            console.error('Invalid guest data:', guest);
            throw new Error('Guest phone number is required');
        }

        // Campaign validation - Check specific required fields
        if (!campaign?.name || !campaign?.startDate || !campaign?.endDate) {
            console.error('Invalid campaign data:', campaign);
            throw new Error('Campaign data is missing required fields');
        }

        // Use campaign name as ID if no explicit ID exists
        const campaignId = campaign.id || campaign.name.replace(/\s+/g, '_').toLowerCase();

        // Receipt validation
        if (!receiptData?.receiptId) {
            console.error('Invalid receipt data:', receiptData);
            throw new Error('Receipt ID is required');
        }

        // Create reward reference
        const rewardRef = admin.database().ref('rewards').push();
        console.log('Created reward reference:', rewardRef.key);

        // Prepare reward data
        const rewardData = {
            // Guest Information
            guestPhone: guest.phoneNumber,
            guestName: guest.name || 'Unknown Guest',
            
            // Campaign Information
            campaignId: campaignId,
            campaignName: campaign.name,
            
            // Receipt Information
            receiptId: receiptData.receiptId,
            receiptAmount: receiptData.totalAmount || 0,
            receiptNumber: receiptData.invoiceNumber || 'Unknown',
            
            // Reward Status
            status: 'pending',
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            
            // Store additional campaign details for reference
            storeName: campaign.storeName || 'All Stores',
            minPurchaseAmount: campaign.minPurchaseAmount || 0
        };

        console.log('Prepared reward data:', rewardData);

        // Prepare database updates
        const updates = {
            [`rewards/${rewardRef.key}`]: rewardData,
            [`guest-rewards/${guest.phoneNumber}/${rewardRef.key}`]: true,
            [`campaign-rewards/${campaignId}/${rewardRef.key}`]: true,
            [`receipt-rewards/${receiptData.receiptId}`]: rewardRef.key,
            [`receipts/${receiptData.receiptId}/status`]: 'validated',
            [`receipts/${receiptData.receiptId}/validatedAt`]: admin.database.ServerValue.TIMESTAMP,
            [`receipts/${receiptData.receiptId}/campaignId`]: campaignId
        };

        // Verify all update paths have defined values
        for (const [path, value] of Object.entries(updates)) {
            if (value === undefined) {
                throw new Error(`Undefined value found for path: ${path}`);
            }
        }

        console.log('Attempting to save updates:', updates);
        await admin.database().ref().update(updates);
        console.log('Successfully saved all updates to database');

        return {
            success: true,
            rewardId: rewardRef.key,
            rewardData
        };

    } catch (error) {
        console.error('Error in processReward:', error);
        console.error('Processing failed with inputs:', {
            guest: guest || 'missing',
            campaign: campaign || 'missing',
            receiptData: receiptData || 'missing'
        });
        throw error;
    }
}

module.exports = { processReward };