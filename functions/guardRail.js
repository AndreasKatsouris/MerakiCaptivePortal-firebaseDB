const { fetchCampaigns } = require('./campaigns');

/**
 * Brand-specific validation rules
 */
const brandValidationRules = {
    'Ocean Basket': {
        validateItems: (items) => {
            return items && items.every(item => item.name && item.quantity && item.price);
        },
        validateTotal: (total) => total > 0 && total < 10000,
        validateStore: (storeName) => storeName.toLowerCase().includes('ocean basket')
    },
    'DEFAULT': {
        validateItems: (items) => true,
        validateTotal: (total) => total > 0,
        validateStore: (storeName) => true
    }
};

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

        // Basic validation first
        const validationResult = await validateReceipt(receiptData, receiptData.brandName);
        if (!validationResult.isValid) {
            return validationResult;
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

        // No campaigns matched
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
    try {
        const campaigns = await fetchCampaigns();
        const now = new Date();
        
        return campaigns.filter(campaign => {
            const startDate = new Date(campaign.startDate);
            const endDate = new Date(campaign.endDate);
            return campaign.status === 'active' && 
                   startDate <= now && 
                   endDate >= now;
        });
    } catch (error) {
        console.error('Error fetching active campaigns:', error);
        return [];
    }
}

/**
 * Validate receipt data against brand rules and basic requirements
 * @param {object} receiptData - Receipt data to validate
 * @param {string} brandName - Brand name for validation rules
 * @returns {Promise<object>} Validation result
 */
async function validateReceipt(receiptData, brandName) {
    try {
        console.log('Starting receipt validation for brand:', brandName);
        
        // Get brand-specific validation rules
        const rules = brandValidationRules[brandName] || brandValidationRules['DEFAULT'];

        // Check required fields
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
        const receiptDate = parseReceiptDate(receiptData.date);
        if (!receiptDate.isValid) {
            return {
                isValid: false,
                error: receiptDate.error
            };
        }

        // Validate total amount
        if (!rules.validateTotal(receiptData.totalAmount)) {
            return {
                isValid: false,
                error: 'Invalid total amount'
            };
        }

        // If we get here, basic validation passed
        return {
            isValid: true,
            receiptDate: receiptDate.date
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
 * Parse receipt date handling multiple formats
 * @param {string} dateStr - Date string from receipt
 * @returns {object} Parsing result with date object if successful
 */
function parseReceiptDate(dateStr) {
    try {
        let date;
        
        // Handle DD/MM/YYYY format
        if (dateStr?.includes('/')) {
            const [day, month, year] = dateStr.split('/');
            date = new Date(year, month - 1, day);
        } else {
            date = new Date(dateStr);
        }

        if (isNaN(date)) {
            return {
                isValid: false,
                error: 'Invalid date format'
            };
        }

        return {
            isValid: true,
            date: date
        };
    } catch (error) {
        return {
            isValid: false,
            error: 'Error parsing date'
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

    // Check store specificity
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

    // Check required items
    if (campaign.requiredItems?.length > 0) {
        const hasAllRequired = validateRequiredItems(receiptData.items, campaign.requiredItems);
        if (!hasAllRequired) {
            campaign.lastFailureReason = 'Missing required items';
            return { isValid: false };
        }
        matchedCriteria.push('Required items found');
    }

    // Check date range and active days
    const receiptDate = parseReceiptDate(receiptData.date).date;
    const campaignStart = new Date(campaign.startDate);
    const campaignEnd = new Date(campaign.endDate);
    
    // Check if receipt date is within campaign period
    if (receiptDate < campaignStart || receiptDate > campaignEnd) {
        campaign.lastFailureReason = 'Receipt date outside campaign period';
        return { isValid: false };
    }

    // Check if receipt day matches campaign active days
    const receiptDay = receiptDate.getDay(); // 0-6, where 0 is Sunday
    if (campaign.activeDays && campaign.activeDays.length > 0) {
        if (!campaign.activeDays.includes(receiptDay)) {
            campaign.lastFailureReason = 'Receipt day not in campaign active days';
            return { isValid: false };
        }
        matchedCriteria.push('Receipt day matches campaign active days');
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
function validateRequiredItems(receiptItems = [], requiredItems = []) {
    if (!Array.isArray(receiptItems) || !Array.isArray(requiredItems)) {
        return false;
    }

    return requiredItems.every(required => {
        const requiredName = required.name.toLowerCase();
        const matches = receiptItems.filter(item => 
            item.name.toLowerCase().includes(requiredName)
        );
        const totalQuantity = matches.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        return totalQuantity >= required.quantity;
    });
}

/**
 * Validate campaign data
 * @param {object} campaignData - Campaign data to validate
 * @returns {string[]} Array of validation errors
 */
function validateCampaignData(campaignData) {
    const errors = [];
    
    if (!campaignData.name?.trim()) errors.push('Campaign name is required');
    if (!campaignData.brandName?.trim()) errors.push('Brand name is required');
    if (!campaignData.startDate) errors.push('Start date is required');
    if (!campaignData.endDate) errors.push('End date is required');
    
    // Validate dates
    const startDate = new Date(campaignData.startDate);
    const endDate = new Date(campaignData.endDate);
    if (endDate < startDate) errors.push('End date must be after start date');
    
    // Validate minimum purchase amount if provided
    if (campaignData.minPurchaseAmount !== null && 
        (isNaN(parseFloat(campaignData.minPurchaseAmount)) || 
         parseFloat(campaignData.minPurchaseAmount) < 0)) {
        errors.push('Minimum purchase amount must be a positive number');
    }
    
    // Validate active days if provided
    if (campaignData.activeDays && Array.isArray(campaignData.activeDays)) {
        const validDays = campaignData.activeDays.every(day => 
            Number.isInteger(day) && day >= 0 && day <= 6
        );
        if (!validDays) errors.push('Invalid active days selected');
    }

    return errors;
}

// Export all necessary functions
module.exports = {
    matchReceiptToCampaign,
    validateReceipt,
    validateAgainstCampaign,
    validateRequiredItems,
    parseReceiptDate,
    getActiveCampaigns,
    validateCampaignData,
};