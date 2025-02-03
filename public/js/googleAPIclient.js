
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
// Initialize a hidden map element (required by Places API)
const initializeMap = () => {
    const mapDiv = document.createElement('div');
    mapDiv.style.display = 'none';
    document.body.appendChild(mapDiv);

    const map = new google.maps.Map(mapDiv, {
        center: { lat: -33.8688, lng: 151.2195 }, // Default center
        zoom: 13
    });

    return { map, mapDiv };
};
// Get reviews using Places API
const getPlaceReviews = async (config) => {
    try {
        const { map, mapDiv } = initializeMap();
        const service = new google.maps.places.PlacesService(map);

        const request = {
            placeId: config.placeId,
            fields: REQUIRED_FIELDS
        };

        const place = await new Promise((resolve, reject) => {
            service.getDetails(request, (result, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    resolve(result);
                } else {
                    reject(new Error(handlePlacesError(status)));
                }
            });
        });

        // Cleanup map div after use
        document.body.removeChild(mapDiv);

        return place;
    } catch (error) {
        console.error('Error fetching place details:', error);
        throw error;
    }
};

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

const getConfig = async () => {
    try {
        const remoteConfig = firebase.remoteConfig();
        await remoteConfig.fetchAndActivate();

        const config = {
            apiKey: remoteConfig.getString('GOOGLE_PLACES_API_KEY'),
            placeId: remoteConfig.getString('GOOGLE_PLACE_ID')
        };

        if (!config.apiKey || !config.placeId) {
            throw new Error("Google Places credentials are not set.");
        }

        return config;
    } catch (error) {
        console.error("Error loading Google Places configuration:", error);
        throw error;
    }
};
// Log configuration status
console.log('GOOGLE_PLACES_API_KEY:', getConfig.apiKey ? 'Set' : 'Not set');
console.log('GOOGLE_PLACE_ID:', getConfig.placeId ? 'Set' : 'Not set');

export { getConfig, REQUIRED_FIELDS, handlePlacesError, getPlaceReviews };


