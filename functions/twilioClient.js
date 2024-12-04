import twilio from 'twilio';
//const CustomHttpClient = require('./CustomHttpClient');
require('dotenv').config();
const functions = require('firebase-functions');

const accountSid = process.env.sid;
const authToken = process.env.token;
const twilioPhone = process.env.phone;

if (!accountSid || !authToken || !twilioPhone) {
    console.error("Twilio credentials are not set. Ensure TWILIO_SID, TWILIO_TOKEN, and TWILIO_PHONE are defined in environment variables.");
    throw new Error("Missing Twilio credentials.");
}

const client = twilio(accountSid, authToken);

export default {
    client,
    twilioPhone,
};
