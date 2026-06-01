'use strict';

/**
 * Phase 7 ④a Entitlement CFs (thin wrappers over the resolver).
 *
 * Pattern mirrors the ROSS / billing CFs: onRequest + CORS allowlist + Bearer auth,
 * POST-only, `res.json({ result: { success, ... } })`, typed 403/400/500 mapping.
 *
 * Tier/add-on mutations are superAdmin-only in v1 (a self-serve tier change with no
 * payment gate would re-open the free-self-upgrade vector this work closes). The
 * resolver is the SOLE writer of materialized features/limits — these CFs only set
 * the INPUTS (tier, add-on records) then call recomputeEntitlements.
 *
 * CF-level (HTTP shell / auth) tests are deferred to emulator smoke, consistent with
 * the billing CFs; the resolver core is unit-tested (22 tests).
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { corsOptions } = require('../cors-allowlist');
const cors = require('cors')(corsOptions);

const resolver = require('./resolver');
const { ADDON_CATALOG, subPath, addOnsPath } = require('./constants');
const { verifyAuthToken, verifySuperAdmin, isAdmin } = require('./auth');

function badRequest(message) {
    const err = new Error(message);
    err.statusCode = 400;
    return err;
}
function statusFor(err) {
    if (err && Number.isInteger(err.statusCode)) return err.statusCode;
    return 500;
}
const db = () => admin.database();

/**
 * entitlementSetTier — superAdmin sets a user's base tier, then recomputes.
 * Body: { uid, tierId }.
 */
exports.entitlementSetTier = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        await verifySuperAdmin(decoded);

        const data = req.body.data || req.body || {};
        const { uid, tierId } = data;
        if (!uid || typeof uid !== 'string') throw badRequest('Invalid request: uid is required');
        if (!tierId || typeof tierId !== 'string') throw badRequest('Invalid request: tierId is required');

        const tierSnap = await db().ref(`subscriptionTiers/${tierId}`).once('value');
        if (!tierSnap.exists()) throw badRequest(`Invalid request: unknown tierId '${tierId}'`);

        await db().ref(subPath(uid)).update({ tier: tierId, tierId });
        const effective = await resolver.recomputeEntitlements(uid);
        res.json({ result: { success: true, uid, effective } });
    } catch (error) {
        console.error('[entitlementSetTier] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

/**
 * entitlementGrantAddOn — superAdmin attaches a catalog add-on to a user, then recomputes.
 * Body: { uid, addOnId, expiresAt? }.
 */
exports.entitlementGrantAddOn = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        const grantedBy = await verifySuperAdmin(decoded);

        const data = req.body.data || req.body || {};
        const { uid, addOnId, expiresAt } = data;
        if (!uid || typeof uid !== 'string') throw badRequest('Invalid request: uid is required');
        if (!addOnId || typeof addOnId !== 'string') throw badRequest('Invalid request: addOnId is required');
        if (expiresAt != null && !Number.isInteger(expiresAt)) throw badRequest('Invalid request: expiresAt must be epoch ms');

        const catSnap = await db().ref(`${ADDON_CATALOG}/${addOnId}`).once('value');
        const addOn = catSnap.val();
        if (!addOn || addOn.active !== true) throw badRequest(`Invalid request: unknown or inactive addOnId '${addOnId}'`);

        await db().ref(`${addOnsPath(uid)}/${addOnId}`).set({
            addOnId,
            status: 'active',
            grantedBy,
            activatedAt: Date.now(),
            expiresAt: expiresAt != null ? expiresAt : null,
        });
        const effective = await resolver.recomputeEntitlements(uid);
        res.json({ result: { success: true, uid, addOnId, effective } });
    } catch (error) {
        console.error('[entitlementGrantAddOn] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

/**
 * entitlementCancelAddOn — superAdmin cancels an add-on (never yanks active usage;
 * just stops the delta), then recomputes. Body: { uid, addOnId }.
 */
exports.entitlementCancelAddOn = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        await verifySuperAdmin(decoded);

        const data = req.body.data || req.body || {};
        const { uid, addOnId } = data;
        if (!uid || typeof uid !== 'string') throw badRequest('Invalid request: uid is required');
        if (!addOnId || typeof addOnId !== 'string') throw badRequest('Invalid request: addOnId is required');

        await db().ref(`${addOnsPath(uid)}/${addOnId}/status`).set('cancelled');
        const effective = await resolver.recomputeEntitlements(uid);
        res.json({ result: { success: true, uid, addOnId, effective } });
    } catch (error) {
        console.error('[entitlementCancelAddOn] Error:', error.message);
        res.status(statusFor(error)).json({ error: error.message });
    }
}));

/**
 * entitlementGetEffective — read effective entitlements. Self-scoped: a non-admin
 * may only read their OWN uid; an admin may read any uid. Body: { uid? }.
 */
exports.entitlementGetEffective = onRequest(async (req, res) => cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const decoded = await verifyAuthToken(req);
        const data = req.body.data || req.body || {};
        const targetUid = (data.uid && typeof data.uid === 'string') ? data.uid : decoded.uid;
        if (targetUid !== decoded.uid && !(await isAdmin(decoded.uid))) {
            throw badRequest('Forbidden: cannot read another user\'s entitlements');
        }
        const snap = await db().ref(subPath(targetUid)).once('value');
        const sub = snap.val() || {};
        res.json({ result: { success: true, uid: targetUid, features: sub.features || {}, limits: sub.limits || {}, addOns: sub.addOns || {} } });
    } catch (error) {
        console.error('[entitlementGetEffective] Error:', error.message);
        // a "Forbidden" badRequest is logically a 403; map it explicitly
        const code = /Forbidden/.test(error.message) ? 403 : statusFor(error);
        res.status(code).json({ error: error.message });
    }
}));

/**
 * recomputeExpiringEntitlements — daily sweep that re-materializes every subscription
 * so time-bound add-ons (and expired subscriptions) drop on schedule. Idempotent.
 */
exports.recomputeExpiringEntitlements = onSchedule(
    { schedule: 'every day 03:00', timeZone: 'Africa/Johannesburg' },
    async () => {
        const snap = await admin.database().ref('subscriptions').once('value');
        const subs = snap.val() || {};
        const uids = Object.keys(subs);
        let ok = 0;
        for (const uid of uids) {
            try {
                await resolver.recomputeEntitlements(uid);
                ok += 1;
            } catch (err) {
                console.error(`[recomputeExpiringEntitlements] ${uid} failed:`, err.message);
            }
        }
        console.log(`[recomputeExpiringEntitlements] recomputed ${ok}/${uids.length} subscriptions`);
    },
);
