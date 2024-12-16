const admin = require('firebase-admin');
require('dotenv').config();
const { client, twilioPhone } = require('./twilioClient');
const { processReceipt } = require('./receiptProcessor');
const { validateReceipt } = require('./guardRail');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

/**
 * Function to handle incoming WhatsApp messages
 * @param {object} req - HTTP request object
 * @param {object} res - HTTP response object
 */
async function receiveWhatsAppMessage(req, res) {
    console.log('Processing WhatsApp message...');
    console.log('Received payload:', JSON.stringify(req.body, null, 2));

    try {
        // Validate request payload
        if (!req.body || typeof req.body !== 'object') {
            console.error('Invalid request payload:', req.body);
            return res.status(400).send('Invalid request payload.');
        }

        const { Body, From, MediaUrl0 } = req.body;

        // Validate sender phone number
        if (!From || !From.startsWith('whatsapp:')) {
            console.error('Invalid sender information:', From);
            return res.status(400).send('Invalid sender information.');
        }

        const phoneNumber = From.replace('whatsapp:', '');
        console.log(`Received message from ${phoneNumber}`);

        // Check if the message contains a body or media URL
        if (!Body && !MediaUrl0) {
            console.error('Both message body and media URL are missing.');
            return res.status(400).send('Please send a text message or attach a media file.');
        }

        // Retrieve or initialize guest data
        const guestRef = admin.database().ref(`guests/${phoneNumber}`);
        const guestSnapshot = await guestRef.once('value');
        let guestData = guestSnapshot.val();

        if (!guestData) {
            guestData = { phoneNumber, createdAt: Date.now() };
            await guestRef.set(guestData);
            console.log(`New guest added: ${phoneNumber}`);
        } else {
            console.log(`Returning guest: ${guestData.name || 'Guest'}`);
        }

        // Handle name replies
        if (!MediaUrl0 && Body && !guestData.name) {
            const trimmedName = Body.trim();
            await guestRef.update({ name: trimmedName });

            await client.messages.create({
                body: `Thank you, ${trimmedName}! Your profile has been updated.`,
                from: `whatsapp:${twilioPhone}`,
                to: `whatsapp:${phoneNumber}`,
            });

            return res.status(200).send('Guest name updated.');
        }

        // Prompt for name if missing
        if (!guestData.name) {
            await client.messages.create({
                body: "Welcome! Please reply with your full name to complete your profile.",
                from: `whatsapp:${twilioPhone}`,
                to: `whatsapp:${phoneNumber}`,
            });
            return res.status(200).send('Prompted guest for name.');
        }

        // Process receipt if an image is attached
        if (MediaUrl0) {
            console.log(`Processing receipt image for ${phoneNumber}`);
                try {
                    const campaignName = "Ocean Basket"; // Replace with the dynamic campaign name from the context
                    const receiptData = await processReceipt(MediaUrl0, phoneNumber);
    
                    // Validate receipt against guardrails
                    const isValid = validateReceipt(receiptData, campaignName);
                    if (!isValid) {
                        console.error('Receipt validation failed.');
                        await client.messages.create({
                            body: `Sorry, ${guestData.name}. Your receipt does not meet the campaign requirements.`,
                            from: `whatsapp:${twilioPhone}`,
                            to: `whatsapp:${phoneNumber}`,
                        });
                        return res.status(400).send('Invalid receipt.');
                    }
    
                    // Respond to valid receipts
                    await client.messages.create({
                        body: `Thank you, ${guestData.name}, for submitting your receipt! We are processing it.`,
                        from: `whatsapp:${twilioPhone}`,
                        to: `whatsapp:${phoneNumber}`,
                    });
                    return res.status(200).send('Receipt received and validated.');
                } catch (error) {
                    console.error('Error processing or validating receipt:', error);
                    await client.messages.create({
                        body: "Sorry, we encountered an issue processing your receipt. Please try again later.",
                        from: `whatsapp:${twilioPhone}`,
                        to: `whatsapp:${phoneNumber}`,
                    });
                    return res.status(500).send('Error processing receipt.');
                }
            } else {
                await client.messages.create({
                    body: "Please attach a picture of your receipt.",
                    from: `whatsapp:${twilioPhone}`,
                    to: `whatsapp:${phoneNumber}`,
                });
                return res.status(400).send('No image attached.');
            }
        }
 catch (error) {
        console.error('Error handling WhatsApp message:', error.message);

        if (error.code && error.moreInfo) {
            console.error(`Twilio error: ${error.code}, Info: ${error.moreInfo}`);
        }

        return res.status(500).send('Internal Server Error');

     }    }
module.exports = { receiveWhatsAppMessage };
