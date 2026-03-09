/**
 * Register Corporate Compliance Feature in Subscription Tiers
 *
 * Adds `corporateCompliance: true` to the professional and enterprise
 * subscription tiers in Firebase RTDB so featureAccessControl.checkFeatureAccess()
 * returns hasAccess: true for those users.
 *
 * Usage:
 *   node functions/register-compliance-feature.js
 */

const admin = require('firebase-admin');
const path = require('path');

const SERVICE_ACCOUNT = path.resolve(__dirname, '../merakicaptiveportal-firebasedb-firebase-adminsdk-rzr9w-05e57db6b4.json');
const DATABASE_URL = 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com';

admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT),
  databaseURL: DATABASE_URL
});

const TIERS = ['professional', 'enterprise'];

async function registerFeature() {
  const db = admin.database();

  console.log('Registering corporateCompliance feature in tiers:', TIERS.join(', '));

  await Promise.all(
    TIERS.map(tier =>
      db.ref(`subscriptionTiers/${tier}/features/corporateCompliance`).set(true)
    )
  );

  console.log('\n✅ corporateCompliance registered successfully.');
  console.log('   Tiers updated:', TIERS.join(', '));
  process.exit(0);
}

registerFeature().catch(err => {
  console.error('❌ Registration failed:', err.message);
  process.exit(1);
});
