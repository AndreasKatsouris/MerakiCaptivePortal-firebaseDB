const vision = require('@google-cloud/vision');
const admin = require('firebase-admin');

// Initialize the Google Cloud Vision API client
const client = new vision.ImageAnnotatorClient();

/**
 * Process a receipt using Google Cloud Vision OCR and save parsed data to Firebase
 * @param {string} imageUrl - URL of the receipt image
 * @param {string} guestPhoneNumber - Phone number of the guest who submitted the receipt
 * @returns {Promise<object>} - Parsed receipt data
 */
async function processReceipt(imageUrl, guestPhoneNumber) {
    try {
        console.log(`Processing receipt for: ${guestPhoneNumber}, Image: ${imageUrl}`);

        // Perform text detection on the receipt image
        const [result] = await client.textDetection(imageUrl);
        const detections = result.textAnnotations;

        if (!detections || detections.length === 0) {
            throw new Error('No text detected on the receipt.');
        }

        // Extract relevant data (assuming the first result is the most accurate)
        const fullText = detections[0].description;
        console.log('Full text extracted:', fullText);

        // Parse receipt data (example: total amount, date, store name, etc.)
        const parsedData = parseReceiptData(fullText);

        // Save processed receipt data to Firebase
        const receiptRef = admin.database().ref('processedReceipts').push();
        await receiptRef.set({
            guestPhoneNumber,
            imageUrl,
            parsedData,
            processedAt: Date.now()
        });

        console.log('Receipt successfully processed and stored.');
        return parsedData;
    } catch (error) {
        console.error('Error processing receipt:', error);
        throw new Error('Failed to process receipt.');
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

    // Example parsing logic
    receiptData.storeName = lines.find(line => line.match(/store|restaurant|shop/i)) || 'Unknown Store';
    receiptData.totalAmount = lines.find(line => line.match(/\$?\d+\.\d{2}/)) || 'Unknown Total';
    receiptData.date = lines.find(line => line.match(/\d{2}\/\d{2}\/\d{4}/)) || 'Unknown Date';

    console.log('Parsed receipt data:', receiptData);
    return receiptData;
}

module.exports = { processReceipt };
