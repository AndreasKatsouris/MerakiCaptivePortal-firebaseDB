const { 
    admin, 
    auth, 
    rtdb, 
    ref, 
    get, 
    set, 
    update, 
    push 
} = require('./config/firebase-admin');
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
    const guestRef = rtdb.ref(`guests/${phoneNumber}`);
    const guestSnapshot = await get(guestRef);
    let guestData = guestSnapshot.val();

    if (!guestData) {
        guestData = { phoneNumber, createdAt: Date.now() };
        await set(guestRef, guestData);
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
        await update(rtdb.ref(`guests/${guestData.phoneNumber}`), { name: trimmedName });

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
 * Handle receipt processing with enhanced reward type support
 * @param {object} guestData - Guest data
 * @param {string} mediaUrl - Receipt image URL
 * @param {object} res - Response object
 */
async function handleReceiptProcessing(guestData, mediaUrl, res) {
    try {
        console.log(`Processing receipt for ${guestData.phoneNumber}`);
        
        // Process receipt image
        const receiptData = await processReceipt(mediaUrl, guestData.phoneNumber);
        
        // Match receipt to campaign with enhanced validation
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
            constructErrorMessage(error)
        );
        return res.status(500).send('Error processing receipt.');
    }
}

/**
 * Handle successful receipt-campaign match with multiple reward types
 * @param {object} guestData - Guest data
 * @param {object} matchResult - Campaign matching result with eligible reward types
 * @param {object} receiptData - Processed receipt data
 * @param {object} res - Response object
 */
async function handleSuccessfulMatch(guestData, matchResult, receiptData, res) {
    try {
        console.log('Processing successful match:', {
            guest: guestData.phoneNumber,
            campaign: matchResult.campaign.name,
            eligibleRewardTypes: matchResult.eligibleRewardTypes.length
        });

        // Process rewards for all eligible types
        const rewardResult = await processReward(
            guestData, 
            {
                ...matchResult.campaign,
                rewardTypes: matchResult.eligibleRewardTypes
            }, 
            receiptData
        );
        
        // Send success message with reward details
        await sendWhatsAppMessage(
            guestData.phoneNumber,
            constructSuccessMessage(guestData.name, matchResult, rewardResult)
        );

        return res.status(200).send('Receipt validated and rewards processed.');
    } catch (error) {
        console.error('Error processing rewards:', error);
        throw error;
    }
}

/**
 * Handle failed receipt-campaign match
 * @param {object} guestData - Guest data
 * @param {object} matchResult - Failed matching result
 * @param {object} receiptData - Processed receipt data
 * @param {object} res - Response object
 */
async function handleFailedMatch(guestData, matchResult, receiptData, res) {
    const failureMessage = constructFailureMessage(guestData.name, matchResult, receiptData);
    
    await sendWhatsAppMessage(guestData.phoneNumber, failureMessage);
    return res.status(400).send('Receipt validation failed.');
}

/**
 * Construct success message for multiple rewards
 * @private
 */
function constructSuccessMessage(guestName, matchResult, rewardResult) {
    const rewardsList = rewardResult.rewards
        .map(reward => {
            const expiryDate = new Date(reward.expiresAt).toLocaleDateString();
            return `• ${reward.metadata.description}\n  Expires: ${expiryDate}`;
        })
        .join('\n');

    return `Congratulations ${guestName}! 🎉\n\n` +
           `Your receipt from ${matchResult.campaign.brandName} has earned you:\n\n` +
           `${rewardsList}\n\n` +
           `Reply "view rewards" anytime to check your rewards!`;
}

/**
 * Construct detailed failure message based on validation results
 * @param {string} guestName - Guest's name
 * @param {object} matchResult - Campaign matching result
 * @param {object} receiptData - Processed receipt data
 * @returns {string} Formatted failure message
 */
