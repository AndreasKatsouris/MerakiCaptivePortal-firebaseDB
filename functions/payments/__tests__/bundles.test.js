import { describe, it, expect } from 'vitest';
const { makeFakeRtdb } = require('./helpers/fake-rtdb');
const bundles = require('../bundles');

const TREE = { billing: { creditBundles: {
    usd20:  { usdGrantCents: 2000,  zarChargeCents: 36000,  label: '$20 credit',  active: true,  sort: 1 },
    usd99:  { usdGrantCents: 9900,  zarChargeCents: 178200, label: '$99 credit',  active: true,  sort: 2 },
    usd200: { usdGrantCents: 20000, zarChargeCents: 360000, label: '$200 credit', active: false, sort: 3 },
} } };

describe('resolveBundle', () => {
    it('returns an active bundle by id', async () => {
        const db = makeFakeRtdb(TREE);
        const b = await bundles.resolveBundle(db, 'usd20');
        expect(b).toEqual({ usdGrantCents: 2000, zarChargeCents: 36000, label: '$20 credit' });
    });
    it('throws on an unknown bundle', async () => {
        const db = makeFakeRtdb(TREE);
        await expect(bundles.resolveBundle(db, 'nope')).rejects.toThrow('Unknown bundle');
    });
    it('throws on an inactive bundle', async () => {
        const db = makeFakeRtdb(TREE);
        await expect(bundles.resolveBundle(db, 'usd200')).rejects.toThrow('inactive');
    });
});

describe('listActiveBundles', () => {
    it('returns only active bundles, sorted', async () => {
        const db = makeFakeRtdb(TREE);
        const list = await bundles.listActiveBundles(db);
        expect(list.map((b) => b.id)).toEqual(['usd20', 'usd99']);
        expect(list[0]).toMatchObject({ id: 'usd20', zarChargeCents: 36000, label: '$20 credit' });
    });
});
