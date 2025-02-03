// googleAPIclient.js


// Google Maps/Places Configuration
const GOOGLE_MAPS_CONFIG = {
    apiKey: process.env.GOOGLE_PLACES_API_KEY,
    placeId: process.env.GOOGLE_PLACE_ID,
    libraries: ['places'],
    region: 'ZA',  // For South Africa
    language: 'en'
};

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

// Initialize Firebase Remote Config
const getConfig = async () => {
    try {
        const remoteConfig = firebase.remoteConfig();
        await remoteConfig.fetchAndActivate();

        const config = {
            apiKey: remoteConfig.getString('GOOGLE_PLACES_API_KEY'),
            placeId: remoteConfig.getString('GOOGLE_PLACE_ID'),
            libraries: GOOGLE_MAPS_CONFIG.libraries,
            region: GOOGLE_MAPS_CONFIG.region,
            language: GOOGLE_MAPS_CONFIG.language
        };

        // Validate configuration
        if (!config.apiKey || !config.placeId) {
            throw new Error("Google Places credentials are not set.");
        }

        // Log configuration status
        console.log('Google Places API Configuration:', {
            apiKey: config.apiKey ? 'Set' : 'Not set',
            placeId: config.placeId ? 'Set' : 'Not set',
            libraries: config.libraries,
            region: config.region,
            language: config.language
        });

        return config;
    } catch (error) {
        console.error("Error loading Google Places configuration:", error);
        throw error;
    }
};

// Log configuration status
console.log('GOOGLE_PLACES_API_KEY:', config.apiKey ? 'Set' : 'Not set');
console.log('GOOGLE_PLACE_ID:', config.placeId ? 'Set' : 'Not set');

// Error handling for Places API responses
const handlePlacesError = (status) => {
    const errorMessages = {
        ZERO_RESULTS: 'No results found for this location.',
        OVER_QUERY_LIMIT: 'API request limit exceeded. Please try again later.',
        REQUEST_DENIED: 'API request was denied. Please check your API key.',
        INVALID_REQUEST: 'Invalid request. Please check your parameters.',
        NOT_FOUND: 'Place not found. Please check your place ID.',
        UNKNOWN_ERROR: 'An unknown error occurred.'
    };

    return errorMessages[status] || 'An error occurred while fetching data from Google Places API.';
};

// Export both config and REQUIRED_FIELDS
export { getConfig, REQUIRED_FIELDS, handlePlacesError };