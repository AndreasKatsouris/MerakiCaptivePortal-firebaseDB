#!/usr/bin/env node

/**
 * Feature #43 Test: Complete booking workflow
 *
 * Test Steps:
 * 1. Create booking for date/time
 * 2. Verify booking created in Firebase RTDB at bookings/ path
 * 3. Check booking appears with correct data
 * 4. Update booking time
 * 5. Verify update saved
 * 6. Update booking status to 'cancelled'
 * 7. Verify cancellation persists
 * 8. Clean up test data
 */

const admin = require('firebase-admin');

// Set project ID environment variable
process.env.GOOGLE_CLOUD_PROJECT = 'merakicaptiveportal-firebasedb';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
    projectId: 'merakicaptiveportal-firebasedb'
  });
}

const rtdb = admin.database();

// Test data
const TEST_PHONE = '+27800000043'; // Feature 43 test phone
const TEST_GUEST_NAME = 'Feature 43 Booking Test';
const TEST_LOCATION = 'Test Location F43';
const TEST_DATE = '2026-02-10';
const TEST_TIME_INITIAL = '18:00';
const TEST_TIME_UPDATED = '19:30';

/**
 * Create a test booking
 */
async function createTestBooking() {
  console.log('\n[STEP 1] Creating test booking...');

  const bookingData = {
    guestName: TEST_GUEST_NAME,
    phoneNumber: TEST_PHONE,
    date: TEST_DATE,
    time: TEST_TIME_INITIAL,
    location: TEST_LOCATION,
    numberOfGuests: 4,
    status: 'pending',
    specialRequests: 'Window seat please',
    section: 'Inside',
    createdAt: admin.database.ServerValue.TIMESTAMP,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
    createdBy: 'test-user-f43'
  };

  const newBookingRef = rtdb.ref('bookings').push();
  await newBookingRef.set(bookingData);

  console.log('✅ Test booking created with ID:', newBookingRef.key);
  return newBookingRef.key;
}

/**
 * Verify booking exists in database
 */
async function verifyBookingExists(bookingId) {
  console.log('\n[STEP 2] Verifying booking exists in database...');

  const bookingRef = rtdb.ref(`bookings/${bookingId}`);
  const snapshot = await bookingRef.once('value');

  if (!snapshot.exists()) {
    throw new Error('Booking not found in database');
  }

  const booking = snapshot.val();
  console.log('✅ Booking found in database');
  console.log('   - Guest Name:', booking.guestName);
  console.log('   - Phone:', booking.phoneNumber);
  console.log('   - Date:', booking.date);
  console.log('   - Time:', booking.time);
  console.log('   - Location:', booking.location);
  console.log('   - Guests:', booking.numberOfGuests);
  console.log('   - Status:', booking.status);
  console.log('   - Special Requests:', booking.specialRequests);

  return booking;
}

/**
 * Verify booking data is correct
 */
function verifyBookingData(booking) {
  console.log('\n[STEP 3] Verifying booking data...');

  if (booking.guestName !== TEST_GUEST_NAME) {
    throw new Error(`Guest name mismatch: expected "${TEST_GUEST_NAME}", got "${booking.guestName}"`);
  }
  if (booking.phoneNumber !== TEST_PHONE) {
    throw new Error(`Phone mismatch: expected "${TEST_PHONE}", got "${booking.phoneNumber}"`);
  }
  if (booking.date !== TEST_DATE) {
    throw new Error(`Date mismatch: expected "${TEST_DATE}", got "${booking.date}"`);
  }
  if (booking.time !== TEST_TIME_INITIAL) {
    throw new Error(`Time mismatch: expected "${TEST_TIME_INITIAL}", got "${booking.time}"`);
  }
  if (booking.status !== 'pending') {
    throw new Error(`Status mismatch: expected "pending", got "${booking.status}"`);
  }

  console.log('✅ All booking data is correct');
}

/**
 * Update booking time
 */
