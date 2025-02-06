
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
        console.log('Initiating Places API request with:', {
            placeId: config.placeId,
            fields: REQUIRED_FIELDS
        });

        const { map, mapDiv } = initializeMap();
        const service = new google.maps.places.PlacesService(map);

        const place = await new Promise((resolve, reject) => {
            service.getDetails({
                placeId: config.placeId,
                fields: REQUIRED_FIELDS
            }, (result, status) => {
                // Add detailed logging
                console.log('Places API Response:', {
                    status: status,
                    hasResult: !!result,
                    resultFields: result ? Object.keys(result) : [],
                    timestamp: new Date().toISOString()
                });

                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    resolve(result);
                } else {
                    console.error('Places API Error:', {
                        status: status,
                        errorMessage: handlePlacesError(status),
                        timestamp: new Date().toISOString()
                    });
                    reject(new Error(handlePlacesError(status)));
                }
            });
        });

        // Cleanup map div after use
        document.body.removeChild(mapDiv);

        return place;
    } catch (error) {
        console.error('Place Details Error:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
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
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        const placeId = process.env.GOOGLE_PLACE_ID;

        if (!apiKey || !placeId) {
            throw new Error('Required environment variables GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID are missing');
        }

        return {
            apiKey,
            placeId,
            libraries: ['places'],
            region: 'ZA',
            language: 'en'
        };
    } catch (error) {
        console.error('Config initialization error:', error);
        throw error;
    }
};

export { getConfig, REQUIRED_FIELDS, handlePlacesError, getPlaceReviews };


