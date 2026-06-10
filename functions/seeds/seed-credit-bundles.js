'use strict';
/**
 * Seed billing/creditBundles. USD grants are FIXED ($20/$99/$200); the ZAR charge
 * price per bundle is operator-set — confirm the zarChargeCents below against the
 * current rand rate + desired margin BEFORE running. Idempotent (overwrites by id).
 * Run: GOOGLE_APPLICATION_CREDENTIALS=... node functions/seeds/seed-credit-bundles.js
 */
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

const BUNDLES = {
    usd20:  { usdGrantCents: 2000,  zarChargeCents: 36000,  label: '$20 of Ross credit',  active: true, sort: 1 },
    usd99:  { usdGrantCents: 9900,  zarChargeCents: 178200, label: '$99 of Ross credit',  active: true, sort: 2 },
    usd200: { usdGrantCents: 20000, zarChargeCents: 360000, label: '$200 of Ross credit', active: true, sort: 3 },
};

async function main() {
    await admin.database().ref('billing/creditBundles').update(BUNDLES);
    console.log('Seeded credit bundles:', Object.keys(BUNDLES).join(', '));
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
