const twilio = require('twilio');
//const CustomHttpClient = require('./CustomHttpClient');
require('dotenv').config();

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE;

if (!accountSid || !authToken || !twilioPhone) {
    console.error("Twilio credentials are not set. Ensure TWILIO_SID, TWILIO_TOKEN, and TWILIO_PHONE are defined in environment variables.");
    throw new Error("Missing Twilio credentials.");
}

const client = twilio(accountSid, authToken);

module.exports = {
    client,
    twilioPhone,
};
