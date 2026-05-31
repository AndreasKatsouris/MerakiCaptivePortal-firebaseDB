'use strict';

/**
 * Ledger I/O tests — grant, debit (pre-gen key + transaction + retry-safe),
 * gate, balance, and newest-first paginated usage. Uses an in-memory RTDB fake
 * injected via ledger.__setDbForTests (no emulator needed for these assertions;
 * true-concurrency fidelity is emulator-only, noted in the fake + plan).
 */

const ledger = require('../ledger');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');
const { DEFAULT_BALANCE_FLOOR_CENTS, SERVICES, LEDGER_CURRENCY } = require('../constants');

const MODEL = 'claude-sonnet-4-6';

function seedDb(extra = {}) {
    return makeFakeRtdb({
        billing: {
            priceTable: {
                markup: 1.30,
                models: {
                    [MODEL]: { usdPerMtokInput: 3, usdPerMtokOutput: 15, cacheWriteMult: 1.25, cacheReadMult: 0.10 },
                },
            },
            ...extra,
        },
    });
}

let db;
beforeEach(() => {
    db = seedDb();
    ledger.__setDbForTests(db);
});

describe('getBalanceCents', () => {
    it('returns 0 for an unknown uid (fail-safe, not a throw)', async () => {
        expect(await ledger.getBalanceCents('nobody')).toBe(0);
    });
});

describe('grantCredit', () => {
    it('credits the balance and writes a grant audit row', async () => {
        const res = await ledger.grantCredit({ uid: 'u1', amountCents: 1000, grantedBy: 'admin1', reason: 'beta comp' });
        expect(res.balanceAfterCents).toBe(1000);
        expect(await ledger.getBalanceCents('u1')).toBe(1000);

        const dump = db._dump();
        const grants = Object.values(dump.billing.grants.u1);
        expect(grants).toHaveLength(1);
        expect(grants[0]).toMatchObject({ amountCents: 1000, grantedBy: 'admin1', reason: 'beta comp' });
        expect(typeof grants[0].createdAt).toBe('number');
    });

    it('accumulates across multiple grants', async () => {
        await ledger.grantCredit({ uid: 'u1', amountCents: 1000, grantedBy: 'a', reason: 'x' });
        await ledger.grantCredit({ uid: 'u1', amountCents: 500, grantedBy: 'a', reason: 'y' });
        expect(await ledger.getBalanceCents('u1')).toBe(1500);
    });

    it('rejects a non-positive or non-integer amount', async () => {
        await expect(ledger.grantCredit({ uid: 'u1', amountCents: 0, grantedBy: 'a', reason: 'x' })).rejects.toThrow();
        await expect(ledger.grantCredit({ uid: 'u1', amountCents: -5, grantedBy: 'a', reason: 'x' })).rejects.toThrow();
        await expect(ledger.grantCredit({ uid: 'u1', amountCents: 1.5, grantedBy: 'a', reason: 'x' })).rejects.toThrow();
    });
});

describe('checkBalance gate', () => {
    it('false at/below the floor, true above', async () => {
        await ledger.grantCredit({ uid: 'u1', amountCents: DEFAULT_BALANCE_FLOOR_CENTS, grantedBy: 'a', reason: 'x' });
        expect(await ledger.checkBalance('u1')).toBe(false); // exactly at floor → blocked
        await ledger.grantCredit({ uid: 'u1', amountCents: 1, grantedBy: 'a', reason: 'x' });
        expect(await ledger.checkBalance('u1')).toBe(true);  // floor + 1 → allowed
    });

    it('false for an unknown uid (0 balance)', async () => {
        expect(await ledger.checkBalance('nobody')).toBe(false);
    });
});

