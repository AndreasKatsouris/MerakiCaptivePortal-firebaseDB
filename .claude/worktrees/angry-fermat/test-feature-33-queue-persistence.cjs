/**
 * Test Feature #33: Queue entry persists across refresh
 *
 * This script creates a test queue entry and verifies it persists in Firebase RTDB
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

async function testQueuePersistence() {
  console.log('\n==========================================');
  console.log('Feature #33: Queue Entry Persistence Test');
  console.log('==========================================\n');

  const testGuestName = 'Queue Test 001';
  const testGuestPhone = '+27800000002';
  const testLocationId = 'test-location-001';
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const timestamp = new Date().toISOString();

  try {
    // Step 1: Create test queue entry
    console.log('Step 1: Creating test queue entry...');
    console.log(`  Guest: ${testGuestName}`);
    console.log(`  Phone: ${testGuestPhone}`);
    console.log(`  Location: ${testLocationId}`);
    console.log(`  Date: ${today}`);

    const queueData = {
      guestName: testGuestName,
      guestPhone: testGuestPhone,
      partySize: 2,
      status: 'waiting',
      position: 1,
      estimatedWaitTime: 15,
      createdAt: timestamp,
      updatedAt: timestamp,
      locationId: testLocationId
    };

    // Queue path structure: queues/{locationId}/{date}/entries/{entryId}
    const queueRef = db.ref(`queues/${testLocationId}/${today}/entries`);
    const newEntryRef = await queueRef.push(queueData);
    const entryId = newEntryRef.key;

    console.log(`✅ Queue entry created with ID: ${entryId}\n`);

    // Step 2: Verify queue entry exists
    console.log('Step 2: Verifying queue entry in Firebase RTDB...');
    const entryRef = db.ref(`queues/${testLocationId}/${today}/entries/${entryId}`);
    const snapshot = await entryRef.once('value');

    if (!snapshot.exists()) {
      console.log('❌ ERROR: Queue entry not found in database!');
      return false;
    }

    const retrievedEntry = snapshot.val();
    console.log('✅ Queue entry found in database:');
    console.log(`  Guest Name: ${retrievedEntry.guestName}`);
    console.log(`  Phone: ${retrievedEntry.guestPhone}`);
    console.log(`  Position: ${retrievedEntry.position}`);
    console.log(`  Status: ${retrievedEntry.status}`);
    console.log(`  Created: ${retrievedEntry.createdAt}`);
    console.log('');

    // Step 3: Verify data matches
    console.log('Step 3: Verifying data integrity...');
    const dataMatches =
      retrievedEntry.guestName === testGuestName &&
      retrievedEntry.guestPhone === testGuestPhone &&
      retrievedEntry.position === 1 &&
      retrievedEntry.status === 'waiting';

    if (!dataMatches) {
      console.log('❌ ERROR: Retrieved data does not match!');
      console.log('Expected:', { guestName: testGuestName, phone: testGuestPhone, position: 1, status: 'waiting' });
      console.log('Got:', { guestName: retrievedEntry.guestName, phone: retrievedEntry.guestPhone, position: retrievedEntry.position, status: retrievedEntry.status });
      return false;
    }

    console.log('✅ Data integrity verified\n');

    // Step 4: Test persistence (read again after delay)
    console.log('Step 4: Testing persistence (waiting 2 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const snapshot2 = await entryRef.once('value');
    if (!snapshot2.exists()) {
      console.log('❌ ERROR: Queue entry disappeared from database!');
      return false;
    }

    console.log('✅ Queue entry still exists after delay\n');

    // Step 5: List all queue entries for this location/date
    console.log('Step 5: Listing all queue entries for this location/date...');
    const allEntriesSnapshot = await queueRef.once('value');
    const allEntries = allEntriesSnapshot.val() || {};
    const entryCount = Object.keys(allEntries).length;

    console.log(`Total queue entries for ${testLocationId} on ${today}: ${entryCount}`);
    console.log('Queue entries:');
    Object.entries(allEntries).forEach(([id, entry]) => {
      const highlight = id === entryId ? ' ← TEST ENTRY' : '';
      console.log(`  - ${entry.guestName} (${entry.guestPhone}) - Position: ${entry.position} - Status: ${entry.status}${highlight}`);
    });
    console.log('');

    // Step 6: Update queue metadata
    console.log('Step 6: Updating queue metadata...');
    const metadataRef = db.ref(`queues/${testLocationId}/${today}/metadata`);
    await metadataRef.set({
      totalEntries: entryCount,
      currentWaiting: entryCount,
      averageWaitTime: 15,
      lastUpdated: new Date().toISOString()
    });
    console.log('✅ Queue metadata updated\n');

    console.log('==========================================');
    console.log('✅ Feature #33 Test: PASSED');
    console.log('==========================================');
    console.log('');
    console.log('Summary:');
    console.log('- Queue entry created successfully in Firebase RTDB');
    console.log('- Queue data persists and can be retrieved');
    console.log('- Data integrity maintained (position, status, guest info)');
    console.log('- Queue entry survives time delays (persistence confirmed)');
    console.log(`- Entry stored at: queues/${testLocationId}/${today}/entries/${entryId}`);
    console.log('');
    console.log('Next step: Verify queue entry appears in UI by refreshing browser');
    console.log('');

    return true;

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  }
}

// Run the test
testQueuePersistence()
  .then(success => {
    if (success) {
      console.log('Test completed successfully!');
      process.exit(0);
    } else {
      console.log('Test failed!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
