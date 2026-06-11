'use strict';

const sweep = require('../sweep/sweep');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

const NOW = Date.UTC(2026, 5, 11, 5, 0); // 07:00 SAST
const TODAY = '2026-06-11';

// This suite stays independent of ross.js shapes by injecting a digest seam
// (__setDigestForTests). The real buildHomeWorkflowDigest integration is
// covered by the deploy smoke + the digest builder's own tests.
describe('sweepOwner / sweepAllOwners', () => {
    let db, sent, channels;

    beforeEach(() => {
        sent = [];
        channels = { whatsapp: { deliver: async (owner, payload) => { sent.push({ owner, payload }); return { ok: true, messageSid: 'SM1' }; } } };
        sweep.__setChannelsForTests(channels);
        sweep.__setNormalizeForTests((p) => p);
        sweep.__setDigestForTests(async () => ({
            overdue: [{ workflowId: 'w1', locationId: 'l1', name: 'Audit', locationName: 'Grove', nextDueDate: '2026-05-31', daysLate: 11, requiredTaskCount: 1 }],
            today: [], recentCompletions: [], upcoming: null, hasActiveWorkflows: true, activeWorkflowCount: 1,
        }));
    });
    afterEach(() => {
        sweep.__setChannelsForTests(null);
        sweep.__setNormalizeForTests(null);
        sweep.__setDigestForTests(null);
        sweep.__setDbForTests(null);
    });

    function seed(extra = {}) {
        db = makeFakeRtdb({
            ross: {
                agentConfig: { u1: { proactive: { enabled: true, channel: 'whatsapp' } } },
                config: {},
            },
            users: { u1: { firstName: 'Andreas', phoneNumber: '+27820000001' } },
            subscriptions: { u1: { features: { rossAgent: true } } },
            ...extra,
        });
        sweep.__setDbForTests(db);
    }

    it('happy path: sends one nudge and stamps the idempotency marker', async () => {
        seed();
        const summary = await sweep.sweepAllOwners(NOW);
        expect(summary).toMatchObject({ scanned: 1, sent: 1, errors: 0 });
        expect(sent).toHaveLength(1);
        expect(sent[0].owner).toEqual({ uid: 'u1', phone: '+27820000001' });
        expect(sent[0].payload.findingsLine).toContain('Audit (11 days overdue)');
        const marker = (await db.ref(`ross/proactiveLog/u1/${TODAY}`).once('value')).val();
        expect(marker).toMatchObject({ channel: 'whatsapp', messageSid: 'SM1', findingCount: 1, status: 'sent' });
    });

    it('global kill switch halts the whole sweep before any owner work', async () => {
        seed({ });
        await db.ref('ross/config/agentKillSwitch').set(true);
        const summary = await sweep.sweepAllOwners(NOW);
        expect(summary).toMatchObject({ halted: 'killswitch', sent: 0 });
        expect(sent).toHaveLength(0);
    });

    it('skips: not opted in / agent disabled / no entitlement / no phone / already sent today', async () => {
        seed();
        // not opted in
        await db.ref('ross/agentConfig/u1/proactive/enabled').set(false);
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(0);
        await db.ref('ross/agentConfig/u1/proactive/enabled').set(true);
        // agent disabled (rossChat gate (b) analogue)
        await db.ref('ross/agentConfig/u1/enabled').set(false);
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(0);
        await db.ref('ross/agentConfig/u1/enabled').set(null);
        // entitlement off and not super-admin
        await db.ref('subscriptions/u1/features/rossAgent').set(false);
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(0);
        // super-admin bypasses entitlement
        await db.ref('admins/u1/superAdmin').set(true);
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(1);
        sent.length = 0;
        // already sent today (marker just written) → dedup skip
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(0);
        // no phone
        await db.ref(`ross/proactiveLog/u1/${TODAY}`).set(null);
        await db.ref('users/u1').set({ firstName: 'A' });
        expect((await sweep.sweepAllOwners(NOW)).sent).toBe(0);
    });

    it('silent day: empty digest → no send, NO marker (nothing to dedup)', async () => {
        seed();
        sweep.__setDigestForTests(async () => ({ overdue: [], today: [], recentCompletions: [] }));
        const summary = await sweep.sweepAllOwners(NOW);
        expect(summary).toMatchObject({ sent: 0, silent: 1 });
        expect((await db.ref(`ross/proactiveLog/u1/${TODAY}`).once('value')).val()).toBeNull();
    });

    it('per-owner isolation: one owner throwing does not stop the next', async () => {
        seed({
            users: {
                u1: { firstName: 'A', phoneNumber: '+27820000001' },
                u2: { firstName: 'B', phoneNumber: '+27820000002' },
            },
            subscriptions: {
                u1: { features: { rossAgent: true } },
                u2: { features: { rossAgent: true } },
            },
        });
        await db.ref('ross/agentConfig/u2').set({ proactive: { enabled: true, channel: 'whatsapp' } });
        channels.whatsapp.deliver = async (owner) => {
            if (owner.uid === 'u1') throw new Error('boom');
            sent.push({ owner });
            return { ok: true, messageSid: 'SM2' };
        };
        const summary = await sweep.sweepAllOwners(NOW);
        expect(summary).toMatchObject({ sent: 1, errors: 1 });
        expect(sent[0].owner.uid).toBe('u2');
        // failed owner gets NO marker → tomorrow's sweep covers them
        expect((await db.ref(`ross/proactiveLog/u1/${TODAY}`).once('value')).val()).toBeNull();
    });

    it('at-least-once contract: deliver succeeds but marker write throws → error today, re-send next sweep', async () => {
        seed();
        let deliverCalls = 0;
        channels.whatsapp.deliver = async () => {
            deliverCalls += 1;
            return { ok: true, messageSid: 'SM1' };
        };
        // Wrap the fake db: proactiveLog refs get a rejecting .set on the FIRST sweep only
        // (reads via .once stay intact so the dedup gate still works).
        const realDb = db;
        let failMarkerWrite = true;
        sweep.__setDbForTests({
            ref(path) {
                const real = realDb.ref(path);
                if (String(path).startsWith('ross/proactiveLog') && failMarkerWrite) {
                    return { ...real, set: async () => { throw new Error('rtdb down'); } };
                }
                return real;
            },
        });

        const first = await sweep.sweepAllOwners(NOW);
        // throw happens AFTER deliver but BEFORE 'sent' returns → counted as error, not sent
        expect(first).toMatchObject({ sent: 0, errors: 1 });
        expect(deliverCalls).toBe(1);
        expect((await realDb.ref(`ross/proactiveLog/u1/${TODAY}`).once('value')).val()).toBeNull();

        // marker write recovers → next sweep delivers AGAIN (at-least-once by design, not accident)
        failMarkerWrite = false;
        const second = await sweep.sweepAllOwners(NOW);
        expect(second).toMatchObject({ sent: 1, errors: 0 });
        expect(deliverCalls).toBe(2);
        expect((await realDb.ref(`ross/proactiveLog/u1/${TODAY}`).once('value')).val())
            .toMatchObject({ status: 'sent', messageSid: 'SM1' });
    });

    it('unknown channel → skip with error count, no throw', async () => {
        seed();
        await db.ref('ross/agentConfig/u1/proactive/channel').set('telegram');
        const summary = await sweep.sweepAllOwners(NOW);
        expect(summary).toMatchObject({ sent: 0, errors: 1 });
    });
});

describe('scheduled CF', () => {
    it('exports rossProactiveSweep', () => {
        expect(require('../sweep/sweep').rossProactiveSweep).toBeTruthy();
    });
});
