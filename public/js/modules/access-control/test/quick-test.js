/**
 * Quick Test Script for Tier Management
 * Run this in the browser console to test the feature access control system
 */

// This script can be run in the browser console to quickly test the system
console.log('=== Tier Management Quick Test ===');

// Function to run all tests
async function runTierTests() {
  try {
    // Import the necessary modules
    const { default: featureAccessControl } = await import('../services/feature-access-control.js');
    const { PLATFORM_FEATURES, FEATURE_CATEGORIES } = await import('../services/platform-features.js');
    
    console.log('\n1. Testing Platform Features Definition:');
    console.log('Total features defined:', Object.keys(PLATFORM_FEATURES).length);
    console.log('Categories:', Object.keys(FEATURE_CATEGORIES));
    
    // Show a sample feature
    const sampleFeature = PLATFORM_FEATURES.analyticsAdvanced;
    console.log('Sample feature (analyticsAdvanced):', sampleFeature);
    
    console.log('\n2. Testing Feature Access Control:');
    
    // Test current user access
    try {
      const basicAccess = await featureAccessControl.checkFeatureAccess('analyticsBasic');
      console.log('Basic Analytics access:', basicAccess.hasAccess ? '✅ Granted' : '❌ Denied');
      
      const advancedAccess = await featureAccessControl.checkFeatureAccess('analyticsAdvanced');
      console.log('Advanced Analytics access:', advancedAccess.hasAccess ? '✅ Granted' : '❌ Denied');
      
      if (advancedAccess.tier) {
        console.log('User tier:', advancedAccess.tier.name);
      }
    } catch (error) {
      console.log('❌ Error checking access (user might not be authenticated):', error.message);
    }
    
    console.log('\n3. Testing Available Features:');
    const availableFeatures = await featureAccessControl.getAvailableFeatures();
    console.log('Features available to current user:', availableFeatures.length);
    if (availableFeatures.length > 0) {
      console.log('Available features:', availableFeatures.map(f => f.name).join(', '));
    }
    
    console.log('\n4. Testing Upgrade Options:');
    const upgradeOptions = await featureAccessControl.getUpgradeOptionsForFeature('analyticsRealtime');
    console.log('Tiers with Real-time Analytics:', upgradeOptions.length);
    upgradeOptions.forEach(tier => {
      console.log(`  - ${tier.name}: $${tier.monthlyPrice}/month`);
    });
    
    console.log('\n5. Testing Multiple Feature Checks:');
    const hasAnyAnalytics = await featureAccessControl.hasAnyFeature(['analyticsBasic', 'analyticsAdvanced']);
    console.log('Has any analytics feature:', hasAnyAnalytics ? '✅ Yes' : '❌ No');
    
    const hasAllPremium = await featureAccessControl.hasAllFeatures(['analyticsAdvanced', 'analyticsRealtime', 'analyticsPredictive']);
    console.log('Has all premium analytics:', hasAllPremium ? '✅ Yes' : '❌ No');
    
    console.log('\n=== Test Complete ===');
    console.log('Check the network tab to see Firebase requests');
    console.log('To test UI components, navigate to a page with feature guards');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Function to create test data
async function createTestData() {
  console.log('\n=== Creating Test Data ===');
  
  const { rtdb, ref, set } = await import('../../../../config/firebase-config.js');
  const { PLATFORM_FEATURES } = await import('../services/platform-features.js');
  
  // Create test tiers
  const testTiers = {
    basic: {
      name: 'Basic',
      description: 'Essential features for small businesses',
      monthlyPrice: 29,
      annualPrice: 290,
      features: {
        wifiBasic: true,
        whatsappBasic: true,
        analyticsBasic: true,
        guestBasic: true
      },
      limits: {
        monthlyUsers: 100,
        locations: 1,
        campaignsPerMonth: 5
      }
    },
    professional: {
      name: 'Professional',
      description: 'Advanced features for growing businesses',
      monthlyPrice: 99,
      annualPrice: 990,
      features: {
        wifiBasic: true,
        wifiAdvanced: true,
        whatsappBasic: true,
        whatsappBot: true,
        analyticsBasic: true,
        analyticsAdvanced: true,
        campaignBasic: true,
        guestBasic: true,
        guestAdvanced: true,
        rewardsBasic: true
      },
      limits: {
        monthlyUsers: 1000,
        locations: 3,
        campaignsPerMonth: 20
      }
    },
    enterprise: {
      name: 'Enterprise',
      description: 'Complete platform access',
      monthlyPrice: 299,
      annualPrice: 2990,
      features: Object.keys(PLATFORM_FEATURES).reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {}),
      limits: {
        monthlyUsers: 'Infinity',
        locations: 'Infinity',
        campaignsPerMonth: 'Infinity'
      }
    }
  };
  
  try {
    await set(ref(rtdb, 'tiers'), testTiers);
    console.log('✅ Test tiers created successfully');
    console.log('Tiers created:', Object.keys(testTiers).join(', '));
  } catch (error) {
    console.error('❌ Failed to create test tiers:', error);
  }
}

// Function to test UI components
function testUIComponents() {
  console.log('\n=== UI Component Test Instructions ===');
  console.log('1. To test FeatureGuard component:');
  console.log('   - Look for sections that should be hidden based on your tier');
  console.log('   - Check for "Feature Locked" placeholders');
  console.log('');
  console.log('2. To test FeatureButton component:');
  console.log('   - Look for buttons with lock icons');
  console.log('   - Click them to see upgrade prompts');
  console.log('');
  console.log('3. To manually trigger an upgrade prompt:');
  console.log("   featureAccessControl.showAccessDeniedMessage('analyticsRealtime')");
}

// Export functions for easy access
window.tierTests = {
  runTests: runTierTests,
  createTestData: createTestData,
  showInstructions: testUIComponents
};

// Show instructions
console.log('\n🧪 Tier Management Test Suite Loaded!');
console.log('');
console.log('Available commands:');
console.log('  tierTests.runTests()      - Run all tests');
console.log('  tierTests.createTestData() - Create test tiers in Firebase');
console.log('  tierTests.showInstructions() - Show UI testing instructions');
console.log('');
console.log('Run tierTests.runTests() to start...');
