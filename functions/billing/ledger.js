'use strict';

/**
 * Phase 7 ① Credit Ledger — core module.
 *
 * USD-denominated prepaid credit ledger (no FX in v1). Server-side only; never
 * exposed directly as a Cloud Function except via the thin wrappers in
 * functions/billing/cloud-functions.js. Consumers (rossChat now; OCR/WhatsApp
 * later) import and call this module.
 *
 * Spec: docs/plans/2026-05-31-metering-credit-ledger-design.md
 *
 * This file is built in slices:
 *   - Slice 2 (this commit): pure cost formula + service dispatch.
 *   - Slice 3: I/O — checkBalance, recordUsageAndDebit (pre-gen key + transaction
 *     + idempotent retry), grantCredit, getBalanceCents, getUsage.
 */

const { SERVICES } = require('./constants');

/**
 * Pure token-cost computation for the askRoss service. Returns integer USD cents.
 *
 * @param {object} units - { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens }
 *                          (missing fields default to 0)
 * @param {object} rate  - frozen rate snapshot:
 *                          { usdPerMtokInput, usdPerMtokOutput, cacheWriteMult, cacheReadMult, markup }
 * @returns {{ costCents: number, wholesaleUsdCents: number }}
 */
function computeTokenCost(units, rate) {
    const inputTokens = units.inputTokens || 0;
    const outputTokens = units.outputTokens || 0;
    const cacheWriteTokens = units.cacheWriteTokens || 0;
    const cacheReadTokens = units.cacheReadTokens || 0;

    const inUsd = (inputTokens / 1e6) * rate.usdPerMtokInput;
    const outUsd = (outputTokens / 1e6) * rate.usdPerMtokOutput;
    const cacheWrUsd = (cacheWriteTokens / 1e6) * rate.usdPerMtokInput * rate.cacheWriteMult;
    const cacheRdUsd = (cacheReadTokens / 1e6) * rate.usdPerMtokInput * rate.cacheReadMult;

    const wholesaleUsd = inUsd + outUsd + cacheWrUsd + cacheRdUsd;

    // Single final rounding per value → integer USD cents. costCents applies the
    // passthrough markup; wholesaleUsdCents is our raw cost (margin = cost − wholesale).
    return {
        costCents: Math.round(wholesaleUsd * rate.markup * 100),
        wholesaleUsdCents: Math.round(wholesaleUsd * 100),
    };
}

/**
 * Service-dispatch cost computation. THROWS on an unknown service rather than
 * silently billing zero (spec §11.2) — a future OCR/WhatsApp consumer must add
 * its own branch + rate path, not fall through to a 0 charge.
 *
 * @param {string} service - one of SERVICES.* (v1: only ASK_ROSS)
 * @param {object} units
 * @param {object} rate
 * @returns {{ costCents: number, wholesaleUsdCents: number }}
 */
function computeCostCents(service, units, rate) {
    switch (service) {
        case SERVICES.ASK_ROSS:
            return computeTokenCost(units, rate);
        default:
            throw new Error(`computeCostCents: unknown billing service '${service}'`);
    }
}

module.exports = {
    computeCostCents,
    computeTokenCost,
};
