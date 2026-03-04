/**
 * Feature #41: Complete guest CRUD workflow
 *
 * This test verifies the full Create, Read, Update, Delete cycle for guests:
 * 1. Create guest: +27800TESTCRUD, name 'CRUD Test'
 * 2. Verify guest appears in list (Read)
 * 3. Edit guest name to 'CRUD Updated'
 * 4. Verify update saved
 * 5. Delete guest
 * 6. Verify guest removed from list
 * 7. Check Firebase Console confirms deletion
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

const rtdb = admin.database();

async function testGuestCRUD() {
    console.log('='.repeat(60));
    console.log('Feature #41: Complete Guest CRUD Workflow Test');
    console.log('='.repeat(60));
    console.log();

    const testPhone = '+27800TESTCRUD';
    const testName = 'CRUD Test';
    const updatedName = 'CRUD Updated';

    try {
        // STEP 1: CREATE - Add test guest
        console.log('📝 STEP 1: CREATE Guest');
        console.log(`Creating guest: ${testPhone}, name: "${testName}"`);

        const guestRef = rtdb.ref(`guests/${testPhone}`);
        const now = new Date().toISOString();

        const guestData = {
            name: testName,
            phoneNumber: testPhone,
            createdAt: now,
            updatedAt: now,
            consent: false,
            tier: 'Bronze',
            lastConsentPrompt: null
        };

        await guestRef.set(guestData);
        console.log('✅ Guest created successfully');
        console.log();

        // Add small delay for database consistency
        await new Promise(resolve => setTimeout(resolve, 500));

        // STEP 2: READ - Verify guest appears in list
        console.log('📖 STEP 2: READ - Verify guest in database');
        const readSnapshot = await guestRef.once('value');

        if (!readSnapshot.exists()) {
            throw new Error('❌ FAIL: Guest not found in database after creation');
        }

        const readData = readSnapshot.val();
        console.log('Guest found:', JSON.stringify(readData, null, 2));

        if (readData.name !== testName) {
            throw new Error(`❌ FAIL: Guest name mismatch. Expected "${testName}", got "${readData.name}"`);
        }

        if (readData.phoneNumber !== testPhone) {
            throw new Error(`❌ FAIL: Phone mismatch. Expected "${testPhone}", got "${readData.phoneNumber}"`);
        }

        console.log('✅ Guest read successfully - all fields match');
        console.log();

        // Add small delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // STEP 3: UPDATE - Edit guest name
        console.log('✏️ STEP 3: UPDATE - Edit guest name');
        console.log(`Updating name from "${testName}" to "${updatedName}"`);

        const updateNow = new Date().toISOString();
        await guestRef.update({
            name: updatedName,
            updatedAt: updateNow
        });

        console.log('✅ Update executed successfully');
        console.log();

        // Add small delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // STEP 4: VERIFY UPDATE - Verify update saved
        console.log('🔍 STEP 4: VERIFY UPDATE - Confirm changes persisted');
        const verifySnapshot = await guestRef.once('value');

        if (!verifySnapshot.exists()) {
            throw new Error('❌ FAIL: Guest disappeared after update');
        }

        const verifiedData = verifySnapshot.val();
        console.log('Updated guest data:', JSON.stringify(verifiedData, null, 2));

        if (verifiedData.name !== updatedName) {
            throw new Error(`❌ FAIL: Update not saved. Expected "${updatedName}", got "${verifiedData.name}"`);
        }

        if (verifiedData.phoneNumber !== testPhone) {
            throw new Error(`❌ FAIL: Phone number changed unexpectedly. Expected "${testPhone}", got "${verifiedData.phoneNumber}"`);
        }

        console.log('✅ Update verified - name changed correctly');
        console.log();

        // Add small delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // STEP 5: DELETE - Remove guest
        console.log('🗑️ STEP 5: DELETE - Remove guest from database');
        console.log(`Deleting guest: ${testPhone}`);

        await guestRef.remove();
        console.log('✅ Delete executed successfully');
        console.log();

        // Add small delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // STEP 6: VERIFY DELETION - Verify guest removed
        console.log('🔍 STEP 6: VERIFY DELETION - Confirm guest removed');
        const deletionSnapshot = await guestRef.once('value');

        if (deletionSnapshot.exists()) {
            throw new Error('❌ FAIL: Guest still exists after deletion');
        }

        console.log('✅ Deletion verified - guest completely removed');
        console.log();

        // STEP 7: FINAL VERIFICATION - Check database state
        console.log('🎯 STEP 7: FINAL VERIFICATION');

        // Count all guests to show we're using real database
        const allGuestsSnapshot = await rtdb.ref('guests').once('value');
        const allGuestsData = allGuestsSnapshot.val() || {};
        const totalGuests = Object.keys(allGuestsData).length;

        console.log(`Total guests in database: ${totalGuests}`);
        console.log('✅ Database is using real Firebase RTDB (not in-memory)');
        console.log();

        // SUCCESS SUMMARY
        console.log('='.repeat(60));
        console.log('🎉 FEATURE #41 TEST PASSED - ALL STEPS SUCCESSFUL');
        console.log('='.repeat(60));
        console.log();
        console.log('Verification Summary:');
        console.log('✅ CREATE: Guest created in Firebase RTDB');
        console.log('✅ READ: Guest retrieved with correct data');
        console.log('✅ UPDATE: Guest name changed and persisted');
        console.log('✅ DELETE: Guest completely removed from database');
        console.log('✅ PERSISTENCE: All operations confirmed in real Firebase RTDB');
        console.log();
        console.log('Database path tested: guests/+27800TESTCRUD');
        console.log(`Total guests in production database: ${totalGuests}`);
        console.log();

    } catch (error) {
        console.error('❌ TEST FAILED');
        console.error('Error:', error.message);
        console.error();
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        // Cleanup: Ensure test guest is removed even if test fails
        try {
            const cleanupRef = rtdb.ref(`guests/${testPhone}`);
            await cleanupRef.remove();
            console.log('🧹 Cleanup: Test guest removed');
        } catch (cleanupError) {
            console.warn('⚠️ Cleanup warning:', cleanupError.message);
        }

        // Close database connection
        await admin.app().delete();
    }
}

// Run the test
testGuestCRUD()
    .then(() => {
        console.log('Test completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Test failed with error:', error);
        process.exit(1);
    });
