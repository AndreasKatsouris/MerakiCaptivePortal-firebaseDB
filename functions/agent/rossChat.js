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
const { agentKillSwitchPath, agentEnabledPath } = require('./constants');

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

module.exports = {
    runGates,
    buildOwnerContext,
    buildHistoryMessages,
    TERMINAL_MESSAGES,
    __setDbForTests,
};
