/**
 * Test Feature #46: Complete voucher redemption workflow
 *
 * This test verifies the entire voucher lifecycle:
 * 1. Create voucher pool
 * 2. Trigger reward that assigns voucher
 * 3. Verify voucher code assigned to guest
 * 4. Mark voucher as redeemed
 * 5. Verify status updated to 'redeemed'
 * 6. Check pool statistics updated
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

// Helper function to normalize phone numbers
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.startsWith('27') ? `+${cleaned}` : `+27${cleaned}`;
}

async function testVoucherRedemptionWorkflow() {
  console.log('\n===========================================');
  console.log('FEATURE #46: Complete Voucher Redemption Workflow Test');
  console.log('===========================================\n');

  const testData = {
    rewardTypeId: 'discount-20-f46',
    campaignId: null,
    guestPhone: '+27800000046',
    receiptId: null,
    rewardId: null,
    voucherCode: null,
    locationId: 'test-location-f46'
  };

  try {
    // STEP 1: Create voucher pool
    console.log('Step 1: Creating voucher pool...');

    const voucherPool = {
      rewardTypeId: testData.rewardTypeId,
      name: 'Test Voucher Pool F46',
      type: 'percentage_discount',
      value: 20,
      description: '20% Discount Voucher',
      createdAt: Date.now(),
      createdBy: 'test-user-f46',
      vouchers: {
        'VOUCHER-F46-001': {
          code: 'VOUCHER-F46-001',
          status: 'available',
          expiryDate: Date.now() + (90 * 24 * 60 * 60 * 1000), // 90 days from now
          createdAt: Date.now()
        },
        'VOUCHER-F46-002': {
          code: 'VOUCHER-F46-002',
          status: 'available',
          expiryDate: Date.now() + (90 * 24 * 60 * 60 * 1000),
          createdAt: Date.now()
        },
        'VOUCHER-F46-003': {
          code: 'VOUCHER-F46-003',
          status: 'available',
          expiryDate: Date.now() + (90 * 24 * 60 * 60 * 1000),
          createdAt: Date.now()
        }
      },
      stats: {
        total: 3,
        available: 3,
        assigned: 0,
        redeemed: 0,
        expired: 0
      },
      testData: true
    };

    await db.ref(`voucherPools/${testData.rewardTypeId}`).set(voucherPool);
    console.log('✅ Voucher pool created:', testData.rewardTypeId);
    console.log('   Total vouchers:', voucherPool.stats.total);
    console.log('   Available:', voucherPool.stats.available);
    console.log('   Voucher codes:', Object.keys(voucherPool.vouchers).join(', '));

    // Verify pool exists
    const poolSnapshot = await db.ref(`voucherPools/${testData.rewardTypeId}`).once('value');
    const pool = poolSnapshot.val();

    if (!pool) {
      throw new Error('❌ FAILED: Voucher pool not created');
    }
    console.log('✅ Voucher pool verified in database');

    // STEP 2: Create campaign and trigger reward that assigns voucher
    console.log('\nStep 2: Creating campaign and triggering reward assignment...');

    // Create campaign
    const campaignRef = db.ref('campaigns').push();
    testData.campaignId = campaignRef.key;

    const campaignData = {
      id: testData.campaignId,
      name: 'Feature 46 Test Campaign',
      description: 'Test campaign for voucher redemption workflow',
      locationId: testData.locationId,
      status: 'active',
      createdAt: Date.now(),
      minPurchaseAmount: 100,
      startDate: '2025-01-01',
      endDate: '2025-12-31',
      rewardTypes: [{
        typeId: testData.rewardTypeId,
        type: 'percentage_discount',
        value: 20,
        description: '20% Discount',
        criteria: {
          minPurchaseAmount: 100,
          maxRewards: 3
        }
      }],
      testData: true
    };

    await campaignRef.set(campaignData);
    console.log('✅ Campaign created:', testData.campaignId);

    // Create test guest
    const guestData = {
      phoneNumber: testData.guestPhone,
      name: 'Feature 46 Test Guest',
      email: 'test-f46@example.com',
      createdAt: Date.now(),
      testData: true
    };

    await db.ref(`guests/${testData.guestPhone}`).set(guestData);
    console.log('✅ Test guest created:', testData.guestPhone);

    // Create matching receipt
    const receiptRef = db.ref('receipts').push();
    testData.receiptId = receiptRef.key;

    const receiptData = {
      id: testData.receiptId,
      receiptId: testData.receiptId,
      guestPhone: testData.guestPhone,
      guestName: guestData.name,
      totalAmount: 250, // Above minPurchaseAmount
      currency: 'ZAR',
      date: new Date().toISOString(),
      invoiceNumber: 'INV-F46-' + Date.now(),
      locationId: testData.locationId,
      status: 'pending',
      createdAt: Date.now(),
      testData: true
    };

    await receiptRef.set(receiptData);
    console.log('✅ Receipt created:', testData.receiptId);

    // Import and run reward processor
    const { processReward } = require('./functions/rewardsProcessor.js');

    console.log('\nStep 2b: Processing receipt to trigger voucher assignment...');
    const processingResult = await processReward(
      guestData,
      campaignData,
      receiptData
    );

    console.log('✅ Reward processing completed');
    console.log('   Success:', processingResult.success);
    console.log('   Rewards created:', processingResult.rewards?.length || 0);

    if (!processingResult.success || !processingResult.rewards || processingResult.rewards.length === 0) {
      throw new Error('❌ FAILED: No rewards created during processing');
    }

    // STEP 3: Verify voucher code assigned to guest
    console.log('\nStep 3: Verifying voucher code assigned to guest...');

    // Wait for database writes
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get the created reward
    const reward = processingResult.rewards[0];
    testData.rewardId = reward.id;
    testData.voucherCode = reward.voucherCode;

    if (!testData.voucherCode) {
      throw new Error('❌ FAILED: No voucher code assigned to reward');
    }

    console.log('✅ Voucher code assigned to reward:', testData.voucherCode);
    console.log('   Reward ID:', testData.rewardId);
    console.log('   Guest Phone:', reward.guestPhone);

    // Verify reward exists in database
    const rewardSnapshot = await db.ref(`rewards/${testData.rewardId}`).once('value');
    const rewardData = rewardSnapshot.val();

    if (!rewardData) {
      throw new Error('❌ FAILED: Reward not found in database');
    }

    if (rewardData.voucherCode !== testData.voucherCode) {
      throw new Error('❌ FAILED: Voucher code mismatch in database');
    }

    console.log('✅ Reward verified in database');
    console.log('   Voucher Code:', rewardData.voucherCode);
    console.log('   Status:', rewardData.status);
    console.log('   Voucher Assigned:', rewardData.voucherAssigned);

    // Verify voucher status in pool
    const voucherSnapshot = await db.ref(`voucherPools/${testData.rewardTypeId}/vouchers/${testData.voucherCode}`).once('value');
    const voucherData = voucherSnapshot.val();

    if (!voucherData) {
      throw new Error('❌ FAILED: Voucher not found in pool');
    }

    if (voucherData.status !== 'assigned') {
      throw new Error(`❌ FAILED: Voucher status not 'assigned', got: ${voucherData.status}`);
    }

    console.log('✅ Voucher status in pool: assigned');
    console.log('   Assigned to Guest:', voucherData.assignedToGuest);
    console.log('   Assigned to Reward:', voucherData.assignedToReward);

    // Verify guest-rewards index
    const guestRewardsSnapshot = await db.ref(`guest-rewards/${testData.guestPhone}/${testData.rewardId}`).once('value');

    if (!guestRewardsSnapshot.exists()) {
      throw new Error('❌ FAILED: Reward not indexed in guest-rewards');
    }

    console.log('✅ Reward indexed in guest-rewards');

    // STEP 4: Mark voucher as redeemed
    console.log('\nStep 4: Marking voucher as redeemed...');

    await db.ref(`voucherPools/${testData.rewardTypeId}/vouchers/${testData.voucherCode}`).update({
      status: 'redeemed',
      redeemedAt: Date.now(),
      redeemedBy: 'POS-TERMINAL-001'
    });

    console.log('✅ Voucher marked as redeemed');

    // Also update reward status
    await db.ref(`rewards/${testData.rewardId}`).update({
      status: 'redeemed',
      redeemedAt: Date.now(),
      redeemedLocation: 'POS-TERMINAL-001'
    });

    console.log('✅ Reward status updated to redeemed');

    // STEP 5: Verify status updated to 'redeemed'
    console.log('\nStep 5: Verifying redemption status...');

    // Wait for updates to propagate
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify voucher status
    const redeemedVoucherSnapshot = await db.ref(`voucherPools/${testData.rewardTypeId}/vouchers/${testData.voucherCode}`).once('value');
    const redeemedVoucher = redeemedVoucherSnapshot.val();

    if (redeemedVoucher.status !== 'redeemed') {
      throw new Error(`❌ FAILED: Voucher status not 'redeemed', got: ${redeemedVoucher.status}`);
    }

    console.log('✅ Voucher status verified: redeemed');
    console.log('   Redeemed At:', new Date(redeemedVoucher.redeemedAt).toISOString());
    console.log('   Redeemed By:', redeemedVoucher.redeemedBy);

    // Verify reward status
    const redeemedRewardSnapshot = await db.ref(`rewards/${testData.rewardId}`).once('value');
    const redeemedReward = redeemedRewardSnapshot.val();

    if (redeemedReward.status !== 'redeemed') {
      throw new Error(`❌ FAILED: Reward status not 'redeemed', got: ${redeemedReward.status}`);
    }

    console.log('✅ Reward status verified: redeemed');

    // STEP 6: Check pool statistics updated
    console.log('\nStep 6: Verifying pool statistics updated...');

    // Import and run stats update
    const { updatePoolStatistics } = require('./functions/voucherService.js');
    await updatePoolStatistics(testData.rewardTypeId);

    // Get updated pool statistics
    const statsSnapshot = await db.ref(`voucherPools/${testData.rewardTypeId}/stats`).once('value');
    const stats = statsSnapshot.val();

    if (!stats) {
      throw new Error('❌ FAILED: Pool statistics not found');
    }

    console.log('✅ Pool statistics retrieved');
    console.log('   Total:', stats.total);
    console.log('   Available:', stats.available);
    console.log('   Assigned:', stats.assigned);
    console.log('   Redeemed:', stats.redeemed);
    console.log('   Expired:', stats.expired);

    // Verify statistics are correct
    if (stats.total !== 3) {
      throw new Error(`❌ FAILED: Expected total=3, got ${stats.total}`);
    }

    if (stats.available !== 2) {
      throw new Error(`❌ FAILED: Expected available=2, got ${stats.available}`);
    }

    if (stats.redeemed !== 1) {
      throw new Error(`❌ FAILED: Expected redeemed=1, got ${stats.redeemed}`);
    }

    console.log('✅ Pool statistics verified correctly');

    // Success!
    console.log('\n===========================================');
    console.log('✅ FEATURE #46 VERIFICATION: PASSED');
    console.log('===========================================');
    console.log('\nAll workflow steps completed:');
    console.log('✓ Voucher pool created with 3 vouchers');
    console.log('✓ Campaign created and activated');
    console.log('✓ Receipt processed and reward triggered');
    console.log('✓ Voucher code assigned to guest');
    console.log('✓ Voucher marked as redeemed');
    console.log('✓ Redemption status verified in database');
    console.log('✓ Pool statistics updated correctly');
    console.log('  - Total: 3');
    console.log('  - Available: 2');
    console.log('  - Redeemed: 1');

    return testData;

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\nError details:', error);
    throw error;
  }
}

async function cleanup(testData) {
  console.log('\n===========================================');
  console.log('Cleaning up test data...');
  console.log('===========================================');

  try {
    if (testData.rewardTypeId) {
      await db.ref(`voucherPools/${testData.rewardTypeId}`).remove();
      console.log('✅ Test voucher pool removed');
    }

    if (testData.campaignId) {
      await db.ref(`campaigns/${testData.campaignId}`).remove();
      console.log('✅ Test campaign removed');
    }

    if (testData.guestPhone) {
      await db.ref(`guests/${testData.guestPhone}`).remove();
      console.log('✅ Test guest removed');
    }

    if (testData.receiptId) {
      await db.ref(`receipts/${testData.receiptId}`).remove();
      console.log('✅ Test receipt removed');
    }

    if (testData.rewardId) {
      await db.ref(`rewards/${testData.rewardId}`).remove();
      console.log('✅ Test reward removed');
    }

    if (testData.guestPhone) {
      await db.ref(`guest-rewards/${testData.guestPhone}`).remove();
      console.log('✅ Guest-rewards index cleaned');
    }

    if (testData.campaignId) {
      await db.ref(`campaign-rewards/${testData.campaignId}`).remove();
      console.log('✅ Campaign-rewards index cleaned');
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Run the test
(async () => {
  let testData = {
    rewardTypeId: 'discount-20-f46',
    campaignId: null,
    guestPhone: null,
    receiptId: null,
    rewardId: null,
    voucherCode: null
  };

  try {
    testData = await testVoucherRedemptionWorkflow();
    await cleanup(testData);
    console.log('\n✅ Test completed successfully\n');
    process.exit(0);
  } catch (error) {
    await cleanup(testData);
    console.log('\n❌ Test failed\n');
    process.exit(1);
  }
})();
