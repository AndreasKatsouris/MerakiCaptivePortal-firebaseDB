'use strict';

/**
 * askRoss slice 7 — scheduled prune of stale agent nodes. RTDB has no native TTL, so a
 * daily CF nulls out expired pending confirm-actions (review M-3) + stale debit guards
 * (review T-2). Pure path-selectors + a fake-rtdb integration.
 */

const prune = require('../prune');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe('expiredPendingPaths', () => {
    it('selects pending whose expiresAt is older than the grace, keeps fresh ones', () => {
        const all = {
            u1: {
                t_fresh: { expiresAt: NOW + 5 * 60 * 1000 },  // not yet expired
                t_recent: { expiresAt: NOW - 60 * 1000 },      // expired but within grace
                t_old: { expiresAt: NOW - 3 * DAY },           // expired + past grace → prune
            },
            u2: { t_old2: { expiresAt: NOW - 10 * DAY } },     // prune
        };
        const paths = prune.expiredPendingPaths(all, NOW, DAY);
        expect(paths.sort()).toEqual([
            'ross/agentPending/u1/t_old',
            'ross/agentPending/u2/t_old2',
        ]);
    });

    it('prunes malformed nodes (missing/non-numeric expiresAt) as garbage', () => {
        const all = { u1: { bad1: {}, bad2: { expiresAt: 'soon' }, ok: { expiresAt: NOW + DAY } } };
        const paths = prune.expiredPendingPaths(all, NOW, DAY);
        expect(paths.sort()).toEqual(['ross/agentPending/u1/bad1', 'ross/agentPending/u1/bad2']);
    });

    it('returns [] for empty/null input', () => {
        expect(prune.expiredPendingPaths(null, NOW, DAY)).toEqual([]);
        expect(prune.expiredPendingPaths({}, NOW, DAY)).toEqual([]);
    });
});

describe('staleGuardPaths', () => {
    it('selects guards older than the TTL, keeps recent ones', () => {
        const all = {
            u1: { r_recent: { at: NOW - 60 * 1000 }, r_old: { at: NOW - 8 * DAY } },
            u2: { r_old2: { at: NOW - 30 * DAY }, r_nodate: {} }, // missing at → treated as ancient → prune
        };
        const paths = prune.staleGuardPaths(all, NOW, 7 * DAY);
        expect(paths.sort()).toEqual([
            'billing/debitGuard/u1/r_old',
            'billing/debitGuard/u2/r_nodate',
            'billing/debitGuard/u2/r_old2',
        ]);
    });
});

describe('pruneAgentNodes (fake-rtdb integration)', () => {
    it('nulls expired pending + stale guards, leaves fresh, returns counts', async () => {
        const db = makeFakeRtdb({
            ross: { agentPending: { u1: {
                keep: { expiresAt: NOW + DAY, tool: 'pauseWorkflow' },
                drop: { expiresAt: NOW - 5 * DAY, tool: 'pauseWorkflow' },
            } } },
            billing: { debitGuard: { u1: {
                keep: { at: NOW - 60 * 1000, costCents: 5 },
                drop: { at: NOW - 20 * DAY, costCents: 5 },
            } } },
        });
        prune.__setDbForTests(db);
        const res = await prune.pruneAgentNodes(NOW);

        expect(res.removed).toBe(2);
        const dump = db._dump();
        expect(dump.ross.agentPending.u1.keep).toBeDefined();
        expect(dump.ross.agentPending.u1.drop).toBeUndefined();
        expect(dump.billing.debitGuard.u1.keep).toBeDefined();
        expect(dump.billing.debitGuard.u1.drop).toBeUndefined();
    });

    it('no stale nodes → no write, removed 0', async () => {
        const db = makeFakeRtdb({ ross: { agentPending: { u1: { keep: { expiresAt: NOW + DAY } } } } });
        prune.__setDbForTests(db);
        const res = await prune.pruneAgentNodes(NOW);
        expect(res.removed).toBe(0);
        expect(db._dump().ross.agentPending.u1.keep).toBeDefined();
    });

    afterEach(() => prune.__setDbForTests(null));
});
