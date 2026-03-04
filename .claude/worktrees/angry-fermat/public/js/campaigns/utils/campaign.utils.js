import { CAMPAIGN_STATUS, VALIDATION_RULES, REWARD_TYPE_VALIDATION } from '../constants/campaign.constants'

export function validateCampaign(campaign) {
  const errors = []

  // Validate name
  if (!campaign.name) {
    errors.push('Campaign name is required')
  } else if (campaign.name.length < VALIDATION_RULES.NAME.minLength) {
    errors.push(`Campaign name must be at least ${VALIDATION_RULES.NAME.minLength} characters`)
  } else if (campaign.name.length > VALIDATION_RULES.NAME.maxLength) {
    errors.push(`Campaign name cannot exceed ${VALIDATION_RULES.NAME.maxLength} characters`)
  }

  // Validate dates
  if (!campaign.startDate || !campaign.endDate) {
    errors.push('Start and end dates are required')
  } else {
    const start = new Date(campaign.startDate)
    const end = new Date(campaign.endDate)
    if (end <= start) {
      errors.push('End date must be after start date')
    }
    
    // Check minimum duration
    const duration = (end - start) / (1000 * 60 * 60 * 24) // Convert to days
    if (duration < VALIDATION_RULES.DATES.minDuration) {
      errors.push(`Campaign must be at least ${VALIDATION_RULES.DATES.minDuration} day long`)
    }
  }

  // Validate brand
  if (!campaign.brandName) {
    errors.push('Brand name is required')
  }

  // Validate minimum purchase amount if set
  if (campaign.minPurchaseAmount !== null && campaign.minPurchaseAmount < 0) {
    errors.push('Minimum purchase amount cannot be negative')
  }

  // Validate reward types if present
  if (campaign.rewardTypes?.length > 0) {
    // Check for duplicate reward types
    const seenTypes = new Set()
    campaign.rewardTypes.forEach((reward, index) => {
      if (seenTypes.has(reward.typeId)) {
        errors.push(`Duplicate reward type found at index ${index}`)
        return
      }
      seenTypes.add(reward.typeId)

      // Validate reward criteria
      if (!reward.criteria) {
        errors.push(`Reward type at index ${index} must have criteria`)
        return
      }

      // Validate minimum purchase amount
      if (reward.criteria.minPurchaseAmount !== undefined) {
        if (reward.criteria.minPurchaseAmount < REWARD_TYPE_VALIDATION.MIN_PURCHASE.min) {
          errors.push(`Reward type ${index}: Minimum purchase amount cannot be negative`)
        }
      }

      // Validate maximum rewards
      if (reward.criteria.maxRewards !== undefined && reward.criteria.maxRewards !== null) {
        if (reward.criteria.maxRewards < REWARD_TYPE_VALIDATION.MAX_REWARDS.min) {
          errors.push(`Reward type ${index}: Maximum rewards must be at least ${REWARD_TYPE_VALIDATION.MAX_REWARDS.min}`)
        }
      }

      // Validate time restrictions if present
      if (reward.criteria.startTime || reward.criteria.endTime) {
        const timeFormat = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
        
        if (reward.criteria.startTime && !timeFormat.test(reward.criteria.startTime)) {
          errors.push(`Reward type ${index}: Invalid start time format. Use HH:mm`)
        }
        
        if (reward.criteria.endTime && !timeFormat.test(reward.criteria.endTime)) {
          errors.push(`Reward type ${index}: Invalid end time format. Use HH:mm`)
        }

        if (reward.criteria.startTime && reward.criteria.endTime) {
          const [startHour, startMinute] = reward.criteria.startTime.split(':').map(Number)
          const [endHour, endMinute] = reward.criteria.endTime.split(':').map(Number)
          
          if (startHour > endHour || (startHour === endHour && startMinute >= endMinute)) {
            errors.push(`Reward type ${index}: End time must be after start time`)
          }
        }
      }
    })
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

export function formatCampaignDates(startDate, endDate) {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return {
    formattedStart: formatDate(startDate),
    formattedEnd: formatDate(endDate)
  }
}

export function calculateCampaignStatus(campaign) {
  const now = new Date()
  const start = new Date(campaign.startDate)
  const end = new Date(campaign.endDate)

  if (campaign.status === CAMPAIGN_STATUS.CANCELLED) {
    return CAMPAIGN_STATUS.CANCELLED
  }

  if (now < start) {
    return CAMPAIGN_STATUS.DRAFT
  }

  if (now > end) {
    return CAMPAIGN_STATUS.COMPLETED
  }

  return campaign.status || CAMPAIGN_STATUS.ACTIVE
}

export async function getCampaignMetrics(campaignId) {
  try {
    const rewardsSnapshot = await firebase.database()
      .ref('rewards')
      .orderByChild('campaignId')
      .equalTo(campaignId)
      .once('value')

    const rewards = rewardsSnapshot.val() || {}

    return {
      totalRewards: Object.keys(rewards).length,
      totalValue: Object.values(rewards).reduce((sum, reward) => sum + (reward.value || 0), 0),
      redemptionRate: calculateRedemptionRate(rewards),
      participantCount: calculateUniqueParticipants(rewards)
    }
  } catch (error) {
    console.error('Error fetching campaign metrics:', error)
    throw new Error('Failed to fetch campaign metrics')
  }
}

function calculateRedemptionRate(rewards) {
  const total = Object.keys(rewards).length
  if (total === 0) return 0

  const redeemed = Object.values(rewards)
    .filter(reward => reward.status === 'redeemed')
    .length

  return (redeemed / total) * 100
}

function calculateUniqueParticipants(rewards) {
  return new Set(
    Object.values(rewards)
      .map(reward => reward.guestPhone)
      .filter(Boolean)
  ).size
}