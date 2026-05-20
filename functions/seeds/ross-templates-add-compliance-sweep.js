/**
 * ROSS Starter Templates — Add Weekly Compliance Sweep (Phase 6 stretch)
 *
 * One-off, idempotent additive script: inserts the "Weekly Compliance Sweep"
 * template into the existing production `ross/templates` node if it is not
 * already present (matched by `name`). The fresh-deploy seed
 * (`ross-templates-seed.js`) covers new environments; this script is the
 * additive path for the live prod RTDB.
 *
 * The Compliance Sweep is the first curated template that uses Phase 4e.2
 * per-subtask `inputType` + `inputConfig`. Temperature subtasks auto-flag
 * out-of-range readings; the runtime path was shipped in PR #65.
 *
 * Run once: node functions/seeds/ross-templates-add-compliance-sweep.js
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator running.
 * Safe to re-run — skips if a template with the same name already exists.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
    });
}

const db = admin.database();

const COMPLIANCE_SWEEP = {
    name: 'Weekly Compliance Sweep',
    category: 'compliance',
    tier: 'free',
    description: 'Weekly SA food-safety compliance pass: fridge/freezer temperatures, fire safety, first aid, and incident log.',
    recurrence: 'weekly',
    daysBeforeAlert: [2, 1],
    tags: ['compliance', 'safety', 'weekly'],
    notificationChannels: ['in_app'],
    subtasks: [
        {
            order: 1,
            title: 'Fridge temperature reading (target ≤ 4°C)',
            daysOffset: 0,
            inputType: 'temperature',
            inputConfig: { min: -1, max: 4, unit: 'C', requiredNote: true }
        },
        {
            order: 2,
            title: 'Freezer temperature reading (target ≤ -18°C)',
            daysOffset: 0,
            inputType: 'temperature',
            inputConfig: { min: -25, max: -18, unit: 'C', requiredNote: true }
        },
        {
            order: 3,
            title: 'Fire extinguisher service date still in date',
            daysOffset: 0,
            inputType: 'yes_no'
        },
        {
            order: 4,
            title: 'First aid kit stocked and seal intact',
            daysOffset: 0,
            inputType: 'checkbox'
        },
        {
            order: 5,
            title: 'Incidents or near-misses to log this week',
            daysOffset: 0,
            inputType: 'text',
            inputConfig: { placeholder: 'Leave blank if none', maxLength: 500 }
        }
    ]
};

async function addComplianceSweep() {
    console.log('Reading ross/templates...');
    const snapshot = await db.ref('ross/templates').once('value');
    const templates = snapshot.val() || {};

    const existing = Object.values(templates).find(
        (t) => t && typeof t === 'object' && t.name === COMPLIANCE_SWEEP.name
    );

    if (existing) {
        console.log(`  Already present (skip): ${COMPLIANCE_SWEEP.name} → templateId ${existing.templateId}`);
        return;
    }

    const id = db.ref().push().key;
    const now = Date.now();
    const record = {
        templateId: id,
        ...COMPLIANCE_SWEEP,
        createdAt: now,
        updatedAt: now
    };

    await db.ref(`ross/templates/${id}`).set(record);
    console.log(`  Created: ${COMPLIANCE_SWEEP.name} (templateId: ${id})`);
}

addComplianceSweep()
    .then(() => {
        console.log('Done.');
        process.exit(0);
    })
    .catch((err) => {
        console.error('Add failed:', err);
        process.exit(1);
    });
