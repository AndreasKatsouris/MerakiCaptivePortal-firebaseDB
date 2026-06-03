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
const llmClient = require('../llm-client');
const tools = require('../tools');
const execute = require('../execute');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

// Fake Anthropic stream (mirrors llm-client.test.js): fires text deltas on
// finalMessage(), then resolves to the scripted final message.
function makeFakeStream({ deltas = [], final }) {
    const handlers = {};
    return {
        on(event, cb) { handlers[event] = cb; return this; },
        async finalMessage() {
            for (const d of deltas) if (handlers.text) handlers.text(d);
            return final;
        },
    };
}

// A client whose messages.stream() returns the next scripted turn each call, so the
// loop can be driven through multiple round-trips (tool_use → … → end_turn).
function scriptedClient(scripts) {
    let i = 0;
    return {
        messages: {
            stream: () => {
                const s = scripts[i++] || { final: { content: [], usage: {}, stop_reason: 'end_turn' } };
                return makeFakeStream(s);
            },
        },
    };
}

// Verbatim Anthropic usage block with prompt caching (server-shape-mock lesson;
// copied from llm-client.test.js:25 / a real message_stop usage block).
const USAGE = {
    input_tokens: 10,
    output_tokens: 50,
    cache_creation_input_tokens: 200,
    cache_read_input_tokens: 1000,
};
const textMsg = (text) => ({ content: [{ type: 'text', text }], usage: USAGE, stop_reason: 'end_turn' });
const toolMsg = (name, input, id = 'toolu_1') => ({
    content: [{ type: 'tool_use', id, name, input }],
    usage: USAGE,
    stop_reason: 'tool_use',
});

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

