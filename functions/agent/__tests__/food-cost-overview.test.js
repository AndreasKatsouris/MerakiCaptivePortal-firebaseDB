'use strict';

/**
 * D3 T2 — `foodCostOverview` CF (functions/food-cost-overview.js).
 *
 * Tests the injected-db core (`buildOverview`) with the fake-rtdb idiom, plus
 * handler-level envelope tests (`handleOverviewRequest`) via the auth seam.
 *
 * Conventions under test (design §4a, docs/plans/2026-07-24-ross-foodcost-d3-ui-design.md):
 *  - access via callerHasLocationAccess (tools.js seam — set BOTH seams in tests,
 *    same both-seams pattern as tools.test.js's confirm-adapter suite);
 *  - entitlement: subscriptions/{uid}/features/foodCost === true, admin bypass
 *    (mirrors ross.js:104-120 admins-first read);
 *  - EVERY failure (no access / not entitled / no data) is bare {hasData:false},
 *    deep-equal — anti-enumeration;
 *  - invalid INPUT (locationId shape, daysToNextDelivery bounds) is a handler-level
 *    400 — this endpoint serves the first-party client, not the model, so input
 *    errors are loud; only access/entitlement/data failures are shape-hidden.
 */

const { makeFakeRtdb } = require('./helpers/fake-rtdb');
const tools = require('../tools');
const { suggestOrder } = require('../food-cost/suggest');
const {
    buildOverview,
    handleOverviewRequest,
    __setDbForTests,
    __setVerifyAuthForTests,
} = require('../../food-cost-overview');

const DAY_MS = 86400000;
const NOW = Date.UTC(2026, 6, 24, 12, 0, 0); // injected clock — never Date.now() in tests
const LOC = 'loc1';
const NO_DATA = { hasData: false };

// --- fixture helpers ----------------------------------------------------------

function item(over = {}) {
    return {
        itemCode: 'IT-001', description: 'Olive oil 5L', category: 'Dry goods',
        supplierName: 'Acme Foods', openingQty: 10, closingQty: 4, usagePerDay: 1,
        openingValue: 100, closingValue: 40, unitCost: 10, hasMissingUnitCost: false,
        ...over,
    };
}

function record(ts, over = {}) {
    return {
        timestamp: ts,
        costPercentage: 30,
        totalCostOfUsage: 5000,
        salesAmount: 16000,
        openingDate: '2026-07-01', closingDate: '2026-07-07',
        stockItems: [item()],
        ...over,
    };
}

/** Three chronological records; latest is NOW - 3 days. */
function threeRecords() {
    return {
        '20260710_120000': record(NOW - 11 * DAY_MS, { costPercentage: 28, totalCostOfUsage: 4200 }),
        '20260717_120000': record(NOW - 7 * DAY_MS, { costPercentage: 30, totalCostOfUsage: 4600 }),
        '20260721_120000': record(NOW - 3 * DAY_MS, {
            costPercentage: 32, totalCostOfUsage: 5100,
            stockItems: [
                item({ itemCode: 'A1', description: 'Chicken breast', closingQty: 2, usagePerDay: 1 }),   // cover 2  → warn
                item({ itemCode: 'B2', description: 'Ribeye', closingQty: 5, usagePerDay: 1 }),           // cover 5  → accent
                item({ itemCode: 'C3', description: 'Romaine', closingQty: 6.5, usagePerDay: 1 }),        // cover 6.5 → default
                item({ itemCode: 'D4', description: 'House red', closingQty: 0, usagePerDay: 0 }),        // stockout, cover null → warn
                item({ itemCode: 'E5', description: 'Flour 10kg', closingQty: 50, usagePerDay: 1 }),      // cover 50 → not low
            ],
        }),
    };
}

function seed(over = {}) {
    const db = makeFakeRtdb({
        userLocations: { mgr1: { [LOC]: true } },
        subscriptions: {
            mgr1: { features: { foodCost: true } },
            owner1: { features: { foodCost: true } },
        },
        locations: { [LOC]: { ownerId: 'owner1', stockUsage: threeRecords() } },
        ...over,
    });
    __setDbForTests(db);       // the module's own reads (admins / subscriptions / stockUsage)
    tools.__setDbForTests(db); // callerHasLocationAccess reads through the tools seam
    return db;
}

afterEach(() => {
    __setDbForTests(null);
    tools.__setDbForTests(null);
    __setVerifyAuthForTests(null);
});

function makeRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(obj) { this.body = obj; return this; },
        set() { return this; },
    };
}

// --- core: access + entitlement (anti-enumeration) ----------------------------

describe('buildOverview — access + entitlement gates', () => {
    it('attacker with no location access → bare {hasData:false}', async () => {
        const db = seed();
        const out = await buildOverview(db, 'mallory', { locationId: LOC }, NOW);
        expect(out).toEqual(NO_DATA);
    });

    it('owner via locations/{loc}/ownerId (no userLocations row) → served', async () => {
        const db = seed();
        const out = await buildOverview(db, 'owner1', { locationId: LOC }, NOW);
        expect(out.hasData).toBe(true);
    });

    it('delegated user via userLocations/{uid}/{loc} → served', async () => {
        const db = seed();
        const out = await buildOverview(db, 'mgr1', { locationId: LOC }, NOW);
        expect(out.hasData).toBe(true);
    });

    it('access but NO subscriptions node → bare {hasData:false}', async () => {
        const db = seed({ subscriptions: {} });
        const out = await buildOverview(db, 'mgr1', { locationId: LOC }, NOW);
        expect(out).toEqual(NO_DATA);
    });

    it('access but features.foodCost === false → bare {hasData:false}', async () => {
        const db = seed({ subscriptions: { mgr1: { features: { foodCost: false } } } });
        const out = await buildOverview(db, 'mgr1', { locationId: LOC }, NOW);
        expect(out).toEqual(NO_DATA);
    });

    it('admin (admins/{uid} exists) bypasses the entitlement gate', async () => {
        const db = seed({
            admins: { adm1: { superAdmin: false } },
            userLocations: { adm1: { [LOC]: true } },
            subscriptions: {}, // no features at all — only the admin row admits
        });
        const out = await buildOverview(db, 'adm1', { locationId: LOC }, NOW);
        expect(out.hasData).toBe(true);
    });

    it('admin WITHOUT location access → bare {hasData:false} (bypass covers entitlement, NOT the tenant boundary)', async () => {
        // Spec-review S1: pins the access-gate-precedes-admin ordering. Fails
        // only if someone moves the admin check ahead of callerHasLocationAccess.
        const db = seed({
            admins: { adm1: { superAdmin: false } }, // admin row, no userLocations/ownerId link
            subscriptions: {},
        });
        const out = await buildOverview(db, 'adm1', { locationId: LOC }, NOW);
        expect(out).toEqual(NO_DATA);
    });

    it('ALL failure shapes are deep-equal to the no-data return (anti-enumeration)', async () => {
        // no access
        const db1 = seed();
        const noAccess = await buildOverview(db1, 'mallory', { locationId: LOC }, NOW);
        // not entitled
        const db2 = seed({ subscriptions: {} });
        const notEntitled = await buildOverview(db2, 'mgr1', { locationId: LOC }, NOW);
        // no data
        const db3 = seed({ locations: { [LOC]: { ownerId: 'owner1' } } });
        const noData = await buildOverview(db3, 'mgr1', { locationId: LOC }, NOW);

        expect(noAccess).toEqual(NO_DATA);
        expect(notEntitled).toEqual(noAccess);
        expect(noData).toEqual(noAccess);
    });
});

// --- core: no-data ------------------------------------------------------------

describe('buildOverview — no data', () => {
    it('entitled + access but empty stockUsage node → bare {hasData:false}', async () => {
        const db = seed({ locations: { [LOC]: { ownerId: 'owner1' } } });
        const out = await buildOverview(db, 'owner1', { locationId: LOC }, NOW);
        expect(out).toEqual(NO_DATA);
    });
});

// --- core: §5 payload ---------------------------------------------------------

