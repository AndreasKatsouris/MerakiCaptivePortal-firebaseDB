/**
 * Pure tier-gating helpers for ROSS templates. Zero dependencies on
 * firebase-admin / db — composable into Cloud Functions, easy to test.
 *
 * Two-tier model (locked per PR #42 spec): 'free' | 'all-in'.
 * SuperAdmin bypasses tier checks at every gate point.
 * Missing user tier fails closed (treated as 'free' — the most-restrictive
 * tier — so a half-migrated user can't accidentally see All-in content).
 */

const VALID_TIERS = ['free', 'all-in'];

function validateTier(value) {
    if (typeof value !== 'string' || !VALID_TIERS.includes(value)) {
        return `Invalid tier: ${JSON.stringify(value)}. Must be one of: ${VALID_TIERS.join(', ')}`;
    }
    return null;
}

function userCanActivate(userTier, templateTier, isSuperAdmin) {
    if (isSuperAdmin) return true;
    if (templateTier === 'free') return true;
    return userTier === 'all-in';
}

function filterTemplatesByTier(templates, userTier, isSuperAdmin, includeLocked) {
    if (!Array.isArray(templates)) return [];
    if (isSuperAdmin) return templates;
    if (userTier === 'all-in') return templates;
    // Free or missing tier
    if (includeLocked !== true) {
        return templates.filter(t => t && t.tier === 'free');
    }
    return templates.map(t => {
        if (!t || typeof t !== 'object') return t;
        if (t.tier === 'free') return t;
        return { ...t, locked: true };
    });
}

module.exports = {
    VALID_TIERS,
    validateTier,
    userCanActivate,
    filterTemplatesByTier,
};
