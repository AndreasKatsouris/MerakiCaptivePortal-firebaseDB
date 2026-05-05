// Shared loader for the `subscriptionTiers` RTDB node.
//
// Used by the public marketing pricing section AND (eventually) by the
// signup tier-select step. Both surfaces want the same shape: an array
// sorted by ascending monthlyPrice so the lowest-friction tier reads
// first. PR 2's signup-service.js still has its own copy of this for
// now; a follow-up cleanup PR can switch signup to import from here.
//
// @throws {Error} when the RTDB read fails. Caller surfaces the error
// inline (no SweetAlert — that util silently no-ops on Hi-Fi shells).

import { rtdb, ref, get } from '/js/config/firebase-config.js'

export async function loadTiers() {
  try {
    const snap = await get(ref(rtdb, 'subscriptionTiers'))
    const raw = snap.val() || {}
    return Object.entries(raw)
      .map(([id, tier]) => ({ id, ...tier }))
      .sort((a, b) => (a.monthlyPrice || 0) - (b.monthlyPrice || 0))
  } catch (err) {
    console.error('[subscription-tiers] load failed:', err)
    throw new Error('Could not load subscription plans. Please try again later.')
  }
}
