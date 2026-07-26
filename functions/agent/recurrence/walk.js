'use strict';

/**
 * ROSS recurrence advance — the walker.
 *
 * Rolls every frozen `nextDueDate` forward to its current period so workflows
 * stop being permanently "covered" by an old run (functions/ross.js:404-406) and
 * can reach the `overdue` bucket again. See
 * docs/plans/2026-07-26-ross-recurrence-advance-design.md.
 *
 * This job MUTATES tenant data on every owner, so it carries the same guards
 * this codebase already applies to unattended work:
 *   - the global kill switch the read-only sweep honours (sweep.js:152)
 *   - a global write cap, as prune.js:26 does
 *   - `prev` audit rows, because there is no native undo — the same reason
 *     `advanceDueDate` sits in NO_UNDO_TOOLS with a snapshotPrev dispatch
 *     (constants.js:42, execute.js:37-43)
 *   - dry-run by default, and an owner allowlist for the first real run
 */

const admin = require('firebase-admin');
const { agentKillSwitchPath } = require('../constants');
const { advancePastDue, toUtcMidnightMs } = require('./advance-core');

let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
/** Test-only: inject a fake RTDB. */
function __setDbForTests(fake) { _db = fake; }

const MODES = { DRY_RUN: 'dry-run', APPLY: 'apply' };

/** Never write more locations than this in one run (prune.js:26 precedent). */
const MAX_WRITES_PER_RUN = 2000;

/**
 * Default is DRY-RUN. A job that rewrites every tenant's due dates must not go
 * live because an env var was forgotten — the operator reads one night of
 * dry-run output, confirms the deltas, then flips.
 */
function getMode(env = process.env) {
    const raw = String((env && env.ROSS_RECURRENCE_ADVANCE_MODE) || '').trim().toLowerCase();
    return raw === MODES.APPLY ? MODES.APPLY : MODES.DRY_RUN;
}

/**
 * Optional comma/space-separated uid allowlist. When set, ONLY these owners are
 * touched — turns the first `apply` run from "every tenant" into "my account".
 */
function getOwnerAllowlist(env = process.env) {
    const raw = String((env && env.ROSS_RECURRENCE_ADVANCE_OWNERS) || '').trim();
    if (!raw) return null;
    const list = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    return list.length ? new Set(list) : null;
}

