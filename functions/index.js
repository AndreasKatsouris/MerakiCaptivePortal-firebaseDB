const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const twilio = require('twilio');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

// Twilio credentials (use environment variables)
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE;

if (!accountSid || !authToken || !twilioPhone) {
    console.error('Twilio credentials are not configured. Check environment variables.');
    throw new Error('Missing Twilio credentials.');
}

const twilioClient = twilio(accountSid, authToken);

/**
 * Cloud Function to handle incoming WhatsApp messages via Twilio
 */
exports.receiveWhatsAppMessage = onRequest(async (req, res) => {
    const { Body, From, MediaUrl0 } = req.body; // Extract data from Twilio webhook
    const phoneNumber = From.replace('whatsapp:', ''); // Extract sender’s number
    console.log(`Received WhatsApp message from ${phoneNumber}`);

    try {
        if (MediaUrl0) {
            console.log(`Receipt image URL: ${MediaUrl0}`);

            // Save receipt data to Firebase Realtime Database
            const receiptRef = admin.database().ref('receipts').push();
            await receiptRef.set({
                phoneNumber,
                imageUrl: MediaUrl0,
                message: Body || 'No message',
                timestamp: Date.now(),
            });

            // Respond to the sender
            await twilioClient.messages.create({
                body: "Thank you for submitting your receipt! We are processing it.",
                from: `whatsapp:${twilioPhone}`,
                to: `whatsapp:${phoneNumber}`,
            });

            console.log('Receipt data stored successfully and acknowledgment sent.');
            return res.status(200).send('Receipt received and stored.');
        } else {
            // Prompt user to attach a receipt image if missing
            await twilioClient.messages.create({
                body: "Please attach a picture of your receipt.",
                from: `whatsapp:${twilioPhone}`,
                to: `whatsapp:${phoneNumber}`,
            });

            console.log('Prompted user to attach a receipt image.');
            return res.status(400).send('No image attached.');
        }
    } catch (error) {
        console.error('Error processing WhatsApp message:', error);
        return res.status(500).send('Internal Server Error');
    }
});

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
