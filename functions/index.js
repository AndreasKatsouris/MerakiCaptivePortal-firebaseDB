const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

// Initialize Firebase Admin SDK
admin.initializeApp();

// Create a Cloud Function to handle HTTP requests
exports.merakiWebhook = onRequest((req, res) => {
    // Check if it's a GET request for validation
    if (req.method === 'GET') {
        const validator = "371de0de57b8741627daa5e30f25beb917614141"; // Replace with your validator string
        console.log("Validator string requested");
        res.status(200).send(validator);
        return;
    }

    // Handle POST request from Meraki Scanning API
    console.log('Webhook received');

    const sharedSecret = 'Giulietta!16';

    console.log('Received headers:', req.headers); // Log all headers

    //const signature = req.headers['x-cisco-meraki-signature'];
    const signature = req.headers['x-cisco-meraki-signature'] || req.headers['X-Cisco-Meraki-Signature'] || req.headers['x-cisco-Meraki-Signature'];

    console.log('Received headers:', req.headers); // Log all headers
      
    console.log('Signature from headers:', signature);

    const hmac = crypto.createHmac('sha1', sharedSecret);
    hmac.update(JSON.stringify(req.body));
    const computedSignature = hmac.digest('hex');
    console.log('Computed signature:', computedSignature);

    if (signature !== computedSignature) {
        console.error('Invalid signature - Unauthorized access attempt');
        return res.status(403).send('Unauthorized');
    }

    console.log('Signature verification passed');

    const data = req.body;
    console.log('Data received:', JSON.stringify(data, null, 2));

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
