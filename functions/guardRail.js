const { firebaseConfig } = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { fetchCampaigns } = require('./campaigns');

/**
 * Validate receipt against campaign criteria
 * @param {object} receiptData - Parsed receipt data
 * @param {string} brandName - Brand name for validation
 * @returns {object} - Validation result
 */
async function validateReceipt(receiptData, brandName) {
    try {
        console.log('Starting receipt validation for brand:', brandName);
        console.log('Receipt data:', JSON.stringify(receiptData, null, 2));

        // Get all active campaigns
        const campaigns = await fetchCampaigns();
        console.log('All campaigns:', JSON.stringify(campaigns, null, 2));

        // Filter active campaigns for matching brand
        const matchingCampaigns = campaigns.filter(campaign => {
            const campaignBrandName = campaign.brandName.toLowerCase().replace(/\s+/g, '');
            const receiptStoreName = receiptData.storeName.toLowerCase().replace(/\s+/g, '');
            return receiptStoreName.includes(campaignBrandName);
        });

        console.log('Matching campaigns found:', matchingCampaigns);

        if (!matchingCampaigns.length) {
            return {
                isValid: false,
                error: 'No matching campaigns found for this store'
            };
        }

        // Try to validate against each matching campaign
        for (const campaign of matchingCampaigns) {
            console.log('Checking campaign:', campaign.name);

            // Check campaign status
            if (campaign.status !== 'active') {
                console.log('Campaign not active, skipping');
                continue;
            }

            // Check date range
            const receiptDate = new Date(receiptData.date);
            const campaignStart = new Date(campaign.startDate);
            const campaignEnd = new Date(campaign.endDate);

            if (receiptDate < campaignStart || receiptDate > campaignEnd) {
                console.log('Receipt date outside campaign period, skipping');
                continue;
            }

            // Check required items
            if (campaign.requiredItems && campaign.requiredItems.length > 0) {
                let allItemsFound = true;
                
                for (const requiredItem of campaign.requiredItems) {
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

                    console.log('Matching items for', requiredItem.name, ':', matchingItems);

                    const totalQuantity = matchingItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
                    console.log('Total quantity found:', totalQuantity, 'Required:', requiredItem.quantity);

                    if (totalQuantity < requiredItem.quantity) {
                        allItemsFound = false;
                        break;
                    }
                }

                if (allItemsFound) {
                    console.log('Found valid campaign match:', campaign.name);
                    return {
                        isValid: true,
                        campaign: campaign,
                        receiptData: receiptData
                    };
                }
            }
        }

        return {
            isValid: false,
            error: 'No matching campaign requirements found'
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