const admin = require('firebase-admin');

async function processReward(guest, campaign, receiptData) {
    try {
        // Input validation with detailed error messages
        if (!guest || !guest.phoneNumber) {
            console.error('Invalid guest data:', guest);
            throw new Error('Guest data is missing or invalid');
        }

        if (!campaign || !campaign.id) {
            console.error('Invalid campaign data:', campaign);
            throw new Error('Campaign data is missing or invalid');
        }

        if (!receiptData || !receiptData.receiptId) {
            console.error('Invalid receipt data:', receiptData);
            throw new Error('Receipt data is missing or invalid');
        }

        console.log('Starting reward processing with:', {
            guest: guest,
            campaign: campaign,
            receiptData: receiptData
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
            campaignId: campaign.id,
            campaignName: campaign.name,
            
            // Receipt Information
            receiptId: receiptData.receiptId,
            receiptAmount: receiptData.totalAmount || 0,
            receiptNumber: receiptData.invoiceNumber || 'Unknown',
            
            // Reward Status
            status: 'pending',
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP
        };

        console.log('Prepared reward data:', rewardData);

        // Prepare database updates
        const updates = {};
        
        try {
            // Only include defined values in the updates
            if (rewardRef.key) {
                updates[`rewards/${rewardRef.key}`] = rewardData;
                console.log('Added reward data to updates');
            }
            
            if (guest.phoneNumber) {
                updates[`guest-rewards/${guest.phoneNumber}/${rewardRef.key}`] = true;
                console.log('Added guest index to updates');
            }
            
            if (campaign.id) {
                updates[`campaign-rewards/${campaign.id}/${rewardRef.key}`] = true;
                console.log('Added campaign index to updates');
            }
            
            if (receiptData.receiptId) {
                updates[`receipt-rewards/${receiptData.receiptId}`] = rewardRef.key;
                
                // Update receipt status and campaign reference
                updates[`receipts/${receiptData.receiptId}/status`] = 'validated';
                updates[`receipts/${receiptData.receiptId}/validatedAt`] = admin.database.ServerValue.TIMESTAMP;
                if (campaign.id) {  // Only add campaignId if it exists
                    updates[`receipts/${receiptData.receiptId}/campaignId`] = campaign.id;
                }
                console.log('Added receipt status updates');
            }

            console.log('Final updates object:', updates);
            
            // Verify all update paths have defined values
            for (const [path, value] of Object.entries(updates)) {
                if (value === undefined) {
                    throw new Error(`Undefined value found for path: ${path}`);
                }
            }

            console.log('Attempting to save all updates to database...');
            await admin.database().ref().update(updates);
            console.log('Successfully saved all updates to database');

            return {
                success: true,
                rewardId: rewardRef.key,
                rewardData
            };

        } catch (dbError) {
            console.error('Database error while saving updates:', dbError);
            console.error('Updates that failed:', JSON.stringify(updates, null, 2));
            throw new Error(`Database error: ${dbError.message}`);
        }

    } catch (error) {
        console.error('Error in processReward:', error);
        console.error('Error details:', {
            error: error,
            stack: error.stack,
            guest: guest ? 'present' : 'missing',
            campaign: campaign ? 'present' : 'missing',
            receiptData: receiptData ? 'present' : 'missing'
        });
        throw error;
    }
}

module.exports = { processReward };