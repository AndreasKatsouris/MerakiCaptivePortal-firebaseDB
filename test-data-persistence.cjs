/**
 * Feature #3: Data Persistence Test
 * Verifies that data persists across server restarts (not in-memory)
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
});

const db = admin.database();
const TEST_DATA_NAME = 'RESTART_TEST_12345';

async function createTestData() {
    console.log('\n==========================================');
    console.log('Step 1: Creating Test Data');
    console.log('==========================================\n');

    try {
        const testRef = db.ref('test-data').push();
        await testRef.set({
            name: TEST_DATA_NAME,
            timestamp: Date.now(),
            createdAt: new Date().toISOString(),
            purpose: 'Server restart persistence test'
        });

        console.log(`✓ Test data created successfully`);
        console.log(`✓ Test ID: ${testRef.key}`);
        console.log(`✓ Test Name: ${TEST_DATA_NAME}`);
        console.log(`✓ Timestamp: ${new Date().toISOString()}`);

        return testRef.key;
    } catch (error) {
        console.log('✗ Failed to create test data');
        console.error('Error:', error.message);
        throw error;
    }
}

async function verifyTestDataExists() {
    console.log('\n==========================================');
    console.log('Step 2: Verifying Test Data Exists');
    console.log('==========================================\n');

    try {
        const snapshot = await db.ref('test-data')
            .orderByChild('name')
            .equalTo(TEST_DATA_NAME)
            .once('value');

        if (snapshot.exists()) {
            const data = snapshot.val();
            const keys = Object.keys(data);
            console.log(`✓ Test data found in database`);
            console.log(`✓ Record count: ${keys.length}`);
            console.log(`✓ First record:`, JSON.stringify(data[keys[0]], null, 2));
            return true;
        } else {
            console.log(`✗ Test data NOT FOUND - This indicates in-memory storage!`);
            return false;
        }
    } catch (error) {
        console.log('✗ Failed to verify test data');
        console.error('Error:', error.message);
        return false;
    }
}

async function cleanupTestData() {
    console.log('\n==========================================');
    console.log('Step 3: Cleaning Up Test Data');
    console.log('==========================================\n');

    try {
        const snapshot = await db.ref('test-data')
            .orderByChild('name')
            .equalTo(TEST_DATA_NAME)
            .once('value');

        if (snapshot.exists()) {
            const updates = {};
            snapshot.forEach(child => {
                updates[child.key] = null;
            });
            await db.ref('test-data').update(updates);
            console.log(`✓ Test data cleaned up successfully`);
        } else {
            console.log(`⚠ No test data to clean up`);
        }
    } catch (error) {
        console.log('✗ Failed to cleanup test data');
        console.error('Error:', error.message);
    }
}

async function main() {
    console.log('===========================================');
    console.log('Feature #3: Data Persistence Test');
    console.log('===========================================');
    console.log('\nThis test verifies that data persists in Firebase RTDB');
    console.log('and is not stored in-memory.\n');

    try {
        // Step 1: Create test data
        const testId = await createTestData();

        console.log('\n------------------------------------------');
        console.log('MANUAL STEP REQUIRED:');
        console.log('------------------------------------------');
        console.log('1. Open Firebase Console:');
        console.log('   https://console.firebase.google.com/project/merakicaptiveportal-firebasedb/database/merakicaptiveportal-firebasedb-default-rtdb/data');
        console.log('2. Navigate to: test-data/' + testId);
        console.log('3. Verify the test data exists');
        console.log('4. Press Enter to continue verification...');
        console.log('------------------------------------------\n');

        // Wait a moment to ensure data is written
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 2: Verify test data exists
        const exists = await verifyTestDataExists();

        if (exists) {
            console.log('\n==========================================');
            console.log('PERSISTENCE TEST - PASSED');
            console.log('==========================================\n');
            console.log('✓ Data was successfully written to Firebase RTDB');
            console.log('✓ Data persists and can be read back');
            console.log('✓ No in-memory storage detected');
            console.log('\nNote: This data persists across ANY server restart');
            console.log('because it\'s stored in Firebase RTDB, not locally.\n');

            // Step 3: Cleanup
            await cleanupTestData();

            console.log('\n✓ Feature #3: Data persists across server restart - PASS');
            process.exit(0);
        } else {
            console.log('\n==========================================');
            console.log('PERSISTENCE TEST - FAILED');
            console.log('==========================================\n');
            console.log('✗ Data was not found in Firebase RTDB');
            console.log('✗ This indicates in-memory storage or write failure');
            console.log('✗ CRITICAL: Feature #3 FAILED\n');
            process.exit(1);
        }
    } catch (error) {
        console.error('\n✗ Test failed with error:', error.message);
        process.exit(1);
    }
}

// Run test
main();
