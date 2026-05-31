/**
 * Seed the billing price table — Phase 7 ① Credit Ledger.
 *
 * Writes billing/priceTable (server-side Admin SDK only — billing/* is rule-locked).
 * USD-denominated: no FX node. Cost = USD rate × markup.
 *
 * Usage:
 *   node functions/seeds/seed-price-table.js
 *
 * Rates below are the published Anthropic USD-per-Mtok prices confirmed
 * 2026-05-31. CONFIRM these (and the markup) before running against prod — they
 * drive every charge. Edit the CONFIG block to change them.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

// ----------------------------------------------------------------------------
// CONFIG — confirm before running.
// ----------------------------------------------------------------------------
const CONFIG = {
    markup: 1.30, // global passthrough multiplier on wholesale USD cost
    models: {
        'claude-sonnet-4-6': {
            usdPerMtokInput: 3,
            usdPerMtokOutput: 15,
            cacheWriteMult: 1.25,
            cacheReadMult: 0.10,
        },
        'claude-haiku-4-5': {
            usdPerMtokInput: 1,
            usdPerMtokOutput: 5,
            cacheWriteMult: 1.25,
            cacheReadMult: 0.10,
        },
    },
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
});

async function seedPriceTable() {
    const priceTable = {
        markup: CONFIG.markup,
        updatedAt: Date.now(),
        models: CONFIG.models,
    };
    await admin.database().ref('billing/priceTable').set(priceTable);
    console.log('[OK] Seeded billing/priceTable:');
    console.log(JSON.stringify(priceTable, null, 2));
}

seedPriceTable()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[FAIL] Seed failed:', err);
        process.exit(1);
    });
