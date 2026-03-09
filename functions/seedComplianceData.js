/**
 * Seed Compliance Data — One-off Cloud Function
 *
 * Populates /compliance/ in Firebase RTDB with entity definitions,
 * obligation definitions, and default reminder settings.
 *
 * Run once via HTTP, then remove from index.js exports.
 * Idempotent: will not overwrite existing data.
 */

const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { ENTITIES, OBLIGATIONS, DEFAULT_SETTINGS } = require('./compliance-seed-data');

/**
 * HTTP function to seed compliance data.
 * POST /seedComplianceData — seeds entities, obligations, and settings.
 * GET  /seedComplianceData — returns current seed status.
 */
exports.seedComplianceData = functions.https.onRequest(async (req, res) => {
  // Verify admin token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — Bearer token required.' });
  }

  let decoded;
  try {
    const idToken = authHeader.split('Bearer ')[1];
    decoded = await admin.auth().verifyIdToken(idToken);
    if (!decoded.admin) {
      return res.status(403).json({ error: 'Forbidden — admin access required.' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token.' });
  }

  const db = admin.database();
  const complianceRef = db.ref(`compliance/${decoded.uid}`);

  if (req.method === 'GET') {
    const snap = await complianceRef.child('entities').once('value');
    return res.json({
      seeded: snap.exists(),
      entityCount: snap.exists() ? Object.keys(snap.val()).length : 0
    });
  }

  if (req.method === 'POST') {
    const existingSnap = await complianceRef.child('entities').once('value');
    if (existingSnap.exists()) {
      return res.json({
        success: false,
        message: 'Compliance data already seeded. Delete /compliance/entities first to re-seed.'
      });
    }

    await Promise.all([
      complianceRef.child('entities').set(ENTITIES),
      complianceRef.child('obligations').set(OBLIGATIONS),
      complianceRef.child('settings').set(DEFAULT_SETTINGS)
    ]);

    return res.json({
      success: true,
      message: 'Compliance data seeded successfully.',
      counts: {
        entities: Object.keys(ENTITIES).length,
        obligations: Object.keys(OBLIGATIONS).length
      }
    });
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
});
