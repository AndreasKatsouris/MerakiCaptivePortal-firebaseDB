/**
 * Test Feature #32: Guest creation persists in Firebase RTDB
 *
 * This script creates a test guest and verifies it persists in Firebase RTDB
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

async function testGuestCreation() {
  console.log('\n==========================================');
  console.log('Feature #32: Guest Creation Persistence Test');
  console.log('==========================================\n');

  const testPhone = '+27800000001';
  const testName = 'Test Guest Alpha';
  const timestamp = new Date().toISOString();

  try {
    // Step 1: Create test guest
    console.log('Step 1: Creating test guest...');
    console.log(`  Phone: ${testPhone}`);
    console.log(`  Name: ${testName}`);

    const guestData = {
      name: testName,
      phoneNumber: testPhone,
      createdAt: timestamp,
      updatedAt: timestamp,
      consent: false,
      tier: 'Bronze',
      lastConsentPrompt: null
    };

    const guestRef = db.ref(`guests/${testPhone}`);
    await guestRef.set(guestData);
    console.log('✅ Guest created successfully\n');

    // Step 2: Verify guest exists
    console.log('Step 2: Verifying guest in Firebase RTDB...');
    const snapshot = await guestRef.once('value');

    if (!snapshot.exists()) {
      console.log('❌ ERROR: Guest not found in database!');
      return false;
    }

    const retrievedGuest = snapshot.val();
    console.log('✅ Guest found in database:');
    console.log(`  Name: ${retrievedGuest.name}`);
    console.log(`  Phone: ${retrievedGuest.phoneNumber}`);
    console.log(`  Created: ${retrievedGuest.createdAt}`);
    console.log('');

    // Step 3: Verify data matches
    console.log('Step 3: Verifying data integrity...');
    const dataMatches =
      retrievedGuest.name === testName &&
      retrievedGuest.phoneNumber === testPhone;

    if (!dataMatches) {
      console.log('❌ ERROR: Retrieved data does not match!');
      console.log('Expected:', { name: testName, phoneNumber: testPhone });
      console.log('Got:', { name: retrievedGuest.name, phoneNumber: retrievedGuest.phoneNumber });
      return false;
    }

    console.log('✅ Data integrity verified\n');

    // Step 4: Test persistence (read again after delay)
    console.log('Step 4: Testing persistence (waiting 2 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const snapshot2 = await guestRef.once('value');
    if (!snapshot2.exists()) {
      console.log('❌ ERROR: Guest disappeared from database!');
      return false;
    }

    console.log('✅ Guest still exists after delay\n');

    // Step 5: List all guests to show context
    console.log('Step 5: Listing all guests in database...');
    const allGuestsSnapshot = await db.ref('guests').once('value');
    const allGuests = allGuestsSnapshot.val() || {};
    const guestCount = Object.keys(allGuests).length;

    console.log(`Total guests in database: ${guestCount}`);
    console.log('Recent guests:');
    Object.entries(allGuests).slice(-5).forEach(([phone, guest]) => {
      console.log(`  - ${guest.name} (${phone})`);
    });
    console.log('');

    console.log('==========================================');
    console.log('✅ Feature #32 Test: PASSED');
    console.log('==========================================');
    console.log('');
    console.log('Summary:');
    console.log('- Guest created successfully in Firebase RTDB');
    console.log('- Guest data persists and can be retrieved');
    console.log('- Data integrity maintained');
    console.log('- Guest survives time delays (persistence confirmed)');
    console.log('');
    console.log('Next step: Verify guest appears in UI by refreshing browser');
    console.log('');

    return true;

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    return false;
  }
}

// Run the test
testGuestCreation()
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
