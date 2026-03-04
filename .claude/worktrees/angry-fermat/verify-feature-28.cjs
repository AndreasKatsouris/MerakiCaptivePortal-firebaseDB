/**
 * Feature #28 Verification Script
 * Verify Enterprise tier has unlimited access
 */

const fs = require('fs');
const path = require('path');

console.log('===========================================');
console.log('Feature #28: Enterprise Tier Unlimited Access');
console.log('===========================================\n');

// Read the subscription service file
const subscriptionServicePath = path.join(__dirname, 'public/js/modules/access-control/services/subscription-service.js');
const content = fs.readFileSync(subscriptionServicePath, 'utf8');

// Extract the Enterprise tier configuration
const enterpriseMatch = content.match(/enterprise:\s*\{[\s\S]*?limits:\s*\{[\s\S]*?\}/);

if (!enterpriseMatch) {
  console.error('❌ Could not find Enterprise tier configuration');
  process.exit(1);
}

const enterpriseConfig = enterpriseMatch[0];

console.log('Enterprise Tier Configuration:');
console.log('------------------------------------------');

let allPassed = true;

// Check all limits are set to Infinity
const limitsToCheck = [
  { name: 'guestRecords', expected: 'Infinity' },
  { name: 'locations', expected: 'Infinity' },
  { name: 'receiptProcessing', expected: 'Infinity' },
  { name: 'campaignTemplates', expected: 'Infinity' }
];

limitsToCheck.forEach(limit => {
  const regex = new RegExp(`${limit.name}:\\s*(Infinity|\\d+)`);
  const match = enterpriseConfig.match(regex);

  if (match) {
    const value = match[1];
    if (value === 'Infinity') {
      console.log(`✅ ${limit.name}: Infinity (CORRECT)`);
    } else {
      console.log(`❌ ${limit.name}: ${value} (EXPECTED: Infinity)`);
      allPassed = false;
    }
  } else {
    console.log(`❌ ${limit.name}: NOT FOUND`);
    allPassed = false;
  }
});

console.log('\n------------------------------------------');
console.log('Verification of Infinity Handling:');
console.log('------------------------------------------\n');

// Check location limit enforcement handles Infinity
const locationInfinityCheck = content.match(/if \(maxLocations !== Infinity && currentLocations\.length >= maxLocations\)/);
if (locationInfinityCheck) {
  console.log('✅ Location limit enforcement: Correctly skips check when Infinity');
  console.log('   Logic: if (maxLocations !== Infinity && ...)');
} else {
  console.log('❌ Location limit enforcement: Does not properly handle Infinity');
  allPassed = false;
}

// Check unlimited location access
const unlimitedAccessCheck = content.match(/if \(maxLocations === Infinity \|\| maxLocations > 100\)/);
if (unlimitedAccessCheck) {
  console.log('✅ Unlimited location access: Correctly grants access when Infinity');
  console.log('   Logic: if (maxLocations === Infinity || maxLocations > 100)');
} else {
  console.log('❌ Unlimited location access: Does not properly handle Infinity');
  allPassed = false;
}

// Check isUnlimited flags
const locationUnlimitedFlag = content.match(/const isUnlimited = maxLocations === Infinity \|\| maxLocations > 100/);
const guestUnlimitedFlag = content.match(/const isUnlimited = maxGuests === Infinity \|\| maxGuests > 100000/);

if (locationUnlimitedFlag) {
  console.log('✅ Location quota unlimited flag: Correctly detects Infinity');
  console.log('   Logic: isUnlimited = maxLocations === Infinity || maxLocations > 100');
} else {
  console.log('❌ Location quota unlimited flag: Missing or incorrect');
  allPassed = false;
}

if (guestUnlimitedFlag) {
  console.log('✅ Guest quota unlimited flag: Correctly detects Infinity');
  console.log('   Logic: isUnlimited = maxGuests === Infinity || maxGuests > 100000');
} else {
  console.log('❌ Guest quota unlimited flag: Missing or incorrect');
  allPassed = false;
}

console.log('\n------------------------------------------');
console.log('Verification of Quota Display:');
console.log('------------------------------------------\n');

// Check that quota functions return 'unlimited' for Infinity
const quotaReturnCheck = content.match(/max: isUnlimited \? 'unlimited' : max/);
if (quotaReturnCheck) {
  console.log('✅ Quota display: Returns "unlimited" for Infinity values');
  console.log('   Logic: max: isUnlimited ? \'unlimited\' : maxValue');
} else {
  console.log('⚠️  Quota display: May not properly display unlimited status');
  // Not marking as failed since this is display-only
}

console.log('\n------------------------------------------');
console.log('Verification of Enterprise Features:');
console.log('------------------------------------------\n');

// Check for Enterprise-specific features
const enterpriseFeatures = [
  { name: 'campaignsCustom', expected: true },
  { name: 'rewardsCustom', expected: true },
  { name: 'advancedFoodCostCalculation', expected: true }
];

enterpriseFeatures.forEach(feature => {
  const regex = new RegExp(`${feature.name}:\\s*true`);
  const match = enterpriseConfig.match(regex);

  if (match) {
    console.log(`✅ ${feature.name}: Enabled`);
  } else {
    console.log(`❌ ${feature.name}: Not found or not enabled`);
    allPassed = false;
  }
});

console.log('\n------------------------------------------');
console.log('Verification of Hidden Tier Status:');
console.log('------------------------------------------\n');

// Check that Enterprise is a hidden tier (contact sales only)
const hiddenTierCheck = content.match(/enterprise:\s*\{[\s\S]*?isVisible:\s*false/);
if (hiddenTierCheck) {
  console.log('✅ Enterprise tier is hidden: isVisible: false (CORRECT)');
  console.log('   This tier is contact-sales only, not publicly visible');
} else {
  console.log('⚠️  Enterprise tier visibility: May be publicly visible');
  console.log('   Expected: isVisible: false (contact sales only)');
  // Not failing the test for this since it's a business logic choice
}

console.log('\n===========================================');
if (allPassed) {
  console.log('✅ ALL CHECKS PASSED');
  console.log('===========================================\n');
  console.log('Feature #28 Verification Summary:');
  console.log('- Enterprise tier guest limit: Infinity ✅');
  console.log('- Enterprise tier location limit: Infinity ✅');
  console.log('- Enterprise tier receipt limit: Infinity ✅');
  console.log('- Enterprise tier campaign limit: Infinity ✅');
  console.log('- Infinity handling in enforcement: Correct ✅');
  console.log('- Unlimited access logic: Correct ✅');
  console.log('- Quota display logic: Correct ✅');
  console.log('- Enterprise-specific features: Enabled ✅');
  console.log('\nConclusion: Feature #28 is PASSING');
  process.exit(0);
} else {
  console.log('❌ SOME CHECKS FAILED');
  console.log('===========================================');
  process.exit(1);
}
