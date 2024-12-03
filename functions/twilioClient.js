const axios = require('axios');
const { TwilioHttpClient } = require('twilio/lib/base/TwilioHttpClient');

class CustomHttpClient extends TwilioHttpClient {
    constructor() {
        super();
        this.axiosInstance = axios.create({
            timeout: 5000, // Set a timeout for all requests
        });
    }

    async request(opts) {
        const options = {
            method: opts.method,
            url: opts.uri,
            headers: opts.headers,
            data: opts.data,
        };

        try {
            const response = await this.axiosInstance(options);
            console.log('Request Successful:', response.status, response.data); // Log successful requests
            return {
                statusCode: response.status,
                body: response.data,
                headers: response.headers,
            };
        } catch (error) {
            console.error('HTTP Request Error:', error.message); // Log errors for debugging
            throw error;
        }
    }
}

module.exports = CustomHttpClient;
