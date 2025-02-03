require('dotenv').config();

const config = {
    apiKey: process.env.GOOGLE_PLACES_API_KEY,
    placeId: process.env.GOOGLE_PLACE_ID
};

const REQUIRED_FIELDS = [
    'reviews',
    'rating',
    'user_ratings_total',
    'name',
    'place_id',
    'formatted_address',
    'business_status',
    'formatted_phone_number'
];

console.log('GOOGLE_PLACES_API_KEY:', placesAPI || 'Not set');
console.log('GOOGLE_PLACE_ID:', placesID || 'Not set'); //'Set' : 'Not set');

if (!placesAPI || !placesID) {
    console.error("Google Places credentials are not set. Ensure API KEY & ID are defined.");
    throw new Error("Missing GOOGLE PLACES credentials.");
}

module.exports = {
    config
};

