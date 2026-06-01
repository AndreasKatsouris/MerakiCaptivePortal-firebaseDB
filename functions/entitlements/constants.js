'use strict';

/**
 * Phase 7 ④a Entitlement resolver — shared constants.
 *
 * The resolver is the SOLE writer of materialized `subscriptions/{uid}/features`
 * and `limits`. Effective entitlements = base tier ⊕ active add-ons.
 *
 * Spec: docs/plans/2026-05-31-entitlements-addon-layer-design.md
 */

// Limit sentinel: a limit of -1 means "unlimited" and overrides any finite sum.
const UNLIMITED_SENTINEL = -1;

// Legacy 4-tier → 2-tier (free/all-in) map (finding F). Operationally moot in v1
// (no paying customers), but keeps the resolver tier-count-agnostic so the future
// 4→2 collapse (④b) is a config change, not a rewrite. Unknown tier → 'free'.
const TIER_MAP = Object.freeze({
    free: 'free',
    starter: 'free',
    professional: 'all-in',
    enterprise: 'all-in',
});

function mapToBaseTier(tierId) {
    return TIER_MAP[tierId] || 'free';
}

// RTDB path helpers.
const subPath = (uid) => `subscriptions/${uid}`;
const featuresPath = (uid) => `subscriptions/${uid}/features`;
const limitsPath = (uid) => `subscriptions/${uid}/limits`;
const addOnsPath = (uid) => `subscriptions/${uid}/addOns`;
const tierDefPath = (baseTierId) => `subscriptionTiers/${baseTierId}`;
const ADDON_CATALOG = 'addOnCatalog';

module.exports = {
    UNLIMITED_SENTINEL,
    TIER_MAP,
    mapToBaseTier,
    subPath,
    featuresPath,
    limitsPath,
    addOnsPath,
    tierDefPath,
    ADDON_CATALOG,
};
