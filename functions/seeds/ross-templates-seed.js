/**
 * ROSS Starter Templates — Seed Script
 * Run once: node functions/seeds/ross-templates-seed.js
 * Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator running
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
    });
}

const db = admin.database();
const now = Date.now();

const templates = [
    {
        name: 'Certificate of Acceptability',
        category: 'compliance',
        tier: 'all-in',
        description: 'Annual CoA renewal tracking from application through to approval.',
        recurrence: 'annually',
        daysBeforeAlert: [90, 30, 7],
        tags: ['compliance', 'legal', 'annual'],
        subtasks: [
            { order: 1, title: 'Submit application to local authority', daysOffset: -90 },
            { order: 2, title: 'Schedule inspection', daysOffset: -60 },
            { order: 3, title: 'Complete inspection requirements', daysOffset: -30 },
            { order: 4, title: 'Collect certificate', daysOffset: 0 }
        ]
    },
    {
        name: 'Liquor Licence Renewal',
        category: 'compliance',
        tier: 'all-in',
        description: 'Annual liquor licence renewal with local authority.',
        recurrence: 'annually',
        daysBeforeAlert: [60, 30, 7],
        tags: ['compliance', 'legal', 'annual'],
        subtasks: [
            { order: 1, title: 'Prepare renewal application documents', daysOffset: -60 },
            { order: 2, title: 'Submit renewal application', daysOffset: -45 },
            { order: 3, title: 'Follow up with licensing board', daysOffset: -14 },
            { order: 4, title: 'Collect renewed licence', daysOffset: 0 }
        ]
    },
    {
        name: 'Health & Safety Audit',
        category: 'compliance',
        tier: 'free',
        description: 'Quarterly internal health and safety inspection checklist.',
        recurrence: 'quarterly',
        daysBeforeAlert: [14, 7, 1],
        tags: ['compliance', 'safety', 'quarterly'],
        subtasks: [
            { order: 1, title: 'Schedule audit date with manager', daysOffset: -14 },
            { order: 2, title: 'Complete kitchen safety walkthrough', daysOffset: -1 },
            { order: 3, title: 'Check first aid kit and fire extinguishers', daysOffset: -1 },
            { order: 4, title: 'File audit report', daysOffset: 0 }
        ]
    },
    {
        name: 'Weekly Compliance Sweep',
        category: 'compliance',
        tier: 'free',
        description: 'Weekly SA food-safety compliance pass: fridge/freezer temperatures, fire safety, first aid, and incident log.',
        recurrence: 'weekly',
        daysBeforeAlert: [2, 1],
        tags: ['compliance', 'safety', 'weekly'],
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
    },
    {
        name: 'Daily Opening Checklist',
        category: 'operations',
        tier: 'free',
        description: 'Standard opening procedures for front-of-house and kitchen.',
        recurrence: 'daily',
        daysBeforeAlert: [0],
        tags: ['operations', 'daily', 'opening'],
        subtasks: [
            { order: 1, title: 'Check temperatures in fridges and freezers', daysOffset: 0 },
            { order: 2, title: 'Verify mise en place is complete', daysOffset: 0 },
            { order: 3, title: 'Check opening cash float', daysOffset: 0 },
            { order: 4, title: 'Briefing with floor staff', daysOffset: 0 }
        ]
    },
    {
        name: 'Daily Closing Checklist',
        category: 'operations',
        tier: 'free',
        description: 'Standard closing procedures for front-of-house and kitchen.',
        recurrence: 'daily',
        daysBeforeAlert: [0],
        tags: ['operations', 'daily', 'closing'],
        subtasks: [
            { order: 1, title: 'Complete end-of-day cash-up', daysOffset: 0 },
            { order: 2, title: 'Verify kitchen is clean and surfaces sanitised', daysOffset: 0 },
            { order: 3, title: 'Check all appliances are off', daysOffset: 0 },
            { order: 4, title: 'Set alarm and lock up', daysOffset: 0 }
        ]
    },
    {
        name: 'Weekly Deep Clean Checklist',
        category: 'operations',
        tier: 'free',
        description: 'Comprehensive weekly deep clean of kitchen and front-of-house.',
        recurrence: 'weekly',
        daysBeforeAlert: [2, 1],
        tags: ['operations', 'weekly', 'cleaning'],
        subtasks: [
            { order: 1, title: 'Deep clean behind fryers and grills', daysOffset: 0 },
            { order: 2, title: 'Clean extractor hood filters', daysOffset: 0 },
            { order: 3, title: 'Sanitise all food preparation surfaces', daysOffset: 0 },
            { order: 4, title: 'Clean front-of-house upholstery and floors', daysOffset: 0 }
        ]
    },
    {
        name: 'Weekly Social Media Campaign',
        category: 'growth',
        tier: 'all-in',
        description: 'Plan, create, and post weekly social media content.',
        recurrence: 'weekly',
        daysBeforeAlert: [2],
        tags: ['growth', 'marketing', 'social-media'],
        subtasks: [
            { order: 1, title: 'Plan weekly content theme', daysOffset: -3 },
            { order: 2, title: 'Create images/video for posts', daysOffset: -2 },
            { order: 3, title: 'Schedule posts for the week', daysOffset: -1 },
            { order: 4, title: 'Respond to comments from previous week', daysOffset: 0 }
        ]
    },
    {
        name: 'Monthly Google Review Campaign',
        category: 'growth',
        tier: 'all-in',
        description: 'Monthly outreach to encourage satisfied guests to leave Google reviews.',
        recurrence: 'monthly',
        daysBeforeAlert: [7, 1],
        tags: ['growth', 'reviews', 'monthly'],
        subtasks: [
            { order: 1, title: 'Export top guests from platform', daysOffset: -7 },
            { order: 2, title: 'Send review request via WhatsApp/email', daysOffset: -5 },
            { order: 3, title: 'Follow up with non-responders', daysOffset: -2 },
            { order: 4, title: 'Record new reviews received', daysOffset: 0 }
        ]
    },
    {
        name: 'Monthly Food Cost Review',
        category: 'finance',
        tier: 'free',
        description: 'Monthly review of food cost percentage and supplier pricing.',
        recurrence: 'monthly',
        daysBeforeAlert: [7, 1],
        tags: ['finance', 'food-cost', 'monthly'],
        subtasks: [
            { order: 1, title: 'Pull food cost report from platform', daysOffset: -5 },
            { order: 2, title: 'Compare actual vs target food cost %', daysOffset: -3 },
            { order: 3, title: 'Review top 10 high-cost items', daysOffset: -2 },
            { order: 4, title: 'Document action plan for next month', daysOffset: 0 }
        ]
    },
    {
        name: 'Weekly Supplier Payment Run',
        category: 'finance',
        tier: 'all-in',
        description: 'Weekly review and processing of outstanding supplier invoices.',
        recurrence: 'weekly',
        daysBeforeAlert: [1],
        tags: ['finance', 'suppliers', 'weekly'],
        subtasks: [
            { order: 1, title: 'Collect all supplier invoices for the week', daysOffset: -1 },
            { order: 2, title: 'Verify invoice amounts against delivery notes', daysOffset: -1 },
            { order: 3, title: 'Process payments for approved invoices', daysOffset: 0 },
            { order: 4, title: 'File invoices and update cashflow tracker', daysOffset: 0 }
        ]
    },
    {
        name: 'Monthly Staff Meeting',
        category: 'hr',
        tier: 'all-in',
        description: 'Monthly all-staff meeting to discuss performance, updates, and goals.',
        recurrence: 'monthly',
        daysBeforeAlert: [7, 2],
        tags: ['hr', 'staff', 'monthly'],
        subtasks: [
            { order: 1, title: 'Prepare agenda', daysOffset: -7 },
            { order: 2, title: 'Share agenda with team', daysOffset: -3 },
            { order: 3, title: 'Conduct staff meeting', daysOffset: 0 },
            { order: 4, title: 'Distribute meeting notes', daysOffset: 1 }
        ]
    },
    {
        name: 'Quarterly Staff Performance Review',
        category: 'hr',
        tier: 'all-in',
        description: 'Quarterly one-on-one performance reviews for all staff members.',
        recurrence: 'quarterly',
        daysBeforeAlert: [14, 7],
        tags: ['hr', 'performance', 'quarterly'],
        subtasks: [
            { order: 1, title: 'Prepare review forms for each staff member', daysOffset: -14 },
            { order: 2, title: 'Schedule one-on-one sessions', daysOffset: -10 },
            { order: 3, title: 'Conduct performance reviews', daysOffset: -3 },
            { order: 4, title: 'File review outcomes and set goals', daysOffset: 0 }
        ]
    },
    {
        name: 'Monthly Equipment Service Check',
        category: 'maintenance',
        tier: 'all-in',
        description: 'Monthly inspection and service check of all kitchen equipment.',
        recurrence: 'monthly',
        daysBeforeAlert: [7, 1],
        tags: ['maintenance', 'equipment', 'monthly'],
        subtasks: [
            { order: 1, title: 'Inspect fryers and griddles for wear', daysOffset: -3 },
            { order: 2, title: 'Check refrigeration units and temperature logs', daysOffset: -2 },
            { order: 3, title: 'Test all gas connections and safety cutoffs', daysOffset: -1 },
            { order: 4, title: 'Log findings and schedule repairs if needed', daysOffset: 0 }
        ]
    }
];

async function seed() {
    console.log('Seeding ROSS templates...');
    for (const template of templates) {
        const id = db.ref().push().key;
        const record = {
            templateId: id,
            ...template,
            notificationChannels: ['in_app'],
            createdAt: now,
            updatedAt: now
        };
        await db.ref(`ross/templates/${id}`).set(record);
        console.log(`  Created: ${template.name}`);
    }
    console.log(`Done. ${templates.length} templates seeded.`);
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