function constructFailureMessage(guestName, matchResult, receiptData) {
    // Handle case where no campaigns are active
    if (matchResult.error === 'No active campaigns found') {
        return `Sorry ${guestName}, there are no active campaigns at the moment. Please try again later!`;
    }

    // Handle case where brand has no active campaigns
    if (matchResult.error === `No active campaigns found for ${receiptData.brandName}`) {
        return `Sorry ${guestName}, there are currently no active campaigns for ${receiptData.brandName}. Please check our other participating brands!`;
    }

    let message = `Sorry ${guestName}, we couldn't validate your receipt.`;
    const issues = [];

    // Check receipt data quality issues
    const dataIssues = checkReceiptDataIssues(receiptData);
    if (dataIssues.length > 0) {
        issues.push('\nReceipt clarity issues:', ...dataIssues);
    }

    // Check campaign criteria issues
    if (matchResult.failedCriteria?.length > 0) {
        issues.push('\nCampaign requirements not met:', 
            ...matchResult.failedCriteria.map(c => `• ${formatCriteriaFailure(c)}`)
        );
    }

    // Check reward type eligibility issues
    if (matchResult.rewardTypeIssues?.length > 0) {
        issues.push('\nReward eligibility issues:', 
            ...matchResult.rewardTypeIssues.map(issue => `• ${formatRewardTypeIssue(issue)}`)
        );
    }

    // Add resolution steps
    let resolutionSteps = [];
    if (dataIssues.length > 0) {
        resolutionSteps.push(
            '\nTo ensure your receipt can be processed:',
            '• Take the photo in good lighting',
            '• Make sure the receipt is flat and not folded',
            '• Include the entire receipt in the photo',
            '• Ensure all text is clearly visible'
        );
    }

    if (matchResult.failedCriteria?.length > 0) {
        resolutionSteps.push(
            '\nTo meet campaign requirements:',
            ...getCampaignRequirementTips(matchResult.failedCriteria)
        );
    }

    // Construct final message
    if (issues.length > 0) {
        message += '\n' + issues.join('\n');
    }
    if (resolutionSteps.length > 0) {
        message += '\n' + resolutionSteps.join('\n');
    }

    return message;
}

/**
 * Check receipt data for quality issues
 * @private
 */
function checkReceiptDataIssues(receiptData) {
    const issues = [];

    if (!receiptData.brandName || receiptData.brandName === 'Unknown Brand') {
        issues.push("• The brand/restaurant name isn't clearly visible");
    }
    if (!receiptData.storeName || receiptData.storeName === 'Unknown Location') {
        issues.push("• The store location isn't visible");
    }
    if (!receiptData.date) {
        issues.push("• The receipt date isn't visible");
    }
    if (!receiptData.time) {
        issues.push("• The receipt time isn't visible");
    }
    if (!receiptData.totalAmount || receiptData.totalAmount === 0) {
        issues.push("• The total amount isn't clear");
    }
    if (!receiptData.items || receiptData.items.length === 0) {
        issues.push("• The list of purchased items isn't readable");
    }
    if (!receiptData.invoiceNumber) {
        issues.push("• The receipt/invoice number isn't visible");
    }

    return issues;
}

/**
 * Format campaign criteria failure message
 * @private
 */
function formatCriteriaFailure(criteria) {
    const commonReasons = {
        minimum_amount: 'Purchase amount does not meet the minimum requirement',
        time_window: 'Receipt is outside the valid time window',
        store_match: 'Receipt is not from a participating store',
        required_items: 'Required items are missing from the purchase',
        campaign_period: 'Receipt date is outside the campaign period',
        active_days: 'Purchase was not made on an eligible day'
    };

    return commonReasons[criteria.reason] || criteria.reason;
}

/**
 * Format reward type eligibility issue
 * @private
 */
function formatRewardTypeIssue(issue) {
    const issueMessages = {
        min_purchase: `Minimum purchase amount of R${issue.required} not met (receipt total: R${issue.actual})`,
        max_rewards: 'Maximum number of rewards already claimed',
        time_restriction: 'Purchase time outside eligible hours',
        store_restriction: 'Store not eligible for this reward type',
        required_items: 'Required items for this reward not found'
    };

    return issueMessages[issue.type] || issue.message;
}

