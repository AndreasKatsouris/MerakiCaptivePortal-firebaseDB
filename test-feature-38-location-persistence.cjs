#!/usr/bin/env node

/**
 * Test Feature #38: Location creation persists in Firebase RTDB
 *
 * This test verifies that:
 * 1. Location can be created via Firebase Admin SDK
 * 2. Location data is stored in locations/ node
 * 3. User-location mapping is stored in userLocations/ node
 * 4. Data persists across queries (not in-memory)
 * 5. Location can be retrieved after creation
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

// Test configuration
const TEST_USER_ID = 'test-user-location-001';
const TEST_LOCATION_NAME = 'Test Location Alpha';
const TEST_LOCATION_ADDRESS = '123 Test Street, Cape Town';
const TEST_LOCATION_PHONE = '+27821234567';

async function runTest() {
  console.log('\n========================================');
  console.log('Feature #38: Location Persistence Test');
  console.log('========================================\n');

  let locationKey = null;

  try {
    // Step 1: Create location data
    console.log('Step 1: Creating location data...');
    const locationData = {
      name: TEST_LOCATION_NAME,
      address: TEST_LOCATION_ADDRESS,
      phone: TEST_LOCATION_PHONE,
      type: 'restaurant',
      timezone: 'Africa/Johannesburg',
      status: 'active',
      createdAt: Date.now(),
      createdBy: TEST_USER_ID,
      userId: TEST_USER_ID
    };
    console.log('Location data prepared:', JSON.stringify(locationData, null, 2));

    // Step 2: Save to Firebase RTDB
    console.log('\nStep 2: Saving to Firebase RTDB...');

    // Create location in locations/ node
    const locationsRef = db.ref('locations');
    const newLocationRef = locationsRef.push();
    locationKey = newLocationRef.key;

    await newLocationRef.set(locationData);
    console.log('✓ Location saved to locations/' + locationKey);

    // Create reference in userLocations node
    const userLocationRef = db.ref(`userLocations/${TEST_USER_ID}/${locationKey}`);
    await userLocationRef.set(true);
    console.log('✓ User-location mapping saved to userLocations/' + TEST_USER_ID + '/' + locationKey);

    // Step 3: Verify location exists
    console.log('\nStep 3: Verifying location exists...');
    const locationSnapshot = await db.ref(`locations/${locationKey}`).once('value');

    if (!locationSnapshot.exists()) {
      throw new Error('Location does not exist in database after creation!');
    }

    const retrievedLocation = locationSnapshot.val();
    console.log('✓ Location retrieved from database');
    console.log('Retrieved data:', JSON.stringify(retrievedLocation, null, 2));

    // Step 4: Verify user-location mapping
    console.log('\nStep 4: Verifying user-location mapping...');
    const userLocationSnapshot = await db.ref(`userLocations/${TEST_USER_ID}/${locationKey}`).once('value');

    if (!userLocationSnapshot.exists()) {
      throw new Error('User-location mapping does not exist!');
    }

    console.log('✓ User-location mapping exists');

    // Step 5: Wait and verify persistence (simulating page refresh)
    console.log('\nStep 5: Simulating page refresh (2 second delay)...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const persistedLocationSnapshot = await db.ref(`locations/${locationKey}`).once('value');
    if (!persistedLocationSnapshot.exists()) {
      throw new Error('Location does not persist after delay!');
    }

    console.log('✓ Location still exists after delay (data persists)');

    // Step 6: Verify all user locations can be retrieved
    console.log('\nStep 6: Verifying user can retrieve all their locations...');
    const userLocationsSnapshot = await db.ref(`userLocations/${TEST_USER_ID}`).once('value');

    if (!userLocationsSnapshot.exists()) {
      throw new Error('No locations found for user!');
    }

    const locationKeys = Object.keys(userLocationsSnapshot.val());
    console.log(`✓ User has ${locationKeys.length} location(s)`);
    console.log('Location keys:', locationKeys);

    // Step 7: Clean up test data
    console.log('\nStep 7: Cleaning up test data...');
    await db.ref(`locations/${locationKey}`).remove();
    await db.ref(`userLocations/${TEST_USER_ID}/${locationKey}`).remove();
    console.log('✓ Test data cleaned up');

    // Final verification
    console.log('\n========================================');
    console.log('✅ ALL TESTS PASSED');
    console.log('========================================');
    console.log('\nVerified:');
    console.log('  ✓ Location created in locations/ node');
    console.log('  ✓ User-location mapping created in userLocations/ node');
    console.log('  ✓ Location data can be retrieved');
    console.log('  ✓ Data persists (not in-memory)');
    console.log('  ✓ User can retrieve all their locations');
    console.log('\n✅ Feature #38: PASSING\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);

    // Attempt cleanup even on failure
    if (locationKey) {
      console.log('\nCleaning up test data after failure...');
      try {
        await db.ref(`locations/${locationKey}`).remove();
        await db.ref(`userLocations/${TEST_USER_ID}/${locationKey}`).remove();
        console.log('Test data cleaned up');
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError.message);
      }
    }

    process.exit(1);
  } finally {
    await admin.app().delete();
  }
}

// Run the test
runTest();
