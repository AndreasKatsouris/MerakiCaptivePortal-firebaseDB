const vision = require('@google-cloud/vision');
const admin = require('firebase-admin');
const { parseText } = require('./textParsingStrategies');

/**
 * Process a receipt image with Google Cloud Vision OCR and parse the text
 * @param {string} imageUrl - URL of the receipt image
 * @param {string} phoneNumber - Phone number of the guest
 * @returns {Promise<object>} - Parsed and validated receipt data
 */
async function processReceipt(imageUrl, phoneNumber) {
    try {
        console.log(`Processing receipt for phone: ${phoneNumber}, Image: ${imageUrl}`);
        
        // Detect text with Vision API
        const [result] = await detectReceiptText(imageUrl);
        
        if (!result || !result.textAnnotations || result.textAnnotations.length === 0) {
            throw new Error('No text could be detected on the receipt');
        }

        // Extract full text and parse receipt data
        const fullText = result.textAnnotations[0].description;
        const parsedData = await parseReceiptData(fullText);
        
        // Save receipt to Firebase
        const receiptData = await saveReceiptData(parsedData, imageUrl, phoneNumber);

        return receiptData;
    } catch (error) {
        console.error('Receipt processing error:', error);
        throw new Error(`Failed to process receipt: ${error.message}`);
    }
}

/**
 * Detect text in receipt image using Vision API
 * @param {string} imageUrl - URL of the receipt image
 * @returns {Promise<Array>} - Vision API detection result
 */
async function detectReceiptText(imageUrl) {
    try {
        const client = new vision.ImageAnnotatorClient();
        return await client.textDetection(imageUrl);
    } catch (error) {
        console.error('Text detection failed:', error);
        throw new Error('Unable to detect text in receipt image');
    }
}

/**
 * Parse receipt text using multiple strategies
 * @param {string} fullText - Detected text from receipt
 * @returns {Promise<object>} - Parsed receipt data
 */
async function parseReceiptData(fullText) {
    const strategies = [
        parseText.standardFormat,
        parseText.alternativeFormat,
        parseText.genericFormat
    ];

    for (const strategy of strategies) {
        try {
            const parsedData = strategy(fullText);
            if (isValidParsedData(parsedData)) {
                return parsedData;
            }
        } catch (error) {
            console.warn(`Parsing strategy ${strategy.name} failed:`, error.message);
        }
    }

    throw new Error('Could not parse receipt using any available strategy');
}

/**
 * Validate parsed receipt data
 * @param {object} parsedData - Parsed receipt data
 * @returns {boolean} - Whether the data is valid
 */
function isValidParsedData(parsedData) {
    return !!(
        parsedData.storeName && 
        parsedData.totalAmount && 
        parsedData.date &&
        parsedData.invoiceNumber
    );
}

/**
 * Save receipt data to Firebase
 * @param {object} parsedData - Parsed receipt data
 * @param {string} imageUrl - Receipt image URL
 * @param {string} phoneNumber - Guest phone number
 * @returns {Promise<object>} - Saved receipt data with ID
 */
async function saveReceiptData(parsedData, imageUrl, phoneNumber) {
    try {
        const receiptData = {
            // Receipt Details
            invoiceNumber: parsedData.invoiceNumber,
            storeName: parsedData.storeName,
            storeLocation: parsedData.storeLocation || '',
            date: parsedData.date,
            
            // Items and Totals
            items: parsedData.items || [],
            totalAmount: parsedData.totalAmount,
            
            // Metadata
            imageUrl: imageUrl,
            processedAt: admin.database.ServerValue.TIMESTAMP,
            guestPhoneNumber: phoneNumber,
            status: 'pending_validation',
            rawText: parsedData.rawText
        };

        // Create a unique ID using invoice number if available
        const receiptId = parsedData.invoiceNumber || admin.database().ref().push().key;
        
        // Save to Firebase
        await admin.database().ref(`receipts/${receiptId}`).set(receiptData);
        
        // Create guest receipt index
        await admin.database().ref(`guest-receipts/${phoneNumber}/${receiptId}`).set(true);

        console.log('Receipt data saved with ID:', receiptId);
        
        return {
            receiptId,
            ...receiptData
        };
    } catch (error) {
        console.error('Error saving receipt:', error);
        throw new Error('Failed to save receipt data');
    }
}

module.exports = { processReceipt };