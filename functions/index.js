const { onRequest } = require('firebase-functions/v2/https');
//const { getSecret } = require('firebase-functions/v2/secrets');
const admin = require('firebase-admin');
const twilio = require('twilio');
const functions = require('firebase-functions'); // Import the functions module
//const twilioSid = functions.config().twilio.sid;
//const twilioToken = functions.config().twilio.token;
// Initialize Firebase Admin SDK
if (!admin.apps.length) {
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
});
}

// Twilio credentials - Replace with your own SID and Auth Token
const twilioSid = functions.config().twilio.sid;
const twilioToken = functions.config().twilio.token;
const client = twilio(twilioSid, twilioToken);

// Access Twilio credentials
//const TWILIO_SID = getSecret('TWILIO_SID');
//const TWILIO_AUTH_TOKEN = getSecret('TWILIO_AUTH_TOKEN');

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

    // Directly compare the shared secret in the request body
    if (req.body.secret !== sharedSecret) {
        console.error('Invalid secret - Unauthorized access attempt');
        return res.status(403).send('Unauthorized');
    }
    console.log('Secret verification passed');
    const data = req.body;
    console.log('Data received:', JSON.stringify(data, null, 2));
    console.log('Storing data to Firebase:', JSON.stringify(data, null, 2));
    //const ref = admin.database().ref('scanningData').push();
    const ref = admin.database().ref('scanningData').push();
    //console.log('Database reference path:', ref.path.toString());

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

/**
 * Cloud Function to handle incoming WhatsApp messages from Twilio
 */
exports.receiveWhatsAppMessage = onRequest(async (req, res) => {
    try {
        const { Body, From, MediaUrl0 } = req.body;
        const phoneNumber = From.replace('whatsapp:', '');
        
        if (MediaUrl0) {
            const imageUrl = MediaUrl0;
            const newReceiptRef = admin.database().ref('receipts').push();
            await newReceiptRef.set({
                phoneNumber,
                imageUrl,
                message: Body,
                timestamp: Date.now()
            });

            await client.messages.create({
                body: "Thank you for submitting your receipt! We are processing it.",
                from: 'whatsapp:+14155238886',
                to: `whatsapp:${phoneNumber}`
            });

            return res.status(200).send('Receipt received and stored');
        } else {
            await client.messages.create({
                body: "Please attach a picture of your receipt.",
                from: 'whatsapp:+14155238886',
                to: `whatsapp:${phoneNumber}`
            });

            return res.status(400).send('No image attached');
        }
    } catch (error) {
        console.error('Error processing WhatsApp message:', error);
        return res.status(500).send('Error processing the message');
    }
});
