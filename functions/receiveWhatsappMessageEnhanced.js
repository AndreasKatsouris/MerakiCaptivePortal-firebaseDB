/**
 * Enhanced WhatsApp Message Handler with Multi-Location Routing
 * Version: 1.0.0-2025-07-17
 * 
 * Handles incoming WhatsApp messages with location-specific routing
 * Routes messages based on receiving WhatsApp number to appropriate location context
 */

const { 
    admin,
    auth,
    rtdb, 
    ref, 
    get, 
    set, 
    update, 
    push 
} = require('./config/firebase-admin');
require('dotenv').config();
const { client, twilioPhone } = require('./twilioClient');
const { processReceipt } = require('./receiptProcessor');
const { matchReceiptToCampaign } = require('./guardRail');
const { processReward } = require('./rewardsProcessor');
const { processMessage } = require('./menuLogic');
const { formatToSASTDateTime } = require('./utils/timezoneUtils');
const { 
    sendWhatsAppMessage, 
    sendWelcomeMessageTemplate,
    sendReceiptConfirmationTemplate 
} = require('./utils/whatsappClient');
const { markVoucherAsRedeemed, getVoucherDetails } = require('./voucherService');
const { 
    checkConsent, 
    handleConsentFlow, 
    isConsentMessage, 
    requiresConsent 
} = require('./consent/consent-handler');

// Import WhatsApp database schema functions
const {
    getLocationByWhatsApp,
    getWhatsAppByLocation,
    trackWhatsAppMessage,
    MESSAGE_TYPES
} = require('./utils/whatsappDatabaseSchema');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: "https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com",
    });
}

/**
 * Normalize phone number format by removing + prefix and whatsapp: prefix
 * @param {string} phoneNumber - Phone number to normalize  
 * @returns {string} Normalized phone number without + prefix
 */
function normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return '';
    // Only remove WhatsApp prefix, preserve + for international numbers
    let cleaned = phoneNumber.replace(/^whatsapp:/, '').trim();
    
    // Ensure + prefix for international numbers (South African numbers)
    if (/^27\d{9}$/.test(cleaned)) {
        // If it's a 27xxxxxxxxx number without +, add it
        cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+') && /^\d+$/.test(cleaned)) {
        // If it's all digits without +, assume it's South African
        cleaned = '+27' + cleaned.replace(/^0+/, ''); // Remove leading zeros
    }
    
    return cleaned;
}

/**
 * Normalize date format for consistent comparison
 * @param {string} dateString - Date string in various formats
 * @returns {string} Normalized date in YYYY-MM-DD format
 */
function normalizeDate(dateString) {
    if (!dateString) return '';
    
    try {
        // Handle DD/MM/YYYY format (e.g., "17/07/2025")
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
            const [day, month, year] = dateString.split('/');
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        // Handle YYYY-MM-DD format (already normalized)
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateString)) {
            const [year, month, day] = dateString.split('-');
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        // Handle other formats by attempting to parse
        const parsed = new Date(dateString);
        if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
        }
        
        console.warn(`⚠️ Unrecognized date format: ${dateString}`);
        return dateString; // Return as-is if can't normalize
    } catch (error) {
        console.error('Error normalizing date:', error);
        return dateString;
    }
}

/**
 * Log suspicious activity for admin review
 * @param {Object} activityData - Suspicious activity data
 */
async function logSuspiciousActivity(activityData) {
    try {
        const suspiciousRef = ref(rtdb, 'suspicious-activity');
        const newActivityRef = push(suspiciousRef);
        await set(newActivityRef, {
            ...activityData,
            id: newActivityRef.key,
            status: 'pending_review',
            reviewed: false
        });
        console.log('🚨 Suspicious activity logged:', newActivityRef.key);
    } catch (error) {
        console.error('❌ Error logging suspicious activity:', error);
    }
}

/**
 * Check if input looks like a command rather than a name
 * @param {string} text - Input text
 * @returns {boolean} Whether text appears to be a command
 */
function isCommand(text) {
    if (!text) return false;
    
    const trimmed = text.trim().toLowerCase();
    
    // Single word commands
    const commands = [
        'help', 'hi', 'hello', 'hey', 'start', 'menu', 'info',
        'points', 'rewards', 'balance', 'history', 'profile',
        'consent', 'privacy', 'yes', 'no', 'ok', 'okay'
    ];
    
    // Check for exact command matches
    if (commands.includes(trimmed)) return true;
    
    // Check for command patterns
    if (trimmed.startsWith('use reward')) return true;
    if (trimmed.includes('check') && trimmed.includes('points')) return true;
    if (trimmed.includes('view') && trimmed.includes('rewards')) return true;
    
    // Check for test patterns (like "TEST 1435")
    if (trimmed.match(/^test\s+\d+$/)) return true;
    
    // Check if it's all caps single word (likely a command)
    if (trimmed.match(/^[A-Z]+$/) && trimmed.length <= 10) return true;
    
    return false;
}

/**
 * Check if input looks like a valid name
 * @param {string} text - Input text
 * @returns {boolean} Whether text appears to be a name
 */
function isValidName(text) {
    if (!text) return false;
    
    const trimmed = text.trim();
    
    // Basic name validation
    return trimmed.length >= 2 && 
           trimmed.length <= 50 && 
           /^[a-zA-Z\s]+$/.test(trimmed) && 
           !isCommand(text);
}

/**
 * Determine location context from receiving WhatsApp number
 * @param {string} toNumber - WhatsApp number that received the message
 * @returns {Promise<Object|null>} Location context or null if not found
 */
