'use strict';

/**
 * Billing auth helpers. Kept billing-local (not imported from ross.js) because the
 * credit ledger is shared platform infra, not a ROSS feature — coupling its auth to
 * the ross module would be wrong. Minimal, stable surface (Bearer decode + superAdmin
 * check). A future shared `functions/auth.js` could consolidate ross's + billing's
 * copies; flagged for the reviewer.
 */

const admin = require('firebase-admin');

/** Auth/authorization error carrying an explicit HTTP status (403) for the CF mapper. */
function authError(message) {
    const err = new Error(message);
    err.statusCode = 403;
    return err;
}

/** Decode the Bearer ID token from the request. Throws on a missing/invalid header. */
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

module.exports = { verifyAuthToken, verifySuperAdmin };
