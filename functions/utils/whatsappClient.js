const { client, twilioPhone } = require('../twilioClient');
const {
    TEMPLATE_TYPES,
    TWILIO_TEMPLATE_CONFIG,
    TWILIO_TEMPLATES,
    buildBookingConfirmationParams,
    buildBookingStatusParams,
    buildBookingReminderParams,
    buildReceiptConfirmationParams,
    buildWelcomeMessageParams,
    buildQueueManualAdditionParams,
    buildAdminNewBookingNotificationParams,
    buildFallbackMessage
} = require('./whatsappTemplates');

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

        console.log(`Sending WhatsApp template ${templateType} to:`, to);
        
        // Get template configuration
        const template = TWILIO_TEMPLATES[templateType];
        if (!template) {
            throw new Error(`Template not found: ${templateType}`);
        }

        // Ensure proper WhatsApp format
        const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
        
        // Try to send template if templates are enabled and ContentSid is available
        if (TWILIO_TEMPLATE_CONFIG.USE_TEMPLATES && template.contentSid && !template.contentSid.includes('HXxxxxxxx')) {
            try {
                console.log(`📋 Using Twilio template with ContentSid: ${template.contentSid}`);
                
                const messageOptions = {
                    contentSid: template.contentSid,
                    contentVariables: JSON.stringify(contentVariables),
                    from: `whatsapp:${twilioPhone}`,
                    to: whatsappTo
                };

                // Add messaging service SID if configured
                if (TWILIO_TEMPLATE_CONFIG.MESSAGING_SERVICE_SID) {
                    messageOptions.messagingServiceSid = TWILIO_TEMPLATE_CONFIG.MESSAGING_SERVICE_SID;
                }

                const message = await client.messages.create(messageOptions);
                
                console.log(`✅ Twilio template sent successfully: ${templateType}`, {
                    messageSid: message.sid,
                    contentSid: template.contentSid
                });
                return message;
                
            } catch (templateError) {
                console.warn(`⚠️ Template sending failed, falling back to formatted message:`, templateError.message);
                // Fall through to fallback message
            }
        }
        
        // Fallback to formatted message using template structure
        console.log(`📋 Using fallback formatted message for ${templateType}`);
        const fallbackMessage = buildFallbackMessage(templateType, Object.values(contentVariables));
        
        const message = await client.messages.create({
            body: fallbackMessage,
            from: `whatsapp:${twilioPhone}`,
            to: whatsappTo
        });
        
        console.log(`✅ Fallback message sent successfully: ${templateType}`, {
            messageSid: message.sid
        });
        return message;
        
    } catch (error) {
        console.error('Error sending WhatsApp template:', error);
        
        // If template fails, try sending basic message
        if (options.fallbackMessage) {
            try {
                await sendWhatsAppMessage(to, options.fallbackMessage);
                console.log('✅ Basic fallback message sent successfully');
            } catch (fallbackError) {
                console.error('❌ All fallback methods failed:', fallbackError);
                throw fallbackError;
            }
        } else {
            throw error;
        }
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
    getTemplateInfo
}; 