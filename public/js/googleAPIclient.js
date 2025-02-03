require('dotenv').config();

const config = {
    apiKey: process.env.GOOGLE_PLACES_API_KEY,
    placeId: process.env.GOOGLE_PLACE_ID
};

console.log('GOOGLE_PLACES_API_KEY:', placesAPI || 'Not set');
console.log('GOOGLE_PLACE_ID:', placesID || 'Not set'); //'Set' : 'Not set');

if (!placesAPI || !placesID) {
    console.error("Google Places credentials are not set. Ensure API KEY & ID are defined.");
    throw new Error("Missing GOOGLE PLACES credentials.");
}

const client = places(accountSid, authToken);

module.exports = {
    config
};