describe('buildOverview — §5 payload on a seeded 3-record tenant', () => {
    it('top-level, kpis and summary key-sets are EXACT', async () => {
        const db = seed();
        const out = await buildOverview(db, 'mgr1', { locationId: LOC }, NOW);
        expect(Object.keys(out).sort()).toEqual(
            ['asOf', 'dataAgeDays', 'hasData', 'kpis', 'order', 'runway', 'summary'],
        );
        expect(Object.keys(out.kpis).sort()).toEqual(
            ['costPct', 'costPctTrend', 'prevCostPct', 'spend', 'spendTrend'],
        );
        expect(Object.keys(out.summary).sort()).toEqual(
            ['itemsAnalysed', 'lowStockCount', 'lowStockItems', 'trend'],
        );
    });

    it('kpis reflect the latest record; trends run oldest→newest', async () => {
        const db = seed();
        const out = await buildOverview(db, 'mgr1', { locationId: LOC }, NOW);
        expect(out.kpis.costPct).toBe(32);
        expect(out.kpis.prevCostPct).toBe(30);
        expect(out.kpis.costPctTrend).toEqual([28, 30, 32]);
        expect(out.kpis.spend).toBe(5100);
        expect(out.kpis.spendTrend).toEqual([4200, 4600, 5100]);
        expect(out.summary.trend).toBe('up');
        expect(out.summary.itemsAnalysed).toBe(5);
        expect(out.summary.lowStockCount).toBe(4);
    });

    it('asOf/dataAgeDays are consistent with the injected now (ctx.now threading)', async () => {
        const db = seed();
        const out = await buildOverview(db, 'mgr1', { locationId: LOC }, NOW);
        expect(out.asOf).toBe(NOW - 3 * DAY_MS);
        expect(out.dataAgeDays).toBe(3);
        expect(out.order.dataAgeDays).toBe(3); // suggestOrder got the same clock
    });

    it('order deep-equals a direct suggestOrder call over the same records + opts', async () => {
        const db = seed();
        const out = await buildOverview(
            db, 'mgr1', { locationId: LOC, daysToNextDelivery: 5 }, NOW,
        );
        const expected = suggestOrder(Object.values(threeRecords()), {
            now: NOW, daysToNextDelivery: 5,
        });
        expect(out.order).toEqual(expected);
        expect(out.order.params.daysToNextDelivery).toBe(5); // caller value threaded
    });

    it('runway derives from lowStockItems daysOfCover with tone thresholds (null/<=2 warn, <=6 accent, else default)', async () => {
        const db = seed();
        const out = await buildOverview(db, 'mgr1', { locationId: LOC }, NOW);
        // D1 sorts by daysOfCover asc (Infinity → null sorts last).
        expect(out.runway).toEqual([
            { item: 'Chicken breast', daysLeft: 2, tone: 'warn' },
            { item: 'Ribeye', daysLeft: 5, tone: 'accent' },
            { item: 'Romaine', daysLeft: 6.5, tone: 'default' },
            { item: 'House red', daysLeft: null, tone: 'warn' },
        ]);
    });

    it('trend arrays cap at 30 points (31 seeded records → last 30, oldest→newest)', async () => {
        const stockUsage = {};
        for (let i = 0; i < 31; i++) {
            const key = `2026${String(100 + i)}_000000`; // lexicographically ascending keys
            stockUsage[key] = record(NOW - (31 - i) * DAY_MS, {
                costPercentage: i, totalCostOfUsage: i * 10, stockItems: [],
            });
        }
        const db = seed({ locations: { [LOC]: { ownerId: 'owner1', stockUsage } } });
        const out = await buildOverview(db, 'mgr1', { locationId: LOC }, NOW);
        expect(out.kpis.costPctTrend).toHaveLength(30);
        expect(out.kpis.costPctTrend[0]).toBe(1);   // record 0 dropped by limitToLast(30)
        expect(out.kpis.costPctTrend[29]).toBe(30);
        expect(out.kpis.spendTrend).toHaveLength(30);
        // empty latest stockItems → order degrades to the bare no-data shape
        expect(out.order).toEqual(NO_DATA);
    });
});

// --- core: D1-branch sanitization + bounds ------------------------------------

describe('buildOverview — D1-branch sanitization (F8)', () => {
    it('control chars stripped + 120-cap on lowStockItems and runway strings', async () => {
        const nasty = 'Nasty\x00\x07item\x1F ' + 'x'.repeat(200);
        const stockUsage = {
            '20260721_120000': record(NOW - 1 * DAY_MS, {
                stockItems: [item({
                    itemCode: 'C\x07ODE-9', description: nasty, closingQty: 0, usagePerDay: 2,
                })],
            }),
        };
        const db = seed({ locations: { [LOC]: { ownerId: 'owner1', stockUsage } } });
        const out = await buildOverview(db, 'mgr1', { locationId: LOC }, NOW);

        const low = out.summary.lowStockItems[0];
        expect(low.itemCode).toBe('CODE-9');
        // eslint-disable-next-line no-control-regex
        expect(low.description).not.toMatch(/[\x00-\x1F\x7F]/);
        expect(low.description.length).toBeLessThanOrEqual(120);
        expect(low.description.startsWith('Nastyitem')).toBe(true);

        // eslint-disable-next-line no-control-regex
        expect(out.runway[0].item).not.toMatch(/[\x00-\x1F\x7F]/);
        expect(out.runway[0].item.length).toBeLessThanOrEqual(120);
    });
});

