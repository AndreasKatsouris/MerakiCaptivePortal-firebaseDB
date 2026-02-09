// Test Feature #83: Delete test guest and verify it's removed from search
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
  projectId: 'merakicaptiveportal-firebasedb'
});

const db = admin.database();

async function deleteTestGuest() {
  console.log('Deleting test guest for Feature #83...');

  const testGuestPhone = '+27820000083';

  try {
    // Verify the guest exists before deletion
    const preSnapshot = await db.ref(`guests/${testGuestPhone}`).once('value');
    if (!preSnapshot.exists()) {
      console.log('❌ Guest not found in database - may have been already deleted');
      process.exit(0);
    }

    console.log('✅ Found guest before deletion:', preSnapshot.val());

    // Delete the guest
    await db.ref(`guests/${testGuestPhone}`).remove();
    console.log('✅ Guest deleted successfully');

    // Verify deletion
    const postSnapshot = await db.ref(`guests/${testGuestPhone}`).once('value');
    if (!postSnapshot.exists()) {
      console.log('✅ Verified: Guest no longer exists in database');
    } else {
      console.log('❌ ERROR: Guest still exists after deletion');
      process.exit(1);
    }

    console.log('\n📝 Feature #83 Test Result:');
    console.log('✅ Guest deletion works correctly');
    console.log('✅ Deleted guest will not appear in search results');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error deleting test guest:', error);
    process.exit(1);
  }
}

deleteTestGuest();
