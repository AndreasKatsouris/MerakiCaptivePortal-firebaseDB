/**
 * Feature Service
 * Wraps feature access control for dashboard use
 */

import { featureAccessControl } from '../../../modules/access-control/services/feature-access-control.js'
import { FEATURES_TO_CHECK } from '../constants/dashboard.constants.js'

/**
 * Pre-fetch and cache the current user's subscription
 * Call once before checking multiple features to avoid redundant API calls
 * @returns {Promise<void>}
 */
export async function prefetchSubscription() {
  await featureAccessControl.getCurrentUserSubscription()
}

/**
 * Check access for all dashboard features in parallel
 * @returns {Promise<Object>} Map of featureId -> boolean
 */
export async function checkAllFeatures() {
  await prefetchSubscription()

  const featureCheckPromises = FEATURES_TO_CHECK.map(async (feature) => {
    const accessResult = await featureAccessControl.checkFeatureAccess(feature)
    return { feature, hasAccess: accessResult.hasAccess }
  })

  const featureResults = await Promise.all(featureCheckPromises)

  const featureAccessMap = {}
  featureResults.forEach(result => {
    featureAccessMap[result.feature] = result.hasAccess
  })

  return featureAccessMap
}

/**
 * Show upgrade prompt for a specific feature
 * @param {string} featureId - Feature to show upgrade for
 */
export function showUpgradePrompt(featureId) {
  featureAccessControl.showUpgradePrompt(featureId)
}
