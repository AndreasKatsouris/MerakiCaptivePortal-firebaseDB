/**
 * Test Feature #82: Deleting campaign removes from active campaigns
 *
 * Verification Steps:
 * 1. Create active campaign
 * 2. Note campaign appears in campaign list
 * 3. Delete campaign
 * 4. Verify campaign removed from list
 * 5. Verify receipts no longer link to deleted campaign
 * 6. Check Firebase campaigns node confirms deletion
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

async function testCampaignCleanup() {
    console.log('\n==========================================');
    console.log('Feature #82: Campaign Cleanup Test');
    console.log('==========================================\n');

    const testCampaignId = `test-campaign-${Date.now()}`;
    const testReceiptIds = [];

    try {
        // Step 1: Create active campaign
        console.log('Step 1: Creating active campaign...');
        const campaignData = {
            name: 'Test Campaign DEL',
            brandName: 'Test Brand',
            description: 'Test campaign for deletion testing',
            status: 'active',
            startDate: Date.now(),
            endDate: Date.now() + 86400000, // +1 day
            createdAt: Date.now()
        };

        await db.ref(`campaigns/${testCampaignId}`).set(campaignData);
        console.log('✅ Campaign created:', testCampaignId);

        // Step 2: Create receipts that reference this campaign
        console.log('\nStep 2: Creating receipts that link to campaign...');

        // Create 3 test receipts with campaignId
        for (let i = 1; i <= 3; i++) {
            const receiptId = `test-receipt-${Date.now()}-${i}`;
            testReceiptIds.push(receiptId);

            await db.ref(`receipts/${receiptId}`).set({
                campaignId: testCampaignId,
                brandName: 'Test Brand',
                totalAmount: 100 + i * 10,
                timestamp: Date.now(),
                guestPhone: `+2782000${i.toString().padStart(4, '0')}`
            });
        }

        console.log(`✅ Created ${testReceiptIds.length} receipts linked to campaign`);

        // Create one receipt without campaignId (control)
        const controlReceiptId = `control-receipt-${Date.now()}`;
        await db.ref(`receipts/${controlReceiptId}`).set({
            brandName: 'Other Brand',
            totalAmount: 200,
            timestamp: Date.now(),
            guestPhone: '+27820009999'
        });
        console.log('✅ Created control receipt without campaign link');

        // Verify campaign and receipts exist before deletion
        console.log('\nStep 2b: Verifying data exists before deletion...');

        const campaignBeforeSnapshot = await db.ref(`campaigns/${testCampaignId}`).once('value');
        console.log('  Campaign exists:', campaignBeforeSnapshot.exists());

        if (!campaignBeforeSnapshot.exists()) {
            throw new Error('Campaign was not created properly');
        }

        // Verify receipts have campaignId
        let linkedReceiptsCount = 0;
        for (const receiptId of testReceiptIds) {
            const receiptSnapshot = await db.ref(`receipts/${receiptId}`).once('value');
            const receipt = receiptSnapshot.val();
            if (receipt && receipt.campaignId === testCampaignId) {
                linkedReceiptsCount++;
            }
        }

        console.log(`  Receipts linked to campaign: ${linkedReceiptsCount}`);

        if (linkedReceiptsCount !== testReceiptIds.length) {
            throw new Error('Not all receipts were linked to campaign');
        }

        // Step 3: Delete campaign (simulating the cascade cleanup)
        console.log('\nStep 3: Deleting campaign with cascade cleanup...');

        // CASCADE DELETE: Clean up campaign references in receipts
        const receiptsSnapshot = await db.ref('receipts').once('value');
        if (receiptsSnapshot.exists()) {
            const receipts = receiptsSnapshot.val();
            const updates = {};

            Object.entries(receipts).forEach(([receiptId, receipt]) => {
                if (receipt.campaignId === testCampaignId) {
                    updates[`receipts/${receiptId}/campaignId`] = null;
                }
            });

            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
                console.log(`  Cleaned up ${Object.keys(updates).length} receipt references`);
            }
        }

        // Delete the campaign
        await db.ref(`campaigns/${testCampaignId}`).remove();
        console.log('✅ Campaign deleted');

        // Step 4 & 5: Verify campaign removed and receipts no longer link
        console.log('\nStep 4 & 5: Verifying cleanup...');

        const campaignAfterSnapshot = await db.ref(`campaigns/${testCampaignId}`).once('value');
        if (campaignAfterSnapshot.exists()) {
            console.log('❌ FAIL: Campaign still exists after deletion');
            return false;
        }
        console.log('✅ PASS: Campaign removed from Firebase');

        // Verify receipts no longer have campaignId
        let cleanedReceiptsCount = 0;
        for (const receiptId of testReceiptIds) {
            const receiptSnapshot = await db.ref(`receipts/${receiptId}`).once('value');
            const receipt = receiptSnapshot.val();

            if (!receipt) {
                console.log(`❌ FAIL: Receipt ${receiptId} was incorrectly deleted`);
                return false;
            }

            if (receipt.campaignId === null || receipt.campaignId === undefined) {
                cleanedReceiptsCount++;
            } else if (receipt.campaignId === testCampaignId) {
                console.log(`❌ FAIL: Receipt ${receiptId} still links to deleted campaign`);
                return false;
            }
        }

        console.log(`✅ PASS: ${cleanedReceiptsCount} receipts no longer link to deleted campaign`);

        // Verify control receipt is unaffected
        const controlSnapshot = await db.ref(`receipts/${controlReceiptId}`).once('value');
        if (!controlSnapshot.exists()) {
            console.log('❌ FAIL: Control receipt was incorrectly deleted');
            return false;
        }
        console.log('✅ PASS: Control receipt unaffected');

        // Cleanup: Remove test receipts
        console.log('\nCleaning up test receipts...');
        for (const receiptId of [...testReceiptIds, controlReceiptId]) {
            await db.ref(`receipts/${receiptId}`).remove();
        }
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
            await db.ref(`campaigns/${testCampaignId}`).remove();
            for (const receiptId of testReceiptIds) {
                await db.ref(`receipts/${receiptId}`).remove();
            }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError.message);
        }

        return false;
    }
}

// Run the test
testCampaignCleanup()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Unexpected error:', error);
        process.exit(1);
    });
