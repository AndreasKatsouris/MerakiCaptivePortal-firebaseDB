/**
 * setUserTier — client helper that routes an admin tier change through the
 * `entitlementSetTier` Cloud Function (Phase 7 ④a PR4).
 *
 * Why this exists: once the `subscriptions/$uid` rule lock lands, the resolver
 * (Admin SDK) is the SOLE writer of materialized `features`/`limits`. Admin UIs
 * may no longer write `tier`/`features`/`limits` directly from the browser — the
 * child-level `.validate: false` on those nodes rejects it. This helper calls the
 * server, which sets `tier`/`tierId` and recomputes entitlements atomically.
 *
 * Non-entitlement audit fields (history, monthlyPrice, lastUpdated) are written
 * client-side by the caller (typically the multi-path `update()` BEFORE calling
 * this) — admin-token browser writes to those fields remain allowed (they carry
 * no features/limits). Ordering doesn't matter for correctness: features/limits
 * come ONLY from this CF's server-side recompute.
 *
 * Auth: the CF is admin-gated (PR4 Q3). The current user must be an admin.
 * Throws on non-OK response with the server's error message.
 */

import { auth } from '../../../config/firebase-config.js';

const FUNCTIONS_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net';

/**
 * @param {string} uid     target user uid
 * @param {string} tierId  tier id (validated server-side against subscriptionTiers)
 * @returns {Promise<{ success: boolean, uid: string, effective: object }>}
 */
export async function setUserTier(uid, tierId) {
  if (!auth.currentUser) {
    throw new Error('Not authenticated');
  }
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(`${FUNCTIONS_URL}/entitlementSetTier`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ uid, tierId }),
  });

  let result;
  try {
    result = await response.json();
  } catch (_err) {
    result = {};
  }

  if (!response.ok) {
    throw new Error(result.error || `entitlementSetTier failed (${response.status})`);
  }
  return result.result || result;
}
