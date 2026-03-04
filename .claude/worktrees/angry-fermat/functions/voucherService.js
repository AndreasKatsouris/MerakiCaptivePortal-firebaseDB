const { 
    rtdb, 
    ref, 
    get, 
    set, 
    update,
    admin
} = require('./config/firebase-admin.js');

/**
 * Voucher Service - Handles voucher pool management and assignment
 * Replaces random code generation with real voucher codes from uploaded pools
 */

/**
 * Assigns a voucher from the pool for a specific reward type
 * @param {string} rewardTypeId - ID of the reward type
 * @param {object} rewardData - Reward data for tracking assignment
 * @returns {Promise<object|null>} Voucher object or null if none available
 */
async function assignVoucherFromPool(rewardTypeId, rewardData) {
    console.log('🎫 Assigning voucher for reward type:', rewardTypeId);
    
    try {
        // Get voucher pool for this reward type
        const poolRef = ref(rtdb, `voucherPools/${rewardTypeId}`);
        const poolSnapshot = await get(poolRef);
        const pool = poolSnapshot.val();
        
        if (!pool || !pool.vouchers) {
            console.log('❌ No voucher pool found for reward type:', rewardTypeId);
            return null;
        }
        
        // Find first available voucher
        const vouchers = pool.vouchers;
        let availableVoucherCode = null;

        // Track voucher status for debugging
        const voucherStats = {
            total: 0,
            available: 0,
            expired: 0,
            assigned: 0,
            redeemed: 0
        };

        const now = Date.now();
        console.log('🔍 Checking voucher pool. Current timestamp:', now);

        for (const [code, voucher] of Object.entries(vouchers)) {
            voucherStats.total++;

            // Log each voucher for debugging
            const isExpired = voucher.expiryDate <= now;
            console.log(`Voucher ${code}:`, {
                status: voucher.status,
                expiryDate: voucher.expiryDate,
                isExpired: isExpired,
                daysUntilExpiry: ((voucher.expiryDate - now) / (1000 * 60 * 60 * 24)).toFixed(1)
            });

            if (isExpired && voucher.status === 'available') {
                voucherStats.expired++;
            } else {
                voucherStats[voucher.status]++;
            }

            if (voucher.status === 'available' && voucher.expiryDate > now) {
                availableVoucherCode = code;
                break;
            }
        }

        console.log('📊 Voucher pool statistics:', voucherStats);

        if (!availableVoucherCode) {
            console.log('⚠️ No available vouchers in pool for reward type:', rewardTypeId);
            console.log('🚨 REASON: Total vouchers:', voucherStats.total,
                       'Available (not expired):', voucherStats.available,
                       'Expired:', voucherStats.expired,
                       'Already assigned:', voucherStats.assigned);

            // Check if campaign should be paused
            await checkAndPauseCampaign(rewardTypeId, rewardData.campaignId);
            return null;
        }
        
        // Mark voucher as assigned
        const voucherUpdateData = {
            status: 'assigned',
            assignedAt: Date.now(),
            assignedToReward: rewardData.id,
            assignedToGuest: rewardData.guestPhone,
            assignedToGuestName: rewardData.guestName,
            rewardId: rewardData.id
        };
        
        await update(ref(rtdb, `voucherPools/${rewardTypeId}/vouchers/${availableVoucherCode}`), voucherUpdateData);
        
        // Update pool statistics
        await updatePoolStatistics(rewardTypeId);
        
        console.log('✅ Voucher assigned:', availableVoucherCode);
        
        return {
            code: availableVoucherCode,
            ...vouchers[availableVoucherCode],
            ...voucherUpdateData
        };
        
    } catch (error) {
        console.error('Error assigning voucher from pool:', error);
        return null;
    }
}

/**
 * Updates pool statistics after voucher status changes
 * @param {string} rewardTypeId - ID of the reward type
 */
