export const CAMPAIGN_STATUS = {
    DRAFT: 'draft',
    ACTIVE: 'active',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  }
  
  export const CAMPAIGN_TYPES = {
    POINTS: 'points',
    DISCOUNT: 'discount',
    FREE_ITEM: 'free_item',
    BOGO: 'buy_one_get_one',
    SPECIAL: 'special'
  }
  
  export const VALIDATION_RULES = {
    NAME: {
      required: true,
      minLength: 3,
      maxLength: 100
    },
    DATES: {
      required: true,
      startBeforeEnd: true,
      minDuration: 1 // days
    },
    BRAND: {
      required: true
    },
    MIN_PURCHASE: {
      required: false,
      min: 0
    }
  }
  
  export const DEFAULT_CAMPAIGN_SETTINGS = {
    status: CAMPAIGN_STATUS.DRAFT,
    type: CAMPAIGN_TYPES.POINTS,
    minPurchaseAmount: 0,
    pointsMultiplier: 1,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days enabled by default
    timeRestrictions: null,
    maxRewardsPerUser: null,
    maxTotalRewards: null,
    requiresReceipt: true
  }