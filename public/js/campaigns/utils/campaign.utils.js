import { CAMPAIGN_STATUS, VALIDATION_RULES } from '../constants/campaign.constants'

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