/**
 * Get tips for meeting campaign requirements
 * @private
 */
function getCampaignRequirementTips(failedCriteria) {
    const tips = [];

    failedCriteria.forEach(criteria => {
        switch (criteria.reason) {
            case 'minimum_amount':
                tips.push(`• Ensure your purchase meets the minimum amount (R${criteria.required})`);
                break;
            case 'time_window':
                tips.push(`• Visit during campaign hours: ${criteria.validHours}`);
                break;
            case 'required_items':
                tips.push(`• Include the required items in your purchase: ${criteria.items.join(', ')}`);
                break;
            case 'active_days':
                tips.push(`• Visit on eligible days: ${criteria.validDays.join(', ')}`);
                break;
        }
    });

    if (tips.length === 0) {
        tips.push('• Check campaign details for specific requirements');
    }

    return tips;
}

/**
 * Construct error message based on error type
 * @private
 */
function constructErrorMessage(error) {
    // Network or system errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return 'Sorry, we\'re having trouble connecting to our servers. Please try again in a few minutes.';
    }

    // Receipt processing errors
    if (error.message.includes('OCR') || error.message.includes('image')) {
        return `We couldn't read your receipt clearly. Please ensure:\n\n` +
               `• Good lighting with no glare\n` +
               `• Receipt is flat and not folded\n` +
               `• The entire receipt is visible\n` +
               `• All text is clear and readable`;
    }

    // Campaign validation errors
    if (error.message.includes('campaign') || error.message.includes('reward')) {
        return `Sorry, we encountered an issue validating your receipt. Please try again, and if the problem persists, contact support.`;
    }

    // Default error message
    return 'Sorry, something went wrong. Please try again later.';
}

/**
 * Handle text commands with enhanced reward support
 * @param {object} guestData - Guest data
 * @param {string} body - Message body
 * @param {object} res - Response object
 */
async function handleTextCommand(guestData, body, res) {
    const normalizedCommand = body.toLowerCase().trim();

    // Enhanced reward-specific commands
    if (normalizedCommand.startsWith('use reward')) {
        return await handleUseRewardCommand(guestData, body, res);
    }

    if (normalizedCommand === 'view rewards' || normalizedCommand === 'my rewards') {
        return await handleViewRewardsCommand(guestData, res);
    }

    // Default command processing
    const result = await processMessage(body, guestData.phoneNumber);
    await sendWhatsAppMessage(guestData.phoneNumber, result.message);
    return res.status(result.success ? 200 : 400).send(result.message);
}

/**
 * Handle the "use reward" command
 * @private
 */
async function handleUseRewardCommand(guestData, body, res) {
    try {
        // Extract reward ID from command (e.g., "use reward ABC123")
        const rewardId = body.split(' ')[2];
        if (!rewardId) {
            await sendWhatsAppMessage(
                guestData.phoneNumber,
                'Please specify which reward you want to use (e.g., "use reward ABC123").'
            );
            return res.status(400).send('Invalid reward usage command');
        }

        // Verify reward ownership and status
        const rewardRef = rtdb.ref(`rewards/${rewardId}`);
        const snapshot = await get(rewardRef);
        const reward = snapshot.val();

        if (!reward || reward.guestPhone !== guestData.phoneNumber) {
            await sendWhatsAppMessage(
                guestData.phoneNumber,
                'Sorry, we couldn\'t find that reward. Please check the reward ID and try again.'
            );
            return res.status(404).send('Reward not found');
        }

        if (reward.status !== 'active') {
            await sendWhatsAppMessage(
                guestData.phoneNumber,
                `This reward cannot be used because it is ${reward.status}.`
            );
            return res.status(400).send('Invalid reward status');
        }

        if (reward.expiresAt < Date.now()) {
            await sendWhatsAppMessage(
                guestData.phoneNumber,
                'Sorry, this reward has expired.'
            );
            return res.status(400).send('Reward expired');
        }

        // Generate use code and update reward status
        const useCode = generateRewardUseCode();
        await update(rewardRef, {
            status: 'pending_use',
            useCode,
            useRequestedAt: admin.database.ServerValue.TIMESTAMP
        });

        // Send use instructions
        const message = formatRewardUseInstructions(reward, useCode);
        await sendWhatsAppMessage(guestData.phoneNumber, message);
        
        return res.status(200).send('Reward use code generated');

    } catch (error) {
        console.error('Error handling reward use command:', error);
        await sendWhatsAppMessage(
            guestData.phoneNumber,
            'Sorry, we encountered an error processing your reward. Please try again later.'
        );
        return res.status(500).send('Error processing reward use');
    }
}

