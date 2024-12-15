const vision = require('@google-cloud/vision');
const admin = require('firebase-admin');
const { validateReceipt } = require('./guardRail');

// Initialize the Google Cloud Vision API client
const client = new vision.ImageAnnotatorClient();

/**
 * Process a receipt using Google Cloud Vision OCR and save parsed data to Firebase
 * @param {string} imageUrl - URL of the receipt image
 * @param {string} guestPhoneNumber - Phone number of the guest who submitted the receipt
 * @param {string} brandName - The brand associated with the receipt campaign
 * @returns {Promise<object>} - Parsed receipt data
 */
async function processReceipt(imageUrl) {
    try {
        console.log(`Processing receipt for: Brand: ${brandName}, Image: ${imageUrl}`);
        // Perform text detection on the receipt image
        const [result] = await client.textDetection(imageUrl);
        const detections = result.textAnnotations;

        if (!detections || detections.length === 0) {
            throw new Error('No text detected on the receipt.');
        }

        // Extract full text from the receipt (assuming the first result is the most accurate)
        const fullText = detections[0].description;
        console.log('Full text extracted:', fullText);

        // Validate receipt data using guardRails
        const validation = validateReceipt(fullText, brandName);
        if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.message}`);
        }

        // Parse receipt data (example: total amount, date, store name, etc.)
        const parsedData = parseReceiptData(fullText);
        return parsedData;
    } catch (error) {
        console.error('Error processing receipt:', error.message);
        throw new Error(`Failed to process receipt: ${error.message}`);
    }
}

/**
 * Parse receipt text to extract structured data
 * @param {string} text - Full OCR text from the receipt
 * @returns {object} - Parsed receipt data
 */
function parseReceiptData(text) {
    const lines = text.split('\n');
    const receiptData = {};

    // Extracting specific fields from the receipt text
    receiptData.storeName = lines.find(line => line.match(/ocean basket|store|restaurant|shop|ocean basket/i)) || 'Unknown Store';
    receiptData.totalAmount = lines.find(line => line.match(/\$?\d+\.\d{2}/)) || 'Unknown Total';
    receiptData.date = lines.find(line => line.match(/\d{2}\/\d{2}\/\d{4}/)) || 'Unknown Date';

    console.log('Parsed receipt data:', receiptData);
    return receiptData;
}

module.exports = { processReceipt, parseReceiptData };