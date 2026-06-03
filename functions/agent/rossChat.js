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
const ledger = require('../billing/ledger');
const { TIER, agentKillSwitchPath, agentEnabledPath } = require('./constants');

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

module.exports = {
    runGates,
    buildOwnerContext,
    buildHistoryMessages,
    runAgentLoop,
    TERMINAL_MESSAGES,
    __setDbForTests,
};
