const admin = require('firebase-admin');
const twilio = require('twilio');

// Initialize Twilio client
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const client = twilio(accountSid, authToken);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

// Function to handle incoming WhatsApp messages
const receiveWhatsAppMessage = async (req, res) => {
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
                timestamp: Date.now(),
            });

            // Respond to user
            await client.messages.create({
                body: "Thank you for submitting your receipt! We are processing it.",
                from: `whatsapp:${process.env.TWILIO_PHONE}`,
                to: `whatsapp:${phoneNumber}`,
            });

            return res.status(200).send('Receipt received and stored.');
        } else {
            // If no image is attached, prompt the user
            await client.messages.create({
                body: "Please attach a picture of your receipt.",
                from: `whatsapp:${process.env.TWILIO_PHONE}`,
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
