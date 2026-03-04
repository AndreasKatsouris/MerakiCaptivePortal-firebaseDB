/**
 * Fix Guest Names Script
 * 
 * This script fixes guests that have "N/A" names by setting their name to null
 * so they will go through the proper name collection flow when they next interact
 */

const { rtdb, ref, get, update } = require('./config/firebase-admin');
const { initializeApp, getApps } = require('firebase-admin/app');
const { credential } = require('firebase-admin');

// Initialize Firebase Admin if not already done
if (!getApps().length) {
  try {
    initializeApp({
      credential: credential.applicationDefault(),
      databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
    });
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    console.log('💡 This script needs to run in an environment with Firebase credentials');
    console.log('💡 Alternative: Manually fix in Firebase Console');
    showManualInstructions();
    process.exit(1);
  }
}

function showManualInstructions() {
  console.log('');
  console.log('🔧 Manual Fix Instructions:');
  console.log('==========================');
  console.log('1. Go to Firebase Console: https://console.firebase.google.com');
  console.log('2. Select project: merakicaptiveportal-firebasedb');
  console.log('3. Navigate to Realtime Database');
  console.log('4. Go to: guests/');
  console.log('5. For each guest with name: "N/A":');
  console.log('   - Click on the guest entry');
  console.log('   - Find the "name" field');
  console.log('   - Delete the "name" field entirely (or set to null)');
  console.log('');
  console.log('✅ This will force the name collection flow when they next message');
}

async function fixGuestNames() {
  try {
    console.log('🔍 Checking for guests with "N/A" names...');
    
    const guestsSnapshot = await get(ref(rtdb, 'guests'));
    const guestsData = guestsSnapshot.val() || {};
    
    const guestsToFix = [];
    
    Object.entries(guestsData).forEach(([phoneNumber, guestData]) => {
      if (guestData.name === 'N/A') {
        guestsToFix.push({
          phoneNumber,
          currentName: guestData.name,
          createdAt: guestData.createdAt
        });
      }
    });
    
    if (guestsToFix.length === 0) {
      console.log('✅ No guests with "N/A" names found!');
      return;
    }
    
    console.log(`📋 Found ${guestsToFix.length} guests with "N/A" names:`);
    guestsToFix.forEach((guest, index) => {
      const createdDate = new Date(guest.createdAt).toLocaleString();
      console.log(`   ${index + 1}. ${guest.phoneNumber} (created: ${createdDate})`);
    });
    
    console.log('');
    console.log('🔧 Fixing guest names...');
    
    const updates = {};
    guestsToFix.forEach(guest => {
      updates[`guests/${guest.phoneNumber}/name`] = null;
      updates[`guests/${guest.phoneNumber}/nameFixed`] = true;
      updates[`guests/${guest.phoneNumber}/nameFixedAt`] = Date.now();
    });
    
    await update(ref(rtdb), updates);
    
    console.log('✅ Successfully fixed guest names!');
    console.log(`📊 Updated ${guestsToFix.length} guest records`);
    console.log('');
    console.log('🎯 What happens next:');
    console.log('- Fixed guests will go through name collection when they next message');
    console.log('- Admin interface will show "(Name Pending)" instead of "N/A"');
    console.log('- Name collection flow will be triggered automatically');
    
  } catch (error) {
    console.error('❌ Error fixing guest names:', error);
    console.log('');
    showManualInstructions();
  }
}

// Main execution
async function main() {
  console.log('🚨 GUEST NAMES REPAIR SCRIPT');
  console.log('============================');
  console.log('');
  
  await fixGuestNames();
  
  console.log('');
  console.log('✅ Guest names repair completed!');
  process.exit(0);
}

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n🛑 Script interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Script terminated');
  process.exit(1);
});

// Run the repair
main().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});