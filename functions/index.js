const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const twilio = require('twilio');
const functions = require('firebase-functions');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

// Twilio credentials (retrieved from Firebase Config)
const accountSid = process.env.TWILIO_SID || functions.config().twilio.sid;
const authToken = process.env.TWILIO_TOKEN || functions.config().twilio.token;
const twilioClient = twilio(accountSid, authToken);

//const twilioSid = functions.config().twilio.sid;
//const twilioToken = functions.config().twilio.token;
//const client = twilio(twilioSid, twilioToken);

exports.receiveWhatsAppMessage = onRequest(async (req, res) => {
    const { Body, From, MediaUrl0 } = req.body; // Extract data from Twilio webhook
    const phoneNumber = From.replace('whatsapp:', ''); // Extract sender’s number
    console.log(`Received message from ${phoneNumber}`);

    try {
        // Handle receipt image upload
        if (MediaUrl0) {
            console.log(`Image URL: ${MediaUrl0}`);

            // Save receipt data to Firebase Realtime Database
            const receiptRef = admin.database().ref('receipts').push();
            await receiptRef.set({
                phoneNumber,
                imageUrl: MediaUrl0,
                message: Body || 'No message',
                timestamp: Date.now()
            });

            // Respond to user
            await twilioClient.messages.create({
                body: "Thank you for submitting your receipt! We are processing it.",
                from: `whatsapp:${functions.config().twilio.phone}`,
                to: `whatsapp:${phoneNumber}`
            });

            return res.status(200).send('Receipt received and stored.');
        } else {
            // If no image is attached, prompt the user
            await twilioClient.messages.create({
                body: "Please attach a picture of your receipt.",
                from: `whatsapp:${functions.config().twilio.phone}`,
                to: `whatsapp:${phoneNumber}`
            });

            return res.status(400).send('No image attached.');
        }
    } catch (error) {
        console.error('Error handling WhatsApp message:', error);
        return res.status(500).send('Internal Server Error');
    }
});

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
