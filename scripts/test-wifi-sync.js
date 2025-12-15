const admin = require('firebase-admin');
const serviceAccount = require('../merakicaptiveportal-firebasedb-default-rtdb.json');

// Initialize Firebase Admin
// Note: This requires the service account key file to be present in the root or referenced correctly.
// If running locally with 'firebase functions:shell' or similar, it might pick up default credentials.
// For a standalone script, explicit initialization is often safest if the environment isn't fully set up.

if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com"
        });
    } catch (e) {
        console.error("Failed to initialize with service account. Trying default credentials...");
        admin.initializeApp({
            databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com"
        });
    }
}

async function simulateWifiLogin() {
    const sessionID = `test-session-${Date.now()}`;
    const testData = {
        phoneNumber: "+27123456789",
        name: "Test Guest Script",
        email: `test-script-${Date.now()}@example.com`,
        timestamp: new Date().toISOString(),
        node_mac: "test-node-mac-script",
        client_mac: "test-client-mac-script"
    };

    console.log(`Simulating WiFi login for session: ${sessionID}`);
    console.log('Data:', testData);

    try {
        await admin.database().ref(`wifiLogins/${sessionID}`).set(testData);
        console.log('✅ Successfully wrote test data to wifiLogins.');
        console.log('Check the "guests" node in Firebase Console for the synced record.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error writing test data:', error);
        process.exit(1);
    }
}

simulateWifiLogin();
