'use strict';

const { executeTool, snapshotPrev, __setDbForTests: setExecDb } = require('../execute');
const { __setDbForTests: setToolsDb } = require('../tools');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

function seed() {
    return makeFakeRtdb({
        ross: {
            agentAudit: {},
            // getStaff is the generic AUTO-tier ready tool these audit-wrapper
            // tests drive. It replaced snoozeCard when that was removed from the
            // registry (2026-07-21, snoozing is a user action) — the wrapper
            // behaviour under test is tool-agnostic.
            staff: { owner1: { loc1: { s1: { name: 'Abe' } } } },
            workflows: { owner1: { wf1: { locations: { loc1: { nextDueDate: 1717200000000 } } } } },
        },
    });
}

describe('executeTool', () => {
    let db;
    beforeEach(() => {
        db = seed();
        setExecDb(db);   // execute.js writes the audit row
        setToolsDb(db);  // the adapter run reads/writes via tools.js seam
    });

    it('runs a ready tool and returns its result', async () => {
        const ctx = { uid: 'owner1', turnId: 't1', turnSource: 'chat', now: 5000 };
        const out = await executeTool(ctx, 'getStaff', { locationId: 'loc1' });
        expect(out.staff.map((s) => s.name)).toEqual(['Abe']);
    });

    it('writes one audit row per execution with via=auto:<turnSource>', async () => {
        const ctx = { uid: 'owner1', turnId: 't1', turnSource: 'chat', now: 5000 };
        await executeTool(ctx, 'getStaff', { locationId: 'loc1' });
        const rows = Object.values(db._dump().ross.agentAudit.owner1.t1);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ tool: 'getStaff', tier: 'auto', via: 'auto:chat', at: 5000 });
        expect(rows[0].result.staff).toHaveLength(1);
    });

    it('records who confirmed when ctx.confirmedBy is set', async () => {
        const ctx = { uid: 'owner1', turnId: 't2', turnSource: 'chat', confirmedBy: 'owner1', now: 7000 };
        await executeTool(ctx, 'getStaff', { locationId: 'loc1' });
        const rows = Object.values(db._dump().ross.agentAudit.owner1.t2);
        expect(rows[0].via).toBe('confirmed:owner1');
    });

    it('throws on an unknown tool', async () => {
        await expect(executeTool({ uid: 'u', turnId: 't', turnSource: 'chat', now: 1 }, 'nope', {}))
            .rejects.toThrow(/Unknown tool/);
    });
});

describe('snapshotPrev (no-undo capture, §4)', () => {
    let db;
    beforeEach(() => { db = seed(); setExecDb(db); });

    it('captures the prior nextDueDate for advanceDueDate', async () => {
        const prev = await snapshotPrev('owner1', 'advanceDueDate', { workflowId: 'wf1', locationId: 'loc1' });
        expect(prev).toEqual({ nextDueDate: 1717200000000 });
    });

    it('returns undefined for tools that need no prev capture', async () => {
        const prev = await snapshotPrev('owner1', 'getStaff', { locationId: 'loc1' });
        expect(prev).toBeUndefined();
    });

    it('captures the prior mutable workflow fields for editWorkflow / pauseWorkflow (slice 4)', async () => {
        const db2 = makeFakeRtdb({
            ross: { workflows: { owner1: { wf2: { name: 'Old', status: 'active', notifyPhone: '+27', extra: 'ignored' } } } },
        });
        setExecDb(db2);
        const expected = { name: 'Old', status: 'active', notifyPhone: '+27' }; // 'extra' is not a mutable field
        await expect(snapshotPrev('owner1', 'pauseWorkflow', { workflowId: 'wf2' })).resolves.toEqual(expected);
        await expect(snapshotPrev('owner1', 'editWorkflow', { workflowId: 'wf2' })).resolves.toEqual(expected);
    });
});
