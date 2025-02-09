const { REWARD_TYPE_VALIDATION } = require('./constants/campaign.constants');
const admin = require('firebase-admin');
/**
 * Retrieve active campaigns from Firebase
 * @returns {Promise<Array>} List of active campaigns
 */
async function getActiveCampaigns() {
    try {
        if (!admin.apps.length) {
            throw new Error('Firebase admin not initialized');
        }

        console.log('Fetching active campaigns from database');
        const snapshot = await admin.database()
            .ref('campaigns')
            .orderByChild('status')
            .equalTo('active')
            .once('value');
        
        const campaigns = snapshot.val();
        
        if (!campaigns) {
            console.warn('No active campaigns found in database');
            return [];
        }

        const campaignArray = Object.entries(campaigns).map(([id, campaign]) => ({
            id,
            ...campaign
        }));

        console.log(`Found ${campaignArray.length} active campaigns`);
        return campaignArray;
    } catch (error) {
        console.error('Error fetching active campaigns:', {
            error: error.message,
            stack: error.stack
        });
        throw new Error(`Failed to fetch campaigns: ${error.message}`);
    }
}
/**
 * Match receipt to campaign with enhanced reward type validation
 * @param {object} receiptData - Processed receipt data
 * @returns {Promise<object>} Matching result with campaign and eligible reward types
 */
