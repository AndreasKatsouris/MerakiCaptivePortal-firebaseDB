const { firebaseConfig } = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { fetchCampaigns } = require('./campaigns');



/**
 * Brand-specific validation rules
 */
const brandValidationRules = {
    // Ocean Basket specific rules
    'Ocean Basket': {
        validateItems: (items) => {
            // Ocean Basket specific item validation
            return items.every(item => {
                return item.name && item.quantity && item.price;
            });
        },
        validateTotal: (total) => {
            // Ocean Basket specific total validation
            return total > 0 && total < 10000; // Example range
        },
        validateStore: (storeName) => {
            // Ocean Basket specific store validation
            return storeName.toLowerCase().includes('ocean basket');
        }
    },
    // Add rules for other brands here
    'DEFAULT': {
        validateItems: (items) => true,
        validateTotal: (total) => total > 0,
        validateStore: (storeName) => true
    }
};


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
        // Get brand-specific validation rules
        const rules = brandValidationRules[brandName] || brandValidationRules['DEFAULT'];
        // Basic validation checks
        if (!receiptData.brandName || !receiptData.storeName) {
            return {
                isValid: false,
                error: 'Missing brand or store information'
            };
        }

        // Validate store name
        if (!rules.validateStore(receiptData.storeName)) {
            return {
                isValid: false,
                error: 'Invalid store name for brand'
            };
        }        
        
        
        
        // Get all active campaigns
        const campaigns = await fetchCampaigns();
        console.log('All campaigns:', JSON.stringify(campaigns, null, 2));

        // Filter active campaigns for matching brand
        const matchingCampaigns = campaigns.filter(campaign => {
            return campaign.brandName.toLowerCase() === brandName.toLowerCase() &&
                   campaign.status === 'active';
        });

        if (!matchingCampaigns.length) {
            return {
                isValid: false,
                error: 'No active campaigns found for this brand'
            };
        }

        // Campaign-specific validation
        for (const campaign of matchingCampaigns) {
            // Validate date range
            const receiptDate = new Date(receiptData.date);
            const campaignStart = new Date(campaign.startDate);
            const campaignEnd = new Date(campaign.endDate);

            if (receiptDate >= campaignStart && receiptDate <= campaignEnd) {
                // Validate required items if specified
                if (campaign.requiredItems && campaign.requiredItems.length > 0) {
                    const hasRequiredItems = validateRequiredItems(receiptData.items, campaign.requiredItems);
                    if (hasRequiredItems) {
                        return {
                            isValid: true,
                            campaign: campaign,
                            receiptData: receiptData
                        };
                    }
                } else {
                    // If no specific items required, validate total amount
                    if (rules.validateTotal(receiptData.totalAmount)) {
                        return {
                            isValid: true,
                            campaign: campaign,
                            receiptData: receiptData
                        };
                    }
                }
            }
        }

        return {
            isValid: false,
            error: 'Receipt does not meet campaign requirements'
        };

    } catch (error) {
        console.error('Error in validateReceipt:', error);
        return {
            isValid: false,
            error: 'Error validating receipt'
        };
    }
}

/**
 * Helper function to validate required items
 */
function validateRequiredItems(receiptItems, requiredItems) {
    return requiredItems.every(required => {
        const matching = receiptItems.filter(item => 
            item.name.toLowerCase().includes(required.name.toLowerCase())
        );
        const totalQuantity = matching.reduce((sum, item) => sum + (item.quantity || 0), 0);
        return totalQuantity >= required.quantity;
    });
}

module.exports = { validateReceipt };