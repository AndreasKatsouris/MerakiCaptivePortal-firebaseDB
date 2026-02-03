/**
 * Grant Super Admin Access Script
 * Adds a user to the /admins path with superAdmin: true
 *
 * Usage: node scripts/grant-super-admin.js <user-email-or-uid>
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com"
});

const db = admin.database();

async function grantSuperAdmin(emailOrUid) {
    try {
        let userRecord;

        // Check if input is email or UID
        if (emailOrUid.includes('@')) {
            console.log(`🔍 Looking up user by email: ${emailOrUid}`);
            userRecord = await admin.auth().getUserByEmail(emailOrUid);
        } else {
            console.log(`🔍 Looking up user by UID: ${emailOrUid}`);
            userRecord = await admin.auth().getUser(emailOrUid);
        }

        console.log(`✅ Found user: ${userRecord.email} (${userRecord.uid})`);

        // Check if already a super admin
        const adminRef = db.ref(`admins/${userRecord.uid}`);
        const snapshot = await adminRef.once('value');

        if (snapshot.exists() && snapshot.val().superAdmin) {
            console.log(`⚠️  User is already a Super Admin`);
            process.exit(0);
        }

        // Grant super admin access
        const adminData = {
            superAdmin: true,
            email: userRecord.email,
            displayName: userRecord.displayName || 'Super Admin',
            phoneNumber: userRecord.phoneNumber || null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await adminRef.set(adminData);
        console.log(`🎉 Successfully granted Super Admin access to ${userRecord.email}`);
        console.log(`📝 Data written to: /admins/${userRecord.uid}`);
        console.log(`\n✅ User can now access Project Management features`);

        process.exit(0);
    } catch (error) {
        console.error(`❌ Error:`, error.message);
        process.exit(1);
    }
}

// Get email or UID from command line
const emailOrUid = process.argv[2];

if (!emailOrUid) {
    console.error(`❌ Usage: node scripts/grant-super-admin.js <user-email-or-uid>`);
    console.error(`   Example: node scripts/grant-super-admin.js user@example.com`);
    console.error(`   Example: node scripts/grant-super-admin.js OTnjPiIxRNejaJuaxoPrbFBw3L42`);
    process.exit(1);
}

console.log(`🚀 Granting Super Admin access...\n`);
grantSuperAdmin(emailOrUid);
