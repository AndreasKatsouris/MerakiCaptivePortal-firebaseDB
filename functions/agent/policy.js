'use strict';

/**
 * Phase 7 ② askRoss Agent — policy engine (§4). Pure: no I/O, no engine deps.
 *
 * An owner may TIGHTEN a tool's autonomy (auto → confirm → off) but never loosen it
 * past its hard ceiling. Reactive and proactive engines both call effectivePolicy;
 * they differ only in how they ENFORCE the result (reactive pauses mid-loop on
 * `confirm`; proactive collapses to a static `auto`-only allowlist — see §1.1).
 *
 * Spec: docs/plans/2026-05-31-askross-agent-design.md §4
 */

const { TIER_RANK } = require('./constants');

function isValidTier(t) {
    return typeof t === 'string' && Object.prototype.hasOwnProperty.call(TIER_RANK, t);
}

/** Return the stricter (higher-rank) of two tiers. */
function stricter(a, b) {
    return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/**
 * Clamp a desired tier so it is never LOOSER than the ceiling.
 * @param {string} desired
 * @param {string} ceiling - the loosest autonomy a tool may ever have
 * @returns {string}
 */
function clampToCeiling(desired, ceiling) {
    if (!isValidTier(desired)) return ceiling;
    return TIER_RANK[desired] >= TIER_RANK[ceiling] ? desired : ceiling;
}

/**
 * Resolve the effective tier for a tool given an owner's (already-read) agentConfig.
 * Owner override may only tighten; the result is then clamped to the tool's ceiling.
 *
 * @param {string} toolName
 * @param {{tier:string, ceiling:string}} toolDef
 * @param {{policy?:Object<string,string>}} [ownerConfig]
 * @returns {string} 'auto' | 'confirm' | 'off'
 */
function effectivePolicy(toolName, toolDef, ownerConfig) {
    const override = ownerConfig && ownerConfig.policy && ownerConfig.policy[toolName];
    // Override may only tighten: take the stricter of (override, default). An override
    // looser than the default is ignored.
    const desired = isValidTier(override) ? stricter(override, toolDef.tier) : toolDef.tier;
    return clampToCeiling(desired, toolDef.ceiling);
}

module.exports = {
    isValidTier,
    stricter,
    clampToCeiling,
    effectivePolicy,
};
