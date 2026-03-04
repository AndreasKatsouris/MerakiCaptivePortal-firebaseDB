const admin = require('firebase-admin');
const serviceAccount = require('./merakicaptiveportal-firebasedb-default-rtdb.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function checkTestUsers() {
  const testEmails = [
    'testuser.free@sparks.test',
    'testuser.starter@sparks.test'
  ];

  console.log('Checking test users...\n');

  for (const email of testEmails) {
    try {
      const user = await admin.auth().getUserByEmail(email);
      console.log('✓ User:', email);
      console.log('  UID:', user.uid);

      // Check subscription
      const subSnapshot = await db.ref('subscriptions/' + user.uid).once('value');
      const subscription = subSnapshot.val();

      if (subscription) {
        console.log('  Tier:', subscription.tierId);
        console.log('  Guest Limit:', subscription.limits?.guestRecords);
        console.log('  Location Limit:', subscription.limits?.locations);
      } else {
        console.log('  ⚠ No subscription found');
      }
      console.log('');
    } catch (error) {
      console.log('✗ User not found:', email, '\n');
    }
  }

  await admin.app().delete();
}

checkTestUsers();
