const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const twilio = require('twilio');

// Retrieve Twilio credentials from environment variables
const accountSid = "ACe16ed0568c81a9febd64f304b0aedbaf"; //process.env.TWILIO_SID;
const authToken = "d9e7d1bc05cf8e0070e40662e8ce8768"; //process.env.TWILIO_TOKEN;
const twilioPhone = "+27600717304";//process.env.TWILIO_PHONE;

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}
const twilioClient = twilio(accountSid, authToken);



if (!accountSid || !authToken) {
    console.error("Twilio credentials are not set. Acount SID" || accountSid);
    console.error(`Twilio SID defined: ${!!accountSid}`);
    console.error(`Twilio Token defined: ${!!authToken}`);
    console.error(`Twilio Phone defined: ${!!twilioPhone}`);
    console.log(process.env)
    throw new Error("Missing Twilio credentials.");
} else {
    console.log('Twilio credentials loaded successfully.');
}


/**
 * Cloud Function to handle incoming WhatsApp messages via Twilio
 */
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
                from: `${twilioPhone}`,
                to: `${phoneNumber}`
            });

            return res.status(200).send('Receipt received and stored.');
        } else {
            // If no image is attached, prompt the user
            await twilioClient.messages.create({
                body: "Please attach a picture of your receipt.",
                from: `whatsapp:${twilioPhone}`,
                to: `whatsapp:${phoneNumber}`
            });

            return res.status(400).send('No image attached.');
        }
    } catch (error) {
        console.error('Error handling WhatsApp message:', error);
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
