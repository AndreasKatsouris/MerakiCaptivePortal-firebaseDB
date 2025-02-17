const { onRequest } = require('firebase-functions/v2/https');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { receiveWhatsAppMessage } = require('./receiveWhatsappMessage');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}
exports.receiveWhatsAppMessage = onRequest(receiveWhatsAppMessage);

/**
 * Cloud Function to handle Meraki Webhook
 */
exports.merakiWebhook = onRequest((req, res) => {
    if (req.method === 'GET') {
        const validator = "371de0de57b8741627daa5e30f25beb917614141"; // Replace with your validator string
        console.log("Meraki validator string requested.");
        return res.status(200).send(validator);
    }

    console.log('Received POST request from Meraki Scanning API.');

    const sharedSecret = 'Giulietta!16'; // Replace with your shared secret

    if (req.body.secret !== sharedSecret) {
        console.error('Invalid secret received. Unauthorized access attempt.');
        return res.status(403).send('Unauthorized');
    }

    const data = req.body;
    console.log('Verified secret. Data received:', JSON.stringify(data, null, 2));

    const ref = admin.database().ref('scanningData').push();
    ref.set(data)
        .then(() => {
            console.log('Data successfully stored in Firebase.');
            return res.status(200).send('Data received and stored.');
        })
        .catch((error) => {
            console.error('Error storing data:', error);
            return res.status(500).send('Error storing data.');
        });
});

exports.getGoogleConfig = onRequest(async (req, res) => {
    res.json({
        apiKey: functions.config.google.places_api_key,
        placeId: functions.config.google.place_id
    });
});

/**
 * Cloud Function to set admin claims for a user
 * Requires the caller to be an admin themselves
 */
exports.setAdminClaim = onRequest(async (req, res) => {
    // Verify the request method
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verify that the request has a valid Firebase ID token
        const idToken = req.headers.authorization?.split('Bearer ')[1];
        if (!idToken) {
            return res.status(401).json({ error: 'Unauthorized - No token provided' });
        }

        // Verify the token and get the caller's claims
        const callerToken = await admin.auth().verifyIdToken(idToken);
        
        // Check if the caller is an admin
        if (!callerToken.admin === true) {
            return res.status(403).json({ error: 'Forbidden - Caller is not an admin' });
        }

        const { uid, isAdmin } = req.body;
        if (!uid) {
            return res.status(400).json({ error: 'Bad Request - No uid provided' });
        }

        // Set the admin claim
        await admin.auth().setCustomUserClaims(uid, { admin: !!isAdmin });
        
        // Update the admin-claims node in the Realtime Database
        if (isAdmin) {
            await admin.database().ref(`admin-claims/${uid}`).set(true);
        } else {
            await admin.database().ref(`admin-claims/${uid}`).remove();
        }

        return res.status(200).json({ message: `Successfully ${isAdmin ? 'added' : 'removed'} admin claim for user ${uid}` });
    } catch (error) {
        console.error('Error setting admin claim:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Cloud Function to verify admin status of a user
 * Returns isAdmin: true/false based on the user's custom claims
 */
exports.verifyAdminStatus = onRequest(async (req, res) => {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get the ID token from the Authorization header
        const idToken = req.headers.authorization?.split('Bearer ')[1];
        if (!idToken) {
            return res.status(401).json({ error: 'No token provided', isAdmin: false });
        }

        // Verify the token and get the user's claims
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        // Check admin claim and admin-claims database entry
        const isAdminInDb = await admin.database()
            .ref(`admin-claims/${decodedToken.uid}`)
            .once('value')
            .then(snapshot => snapshot.val() === true);

        // User is admin if both custom claim and database entry exist
        const isAdmin = decodedToken.admin === true && isAdminInDb;

        return res.status(200).json({ isAdmin });
    } catch (error) {
        console.error('Error verifying admin status:', error);
        return res.status(401).json({ error: error.message, isAdmin: false });
    }
});
