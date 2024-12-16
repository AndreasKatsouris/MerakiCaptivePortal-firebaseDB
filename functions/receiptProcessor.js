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
async function processReceipt(imageUrl, guestPhoneNumber) {
    try {
        console.log(`Processing receipt for: ${guestPhoneNumber}, Image: ${imageUrl}`);
        // Perform text detection on the receipt image
        const [result] = await client.textDetection(imageUrl);
        const detections = result.textAnnotations;

        if (!detections || detections.length === 0) {
            throw new Error('No text detected on the receipt.');
        }

        // Extract full text from the receipt (assuming the first result is the most accurate)
        const fullText = detections[0].description;
        console.log('Full text extracted:', fullText);

        // Parse receipt data (example: total amount, date, store name, etc.)

        const parsedData = parseReceiptData(fullText);
        // Save processed receipt data to Firebase
        const receiptRef = admin.database().ref('processedReceipts').push();
        await receiptRef.set({
            guestPhoneNumber,
            imageUrl,
            invoiceNumber: parsedData.invoiceNumber, // Add this field
            parsedData,
            processedAt: Date.now(),
        });

        console.log('Receipt successfully processed and stored.');
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