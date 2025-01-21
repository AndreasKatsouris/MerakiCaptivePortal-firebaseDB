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

    // Look for brand name in first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i].toLowerCase();
        for (const brand of activeBrands) {
            if (line.includes(brand.toLowerCase())) {
                brandName = brand;
                const fullStoreLine = lines[i];
                const brandRegex = new RegExp(brand, 'i');
                storeName = fullStoreLine.replace(brandRegex, '').trim();
                break;
            }
        }
        if (brandName) break;
    }

    // Look for store address
    for (let i = 1; i < Math.min(10, lines.length); i++) {
        const line = lines[i];
        if (line.match(/SHOP|MALL|CENTRE|CENTER|STREET|RD|ROAD|AVE|AVENUE|Tel/i)) {
            storeAddress = line.trim();
            break;
        }
    }

    return {
        brandName: brandName || 'Unknown Brand',
        storeName: storeName || 'Unknown Location',
        storeAddress: storeAddress || '',
        fullStoreName: `${brandName} ${storeName}`.trim()
    };
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
    let currentItem = null;

    // Common section markers
    const sectionStartMarkers = [
        /items?/i,
        /description/i,
        /qty.*price/i,
        /ordered items?/i
    ];

    const sectionEndMarkers = [
        /subtotal/i,
        /bill\s+excl/i,
        /total/i,
        /vat/i,
        /tax/i
    ];

    // Multiple item patterns to try
    const itemPatterns = [
        // Pattern 1: Name Qty Price Total
        /^(.+?)\s+(\d+)\s+(\d+\.?\d*)\s+(\d+\.?\d*)$/,
        // Pattern 2: Name Qty Price
        /^(.+?)\s+(\d+)\s+R?\s*(\d+\.?\d*)$/,
        // Pattern 3: Name Price
        /^(.+?)\s+R?\s*(\d+\.?\d*)$/,
        // Pattern 4: Qty x Price Name
        /^(\d+)\s*x\s*R?\s*(\d+\.?\d*)\s+(.+)$/
    ];

    // Price pattern to find standalone prices
    const pricePattern = /R?\s*(\d+\.?\d*)/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Check for section start
        if (sectionStartMarkers.some(marker => marker.test(line))) {
            inItemsSection = true;
            continue;
        }

        // Check for section end
        if (sectionEndMarkers.some(marker => marker.test(line))) {
            if (currentItem) {
                items.push(currentItem);
                currentItem = null;
            }
            inItemsSection = false;
            continue;
        }

        if (!inItemsSection) continue;

        // Try each item pattern
        let matched = false;
        for (const pattern of itemPatterns) {
            const match = line.match(pattern);
            if (match) {
                matched = true;
                let item;

                if (pattern === itemPatterns[0]) {
                    // Pattern 1: Name Qty Price Total
                    item = {
                        name: match[1].trim(),
                        quantity: parseInt(match[2]),
                        unitPrice: parseFloat(match[3]),
                        totalPrice: parseFloat(match[4])
                    };
                } else if (pattern === itemPatterns[1]) {
                    // Pattern 2: Name Qty Price
                    const qty = parseInt(match[2]);
                    const price = parseFloat(match[3]);
                    item = {
                        name: match[1].trim(),
                        quantity: qty,
                        unitPrice: price,
                        totalPrice: qty * price
                    };
                } else if (pattern === itemPatterns[2]) {
                    // Pattern 3: Name Price
                    item = {
                        name: match[1].trim(),
                        quantity: 1,
                        unitPrice: parseFloat(match[2]),
                        totalPrice: parseFloat(match[2])
                    };
                } else if (pattern === itemPatterns[3]) {
                    // Pattern 4: Qty x Price Name
                    const qty = parseInt(match[1]);
                    const price = parseFloat(match[2]);
                    item = {
                        name: match[3].trim(),
                        quantity: qty,
                        unitPrice: price,
                        totalPrice: qty * price
                    };
                }

                if (item && !isNaN(item.totalPrice)) {
                    items.push(item);
                    subtotal += item.totalPrice;
                }
                break;
            }
        }

        // Handle multiline items
        if (!matched) {
            // Check if line contains only a price
            const priceMatch = line.match(pricePattern);
            if (priceMatch && currentItem) {
                const price = parseFloat(priceMatch[1]);
                currentItem.unitPrice = price;
                currentItem.totalPrice = price * currentItem.quantity;
                items.push(currentItem);
                subtotal += currentItem.totalPrice;
                currentItem = null;
            } else if (!priceMatch && !line.match(/^\d+$/)) {
                // Line might be an item name
                currentItem = {
                    name: line.trim(),
                    quantity: 1,
                    unitPrice: 0,
                    totalPrice: 0
                };
            }
        }
    }

    // Clean up any remaining items
    if (currentItem && currentItem.unitPrice > 0) {
        items.push(currentItem);
        subtotal += currentItem.totalPrice;
    }

    // Post-process items to clean up names and remove duplicates
    const cleanedItems = items
        .filter(item => item.name && item.totalPrice > 0)
        .map(item => ({
            ...item,
            name: cleanItemName(item.name)
        }))
        .filter((item, index, self) => 
            index === self.findIndex(t => t.name === item.name && t.totalPrice === item.totalPrice)
        );

    return { items: cleanedItems, subtotal };
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