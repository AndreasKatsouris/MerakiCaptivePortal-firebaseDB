/**
 * Test Script for Subscription Tier Fix
 * 
 * This script tests the subscription tier synchronization fix
 */

import { runCompleteDatabaseFix, createTestUserWithSubscription } from '../js/utils/subscription-tier-fix.js';
import { auth, rtdb, ref, get } from '../js/config/firebase-config.js';

/**
 * Test the subscription tier fix
 */
async function testSubscriptionFix() {
    console.log('🧪 Testing subscription tier fix...');
    
    try {
        // Step 1: Run complete database fix
        console.log('Step 1: Running complete database fix...');
        const fixResult = await runCompleteDatabaseFix();
        console.log('Fix result:', fixResult);
        
        // Step 2: Create test user with subscription
        console.log('Step 2: Creating test user...');
        const testUser = await createTestUserWithSubscription('test-user@example.com', 'professional');
        console.log('Test user created:', testUser);
        
        // Step 3: Verify tier data exists
        console.log('Step 3: Verifying tier data...');
        const tiersSnapshot = await get(ref(rtdb, 'subscriptionTiers'));
        const tiers = tiersSnapshot.val();
        console.log('Available tiers:', Object.keys(tiers || {}));
        
        // Step 4: Verify subscription structure
        console.log('Step 4: Verifying subscription structure...');
        if (testUser) {
            const subscriptionSnapshot = await get(ref(rtdb, `subscriptions/${testUser.userId}`));
            const subscription = subscriptionSnapshot.val();
            console.log('Test user subscription:', subscription);
            
            // Verify tier exists
            if (subscription && subscription.tierId) {
                const tierSnapshot = await get(ref(rtdb, `subscriptionTiers/${subscription.tierId}`));
                const tier = tierSnapshot.val();
                console.log('Test user tier data:', tier);
                
                if (tier) {
                    console.log('✅ Test passed: Subscription tier synchronization working correctly');
                    console.log('User has access to features:', Object.keys(tier.features || {}));
                } else {
                    console.log('❌ Test failed: Tier data not found');
                }
            } else {
                console.log('❌ Test failed: Subscription missing tierId');
            }
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
    }
}

/**
 * Test feature access with fixed subscription
 */
async function testFeatureAccess() {
    console.log('🧪 Testing feature access with fixed subscription...');
    
    try {
        // Import feature access control after fix
        const { featureAccessControl } = await import('./modules/access-control/services/feature-access-control.js');
        
        // Test feature access
        const result = await featureAccessControl.checkFeatureAccess('foodCostAnalytics');
        console.log('Feature access test result:', result);
        
        if (result.hasAccess !== undefined) {
            console.log('✅ Feature access test passed');
        } else {
            console.log('❌ Feature access test failed');
        }
        
    } catch (error) {
        console.error('❌ Feature access test failed:', error);
    }
}

/**
 * Run all tests
 */
async function runAllTests() {
    console.log('🚀 Starting subscription tier fix tests...');
    
    await testSubscriptionFix();
    await testFeatureAccess();
    
    console.log('🏁 All tests completed');
}

// Make functions available globally for manual testing
if (typeof window !== 'undefined') {
    window.subscriptionFixTest = {
        testSubscriptionFix,
        testFeatureAccess,
        runAllTests
    };
}

export { testSubscriptionFix, testFeatureAccess, runAllTests };