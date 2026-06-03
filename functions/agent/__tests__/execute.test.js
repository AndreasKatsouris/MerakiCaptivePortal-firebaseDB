'use strict';

const { executeTool, snapshotPrev, __setDbForTests: setExecDb } = require('../execute');
const { __setDbForTests: setToolsDb } = require('../tools');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

function seed() {
    return makeFakeRtdb({
        ross: {
            v2Snoozes: {},
            agentAudit: {},
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
        const out = await executeTool(ctx, 'snoozeCard', { cardId: 'abc', hours: 1 });
        expect(out.cardId).toBe('abc');
        expect(out.expiresAt).toBe(5000 + 3600000);
    });

    it('writes one audit row per execution with via=auto:<turnSource>', async () => {
        const ctx = { uid: 'owner1', turnId: 't1', turnSource: 'chat', now: 5000 };
        await executeTool(ctx, 'snoozeCard', { cardId: 'abc', hours: 1 });
        const rows = Object.values(db._dump().ross.agentAudit.owner1.t1);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ tool: 'snoozeCard', tier: 'auto', via: 'auto:chat', at: 5000 });
        expect(rows[0].result.cardId).toBe('abc');
    });

    it('records who confirmed when ctx.confirmedBy is set', async () => {
        const ctx = { uid: 'owner1', turnId: 't2', turnSource: 'chat', confirmedBy: 'owner1', now: 7000 };
        await executeTool(ctx, 'snoozeCard', { cardId: 'z', hours: 1 });
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

    it('returns undefined for tools with native undo', async () => {
        const prev = await snapshotPrev('owner1', 'snoozeCard', { cardId: 'x' });
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
