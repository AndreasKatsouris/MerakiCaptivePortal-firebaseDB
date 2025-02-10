const admin = require('firebase-admin');

/**
 * Main function to process rewards for a validated receipt
 * Handles receipt validation, reward creation, notifications, and rollback on failure
 * @param {object} guest - Guest data containing phone number and name
 * @param {object} campaign - Campaign data with reward types and criteria
 * @param {object} receiptData - Validated receipt data with total amount and items
 * @returns {Promise<object>} Processing result with created rewards
 */
async function processReward(guest, campaign, receiptData) {
    const campaignId = campaign.id || campaign.name.replace(/\s+/g, '_').toLowerCase();
    let createdRewards = [];

    try {
        // Scope transaction to just the receipt
        await admin.database()
            .ref(`receipts/${receiptData.receiptId}`)
            .transaction(currentData => {
                if (currentData?.status === 'validated') {
                    return; // Abort transaction
                }
                return {
                    ...currentData,
                    status: 'validated',
                    validatedAt: admin.database.ServerValue.TIMESTAMP,
                    campaignId: campaignId
                };
            });

        // Create rewards after successful receipt validation
        const rewardUpdates = {};
        for (const rewardType of campaign.rewardTypes) {
            const rewardRef = admin.database().ref('rewards').push().key;
            console.log('Reward type data:', {
                type: rewardType.type,
                typeId: rewardType.typeId,
                criteria: rewardType.criteria
            });
            const reward = createRewardObject(rewardType, guest, campaign, receiptData);
            
            rewardUpdates[`rewards/${rewardRef}`] = reward;
            rewardUpdates[`guest-rewards/${guest.phoneNumber}/${rewardRef}`] = true;
            rewardUpdates[`campaign-rewards/${campaignId}/${rewardRef}`] = true;
            
            createdRewards.push({
                id: rewardRef,
                ...reward
            });
        }

        // Apply reward updates separately
        await admin.database().ref().update(rewardUpdates);

        // Send notifications
        await sendRewardNotifications(guest, createdRewards);

        return {
            success: true,
            rewardCount: createdRewards.length,
            rewards: createdRewards
        };

    } catch (error) {
        console.error('Error in reward processing:', error);
        if (createdRewards.length > 0) {
            await rollbackRewards(createdRewards, guest.phoneNumber, campaignId);
        }
        throw error;
    }
}

/**
 * Validates all required input parameters for reward processing
 * Checks for presence of guest phone number, campaign details, and receipt data
 * @throws {Error} If any required fields are missing
 */
function validateInputs(guest, campaign, receiptData) {
    if (!guest?.phoneNumber) {
        throw new Error('Invalid guest data: Missing phone number');
    }

    if (!campaign?.id || !campaign?.name || !Array.isArray(campaign.rewardTypes)) {
        throw new Error('Invalid campaign data: Missing required fields');
    }

    if (!receiptData?.receiptId || !receiptData?.totalAmount) {
        throw new Error('Invalid receipt data: Missing required fields');
    }
}

/**
 * Processes each reward type in a campaign to determine eligible rewards
 * Checks eligibility criteria and creates reward objects for qualifying types
 * @throws {Error} If no eligible rewards are found
 * @returns {Promise<Array>} Array of eligible reward objects
 */
async function processRewardTypes(guest, campaign, receiptData) {
    const eligibleRewards = [];
    
    for (const rewardType of campaign.rewardTypes) {
        if (await checkRewardEligibility(rewardType, receiptData, guest)) {
            const reward = createRewardObject(rewardType, guest, campaign, receiptData);
            eligibleRewards.push(reward);
        }
    }

    if (eligibleRewards.length === 0) {
        throw new Error('No eligible rewards found for this receipt');
    }

    return eligibleRewards;
}

/**
 * Evaluates if a receipt qualifies for a specific reward type
 * Checks purchase amount, reward limits, store restrictions, required items, and time constraints
 * @returns {Promise<boolean>} True if eligible, false otherwise
 */
