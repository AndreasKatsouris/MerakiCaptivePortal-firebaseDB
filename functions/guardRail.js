const { firebaseConfig } = require('firebase-functions/v1');
const { getCampaignDetails } = require('./campaigns');

/**
 * Validate receipt against campaign criteria
 * @param {object} receiptData - Parsed receipt data
 * @param {string} campaignName - Campaign name for validation
 * @returns {boolean} - Whether the receipt is valid
 */
async function validateReceipt(receiptData, campaignName) {
    try {
        // Get campaign details
        const campaign = await getCampaignDetails(campaignName);
        if (!campaign) {
            return {
                isValid: false,
                error: 'Campaign not found'
            };
        }

        // Check for duplicate invoice
        if (receiptData.invoiceNumber) {
            const processedReceiptsRef = firebase.database().ref('processedReceipts');
            const snapshot = await processedReceiptsRef
                .orderByChild('invoiceNumber')
                .equalTo(receiptData.invoiceNumber)
                .once('value');
            
            if (snapshot.exists()) {
                return {
                    isValid: false,
                    error: 'This receipt has already been submitted'
                };
            }
        }

        // Validate brand name
        if (!receiptData.storeName.toLowerCase().includes(campaign.brandName.toLowerCase())) {
            return {
                isValid: false,
                error: 'Receipt is not from the correct store'
            };
        }

        // Validate receipt date is within campaign period
        const receiptDate = new Date(receiptData.date);
        const campaignStart = new Date(campaign.startDate);
        const campaignEnd = new Date(campaign.endDate);

        if (receiptDate < campaignStart || receiptDate > campaignEnd) {
            return {
                isValid: false,
                error: 'Receipt date is outside campaign period'
            };
        }

        // Validate minimum purchase amount if specified
        if (campaign.minPurchaseAmount && receiptData.totalAmount < campaign.minPurchaseAmount) {
            return {
                isValid: false,
                error: `Purchase amount does not meet minimum requirement of R${campaign.minPurchaseAmount}`
            };
        }

        // Validate store location if specified
        if (campaign.validLocations && campaign.validLocations.length > 0) {
            const locationMatch = campaign.validLocations.some(location => 
                receiptData.storeLocation.toLowerCase().includes(location.toLowerCase())
            );
            if (!locationMatch) {
                return {
                    isValid: false,
                    error: 'Store location is not participating in this campaign'
                };
            }
        }

        return {
            isValid: true,
            receiptData: receiptData
        };

    } catch (error) {
        console.error('Error validating receipt:', error);
        return {
            isValid: false,
            error: 'Error validating receipt'
        };
    }
}
module.exports = { validateReceipt };
