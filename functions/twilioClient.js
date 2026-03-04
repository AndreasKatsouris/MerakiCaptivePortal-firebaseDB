const twilio = require('twilio');
require('dotenv').config();

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE;

console.log('TWILIO_SID:', accountSid || 'Not set');
console.log('TWILIO_TOKEN:', authToken || 'Not set'); //'Set' : 'Not set');
console.log('TWILIO_PHONE:', twilioPhone || 'Not set');

if (!accountSid || !authToken || !twilioPhone) {
    console.warn("Twilio credentials are not set. Twilio-dependent functions will be unavailable.");
}

const client = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

module.exports = {
    client,
    twilioPhone: twilioPhone || null,
};

