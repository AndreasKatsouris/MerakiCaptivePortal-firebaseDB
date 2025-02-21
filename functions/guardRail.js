const { REWARD_TYPE_VALIDATION } = require('./constants/campaign.constants');
const { 
    rtdb, 
    ref, 
    get, 
    set, 
    update,
    push 
} = require('./config/firebase-config.js');

/**
 * Retrieves all active campaigns from the database
 * @async
 * @function getActiveCampaigns
 * @returns {Promise<Array>} Array of active campaign objects
 * @throws {Error} If Firebase admin is not initialized or database operation fails
 */
async function getActiveCampaigns() {
    try {
        console.log('Fetching active campaigns from database');
        const campaignsRef = ref(rtdb, 'campaigns');
        console.log('Database path:', campaignsRef.toString());
        const snapshot = await get(campaignsRef);
        
        const campaigns = snapshot.val();
        
        if (!campaigns) {
            console.warn('No campaigns found in database');
            return [];
        }

        console.log('Raw campaigns data:', campaigns);

        const campaignArray = Object.entries(campaigns)
            .filter(([_, campaign]) => {
                if (!campaign.status) {
                    console.log(`Campaign ${campaign.name || 'unnamed'} has no status field`);
                    return false;
                }
                const isActive = campaign.status === 'active';
                if (!isActive) {
                    console.log(`Campaign ${campaign.name || 'unnamed'} skipped: status is ${campaign.status}`);
                }
                return isActive;
            })
            .map(([id, campaign]) => ({
                id,
                ...campaign
            }));

        console.log('Found active campaigns:', 
            campaignArray.map(c => ({
                id: c.id,
                name: c.name,
                brandName: c.brandName,
                status: c.status
            }))
        );
        return campaignArray;
    } catch (error) {
        console.error('Error fetching active campaigns:', error);
        throw new Error('Failed to fetch active campaigns');
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
        const matchingCampaigns = activeCampaigns.filter(campaign => {
            const receiptBrand = receiptData.brandName.toLowerCase();
            const campaignBrand = campaign.brandName.toLowerCase();
            const matches = campaignBrand === receiptBrand;
            if (!matches) {
                console.log(`Campaign ${campaign.name} (${campaign.brandName}) did not match receipt brand: ${receiptData.brandName}`);
            }
            return matches;
        });

        if (matchingCampaigns.length === 0) {
            console.log('No brand matches found. Receipt brand:', receiptData.brandName);
            console.log('Available campaign brands:', activeCampaigns.map(c => c.brandName).join(', '));
            return {
                isValid: false,
                error: 'No campaigns found for this brand'
            };
        }

        console.log(`Found ${matchingCampaigns.length} brand matches:`, 
            matchingCampaigns.map(c => ({
                id: c.id,
                name: c.name,
                brandName: c.brandName
            }))
        );

        // Validate each matching campaign
        const validationResults = await Promise.all(
            matchingCampaigns.map(campaign => validateAgainstCampaign(receiptData, campaign))
        );

        const validMatches = validationResults.filter(result => result.isValid);

        if (validMatches.length === 0) {
            console.log('All campaigns failed validation. Reasons:', 
                validationResults.map(result => ({
                    campaignName: result.campaign?.name,
                    reason: result.failureReason
                }))
            );
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
    // Create a clean copy of campaign data without receipt data
    const cleanCampaign = {
        id: campaign.id,
        name: campaign.name,
        brandName: campaign.brandName,
        storeName: campaign.storeName,
        status: campaign.status,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        rewardTypes: campaign.rewardTypes
    };

    console.log('Starting validation for campaign:', {
        campaignName: cleanCampaign.name,
        campaignId: cleanCampaign.id,
        receipt: {
            date: receiptData.date,
            store: receiptData.storeName,
            amount: receiptData.totalAmount,
            items: receiptData.items?.length
        }
    });
    
    const result = {
        isValid: false,
        campaign: cleanCampaign,
        eligibleRewardTypes: [],
        matchedCriteria: [],
        failureReason: null
    };

    try {
        // Validate basic campaign criteria
        if (!validateBasicCriteria(receiptData, cleanCampaign)) {
            result.failureReason = cleanCampaign.lastFailureReason;
            console.log('Basic criteria validation failed:', {
                campaignName: cleanCampaign.name,
                reason: cleanCampaign.lastFailureReason,
                receiptStore: receiptData.storeName,
                campaignStore: cleanCampaign.storeName,
                receiptAmount: receiptData.totalAmount,
                minRequired: cleanCampaign.minPurchaseAmount
            });
            return result;
        }

        // Store validation is a matched criteria if passed
        result.matchedCriteria.push('store_match');

        // Validate campaign date and time criteria
        if (!validateDateTimeCriteria(receiptData, cleanCampaign)) {
            result.failureReason = 'Receipt date/time outside campaign window';
            return result;
        }

        result.matchedCriteria.push('date_time_match');

        // Get eligible reward types
        const eligibleTypes = await validateRewardTypes(receiptData, cleanCampaign);
        console.log('Reward types validation result:', {
            campaignName: cleanCampaign.name,
            totalTypes: cleanCampaign.rewardTypes?.length || 0,
            eligibleCount: eligibleTypes.length,
            eligibleTypes: eligibleTypes.map(type => ({
                typeId: type.typeId,
                criteria: type.criteria
            }))
        });

        if (eligibleTypes.length === 0) {
            result.failureReason = 'No eligible reward types found';
            console.log('No eligible reward types found for campaign:', {
                campaignName: cleanCampaign.name,
                receiptAmount: receiptData.totalAmount,
                rewardTypes: cleanCampaign.rewardTypes?.map(type => ({
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
            campaignName: cleanCampaign.name,
            matchedCriteria: result.matchedCriteria,
            eligibleRewardCount: eligibleTypes.length
        });

        return result;

    } catch (error) {
        console.error('Error in validateAgainstCampaign:', {
            error: error.message,
            campaignName: cleanCampaign.name,
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
 * Validates basic campaign criteria against receipt data
 * @function validateBasicCriteria
 * @param {Object} receiptData - The receipt data to validate
 * @param {Object} campaign - Campaign object containing validation rules
 * @returns {boolean} True if basic criteria are met
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
 * Validates campaign date and time criteria
 * @param {Object} receiptData - Receipt data containing date
 * @param {Object} campaign - Campaign with start/end dates
 * @returns {boolean} True if receipt date is within campaign period
 */
function validateDateTimeCriteria(receiptData, campaign) {
    try {
        const [part1, part2, year] = receiptData.date.split('/').map(Number);
        const campaignStart = new Date(campaign.startDate);
        const campaignEnd = new Date(campaign.endDate);
        const currentMonth = new Date().getMonth() + 1; // 1-based month

        console.log('Campaign date validation:', {
            receiptDate: receiptData.date,
            campaignStart,
            campaignEnd,
            currentMonth
        });

        // Check if parts could be valid months (1-12)
        const couldBeMonth = part1 >= 1 && part1 <= 12;
        const part2CouldBeMonth = part2 >= 1 && part2 <= 12;

        // Create receipt date based on current month interpretation
        let receiptDate;
        if (currentMonth === part1 && couldBeMonth) {
            // Interpret as MM/DD/YYYY
            receiptDate = new Date(year, part1 - 1, part2);
            console.log('Interpreting as MM/DD/YYYY:', receiptDate);
        } else if (currentMonth === part2 && part2CouldBeMonth) {
            // Interpret as DD/MM/YYYY
            receiptDate = new Date(year, part2 - 1, part1);
            console.log('Interpreting as DD/MM/YYYY:', receiptDate);
        } else {
            console.log('Could not determine date format:', {
                interpretedAsMMDD: { month: part1, day: part2 },
                interpretedAsDDMM: { month: part2, day: part1 },
                currentMonth
            });
            return false;
        }

        // Check if receipt date falls within campaign period
        const isWithinPeriod = receiptDate >= campaignStart && receiptDate <= campaignEnd;
        
        console.log('Campaign period check:', {
            receiptDate,
            campaignStart,
            campaignEnd,
            isWithinPeriod
        });

        return isWithinPeriod;

    } catch (error) {
        console.error('Campaign date validation error:', {
            error: error.message,
            receiptDate: receiptData.date,
            campaign: {
                startDate: campaign.startDate,
                endDate: campaign.endDate
            }
        });
        return false;
    }
}

/**
 * Validates reward types criteria and returns eligible types
 * @async
 * @function validateRewardTypes
 * @param {Object} receiptData - Receipt data to validate against
 * @param {Object} campaign - Campaign containing reward types
 * @returns {Promise<Array>} Array of eligible reward types
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
 * Validates a reward type's criteria against receipt data
 * @async
 * @function validateRewardTypeCriteria
 * @param {Object} receiptData - The receipt data to validate
 * @param {Object} rewardType - The reward type with criteria to validate against
 * @param {Object} rewardType.criteria - Criteria object containing validation rules
 * @param {string} rewardType.typeId - Unique identifier for the reward type
 * @returns {Promise<boolean>} True if criteria is met, false otherwise
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

/**
 * Validates the minimum purchase requirement for a reward
 * @async
 * @function validateMinimumPurchase
 * @param {Object} criteria - The criteria object containing minimum purchase rules
 * @param {number} criteria.minPurchaseAmount - Minimum required purchase amount
 * @param {Object} receiptData - Receipt data containing the purchase amount
 * @param {number} receiptData.totalAmount - Total amount of the purchase
 * @returns {Promise<boolean>} True if minimum purchase requirement is met
 */
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

/**
 * Validates the maximum rewards limit for a user
 * @async
 * @function validateMaximumRewards
 * @param {Object} criteria - The criteria object containing maximum rewards rules
 * @param {number} criteria.maxRewards - Maximum number of rewards allowed
 * @param {Object} receiptData - Receipt data containing user information
 * @param {string} receiptData.guestPhoneNumber - User's phone number
 * @param {Object} rewardType - The reward type being validated
 * @param {string} rewardType.typeId - Unique identifier for the reward type
 * @returns {Promise<boolean>} True if under max rewards limit
 */
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
  * Gets the count of specific reward type for a user
 * @async
 * @function getUserRewardTypeCount
 * @param {string} phoneNumber - User's phone number
 * @param {string} rewardTypeId - ID of the reward type to count
 * @returns {Promise<number>} Count of rewards for the specified type
 * @throws {Error} If database operation fails
 */
async function getUserRewardTypeCount(phoneNumber, rewardTypeId) {
    try {
        const rewardsRef = ref(rtdb, `rewards`);
        const snapshot = await get(rewardsRef);
        
        const rewards = snapshot.val() || {};
        
        return Object.values(rewards).filter(reward => 
            reward.guestPhone === phoneNumber && 
            reward.typeId === rewardTypeId
        ).length;
    } catch (error) {
        console.error('Error getting user reward count:', error);
        throw new Error('Failed to get user reward count');
    }
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