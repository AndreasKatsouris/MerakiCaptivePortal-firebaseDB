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
require('dotenv').config();
const { client, twilioPhone } = require('./twilioClient');


if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

// Function to handle incoming WhatsApp messages
async function receiveWhatsAppMessage(req, res){
    console.log('Processing WhatsApp message...');
    console.log('Received payload:', req.body);

    try {
        console.log('Incoming webhook payload:', JSON.stringify(req.body, null, 2));
        console.log('Processing WhatsApp message...');
        console.log('Received payload:', req.body);
        // Validate request payload
        if (!req.body || typeof req.body !== 'object') {
            console.error('Invalid request payload:', req.body);
            return res.status(400).send('Invalid request payload.');
        }
        const { Body, From, MediaUrl0 } = req.body;
                // Validate the presence of the "From" field
                if (!From) {
                    console.error('Missing "From" field in the request');
                    return res.status(400).send('Invalid request: Missing sender information');
                }
        // Validate essential fields
        if (!From || !From.startsWith('whatsapp:')) {
            console.error('Missing or invalid "From" field:', From);
            return res.status(400).send('Invalid sender information.');
        }
        // extract phone number from sender ID
            const phoneNumber = From.replace('whatsapp:', '');
            console.log(`Received message from ${phoneNumber}`);
        // Check if message contains a body or media URL
        if (!Body && !MediaUrl0) {
                console.error('Both message body and media URL are missing.');
                return res.status(400).send('Please send a text message or attach a media file.');
            }
        // Check if message contains an image
        if (MediaUrl0) {
            console.log(`Image URL: ${MediaUrl0}`);
            console.log(`Media received from ${phoneNumber}: ${MediaUrl0}`);
            // Simulate saving the receipt data
            console.log('Simulating saving receipt data...');

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
        // Log and return detailed error information
        console.error('Error handling WhatsApp message:', error);

        if (error.code && error.moreInfo) {
            console.error(`Twilio error: ${error.code}, Info: ${error.moreInfo}`);
        }

        return res.status(500).send('Internal Server Error');
    }
};

module.exports = { receiveWhatsAppMessage };
