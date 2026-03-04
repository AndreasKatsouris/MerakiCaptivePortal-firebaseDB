/**
 * Setup Test Users for Feature #21 - Subscription Tier Gating
 * Creates test user accounts with different subscription tiers
 */

const admin = require('firebase-admin');

// Set project ID environment variable
process.env.GOOGLE_CLOUD_PROJECT = 'merakicaptiveportal-firebasedb';

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
    projectId: 'merakicaptiveportal-firebasedb'
});

const auth = admin.auth();
const db = admin.database();

async function setupTestUsers() {
    console.log('==========================================');
    console.log('Setting up Test Users for Feature #21');
    console.log('==========================================\n');

    const testUsers = [
        {
            email: 'testuser.free@sparks.test',
            password: 'Test1234!',
            tierId: 'free',
            displayName: 'Free Tier Test User'
        },
        {
            email: 'testuser.starter@sparks.test',
            password: 'Test1234!',
            tierId: 'starter',
            displayName: 'Starter Tier Test User'
        },
        {
            email: 'testuser.professional@sparks.test',
            password: 'Test1234!',
            tierId: 'professional',
            displayName: 'Professional Tier Test User'
        },
        {
            email: 'testuser.enterprise@sparks.test',
            password: 'Test1234!',
            tierId: 'enterprise',
            displayName: 'Enterprise Tier Test User'
        }
    ];

    // Tier definitions (matching subscription-service.js)
    const tierDefinitions = {
        free: {
            name: 'Free',
            description: 'Basic features for small operations',
            monthlyPrice: 0,
            features: {
                analyticsBasic: true,
                wifiBasic: true,
                guestManagementBasic: true,
                receiptProcessingManual: true,
                bookingManagement: true
            },
            limits: {
                guestRecords: 500,
                locations: 1,
                receiptProcessing: 50,
                campaignTemplates: 2,
                bookingEntries: 50
            }
        },
        starter: {
            name: 'Starter',
            description: 'Essential features for growing businesses',
            monthlyPrice: 49.99,
            features: {
                analyticsBasic: true,
                wifiBasic: true,
                guestManagementBasic: true,
                receiptProcessingManual: true,
                bookingManagement: true,
                campaignsBasic: true,
                rewardsBasic: true,
                whatsappBasic: true,
                multiLocation: true
            },
            limits: {
                guestRecords: 2000,
                locations: 2,
                receiptProcessing: 200,
                campaignTemplates: 5
            }
        },
        professional: {
            name: 'Professional',
            description: 'Advanced features for established businesses',
            monthlyPrice: 99.99,
            features: {
                analyticsBasic: true,
                analyticsAdvanced: true,
                analyticsExport: true,
                wifiBasic: true,
                guestManagementBasic: true,
                guestManagementAdvanced: true,
                receiptProcessingManual: true,
                receiptProcessingOCR: true,  // KEY FEATURE for testing
                campaignsBasic: true,
                campaignsAdvanced: true,
                rewardsBasic: true,
                rewardsAdvanced: true,
                whatsappBasic: true,
                whatsappAdvanced: true,
                foodCostBasic: true,  // KEY FEATURE for testing
                bookingManagement: true,
                bookingAdvanced: true,
                bookingAnalytics: true,
                multiLocation: true
            },
            limits: {
                guestRecords: 10000,
                locations: 5,
                receiptProcessing: 500,
                campaignTemplates: 20
            }
        },
        enterprise: {
            name: 'Enterprise',
            description: 'Complete solution for larger operations',
            monthlyPrice: 199.99,
            features: {
                analyticsBasic: true,
                analyticsAdvanced: true,
                analyticsExport: true,
                wifiBasic: true,
                guestManagementBasic: true,
                guestManagementAdvanced: true,
                receiptProcessingManual: true,
                receiptProcessingOCR: true,
                campaignsBasic: true,
                campaignsAdvanced: true,
                campaignsCustom: true,
                rewardsBasic: true,
                rewardsAdvanced: true,
                rewardsCustom: true,
                whatsappBasic: true,
                whatsappAdvanced: true,
                foodCostBasic: true,
                advancedFoodCostCalculation: true,
                bookingManagement: true,
                bookingAdvanced: true,
                bookingAnalytics: true,
                multiLocation: true
            },
            limits: {
                guestRecords: 999999,
                locations: 999999,
                receiptProcessing: 999999,
                campaignTemplates: 999999
            }
        }
    };

    for (const testUser of testUsers) {
        try {
            console.log(`\nCreating user: ${testUser.email}`);

            // Try to delete existing user first
            try {
                const existingUser = await auth.getUserByEmail(testUser.email);
                await auth.deleteUser(existingUser.uid);
                console.log('  - Deleted existing user');
            } catch (err) {
                // User doesn't exist, that's fine
            }

            // Create the user
            const userRecord = await auth.createUser({
                email: testUser.email,
                password: testUser.password,
                displayName: testUser.displayName,
                emailVerified: true
            });

            console.log(`  - Created Firebase Auth user: ${userRecord.uid}`);

            // Create subscription in database
            const now = Date.now();
            const tierData = tierDefinitions[testUser.tierId];

            const subscriptionData = {
                tierId: testUser.tierId,
                startDate: now,
                renewalDate: now + (30 * 24 * 60 * 60 * 1000), // 30 days
                status: 'active',
                paymentStatus: 'active',
                features: { ...tierData.features },
                limits: { ...tierData.limits },
                history: {
                    [now]: {
                        action: 'created_for_testing',
                        tierId: testUser.tierId,
                        timestamp: now
                    }
                }
            };

            await db.ref(`subscriptions/${userRecord.uid}`).set(subscriptionData);
            console.log(`  - Created ${testUser.tierId} subscription in database`);

            // Also create user profile
            await db.ref(`users/${userRecord.uid}`).set({
                email: testUser.email,
                displayName: testUser.displayName,
                createdAt: now,
                isTestUser: true
            });

            console.log(`✅ Successfully created ${testUser.tierId} tier user`);
            console.log(`   Email: ${testUser.email}`);
            console.log(`   Password: ${testUser.password}`);
            console.log(`   UID: ${userRecord.uid}`);

        } catch (error) {
            console.error(`❌ Error creating ${testUser.email}:`, error.message);
        }
    }

    console.log('\n==========================================');
    console.log('Test User Setup Complete');
    console.log('==========================================\n');

    console.log('Test Users Created:');
    console.log('1. Free Tier:');
    console.log('   Email: testuser.free@sparks.test');
    console.log('   Password: Test1234!');
    console.log('   Has OCR: NO (should be denied)\n');

    console.log('2. Starter Tier:');
    console.log('   Email: testuser.starter@sparks.test');
    console.log('   Password: Test1234!');
    console.log('   Has OCR: NO (should be denied)\n');

    console.log('3. Professional Tier:');
    console.log('   Email: testuser.professional@sparks.test');
    console.log('   Password: Test1234!');
    console.log('   Has OCR: YES (should be granted)\n');

    console.log('4. Enterprise Tier:');
    console.log('   Email: testuser.enterprise@sparks.test');
    console.log('   Password: Test1234!');
    console.log('   Has OCR: YES (should be granted)\n');

    // Exit
    process.exit(0);
}

setupTestUsers().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
