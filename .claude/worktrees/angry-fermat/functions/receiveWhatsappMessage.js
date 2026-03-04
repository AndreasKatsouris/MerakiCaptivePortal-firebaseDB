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
 * Handle incoming WhatsApp messages
 * @param {object} req - HTTP request object
 * @param {object} res - HTTP response object 
 */
async function receiveWhatsAppMessage(req, res) {
    console.log('Processing WhatsApp message...');
    console.log('Request method:', req.method);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Received payload:', JSON.stringify(req.body, null, 2));
    
    // Only accept POST requests from Twilio
    if (req.method !== 'POST') {
        console.error('Invalid request method:', req.method);
        return res.status(405).send('Method not allowed. Please use POST.');
    }

    try {
        const validationError = validateRequest(req);
        if (validationError) {
            return res.status(400).send(validationError);
        }

        const { Body, From, MediaUrl0 } = req.body;
        const phoneNumber = normalizePhoneNumber(From);
        console.log(`Processing message from ${phoneNumber}`);

        // Get or initialize guest data
        const guestData = await getOrCreateGuest(phoneNumber);
        console.log('Complete guest data:', JSON.stringify(guestData, null, 2));

        // Handle different message types - but check if guest has a valid name
        if (!guestData.name || guestData.name === 'N/A' || guestData.name === '') {
            console.log('Guest has no valid name, handling name collection');
            return await handleNameCollection(guestData, Body, MediaUrl0, res);
        }
        
        console.log('Guest has name:', guestData.name);
        //=============================================================
        // Check consent status
        console.log('Checking consent status for guest:', guestData.phoneNumber);
        const consentStatus = await checkConsent(guestData);
        console.log('Consent status:', JSON.stringify(consentStatus, null, 2));
        console.log('Message body:', Body);
        console.log('Is consent message?', isConsentMessage(Body));
        
        // Check if existing user requires consent before processing any messages
        if (!consentStatus.hasConsent && guestData.name) {
            console.log('📋 Existing user requires consent - triggering consent flow');
            
            // Set consent pending flag for existing user
            await update(ref(rtdb, `guests/${guestData.phoneNumber}`), {
                consentPending: true,
                lastConsentPrompt: Date.now(),
                updatedAt: Date.now()
            });

            // Trigger consent flow for existing user
            const consentResult = await handleConsentFlow(guestData, 'consent');
            
            if (consentResult.shouldMessage) {
                await sendWhatsAppMessage(guestData.phoneNumber, consentResult.message);
                console.log(`✅ Consent flow triggered for existing user ${guestData.name}`);
                return res.status(200).send('Consent prompt sent to existing user');
            }
        }
        
        // Handle consent flow - check responses FIRST before starting new flow
        console.log('Consent pending flag:', guestData.consentPending);
        
        // PRIORITY 1: Check if user is responding to consent while in flow
        if (guestData.consentPending === true && Body) {
            const response = Body.toLowerCase().trim();
            console.log('User in consent flow, processing response:', response);
            
            // Handle yes/no responses specifically
            if (response.match(/^(yes|y|agree|accept|ok|okay)$/)) {
                console.log('User accepted consent');
                const consentResult = await handleConsentFlow(guestData, Body);
                console.log('Consent acceptance result:', JSON.stringify(consentResult, null, 2));
                
                if (consentResult.shouldMessage) {
                    await sendWhatsAppMessage(phoneNumber, consentResult.message);
                }
                
                // If consent was granted, refresh guest data to see updated state
                if (consentResult.consentGranted) {
                    console.log('Consent granted, waiting for database sync before refresh...');
                    await new Promise(resolve => setTimeout(resolve, 200)); // Extra delay for propagation
                    
                    console.log('Refreshing guest data...');
                    const refreshedGuestData = await getOrCreateGuest(phoneNumber);
                    console.log('Refreshed guest data:', JSON.stringify(refreshedGuestData, null, 2));
                    
                    // Also do a direct database read to verify what's actually stored
                    console.log('Direct database verification...');
                    const normalizedPhone = normalizePhoneNumber(phoneNumber);
                    const directSnapshot = await get(ref(rtdb, `guests/${normalizedPhone}`));
                    const directData = directSnapshot.val();
                    console.log('Direct database read result:', JSON.stringify(directData, null, 2));
                    
                    // Check specifically for consent data
                    if (directData && directData.consent) {
                        console.log('✅ Consent data found in database:', JSON.stringify(directData.consent, null, 2));
                    } else {
                        console.log('❌ No consent data found in database');
                    }
                    
                    if (directData && directData.consentPending) {
                        console.log('❌ WARNING: consentPending is still true in database!');
                    } else {
                        console.log('✅ consentPending is properly cleared in database');
                    }
                    
                    // After consent is granted, show personalized welcome with available features
                    const guestName = refreshedGuestData.name || 'there';
                    await sendWhatsAppMessage(
                        phoneNumber,
                        `🤖 Perfect, ${guestName}! You're all set up now! 🎉\n\n` +
                        `${getHelpMessage()}\n\n` +
                        `I'm excited to help you earn rewards! 😊`
                    );
                }
                
                return res.status(200).send('Consent accepted');
            } else if (response.match(/^(no|n|disagree|decline|reject)$/)) {
                console.log('User declined consent');
                const consentResult = await handleConsentFlow(guestData, Body);
                console.log('Consent decline result:', JSON.stringify(consentResult, null, 2));
                
                if (consentResult.shouldMessage) {
                    await sendWhatsAppMessage(phoneNumber, consentResult.message);
                }
                
                // Refresh guest data to see updated state
                console.log('Consent declined, waiting for database sync before refresh...');
                await new Promise(resolve => setTimeout(resolve, 200)); // Extra delay for propagation
                console.log('Refreshing guest data...');
                const refreshedGuestData = await getOrCreateGuest(phoneNumber);
                console.log('Refreshed guest data:', JSON.stringify(refreshedGuestData, null, 2));
                
                return res.status(200).send('Consent declined');
            } else {
                // User sent something else while in consent flow - ask again
                console.log('Invalid consent response, prompting again');
                await sendWhatsAppMessage(phoneNumber, 
                    '🤖 I need a clear answer to proceed. Could you please reply with "YES" to accept or "NO" to decline data collection for rewards functionality? 😊'
                );
                return res.status(200).send('Invalid consent response');
            }
        }
        
        // PRIORITY 2: Check if consent is required and user is not in consent flow
        // Also handle consent responses when user is in consent flow
        if (consentStatus.requiresConsent || isConsentMessage(Body) || (guestData.consentPending && Body && ['yes', 'no', 'y', 'n', 'agree', 'accept', 'decline', 'reject'].includes(Body.toLowerCase().trim()))) {
            console.log('Starting consent flow - requiresConsent:', consentStatus.requiresConsent, 'isConsentMessage:', isConsentMessage(Body), 'consentResponse:', (guestData.consentPending && Body && ['yes', 'no', 'y', 'n', 'agree', 'accept', 'decline', 'reject'].includes(Body.toLowerCase().trim())));
            
            // Ensure consent pending flag is set BEFORE calling consent flow
            if (!guestData.consentPending) {
                console.log('Setting consent pending flag manually');
                const normalizedPhone = normalizePhoneNumber(phoneNumber);
                await update(ref(rtdb, `guests/${normalizedPhone}`), {
                    consentPending: true,
                    lastConsentPrompt: Date.now()
                });
            }
            
            const consentResult = await handleConsentFlow(guestData, Body);
            console.log('Consent flow result:', JSON.stringify(consentResult, null, 2));
            
            // Send acknowledgment message if consent handler provides one
            if (consentResult.shouldMessage && consentResult.message) {
                await sendWhatsAppMessage(phoneNumber, consentResult.message);
                console.log('✅ Consent acknowledgment sent:', consentResult.message);
            }
            
            // If consent was granted, acknowledge and continue
            if (consentResult.consentGranted) {
                console.log('✅ Consent granted, user can now use full features');
                return res.status(200).send('Consent granted successfully');
            }
            
            return res.status(consentResult.success ? 200 : 400)
                     .send(consentResult.success ? 'Consent flow handled' : 'Consent flow error');
        }
        
        console.log('Consent not required, proceeding to command processing');           

        if (MediaUrl0) {
            console.log('Image received from WhatsApp:', {
                mediaUrl: MediaUrl0,
                phoneNumber,
                hasConsent: consentStatus.hasConsent
            });
            
            // Check consent for receipt processing
            if (!consentStatus.hasConsent) {
                console.log('User tried to send receipt without consent');
                await sendWhatsAppMessage(phoneNumber, 
                    '🤖 I\'d love to help you with your receipt! To process receipts and earn rewards, I need your consent first. ' +
                    'Reply "consent" to review and accept our privacy policy. 😊'
                );
                return res.status(200).send('Consent required');
            }
            
            console.log('Starting receipt processing for image:', MediaUrl0);
            return await handleReceiptProcessing(guestData, MediaUrl0, res);
        }
        if (Body) {
            console.log('Processing text command:', Body);
            console.log('Requires consent?', requiresConsent(Body));
            console.log('Has consent?', consentStatus.hasConsent);
            
            // Check if command requires consent
            if (requiresConsent(Body) && !consentStatus.hasConsent) {
                console.log('Command requires consent but user has not consented');
                await sendWhatsAppMessage(phoneNumber, 
                    '🤖 I\'d love to help you with that! This feature requires your consent first. ' +
                    'Reply "consent" to review our privacy policy and enable all features. 😊'
                );
                return res.status(200).send('Consent required for command');
            }
            
            console.log('Processing command through processMessage');
            const result = await processMessage(Body, guestData.phoneNumber, null);
            console.log('Command processing result:', {
                success: result.success,
                hasMessage: !!result.message,
                messageLength: result.message?.length || 0
            });
            await sendWhatsAppMessage(guestData.phoneNumber, result.message);
            return res.status(result.success ? 200 : 400).send(result.message);
        }

        return await handleInvalidInput(guestData, res);

    } catch (error) {
        return await handleError(error, req.body.From, res);
    }
}