async function updatePoolStatistics(rewardTypeId) {
    try {
        const poolRef = ref(rtdb, `voucherPools/${rewardTypeId}`);
        const poolSnapshot = await get(poolRef);
        const pool = poolSnapshot.val();

        if (!pool || !pool.vouchers) return;

        const now = Date.now();

        const stats = {
            total: 0,
            available: 0,
            assigned: 0,
            redeemed: 0,
            expired: 0
        };

        console.log('📊 Calculating pool statistics for:', rewardTypeId);

        Object.values(pool.vouchers).forEach(voucher => {
            stats.total++;

            // Count based on actual status, not expiry date
            // Expired date only matters for 'available' vouchers

            if (voucher.status === 'available') {
                // Check if available voucher is expired
                if (voucher.expiryDate && voucher.expiryDate <= now) {
                    stats.expired++;
                } else {
                    stats.available++;
                }
            } else if (voucher.status === 'assigned') {
                // Assigned vouchers stay assigned regardless of expiry
                stats.assigned++;
            } else if (voucher.status === 'redeemed') {
                // Redeemed vouchers stay redeemed regardless of expiry
                stats.redeemed++;
            } else if (voucher.status === 'expired') {
                stats.expired++;
            }
        });

        await update(ref(rtdb, `voucherPools/${rewardTypeId}/stats`), stats);
        console.log('📊 Pool statistics updated for:', rewardTypeId, stats);

    } catch (error) {
        console.error('Error updating pool statistics:', error);
    }
}

/**
 * Checks if campaign should be paused due to voucher depletion
 * @param {string} rewardTypeId - ID of the reward type
 * @param {string} campaignId - ID of the campaign
 */
async function checkAndPauseCampaign(rewardTypeId, campaignId) {
    try {
        console.log('🔍 Checking if campaign should be paused:', campaignId);
        console.log('   Depleted reward type:', rewardTypeId);

        // Check if any reward types in the campaign have available vouchers
        const campaignRef = ref(rtdb, `campaigns/${campaignId}`);
        const campaignSnapshot = await get(campaignRef);
        const campaign = campaignSnapshot.val();

        if (!campaign || !campaign.rewardTypes) {
            console.log('   Campaign not found or has no reward types');
            return;
        }

        console.log('   Campaign has', campaign.rewardTypes.length, 'reward types');

        let hasAvailableVouchers = false;
        const poolStatusDetails = [];

        for (const rewardType of campaign.rewardTypes) {
            if (rewardType.typeId === rewardTypeId) {
                poolStatusDetails.push({
                    typeId: rewardType.typeId,
                    status: 'DEPLETED (triggered check)',
                    available: 0
                });
                continue; // Skip the depleted one
            }

            const poolSnapshot = await get(ref(rtdb, `voucherPools/${rewardType.typeId}`));
            const pool = poolSnapshot.val();

            const available = pool?.stats?.available || 0;
            poolStatusDetails.push({
                typeId: rewardType.typeId,
                hasPool: !!pool,
                hasStats: !!pool?.stats,
                available: available,
                total: pool?.stats?.total || 0,
                expired: pool?.stats?.expired || 0
            });

            if (pool && pool.stats && pool.stats.available > 0) {
                hasAvailableVouchers = true;
                console.log('   ✅ Reward type has available vouchers:', rewardType.typeId, '- Available:', available);
                break;
            } else {
                console.log('   ❌ Reward type has NO available vouchers:', rewardType.typeId, '- Stats:', pool?.stats);
            }
        }

        console.log('📊 All reward type pool status:', JSON.stringify(poolStatusDetails, null, 2));

        if (!hasAvailableVouchers) {
            console.log('🚫 PAUSING CAMPAIGN:', campaignId);
            console.log('   Campaign name:', campaign.name);
            console.log('   Reason: ALL reward types depleted or expired');
            console.log('   Pool details:', poolStatusDetails);

            await update(campaignRef, {
                status: 'paused',
                pausedAt: Date.now(),
                pauseReason: 'voucher_depletion',
                lastStatus: campaign.status,
                pauseDetails: poolStatusDetails // Add for debugging
            });

            // Send admin notification
            await sendVoucherDepletionNotification(campaignId, campaign.name);
        } else {
            console.log('✅ Campaign will remain active - at least one reward type has available vouchers');
        }

    } catch (error) {
        console.error('Error checking campaign pause status:', error);
    }
}

/**
 * Sends notification to admins about voucher depletion
 * @param {string} campaignId - ID of the campaign
 * @param {string} campaignName - Name of the campaign
 */
async function sendVoucherDepletionNotification(campaignId, campaignName) {
    try {
        // Create admin notification
        const notificationRef = push(rtdb, 'adminNotifications');
        await set(notificationRef, {
            type: 'voucher_depletion',
            title: 'Campaign Paused - Vouchers Depleted',
            message: `Campaign "${campaignName}" has been automatically paused because all voucher pools are depleted.`,
            campaignId: campaignId,
            campaignName: campaignName,
            createdAt: Date.now(),
            read: false,
            priority: 'high'
        });
        
        console.log('📧 Admin notification sent for voucher depletion');
        
    } catch (error) {
        console.error('Error sending voucher depletion notification:', error);
    }
}

