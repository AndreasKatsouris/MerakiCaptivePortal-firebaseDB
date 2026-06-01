'use strict';

/**
 * Phase 7 ④a Entitlement resolver — the SOLE writer of materialized
 * `subscriptions/{uid}/features` and `limits`. Effective entitlements =
 * base tier ⊕ active add-ons.
 *
 * Spec: docs/plans/2026-05-31-entitlements-addon-layer-design.md
 *
 * Built in slices:
 *   - Slice 1 (this commit): pure mergeEntitlements.
 *   - Slice 2: recomputeEntitlements(uid) (read tier+addOns, materialize) + getDb seam.
 */

const admin = require('firebase-admin');
const {
    UNLIMITED_SENTINEL,
    mapToBaseTier,
    featuresPath,
    limitsPath,
    subPath,
    tierDefPath,
} = require('./constants');

// Lazy DB accessor + test seam (matches the ross.js / billing ledger pattern).
let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
/** Test-only: inject an in-memory RTDB fake. */
function __setDbForTests(fake) { _db = fake; }

// A subscription confers its paid tier only while live. Expired/cancelled strip to
// Free (operator decision 2026-06-01). 'trial' counts as active.
function isSubscriptionLive(status) {
    return status === 'active' || status === 'trial';
}

/** An add-on contributes only while active and not past its expiry. */
function isAddOnActive(addOn, now) {
    if (!addOn || addOn.status !== 'active') return false;
    if (addOn.expiresAt != null && addOn.expiresAt <= now) return false;
    return true;
}

/**
 * Pure merge of a base tier's entitlements with active add-ons.
 *
 * @param {{features?:object, limits?:object}} base
 * @param {Array<{deltas?:{features?:object,limits?:object}, status?:string, expiresAt?:number|null}>} addOns
 * @param {number} now - epoch ms used for expiry comparison
 * @returns {{features:object, limits:object}}
 */
function mergeEntitlements(base, addOns, now) {
    const baseFeatures = (base && base.features) || {};
    const baseLimits = (base && base.limits) || {};
    const activeAddOns = (addOns || []).filter((a) => isAddOnActive(a, now));

    // Features: OR. A true (base or any add-on) wins; an add-on can never clear a base true.
    const features = { ...baseFeatures };
    for (const addOn of activeAddOns) {
        const deltaFeatures = (addOn.deltas && addOn.deltas.features) || {};
        for (const key of Object.keys(deltaFeatures)) {
            if (deltaFeatures[key]) features[key] = true;
        }
    }

    // Limits: additive. UNLIMITED_SENTINEL (-1) on either side makes the limit unlimited.
    const limits = { ...baseLimits };
    for (const addOn of activeAddOns) {
        const deltaLimits = (addOn.deltas && addOn.deltas.limits) || {};
        for (const key of Object.keys(deltaLimits)) {
            const current = limits[key];
            const delta = deltaLimits[key];
            if (current === UNLIMITED_SENTINEL || delta === UNLIMITED_SENTINEL) {
                limits[key] = UNLIMITED_SENTINEL;
            } else {
                limits[key] = (typeof current === 'number' ? current : 0) + delta;
            }
        }
    }

    return { features, limits };
}

/**
 * The sole writer of materialized entitlements. Reads the subscription's tier +
 * add-ons, applies the expiry rule, merges, and atomically materializes the result
 * into the canonical `subscriptions/{uid}/features` + `limits` paths so every
 * existing gate (which reads those fields first) is transparent.
 *
 * @returns {Promise<{features,limits}|{skipped:true}>}
 */
async function recomputeEntitlements(uid) {
    const subSnap = await getDb().ref(subPath(uid)).once('value');
    const sub = subSnap.val();
    if (!sub) return { skipped: true }; // no record → nothing to materialize (fail-closed)

    const tierId = sub.tierId || sub.tier;
    // Expired/cancelled subscriptions strip to Free regardless of the stored tier.
    const baseTierId = isSubscriptionLive(sub.status) ? mapToBaseTier(tierId) : 'free';

    const tierSnap = await getDb().ref(tierDefPath(baseTierId)).once('value');
    const tierDef = tierSnap.val() || {};
    const base = { features: tierDef.features || {}, limits: tierDef.limits || {} };

    const addOns = sub.addOns ? Object.values(sub.addOns) : [];
    const merged = mergeEntitlements(base, addOns, Date.now());

    // Atomic multi-path write — the only writer of these fields.
    await getDb().ref().update({
        [featuresPath(uid)]: merged.features,
        [limitsPath(uid)]: merged.limits,
        [`${subPath(uid)}/entitlementsUpdatedAt`]: Date.now(),
    });

    return merged;
}

module.exports = {
    mergeEntitlements,
    isAddOnActive,
    isSubscriptionLive,
    recomputeEntitlements,
    __setDbForTests,
};
