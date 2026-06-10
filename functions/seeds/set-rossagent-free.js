'use strict';
/**
 * LAUNCH-ONLY — DO NOT RUN until ROSS launch (the two wheels are on). Flips Ross to
 * PAYG-for-all by making rossAgent a Free-tier feature, then recomputes entitlements
 * so existing accounts materialize features.rossAgent. Until this runs, Ross stays
 * gated to whoever has rossAgent today (admin-granted) — i.e. the rail is dormant.
 * Run (at launch): GOOGLE_APPLICATION_CREDENTIALS=... node functions/seeds/set-rossagent-free.js
 */
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

const { recomputeEntitlements } = require('../entitlements/resolver'); // per-uid resolver (verified)

async function main() {
    const db = admin.database();
    // 1. Free tier gains rossAgent. (Tier id 'free' per subscriptionTiers.)
    await db.ref('subscriptionTiers/free/features/rossAgent').set(true);
    // 2. Recompute every account so live owners materialize features.rossAgent.
    //    There is no all-accounts helper — iterate subscriptions and call the per-uid
    //    resolver (the same call the daily recomputeExpiringEntitlements sweep makes).
    const subs = (await db.ref('subscriptions').once('value')).val() || {};
    const uids = Object.keys(subs);
    for (const uid of uids) {
        await recomputeEntitlements(uid);
    }
    console.log(`rossAgent is now a Free feature; recomputed ${uids.length} accounts.`);
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
