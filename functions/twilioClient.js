const twilio = require('twilio');
require('dotenv').config();

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE;

// Display environment variables for debugging
console.log('TWILIO_SID:', process.env.TWILIO_SID || 'Not set');
console.log('TWILIO_TOKEN:', process.env.TWILIO_TOKEN ? 'Set (hidden)' : 'Not set');
console.log('TWILIO_PHONE:', process.env.TWILIO_PHONE || 'Not set');

if (!accountSid || !authToken || !twilioPhone) {
    console.error("Twilio credentials are not set. Ensure TWILIO_SID, TWILIO_TOKEN, and TWILIO_PHONE are defined in environment variables.");
    throw new Error("Missing Twilio credentials.");
}

const client = twilio(accountSid, authToken);

module.exports = {
    client,
    twilioPhone,
};
