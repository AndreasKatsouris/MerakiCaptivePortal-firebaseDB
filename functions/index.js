/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// Import necessary modules
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto'); // Import crypto library to handle HMAC signature verification

// Initialize Firebase Admin SDK to interact with Firebase services like Realtime Database
admin.initializeApp();

// Create a Cloud Function to handle HTTP requests (e.g., webhook calls from Meraki)
exports.merakiWebhook = functions.https.onRequest((req, res) => {
    console.log('Webhook received'); // Log the receipt of the webhook

    // Define the shared secret used to validate the Meraki webhook requests
    const sharedSecret = 'Giulietta!16';
    
    // Get the signature from the request headers (sent by Meraki)
    const signature = req.headers['x-cisco-meraki-signature'];
    console.log('Signature from headers:', signature); // Log the signature received from Meraki

    // Compute the HMAC-SHA1 hash of the request body using the shared secret
    const hmac = crypto.createHmac('sha1', sharedSecret);
    hmac.update(JSON.stringify(req.body));
    const computedSignature = hmac.digest('hex');
    console.log('Computed signature:', computedSignature); // Log the computed signature

    // Compare the computed signature with the signature from the request headers
    if (signature !== computedSignature) {
        // If the signatures don't match, log an error and return a 403 Unauthorized response
        console.error('Invalid signature - Unauthorized access attempt'); // Log the error
        return res.status(403).send('Unauthorized'); // Respond with 403 Unauthorized
    }

    console.log('Signature verification passed'); // Log successful signature verification

    // If the signatures match, proceed to process the data
    const data = req.body; // Capture the JSON payload sent by Meraki
    console.log('Data received:', JSON.stringify(data, null, 2)); // Log the received data for detailed inspection

    // Store the received data in Firebase Realtime Database under 'scanningData' node
    const ref = admin.database().ref('scanningData').push(); // Create a new database entry
    ref.set(data)
        .then(() => {
            console.log('Data successfully stored in Firebase'); // Log successful data storage
            res.status(200).send('Data received and stored'); // Respond with success
        })
        .catch(error => {
            console.error('Error storing data:', error); // Log any errors during data storage
            res.status(500).send('Error storing data'); // Respond with 500 Internal Server Error
        });
});

