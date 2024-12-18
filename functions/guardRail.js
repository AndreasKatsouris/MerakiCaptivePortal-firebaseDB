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
        console.log('Starting receipt validation for campaign:', campaignName);
        console.log('Receipt data:', receiptData);

        // Get campaign details
        const campaign = await getCampaignDetails(campaignName);
        console.log('Campaign details:', campaign);

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
        const receiptStoreName = receiptData.storeName.toLowerCase().replace(/\s+/g, '');
        const campaignBrandName = campaign.brandName.toLowerCase().replace(/\s+/g, '');
        
        console.log('Comparing store names:', { receipt: receiptStoreName, campaign: campaignBrandName });
        
        if (!receiptStoreName.includes(campaignBrandName)) {
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
            // Check if receipt has items
            if (!receiptData.items || receiptData.items.length === 0) {
                return {
                    isValid: false,
                    error: 'Receipt has no items to check against requirements'
                };
            }

            console.log('Checking required items:', campaign.requiredItems);
            console.log('Receipt items:', receiptData.items);

            for (const requiredItem of campaign.requiredItems) {
                // Find matching items in receipt (case insensitive and more flexible matching)
                const matchingItems = receiptData.items.filter(item => {
                    const receiptItemName = item.name.toLowerCase().replace(/\s+/g, '');
                    const requiredItemName = requiredItem.name.toLowerCase().replace(/\s+/g, '');
                    console.log('Comparing items:', {
                        receiptItem: receiptItemName,
                        requiredItem: requiredItemName
                    });
                    return receiptItemName.includes(requiredItemName) || 
                           requiredItemName.includes(receiptItemName);
                });

                console.log('Matching items found:', matchingItems);

                // Sum up quantities of matching items
                const totalQuantity = matchingItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
                console.log('Total quantity found:', totalQuantity, 'Required:', requiredItem.quantity);

                if (totalQuantity < requiredItem.quantity) {
                    return {
                        isValid: false,
                        error: `Receipt does not contain required item: ${requiredItem.name} (need ${requiredItem.quantity}, found ${totalQuantity})`
                    };
                }
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