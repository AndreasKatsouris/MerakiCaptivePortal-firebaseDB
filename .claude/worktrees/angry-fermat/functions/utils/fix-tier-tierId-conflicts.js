/**
 * CRITICAL FIX: Tier/TierId Data Inconsistency Resolution
 * 
 * This script fixes the critical data inconsistency where users have both
 * `tier` and `tierId` fields with different values, causing incorrect feature access.
 * 
 * PROBLEM:
 * - Users show: tier: "professional", tierId: "free"  
 * - Feature access uses tierId (free) instead of tier (professional)
 * - Admin interface was writing tierId value to tier field
 * 
 * SOLUTION:
 * 1. Standardize on tierId as single source of truth
 * 2. Migrate tier values to tierId where needed
 * 3. Remove tier field to prevent future conflicts
 * 4. Add validation to prevent tier field writes
 */

const { rtdb, ref, get, set, update, remove } = require('../config/firebase-admin');

/**
 * Comprehensive fix for tier/tierId conflicts
 * @returns {Promise<Object>} Repair results
 */
async function fixTierTierIdConflicts() {
    const results = {
        usersProcessed: 0,
        conflictsFixed: 0,
        migratedToTierId: 0,
        removedTierField: 0,
        errors: 0,
        details: []
    };

    try {
        console.log('🔄 Starting comprehensive tier/tierId conflict resolution...');
        
        // Get all subscriptions
        const subscriptionsRef = ref(rtdb, 'subscriptions');
        const snapshot = await get(subscriptionsRef);
        
        if (!snapshot.exists()) {
            console.log('ℹ️  No subscriptions found to process');
            return results;
        }

        const subscriptions = snapshot.val();
        console.log(`📊 Found ${Object.keys(subscriptions).length} subscriptions to analyze`);

        // Process each subscription
        for (const [userId, subscription] of Object.entries(subscriptions)) {
            try {
                results.usersProcessed++;
                console.log(`\n🔍 Processing user ${userId}...`);
                
                const hasTier = subscription.tier !== undefined;
                const hasTierId = subscription.tierId !== undefined;
                const tierValue = subscription.tier;
                const tierIdValue = subscription.tierId;
                
                console.log(`   Current state: tier="${tierValue}", tierId="${tierIdValue}"`);

                let action = 'no-action';
                let updates = {};

                // CASE 1: Both fields exist with different values (CRITICAL CONFLICT)
                if (hasTier && hasTierId && tierValue !== tierIdValue) {
                    console.log(`   ❌ CONFLICT DETECTED: tier="${tierValue}" vs tierId="${tierIdValue}"`);
                    
                    // Use tier value as authoritative (user's actual subscription level)
                    // and update tierId to match
                    updates = {
                        tierId: tierValue,
                        // Remove tier field to prevent future conflicts
                        tier: null,
                        conflictResolvedAt: Date.now(),
                        conflictResolutionVersion: '1.0.0',
                        conflictResolutionNote: `Fixed tier/tierId mismatch: was tier="${tierValue}", tierId="${tierIdValue}", now tierId="${tierValue}"`
                    };
                    
                    action = 'conflict-resolved';
                    results.conflictsFixed++;
                    
                    console.log(`   ✅ CONFLICT RESOLVED: Setting tierId="${tierValue}", removing tier field`);

                // CASE 2: Only tier exists, no tierId (LEGACY USERS)
                } else if (hasTier && !hasTierId) {
                    console.log(`   🔄 LEGACY USER: Migrating tier="${tierValue}" to tierId`);
                    
                    updates = {
                        tierId: tierValue,
                        tier: null, // Remove tier field
                        migratedAt: Date.now(),
                        migrationVersion: '1.0.0'
                    };
                    
                    action = 'migrated-to-tierId';
                    results.migratedToTierId++;

                // CASE 3: Only tierId exists (MODERN USERS)
                } else if (!hasTier && hasTierId) {
                    console.log(`   ✅ MODERN USER: Already using tierId="${tierIdValue}" correctly`);
                    action = 'already-correct';

                // CASE 4: Both fields exist with same value (REDUNDANT BUT SAFE)
                } else if (hasTier && hasTierId && tierValue === tierIdValue) {
                    console.log(`   🧹 CLEANUP: Removing redundant tier field, keeping tierId="${tierIdValue}"`);
                    
                    updates = {
                        tier: null, // Remove redundant tier field
                        cleanedAt: Date.now()
                    };
                    
                    action = 'removed-redundant-tier';
                    results.removedTierField++;

                // CASE 5: Neither field exists (BROKEN SUBSCRIPTION)
                } else if (!hasTier && !hasTierId) {
                    console.log(`   ⚠️  BROKEN SUBSCRIPTION: Setting default tierId="free"`);
                    
                    updates = {
                        tierId: 'free',
                        status: 'active',
                        repairedAt: Date.now(),
                        repairNote: 'Added default tierId due to missing tier information'
                    };
                    
                    action = 'repaired-broken';
                    results.migratedToTierId++;
                }

                // Apply updates if needed
                if (Object.keys(updates).length > 0) {
                    await update(ref(rtdb, `subscriptions/${userId}`), updates);
                    console.log(`   💾 Updates applied successfully`);
                } else {
                    console.log(`   ⏭️  No updates needed`);
                }

                // Record result
                results.details.push({
                    userId,
                    action,
                    beforeState: { tier: tierValue, tierId: tierIdValue },
                    afterState: { 
                        tierId: updates.tierId || tierIdValue, 
                        tierRemoved: updates.tier === null 
                    },
                    timestamp: Date.now()
                });
                
            } catch (error) {
                console.error(`❌ Error processing user ${userId}:`, error);
                results.errors++;
                results.details.push({
                    userId,
                    action: 'error',
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }

        console.log('\n✅ Conflict resolution completed!');
        console.log(`📊 Results Summary:`);
        console.log(`   - Users processed: ${results.usersProcessed}`);
        console.log(`   - Conflicts fixed: ${results.conflictsFixed}`);
        console.log(`   - Migrated to tierId: ${results.migratedToTierId}`);
        console.log(`   - Removed tier field: ${results.removedTierField}`);
        console.log(`   - Errors: ${results.errors}`);
        
        // Save repair log
        const logRef = ref(rtdb, `_system/tier-conflict-repair-log/${Date.now()}`);
        await set(logRef, {
            timestamp: Date.now(),
            results,
            version: '1.0.0'
        });

        return results;
        
    } catch (error) {
        console.error('❌ Conflict resolution failed:', error);
        throw error;
    }
}

/**
 * Validation function to check for any remaining conflicts
 * @returns {Promise<Object>} Validation results
 */
async function validateTierConsistency() {
    console.log('🔍 Validating tier consistency...');
    
    const issues = {
        conflicts: [],
        missingTierIds: [],
        total: 0
    };

    try {
        const subscriptionsRef = ref(rtdb, 'subscriptions');
        const snapshot = await get(subscriptionsRef);
        
        if (!snapshot.exists()) {
            return issues;
        }

        const subscriptions = snapshot.val();
        
        for (const [userId, subscription] of Object.entries(subscriptions)) {
            issues.total++;
            
            // Check for conflicts (shouldn't exist after fix)
            if (subscription.tier && subscription.tierId && subscription.tier !== subscription.tierId) {
                issues.conflicts.push({
                    userId,
                    tier: subscription.tier,
                    tierId: subscription.tierId
                });
            }
            
            // Check for missing tierId
            if (!subscription.tierId) {
                issues.missingTierIds.push({
                    userId,
                    tier: subscription.tier || 'undefined'
                });
            }
        }

        console.log(`✅ Validation complete:`);
        console.log(`   - Total subscriptions: ${issues.total}`);
        console.log(`   - Conflicts found: ${issues.conflicts.length}`);
        console.log(`   - Missing tierIds: ${issues.missingTierIds.length}`);

        return issues;
        
    } catch (error) {
        console.error('❌ Validation failed:', error);
        throw error;
    }
}

module.exports = {
    fixTierTierIdConflicts,
    validateTierConsistency
};

// If this script is run directly
if (require.main === module) {
    fixTierTierIdConflicts()
        .then(results => {
            console.log('\n🎉 Tier/TierId conflict resolution completed successfully!');
            
            // Run validation
            return validateTierConsistency();
        })
        .then(validation => {
            if (validation.conflicts.length === 0 && validation.missingTierIds.length === 0) {
                console.log('\n✅ All tier data is now consistent!');
                process.exit(0);
            } else {
                console.log('\n⚠️  Some issues remain:', validation);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\n❌ Fix failed:', error);
            process.exit(1);
        });
}