/** UTC midnight for the instant `now` — matches the date contract (design D4). */
function utcMidnight(now) {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Build the multi-path update for ONE advanced location. Pure.
 *
 * Task `dueDate` shifts by the same delta so the `nextDueDate + daysOffset`
 * invariant (ross-workflow-builder.js:28) survives, and task completion resets
 * because a new cycle genuinely is undone — `task.status` is current-cycle
 * state, not the audit trail (that lives in run records, which we never touch).
 * Leaving it `completed` would also make every task in the new cycle 404 on
 * rossCompleteTask (ross.js:1299, :1311).
 */
function buildLocationUpdate({ uid, workflowId, locationId, loc, result, nowMs }) {
    const base = `ross/workflows/${uid}/${workflowId}/locations/${locationId}`;
    const updates = {
        [`${base}/nextDueDate`]: result.newNextDueDate,
        [`${base}/missedCycles`]: (Number(loc.missedCycles) || 0) + result.missedCycles,
        [`${base}/lastAdvancedAt`]: nowMs,
    };

    const tasks = (loc.tasks && typeof loc.tasks === 'object') ? loc.tasks : {};
    for (const [taskId, task] of Object.entries(tasks)) {
        if (!task || typeof task !== 'object') continue;
        const due = toUtcMidnightMs(task.dueDate);
        // Only shift a task whose dueDate we can actually parse; leave the rest
        // untouched rather than inventing a date.
        if (due !== null) {
            updates[`${base}/tasks/${taskId}/dueDate`] = due + result.deltaMs;
        }
        if (task.status === 'completed') {
            updates[`${base}/tasks/${taskId}/status`] = 'pending';
            updates[`${base}/tasks/${taskId}/completedAt`] = null;
        }
    }
    return updates;
}

/** Audit row capturing the pre-advance value — the only rollback record. */
function buildAuditEntry({ uid, workflowId, locationId, loc, result, nowMs }) {
    return {
        path: `ross/recurrenceAudit/${uid}/${nowMs}_${workflowId}_${locationId}`,
        value: {
            workflowId,
            locationId,
            prev: { nextDueDate: loc.nextDueDate === undefined ? null : loc.nextDueDate },
            next: result.newNextDueDate,
            missedCycles: result.missedCycles,
            at: nowMs,
        },
    };
}

/**
 * Walk every owner's workflows and advance frozen due dates.
 * @param {number} now epoch-ms
 * @param {object} [env]
 * @returns {Promise<object>} summary
 */
async function advanceAllWorkflows(now, env = process.env) {
    const db = getDb();
    const mode = getMode(env);
    const allowlist = getOwnerAllowlist(env);
    const todayMs = utcMidnight(now);
    const summary = {
        mode, owners: 0, workflows: 0, locations: 0,
        advanced: 0, skipped: 0, errors: 0, capped: false,
    };

    // Global kill switch — one switch stops ALL unattended Ross behaviour.
    const ks = await db.ref(agentKillSwitchPath()).once('value');
    if (ks.val() === true) return { ...summary, halted: 'killswitch' };

    // Owner enumeration mirrors rossScheduledReminder (ross.js:1442-1450).
    const idxSnap = await db.ref('ross/ownerIndex').once('value');
    const owners = Object.keys(idxSnap.val() || {});

    let updates = {};
    let auditWrites = {};
    let pendingWrites = 0;

    for (const uid of owners) {
        if (allowlist && !allowlist.has(uid)) continue;
        summary.owners += 1;
        try {
            const wfSnap = await db.ref(`ross/workflows/${uid}`).once('value');
            const workflows = wfSnap.val() || {};

            for (const [workflowId, w] of Object.entries(workflows)) {
                if (!w || typeof w !== 'object') continue;
                summary.workflows += 1;
                // Match the digest's exclusion exactly (ross.js:373).
                if (w.status === 'paused') { summary.skipped += 1; continue; }

                const locations = (w.locations && typeof w.locations === 'object') ? w.locations : {};
                for (const [locationId, loc] of Object.entries(locations)) {
                    if (!loc || typeof loc !== 'object') continue;
                    summary.locations += 1;

                    let result;
                    try {
                        result = advancePastDue({
                            nextDueDate: loc.nextDueDate,
                            recurrence: w.recurrence,
                            customInterval: w.customInterval,
                            todayMs,
                        });
                    } catch (err) {
                        summary.errors += 1;
                        console.error(`[rossRecurrenceAdvance] core failed wf=${workflowId} loc=${locationId}: ${err && err.message}`);
                        continue;
                    }

                    if (!result) { summary.skipped += 1; continue; }

                    if (pendingWrites >= MAX_WRITES_PER_RUN) {
                        summary.capped = true;
                        continue;
                    }

                    // Ids + dates only — no PII.
                    console.log(
                        `[rossRecurrenceAdvance] ${mode} wf=${workflowId} loc=${locationId} ` +
                        `from=${new Date(toUtcMidnightMs(loc.nextDueDate)).toISOString().slice(0, 10)} ` +
                        `to=${new Date(result.newNextDueDate).toISOString().slice(0, 10)} ` +
                        `missed=${result.missedCycles}`
                    );

                    if (mode === MODES.APPLY) {
                        Object.assign(updates, buildLocationUpdate({ uid, workflowId, locationId, loc, result, nowMs: now }));
                        const audit = buildAuditEntry({ uid, workflowId, locationId, loc, result, nowMs: now });
                        auditWrites[audit.path] = audit.value;
                    }
                    pendingWrites += 1;
                    summary.advanced += 1;
                }
            }
        } catch (err) {
            // Failure isolation: one bad owner must not abort the walk.
            summary.errors += 1;
            console.error(`[rossRecurrenceAdvance] owner ${uid} failed: ${err && err.message}`);
        }
    }

    if (mode === MODES.APPLY && Object.keys(updates).length) {
        // Audit first: if the data write fails we still know what was intended;
        // if the audit fails we have not yet mutated anything.
        await db.ref().update(auditWrites);
        await db.ref().update(updates);
    }

    if (summary.capped) {
        console.warn(`[rossRecurrenceAdvance] write cap ${MAX_WRITES_PER_RUN} reached — remainder deferred to the next run.`);
    }
    return summary;
}

module.exports = {
    advanceAllWorkflows,
    buildLocationUpdate,
    buildAuditEntry,
    getMode,
    getOwnerAllowlist,
    utcMidnight,
    MODES,
    MAX_WRITES_PER_RUN,
    __setDbForTests,
};
