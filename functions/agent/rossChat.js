'use strict';

/**
 * Phase 7 ② askRoss Agent — `rossChat`, the v1 reactive engine (slice 3).
 *
 * A raw-Messages-API streaming agent turn: four pre-flight gates → cached two-block
 * system prompt + bounded history → streaming Sonnet loop executing the READY auto
 * tools via execute.js → single ledger debit → SSE. It OWNS the loop (§1.1) so it can
 * gate before the first token and debit per HTTP response.
 *
 * Holds the SSE `onRequest` handler, the `runChatRequest` orchestration, the
 * `runAgentLoop` streaming loop, and the pure helpers (runGates / buildOwnerContext /
 * buildHistoryMessages). Confirm-flow pause/resume is slice 4.
 *
 * Spec: docs/plans/2026-05-31-askross-agent-design.md §2, §2.1, §5, §7, §9, §10 slice 3
 */

const admin = require('firebase-admin');
const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const ledger = require('../billing/ledger');
const { corsOptions } = require('../cors-allowlist');
const cors = require('cors')(corsOptions);
const {
    TIER, MODE, agentKillSwitchPath, agentEnabledPath, agentConfigPath, agentPendingPath, PENDING_TTL_MS,
} = require('./constants');

// Anthropic key — provisioned via `firebase functions:secrets:set ANTHROPIC_API_KEY`
// BEFORE any deploy (an unprovisioned defineSecret blocks ALL function deploys).
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const MAX_MESSAGE_CHARS = 4000;
const MAX_AGENT_ROUNDS = 5;      // hard cap on tool round-trips per turn (spend guard, §2.1)
const MAX_OUTPUT_TOKENS = 4096;  // per round-trip output cap
const MAX_PENDING_CHARS = 64000; // cap on a persisted pending-action payload (review M-2)

/** True if a pending action's conversation is too large to safely persist (review M-2). */
function pendingTooLarge(messages) {
    try { return JSON.stringify(messages).length > MAX_PENDING_CHARS; }
    catch { return true; }
}
const THREAD_ID_RE = /^[a-zA-Z0-9_-]+$/;   // RTDB-key-safe (no `/ . # $ [ ]`)
const CLIENT_TODAY_RE = /^\d{4}-\d{2}-\d{2}$/;

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
 * BEST-EFFORT ON LLM ERROR: if a streamTurn (Anthropic API) call throws mid-loop, the
 * loop stops and returns what it accumulated with `error` set — it does NOT throw — so
 * the caller can still debit the tokens already spent in completed round-trips (a thrown
 * loop would leak that spend, security review L-5). Tool-execution errors do NOT stop the
 * loop (they become is_error tool_results the model can recover from).
 *
 * @param {{ctx:object, system:Array, tools:Array, messages:Array, ownerConfig?:object,
 *          emit:function, maxTurns?:number}} opts
 * @returns {Promise<{assistantBlocks:Array, usage:object, units:object, rounds:number, messages:Array, error:Error|null}>}
 */