describe('buildOverview — D1-branch item cap (F2 abuse bound)', () => {
    it('a 2001-item latest record is bounded to 2000 for the D1 branch and the response completes', async () => {
        const items = [];
        for (let i = 0; i < 2001; i++) {
            items.push(item({
                itemCode: `I${i}`, description: `Item ${i}`, closingQty: 0, usagePerDay: 1,
            }));
        }
        const stockUsage = { '20260721_120000': record(NOW - 1 * DAY_MS, { stockItems: items }) };
        const db = seed({ locations: { [LOC]: { ownerId: 'owner1', stockUsage } } });

        const out = await buildOverview(db, 'mgr1', { locationId: LOC }, NOW);
        expect(out.hasData).toBe(true);
        // D1 branch saw the capped slice (MAX_ITEMS_PER_RECORD = 2000, reused from suggest.js P5)
        expect(out.summary.itemsAnalysed).toBe(2000);
        // D2 branch self-caps and surfaces the truncation caveat
        expect(out.order.caveats).toContain('items-truncated-for-size');
    });
});

// --- handler envelope ---------------------------------------------------------

describe('handleOverviewRequest — envelope', () => {
    it('rejects non-POST with 405', async () => {
        const res = makeRes();
        await handleOverviewRequest({ method: 'GET', body: {} }, res);
        expect(res.statusCode).toBe(405);
    });

    it('400s a missing / non-key-safe locationId (path-injection guard)', async () => {
        for (const locationId of [undefined, 42, '', 'a/b', 'loc.$#']) {
            const res = makeRes();
            await handleOverviewRequest({ method: 'POST', body: { locationId } }, res);
            expect(res.statusCode, String(locationId)).toBe(400);
        }
    });

    it("400s daysToNextDelivery 0 / 31 / 1.5 / '5' (explicit invalid-input convention — first-party client, not the model)", async () => {
        for (const bad of [0, 31, 1.5, '5']) {
            const res = makeRes();
            await handleOverviewRequest(
                { method: 'POST', body: { locationId: LOC, daysToNextDelivery: bad } }, res,
            );
            expect(res.statusCode, String(bad)).toBe(400);
            expect(res.body).toEqual({ error: 'daysToNextDelivery must be an integer between 1 and 30' });
        }
    });

    it('401s with the normalized message when auth fails (rossChat :628-640 convention)', async () => {
        __setVerifyAuthForTests(async () => { throw new Error('No valid authorization header'); });
        const res = makeRes();
        await handleOverviewRequest({ method: 'POST', body: { locationId: LOC } }, res);
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'Authentication failed' });
    });

    it('serves the payload for an authed, entitled caller (auth seam)', async () => {
        seed();
        __setVerifyAuthForTests(async () => ({ uid: 'mgr1' }));
        const res = makeRes();
        await handleOverviewRequest(
            { method: 'POST', body: { locationId: LOC, daysToNextDelivery: 5 } }, res,
        );
        expect(res.statusCode).toBe(200);
        expect(res.body.hasData).toBe(true);
        expect(res.body.order.params.daysToNextDelivery).toBe(5);
    });

    it('access/entitlement failures stay 200 {hasData:false} at the handler (NOT 4xx)', async () => {
        seed();
        __setVerifyAuthForTests(async () => ({ uid: 'mallory' }));
        const res = makeRes();
        await handleOverviewRequest({ method: 'POST', body: { locationId: LOC } }, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual(NO_DATA);
    });

    it('mid-flight throw → stable 500 envelope, no internal detail leaked (quality-review S1)', async () => {
        // The one previously-untested security property (§6): a db failure must
        // produce the fixed error string — never err.message, never tenant data.
        __setDbForTests({
            ref: () => { throw new Error('SECRET internal path /locations/x and a tenant string'); },
        });
        __setVerifyAuthForTests(async () => ({ uid: 'mgr1' }));
        const res = makeRes();
        await handleOverviewRequest({ method: 'POST', body: { locationId: LOC } }, res);
        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ error: 'Failed to load the food-cost overview' });
    });
});

