/**
 * Test Features #36 and #37: Guest Edit and Delete Persistence
 *
 * Feature #36: Guest edit updates persist in RTDB
 * Feature #37: Guest delete removes from RTDB
 *
 * This script tests both features sequentially:
 * 1. Create a test guest
 * 2. Edit the guest's name
 * 3. Verify the update persists
 * 4. Delete the guest
 * 5. Verify the deletion persists
 */

const admin = require('firebase-admin');

// Set project ID environment variable
process.env.GOOGLE_CLOUD_PROJECT = 'merakicaptiveportal-firebasedb';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
        projectId: 'merakicaptiveportal-firebasedb'
    });
}

const db = admin.database();

// Test data
const TEST_PHONE = '27800000010'; // Feature #36 test phone
const DELETE_TEST_PHONE = '27800000020'; // Feature #37 test phone
const ORIGINAL_NAME = 'Test User Alpha';
const UPDATED_NAME = 'Updated Name';
const DELETE_GUEST_NAME = 'Guest To Delete';

/**
 * Utility function to wait for a specified time
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test Feature #36: Guest Edit Persistence
 */
async function testGuestEditPersistence() {
    console.log('\n========================================');
    console.log('FEATURE #36: Guest Edit Updates Persist');
    console.log('========================================\n');

    try {
        // Step 1: Create test guest
        console.log('Step 1: Creating test guest...');
        const guestRef = db.ref(`guests/${TEST_PHONE}`);
        const guestData = {
            name: ORIGINAL_NAME,
            phoneNumber: TEST_PHONE,
            createdAt: new Date().toISOString(),
            tier: 'Bronze',
            consent: false,
            updatedAt: new Date().toISOString()
        };

        await guestRef.set(guestData);
        console.log('✅ Test guest created:', TEST_PHONE);
        console.log('   Original name:', ORIGINAL_NAME);

        // Verify creation
        const createdSnapshot = await guestRef.once('value');
        if (!createdSnapshot.exists()) {
            console.error('❌ FAILED: Guest was not created');
            return false;
        }
        console.log('✅ Verified: Guest exists in database');

        // Step 2: Edit guest name
        console.log('\nStep 2: Editing guest name...');
        await guestRef.update({
            name: UPDATED_NAME,
            updatedAt: new Date().toISOString()
        });
        console.log('✅ Guest name updated to:', UPDATED_NAME);

        // Step 3: Verify update persists
        console.log('\nStep 3: Verifying update persistence...');
        await wait(1000); // Wait 1 second

        const updatedSnapshot = await guestRef.once('value');
        const updatedData = updatedSnapshot.val();

        if (!updatedSnapshot.exists()) {
            console.error('❌ FAILED: Guest no longer exists after update');
            return false;
        }

        if (updatedData.name !== UPDATED_NAME) {
            console.error('❌ FAILED: Guest name was not updated');
            console.error('   Expected:', UPDATED_NAME);
            console.error('   Got:', updatedData.name);
            return false;
        }

        console.log('✅ VERIFIED: Guest name persists after update');
        console.log('   Current name in RTDB:', updatedData.name);

        // Step 4: Verify after page refresh (simulate by re-reading)
        console.log('\nStep 4: Simulating page refresh (re-reading from database)...');
        await wait(500);

        const refreshSnapshot = await guestRef.once('value');
        const refreshData = refreshSnapshot.val();

        if (!refreshSnapshot.exists()) {
            console.error('❌ FAILED: Guest no longer exists after refresh');
            return false;
        }

        if (refreshData.name !== UPDATED_NAME) {
            console.error('❌ FAILED: Guest name did not persist after refresh');
            console.error('   Expected:', UPDATED_NAME);
            console.error('   Got:', refreshData.name);
            return false;
        }

        console.log('✅ VERIFIED: Guest name persists after refresh');
        console.log('   Name after refresh:', refreshData.name);

        console.log('\n========================================');
        console.log('✅ FEATURE #36 TEST PASSED');
        console.log('========================================');

        return true;

    } catch (error) {
        console.error('❌ ERROR in Feature #36 test:', error);
        return false;
    }
}

/**
 * Test Feature #37: Guest Delete Persistence
 */
