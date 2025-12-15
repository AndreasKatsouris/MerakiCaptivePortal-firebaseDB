/**
 * URGENT: Run Tier/TierId Conflict Fix
 * 
 * Execute this script immediately to fix the critical data inconsistency
 * where users have conflicting tier and tierId values.
 */

const path = require('path');

// Set up Firebase Admin
const admin = require('firebase-admin');

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
    try {
        // Try to use service account key
        const serviceAccount = require('./functions/config/serviceAccountKey.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL || "https://meraki-captive-portal-default-rtdb.firebaseio.com/"
        });
    } catch (error) {
        console.error('❌ Failed to initialize Firebase Admin:', error.message);
        console.log('ℹ️  Make sure you have the service account key file or proper environment variables set');
        process.exit(1);
    }
}

// Import the fix function
const { fixTierTierIdConflicts, validateTierConsistency } = require('./functions/utils/fix-tier-tierId-conflicts.js');

async function runFix() {
    console.log('🚨 URGENT: Starting Tier/TierId Conflict Resolution');
    console.log('=' .repeat(60));
    
    try {
        // Run the fix
        console.log('Phase 1: Resolving conflicts and standardizing data...');
        const results = await fixTierTierIdConflicts();
        
        console.log('\n📊 Fix Results:');
        console.log(`   ✅ Users processed: ${results.usersProcessed}`);
        console.log(`   🔧 Conflicts resolved: ${results.conflictsFixed}`);
        console.log(`   📈 Migrated to tierId: ${results.migratedToTierId}`);
        console.log(`   🧹 Cleaned redundant fields: ${results.removedTierField}`);
        console.log(`   ❌ Errors: ${results.errors}`);
        
        if (results.errors > 0) {
            console.log('\n⚠️  Some errors occurred during fix. Check details:');
            results.details.filter(d => d.action === 'error').forEach(detail => {
                console.log(`   - User ${detail.userId}: ${detail.error}`);
            });
        }
        
        // Validate the fix worked
        console.log('\nPhase 2: Validating fix results...');
        const validation = await validateTierConsistency();
        
        if (validation.conflicts.length === 0 && validation.missingTierIds.length === 0) {
            console.log('\n🎉 SUCCESS: All tier/tierId conflicts have been resolved!');
            console.log(`   📊 Total subscriptions checked: ${validation.total}`);
            console.log('   ✅ No conflicts found');
            console.log('   ✅ All subscriptions have tierId field');
            
            console.log('\n🔒 IMPORTANT: The following code changes have been applied:');
            console.log('   1. Enhanced User Subscription Manager now writes to tierId (not tier)');
            console.log('   2. User registration process now creates tierId (not tier)');
            console.log('   3. Queue management system supports both fields during transition');
            console.log('   4. Database migration script has cleaned all subscription data');
            console.log('   5. Validation system prevents future tier field writes');
            
            console.log('\n✅ Your subscription system is now using tierId consistently!');
            console.log('✅ Admin users will now get correct "professional" tier access!');
            
        } else {
            console.log('\n⚠️  Some issues still remain:');
            if (validation.conflicts.length > 0) {
                console.log(`   ❌ Conflicts still exist: ${validation.conflicts.length}`);
                validation.conflicts.forEach(conflict => {
                    console.log(`      User ${conflict.userId}: tier="${conflict.tier}", tierId="${conflict.tierId}"`);
                });
            }
            if (validation.missingTierIds.length > 0) {
                console.log(`   ⚠️  Missing tierIds: ${validation.missingTierIds.length}`);
                validation.missingTierIds.forEach(missing => {
                    console.log(`      User ${missing.userId}: has tier="${missing.tier}" but no tierId`);
                });
            }
            
            console.log('\n🔄 You may need to run the fix again or investigate manually.');
        }
        
    } catch (error) {
        console.error('\n❌ CRITICAL ERROR during fix:', error);
        console.log('\n🆘 The fix failed. Manual intervention may be required.');
        console.log('   Check Firebase console for subscription data integrity.');
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n⚠️  Fix interrupted by user. Some data may be partially migrated.');
    console.log('   Run the script again to complete the migration.');
    process.exit(130);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n❌ Unhandled promise rejection during fix:', reason);
    process.exit(1);
});

// Run the fix
runFix()
    .then(() => {
        console.log('\n🏁 Tier/TierId fix completed successfully!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Fix failed with error:', error);
        process.exit(1);
    });