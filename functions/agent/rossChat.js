'use strict';

/**
 * Phase 7 ② askRoss Agent — `rossChat`, the v1 reactive engine (slice 3).
 *
 * A raw-Messages-API streaming agent turn: four pre-flight gates → cached two-block
 * system prompt + bounded history → streaming Sonnet loop executing the READY auto
 * tools via execute.js → single ledger debit → SSE. It OWNS the loop (§1.1) so it can
 * gate before the first token and debit per HTTP response.
 *
 * This file (Phase 3) holds the pure-ish helpers (runGates / buildOwnerContext /
 * buildHistoryMessages). The streaming `onRequest` handler is added in Phase 4.
 *
 * Spec: docs/plans/2026-05-31-askross-agent-design.md §2, §2.1, §5, §7, §9, §10 slice 3
 */

const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const ledger = require('../billing/ledger');
const { corsOptions } = require('../cors-allowlist');
const cors = require('cors')(corsOptions);
const {
    TIER, MODE, agentKillSwitchPath, agentEnabledPath, agentConfigPath,
} = require('./constants');

// Anthropic key — provisioned via `firebase functions:secrets:set ANTHROPIC_API_KEY`
// BEFORE any deploy (an unprovisioned defineSecret blocks ALL function deploys).
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const MAX_MESSAGE_CHARS = 4000;

// --- DB seam (matches billing/agent/entitlements) -----------------------------
let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
/** Test-only: inject an in-memory RTDB fake. */
function __setDbForTests(fake) { _db = fake; }

// --- terminal-state messages (rendered as friendly inline banners client-side) -
const TERMINAL_MESSAGES = Object.freeze({
    killswitch: 'Ross is temporarily unavailable. Please try again shortly.',
    'owner-disabled': 'Ross is switched off for your account — an admin can re-enable it.',
    entitlement: "Ross AI isn't part of your current plan. Ask an admin to add it.",
    balance: "You're out of Ross credit. Ask an admin to top up to keep using Ross.",
});

/**
 * The four pre-flight gates (§2 step 1). No LLM call, no charge if any fails.
 *   (a) global kill switch  → terminal 'disabled'
 *   (b) per-owner enable     → terminal 'disabled'  (only an explicit `false` blocks)
 *   (c) rossAgent entitlement → terminal 'not-entitled'   [skipped for super-admins]
 *   (d) ledger balance        → terminal 'no-credit'      [skipped for super-admins]
 * Super-admins skip (c)+(d) so Sparks staff can test without comping themselves credit;
 * they are STILL subject to the global kill switch. Non-super admins + owners run all four.
 *
 * @param {{uid:string, isSuperAdmin:boolean}} args
 * @returns {Promise<{ok:true}|{ok:false, terminal:string, gate:string, message:string}>}
 */
async function runGates({ uid, isSuperAdmin }) {
    const fail = (terminal, gate) => ({ ok: false, terminal, gate, message: TERMINAL_MESSAGES[gate] });

    // (a) global kill switch — applies to everyone, including super-admins.
    const ks = await getDb().ref(agentKillSwitchPath()).once('value');
    if (ks.val() === true) return fail('disabled', 'killswitch');

    // (b) per-owner enable — only an explicit `false` disables.
    const enabled = await getDb().ref(agentEnabledPath(uid)).once('value');
    if (enabled.val() === false) return fail('disabled', 'owner-disabled');

    // Super-admin short-circuit for the entitlement + balance gates.
    if (isSuperAdmin) return { ok: true };

    // (c) rossAgent entitlement (materialized by the ④a resolver).
    const feat = await getDb().ref(`subscriptions/${uid}/features/rossAgent`).once('value');
    if (feat.val() !== true) return fail('not-entitled', 'entitlement');

    // (d) prepaid balance above the floor.
    const funded = await ledger.checkBalance(uid);
    if (!funded) return fail('no-credit', 'balance');

    return { ok: true };
}

/**
 * Build the cached owner-context block (prompt block 2, §5). PURE — the handler
 * fetches the inputs (digest via the getWorkflowDigest adapter, tier, locations) and
 * this only formats them, so the cache key stays deterministic within a session.
 *
 * @param {{dateStr:string, tier?:string, locationNames?:string[], digest?:object}} opts
 * @returns {string}
 */
