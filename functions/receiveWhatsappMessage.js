//const admin = require('firebase-admin');
//const twilio = require('twilio');

// Initialize Twilio client
//const accountSid = process.env.TWILIO_SID;
//const authToken = process.env.TWILIO_TOKEN;
// Retrieve Twilio credentials from environment variables
//const accountSid = "ACe16ed0568c81a9febd64f304b0aedbaf"; //process.env.TWILIO_SID;
//const authToken = "d9e7d1bc05cf8e0070e40662e8ce8768"; //process.env.TWILIO_TOKEN;
//const twilioPhone = "+27600717304";//process.env.TWILIO_PHONE;
//const client = twilio(accountSid, authToken);

const admin = require('firebase-admin');
const { client, twilioPhone } = require('./twilioClient');



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

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

// Function to handle incoming WhatsApp messages
const receiveWhatsAppMessage = async (req, res) => {
    const { Body, From, MediaUrl0 } = req.body;
    const phoneNumber = From.replace('whatsapp:', '');
    console.log(`Received message from ${phoneNumber}`);

    try {
        if (MediaUrl0) {
            console.log(`Image URL: ${MediaUrl0}`);

            // Save receipt data to Firebase Realtime Database
            const receiptRef = admin.database().ref('receipts').push();
            await receiptRef.set({
                phoneNumber,
                imageUrl: MediaUrl0,
                message: Body || 'No message',
                timestamp: Date.now(),
            });

            // Respond to user
            await client.messages.create({
                body: "Thank you for submitting your receipt! We are processing it.",
                from: `whatsapp:${twilioPhone}`,
                to: `whatsapp:${phoneNumber}`,
            });

            return res.status(200).send('Receipt received and stored.');
        } else {
            // No image attached
            await client.messages.create({
                body: "Please attach a picture of your receipt.",
                from: `whatsapp:${twilioPhone}`,
                to: `whatsapp:${phoneNumber}`,
            });

            return res.status(400).send('No image attached.');
        }
    } catch (error) {
        console.error('Error handling WhatsApp message:', error);
        return res.status(500).send('Internal Server Error');
    }
};

module.exports = { receiveWhatsAppMessage };
