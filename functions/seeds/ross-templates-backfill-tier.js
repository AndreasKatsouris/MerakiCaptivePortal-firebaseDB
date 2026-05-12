// functions/seeds/ross-templates-backfill-tier.js
/**
 * One-shot live-data backfill: write tier: 'free' to every existing
 * ross/templates/{id} record that's missing the field.
 *
 * Idempotent — re-running is safe. Records that already have `tier`
 * set (to any value) are skipped, NOT overwritten.
 *
 * Run before deploying database.rules.json changes that add
 * .validate on ross/templates/$id/tier — otherwise the rule will
 * reject existing data.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *   node functions/seeds/ross-templates-backfill-tier.js
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
    });
}

const db = admin.database();

async function backfill() {
    console.log('Reading ross/templates ...');
    const snap = await db.ref('ross/templates').once('value');
    const all = snap.val() || {};
    const ids = Object.keys(all);
    console.log(`Found ${ids.length} templates.`);

    const updates = {};
    let touched = 0;
    let skipped = 0;
    for (const id of ids) {
        if (all[id] && typeof all[id].tier === 'string') {
            skipped++;
            continue;
        }
        updates[`ross/templates/${id}/tier`] = 'free';
        touched++;
    }

    if (touched === 0) {
        console.log(`Nothing to do. ${skipped} templates already had tier set.`);
        process.exit(0);
    }

    console.log(`Writing tier: 'free' to ${touched} templates (skipping ${skipped} already-set) ...`);
    await db.ref().update(updates);
    console.log('Done.');
    process.exit(0);
}

backfill().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
