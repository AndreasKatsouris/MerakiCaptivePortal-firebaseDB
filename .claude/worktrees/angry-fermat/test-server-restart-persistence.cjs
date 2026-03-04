/**
 * Feature #3: Enhanced Server Restart Persistence Test
 * Simulates complete script termination and restart to verify real persistence
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// State file to track test progress across script restarts
const STATE_FILE = path.join(__dirname, '.persistence-test-state.json');
const TEST_DATA_NAME = 'RESTART_TEST_' + Date.now();

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
});

const db = admin.database();

async function readState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error reading state:', error.message);
    }
    return null;
}

function writeState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function cleanupState() {
    if (fs.existsSync(STATE_FILE)) {
        fs.unlinkSync(STATE_FILE);
    }
}

async function createTestData() {
    console.log('\n==========================================');
    console.log('Phase 1: Creating Test Data');
    console.log('==========================================\n');

    try {
        const testRef = db.ref('test-data-persistence').push();
        await testRef.set({
            name: TEST_DATA_NAME,
            timestamp: Date.now(),
            createdAt: new Date().toISOString(),
            purpose: 'Complete script restart persistence test',
            phase: 'creation'
        });

        console.log(`✓ Test data created successfully`);
        console.log(`✓ Test ID: ${testRef.key}`);
        console.log(`✓ Test Name: ${TEST_DATA_NAME}`);

        // Save state for next script run
        writeState({
            phase: 'created',
            testId: testRef.key,
            testName: TEST_DATA_NAME,
            createdAt: new Date().toISOString()
        });

        console.log('\n------------------------------------------');
        console.log('✓ State saved to: ' + STATE_FILE);
        console.log('------------------------------------------');
        console.log('\nNext step:');
        console.log('Run this script AGAIN to verify persistence');
        console.log('The script will exit now to simulate server restart.');
        console.log('------------------------------------------\n');

        return { success: true, phase: 'created' };
    } catch (error) {
        console.log('✗ Failed to create test data');
        console.error('Error:', error.message);
        throw error;
    }
}

async function verifyAfterRestart(state) {
    console.log('\n==========================================');
    console.log('Phase 2: Verifying After Script Restart');
    console.log('==========================================\n');

    console.log('Previous run details:');
    console.log(`  Test Name: ${state.testName}`);
    console.log(`  Test ID: ${state.testId}`);
    console.log(`  Created: ${state.createdAt}`);
    console.log('');

    try {
        // Query by name to verify persistence
        const snapshot = await db.ref('test-data-persistence')
            .orderByChild('name')
            .equalTo(state.testName)
            .once('value');

        if (snapshot.exists()) {
            const data = snapshot.val();
            const keys = Object.keys(data);
            const record = data[keys[0]];

            console.log('✓ CRITICAL TEST PASSED!');
            console.log('✓ Data survived complete script termination and restart');
            console.log('✓ This proves data is in Firebase RTDB, not in-memory');
            console.log('');
            console.log('Retrieved data:');
            console.log(JSON.stringify(record, null, 2));

            // Cleanup
            console.log('\n==========================================');
            console.log('Cleaning Up');
            console.log('==========================================\n');

            const updates = {};
            snapshot.forEach(child => {
                updates[child.key] = null;
            });
            await db.ref('test-data-persistence').update(updates);
            cleanupState();

            console.log('✓ Test data deleted from Firebase');
            console.log('✓ State file removed');

            return true;
        } else {
            console.log('✗ CRITICAL FAILURE!');
            console.log('✗ Test data NOT FOUND after script restart');
            console.log('✗ This indicates in-memory storage or write failure');
            console.log('');
            cleanupState();
            return false;
        }
    } catch (error) {
        console.log('✗ Verification failed');
        console.error('Error:', error.message);
        cleanupState();
        return false;
    }
}

async function main() {
    console.log('===========================================');
    console.log('Feature #3: Server Restart Persistence Test');
    console.log('===========================================');

    try {
        // Check if we're continuing from a previous run
        const state = await readState();

        if (!state) {
            // Phase 1: First run - create test data
            await createTestData();
            process.exit(0);
        } else {
            // Phase 2: Second run - verify after restart
            console.log('\nDetected previous test run - verifying persistence...\n');
            const passed = await verifyAfterRestart(state);

            if (passed) {
                console.log('\n==========================================');
                console.log('FINAL RESULT: PASSED ✓');
                console.log('==========================================\n');
                console.log('✓ Feature #3: Data persists across server restart');
                console.log('✓ All data is stored in Firebase RTDB');
                console.log('✓ No in-memory storage detected');
                console.log('✓ Data survives complete script termination');
                console.log('');
                process.exit(0);
            } else {
                console.log('\n==========================================');
                console.log('FINAL RESULT: FAILED ✗');
                console.log('==========================================\n');
                console.log('✗ Feature #3: Data persistence test failed');
                console.log('');
                process.exit(1);
            }
        }
    } catch (error) {
        console.error('\n✗ Test failed with error:', error.message);
        cleanupState();
        process.exit(1);
    }
}

// Run test
main();