/**
 * Validate incoming request
 * @param {object} req - Request object
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateRequest(req) {
    if (!req.body || typeof req.body !== 'object') {
        console.error('Invalid request payload:', req.body);
        return 'Invalid request payload.';
    }

    if (!req.body.From || !req.body.From.startsWith('whatsapp:')) {
        console.error('Invalid sender information:', req.body.From);
        return 'Invalid sender information.';
    }

    return null;
}

/**
 * Get or create guest record with race condition protection
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<object>} Guest data
 */
async function getOrCreateGuest(phoneNumber) {
    // Strip 'whatsapp:' prefix for database storage
    const cleanPhone = normalizePhoneNumber(phoneNumber);
    console.log('Getting/creating guest record for:', cleanPhone);
    
    const guestRef = ref(rtdb, `guests/${cleanPhone}`);
    console.log('Database path:', `guests/${cleanPhone}`);
    
    // Add retry mechanism for race conditions
    let guestData = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
        try {
            const guestSnapshot = await get(guestRef);
            guestData = guestSnapshot.val();
            
            if (!guestData) {
                // No existing data - create new guest with atomic operation
                const newGuestData = { 
                    phoneNumber: cleanPhone, 
                    createdAt: Date.now(),
                    name: null, // Explicitly set to null instead of undefined
                    // Add processing flag to prevent concurrent creation
                    processing: true
                };
                
                // Use set with conditional check to prevent race condition
                await set(guestRef, newGuestData);
                console.log(`New guest added: ${cleanPhone}`);
                
                // Remove processing flag
                await update(guestRef, { processing: false });
                guestData = newGuestData;
                guestData.processing = false;
                
                break;
            } else if (!guestData.phoneNumber) {
                // Existing data but corrupted/missing phoneNumber - repair it
                console.log('Repairing corrupted guest data:', guestData);
                const repairedData = {
                    phoneNumber: cleanPhone,
                    createdAt: guestData.createdAt || Date.now(),
                    // Preserve any existing valid fields
                    ...(guestData.name && { name: guestData.name }),
                    ...(guestData.consent && { consent: guestData.consent }),
                    ...(guestData.consentPending !== undefined && { consentPending: guestData.consentPending }),
                    // Add updatedAt timestamp to track the repair
                    updatedAt: Date.now(),
                    dataRepaired: true
                };
                await set(guestRef, repairedData);
                guestData = repairedData;
                console.log(`Guest data repaired for: ${cleanPhone}`);
                break;
            } else {
                // Valid existing data
                console.log(`Returning guest: ${guestData.name || 'Guest'}`);
                break;
            }
        } catch (error) {
            console.error(`Error in getOrCreateGuest (attempt ${retryCount + 1}):`, error);
            retryCount++;
            
            if (retryCount < maxRetries) {
                // Wait before retry with exponential backoff
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retryCount)));
            } else {
                throw error;
            }
        }
    }

    return guestData;
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
 * Handle name collection for new guests
 * @param {object} guestData - Guest data
 * @param {string} body - Message body
 * @param {string} mediaUrl - Media URL if any
 * @param {object} res - Response object
 */
