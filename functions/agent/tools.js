'use strict';

/**
 * Phase 7 ② askRoss Agent — tool registry + engine projections (§3, §1.1).
 *
 * ONE Zod-typed registry, projected into BOTH engine shapes:
 *   - toAnthropicTools()  → raw Messages API `tools` (JSON-schema input_schema)
 *   - toSdkMcpServer()    → Claude Agent SDK in-process MCP server
 *
 * The Agent SDK is LAZY-required behind a test seam, so this core has ZERO hard
 * dependency on either engine (§1.1). Every adapter `run` acts AS the owner (owner
 * uid in ctx), reading/writing only owner-scoped paths via the getDb() seam.
 *
 * Slice-2 scope (§10): the 4 self-contained read/write adapters are `ready` (exposed
 * to the model); the rest are `pending` — catalog-complete but never handed to an
 * engine until their underlying logic lands. A pending tool's run throws.
 *
 * Spec: docs/plans/2026-05-31-askross-agent-design.md §3, §3.1, §1.1, §10
 */

const admin = require('firebase-admin');
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { TIER, STATUS } = require('./constants');

// --- DB seam (matches billing/entitlements pattern) ---------------------------
let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
/** Test-only: inject an in-memory RTDB fake. */
function __setDbForTests(fake) { _db = fake; }

// --- Agent SDK seam (lazy + injectable → core stays engine-dep-free) ----------
let _sdk = null;
function getSdk() {
    if (!_sdk) _sdk = require('@anthropic-ai/claude-agent-sdk');
    return _sdk;
}
/** Test-only: inject a fake { tool, createSdkMcpServer }. */
function __setSdkForTests(fake) { _sdk = fake; }

class AdapterPendingError extends Error {
    constructor(name) {
        super(`Tool adapter '${name}' is not implemented yet (status: pending)`);
        this.name = 'AdapterPendingError';
        this.code = 'ADAPTER_PENDING';
    }
}

// --- adapter-local helpers ----------------------------------------------------
// Mirror of ross.js resolveWorkflowOwner using the agent's own getDb seam, so the
// adapter is unit-testable without loading the heavy ross.js module.
async function resolveWorkflowOwner(workflowId, locationId, callerUid) {
    const indexed = await getDb().ref(`ross/workflowsByLocation/${locationId}/${workflowId}`).once('value');
    if (indexed.exists()) return indexed.val();
    const own = await getDb().ref(`ross/workflows/${callerUid}/${workflowId}/locations/${locationId}`).once('value');
    if (own.exists()) return callerUid;
    return null;
}

