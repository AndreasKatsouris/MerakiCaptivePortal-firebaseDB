const client = require('@sendgrid/client');

// Initialize SendGrid Client
// API Key should be set in .env file as SENDGRID_API_KEY
// Or via: firebase functions:secrets:set SENDGRID_API_KEY
const apiKey = process.env.SENDGRID_API_KEY;

if (apiKey) {
    client.setApiKey(apiKey);
} else {
    console.warn('SendGrid API Key not found in functions config or environment variables.');
}

/**
 * Add or update a contact in SendGrid Marketing Campaigns
 * @param {Object} contactData - Contact data (email, first_name, last_name, etc.)
 * @returns {Promise<Object>} - SendGrid response
 */
async function addContact(contactData) {
    if (!apiKey) {
        console.error('Cannot add contact: SendGrid API Key is missing.');
        return null;
    }

    // Construct the contact object
    // Note: SendGrid Marketing Campaigns API v3
    const contact = {
        email: contactData.email
    };

    if (contactData.firstName) contact.first_name = contactData.firstName;
    if (contactData.lastName) contact.last_name = contactData.lastName;
    if (contactData.phoneNumber) contact.phone_number = contactData.phoneNumber;
    
    // Add any custom fields if provided
    if (contactData.customFields) {
        contact.custom_fields = contactData.customFields;
    }

    const data = {
        contacts: [contact]
    };

    const request = {
        url: `/v3/marketing/contacts`,
        method: 'PUT',
        body: data
    };

    try {
        const [response, body] = await client.request(request);
        console.log(`SendGrid contact synced: ${contactData.email}`);
        return body;
    } catch (error) {
        console.error('Error syncing contact to SendGrid:', error);
        if (error.response) {
            console.error('SendGrid Error Body:', JSON.stringify(error.response.body, null, 2));
        }
        throw error;
    }
}

module.exports = {
    addContact,
    client
};
