'use strict';

/**
 * Phase 7 ② askRoss Agent — scheduled prune of stale agent nodes (slice 7).
 *
 * RTDB has no native TTL, so a daily CF nulls out:
 *   - expired pending confirm-actions at ross/agentPending/{uid}/{turnId}
 *     (expiresAt older than the expiry + a grace window — review M-3); also sweeps
 *     malformed nodes (missing/non-numeric expiresAt) as garbage.
 *   - stale debit guards at billing/debitGuard/{uid}/{requestId} (review T-2 — the
 *     requestId is a per-request UUID so guards never dedupe; they only need to outlive
 *     a retry window, so a 7-day TTL is generous).
 *
 * Writes go through the Admin SDK (server-only; the agent nodes are .read:false/.write:false
 * in database.rules.json). A per-run batch cap bounds a huge first sweep — the remainder is
 * logged and cleared on the next run (no silent truncation).
 *
 * Spec: docs/plans/2026-05-31-askross-agent-design.md §9, §11 Q2.
 */

const admin = require('firebase-admin');
const { onSchedule } = require('firebase-functions/v2/scheduler');

const PENDING_PRUNE_GRACE_MS = 24 * 60 * 60 * 1000;   // 1 day after expiry
const DEBIT_GUARD_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const MAX_PRUNE_PATHS = 5000;                          // batch cap per run

let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
/** Test-only: inject an in-memory RTDB fake. */
function __setDbForTests(fake) { _db = fake; }

/**
 * Paths of pending confirm-actions to delete: expired beyond `graceMs`, OR malformed
 * (missing/non-numeric expiresAt → garbage). Pure.
 * @param {object|null} allPending - ross/agentPending value ({uid: {turnId: {...}}})
 */
function expiredPendingPaths(allPending, now, graceMs) {
    const paths = [];
    for (const [uid, turns] of Object.entries(allPending || {})) {
        for (const [turnId, p] of Object.entries(turns || {})) {
            const exp = p && typeof p.expiresAt === 'number' ? p.expiresAt : null;
            if (exp === null || exp < now - graceMs) {
                paths.push(`ross/agentPending/${uid}/${turnId}`);
            }
        }
    }
    return paths;
}

/**
 * Paths of debit guards to delete: written more than `ttlMs` ago (a missing `at` is
 * treated as ancient → pruned). Pure.
 * @param {object|null} allGuards - billing/debitGuard value ({uid: {requestId: {...}}})
 */
function staleGuardPaths(allGuards, now, ttlMs) {
    const paths = [];
    for (const [uid, guards] of Object.entries(allGuards || {})) {
        for (const [rid, g] of Object.entries(guards || {})) {
            const at = g && typeof g.at === 'number' ? g.at : 0;
            if (at < now - ttlMs) paths.push(`billing/debitGuard/${uid}/${rid}`);
        }
    }
    return paths;
}

/**
 * Read the two node trees, compute the deletions, and apply them in one multi-path
 * update. Capped per run. `now` is injected for testability.
 * @returns {Promise<{removed:number, total:number, capped:boolean}>}
 */
async function pruneAgentNodes(now) {
    const [pendSnap, guardSnap] = await Promise.all([
        getDb().ref('ross/agentPending').once('value'),
        getDb().ref('billing/debitGuard').once('value'),
    ]);

    let paths = [
        ...expiredPendingPaths(pendSnap.val(), now, PENDING_PRUNE_GRACE_MS),
        ...staleGuardPaths(guardSnap.val(), now, DEBIT_GUARD_TTL_MS),
    ];
    const total = paths.length;
    const capped = paths.length > MAX_PRUNE_PATHS;
    if (capped) paths = paths.slice(0, MAX_PRUNE_PATHS);

    if (paths.length) {
        const updates = {};
        for (const p of paths) updates[p] = null;
        await getDb().ref().update(updates);
    }
    if (capped) {
        console.warn(`[rossAgentPrune] capped at ${MAX_PRUNE_PATHS}/${total} stale nodes — remainder clears next run`);
    }
    return { removed: paths.length, total, capped };
}

// Daily at 03:30 SAST-ish (cron is UTC; off-peak either way).
const rossAgentPrune = onSchedule('30 3 * * *', async () => {
    const { removed, total } = await pruneAgentNodes(Date.now());
    console.log(`[rossAgentPrune] removed ${removed} of ${total} stale agent nodes`);
});

module.exports = {
    rossAgentPrune,
    pruneAgentNodes,
    expiredPendingPaths,
    staleGuardPaths,
    __setDbForTests,
    PENDING_PRUNE_GRACE_MS,
    DEBIT_GUARD_TTL_MS,
    MAX_PRUNE_PATHS,
};
