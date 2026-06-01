'use strict';

/**
 * Entitlements auth helpers. Kept entitlements-local (not imported from ross.js)
 * for the same reason billing/auth.js is — entitlements is platform infra, not a
 * ROSS feature. NOTE: unlike ross.js `verifyUserOrAdmin`, reads here are NOT gated
 * on a ROSS feature flag — any authenticated user may read their OWN effective
 * entitlements. A future shared `functions/auth.js` should consolidate the three
 * copies (ross / billing / entitlements) — backlog item.
 */

const admin = require('firebase-admin');

function authError(message) {
    const err = new Error(message);
    err.statusCode = 403;
    return err;
}

/** Decode the Bearer ID token. Throws 403 on a missing/invalid header or bad token. */
async function verifyAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw authError('No valid authorization header');
    }
    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) throw authError('No token in authorization header');
    try {
        return await admin.auth().verifyIdToken(idToken);
    } catch (_err) {
        throw authError('Invalid or expired token');
    }
}

/** True if the uid is in /admins. */
async function isAdmin(uid) {
    const snap = await admin.database().ref(`admins/${uid}`).once('value');
    return !!snap.val();
}

/** Require Super Admin (`admins/{uid}.superAdmin === true`). Returns the uid. */
async function verifySuperAdmin(decodedToken) {
    const uid = decodedToken.uid;
    const snap = await admin.database().ref(`admins/${uid}`).once('value');
    const adminData = snap.val();
    if (!adminData || !adminData.superAdmin) {
        throw authError('Super Admin access required');
    }
    return uid;
}

module.exports = { verifyAuthToken, verifySuperAdmin, isAdmin };
