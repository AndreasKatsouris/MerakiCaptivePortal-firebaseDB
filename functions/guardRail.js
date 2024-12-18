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

        // Validate required items
        if (campaign.requiredItems && campaign.requiredItems.length > 0) {
            const validationResult = validateRequiredItems(receiptData.items, campaign.requiredItems);
            if (!validationResult.isValid) {
                return validationResult;
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
function validateRequiredItems(receiptItems, requiredItems) {
        // Validate required items if specified in campaign
        if (campaign.requiredItems && campaign.requiredItems.length > 0) {
            // Check if receipt has items
            if (!receiptData.items || receiptData.items.length === 0) {
                return {
                    isValid: false,
                    error: 'Receipt has no items to check against requirements'
                };
            }    
    for (const requiredItem of requiredItems) {
        // Find matching items on receipt (case insensitive, partial match)
        const matchingItems = receiptItems.filter(item => 
            item.name.toLowerCase().includes(requiredItem.name.toLowerCase())
        );

        // Sum quantities of matching items
        const totalQuantity = matchingItems.reduce((sum, item) => sum + item.quantity, 0);

        if (totalQuantity < requiredItem.quantity) {
            return {
                isValid: false,
                error: `Receipt does not contain required item: ${requiredItem.name} (quantity: ${requiredItem.quantity})`
            };
        }
    }

    return { isValid: true };
}

}
module.exports = { validateReceipt };
