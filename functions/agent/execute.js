'use strict';

/**
 * Phase 7 ② askRoss Agent — audit-wrapped tool runner (§4). Shared by both engines:
 * every actual tool EXECUTION routes through executeTool so the audit trail and the
 * no-undo prev-value capture live in exactly one place.
 *
 * Policy enforcement is NOT here — it lives in the engine (reactive pauses on
 * `confirm`; proactive filters to an auto-only allowlist). executeTool assumes the
 * decision to run has already been made (§1.1).
 *
 * Spec: docs/plans/2026-05-31-askross-agent-design.md §4
 */

const admin = require('firebase-admin');
const { NO_UNDO_TOOLS, agentAuditPath } = require('./constants');
const { REGISTRY } = require('./tools');

// --- DB seam (independent of tools.js' seam; tests set both) -------------------
let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
/** Test-only: inject an in-memory RTDB fake. */
function __setDbForTests(fake) { _db = fake; }

/**
 * Capture the prior value for a no-undo tool so the audit row can restore it (§4,
 * review #9). v1: only advanceDueDate (rolls nextDueDate, no native undo).
 * @returns {object|undefined}
 */
async function snapshotPrev(uid, name, args) {
    if (name === 'advanceDueDate' && args && args.workflowId && args.locationId) {
        const snap = await getDb()
            .ref(`ross/workflows/${uid}/${args.workflowId}/locations/${args.locationId}/nextDueDate`)
            .once('value');
        return { nextDueDate: snap.val() };
    }
    return undefined;
}

/**
 * Run a tool as the owner and audit it.
 * @param {{uid:string, turnId:string, turnSource:string, confirmedBy?:string, now:number}} ctx
 * @param {string} name
 * @param {object} args
 * @returns {Promise<*>} the tool result
 */
async function executeTool(ctx, name, args) {
    const def = REGISTRY[name];
    if (!def) throw new Error(`Unknown tool '${name}'`);

    const prev = NO_UNDO_TOOLS.includes(name) ? await snapshotPrev(ctx.uid, name, args) : undefined;
    const result = await def.run(ctx, args);
    await writeAudit(ctx, name, args, result, def.tier, prev);
    return result;
}

async function writeAudit(ctx, name, args, result, tier, prev) {
    const entry = {
        tool: name,
        args: args || {},
        result: result === undefined ? null : result,
        tier,
        via: ctx.confirmedBy ? `confirmed:${ctx.confirmedBy}` : `auto:${ctx.turnSource}`,
        at: ctx.now,
    };
    if (prev !== undefined) entry.prev = prev;
    await getDb().ref(agentAuditPath(ctx.uid, ctx.turnId)).push().set(entry);
}

module.exports = {
    executeTool,
    snapshotPrev,
    __setDbForTests,
};