// --- the registry -------------------------------------------------------------
const REGISTRY = {
    // ---- READY: self-contained owner-scoped adapters (slice 2) ----------------
    getWorkflowDigest: {
        description: "Read the owner's workflow digest — overdue, due-today, recent completions, upcoming.",
        args: z.object({ clientToday: z.string().optional() }),
        tier: TIER.AUTO, ceiling: TIER.AUTO, status: STATUS.READY,
        run: async (ctx, args) => {
            const [wfSnap, runSnap] = await Promise.all([
                getDb().ref(`ross/workflows/${ctx.uid}`).once('value'),
                getDb().ref(`ross/runs/${ctx.uid}`).once('value'),
            ]);
            // Lazy require: keeps this module import-safe (ross.js registers CFs +
            // needs secrets at load). Only pulled in at actual call time.
            const { buildHomeWorkflowDigest } = require('../ross');
            return buildHomeWorkflowDigest({
                workflows: wfSnap.val() || {},
                runs: runSnap.val() || {},
                clientToday: args.clientToday,
                now: ctx.now,
            });
        },
    },

    getStaff: {
        description: 'List the staff members at a location.',
        args: z.object({ locationId: z.string() }),
        tier: TIER.AUTO, ceiling: TIER.AUTO, status: STATUS.READY,
        run: async (ctx, args) => {
            const snap = await getDb().ref(`ross/staff/${ctx.uid}/${args.locationId}`).once('value');
            const staff = snap.exists() ? Object.values(snap.val()) : [];
            staff.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
            return { staff };
        },
    },

    getRunHistory: {
        description: 'Read completed run history for a workflow at a location (most recent first).',
        args: z.object({
            workflowId: z.string(),
            locationId: z.string(),
            limit: z.number().int().positive().optional(),
        }),
        tier: TIER.AUTO, ceiling: TIER.AUTO, status: STATUS.READY,
        run: async (ctx, args) => {
            const ownerUid = await resolveWorkflowOwner(args.workflowId, args.locationId, ctx.uid);
            if (!ownerUid) return { runs: [] };
            const pageLimit = Math.min(args.limit && args.limit > 0 ? args.limit : 20, 100);
            const snap = await getDb()
                .ref(`ross/runs/${ownerUid}/${args.workflowId}/${args.locationId}`)
                .orderByChild('completedAt').limitToLast(pageLimit).once('value');
            const runs = snap.exists()
                ? Object.values(snap.val())
                    .filter((r) => r.completedAt !== null && r.completedAt !== undefined)
                    .sort((a, b) => b.completedAt - a.completedAt)
                : [];
            return { runs };
        },
    },

    snoozeCard: {
        description: 'Snooze a home insight card for the owner for a number of hours.',
        args: z.object({ cardId: z.string(), hours: z.number().positive() }),
        tier: TIER.AUTO, ceiling: TIER.AUTO, status: STATUS.READY,
        run: async (ctx, args) => {
            const safeId = String(args.cardId).replace(/[^a-zA-Z0-9_-]/g, '');
            if (!safeId) throw new Error('cardId must contain at least one safe character');
            const hrs = Number(args.hours);
            if (!Number.isFinite(hrs) || hrs <= 0 || hrs > 720) {
                throw new Error('hours must be a positive number ≤ 720 (30 days)');
            }
            const expiresAt = ctx.now + Math.round(hrs * 3600000);
            await getDb().ref(`ross/v2Snoozes/${ctx.uid}/${safeId}`).set({ expiresAt, snoozedAt: ctx.now });
            return { cardId: safeId, expiresAt };
        },
    },

    // ---- PENDING: defined for catalog completeness; run is patched below ------
    getWorkflows: pending("List the owner's workflows.",
        z.object({ locationId: z.string().optional(), category: z.string().optional(), status: z.string().optional() }),
        TIER.AUTO, TIER.AUTO),
    getReports: pending('Read workflow completion statistics.',
        z.object({ locationId: z.string().optional() }), TIER.AUTO, TIER.AUTO),
    getFoodCostSummary: pending('Read a food-cost summary for a location.',
        z.object({ locationId: z.string() }), TIER.AUTO, TIER.AUTO),
    getGuestsSummary: pending('Read aggregate guest counts for a location (no PII).',
        z.object({ locationId: z.string() }), TIER.AUTO, TIER.AUTO),
    getSalesSummary: pending('Read a sales / forecast summary for a location.',
        z.object({ locationId: z.string() }), TIER.AUTO, TIER.AUTO),
    startRun: pending('Start (or resume) a run for a workflow at a location.',
        z.object({ workflowId: z.string(), locationId: z.string() }), TIER.AUTO, TIER.AUTO),
    submitResponse: pending('Record a response to a task. Measurement-gated (§3.1): refuses temperature/number/rating/yes_no/photo and required-note tasks.',
        z.object({
            workflowId: z.string(), locationId: z.string(), runId: z.string(),
            taskId: z.string(), value: z.any(), note: z.string().optional(),
        }), TIER.AUTO, TIER.AUTO),
    advanceDueDate: pending("Roll a workflow's nextDueDate forward to the next cycle.",
        z.object({ workflowId: z.string(), locationId: z.string() }), TIER.AUTO, TIER.AUTO),
    // ---- READY confirm-tier (slice 4): pause/resume in rossChat gates execution -----
    // Each lazy-requires the owner-callable core in ross.js (shared with the CF handler),
    // passing ctx.uid + ctx.isSuperAdmin so tier/cap gates apply (super-admin bypasses).
    // A gate failure throws an Error with a `.code` → runAgentLoop turns it into an
    // is_error tool_result the model relays.
    activateTemplate: {
        description: 'Activate a template as a new workflow (entitlement-gated on maxWorkflows).',
        args: z.object({ templateId: z.string(), locationIds: z.array(z.string()), nextDueDate: z.string().optional() }),
        tier: TIER.CONFIRM, ceiling: TIER.CONFIRM, status: STATUS.READY,
        run: (ctx, args) => require('../ross').activateWorkflowAsOwner({
            uid: ctx.uid, isSuperAdmin: ctx.isSuperAdmin,
            templateId: args.templateId, locationIds: args.locationIds,
            nextDueDate: args.nextDueDate || defaultDueDate(ctx.now),
        }),
    },
    createWorkflow: {
        description: 'Create a new workflow.',
        args: z.object({
            name: z.string(), category: z.string(), recurrence: z.string(),
            locationIds: z.array(z.string()),
            nextDueDate: z.string().optional(),
            subtasks: z.array(z.object({}).passthrough()).optional(),
        }),
        tier: TIER.CONFIRM, ceiling: TIER.CONFIRM, status: STATUS.READY,
        run: (ctx, args) => require('../ross').createWorkflowAsOwner({
            uid: ctx.uid, isSuperAdmin: ctx.isSuperAdmin,
            name: args.name, category: args.category, recurrence: args.recurrence,
            locationIds: args.locationIds, nextDueDate: args.nextDueDate || defaultDueDate(ctx.now),
            subtasks: args.subtasks,
        }),
    },
    editWorkflow: {
        description: 'Edit an existing workflow (name, notifications, alert days, status).',
        args: z.object({ workflowId: z.string(), updates: z.object({}).passthrough() }),
        tier: TIER.CONFIRM, ceiling: TIER.CONFIRM, status: STATUS.READY,
        run: (ctx, args) => require('../ross').updateWorkflowAsOwner({
            uid: ctx.uid, workflowId: args.workflowId, updates: args.updates,
        }),
    },
    pauseWorkflow: {
        description: 'Pause a workflow (stops its reminders until resumed).',
        args: z.object({ workflowId: z.string() }),
        tier: TIER.CONFIRM, ceiling: TIER.CONFIRM, status: STATUS.READY,
        run: (ctx, args) => require('../ross').updateWorkflowAsOwner({
            uid: ctx.uid, workflowId: args.workflowId, updates: { status: 'paused' },
        }),
    },
};

