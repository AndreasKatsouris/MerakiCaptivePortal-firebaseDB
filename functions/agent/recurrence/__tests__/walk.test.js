/**
 * Guard — ROSS recurrence advance walker.
 *
 * Includes the regression test that ties the fix to the reported symptom:
 * seed the two REAL frozen workflows, run the advance, then assert
 * `selectFindings(buildHomeWorkflowDigest(...))` returns a non-null selection.
 *
 * That assertion target is deliberate. The first draft of this design would
 * have advanced into the FUTURE, which lands items in `digest.upcoming` — a
 * bucket `nudge-selector.js` never reads. A guard written against the digest
 * alone would have gone green while Ross stayed silent. Test the symptom.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const walk = require('../walk');
const { selectFindings } = require('../../sweep/nudge-selector');
const { buildHomeWorkflowDigest } = require('../../../ross');

const utc = (s) => Date.parse(`${s}T00:00:00Z`);
const NOW = utc('2026-07-26') + 9 * 3600000; // 09:00 UTC on the 26th
const UID = 'ownerA';

// Minimal RTDB fake: only .ref(path).once('value') and .ref().update() are used.
function makeDb(store) {
    const readAt = (path) => path.split('/').filter(Boolean)
        .reduce((node, key) => (node == null ? undefined : node[key]), store);
    const writes = [];
    return {
        writes,
        ref(path = '') {
            return {
                once: async () => {
                    const val = readAt(path);
                    return { val: () => (val === undefined ? null : val), exists: () => val !== undefined };
                },
                update: async (obj) => { writes.push(obj); },
            };
        },
    };
}

/** The two live workflows, in their real frozen shape. */
function frozenStore() {
    return {
        ross: {
            config: {},
            ownerIndex: { [UID]: true },
            workflows: {
                [UID]: {
                    wfMonthly: {
                        name: 'Monthly Food Cost Review',
                        recurrence: 'monthly',
                        customInterval: null,
                        locations: {
                            locA: {
                                locationName: 'Venue A',
                                status: 'active',
                                nextDueDate: utc('2026-06-06'),
                                tasks: {
                                    t1: { title: 'Count stock', status: 'completed', completedAt: 123, dueDate: utc('2026-06-06'), required: true },
                                    t2: { title: 'File report', status: 'pending', completedAt: null, dueDate: utc('2026-06-07'), required: true },
                                },
                            },
                        },
                    },
                    wfWeekly: {
                        name: 'Weekly Compliance Sweep',
                        recurrence: 'weekly',
                        customInterval: null,
                        locations: {
                            locB: {
                                locationName: 'Venue B',
                                status: 'active',
                                nextDueDate: utc('2026-06-17'),
                                tasks: { t3: { title: 'Temp check', status: 'pending', completedAt: null, dueDate: utc('2026-06-17'), required: true } },
                            },
                        },
                    },
                },
            },
        },
    };
}

let logSpy, warnSpy, errSpy;
beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { walk.__setDbForTests(null); vi.restoreAllMocks(); });

/** Apply the walker's flat multi-path updates onto a nested store. */
function applyWrites(store, writes) {
    writes.forEach((batch) => {
        Object.entries(batch).forEach(([path, value]) => {
            const parts = path.split('/').filter(Boolean);
            const last = parts.pop();
            let node = store;
            parts.forEach((k) => { if (node[k] === undefined || node[k] === null) node[k] = {}; node = node[k]; });
            node[last] = value;
        });
    });
}

describe('mode + allowlist', () => {
    it('defaults to dry-run so a forgotten env var cannot mutate every tenant', () => {
        expect(walk.getMode({})).toBe(walk.MODES.DRY_RUN);
        expect(walk.getMode({ ROSS_RECURRENCE_ADVANCE_MODE: 'nonsense' })).toBe(walk.MODES.DRY_RUN);
        expect(walk.getMode({ ROSS_RECURRENCE_ADVANCE_MODE: ' APPLY ' })).toBe(walk.MODES.APPLY);
    });

    it('parses an owner allowlist, and null when unset', () => {
        expect(walk.getOwnerAllowlist({})).toBeNull();
        expect([...walk.getOwnerAllowlist({ ROSS_RECURRENCE_ADVANCE_OWNERS: 'a, b  c' })]).toEqual(['a', 'b', 'c']);
    });
});

