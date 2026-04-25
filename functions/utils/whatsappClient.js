const { client, twilioPhone } = require('../twilioClient');
const {
    TEMPLATE_TYPES,
    buildBookingConfirmationParams,
    buildBookingStatusParams,
    buildBookingReminderParams,
    buildReceiptConfirmationParams,
    buildWelcomeMessageParams,
    buildQueueManualAdditionParams,
    buildAdminNewBookingNotificationParams,
    buildRewardNotificationParams,
    buildPointsUpdateParams,
    buildFallbackMessage
} = require('./whatsappTemplates');

const { rtdb, ref, get } = require('../config/firebase-admin');

// In-memory cache for template config
let _templateConfigCache = null;
let _templateConfigCacheTime = 0;
const TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getTemplateConfig(templateType) {
    const now = Date.now();
    if (!_templateConfigCache || (now - _templateConfigCacheTime) > TEMPLATE_CACHE_TTL_MS) {
        try {
            const configRef = ref(rtdb, 'whatsapp-template-config');
            const snapshot = await get(configRef);
            if (snapshot.exists()) {
                _templateConfigCache = snapshot.val();
                _templateConfigCacheTime = now;
            } else {
                console.warn('⚠️ whatsapp-template-config node not found in RTDB — templates will fall back until seeded');
                // Don't cache the empty result — retry on next call
                return null;
            }
        } catch (err) {
            console.error('❌ Failed to load whatsapp-template-config from RTDB:', err.message);
            // Don't update cache — retry on next call
            return null;
        }
    }
    return (_templateConfigCache && _templateConfigCache[templateType]) || null;
}

/**
 * Send WhatsApp message using Twilio
 * @param {string} to - Recipient phone number (E.164 format without whatsapp: prefix)
 * @param {string} message - Message to send
 */
async function sendWhatsAppMessage(to, message) {
    try {
        if (!to) {
            throw new Error('Phone number is required');
        }

        // Ensure proper WhatsApp format
        const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        
        console.log('Sending WhatsApp message to:', whatsappTo);
        await client.messages.create({
            body: message,
            from: `whatsapp:${twilioPhone}`,
            to: whatsappTo
        });
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        throw error;
    }
}

/**
 * Send WhatsApp template message using Twilio ContentSid
 * @param {string} to - Recipient phone number (E.164 format without whatsapp: prefix)
 * @param {string} templateType - Template type from TEMPLATE_TYPES
 * @param {Object} contentVariables - Template variables object ({"1": "value1", "2": "value2"})
 * @param {Object} options - Additional options
 */
async function sendWhatsAppTemplate(to, templateType, contentVariables, options = {}) {
    try {
        if (!to) {
            throw new Error('Phone number is required');
        }

        const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

        // Load config from RTDB cache
        const config = await getTemplateConfig(templateType);

        if (!config || !config.enabled) {
            console.log(`📋 FALLBACK: ${templateType} ${config ? 'disabled' : 'not configured in RTDB'}`);
            const fallbackMessage = buildFallbackMessage(templateType, Object.values(contentVariables));
            return await client.messages.create({
                body: fallbackMessage,
                from: `whatsapp:${twilioPhone}`,
                to: whatsappTo
            });
        }

        if (!config.contentSid || !/^HX[a-f0-9]{32}$/.test(config.contentSid)) {
            console.log(`📋 FALLBACK: ${templateType} contentSid not set`);
            const fallbackMessage = buildFallbackMessage(templateType, Object.values(contentVariables));
            return await client.messages.create({
                body: fallbackMessage,
                from: `whatsapp:${twilioPhone}`,
                to: whatsappTo
            });
        }

        try {
            console.log(`📋 Sending Twilio template ${templateType} (${config.contentSid}) to ${to}`);
            const message = await client.messages.create({
                contentSid: config.contentSid,
                contentVariables: JSON.stringify(contentVariables),
                from: `whatsapp:${twilioPhone}`,
                to: whatsappTo
            });
            console.log(`✅ Template sent: ${templateType} sid=${message.sid}`);
            return message;
        } catch (templateError) {
            console.error(`❌ FALLBACK USED: ${templateType} — Twilio error code=${templateError.code} msg="${templateError.message}"`);
            const fallbackMessage = buildFallbackMessage(templateType, Object.values(contentVariables));
            return await client.messages.create({
                body: fallbackMessage,
                from: `whatsapp:${twilioPhone}`,
                to: whatsappTo
            });
        }

    } catch (error) {
        console.error('Error sending WhatsApp template:', error);
        if (options.fallbackMessage) {
            return await sendWhatsAppMessage(to, options.fallbackMessage);
        }
        throw error;
    }
}

