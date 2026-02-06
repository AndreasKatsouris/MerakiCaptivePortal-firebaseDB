/**
 * Feature #27 Verification Script
 * Verify Professional tier limits (10000 guests, 5 locations)
 */

const fs = require('fs');
const path = require('path');

console.log('===========================================');
console.log('Feature #27: Professional Tier Limits');
console.log('===========================================\n');

// Read the subscription service file
const subscriptionServicePath = path.join(__dirname, 'public/js/modules/access-control/services/subscription-service.js');
const content = fs.readFileSync(subscriptionServicePath, 'utf8');

// Extract the Professional tier configuration
const professionalMatch = content.match(/professional:\s*\{[\s\S]*?limits:\s*\{[\s\S]*?\}/);

if (!professionalMatch) {
  console.error('❌ Could not find Professional tier configuration');
  process.exit(1);
}

const professionalConfig = professionalMatch[0];

// Check for guest limit
const guestLimitMatch = professionalConfig.match(/guestRecords:\s*(\d+)/);
const locationLimitMatch = professionalConfig.match(/locations:\s*(\d+)/);

console.log('Professional Tier Configuration:');
console.log('------------------------------------------');

let allPassed = true;

if (guestLimitMatch) {
  const guestLimit = parseInt(guestLimitMatch[1]);
  if (guestLimit === 10000) {
    console.log('✅ Guest Records Limit: 10,000 (CORRECT)');
  } else {
    console.log(`❌ Guest Records Limit: ${guestLimit} (EXPECTED: 10,000)`);
    allPassed = false;
  }
} else {
  console.log('❌ Guest Records Limit: NOT FOUND');
  allPassed = false;
}

if (locationLimitMatch) {
  const locationLimit = parseInt(locationLimitMatch[1]);
  if (locationLimit === 5) {
    console.log('✅ Locations Limit: 5 (CORRECT)');
  } else {
    console.log(`❌ Locations Limit: ${locationLimit} (EXPECTED: 5)`);
    allPassed = false;
  }
} else {
  console.log('❌ Locations Limit: NOT FOUND');
  allPassed = false;
}

console.log('\n------------------------------------------');
console.log('Verification of Enforcement Logic:');
console.log('------------------------------------------\n');

// Check addLocationToSubscription function
const addLocationMatch = content.match(/if \(maxLocations !== Infinity && currentLocations\.length >= maxLocations\)/);
if (addLocationMatch) {
  console.log('✅ Location limit enforcement: FOUND');
  console.log('   Logic: Prevents adding location when currentLocations.length >= maxLocations');
} else {
  console.log('❌ Location limit enforcement: NOT FOUND');
  allPassed = false;
}

// Check canAddGuest function
const canAddGuestMatch = content.match(/if \(quota\.remaining <= 0\)/);
if (canAddGuestMatch) {
  console.log('✅ Guest limit enforcement: FOUND');
  console.log('   Logic: Prevents adding guest when quota.remaining <= 0');
} else {
  console.log('❌ Guest limit enforcement: NOT FOUND');
  allPassed = false;
}

// Check error messages
const locationErrorMatch = content.match(/Location limit reached\. Your tier allows \$\{maxLocations\} location/);
const guestErrorMatch = content.match(/Guest limit reached\. Your \$\{tierName\} tier allows \$\{quota\.max\} guest records/);

console.log('\n------------------------------------------');
console.log('Verification of Error Messages:');
console.log('------------------------------------------\n');

if (locationErrorMatch) {
  console.log('✅ Location limit error message: FOUND');
  console.log('   Message: "Location limit reached. Your tier allows ${maxLocations} location(s)."');
} else {
  console.log('❌ Location limit error message: NOT FOUND');
  allPassed = false;
}

if (guestErrorMatch) {
  console.log('✅ Guest limit error message: FOUND');
  console.log('   Message: "Guest limit reached. Your ${tierName} tier allows ${quota.max} guest records."');
} else {
  console.log('❌ Guest limit error message: NOT FOUND');
  allPassed = false;
}

console.log('\n===========================================');
if (allPassed) {
  console.log('✅ ALL CHECKS PASSED');
  console.log('===========================================\n');
  console.log('Feature #27 Verification Summary:');
  console.log('- Professional tier guest limit: 10,000 ✅');
  console.log('- Professional tier location limit: 5 ✅');
  console.log('- Location limit enforcement logic: Present ✅');
  console.log('- Guest limit enforcement logic: Present ✅');
  console.log('- Error messages: Correct ✅');
  console.log('\nConclusion: Feature #27 is PASSING');
  process.exit(0);
} else {
  console.log('❌ SOME CHECKS FAILED');
  console.log('===========================================');
  process.exit(1);
}
