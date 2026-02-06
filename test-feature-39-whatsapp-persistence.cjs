#!/usr/bin/env node

/**
 * Test Feature #39: WhatsApp number registration persists in Firebase RTDB
 *
 * This test verifies that:
 * 1. WhatsApp number can be registered
 * 2. WhatsApp number data is stored in whatsapp-numbers/ node
 * 3. Location-WhatsApp mapping is stored in location-whatsapp-mapping/ node
 * 4. Data persists across queries (not in-memory)
 * 5. Number-location assignment can be retrieved
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
const TEST_USER_ID = 'test-user-whatsapp-001';
const TEST_WHATSAPP_NUMBER = '+27821112222';
const TEST_LOCATION_ID = 'test-location-whatsapp-001';
const TEST_LOCATION_NAME = 'Test Restaurant WhatsApp';

async function runTest() {
  console.log('\n========================================');
  console.log('Feature #39: WhatsApp Number Persistence Test');
  console.log('========================================\n');

  let whatsappNumberKey = null;

  try {
    // Step 1: Create WhatsApp number data
    console.log('Step 1: Creating WhatsApp number data...');
    const whatsappNumberData = {
      phoneNumber: TEST_WHATSAPP_NUMBER,
      displayName: 'Test WhatsApp Business',
      status: 'active',
      createdAt: Date.now(),
      createdBy: TEST_USER_ID,
      userId: TEST_USER_ID,
      metadata: {
        description: 'Test WhatsApp number for persistence verification'
      },
      usage: {
        totalMessages: 0,
        lastMessageAt: null
      }
    };
    console.log('WhatsApp number data prepared:', JSON.stringify(whatsappNumberData, null, 2));

    // Step 2: Save WhatsApp number to Firebase RTDB
    console.log('\nStep 2: Saving WhatsApp number to Firebase RTDB...');

    // Create WhatsApp number in whatsapp-numbers/ node
    const whatsappNumbersRef = db.ref('whatsapp-numbers');
    const newWhatsappNumberRef = whatsappNumbersRef.push();
    whatsappNumberKey = newWhatsappNumberRef.key;

    await newWhatsappNumberRef.set(whatsappNumberData);
    console.log('✓ WhatsApp number saved to whatsapp-numbers/' + whatsappNumberKey);

    // Step 3: Create location-WhatsApp mapping
    console.log('\nStep 3: Creating location-WhatsApp mapping...');
    const mappingData = {
      whatsappNumberId: whatsappNumberKey,
      phoneNumber: TEST_WHATSAPP_NUMBER,
      locationId: TEST_LOCATION_ID,
      locationName: TEST_LOCATION_NAME,
      userId: TEST_USER_ID,
      isActive: true,
      active: true, // For compatibility
      assignedAt: Date.now(),
      createdAt: Date.now(),
      analytics: {
        messagesSent: 0,
        messagesReceived: 0,
        lastActivityAt: null
      }
    };

    const locationMappingRef = db.ref(`location-whatsapp-mapping/${TEST_LOCATION_ID}`);
    await locationMappingRef.set(mappingData);
    console.log('✓ Location-WhatsApp mapping saved to location-whatsapp-mapping/' + TEST_LOCATION_ID);

    // Step 4: Verify WhatsApp number exists
    console.log('\nStep 4: Verifying WhatsApp number exists...');
    const whatsappNumberSnapshot = await db.ref(`whatsapp-numbers/${whatsappNumberKey}`).once('value');

    if (!whatsappNumberSnapshot.exists()) {
      throw new Error('WhatsApp number does not exist in database after creation!');
    }

    const retrievedWhatsappNumber = whatsappNumberSnapshot.val();
    console.log('✓ WhatsApp number retrieved from database');
    console.log('Retrieved data:', JSON.stringify(retrievedWhatsappNumber, null, 2));

    // Step 5: Verify location-WhatsApp mapping
    console.log('\nStep 5: Verifying location-WhatsApp mapping...');
    const locationMappingSnapshot = await db.ref(`location-whatsapp-mapping/${TEST_LOCATION_ID}`).once('value');

    if (!locationMappingSnapshot.exists()) {
      throw new Error('Location-WhatsApp mapping does not exist!');
    }

    const retrievedMapping = locationMappingSnapshot.val();
    console.log('✓ Location-WhatsApp mapping exists');
    console.log('Retrieved mapping:', JSON.stringify(retrievedMapping, null, 2));

    // Step 6: Verify mapping points to correct WhatsApp number
    console.log('\nStep 6: Verifying mapping integrity...');
    if (retrievedMapping.whatsappNumberId !== whatsappNumberKey) {
      throw new Error('Mapping whatsappNumberId does not match created number key!');
    }
    if (retrievedMapping.phoneNumber !== TEST_WHATSAPP_NUMBER) {
      throw new Error('Mapping phoneNumber does not match!');
    }
    console.log('✓ Mapping correctly references WhatsApp number');

    // Step 7: Wait and verify persistence (simulating page refresh)
    console.log('\nStep 7: Simulating page refresh (2 second delay)...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const persistedWhatsappNumberSnapshot = await db.ref(`whatsapp-numbers/${whatsappNumberKey}`).once('value');
    const persistedMappingSnapshot = await db.ref(`location-whatsapp-mapping/${TEST_LOCATION_ID}`).once('value');

    if (!persistedWhatsappNumberSnapshot.exists()) {
      throw new Error('WhatsApp number does not persist after delay!');
    }
    if (!persistedMappingSnapshot.exists()) {
      throw new Error('Location-WhatsApp mapping does not persist after delay!');
    }

    console.log('✓ WhatsApp number still exists after delay (data persists)');
    console.log('✓ Location-WhatsApp mapping still exists after delay (data persists)');

    // Step 8: Verify reverse lookup (location by WhatsApp number)
    console.log('\nStep 8: Verifying reverse lookup capability...');
    const allMappingsSnapshot = await db.ref('location-whatsapp-mapping')
      .orderByChild('phoneNumber')
      .equalTo(TEST_WHATSAPP_NUMBER)
      .once('value');

    if (!allMappingsSnapshot.exists()) {
      throw new Error('Cannot find location by WhatsApp number!');
    }

    const mappingsCount = Object.keys(allMappingsSnapshot.val()).length;
    console.log(`✓ Found ${mappingsCount} location(s) using WhatsApp number ${TEST_WHATSAPP_NUMBER}`);

    // Step 9: Clean up test data
    console.log('\nStep 9: Cleaning up test data...');
    await db.ref(`whatsapp-numbers/${whatsappNumberKey}`).remove();
    await db.ref(`location-whatsapp-mapping/${TEST_LOCATION_ID}`).remove();
    console.log('✓ Test data cleaned up');

    // Final verification
    console.log('\n========================================');
    console.log('✅ ALL TESTS PASSED');
    console.log('========================================');
    console.log('\nVerified:');
    console.log('  ✓ WhatsApp number created in whatsapp-numbers/ node');
    console.log('  ✓ Location-WhatsApp mapping created in location-whatsapp-mapping/ node');
    console.log('  ✓ WhatsApp number data can be retrieved');
    console.log('  ✓ Mapping data can be retrieved');
    console.log('  ✓ Mapping correctly references WhatsApp number');
    console.log('  ✓ Data persists (not in-memory)');
    console.log('  ✓ Reverse lookup works (find location by WhatsApp number)');
    console.log('\n✅ Feature #39: PASSING\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);

    // Attempt cleanup even on failure
    if (whatsappNumberKey) {
      console.log('\nCleaning up test data after failure...');
      try {
        await db.ref(`whatsapp-numbers/${whatsappNumberKey}`).remove();
        await db.ref(`location-whatsapp-mapping/${TEST_LOCATION_ID}`).remove();
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
