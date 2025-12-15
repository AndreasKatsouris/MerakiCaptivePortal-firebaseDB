/**
 * WhatsApp Template Management System
 * Handles template-based messaging according to Meta's best practices
 */

// WhatsApp Template Categories
const TEMPLATE_CATEGORIES = {
    UTILITY: 'utility',           // Account updates, order status, etc.
    MARKETING: 'marketing',       // Promotional messages, offers
    AUTHENTICATION: 'authentication'  // OTP, verification codes
};

// Template Message Types
const TEMPLATE_TYPES = {
    BOOKING_CONFIRMATION: 'booking_confirmation',
    BOOKING_STATUS_UPDATE: 'booking_status_update',
    BOOKING_REMINDER: 'booking_reminder',
    BOOKING_CANCELLATION: 'booking_cancellation',
    WELCOME_MESSAGE: 'welcome_message',
    RECEIPT_CONFIRMATION: 'receipt_confirmation',
    REWARD_NOTIFICATION: 'reward_notification',
    POINTS_UPDATE: 'points_update',
    QUEUE_MANUAL_ADDITION: 'queue_manual_addition',
    ADMIN_NEW_BOOKING_NOTIFICATION: 'admin_new_booking_notification'
};

// Twilio WhatsApp Template Configuration
const TWILIO_TEMPLATE_CONFIG = {
    // Replace these with your actual Twilio ContentSid values after template approval
    CONTENT_SIDS: {
        BOOKING_CONFIRMATION: process.env.TWILIO_CONTENT_SID_BOOKING_CONFIRMATION || 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        BOOKING_STATUS_UPDATE: process.env.TWILIO_CONTENT_SID_BOOKING_STATUS || 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        BOOKING_REMINDER: process.env.TWILIO_CONTENT_SID_BOOKING_REMINDER || 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        RECEIPT_CONFIRMATION: process.env.TWILIO_CONTENT_SID_RECEIPT || 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        WELCOME_MESSAGE: process.env.TWILIO_CONTENT_SID_WELCOME || 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        QUEUE_MANUAL_ADDITION: process.env.TWILIO_CONTENT_SID_QUEUE_MANUAL_ADDITION || 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ADMIN_NEW_BOOKING_NOTIFICATION: process.env.TWILIO_CONTENT_SID_ADMIN_NEW_BOOKING || 'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    },
    // Optional: Messaging Service SID for better delivery rates
    MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
    // Enable/disable template usage
    USE_TEMPLATES: process.env.USE_TWILIO_TEMPLATES === 'true'
};

// Twilio WhatsApp Template Definitions
const TWILIO_TEMPLATES = {
    [TEMPLATE_TYPES.BOOKING_CONFIRMATION]: {
        name: 'booking_confirmation',
        contentSid: TWILIO_TEMPLATE_CONFIG.CONTENT_SIDS.BOOKING_CONFIRMATION,
        category: TEMPLATE_CATEGORIES.UTILITY,
        language: 'en',
        // Template body for Twilio (use {{1}}, {{2}}, etc. for variables)
        body: '🎉 *Booking Confirmed!*\n\nHi {{1}},\n\nYour table reservation has been confirmed:\n\n📋 *Booking Details:*\n• Booking ID: {{2}}\n• Date: {{3}}\n• Time: {{4}}\n• Location: {{5}}\n• Section: {{6}}\n• Number of Guests: {{7}}\n• Special Requests: {{8}}\n\n✅ *Status:* {{9}}\n\nWe look forward to serving you! If you need to make any changes, please contact us.\n\n🤖 This is an automated message. Reply if you have questions.',
        variables: [
            'guestName',      // {{1}}
            'bookingId',      // {{2}}
            'date',           // {{3}}
            'time',           // {{4}}
            'location',       // {{5}}
            'section',        // {{6}}
            'numberOfGuests', // {{7}}
            'specialRequests', // {{8}}
            'status'          // {{9}}
        ]
    },

    [TEMPLATE_TYPES.BOOKING_STATUS_UPDATE]: {
        name: 'booking_status_update',
        contentSid: TWILIO_TEMPLATE_CONFIG.CONTENT_SIDS.BOOKING_STATUS_UPDATE,
        category: TEMPLATE_CATEGORIES.UTILITY,
        language: 'en',
        body: '{{1}} *Booking Status Update*\n\nHi {{2}},\n\n{{3}}\n\n📋 *Booking Details:*\n• Booking ID: {{4}}\n• Date: {{5}}\n• Time: {{6}}\n• Location: {{7}}\n• Section: {{8}}\n• Number of Guests: {{9}}\n• Special Requests: {{10}}\n\n🤖 Reply to this message if you have any questions.',
        variables: [
            'statusEmoji',     // {{1}}
            'guestName',       // {{2}}
            'statusMessage',   // {{3}}
            'bookingId',       // {{4}}
            'date',            // {{5}}
            'time',            // {{6}}
            'location',        // {{7}}
            'section',         // {{8}}
            'numberOfGuests',  // {{9}}
            'specialRequests'  // {{10}}
        ]
    },

    [TEMPLATE_TYPES.BOOKING_REMINDER]: {
        name: 'booking_reminder',
        contentSid: TWILIO_TEMPLATE_CONFIG.CONTENT_SIDS.BOOKING_REMINDER,
        category: TEMPLATE_CATEGORIES.UTILITY,
        language: 'en',
        body: '⏰ *Booking Reminder*\n\nHi {{1}},\n\nThis is a friendly reminder about your upcoming reservation:\n\n📋 *Booking Details:*\n• Date: {{2}}\n• Time: {{3}}\n• Location: {{4}}\n• Number of Guests: {{5}}\n\nWe look forward to seeing you!\n\n🤖 Need to change your booking? Just reply to this message.',
        variables: [
            'guestName',      // {{1}}
            'date',           // {{2}}
            'time',           // {{3}}
            'location',       // {{4}}
            'numberOfGuests'  // {{5}}
        ]
    },

    [TEMPLATE_TYPES.RECEIPT_CONFIRMATION]: {
        name: 'receipt_confirmation',
        contentSid: TWILIO_TEMPLATE_CONFIG.CONTENT_SIDS.RECEIPT_CONFIRMATION,
        category: TEMPLATE_CATEGORIES.UTILITY,
        language: 'en',
        body: '🎉 *Receipt Processed!*\n\nCongratulations {{1}}! 🎉\n\nYour receipt has been successfully processed and you\'ve earned:\n\n{{2}}\n\n🎁 *Total Points:* {{3}}\n\nReply "view rewards" anytime to check your rewards!\n\n🤖 Keep sending receipts to earn more rewards!',
        variables: [
            'guestName',     // {{1}}
            'rewardsList',   // {{2}}
            'totalPoints'    // {{3}}
        ]
    },

    [TEMPLATE_TYPES.WELCOME_MESSAGE]: {
        name: 'welcome_message',
        contentSid: TWILIO_TEMPLATE_CONFIG.CONTENT_SIDS.WELCOME_MESSAGE,
        category: TEMPLATE_CATEGORIES.UTILITY,
        language: 'en',
        body: '👋 *Welcome to Our Rewards Program!*\n\nHi {{1}}!\n\nWelcome to our rewards program! I\'m your rewards bot assistant.\n\n🎁 *Here\'s how I can help you:*\n• 📸 Send a photo of your receipt to earn rewards\n• 🎯 Type "check my points" to see your point balance\n• 🏆 Type "view rewards" to see your available rewards\n• 📅 Type "make booking" to reserve a table\n• ❓ Type "help" for more commands\n\nStart by sending me a receipt photo to begin earning rewards!\n\n🤖 Reply anytime for assistance!',
        variables: [
            'guestName'      // {{1}}
        ]
    },

    [TEMPLATE_TYPES.QUEUE_MANUAL_ADDITION]: {
        name: 'queue_manual_addition',
        contentSid: TWILIO_TEMPLATE_CONFIG.CONTENT_SIDS.QUEUE_MANUAL_ADDITION,
        category: TEMPLATE_CATEGORIES.UTILITY,
        language: 'en',
        body: '🎫 *Added to Queue!*\n\nHi {{1}}!\n\nYou have been added to the queue at {{2}}.\n\n📋 *Queue Details:*\n• Position: {{3}}\n• Party Size: {{4}}\n• Estimated Wait Time: {{5}} minutes\n• Special Requests: {{6}}\n\n✅ *Status:* Waiting\n\nWe\'ll notify you when your table is ready!\n\n💬 You can check your queue status anytime by typing "queue status".\n\n🤖 This is an automated message. Reply if you have questions.',
        variables: [
            'guestName',        // {{1}}
            'locationName',     // {{2}}
            'position',         // {{3}}
            'partySize',        // {{4}}
            'estimatedWaitTime', // {{5}}
            'specialRequests'   // {{6}}
        ]
    },

    [TEMPLATE_TYPES.ADMIN_NEW_BOOKING_NOTIFICATION]: {
        name: 'admin_new_booking_notification',
        contentSid: TWILIO_TEMPLATE_CONFIG.CONTENT_SIDS.ADMIN_NEW_BOOKING_NOTIFICATION,
        category: TEMPLATE_CATEGORIES.UTILITY,
        language: 'en',
        body: '🍽️ *New Booking Request*\n\nHi {{1}},\n\nA new booking has been received and requires your attention.\n\n📋 *Booking Details:*\n• Guest: {{2}}\n• Booking ID: {{3}}\n• Date: {{4}}\n• Time: {{5}}\n• Location: {{6}}\n• Section: {{7}}\n• Number of Guests: {{8}}\n• Phone: {{9}}\n• Special Requests: {{10}}\n\n⏰ *Status:* Pending Confirmation\n\nPlease review and confirm this booking in the admin panel.\n\n🤖 This is an automated admin notification.',
        variables: [
            'adminName',        // {{1}}
            'guestName',        // {{2}}
            'bookingId',        // {{3}}
            'date',             // {{4}}
            'time',             // {{5}}
            'location',         // {{6}}
            'section',          // {{7}}
            'numberOfGuests',   // {{8}}
            'phoneNumber',      // {{9}}
            'specialRequests'   // {{10}}
        ]
    }
};

// Status-specific messages for booking updates
const STATUS_MESSAGES = {
    confirmed: {
        emoji: '✅',
        message: 'Great news! Your booking has been confirmed. We\'re excited to have you dine with us.'
    },
    cancelled: {
        emoji: '❌',
        message: 'Your booking has been cancelled. We hope to see you again soon!'
    },
    pending: {
        emoji: '⏳',
        message: 'Your booking is currently pending confirmation. We\'ll update you soon.'
    },
    modified: {
        emoji: '✏️',
        message: 'Your booking has been modified. Please review the updated details below.'
    }
};

/**
 * Get template by type
 */
function getTemplate(templateType) {
    const template = WHATSAPP_TEMPLATES[templateType];
    if (!template) {
        throw new Error(`Template not found: ${templateType}`);
    }
    return template;
}

/**
 * Build Twilio content variables for booking confirmation
 */
function buildBookingConfirmationParams(booking) {
    return {
        "1": booking.guestName,
        "2": booking.id,
        "3": booking.date,
        "4": booking.time,
        "5": booking.location,
        "6": booking.section,
        "7": booking.numberOfGuests.toString(),
        "8": booking.specialRequests || 'None',
        "9": booking.status
    };
}

/**
 * Build Twilio content variables for booking status update
 */
function buildBookingStatusParams(booking) {
    const statusInfo = STATUS_MESSAGES[booking.status] || STATUS_MESSAGES.pending;
    
    return {
        "1": statusInfo.emoji,
        "2": booking.guestName,
        "3": statusInfo.message,
        "4": booking.id,
        "5": booking.date,
        "6": booking.time,
        "7": booking.location,
        "8": booking.section,
        "9": booking.numberOfGuests.toString(),
        "10": booking.specialRequests || 'None'
    };
}

/**
 * Build Twilio content variables for booking reminder
 */
function buildBookingReminderParams(booking) {
    return {
        "1": booking.guestName,
        "2": booking.date,
        "3": booking.time,
        "4": booking.location,
        "5": booking.numberOfGuests.toString()
    };
}

/**
 * Build Twilio content variables for receipt confirmation
 */
function buildReceiptConfirmationParams(guestName, rewardsList, totalPoints) {
    return {
        "1": guestName,
        "2": rewardsList,
        "3": totalPoints.toString()
    };
}

/**
 * Build Twilio content variables for welcome message
 */
function buildWelcomeMessageParams(guestName) {
    return {
        "1": guestName
    };
}

/**
 * Build Twilio content variables for queue manual addition
 */
function buildQueueManualAdditionParams(guestName, locationName, position, partySize, estimatedWaitTime, specialRequests) {
    return {
        "1": guestName,
        "2": locationName,
        "3": position.toString(),
        "4": partySize.toString(),
        "5": estimatedWaitTime.toString(),
        "6": specialRequests || 'None'
    };
}

/**
 * Build Twilio content variables for admin new booking notification
 */
function buildAdminNewBookingNotificationParams(adminName, booking, bookingId) {
    return {
        "1": adminName,
        "2": booking.guestName,
        "3": bookingId,
        "4": booking.date,
        "5": booking.time,
        "6": booking.location,
        "7": booking.section || 'Not specified',
        "8": booking.numberOfGuests.toString(),
        "9": booking.phoneNumber,
        "10": booking.specialRequests || 'None'
    };
}

/**
 * Fallback to dynamic message if template fails
 */
function buildFallbackMessage(templateType, params) {
    switch (templateType) {
        case TEMPLATE_TYPES.BOOKING_CONFIRMATION:
            return `🎉 *Booking Confirmed!*\n\nHi ${params[0]},\n\nYour table reservation has been confirmed:\n\n📋 *Booking Details:*\n• Booking ID: ${params[1]}\n• Date: ${params[2]}\n• Time: ${params[3]}\n• Location: ${params[4]}\n• Section: ${params[5]}\n• Number of Guests: ${params[6]}\n• Special Requests: ${params[7]}\n\n✅ *Status:* ${params[8]}\n\nWe look forward to serving you! If you need to make any changes, please contact us.\n\n🤖 This is an automated message. Reply if you have questions.`;

        case TEMPLATE_TYPES.BOOKING_STATUS_UPDATE:
            return `${params[0]} *Booking Status Update*\n\nHi ${params[1]},\n\n${params[2]}\n\n📋 *Booking Details:*\n• Booking ID: ${params[3]}\n• Date: ${params[4]}\n• Time: ${params[5]}\n• Location: ${params[6]}\n• Section: ${params[7]}\n• Number of Guests: ${params[8]}\n• Special Requests: ${params[9]}\n\n🤖 Reply to this message if you have any questions.`;

        case TEMPLATE_TYPES.WELCOME_MESSAGE:
            return `👋 *Welcome to Our Rewards Program!*\n\nHi ${params[0]}!\n\nWelcome to our rewards program! I'm your rewards bot assistant.\n\n🎁 *Here's how I can help you:*\n• 📸 Send a photo of your receipt to earn rewards\n• 🎯 Type "check my points" to see your point balance\n• 🏆 Type "view rewards" to see your available rewards\n• 📅 Type "make booking" to reserve a table\n• ❓ Type "help" for more commands\n\nStart by sending me a receipt photo to begin earning rewards!\n\n🤖 Reply anytime for assistance!`;

        case TEMPLATE_TYPES.QUEUE_MANUAL_ADDITION:
            return `🎫 *Added to Queue!*\n\nHi ${params[0]}!\n\nYou have been added to the queue at ${params[1]}.\n\n📋 *Queue Details:*\n• Position: ${params[2]}\n• Party Size: ${params[3]}\n• Estimated Wait Time: ${params[4]} minutes\n• Special Requests: ${params[5]}\n\n✅ *Status:* Waiting\n\nWe'll notify you when your table is ready!\n\n💬 You can check your queue status anytime by typing "queue status".\n\n🤖 This is an automated message. Reply if you have questions.`;

        case TEMPLATE_TYPES.ADMIN_NEW_BOOKING_NOTIFICATION:
            return `🍽️ *New Booking Request*\n\nHi ${params[0]},\n\nA new booking has been received and requires your attention.\n\n📋 *Booking Details:*\n• Guest: ${params[1]}\n• Booking ID: ${params[2]}\n• Date: ${params[3]}\n• Time: ${params[4]}\n• Location: ${params[5]}\n• Section: ${params[6]}\n• Number of Guests: ${params[7]}\n• Phone: ${params[8]}\n• Special Requests: ${params[9]}\n\n⏰ *Status:* Pending Confirmation\n\nPlease review and confirm this booking in the admin panel.\n\n🤖 This is an automated admin notification.`;

        default:
            return `🤖 System notification\n\nThank you for using our service. If you have any questions, please reply to this message.`;
    }
}

module.exports = {
    TEMPLATE_CATEGORIES,
    TEMPLATE_TYPES,
    TWILIO_TEMPLATE_CONFIG,
    TWILIO_TEMPLATES,
    STATUS_MESSAGES,
    getTemplate,
    buildBookingConfirmationParams,
    buildBookingStatusParams,
    buildBookingReminderParams,
    buildReceiptConfirmationParams,
    buildWelcomeMessageParams,
    buildQueueManualAdditionParams,
    buildAdminNewBookingNotificationParams,
    buildFallbackMessage
};