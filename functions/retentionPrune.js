'use strict';

/**
 * Scheduled retention prune — chunk-deletes aged-out records from three unbounded
 * nodes (scanningData / wifiLogins / activeUsers) so they stop growing forever.
 * Measured 2026-07-28: 101,197 / 18,198 / 16,805 records respectively (bug-triage
 * queue, retention row). Reuses clearScanningData's chunked multi-path-null pattern
 * (functions/index.js:1478) rather than a single remove(), which hits RTDB's ~16MB
 * WRITE_TOO_BIG ceiling once a node is this large.
 *
 * Retention windows (days) are the queue Q13 card's SUGGESTED defaults, not yet
 * operator-confirmed — flagged here and in the PR body per the card's explicit
 * "confirm with operator before building" note. This CF ships DORMANT (no deploy
 * from this PR); the operator can adjust RETENTION_DAYS before ever deploying it.
 *
 * Age determination differs by node because their keys differ:
 *  - scanningData is written exclusively via push() (functions/index.js:475), so its
 *    keys ARE Firebase push IDs — the first 8 characters encode a big-endian
 *    base-64 timestamp in a fixed, stable, cross-SDK algorithm. We only need the
 *    ENCODE direction: build the LARGEST possible key for the cutoff instant (so
 *    every same-millisecond key is included regardless of its random suffix) and
 *    let orderByKey().endAt() select everything at-or-before it — no per-record
 *    decode of a key we didn't generate ourselves, so a malformed/unexpected key
 *    shape can never be mis-dated.
 *  - wifiLogins/activeUsers keys are NOT reliably push keys — the 2026-07-28
 *    key-shape sweep (LESSONS) found 18,197 of 18,198 wifiLogins keys are non-push
 *    (legacy pre-CF records, per the "Replaces the prior client-side direct RTDB
 *    write" comment at functions/index.js:1358). Both record shapes DO carry a
 *    `timestamp` ISO-8601 string field written by submitWifiLogin
 *    (functions/index.js:1429-1453), and `wifiLogins/$sessionId.timestamp` is a
 *    required field per that node's `.validate` rule (database.rules.json:213) — so
 *    age is determined via orderByChild('timestamp'). A String startAt bound
 *    excludes any record whose timestamp is missing/null (RTDB orders null below
 *    any string in a child-sorted query), so a record we cannot date is NEVER
 *    matched, let alone deleted — fail-closed on the one field this depends on.
 *
 * Neither `wifiLogins` nor `activeUsers` currently has `.indexOn: "timestamp"` in
 * database.rules.json (only `phoneNumber` is indexed) — orderByChild('timestamp')
 * still returns correct results without it, just with an RTDB-logged "unspecified
 * index" warning and an in-memory scan cost. Adding the index is a rules-file
 * change and out of this runner's scope (single-owner file, rules changes are
 * operator-gated) — left as a follow-up for whoever next touches database.rules.json.
 */

const admin = require('firebase-admin');
const { onSchedule } = require('firebase-functions/v2/scheduler');

const DAY_MS = 24 * 60 * 60 * 1000;

// Suggested defaults from the queue Q13 card — confirm with operator before deploy.
const RETENTION_DAYS = {
    scanningData: 30,
    wifiLogins: 90,
    activeUsers: 7,
};

const BATCH_SIZE = 500;
const MAX_BATCHES_PER_NODE = 200; // mirrors clearScanningData's per-invocation cap

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
const PUSH_CHARS_MAX = PUSH_CHARS[PUSH_CHARS.length - 1]; // highest-ranked char — 'z'

/**
 * Encode a ms timestamp into the 8-char prefix a Firebase push ID would carry if
 * generated at exactly that instant (big-endian base-64 over the documented
 * PUSH_CHARS alphabet, whose ASCII order matches numeric order — the property that
 * makes push IDs sort chronologically as plain strings). Pure. Only the encode
 * direction is needed: pruning never decodes a key it did not generate.
 */
function encodePushKeyPrefix(ms) {
    const chars = new Array(8);
    let n = Math.floor(ms);
    for (let i = 7; i >= 0; i--) {
        chars[i] = PUSH_CHARS[n % 64];
        n = Math.floor(n / 64);
    }
    return chars.join('');
}

/**
 * Largest possible push key for `ms` — the correct upper bound for
 * orderByKey().endAt() to select every key generated strictly before `ms`, PLUS every
 * key generated in the same millisecond regardless of its random suffix (an
 * unavoidable, harmless tie: same-instant records are indistinguishable and equally
 * eligible for pruning). Using the MINIMUM suffix instead would silently exclude
 * same-millisecond keys whose random suffix sorts above it — i.e. nearly all of them.
 */
