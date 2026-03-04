/**
 * Set User Role in Firebase RTDB
 * Usage: node set-user-role.cjs <email> <role>
 */

const admin = require('firebase-admin');
const https = require('https');
require('dotenv').config();

// Initialize Firebase Admin without service account (using default credentials)
admin.initializeApp({
  projectId: 'merakicaptiveportal-firebasedb',
  databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com'
});

const auth = admin.auth();
const db = admin.database();

async function setUserRole(email, role) {
  try {
    console.log(`\nSetting role for user: ${email}`);
    console.log(`Target role: ${role}`);

    // Get user by email
    const userRecord = await auth.getUserByEmail(email);
    console.log(`Found user with UID: ${userRecord.uid}`);

    // Update role in database
    await db.ref(`users/${userRecord.uid}`).update({
      role: role,
      roleUpdatedAt: Date.now()
    });

    console.log(`✓ Successfully set role to: ${role}`);
    console.log(`User: ${email} (${userRecord.uid})`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Get command line arguments
const email = process.argv[2];
const role = process.argv[3];

if (!email || !role) {
  console.log('Usage: node set-user-role.cjs <email> <role>');
  console.log('');
  console.log('Available roles:');
  console.log('  - restaurant_owner');
  console.log('  - general_manager');
  console.log('  - kitchen_manager');
  console.log('  - floor_manager');
  console.log('  - platform_admin');
  process.exit(1);
}

setUserRole(email, role);
