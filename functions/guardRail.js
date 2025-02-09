const { REWARD_TYPE_VALIDATION } = require('./constants/campaign.constants');
const admin = require('firebase-admin');
/**
 * Retrieve active campaigns from Firebase
 * @returns {Promise<Array>} List of active campaigns
 */
async function getActiveCampaigns() {
    try {
        const snapshot = await admin.database()
            .ref('campaigns')
            .orderByChild('status')
            .equalTo('active')
            .once('value');
        
        const campaigns = snapshot.val();
        
        if (!campaigns) {
            console.log('No active campaigns found');
            return [];
        }

        // Convert to array and add the key as the campaign ID
        return Object.entries(campaigns).map(([id, campaign]) => ({
            id,
            ...campaign
        }));
    } catch (error) {
        console.error('Error fetching active campaigns:', error);
        return [];
    }
}
/**
 * Match receipt to campaign with enhanced reward type validation
 * @param {object} receiptData - Processed receipt data
 * @returns {Promise<object>} Matching result with campaign and eligible reward types
 */
async function matchReceiptToCampaign(receiptData) {
    try {
        console.log('Starting enhanced receipt-to-campaign matching:', {
            receiptDate: receiptData.date,
            brandName: receiptData.brandName,
            totalAmount: receiptData.totalAmount
        });

        // Basic receipt validation
        //const validationResult = await validateReceipt(receiptData, receiptData.brandName);
        //if (!validationResult.isValid) {
        //    return validationResult;
        //}

        // Get active campaigns
        const activeCampaigns = await getActiveCampaigns();
        if (activeCampaigns.length === 0) {
            return {
                isValid: false,
                error: 'No active campaigns found'
            };
        }

        // Find matching campaigns
        const matchResults = await Promise.all(
            activeCampaigns
                .filter(campaign => campaign.brandName.toLowerCase() === receiptData.brandName.toLowerCase())
                .map(campaign => validateAgainstCampaign(receiptData, campaign))
        );

        // Get successful matches with their reward types
        const successfulMatches = matchResults.filter(result => result.isValid);

        if (successfulMatches.length === 0) {
            return {
                isValid: false,
                error: 'Receipt does not meet any campaign requirements',
                failedCriteria: matchResults.map(result => ({
                    campaignName: result.campaign?.name,
                    reason: result.failureReason
                }))
            };
        }

        // Return the best match (most eligible reward types)
        const bestMatch = successfulMatches.reduce((best, current) => 
            (current.eligibleRewardTypes.length > best.eligibleRewardTypes.length) ? current : best
        );

        return {
            isValid: true,
            campaign: bestMatch.campaign,
            eligibleRewardTypes: bestMatch.eligibleRewardTypes,
            matchedCriteria: bestMatch.matchedCriteria
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
 * Validate receipt against campaign criteria including reward types
 * @param {object} receiptData - Receipt data
 * @param {object} campaign - Campaign to validate against
 * @returns {Promise<object>} Validation result with eligible reward types
 */
async function validateAgainstCampaign(receiptData, campaign) {
    console.log(`Validating receipt against campaign: ${campaign.name}`);
    
    const result = {
        isValid: false,
        campaign,
        eligibleRewardTypes: [],
        matchedCriteria: [],
        failureReason: null
    };

    try {
        // Validate basic campaign criteria
        if (!validateBasicCriteria(receiptData, campaign)) {
            result.failureReason = campaign.lastFailureReason;
            return result;
        }

        // Store validation is a matched criteria if passed
        result.matchedCriteria.push('store_match');

        // Validate campaign date and time criteria
        if (!validateDateTimeCriteria(receiptData, campaign)) {
            result.failureReason = 'Receipt date/time outside campaign window';
            return result;
        }

        result.matchedCriteria.push('date_time_match');

        // Get eligible reward types
        const eligibleTypes = await validateRewardTypes(receiptData, campaign);
        if (eligibleTypes.length === 0) {
            result.failureReason = 'No eligible reward types found';
            return result;
        }

        result.isValid = true;
        result.eligibleRewardTypes = eligibleTypes;
        result.matchedCriteria.push('reward_types_match');

        return result;

    } catch (error) {
        console.error('Error in validateAgainstCampaign:', error);
        result.failureReason = 'Internal validation error';
        return result;
    }
}
/**
 * Validate if all required items are present in the receipt items
 * @param {Array} receiptItems - Items from the receipt
 * @param {Array} requiredItems - Items required by the campaign
 * @returns {boolean} Whether all required items are present
 */
function validateRequiredItems(receiptItems, requiredItems) {
    // If no required items, consider it valid
    if (!requiredItems || requiredItems.length === 0) {
        return true;
    }

    // Check each required item
    return requiredItems.every(requiredItem => {
        // Find a matching item in the receipt
        const matchedItem = receiptItems.find(receiptItem => 
            // Case-insensitive name match
            receiptItem.name.toLowerCase().includes(requiredItem.name.toLowerCase()) &&
            // Check if quantity meets or exceeds required quantity
            receiptItem.quantity >= requiredItem.quantity
        );

        return !!matchedItem;
    });
}
/**
 * Validate basic campaign criteria
 * @private
 */
function validateBasicCriteria(receiptData, campaign) {
    // Store validation
    if (campaign.storeName && 
        campaign.storeName.toLowerCase() !== receiptData.storeName.toLowerCase()) {
        campaign.lastFailureReason = 'Store mismatch';
        return false;
    }

    // Minimum purchase validation
    if (campaign.minPurchaseAmount && 
        receiptData.totalAmount < campaign.minPurchaseAmount) {
        campaign.lastFailureReason = 'Below minimum purchase amount';
        return false;
    }

    // Required items validation
    if (campaign.requiredItems?.length > 0) {
        const hasAllRequired = validateRequiredItems(receiptData.items, campaign.requiredItems);
        if (!hasAllRequired) {
            campaign.lastFailureReason = 'Missing required items';
            return false;
        }
    }

    return true;
}

/**
 * Validate campaign date and time criteria
 * @private
 */
function validateDateTimeCriteria(receiptData, campaign) {
    const receiptDate = new Date(receiptData.date);
    const campaignStart = new Date(campaign.startDate);
    const campaignEnd = new Date(campaign.endDate);

    // Check campaign period
    if (receiptDate < campaignStart || receiptDate > campaignEnd) {
        return false;
    }

    // Check active days
    const receiptDay = receiptDate.getDay();
    if (campaign.activeDays?.length > 0 && 
        !campaign.activeDays.includes(receiptDay)) {
        return false;
    }

    return true;
}

/**
 * Validate reward types criteria and return eligible types
 * @private
 */
async function validateRewardTypes(receiptData, campaign) {
    if (!campaign.rewardTypes?.length) {
        return [];
    }

    const eligibleTypes = [];

    for (const rewardType of campaign.rewardTypes) {
        try {
            if (await validateRewardTypeCriteria(receiptData, rewardType)) {
                eligibleTypes.push(rewardType);
            }
        } catch (error) {
            console.error(`Error validating reward type ${rewardType.typeId}:`, error);
            // Continue with other reward types
        }
    }

    return eligibleTypes;
}

/**
 * Validate specific reward type criteria
 * @private
 */
async function validateRewardTypeCriteria(receiptData, rewardType) {
    const { criteria } = rewardType;

    // Check minimum purchase amount
    if (criteria.minPurchaseAmount !== undefined) {
        if (criteria.minPurchaseAmount < REWARD_TYPE_VALIDATION.MIN_PURCHASE.min) {
            return false;
        }
        if (criteria.minPurchaseAmount > receiptData.totalAmount) {
            return false;
        }
    }

    // Check maximum rewards
    if (criteria.maxRewards !== undefined && criteria.maxRewards !== null) {
        if (criteria.maxRewards < REWARD_TYPE_VALIDATION.MAX_REWARDS.min) {
            return false;
        }
        
        const currentCount = await getUserRewardTypeCount(
            receiptData.guestPhoneNumber, 
            rewardType.typeId
        );
        if (currentCount >= criteria.maxRewards) {
            return false;
        }
    }

    // Check store restrictions
    if (criteria.storeRestrictions?.length > 0) {
        if (criteria.storeRestrictions.length < REWARD_TYPE_VALIDATION.STORE_RESTRICTIONS.minStores) {
            return false;
        }
        if (!criteria.storeRestrictions.includes(receiptData.storeName)) {
            return false;
        }
    }

    // Check required items
    if (criteria.requiredItems?.length > 0) {
        const hasAllItems = criteria.requiredItems.every(required => {
            const receiptItem = receiptData.items.find(
                item => item.name.toLowerCase().includes(required.name.toLowerCase())
            );
            return receiptItem && receiptItem.quantity >= required.quantity;
        });
        if (!hasAllItems) {
            return false;
        }
    }

    // Check time restrictions
    if (criteria.startTime || criteria.endTime) {
        // Validate time format
        const timeFormat = REWARD_TYPE_VALIDATION.TIME_RESTRICTIONS.format;
        const timeRegex = timeFormat === 'HH:mm' ? /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ : null;
        
        if (criteria.startTime && !timeRegex.test(criteria.startTime)) {
            return false;
        }
        if (criteria.endTime && !timeRegex.test(criteria.endTime)) {
            return false;
        }

        if (criteria.startTime && criteria.endTime) {
            const receiptTime = new Date(receiptData.time);
            const [startHour, startMinute] = criteria.startTime.split(':').map(Number);
            const [endHour, endMinute] = criteria.endTime.split(':').map(Number);
            
            if (!isTimeInRange(
                receiptTime,
                { hour: startHour, minute: startMinute },
                { hour: endHour, minute: endMinute }
            )) {
                return false;
            }
        }
    }

    // Validate that all criteria fields are recognized
    const validFields = REWARD_TYPE_VALIDATION.CRITERIA.validFields;
    const criteriaFields = Object.keys(criteria);
    const hasInvalidField = criteriaFields.some(field => !validFields.includes(field));
    if (hasInvalidField) {
        return false;
    }

    return true;
}

/**
 * Get count of specific reward type for user
 * @private
 */
async function getUserRewardTypeCount(phoneNumber, rewardTypeId) {
    const snapshot = await admin.database()
        .ref('guest-rewards')
        .child(phoneNumber)
        .orderByChild('typeId')
        .equalTo(rewardTypeId)
        .once('value');
    
    return snapshot.numChildren();
}

/**
 * Check if time is within specified range
 * @private
 */
function isTimeInRange(time, start, end) {
    const timeValue = time.getHours() * 60 + time.getMinutes();
    const startValue = start.hour * 60 + start.minute;
    const endValue = end.hour * 60 + end.minute;
    
    return timeValue >= startValue && timeValue <= endValue;
}

module.exports = {
    matchReceiptToCampaign,
    validateAgainstCampaign,
    getActiveCampaigns
};