async function getLocationContext(toNumber) {
    try {
        const receivingNumber = normalizePhoneNumber(toNumber);
        console.log(`🔍 Looking up location for receiving number: ${receivingNumber}`);
        console.log(`🔍 Original toNumber: ${toNumber}`);
        console.log(`🔍 Normalized receiving number: ${receivingNumber}`);
        
        // Debug: Let's see what's in the database first
        console.log(`🔍 DEBUG: Checking database for location mappings...`);
        const mappingRef = ref(rtdb, 'location-whatsapp-mapping');
        const mappingSnapshot = await get(mappingRef);
        
        if (mappingSnapshot.exists()) {
            const mappings = mappingSnapshot.val();
            console.log(`🔍 DEBUG: Found ${Object.keys(mappings).length} location mappings in database:`);
            Object.entries(mappings).forEach(([locationId, mapping]) => {
                console.log(`🔍 DEBUG: Location ${locationId}: ${mapping.phoneNumber} (active: ${mapping.isActive}) (locationName: ${mapping.locationName})`);
                console.log(`🔍 DEBUG: Comparison - Looking for: "${receivingNumber}" vs Found: "${mapping.phoneNumber}" (match: ${receivingNumber === mapping.phoneNumber})`);
            });
        } else {
            console.log(`❌ DEBUG: No location mappings found in database at all!`);
        }
        
        // Get location by WhatsApp number
        console.log(`🔍 DEBUG: Calling getLocationByWhatsApp with: ${receivingNumber}`);
        const locationData = await getLocationByWhatsApp(receivingNumber);
        console.log(`🔍 DEBUG: getLocationByWhatsApp returned:`, locationData);
        
        if (!locationData) {
            console.log(`⚠️ No location found for WhatsApp number: ${receivingNumber}`);
            console.log(`⚠️ DEBUG: This could be because:`);
            console.log(`⚠️ DEBUG: 1. No mapping exists for this number`);
            console.log(`⚠️ DEBUG: 2. The mapping is not active`);
            console.log(`⚠️ DEBUG: 3. Phone number format mismatch`);
            console.log(`⚠️ DEBUG: 4. Database query failed`);
            return null;
        }
        
        console.log(`✅ Found location context:`, {
            locationId: locationData.locationId,
            locationName: locationData.mapping.locationName,
            whatsappNumber: locationData.mapping.phoneNumber
        });
        console.log(`✅ DEBUG: Full location data:`, JSON.stringify(locationData, null, 2));
        
        return locationData;
        
    } catch (error) {
        console.error('❌ Error getting location context:', error);
        console.error('❌ DEBUG: Error details:', {
            message: error.message,
            stack: error.stack,
            toNumber: toNumber,
            receivingNumber: normalizePhoneNumber(toNumber)
        });
        return null;
    }
}

/**
 * Get default/platform WhatsApp number as fallback
 * @returns {string} Default WhatsApp number
 */
function getDefaultWhatsAppNumber() {
    // Use the platform's default Twilio phone number
    return twilioPhone;
}

/**
 * Check if location has WhatsApp number assigned
 * @param {string} locationId - Location ID to check
 * @returns {Promise<boolean>} True if location has WhatsApp number
 */
async function hasWhatsAppNumber(locationId) {
    try {
        const whatsappData = await getWhatsAppByLocation(locationId);
        return whatsappData !== null && whatsappData.mapping.isActive;
    } catch (error) {
        console.error('❌ Error checking WhatsApp number for location:', error);
        return false;
    }
}

/**
 * Send error message when location doesn't have WhatsApp configured
 * @param {string} phoneNumber - Phone number to send error to
 * @param {string} locationName - Location name
 */
async function sendLocationNotConfiguredError(phoneNumber, locationName) {
    const errorMessage = `⚠️ WhatsApp Not Configured\n\n` +
        `Hi! ${locationName || 'This location'} doesn't have WhatsApp messaging configured yet.\n\n` +
        `Please contact the restaurant directly or try again later.\n\n` +
        `🤖 This is an automated message from the MerakiCaptive Portal.`;
    
    try {
        await sendWhatsAppMessage(phoneNumber, errorMessage);
        console.log(`📧 Sent location not configured error to ${phoneNumber}`);
    } catch (error) {
        console.error('❌ Failed to send location not configured error:', error);
    }
}

/**
 * Validate incoming request from Twilio
 * @param {object} req - HTTP request object
 * @returns {string|null} Error message or null if valid
 */
function validateRequest(req) {
    const { Body, From, To } = req.body;
    
    if (!From) {
        console.error('Missing From field in request');
        return 'Missing From field';
    }
    
    if (!To) {
        console.error('Missing To field in request');
        return 'Missing To field';
    }
    
    // Body can be empty for media-only messages
    console.log('Request validation passed');
    return null;
}

/**
 * Get or create guest data with location context
 * @param {string} phoneNumber - Phone number
 * @param {string} locationId - Location ID for context
 * @returns {Promise<Object>} Guest data object
 */
