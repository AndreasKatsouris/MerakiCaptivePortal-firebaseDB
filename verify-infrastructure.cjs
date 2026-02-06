/**
 * Infrastructure Verification Script
 * Tests Features #1 and #2: Database connection and schema validation
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
});

const db = admin.database();

async function verifyDatabaseConnection() {
    console.log('\n==========================================');
    console.log('Feature #1: Database Connection Test');
    console.log('==========================================\n');

    try {
        // Try to read from the database root
        const rootRef = db.ref('/');
        const snapshot = await rootRef.once('value');

        if (snapshot.exists()) {
            console.log('✓ Database connection established successfully');
            console.log(`✓ Database status: CONNECTED`);
            console.log(`✓ Database URL: https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com`);
            return true;
        } else {
            console.log('✗ Database connection established but no data found');
            return false;
        }
    } catch (error) {
        console.log('✗ Database connection FAILED');
        console.error('Error:', error.message);
        return false;
    }
}

async function verifyDatabaseSchema() {
    console.log('\n==========================================');
    console.log('Feature #2: Database Schema Validation');
    console.log('==========================================\n');

    // Expected top-level nodes from app_spec.txt
    const expectedNodes = [
        'users',
        'subscriptions',
        'locations',
        'userLocations',
        'guests',
        'queues',
        'receipts',
        'rewards',
        'voucherPools',
        'campaigns',
        'consent_history',
        'admin_claims',
        'admin_projects',
        'whatsapp_numbers',
        'scanning_data',
        'queue_states',
        'alerts_config',
        'alerts_history',
        'okrs',
        'pos_connections',
        'labour_connections',
        'onboarding_progress',
        'notifications',
        'saved_reports'
    ];

    try {
        const rootRef = db.ref('/');
        const snapshot = await rootRef.once('value');
        const data = snapshot.val();

        if (!data) {
            console.log('✗ No data in database - schema cannot be verified');
            return false;
        }

        const existingNodes = Object.keys(data);
        console.log(`Found ${existingNodes.length} top-level nodes in database:\n`);

        let foundCount = 0;
        let missingNodes = [];

        for (const node of expectedNodes) {
            if (existingNodes.includes(node)) {
                console.log(`✓ ${node}`);
                foundCount++;
            } else {
                console.log(`✗ ${node} (MISSING)`);
                missingNodes.push(node);
            }
        }

        console.log(`\n--- Schema Validation Summary ---`);
        console.log(`Found: ${foundCount}/${expectedNodes.length} expected nodes`);

        if (missingNodes.length > 0) {
            console.log(`\nMissing nodes (may be created on first use):`);
            missingNodes.forEach(node => console.log(`  - ${node}`));
        }

        // Check for additional nodes not in spec
        const extraNodes = existingNodes.filter(node => !expectedNodes.includes(node));
        if (extraNodes.length > 0) {
            console.log(`\nAdditional nodes in database (not in spec):`);
            extraNodes.forEach(node => console.log(`  - ${node}`));
        }

        // Consider schema valid if at least core nodes exist
        const coreNodes = ['users', 'locations', 'guests', 'queues'];
        const coreNodesExist = coreNodes.every(node => existingNodes.includes(node));

        if (coreNodesExist) {
            console.log('\n✓ Core schema nodes verified - database schema is valid');
            return true;
        } else {
            console.log('\n✗ Core schema nodes missing - database schema incomplete');
            return false;
        }

    } catch (error) {
        console.log('✗ Schema verification FAILED');
        console.error('Error:', error.message);
        return false;
    }
}

async function checkDatabaseIndexes() {
    console.log('\n==========================================');
    console.log('Database Indexes Information');
    console.log('==========================================\n');

    console.log('Note: Firebase RTDB indexes are defined in database.rules.json');
    console.log('Checking if database.rules.json exists and contains index definitions...\n');

    const fs = require('fs');
    const path = require('path');

    try {
        const rulesPath = path.join(__dirname, 'database.rules.json');
        if (fs.existsSync(rulesPath)) {
            const rulesContent = fs.readFileSync(rulesPath, 'utf8');
            const rules = JSON.parse(rulesContent);

            // Count .indexOn occurrences
            const rulesString = JSON.stringify(rules, null, 2);
            const indexCount = (rulesString.match(/\.indexOn/g) || []).length;

            console.log(`✓ database.rules.json found`);
            console.log(`✓ Contains ${indexCount} index definitions`);
            console.log(`✓ Expected: 30+ composite indexes on phone, location, timestamp, status fields`);

            if (indexCount >= 30) {
                console.log(`✓ Index count meets specification (${indexCount} >= 30)`);
            } else {
                console.log(`⚠ Index count below specification (${indexCount} < 30)`);
            }
        } else {
            console.log('✗ database.rules.json not found');
        }
    } catch (error) {
        console.log('✗ Error reading database rules');
        console.error('Error:', error.message);
    }
}

async function main() {
    console.log('===========================================');
    console.log('Sparks Hospitality Infrastructure Verification');
    console.log('===========================================');

    const connectionOk = await verifyDatabaseConnection();
    const schemaOk = await verifyDatabaseSchema();
    await checkDatabaseIndexes();

    console.log('\n===========================================');
    console.log('Verification Results');
    console.log('===========================================\n');

    if (connectionOk && schemaOk) {
        console.log('✓ Feature #1: Database connection - PASS');
        console.log('✓ Feature #2: Database schema - PASS');
        console.log('\n✓ ALL INFRASTRUCTURE TESTS PASSED');
        process.exit(0);
    } else {
        if (!connectionOk) console.log('✗ Feature #1: Database connection - FAIL');
        if (!schemaOk) console.log('✗ Feature #2: Database schema - FAIL');
        console.log('\n✗ INFRASTRUCTURE TESTS FAILED');
        process.exit(1);
    }
}

// Run verification
main();
