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

    //console.log('Extracted store details:', storeDetails);
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
    let currentItem = {
        name: null,
        quantity: null,
        unitPrice: null,
        totalPrice: null
    };

    console.log('Starting item extraction. Total lines:', lines.length);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        console.log(`\nProcessing line ${i}:`, line);
        console.log('Line with visible whitespace:', debugWhitespace(line));

        // Look for section markers and skip header lines
        if (line.match(/^ITEM$/i)) {
            console.log('Found start of items section, skipping header rows');
            inItemsSection = true;
            // Skip the header lines
            while (i < lines.length - 1 && 
                   (lines[i + 1].match(/^(QTY|PRICE|VALUE)$/i) || lines[i + 1].match(/^-+$/))) {
                console.log('Skipping header line:', lines[i + 1]);
                i++;
            }
            continue;
        }

        if (line.match(/^Bill Excl/i)) {
            console.log('Found end of items section');
            inItemsSection = false;
            // Save any pending item
            if (currentItem.name && currentItem.quantity && currentItem.unitPrice) {
                saveCurrentItem();
            }
            continue;
        }

        // Process items
        if (inItemsSection && line) {
            console.log('Processing potential item line:', line);

            // Check if line is a simple integer (quantity)
            if (/^\d+$/.test(line)) {
                console.log('Found quantity:', line);
                if (currentItem.name && !currentItem.quantity) {
                    currentItem.quantity = parseInt(line, 10);
                }
            }
            // Check if line is a price (number with decimal)
            else if (/^\d+\.\d{2}$/.test(line)) {
                console.log('Found price:', line);
                const price = parseFloat(line);
                if (currentItem.name) {
                    if (!currentItem.unitPrice) {
                        currentItem.unitPrice = price;
                    } else if (!currentItem.totalPrice) {
                        currentItem.totalPrice = price;
                        saveCurrentItem();
                    }
                }
            }
            // If not a number, must be an item name
            else if (line.length > 0 && !line.match(/^-+$/)) {
                console.log('Found item name:', line);
                // Save any previous item if complete
                if (currentItem.name && currentItem.quantity && currentItem.unitPrice) {
                    saveCurrentItem();
                }
                // Start new item
                currentItem = {
                    name: cleanItemName(line),
                    quantity: null,
                    unitPrice: null,
                    totalPrice: null
                };
            }
        }
    }

    function saveCurrentItem() {
        console.log('Saving current item:', currentItem);
        if (currentItem.name && currentItem.quantity && currentItem.unitPrice) {
            // If we don't have a total price, calculate it
            if (!currentItem.totalPrice) {
                currentItem.totalPrice = currentItem.quantity * currentItem.unitPrice;
            }
            
            // Validate the item
            if (!isNaN(currentItem.quantity) && 
                !isNaN(currentItem.unitPrice) && 
                !isNaN(currentItem.totalPrice) &&
                currentItem.name.length > 0) {
                console.log('Item validation passed, adding to list');
                items.push({...currentItem});
                subtotal += currentItem.totalPrice;
            } else {
                console.warn('Item validation failed:', {
                    hasValidQuantity: !isNaN(currentItem.quantity),
                    hasValidUnitPrice: !isNaN(currentItem.unitPrice),
                    hasValidTotalPrice: !isNaN(currentItem.totalPrice),
                    hasValidName: currentItem.name.length > 0
                });
            }
        }
        // Reset current item
        currentItem = {
            name: null,
            quantity: null,
            unitPrice: null,
            totalPrice: null
        };
    }

    console.log('\nExtraction complete. Results:', {
        itemCount: items.length,
        subtotal: subtotal,
        items: JSON.stringify(items, null, 2)
    });
    
    return { items, subtotal };
}

function cleanItemName(name) {
    return name
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .replace(/[^\w\s()-]/g, '')  // Remove special characters except parentheses and hyphen
        .replace(/\s*\(\d+\)\s*$/, '')  // Remove trailing parenthetical numbers
        .trim();
}

function debugWhitespace(str) {
    return str.replace(/ /g, '·').replace(/\t/g, '→');
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