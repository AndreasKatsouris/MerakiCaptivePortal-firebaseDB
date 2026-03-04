#!/usr/bin/env node

/**
 * Feature #40 Test: Reward data persists after creation
 *
 * Test Steps:
 * 1. Create a test campaign with reward
 * 2. Create test guest
 * 3. Create test receipt
 * 4. Process receipt to trigger reward creation
 * 5. Verify reward exists in Firebase RTDB at rewards/ path
 * 6. Verify reward has correct guestPhone
 * 7. Verify reward persists after delay (simulating navigation away)
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
const TEST_PHONE = '+27800000040'; // Feature 40 test phone
const TEST_GUEST_NAME = 'Feature 40 Test Guest';
const TEST_CAMPAIGN_NAME = 'Feature 40 Test Campaign';
const TEST_LOCATION = 'test-location-f40';

/**
 * Normalize phone number to consistent format
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');

  // Handle South African numbers
  if (digits.startsWith('27')) {
    return digits; // Already in international format
  } else if (digits.startsWith('0')) {
    return '27' + digits.slice(1); // Remove leading 0, add country code
  } else if (digits.length === 9) {
    return '27' + digits; // Add country code
  }

  return digits;
}

/**
 * Create test campaign
 */
async function createTestCampaign() {
  console.log('\n🎯 Creating test campaign...');

  const campaignId = `campaign-f40-${Date.now()}`;
  const campaignData = {
    id: campaignId,
    name: TEST_CAMPAIGN_NAME,
    locationId: TEST_LOCATION,
    status: 'active',
    rewardTypes: [
      {
        typeId: 'discount-10',
        type: 'percentage_discount',
        value: 10,
        description: '10% Discount',
        criteria: {
          minPurchaseAmount: 0,
          maxRewards: 1
        }
      }
    ],
    criteria: {
      minAmount: 0,
      validFrom: Date.now(),
      validUntil: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
    },
    createdAt: Date.now()
  };

  await rtdb.ref(`campaigns/${campaignId}`).set(campaignData);
  console.log('✅ Campaign created:', campaignId);

  return campaignData;
}

/**
 * Create test guest
 */
async function createTestGuest() {
  console.log('\n👤 Creating test guest...');

  const normalizedPhone = normalizePhoneNumber(TEST_PHONE);
  const guestData = {
    phoneNumber: normalizedPhone,
    name: TEST_GUEST_NAME,
    tier: 'free',
    createdAt: Date.now(),
    consent: true
  };

  await rtdb.ref(`guests/${normalizedPhone}`).set(guestData);
  console.log('✅ Guest created:', normalizedPhone);

  return guestData;
}

/**
 * Create test receipt
 */
async function createTestReceipt() {
  console.log('\n🧾 Creating test receipt...');

  const receiptRef = rtdb.ref('receipts').push();
  const receiptId = receiptRef.key;
  const normalizedPhone = normalizePhoneNumber(TEST_PHONE);

  const receiptData = {
    id: receiptId,
    receiptId: receiptId,
    guestPhone: normalizedPhone,
    guestName: TEST_GUEST_NAME,
    locationId: TEST_LOCATION,
    totalAmount: 150.00,
    date: Date.now(),
    invoiceNumber: `INV-F40-${Date.now()}`,
    status: 'pending',
    createdAt: Date.now()
  };

  await receiptRef.set(receiptData);
  console.log('✅ Receipt created:', receiptId);

  return receiptData;
}

/**
 * Process receipt to trigger reward creation
 */
async function processReceipt(guest, campaign, receipt) {
  console.log('\n⚙️ Processing receipt to create reward...');

  // Import the reward processor
  const { processReward } = require('./functions/rewardsProcessor.js');

  try {
    const result = await processReward(guest, campaign, receipt);
    console.log('✅ Receipt processed successfully');
    console.log('Rewards created:', result.rewards?.length || 0);

    return result;
  } catch (error) {
    console.error('❌ Error processing receipt:', error.message);
    throw error;
  }
}

/**
 * Verify reward exists in Firebase RTDB
 */
async function verifyRewardExists(rewardId) {
  console.log('\n🔍 Verifying reward exists in Firebase...');

  const rewardSnapshot = await rtdb.ref(`rewards/${rewardId}`).once('value');

  if (!rewardSnapshot.exists()) {
    throw new Error('Reward does not exist in Firebase RTDB');
  }

  const rewardData = rewardSnapshot.val();
  console.log('✅ Reward found in Firebase RTDB');
  console.log('Reward ID:', rewardId);
  console.log('Reward data:', JSON.stringify(rewardData, null, 2));

  return rewardData;
}

/**
 * Verify reward has correct guest phone
 */
async function verifyRewardGuestPhone(rewardData) {
  console.log('\n📱 Verifying reward has correct guestPhone...');

  const normalizedPhone = normalizePhoneNumber(TEST_PHONE);
  const rewardPhone = rewardData.guestPhone;

  // Accept both formats: with or without + prefix
  const isMatch = (rewardPhone === normalizedPhone) ||
                  (rewardPhone === `+${normalizedPhone}`) ||
                  (rewardPhone.replace(/\+/g, '') === normalizedPhone);

  if (!isMatch) {
    throw new Error(`Reward guestPhone mismatch. Expected: ${normalizedPhone} or +${normalizedPhone}, Got: ${rewardPhone}`);
  }

  console.log('✅ Reward guestPhone is correct:', rewardData.guestPhone);
}

