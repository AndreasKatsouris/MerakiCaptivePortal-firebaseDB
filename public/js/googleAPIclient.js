// googleAPIclient.js

// Define required fields
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

// Create config object
const config = {
    apiKey: import.meta.env.GOOGLE_PLACES_API_KEY,
    placeId: import.meta.env.GOOGLE_PLACE_ID
};

// Validate configuration
if (!config.apiKey || !config.placeId) {
    console.error("Google Places credentials are not set. Ensure API KEY & ID are defined.");
    throw new Error("Missing GOOGLE PLACES credentials.");
}

// Log configuration status
console.log('GOOGLE_PLACES_API_KEY:', config.apiKey ? 'Set' : 'Not set');
console.log('GOOGLE_PLACE_ID:', config.placeId ? 'Set' : 'Not set');

// Export both config and REQUIRED_FIELDS
export { config, REQUIRED_FIELDS };