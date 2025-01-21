const vision = require('@google-cloud/vision');
const admin = require('firebase-admin');

/**
 * Process a receipt image with Google Cloud Vision OCR and parse the text
 * @param {string} imageUrl - URL of the receipt image
 * @param {string} phoneNumber - Phone number of the guest
 * @returns {Promise<object>} - Parsed and validated receipt data
 */
async function processReceipt(imageUrl, phoneNumber) {
    try {
        console.log('Starting receipt processing for:', { imageUrl, phoneNumber });
        
        // Detect text in image
        const [result] = await detectReceiptText(imageUrl);
        
        // Enhanced validation for OCR results
        if (!result) {
            throw new Error(
                'Failed to process the receipt image. Please try taking another photo with:\n' +
                '• Good lighting\n' +
                '• No glare\n' +
                '• The receipt lying flat\n' +
                '• All text clearly visible'
            );
        }

        if (!result.textAnnotations || result.textAnnotations.length === 0) {
            throw new Error(
                'No text could be detected in the image. This might be because:\n' +
                '• The image is too blurry\n' +
                '• The lighting is too dark or there is glare\n' +
                '• The receipt text is not clearly visible\n' +
                'Please try taking another photo making sure the receipt is well-lit and clearly visible.'
            );
        }

        const fullText = result.textAnnotations[0].description;
        if (!fullText || fullText.trim().length === 0) {
            throw new Error('The receipt appears to be blank or the text is not readable. Please try taking another photo.');
        }

        console.log('Extracted full text:', fullText);

        // Extract store details
        const storeDetails = await extractStoreDetails(fullText);
        console.log('Extracted store details:', storeDetails);

        if (storeDetails.brandName === 'Unknown Brand') {
            throw new Error(
                'Could not identify the restaurant brand on this receipt. Please ensure:\n' +
                '• The restaurant name is clearly visible at the top\n' +
                '• There is no glare or damage covering the header\n' +
                '• The image captures the entire receipt'
            );
        }

        // Parse items section
        const { items, subtotal } = await extractItems(fullText);
        console.log('Extracted items:', items);

        if (items.length === 0) {
            throw new Error(
                'Could not find any items on this receipt. Please ensure:\n' +
                '• The items list is clearly visible\n' +
                '• There is no damage or folding in the middle of the receipt\n' +
                '• All item names and prices are readable'
            );
        }

        // Extract receipt details
        const details = extractReceiptDetails(fullText);
        console.log('Extracted receipt details:', details);

        if (!details.totalAmount) {
            throw new Error(
                'Could not find the total amount on this receipt. Please ensure:\n' +
                '• The bottom portion of the receipt is included\n' +
                '• The total amount is clearly visible\n' +
                '• There is no damage or folding at the bottom'
            );
        }

        // Construct receipt data
        const receiptData = {
            invoiceNumber: details.invoiceNumber,
            brandName: storeDetails.brandName,
            storeName: storeDetails.storeName,
            storeAddress: storeDetails.storeAddress,
            fullStoreName: storeDetails.fullStoreName,
            date: details.date,
            time: details.time,
            waiterName: details.waiterName,
            tableNumber: details.tableNumber,
            items: items,
            subtotal: subtotal,
            vatAmount: details.vatAmount,
            totalAmount: details.totalAmount,
            imageUrl: imageUrl,
            processedAt: Date.now(),
            guestPhoneNumber: phoneNumber,
            status: 'pending_validation',
            rawText: fullText
        };

        console.log('Final parsed receipt data:', receiptData);

        // Validate essential fields
        const missingFields = [];
        if (!receiptData.date) missingFields.push('receipt date');
        if (!receiptData.invoiceNumber) missingFields.push('invoice/receipt number');
        if (!receiptData.totalAmount) missingFields.push('total amount');

        if (missingFields.length > 0) {
            console.warn('Missing receipt fields:', missingFields);
        }

        // Save receipt data
        const savedReceipt = await saveReceiptData(receiptData);
        return savedReceipt;

    } catch (error) {
        console.error('Error processing receipt:', error);
        
        // Enhance error message if it's not already user-friendly
        if (!error.message.includes('Please') && !error.message.includes('This might be')) {
            error.message = 'We had trouble processing your receipt. Please take another photo ensuring:\n' +
                           '• Good lighting with no glare\n' +
                           '• Receipt is flat and not folded\n' +
                           '• All text is clear and readable\n' +
                           '• The entire receipt is captured';
        }
        
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
 * Extract store details from receipt text
 * @param {string} fullText - Full text from receipt
 * @returns {Promise<object>} - Store details
 */
async function extractStoreDetails(fullText) {
    const lines = fullText.split('\n').map(line => line.trim());
    const activeBrands = await fetchActiveBrands();
    let brandName = '';
    let storeName = '';
    let storeAddress = '';
    let brandLineIndex = -1;

    console.log('Processing lines for store details:', lines.slice(0, 5));

    // Look for brand name in first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i].toLowerCase();
        for (const brand of activeBrands) {
            if (line.includes(brand.toLowerCase())) {
                brandName = brand;
                brandLineIndex = i;
                break;
            }
        }
        if (brandName) break;
    }

    // If we found the brand name, look at the next line for store name
    if (brandLineIndex !== -1 && brandLineIndex + 1 < lines.length) {
        storeName = lines[brandLineIndex + 1].trim();
    }

    // Look for address in subsequent lines
    for (let i = brandLineIndex + 2; i < Math.min(brandLineIndex + 5, lines.length); i++) {
        const line = lines[i];
        if (line.match(/SHOP|MALL|CENTRE|CENTER|STREET|RD|ROAD|AVE|AVENUE/i)) {
            storeAddress = line.trim();
            break;
        }
    }

    const storeDetails = {
        brandName: brandName || 'Unknown Brand',
        storeName: storeName || 'Unknown Location',
        storeAddress: storeAddress || '',
        fullStoreName: `${brandName} ${storeName}`.trim()
    };

    console.log('Extracted store details:', storeDetails);
    return storeDetails;
}

/**
 * Extract items from receipt text
 * @param {string} fullText - Full text from receipt
 * @returns {Promise<object>} - Items and subtotal
 */
async function extractItems(fullText) {
    const lines = fullText.split('\n').map(line => line.trim());
    const items = [];
    let inItemsSection = false;
    let subtotal = 0;

    // Find the items section
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Look for section markers
        if (line.match(/^ITEM\s+QTY\s+PRICE\s+VALUE/i)) {
            inItemsSection = true;
            continue;
        }

        if (line.match(/^Bill Excl/i)) {
            inItemsSection = false;
            continue;
        }

        // Process items
        if (inItemsSection && line) {
            // Match pattern: ItemName Qty Price Value
            // Use a more precise regex that handles numbers with decimals
            const itemMatch = line.match(/^(.+?)\s+(\d+)\s+(\d+\.\d{2})\s+(\d+\.\d{2})$/);
            
            if (itemMatch) {
                const [, name, qty, price, total] = itemMatch;
                const item = {
                    name: name.trim(),
                    quantity: parseInt(qty, 10),
                    unitPrice: parseFloat(price),
                    totalPrice: parseFloat(total)
                };

                // Validate the item
                if (!isNaN(item.quantity) && 
                    !isNaN(item.unitPrice) && 
                    !isNaN(item.totalPrice) &&
                    item.name.length > 0) {
                    items.push(item);
                    subtotal += item.totalPrice;
                }
            } else {
                // Try alternative pattern for cases where value might be missing
                const altMatch = line.match(/^(.+?)\s+(\d+)\s+(\d+\.\d{2})/);
                if (altMatch) {
                    const [, name, qty, price] = altMatch;
                    const quantity = parseInt(qty, 10);
                    const unitPrice = parseFloat(price);
                    const total = quantity * unitPrice;
                    
                    const item = {
                        name: name.trim(),
                        quantity: quantity,
                        unitPrice: unitPrice,
                        totalPrice: total
                    };

                    if (!isNaN(item.quantity) && 
                        !isNaN(item.unitPrice) && 
                        item.name.length > 0) {
                        items.push(item);
                        subtotal += item.totalPrice;
                    }
                }
            }
        }
    }

    // Log the extracted items for debugging
    console.log('Extracted items:', JSON.stringify(items, null, 2));
    
    return { items, subtotal };
}

