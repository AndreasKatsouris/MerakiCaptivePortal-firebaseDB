#!/usr/bin/env node

/**
 * verify-database-schema.js
 *
 * Verifies Firebase Realtime Database schema structure matches specification
 * Used for Feature #2 regression testing
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

const db = admin.database();

// Expected top-level nodes from app specification
const EXPECTED_SCHEMA_NODES = [
    'users',
    'subscriptions',
    'locations',
    'guests',
    'queues',
    'receipts',
    'rewards',
    'campaigns',
    'bookings',
    'vouchers',
    'wifiLogins',
    'location-whatsapp-mapping',
    'whatsapp-numbers'
];

async function verifySchemaStructure() {
    console.log('========================================');
    console.log('Firebase RTDB Schema Verification');
    console.log('========================================\n');

    try {
        // Connect to database
        console.log('🔄 Connecting to Firebase Realtime Database...');
        const rootRef = db.ref('/');
        const snapshot = await rootRef.once('value');

        if (!snapshot.exists()) {
            console.log('❌ ERROR: Database is empty!');
            return false;
        }

        console.log('✅ Database connection successful\n');

        // Get actual top-level nodes
        const actualNodes = Object.keys(snapshot.val() || {});
        console.log('📋 Top-level nodes found:', actualNodes.length);
        console.log('   ', actualNodes.join(', '));
        console.log('');

        // Check for expected nodes
        console.log('🔍 Verifying expected schema nodes...\n');
        let allPresent = true;
        const missingNodes = [];
        const extraNodes = [];

        for (const expectedNode of EXPECTED_SCHEMA_NODES) {
            if (actualNodes.includes(expectedNode)) {
                console.log(`   ✅ ${expectedNode}`);
            } else {
                console.log(`   ❌ ${expectedNode} - MISSING`);
                missingNodes.push(expectedNode);
                allPresent = false;
            }
        }

        // Check for unexpected nodes
        for (const actualNode of actualNodes) {
            if (!EXPECTED_SCHEMA_NODES.includes(actualNode)) {
                extraNodes.push(actualNode);
            }
        }

        if (extraNodes.length > 0) {
            console.log('\n⚠️  Additional nodes found (not in specification):');
            extraNodes.forEach(node => console.log(`   - ${node}`));
        }

        // Summary
        console.log('\n========================================');
        console.log('Schema Verification Summary');
        console.log('========================================');
        console.log(`Expected nodes: ${EXPECTED_SCHEMA_NODES.length}`);
        console.log(`Found nodes: ${actualNodes.length}`);
        console.log(`Missing nodes: ${missingNodes.length}`);
        console.log(`Extra nodes: ${extraNodes.length}`);
        console.log('');

        if (allPresent && missingNodes.length === 0) {
            console.log('✅ PASS: All required schema nodes are present');
            return true;
        } else {
            console.log('❌ FAIL: Schema verification failed');
            if (missingNodes.length > 0) {
                console.log('\nMissing nodes:');
                missingNodes.forEach(node => console.log(`   - ${node}`));
            }
            return false;
        }

    } catch (error) {
        console.error('❌ ERROR during schema verification:', error);
        return false;
    } finally {
        // Clean up
        await admin.app().delete();
    }
}

// Run verification
verifySchemaStructure()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
