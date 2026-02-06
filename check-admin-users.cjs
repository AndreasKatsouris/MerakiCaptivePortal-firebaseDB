/**
 * Check for existing admin users in Firebase
 */

const admin = require('firebase-admin');

// Set project ID environment variable
process.env.GOOGLE_CLOUD_PROJECT = 'merakicaptiveportal-firebasedb';

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    projectId: "merakicaptiveportal-firebasedb"
});

const db = admin.database();

async function checkAdminUsers() {
    console.log('\n==========================================');
    console.log('Checking for Admin Users');
    console.log('==========================================\n');

    try {
        // Check admin-claims node
        const adminClaimsRef = db.ref('admin-claims');
        const snapshot = await adminClaimsRef.once('value');

        if (snapshot.exists()) {
            const adminClaims = snapshot.val();
            const adminUids = Object.keys(adminClaims);

            console.log(`Found ${adminUids.length} admin users in database:`);

            for (const uid of adminUids) {
                try {
                    const userRecord = await admin.auth().getUser(uid);
                    const customClaims = userRecord.customClaims || {};

                    console.log(`\n  UID: ${uid}`);
                    console.log(`  Email: ${userRecord.email}`);
                    console.log(`  Firebase Custom Claims (admin): ${customClaims.admin === true ? 'YES' : 'NO'}`);
                    console.log(`  RTDB admin-claims: ${adminClaims[uid] === true ? 'YES' : 'NO'}`);
                    console.log(`  Dual-level verification: ${customClaims.admin === true && adminClaims[uid] === true ? 'PASS' : 'FAIL'}`);
                } catch (error) {
                    console.log(`\n  UID: ${uid}`);
                    console.log(`  Error fetching user: ${error.message}`);
                }
            }
        } else {
            console.log('No admin users found in admin-claims node');
        }

        // Also check users node for any with adminClaim
        console.log('\n==========================================');
        console.log('Checking users node for admin flags');
        console.log('==========================================\n');

        const usersRef = db.ref('users');
        const usersSnapshot = await usersRef.once('value');

        if (usersSnapshot.exists()) {
            const users = usersSnapshot.val();
            const adminUsers = Object.entries(users).filter(([_, user]) => user && user.adminClaim === true);

            if (adminUsers.length > 0) {
                console.log(`Found ${adminUsers.length} users with adminClaim flag:`);
                for (const [uid, user] of adminUsers) {
                    console.log(`  UID: ${uid}, Email: ${user.email || 'N/A'}`);
                }
            } else {
                console.log('No users with adminClaim flag found');
            }
        } else {
            console.log('Users node is empty');
        }

    } catch (error) {
        console.error('Error checking admin users:', error);
    }

    process.exit(0);
}

checkAdminUsers();
