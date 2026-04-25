// functions/utils/seedTemplateConfig.js
const { rtdb, ref, set, get } = require('../config/firebase-admin');

const INITIAL_TEMPLATE_CONFIG = {
    booking_confirmation: {
        contentSid: process.env.TWILIO_CONTENT_SID_BOOKING_CONFIRMATION || '',
        enabled: !!(process.env.TWILIO_CONTENT_SID_BOOKING_CONFIRMATION &&
                   !process.env.TWILIO_CONTENT_SID_BOOKING_CONFIRMATION.includes('HXxxxxxxx')),
        label: 'Booking Confirmation',
        variableCount: 9
    },
    booking_status_update: {
        contentSid: '',
        enabled: false,
        label: 'Booking Status Update',
        variableCount: 10
    },
    booking_reminder: {
        contentSid: '',
        enabled: false,
        label: 'Booking Reminder',
        variableCount: 5
    },
    receipt_confirmation: {
        contentSid: '',
        enabled: false,
        label: 'Receipt Confirmation',
        variableCount: 3
    },
    welcome_message: {
        contentSid: '',
        enabled: false,
        label: 'Welcome Message',
        variableCount: 1
    },
    queue_manual_addition: {
        contentSid: '',
        enabled: false,
        label: 'Queue Manual Addition',
        variableCount: 6
    },
    admin_new_booking_notification: {
        contentSid: process.env.TWILIO_CONTENT_SID_ADMIN_NEW_BOOKING || '',
        enabled: !!(process.env.TWILIO_CONTENT_SID_ADMIN_NEW_BOOKING &&
                   !process.env.TWILIO_CONTENT_SID_ADMIN_NEW_BOOKING.includes('HXxxxxxxx')),
        label: 'Admin New Booking Notification',
        variableCount: 10
    },
    reward_notification: {
        contentSid: '',
        enabled: false,
        label: 'Reward Notification',
        variableCount: 4
    },
    points_update: {
        contentSid: '',
        enabled: false,
        label: 'Points Update',
        variableCount: 4
    }
};

async function seedTemplateConfig() {
    const configRef = ref(rtdb, 'whatsapp-template-config');
    const snapshot = await get(configRef);

    if (snapshot.exists()) {
        console.log('⏭️ whatsapp-template-config already exists, skipping seed');
        return { skipped: true };
    }

    await set(configRef, INITIAL_TEMPLATE_CONFIG);
    console.log('✅ whatsapp-template-config seeded successfully');
    return { seeded: true, config: INITIAL_TEMPLATE_CONFIG };
}

module.exports = { seedTemplateConfig, INITIAL_TEMPLATE_CONFIG };