async function handleNameCollection(guestData, body, mediaUrl, res) {
    try {
        if (!guestData.phoneNumber) {
            console.error('Missing phone number in guest data:', guestData);
            return res.status(400).send('Invalid guest data');
        }

        // If there's media, ask for name first
        if (mediaUrl) {
            await sendWhatsAppMessage(
                guestData.phoneNumber,
                "🤖 Hi there! I'd love to help you with your receipt, but I'll need to know your full name first. Could you please share your name with me? 😊"
            );
            return res.status(200).send('Name required before receipt processing.');
        }

        // If there's text input
        if (body) {
            const trimmedInput = body.trim();
            
            // Check if input is a command instead of a name
            if (isCommand(trimmedInput)) {
                console.log(`Command detected during name collection: ${trimmedInput}`);
                
                // Handle help command specifically
                if (trimmedInput.toLowerCase() === 'help') {
                    await sendWhatsAppMessage(
                        guestData.phoneNumber,
                        `🤖 Hi! Welcome to our rewards program. To get started, I'll need to know your full name first.\n\nOnce registered, you'll be able to:\n• Send receipt photos to earn rewards\n• Check your points balance\n• View available rewards\n\nCould you please share your full name with me? (e.g., "John Smith") 😊`
                    );
                    return res.status(200).send('Help provided during name collection.');
                }
                
                // For other commands, redirect to name collection
                await sendWhatsAppMessage(
                    guestData.phoneNumber,
                    `🤖 Hi! I'd love to help you with that, but I'll need to know your full name first. Could you please share your name with me? (e.g., "John Smith") 😊`
                );
                return res.status(200).send('Name required for command.');
            }
            
            // Check if input looks like a valid name
            if (isValidName(trimmedInput)) {
                const normalizedPhone = normalizePhoneNumber(guestData.phoneNumber);
                
                // Clean and format the name properly
                const cleanedName = trimmedInput.toLowerCase()
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                
                console.log(`Setting name for ${normalizedPhone}: "${cleanedName}"`);
                await update(ref(rtdb, `guests/${normalizedPhone}`), { 
                    name: cleanedName,
                    nameCollectedAt: Date.now(),
                    updatedAt: Date.now(),
                    consentPending: true,
                    lastConsentPrompt: Date.now()
                });

                // Automatically start consent flow after name collection
                const guestDataWithName = {
                    ...guestData,
                    name: cleanedName,
                    phoneNumber: guestData.phoneNumber,
                    consentPending: true
                };

                console.log('Starting consent flow automatically after name collection');
                const consentResult = await handleConsentFlow(guestDataWithName, 'consent');

                if (consentResult.shouldMessage) {
                    await sendWhatsAppMessage(guestData.phoneNumber, consentResult.message);
                }

                return res.status(200).send('Name collected, consent flow started automatically.');
            } else {
                // Input doesn't look like a valid name
                await sendWhatsAppMessage(
                    guestData.phoneNumber,
                    `🤖 I need a valid name with just letters and spaces (e.g., "John Smith"). Could you try again without numbers or special characters? 😊`
                );
                return res.status(200).send('Invalid name format.');
            }
        }

        // No input provided
        await sendWhatsAppMessage(
            guestData.phoneNumber,
            "🤖 Welcome! I'd love to help you get started. Could you please share your full name to complete your profile? 😊"
        );
        return res.status(200).send('Prompted guest for name.');
    } catch (error) {
        console.error('Error in handleNameCollection:', error);
        return res.status(500).send('Failed to handle name collection');
    }
}