async function runAgentLoop({ ctx, system, tools, messages, ownerConfig, emit, maxTurns = MAX_AGENT_ROUNDS }) {
    const { effectivePolicy } = require('./policy');
    const { executeTool } = require('./execute');
    const { REGISTRY } = require('./tools');
    const { streamTurn, toLedgerUnits, MODELS } = require('./llm-client');

    const convo = messages.slice();
    const acc = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    let assistantBlocks = [];
    let rounds = 0;
    let error = null;

    for (let i = 0; i < maxTurns; i++) {
        rounds++;
        let res;
        try {
            res = await streamTurn({
                model: MODELS.AGENT,
                system,
                tools,
                messages: convo,
                maxTokens: MAX_OUTPUT_TOKENS,
                onText: (delta) => emit({ type: 'text', delta }),
            });
        } catch (err) {
            // LLM API failure: stop, but keep `acc` so the caller debits spent tokens.
            error = err;
            break;
        }

        const u = res.usage || {};
        acc.input_tokens += u.input_tokens || 0;
        acc.output_tokens += u.output_tokens || 0;
        acc.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
        acc.cache_read_input_tokens += u.cache_read_input_tokens || 0;

        assistantBlocks = res.content || [];
        const toolUses = assistantBlocks.filter((b) => b && b.type === 'tool_use');
        if (toolUses.length === 0) break; // no tool calls → the turn is done

        // Confirm-tier PAUSE (slice 4, §2): if any tool needs the owner, pause on the
        // FIRST one. The persisted assistant turn is trimmed to its text blocks + that
        // single confirm tool_use (any other tool_uses in the same turn are dropped — the
        // model re-requests them after the owner resolves; this keeps every tool_use in the
        // persisted turn resolvable on resume). The caller persists the pending action and
        // debits the tokens spent so far (§2.1 pt 2 — an abandoned confirm is still billed).
        const firstConfirm = toolUses.find((tu) => {
            const d = REGISTRY[tu.name];
            return d && effectivePolicy(tu.name, d, ownerConfig) === TIER.CONFIRM;
        });
        if (firstConfirm) {
            const trimmed = assistantBlocks.filter((b) => b.type !== 'tool_use' || b.id === firstConfirm.id);
            convo.push({ role: 'assistant', content: trimmed });
            return {
                paused: true,
                pendingTool: { name: firstConfirm.name, args: firstConfirm.input || {}, toolUseId: firstConfirm.id },
                assistantBlocks, usage: acc, units: toLedgerUnits(acc), rounds, messages: convo, error: null,
            };
        }

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
                // off-tier (owner tightened this tool to off; confirm is handled above) → refuse.
                emit({ type: 'action', tool: tu.name, status: 'refused' });
                toolResults.push(errorResult(tu.id, { refused: `'${tu.name}' is switched off for Ross — that one stays with you.` }));
                continue;
            }
            try {
                const out = await executeTool(ctx, tu.name, tu.input || {});
                emit({ type: 'action', tool: tu.name, status: 'done' });
                toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
            } catch (err) {
                toolResults.push(errorResult(tu.id, { error: err.message }));
            }
        }
        convo.push({ role: 'user', content: toolResults });
    }

    return { paused: false, assistantBlocks, usage: acc, units: toLedgerUnits(acc), rounds, messages: convo, error };
}

// --- orchestration (one chat turn, transport-agnostic) ------------------------

/**
 * True only for a real calendar date in strict YYYY-MM-DD form (review O-2 — the bare
 * regex admits `2026-13-45`). Used only for the display date in the prompt; a malformed
 * value is harmless, but rejecting it keeps the owner-context honest.
 */