/**
 * Send booking confirmation template
 * @param {string} phoneNumber - Recipient phone number
 * @param {Object} booking - Booking data
 */
async function sendBookingConfirmationTemplate(phoneNumber, booking) {
    const contentVariables = buildBookingConfirmationParams(booking);
    
    await sendWhatsAppTemplate(
        phoneNumber,
        TEMPLATE_TYPES.BOOKING_CONFIRMATION,
        contentVariables,
        {
            fallbackMessage: `🎉 Booking Confirmed!\n\nHi ${booking.guestName}, your table reservation has been confirmed for ${booking.date} at ${booking.time}. Booking ID: ${booking.id}`
        }
    );
}

/**
 * Send booking status update template
 * @param {string} phoneNumber - Recipient phone number
 * @param {Object} booking - Booking data
 */
async function sendBookingStatusTemplate(phoneNumber, booking) {
    const contentVariables = buildBookingStatusParams(booking);
    
    await sendWhatsAppTemplate(
        phoneNumber,
        TEMPLATE_TYPES.BOOKING_STATUS_UPDATE,
        contentVariables,
        {
            fallbackMessage: `Booking Status Update\n\nHi ${booking.guestName}, your booking ${booking.id} status has been updated to: ${booking.status}`
        }
    );
}

/**
 * Send booking reminder template
 * @param {string} phoneNumber - Recipient phone number
 * @param {Object} booking - Booking data
 */
async function sendBookingReminderTemplate(phoneNumber, booking) {
    const contentVariables = buildBookingReminderParams(booking);
    
    await sendWhatsAppTemplate(
        phoneNumber,
        TEMPLATE_TYPES.BOOKING_REMINDER,
        contentVariables,
        {
            fallbackMessage: `⏰ Booking Reminder\n\nHi ${booking.guestName}, this is a reminder about your reservation on ${booking.date} at ${booking.time}.`
        }
    );
}

/**
 * Send receipt confirmation template
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} guestName - Guest name
 * @param {string} rewardsList - List of rewards earned
 * @param {number} totalPoints - Total points
 */
async function sendReceiptConfirmationTemplate(phoneNumber, guestName, rewardsList, totalPoints) {
    const contentVariables = buildReceiptConfirmationParams(guestName, rewardsList, totalPoints);
    
    await sendWhatsAppTemplate(
        phoneNumber,
        TEMPLATE_TYPES.RECEIPT_CONFIRMATION,
        contentVariables,
        {
            fallbackMessage: `🎉 Receipt Processed!\n\nCongratulations ${guestName}! Your receipt has been processed and you've earned rewards. Total points: ${totalPoints}`
        }
    );
}

/**
 * Send welcome message template
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} guestName - Guest name
 */
async function sendWelcomeMessageTemplate(phoneNumber, guestName) {
    const contentVariables = buildWelcomeMessageParams(guestName);
    
    await sendWhatsAppTemplate(
        phoneNumber,
        TEMPLATE_TYPES.WELCOME_MESSAGE,
        contentVariables,
        {
            fallbackMessage: `👋 Welcome ${guestName}!\n\nWelcome to our rewards program! Send me a receipt photo to start earning rewards.`
        }
    );
}

/**
 * Send queue manual addition template
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} guestName - Guest name
 * @param {string} locationName - Location name
 * @param {number} position - Queue position
 * @param {number} partySize - Party size
 * @param {number} estimatedWaitTime - Estimated wait time in minutes
 * @param {string} specialRequests - Special requests
 */
