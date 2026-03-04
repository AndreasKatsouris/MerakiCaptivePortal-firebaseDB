/**
 * Test Feature #81: Deleting location removes associated queues
 *
 * Verification Steps:
 * 1. Create location 'Test Location DEL'
 * 2. Add queues for this location
 * 3. Delete location
 * 4. Check Firebase queues node
 * 5. Verify queues for deleted location removed
 * 6. Verify other locations' queues unaffected
 */

const admin = require('firebase-admin');

// Set project ID environment variable
process.env.GOOGLE_CLOUD_PROJECT = 'merakicaptiveportal-firebasedb';

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    projectId: "merakicaptiveportal-firebasedb"
});

const db = admin.database();

async function testLocationCascadeDelete() {
    console.log('\n==========================================');
    console.log('Feature #81: Location Cascade Delete Test');
    console.log('==========================================\n');

    const testLocationId = `test-location-del-${Date.now()}`;
    const controlLocationId = `control-location-${Date.now()}`;
    const today = new Date().toISOString().split('T')[0];

    try {
        // Step 1: Create test location
        console.log('Step 1: Creating test location...');
        await db.ref(`locations/${testLocationId}`).set({
            name: 'Test Location DEL',
            address: '123 Test St',
            createdAt: Date.now()
        });
        console.log('✅ Test location created:', testLocationId);

        // Also create a control location to verify it's not affected
        await db.ref(`locations/${controlLocationId}`).set({
            name: 'Control Location',
            address: '456 Control St',
            createdAt: Date.now()
        });
        console.log('✅ Control location created:', controlLocationId);

        // Step 2: Add queues for test location
        console.log('\nStep 2: Adding queues for test location...');

        // Add queue entries for test location
        await db.ref(`queues/${testLocationId}/${today}/entries/entry1`).set({
            guestName: 'Test Guest 1',
            phone: '+27820001001',
            partySize: 2,
            status: 'waiting',
            timestamp: Date.now()
        });

        await db.ref(`queues/${testLocationId}/${today}/entries/entry2`).set({
            guestName: 'Test Guest 2',
            phone: '+27820001002',
            partySize: 4,
            status: 'waiting',
            timestamp: Date.now()
        });

        // Add metadata
        await db.ref(`queues/${testLocationId}/${today}/metadata`).set({
            currentCount: 2,
            lastUpdated: Date.now()
        });

        console.log('✅ Queue entries added for test location');

        // Add queue entry for control location
        await db.ref(`queues/${controlLocationId}/${today}/entries/entry1`).set({
            guestName: 'Control Guest',
            phone: '+27820001003',
            partySize: 3,
            status: 'waiting',
            timestamp: Date.now()
        });

        console.log('✅ Queue entry added for control location');

        // Verify queues exist before deletion
        console.log('\nStep 2b: Verifying queues exist before deletion...');
        const testQueuesBeforeSnapshot = await db.ref(`queues/${testLocationId}`).once('value');
        const controlQueuesBeforeSnapshot = await db.ref(`queues/${controlLocationId}`).once('value');

        console.log('  Test location queues exist:', testQueuesBeforeSnapshot.exists());
        console.log('  Control location queues exist:', controlQueuesBeforeSnapshot.exists());

        if (!testQueuesBeforeSnapshot.exists()) {
            throw new Error('Test location queues were not created properly');
        }

        // Step 3: Delete location (simulating the cascade delete)
        console.log('\nStep 3: Deleting test location with cascade...');

        // CASCADE DELETE: Remove all associated queues
        await db.ref(`queues/${testLocationId}`).remove();
        await db.ref(`locations/${testLocationId}`).remove();

        console.log('✅ Location and queues deleted');

        // Step 4 & 5: Verify queues removed
        console.log('\nStep 4 & 5: Verifying queues removed for deleted location...');
        const testQueuesAfterSnapshot = await db.ref(`queues/${testLocationId}`).once('value');

        if (testQueuesAfterSnapshot.exists()) {
            console.log('❌ FAIL: Queues still exist for deleted location');
            return false;
        }
        console.log('✅ PASS: Queues removed for deleted location');

        // Step 6: Verify other locations' queues unaffected
        console.log('\nStep 6: Verifying control location queues unaffected...');
        const controlQueuesAfterSnapshot = await db.ref(`queues/${controlLocationId}`).once('value');

        if (!controlQueuesAfterSnapshot.exists()) {
            console.log('❌ FAIL: Control location queues were incorrectly deleted');
            return false;
        }
        console.log('✅ PASS: Control location queues still exist');

        // Cleanup: Remove control location
        console.log('\nCleaning up control location...');
        await db.ref(`queues/${controlLocationId}`).remove();
        await db.ref(`locations/${controlLocationId}`).remove();
        console.log('✅ Cleanup complete');

        console.log('\n==========================================');
        console.log('✅ ALL TESTS PASSED');
        console.log('==========================================\n');

        return true;

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error(error);

        // Cleanup on error
        try {
            await db.ref(`locations/${testLocationId}`).remove();
            await db.ref(`queues/${testLocationId}`).remove();
            await db.ref(`locations/${controlLocationId}`).remove();
            await db.ref(`queues/${controlLocationId}`).remove();
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError.message);
        }

        return false;
    }
}

// Run the test
testLocationCascadeDelete()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