function isValidClientToday(s) {
    if (typeof s !== 'string' || !CLIENT_TODAY_RE.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Human-readable one-liner for a pending confirm action (§2 confirm-card). Pure; the
 * client renders the full args, this is the headline the owner sees on the card.
 */
function confirmSummary(tool, args = {}) {
    switch (tool) {
        case 'activateTemplate': return `Activate template ${args.templateId} at ${(args.locationIds || []).join(', ') || 'a location'}`;
        case 'createWorkflow': return `Create workflow “${args.name}” (${args.category}/${args.recurrence})`;
        case 'editWorkflow': return `Edit workflow ${args.workflowId}`;
        case 'pauseWorkflow': return `Pause workflow ${args.workflowId}`;
        default: return `Run ${tool}`;
    }
}

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
 * Build the cached system blocks for an owner: digest (via the read adapter) + tier +
 * locations + SA date. Shared by runChatRequest and resumeChatRequest so the prompt is
 * identical across a turn and its resume continuation.
 */
async function buildSystemForOwner(ctx, clientToday) {
    const { REGISTRY, catalogForPrompt } = require('./tools');
    const { systemBlocks } = require('./prompt');
    const tierSnap = await getDb().ref(`users/${ctx.uid}/tier`).once('value');
    const tier = typeof tierSnap.val() === 'string' ? tierSnap.val() : null;
    const digest = await REGISTRY.getWorkflowDigest.run(ctx, { clientToday });
    const ownerContext = buildOwnerContext({
        dateStr: formatSADate(ctx.now), tier, locationNames: deriveLocationNames(digest), digest,
    });
    return systemBlocks({ mode: MODE.CHAT, tools: catalogForPrompt(), ownerContext });
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

    const { toAnthropicTools } = require('./tools');
    const { MODELS } = require('./llm-client');
    const { SERVICES } = require('../billing/constants');

    // 2. Thread + turn ids (server-generated).
    const thread = threadId || getDb().ref(`ross/agentChats/${uid}`).push().key;
    const turnId = getDb().ref(`ross/agentChats/${uid}/${thread}/turns`).push().key;
    // isSuperAdmin flows into the confirm-tier adapters' gate checks (tier/cap bypass).
    const ctx = { uid, isSuperAdmin, turnId, turnSource: 'chat', now };

    // 3. Owner config (policy overrides) + 4. cached system blocks (digest/tier/locations).
    const cfgSnap = await getDb().ref(agentConfigPath(uid)).once('value');
    const ownerConfig = cfgSnap.val() || null;
    const system = await buildSystemForOwner(ctx, clientToday);

    // 5. Bounded history → messages.
    const turnsSnap = await getDb().ref(`ross/agentChats/${uid}/${thread}/turns`).once('value');
    const messages = buildHistoryMessages(turnsSnap.val(), message);

    // 6. The streaming agent loop (best-effort — never throws on an LLM error).
    const loop = await runAgentLoop({ ctx, system, tools: toAnthropicTools(), messages, ownerConfig, emit });

    // 7. Single debit (idempotent on requestId — §2.1 point 3). Runs even if the loop
    //    errored mid-way, so tokens already spent at the API are still billed (review L-5).
    const debit = await ledger.recordUsageAndDebit({
        uid, service: SERVICES.ASK_ROSS, model: MODELS.AGENT,
        units: loop.units, meta: { turnId, turnSource: 'chat' }, requestId,
    });

    // 8. Persist the turn (full assistant content array → resumable on confirm).
    await getDb().ref(`ross/agentChats/${uid}/${thread}/turns/${turnId}`).set({
        userMessage: message,
        assistantBlocks: loop.assistantBlocks,
        usage: loop.usage,
        costCents: debit.costCents,
        at: now,
        ...(loop.paused ? { pending: true } : {}),
        ...(loop.error ? { error: true } : {}),
    });

    // 9a. PAUSE (§2 confirm-flow): persist the pending action (server-keyed by turnId,
    //     with an expiry) + emit a confirm card. The owner's resume — a SECOND request —
    //     executes or declines it. The Request-A debit above already billed the tokens
    //     spent reaching the pause (§2.1 pt 2), so an abandoned confirm is never free.
    if (loop.paused) {
        const { name, args, toolUseId } = loop.pendingTool;
        if (pendingTooLarge(loop.messages)) {
            emit({ type: 'terminal', reason: 'too-long', message: 'That conversation got too long to hold for confirmation — start a fresh request.' });
            return { terminated: false, threadId: thread, turnId, costCents: debit.costCents };
        }
        const expiresAt = now + PENDING_TTL_MS;
        await getDb().ref(agentPendingPath(uid, turnId)).set({
            tool: name, args, toolUseId, messages: loop.messages, threadId: thread,
            createdAt: now, expiresAt,
        });
        emit({ type: 'confirm', turnId, tool: name, summary: confirmSummary(name, args), args, expiresAt });
        return { terminated: false, paused: true, threadId: thread, turnId, costCents: debit.costCents };
    }

    if (loop.error) {
        console.error('[rossChat] agent loop failed mid-turn:', loop.error && loop.error.message);
        emit({ type: 'error', code: 'agent_loop_failed', message: 'Ross hit a problem mid-answer. Please try again.' });
        return { terminated: false, threadId: thread, turnId, costCents: debit.costCents, error: true };
    }

    emit({ type: 'done', threadId: thread, turnId, costCents: debit.costCents });
    return { terminated: false, threadId: thread, turnId, costCents: debit.costCents };
}

/**
 * Resume a paused confirm action (§2 confirm-flow) — a SECOND request from the owner's
 * confirm-card click: `{ resumeTurnId, decision: 'approve'|'decline' }`. Reads the pending
 * action (scoped to the caller's own uid — no cross-tenant resume), enforces the expiry
 * (410-style terminal), atomically consumes it ONCE (a double-click can't fire twice), then
 * executes-or-declines the tool, feeds the tool_result, and continues the agent loop. Its
 * own requestId → a SEPARATE debit (Request B), linked to the turn by meta.turnId.
 *
 * `now` MUST be a server timestamp.
 */
async function resumeChatRequest({ uid, isSuperAdmin, resumeTurnId, decision, clientToday, requestId, emit, now }) {
    const pendingRef = getDb().ref(agentPendingPath(uid, resumeTurnId));
    const pending = (await pendingRef.once('value')).val();
    if (!pending) {
        emit({ type: 'terminal', reason: 'not-found', message: 'That confirmation has already been handled or no longer exists.' });
        return { terminated: true, reason: 'not-found' };
    }
    // Fail CLOSED on a missing/non-numeric expiry (review M-1) — the expiry is a security
    // control; never treat an absent value as "not expired".
    if (typeof pending.expiresAt !== 'number' || now > pending.expiresAt) {
        emit({ type: 'terminal', reason: 'expired', message: 'That confirmation expired — ask Ross again if you still want it.' });
        return { terminated: true, reason: 'expired' };
    }

    // Re-run the pre-flight gates on resume (review H-1): the kill-switch / per-owner enable
    // / rossAgent entitlement / balance must hold for the resume's tool write + continuation
    // LLM turn — not just the original turn. Checked BEFORE the consume, so a blocked resume
    // leaves the pending intact to retry once re-enabled/topped-up (until it expires).
    const gates = await runGates({ uid, isSuperAdmin });
    if (!gates.ok) {
        emit({ type: 'terminal', reason: gates.terminal, gate: gates.gate, message: gates.message });
        return { terminated: true, reason: gates.terminal };
    }

    // Atomic one-time-consume BEFORE executing: a concurrent/double resume sees a null
    // current and loses the race (priorExisted=false), so the tool fires at most once.
    let priorExisted = false;
    await pendingRef.transaction((cur) => {
        if (cur !== null && cur !== undefined) { priorExisted = true; return null; }
        priorExisted = false;
        return cur;
    });
    if (!priorExisted) {
        emit({ type: 'terminal', reason: 'already-handled', message: 'That confirmation was already handled.' });
        return { terminated: true, reason: 'already-handled' };
    }

    const ctx = { uid, isSuperAdmin, turnId: resumeTurnId, turnSource: 'chat', confirmedBy: uid, now };
    const convo = Array.isArray(pending.messages) ? pending.messages.slice() : [];
    const { executeTool } = require('./execute');

    let toolResult;
    if (decision === 'approve') {
        try {
            const out = await executeTool(ctx, pending.tool, pending.args || {});
            emit({ type: 'action', tool: pending.tool, status: 'done' });
            toolResult = { type: 'tool_result', tool_use_id: pending.toolUseId, content: JSON.stringify(out) };
        } catch (err) {
            emit({ type: 'action', tool: pending.tool, status: 'failed' });
            toolResult = errorResult(pending.toolUseId, { error: err.message });
        }
    } else {
        emit({ type: 'action', tool: pending.tool, status: 'declined' });
        toolResult = errorResult(pending.toolUseId, { declined: 'The owner declined this action.' });
    }
    convo.push({ role: 'user', content: [toolResult] });

    const { toAnthropicTools } = require('./tools');
    const { MODELS } = require('./llm-client');
    const { SERVICES } = require('../billing/constants');
    const system = await buildSystemForOwner(ctx, clientToday);
    const ownerConfig = (await getDb().ref(agentConfigPath(uid)).once('value')).val() || null;
    const loop = await runAgentLoop({ ctx, system, tools: toAnthropicTools(), messages: convo, ownerConfig, emit });

    // Request B — separate requestId (distinct from the pause's Request A, else the debit
    // guard would suppress it); linked to the turn by meta.turnId.
    const debit = await ledger.recordUsageAndDebit({
        uid, service: SERVICES.ASK_ROSS, model: MODELS.AGENT,
        units: loop.units, meta: { turnId: resumeTurnId, turnSource: 'chat' }, requestId,
    });

    const threadId = pending.threadId;
    const turnRef = getDb().ref(`ross/agentChats/${uid}/${threadId}/turns/${resumeTurnId}`);

    // The continuation may itself hit ANOTHER confirm tool → persist a fresh pending.
    if (loop.paused) {
        const { name, args, toolUseId } = loop.pendingTool;
        if (pendingTooLarge(loop.messages)) {
            await turnRef.update({ resolvedDecision: decision, resolvedAt: now, pending: null, resumeCostCents: debit.costCents });
            emit({ type: 'terminal', reason: 'too-long', message: 'That conversation got too long to continue — start a fresh request.' });
            return { terminated: false, threadId, turnId: resumeTurnId, costCents: debit.costCents };
        }
        const newTurnId = getDb().ref(`ross/agentChats/${uid}/${threadId}/turns`).push().key;
        const expiresAt = now + PENDING_TTL_MS;
        await getDb().ref(agentPendingPath(uid, newTurnId)).set({
            tool: name, args, toolUseId, messages: loop.messages, threadId, createdAt: now, expiresAt,
        });
        await turnRef.update({ resolvedDecision: decision, resolvedAt: now, pending: null, resumeCostCents: debit.costCents });
        emit({ type: 'confirm', turnId: newTurnId, tool: name, summary: confirmSummary(name, args), args, expiresAt });
        return { terminated: false, paused: true, threadId, turnId: newTurnId, costCents: debit.costCents };
    }

    await turnRef.update({
        assistantBlocks: loop.assistantBlocks,
        resolvedDecision: decision,
        resolvedAt: now,
        pending: null,
        resumeCostCents: debit.costCents,
        ...(loop.error ? { error: true } : {}),
    });

    if (loop.error) {
        console.error('[rossChat] resume continuation failed:', loop.error && loop.error.message);
        emit({ type: 'error', code: 'agent_loop_failed', message: 'Ross hit a problem finishing that. Please try again.' });
        return { terminated: false, threadId, turnId: resumeTurnId, costCents: debit.costCents, error: true };
    }

    emit({ type: 'done', threadId, turnId: resumeTurnId, costCents: debit.costCents, decision });
    return { terminated: false, threadId, turnId: resumeTurnId, costCents: debit.costCents, decision };
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
    const { message, threadId, clientToday, resumeTurnId, decision } = req.body || {};
    // Two modes on one endpoint: a fresh turn (message) or a confirm RESUME (resumeTurnId).
    const isResume = resumeTurnId !== undefined;

    if (isResume) {
        // resumeTurnId is the server-issued pending key; still validate it's key-safe before
        // interpolating into the (uid-scoped) RTDB path.
        if (typeof resumeTurnId !== 'string' || !THREAD_ID_RE.test(resumeTurnId)) {
            res.status(400).json({ error: 'resumeTurnId must be a key-safe string' });
            return;
        }
        if (decision !== 'approve' && decision !== 'decline') {
            res.status(400).json({ error: "decision must be 'approve' or 'decline'" });
            return;
        }
    } else if (typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_CHARS) {
        res.status(400).json({ error: `message must be a non-empty string up to ${MAX_MESSAGE_CHARS} chars` });
        return;
    }
    // threadId is caller-supplied and interpolated into RTDB paths — must be key-safe
    // (review H-1). uid is always server-derived, so this only scopes within the caller's
    // own subtree, but reject anything that isn't a clean push-key-shaped string.
    if (threadId !== undefined && (typeof threadId !== 'string' || !THREAD_ID_RE.test(threadId))) {
        res.status(400).json({ error: 'threadId must be a key-safe string ([A-Za-z0-9_-])' });
        return;
    }
    if (clientToday !== undefined && !isValidClientToday(clientToday)) {
        res.status(400).json({ error: 'clientToday must be a valid YYYY-MM-DD date' });
        return;
    }

    // rossAgent-aware auth (recognises features.rossAgent — review #4).
    let principal;
    try {
        const { verifyAuthToken, verifyRossAgentAccess } = require('../ross');
        const decoded = await verifyAuthToken(req);
        principal = await verifyRossAgentAccess(decoded);
    } catch (err) {
        // Normalise the client-facing message (review O-3): Firebase's verifyIdToken emits
        // verbose implementation detail ("Firebase ID token has expired…"). Log the real
        // message server-side; return a generic one.
        const isAuthErr = /authorization|token/i.test(err.message || '');
        console.warn('[rossChat] auth rejected:', err && err.message);
        res.status(isAuthErr ? 401 : 403).json({ error: isAuthErr ? 'Authentication failed' : 'Access denied' });
        return;
    }

    // Configure the LLM client from the secret (never in code/client). ensureClient reuses
    // the instance across warm invocations (review O-1) — the secret is deployment-stable.
    const { ensureClient } = require('./llm-client');
    ensureClient(process.env.ANTHROPIC_API_KEY);

    // SSE headers + emitter.
    res.set('Content-Type', 'text/event-stream');
    res.set('Cache-Control', 'no-cache');
    res.set('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    const emit = (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (typeof res.flush === 'function') res.flush();
    };

    // Server-generated id for the idempotent debit guard. NOT derived from an inbound
    // header (review L-7): a client can send arbitrary headers, so a header-keyed guard
    // would let a caller reuse an id to short-circuit the debit and get free turns. A
    // fresh per-invocation UUID is the safe choice for slice 3 (no retry path yet); a
    // genuine retry/resume in slice 4 will thread a server-issued resume token instead.
    const requestId = crypto.randomUUID();

    try {
        const now = Date.now(); // server-authoritative — never client-supplied
        if (isResume) {
            await resumeChatRequest({
                uid: principal.uid, isSuperAdmin: principal.isSuperAdmin,
                resumeTurnId, decision, clientToday, requestId, emit, now,
            });
        } else {
            await runChatRequest({
                uid: principal.uid, isSuperAdmin: principal.isSuperAdmin,
                message, threadId, clientToday, requestId, emit, now,
            });
        }
    } catch (err) {
        // NOTE: headers are already flushed, so this is an SSE error frame, not a 5xx —
        // do not try to set a status code here (it would throw post-headers-sent).
        console.error('[rossChat] turn failed:', err && err.message);
        emit({ type: 'error', code: 'internal', message: 'Ross hit a problem completing that turn. Please try again.' });
    }
    res.end();
}));

module.exports = {
    rossChat,
    runChatRequest,
    resumeChatRequest,
    confirmSummary,
    runGates,
    buildOwnerContext,
    buildHistoryMessages,
    runAgentLoop,
    formatSADate,
    deriveLocationNames,
    TERMINAL_MESSAGES,
    __setDbForTests,
};
