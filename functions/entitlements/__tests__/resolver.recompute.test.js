'use strict';

/**
 * recomputeEntitlements(uid) — reads the subscription's tier + add-ons, applies the
 * expiry rule (expired/cancelled subscriptions strip to Free), merges, and
 * materializes the result into the canonical subscriptions/{uid}/features + limits
 * paths (so existing readers are transparent). Uses the multi-path-aware fake.
 */

const resolver = require('../resolver');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

function seedDb(subscription) {
    return makeFakeRtdb({
        subscriptionTiers: {
            free: { features: { rossBasic: true }, limits: { maxWorkflows: 5 } },
            'all-in': { features: { rossBasic: true, rossAdvanced: true }, limits: { maxWorkflows: 50 } },
        },
        subscriptions: { u1: subscription },
    });
}

let db;
function useDb(subscription) {
    db = seedDb(subscription);
    resolver.__setDbForTests(db);
    return db;
}

describe('recomputeEntitlements — materialization', () => {
    it('materializes the base tier into canonical features/limits, overwriting stale values', async () => {
        useDb({ tierId: 'professional', status: 'active', features: { stale: true }, limits: { stale: 1 } });
        const res = await resolver.recomputeEntitlements('u1');

        const sub = db._dump().subscriptions.u1;
        // professional → all-in base
        expect(sub.features).toEqual({ rossBasic: true, rossAdvanced: true });
        expect(sub.limits).toEqual({ maxWorkflows: 50 });
        expect(typeof sub.entitlementsUpdatedAt).toBe('number');
        expect(res).toMatchObject({ features: { rossAdvanced: true }, limits: { maxWorkflows: 50 } });
    });

    it('is idempotent (run twice → identical result)', async () => {
        useDb({ tierId: 'starter', status: 'active' });
        await resolver.recomputeEntitlements('u1');
        const first = db._dump().subscriptions.u1;
        await resolver.recomputeEntitlements('u1');
        const second = db._dump().subscriptions.u1;
        expect(second.features).toEqual(first.features);
        expect(second.limits).toEqual(first.limits);
    });

    it('merges active add-ons on top of the base tier', async () => {
        useDb({
            tierId: 'professional', status: 'active',
            addOns: { packA: { addOnId: 'packA', status: 'active', expiresAt: null, deltas: { limits: { maxWorkflows: 10 } } } },
        });
        await resolver.recomputeEntitlements('u1');
        expect(db._dump().subscriptions.u1.limits.maxWorkflows).toBe(60); // 50 + 10
    });
});

describe('recomputeEntitlements — expiry strips to Free', () => {
    it('an expired subscription gets Free entitlements regardless of tierId', async () => {
        useDb({ tierId: 'professional', status: 'expired' });
        await resolver.recomputeEntitlements('u1');
        const sub = db._dump().subscriptions.u1;
        expect(sub.features).toEqual({ rossBasic: true });   // free, not all-in
        expect(sub.limits).toEqual({ maxWorkflows: 5 });
    });

    it('a cancelled subscription also strips to Free', async () => {
        useDb({ tierId: 'enterprise', status: 'cancelled' });
        await resolver.recomputeEntitlements('u1');
        expect(db._dump().subscriptions.u1.limits.maxWorkflows).toBe(5);
    });

    it('a trial subscription keeps its tier (treated as active)', async () => {
        useDb({ tierId: 'professional', status: 'trial' });
        await resolver.recomputeEntitlements('u1');
        expect(db._dump().subscriptions.u1.limits.maxWorkflows).toBe(50); // all-in
    });
});

describe('recomputeEntitlements — fail-safe', () => {
    it('no subscription record → skipped, no write', async () => {
        db = makeFakeRtdb({ subscriptionTiers: { free: { features: {}, limits: {} } } });
        resolver.__setDbForTests(db);
        const res = await resolver.recomputeEntitlements('ghost');
        expect(res).toEqual({ skipped: true });
        expect(db._dump().subscriptions).toBeUndefined();
    });
});