/**
 * Handle the "view rewards" command
 * @private
 */
async function handleViewRewardsCommand(guestData, res) {
    try {
        // Get user's rewards
        const snapshot = await get(rtdb.ref('rewards')
            .orderByChild('guestPhone')
            .equalTo(guestData.phoneNumber));

        const rewards = snapshot.val() || {};
        
        // Group rewards by status
        const groupedRewards = {
            active: [],
            pending: [],
            used: [],
            expired: []
        };

        Object.entries(rewards).forEach(([id, reward]) => {
            if (reward.expiresAt < Date.now() && reward.status === 'active') {
                reward.status = 'expired';
            }
            groupedRewards[reward.status] = groupedRewards[reward.status] || [];
            groupedRewards[reward.status].push({ id, ...reward });
        });

        // Format and send rewards message
        const message = formatRewardsOverview(groupedRewards);
        await sendWhatsAppMessage(guestData.phoneNumber, message);
        
        return res.status(200).send('Rewards overview sent');

    } catch (error) {
        console.error('Error handling view rewards command:', error);
        await sendWhatsAppMessage(
            guestData.phoneNumber,
            'Sorry, we encountered an error retrieving your rewards. Please try again later.'
        );
        return res.status(500).send('Error retrieving rewards');
    }
}

/**
 * Format reward use instructions
 * @private
 */
function formatRewardUseInstructions(reward, useCode) {
    return `*Ready to use your reward!* 🎉\n\n` +
           `${reward.metadata.description}\n\n` +
           `Show this code to the staff: *${useCode}*\n\n` +
           `This code will be valid for the next 15 minutes.\n` +
           `Reply "view rewards" to see all your rewards.`;
}

/**
 * Format rewards overview message
 * @private
 */
function formatRewardsOverview(groupedRewards) {
    const sections = [];

    if (groupedRewards.active?.length > 0) {
        const activeRewards = groupedRewards.active
            .map(reward => formatSingleReward(reward))
            .join('\n\n');
        sections.push(`*Active Rewards:*\n${activeRewards}`);
    }

    if (groupedRewards.pending?.length > 0) {
        const pendingRewards = groupedRewards.pending
            .map(reward => `• ${reward.metadata.description} (Processing)`)
            .join('\n');
        sections.push(`*Pending Rewards:*\n${pendingRewards}`);
    }

    if (sections.length === 0) {
        return `You don't have any active rewards yet.\n\n` +
               `Send us a receipt from your next purchase to earn rewards!`;
    }

    return sections.join('\n\n') + '\n\n' +
           `To use a reward, reply with "use reward" followed by the reward ID.`;
}

/**
 * Format single reward details
 * @private
 */
function formatSingleReward(reward) {
    const expiryDate = new Date(reward.expiresAt).toLocaleDateString();
    return `• ${reward.metadata.description}\n` +
           `  ID: ${reward.id}\n` +
           `  Expires: ${expiryDate}`;
}

/**
 * Generate random reward use code
 * @private
 */
function generateRewardUseCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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

module.exports = {
    receiveWhatsAppMessage,
    handleReceiptProcessing,
    handleTextCommand,
    constructFailureMessage,
    sendWhatsAppMessage
};