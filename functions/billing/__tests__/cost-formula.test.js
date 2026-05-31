'use strict';

/**
 * Pure cost-formula golden vectors — zero Firebase, fully deterministic.
 * USD-denominated (no FX). Vectors are hand-computed; the rate cards are copied
 * verbatim so the test pins the exact integer USD-cents output (and the rounding).
 *
 * Formula (spec §4):
 *   wholesaleUsd = in/1e6·rIn + out/1e6·rOut
 *                + cacheWr/1e6·rIn·writeMult + cacheRd/1e6·rIn·readMult
 *   costCents         = round(wholesaleUsd · markup · 100)
 *   wholesaleUsdCents = round(wholesaleUsd · 100)
 */

const { computeCostCents } = require('../ledger');
const { SERVICES } = require('../constants');

const SONNET = {
    usdPerMtokInput: 3,
    usdPerMtokOutput: 15,
    cacheWriteMult: 1.25,
    cacheReadMult: 0.10,
    markup: 1.30,
};

const HAIKU = {
    usdPerMtokInput: 1,
    usdPerMtokOutput: 5,
    cacheWriteMult: 1.25,
    cacheReadMult: 0.10,
    markup: 1.30,
};

describe('computeCostCents — askRoss token cost (USD cents)', () => {
    it('input tokens only: 1M @ $3/Mtok × 1.30', () => {
        // wholesale = 3.00 USD → 300c; cost = 3.00·1.30·100 = 390c
        expect(computeCostCents(SERVICES.ASK_ROSS, { inputTokens: 1_000_000 }, SONNET))
            .toEqual({ costCents: 390, wholesaleUsdCents: 300 });
    });

    it('output tokens only: 1M @ $15/Mtok × 1.30', () => {
        // wholesale = 15.00 → 1500c; cost = 15·1.30·100 = 1950c
        expect(computeCostCents(SERVICES.ASK_ROSS, { outputTokens: 1_000_000 }, SONNET))
            .toEqual({ costCents: 1950, wholesaleUsdCents: 1500 });
    });

    it('cache read at 0.10× input: 1M', () => {
        // wholesale = 1·3·0.10 = 0.30 → 30c; cost = 0.30·1.30·100 = 39c
        expect(computeCostCents(SERVICES.ASK_ROSS, { cacheReadTokens: 1_000_000 }, SONNET))
            .toEqual({ costCents: 39, wholesaleUsdCents: 30 });
    });

    it('cache write at 1.25× input: 1M — pins x.5 rounding (487.5 → 488)', () => {
        // wholesale = 1·3·1.25 = 3.75 → 375c; cost = 3.75·1.30·100 = 487.5 → round 488
        expect(computeCostCents(SERVICES.ASK_ROSS, { cacheWriteTokens: 1_000_000 }, SONNET))
            .toEqual({ costCents: 488, wholesaleUsdCents: 375 });
    });

    it('mixed realistic turn (all four token types)', () => {
        // in 0.03 + out 0.03 + cacheWr 0.01875 + cacheRd 0.015 = 0.09375 USD
        // → wholesale 9.375 → round 9c; cost 0.09375·1.30·100 = 12.1875 → round 12c
        expect(computeCostCents(
            SERVICES.ASK_ROSS,
            { inputTokens: 10_000, outputTokens: 2_000, cacheWriteTokens: 5_000, cacheReadTokens: 50_000 },
            SONNET,
        )).toEqual({ costCents: 12, wholesaleUsdCents: 9 });
    });

    it('zero tokens → zero cost (valid, not a throw)', () => {
        expect(computeCostCents(SERVICES.ASK_ROSS, {}, SONNET))
            .toEqual({ costCents: 0, wholesaleUsdCents: 0 });
    });

    it('missing token fields default to 0', () => {
        expect(computeCostCents(SERVICES.ASK_ROSS, { inputTokens: 1_000_000, outputTokens: undefined }, SONNET))
            .toEqual({ costCents: 390, wholesaleUsdCents: 300 });
    });

    it('Haiku rate card: 1M input @ $1/Mtok × 1.30', () => {
        // wholesale 1.00 → 100c; cost 130c
        expect(computeCostCents(SERVICES.ASK_ROSS, { inputTokens: 1_000_000 }, HAIKU))
            .toEqual({ costCents: 130, wholesaleUsdCents: 100 });
    });
});
