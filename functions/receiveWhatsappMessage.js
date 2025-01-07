const admin = require('firebase-admin');
require('dotenv').config();
const { client, twilioPhone } = require('./twilioClient');
const { processReceipt } = require('./receiptProcessor');
const { validateReceipt } = require('./guardRail');
const { fetchCampaigns } = require('./campaigns');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

/**
 * Process rewards for validated receipts
 */
// In receiveWhatsappMessage.js

async function processReward(guest, campaign, receiptData) {
    try {
        // Input validation
        if (!guest || !guest.phoneNumber) {
            console.error('Invalid guest data:', guest);
            throw new Error('Guest data is missing or invalid');
        }

        if (!campaign || !campaign.name) {
            console.error('Invalid campaign data:', campaign);
            throw new Error('Campaign data is missing or invalid');
        }

        if (!receiptData || !receiptData.receiptId) {
            console.error('Invalid receipt data:', receiptData);
            throw new Error('Receipt data is missing or invalid');
        }

        console.log('Starting reward processing with:', {
            guest: guest,
            campaign: campaign,
            receiptData: receiptData
        });

        // Create reward reference
        const rewardRef = admin.database().ref('rewards').push();
        console.log('Created reward reference:', rewardRef.key);

        // Prepare reward data
        const rewardData = {
            // Guest Information
            guestPhone: guest.phoneNumber,
            guestName: guest.name || 'Unknown Guest',
            
            // Campaign Information
            campaignId: campaign.id || rewardRef.key,
            campaignName: campaign.name,
            
            // Receipt Information
            receiptId: receiptData.receiptId || rewardRef.key,
            receiptAmount: receiptData.totalAmount || 0,
            receiptNumber: receiptData.invoiceNumber || 'Unknown',
            
            // Reward Status
            status: 'pending',
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            
            // Additional tracking
            processedAt: Date.now(),
            processedBy: 'system'
        };

        console.log('Prepared reward data:', rewardData);

        // Prepare database updates
        const updates = {};
        
        try {
            // Store reward data
            updates[`rewards/${rewardRef.key}`] = rewardData;
            console.log('Added reward data to updates');
            
            // Create guest index
            updates[`guest-rewards/${guest.phoneNumber}/${rewardRef.key}`] = true;
            console.log('Added guest index to updates');
            
            // Create campaign index
            const campaignId = campaign.id || rewardRef.key;
            if (campaignId) {
                updates[`campaign-rewards/${campaignId}/${rewardRef.key}`] = true;
                updates[`receipts/${receiptData.receiptId}/campaignId`] = campaignId;
            }
            console.log('Added campaign index to updates');
            
            // Create receipt index
            updates[`receipt-rewards/${receiptData.receiptId}`] = rewardRef.key;
            console.log('Added receipt index to updates');

            // Update receipt status
            updates[`receipts/${receiptData.receiptId}/status`] = 'validated';
            updates[`receipts/${receiptData.receiptId}/validatedAt`] = admin.database.ServerValue.TIMESTAMP;
            updates[`receipts/${receiptData.receiptId}/campaignId`] = campaignId;
            console.log('Added receipt status updates');

            console.log('Attempting to save all updates to database...');
            await admin.database().ref().update(updates);
            console.log('Successfully saved all updates to database');

            return rewardData;

        } catch (dbError) {
            console.error('Database error while saving updates:', dbError);
            console.error('Updates that failed:', updates);
            throw new Error(`Database error: ${dbError.message}`);
        }

    } catch (error) {
        console.error('Error in processReward:', error);
        console.error('Error details:', {
            error: error,
            stack: error.stack,
            guest: guest ? 'present' : 'missing',
            campaign: campaign ? 'present' : 'missing',
            receiptData: receiptData ? 'present' : 'missing'
        });
        throw new Error(`Failed to process reward: ${error.message}`);
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
                // Process the receipt first
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
    // Receipt matches a campaign - process reward
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
    // No matching campaign found
    await client.messages.create({
        body: `Sorry ${guestData.name}, your receipt doesn't match any active campaign requirements.`,
        from: `whatsapp:${twilioPhone}`,
        to: `whatsapp:${phoneNumber}`,
    });
    return res.status(400).send('Receipt validation failed.');
}            } catch (error) {
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
    } catch (error) {
        console.error('Error handling WhatsApp message:', error.message);

        if (error.code && error.moreInfo) {
            console.error(`Twilio error: ${error.code}, Info: ${error.moreInfo}`);
        }

        return res.status(500).send('Internal Server Error');
    }
}

module.exports = { receiveWhatsAppMessage };