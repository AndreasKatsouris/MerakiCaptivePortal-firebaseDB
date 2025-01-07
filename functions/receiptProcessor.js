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
        console.log('Starting receipt processing for:', { imageUrl, phoneNumber });
        
        const [result] = await detectReceiptText(imageUrl);
        
        if (!result || !result.textAnnotations || result.textAnnotations.length === 0) {
            throw new Error('No text could be detected on the receipt');
        }

        const fullText = result.textAnnotations[0].description;
        console.log('Extracted full text:', fullText);

 // Parse items section
const items = [];
const lines = fullText.split('\n');
let inItemsSection = false;
let currentItem = {};

console.log('Starting to parse lines for items');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    console.log('Processing line:', line);

    // Look for section markers
    if (line === 'ITEM') {
        console.log('Found items section start');
        inItemsSection = true;
        continue;
    }

    if (line.startsWith('Bill Excl')) {
        console.log('Found items section end');
        inItemsSection = false;
        // Save last item if pending
        if (currentItem.name) {
            items.push({...currentItem});
            currentItem = {};
        }
        continue;
    }

    // Skip header lines
    if (['QTY', 'PRICE', 'VALUE'].includes(line)) {
        continue;
    }

    if (inItemsSection && line.length > 0) {
        // Check if line is a price (contains only numbers and possibly decimal point)
        if (/^\d+\.?\d*$/.test(line)) {
            const number = parseFloat(line);
            if (!currentItem.name) {
                continue; // Skip if we don't have an item name yet
            }
            // Determine which number this is based on what we already have
            if (!currentItem.quantity) {
                currentItem.quantity = parseInt(number);
            } else if (!currentItem.unitPrice) {
                currentItem.unitPrice = number;
            } else if (!currentItem.totalPrice) {
                currentItem.totalPrice = number;
                // Item is complete, add it to items array
                items.push({...currentItem});
                console.log('Added complete item:', currentItem);
                currentItem = {};
            }
        } else if (!/^\d+\.?\d*$/.test(line) && line !== 'VALUE') {
            // This must be an item name
            if (currentItem.name) {
                // If we already have an item name, save the current item
                if (Object.keys(currentItem).length > 1) {
                    items.push({...currentItem});
                }
                currentItem = {};
            }
            currentItem.name = line;
        }
    }
}

console.log('All parsed items:', JSON.stringify(items, null, 2));

        // Extract other receipt details
        const invoiceMatch = fullText.match(/PRO-FORMA INVOICE:\s*(\d+)/i);
        const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})/);
        const totalMatch = fullText.match(/Bill\s+Total\s+(\d+\.\d{2})/i);
        const storeNameMatch = fullText.match(/OCEAN BASKET\s*(.*?)(?=\n)/);

        // Find total amount - try different patterns
        let totalAmount = 0;
        if (totalMatch) {
            totalAmount = parseFloat(totalMatch[1]);
        } else {
            // Try to find it by looking for "Bill Total" line
            for (const line of lines) {
                if (line.includes('Bill Total')) {
                    const amount = line.match(/(\d+\.\d{2})/);
                    if (amount) {
                        totalAmount = parseFloat(amount[1]);
                        break;
                    }
                }
            }
        }

        const receiptData = {
            invoiceNumber: invoiceMatch ? invoiceMatch[1] : null,
            storeName: storeNameMatch ? storeNameMatch[0].trim() : 'OCEAN BASKET',
            storeLocation: storeNameMatch ? storeNameMatch[1].trim() : '',
            date: dateMatch ? dateMatch[1] : null,
            items: items,
            totalAmount: totalAmount,
            imageUrl: imageUrl,
            processedAt: Date.now(),
            guestPhoneNumber: phoneNumber,
            status: 'pending_validation',
            rawText: fullText
        };

        console.log('Final parsed receipt data:', JSON.stringify(receiptData, null, 2));

        return receiptData;

    } catch (error) {
        console.error('Error processing receipt:', error);
        throw error;
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
    
    console.log('Attempting to save receipt:', {
        parsedData,
        imageUrl,
        phoneNumber
    });
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