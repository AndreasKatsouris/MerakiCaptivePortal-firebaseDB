'use strict';

/**
 * D1 access gate. Two checks, in this order:
 *   1. location access — REUSED from agent/tools (design F3: never a third
 *      hand-rolled variant of this predicate);
 *   2. the `purchaseOrders` entitlement, admins-first, mirroring
 *      food-cost-overview.js:118-124 and ross.js:104-120.
 *
 * Access precedes entitlement deliberately: an unauthorised caller must not be
 * able to distinguish "not yours" from "not on your plan".
 *
 * Callers treat `false` as the anti-enumeration outcome — return a bare
 * {hasData:false} rather than a distinguishing error (design §7.1 / the agent
 * tools' convention).
 *
 * Per the 2026-08-04 operator decision this is the ONLY gate: any caller with
 * location access may manage the supplier book, matching the People tab rather
 * than adding an owner-only tier. If that ever changes, it changes HERE, once —
 * which is the reason every poCatalog action routes through this one function.
 */

const tools = require('../agent/tools');

async function assertLocationAccess(db, locationId, uid) {
  try {
    // Property access (not destructured at require time) so vi.spyOn in tests
    // intercepts the call — a destructured binding would capture the original.
    if (!(await tools.callerHasLocationAccess(locationId, uid))) return false;

    const adminSnap = await db.ref(`admins/${uid}`).once('value');
    if (adminSnap.exists()) return true;

    const featSnap = await db.ref(`subscriptions/${uid}/features`).once('value');
    const features = featSnap.val();
    // Strictly boolean true. RTDB will happily hold the STRING "false", which a
    // truthiness check would read as entitled.
    return !!features && features.purchaseOrders === true;
  } catch (err) {
    // Fail CLOSED. A gate that throws must deny, never fall through to an allow
    // — an RTDB blip would otherwise open every action this gate protects.
    // Fixed string, no interpolation: this line must not become a channel for
    // attacker-influenced text (2026-07-26 log-injection lesson).
    console.error('PO_ACCESS_CHECK_FAILED');
    return false;
  }
}

module.exports = { assertLocationAccess };