async function sendQueueManualAdditionTemplate(phoneNumber, guestName, locationName, position, partySize, estimatedWaitTime, specialRequests) {
    const contentVariables = buildQueueManualAdditionParams(guestName, locationName, position, partySize, estimatedWaitTime, specialRequests);

    await sendWhatsAppTemplate(
        phoneNumber,
        TEMPLATE_TYPES.QUEUE_MANUAL_ADDITION,
        contentVariables,
        {
            fallbackMessage: `🎫 Added to Queue!\n\nHi ${guestName}!\n\nYou have been added to the queue at ${locationName}.\n\nPosition: ${position}\nParty Size: ${partySize}\nEstimated Wait: ${estimatedWaitTime} minutes\nSpecial Requests: ${specialRequests || 'None'}\n\nWe'll notify you when your table is ready!`
        }
    );
}

/**
 * Send admin new booking notification template
 * @param {string} phoneNumber - Admin phone number
 * @param {string} adminName - Admin name
 * @param {Object} booking - Booking data
 * @param {string} bookingId - Booking ID
 */
async function sendAdminNewBookingNotificationTemplate(phoneNumber, adminName, booking, bookingId) {
    const contentVariables = buildAdminNewBookingNotificationParams(adminName, booking, bookingId);

    await sendWhatsAppTemplate(
        phoneNumber,
        TEMPLATE_TYPES.ADMIN_NEW_BOOKING_NOTIFICATION,
        contentVariables,
        {
            fallbackMessage: `🍽️ New Booking Request\n\nHi ${adminName},\n\nA new booking has been received:\n• Guest: ${booking.guestName}\n• Booking ID: ${bookingId}\n• Date: ${booking.date}\n• Time: ${booking.time}\n• Location: ${booking.location}\n• Guests: ${booking.numberOfGuests}\n\nPlease review in the admin panel.`
        }
    );
}

/**
 * Send reward notification template
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} guestName - Guest name
 * @param {string} rewardName - Reward name/description
 * @param {string} rewardValue - Reward value (e.g. "R50 off", "Free dessert")
 * @param {number|string} totalPoints - Guest's total points after this reward
 */
async function sendRewardNotificationTemplate(phoneNumber, guestName, rewardName, rewardValue, totalPoints) {
    const contentVariables = buildRewardNotificationParams(guestName, rewardName, rewardValue, totalPoints);

    await sendWhatsAppTemplate(
        phoneNumber,
        TEMPLATE_TYPES.REWARD_NOTIFICATION,
        contentVariables,
        {
            fallbackMessage: `🎁 You've Earned a Reward!\n\nHi ${guestName},\n\nCongratulations! You've earned: ${rewardName} (${rewardValue})\n\nTotal Points: ${totalPoints}\n\nReply "view rewards" to see all your rewards!`
        }
    );
}

/**
 * Send points update template
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} guestName - Guest name
 * @param {number|string} pointsEarned - Points earned in this transaction
 * @param {number|string} totalPoints - Guest's new total points balance
 * @param {string} transactionType - Description of the transaction (e.g. "Receipt scan", "Bonus reward")
 */
async function sendPointsUpdateTemplate(phoneNumber, guestName, pointsEarned, totalPoints, transactionType) {
    const contentVariables = buildPointsUpdateParams(guestName, pointsEarned, totalPoints, transactionType);

    await sendWhatsAppTemplate(
        phoneNumber,
        TEMPLATE_TYPES.POINTS_UPDATE,
        contentVariables,
        {
            fallbackMessage: `🎯 Points Update\n\nHi ${guestName},\n\nPoints Earned: ${pointsEarned}\nTotal Points: ${totalPoints}\nTransaction: ${transactionType}\n\nReply "check my points" to see your balance!`
        }
    );
}

/**
 * Get template information (for testing/debugging)
 * @param {string} templateType - Template type
 */
function getTemplateInfo(templateType) {
    try {
        return getTemplate(templateType);
    } catch (error) {
        console.error('Error getting template info:', error);
        return null;
    }
}

module.exports = {
    sendWhatsAppMessage,
    sendWhatsAppTemplate,
    sendBookingConfirmationTemplate,
    sendBookingStatusTemplate,
    sendBookingReminderTemplate,
    sendReceiptConfirmationTemplate,
    sendWelcomeMessageTemplate,
    sendQueueManualAdditionTemplate,
    sendAdminNewBookingNotificationTemplate,
    sendRewardNotificationTemplate,
    sendPointsUpdateTemplate,
    getTemplateInfo
};