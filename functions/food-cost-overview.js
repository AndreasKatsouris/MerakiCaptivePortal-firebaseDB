'use strict';

/**
 * ROSS-FoodCost-v2 D3 — `foodCostOverview`, the read-only overview CF backing
 * the Hi-Fi `/food-cost-v2.html` dashboard.
 *
 * Design: docs/plans/2026-07-24-ross-foodcost-d3-ui-design.md §4a + §5.
 * Conventions copied from the GT-verified sibling `functions/agent/rossChat.js`
 * (cors allowlist :23-24, cors-wrapped onRequest :589, verifyAuthToken with
 * normalized 401/403 strings :628-640).
 *
 * Pipeline (one bounded read, both cores pure):
 *   verifyAuthToken → callerHasLocationAccess (reused from ./agent/tools — F3,
 *   never a third hand-rolled variant) → foodCost entitlement (subscriptions/
 *   {uid}/features/foodCost === true, admin bypass — mirrors ross.js:104-120;
 *   the client-side gate is UX, THIS is the paywall — F1) →
 *   locations/{loc}/stockUsage orderByKey().limitToLast(30) →
 *   summariseFoodCost (D1) + suggestOrder (D2) → §5 payload.
 *
 * Security envelope:
 *  - Anti-enumeration: no-access / not-entitled / no-data ALL return bare
 *    {hasData:false}, deep-equal (same convention as the agent tools).
 *  - Invalid INPUT is a loud 400 at the handler — this endpoint serves the
 *    first-party client, not the model, so malformed requests are bugs to
 *    surface, not shapes to hide. Only access/entitlement/data failures are
 *    indistinguishable.
 *  - F8: `summariseFoodCost` returns RAW tenant strings (the logged D1 backport
 *    gap) — the D1-branch strings (lowStockItems itemCode/description, runway
 *    item names) are sanitized here. `suggestOrder` output is already P6-clean.
 *  - F2 abuse bounds: this endpoint is UNMETERED (no billed turn), so
 *    maxInstances: 5 caps concurrency, and the D2 P5 per-record item cap (2000)
 *    is applied to the D1 branch too — summariseFoodCost iterates
 *    latest.stockItems uncapped, so the latest record is sliced before the D1
 *    call. suggestOrder self-caps (and surfaces `items-truncated-for-size`),
 *    so it receives the UNsliced records. P5 caps are per-call, not aggregate.
 */

const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { corsOptions } = require('./cors-allowlist');
const cors = require('cors')(corsOptions);
const { callerHasLocationAccess } = require('./agent/tools');

const DAY_MS = 86400000;
const MAX_RECORDS = 30;          // single bounded read; also the trend-point cap (§5)
const MAX_SUMMARY_ITEMS = 2000;  // reuse of suggest.js MAX_ITEMS_PER_RECORD (P5) for the D1 branch.
                                 // MUST STAY EQUAL to suggest.js's constant: D1-branch truncation is
                                 // signalled ONLY via order.caveats ('items-truncated-for-size'),
                                 // which holds because both branches cap the same latest record at
                                 // the same size (spec-review N2 — divergence breaks the signal).
const MAX_STRING_LEN = 120;      // P6 cap, matching suggest.js
const MIN_DAYS_TO_DELIVERY = 1;
const MAX_DAYS_TO_DELIVERY = 30; // same bounds as the getSuggestedOrder tool's Zod schema
const LOCATION_ID_RE = /^[a-zA-Z0-9_-]+$/; // RTDB-key-safe — locationId is interpolated into paths

// --- DB seam (matches tools/billing/rossChat) ---------------------------------
let _db = null;
function getDb() {
    if (!_db) _db = admin.database();
    return _db;
}
/** Test-only: inject an in-memory RTDB fake. */
function __setDbForTests(fake) { _db = fake; }

// --- auth seam (lazy: ross.js registers CFs + needs secrets at load) ----------
let _verifyAuth = null;
function getVerifyAuth() {
    if (!_verifyAuth) _verifyAuth = require('./ross').verifyAuthToken;
    return _verifyAuth;
}
/** Test-only: inject a fake verifyAuthToken. */
function __setVerifyAuthForTests(fake) { _verifyAuth = fake; }