async function getOrCreateGuestWithLocation(phoneNumber, locationId) {
    try {
        const guestRef = ref(rtdb, `guests/${phoneNumber}`);
        const snapshot = await get(guestRef);
        
        if (snapshot.exists()) {
            const guestData = snapshot.val();
            
            // Update location context if provided
            if (locationId && guestData.currentLocationId !== locationId) {
                await update(guestRef, {
                    currentLocationId: locationId,
                    lastLocationUpdate: admin.database.ServerValue.TIMESTAMP
                });
                guestData.currentLocationId = locationId;
            }
            
            return guestData;
        }
        
        // Create new guest with location context
        const newGuestData = {
            phoneNumber: phoneNumber,
            name: null, // Explicitly set to null to trigger name collection
            currentLocationId: locationId || null,
            createdAt: admin.database.ServerValue.TIMESTAMP,
            lastLocationUpdate: admin.database.ServerValue.TIMESTAMP,
            messageHistory: {},
            preferences: {
                language: 'en',
                notifications: true
            }
        };
        
        await set(guestRef, newGuestData);
        console.log(`👤 Created new guest with location context: ${phoneNumber} -> ${locationId}`);
        
        return newGuestData;
        
    } catch (error) {
        console.error('❌ Error getting/creating guest with location:', error);
        throw error;
    }
}

/**
 * Check receipt data for quality issues
 * @param {Object} receiptData - Receipt data to validate
 * @returns {Array} Array of issues found
 */
function checkReceiptDataIssues(receiptData) {
    const issues = [];

    if (!receiptData.brandName || receiptData.brandName === 'Unknown Brand') {
        issues.push("• The brand/restaurant name isn't clearly visible");
    }
    if (!receiptData.storeName || receiptData.storeName === 'Unknown Location') {
        issues.push("• The store location isn't visible");
    }
    if (!receiptData.date) {
        issues.push("• The receipt date isn't visible");
    }
    if (!receiptData.time) {
        issues.push("• The receipt time isn't visible");
    }
    if (!receiptData.totalAmount || receiptData.totalAmount === 0) {
        issues.push("• The total amount isn't clear");
    }
    if (!receiptData.items || receiptData.items.length === 0) {
        issues.push("• The list of purchased items isn't readable");
    }
    if (!receiptData.invoiceNumber) {
        issues.push("• The receipt/invoice number isn't visible");
    }

    return issues;
}

/**
 * Construct error message based on error type and location context
 * @param {Error} error - Error object
 * @param {Object} locationContext - Location context
 * @returns {string} Formatted error message
 */
function constructErrorMessage(error, locationContext) {
    const locationName = locationContext?.mapping?.locationName || 'the restaurant';
    
    // Network or system errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return `🤖 Oops! I'm having trouble connecting to my servers right now. Please give me a few minutes and try sending your receipt to ${locationName} again! 🔄`;
    }

    // Receipt processing errors
    if (error.message.includes('OCR') || error.message.includes('image')) {
        return `🤖 I'm having trouble reading your receipt from ${locationName} clearly. Let me help you get a better photo:\n\n` +
               `📸 Photo tips:\n` +
               `• Use good lighting with no glare\n` +
               `• Keep the receipt flat and not folded\n` +
               `• Include the entire receipt in the photo\n` +
               `• Make sure all text is clearly visible\n\n` +
               `Try again - I'm here to help you earn rewards at ${locationName}! 🎯`;
    }

    // Campaign validation errors
    if (error.message.includes('campaign') || error.message.includes('reward')) {
        return `🤖 I encountered a technical issue while checking your receipt from ${locationName}. Please try again, and if this keeps happening, let our support team know! 🛠️`;
    }

    // Default error message
    return `🤖 Something unexpected happened while processing your receipt from ${locationName}. Please try again in a moment! 🔄`;
}

/**
 * Construct detailed failure message based on validation results
 * @param {string} guestName - Guest's name
 * @param {Object} matchResult - Campaign matching result
 * @param {Object} receiptData - Processed receipt data
 * @param {Object} locationContext - Location context
 * @returns {string} Formatted failure message
 */
function constructFailureMessage(guestName, matchResult, receiptData, locationContext) {
    const locationName = locationContext?.mapping?.locationName || 'the restaurant';
    
    // Handle case where no campaigns are active
    if (matchResult.error === 'No active campaigns found') {
        return `🤖 Hi ${guestName}! I checked but there are no active campaigns running at ${locationName} right now. Don't worry - new campaigns start regularly, so please try again soon! 🎯`;
    }

    // Handle case where brand has no active campaigns
    if (matchResult.error === `No active campaigns found for ${receiptData.brandName}`) {
        return `🤖 Hi ${guestName}! I can see this is from ${receiptData.brandName}, but they don't have any active campaigns at the moment. Check out our other participating brands or try again later! 🏪`;
    }

    let message = `🤖 Hi ${guestName}! I've analyzed your receipt from ${locationName} but couldn't validate it for rewards this time.`;
    const issues = [];

    // Check receipt data quality issues
    const dataIssues = checkReceiptDataIssues(receiptData);
    if (dataIssues.length > 0) {
        issues.push('\n📸 Receipt clarity issues:', ...dataIssues);
    }

    // Add resolution steps
    let resolutionSteps = [];
    if (dataIssues.length > 0) {
        resolutionSteps.push(
            '\n💡 To help me read your receipt better:',
            '• Take the photo in good lighting',
            '• Make sure the receipt is flat and not folded',
            '• Include the entire receipt in the photo',
            '• Ensure all text is clearly visible'
        );
    }

    // Construct final message
    if (issues.length > 0) {
        message += '\n' + issues.join('\n');
    }
    if (resolutionSteps.length > 0) {
        message += '\n' + resolutionSteps.join('\n');
    }

    message += `\n\n🎉 Keep trying - I'm here to help you earn rewards at ${locationName}!`;

    return message;
}

/**
 * Check if receipt has already been processed to prevent duplicates
 * @param {object} receiptData - Receipt data
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<boolean>} True if duplicate found
 */
