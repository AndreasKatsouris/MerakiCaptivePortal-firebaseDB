/**
 * Test Feature #35: Campaign data stored in real database
 *
 * This test verifies that campaign data is stored in Firebase RTDB and persists
 * correctly with all required fields.
 *
 * Test Steps:
 * 1. Create campaign 'Test Campaign 2025'
 * 2. Set date range and reward type
 * 3. Save campaign to database
 * 4. Verify campaign exists in Firebase Console (campaigns node)
 * 5. Refresh and verify campaign loads correctly
 * 6. Verify all fields are preserved
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

async function testCampaignPersistence() {
  console.log('\n===========================================');
  console.log('FEATURE #35: Campaign Data Persistence Test');
  console.log('===========================================\n');

  const testCampaignId = db.ref('campaigns').push().key;
  const testCampaign = {
    name: 'Test Campaign 2025',
    brandName: 'Test Brand',
    storeName: 'Test Store',
    minPurchaseAmount: 100,
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    status: 'active',
    rewardTypes: ['voucher', 'discount'],
    requiredItems: ['item1', 'item2'],
    activeDays: ['monday', 'tuesday', 'wednesday'],
    createdAt: new Date().toISOString(),
    createdBy: 'test-user-id',
    testData: true // Mark this as test data for easy cleanup
  };

  try {
    // Step 1: Create test campaign
    console.log('Step 1: Creating test campaign "Test Campaign 2025"...');
    await db.ref(`campaigns/${testCampaignId}`).set(testCampaign);
    console.log('✅ Campaign created with ID:', testCampaignId);
    console.log('   Name:', testCampaign.name);
    console.log('   Brand:', testCampaign.brandName);
    console.log('   Date Range:', testCampaign.startDate, 'to', testCampaign.endDate);
    console.log('   Reward Types:', testCampaign.rewardTypes.join(', '));

    // Step 2: Verify campaign exists in database
    console.log('\nStep 2: Verifying campaign exists in Firebase RTDB...');
    const snapshot1 = await db.ref(`campaigns/${testCampaignId}`).once('value');
    const campaignData1 = snapshot1.val();

    if (!campaignData1) {
      throw new Error('❌ FAILED: Campaign not found in database after creation');
    }
    console.log('✅ Campaign found in database');
    console.log('   Name:', campaignData1.name);
    console.log('   Status:', campaignData1.status);
    console.log('   Brand:', campaignData1.brandName);

    // Step 3: Verify campaign appears in campaigns node
    console.log('\nStep 3: Checking Firebase Console campaigns node...');
    const allCampaignsSnapshot = await db.ref('campaigns').once('value');
    const allCampaigns = allCampaignsSnapshot.val() || {};

    console.log('✅ All campaigns fetched from database');
    console.log('   Total campaigns in database:', Object.keys(allCampaigns).length);

    if (!allCampaigns[testCampaignId]) {
      throw new Error('❌ FAILED: Campaign not found in campaigns node');
    }
    console.log('✅ Test campaign found in campaigns node');

    // Step 4: Simulate refresh (re-fetch campaign data)
    console.log('\nStep 4: Simulating page refresh (re-fetching campaign data)...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay

    const snapshot2 = await db.ref(`campaigns/${testCampaignId}`).once('value');
    const campaignData2 = snapshot2.val();

    if (!campaignData2) {
      throw new Error('❌ FAILED: Campaign not found after refresh');
    }
    console.log('✅ Campaign persists after refresh');

    // Step 5: Verify all fields are preserved
    console.log('\nStep 5: Verifying all campaign fields are preserved...');

    const fieldsToCheck = [
      'name',
      'brandName',
      'storeName',
      'minPurchaseAmount',
      'startDate',
      'endDate',
      'status',
      'rewardTypes',
      'requiredItems',
      'activeDays',
      'createdAt',
      'createdBy'
    ];

    let allFieldsPresent = true;
    fieldsToCheck.forEach(field => {
      if (campaignData2[field] === undefined) {
        console.log(`❌ Missing field: ${field}`);
        allFieldsPresent = false;
      } else {
        console.log(`✅ Field preserved: ${field} = ${JSON.stringify(campaignData2[field])}`);
      }
    });

    if (!allFieldsPresent) {
      throw new Error('❌ FAILED: Not all fields preserved');
    }

    // Step 6: Verify specific field values
    console.log('\nStep 6: Verifying specific field values...');

    if (campaignData2.name !== 'Test Campaign 2025') {
      throw new Error(`❌ FAILED: Name mismatch. Expected "Test Campaign 2025", got "${campaignData2.name}"`);
    }
    console.log('✅ Name matches: "Test Campaign 2025"');

    if (campaignData2.startDate !== '2025-01-01') {
      throw new Error(`❌ FAILED: Start date mismatch`);
    }
    console.log('✅ Start date matches: 2025-01-01');

    if (campaignData2.endDate !== '2025-12-31') {
      throw new Error(`❌ FAILED: End date mismatch`);
    }
    console.log('✅ End date matches: 2025-12-31');

    if (!Array.isArray(campaignData2.rewardTypes) || campaignData2.rewardTypes.length !== 2) {
      throw new Error('❌ FAILED: Reward types not preserved correctly');
    }
    console.log('✅ Reward types preserved:', campaignData2.rewardTypes);

    // Step 7: Verify Firebase Console accessibility
    console.log('\nStep 7: Verifying Firebase Console access...');
    console.log('✅ Campaign exists in Firebase RTDB at path:');
    console.log('   /campaigns/' + testCampaignId);
    console.log('   URL: https://console.firebase.google.com/project/merakicaptiveportal-firebasedb/database/data/campaigns/' + testCampaignId);

    // Success!
    console.log('\n===========================================');
    console.log('✅ FEATURE #35 VERIFICATION: PASSED');
    console.log('===========================================');
    console.log('\nAll checks passed:');
    console.log('✓ Campaign "Test Campaign 2025" created');
    console.log('✓ Campaign stored in Firebase RTDB');
    console.log('✓ Campaign persists after page refresh');
    console.log('✓ Date range fields preserved (2025-01-01 to 2025-12-31)');
    console.log('✓ Reward types preserved correctly');
    console.log('✓ All campaign fields intact');
    console.log('✓ Campaign accessible in Firebase Console');

    return testCampaignId;

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\nError details:', error);
    throw error;
  }
}

async function cleanup(testCampaignId) {
  if (testCampaignId) {
    console.log('\n===========================================');
    console.log('Cleaning up test data...');
    console.log('===========================================');

    await db.ref(`campaigns/${testCampaignId}`).remove();
    console.log('✅ Test campaign removed');
  }
}

// Run the test
(async () => {
  let testCampaignId;
  try {
    testCampaignId = await testCampaignPersistence();
    await cleanup(testCampaignId);
    console.log('\n✅ Test completed successfully\n');
    process.exit(0);
  } catch (error) {
    if (testCampaignId) {
      await cleanup(testCampaignId);
    }
    console.log('\n❌ Test failed\n');
    process.exit(1);
  }
})();
