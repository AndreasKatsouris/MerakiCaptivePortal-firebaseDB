const { fetchCampaigns } = require('./campaigns');

/**
 * Main function to match a receipt to available campaigns
 * @param {object} receiptData - Processed receipt data
 * @returns {Promise<object>} Matching result with campaign if found
 */
async function matchReceiptToCampaign(receiptData) {
    try {
        console.log('Starting receipt-to-campaign matching:', {
            receiptDate: receiptData.date,
            brandName: receiptData.brandName,
            totalAmount: receiptData.totalAmount
        });

        // Validate receipt data first
        const validationError = validateReceiptData(receiptData);
        if (validationError) {
            return {
                isValid: false,
                error: validationError
            };
        }

        // Get active campaigns
        const activeCampaigns = await getActiveCampaigns();
        if (activeCampaigns.length === 0) {
            return {
                isValid: false,
                error: 'No active campaigns found'
            };
        }

        // Find matching campaigns for the receipt's brand
        const brandCampaigns = activeCampaigns.filter(campaign => 
            campaign.brandName.toLowerCase() === receiptData.brandName.toLowerCase()
        );

        if (brandCampaigns.length === 0) {
            return {
                isValid: false,
                error: `No active campaigns found for ${receiptData.brandName}`
            };
        }

        console.log(`Found ${brandCampaigns.length} potential matching campaigns`);

        // Try to match receipt against each campaign's criteria
        for (const campaign of brandCampaigns) {
            const matchResult = await validateAgainstCampaign(receiptData, campaign);
            if (matchResult.isValid) {
                return {
                    isValid: true,
                    campaign: campaign,
                    receiptData: receiptData,
                    matchedCriteria: matchResult.matchedCriteria
                };
            }
        }

        // If we get here, no campaigns matched
        return {
            isValid: false,
            error: 'Receipt does not meet any campaign requirements',
            failedCriteria: brandCampaigns.map(campaign => ({
                campaignName: campaign.name,
                reason: campaign.lastFailureReason
            }))
        };

    } catch (error) {
        console.error('Error in matchReceiptToCampaign:', error);
        return {
            isValid: false,
            error: 'Internal error while matching receipt to campaigns'
        };
    }
}

/**
 * Get list of currently active campaigns
 * @returns {Promise<Array>} List of active campaigns
 */
async function getActiveCampaigns() {
    const campaigns = await fetchCampaigns();
    const now = new Date();
    
    return campaigns.filter(campaign => {
        const startDate = new Date(campaign.startDate);
        const endDate = new Date(campaign.endDate);
        return campaign.status === 'active' && 
               startDate <= now && 
               endDate >= now;
    });
}

/**
 * Validate basic receipt data structure
 * @param {object} receiptData - Receipt data to validate
 * @returns {string|null} Error message if invalid, null if valid
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

        // Parse and validate the receipt date
        let receiptDate;
        try {
            // Handle DD/MM/YYYY format
            if (receiptData.date?.includes('/')) {
                const [day, month, year] = receiptData.date.split('/');
                receiptDate = new Date(year, month - 1, day);
            } else {
                receiptDate = new Date(receiptData.date);
            }

            if (isNaN(receiptDate)) {
                throw new Error('Invalid date format');
            }
        } catch (error) {
            return {
                isValid: false,
                error: 'Invalid receipt date format'
            };
        }

        // Get active campaigns
        const campaigns = await fetchCampaigns();
        console.log('Found campaigns:', campaigns.length);

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
 * Validate receipt against specific campaign criteria
 * @param {object} receiptData - Receipt data to validate
 * @param {object} campaign - Campaign to validate against
 * @returns {Promise<object>} Validation result
 */
async function validateAgainstCampaign(receiptData, campaign) {
    console.log(`Validating receipt against campaign: ${campaign.name}`);
    
    const matchedCriteria = [];
    campaign.lastFailureReason = null;

    // Check store specificity if campaign is store-specific
    if (campaign.storeName && 
        campaign.storeName.toLowerCase() !== receiptData.storeName.toLowerCase()) {
        campaign.lastFailureReason = 'Store mismatch';
        return { isValid: false };
    }
    
    // Check minimum purchase amount
    if (campaign.minPurchaseAmount && 
        receiptData.totalAmount < campaign.minPurchaseAmount) {
        campaign.lastFailureReason = 'Below minimum purchase amount';
        return { isValid: false };
    }

    // Check required items if specified
    if (campaign.requiredItems && campaign.requiredItems.length > 0) {
        const hasAllRequired = validateRequiredItems(receiptData.items, campaign.requiredItems);
        if (!hasAllRequired) {
            campaign.lastFailureReason = 'Missing required items';
            return { isValid: false };
        }
        matchedCriteria.push('Required items found');
    }

    // Check date range
    const receiptDate = new Date(receiptData.date);
    const campaignStart = new Date(campaign.startDate);
    const campaignEnd = new Date(campaign.endDate);
    
    if (receiptDate < campaignStart || receiptDate > campaignEnd) {
        campaign.lastFailureReason = 'Receipt date outside campaign period';
        return { isValid: false };
    }
    matchedCriteria.push('Date within campaign period');

    return {
        isValid: true,
        matchedCriteria
    };
}

/**
 * Validate required items are present in receipt
 * @param {Array} receiptItems - Items from receipt
 * @param {Array} requiredItems - Required items from campaign
 * @returns {boolean} Whether all required items are present
 */
function validateRequiredItems(receiptItems, requiredItems) {
    return requiredItems.every(required => {
        // Convert both to lowercase for case-insensitive matching
        const requiredName = required.name.toLowerCase();
        
        // Find all matching items in receipt
        const matches = receiptItems.filter(item => 
            item.name.toLowerCase().includes(requiredName)
        );

        // Calculate total quantity of matching items
        const totalQuantity = matches.reduce((sum, item) => sum + (item.quantity || 0), 0);
        
        // Check if total quantity meets requirement
        return totalQuantity >= required.quantity;
    });
}

module.exports = {
    matchReceiptToCampaign,
    validateReceiptData,
    validateAgainstCampaign,
    validateRequiredItems
};