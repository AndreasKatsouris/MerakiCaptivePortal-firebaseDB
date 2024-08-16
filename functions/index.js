// Import necessary modules
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const getRawBody = require('raw-body');

// Initialize Firebase Admin SDK
admin.initializeApp();

// Create a Cloud Function to handle HTTP requests (e.g., webhook calls from Meraki)
exports.merakiWebhook = functions.https.onRequest(async (req, res) => {
    console.log('Webhook received'); // Log the receipt of the webhook

    try {
        // Parse the raw body
        const rawBody = await getRawBody(req, {
            length: req.headers['content-length'], // ensure correct length
            limit: '1mb', // adjust limit if necessary
            encoding: req.charset || 'utf-8'
        });
        
        // Define the shared secret used to validate the Meraki webhook requests
        const sharedSecret = 'Giulietta!16';

        // Get the signature from the request headers (sent by Meraki)
        const signature = req.headers['x-cisco-meraki-signature'];
        console.log('Signature from headers:', signature); // Log the signature received from Meraki

        // Compute the HMAC-SHA1 hash of the raw request body using the shared secret
        const hmac = crypto.createHmac('sha1', sharedSecret);
        hmac.update(rawBody);
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
        const data = JSON.parse(rawBody); // Capture the JSON payload sent by Meraki
        console.log('Data received:', JSON.stringify(data, null, 2)); // Log the received data for detailed inspection

        // Store the received data in Firebase Realtime Database under 'scanningData' node
        const ref = admin.database().ref('scanningData').push(); // Create a new database entry
        await ref.set(data);
        console.log('Data successfully stored in Firebase'); // Log successful data storage
        res.status(200).send('Data received and stored'); // Respond with success
    } catch (error) {
        console.error('Error processing webhook:', error); // Log any errors during processing
        res.status(500).send('Internal Server Error'); // Respond with 500 Internal Server Error
    }
});
