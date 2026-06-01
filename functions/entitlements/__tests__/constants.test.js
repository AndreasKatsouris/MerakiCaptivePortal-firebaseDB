'use strict';

const { mapToBaseTier, UNLIMITED_SENTINEL } = require('../constants');

describe('mapToBaseTier (legacy 4-tier → free/all-in)', () => {
    it('maps each legacy tier', () => {
        expect(mapToBaseTier('free')).toBe('free');
        expect(mapToBaseTier('starter')).toBe('free');
        expect(mapToBaseTier('professional')).toBe('all-in');
        expect(mapToBaseTier('enterprise')).toBe('all-in');
    });

    it('defaults unknown / missing tiers to free (fail closed)', () => {
        expect(mapToBaseTier('enterprise-legacy')).toBe('free');
        expect(mapToBaseTier(undefined)).toBe('free');
        expect(mapToBaseTier(null)).toBe('free');
    });
});

describe('constants', () => {
    it('UNLIMITED_SENTINEL is -1', () => {
        expect(UNLIMITED_SENTINEL).toBe(-1);
    });
});