// ---------------------------------------------------------------------------
describe('runAgentLoop', () => {
    const CTX = { uid: 'u1', turnId: 'turn1', turnSource: 'chat', now: 1_700_000_000_000 };
    const SYSTEM = [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }];
    const TOOLS = tools.toAnthropicTools(); // the 4 READY auto tools

    let db;
    let events;
    function run(scripts, opts = {}) {
        db = makeFakeRtdb({});
        tools.__setDbForTests(db);
        execute.__setDbForTests(db);
        llmClient.__setClientForTests(scriptedClient(scripts));
        events = [];
        return rossChat.runAgentLoop({
            ctx: CTX, system: SYSTEM, tools: TOOLS,
            messages: [{ role: 'user', content: 'hi' }],
            ownerConfig: opts.ownerConfig || null,
            emit: (e) => events.push(e),
            maxTurns: opts.maxTurns || 5,
        });
    }

    afterEach(() => {
        tools.__setDbForTests(null);
        execute.__setDbForTests(null);
        llmClient.__setClientForTests(null);
    });

    it('text-only answer: one round, no tool execution, usage mapped', async () => {
        const res = await run([{ deltas: ['Hel', 'lo'], final: textMsg('Hello') }]);
        expect(res.rounds).toBe(1);
        expect(res.assistantBlocks).toEqual([{ type: 'text', text: 'Hello' }]);
        expect(res.units).toEqual({ inputTokens: 10, outputTokens: 50, cacheWriteTokens: 200, cacheReadTokens: 1000 });
        expect(events.filter((e) => e.type === 'text').map((e) => e.delta)).toEqual(['Hel', 'lo']);
        expect(events.some((e) => e.type === 'action')).toBe(false);
    });

    it('auto tool then answer: executes the tool, audits it, feeds tool_result, emits an action', async () => {
        const res = await run([
            { final: toolMsg('snoozeCard', { cardId: 'food-cost', hours: 4 }) },
            { final: textMsg('Snoozed it.') },
        ]);
        expect(res.rounds).toBe(2);
        // tool ran → snooze node written + audit row
        const dump = db._dump();
        expect(dump.ross.v2Snoozes.u1['food-cost']).toBeDefined();
        expect(Object.values(dump.ross.agentAudit.u1.turn1)[0]).toMatchObject({ tool: 'snoozeCard' });
        // an action event was emitted
        expect(events.some((e) => e.type === 'action' && /snoozeCard/.test(JSON.stringify(e)))).toBe(true);
        // a tool_result was fed back into the conversation
        const toolResults = res.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : []))
            .filter((b) => b.type === 'tool_result');
        expect(toolResults).toHaveLength(1);
        expect(toolResults[0].tool_use_id).toBe('toolu_1');
        expect(res.assistantBlocks).toEqual([{ type: 'text', text: 'Snoozed it.' }]);
    });

    it('PAUSES on a confirm-tier tool without executing it (returns paused + pendingTool)', async () => {
        const res = await run([
            { final: toolMsg('activateTemplate', { templateId: 't1', locationIds: ['l1'] }) },
        ]);
        expect(res.paused).toBe(true);
        expect(res.pendingTool).toMatchObject({ name: 'activateTemplate', toolUseId: 'toolu_1' });
        expect(res.pendingTool.args).toEqual({ templateId: 't1', locationIds: ['l1'] });
        // NOT executed → no audit row; loop stopped after one round (no second stream call).
        expect(db._dump().ross && db._dump().ross.agentAudit).toBeUndefined();
        expect(res.rounds).toBe(1);
        // the (trimmed) assistant turn carrying the confirm tool_use is persisted for resume.
        const last = res.messages[res.messages.length - 1];
        expect(last.role).toBe('assistant');
        expect(last.content.some((b) => b.type === 'tool_use' && b.name === 'activateTemplate')).toBe(true);
    });

    it('refuses an OFF-tier tool (owner tightened it) without executing', async () => {
        const res = await run([
            { final: toolMsg('snoozeCard', { cardId: 'c1', hours: 1 }) },
            { final: textMsg('ok') },
        ], { ownerConfig: { policy: { snoozeCard: 'off' } } });
        expect(res.paused).toBe(false);
        const toolResults = res.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : []))
            .filter((b) => b.type === 'tool_result');
        expect(toolResults[0].is_error).toBe(true);
        expect(db._dump().ross && db._dump().ross.v2Snoozes).toBeUndefined(); // not executed
        expect(res.rounds).toBe(2);
    });

    it('accumulates usage across multiple round-trips', async () => {
        const res = await run([
            { final: toolMsg('snoozeCard', { cardId: 'c1', hours: 2 }) },
            { final: textMsg('done') },
        ]);
        // two round-trips, each carrying USAGE → summed then mapped
        expect(res.units).toEqual({ inputTokens: 20, outputTokens: 100, cacheWriteTokens: 400, cacheReadTokens: 2000 });
    });

    it('caps at maxTurns even if the model keeps requesting tools (no runaway)', async () => {
        // every scripted turn requests a tool; loop must stop at maxTurns.
        const scripts = Array.from({ length: 10 }, (_, i) => ({ final: toolMsg('snoozeCard', { cardId: `c${i}`, hours: 1 }, `toolu_${i}`) }));
        const res = await run(scripts, { maxTurns: 2 });
        expect(res.rounds).toBe(2);
    });

    it('a tool execution error becomes an is_error tool_result and the loop continues', async () => {
        const res = await run([
            { final: toolMsg('snoozeCard', { cardId: 'c1', hours: -5 }) }, // invalid hours → adapter throws
            { final: textMsg('recovered') },
        ]);
        const toolResults = res.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : []))
            .filter((b) => b.type === 'tool_result');
        expect(toolResults[0].is_error).toBe(true);
        expect(res.assistantBlocks).toEqual([{ type: 'text', text: 'recovered' }]);
    });
});

