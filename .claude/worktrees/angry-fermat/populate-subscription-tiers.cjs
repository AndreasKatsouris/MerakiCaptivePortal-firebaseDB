/**
 * Populate Subscription Tiers in Firebase RTDB
 * This ensures the subscriptionTiers node exists with all tier definitions
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

const db = admin.database();

async function populateSubscriptionTiers() {
    console.log('\n==========================================');
    console.log('Populating Subscription Tiers');
    console.log('==========================================\n');

    const subscriptionTiers = {
        free: {
            name: 'Free',
            description: 'Basic features for small operations',
            monthlyPrice: 0,
            annualPrice: 0,
            isVisible: true,
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
                bookingEntries: 50,
                bookingHistoryDays: 30
            }
        },
        starter: {
            name: 'Starter',
            description: 'Essential features for growing businesses',
            monthlyPrice: 49.99,
            annualPrice: 499.99,
            isVisible: true,
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
            annualPrice: 999.99,
            isVisible: true,
            features: {
                analyticsBasic: true,
                analyticsAdvanced: true,
                analyticsExport: true,
                wifiBasic: true,
                guestManagementBasic: true,
                guestManagementAdvanced: true,
                receiptProcessingManual: true,
                receiptProcessingOCR: true,  // KEY: Professional+ feature
                receiptProcessingAutomated: true,
                campaignsBasic: true,
                campaignsAdvanced: true,
                rewardsBasic: true,
                rewardsAdvanced: true,
                whatsappBasic: true,
                whatsappAdvanced: true,
                foodCostBasic: true,  // KEY: Professional+ feature
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
            annualPrice: 1999.99,
            isVisible: false,
            features: {
                analyticsBasic: true,
                analyticsAdvanced: true,
                analyticsExport: true,
                wifiBasic: true,
                guestManagementBasic: true,
                guestManagementAdvanced: true,
                receiptProcessingManual: true,
                receiptProcessingOCR: true,
                receiptProcessingAutomated: true,
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

    try {
        console.log('Writing subscription tiers to database...\n');

        for (const [tierId, tierData] of Object.entries(subscriptionTiers)) {
            await db.ref(`subscriptionTiers/${tierId}`).set(tierData);
            console.log(`✅ ${tierData.name} tier created`);
            console.log(`   Monthly: $${tierData.monthlyPrice}`);
            console.log(`   Features: ${Object.keys(tierData.features).length}`);
            console.log(`   Visible: ${tierData.isVisible}`);
            console.log('');
        }

        console.log('==========================================');
        console.log('Subscription Tiers Created Successfully');
        console.log('==========================================\n');

        // Verify they were written
        const snapshot = await db.ref('subscriptionTiers').once('value');
        const tiers = snapshot.val();

        console.log('Verification:');
        console.log(`Found ${Object.keys(tiers).length} tiers in database:`);
        Object.keys(tiers).forEach(tierId => {
            console.log(`  - ${tierId}: ${tiers[tierId].name}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error populating tiers:', error);
        process.exit(1);
    }
}

populateSubscriptionTiers();
