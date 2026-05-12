/**
 * One-off setup: set ross/config/firstWorkflowTemplateId to the templateId
 * of the "Daily Opening Checklist" seed template. Run once per environment
 * (local emulator, preview, prod) after deploying the day-zero seed code.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *     node functions/seeds/ross-config-set-first-workflow.js
 *
 * Without a service account, follow the firebase-CLI patch path from the
 * 2026-05-12 LESSONS entry:
 *   MSYS_NO_PATHCONV=1 firebase database:get /ross/templates > snapshot.json
 *   # extract templateId for "Daily Opening Checklist", build patch JSON
 *   MSYS_NO_PATHCONV=1 firebase database:update /ross/config patch.json --force
 *
 * The script is idempotent — re-running writes the same templateId.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
    });
}

const SEED_TEMPLATE_NAME = 'Daily Opening Checklist';

async function run() {
    const snap = await admin.database().ref('ross/templates').once('value');
    const templates = snap.val() || {};
    const match = Object.entries(templates).find(([, t]) => t && t.name === SEED_TEMPLATE_NAME);
    if (!match) {
        console.error(`No template named "${SEED_TEMPLATE_NAME}" found. Run functions/seeds/ross-templates-seed.js first.`);
        process.exit(1);
    }
    const [templateId, template] = match;
    if (template.tier && template.tier !== 'free') {
        console.error(`Template "${SEED_TEMPLATE_NAME}" has tier="${template.tier}". Seed pointer must reference a Free template.`);
        process.exit(1);
    }
    await admin.database().ref('ross/config/firstWorkflowTemplateId').set(templateId);
    console.log(`Set ross/config/firstWorkflowTemplateId = ${templateId} (template: ${template.name})`);
    process.exit(0);
}

run().catch((err) => {
    console.error('Setup failed:', err);
    process.exit(1);
});
