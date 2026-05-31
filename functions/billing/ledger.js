'use strict';

/**
 * Phase 7 ① Credit Ledger — core module.
 *
 * USD-denominated prepaid credit ledger (no FX in v1). Server-side only; never
 * exposed directly as a Cloud Function except via the thin wrappers in
 * functions/billing/cloud-functions.js. Consumers (rossChat now; OCR/WhatsApp
 * later) import and call this module.
 *
 * Spec: docs/plans/2026-05-31-metering-credit-ledger-design.md
 */

const admin = require('firebase-admin');
const {
    SERVICES,
    LEDGER_CURRENCY,
    DEFAULT_MARKUP,
    DEFAULT_CACHE_WRITE_MULT,
    DEFAULT_CACHE_READ_MULT,
    DEFAULT_MIN_BALANCE_CENTS,
} = require('./constants');

// ---------------------------------------------------------------------------
// DB access (lazy, with a test seam) — matches the getDb() pattern in ross.js.
// ---------------------------------------------------------------------------
let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
/** Test-only: inject an in-memory RTDB fake. */
function __setDbForTests(fake) { _db = fake; }

const creditsPath = (uid) => `billing/credits/${uid}`;
const usagePath = (uid) => `billing/usage/${uid}`;
const grantsPath = (uid) => `billing/grants/${uid}`;
const PRICE_TABLE = 'billing/priceTable';

// ---------------------------------------------------------------------------
// Pure cost formula + service dispatch (no I/O).
// ---------------------------------------------------------------------------

/**
 * Pure token-cost computation for the askRoss service. Returns integer USD cents.
 * @param {object} units - { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens } (missing → 0)
 * @param {object} rate  - { usdPerMtokInput, usdPerMtokOutput, cacheWriteMult, cacheReadMult, markup }
 * @returns {{ costCents: number, wholesaleUsdCents: number }}
 */
function computeTokenCost(units, rate) {
    const inputTokens = units.inputTokens || 0;
    const outputTokens = units.outputTokens || 0;
    const cacheWriteTokens = units.cacheWriteTokens || 0;
    const cacheReadTokens = units.cacheReadTokens || 0;

    const inUsd = (inputTokens / 1e6) * rate.usdPerMtokInput;
    const outUsd = (outputTokens / 1e6) * rate.usdPerMtokOutput;
    const cacheWrUsd = (cacheWriteTokens / 1e6) * rate.usdPerMtokInput * rate.cacheWriteMult;
    const cacheRdUsd = (cacheReadTokens / 1e6) * rate.usdPerMtokInput * rate.cacheReadMult;

    const wholesaleUsd = inUsd + outUsd + cacheWrUsd + cacheRdUsd;

    // Single final rounding per value → integer USD cents. costCents applies the
    // passthrough markup; wholesaleUsdCents is our raw cost (margin = cost − wholesale).
    return {
        costCents: Math.round(wholesaleUsd * rate.markup * 100),
        wholesaleUsdCents: Math.round(wholesaleUsd * 100),
    };
}

/**
 * Service-dispatch cost computation. THROWS on an unknown service rather than
 * silently billing zero (spec §11.2) — a future OCR/WhatsApp consumer must add
 * its own branch + rate path, not fall through to a 0 charge.
 */
function computeCostCents(service, units, rate) {
    switch (service) {
        case SERVICES.ASK_ROSS:
            return computeTokenCost(units, rate);
        default:
            throw new Error(`computeCostCents: unknown billing service '${service}'`);
    }
}

// ---------------------------------------------------------------------------
// I/O.
// ---------------------------------------------------------------------------

/** Read the live price table and build a frozen rate snapshot for `model`. */
async function loadRateSnapshot(model) {
    const snap = await getDb().ref(PRICE_TABLE).once('value');
    const pt = snap.val() || {};
    const m = (pt.models && pt.models[model]) || {};
    return {
        usdPerMtokInput: m.usdPerMtokInput,
        usdPerMtokOutput: m.usdPerMtokOutput,
        cacheWriteMult: m.cacheWriteMult != null ? m.cacheWriteMult : DEFAULT_CACHE_WRITE_MULT,
        cacheReadMult: m.cacheReadMult != null ? m.cacheReadMult : DEFAULT_CACHE_READ_MULT,
        markup: pt.markup != null ? pt.markup : DEFAULT_MARKUP,
    };
}

/** Current balance in USD cents; 0 for an unknown uid (fail-safe). */
async function getBalanceCents(uid) {
    const snap = await getDb().ref(`${creditsPath(uid)}/balanceCents`).once('value');
    return snap.val() || 0;
}