/**
 * Verify reward in guest-rewards index
 */
async function verifyGuestRewardIndex(rewardId, rewardData) {
  console.log('\n🔗 Verifying guest-rewards index...');

  // Use the actual phone format from the reward data
  const phoneFromReward = rewardData.guestPhone;
  const indexSnapshot = await rtdb.ref(`guest-rewards/${phoneFromReward}/${rewardId}`).once('value');

  if (!indexSnapshot.exists()) {
    throw new Error(`Reward not found in guest-rewards index at guest-rewards/${phoneFromReward}/${rewardId}`);
  }

  console.log('✅ Reward found in guest-rewards index');
}

/**
 * Simulate navigation away and back (verify persistence)
 */
async function verifyPersistence(rewardId, rewardData) {
  console.log('\n⏳ Simulating navigation away (2 second delay)...');

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('🔄 Verifying reward still exists after delay...');

  const rewardSnapshot = await rtdb.ref(`rewards/${rewardId}`).once('value');

  if (!rewardSnapshot.exists()) {
    throw new Error('Reward disappeared after delay - data not persisted!');
  }

  console.log('✅ VERIFIED: Reward persists after navigation away');

  // Also check guest-rewards index (use phone format from reward)
  const phoneFromReward = rewardData.guestPhone;
  const indexSnapshot = await rtdb.ref(`guest-rewards/${phoneFromReward}/${rewardId}`).once('value');

  if (!indexSnapshot.exists()) {
    throw new Error('Guest-rewards index disappeared after delay!');
  }

  console.log('✅ VERIFIED: Guest-rewards index persists after navigation away');
}

/**
 * Clean up test data
 */
async function cleanup(campaignId, receiptId, rewardId, rewardData) {
  console.log('\n🧹 Cleaning up test data...');

  const normalizedPhone = normalizePhoneNumber(TEST_PHONE);
  const phoneFromReward = rewardData?.guestPhone || normalizedPhone;

  try {
    // Delete campaign
    if (campaignId) {
      await rtdb.ref(`campaigns/${campaignId}`).remove();
      console.log('✅ Campaign deleted');
    }

    // Delete receipt
    if (receiptId) {
      await rtdb.ref(`receipts/${receiptId}`).remove();
      console.log('✅ Receipt deleted');
    }

    // Delete reward
    if (rewardId) {
      await rtdb.ref(`rewards/${rewardId}`).remove();
      console.log('✅ Reward deleted');
    }

    // Delete guest-rewards index (use actual phone format from reward)
    if (rewardId) {
      await rtdb.ref(`guest-rewards/${phoneFromReward}/${rewardId}`).remove();
      console.log('✅ Guest-rewards index deleted');
    }

    // Delete campaign-rewards index
    if (campaignId && rewardId) {
      await rtdb.ref(`campaign-rewards/${campaignId}/${rewardId}`).remove();
      console.log('✅ Campaign-rewards index deleted');
    }

    // Delete guest (try both formats)
    await rtdb.ref(`guests/${normalizedPhone}`).remove();
    if (phoneFromReward !== normalizedPhone) {
      await rtdb.ref(`guests/${phoneFromReward}`).remove();
    }
    console.log('✅ Guest deleted');

    console.log('✅ Cleanup complete');
  } catch (error) {
    console.error('⚠️ Cleanup error (non-fatal):', error.message);
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log('='.repeat(60));
  console.log('FEATURE #40 TEST: Reward Data Persists After Creation');
  console.log('='.repeat(60));

  let campaign, guest, receipt, rewardId;

  try {
    // Step 1: Create test campaign
    campaign = await createTestCampaign();

    // Step 2: Create test guest
    guest = await createTestGuest();

    // Step 3: Create test receipt
    receipt = await createTestReceipt();

    // Step 4: Process receipt to trigger reward creation
    const result = await processReceipt(guest, campaign, receipt);

    if (!result.rewards || result.rewards.length === 0) {
      throw new Error('No rewards were created');
    }

    rewardId = result.rewards[0].id;
    console.log('\n🎁 Reward created with ID:', rewardId);

    // Step 5: Verify reward exists in Firebase RTDB
    const rewardData = await verifyRewardExists(rewardId);

    // Step 6: Verify reward has correct guestPhone
    await verifyRewardGuestPhone(rewardData);

    // Step 7: Verify guest-rewards index
    await verifyGuestRewardIndex(rewardId, rewardData);

    // Step 8: Verify persistence after delay (simulating navigation)
    await verifyPersistence(rewardId, rewardData);

    console.log('\n' + '='.repeat(60));
    console.log('✅ FEATURE #40 TEST PASSED');
    console.log('='.repeat(60));
    console.log('\nSummary:');
    console.log('✅ Reward created in Firebase RTDB');
    console.log('✅ Reward has correct guestPhone');
    console.log('✅ Reward persists after navigation away');
    console.log('✅ Guest-rewards index created and persists');
    console.log('\nFeature #40 is VERIFIED - Reward data persists correctly!');

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ FEATURE #40 TEST FAILED');
    console.error('='.repeat(60));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    process.exitCode = 1;
  } finally {
    // Cleanup
    if (campaign && receipt) {
      const rewardData = rewardId ? await rtdb.ref(`rewards/${rewardId}`).once('value').then(s => s.val()) : null;
      await cleanup(campaign.id, receipt.id, rewardId, rewardData);
    }

    // Exit
    process.exit();
  }
}

// Run the test
runTest();