function cleanItemName(name) {
    return name
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .replace(/[^\w\s()-]/g, '')  // Remove special characters except parentheses and hyphen
        .replace(/\s*\(\d+\)\s*$/, '')  // Remove trailing parenthetical numbers
        .trim();
}

/**
 * Extract receipt details from text
 * @param {string} fullText - Full text from receipt
 * @returns {object} - Receipt details
 */
function extractReceiptDetails(fullText) {
    const details = {};

    // Extract invoice number
    const invoiceMatch = fullText.match(/(?:PRO-FORMA\s+)?INVOICE:?\s*#?\s*(\d+)/i) ||
                        fullText.match(/RECEIPT\s*#?\s*(\d+)/i) ||
                        fullText.match(/PRO-FORMA INVOICE:\s*(\d+)/i);
    details.invoiceNumber = invoiceMatch ? invoiceMatch[1] : null;

    // Extract date and time
    const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})/);
    const timeMatch = fullText.match(/TIME\s*:\s*(.+?)(?:\n|$)/i);
    details.date = dateMatch ? dateMatch[1] : null;
    details.time = timeMatch ? timeMatch[1].trim() : null;

    // Extract waiter and table info
    const waiterMatch = fullText.match(/WAITER:?\s*(.+?)(?:\(|\n|$)/i);
    const tableMatch = fullText.match(/TABLE:?\s*(\d+)/i);
    details.waiterName = waiterMatch ? waiterMatch[1].trim() : null;
    details.tableNumber = tableMatch ? tableMatch[1] : null;

    // Extract amounts
    const vatMatch = fullText.match(/VAT\s+\d+%\s+\(already included\)\s+(\d+\.\d{2})/i);
    const totalMatch = fullText.match(/Bill\s+Total\s+(\d+\.\d{2})/i) || 
                      fullText.match(/Bill Total\s*(\d+\.\d{2})/i);
    
    details.vatAmount = vatMatch ? parseFloat(vatMatch[1]) : 0;
    details.totalAmount = totalMatch ? parseFloat(totalMatch[1]) : 0;

    return details;
}