/**
 * Pre-flight gate. Cheap single read. True only when balance exceeds the floor
 * (so a balance exactly at the floor is blocked).
 */
async function checkBalance(uid, minCents = DEFAULT_MIN_BALANCE_CENTS) {
    return (await getBalanceCents(uid)) > minCents;
}

/** set() with a small retry — used for the keyed usage-record write (see §11.1). */
async function setWithRetry(ref, value, attempts = 3) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        try {
            await ref.set(value);
            return;
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr;
}

/**
 * Post-flight, success-only. Computes cost from the CURRENT price table, snapshots
 * the rate into the record, debits the balance atomically, and appends an immutable
 * usage record.
 *
 * ATOMICITY CONTRACT (§11.1): the debit happens exactly once, inside the
 * transaction() on the balance. The usage-record write is a SEPARATE op at a
 * key generated BEFORE the transaction. If the record write fails it is retried
 * at the SAME key (idempotent set) — so a retry can never double-debit (the
 * transaction is not re-run). Worst case is a charged turn whose audit row lands
 * on retry; never a double charge, never a silent un-audited charge beyond the
 * retry budget.
 *
 * @returns {{ costCents, balanceAfterCents, recordKey }}
 */
async function recordUsageAndDebit({ uid, service, model, units, meta = {} }) {
    // 1. Pre-generate the usage record key (local, no I/O).
    const recordKey = getDb().ref(usagePath(uid)).push().key;

    // 2. Snapshot rates + compute cost (throws on unknown service → no debit).
    const rateSnapshot = await loadRateSnapshot(model);
    const { costCents, wholesaleUsdCents } = computeCostCents(service, units, rateSnapshot);

    // 3. Atomic debit.
    const balanceRef = getDb().ref(`${creditsPath(uid)}/balanceCents`);
    const txn = await balanceRef.transaction((current) => (current || 0) - costCents);
    const balanceAfterCents = txn.snapshot.val();
    await getDb().ref(creditsPath(uid)).update({ currency: LEDGER_CURRENCY, updatedAt: Date.now() });

    // 4. Immutable usage record at the pre-generated key, retry-safe.
    const record = {
        service,
        model: model || null,
        units,
        rateSnapshot,
        currency: LEDGER_CURRENCY,
        wholesaleUsdCents,
        costCents,
        balanceAfterCents,
        meta,
        createdAt: Date.now(),
    };
    await setWithRetry(getDb().ref(`${usagePath(uid)}/${recordKey}`), record);

    return { costCents, balanceAfterCents, recordKey };
}

/** Comp grant — credits balance (atomic) + writes a grant audit row. */
async function grantCredit({ uid, amountCents, grantedBy, reason }) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error('grantCredit: amountCents must be a positive integer');
    }
    const balanceRef = getDb().ref(`${creditsPath(uid)}/balanceCents`);
    const txn = await balanceRef.transaction((current) => (current || 0) + amountCents);
    const balanceAfterCents = txn.snapshot.val();
    await getDb().ref(creditsPath(uid)).update({ currency: LEDGER_CURRENCY, updatedAt: Date.now() });

    const grantKey = getDb().ref(grantsPath(uid)).push().key;
    await getDb().ref(`${grantsPath(uid)}/${grantKey}`).set({
        amountCents,
        grantedBy: grantedBy || null,
        reason: reason || null,
        createdAt: Date.now(),
    });
    return { balanceAfterCents };
}

/**
 * Usage history, newest-first, paginated. RTDB orders ascending, so we
 * limitToLast + reverse (§11.3). `before` is a keyset cursor (exclusive upper bound).
 * @returns {{ usage: Array, nextBefore: string|null }}
 */
async function getUsage(uid, { limit = 50, before } = {}) {
    let q = getDb().ref(usagePath(uid)).orderByKey();
    if (before) q = q.endBefore(before);
    q = q.limitToLast(limit);

    const snap = await q.once('value');
    const rows = [];
    snap.forEach((child) => { rows.unshift({ id: child.key, ...child.val() }); });
    const nextBefore = rows.length ? rows[rows.length - 1].id : null;
    return { usage: rows, nextBefore };
}

module.exports = {
    // pure
    computeCostCents,
    computeTokenCost,
    // I/O
    checkBalance,
    getBalanceCents,
    recordUsageAndDebit,
    grantCredit,
    getUsage,
    loadRateSnapshot,
    // test seam
    __setDbForTests,
};