describe('advanceAllWorkflows', () => {
    it('dry-run reports what it WOULD do and writes nothing', async () => {
        const db = makeDb(frozenStore());
        walk.__setDbForTests(db);

        const s = await walk.advanceAllWorkflows(NOW, {});
        expect(s.mode).toBe('dry-run');
        expect(s.advanced).toBe(2);
        expect(db.writes).toHaveLength(0);
    });

    it('apply writes the audit row BEFORE the data, and both are present', async () => {
        const db = makeDb(frozenStore());
        walk.__setDbForTests(db);

        await walk.advanceAllWorkflows(NOW, { ROSS_RECURRENCE_ADVANCE_MODE: 'apply' });

        expect(db.writes).toHaveLength(2);
        const auditKeys = Object.keys(db.writes[0]);
        expect(auditKeys.every((k) => k.startsWith('ross/recurrenceAudit/'))).toBe(true);
        // prev is the only rollback record — it must carry the original value.
        expect(Object.values(db.writes[0])[0].prev.nextDueDate).toBe(utc('2026-06-06'));
        expect(Object.keys(db.writes[1]).some((k) => k.endsWith('/nextDueDate'))).toBe(true);
    });

    it('honours the global kill switch', async () => {
        const store = frozenStore();
        store.ross.config.agentKillSwitch = true;
        const db = makeDb(store);
        walk.__setDbForTests(db);

        const s = await walk.advanceAllWorkflows(NOW, { ROSS_RECURRENCE_ADVANCE_MODE: 'apply' });
        expect(s.halted).toBe('killswitch');
        expect(db.writes).toHaveLength(0);
    });

    it('restricts to the owner allowlist', async () => {
        const db = makeDb(frozenStore());
        walk.__setDbForTests(db);

        const s = await walk.advanceAllWorkflows(NOW, {
            ROSS_RECURRENCE_ADVANCE_MODE: 'apply',
            ROSS_RECURRENCE_ADVANCE_OWNERS: 'somebody-else',
        });
        expect(s.advanced).toBe(0);
        expect(db.writes).toHaveLength(0);
    });

    it('skips a paused workflow, matching the digest exclusion', async () => {
        const store = frozenStore();
        store.ross.workflows[UID].wfMonthly.status = 'paused';
        const db = makeDb(store);
        walk.__setDbForTests(db);

        const s = await walk.advanceAllWorkflows(NOW, {});
        expect(s.advanced).toBe(1); // weekly only
    });

    it('isolates a malformed owner instead of aborting the walk', async () => {
        const store = frozenStore();
        store.ross.ownerIndex.broken = true;
        const db = makeDb(store);
        const realRef = db.ref.bind(db);
        db.ref = (p = '') => (p === 'ross/workflows/broken'
            ? { once: async () => { throw new Error('boom'); } }
            : realRef(p));
        walk.__setDbForTests(db);

        const s = await walk.advanceAllWorkflows(NOW, {});
        expect(s.errors).toBe(1);
        expect(s.advanced).toBe(2); // ownerA still processed
    });
});

describe('buildLocationUpdate', () => {
    const loc = frozenStore().ross.workflows[UID].wfMonthly.locations.locA;
    const result = { newNextDueDate: utc('2026-07-06'), missedCycles: 0, deltaMs: utc('2026-07-06') - utc('2026-06-06') };
    const u = walk.buildLocationUpdate({ uid: UID, workflowId: 'wfMonthly', locationId: 'locA', loc, result, nowMs: NOW });
    const base = `ross/workflows/${UID}/wfMonthly/locations/locA`;

    it('shifts every parseable task dueDate by the SAME delta', () => {
        expect(u[`${base}/tasks/t1/dueDate`]).toBe(utc('2026-07-06'));
        expect(u[`${base}/tasks/t2/dueDate`]).toBe(utc('2026-07-07'));
    });

    it('resets a completed task so the new cycle is completable', () => {
        // Leaving status 'completed' makes rossCompleteTask 404 (ross.js:1299,:1311).
        expect(u[`${base}/tasks/t1/status`]).toBe('pending');
        expect(u[`${base}/tasks/t1/completedAt`]).toBeNull();
    });

    it('does not touch a task that was already pending', () => {
        expect(u).not.toHaveProperty(`${base}/tasks/t2/status`);
    });

    it('accumulates missedCycles rather than overwriting', () => {
        const withPrior = walk.buildLocationUpdate({
            uid: UID, workflowId: 'w', locationId: 'l',
            loc: { ...loc, missedCycles: 4 }, result: { ...result, missedCycles: 3 }, nowMs: NOW,
        });
        expect(withPrior['ross/workflows/ownerA/w/locations/l/missedCycles']).toBe(7);
    });

    it('leaves an unparseable task dueDate alone rather than inventing one', () => {
        const odd = walk.buildLocationUpdate({
            uid: UID, workflowId: 'w', locationId: 'l',
            loc: { tasks: { bad: { dueDate: 'not-a-date', status: 'pending' } } },
            result, nowMs: NOW,
        });
        expect(odd).not.toHaveProperty('ross/workflows/ownerA/w/locations/l/tasks/bad/dueDate');
    });
});

describe('REGRESSION — the advance actually makes Ross speak again', () => {
    it('turns a permanently-silent sweep into a non-null nudge selection', async () => {
        const store = frozenStore();

        // The freeze: a run started on/after nextDueDate makes runCoversCurrentPeriod
        // permanently true (ross.js:404-406), so nothing is ever overdue.
        const runs = {
            wfMonthly: { locA: { r1: { id: 'r1', startedAt: utc('2026-06-11'), completedAt: utc('2026-06-11'), responses: {} } } },
            wfWeekly: { locB: { r2: { id: 'r2', startedAt: utc('2026-06-17'), completedAt: null, responses: {} } } },
        };
        const args = { runs, clientToday: '2026-07-26', now: NOW };

        // BEFORE: digest empty, selector null -> sweep reports 'silent'.
        const before = buildHomeWorkflowDigest({ workflows: store.ross.workflows[UID], ...args });
        expect(before.overdue).toHaveLength(0);
        expect(selectFindings(before)).toBeNull();

        // Advance.
        const db = makeDb(store);
        walk.__setDbForTests(db);
        await walk.advanceAllWorkflows(NOW, { ROSS_RECURRENCE_ADVANCE_MODE: 'apply' });
        applyWrites(store, db.writes);

        // AFTER: both are overdue and the nudge has something to say.
        const after = buildHomeWorkflowDigest({ workflows: store.ross.workflows[UID], ...args });
        expect(after.overdue.length).toBe(2);

        const selection = selectFindings(after);
        expect(selection).not.toBeNull();
        expect(selection.findings.length).toBe(2);
        expect(selection.findings[0].kind).toBe('overdue');
    });
});
