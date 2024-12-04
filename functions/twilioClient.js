const twilio = require('twilio');
//const CustomHttpClient = require('./CustomHttpClient');
require('dotenv').config();
const functions = require('firebase-functions');

const accountSid = process.env.sid;
const authToken = process.env.token;
const twilioPhone = process.env.phone;

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