function num(v) {
    const n = Number(v) || 0;
    return Number.isFinite(n) ? n : 0;
}

/**
 * P6: strip control chars FIRST, then truncate to 120 visible chars.
 * Replicated from functions/agent/food-cost/suggest.js:67-70 (sanitizeText),
 * which is module-private there — cited rather than exported to avoid widening
 * that module's surface for a three-line helper.
 */
function sanitizeText(v) {
    // eslint-disable-next-line no-control-regex
    return String(v == null ? '' : v).replace(/[\x00-\x1F\x7F]/g, '').slice(0, MAX_STRING_LEN);
}

/**
 * Runway tone from days of cover. Thresholds documented for the UI contract:
 * null (stockout with unknown usage) or <= 2 days → 'warn'; <= 6 → 'accent';
 * anything longer → 'default'. Matches the Hi-Fi token semantics the scripted
 * v2 content used (warn / accent / default bars).
 */
function toneForDaysLeft(daysLeft) {
    if (daysLeft === null || daysLeft <= 2) return 'warn';
    if (daysLeft <= 6) return 'accent';
    return 'default';
}

/**
 * The injected-db core: access + entitlement gates, one bounded read, then the
 * two pure cores assembled into the §5 payload.
 *
 * @param {object} db  RTDB handle (admin.database() in prod, fake in tests).
 *   NOTE: `callerHasLocationAccess` reads through the tools.js seam — in prod
 *   both resolve admin.database(); tests must set BOTH seams to the same fake
 *   (the established both-seams pattern from tools.test.js).
 * @param {string} uid  server-derived caller uid (never client-supplied)
 * @param {{locationId:string, daysToNextDelivery?:number}} opts  handler-validated
 * @param {number} now  server-authoritative epoch ms
 * @returns {Promise<object>} §5 payload, or bare {hasData:false}
 */
async function buildOverview(db, uid, { locationId, daysToNextDelivery }, now) {
    // Access gate BEFORE any tenant read (C-1 / F3 — reused, not hand-rolled).
    if (!(await callerHasLocationAccess(locationId, uid))) return { hasData: false };

    // Entitlement gate (F1) — admins-first read mirroring ross.js:104-120.
    const adminSnap = await db.ref(`admins/${uid}`).once('value');
    if (!adminSnap.exists()) {
        const featSnap = await db.ref(`subscriptions/${uid}/features`).once('value');
        const features = featSnap.val();
        if (!features || features.foodCost !== true) return { hasData: false };
    }

    // Single bounded read: keys are chronological YYYYMMDD_HHMMSS timestamp-keys,
    // so orderByKey().limitToLast(30) fetches only the most recent records (no
    // index needed). Both cores re-sort by the `timestamp` field, so correctness
    // holds regardless of key/field skew (same rationale as tools.js:188-192).
    const snap = await db.ref(`locations/${locationId}/stockUsage`)
        .orderByKey().limitToLast(MAX_RECORDS).once('value');
    const records = snap.exists() ? Object.values(snap.val()) : [];

    const recs = records
        .filter((r) => r && typeof r === 'object')
        .map((r) => ({ ...r, ts: num(r.timestamp) }))
        .sort((a, b) => a.ts - b.ts);
    if (!recs.length) return { hasData: false };

    // Lazy-require the cores: keeps this module import-cheap (rossChat pattern).
    const { summariseFoodCost } = require('./agent/food-cost-summary');
    const { suggestOrder } = require('./agent/food-cost/suggest');

    // F2: bound the D1 branch — summariseFoodCost iterates latest.stockItems
    // uncapped, so slice the LATEST record to the D2 per-record cap before the
    // call. suggestOrder gets the raw records (it self-caps at the same 2000 and
    // reports `items-truncated-for-size` in order.caveats — the user-visible
    // truncation signal for both branches).
    const latest = recs[recs.length - 1];
    const oversized = Array.isArray(latest.stockItems)
        && latest.stockItems.length > MAX_SUMMARY_ITEMS;
    const summaryRecs = oversized
        ? recs.map((r, i) => (i === recs.length - 1
            ? { ...r, stockItems: r.stockItems.slice(0, MAX_SUMMARY_ITEMS) }
            : r))
        : recs;

    const summary = summariseFoodCost(summaryRecs, { now });
    const order = suggestOrder(records, { now, daysToNextDelivery });

    // recs is non-empty → summariseFoodCost always returns hasData:true here.
    // Trend arrays: oldest→newest from record history, max 30 points (§5).
    const trendRecs = recs.slice(-MAX_RECORDS);
    const costPctTrend = trendRecs.map((r) => num(r.costPercentage));
    const spendTrend = trendRecs.map((r) => num(r.totalCostOfUsage));

    // F8: the D1 core returns RAW tenant strings — sanitize before they leave.
    const lowStockItems = (summary.lowStockItems || []).map((it) => ({
        itemCode: sanitizeText(it.itemCode),
        description: sanitizeText(it.description),
        closingQty: it.closingQty,
        daysOfCover: it.daysOfCover,
    }));

    const runway = lowStockItems.map((it) => ({
        item: it.description || it.itemCode,
        daysLeft: it.daysOfCover,
        tone: toneForDaysLeft(it.daysOfCover),
    }));

    return {
        hasData: true,
        asOf: summary.period.asOf,
        dataAgeDays: summary.dataAgeDays,
        kpis: {
            costPct: summary.foodCostPct,
            costPctTrend,
            spend: summary.totalCostOfUsage,
            spendTrend,
            prevCostPct: summary.previousFoodCostPct,
        },
        summary: {
            trend: summary.trend,
            lowStockCount: summary.lowStockCount,
            lowStockItems,
            itemsAnalysed: summary.itemsAnalysed,
        },
        order,
        runway,
    };
}

