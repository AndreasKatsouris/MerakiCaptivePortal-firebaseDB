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

const { UNLIMITED_SENTINEL } = require('./constants');

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

module.exports = {
    mergeEntitlements,
    isAddOnActive,
};