function buildOwnerContext({ dateStr, tier, locationNames, digest } = {}) {
    const d = digest || {};
    const overdue = Array.isArray(d.overdue) ? d.overdue : [];
    const today = Array.isArray(d.today) ? d.today : [];
    const locs = Array.isArray(locationNames) ? locationNames : [];

    const lines = [
        'Owner context (read-only snapshot):',
        `- Today: ${dateStr} (South Africa, DD/MM/YYYY).`,
        `- Subscription tier: ${tier || 'unknown'}.`,
        `- Locations: ${locs.length ? locs.join(', ') : '(none on file)'}.`,
        `- Workflows: ${d.activeWorkflowCount || 0} active — ${overdue.length} overdue, ${today.length} due today.`,
    ];
    if (overdue.length) {
        lines.push(`- Overdue: ${overdue.slice(0, 5)
            .map((o) => `${o.name} @ ${o.locationName} (${o.daysLate}d late)`).join('; ')}.`);
    }
    if (today.length) {
        lines.push(`- Due today: ${today.slice(0, 5)
            .map((t) => `${t.name} @ ${t.locationName}`).join('; ')}.`);
    }
    if (d.upcoming) {
        lines.push(`- Next up: ${d.upcoming.name} @ ${d.upcoming.locationName} (${d.upcoming.nextDueDate}).`);
    }
    return lines.join('\n');
}

/**
 * Reconstruct the Anthropic `messages` suffix from stored thread turns (§7, D5). PURE.
 * Takes the raw `ross/agentChats/{uid}/{threadId}/turns` object (keyed by push id),
 * keeps the last `maxTurns`, trims oldest-first to a ~token char budget, and appends
 * the new user message. Older turns are dropped (no summarisation — that's v2).
 *
 * Each stored turn: `{ userMessage:string, assistantBlocks:Array<contentBlock> }`.
 * A turn missing assistantBlocks (e.g. a terminal/never-answered turn) contributes
 * only its user message.
 *
 * @param {object|null} turnsObj
 * @param {string} newMessage
 * @param {{maxTurns?:number, maxChars?:number}} [opts]
 * @returns {Array<{role:string, content:(string|Array)}>}
 */
function buildHistoryMessages(turnsObj, newMessage, { maxTurns = 10, maxChars = 16000 } = {}) {
    const turns = (turnsObj && typeof turnsObj === 'object')
        ? Object.keys(turnsObj).sort().map((k) => turnsObj[k]).filter(Boolean)
        : [];

    let recent = turns.slice(-maxTurns);
    const sizeOf = (t) => JSON.stringify(t).length;
    let total = recent.reduce((s, t) => s + sizeOf(t), 0);
    while (recent.length > 1 && total > maxChars) {
        total -= sizeOf(recent[0]);
        recent = recent.slice(1);
    }

    const messages = [];
    for (const t of recent) {
        if (typeof t.userMessage === 'string' && t.userMessage.length) {
            messages.push({ role: 'user', content: t.userMessage });
        }
        if (Array.isArray(t.assistantBlocks) && t.assistantBlocks.length) {
            messages.push({ role: 'assistant', content: t.assistantBlocks });
        }
    }
    messages.push({ role: 'user', content: newMessage });
    return messages;
}

// --- the agent loop (§2 step 3) -----------------------------------------------

/** A tool_result block carrying an error/refusal the model can read and recover from. */
function errorResult(toolUseId, payload) {
    return { type: 'tool_result', tool_use_id: toolUseId, content: JSON.stringify(payload), is_error: true };
}

/**
 * Run the reactive streaming agent loop (§2 step 3). OWNS the loop (§1.1): each
 * round-trip streams assistant text to `emit`, then for every tool_use block it
 * checks policy and either auto-executes (via the audit-wrapped executeTool) and feeds
 * a tool_result, or — for any non-`auto` tool (none are exposed in slice 3, but defend
 * regardless) — feeds a refusal tool_result without executing. Usage is accumulated per
 * round-trip from the complete `usage` block and returned both raw and ledger-mapped;
 * the caller does the single debit. Bounded by `maxTurns` to prevent runaway spend.
 *
 * PURE of HTTP/SSE: `emit(event)` is the only output side-channel, so this is fully
 * unit-testable with a fake client + fake-rtdb. Does NOT mutate the caller's `messages`.
 *
 * @param {{ctx:object, system:Array, tools:Array, messages:Array, ownerConfig?:object,
 *          emit:function, maxTurns?:number}} opts
 * @returns {Promise<{assistantBlocks:Array, usage:object, units:object, rounds:number, messages:Array}>}
 */