describe('recordUsageAndDebit', () => {
    it('debits the balance and writes an immutable usage record with a frozen rate snapshot', async () => {
        await ledger.grantCredit({ uid: 'u1', amountCents: 1000, grantedBy: 'a', reason: 'seed' });

        const res = await ledger.recordUsageAndDebit({
            uid: 'u1', service: SERVICES.ASK_ROSS, model: MODEL,
            units: { inputTokens: 1_000_000 }, meta: { turnId: 't1' },
        });

        // 1M input @ $3/Mtok × 1.30 = 390c
        expect(res.costCents).toBe(390);
        expect(res.balanceAfterCents).toBe(610);
        expect(await ledger.getBalanceCents('u1')).toBe(610);

        const dump = db._dump();
        const records = dump.billing.usage.u1;
        const keys = Object.keys(records);
        expect(keys).toHaveLength(1);
        expect(res.recordKey).toBe(keys[0]); // returned key matches the written record

        const rec = records[keys[0]];
        expect(rec).toMatchObject({
            service: 'askRoss', model: MODEL, currency: LEDGER_CURRENCY,
            costCents: 390, wholesaleUsdCents: 300, balanceAfterCents: 610,
            meta: { turnId: 't1' },
        });
        expect(rec.rateSnapshot).toMatchObject({ usdPerMtokInput: 3, markup: 1.30 });
        expect(typeof rec.createdAt).toBe('number');
    });

    it('throws on an unknown service (no silent zero) and does NOT debit', async () => {
        await ledger.grantCredit({ uid: 'u1', amountCents: 1000, grantedBy: 'a', reason: 'seed' });
        await expect(ledger.recordUsageAndDebit({
            uid: 'u1', service: 'ocr', model: MODEL, units: { pages: 3 }, meta: {},
        })).rejects.toThrow(/unknown billing service/);
        expect(await ledger.getBalanceCents('u1')).toBe(1000); // untouched
    });

    it('throws on a missing/unknown model (no price-table entry) and does NOT debit', async () => {
        await ledger.grantCredit({ uid: 'u1', amountCents: 1000, grantedBy: 'a', reason: 'seed' });
        await expect(ledger.recordUsageAndDebit({
            uid: 'u1', service: SERVICES.ASK_ROSS, model: 'claude-unknown-9', units: { inputTokens: 1_000_000 }, meta: {},
        })).rejects.toThrow(/no price-table entry for model/);
        expect(await ledger.getBalanceCents('u1')).toBe(1000); // balance untouched (NaN guard before transaction)
    });

    it('allows a single overspend (balance can go negative; the next gate stops further spend)', async () => {
        await ledger.grantCredit({ uid: 'u1', amountCents: 100, grantedBy: 'a', reason: 'seed' });
        const res = await ledger.recordUsageAndDebit({
            uid: 'u1', service: SERVICES.ASK_ROSS, model: MODEL,
            units: { inputTokens: 1_000_000 }, meta: {}, // 390c > 100c balance
        });
        expect(res.balanceAfterCents).toBe(-290);
        expect(await ledger.checkBalance('u1')).toBe(false); // further spend blocked
    });

    it('debit is in the transaction, not the record write — re-writing the same record key does not double-debit', async () => {
        await ledger.grantCredit({ uid: 'u1', amountCents: 1000, grantedBy: 'a', reason: 'seed' });
        const res = await ledger.recordUsageAndDebit({
            uid: 'u1', service: SERVICES.ASK_ROSS, model: MODEL, units: { inputTokens: 1_000_000 }, meta: {},
        });
        // simulate the §11.1 idempotent retry: re-set the same usage record key
        await db.ref(`billing/usage/u1/${res.recordKey}`).set({ replayed: true });
        expect(await ledger.getBalanceCents('u1')).toBe(610); // balance unchanged by the replay
    });

    it('sequential debits sum correctly (no lost debit)', async () => {
        await ledger.grantCredit({ uid: 'u1', amountCents: 1000, grantedBy: 'a', reason: 'seed' });
        await ledger.recordUsageAndDebit({ uid: 'u1', service: SERVICES.ASK_ROSS, model: MODEL, units: { inputTokens: 1_000_000 }, meta: {} });
        await ledger.recordUsageAndDebit({ uid: 'u1', service: SERVICES.ASK_ROSS, model: MODEL, units: { inputTokens: 1_000_000 }, meta: {} });
        expect(await ledger.getBalanceCents('u1')).toBe(1000 - 390 - 390); // 220
    });
});

describe('getUsage — newest-first, paginated', () => {
    async function seedUsage(n) {
        await ledger.grantCredit({ uid: 'u1', amountCents: 100000, grantedBy: 'a', reason: 'seed' });
        const keys = [];
        for (let i = 0; i < n; i++) {
            const r = await ledger.recordUsageAndDebit({
                uid: 'u1', service: SERVICES.ASK_ROSS, model: MODEL,
                units: { inputTokens: 1_000_000 }, meta: { turnId: `t${i}` },
            });
            keys.push(r.recordKey);
        }
        return keys; // insertion order (ascending)
    }

    it('returns records newest-first', async () => {
        const keys = await seedUsage(3);
        const { usage } = await ledger.getUsage('u1', { limit: 10 });
        expect(usage.map((r) => r.id)).toEqual([keys[2], keys[1], keys[0]]);
        expect(usage[0].meta.turnId).toBe('t2');
    });

    it('honours limit and paginates with `before`', async () => {
        const keys = await seedUsage(5); // k.. ascending: keys[0..4]
        const page1 = await ledger.getUsage('u1', { limit: 2 });
        expect(page1.usage.map((r) => r.id)).toEqual([keys[4], keys[3]]);
        expect(page1.nextBefore).toBe(keys[3]);

        const page2 = await ledger.getUsage('u1', { limit: 2, before: page1.nextBefore });
        expect(page2.usage.map((r) => r.id)).toEqual([keys[2], keys[1]]);
        expect(page2.nextBefore).toBe(keys[1]);
    });

    it('returns empty for a uid with no usage', async () => {
        const { usage, nextBefore } = await ledger.getUsage('nobody', { limit: 10 });
        expect(usage).toEqual([]);
        expect(nextBefore).toBeNull();
    });
});
