const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase Admin
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
});

const db = admin.database();

// Read subscription tiers data
const subscriptionTiers = JSON.parse(fs.readFileSync('./subscription-tiers-import.json', 'utf8'));

// Write to database
db.ref('subscriptionTiers').set(subscriptionTiers)
  .then(() => {
    console.log('✅ Subscription tiers seeded successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error seeding subscription tiers:', error);
    process.exit(1);
  });
