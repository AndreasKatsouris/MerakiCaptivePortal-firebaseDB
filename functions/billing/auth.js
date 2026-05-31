'use strict';

/**
 * Billing auth helpers. Kept billing-local (not imported from ross.js) because the
 * credit ledger is shared platform infra, not a ROSS feature — coupling its auth to
 * the ross module would be wrong. Minimal, stable surface (Bearer decode + superAdmin
 * check). A future shared `functions/auth.js` could consolidate ross's + billing's
 * copies; flagged for the reviewer.
 */

const admin = require('firebase-admin');

/** Decode the Bearer ID token from the request. Throws on a missing/invalid header. */
async function verifyAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No valid authorization header');
    }
    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) throw new Error('No token in authorization header');
    return admin.auth().verifyIdToken(idToken);
}

/** Require Super Admin (`admins/{uid}.superAdmin === true`). Returns the uid. */
async function verifySuperAdmin(decodedToken) {
    const uid = decodedToken.uid;
    const snap = await admin.database().ref(`admins/${uid}`).once('value');
    const adminData = snap.val();
    if (!adminData || !adminData.superAdmin) {
        throw new Error('Super Admin access required');
    }
    return uid;
}

module.exports = { verifyAuthToken, verifySuperAdmin };