function pushKeyCutoffBoundary(ms) {
    return encodePushKeyPrefix(ms) + PUSH_CHARS_MAX.repeat(12);
}

let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
/** Test-only: inject an in-memory RTDB fake. */
function __setDbForTests(fake) { _db = fake; }

/**
 * Chunk-delete `nodePath`, whose keys are Firebase push IDs, down to `cutoffMs`.
 * Batches are read oldest-first (orderByKey ascending) and bounded by the cutoff, so
 * a batch shorter than `batchSize` means the node is drained up to the cutoff.
 */
async function pruneByPushKeyAge(nodePath, cutoffMs, batchSize = BATCH_SIZE, maxBatches = MAX_BATCHES_PER_NODE) {
    const boundary = pushKeyCutoffBoundary(cutoffMs);
    let deleted = 0;
    let batches = 0;

    while (batches < maxBatches) {
        const snap = await getDb().ref(nodePath).orderByKey().endAt(boundary).limitToFirst(batchSize).once('value');
        const val = snap.val();
        const keys = val ? Object.keys(val) : [];
        if (keys.length === 0) break;

        const updates = {};
        for (const k of keys) updates[`${nodePath}/${k}`] = null;
        await getDb().ref().update(updates);

        deleted += keys.length;
        batches += 1;
        if (keys.length < batchSize) return { node: nodePath, deleted, batches, done: true };
    }

    const moreSnap = await getDb().ref(nodePath).orderByKey().endAt(boundary).limitToFirst(1).once('value');
    return { node: nodePath, deleted, batches, done: !moreSnap.exists() };
}

/**
 * Chunk-delete `nodePath` by its `timestamp` field, down to `cutoffIso`. The query
 * bounds to [epoch, cutoff] so records missing a `timestamp` (ranked below any
 * string) are never selected — pruning only ever touches records it can date.
 */
async function pruneByTimestampField(nodePath, cutoffIso, batchSize = BATCH_SIZE, maxBatches = MAX_BATCHES_PER_NODE) {
    const EPOCH_ISO = new Date(0).toISOString();
    let deleted = 0;
    let batches = 0;

    const query = () => getDb().ref(nodePath).orderByChild('timestamp').startAt(EPOCH_ISO).endAt(cutoffIso);

    while (batches < maxBatches) {
        const snap = await query().limitToFirst(batchSize).once('value');
        const val = snap.val();
        const keys = val ? Object.keys(val) : [];
        if (keys.length === 0) break;

        const updates = {};
        for (const k of keys) updates[`${nodePath}/${k}`] = null;
        await getDb().ref().update(updates);

        deleted += keys.length;
        batches += 1;
        if (keys.length < batchSize) return { node: nodePath, deleted, batches, done: true };
    }

    const moreSnap = await query().limitToFirst(1).once('value');
    return { node: nodePath, deleted, batches, done: !moreSnap.exists() };
}

/**
 * Prune all three nodes against `now` (injected for testability). Sequential, not
 * parallel — all three share the same underlying RTDB write budget and sequencing
 * keeps each node's batch accounting independent and easy to reason about.
 */
async function pruneRetentionNodes(now = Date.now()) {
    const scanningDataCutoff = now - RETENTION_DAYS.scanningData * DAY_MS;
    const wifiLoginsCutoff = new Date(now - RETENTION_DAYS.wifiLogins * DAY_MS).toISOString();
    const activeUsersCutoff = new Date(now - RETENTION_DAYS.activeUsers * DAY_MS).toISOString();

    return [
        await pruneByPushKeyAge('scanningData', scanningDataCutoff),
        await pruneByTimestampField('wifiLogins', wifiLoginsCutoff),
        await pruneByTimestampField('activeUsers', activeUsersCutoff),
    ];
}

// Daily at 04:00 UTC (06:00 SAST) — off-peak, staggered from rossAgentPrune (03:30 UTC).
const retentionPrune = onSchedule('0 4 * * *', async () => {
    const results = await pruneRetentionNodes(Date.now());
    for (const r of results) {
        console.log(`[retentionPrune] ${r.node}: deleted ${r.deleted} in ${r.batches} batch(es), done=${r.done}`);
    }
});

module.exports = {
    retentionPrune,
    pruneRetentionNodes,
    pruneByPushKeyAge,
    pruneByTimestampField,
    encodePushKeyPrefix,
    pushKeyCutoffBoundary,
    __setDbForTests,
    RETENTION_DAYS,
    BATCH_SIZE,
    MAX_BATCHES_PER_NODE,
};
