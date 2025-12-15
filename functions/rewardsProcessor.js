const { 
    rtdb, 
    ref, 
    get, 
    set, 
    update,
    push,
    admin
} = require('./config/firebase-admin.js');

const { 
    assignVoucherFromPool, 
    checkReceiptFraud,
    getPoolAvailability 
} = require('./voucherService.js');

const { formatToSASTDateTime } = require('./utils/timezoneUtils');

/**
 * Main function to process rewards for a validated receipt
 * Handles receipt validation, reward creation, notifications, and rollback on failure
 * @param {object} guest - Guest data containing phone number and name
 * @param {object} campaign - Campaign data with reward types and criteria
 * @param {object} receiptData - Validated receipt data with total amount and items
 * @returns {Promise<object>} Processing result with created rewards
 */
async function processReward(guest, campaign, receiptData) {
    // Get the proper Firebase ID for the receipt
    const receiptFirebaseId = receiptData.id || receiptData.receiptId;
    
    console.log('Starting processReward with data:', {
        guest: guest?.phoneNumber,
        campaign: campaign?.name,
        receiptId: receiptData?.receiptId,
        receiptFirebaseId: receiptFirebaseId,
        totalAmount: receiptData?.totalAmount
    });

    // Validate inputs first
    try {
        validateInputs(guest, campaign, receiptData);
    } catch (error) {
        console.error('Input validation failed:', error);
        throw error;
    }

    // Check for receipt fraud (platform-wide duplicate detection)
    const fraudCheck = await checkReceiptFraud({
        receiptNumber: receiptFirebaseId,
        date: receiptData.date || receiptData.createdAt,
        guestPhoneNumber: guest.phoneNumber
    });
    
    if (fraudCheck.isFraud) {
        console.log('🚨 Receipt fraud detected, blocking reward processing:', fraudCheck);
        throw new Error(`Duplicate receipt detected. This receipt was already used on ${formatToSASTDateTime(fraudCheck.originalDate, { year: 'numeric', month: 'short', day: 'numeric' })}`);
    }

    const campaignId = campaign.id || campaign.name.replace(/\s+/g, '_').toLowerCase();
    let createdRewards = [];

    try {
        // Update receipt status using the proper Firebase ID
        const receiptRef = ref(rtdb, `receipts/${receiptFirebaseId}`);
        const receiptSnapshot = await get(receiptRef);
        const currentData = receiptSnapshot.val();

        if (currentData?.status === 'validated') {
            console.log('Receipt already validated, returning existing rewards...');
            // Return existing rewards instead of undefined
            const existingRewards = await getExistingRewards(guest.phoneNumber, receiptFirebaseId);
            return {
                success: true,
                rewards: existingRewards,
                alreadyProcessed: true
            };
        }

        console.log('🔍 Updating receipt status to validated...');
        console.log('📄 Current receipt data before validation update:', {
            hasDate: !!currentData?.date,
            hasInvoiceNumber: !!currentData?.invoiceNumber,
            date: currentData?.date,
            invoiceNumber: currentData?.invoiceNumber,
            status: currentData?.status
        });
        
        await update(receiptRef, {
            ...currentData,
            status: 'validated',
            validatedAt: Date.now(),
            campaignId: campaignId
        });
        
        console.log('✅ Receipt status updated to validated');

        // Create rewards after successful receipt validation
        console.log('Processing reward types for eligible rewards...');
        const eligibleRewards = await processRewardTypes(guest, campaign, receiptData);
        console.log('Found eligible rewards:', eligibleRewards.length);
        
        for (const reward of eligibleRewards) {
            console.log('Creating reward:', reward.typeId);
            const rewardRef = push(rtdb, 'rewards');
            const rewardId = rewardRef.key;
            
            const rewardData = {
                ...reward,
                id: rewardId,
                createdAt: Date.now()
            };
            
            // Try to assign voucher from pool
            console.log('🎫 Attempting to assign voucher for reward type:', reward.typeId);
            const voucher = await assignVoucherFromPool(reward.typeId, rewardData);
            
            if (voucher) {
                // Voucher assigned successfully - use real voucher code
                rewardData.voucherCode = voucher.code;
                rewardData.voucherAssigned = true;
                rewardData.voucherAssignedAt = voucher.assignedAt;
                rewardData.status = 'available'; // Voucher is ready to use
                console.log('✅ Voucher assigned to reward:', voucher.code);
            } else {
                // No voucher available - check if pool exists
                const poolStatus = await getPoolAvailability(reward.typeId);
                
                if (poolStatus.hasPool) {
                    // Pool exists but depleted
                    console.log('⚠️ Voucher pool depleted for reward type:', reward.typeId);
                    rewardData.voucherCode = null;
                    rewardData.voucherAssigned = false;
                    rewardData.status = 'pending'; // Wait for voucher replenishment
                    rewardData.poolDepleted = true;
                } else {
                    // No pool exists - fall back to random code (legacy behavior)
                    console.log('💀 No voucher pool for reward type, using random code:', reward.typeId);
                    rewardData.voucherCode = generateFallbackCode();
                    rewardData.voucherAssigned = false;
                    rewardData.status = 'available';
                    rewardData.usesRandomCode = true;
                }
            }
            
            console.log('Saving reward to database:', rewardId);
            await set(rewardRef, rewardData);
            
            // Create guest-rewards index with normalized phone number
            const normalizedPhone = normalizePhoneNumber(guest.phoneNumber);
            console.log('Creating guest-rewards index');
            const parentPath = `guest-rewards/${normalizedPhone}`;
            const indexPath = `${parentPath}/${rewardId}`;
            console.log('Database path:', indexPath);
            
            try {
                // First, check if parent path exists and what type it is
                const parentRef = ref(rtdb, parentPath);
                const parentSnapshot = await get(parentRef);
                
                console.log('🔍 Pre-write parent path check:', {
                    parentPath: parentPath,
                    exists: parentSnapshot.exists(),
                    type: typeof parentSnapshot.val(),
                    value: parentSnapshot.val()
                });
                
                // If parent path is not an object, we need to fix it first
                if (parentSnapshot.exists() && typeof parentSnapshot.val() !== 'object') {
                    console.warn('🚨 CRITICAL: Parent path is not an object, fixing structure...');
                    console.warn('🔧 Clearing parent path to allow object structure');
                    
                    // Clear the parent path completely
                    await set(parentRef, null);
                    console.log('✅ Parent path cleared');
                    
                    // Wait a moment for Firebase to process
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // Now create the index structure properly
                const indexRef = ref(rtdb, indexPath);
                console.log('🔍 Firebase ref created for:', indexPath);
                
                await set(indexRef, true);
                console.log('✅ Guest-rewards index created successfully');
                
                // Verify the structure is correct
                const verifyParentSnapshot = await get(parentRef);
                const verifyIndexSnapshot = await get(indexRef);
                
                console.log('🔍 Post-write verification:', {
                    parentPath: parentPath,
                    parentExists: verifyParentSnapshot.exists(),
                    parentType: typeof verifyParentSnapshot.val(),
                    parentKeys: verifyParentSnapshot.exists() && typeof verifyParentSnapshot.val() === 'object' 
                        ? Object.keys(verifyParentSnapshot.val() || {}) : [],
                    indexPath: indexPath,
                    indexExists: verifyIndexSnapshot.exists(),
                    indexValue: verifyIndexSnapshot.val()
                });
                
                // Final validation
                if (!verifyParentSnapshot.exists() || typeof verifyParentSnapshot.val() !== 'object') {
                    throw new Error(`Failed to create proper object structure at ${parentPath}`);
                }
                
                if (!verifyIndexSnapshot.exists()) {
                    throw new Error(`Failed to create index at ${indexPath}`);
                }
                
                console.log('✅ Index structure validation passed');
                
            } catch (error) {
                console.error('❌ Failed to create guest-rewards index:', error);
                throw error;
            }
            
            // Create campaign-rewards index
            console.log('Creating campaign-rewards index');
            await set(ref(rtdb, `campaign-rewards/${campaignId}/${rewardId}`), true);
            
            createdRewards.push(rewardData);
        }

        // Reward processing completed - notifications will be sent by the calling function
        console.log('Reward processing completed successfully');
        return {
            success: true,
            rewards: createdRewards
        };
    } catch (error) {
        console.error('Error processing reward:', error);
        if (createdRewards.length > 0) {
            await rollbackRewards(createdRewards, guest.phoneNumber, campaignId);
        }
        throw error;
    }
}

/**
 * Get existing rewards for a receipt that was already processed
 * @param {string} phoneNumber - Guest phone number
 * @param {string} receiptId - Receipt ID
 * @returns {Promise<Array>} Array of existing rewards
 */
async function getExistingRewards(phoneNumber, receiptId) {
    try {
        // Normalize phone number for consistent database lookups
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        
        const rewardsRef = ref(rtdb, 'rewards');
        const snapshot = await get(rewardsRef);
        const rewards = snapshot.val() || {};
        
        const existingRewards = Object.entries(rewards)
            .filter(([id, reward]) => 
                reward.guestPhone === normalizedPhone && 
                reward.receiptId === receiptId
            )
            .map(([id, reward]) => ({ id, ...reward }));
        
        console.log('Found existing rewards:', existingRewards.length);
        return existingRewards;
    } catch (error) {
        console.error('Error getting existing rewards:', error);
        return [];
    }
}

/**
 * Validates all required input parameters for reward processing
 * Checks for presence of guest phone number, campaign details, and receipt data
 * @throws {Error} If any required fields are missing
 */
function validateInputs(guest, campaign, receiptData) {
    console.log('Validating inputs:', {
        hasGuest: !!guest,
        hasGuestPhone: !!guest?.phoneNumber,
        hasCampaign: !!campaign,
        hasCampaignId: !!campaign?.id,
        hasCampaignName: !!campaign?.name,
        hasRewardTypes: Array.isArray(campaign?.rewardTypes),
        rewardTypesCount: campaign?.rewardTypes?.length,
        hasReceiptData: !!receiptData,
        hasReceiptId: !!(receiptData?.id || receiptData?.receiptId),
        hasTotalAmount: !!receiptData?.totalAmount
    });

    if (!guest?.phoneNumber) {
        throw new Error('Invalid guest data: Missing phone number');
    }

    if (!campaign?.name || !Array.isArray(campaign.rewardTypes)) {
        throw new Error('Invalid campaign data: Missing required fields (name or rewardTypes)');
    }

    if (!(receiptData?.id || receiptData?.receiptId) || !receiptData?.totalAmount) {
        throw new Error('Invalid receipt data: Missing required fields (id/receiptId or totalAmount)');
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
            const reward = await createRewardObject(rewardType, guest, campaign, receiptData);
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
 * Normalize phone number format by removing + prefix and whatsapp: prefix
 * @param {string} phoneNumber - Phone number to normalize  
 * @returns {string} Normalized phone number without + prefix
 */
function normalizePhoneNumber(phoneNumber) {
    // Ensure input is a string
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        console.error('Invalid phone number input for normalization:', phoneNumber);
        return '';
    }
    
    // Only remove WhatsApp prefix, preserve + for international numbers
    let cleaned = phoneNumber.replace(/^whatsapp:/, '').trim();
    
    // Ensure + prefix for international numbers (South African numbers)
    if (/^27\d{9}$/.test(cleaned)) {
        // If it's a 27xxxxxxxxx number without +, add it
        cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+') && /^\d+$/.test(cleaned)) {
        // If it's all digits without +, assume it's South African
        cleaned = '+27' + cleaned.replace(/^0+/, ''); // Remove leading zeros
    }
    
    // Validate the result - allow + followed by digits
    if (!/^\+?\d+$/.test(cleaned)) {
        console.error('Phone number contains invalid characters after normalization:', {
            original: phoneNumber,
            normalized: cleaned
        });
        return '';
    }
    
    return cleaned;
}

/**
 * Creates a standardized reward object with all necessary metadata
 * Includes reward type, guest info, campaign details, and expiry calculations
 * @returns {Promise<object>} Formatted reward object
 */
async function createRewardObject(rewardType, guest, campaign, receiptData) {
    // Validate required fields
    if (!rewardType || !rewardType.typeId) {
        throw new Error('Invalid reward type data');
    }

    // Determine reward type from criteria or default to 'standard'
    const rewardTypeCategory = determineRewardType(rewardType);

    // Normalize phone number for consistent database storage
    const normalizedPhone = normalizePhoneNumber(guest.phoneNumber);

    // Get proper reward description with actual reward type name
    const description = await getRewardDescription(rewardType);

    return {
        typeId: rewardType.typeId,
        guestPhone: normalizedPhone,
        guestName: guest.name,
        campaignId: campaign.id,
        campaignName: campaign.name,
        receiptId: receiptData.id || receiptData.receiptId,
        receiptAmount: receiptData.totalAmount,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: calculateExpiryDate(rewardType),
        value: calculateRewardValue(rewardType, receiptData.totalAmount),
        metadata: {
            type: rewardTypeCategory,
            description: description,
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
async function getRewardDescription(rewardType) {
    const type = determineRewardType(rewardType);

    // Check if there's a custom description from the reward type configuration
    if (rewardType.description) {
        return rewardType.description;
    }

    // Check if there's a description in the criteria
    if (rewardType.criteria?.description) {
        return rewardType.criteria.description;
    }

    // Try to get the actual reward type name from the database
    let rewardTypeName = rewardType.name;
    if (!rewardTypeName && rewardType.typeId) {
        try {
            const rewardTypeRef = ref(rtdb, `rewardTypes/${rewardType.typeId}`);
            const snapshot = await get(rewardTypeRef);
            const fullRewardType = snapshot.val();
            if (fullRewardType && fullRewardType.name) {
                rewardTypeName = fullRewardType.name;
            }
        } catch (error) {
            console.error('Error loading reward type name:', error);
        }
    }

    // Generate description based on type
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
            // Use actual reward type name instead of ID
            return rewardTypeName || rewardType.typeId || 'Loyalty reward';
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
    try {
        // Normalize phone number for consistent database lookups
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        
        const rewardsRef = ref(rtdb, 'rewards');
        const snapshot = await get(rewardsRef);
        const rewards = snapshot.val() || {};
        
        const count = Object.values(rewards).filter(reward => 
            reward.guestPhone === normalizedPhone && 
            reward.typeId === typeId && 
            reward.status !== 'expired'
        ).length;
        
        console.log('User reward type count result:', {
            originalPhone: phoneNumber,
            normalizedPhone,
            typeId,
            count,
            totalRewards: Object.keys(rewards).length
        });
        
        return count;
    } catch (error) {
        console.error('Error counting user rewards:', error);
        return 0;
    }
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
 * Generates a fallback code when no voucher pool exists (legacy behavior)
 * @returns {string} Random alphanumeric code
 */
function generateFallbackCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Handles rollback of created rewards in case of processing errors
 * Removes rewards from all relevant database paths
 * @throws {Error} If rollback fails, indicating need for manual intervention
 */
async function rollbackRewards(rewards, phoneNumber, campaignId) {
    try {
        // Normalize phone number for consistent database operations
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        
        for (const reward of rewards) {
            // Remove from rewards collection
            await set(ref(rtdb, `rewards/${reward.id}`), null);
            
            // Remove from guest-rewards index
            await set(ref(rtdb, `guest-rewards/${normalizedPhone}/${reward.id}`), null);
            
            // Remove from campaign-rewards index
            await set(ref(rtdb, `campaign-rewards/${campaignId}/${reward.id}`), null);
        }
        
        console.log('Successfully rolled back rewards:', rewards.map(r => r.id));
    } catch (error) {
        console.error('Failed to rollback rewards:', error);
        throw new Error('Manual intervention required: Reward rollback failed');
    }
}

module.exports = { processReward };