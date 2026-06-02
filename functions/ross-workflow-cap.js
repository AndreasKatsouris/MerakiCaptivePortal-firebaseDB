'use strict';

/**
 * ROSS workflow-cap helpers (Phase 7 ④a §8 — first entitlement-enforcement consumer).
 *
 * Pure functions, unit-tested without the emulator (mirrors ross-workflow-builder.js).
 * The DB reads (materialized limit + active workflow count) live in ross.js and feed
 * these. The cap is the limit the future workflow add-on packs sell against
 * (`addOnCatalog` deltas.limits.maxWorkflows: +N).
 */

// Limit sentinel: -1 (and any negative) means "unlimited".
const UNLIMITED = -1;

/**
 * Count a user's ACTIVE workflows from the raw `ross/workflows/{uid}` node.
 * Active = the workflow's status is not 'paused' (the existing active marker;
 * see rossGetHomeWorkflowDigest). Paused workflows do NOT count toward the cap.
 *
 * @param {object|null} workflowsObj  value of ross/workflows/{uid} ({ [workflowId]: record })
 * @returns {number}
 */
function countActiveWorkflows(workflowsObj) {
    if (!workflowsObj || typeof workflowsObj !== 'object') return 0;
    let count = 0;
    for (const wf of Object.values(workflowsObj)) {
        if (wf && wf.status === 'paused') continue;
        count += 1;
    }
    return count;
}

/**
 * Decide whether a new workflow may be created.
 *
 * @param {object} args
 * @param {number|null|undefined} args.maxWorkflows  materialized limit (absent/null/<0 ⇒ unlimited)
 * @param {number} args.activeCount                  current active workflow count
 * @param {boolean} [args.isSuperAdmin]              superAdmin bypasses the cap
 * @returns {{ allowed: boolean, unlimited?: boolean, limit?: number, current?: number }}
 */
function workflowCapStatus({ maxWorkflows, activeCount, isSuperAdmin = false }) {
    if (isSuperAdmin) return { allowed: true, unlimited: true };
    if (maxWorkflows == null || typeof maxWorkflows !== 'number' || maxWorkflows < 0) {
        return { allowed: true, unlimited: true };
    }
    return {
        allowed: activeCount < maxWorkflows,
        limit: maxWorkflows,
        current: activeCount,
    };
}

module.exports = { UNLIMITED, countActiveWorkflows, workflowCapStatus };