/**
 * The un-CORS'd request handler (exported for envelope tests; the CF wraps it).
 * Validation precedes auth (rossChat's ordering) — malformed input never costs
 * a token verification.
 */
async function handleOverviewRequest(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    const { locationId, daysToNextDelivery } = req.body || {};
    if (typeof locationId !== 'string' || !LOCATION_ID_RE.test(locationId)) {
        res.status(400).json({ error: 'locationId must be a key-safe string ([A-Za-z0-9_-])' });
        return;
    }
    if (daysToNextDelivery !== undefined && (
        typeof daysToNextDelivery !== 'number'
        || !Number.isInteger(daysToNextDelivery)
        || daysToNextDelivery < MIN_DAYS_TO_DELIVERY
        || daysToNextDelivery > MAX_DAYS_TO_DELIVERY
    )) {
        res.status(400).json({ error: 'daysToNextDelivery must be an integer between 1 and 30' });
        return;
    }

    // Auth — normalized client-facing strings, real reason logged server-side
    // (rossChat.js:628-640 convention).
    let decoded;
    try {
        decoded = await getVerifyAuth()(req);
    } catch (err) {
        const isAuthErr = /authorization|token/i.test(err.message || '');
        console.warn('[foodCostOverview] auth rejected:', err && err.message);
        res.status(isAuthErr ? 401 : 403).json({
            error: isAuthErr ? 'Authentication failed' : 'Access denied',
        });
        return;
    }

    try {
        const payload = await buildOverview(
            getDb(), decoded.uid, { locationId, daysToNextDelivery }, Date.now(),
        );
        res.json(payload);
    } catch (err) {
        // No raw record data / tenant strings in the error path (§6).
        console.error('[foodCostOverview] failed:', err && err.message);
        res.status(500).json({ error: 'Failed to load the food-cost overview' });
    }
}

/**
 * `foodCostOverview` — read-only onRequest endpoint for the v2 dashboard.
 * maxInstances caps the blast radius of an unmetered endpoint (F2).
 */
const foodCostOverview = onRequest(
    { maxInstances: 5 },
    (req, res) => cors(req, res, () => handleOverviewRequest(req, res)),
);

// ALL exports in this single assignment — the #188 export-clobber trap
// (queueAnalytics.js:343-364): a trailing `module.exports = {...}` silently
// drops anything attached to `exports.` above it, so nothing here uses
// `exports.name =` at all.
module.exports = {
    foodCostOverview,
    buildOverview,
    handleOverviewRequest,
    toneForDaysLeft,
    __setDbForTests,
    __setVerifyAuthForTests,
};