/**
 * Handle receipt processing with enhanced reward type support
 * @param {object} guestData - Guest data
 * @param {string} mediaUrl - Receipt image URL
 * @param {object} res - Response object
 */
async function handleReceiptProcessing(guestData, mediaUrl, res) {
    try {
        console.log(`Processing receipt for ${guestData.phoneNumber} with media URL: ${mediaUrl}`);
        
        // Step 1: Extract receipt data without saving yet
        console.log('Step 1: Starting receipt OCR and data extraction...');
        const { processReceiptWithoutSaving } = require('./receiptProcessor');
        const extractedData = await processReceiptWithoutSaving(mediaUrl, guestData.phoneNumber);
        console.log('Step 1 completed: Receipt data extracted', {
            brandName: extractedData.brandName,
            totalAmount: extractedData.totalAmount,
            itemCount: extractedData.items?.length || 0,
            invoiceNumber: extractedData.invoiceNumber,
            date: extractedData.date,
            hasDateField: 'date' in extractedData,
            hasInvoiceField: 'invoiceNumber' in extractedData
        });
        
        // Step 1.5: Check for duplicate receipt BEFORE saving
        console.log('Step 1.5: Checking for duplicate receipt...');
        const isDuplicate = await checkDuplicateReceipt(extractedData, guestData.phoneNumber);
        if (isDuplicate) {
            console.log('Duplicate receipt detected, skipping processing');
            await sendWhatsAppMessage(
                guestData.phoneNumber,
                `🤖 I've already processed this receipt for you! Check "view rewards" to see your existing rewards. 😊`
            );
            return res.status(200).send('Duplicate receipt - skipped processing');
        }
        
        // Step 1.6: Save receipt only after duplicate check passes
        console.log('Step 1.6: No duplicate found, saving receipt...');
        const { saveReceiptData } = require('./receiptProcessor');
        // Include guest name in extracted data so it's always saved
        extractedData.guestName = guestData.name;
        const receiptData = await saveReceiptData(extractedData, guestData.phoneNumber);
        console.log('Step 1.6 completed: Receipt saved successfully with ID:', receiptData.id);
        
        // Match receipt to campaign with enhanced validation
        console.log('Step 2: Starting matchReceiptToCampaign...');
        const matchResult = await matchReceiptToCampaign(receiptData);
        console.log('Step 2 completed: Campaign matching result', {
            isValid: matchResult.isValid,
            campaignName: matchResult.campaign?.name || 'No match',
            reason: matchResult.reason || 'Success'
        });

        if (matchResult.isValid) {
            console.log('Step 3: Processing successful match...');
            return await handleSuccessfulMatch(guestData, matchResult, receiptData, res);
        } else {
            console.log('Step 3: Processing failed match...');
            return await handleFailedMatch(guestData, matchResult, receiptData, res);
        }
    } catch (error) {
        console.error('Receipt processing error at step:', error);
        console.error('Error stack:', error.stack);
        console.error('Error details:', {
            message: error.message,
            mediaUrl,
            phoneNumber: guestData.phoneNumber
        });
        
        await sendWhatsAppMessage(
            guestData.phoneNumber,
            constructErrorMessage(error)
        );
        return res.status(500).send('Error processing receipt.');
    }
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
        
        // Find duplicate by invoice number, phone number, and date
        const duplicate = Object.entries(allReceipts).find(([firebaseId, receipt]) => {
            const matches = receipt.guestPhoneNumber === normalizedPhone && 
                          receipt.invoiceNumber === receiptData.invoiceNumber &&
                          receipt.date === receiptData.date;
            
            if (matches) {
                console.log('Found potential duplicate:', {
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
 * Handle successful receipt-campaign match with multiple reward types
 * @param {object} guestData - Guest data
 * @param {object} matchResult - Campaign matching result with eligible reward types
 * @param {object} receiptData - Processed receipt data
 * @param {object} res - Response object
 */
async function handleSuccessfulMatch(guestData, matchResult, receiptData, res) {
    try {
        console.log('Processing successful match:', {
            guest: guestData.phoneNumber,
            campaign: matchResult.campaign.name,
            eligibleRewardTypes: matchResult.eligibleRewardTypes.length
        });

        // Receipt was already created by processReceipt() - just use the existing one
        console.log('Using existing receipt created by processReceipt()...');
        const receiptId = receiptData.id; // This comes from saveReceiptData()
        
        if (!receiptId) {
            console.error('Receipt ID missing from receiptData - this should not happen');
            throw new Error('Receipt ID missing from processed receipt data');
        }
        
        console.log('Using existing receipt with ID:', receiptId);
        
        // Update the receipt with campaign info and guest details
        const receiptRef = ref(rtdb, `receipts/${receiptId}`);
        
        // First, check what data exists before the update
        console.log('🔍 Checking receipt data before update...');
        const beforeSnapshot = await get(receiptRef);
        const beforeData = beforeSnapshot.val();
        console.log('📄 Receipt data BEFORE update:', {
            hasDate: !!beforeData?.date,
            hasInvoiceNumber: !!beforeData?.invoiceNumber,
            date: beforeData?.date,
            invoiceNumber: beforeData?.invoiceNumber,
            id: beforeData?.id
        });
        
        // Preserve original receipt data during update
        await update(receiptRef, {
            // Preserve original extracted data
            ...receiptData,
            guestName: guestData.name,
            campaignId: matchResult.campaign.id || matchResult.campaign.name.replace(/\s+/g, '_').toLowerCase(),
            status: 'pending' // Keep as pending until rewards are processed
        });
        
        // Check what data exists after the update
        console.log('🔍 Checking receipt data after update...');
        const afterSnapshot = await get(receiptRef);
        const afterData = afterSnapshot.val();
        console.log('📄 Receipt data AFTER update:', {
            hasDate: !!afterData?.date,
            hasInvoiceNumber: !!afterData?.invoiceNumber,
            date: afterData?.date,
            invoiceNumber: afterData?.invoiceNumber,
            id: afterData?.id
        });
        
        console.log('Receipt updated with campaign and guest info');

        // Now process rewards with the proper receiptId
        const rewardResult = await processReward(
            guestData, 
            {
                ...matchResult.campaign,
                rewardTypes: matchResult.eligibleRewardTypes
            }, 
            {
                ...receiptData,
                receiptId
            }
        );
        
        // Send success message with reward details
        await sendWhatsAppMessage(
            guestData.phoneNumber,
            constructSuccessMessage(guestData.name, matchResult, rewardResult)
        );

        return res.status(200).send('Receipt validated and rewards processed.');
    } catch (error) {
        console.error('Error processing rewards:', error);
        throw error;
    }
}

/**
 * Handle failed receipt-campaign match
 * @param {object} guestData - Guest data
 * @param {object} matchResult - Failed matching result
 * @param {object} receiptData - Processed receipt data
 * @param {object} res - Response object
 */
async function handleFailedMatch(guestData, matchResult, receiptData, res) {
    // Update receipt with guest name and unmatched campaign status
    const receiptRef = ref(rtdb, `receipts/${receiptData.id}`);
    await update(receiptRef, {
        guestName: guestData.name,
        campaignId: null,
        status: 'unmatched_campaign'
    });
    
    const failureMessage = constructFailureMessage(guestData.name, matchResult, receiptData);
    
    await sendWhatsAppMessage(guestData.phoneNumber, failureMessage);
    return res.status(400).send('Receipt validation failed.');
}

/**
 * Construct success message for multiple rewards
 * @private
 */
function constructSuccessMessage(guestName, matchResult, rewardResult) {
    console.log('Constructing success message with:', {
        guestName,
        campaignName: matchResult?.campaign?.name,
        rewardResultType: typeof rewardResult,
        hasRewards: !!rewardResult?.rewards,
        rewardsCount: rewardResult?.rewards?.length,
        alreadyProcessed: rewardResult?.alreadyProcessed
    });

    // Handle case where rewardResult is undefined or invalid
    if (!rewardResult || !rewardResult.rewards || !Array.isArray(rewardResult.rewards)) {
        console.error('Invalid rewardResult structure:', rewardResult);
        return `Hi ${guestName}! We've processed your receipt from ${matchResult?.campaign?.brandName || 'the restaurant'}, but encountered an issue with reward generation. Please contact support if you don't see your rewards shortly.`;
    }

    // Handle case where no rewards were generated
    if (rewardResult.rewards.length === 0) {
        return `Hi ${guestName}! Your receipt from ${matchResult?.campaign?.brandName || 'the restaurant'} has been validated, but no rewards were eligible at this time.`;
    }

    const rewardsList = rewardResult.rewards
        .map(reward => {
            try {
                // Enhanced defensive coding for reward properties
                if (!reward) {
                    console.error('Reward object is null/undefined');
                    return `• Reward (see details in app)`;
                }

                // Handle missing or invalid expiration date
                let expiryDate = 'No expiration';
                if (reward.expiresAt) {
                    try {
                        expiryDate = formatToSASTDateTime(reward.expiresAt, { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                        });
                    } catch (dateError) {
                        console.error('Error formatting expiry date:', dateError, 'Raw expiresAt:', reward.expiresAt);
                        expiryDate = 'Check app for details';
                    }
                }

                // Handle missing description with better fallback
                const description = reward.metadata?.description || 
                                  reward.description || 
                                  reward.name || 
                                  'Reward';

                return `• ${description}\n  Expires: ${expiryDate}`;
            } catch (error) {
                console.error('Error formatting reward:', error, 'Reward object:', reward);
                return `• Reward (see details in app)`;
            }
        })
        .filter(Boolean) // Remove any null/undefined entries
        .join('\n');

    const statusMessage = rewardResult.alreadyProcessed ? 
        'Your receipt has been processed previously. Here are your rewards:' : 
        'Your receipt has earned you:';

    // Final safety check for empty rewards list
    if (!rewardsList || rewardsList.trim() === '') {
        return `Hi ${guestName}! Your receipt from ${matchResult?.campaign?.brandName || 'the restaurant'} has been processed successfully, but we're having trouble displaying your rewards. Please check the app for details.`;
    }

    return `Congratulations ${guestName}! 🎉\n\n` +
           `${statusMessage}\n\n` +
           `${rewardsList}\n\n` +
           `Reply "view rewards" anytime to check your rewards!`;
}

/**
 * Construct detailed failure message based on validation results
 * @param {string} guestName - Guest's name
 * @param {object} matchResult - Campaign matching result
 * @param {object} receiptData - Processed receipt data
 * @returns {string} Formatted failure message
 */
function constructFailureMessage(guestName, matchResult, receiptData) {
    // Handle case where no campaigns are active
    if (matchResult.error === 'No active campaigns found') {
        return `🤖 Hi ${guestName}! I checked but there are no active campaigns running right now. Don't worry - new campaigns start regularly, so please try again soon! 🎯`;
    }

    // Handle case where brand has no active campaigns
    if (matchResult.error === `No active campaigns found for ${receiptData.brandName}`) {
        return `🤖 Hi ${guestName}! I can see this is from ${receiptData.brandName}, but they don't have any active campaigns at the moment. Check out our other participating brands or try again later! 🏪`;
    }

    let message = `🤖 Hi ${guestName}! I've analyzed your receipt but couldn't validate it for rewards this time.`;
    const issues = [];

    // Check receipt data quality issues
    const dataIssues = checkReceiptDataIssues(receiptData);
    if (dataIssues.length > 0) {
        issues.push('\n📸 Receipt clarity issues:', ...dataIssues);
    }

    // Check campaign criteria issues
    if (matchResult.failedCriteria?.length > 0) {
        issues.push('\n🎯 Campaign requirements not met:', 
            ...matchResult.failedCriteria.map(c => `• ${formatCriteriaFailure(c)}`)
        );
    }

    // Check reward type eligibility issues
    if (matchResult.rewardTypeIssues?.length > 0) {
        issues.push('\n🏆 Reward eligibility issues:', 
            ...matchResult.rewardTypeIssues.map(issue => `• ${formatRewardTypeIssue(issue)}`)
        );
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

    if (matchResult.failedCriteria?.length > 0) {
        resolutionSteps.push(
            '\n✅ To meet campaign requirements:',
            ...getCampaignRequirementTips(matchResult.failedCriteria)
        );
    }

    // Construct final message
    if (issues.length > 0) {
        message += '\n' + issues.join('\n');
    }
    if (resolutionSteps.length > 0) {
        message += '\n' + resolutionSteps.join('\n');
    }

    message += '\n\n🎉 Keep trying - I\'m here to help you earn those rewards!';

    return message;
}

/**
 * Check receipt data for quality issues
 * @private
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
 * Format campaign criteria failure message
 * @private
 */
function formatCriteriaFailure(criteria) {
    const commonReasons = {
        minimum_amount: 'Purchase amount does not meet the minimum requirement',
        time_window: 'Receipt is outside the valid time window',
        store_match: 'Receipt is not from a participating store',
        required_items: 'Required items are missing from the purchase',
        campaign_period: 'Receipt date is outside the campaign period',
        active_days: 'Purchase was not made on an eligible day'
    };

    return commonReasons[criteria.reason] || criteria.reason;
}

/**
 * Format reward type eligibility issue
 * @private
 */
function formatRewardTypeIssue(issue) {
    const issueMessages = {
        min_purchase: `Minimum purchase amount of R${issue.required} not met (receipt total: R${issue.actual})`,
        max_rewards: 'Maximum number of rewards already claimed',
        time_restriction: 'Purchase time outside eligible hours',
        store_restriction: 'Store not eligible for this reward type',
        required_items: 'Required items for this reward not found'
    };

    return issueMessages[issue.type] || issue.message;
}

/**
 * Get tips for meeting campaign requirements
 * @private
 */
function getCampaignRequirementTips(failedCriteria) {
    const tips = [];

    failedCriteria.forEach(criteria => {
        switch (criteria.reason) {
            case 'minimum_amount':
                tips.push(`• Ensure your purchase meets the minimum amount (R${criteria.required})`);
                break;
            case 'time_window':
                tips.push(`• Visit during campaign hours: ${criteria.validHours}`);
                break;
            case 'required_items':
                tips.push(`• Include the required items in your purchase: ${criteria.items.join(', ')}`);
                break;
            case 'active_days':
                tips.push(`• Visit on eligible days: ${criteria.validDays.join(', ')}`);
                break;
        }
    });

    if (tips.length === 0) {
        tips.push('• Check campaign details for specific requirements');
    }

    return tips;
}

/**
 * Construct error message based on error type
 * @private
 */
function constructErrorMessage(error) {
    // Network or system errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return '🤖 Oops! I\'m having trouble connecting to my servers right now. Please give me a few minutes and try again! 🔄';
    }

    // Receipt processing errors
    if (error.message.includes('OCR') || error.message.includes('image')) {
        return `🤖 I'm having trouble reading your receipt clearly. Let me help you get a better photo:\n\n` +
               `📸 Photo tips:\n` +
               `• Use good lighting with no glare\n` +
               `• Keep the receipt flat and not folded\n` +
               `• Include the entire receipt in the photo\n` +
               `• Make sure all text is clearly visible\n\n` +
               `Try again - I'm here to help! 🎯`;
    }

    // Campaign validation errors
    if (error.message.includes('campaign') || error.message.includes('reward')) {
        return `🤖 I encountered a technical issue while checking your receipt. Please try again, and if this keeps happening, let our support team know! 🛠️`;
    }

    // Default error message
    return '🤖 Something unexpected happened on my end. Please try again in a moment! 🔄';
}

/**
 * Handle invalid input
 * @param {object} guestData - Guest data
 * @param {object} res - Response object
 */
async function handleInvalidInput(guestData, res) {
    await sendWhatsAppMessage(
        guestData.phoneNumber,
        `Hi ${guestData.name}! ${getHelpMessage()}`
    );
    return res.status(400).send('No valid input provided.');
}

/**
 * Handle errors
 * @param {Error} error - Error object
 * @param {string} from - Sender's phone number
 * @param {object} res - Response object
 */
async function handleError(error, from, res) {
    console.error('Error handling WhatsApp message:', error);
    
    if (error.code && error.moreInfo) {
        console.error(`Twilio error: ${error.code}, Info: ${error.moreInfo}`);
    }

    try {
        await sendWhatsAppMessage(
            normalizePhoneNumber(from),
            "🤖 Something unexpected happened on my end. Please try again in a moment! 🔄"
        );
    } catch (sendError) {
        console.error('Error sending error message:', sendError);
    }

    return res.status(500).send('Internal Server Error');
}

/**
 * Get help message
 * @returns {string} Formatted help message
 */
function getHelpMessage() {
    return `👋 Hi there! I'm your rewards bot assistant.

Here's how I can help you:
• 📸 Send a photo of your receipt to earn rewards
• 🎁 Type "check my points" to see your point balance
• 🏆 Type "view my rewards" to see your available rewards
• 🗑️ Type "delete my data" to remove your information
• ❓ Type "help" to see this menu again

Just send me a clear photo of your receipt and I'll check if it qualifies for rewards! 🎉`;
}

module.exports = {
    receiveWhatsAppMessage,
    handleReceiptProcessing,
    constructFailureMessage,
    constructSuccessMessage
};