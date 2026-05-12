/**
 * ROSS Starter Templates — Tier Curation Script (Phase 6 PR 1B)
 *
 * One-off, idempotent update of existing production templates to flip 8 of 13
 * from tier:'free' to tier:'all-in' per the curated starter library split.
 * Matches by `name` (the only stable identifier across environments — templateId
 * is generated per-environment by the original seed).
 *
 * Free (untouched): Daily Opening Checklist, Daily Closing Checklist,
 *   Weekly Deep Clean Checklist, Monthly Food Cost Review, Health & Safety Audit.
 *
 * All-in (this script flips): the 8 names in TEMPLATES_TO_FLIP below.
 *
 * Run once: node functions/seeds/ross-templates-curate-tiers.js
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator running.
 * Safe to re-run — sets the same value each time.
 *
 * See: docs/plans/2026-05-12-ross-tier-curation-design.md
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
    });
}

const db = admin.database();

const TEMPLATES_TO_FLIP = [
    'Certificate of Acceptability',
    'Liquor Licence Renewal',
    'Weekly Social Media Campaign',
    'Monthly Google Review Campaign',
    'Weekly Supplier Payment Run',
    'Monthly Staff Meeting',
    'Quarterly Staff Performance Review',
    'Monthly Equipment Service Check'
];

async function curateTiers() {
    console.log('Reading ross/templates...');
    const snapshot = await db.ref('ross/templates').once('value');
    const templates = snapshot.val() || {};

    const updates = {};
    const found = new Set();
    let skipped = 0;
    let flipping = 0;

    for (const [templateId, template] of Object.entries(templates)) {
        if (!template || typeof template !== 'object') continue;
        if (TEMPLATES_TO_FLIP.includes(template.name)) {
            if (template.tier === 'all-in') {
                console.log(`  Already all-in (skip): ${template.name}`);
                skipped += 1;
                found.add(template.name);
                continue;
            }
            updates[`ross/templates/${templateId}/tier`] = 'all-in';
            updates[`ross/templates/${templateId}/updatedAt`] = Date.now();
            console.log(`  Flipping → all-in: ${template.name} (${templateId})`);
            found.add(template.name);
            flipping += 1;
        }
    }

    const missing = TEMPLATES_TO_FLIP.filter(n => !found.has(n));
    if (missing.length > 0) {
        console.warn(`WARNING: ${missing.length} template name(s) not found in RTDB:`);
        missing.forEach(n => console.warn(`  - ${n}`));
    }

    if (flipping === 0) {
        console.log(`Nothing to update (${skipped} already all-in, ${missing.length} missing).`);
        process.exit(0);
    }

    console.log(`Applying ${flipping} tier flip(s) atomically...`);
    await db.ref().update(updates);
    console.log(`Done. Flipped ${flipping}, skipped ${skipped}, missing ${missing.length}.`);
    process.exit(0);
}

curateTiers().catch(err => {
    console.error('Curate failed:', err);
    process.exit(1);
});
