'use strict';

/**
 * askRoss slice 3 — rossChat reactive engine. Phase 3 covers the pure-ish helpers:
 *   - runGates: the four pre-flight gates + super-admin short-circuit (§2 step 1)
 *   - buildOwnerContext: the cached prompt block-2 string (§5, D4)
 *   - buildHistoryMessages: bounded last-N-turn reconstruction (§7, D5)
 * The streaming loop + SSE handler are Phase 4.
 *
 * runGates does I/O (RTDB + ledger.checkBalance); tests inject one shared in-memory
 * fake into BOTH the rossChat seam and the ledger seam.
 */

const rossChat = require('../rossChat');
const ledger = require('../../billing/ledger');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

function seedGates(extra = {}) {
    const db = makeFakeRtdb(extra);
    rossChat.__setDbForTests(db);
    ledger.__setDbForTests(db);
    return db;
}

afterEach(() => {
    rossChat.__setDbForTests(null);
    ledger.__setDbForTests(null);
});

// ---------------------------------------------------------------------------
describe('runGates', () => {
    // A fully-passing owner: enabled (implicit), entitled, funded.
    const PASSING = {
        subscriptions: { u1: { features: { rossAgent: true } } },
        billing: { credits: { u1: { balanceCents: 1000 } } },
    };

    it('passes all four gates for an entitled, funded, enabled owner', async () => {
        seedGates(PASSING);
        await expect(rossChat.runGates({ uid: 'u1', isSuperAdmin: false }))
            .resolves.toEqual({ ok: true });
    });

    it('blocks on the global kill switch (terminal: disabled), before any other gate', async () => {
        seedGates({ ...PASSING, ross: { config: { agentKillSwitch: true } } });
        const r = await rossChat.runGates({ uid: 'u1', isSuperAdmin: false });
        expect(r.ok).toBe(false);
        expect(r.terminal).toBe('disabled');
        expect(r.gate).toBe('killswitch');
    });

    it('blocks when the owner is explicitly disabled (enabled === false)', async () => {
        seedGates({ ...PASSING, ross: { agentConfig: { u1: { enabled: false } } } });
        const r = await rossChat.runGates({ uid: 'u1', isSuperAdmin: false });
        expect(r.ok).toBe(false);
        expect(r.terminal).toBe('disabled');
        expect(r.gate).toBe('owner-disabled');
    });

    it('does NOT block when enabled is missing (only an explicit false disables)', async () => {
        seedGates(PASSING); // no agentConfig node at all
        await expect(rossChat.runGates({ uid: 'u1', isSuperAdmin: false }))
            .resolves.toEqual({ ok: true });
    });

    it('blocks when rossAgent is not entitled (terminal: not-entitled)', async () => {
        seedGates({
            subscriptions: { u1: { features: { rossBasic: true } } }, // legacy flag, NOT rossAgent
            billing: { credits: { u1: { balanceCents: 1000 } } },
        });
        const r = await rossChat.runGates({ uid: 'u1', isSuperAdmin: false });
        expect(r.ok).toBe(false);
        expect(r.terminal).toBe('not-entitled');
        expect(r.gate).toBe('entitlement');
    });

    it('blocks when balance is at/below floor (terminal: no-credit)', async () => {
        seedGates({
            subscriptions: { u1: { features: { rossAgent: true } } },
            billing: { credits: { u1: { balanceCents: 10 } } }, // <= DEFAULT_BALANCE_FLOOR_CENTS (50)
        });
        const r = await rossChat.runGates({ uid: 'u1', isSuperAdmin: false });
        expect(r.ok).toBe(false);
        expect(r.terminal).toBe('no-credit');
        expect(r.gate).toBe('balance');
    });

    it('super-admin short-circuits the entitlement + balance gates (no rossAgent, zero balance)', async () => {
        seedGates({}); // no entitlement, no credit
        await expect(rossChat.runGates({ uid: 'admin1', isSuperAdmin: true }))
            .resolves.toEqual({ ok: true });
    });

    it('super-admin is STILL blocked by the global kill switch', async () => {
        seedGates({ ross: { config: { agentKillSwitch: true } } });
        const r = await rossChat.runGates({ uid: 'admin1', isSuperAdmin: true });
        expect(r.ok).toBe(false);
        expect(r.gate).toBe('killswitch');
    });

    it('every failing gate carries a non-empty user-facing message', async () => {
        seedGates({}); // owner, unentitled, unfunded → not-entitled
        const r = await rossChat.runGates({ uid: 'u1', isSuperAdmin: false });
        expect(typeof r.message).toBe('string');
        expect(r.message.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
describe('buildOwnerContext', () => {
    const DIGEST = {
        activeWorkflowCount: 5,
        overdue: [
            { name: 'Daily Opening Checklist', locationName: "Tannie's Kitchen", daysLate: 3, nextDueDate: '2026-05-31' },
            { name: 'Weekly Compliance Sweep', locationName: 'Harbour Cafe', daysLate: 1, nextDueDate: '2026-06-02' },
        ],
        today: [
            { name: 'Monthly Food Cost Review', locationName: "Tannie's Kitchen", subState: 'pending' },
        ],
        upcoming: { name: 'Health & Safety Audit', locationName: 'Harbour Cafe', nextDueDate: '2026-06-05' },
    };

    it('renders tier, date, locations, counts and detail lines', () => {
        const ctx = rossChat.buildOwnerContext({
            dateStr: '03/06/2026',
            tier: 'all-in',
            locationNames: ["Tannie's Kitchen", 'Harbour Cafe'],
            digest: DIGEST,
        });
        expect(ctx).toContain('03/06/2026');
        expect(ctx).toContain('all-in');
        expect(ctx).toContain("Tannie's Kitchen");
        expect(ctx).toContain('5 active');
        expect(ctx).toContain('2 overdue');
        expect(ctx).toContain('1 due today');
        expect(ctx).toContain('Daily Opening Checklist');
        expect(ctx).toContain('Health & Safety Audit'); // upcoming
    });

    it('is defensive with an empty digest + no locations', () => {
        const ctx = rossChat.buildOwnerContext({
            dateStr: '03/06/2026', tier: null, locationNames: [],
            digest: { activeWorkflowCount: 0, overdue: [], today: [], upcoming: null },
        });
        expect(ctx).toContain('0 active');
        expect(ctx).toContain('(none on file)');
        expect(typeof ctx).toBe('string');
    });

    it('tolerates a fully missing digest object', () => {
        const ctx = rossChat.buildOwnerContext({ dateStr: '03/06/2026', tier: 'free', locationNames: [], digest: null });
        expect(ctx).toContain('0 active');
    });
});

// ---------------------------------------------------------------------------
describe('buildHistoryMessages', () => {
    const turn = (u, a) => ({ userMessage: u, assistantBlocks: [{ type: 'text', text: a }] });

    it('returns just the new user message when there is no history', () => {
        expect(rossChat.buildHistoryMessages(null, 'hi')).toEqual([{ role: 'user', content: 'hi' }]);
    });

    it('reconstructs user/assistant pairs in key order, new message last', () => {
        const turns = { k000001: turn('q1', 'a1'), k000002: turn('q2', 'a2') };
        const msgs = rossChat.buildHistoryMessages(turns, 'q3');
        expect(msgs).toEqual([
            { role: 'user', content: 'q1' },
            { role: 'assistant', content: [{ type: 'text', text: 'a1' }] },
            { role: 'user', content: 'q2' },
            { role: 'assistant', content: [{ type: 'text', text: 'a2' }] },
            { role: 'user', content: 'q3' },
        ]);
    });

    it('retains only the last maxTurns turns (oldest dropped)', () => {
        const turns = {};
        for (let i = 1; i <= 15; i++) turns[`k${String(i).padStart(6, '0')}`] = turn(`q${i}`, `a${i}`);
        const msgs = rossChat.buildHistoryMessages(turns, 'new', { maxTurns: 3 });
        // 3 turns × 2 + 1 new = 7 messages; oldest retained user is q13.
        expect(msgs).toHaveLength(7);
        expect(msgs[0]).toEqual({ role: 'user', content: 'q13' });
        expect(msgs[msgs.length - 1]).toEqual({ role: 'user', content: 'new' });
    });

    it('drops oldest turns to stay within the char budget', () => {
        const big = 'x'.repeat(500);
        const turns = {
            k000001: turn('old', big),
            k000002: turn('mid', big),
            k000003: turn('recent', 'short'),
        };
        const msgs = rossChat.buildHistoryMessages(turns, 'now', { maxTurns: 10, maxChars: 700 });
        const userContents = msgs.filter((m) => m.role === 'user').map((m) => m.content);
        expect(userContents).not.toContain('old');
        expect(userContents).toContain('now');
    });

    it('emits only a user message for a turn with no assistant blocks', () => {
        const turns = { k000001: { userMessage: 'q1' } }; // terminal turn, never answered
        const msgs = rossChat.buildHistoryMessages(turns, 'q2');
        expect(msgs).toEqual([
            { role: 'user', content: 'q1' },
            { role: 'user', content: 'q2' },
        ]);
    });
});