async function checkDuplicateReceipt(receiptData, phoneNumber) {
    try {
        if (!receiptData.invoiceNumber) {
            console.log('No invoice number found, cannot check for duplicates');
            return false;
        }
        
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        
        // Check existing receipts for this phone number and invoice
        const receiptsRef = ref(rtdb, 'receipts');
        console.log('Checking receipts collection for duplicates...');
        const snapshot = await get(receiptsRef);
        const allReceipts = snapshot.val() || {};
        
        console.log('Checking for duplicates among receipts:', Object.keys(allReceipts).length);
        
        // Enhanced duplicate detection: invoice + date + brand + store (regardless of phone)
        const duplicate = Object.entries(allReceipts).find(([firebaseId, receipt]) => {
            // Core duplicate criteria (phone-agnostic)
            const invoiceMatch = receipt.invoiceNumber === receiptData.invoiceNumber;
            
            const storedDateNormalized = normalizeDate(receipt.date);
            const currentDateNormalized = normalizeDate(receiptData.date);
            const dateMatch = storedDateNormalized === currentDateNormalized;
            
            // Brand and store matching for higher accuracy
            const brandMatch = receipt.brandName && receiptData.brandName && 
                              receipt.brandName.toLowerCase().trim() === receiptData.brandName.toLowerCase().trim();
            const storeMatch = receipt.storeName && receiptData.storeName && 
                              receipt.storeName.toLowerCase().trim() === receiptData.storeName.toLowerCase().trim();
            
            // Primary duplicate: All 4 criteria match
            const exactDuplicate = invoiceMatch && dateMatch && brandMatch && storeMatch;
            
            // Phone comparison for suspicious activity detection
            const storedPhoneNormalized = normalizePhoneNumber(receipt.guestPhoneNumber);
            const samePhone = storedPhoneNormalized === normalizedPhone;
            
            const matches = exactDuplicate;
            
            // Enhanced debugging for each comparison
            console.log(`🔍 Duplicate check for receipt ${firebaseId}:`, {
                storedPhone: receipt.guestPhoneNumber,
                storedPhoneNormalized: storedPhoneNormalized,
                currentPhone: normalizedPhone,
                samePhone: samePhone,
                storedInvoice: receipt.invoiceNumber,
                currentInvoice: receiptData.invoiceNumber,
                invoiceMatch: invoiceMatch,
                storedDate: receipt.date,
                storedDateNormalized: storedDateNormalized,
                currentDate: receiptData.date,
                currentDateNormalized: currentDateNormalized,
                dateMatch: dateMatch,
                storedBrand: receipt.brandName,
                currentBrand: receiptData.brandName,
                brandMatch: brandMatch,
                storedStore: receipt.storeName,
                currentStore: receiptData.storeName,
                storeMatch: storeMatch,
                exactDuplicate: exactDuplicate,
                overallMatch: matches
            });
            
            // Flag suspicious activity (same receipt, different phone)
            if (exactDuplicate && !samePhone) {
                console.warn(`🚨 SUSPICIOUS ACTIVITY: Same receipt from different phone numbers`, {
                    originalPhone: receipt.guestPhoneNumber,
                    newPhone: normalizedPhone,
                    invoiceNumber: receiptData.invoiceNumber,
                    date: receiptData.date,
                    brand: receiptData.brandName,
                    store: receiptData.storeName,
                    firebaseId: firebaseId
                });
                
                // Log to suspicious activity collection for admin review
                logSuspiciousActivity({
                    type: 'duplicate_receipt_different_phone',
                    originalReceiptId: firebaseId,
                    originalPhone: receipt.guestPhoneNumber,
                    attemptedPhone: normalizedPhone,
                    receiptData: {
                        invoiceNumber: receiptData.invoiceNumber,
                        date: receiptData.date,
                        brandName: receiptData.brandName,
                        storeName: receiptData.storeName
                    },
                    timestamp: new Date().toISOString()
                });
            }
            
            if (matches) {
                console.log('✅ DUPLICATE CONFIRMED:', {
                    firebaseId: firebaseId,
                    receiptId: receipt.id || receipt.receiptId,
                    invoiceNumber: receipt.invoiceNumber,
                    guestPhone: receipt.guestPhoneNumber,
                    date: receipt.date
                });
            }
            
            return matches;
        });
        
        if (duplicate) {
            const [firebaseId, duplicateReceipt] = duplicate;
            console.log('Duplicate receipt confirmed:', {
                firebaseId: firebaseId,
                receiptId: duplicateReceipt.id || duplicateReceipt.receiptId,
                invoiceNumber: receiptData.invoiceNumber,
                guestPhone: normalizedPhone
            });
            return true;
        }
        
        console.log('No duplicate found, processing can continue');
        return false;
    } catch (error) {
        console.error('Error checking for duplicate receipt:', error);
        // If we can't check, allow processing to continue
        return false;
    }
}

/**
 * Process receipt with location context
 * @param {string} imageUrl - Receipt image URL
 * @param {string} phoneNumber - Guest phone number
 * @param {Object} locationContext - Location context information
 * @param {Object} guestData - Guest data object
 * @returns {Promise<Object>} Processing result
 */
