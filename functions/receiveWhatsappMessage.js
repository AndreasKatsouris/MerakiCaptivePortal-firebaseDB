const admin = require('firebase-admin');
require('dotenv').config();
const { client, twilioPhone } = require('./twilioClient');
const { processReceipt } = require('./receiptProcessor');
const { validateReceipt } = require('./guardRail');
const { fetchCampaigns } = require('./campaigns');
const { processReward } = require('./rewardsProcessor');
const { processMessage } = require('./menuLogic');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

/**
 * Handle incoming WhatsApp messages
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

        // Handle name collection for new guests
        if (!guestData.name && Body && !MediaUrl0) {
            const trimmedName = Body.trim();
            await guestRef.update({ name: trimmedName });

            await client.messages.create({
                body: `Thank you, ${trimmedName}! Your profile has been updated. Here's what you can do:\n\n${getHelpMessage()}`,
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

        // If image is attached, process receipt
        if (MediaUrl0) {
            console.log(`Processing receipt image for ${phoneNumber}`);
            try {
                // Process the receipt
                const receiptData = await processReceipt(MediaUrl0, phoneNumber);
                
                // Fetch all active campaigns
                const campaigns = await fetchCampaigns();
                const activeCampaigns = campaigns.filter(campaign => 
                    campaign.status === 'active' && 
                    new Date(campaign.startDate) <= new Date() && 
                    new Date(campaign.endDate) >= new Date()
                );

                if (activeCampaigns.length === 0) {
                    await client.messages.create({
                        body: `Sorry ${guestData.name}, there are no active campaigns at the moment.`,
                        from: `whatsapp:${twilioPhone}`,
                        to: `whatsapp:${phoneNumber}`,
                    });
                    return res.status(400).send('No active campaigns.');
                }

                // Try to match receipt with any active campaign
                let validResult = null;
                for (const campaign of activeCampaigns) {
                    const result = await validateReceipt(receiptData, campaign.brandName);
                    console.log('Validation result:', result);
                    if (result.isValid) {
                        validResult = result;
                        break;
                    }
                }

                if (validResult) {
                    try {
                        console.log('Processing reward with:', {
                            guestData,
                            campaign: validResult.campaign,
                            receiptData
                        });

                        // Process the reward
                        await processReward(guestData, validResult.campaign, receiptData);

                        await client.messages.create({
                            body: `Congratulations ${guestData.name}! Your receipt for ${validResult.campaign.brandName} has been validated. Your reward will be processed shortly.`,
                            from: `whatsapp:${twilioPhone}`,
                            to: `whatsapp:${phoneNumber}`,
                        });

                        return res.status(200).send('Receipt validated and reward processed.');
                    } catch (error) {
                        console.error('Error during reward processing:', error);
                        throw error;
                    }
                } else {
                    // Analyze what's missing from the receipt
                    let missingDetails = [];
                    
                    if (!receiptData.brandName || receiptData.brandName === 'Unknown Brand') {
                        missingDetails.push("- The brand/restaurant name isn't clearly visible");
                    }
                    if (!receiptData.storeName || receiptData.storeName === 'Unknown Location') {
                        missingDetails.push("- The store location isn't visible");
                    }
                    if (!receiptData.date) {
                        missingDetails.push("- The receipt date isn't visible");
                    }
                    if (!receiptData.totalAmount || receiptData.totalAmount === 0) {
                        missingDetails.push("- The total amount isn't clear");
                    }
                    if (!receiptData.items || receiptData.items.length === 0) {
                        missingDetails.push("- The list of purchased items isn't visible");
                    }

                    let responseMessage = `Sorry ${guestData.name}, we couldn't validate your receipt.`;
                    
                    if (missingDetails.length > 0) {
                        responseMessage += "\n\nThe following details are missing or unclear:\n" + missingDetails.join("\n");
                        responseMessage += "\n\nPlease send a new photo making sure all these details are clearly visible.";
                    } else {
                        responseMessage += "\n\nWhile all receipt details are visible, they don't match our active campaign requirements. Please check our current promotions and try again.";
                    }

                    await client.messages.create({
                        body: responseMessage,
                        from: `whatsapp:${twilioPhone}`,
                        to: `whatsapp:${phoneNumber}`,
                    });
                    return res.status(400).send('Receipt validation failed.');
                }
            } catch (error) {
                console.error('Error processing or validating receipt:', error);
                await client.messages.create({
                    body: "Sorry, we encountered an issue processing your receipt. \n" + error + "\nPlease try again later.",
                    from: `whatsapp:${twilioPhone}`,
                    to: `whatsapp:${phoneNumber}`,
                });
                return res.status(500).send('Error processing receipt.');
            }
        } 
        // If text message, process commands
        else if (Body) {
            const result = await processMessage(Body, phoneNumber);
            
            await client.messages.create({
                body: result.message,
                from: `whatsapp:${twilioPhone}`,
                to: `whatsapp:${phoneNumber}`,
            });

            return res.status(result.success ? 200 : 400).send(result.message);
        }
        // No valid input
        else {
            await client.messages.create({
                body: `Hi ${guestData.name}! ${getHelpMessage()}`,
                from: `whatsapp:${twilioPhone}`,
                to: `whatsapp:${phoneNumber}`,
            });
            return res.status(400).send('No valid input provided.');
        }
    } catch (error) {
        console.error('Error handling WhatsApp message:', error.message);

        if (error.code && error.moreInfo) {
            console.error(`Twilio error: ${error.code}, Info: ${error.moreInfo}`);
        }

        try {
            await client.messages.create({
                body: "Sorry, we encountered an unexpected error. Please try again later.",
                from: `whatsapp:${twilioPhone}`,
                to: From,
            });
        } catch (sendError) {
            console.error('Error sending error message:', sendError);
        }

        return res.status(500).send('Internal Server Error');
    }
}

/**
 * Get help message listing available commands
 * @returns {string} Formatted help message
 */
function getHelpMessage() {
    return `Here's what you can do:\n
• Send a photo of your receipt to earn rewards
• "Check my points" to see your point balance
• "View my rewards" to see your available rewards
• "Delete my data" to remove your information
• "Help" to see this menu again`;
}

module.exports = { receiveWhatsAppMessage };