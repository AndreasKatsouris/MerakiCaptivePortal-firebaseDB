// Test Feature #83: Create test guest for search and delete testing
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
  projectId: 'merakicaptiveportal-firebasedb'
});

const db = admin.database();

async function createTestGuest() {
  console.log('Creating test guest for Feature #83...');

  const testGuestPhone = '+27820000083';
  const testGuestData = {
    name: 'Search Test Feature83',
    phoneNumber: testGuestPhone,
    locationId: 'free-tier-location-id', // Use the free tier location
    createdAt: Date.now(),
    lastVisit: Date.now(),
    visitCount: 0,
    totalSpent: 0
  };

  try {
    // Create the guest
    await db.ref(`guests/${testGuestPhone}`).set(testGuestData);
    console.log('✅ Test guest created successfully');
    console.log('Phone:', testGuestPhone);
    console.log('Name:', testGuestData.name);

    // Verify it was created
    const snapshot = await db.ref(`guests/${testGuestPhone}`).once('value');
    if (snapshot.exists()) {
      console.log('✅ Verified: Guest exists in database');
      console.log('Data:', snapshot.val());
    } else {
      console.log('❌ ERROR: Guest not found after creation');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test guest:', error);
    process.exit(1);
  }
}

createTestGuest();