// Default a workflow's nextDueDate to today (UTC YYYY-MM-DD) when the model omits it on
// activate/create. ctx.now is the server timestamp (never client-supplied).
function defaultDueDate(now) {
    return new Date(now || 0).toISOString().slice(0, 10);
}

function pending(description, args, tier, ceiling) {
    return { description, args, tier, ceiling, status: STATUS.PENDING };
}

// Patch pending tools with a name-aware throwing run.
for (const [name, def] of Object.entries(REGISTRY)) {
    if (def.status === STATUS.PENDING && !def.run) {
        def.run = async () => { throw new AdapterPendingError(name); };
    }
}

// --- selectors + projections --------------------------------------------------

/** Names of tools the engine may expose to the model (status === ready). */
function enabledToolNames() {
    return Object.keys(REGISTRY).filter((n) => REGISTRY[n].status === STATUS.READY);
}

/**
 * The proactive engine's static allowlist (§1.1): the enabled tools whose effective
 * policy is `auto`. Proactive has no human to confirm to, so `confirm`/`off` tools are
 * never handed to the SDK — a tool that doesn't exist can't be called. The reactive
 * engine does NOT use this; it enforces tri-state policy in-loop instead.
 *
 * @param {{policy?:Object<string,string>}} [ownerConfig]
 * @returns {string[]}
 */
function autoAllowlist(ownerConfig) {
    const { effectivePolicy } = require('./policy');
    return enabledToolNames().filter(
        (n) => effectivePolicy(n, REGISTRY[n], ownerConfig) === TIER.AUTO,
    );
}

/** Compact catalog (name/description/tier) for the system prompt (§5). */
function catalogForPrompt(names = enabledToolNames()) {
    return names.map((n) => ({ name: n, description: REGISTRY[n].description, tier: REGISTRY[n].tier }));
}

/** Raw Messages API projection. */
function toAnthropicTools(names = enabledToolNames()) {
    return names.map((n) => {
        const schema = zodToJsonSchema(REGISTRY[n].args, { target: 'openApi3', $refStrategy: 'none' });
        delete schema.$schema;
        return { name: n, description: REGISTRY[n].description, input_schema: schema };
    });
}

/** Claude Agent SDK projection (lazy SDK; handlers route through execute.js). */
function toSdkMcpServer(ctx, names = enabledToolNames()) {
    const { tool, createSdkMcpServer } = getSdk();
    const tools = names.map((n) => {
        const def = REGISTRY[n];
        return tool(n, def.description, def.args.shape, async (args) => {
            const { executeTool } = require('./execute'); // lazy → avoids load-time cycle
            const out = await executeTool(ctx, n, args);
            return { content: [{ type: 'text', text: JSON.stringify(out) }] };
        });
    });
    return createSdkMcpServer({ name: 'ross-tools', version: '1.0.0', tools });
}

module.exports = {
    REGISTRY,
    AdapterPendingError,
    enabledToolNames,
    autoAllowlist,
    catalogForPrompt,
    toAnthropicTools,
    toSdkMcpServer,
    resolveWorkflowOwner,
    __setDbForTests,
    __setSdkForTests,
};
