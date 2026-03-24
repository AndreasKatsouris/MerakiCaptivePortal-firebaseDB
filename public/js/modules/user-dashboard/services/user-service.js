/**
 * User Service
 * Handles user data, subscription, and tier operations via Firebase RTDB
 */

import { auth, rtdb, ref, get } from '../../../config/firebase-config.js'
import { fixUserSubscriptionData } from '../../../utils/subscription-tier-fix.js'

/**
 * Fetch user data from RTDB
 * @param {string} uid - User ID
 * @returns {Promise<Object|null>} User data object or null
 */
export async function fetchUserData(uid) {
  const userSnapshot = await get(ref(rtdb, `users/${uid}`))
  return userSnapshot.val()
}

/**
 * Fetch and fix subscription data for a user
 * @param {string} uid - User ID
 * @returns {Promise<Object|null>} Fixed subscription data
 */
export async function fetchSubscriptionData(uid) {
  return fixUserSubscriptionData(uid)
}

/**
 * Fetch tier details from RTDB
 * @param {string} tierId - Subscription tier ID
 * @returns {Promise<Object|null>} Tier data object or null
 */
export async function fetchTierData(tierId) {
  const tierSnapshot = await get(ref(rtdb, `subscriptionTiers/${tierId}`))
  return tierSnapshot.val()
}

/**
 * Check if user has completed onboarding
 * @param {string} uid - User ID
 * @returns {Promise<boolean>} Whether onboarding is complete
 */
export async function checkOnboardingComplete(uid) {
  const onboardingSnapshot = await get(ref(rtdb, `onboarding-progress/${uid}`))
  if (!onboardingSnapshot.exists()) return false
  return !!onboardingSnapshot.val().completed
}

/**
 * Sign out the current user
 */
export async function signOut() {
  await auth.signOut()
}
