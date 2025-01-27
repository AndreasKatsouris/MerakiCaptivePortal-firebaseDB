// stores/types/campaign.types.js

/**
 * @typedef {Object} Campaign
 * @property {string} id
 * @property {string} name
 * @property {string} brandName
 * @property {string} storeName
 * @property {string} startDate
 * @property {string} endDate
 * @property {string} status
 * @property {number} minPurchaseAmount
 * @property {Array<RequiredItem>} requiredItems
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} RequiredItem
 * @property {string} name
 * @property {number} quantity
 */

/**
 * @typedef {Object} CampaignState
 * @property {Array<Campaign>} campaigns
 * @property {boolean} loading
 * @property {Campaign|null} currentCampaign
 * @property {string|null} error
 * @property {Object} validationStatus
 */

export const CampaignStatus = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    DRAFT: 'draft',
    EXPIRED: 'expired'
  };