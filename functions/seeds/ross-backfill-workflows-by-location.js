/**
 * ROSS — Backfill the workflowsByLocation index for existing workflows.
 *
 * One-shot migration. Run after deploying the Cloud Functions / rules
 * change that introduces /ross/workflowsByLocation/{locationId}/{workflowId}.
 *
 * Walks every owner in /ross/ownerIndex, reads each workflow, and writes
 * an index entry per attached location. Idempotent: running twice writes
 * the same data.
 *
 *   Run: node functions/seeds/ross-backfill-workflows-by-location.js
 *   Requires GOOGLE_APPLICATION_CREDENTIALS env var pointing at a
 *   Firebase service account key with write access.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
    });
}

const db = admin.database();

async function main() {
    const indexSnap = await db.ref('ross/ownerIndex').once('value');
    if (!indexSnap.exists()) {
        console.log('No owners in ross/ownerIndex — nothing to backfill.');
        return;
    }

    const ownerIds = Object.keys(indexSnap.val());
    console.log(`Found ${ownerIds.length} owner(s) in ownerIndex.`);

    const updates = {};
    let workflowCount = 0;
    let entryCount = 0;

    for (const ownerId of ownerIds) {
        const wfSnap = await db.ref(`ross/workflows/${ownerId}`).once('value');
        if (!wfSnap.exists()) continue;
        const workflows = wfSnap.val() || {};

        for (const [workflowId, workflow] of Object.entries(workflows)) {
            workflowCount++;
            const locationIds = Object.keys(workflow.locations || {});
            for (const locationId of locationIds) {
                updates[`ross/workflowsByLocation/${locationId}/${workflowId}`] = ownerId;
                entryCount++;
            }
        }
    }

    if (entryCount === 0) {
        console.log('No workflow-location attachments found — nothing to write.');
        return;
    }

    console.log(`Writing ${entryCount} index entr(y/ies) for ${workflowCount} workflow(s)…`);
    await db.ref().update(updates);
    console.log('Backfill complete.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Backfill failed:', err);
        process.exit(1);
    });