async function processReceiptWithLocationContext(imageUrl, phoneNumber, locationContext, guestData) {
    try {
        console.log(`📸 Processing receipt with location context: ${locationContext.mapping.locationName}`);
        
        // Step 1: Extract receipt data without saving yet
        console.log('Step 1: Starting receipt OCR and data extraction...');
        const { processReceiptWithoutSaving } = require('./receiptProcessor');
        const extractedData = await processReceiptWithoutSaving(imageUrl, phoneNumber);
        console.log('Step 1 completed: Receipt data extracted', {
            brandName: extractedData.brandName,
            totalAmount: extractedData.totalAmount,
            itemCount: extractedData.items?.length || 0,
            invoiceNumber: extractedData.invoiceNumber,
            date: extractedData.date,
            locationContext: locationContext.mapping.locationName
        });
        
        // Step 2: Check for duplicate receipt BEFORE saving
        console.log('Step 2: Checking for duplicate receipt...');
        const isDuplicate = await checkDuplicateReceipt(extractedData, phoneNumber);
        if (isDuplicate) {
            console.log('Duplicate receipt detected, skipping processing');
            const duplicateMessage = `🤖 I've already processed this receipt for you at ${locationContext.mapping.locationName}! Check "view rewards" to see your existing rewards. 😊`;
            
            const { sendWhatsAppMessage } = require('./utils/whatsappClient');
            await sendWhatsAppMessage(phoneNumber, duplicateMessage);
            
            return {
                success: false,
                message: duplicateMessage,
                reason: 'duplicate_receipt',
                data: extractedData
            };
        }
        
        // Step 3: Save receipt only after duplicate check passes
        console.log('Step 3: No duplicate found, saving receipt...');
        const { saveReceiptData } = require('./receiptProcessor');
        // Include guest name in extracted data so it's always saved
        extractedData.guestName = guestData.name;
        const receiptData = await saveReceiptData(extractedData, phoneNumber);
        console.log('Step 3 completed: Receipt saved successfully with ID:', receiptData.id);
        
        // Enhance the extracted data with location context
        if (receiptData && receiptData.id && receiptData.totalAmount) {
            // Add location information to the receipt data
            const locationEnhancedData = {
                ...receiptData,
                locationId: locationContext.locationId,
                locationName: locationContext.mapping.locationName,
                receivingWhatsAppNumber: locationContext.mapping.phoneNumber,
                processedAt: Date.now(),
                locationContext: {
                    id: locationContext.locationId,
                    name: locationContext.mapping.locationName,
                    whatsappNumber: locationContext.mapping.phoneNumber
                }
            };
            
            console.log(`📸 Enhanced receipt data with location: ${locationContext.mapping.locationName}`);
            
            // Continue with campaign matching and reward processing
            console.log('🎯 Starting campaign matching for receipt...');
            const { matchReceiptToCampaign } = require('./guardRail');
            const matchResult = await matchReceiptToCampaign(locationEnhancedData);
            console.log('📊 Campaign matching result:', matchResult);
            
            if (matchResult.isValid) {
                console.log('🎁 Processing rewards for matched campaign...');
                
                // Use existing guest data (already available from function parameter)
                
                // Prepare guest object with required properties for processReward
                const guestObject = {
                    phoneNumber: phoneNumber, // Use the original phoneNumber parameter
                    name: guestData.name || 'Guest'
                };
                
                const { processReward } = require('./rewardsProcessor');
                const rewardResult = await processReward(guestObject, matchResult.campaign, locationEnhancedData);
                console.log('💰 Reward processing result:', rewardResult);
                
                if (rewardResult.success) {
                    // Import the constructSuccessMessage function
                    const { constructSuccessMessage } = require('./receiveWhatsappMessage');
                    const guestName = guestData.name || guestData.firstName || 'Guest';
                    const successMessage = constructSuccessMessage(guestName, matchResult, rewardResult);
                    
                    // Send success message
                    const { sendWhatsAppMessage } = require('./utils/whatsappClient');
                    await sendWhatsAppMessage(phoneNumber, successMessage);
                    
                    return {
                        success: true,
                        message: successMessage,
                        data: locationEnhancedData,
                        rewards: rewardResult
                    };
                } else {
                    // Handle reward processing failure
                    const failureMessage = `Hi ${guestData.name}! Your receipt from ${locationContext.mapping.locationName} has been processed, but there was an issue with reward processing. Please contact support.`;
                    await sendWhatsAppMessage(phoneNumber, failureMessage);
                    
                    return {
                        success: false,
                        message: failureMessage,
                        data: locationEnhancedData
                    };
                }
            } else {
                // Handle campaign matching failure with detailed feedback
                const guestName = guestData.name || 'Guest';
                const failureMessage = constructFailureMessage(guestName, matchResult, locationEnhancedData, locationContext);
                
                const { sendWhatsAppMessage } = require('./utils/whatsappClient');
                await sendWhatsAppMessage(phoneNumber, failureMessage);
                
                return {
                    success: false,
                    message: failureMessage,
                    data: locationEnhancedData,
                    reason: 'campaign_no_match'
                };
            }
        }
        
        return extractedData;
        
    } catch (error) {
        console.error('❌ Error processing receipt with location context:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            phoneNumber: phoneNumber,
            locationId: locationContext?.locationId,
            locationName: locationContext?.mapping?.locationName
        });
        
        // Send location-aware error message to user
        const errorMessage = constructErrorMessage(error, locationContext);
        const { sendWhatsAppMessage } = require('./utils/whatsappClient');
        await sendWhatsAppMessage(phoneNumber, errorMessage);
        
        return {
            success: false,
            message: errorMessage,
            reason: 'processing_error',
            error: error.message
        };
    }
}

/**
 * Process message in location context
 * @param {Object} guestData - Guest data
 * @param {string} messageBody - Message body
 * @param {string} mediaUrl - Media URL if any
 * @param {Object} locationContext - Location context
 * @returns {Promise<Object>} Processing result
 */
