const twilio = require('twilio');
require('dotenv').config();

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE;

console.log('TWILIO_SID:', accountSid || 'Not set');
console.log('TWILIO_TOKEN:', authToken ? 'Set' : 'Not set');
console.log('TWILIO_PHONE:', twilioPhone || 'Not set');

if (!accountSid || !authToken || !twilioPhone) {
    console.error("Twilio credentials are not set. Ensure TWILIO_SID, TWILIO_TOKEN, and TWILIO_PHONE are defined.");
    throw new Error("Missing Twilio credentials.");
}

const client = twilio(accountSid, authToken);

module.exports = {
    client,
    twilioPhone,
};