/**
 * Marks a voucher as redeemed when used by guest
 * @param {string} voucherCode - The voucher code that was redeemed
 * @param {string} rewardTypeId - ID of the reward type
 * @param {object} redemptionData - Data about the redemption
 */
async function markVoucherAsRedeemed(voucherCode, rewardTypeId, redemptionData) {
    try {
        console.log('✅ Marking voucher as redeemed:', voucherCode);
        
        const voucherRef = ref(rtdb, `voucherPools/${rewardTypeId}/vouchers/${voucherCode}`);
        await update(voucherRef, {
            status: 'redeemed',
            redeemedAt: Date.now(),
            redeemedBy: redemptionData.redeemedBy || 'staff',
            redemptionLocation: redemptionData.location || null,
            redemptionNotes: redemptionData.notes || null
        });
        
        // Update pool statistics
        await updatePoolStatistics(rewardTypeId);
        
        console.log('🎫 Voucher marked as redeemed successfully');
        
    } catch (error) {
        console.error('Error marking voucher as redeemed:', error);
        throw error;
    }
}

/**
 * Gets voucher details by code and reward type
 * @param {string} voucherCode - The voucher code to look up
 * @param {string} rewardTypeId - ID of the reward type
 * @returns {Promise<object|null>} Voucher details or null if not found
 */
async function getVoucherDetails(voucherCode, rewardTypeId) {
    try {
        const voucherRef = ref(rtdb, `voucherPools/${rewardTypeId}/vouchers/${voucherCode}`);
        const voucherSnapshot = await get(voucherRef);
        return voucherSnapshot.val();
    } catch (error) {
        console.error('Error getting voucher details:', error);
        return null;
    }
}

/**
 * Checks for duplicate receipts across platform to prevent fraud
 * @param {object} receiptData - Receipt data with receiptNumber and date
 * @returns {Promise<object>} Fraud check result
 */
async function checkReceiptFraud(receiptData) {
    try {
        const receiptKey = `${receiptData.receiptNumber}_${receiptData.date}`;
        const fraudCheckRef = ref(rtdb, `receiptFraudCheck/${receiptKey}`);
        const existingSnapshot = await get(fraudCheckRef);
        
        if (existingSnapshot.exists()) {
            const existing = existingSnapshot.val();
            console.log('🚨 Potential receipt fraud detected:', receiptKey);
            
            // Update fraud entry
            await update(fraudCheckRef, {
                duplicateCount: (existing.duplicateCount || 1) + 1,
                lastAttempt: Date.now(),
                guestPhones: [...(existing.guestPhones || []), receiptData.guestPhoneNumber].filter((phone, index, arr) => arr.indexOf(phone) === index),
                flagged: true
            });
            
            return {
                isFraud: true,
                reason: 'duplicate_receipt',
                originalDate: existing.firstSeen,
                duplicateCount: (existing.duplicateCount || 1) + 1
            };
        } else {
            // First time seeing this receipt
            await set(fraudCheckRef, {
                receiptNumber: receiptData.receiptNumber,
                date: receiptData.date,
                guestPhoneNumber: receiptData.guestPhoneNumber,
                firstSeen: Date.now(),
                duplicateCount: 1,
                guestPhones: [receiptData.guestPhoneNumber],
                flagged: false
            });
            
            return {
                isFraud: false,
                reason: null
            };
        }
        
    } catch (error) {
        console.error('Error checking receipt fraud:', error);
        return { isFraud: false, reason: 'check_error' };
    }
}

/**
 * Gets pool availability status for a reward type
 * @param {string} rewardTypeId - ID of the reward type
 * @returns {Promise<object>} Pool status information
 */
async function getPoolAvailability(rewardTypeId) {
    try {
        const poolSnapshot = await get(ref(rtdb, `voucherPools/${rewardTypeId}`));
        const pool = poolSnapshot.val();
        
        if (!pool) {
            return {
                hasPool: false,
                available: 0,
                total: 0,
                percentage: 0
            };
        }
        
        const stats = pool.stats || { available: 0, total: 0 };
        
        return {
            hasPool: true,
            available: stats.available,
            total: stats.total,
            percentage: stats.total > 0 ? (stats.available / stats.total) * 100 : 0
        };
        
    } catch (error) {
        console.error('Error getting pool availability:', error);
        return {
            hasPool: false,
            available: 0,
            total: 0,
            percentage: 0
        };
    }
}

module.exports = {
    assignVoucherFromPool,
    markVoucherAsRedeemed,
    getVoucherDetails,
    checkReceiptFraud,
    getPoolAvailability,
    updatePoolStatistics
}; 