'use strict';

/**
 * Service-dispatch guard (spec §11.2): the cost formula is token-specific, so an
 * unknown service must THROW rather than silently bill zero (e.g. OCR passing
 * { pages: 3 } would otherwise compute NaN/0 and under-charge invisibly).
 */

const { computeCostCents } = require('../ledger');
const { SERVICES } = require('../constants');

const RATE = {
    usdPerMtokInput: 3,
    usdPerMtokOutput: 15,
    cacheWriteMult: 1.25,
    cacheReadMult: 0.10,
    markup: 1.30,
};

describe('computeCostCents — service dispatch', () => {
    it('throws on an unknown service (OCR), naming it', () => {
        expect(() => computeCostCents('ocr', { pages: 3 }, RATE))
            .toThrow(/unknown billing service 'ocr'/);
    });

    it('throws on whatsapp', () => {
        expect(() => computeCostCents('whatsapp', { messages: 2 }, RATE))
            .toThrow(/unknown billing service/);
    });

    it('throws on undefined service', () => {
        expect(() => computeCostCents(undefined, {}, RATE))
            .toThrow(/unknown billing service/);
    });

    it('does NOT throw for the supported askRoss service', () => {
        expect(() => computeCostCents(SERVICES.ASK_ROSS, { inputTokens: 1 }, RATE))
            .not.toThrow();
    });
});