async function updateBookingTime(bookingId) {
  console.log('\n[STEP 4] Updating booking time...');

  const bookingRef = rtdb.ref(`bookings/${bookingId}`);
  await bookingRef.update({
    time: TEST_TIME_UPDATED,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
    updatedBy: 'test-user-f43'
  });

  console.log('✅ Booking time updated to:', TEST_TIME_UPDATED);
}

/**
 * Verify booking time update persisted
 */
async function verifyTimeUpdate(bookingId) {
  console.log('\n[STEP 5] Verifying time update persisted...');

  // Wait a moment to simulate navigation/refresh
  await new Promise(resolve => setTimeout(resolve, 1000));

  const bookingRef = rtdb.ref(`bookings/${bookingId}`);
  const snapshot = await bookingRef.once('value');

  if (!snapshot.exists()) {
    throw new Error('Booking not found after update');
  }

  const booking = snapshot.val();
  if (booking.time !== TEST_TIME_UPDATED) {
    throw new Error(`Time update did not persist: expected "${TEST_TIME_UPDATED}", got "${booking.time}"`);
  }

  console.log('✅ Time update persisted correctly');
  console.log('   - New time:', booking.time);
}

/**
 * Cancel booking (update status to cancelled)
 */
async function cancelBooking(bookingId) {
  console.log('\n[STEP 6] Cancelling booking...');

  const bookingRef = rtdb.ref(`bookings/${bookingId}`);
  await bookingRef.update({
    status: 'cancelled',
    updatedAt: admin.database.ServerValue.TIMESTAMP,
    updatedBy: 'test-user-f43'
  });

  console.log('✅ Booking cancelled (status updated to "cancelled")');
}

/**
 * Verify cancellation persisted
 */
async function verifyCancellation(bookingId) {
  console.log('\n[STEP 7] Verifying cancellation persisted...');

  // Wait a moment to simulate navigation/refresh
  await new Promise(resolve => setTimeout(resolve, 1000));

  const bookingRef = rtdb.ref(`bookings/${bookingId}`);
  const snapshot = await bookingRef.once('value');

  if (!snapshot.exists()) {
    throw new Error('Booking not found after cancellation');
  }

  const booking = snapshot.val();
  if (booking.status !== 'cancelled') {
    throw new Error(`Cancellation did not persist: expected "cancelled", got "${booking.status}"`);
  }

  console.log('✅ Cancellation persisted correctly');
  console.log('   - Final status:', booking.status);
}

/**
 * Clean up test data
 */
async function cleanup(bookingId) {
  console.log('\n[CLEANUP] Removing test booking...');

  const bookingRef = rtdb.ref(`bookings/${bookingId}`);
  await bookingRef.remove();

  console.log('✅ Test booking removed');
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('===========================================');
  console.log('Feature #43 Test: Complete Booking Workflow');
  console.log('===========================================');

  let bookingId = null;

  try {
    // Step 1: Create booking
    bookingId = await createTestBooking();

    // Step 2: Verify booking exists
    const booking = await verifyBookingExists(bookingId);

    // Step 3: Verify booking data
    verifyBookingData(booking);

    // Step 4: Update booking time
    await updateBookingTime(bookingId);

    // Step 5: Verify time update persisted
    await verifyTimeUpdate(bookingId);

    // Step 6: Cancel booking
    await cancelBooking(bookingId);

    // Step 7: Verify cancellation persisted
    await verifyCancellation(bookingId);

    console.log('\n===========================================');
    console.log('✅ FEATURE #43 TEST PASSED');
    console.log('===========================================');
    console.log('All workflow steps verified:');
    console.log('  ✓ Booking creation');
    console.log('  ✓ Data persistence');
    console.log('  ✓ Time update');
    console.log('  ✓ Cancellation');
    console.log('  ✓ All changes persist in Firebase RTDB');
    console.log('===========================================\n');

  } catch (error) {
    console.error('\n===========================================');
    console.error('❌ FEATURE #43 TEST FAILED');
    console.error('===========================================');
    console.error('Error:', error.message);
    console.error('===========================================\n');
    process.exit(1);
  } finally {
    // Always clean up
    if (bookingId) {
      await cleanup(bookingId);
    }
    // Exit the process
    process.exit(0);
  }
}

// Run the tests
runTests();