async function processMessageInLocationContext(guestData, messageBody, mediaUrl, locationContext) {
    try {
        console.log(`🏢 Processing message in location context: ${locationContext.mapping.locationName}`);
        
        // Track the message in location context
        await trackWhatsAppMessage(
            locationContext.locationId,
            MESSAGE_TYPES.GENERAL,
            'inbound',
            {
                phoneNumber: guestData.phoneNumber,
                content: messageBody,
                hasMedia: !!mediaUrl,
                metadata: {
                    locationName: locationContext.mapping.locationName,
                    receivingNumber: locationContext.mapping.phoneNumber
                }
            }
        );
        
        // Add location context to guest data for processing
        const enhancedGuestData = {
            ...guestData,
            currentLocationId: locationContext.locationId,
            currentLocationName: locationContext.mapping.locationName,
            currentWhatsAppNumber: locationContext.mapping.phoneNumber
        };
        
        // Process the message with location context
        // Check if this is an image (receipt) upload
        if (mediaUrl && !messageBody.trim()) {
            console.log('📸 Processing image upload as receipt in location context...');
            
            // Process receipt with location context
            const receiptResult = await processReceiptWithLocationContext(
                mediaUrl,  // imageUrl parameter
                enhancedGuestData.phoneNumber,  // phoneNumber parameter
                locationContext,  // location context
                enhancedGuestData  // guest data
            );
            
            console.log('📸 Receipt processing result:', receiptResult);
            
            // Return receipt processing result (HTTP response handled by main function)
            if (receiptResult && receiptResult.success) {
                console.log('✅ Receipt processed successfully');
                return {
                    success: true,
                    message: receiptResult.message || 'Receipt processed successfully',
                    data: receiptResult
                };
            } else {
                console.log('❌ Receipt processing failed');
                return {
                    success: false,
                    message: receiptResult?.message || 'Receipt processing failed',
                    data: receiptResult
                };
            }
        }
        
        // This will use the existing message processing logic but with location awareness
        const result = await processMessage(
            messageBody,
            guestData.phoneNumber,
            locationContext
        );
        
        // Send the response message if processing was successful
        if (result.success && result.message) {
            await sendWhatsAppMessage(guestData.phoneNumber, result.message);
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ Error processing message in location context:', error);
        throw error;
    }
}

/**
 * Handle name collection in location context
 * @param {Object} guestData - Guest data
 * @param {string} messageBody - Message body
 * @param {string} mediaUrl - Media URL if any
 * @param {Object} locationContext - Location context
 * @param {Object} res - HTTP response object
 * @returns {Promise<void>}
 */
async function handleNameCollectionInLocationContext(guestData, messageBody, mediaUrl, locationContext, res) {
    try {
        console.log(`👤 Handling name collection in location: ${locationContext.mapping.locationName}`);
        
        // If there's media, ask for name first
        if (mediaUrl) {
            await sendWhatsAppMessage(
                guestData.phoneNumber,
                `🤖 Hi there! I'd love to help you with your receipt at ${locationContext.mapping.locationName}, but I'll need to know your full name first. Could you please share your name with me? 😊`
            );
            return res.status(200).send('Name required before receipt processing.');
        }
        
        if (!messageBody || messageBody.trim().length === 0) {
            const promptMessage = `👋 Welcome to ${locationContext.mapping.locationName}!\n\n` +
                `To get started, please tell me your name.`;
            
            await sendWhatsAppMessage(guestData.phoneNumber, promptMessage);
            return res.status(200).send('Name prompt sent');
        }
        
        const trimmedInput = messageBody.trim();
        
        // Check if input is a command instead of a name
        if (isCommand(trimmedInput)) {
            console.log(`Command detected during name collection: ${trimmedInput}`);
            
            // Handle help command specifically
            if (trimmedInput.toLowerCase() === 'help') {
                await sendWhatsAppMessage(
                    guestData.phoneNumber,
                    `🤖 Hi! Welcome to ${locationContext.mapping.locationName}. To get started, I'll need to know your full name first.\n\nOnce registered, you'll be able to:\n• Send receipt photos to earn rewards\n• Check your points balance\n• View available rewards\n\nCould you please share your full name with me? (e.g., "John Smith") 😊`
                );
                return res.status(200).send('Help provided during name collection.');
            }
            
            // For other commands, redirect to name collection
            await sendWhatsAppMessage(
                guestData.phoneNumber,
                `🤖 Hi! I'd love to help you with that at ${locationContext.mapping.locationName}, but I'll need to know your full name first. Could you please share your name with me? (e.g., "John Smith") 😊`
            );
            return res.status(200).send('Name required for command.');
        }
        
        // Check if input looks like a valid name
        if (isValidName(trimmedInput)) {
            // Clean and format the name properly
            const cleanedName = trimmedInput.toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            
            console.log(`Setting name for ${guestData.phoneNumber}: "${cleanedName}" in location ${locationContext.mapping.locationName}`);
            
            // Update guest with name and location context
            const guestRef = ref(rtdb, `guests/${guestData.phoneNumber}`);
            await update(guestRef, {
                name: cleanedName,
                nameCollectedAt: admin.database.ServerValue.TIMESTAMP,
                currentLocationId: locationContext.locationId,
                lastLocationUpdate: admin.database.ServerValue.TIMESTAMP,
                lastInteraction: admin.database.ServerValue.TIMESTAMP,
                consentPending: true,
                lastConsentPrompt: Date.now()
            });
        
            // Automatically start consent flow after name collection with location context
            const guestDataWithName = {
                ...guestData,
                name: cleanedName,
                phoneNumber: guestData.phoneNumber,
                consentPending: true,
                currentLocationId: locationContext.locationId
            };

            console.log(`Starting consent flow for ${cleanedName} at ${locationContext.mapping.locationName}`);
            const consentResult = await handleConsentFlow(guestDataWithName, 'consent');

            if (consentResult.shouldMessage) {
                // Send location-aware consent message
                const locationConsentMessage = consentResult.message + 
                    `\n\n📍 This consent applies to your interaction with ${locationContext.mapping.locationName}.`;
                await sendWhatsAppMessage(guestData.phoneNumber, locationConsentMessage);
            }
        
            // Track consent prompt instead of welcome message
            await trackWhatsAppMessage(
                locationContext.locationId,
                MESSAGE_TYPES.CONSENT_PROMPT,
                'outbound',
                {
                    phoneNumber: guestData.phoneNumber,
                    content: consentResult.message,
                    metadata: {
                        guestName: cleanedName,
                        locationName: locationContext.mapping.locationName,
                        isNewUser: true,
                        consentFlowStarted: true
                    }
                }
            );
        
            console.log(`✅ Name collection completed for ${cleanedName} at ${locationContext.mapping.locationName}, consent flow started`);
            return res.status(200).send('Name collection completed, consent flow started');
        } else {
            // Input doesn't look like a valid name
            await sendWhatsAppMessage(
                guestData.phoneNumber,
                `🤖 I need a valid name with just letters and spaces (e.g., "John Smith"). Could you try again without numbers or special characters? 😊`
            );
            return res.status(200).send('Invalid name format.');
        }
        
    } catch (error) {
        console.error('❌ Error handling name collection in location context:', error);
        return res.status(500).send('Error processing name collection');
    }
}

/**
 * Handle incoming WhatsApp messages with multi-location routing
 * @param {object} req - HTTP request object
 * @param {object} res - HTTP response object 
 */
async function receiveWhatsAppMessageEnhanced(req, res) {
    console.log('🚀 Processing WhatsApp message with multi-location routing...');
    console.log('Request method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Received payload:', JSON.stringify(req.body, null, 2));
    
    // Only accept POST requests from Twilio
    if (req.method !== 'POST') {
        console.error('❌ Invalid request method:', req.method);
        return res.status(405).send('Method not allowed. Please use POST.');
    }
    
    // Immediate safety catch for any initialization issues
    if (!rtdb) {
        console.error('❌ CRITICAL: Firebase Realtime Database not initialized!');
        return res.status(500).send('Database initialization error');
    }
    
    if (!ref) {
        console.error('❌ CRITICAL: Firebase ref function not available!');
        return res.status(500).send('Database ref function error');
    }

    try {
        console.log('🔍 Step 1: Validating request...');
        // Validate request
        const validationError = validateRequest(req);
        if (validationError) {
            console.error('❌ Request validation failed:', validationError);
            return res.status(400).send(validationError);
        }
        console.log('✅ Step 1: Request validation passed');

        console.log('🔍 Step 2: Extracting request data...');
        const { Body, From, To, MediaUrl0 } = req.body;
        console.log('✅ Step 2: Request data extracted:', { Body, From, To, MediaUrl0 });
        console.log('🔍 Step 3: Normalizing phone numbers...');
        const fromNumber = normalizePhoneNumber(From);
        const toNumber = normalizePhoneNumber(To);
        console.log('✅ Step 3: Phone numbers normalized:', { fromNumber, toNumber });
        
        console.log(`📱 Message from ${fromNumber} to ${toNumber}`);
        
        // Debug: Check current database state
        console.log('🔍 Step 4: Checking location mappings in database...');
        const mappingRef = ref(rtdb, 'location-whatsapp-mapping');
        const mappingSnapshot = await get(mappingRef);
        console.log('✅ Step 4: Database query completed');
        if (mappingSnapshot.exists()) {
            const mappings = mappingSnapshot.val();
            console.log('📋 Available location mappings:');
            Object.entries(mappings).forEach(([locationId, mapping]) => {
                console.log(`  📍 Location ${locationId}: ${mapping.phoneNumber} (active: ${mapping.isActive})`);
            });
        } else {
            console.log('❌ No location mappings found in database!');
        }

        // Get location context from receiving WhatsApp number
        console.log('🔍 Step 5: Getting location context...');
        const locationContext = await getLocationContext(toNumber);
        console.log('✅ Step 5: Location context query completed');
        
        if (!locationContext) {
            console.log(`⚠️ No location context found for ${toNumber}`);
            console.log('🔧 TEMPORARY FIX: Processing without location context using enhanced handler');
            
            // Instead of falling back, process with default location context
            const defaultLocationContext = {
                locationId: 'default-location',
                mapping: {
                    locationName: 'Default Location',
                    phoneNumber: toNumber,
                    isActive: true
                }
            };
            
            console.log('📍 Using default location context for processing');
            
            // Get or create guest data without location context
            const guestData = await getOrCreateGuestWithLocation(fromNumber, 'default-location');
            console.log('👤 Guest data created with default location:', {
                name: guestData.name,
                phoneNumber: guestData.phoneNumber,
                locationId: 'default-location'
            });
            
            // Process message with default location context
            const result = await processMessageInLocationContext(
                guestData, 
                Body, 
                MediaUrl0, 
                defaultLocationContext
            );
            
            console.log('✅ Message processed with default location context');
            return res.status(200).send(result.message || 'Message processed successfully');
        }
        
        // Get or create guest data with location context
        const guestData = await getOrCreateGuestWithLocation(fromNumber, locationContext.locationId);
        console.log('👤 Guest data with location context:', {
            phoneNumber: guestData.phoneNumber,
            name: guestData.name,
            currentLocationId: guestData.currentLocationId,
            locationName: locationContext.mapping.locationName
        });

        // Check consent status first
        const consentStatus = await checkConsent(guestData);
        console.log('📋 Consent status:', { hasConsent: consentStatus.hasConsent, requiresConsent: consentStatus.requiresConsent });
        
        // Handle consent flow if needed - check for both consent commands AND if user is in consent flow
        if (isConsentMessage(Body) || (guestData.consentPending && Body && ['yes', 'no', 'y', 'n', 'agree', 'accept', 'decline', 'reject'].includes(Body.toLowerCase().trim()))) {
            console.log('✅ Processing consent message or response');
            const consentResult = await handleConsentFlow(guestData, Body);
            
            // Send acknowledgment message if consent handler provides one
            if (consentResult.shouldMessage && consentResult.message) {
                await sendWhatsAppMessage(guestData.phoneNumber, consentResult.message);
                console.log('✅ Consent acknowledgment sent:', consentResult.message);
            }
            
            if (consentResult.requiresResponse) {
                return res.status(200).send('Consent flow handled');
            }
            
            if (!consentResult.hasConsent && !consentResult.consentGranted) {
                return res.status(200).send('Consent not granted');
            }
            
            // If consent was granted, continue to process original command or show success
            if (consentResult.consentGranted) {
                console.log('✅ Consent granted, user can now use full features');
                return res.status(200).send('Consent granted successfully');
            }
            
            console.log('✅ Consent processing completed, continuing with message processing');
        } else if (requiresConsent(Body) && !consentStatus.hasConsent) {
            console.log('📋 Command requires consent but user has not consented');
            const consentMessage = `📋 Privacy Notice\n\n` +
                `Welcome to ${locationContext.mapping.locationName}!\n\n` +
                `To provide you with rewards and personalized service, I need your consent to process your messages and data.\n\n` +
                `Reply "YES" to consent or "NO" to decline.`;
            
            await sendWhatsAppMessage(guestData.phoneNumber, consentMessage);
            return res.status(200).send('Consent request sent');
        }

        // Handle different message types based on guest state
        // Check if guest needs name collection (handle missing, null, or invalid names)
        if (!guestData.name || guestData.name === 'N/A' || guestData.name === '') {
            console.log('👤 Guest has no name, handling name collection in location context');
            return await handleNameCollectionInLocationContext(guestData, Body, MediaUrl0, locationContext, res);
        }
        
        // Check if existing user requires consent before processing any messages
        if (!consentStatus.hasConsent && guestData.name) {
            console.log('📋 Existing user requires consent - triggering consent flow');
            
            // Set consent pending flag for existing user
            const guestRef = ref(rtdb, `guests/${guestData.phoneNumber}`);
            await update(guestRef, {
                consentPending: true,
                lastConsentPrompt: Date.now(),
                lastInteraction: admin.database.ServerValue.TIMESTAMP
            });

            // Trigger consent flow for existing user
            const consentResult = await handleConsentFlow(guestData, 'consent');
            
            if (consentResult.shouldMessage) {
                // Send location-aware consent message for existing user
                const locationConsentMessage = consentResult.message + 
                    `\n\n📍 This consent applies to your continued interaction with ${locationContext.mapping.locationName}.`;
                await sendWhatsAppMessage(guestData.phoneNumber, locationConsentMessage);
                
                // Track consent prompt for existing user
                await trackWhatsAppMessage(
                    locationContext.locationId,
                    MESSAGE_TYPES.CONSENT_PROMPT,
                    'outbound',
                    {
                        phoneNumber: guestData.phoneNumber,
                        content: consentResult.message,
                        metadata: {
                            guestName: guestData.name,
                            locationName: locationContext.mapping.locationName,
                            isExistingUser: true,
                            consentFlowTriggered: true
                        }
                    }
                );
                
                console.log(`✅ Consent flow triggered for existing user ${guestData.name} at ${locationContext.mapping.locationName}`);
                return res.status(200).send('Consent prompt sent to existing user');
            }
        }
        
        console.log(`✅ Processing message from ${guestData.name} at ${locationContext.mapping.locationName}`);
        
        // Process the message in location context
        const result = await processMessageInLocationContext(guestData, Body, MediaUrl0, locationContext);
        
        if (result.success) {
            console.log('✅ Message processed successfully in location context');
            return res.status(200).send('Message processed successfully');
        } else {
            console.log('⚠️ Message processing had issues:', result.message);
            return res.status(200).send(result.message || 'Message processed with issues');
        }
        
    } catch (error) {
        console.error('❌ Error processing WhatsApp message:', error);
        
        // Send error message to user
        if (req.body.From) {
            const fromNumber = normalizePhoneNumber(req.body.From);
            const errorMessage = `⚠️ Service Temporarily Unavailable\n\n` +
                `We're experiencing technical difficulties. Please try again later or contact the restaurant directly.\n\n` +
                `🤖 This is an automated message.`;
            
            try {
                await sendWhatsAppMessage(fromNumber, errorMessage);
            } catch (sendError) {
                console.error('❌ Failed to send error message:', sendError);
            }
        }
        
        return res.status(500).send('Internal server error');
    }
}

module.exports = {
    receiveWhatsAppMessageEnhanced,
    getLocationContext,
    hasWhatsAppNumber,
    normalizePhoneNumber,
    getOrCreateGuestWithLocation,
    processMessageInLocationContext
};