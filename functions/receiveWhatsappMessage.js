const admin = require('firebase-admin');
require('dotenv').config();
const { client, twilioPhone } = require('./twilioClient');
const { processReceipt } = require('./receiptProcessor');
const { matchReceiptToCampaign } = require('./guardRail');
const { processReward } = require('./rewardsProcessor');
const { processMessage } = require('./menuLogic');
const { 
    checkConsent, 
    handleConsentFlow, 
    isConsentMessage, 
    requiresConsent 
} = require('./consent/consent-handler');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}
async function sendWhatsAppNotification(phoneNumber, message) {
    try {
        await client.messages.create({
            body: message,
            from: `whatsapp:${twilioPhone}`,
            to: `whatsapp:${phoneNumber}`
        });
        return { success: true };
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        throw error;
    }
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
        const validationError = validateRequest(req);
        if (validationError) {
            return res.status(400).send(validationError);
        }

        const { Body, From, MediaUrl0 } = req.body;
        const phoneNumber = From.replace('whatsapp:', '');
        console.log(`Processing message from ${phoneNumber}`);

        // Get or initialize guest data
        const guestData = await getOrCreateGuest(phoneNumber);

        // Handle different message types
        if (!guestData.name) {
            return await handleNameCollection(guestData, Body, MediaUrl0, res);
        }
        //=============================================================
        // Check consent status
        const consentStatus = await checkConsent(guestData);     
        // Handle consent flow if needed
        if (consentStatus.requiresConsent || isConsentMessage(Body)) {
            const consentResult = await handleConsentFlow(guestData, Body);
            if (consentResult.shouldMessage) {
                await sendWhatsAppMessage(phoneNumber, consentResult.message);
            }
            return res.status(consentResult.success ? 200 : 400)
                     .send(consentResult.success ? 'Consent handled' : 'Invalid consent response');
        }           

        if (MediaUrl0) {
            // Check consent for receipt processing
            if (!consentStatus.hasConsent) {
                await sendWhatsAppMessage(phoneNumber, 
                    'To process receipts and earn rewards, we need your consent. ' +
                    'Reply "consent" to review and accept our privacy policy.'
                );
                return res.status(200).send('Consent required');
            }
            return await handleReceiptProcessing(guestData, MediaUrl0, res);
        }
        if (Body) {
            // Check if command requires consent
            if (requiresConsent(Body) && !consentStatus.hasConsent) {
                await sendWhatsAppMessage(phoneNumber, 
                    'This feature requires your consent. ' +
                    'Reply "consent" to review our privacy policy and enable all features.'
                );
                return res.status(200).send('Consent required for command');
            }
            return await handleTextCommand(guestData, Body, res);
        }

        return await handleInvalidInput(guestData, res);

    } catch (error) {
        return await handleError(error, req.body.From, res);
    }
}

/**
 * Validate incoming request
 * @param {object} req - Request object
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateRequest(req) {
    if (!req.body || typeof req.body !== 'object') {
        console.error('Invalid request payload:', req.body);
        return 'Invalid request payload.';
    }

    if (!req.body.From || !req.body.From.startsWith('whatsapp:')) {
        console.error('Invalid sender information:', req.body.From);
        return 'Invalid sender information.';
    }

    return null;
}

/**
 * Get or create guest record
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<object>} Guest data
 */
async function getOrCreateGuest(phoneNumber) {
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

    return guestData;
}

/**
 * Handle name collection for new guests
 * @param {object} guestData - Guest data
 * @param {string} body - Message body
 * @param {string} mediaUrl - Media URL if any
 * @param {object} res - Response object
 */
async function handleNameCollection(guestData, body, mediaUrl, res) {
    if (!guestData.name && body && !mediaUrl) {
        const trimmedName = body.trim();
        await admin.database().ref(`guests/${guestData.phoneNumber}`).update({ name: trimmedName });

        await sendWhatsAppMessage(
            guestData.phoneNumber,
            `Thank you, ${trimmedName}! Your profile has been updated.\n\n${getHelpMessage()}`
        );
        return res.status(200).send('Guest name updated.');
    }

    await sendWhatsAppMessage(
        guestData.phoneNumber,
        "Welcome! Please reply with your full name to complete your profile."
    );
    return res.status(200).send('Prompted guest for name.');
}

/**
 * Handle receipt processing
 * @param {object} guestData - Guest data
 * @param {string} mediaUrl - Receipt image URL
 * @param {object} res - Response object
 */
