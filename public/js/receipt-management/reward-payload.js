/**
 * Build a reward payload for an auto-processed (receipt-triggered) reward.
 *
 * Mirrors the shape reward-management.js's manual reward-issue flow writes
 * (metadata/status/value/expiresAt) — the fields `rewards/$rewardId .validate`
 * requires via `hasChildren(['metadata', 'status', 'value', 'expiresAt'])`
 * (database.rules.json). Without them the write is rejected regardless of
 * caller identity.
 *
 * @param {Object} receipt - receipt record (id, campaignId, totalAmount, guestPhoneNumber)
 * @param {Object} campaign - campaign record (id, name, rewardTypes: [{typeId, criteria}])
 * @param {Array} rewardTypes - loaded `rewardTypes` collection (id, category, value, validityDays, name)
 * @param {Object} ctx - { normalizedPhone, createdBy, now }
 * @returns {Object} reward payload ready to write to `rewards/{rewardId}`
 */
export function buildRewardPayload(receipt, campaign, rewardTypes, { normalizedPhone, createdBy, now = Date.now() } = {}) {
    const campaignRewardType = campaign.rewardTypes && campaign.rewardTypes[0];
    const rewardType = campaignRewardType
        ? (rewardTypes || []).find(rt => rt.id === campaignRewardType.typeId)
        : null;

    const value = rewardType ? (parseFloat(rewardType.value) || 0) : 0;
    const validityDays = (rewardType && rewardType.validityDays) || 30;

    return {
        receiptId: receipt.id,
        campaignId: campaign.id,
        campaignName: campaign.name,
        guestPhone: normalizedPhone,
        status: 'pending',
        value,
        createdAt: now,
        expiresAt: now + (validityDays * 24 * 60 * 60 * 1000),
        createdBy,
        metadata: {
            type: rewardType ? rewardType.category : 'standard',
            description: rewardType ? rewardType.name : `Reward for receipt ${receipt.id}`,
            totalAmount: receipt.totalAmount,
            isAutomatic: true
        }
    };
}
