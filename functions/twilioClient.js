const twilio = require('twilio');
require('dotenv').config();

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE;

// Log only presence — never the credential values themselves.
console.log('Twilio configured:', {
    hasSid: !!accountSid,
    hasToken: !!authToken,
    hasPhone: !!twilioPhone
});

if (!accountSid || !authToken || !twilioPhone) {
    console.warn("Twilio credentials are not set. Twilio-dependent functions will be unavailable.");
}

const client = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

module.exports = {
    client,
    twilioPhone: twilioPhone || null,
};

