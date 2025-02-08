/**
 * @typedef {Object} Campaign
 * @property {string} id - Unique identifier
 * @property {string} name - Campaign name
 * @property {string} brandName - Associated brand
 * @property {string} [storeName] - Specific store (optional)
 * @property {string} startDate - Start date (ISO string)
 * @property {string} endDate - End date (ISO string)
 * @property {string} status - Current status
 * @property {number} [minPurchaseAmount] - Minimum purchase amount
 * @property {RequiredItem[]} [requiredItems] - Required items for campaign
 * @property {CampaignSettings} settings - Campaign settings
 * @property {CampaignRewardType[]} [rewardTypes] - Associated reward types
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 */

/**
 * @typedef {Object} RequiredItem
 * @property {string} name - Item name
 * @property {number} quantity - Required quantity
 * @property {string} [sku] - Item SKU (optional)
 */

/**
 * @typedef {Object} CampaignSettings
 * @property {string} type - Campaign type
 * @property {number} pointsMultiplier - Points multiplier for points campaigns
 * @property {number[]} daysOfWeek - Valid days (0-6, Sunday to Saturday)
 * @property {TimeRestriction} [timeRestrictions] - Time restrictions
 * @property {number} [maxRewardsPerUser] - Max rewards per user
 * @property {number} [maxTotalRewards] - Max total rewards
 * @property {boolean} requiresReceipt - Whether receipt is required
 */

/**
 * @typedef {Object} TimeRestriction
 * @property {string} startTime - Start time (HH:mm)
 * @property {string} endTime - End time (HH:mm)
 */

/**
 * @typedef {Object} CampaignMetrics
 * @property {number} totalRewards - Total rewards issued
 * @property {number} totalValue - Total value of rewards
 * @property {number} redemptionRate - Reward redemption rate
 * @property {number} participantCount - Unique participants
 */

/**
 * @typedef {Object} CampaignRewardType
 * @property {string} typeId - ID of the reward type
 * @property {RewardCriteria} criteria - Criteria for this reward type
 */

/**
 * @typedef {Object} RewardCriteria
 * @property {number} [minPurchaseAmount] - Minimum purchase amount required
 * @property {number} [maxRewards] - Maximum number of rewards allowed
 * @property {string[]} [storeRestrictions] - List of store IDs where reward is valid
 * @property {RequiredItem[]} [requiredItems] - Specific items required for this reward
 * @property {string} [startTime] - Daily start time (HH:mm)
 * @property {string} [endTime] - Daily end time (HH:mm)
 */

export const CampaignStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
}