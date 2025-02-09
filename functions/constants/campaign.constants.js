export const REWARD_TYPE_VALIDATION = {
    MIN_PURCHASE: {
        min: 0,
        required: false
    },
    MAX_REWARDS: {
        min: 1,
        required: false
    },
    CRITERIA: {
        required: true,
        validFields: [
            'minPurchaseAmount',
            'maxRewards',
            'storeRestrictions',
            'requiredItems',
            'startTime',
            'endTime'
        ]
    },
    STORE_RESTRICTIONS: {
        required: false,
        minStores: 1
    },
    TIME_RESTRICTIONS: {
        required: false,
        format: 'HH:mm'
    }
}; 