async function handleReceiptProcessing(guestData, mediaUrl, res) {
    try {
        console.log(`Processing receipt for ${guestData.phoneNumber}`);
        
        // Process receipt image
        const receiptData = await processReceipt(mediaUrl, guestData.phoneNumber);
        
        // Match receipt to campaign using new guardrail
        const matchResult = await matchReceiptToCampaign(receiptData);

        if (matchResult.isValid) {
            return await handleSuccessfulMatch(guestData, matchResult, receiptData, res);
        } else {
            return await handleFailedMatch(guestData, matchResult, receiptData, res);
        }
    } catch (error) {
        console.error('Receipt processing error:', error);
        await sendWhatsAppMessage(
            guestData.phoneNumber,
            `Sorry, we encountered an issue processing your receipt: ${error.message}\nPlease try again later.`
        );
        return res.status(500).send('Error processing receipt.');
    }
}

/**
 * Handle successful receipt-campaign match
 * @param {object} guestData - Guest data
 * @param {object} matchResult - Campaign matching result
 * @param {object} receiptData - Processed receipt data
 * @param {object} res - Response object
 */
async function handleSuccessfulMatch(guestData, matchResult, receiptData, res) {
    try {
        console.log('Processing successful match:', {
            guest: guestData.phoneNumber,
            campaign: matchResult.campaign.name,
            criteria: matchResult.matchedCriteria
        });

        await processReward(guestData, matchResult.campaign, receiptData);
        
        await sendWhatsAppMessage(
            guestData.phoneNumber,
            `Congratulations ${guestData.name}! Your receipt for ${matchResult.campaign.brandName} has been validated. Your reward will be processed shortly.`
        );

        return res.status(200).send('Receipt validated and reward processed.');
    } catch (error) {
        console.error('Error processing reward:', error);
        throw error;
    }
}

/**
 * Handle failed receipt-campaign match
 * @param {object} guestData - Guest data
 * @param {object} matchResult - Campaign matching result
 * @param {object} receiptData - Processed receipt data
 * @param {object} res - Response object
 */
async function handleFailedMatch(guestData, matchResult, receiptData, res) {
    const failureMessage = constructFailureMessage(guestData.name, matchResult, receiptData);
    
    await sendWhatsAppMessage(guestData.phoneNumber, failureMessage);
    return res.status(400).send('Receipt validation failed.');
}

/**
 * Construct failure message based on validation results
 * @param {string} guestName - Guest's name
 * @param {object} matchResult - Campaign matching result
 * @param {object} receiptData - Processed receipt data
 * @returns {string} Formatted failure message
 */
function constructFailureMessage(guestName, matchResult, receiptData) {
    let message = `Sorry ${guestName}, we couldn't validate your receipt.`;

    if (matchResult.error === 'No active campaigns found') {
        return `Sorry ${guestName}, there are no active campaigns at the moment.`;
    }

    const missingDetails = [];
    
    // Check receipt data completeness
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

    if (missingDetails.length > 0) {
        message += "\n\nThe following details are missing or unclear:\n" + missingDetails.join("\n");
        message += "\n\nPlease send a new photo making sure all these details are clearly visible.";
    } else if (matchResult.failedCriteria) {
        message += "\n\nCampaign requirements not met:\n" + 
                  matchResult.failedCriteria.map(c => `- ${c.reason}`).join("\n");
    } else {
        message += "\n\n" + matchResult.error;
    }

    return message;
}

/**
 * Handle text commands
 * @param {object} guestData - Guest data
 * @param {string} body - Message body
 * @param {object} res - Response object
 */
async function handleTextCommand(guestData, body, res) {
    const result = await processMessage(body, guestData.phoneNumber);
    await sendWhatsAppMessage(guestData.phoneNumber, result.message);
    return res.status(result.success ? 200 : 400).send(result.message);
}

/**
 * Handle invalid input
 * @param {object} guestData - Guest data
 * @param {object} res - Response object
 */
async function handleInvalidInput(guestData, res) {
    await sendWhatsAppMessage(
        guestData.phoneNumber,
        `Hi ${guestData.name}! ${getHelpMessage()}`
    );
    return res.status(400).send('No valid input provided.');
}

/**
 * Handle errors
 * @param {Error} error - Error object
 * @param {string} from - Sender's phone number
 * @param {object} res - Response object
 */
async function handleError(error, from, res) {
    console.error('Error handling WhatsApp message:', error);
    
    if (error.code && error.moreInfo) {
        console.error(`Twilio error: ${error.code}, Info: ${error.moreInfo}`);
    }

    try {
        await sendWhatsAppMessage(
            from.replace('whatsapp:', ''),
            "Sorry, we encountered an unexpected error. Please try again later."
        );
    } catch (sendError) {
        console.error('Error sending error message:', sendError);
    }

    return res.status(500).send('Internal Server Error');
}

/**
 * Send WhatsApp message
 * @param {string} to - Recipient phone number
 * @param {string} message - Message to send
 */
async function sendWhatsAppMessage(to, message) {
    await client.messages.create({
        body: message,
        from: `whatsapp:${twilioPhone}`,
        to: `whatsapp:${to}`
    });
}

/**
 * Get help message
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

module.exports = { receiveWhatsAppMessage,sendWhatsAppNotification };