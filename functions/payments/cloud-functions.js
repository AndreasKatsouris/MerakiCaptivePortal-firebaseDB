'use strict';
/**
 * Payment Rail — public Cloud Functions (thin wrappers over the payments cores).
 * Pattern mirrors billing/cloud-functions.js: onRequest + CORS + Bearer auth.
 *   - paymentsListBundles  (auth'd)  → active bundles for the UI
 *   - paymentsInitTopup    (auth'd)  → create a Paystack txn, return authorization_url
 *   - paymentsClaimTrial   (auth'd)  → one-time free-trial grant
 *   - paystackWebhook      (unauth, SIGNATURE-gated) → charge.success → grant
 *
 * ⚠️ DORMANT until launch: deploy needs PAYSTACK_SECRET_KEY (secret-first); the live
 * keys + the rossAgent→Free flip are NOT enabled until the two wheels land.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { corsOptions } = require('../cors-allowlist');
const cors = require('cors')(corsOptions);

const ledger = require('../billing/ledger');
const { verifyAuthToken } = require('../billing/auth');
const { listActiveBundles, resolveBundle } = require('./bundles');
const { claimTrial } = require('./trial');
const { processChargeSuccess } = require('./process-charge');
const { verifyPaystackSignature } = require('./webhook-verify');
const paystack = require('./paystack-client');

const PAYSTACK_SECRET_KEY = defineSecret('PAYSTACK_SECRET_KEY');

// DB seam (so the webhook + handlers can be smoke-tested with a fake).
let _db = null;
function getDb() { if (!_db) _db = admin.database(); return _db; }
function __setDbForTests(fake) { _db = fake; }

function badRequest(message) { const e = new Error(message); e.statusCode = 400; return e; }
function statusFor(err) { return (err && Number.isInteger(err.statusCode)) ? err.statusCode : 500; }

exports.paymentsListBundles = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        await verifyAuthToken(req); // any signed-in owner may list bundles
        const bundles = await listActiveBundles(getDb());
        res.json({ result: { success: true, bundles } });
    } catch (error) {
        console.error('[paymentsListBundles] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

exports.paymentsInitTopup = onRequest({ secrets: [PAYSTACK_SECRET_KEY] }, async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        const uid = decoded.uid;
        const email = decoded.email || `${uid}@noemail.local`;
        const data = req.body.data || req.body || {};
        const { bundleId } = data;
        if (!bundleId || typeof bundleId !== 'string') throw badRequest('Invalid request: bundleId is required');

        const bundle = await resolveBundle(getDb(), bundleId); // server-derived price; throws if unknown/inactive
        const { authorizationUrl, reference } = await paystack.initializeTransaction({
            secret: PAYSTACK_SECRET_KEY.value(), email, amountZarCents: bundle.zarChargeCents,
            metadata: { uid, bundleId },
        });
        res.json({ result: { success: true, authorizationUrl, reference } });
    } catch (error) {
        console.error('[paymentsInitTopup] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

exports.paymentsClaimTrial = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        const out = await claimTrial({ db: getDb(), ledger, uid: decoded.uid });
        res.json({ result: { success: true, ...out } });
    } catch (error) {
        console.error('[paymentsClaimTrial] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

// Webhook: NO Bearer auth — gated by the HMAC signature over the RAW body instead.
exports.paystackWebhook = onRequest({ secrets: [PAYSTACK_SECRET_KEY] }, async (req, res) => {
    try {
        const raw = req.rawBody; // Firebase provides the unparsed body Buffer
        const sig = req.get('x-paystack-signature');
        if (!verifyPaystackSignature(raw, sig, PAYSTACK_SECRET_KEY.value())) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
        const event = req.body; // already parsed JSON
        if (event && event.event === 'charge.success') {
            await processChargeSuccess({ db: getDb(), ledger, event });
        }
        // Always 200 a verified event so Paystack stops retrying (idempotency handles dupes).
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('[paystackWebhook] Error:', error.message);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

exports.__setDbForTests = __setDbForTests;
