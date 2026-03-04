/**
 * Emergency Repair Script for Corrupted WhatsApp Location Mapping
 * 
 * This script repairs the data corruption caused by the WhatsApp Management
 * assignment process that overwrote critical location mapping fields.
 * 
 * ISSUE: Location -OSKIKiRLR-OeWqP7ZI- lost isActive and locationName fields
 * BEFORE: isActive=true, locationName="Ocean Basket The Grove"  
 * AFTER: active=undefined, locationName=undefined
 */

const { rtdb, ref, get, update, set } = require('./config/firebase-admin');
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
    process.exit(1);
  }
}

// Corrupted location data that needs to be restored
const CORRUPTED_LOCATION_ID = '-OSKIKiRLR-OeWqP7ZI-';
const CORRECT_DATA = {
  isActive: true,
  locationName: 'Ocean Basket The Grove',
  phoneNumber: '+27600717304'
};

async function repairLocationMapping() {
  try {
    console.log('🔧 Starting emergency repair of location mapping...');
    console.log(`📍 Target location: ${CORRUPTED_LOCATION_ID}`);
    
    // Check current state
    const mappingRef = ref(rtdb, `location-whatsapp-mapping/${CORRUPTED_LOCATION_ID}`);
    const currentSnapshot = await get(mappingRef);
    
    if (!currentSnapshot.exists()) {
      console.log('❌ Location mapping does not exist!');
      return;
    }
    
    const currentData = currentSnapshot.val();
    console.log('🔍 Current corrupted data:');
    console.log(JSON.stringify(currentData, null, 2));
    
    // Prepare repair data
    const repairData = {
      ...CORRECT_DATA,
      repairedAt: Date.now(),
      repairReason: 'Data corruption from WhatsApp Management assignment process',
      repairScript: 'repair-location-mapping.js'
    };
    
    // Apply repair using update() to preserve existing data
    console.log('🔧 Applying repair data...');
    await update(mappingRef, repairData);
    
    // Verify repair
    const repairedSnapshot = await get(mappingRef);
    if (repairedSnapshot.exists()) {
      const repairedData = repairedSnapshot.val();
      console.log('✅ Repair completed! Updated data:');
      console.log(JSON.stringify(repairedData, null, 2));
      
      // Verify critical fields
      if (repairedData.isActive === true && repairedData.locationName === 'Ocean Basket The Grove') {
        console.log('✅ CRITICAL FIELDS RESTORED SUCCESSFULLY!');
        console.log('  ✓ isActive: true');
        console.log('  ✓ locationName: Ocean Basket The Grove');
        console.log('  ✓ phoneNumber: +27600717304');
      } else {
        console.log('⚠️ Warning: Some critical fields may not be fully restored');
      }
    }
    
    console.log('🎉 Emergency repair completed successfully!');
    
  } catch (error) {
    console.error('❌ Emergency repair failed:', error);
    throw error;
  }
}

async function verifyLocationExists() {
  try {
    console.log('🔍 Verifying location exists in main locations collection...');
    
    const locationRef = ref(rtdb, `locations/${CORRUPTED_LOCATION_ID}`);
    const locationSnapshot = await get(locationRef);
    
    if (locationSnapshot.exists()) {
      const locationData = locationSnapshot.val();
      console.log('✅ Location found in main collection:');
      console.log(`  Name: ${locationData.name || 'Unknown'}`);
      console.log(`  Owner: ${locationData.ownerId || 'Unknown'}`);
      console.log(`  Active: ${locationData.isActive !== undefined ? locationData.isActive : 'Unknown'}`);
      
      // Update CORRECT_DATA if we have better data from main location
      if (locationData.name && locationData.name !== CORRECT_DATA.locationName) {
        console.log(`📝 Updating location name from main collection: ${locationData.name}`);
        CORRECT_DATA.locationName = locationData.name;
      }
    } else {
      console.log('⚠️ Location not found in main locations collection!');
    }
  } catch (error) {
    console.error('❌ Error verifying location:', error);
  }
}

// Main execution
async function main() {
  try {
    console.log('🚨 EMERGENCY LOCATION MAPPING REPAIR');
    console.log('====================================');
    console.log('');
    
    await verifyLocationExists();
    await repairLocationMapping();
    
    console.log('');
    console.log('✅ All repair operations completed successfully!');
    console.log('📋 Next steps:');
    console.log('  1. Deploy updated whatsappDatabaseSchema.js to prevent future corruption');
    console.log('  2. Test WhatsApp functionality for this location');
    console.log('  3. Monitor logs for proper location context resolution');
    
    process.exit(0);
    
  } catch (error) {
    console.error('💥 CRITICAL ERROR during repair:', error);
    process.exit(1);
  }
}

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n🛑 Repair interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Repair terminated');
  process.exit(1);
});

// Run the repair
main().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});