async function runAgentLoop({ ctx, system, tools, messages, ownerConfig, emit, maxTurns = 5 }) {
    const { effectivePolicy } = require('./policy');
    const { executeTool } = require('./execute');
    const { REGISTRY } = require('./tools');
    const { streamTurn, toLedgerUnits, MODELS } = require('./llm-client');

    const convo = messages.slice();
    const acc = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    let assistantBlocks = [];
    let rounds = 0;

    for (let i = 0; i < maxTurns; i++) {
        rounds++;
        const res = await streamTurn({
            model: MODELS.AGENT,
            system,
            tools,
            messages: convo,
            maxTokens: 4096,
            onText: (delta) => emit({ type: 'text', delta }),
        });

        const u = res.usage || {};
        acc.input_tokens += u.input_tokens || 0;
        acc.output_tokens += u.output_tokens || 0;
        acc.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
        acc.cache_read_input_tokens += u.cache_read_input_tokens || 0;

        assistantBlocks = res.content || [];
        const toolUses = assistantBlocks.filter((b) => b && b.type === 'tool_use');
        if (toolUses.length === 0) break; // no tool calls → the turn is done

        convo.push({ role: 'assistant', content: assistantBlocks });

        const toolResults = [];
        for (const tu of toolUses) {
            const def = REGISTRY[tu.name];
            if (!def) {
                toolResults.push(errorResult(tu.id, { error: `Unknown tool '${tu.name}'.` }));
                continue;
            }
            const policy = effectivePolicy(tu.name, def, ownerConfig);
            if (policy !== TIER.AUTO) {
                // confirm/off — slice 3 exposes no such tools, but a model could still
                // emit one; refuse server-side rather than execute (confirm-flow = slice 4).
                emit({ type: 'action', tool: tu.name, refused: true, text: `${tu.name} needs the owner` });
                toolResults.push(errorResult(tu.id, { refused: `'${tu.name}' needs the owner to confirm — not available to Ross here.` }));
                continue;
            }
            try {
                const out = await executeTool(ctx, tu.name, tu.input || {});
                emit({ type: 'action', tool: tu.name, text: `✓ ${tu.name}` });
                toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
            } catch (err) {
                toolResults.push(errorResult(tu.id, { error: err.message }));
            }
        }
        convo.push({ role: 'user', content: toolResults });
    }

    return { assistantBlocks, usage: acc, units: toLedgerUnits(acc), rounds, messages: convo };
}

// --- orchestration (one chat turn, transport-agnostic) ------------------------

