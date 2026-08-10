'use strict';

/**
 * Queue Q13 — scheduled retention prune for scanningData/wifiLogins/activeUsers.
 * Pure encode helpers + fake-rtdb integration per node.
 */

const rp = require('../retentionPrune');
const { makeFakeRtdb } = require('./helpers/fake-rtdb-ordered');

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000; // fixed instant for deterministic tests

describe('encodePushKeyPrefix / pushKeyCutoffBoundary', () => {
    it('encodes ms=0 as all-minimum-char', () => {
        expect(rp.encodePushKeyPrefix(0)).toBe('--------');
    });

    it('is monotonic — later timestamps encode to a lexicographically larger prefix', () => {
        const samples = [0, 1, 63, 64, 4095, 1_700_000_000_000, 1_700_000_000_001, 2_000_000_000_000];
        for (let i = 1; i < samples.length; i++) {
            const prev = rp.encodePushKeyPrefix(samples[i - 1]);
            const cur = rp.encodePushKeyPrefix(samples[i]);
            expect(cur >= prev).toBe(true);
        }
    });

    it('produces an 8-char boundary padded to 20 chars with the maximum char (includes every same-instant suffix)', () => {
        const boundary = rp.pushKeyCutoffBoundary(NOW);
        expect(boundary).toHaveLength(20);
        expect(boundary.slice(8)).toBe('z'.repeat(12));
    });

    it('a real push key built from an earlier timestamp sorts below the boundary; a later one sorts above', () => {
        const boundary = rp.pushKeyCutoffBoundary(NOW);
        const earlierKey = rp.encodePushKeyPrefix(NOW - 1000) + 'abcdefghijkl';
        const laterKey = rp.encodePushKeyPrefix(NOW + 1000) + 'abcdefghijkl';
        expect(earlierKey < boundary).toBe(true);
        expect(laterKey > boundary).toBe(true);
    });
});

describe('pruneByPushKeyAge (fake-rtdb integration)', () => {
    function pushKey(ms, suffix) {
        return rp.encodePushKeyPrefix(ms) + suffix;
    }

    it('deletes only keys generated at-or-before the cutoff, keeps newer ones', async () => {
        const cutoff = NOW - 30 * DAY;
        const oldKey1 = pushKey(cutoff - 5 * DAY, 'aaaaaaaaaaaa');
        const oldKey2 = pushKey(cutoff - 1 * DAY, 'bbbbbbbbbbbb');
        const atCutoffKey = pushKey(cutoff, 'cccccccccccc');
        const newKey = pushKey(cutoff + 5 * DAY, 'dddddddddddd');

        const db = makeFakeRtdb({
            scanningData: {
                [oldKey1]: { rssi: -50 },
                [oldKey2]: { rssi: -60 },
                [atCutoffKey]: { rssi: -55 },
                [newKey]: { rssi: -40 },
            },
        });
        rp.__setDbForTests(db);

        const res = await rp.pruneByPushKeyAge('scanningData', cutoff);

        expect(res.deleted).toBe(3);
        expect(res.done).toBe(true);
        const dump = db._dump().scanningData;
        expect(dump[oldKey1]).toBeUndefined();
        expect(dump[oldKey2]).toBeUndefined();
        expect(dump[atCutoffKey]).toBeUndefined();
        expect(dump[newKey]).toBeDefined();
    });

    it('no keys under the cutoff → no deletions', async () => {
        const cutoff = NOW - 30 * DAY;
        const newKey = pushKey(cutoff + 5 * DAY, 'dddddddddddd');
        const db = makeFakeRtdb({ scanningData: { [newKey]: { rssi: -40 } } });
        rp.__setDbForTests(db);

        const res = await rp.pruneByPushKeyAge('scanningData', cutoff);

        expect(res.deleted).toBe(0);
        expect(db._dump().scanningData[newKey]).toBeDefined();
    });

    it('respects the batch cap and paginates oldest-first across multiple batches', async () => {
        const cutoff = NOW - 30 * DAY;
        const seedData = {};
        // 12 old records spaced 1ms apart so keys are strictly ordered.
        for (let i = 0; i < 12; i++) {
            seedData[pushKey(cutoff - (12 - i) * 1000, `s${String(i).padStart(11, '0')}`)] = { i };
        }
        const db = makeFakeRtdb({ scanningData: seedData });
        rp.__setDbForTests(db);

        const res = await rp.pruneByPushKeyAge('scanningData', cutoff, /* batchSize */ 5, /* maxBatches */ 10);

        expect(res.deleted).toBe(12);
        expect(res.batches).toBe(3); // 5 + 5 + 2
        expect(res.done).toBe(true);
        expect(Object.keys(db._dump().scanningData || {})).toHaveLength(0);
    });

    it('caps at maxBatches and reports done:false when more remain (no silent full-drain assumption)', async () => {
        const cutoff = NOW - 30 * DAY;
        const seedData = {};
        for (let i = 0; i < 25; i++) {
            seedData[pushKey(cutoff - (25 - i) * 1000, `s${String(i).padStart(11, '0')}`)] = { i };
        }
        const db = makeFakeRtdb({ scanningData: seedData });
        rp.__setDbForTests(db);

        const res = await rp.pruneByPushKeyAge('scanningData', cutoff, /* batchSize */ 5, /* maxBatches */ 2);

        expect(res.batches).toBe(2);
        expect(res.deleted).toBe(10);
        expect(res.done).toBe(false);
        expect(Object.keys(db._dump().scanningData || {})).toHaveLength(15);
    });

    afterEach(() => rp.__setDbForTests(null));
});

