/**
 * Statistics Service
 * Handles dashboard statistics queries via Firebase RTDB
 */

import { rtdb, ref, get, query, orderByChild, equalTo } from '../../../config/firebase-config.js'
import { dbPaginator } from '../../../utils/database-paginator.js'

/**
 * Fetch dashboard statistics for given locations
 * Uses paginated queries for performance optimization
 * @param {Array<string>} locationIds - Location IDs to aggregate stats for
 * @returns {Promise<Object>} Aggregated statistics
 */
export async function fetchDashboardStatistics(locationIds) {
  if (!locationIds.length) {
    return {
      totalGuests: 0,
      activeCampaigns: 0,
      totalRewards: 0,
      engagementRate: 0
    }
  }

  const statisticsPromises = locationIds.map(async (locationId) => {
    const [guestsResult, campaignsQuery, rewardsQuery] = await Promise.all([
      dbPaginator.getLocationPagedData('guests', locationId, 50),
      get(ref(rtdb, `campaigns/${locationId}`)),
      get(ref(rtdb, `rewards/${locationId}`))
    ])

    let guestCount = guestsResult.totalLoaded

    if (guestsResult.hasMore) {
      const fullGuestsQuery = await get(
        query(ref(rtdb, 'guests'), orderByChild('locationId'), equalTo(locationId))
      )
      guestCount = fullGuestsQuery.exists() ? Object.keys(fullGuestsQuery.val()).length : 0
    }

    return {
      guestCount,
      campaignsCount: campaignsQuery.exists() ? Object.keys(campaignsQuery.val()).length : 0,
      rewardsCount: rewardsQuery.exists() ? Object.keys(rewardsQuery.val()).length : 0
    }
  })

  const results = await Promise.all(statisticsPromises)

  let totalGuests = 0
  let activeCampaigns = 0
  let totalRewards = 0

  results.forEach(result => {
    totalGuests += result.guestCount
    activeCampaigns += result.campaignsCount
    totalRewards += result.rewardsCount
  })

  const engagementRate = totalGuests > 0
    ? Math.round((totalRewards / totalGuests) * 100)
    : 0

  return {
    totalGuests,
    activeCampaigns,
    totalRewards,
    engagementRate
  }
}