/** Format an epoch-ms instant as a South African date (SAST = UTC+2, no DST). */
function formatSADate(now) {
    const d = new Date(now + 2 * 60 * 60 * 1000);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Distinct location names present in the digest (covers locations that have workflows). */
function deriveLocationNames(digest) {
    const names = new Set();
    for (const bucket of ['overdue', 'today', 'recentCompletions']) {
        (digest[bucket] || []).forEach((e) => { if (e.locationName) names.add(e.locationName); });
    }
    if (digest.upcoming && digest.upcoming.locationName) names.add(digest.upcoming.locationName);
    return [...names];
}

/**
 * Orchestrate ONE chat turn (§2), transport-agnostic: gates → owner context + bounded
 * history → agent loop → single ledger debit → persist → done. `emit(event)` is the
 * only output channel (the SSE handler wires it to res.write); fully unit-testable.
 *
 * `now` MUST be a server timestamp (the handler passes Date.now()) — never client-supplied
 * (it stamps audit rows + snooze windows; a spoofed value would forge them).
 *
 * @returns {Promise<{terminated:true}|{terminated:false, threadId, turnId, costCents}>}
 */
async function runChatRequest({ uid, isSuperAdmin, message, threadId, clientToday, requestId, emit, now }) {
    // 1. Pre-flight gates (no LLM spend if any fail).
    const gates = await runGates({ uid, isSuperAdmin });
    if (!gates.ok) {
        emit({ type: 'terminal', reason: gates.terminal, gate: gates.gate, message: gates.message });
        return { terminated: true };
    }

    const { REGISTRY, toAnthropicTools, catalogForPrompt } = require('./tools');
    const { systemBlocks } = require('./prompt');
    const { MODELS } = require('./llm-client');
    const { SERVICES } = require('../billing/constants');

    // 2. Thread + turn ids (server-generated).
    const thread = threadId || getDb().ref(`ross/agentChats/${uid}`).push().key;
    const turnId = getDb().ref(`ross/agentChats/${uid}/${thread}/turns`).push().key;
    const ctx = { uid, turnId, turnSource: 'chat', now };

    // 3. Owner config (policy overrides) + tier.
    const cfgSnap = await getDb().ref(agentConfigPath(uid)).once('value');
    const ownerConfig = cfgSnap.val() || null;
    const tierSnap = await getDb().ref(`users/${uid}/tier`).once('value');
    const tier = typeof tierSnap.val() === 'string' ? tierSnap.val() : null;

    // 4. Owner context (digest via the READ adapter directly — not an audited action).
    const digest = await REGISTRY.getWorkflowDigest.run(ctx, { clientToday });
    const ownerContext = buildOwnerContext({
        dateStr: formatSADate(now), tier, locationNames: deriveLocationNames(digest), digest,
    });
    const system = systemBlocks({ mode: MODE.CHAT, tools: catalogForPrompt(), ownerContext });

    // 5. Bounded history → messages.
    const turnsSnap = await getDb().ref(`ross/agentChats/${uid}/${thread}/turns`).once('value');
    const messages = buildHistoryMessages(turnsSnap.val(), message);

    // 6. The streaming agent loop.
    const loop = await runAgentLoop({ ctx, system, tools: toAnthropicTools(), messages, ownerConfig, emit });

    // 7. Single debit (idempotent on requestId — §2.1 point 3).
    const debit = await ledger.recordUsageAndDebit({
        uid, service: SERVICES.ASK_ROSS, model: MODELS.AGENT,
        units: loop.units, meta: { turnId, turnSource: 'chat' }, requestId,
    });

    // 8. Persist the turn (full assistant content array → resumable in slice 4).
    await getDb().ref(`ross/agentChats/${uid}/${thread}/turns/${turnId}`).set({
        userMessage: message,
        assistantBlocks: loop.assistantBlocks,
        usage: loop.usage,
        costCents: debit.costCents,
        at: now,
    });

    emit({ type: 'done', threadId: thread, turnId, costCents: debit.costCents });
    return { terminated: false, threadId: thread, turnId, costCents: debit.costCents };
}

// --- the Cloud Function (thin SSE shell; orchestration lives in runChatRequest) -

/**
 * `rossChat` — onRequest SSE endpoint (§2, §10 slice 3). Thin: method/body validation,
 * rossAgent-aware auth, secret-backed client config, SSE plumbing → runChatRequest.
 * The HTTP/SSE/secret bits are deploy-smoke-tested (not unit-tested); the orchestration
 * is covered by the runChatRequest unit tests.
 */
const rossChat = onRequest({ secrets: [ANTHROPIC_API_KEY] }, (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const { message, threadId, clientToday } = req.body || {};
    if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_CHARS) {
        res.status(400).json({ error: `message must be a non-empty string up to ${MAX_MESSAGE_CHARS} chars` });
        return;
    }

    // rossAgent-aware auth (recognises features.rossAgent — review #4).
    let principal;
    try {
        const { verifyAuthToken, verifyRossAgentAccess } = require('../ross');
        const decoded = await verifyAuthToken(req);
        principal = await verifyRossAgentAccess(decoded);
    } catch (err) {
        const code = /authorization|token/i.test(err.message || '') ? 401 : 403;
        res.status(code).json({ error: err.message });
        return;
    }

    // Configure the LLM client from the secret (never in code/client).
    const { configureClient } = require('./llm-client');
    configureClient(process.env.ANTHROPIC_API_KEY);

    // SSE headers + emitter.
    res.set('Content-Type', 'text/event-stream');
    res.set('Cache-Control', 'no-cache');
    res.set('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    const emit = (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (typeof res.flush === 'function') res.flush();
    };

    // Request-scoped id for the idempotent debit guard (one per Cloud Run invocation).
    const requestId = req.headers['function-execution-id'] || req.headers['x-cloud-trace-context'] || `${principal.uid}:${Date.now()}`;

    try {
        await runChatRequest({
            uid: principal.uid,
            isSuperAdmin: principal.isSuperAdmin,
            message,
            threadId,
            clientToday,
            requestId,
            emit,
            now: Date.now(), // server-authoritative — never client-supplied
        });
    } catch (err) {
        console.error('[rossChat] turn failed:', err);
        emit({ type: 'error', message: 'Ross hit a problem completing that turn. Please try again.' });
    }
    res.end();
}));

module.exports = {
    rossChat,
    runChatRequest,
    runGates,
    buildOwnerContext,
    buildHistoryMessages,
    runAgentLoop,
    formatSADate,
    deriveLocationNames,
    TERMINAL_MESSAGES,
    __setDbForTests,
};
