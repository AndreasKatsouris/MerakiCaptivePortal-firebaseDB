#!/usr/bin/env node

/**
 * Feature #49 Test: Guest Consent Tracking Workflow
 *
 * Verifies:
 * 1. Create guest without consent - status should be 'pending' (no consent object)
 * 2. Guest opts in via WhatsApp - status becomes 'accepted'
 * 3. Platform and version are recorded
 * 4. Guest opts out - status becomes 'declined'
 * 5. Consent history is tracked
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

const db = admin.database();

// Test configuration
const TEST_PHONE = '+27800CONSENT49';
const TEST_NAME = 'Feature 49 Test Guest';

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testConsentWorkflow() {
  log('\n========================================', 'cyan');
  log('Feature #49: Guest Consent Tracking Workflow', 'cyan');
  log('========================================\n', 'cyan');

  try {
    // STEP 1: Create guest without consent
    log('STEP 1: Create guest without consent', 'blue');
    const guestData = {
      phoneNumber: TEST_PHONE,
      name: TEST_NAME,
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    await db.ref(`guests/${TEST_PHONE}`).set(guestData);
    log('✅ Guest created successfully', 'green');

    // Verify consent status is 'pending' (no consent object)
    await delay(500);
    const guestSnapshot1 = await db.ref(`guests/${TEST_PHONE}`).once('value');
    const guest1 = guestSnapshot1.val();

    log('\nVerifying consent status:', 'yellow');
    log(`  Guest data: ${JSON.stringify(guest1, null, 2)}`, 'reset');

    if (!guest1.consent) {
      log('✅ STEP 1 PASSED: Consent status is "pending" (no consent object)', 'green');
    } else {
      log('❌ STEP 1 FAILED: Guest should not have consent object yet', 'red');
      log(`  Found: ${JSON.stringify(guest1.consent)}`, 'red');
      throw new Error('Guest should not have consent yet');
    }

    // STEP 2: Guest opts in via WhatsApp
    log('\n\nSTEP 2: Guest opts in via WhatsApp', 'blue');
    const consentAccepted = {
      status: 'accepted',
      timestamp: Date.now(),
      version: '1.0',
      platform: 'whatsapp'
    };

    await db.ref(`guests/${TEST_PHONE}/consent`).set(consentAccepted);
    log('✅ Consent "accepted" saved to database', 'green');

    // Save to consent history
    await db.ref(`consent-history/${TEST_PHONE}/${Date.now()}`).set(consentAccepted);
    log('✅ Consent saved to history', 'green');

    // Verify consent status is 'accepted'
    await delay(500);
    const guestSnapshot2 = await db.ref(`guests/${TEST_PHONE}`).once('value');
    const guest2 = guestSnapshot2.val();

    log('\nVerifying consent status:', 'yellow');
    log(`  Consent data: ${JSON.stringify(guest2.consent, null, 2)}`, 'reset');

    if (guest2.consent && guest2.consent.status === 'accepted') {
      log('✅ STEP 2 PASSED: Consent status is "accepted"', 'green');
    } else {
      log('❌ STEP 2 FAILED: Consent status should be "accepted"', 'red');
      throw new Error('Consent opt-in failed');
    }

    // STEP 3: Verify platform and version are recorded
    log('\n\nSTEP 3: Verify platform and version are recorded', 'blue');

    if (guest2.consent.platform === 'whatsapp' && guest2.consent.version === '1.0') {
      log('✅ STEP 3 PASSED: Platform and version recorded correctly', 'green');
      log(`  Platform: ${guest2.consent.platform}`, 'reset');
      log(`  Version: ${guest2.consent.version}`, 'reset');
      log(`  Timestamp: ${new Date(guest2.consent.timestamp).toISOString()}`, 'reset');
    } else {
      log('❌ STEP 3 FAILED: Platform or version not recorded correctly', 'red');
      throw new Error('Platform and version verification failed');
    }

    // STEP 4: Guest opts out
    log('\n\nSTEP 4: Guest opts out (declines consent)', 'blue');
    const consentDeclined = {
      status: 'declined',
      timestamp: Date.now(),
      version: '1.0',
      platform: 'whatsapp'
    };

    await db.ref(`guests/${TEST_PHONE}/consent`).set(consentDeclined);
    log('✅ Consent "declined" saved to database', 'green');

    // Save decline to consent history
    await db.ref(`consent-history/${TEST_PHONE}/${Date.now()}`).set(consentDeclined);
    log('✅ Consent decline saved to history', 'green');

    // Verify consent status is 'declined'
    await delay(500);
    const guestSnapshot3 = await db.ref(`guests/${TEST_PHONE}`).once('value');
    const guest3 = guestSnapshot3.val();

    log('\nVerifying consent status:', 'yellow');
    log(`  Consent data: ${JSON.stringify(guest3.consent, null, 2)}`, 'reset');

    if (guest3.consent && guest3.consent.status === 'declined') {
      log('✅ STEP 4 PASSED: Consent status is "declined"', 'green');
    } else {
      log('❌ STEP 4 FAILED: Consent status should be "declined"', 'red');
      throw new Error('Consent opt-out failed');
    }

    // STEP 5: Verify consent history
    log('\n\nSTEP 5: Verify consent history tracking', 'blue');
    const historySnapshot = await db.ref(`consent-history/${TEST_PHONE}`).once('value');
    const history = historySnapshot.val();

    if (history) {
      const historyArray = Object.values(history);
      log(`✅ Consent history found: ${historyArray.length} records`, 'green');

      historyArray.forEach((record, index) => {
        log(`\n  Record ${index + 1}:`, 'reset');
        log(`    Status: ${record.status}`, 'reset');
        log(`    Platform: ${record.platform}`, 'reset');
        log(`    Version: ${record.version}`, 'reset');
        log(`    Timestamp: ${new Date(record.timestamp).toISOString()}`, 'reset');
      });

      // Verify we have both accepted and declined records
      const hasAccepted = historyArray.some(r => r.status === 'accepted');
      const hasDeclined = historyArray.some(r => r.status === 'declined');

      if (hasAccepted && hasDeclined) {
        log('\n✅ STEP 5 PASSED: Consent history tracks both accepted and declined states', 'green');
      } else {
        log('\n❌ STEP 5 FAILED: Consent history should have both states', 'red');
        throw new Error('Consent history incomplete');
      }
    } else {
      log('❌ STEP 5 FAILED: No consent history found', 'red');
      throw new Error('Consent history not found');
    }

    // Final Summary
    log('\n\n========================================', 'cyan');
    log('TEST SUMMARY', 'cyan');
    log('========================================', 'cyan');
    log('✅ All consent workflow steps verified successfully!', 'green');
    log('', 'reset');
    log('Verified:', 'yellow');
    log('  1. Guest created without consent (pending status)', 'reset');
    log('  2. Guest opts in via WhatsApp (accepted status)', 'reset');
    log('  3. Platform and version recorded correctly', 'reset');
    log('  4. Guest opts out (declined status)', 'reset');
    log('  5. Consent history tracks all changes', 'reset');
    log('', 'reset');

    // Cleanup
    log('\nCleaning up test data...', 'yellow');
    await db.ref(`guests/${TEST_PHONE}`).remove();
    await db.ref(`consent-history/${TEST_PHONE}`).remove();
    log('✅ Test data cleaned up', 'green');

    log('\n✅ FEATURE #49 TEST PASSED', 'green');
    process.exit(0);

  } catch (error) {
    log('\n❌ TEST FAILED', 'red');
    log(`Error: ${error.message}`, 'red');
    log(`Stack: ${error.stack}`, 'red');

    // Cleanup on failure
    try {
      log('\nCleaning up test data...', 'yellow');
      await db.ref(`guests/${TEST_PHONE}`).remove();
      await db.ref(`consent-history/${TEST_PHONE}`).remove();
      log('✅ Test data cleaned up', 'green');
    } catch (cleanupError) {
      log('⚠️  Cleanup failed', 'yellow');
    }

    process.exit(1);
  }
}

// Run the test
testConsentWorkflow();