async function checkRewardEligibility(rewardType, receiptData, guest) {
    const { criteria } = rewardType;
    
    // Check minimum purchase amount
    if (criteria.minPurchaseAmount && 
        receiptData.totalAmount < criteria.minPurchaseAmount) {
        return false;
    }

    // Check maximum rewards per user
    if (criteria.maxRewards) {
        const existingRewards = await countUserRewardsForType(
            guest.phoneNumber, 
            rewardType.typeId
        );
        if (existingRewards >= criteria.maxRewards) {
            return false;
        }
    }

    // Check store restrictions
    if (criteria.storeRestrictions?.length > 0 && 
        !criteria.storeRestrictions.includes(receiptData.storeName)) {
        return false;
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
    if (criteria.startTime && criteria.endTime) {
        const receiptTime = new Date(receiptData.time);
        const [startHour, startMinute] = criteria.startTime.split(':');
        const [endHour, endMinute] = criteria.endTime.split(':');
        
        const isWithinTime = isTimeInRange(
            receiptTime,
            { hour: parseInt(startHour), minute: parseInt(startMinute) },
            { hour: parseInt(endHour), minute: parseInt(endMinute) }
        );
        
        if (!isWithinTime) {
            return false;
        }
    }

    return true;
}

/**
 * Creates a standardized reward object with all necessary metadata
 * Includes reward type, guest info, campaign details, and expiry calculations
 * @returns {object} Formatted reward object
 */
function createRewardObject(rewardType, guest, campaign, receiptData) {
    // Validate required fields
    if (!rewardType || !rewardType.typeId) {
        throw new Error('Invalid reward type data');
    }

    // Determine reward type from criteria or default to 'standard'
    const rewardTypeCategory = determineRewardType(rewardType);

    return {
        typeId: rewardType.typeId,
        guestPhone: guest.phoneNumber,
        guestName: guest.name,
        campaignId: campaign.id,
        campaignName: campaign.name,
        receiptId: receiptData.receiptId,
        receiptAmount: receiptData.totalAmount,
        status: 'pending',
        createdAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        expiresAt: calculateExpiryDate(rewardType),
        value: calculateRewardValue(rewardType, receiptData.totalAmount),
        metadata: {
            type: rewardTypeCategory,
            description: getRewardDescription(rewardType),
            originalCriteria: rewardType.criteria
        }
    };
}

/**
 * Determines the reward type category based on criteria or explicit type
 * Categories include points, discount_percent, discount_amount, free_item, or standard
 * @returns {string} Reward type category
 */
function determineRewardType(rewardType) {
    // If type is explicitly set, use it
    if (rewardType.type) {
        return rewardType.type;
    }

    // Otherwise determine type from criteria
    if (rewardType.criteria) {
        if (rewardType.criteria.points) return 'points';
        if (rewardType.criteria.discountPercentage) return 'discount_percent';
        if (rewardType.criteria.discountAmount) return 'discount_amount';
        if (rewardType.criteria.freeItem) return 'free_item';
    }

    // Default type if nothing else matches
    return 'standard';
}

/**
 * Calculates the numerical value of a reward based on its type and receipt amount
 * Handles points multiplication, fixed discounts, and percentage-based calculations
 * @returns {number} Calculated reward value
 */
function calculateRewardValue(rewardType, receiptAmount) {
    const type = determineRewardType(rewardType);
    
    switch (type) {
        case 'points':
            return Math.floor(receiptAmount * (rewardType.criteria?.pointsMultiplier || 1));
        case 'discount_amount':
            return rewardType.criteria?.discountAmount || 0;
        case 'discount_percent':
            const percentage = rewardType.criteria?.discountPercentage || 0;
            const maxValue = rewardType.criteria?.maxDiscountAmount;
            const calculatedValue = (receiptAmount * (percentage / 100));
            return maxValue ? Math.min(maxValue, calculatedValue) : calculatedValue;
        default:
            return 0;
    }
}

/**
 * Generates a human-readable description of the reward
 * Formats the description based on reward type and value
 * @returns {string} Reward description
 */
function getRewardDescription(rewardType) {
    const type = determineRewardType(rewardType);

    switch (type) {
        case 'points':
            const points = calculateRewardValue(rewardType, 0);
            return `${points} points reward`;
        case 'discount_amount':
            const amount = rewardType.criteria?.discountAmount || 0;
            return `R${amount} off your next purchase`;
        case 'discount_percent':
            const percentage = rewardType.criteria?.discountPercentage || 0;
            return `${percentage}% off your next purchase`;
        case 'free_item':
            return `Free ${rewardType.criteria?.itemName || 'item'}`;
        default:
            return 'Standard reward';
    }
}

/**
 * Calculates the expiry date for a reward
 * Uses reward type validity days or defaults to 30 days
 * @returns {number} Timestamp of expiry date
 */
function calculateExpiryDate(rewardType) {
    const now = new Date();
    const validityDays = rewardType.validityDays || 30; // Default 30 days
    now.setDate(now.getDate() + validityDays);
    return now.getTime();
}

/**
 * Retrieves the count of existing rewards for a specific user and type
 * Used for enforcing maximum reward limits
 * @returns {Promise<number>} Count of existing rewards
 */
async function countUserRewardsForType(phoneNumber, typeId) {
    const snapshot = await admin.database()
        .ref('guest-rewards')
        .child(phoneNumber)
        .orderByChild('typeId')
        .equalTo(typeId)
        .once('value');
    
    return snapshot.numChildren();
}

/**
 * Checks if a given time falls within a specified range
 * Used for time-restricted rewards
 * @returns {boolean} True if time is within range
 */
function isTimeInRange(time, start, end) {
    const timeValue = time.getHours() * 60 + time.getMinutes();
    const startValue = start.hour * 60 + start.minute;
    const endValue = end.hour * 60 + end.minute;
    
    return timeValue >= startValue && timeValue <= endValue;
}

/**
 * Sends WhatsApp notifications to guests about their earned rewards
 * Formats a message with all reward descriptions
 */
async function sendRewardNotifications(guest, rewards) {
    const { sendWhatsAppMessage } = require('./receiveWhatsappMessage');
    
    const rewardMessages = rewards.map(reward => 
        `• ${reward.metadata.description}`
    ).join('\n');

    const message = `Congratulations ${guest.name}! You've earned:\n${rewardMessages}\n\nCheck your rewards anytime by replying "view rewards"`;
    
    await sendWhatsAppMessage(guest.phoneNumber, message);
}

/**
 * Handles rollback of created rewards in case of processing errors
 * Removes rewards from all relevant database paths
 * @throws {Error} If rollback fails, indicating need for manual intervention
 */
async function rollbackRewards(rewards, phoneNumber, campaignId) {
    try {
        const updates = {};
        rewards.forEach(reward => {
            updates[`rewards/${reward.id}`] = null;
            updates[`guest-rewards/${phoneNumber}/${reward.id}`] = null;
            updates[`campaign-rewards/${campaignId}/${reward.id}`] = null;
        });
        
        await admin.database().ref().update(updates);
        console.log('Successfully rolled back rewards:', rewards.map(r => r.id));
    } catch (error) {
        console.error('Error rolling back rewards:', error);
        // At this point, manual intervention may be needed
        throw new Error('Critical: Reward rollback failed. Manual cleanup required.');
    }
}

module.exports = { processReward };