describe('pruneByTimestampField (fake-rtdb integration)', () => {
    function iso(ms) { return new Date(ms).toISOString(); }

    it('deletes only records whose timestamp is at-or-before the cutoff, keeps newer ones', async () => {
        const cutoffMs = NOW - 90 * DAY;
        const db = makeFakeRtdb({
            wifiLogins: {
                old1: { timestamp: iso(cutoffMs - 5 * DAY), name: 'A' },
                old2: { timestamp: iso(cutoffMs - 1 * DAY), name: 'B' },
                atCutoff: { timestamp: iso(cutoffMs), name: 'C' },
                fresh: { timestamp: iso(cutoffMs + 5 * DAY), name: 'D' },
            },
        });
        rp.__setDbForTests(db);

        const res = await rp.pruneByTimestampField('wifiLogins', iso(cutoffMs));

        expect(res.deleted).toBe(3);
        const dump = db._dump().wifiLogins;
        expect(dump.old1).toBeUndefined();
        expect(dump.old2).toBeUndefined();
        expect(dump.atCutoff).toBeUndefined();
        expect(dump.fresh).toBeDefined();
    });

    it('never touches a record with a missing/null timestamp, even though it is older than every real record', async () => {
        const cutoffMs = NOW - 90 * DAY;
        const db = makeFakeRtdb({
            wifiLogins: {
                noTimestamp: { name: 'legacy, no timestamp field at all' },
                nullTimestamp: { timestamp: null, name: 'legacy, explicit null' },
                old: { timestamp: iso(cutoffMs - 1 * DAY), name: 'datable and old' },
            },
        });
        rp.__setDbForTests(db);

        const res = await rp.pruneByTimestampField('wifiLogins', iso(cutoffMs));

        expect(res.deleted).toBe(1);
        const dump = db._dump().wifiLogins;
        expect(dump.noTimestamp).toBeDefined();
        expect(dump.nullTimestamp).toBeDefined();
        expect(dump.old).toBeUndefined();
    });

    it('keys that are NOT push keys (the wifiLogins majority shape) are pruned correctly by timestamp alone', async () => {
        const cutoffMs = NOW - 90 * DAY;
        const db = makeFakeRtdb({
            wifiLogins: {
                'legacy-uuid-style-key-1234': { timestamp: iso(cutoffMs - 10 * DAY), name: 'old, non-push key' },
                'AA:BB:CC:DD:EE:FF': { timestamp: iso(cutoffMs + 10 * DAY), name: 'fresh, MAC-shaped key' },
            },
        });
        rp.__setDbForTests(db);

        const res = await rp.pruneByTimestampField('wifiLogins', iso(cutoffMs));

        expect(res.deleted).toBe(1);
        const dump = db._dump().wifiLogins;
        expect(dump['legacy-uuid-style-key-1234']).toBeUndefined();
        expect(dump['AA:BB:CC:DD:EE:FF']).toBeDefined();
    });

    it('paginates in batches and reports done:true once drained', async () => {
        const cutoffMs = NOW - 7 * DAY;
        const seedData = {};
        for (let i = 0; i < 9; i++) {
            seedData[`u${i}`] = { timestamp: iso(cutoffMs - (9 - i) * 1000) };
        }
        const db = makeFakeRtdb({ activeUsers: seedData });
        rp.__setDbForTests(db);

        const res = await rp.pruneByTimestampField('activeUsers', iso(cutoffMs), /* batchSize */ 4, /* maxBatches */ 10);

        expect(res.deleted).toBe(9);
        expect(res.batches).toBe(3); // 4 + 4 + 1
        expect(res.done).toBe(true);
    });

    afterEach(() => rp.__setDbForTests(null));
});

describe('pruneRetentionNodes (end-to-end, all three nodes)', () => {
    it('applies each node\'s own retention window against a fixed `now`', async () => {
        const oldScanKey = rp.encodePushKeyPrefix(NOW - 60 * DAY) + 'aaaaaaaaaaaa'; // > 30d window
        const freshScanKey = rp.encodePushKeyPrefix(NOW - 5 * DAY) + 'bbbbbbbbbbbb'; // within 30d window

        const db = makeFakeRtdb({
            scanningData: {
                [oldScanKey]: { rssi: -50 },
                [freshScanKey]: { rssi: -40 },
            },
            wifiLogins: {
                old: { timestamp: new Date(NOW - 100 * DAY).toISOString() }, // > 90d window
                fresh: { timestamp: new Date(NOW - 10 * DAY).toISOString() }, // within 90d window
            },
            activeUsers: {
                old: { timestamp: new Date(NOW - 10 * DAY).toISOString() }, // > 7d window
                fresh: { timestamp: new Date(NOW - 1 * DAY).toISOString() }, // within 7d window
            },
        });
        rp.__setDbForTests(db);

        const results = await rp.pruneRetentionNodes(NOW);

        expect(results.map((r) => `${r.node}:${r.deleted}`)).toEqual([
            'scanningData:1',
            'wifiLogins:1',
            'activeUsers:1',
        ]);

        const dump = db._dump();
        expect(dump.scanningData[oldScanKey]).toBeUndefined();
        expect(dump.scanningData[freshScanKey]).toBeDefined();
        expect(dump.wifiLogins.old).toBeUndefined();
        expect(dump.wifiLogins.fresh).toBeDefined();
        expect(dump.activeUsers.old).toBeUndefined();
        expect(dump.activeUsers.fresh).toBeDefined();
    });

    afterEach(() => rp.__setDbForTests(null));
});
