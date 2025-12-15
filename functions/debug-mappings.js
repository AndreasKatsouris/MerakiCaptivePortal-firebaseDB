const { rtdb, ref, get } = require('./config/firebase-admin');
const { initializeApp, getApps } = require('firebase-admin/app');
const { credential } = require('firebase-admin');

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp({
    credential: credential.applicationDefault(),
    databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
  });
}

async function checkMappings() {
  try {
    console.log('🔍 Checking current database mappings...');
    
    // Check location-whatsapp-mapping
    const mappingRef = ref(rtdb, 'location-whatsapp-mapping');
    const mappingSnapshot = await get(mappingRef);
    
    if (mappingSnapshot.exists()) {
      const mappings = mappingSnapshot.val();
      console.log('📋 Found location-whatsapp-mapping:');
      console.log(JSON.stringify(mappings, null, 2));
    } else {
      console.log('❌ No location-whatsapp-mapping found');
    }
    
    // Check whatsapp-numbers
    const whatsappNumbersRef = ref(rtdb, 'whatsapp-numbers');
    const whatsappNumbersSnapshot = await get(whatsappNumbersRef);
    
    if (whatsappNumbersSnapshot.exists()) {
      const whatsappNumbers = whatsappNumbersSnapshot.val();
      console.log('📋 Found whatsapp-numbers:');
      console.log(JSON.stringify(whatsappNumbers, null, 2));
    } else {
      console.log('❌ No whatsapp-numbers found');
    }
    
    // Check general locations
    const locationsRef = ref(rtdb, 'locations');
    const locationsSnapshot = await get(locationsRef);
    
    if (locationsSnapshot.exists()) {
      const locations = locationsSnapshot.val();
      console.log('📋 Found locations:');
      Object.entries(locations).forEach(([id, location]) => {
        console.log(`  ${id}: ${location.name || 'Unnamed'} (owner: ${location.ownerId || 'Unknown'})`);
      });
    } else {
      console.log('❌ No locations found');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMappings();