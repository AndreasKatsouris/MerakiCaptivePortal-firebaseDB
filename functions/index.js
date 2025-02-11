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

// This function sets admin claim for specified email addresses
exports.setAdminClaim = functions.https.onCall(async (data, context) => {
    const email = data.email;
    const adminEmails = [
        'andreas@askgroupholdings.com',  // Replace this with your actual admin email
        // Add more admin emails here if needed
    ];
    try {
        // Get user by email
        const user = await admin.auth().getUserByEmail(email);
        
        // Add debug logging
        console.log('Setting admin claim for:', {
            userEmail: user.email,
            adminEmails: adminEmails,
            isInList: adminEmails.includes(user.email)
        });
        
        // Check if user's email is in admin list (case-insensitive)
        const isAdmin = adminEmails.some(e =>
            e.toLowerCase() === user.email.toLowerCase()
        );
        
        // Set admin claim
        await admin.auth().setCustomUserClaims(user.uid, { admin: isAdmin });
        
        // Add verification logging
        const updatedUser = await admin.auth().getUser(user.uid);
        console.log('Updated user claims:', {
            email: user.email,
            claims: updatedUser.customClaims
        });
        
        return {
            result: `Admin claim ${isAdmin ? 'set' : 'removed'} for ${user.email}`,
            isAdmin: isAdmin
        };
    } catch (error) {
        console.error('Error setting admin claim:', error);
        throw new functions.https.HttpsError('internal', 'Error setting admin claim');
    }
});
