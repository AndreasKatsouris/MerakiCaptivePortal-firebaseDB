const admin = require('firebase-admin');

/**
 * Process rewards for a validated receipt against campaign reward types
 * @param {object} guest - Guest data
 * @param {object} campaign - Campaign data with reward types
 * @param {object} receiptData - Validated receipt data
 * @returns {Promise<object>} Processing result
 */
async function processReward(guest, campaign, receiptData) {
    console.log('Starting enhanced reward processing:', {
        guestId: guest.phoneNumber,
        campaignId: campaign.id,
        receiptId: receiptData.receiptId
    });

    // Input validation
    validateInputs(guest, campaign, receiptData);

    const campaignId = campaign.id || campaign.name.replace(/\s+/g, '_').toLowerCase();
    let createdRewards = [];

    try {
        // Start a transaction to ensure data consistency
        await admin.database().ref().transaction(async (data) => {
            // Check if receipt already processed
            if (data?.receipts?.[receiptData.receiptId]?.status === 'validated') {
                throw new Error('Receipt already processed');
            }

            // Process each eligible reward type
            const eligibleRewards = await processRewardTypes(guest, campaign, receiptData);
            
            // Prepare database updates
            const updates = {
                // Update receipt status
                [`receipts/${receiptData.receiptId}/status`]: 'validated',
                [`receipts/${receiptData.receiptId}/validatedAt`]: admin.database.ServerValue.TIMESTAMP,
                [`receipts/${receiptData.receiptId}/campaignId`]: campaignId
            };

            // Add each reward's updates
            eligibleRewards.forEach(reward => {
                const rewardRef = admin.database().ref('rewards').push().key;
                updates[`rewards/${rewardRef}`] = reward;
                updates[`guest-rewards/${guest.phoneNumber}/${rewardRef}`] = true;
                updates[`campaign-rewards/${campaignId}/${rewardRef}`] = true;
                
                createdRewards.push({
                    id: rewardRef,
                    ...reward
                });
            });

            return updates;
        });

        // After successful transaction, send notifications
        await sendRewardNotifications(guest, createdRewards);

        return {
            success: true,
            rewardCount: createdRewards.length,
            rewards: createdRewards
        };

    } catch (error) {
        console.error('Error in reward processing:', error);
        // Attempt rollback for any partially created rewards
        if (createdRewards.length > 0) {
            await rollbackRewards(createdRewards, guest.phoneNumber, campaignId);
        }
        throw error;
    }
}

/**
 * Validate all reward processing inputs
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
 * Process each reward type and determine eligibility
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
 * Check if a reward type's criteria are met
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
 * Create reward object based on reward type
 */
function createRewardObject(rewardType, guest, campaign, receiptData) {
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
            type: rewardType.type,
            description: getRewardDescription(rewardType),
            originalCriteria: rewardType.criteria
        }
    };
}

/**
 * Calculate reward expiry date
 */
function calculateExpiryDate(rewardType) {
    const now = new Date();
    const validityDays = rewardType.validityDays || 30; // Default 30 days
    now.setDate(now.getDate() + validityDays);
    return now.getTime();
}

/**
 * Calculate reward value based on type and receipt amount
 */
function calculateRewardValue(rewardType, receiptAmount) {
    switch (rewardType.type) {
        case 'points':
            return Math.floor(receiptAmount * (rewardType.pointsMultiplier || 1));
        case 'discount_amount':
            return rewardType.value;
        case 'discount_percent':
            return Math.min(
                rewardType.maxValue || Infinity,
                (receiptAmount * (rewardType.value / 100))
            );
        default:
            return 0;
    }
}

/**
 * Generate human-readable reward description
 */
function getRewardDescription(rewardType) {
    switch (rewardType.type) {
        case 'points':
            return `${rewardType.value} points reward`;
        case 'discount_amount':
            return `R${rewardType.value} off your next purchase`;
        case 'discount_percent':
            return `${rewardType.value}% off your next purchase`;
        case 'free_item':
            return `Free ${rewardType.itemName}`;
        default:
            return 'Reward';
    }
}

/**
 * Count existing rewards of a type for a user
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
 * Check if time is within range
 */
function isTimeInRange(time, start, end) {
    const timeValue = time.getHours() * 60 + time.getMinutes();
    const startValue = start.hour * 60 + start.minute;
    const endValue = end.hour * 60 + end.minute;
    
    return timeValue >= startValue && timeValue <= endValue;
}

/**
 * Send WhatsApp notifications for created rewards
 */
async function sendRewardNotifications(guest, rewards) {
    const { sendWhatsAppNotification } = require('./receiveWhatsappMessage');
    
    const rewardMessages = rewards.map(reward => 
        `• ${reward.metadata.description}`
    ).join('\n');

    const message = `Congratulations ${guest.name}! You've earned:\n${rewardMessages}\n\nCheck your rewards anytime by replying "view rewards"`;
    
    await sendWhatsAppNotification(guest.phoneNumber, message);
}

/**
 * Rollback rewards in case of error
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