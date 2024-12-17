const vision = require('@google-cloud/vision');
const admin = require('firebase-admin');

// Initialize the Google Cloud Vision API client
const client = new vision.ImageAnnotatorClient();

/**
 * Process a receipt using Google Cloud Vision OCR and save parsed data to Firebase
 * @param {string} imageUrl - URL of the receipt image
 * @param {string} guestPhoneNumber - Phone number of the guest who submitted the receipt
 * @param {string} brandName - The brand associated with the receipt campaign
 * @returns {Promise<object>} - Parsed receipt data
 */
// In receiptProcessor.js

async function processReceipt(imageUrl, phoneNumber) {
    try {
        console.log(`Processing receipt for: ${phoneNumber}, Image: ${imageUrl}`);
        
        // Perform text detection on the receipt image
        const [result] = await client.textDetection(imageUrl);
        const detections = result.textAnnotations;

        if (!detections || detections.length === 0) {
            throw new Error('No text detected on the receipt.');
        }

        // Extract full text and parse receipt data
        const fullText = detections[0].description;
        const parsedData = parseReceiptData(fullText);

        // Save full receipt data with relationships
        const receiptData = {
            // Receipt Details
            invoiceNumber: parsedData.invoiceNumber,
            storeName: parsedData.storeName,
            storeLocation: parsedData.storeLocation,
            date: parsedData.date,
            time: parsedData.time,
            
            // Line Items
            items: parsedData.items,
            
            // Totals
            subtotal: parsedData.billSubtotal,
            tax: parsedData.tax,
            totalAmount: parsedData.totalAmount,
            
            // Additional Info
            tableNumber: parsedData.tableNumber,
            numberOfGuests: parsedData.numberOfGuests,
            
            // Metadata
            imageUrl: imageUrl,
            processedAt: admin.database.ServerValue.TIMESTAMP,
            
            // Relationships
            guestPhoneNumber: phoneNumber, // Link to guest
            status: 'pending_validation', // Receipt status
            
            // Original Data (for reference)
            rawText: fullText
        };

        // Create a unique ID for the receipt using invoice number if available
        const receiptId = parsedData.invoiceNumber || admin.database().ref().push().key;
        
        // Structure the database updates
        const updates = {};
        
        // Store receipt data
        updates[`receipts/${receiptId}`] = receiptData;
        
        // Create index by phone number for quick guest receipt lookup
        updates[`guest-receipts/${phoneNumber}/${receiptId}`] = true;

        // Perform all updates atomically
        await admin.database().ref().update(updates);

        console.log('Receipt data saved with ID:', receiptId);
        return {
            receiptId,
            ...receiptData
        };
    } catch (error) {
        console.error('Error processing receipt:', error);
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

    // Extract store details
    // Look for lines containing store name, location, and address format
    const storeDetails = lines.slice(0, 5).join(' '); // Usually at the top of receipt
    receiptData.storeName = storeDetails.split('\n')[0] || 'Unknown Store';
    receiptData.storeLocation = storeDetails.match(/(?:Shop|store)\s+.*?(?=Tel:|$)/i)?.[0] || '';

    // Extract invoice/receipt number - multiple formats
    const invoiceMatch = text.match(/(?:INVOICE|PRO-FORMA INVOICE|RECEIPT):\s*[#]?(\d+)/i);
    receiptData.invoiceNumber = invoiceMatch ? invoiceMatch[1] : null;

    // Extract date and time
    const dateTimeMatch = text.match(/(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2})/);
    if (dateTimeMatch) {
        receiptData.date = dateTimeMatch[1];
        receiptData.time = dateTimeMatch[2];
    }

    // Extract table information
    const tableMatch = text.match(/TABLE:\s*(\d+)/i);
    const coversMatch = text.match(/COVERS:\s*(\d+)/i);
    receiptData.tableNumber = tableMatch ? tableMatch[1] : null;
    receiptData.numberOfGuests = coversMatch ? parseInt(coversMatch[1]) : null;

    // Extract bill totals
    const billExclMatch = text.match(/Bill\s*Excl\s*(\d+\.\d{2})/i);
    const taxMatch = text.match(/Tax\s*(\d+\.\d{2})/i);
    const totalMatch = text.match(/Bill\s*Total\s*(\d+\.\d{2})/i);

    receiptData.billSubtotal = billExclMatch ? parseFloat(billExclMatch[1]) : null;
    receiptData.tax = taxMatch ? parseFloat(taxMatch[1]) : null;
    receiptData.totalAmount = totalMatch ? parseFloat(totalMatch[1]) : null;

    // Extract line items
    const items = [];
    let inItemSection = false;
    for (const line of lines) {
        // Look for start of items section
        if (line.includes('ITEM') && line.includes('QTY') && line.includes('PRICE')) {
            inItemSection = true;
            continue;
        }

        // Stop when we hit totals
        if (line.includes('Bill Excl') || line.includes('VAT')) {
            inItemSection = false;
            break;
        }

        if (inItemSection) {
            // Match line item pattern: Item name, quantity, price, value
            const itemMatch = line.match(/^(.*?)\s+(\d+)\s+(\d+\.\d{2})\s+(\d+\.\d{2})/);
            if (itemMatch) {
                items.push({
                    name: itemMatch[1].trim(),
                    quantity: parseInt(itemMatch[2]),
                    unitPrice: parseFloat(itemMatch[3]),
                    totalPrice: parseFloat(itemMatch[4])
                });
            }
        }
    }
    receiptData.items = items;

    // Extract VAT details
    const vatMatch = text.match(/VAT\s*\d+%\s*(?:\(.*?\))?\s*:?\s*(\d+\.\d{2})/i);
    receiptData.vat = vatMatch ? parseFloat(vatMatch[1]) : null;

    console.log('Parsed receipt data:', receiptData);
    return receiptData;
}

module.exports = { processReceipt, parseReceiptData };