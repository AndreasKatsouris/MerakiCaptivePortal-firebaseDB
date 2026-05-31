'use strict';

/**
 * Phase 7 ① Credit Ledger — public Cloud Functions (thin wrappers over ledger.js).
 *
 * Pattern mirrors the ROSS CFs: onRequest + CORS allowlist + Bearer-token auth,
 * POST-only, `res.json({ result: { success, ... } })`, 403/400/500 error mapping.
 *
 * The debit path (recordUsageAndDebit / checkBalance) is intentionally NOT exposed
 * as a CF — only server-side consumers (rossChat, future OCR/WhatsApp) call it via
 * the module. These three wrappers are the only network surface.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { corsOptions } = require('../cors-allowlist');
const cors = require('cors')(corsOptions);

const ledger = require('./ledger');
const { LEDGER_CURRENCY } = require('./constants');
const { verifyAuthToken, verifySuperAdmin } = require('./auth');

/** A 400 validation error carrying an explicit status for the mapper. */
function badRequest(message) {
    const err = new Error(message);
    err.statusCode = 400;
    return err;
}

/**
 * Map an error to an HTTP status. Prefers an explicit `err.statusCode` (auth
 * helpers throw 403, validation throws 400); falls back to 500 for anything
 * unexpected. No fragile message-substring matching.
 */
function statusFor(err) {
    if (err && Number.isInteger(err.statusCode)) return err.statusCode;
    return 500;
}

/**
 * billingGrantCredit — superAdmin comps a beta owner's balance (v1 credit bridge,
 * mirrors the absence of a payment rail). Body: { uid, amountCents, reason }.
 */
exports.billingGrantCredit = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        const grantedBy = await verifySuperAdmin(decoded);

        const data = req.body.data || req.body || {};
        const { uid, amountCents, reason } = data;
        // NOTE: the uid is not verified to exist in Firebase Auth — superAdmin-only
        // path, controlled beta. A comp to a non-existent uid only creates a dangling
        // billing/credits/{uid} node (harmless). Revisit if grants become self-serve.
        if (!uid || typeof uid !== 'string') throw badRequest('Invalid request: uid is required');
        if (!Number.isInteger(amountCents) || amountCents <= 0) {
            throw badRequest('Invalid request: amountCents must be a positive integer');
        }
        if (reason != null && (typeof reason !== 'string' || reason.length > 500)) {
            throw badRequest('Invalid request: reason must be a string of 500 chars or fewer');
        }

        const { balanceAfterCents } = await ledger.grantCredit({ uid, amountCents, grantedBy, reason: reason || null });
        res.json({ result: { success: true, uid, balanceCents: balanceAfterCents, currency: LEDGER_CURRENCY } });
    } catch (error) {
        console.error('[billingGrantCredit] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

/**
 * billingGetBalance — owner reads their OWN balance. Self-scoped to the token uid;
 * a uid in the body is never honoured for reads.
 */
exports.billingGetBalance = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        const uid = decoded.uid; // self-scope — do NOT read a uid from the body
        const balanceCents = await ledger.getBalanceCents(uid);
        res.json({ result: { success: true, balanceCents, currency: LEDGER_CURRENCY } });
    } catch (error) {
        console.error('[billingGetBalance] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

/**
 * billingGetUsage — owner reads their OWN usage history, newest-first, paginated.
 * Self-scoped. Body: { limit?, before? }. limit clamped to 1..100.
 */
exports.billingGetUsage = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        const uid = decoded.uid; // self-scope

        const data = req.body.data || req.body || {};
        const limit = Math.min(Math.max(parseInt(data.limit, 10) || 50, 1), 100);
        const before = typeof data.before === 'string' ? data.before : undefined;

        const { usage, nextBefore } = await ledger.getUsage(uid, { limit, before });
        res.json({ result: { success: true, usage, nextBefore } });
    } catch (error) {
        console.error('[billingGetUsage] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));