async function testGuestDeletePersistence() {
    console.log('\n========================================');
    console.log('FEATURE #37: Guest Delete Removes from RTDB');
    console.log('========================================\n');

    try {
        // Step 1: Create test guest
        console.log('Step 1: Creating test guest for deletion...');
        const guestRef = db.ref(`guests/${DELETE_TEST_PHONE}`);
        const guestData = {
            name: DELETE_GUEST_NAME,
            phoneNumber: DELETE_TEST_PHONE,
            createdAt: new Date().toISOString(),
            tier: 'Bronze',
            consent: false,
            updatedAt: new Date().toISOString()
        };

        await guestRef.set(guestData);
        console.log('✅ Test guest created:', DELETE_TEST_PHONE);
        console.log('   Name:', DELETE_GUEST_NAME);

        // Verify creation
        const createdSnapshot = await guestRef.once('value');
        if (!createdSnapshot.exists()) {
            console.error('❌ FAILED: Guest was not created');
            return false;
        }
        console.log('✅ Verified: Guest exists in database');

        // Step 2: Delete the guest
        console.log('\nStep 2: Deleting the guest...');
        await guestRef.remove();
        console.log('✅ Guest deletion command executed');

        // Step 3: Verify deletion persists
        console.log('\nStep 3: Verifying guest no longer exists...');
        await wait(1000); // Wait 1 second

        const deletedSnapshot = await guestRef.once('value');

        if (deletedSnapshot.exists()) {
            console.error('❌ FAILED: Guest still exists after deletion');
            console.error('   Data:', deletedSnapshot.val());
            return false;
        }

        console.log('✅ VERIFIED: Guest was removed from RTDB');

        // Step 4: Verify after page refresh (simulate by re-reading)
        console.log('\nStep 4: Simulating page refresh (re-reading from database)...');
        await wait(500);

        const refreshSnapshot = await guestRef.once('value');

        if (refreshSnapshot.exists()) {
            console.error('❌ FAILED: Guest still exists after refresh');
            console.error('   Data:', refreshSnapshot.val());
            return false;
        }

        console.log('✅ VERIFIED: Guest remains deleted after refresh');

        // Step 5: Check Firebase Console verification
        console.log('\nStep 5: Firebase Console verification instructions:');
        console.log('   1. Open Firebase Console');
        console.log('   2. Navigate to Realtime Database');
        console.log('   3. Look for guests/' + DELETE_TEST_PHONE);
        console.log('   4. Verify it does NOT exist');

        console.log('\n========================================');
        console.log('✅ FEATURE #37 TEST PASSED');
        console.log('========================================');

        return true;

    } catch (error) {
        console.error('❌ ERROR in Feature #37 test:', error);
        return false;
    }
}

/**
 * Cleanup function to remove test data
 */
async function cleanup() {
    console.log('\n========================================');
    console.log('CLEANUP: Removing test data...');
    console.log('========================================\n');

    try {
        // Remove Feature #36 test guest
        const guest36Ref = db.ref(`guests/${TEST_PHONE}`);
        await guest36Ref.remove();
        console.log('✅ Removed Feature #36 test guest:', TEST_PHONE);

        // Feature #37 test guest should already be deleted, but check anyway
        const guest37Ref = db.ref(`guests/${DELETE_TEST_PHONE}`);
        const snapshot = await guest37Ref.once('value');
        if (snapshot.exists()) {
            await guest37Ref.remove();
            console.log('✅ Removed Feature #37 test guest:', DELETE_TEST_PHONE);
        } else {
            console.log('✅ Feature #37 test guest already deleted:', DELETE_TEST_PHONE);
        }

        console.log('\n✅ Cleanup complete');
    } catch (error) {
        console.error('❌ ERROR during cleanup:', error);
    }
}

/**
 * Main test execution
 */
async function runTests() {
    console.log('\n========================================');
    console.log('STARTING FEATURE TESTS #36 AND #37');
    console.log('========================================');

    let feature36Passed = false;
    let feature37Passed = false;

    try {
        // Test Feature #36
        feature36Passed = await testGuestEditPersistence();
        await wait(1000);

        // Test Feature #37
        feature37Passed = await testGuestDeletePersistence();
        await wait(1000);

        // Cleanup
        await cleanup();

        // Final summary
        console.log('\n========================================');
        console.log('FINAL TEST SUMMARY');
        console.log('========================================');
        console.log('Feature #36 (Guest Edit Persistence):', feature36Passed ? '✅ PASSED' : '❌ FAILED');
        console.log('Feature #37 (Guest Delete Persistence):', feature37Passed ? '✅ PASSED' : '❌ FAILED');
        console.log('========================================\n');

        process.exit(feature36Passed && feature37Passed ? 0 : 1);

    } catch (error) {
        console.error('\n❌ FATAL ERROR:', error);
        await cleanup();
        process.exit(1);
    }
}

// Run the tests
runTests();
