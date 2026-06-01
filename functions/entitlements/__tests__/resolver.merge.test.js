'use strict';

/**
 * Pure entitlement-merge golden vectors — zero Firebase, fully deterministic.
 * mergeEntitlements(base, addOns, now) computes effective features/limits:
 *   - features: OR across base + every ACTIVE add-on (an add-on can never turn a
 *     base `true` to false).
 *   - limits: additive across active add-ons; UNLIMITED_SENTINEL (-1) overrides
 *     any finite sum.
 *   - add-ons that are cancelled or past their expiresAt contribute nothing.
 */

const { mergeEntitlements } = require('../resolver');
const { UNLIMITED_SENTINEL } = require('../constants');

const NOW = 1_000_000;
const active = (deltas, extra = {}) => ({ status: 'active', expiresAt: null, deltas, ...extra });

describe('mergeEntitlements — features (OR)', () => {
    it('unions base + add-on feature flags', () => {
        const out = mergeEntitlements(
            { features: { rossBasic: true }, limits: {} },
            [active({ features: { rossAdvanced: true } })],
            NOW,
        );
        expect(out.features).toEqual({ rossBasic: true, rossAdvanced: true });
    });

    it('an add-on cannot turn a base true into false', () => {
        const out = mergeEntitlements(
            { features: { rossBasic: true }, limits: {} },
            [active({ features: { rossBasic: false } })],
            NOW,
        );
        expect(out.features.rossBasic).toBe(true);
    });

    it('base with no add-ons is unchanged', () => {
        const out = mergeEntitlements({ features: { a: true }, limits: {} }, [], NOW);
        expect(out.features).toEqual({ a: true });
    });
});

describe('mergeEntitlements — limits (additive + sentinel)', () => {
    it('adds an add-on delta to the base limit', () => {
        const out = mergeEntitlements(
            { features: {}, limits: { maxWorkflows: 5 } },
            [active({ limits: { maxWorkflows: 10 } })],
            NOW,
        );
        expect(out.limits.maxWorkflows).toBe(15);
    });

    it('stacks multiple add-ons on the same limit key', () => {
        const out = mergeEntitlements(
            { features: {}, limits: { maxWorkflows: 5 } },
            [active({ limits: { maxWorkflows: 10 } }), active({ limits: { maxWorkflows: 5 } })],
            NOW,
        );
        expect(out.limits.maxWorkflows).toBe(20);
    });

    it('a -1 add-on delta makes the limit unlimited', () => {
        const out = mergeEntitlements(
            { features: {}, limits: { maxWorkflows: 5 } },
            [active({ limits: { maxWorkflows: UNLIMITED_SENTINEL } })],
            NOW,
        );
        expect(out.limits.maxWorkflows).toBe(UNLIMITED_SENTINEL);
    });

    it('a -1 base limit stays unlimited regardless of add-ons', () => {
        const out = mergeEntitlements(
            { features: {}, limits: { maxWorkflows: UNLIMITED_SENTINEL } },
            [active({ limits: { maxWorkflows: 10 } })],
            NOW,
        );
        expect(out.limits.maxWorkflows).toBe(UNLIMITED_SENTINEL);
    });

    it('an add-on limit key absent from base starts from 0', () => {
        const out = mergeEntitlements(
            { features: {}, limits: {} },
            [active({ limits: { maxLocations: 3 } })],
            NOW,
        );
        expect(out.limits.maxLocations).toBe(3);
    });
});

describe('mergeEntitlements — add-on lifecycle filtering', () => {
    it('excludes an expired add-on (expiresAt <= now)', () => {
        const out = mergeEntitlements(
            { features: { base: true }, limits: { maxWorkflows: 5 } },
            [active({ features: { pro: true }, limits: { maxWorkflows: 10 } }, { expiresAt: NOW - 1 })],
            NOW,
        );
        expect(out.features).toEqual({ base: true });
        expect(out.limits.maxWorkflows).toBe(5);
    });

    it('includes an add-on expiring in the future', () => {
        const out = mergeEntitlements(
            { features: {}, limits: { maxWorkflows: 5 } },
            [active({ limits: { maxWorkflows: 10 } }, { expiresAt: NOW + 1 })],
            NOW,
        );
        expect(out.limits.maxWorkflows).toBe(15);
    });

    it('excludes a cancelled add-on', () => {
        const out = mergeEntitlements(
            { features: {}, limits: { maxWorkflows: 5 } },
            [{ status: 'cancelled', expiresAt: null, deltas: { limits: { maxWorkflows: 10 } } }],
            NOW,
        );
        expect(out.limits.maxWorkflows).toBe(5);
    });
});

describe('mergeEntitlements — defensive', () => {
    it('tolerates missing base / null add-ons', () => {
        const out = mergeEntitlements(undefined, null, NOW);
        expect(out).toEqual({ features: {}, limits: {} });
    });
});
