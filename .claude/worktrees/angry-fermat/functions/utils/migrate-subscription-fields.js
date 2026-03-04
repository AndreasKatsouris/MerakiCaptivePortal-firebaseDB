/**
 * Database Migration Script: Subscription Field Standardization
 * 
 * This script migrates existing subscription data from `tier` field to `tierId` field
 * to ensure consistency across all platform components.
 * 
 * Usage: Run this once to migrate existing data
 */

const { rtdb, ref, get, set, update } = require('../config/firebase-admin');

/**
 * Migrates subscription data from 'tier' field to 'tierId' field
 * @returns {Promise<Object>} Migration result
 */
async function migrateSubscriptionFields() {
    const results = {
        migrated: 0,
        skipped: 0,
        errors: 0,
        details: []
    };

    try {
        console.log('🔄 Starting subscription field migration...');
        
        // Get all subscriptions
        const subscriptionsRef = ref(rtdb, 'subscriptions');
        const snapshot = await get(subscriptionsRef);
        
        if (!snapshot.exists()) {
            console.log('ℹ️  No subscriptions found to migrate');
            return results;
        }

        const subscriptions = snapshot.val();
        console.log(`📊 Found ${Object.keys(subscriptions).length} subscriptions to check`);

        // Process each subscription
        for (const [userId, subscription] of Object.entries(subscriptions)) {
            try {
                // Check if migration is needed
                if (subscription.tier && !subscription.tierId) {
                    console.log(`🔄 Migrating subscription for user ${userId}: ${subscription.tier} -> tierId`);
                    
                    // Create update object
                    const updates = {
                        tierId: subscription.tier,
                        // Keep the old field temporarily for rollback capability
                        // tier: subscription.tier,
                        migratedAt: Date.now(),
                        migrationVersion: '1.0.0'
                    };
                    
                    // Update the subscription
                    await update(ref(rtdb, `subscriptions/${userId}`), updates);
                    
                    results.migrated++;
                    results.details.push({
                        userId,
                        action: 'migrated',
                        from: subscription.tier,
                        to: subscription.tier
                    });
                    
                } else if (subscription.tierId) {
                    console.log(`✅ Subscription for user ${userId} already has tierId: ${subscription.tierId}`);
                    results.skipped++;
                    results.details.push({
                        userId,
                        action: 'skipped',
                        reason: 'already_has_tierId',
                        tierId: subscription.tierId
                    });
                    
                } else {
                    console.log(`⚠️  Subscription for user ${userId} missing both tier and tierId - setting to free`);
                    
                    // Set default free tier
                    await update(ref(rtdb, `subscriptions/${userId}`), {
                        tierId: 'free',
                        status: 'active',
                        migratedAt: Date.now(),
                        migrationVersion: '1.0.0'
                    });
                    
                    results.migrated++;
                    results.details.push({
                        userId,
                        action: 'default_set',
                        to: 'free'
                    });
                }
                
            } catch (error) {
                console.error(`❌ Error migrating subscription for user ${userId}:`, error);
                results.errors++;
                results.details.push({
                    userId,
                    action: 'error',
                    error: error.message
                });
            }
        }

        console.log('✅ Migration completed!');
        console.log(`📊 Results: ${results.migrated} migrated, ${results.skipped} skipped, ${results.errors} errors`);
        
        return results;
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

/**
 * Rollback function (in case of issues)
 * This can be used to revert changes if needed
 */
async function rollbackMigration() {
    console.log('🔄 Starting rollback of subscription field migration...');
    
    try {
        const subscriptionsRef = ref(rtdb, 'subscriptions');
        const snapshot = await get(subscriptionsRef);
        
        if (!snapshot.exists()) {
            console.log('ℹ️  No subscriptions found');
            return;
        }

        const subscriptions = snapshot.val();
        let rolledBack = 0;

        for (const [userId, subscription] of Object.entries(subscriptions)) {
            if (subscription.migratedAt && subscription.migrationVersion === '1.0.0') {
                console.log(`🔄 Rolling back subscription for user ${userId}`);
                
                // Remove migration fields
                const updates = {
                    migratedAt: null,
                    migrationVersion: null
                };
                
                // If we had kept the old tier field, we could restore it here
                // For now, we'll just remove the migration tracking
                
                await update(ref(rtdb, `subscriptions/${userId}`), updates);
                rolledBack++;
            }
        }

        console.log(`✅ Rollback completed! ${rolledBack} subscriptions processed`);
        
    } catch (error) {
        console.error('❌ Rollback failed:', error);
        throw error;
    }
}

module.exports = {
    migrateSubscriptionFields,
    rollbackMigration
};

// If this script is run directly
if (require.main === module) {
    migrateSubscriptionFields()
        .then(results => {
            console.log('\n📊 Final Results:', results);
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
}