/**
 * Save receipt data to Firebase
 * @param {object} receiptData - Processed receipt data
 * @returns {Promise<object>} - Saved receipt data with ID
 */
async function saveReceiptData(receiptData) {
    try {
        // Create a unique ID using invoice number if available
        const receiptId = receiptData.invoiceNumber || admin.database().ref().push().key;
        
        // Save to Firebase
        await admin.database().ref(`receipts/${receiptId}`).set({
            ...receiptData,
            createdAt: admin.database.ServerValue.TIMESTAMP
        });
        
        // Create guest receipt index
        await admin.database().ref(`guest-receipts/${receiptData.guestPhoneNumber}/${receiptId}`).set(true);

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

/**
 * Fetch active brands from Firebase
 * @returns {Promise<Set>} - Set of active brand names
 */
async function fetchActiveBrands() {
    try {
        const snapshot = await admin.database().ref('campaigns').once('value');
        const campaigns = snapshot.val();
        if (!campaigns) return new Set();

        const brands = new Set();
        Object.values(campaigns).forEach(campaign => {
            if (campaign.brandName) {
                brands.add(campaign.brandName.toLowerCase());
            }
        });
        
        return brands;
    } catch (error) {
        console.error('Error fetching brands:', error);
        return new Set();
    }
}

/**
 * Test receipt processing functionality
 * @param {string} imageUrl - URL of the receipt image
 * @param {string} phoneNumber - Guest phone number
 * @returns {Promise<object>} - Test results
 */
async function testReceiptProcessing(imageUrl, phoneNumber) {
    try {
        console.log('=== Starting Receipt Processing Test ===');
        
        // Test brand fetching
        console.log('\nTesting Brand Fetching:');
        const brands = await fetchActiveBrands();
        console.log('Active Brands:', brands);

        // Test text detection
        console.log('\nTesting Text Detection:');
        const [result] = await detectReceiptText(imageUrl);
        const fullText = result.textAnnotations[0].description;
        console.log('Detected Text Sample:', fullText.slice(0, 200) + '...');

        // Test store details extraction
        console.log('\nTesting Store Details Extraction:');
        const storeDetails = await extractStoreDetails(fullText);
        console.log('Extracted Store Details:', storeDetails);

        // Test full receipt processing
        console.log('\nTesting Full Receipt Processing:');
        const processedReceipt = await processReceipt(imageUrl, phoneNumber);
        console.log('Processed Receipt:', processedReceipt);

        return {
            success: true,
            brands,
            storeDetails,
            processedReceipt
        };
    } catch (error) {
        console.error('Receipt Processing Test Failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    processReceipt,
    testReceiptProcessing
};