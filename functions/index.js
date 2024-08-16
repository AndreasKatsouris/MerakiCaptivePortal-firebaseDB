const {onRequest} = require("firebase-functions/v2/https");
const crypto = require('crypto');
const getRawBody = require('raw-body'); // For capturing raw body

// Initialize Firebase Admin SDK
const admin = require('firebase-admin');
admin.initializeApp();

exports.merakiWebhook = onRequest(async (req, res) => {
    console.log('Webhook received');

    // Capture the raw body
    const rawBody = await getRawBody(req);

    const sharedSecret = 'Giulietta!16';
    const signature = req.headers['x-cisco-meraki-signature'];
    console.log('Signature from headers:', signature);

    // Compute the HMAC-SHA1 hash of the raw body using the shared secret
    const hmac = crypto.createHmac('sha1', sharedSecret);
    hmac.update(rawBody);
    const computedSignature = hmac.digest('hex');
    console.log('Computed signature:', computedSignature);

    // Compare the computed signature with the signature from the request headers
    if (signature !== computedSignature) {
        console.error('Invalid signature - Unauthorized access attempt');
        return res.status(403).send('Unauthorized');
    }

    console.log('Signature verification passed');

    // If the signatures match, proceed to process the data
    const data = JSON.parse(rawBody); // Parse the JSON payload from raw body
    console.log('Data received:', JSON.stringify(data, null, 2));

    // Store the received data in Firebase Realtime Database under 'scanningData' node
    const ref = admin.database().ref('scanningData').push();
    ref.set(data)
        .then(() => {
            console.log('Data successfully stored in Firebase');
            res.status(200).send('Data received and stored');
        })
        .catch(error => {
            console.error('Error storing data:', error);
            res.status(500).send('Error storing data');
        });
});