// ---------------------------------------------------------------------------
describe('runChatRequest (orchestration)', () => {
    const PRICE = {
        markup: 1.30,
        models: { 'claude-sonnet-4-6': { usdPerMtokInput: 3, usdPerMtokOutput: 15, cacheWriteMult: 1.25, cacheReadMult: 0.10 } },
    };
    const ENTITLED = {
        subscriptions: { u1: { features: { rossAgent: true } } },
        users: { u1: { tier: 'all-in' } },
        billing: { priceTable: PRICE, credits: { u1: { balanceCents: 100000 } } },
    };

    // A realistic usage block so the integer-cent debit is non-zero (the shared tiny
    // USAGE rounds to 0 cents — correct for sub-cent turns, but vacuous for a debit test).
    const BIG_USAGE = { input_tokens: 5000, output_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    const bigTextMsg = (text) => ({ content: [{ type: 'text', text }], usage: BIG_USAGE, stop_reason: 'end_turn' });

    const ross = require('../../ross'); // confirm-tool adapters execute via ross's cores

    let db;
    let events;
    function setup(seed) {
        db = makeFakeRtdb(seed);
        rossChat.__setDbForTests(db);
        tools.__setDbForTests(db);
        execute.__setDbForTests(db);
        ledger.__setDbForTests(db);
        ross.__setDbForTests(db);
        events = [];
    }
    const emit = (e) => events.push(e);

    afterEach(() => {
        rossChat.__setDbForTests(null);
        tools.__setDbForTests(null);
        execute.__setDbForTests(null);
        ledger.__setDbForTests(null);
        ross.__setDbForTests(null);
        llmClient.__setClientForTests(null);
    });

    it('gate-blocked (unentitled): emits terminal, no LLM call, no debit, nothing persisted', async () => {
        setup({}); // no entitlement, no credit
        let streamed = false;
        llmClient.__setClientForTests({ messages: { stream: () => { streamed = true; return makeFakeStream({ final: textMsg('x') }); } } });
        const r = await rossChat.runChatRequest({ uid: 'u1', isSuperAdmin: false, message: 'hi', requestId: 'req1', emit, now: 1_700_000_000_000 });
        expect(r.terminated).toBe(true);
        expect(events.find((e) => e.type === 'terminal').reason).toBe('not-entitled');
        expect(streamed).toBe(false);              // no LLM spend
        expect(db._dump().ross).toBeUndefined();   // no thread persisted
        expect(db._dump().billing).toBeUndefined(); // no debit, no debitGuard node
    });

    it('happy text turn: streams, debits once, persists the turn, returns ids + cost', async () => {
        setup(ENTITLED);
        llmClient.__setClientForTests(scriptedClient([{ deltas: ['Hi'], final: bigTextMsg('Hello!') }]));
        const r = await rossChat.runChatRequest({ uid: 'u1', isSuperAdmin: false, message: 'howzit', requestId: 'req1', emit, now: 1_700_000_000_000 });

        expect(r.terminated).toBe(false);
        expect(r.threadId).toBeTruthy();
        expect(r.turnId).toBeTruthy();
        expect(r.costCents).toBeGreaterThan(0);
        expect(events.find((e) => e.type === 'done')).toMatchObject({ threadId: r.threadId, turnId: r.turnId });
        // debited exactly the returned cost
        expect(await ledger.getBalanceCents('u1')).toBe(100000 - r.costCents);
        // turn persisted with the user message + assistant answer
        const turn = db._dump().ross.agentChats.u1[r.threadId].turns[r.turnId];
        expect(turn).toMatchObject({ userMessage: 'howzit', costCents: r.costCents, at: 1_700_000_000_000 });
        expect(turn.assistantBlocks).toEqual([{ type: 'text', text: 'Hello!' }]);
        expect(turn.usage).toEqual(BIG_USAGE); // accumulated usage block persisted
    });

    it('continues an existing thread: prior history reaches the model, new turn appended', async () => {
        setup({
            ...ENTITLED,
            // Non-`kNNNNNN` key so the fake's push counter can't regenerate (collide with) it.
            ross: { agentChats: { u1: { TH1: { turns: { t_earlier: { userMessage: 'earlier', assistantBlocks: [{ type: 'text', text: 'prior' }] } } } } } },
        });
        let captured;
        llmClient.__setClientForTests({ messages: { stream: (p) => { captured = p; return makeFakeStream({ final: textMsg('again') }); } } });
        const r = await rossChat.runChatRequest({ uid: 'u1', isSuperAdmin: false, message: 'next', threadId: 'TH1', requestId: 'req2', emit, now: 1_700_000_000_000 });

        expect(r.threadId).toBe('TH1');
        const userContents = captured.messages.filter((m) => m.role === 'user').map((m) => m.content);
        expect(userContents).toContain('earlier'); // history included
        expect(userContents).toContain('next');     // new message last
        expect(Object.keys(db._dump().ross.agentChats.u1.TH1.turns)).toHaveLength(2);
    });

    it('same requestId twice: the loop runs again but the debit is guarded (charged once)', async () => {
        setup(ENTITLED);
        llmClient.__setClientForTests(scriptedClient([{ final: bigTextMsg('a') }, { final: bigTextMsg('b') }]));
        const r1 = await rossChat.runChatRequest({ uid: 'u1', isSuperAdmin: false, message: 'hi', requestId: 'dup', emit, now: 1_700_000_000_000 });
        const r2 = await rossChat.runChatRequest({ uid: 'u1', isSuperAdmin: false, message: 'hi2', requestId: 'dup', emit, now: 1_700_000_000_001 });
        expect(await ledger.getBalanceCents('u1')).toBe(100000 - r1.costCents); // charged once
        expect(r2.costCents).toBe(r1.costCents); // cached debit
    });

    it('super-admin with no entitlement and zero balance still completes a turn', async () => {
        setup({ billing: { priceTable: PRICE, credits: { admin1: { balanceCents: 0 } } } });
        llmClient.__setClientForTests(scriptedClient([{ final: textMsg('hi admin') }]));
        const r = await rossChat.runChatRequest({ uid: 'admin1', isSuperAdmin: true, message: 'test', requestId: 'a1', emit, now: 1_700_000_000_000 });
        expect(r.terminated).toBe(false);
        expect(events.find((e) => e.type === 'done')).toBeDefined();
    });

    it('an LLM error mid-loop still debits tokens already spent and emits error (no done) — review L-5', async () => {
        setup(ENTITLED);
        let call = 0;
        llmClient.__setClientForTests({
            messages: {
                stream: () => {
                    call += 1;
                    // round 1: a real tool_use turn (accrues BIG_USAGE, executes snoozeCard)
                    if (call === 1) {
                        return makeFakeStream({
                            final: { content: [{ type: 'tool_use', id: 't1', name: 'snoozeCard', input: { cardId: 'c1', hours: 2 } }], usage: BIG_USAGE, stop_reason: 'tool_use' },
                        });
                    }
                    // round 2: the Anthropic call throws
                    return { on() { return this; }, async finalMessage() { throw new Error('anthropic 529 overloaded'); } };
                },
            },
        });
        const r = await rossChat.runChatRequest({ uid: 'u1', isSuperAdmin: false, message: 'hi', requestId: 'err1', emit, now: 1_700_000_000_000 });

        expect(r.error).toBe(true);
        expect(events.find((e) => e.type === 'error')).toMatchObject({ code: 'agent_loop_failed' });
        expect(events.find((e) => e.type === 'done')).toBeUndefined();
        // round-1 tokens were spent at the API → still billed (no leak)
        expect(r.costCents).toBeGreaterThan(0);
        expect(await ledger.getBalanceCents('u1')).toBe(100000 - r.costCents);
        // the partial turn is persisted and flagged
        const turn = db._dump().ross.agentChats.u1[r.threadId].turns[r.turnId];
        expect(turn.error).toBe(true);
    });

    // A confirm-tier tool_use carrying realistic usage (so the Request-A debit is non-zero).
    const bigToolMsg = (name, input) => ({
        content: [{ type: 'tool_use', id: 'tu1', name, input }],
        usage: BIG_USAGE, stop_reason: 'tool_use',
    });

    it('confirm-tier tool → pauses: persists pending(+expiresAt) + flagged turn, emits confirm, debits Request A, no done', async () => {
        setup(ENTITLED);
        llmClient.__setClientForTests(scriptedClient([{ final: bigToolMsg('pauseWorkflow', { workflowId: 'wf1' }) }]));
        const r = await rossChat.runChatRequest({ uid: 'u1', isSuperAdmin: false, message: 'pause my closing checklist', requestId: 'p1', emit, now: 1_700_000_000_000 });

        expect(r).toMatchObject({ terminated: false, paused: true });
        // confirm card emitted; NO done event
        const card = events.find((e) => e.type === 'confirm');
        expect(card).toMatchObject({ turnId: r.turnId, tool: 'pauseWorkflow', expiresAt: 1_700_000_000_000 + 600000 });
        expect(card.summary).toContain('Pause workflow wf1');
        expect(events.find((e) => e.type === 'done')).toBeUndefined();
        // pending action persisted, server-keyed by turnId, with the convo for resume
        const pending = db._dump().ross.agentPending.u1[r.turnId];
        expect(pending).toMatchObject({ tool: 'pauseWorkflow', threadId: r.threadId, expiresAt: 1_700_000_000_000 + 600000 });
        expect(pending.args).toEqual({ workflowId: 'wf1' });
        expect(Array.isArray(pending.messages)).toBe(true);
        // turn persisted + flagged pending; tool NOT executed (no audit row)
        expect(db._dump().ross.agentChats.u1[r.threadId].turns[r.turnId].pending).toBe(true);
        expect(db._dump().ross.agentAudit).toBeUndefined();
        // Request A billed the tokens spent reaching the pause (abandoned-confirm billing)
        expect(r.costCents).toBeGreaterThan(0);
        expect(await ledger.getBalanceCents('u1')).toBe(100000 - r.costCents);
    });

    // --- resume (approve / decline / expiry / double / cross-user) -----------------
    const T = 1_700_000_000_000;
    const WF = { ross: { workflows: { u1: { wf1: { name: 'Closing', status: 'active' } } } } };

    // Drive a pause first (creates the pending node), returning its turnId.
    async function pauseFirst() {
        llmClient.__setClientForTests(scriptedClient([{ final: bigToolMsg('pauseWorkflow', { workflowId: 'wf1' }) }]));
        const p = await rossChat.runChatRequest({ uid: 'u1', isSuperAdmin: false, message: 'pause wf1', requestId: 'reqA', emit, now: T });
        events = []; // clear so we inspect only resume events
        return p.turnId;
    }

    it('resume approve: consumes pending, executes (confirmedBy audit), continues, debits Request B, done', async () => {
        setup({ ...ENTITLED, ...WF });
        const turnId = await pauseFirst();
        llmClient.__setClientForTests(scriptedClient([{ final: bigTextMsg('Done — paused it.') }]));
        const r = await rossChat.resumeChatRequest({ uid: 'u1', isSuperAdmin: false, resumeTurnId: turnId, decision: 'approve', requestId: 'reqB', emit, now: T + 1000 });

        expect(r.decision).toBe('approve');
        expect(db._dump().ross.workflows.u1.wf1.status).toBe('paused');          // executed
        const audit = Object.values(db._dump().ross.agentAudit.u1[turnId]);
        expect(audit[0]).toMatchObject({ tool: 'pauseWorkflow', via: 'confirmed:u1' }); // audited as confirmed
        expect(db._dump().ross.agentPending?.u1?.[turnId]).toBeUndefined();        // consumed
        expect(events.find((e) => e.type === 'done')).toBeDefined();
        expect(r.costCents).toBeGreaterThan(0);                                    // Request B debited
    });

    it('resume decline: no execution, declined tool_result, continues, done', async () => {
        setup({ ...ENTITLED, ...WF });
        const turnId = await pauseFirst();
        llmClient.__setClientForTests(scriptedClient([{ final: bigTextMsg('Okay, left it running.') }]));
        const r = await rossChat.resumeChatRequest({ uid: 'u1', isSuperAdmin: false, resumeTurnId: turnId, decision: 'decline', requestId: 'reqB', emit, now: T + 1000 });

        expect(r.decision).toBe('decline');
        expect(db._dump().ross.workflows.u1.wf1.status).toBe('active');  // NOT paused
        expect(db._dump().ross.agentAudit).toBeUndefined();              // nothing executed
        expect(events.find((e) => e.type === 'done')).toBeDefined();
    });

    it('resume after expiry → terminal expired, no execution, no consume-then-run', async () => {
        setup({ ...ENTITLED, ...WF });
        const turnId = await pauseFirst();
        const r = await rossChat.resumeChatRequest({ uid: 'u1', isSuperAdmin: false, resumeTurnId: turnId, decision: 'approve', requestId: 'reqB', emit, now: T + 11 * 60 * 1000 });
        expect(r).toMatchObject({ terminated: true, reason: 'expired' });
        expect(db._dump().ross.workflows.u1.wf1.status).toBe('active');
        expect(events.find((e) => e.type === 'terminal').reason).toBe('expired');
    });

    it('double resume → second blocked by the one-time-consume (tool fires once)', async () => {
        setup({ ...ENTITLED, ...WF });
        const turnId = await pauseFirst();
        llmClient.__setClientForTests(scriptedClient([{ final: bigTextMsg('done') }, { final: bigTextMsg('again') }]));
        await rossChat.resumeChatRequest({ uid: 'u1', isSuperAdmin: false, resumeTurnId: turnId, decision: 'approve', requestId: 'rb1', emit, now: T + 1 });
        const r2 = await rossChat.resumeChatRequest({ uid: 'u1', isSuperAdmin: false, resumeTurnId: turnId, decision: 'approve', requestId: 'rb2', emit, now: T + 2 });
        // The pending node is consumed by the first resume, so the second is blocked
        // (sequentially: not-found; under a true concurrent race: already-handled).
        expect(r2.terminated).toBe(true);
        expect(['not-found', 'already-handled']).toContain(r2.reason);
        // the tool fired exactly once
        expect(Object.keys(db._dump().ross.agentAudit.u1[turnId])).toHaveLength(1);
    });

    it('cross-user resume → not found (pending is uid-scoped, never trusts a client uid)', async () => {
        setup({ ...ENTITLED, ...WF });
        const turnId = await pauseFirst();
        const r = await rossChat.resumeChatRequest({ uid: 'attacker', isSuperAdmin: false, resumeTurnId: turnId, decision: 'approve', requestId: 'reqB', emit, now: T + 1 });
        expect(r).toMatchObject({ terminated: true, reason: 'not-found' });
        expect(db._dump().ross.workflows.u1.wf1.status).toBe('active'); // u1's workflow untouched
    });
});
