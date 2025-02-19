const vision = require('@google-cloud/vision');
const { 
    rtdb, 
    ref, 
    get, 
    set, 
    push, 
    storage,
    bucket 
} = require('./config/firebase-admin');

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

        // Validate receipt date
        if (receiptData.date && !validateReceiptDate(receiptData.date)) {
            throw new Error(
                'This receipt is not from the current month. Please submit receipts within the same month of purchase.'
            );
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
                if (currentItem.name && currentItem.unitPrice) {
                    // If no quantity specified, assume 1
                    if (!currentItem.quantity) {
                        currentItem.quantity = 1;
                    }
                    saveCurrentItem();
                }
                // Start new item
                currentItem = {
                    name: cleanItemName(line),
                    quantity: null,
                    unitPrice: null,
                    totalPrice: null
                };
                
                // Check next line for price
                if (i < lines.length - 1) {
                    const nextLine = lines[i + 1].trim();
                    if (/^\d+\.\d{2}$/.test(nextLine)) {
                        currentItem.unitPrice = parseFloat(nextLine);
                        i++; // Skip the price line since we've handled it
                        
                        // Check if there's a second price (total)
                        if (i < lines.length - 1) {
                            const totalLine = lines[i + 1].trim();
                            if (/^\d+\.\d{2}$/.test(totalLine)) {
                                currentItem.totalPrice = parseFloat(totalLine);
                                i++; // Skip the total line
                            }
                        }
                        
                        // If we found a price, assume quantity 1 and save
                        currentItem.quantity = 1;
                        saveCurrentItem();
                    } else if (nextLine.toLowerCase() === 'n/c') {
                        // Handle no-charge items
                        currentItem.quantity = 1;
                        currentItem.unitPrice = 0;
                        currentItem.totalPrice = 0;
                        i++; // Skip the n/c line
                        saveCurrentItem();
                    }
                }
            }
        }
    }

    function saveCurrentItem() {
        console.log('Saving current item:', currentItem);
        if (!isNaN(currentItem.quantity) && 
            !isNaN(currentItem.unitPrice) && 
            (currentItem.totalPrice === 0 || !isNaN(currentItem.totalPrice)) &&  // Allow 0 for n/c items
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

    //====================================  DATE & TIME  =============================
    console.log('=== RECEIPT DETAILS EXTRACTION ===');
    console.log('Full Receipt Text (START):\n', fullText);
    console.log('Full Receipt Text Length:', fullText.length);
        // Logging helper function
        function logMatch(name, regex, text) {
            const match = text.match(regex);
            console.log(`${name} Regex:`, regex);
            console.log(`${name} Match:`, match);
            return match;
        }    

        const extractionStrategies = [
            // Strategy 1: Specific Pilot POS style integrated date and time
            () => {
                const timeRegex = /TIME\s*(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2})\s*TO\s*(\d{2}:\d{2})/i;
                const timeMatch = fullText.match(timeRegex);
                
                if (timeMatch) {
                    console.log('Pilot Receipt Integrated Date/Time Strategy Matched');
                    return {
                        date: timeMatch[1],
                        time: timeMatch[2],
                        endTime: timeMatch[3]
                    };
                }
                return null;
            },
    
            // Strategy 2: Separate Date field
            () => {
                const dateRegex = /DATE\s*:\s*(\d{2}\/\d{2}\/\d{4})/i;
                const timeRegex = /TIME\s*:\s*(\d{2}:\d{2})(?:\s*TO\s*(\d{2}:\d{2}))?/i;
                
                const dateMatch = fullText.match(dateRegex);
                const timeMatch = fullText.match(timeRegex);
                
                if (dateMatch || timeMatch) {
                    console.log('Separate Date/Time Strategy Matched');
                    return {
                        date: dateMatch ? dateMatch[1] : null,
                        time: timeMatch ? timeMatch[1] : null,
                        endTime: timeMatch && timeMatch[2] ? timeMatch[2] : null
                    };
                }
                return null;
            }
        ];
    
        // Try each extraction strategy
        for (const strategy of extractionStrategies) {
            const result = strategy();
            if (result) {
                details.date = result.date || details.date;
                details.time = result.time || details.time;
                details.endTime = result.endTime || details.endTime;
                break;
            }
        }


    //====================================  END =============================    
    // Extract invoice number
    const invoiceMatch = fullText.match(/(?:PRO-FORMA\s+)?INVOICE:?\s*#?\s*(\d+)/i) ||
                        fullText.match(/RECEIPT\s*#?\s*(\d+)/i) ||
                        fullText.match(/PRO-FORMA INVOICE:\s*(\d+)/i);
    details.invoiceNumber = invoiceMatch ? invoiceMatch[1] : null;



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
    
    // Final logging of extracted details
    console.log('=== EXTRACTED DETAILS ===');
    console.log(JSON.stringify(details, null, 2));
    console.log('=== END OF EXTRACTION ===');
    return details;
}

/**
 * Fetch active brands from Firebase
 * @returns {Promise<Set>} - Set of active brand names
 */
async function fetchActiveBrands() {
    try {
        const campaignsRef = ref(rtdb, '/campaigns');
        const snapshot = await get(campaignsRef);
        const campaigns = snapshot.val();
        
        if (!campaigns) {
            console.log('No active campaigns found');
            return new Set();
        }

        // Extract unique brand names from campaigns
        const brands = new Set();
        Object.values(campaigns).forEach(campaign => {
            if (campaign?.brand && typeof campaign.brand === 'string') {
                brands.add(campaign.brand.toLowerCase().trim());
            }
        });

        console.log('Fetched active brands:', Array.from(brands));
        return brands;
    } catch (error) {
        console.error('Error fetching active brands:', error);
        throw new Error('Failed to fetch active brands');
    }
}

/**
 * Save receipt data to Firebase
 * @param {object} receiptData - Processed receipt data
 * @returns {Promise<object>} - Saved receipt data with ID
 */
async function saveReceiptData(receiptData) {
    try {
        // Create a unique ID using invoice number if available
        const receiptId = receiptData.invoiceNumber || push(ref(rtdb, 'receipts')).key;
        
        // Save to Firebase
        await set(ref(rtdb, `receipts/${receiptId}`), {
            ...receiptData,
            createdAt: Date.now()
        });
        
        // Create guest receipt index
        await set(ref(rtdb, `guest-receipts/${receiptData.guestPhoneNumber}/${receiptId}`), true);

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

/**
 * Validates if receipt date is within the current month
 * @param {string} receiptDate - Date from receipt (format: MM/DD/YYYY or DD/MM/YYYY)
 * @returns {boolean} - True if date is valid and within current month
 */
function validateReceiptDate(receiptDate) {
    try {
        const [part1, part2, year] = receiptDate.split('/').map(Number);
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1; // 1-based month
        const currentYear = currentDate.getFullYear();

        console.log('Date validation input:', {
            receiptDate,
            part1,
            part2,
            year,
            currentMonth,
            currentYear
        });

        // Check if parts could be valid months (1-12)
        const couldBeMonth = part1 >= 1 && part1 <= 12;
        const part2CouldBeMonth = part2 >= 1 && part2 <= 12;

        // If current month matches either possible month interpretation,
        // prioritize that interpretation
        if (currentMonth === part1 && couldBeMonth) {
            // Interpret as MM/DD/YYYY
            console.log('Interpreting as MM/DD/YYYY (current month matches first part)');
            return year === currentYear;
        }

        if (currentMonth === part2 && part2CouldBeMonth) {
            // Interpret as DD/MM/YYYY
            console.log('Interpreting as DD/MM/YYYY (current month matches second part)');
            return year === currentYear;
        }

        // If no interpretation matches current month, reject
        console.log('Date not in current month:', {
            interpretedAsMMDD: { month: part1, day: part2 },
            interpretedAsDDMM: { month: part2, day: part1 },
            currentMonth
        });
        return false;

    } catch (error) {
        console.error('Date validation error:', {
            error: error.message,
            receiptDate
        });
        return false;
    }
}

module.exports = {
    processReceipt,
    testReceiptProcessing
};