async function matchReceiptToCampaign(receiptData) {
    try {
        console.log('Starting receipt-to-campaign matching:', {
            receiptDate: receiptData.date,
            brandName: receiptData.brandName,
            totalAmount: receiptData.totalAmount
        });

        // Get active campaigns
        const activeCampaigns = await getActiveCampaigns();
        if (activeCampaigns.length === 0) {
            return {
                isValid: false,
                error: 'No active campaigns found'
            };
        }

        // Find matching campaigns by brand name
        const matchingCampaigns = activeCampaigns.filter(campaign => 
            campaign.brandName.toLowerCase() === receiptData.brandName.toLowerCase()
        );

        if (matchingCampaigns.length === 0) {
            return {
                isValid: false,
                error: 'No campaigns found for this brand'
            };
        }

        // Validate each matching campaign
        const validationResults = await Promise.all(
            matchingCampaigns.map(campaign => validateAgainstCampaign(receiptData, campaign))
        );

        const validMatches = validationResults.filter(result => result.isValid);

        if (validMatches.length === 0) {
            return {
                isValid: false,
                error: 'Receipt does not meet any campaign requirements',
                failedCriteria: validationResults.map(result => ({
                    campaignName: result.campaign?.name,
                    reason: result.failureReason
                }))
            };
        }

        // Return the best match (most eligible reward types)
        const bestMatch = validMatches.reduce((best, current) => 
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
    console.log('Starting validation for campaign:', {
        campaignName: campaign.name,
        campaignId: campaign.id,
        receipt: {
            date: receiptData.date,
            store: receiptData.storeName,
            amount: receiptData.totalAmount,
            items: receiptData.items?.length
        }
    });
    
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
            console.log('Basic criteria validation failed:', {
                campaignName: campaign.name,
                reason: campaign.lastFailureReason,
                receiptStore: receiptData.storeName,
                campaignStore: campaign.storeName,
                receiptAmount: receiptData.totalAmount,
                minRequired: campaign.minPurchaseAmount
            });
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
        console.log('Reward types validation result:', {
            campaignName: campaign.name,
            totalTypes: campaign.rewardTypes?.length || 0,
            eligibleCount: eligibleTypes.length,
            eligibleTypes: eligibleTypes.map(type => ({
                typeId: type.typeId,
                criteria: type.criteria
            }))
        });

        if (eligibleTypes.length === 0) {
            result.failureReason = 'No eligible reward types found';
            console.log('No eligible reward types found for campaign:', {
                campaignName: campaign.name,
                receiptAmount: receiptData.totalAmount,
                rewardTypes: campaign.rewardTypes?.map(type => ({
                    typeId: type.typeId,
                    minPurchase: type.criteria?.minPurchaseAmount,
                    maxRewards: type.criteria?.maxRewards
                }))
            });
            return result;
        }

        result.isValid = true;
        result.eligibleRewardTypes = eligibleTypes;
        result.matchedCriteria.push('reward_types_match');
        
        console.log('Campaign validation successful:', {
            campaignName: campaign.name,
            matchedCriteria: result.matchedCriteria,
            eligibleRewardCount: eligibleTypes.length
        });

        return result;

    } catch (error) {
        console.error('Error in validateAgainstCampaign:', {
            error: error.message,
            campaignName: campaign.name,
            receiptData: {
                date: receiptData.date,
                store: receiptData.storeName,
                amount: receiptData.totalAmount
            }
        });
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
    console.log('Validating basic criteria:', {
        receipt: {
            store: receiptData.storeName,
            amount: receiptData.totalAmount,
            items: receiptData.items?.length
        },
        campaign: {
            name: campaign.name,
            store: campaign.storeName,
            minAmount: campaign.minPurchaseAmount,
            requiredItems: campaign.requiredItems?.length
        }
    });

    // Store validation
    if (campaign.storeName && 
        campaign.storeName.toLowerCase() !== receiptData.storeName.toLowerCase()) {
        campaign.lastFailureReason = 'Store mismatch';
        console.log('Store validation failed:', {
            receiptStore: receiptData.storeName,
            campaignStore: campaign.storeName
        });
        return false;
    }

    // Minimum purchase validation
    if (campaign.minPurchaseAmount && 
        receiptData.totalAmount < campaign.minPurchaseAmount) {
        campaign.lastFailureReason = 'Below minimum purchase amount';
        console.log('Minimum purchase validation failed:', {
            receiptAmount: receiptData.totalAmount,
            requiredAmount: campaign.minPurchaseAmount
        });
        return false;
    }

    // Required items validation
    if (campaign.requiredItems?.length > 0) {
        const hasAllRequired = validateRequiredItems(receiptData.items, campaign.requiredItems);
        if (!hasAllRequired) {
            campaign.lastFailureReason = 'Missing required items';
            console.log('Required items validation failed:', {
                receiptItems: receiptData.items,
                requiredItems: campaign.requiredItems
            });
            return false;
        }
    }

    console.log('Basic criteria validation passed');
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

    console.log('Validating date/time criteria:', {
        receipt: {
            date: receiptDate,
            day: receiptDate.getDay()
        },
        campaign: {
            start: campaignStart,
            end: campaignEnd,
            activeDays: campaign.activeDays
        }
    });

    // Check campaign period
    if (receiptDate < campaignStart || receiptDate > campaignEnd) {
        console.log('Date range validation failed:', {
            receiptDate,
            campaignStart,
            campaignEnd
        });
        return false;
    }

    // Check active days
    const receiptDay = receiptDate.getDay();
    if (campaign.activeDays?.length > 0 && 
        !campaign.activeDays.includes(receiptDay)) {
        console.log('Active days validation failed:', {
            receiptDay,
            activeDays: campaign.activeDays
        });
        return false;
    }

    console.log('Date/time criteria validation passed');
    return true;
}

/**
 * Validate reward types criteria and return eligible types
 * @private
 */
async function validateRewardTypes(receiptData, campaign) {
    console.log('Starting reward types validation:', {
        campaignName: campaign.name,
        rewardTypesCount: campaign.rewardTypes?.length,
        receiptAmount: receiptData.totalAmount
    });

    if (!campaign.rewardTypes?.length) {
        console.log('No reward types defined for campaign');
        return [];
    }

    const eligibleTypes = [];

    for (const rewardType of campaign.rewardTypes) {
        try {
            console.log('Validating reward type:', {
                typeId: rewardType.typeId,
                criteria: rewardType.criteria
            });

            if (await validateRewardTypeCriteria(receiptData, rewardType)) {
                eligibleTypes.push(rewardType);
                console.log('Reward type eligible:', rewardType.typeId);
            } else {
                console.log('Reward type not eligible:', {
                    typeId: rewardType.typeId,
                    reason: 'Failed criteria validation'
                });
            }
        } catch (error) {
            console.error('Error validating reward type:', {
                typeId: rewardType.typeId,
                error: error.message
            });
        }
    }

    console.log('Reward types validation complete:', {
        totalTypes: campaign.rewardTypes.length,
        eligibleCount: eligibleTypes.length
    });

    return eligibleTypes;
}

/**
 * Validate specific reward type criteria
 * @private
 */
async function validateRewardTypeCriteria(receiptData, rewardType) {
    if (!receiptData || !rewardType) {
        console.error('Invalid input for reward type validation:', {
            hasReceiptData: !!receiptData,
            hasRewardType: !!rewardType
        });
        return false;
    }

    if (!rewardType.criteria) {
        console.error('Missing criteria in reward type:', rewardType.typeId);
        return false;
    }

    const { criteria } = rewardType;
    console.log('Validating reward type criteria:', {
        typeId: rewardType.typeId,
        criteria,
        receiptAmount: receiptData.totalAmount
    });

    try {
        // Validate minimum purchase
        if (!await validateMinimumPurchase(criteria, receiptData)) return false;

        // Validate maximum rewards
        if (!await validateMaximumRewards(criteria, receiptData, rewardType)) return false;

        console.log('Reward type criteria validation passed:', rewardType.typeId);
        return true;
    } catch (error) {
        console.error('Error in reward type validation:', {
            typeId: rewardType.typeId,
            error: error.message,
            stack: error.stack
        });
        return false;
    }
}

async function validateMinimumPurchase(criteria, receiptData) {
    if (criteria.minPurchaseAmount !== undefined) {
        if (typeof criteria.minPurchaseAmount !== 'number') {
            console.error('Invalid minPurchaseAmount type:', typeof criteria.minPurchaseAmount);
            return false;
        }

        if (criteria.minPurchaseAmount < REWARD_TYPE_VALIDATION.MIN_PURCHASE.min) {
            console.error('Invalid minimum purchase amount in criteria:', {
                minAmount: criteria.minPurchaseAmount,
                allowedMin: REWARD_TYPE_VALIDATION.MIN_PURCHASE.min
            });
            return false;
        }

        if (criteria.minPurchaseAmount > receiptData.totalAmount) {
            console.log('Receipt amount below minimum required:', {
                receiptAmount: receiptData.totalAmount,
                requiredAmount: criteria.minPurchaseAmount
            });
            return false;
        }
    }
    return true;
}

async function validateMaximumRewards(criteria, receiptData, rewardType) {
    if (criteria.maxRewards !== undefined && criteria.maxRewards !== null) {
        if (typeof criteria.maxRewards !== 'number') {
            console.error('Invalid maxRewards type:', typeof criteria.maxRewards);
            return false;
        }

        if (criteria.maxRewards < REWARD_TYPE_VALIDATION.MAX_REWARDS.min) {
            console.error('Invalid maximum rewards in criteria:', {
                maxRewards: criteria.maxRewards,
                allowedMin: REWARD_TYPE_VALIDATION.MAX_REWARDS.min
            });
            return false;
        }

        try {
            if (!receiptData.guestPhoneNumber) {
                console.error('Missing guest phone number for reward count check');
                return false;
            }

            const currentCount = await getUserRewardTypeCount(
                receiptData.guestPhoneNumber, 
                rewardType.typeId
            );

            console.log('Checking max rewards limit:', {
                currentCount,
                maxAllowed: criteria.maxRewards,
                guestPhone: receiptData.guestPhoneNumber
            });
            
            if (currentCount >= criteria.maxRewards) {
                console.log('Max rewards limit reached');
                return false;
            }
        } catch (error) {
            console.error('Error checking user reward count:', error);
            return false;
        }
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