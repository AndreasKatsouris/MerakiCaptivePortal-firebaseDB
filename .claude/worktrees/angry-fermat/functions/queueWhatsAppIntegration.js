const admin = require('firebase-admin');
const { sendWhatsAppMessage } = require('./utils/whatsappClient');
const { normalizePhoneNumber } = require('./dataManagement');
const { formatQueueTime, formatToSASTDateTime } = require('./utils/timezoneUtils');
const {
    addGuestToQueue,
    getGuestQueuePosition,
    removeGuestFromQueue,
    getQueueStatus
} = require('./queueManagement');

/**
 * Queue States for WhatsApp flow management
 */
const QUEUE_STATES = {
    IDLE: 'idle',
    WAITING_FOR_NAME: 'waiting_for_name',
    WAITING_FOR_PARTY_SIZE: 'waiting_for_party_size',
    WAITING_FOR_LOCATION: 'waiting_for_location',
    WAITING_FOR_SPECIAL_REQUESTS: 'waiting_for_special_requests',
    CONFIRMING_QUEUE_ENTRY: 'confirming_queue_entry',
    WAITING_FOR_LEAVE_CONFIRMATION: 'waiting_for_leave_confirmation'
};

/**
 * Get or create queue state for a phone number
 * @param {string} phoneNumber - Normalized phone number
 * @returns {Promise<Object>} Queue state object
 */
async function getQueueState(phoneNumber) {
    const stateSnapshot = await admin.database().ref(`queue-states/${phoneNumber}`).once('value');
    return stateSnapshot.val() || {
        step: QUEUE_STATES.IDLE,
        phoneNumber,
        startedAt: Date.now(),
        updatedAt: Date.now()
    };
}

/**
 * Update queue state for a phone number
 * @param {string} phoneNumber - Normalized phone number
 * @param {Object} stateData - State data to update
 * @returns {Promise<void>}
 */
async function updateQueueState(phoneNumber, stateData) {
    const updatedState = {
        ...stateData,
        phoneNumber,
        updatedAt: Date.now()
    };
    
    await admin.database().ref(`queue-states/${phoneNumber}`).set(updatedState);
}

/**
 * Clear queue state for a phone number
 * @param {string} phoneNumber - Normalized phone number
 * @returns {Promise<void>}
 */
async function clearQueueState(phoneNumber) {
    await admin.database().ref(`queue-states/${phoneNumber}`).remove();
}

/**
 * Get available locations for queue selection
 * @returns {Promise<Array>} Array of location objects
 */
async function getAvailableLocations() {
    const locationsSnapshot = await admin.database().ref('locations').once('value');
    const locations = locationsSnapshot.val() || {};
    
    return Object.entries(locations)
        .filter(([_, location]) => location.status === 'active')
        .map(([id, location]) => ({
            id,
            name: location.name,
            address: location.address
        }));
}

/**
 * Format locations list for WhatsApp message
 * @param {Array} locations - Array of location objects
 * @returns {string} Formatted locations message
 */
function formatLocationsMessage(locations) {
    if (locations.length === 0) {
        return 'No locations are currently available for queue registration.';
    }
    
    let message = '📍 *Available Locations:*\n\n';
    locations.forEach((location, index) => {
        message += `${index + 1}. ${location.name}\n`;
        message += `   ${location.address}\n\n`;
    });
    message += 'Please reply with the number of your preferred location.';
    
    return message;
}

/**
 * Process queue-related WhatsApp messages
 * @param {string} phoneNumber - Guest's phone number
 * @param {string} message - Message content
 * @param {string} messageType - Message type (text, button_reply)
 * @returns {Promise<Object>} Processing result
 */
async function processQueueMessage(phoneNumber, message, messageType = 'text') {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const currentState = await getQueueState(normalizedPhone);
        const lowerMessage = message.toLowerCase().trim();
        
        // Handle queue-related menu selections
        if (currentState.step === QUEUE_STATES.IDLE) {
            if (lowerMessage.includes('join queue') || lowerMessage.includes('queue')) {
                return await initiateQueueFlow(normalizedPhone);
            } else if (lowerMessage.includes('queue status') || lowerMessage.includes('my position')) {
                return await checkUserQueueStatus(normalizedPhone);
            } else if (lowerMessage.includes('leave queue') || lowerMessage.includes('exit queue')) {
                return await initiateLeaveQueueFlow(normalizedPhone);
            } else {
                return {
                    success: false,
                    reply: null,
                    requiresInput: false
                };
            }
        }
        
        // Handle queue flow states
        switch (currentState.step) {
            case QUEUE_STATES.WAITING_FOR_NAME:
                return await handleNameInput(normalizedPhone, message, currentState);
                
            case QUEUE_STATES.WAITING_FOR_PARTY_SIZE:
                return await handlePartySizeInput(normalizedPhone, message, currentState);
                
            case QUEUE_STATES.WAITING_FOR_LOCATION:
                return await handleLocationInput(normalizedPhone, message, currentState);
                
            case QUEUE_STATES.WAITING_FOR_SPECIAL_REQUESTS:
                return await handleSpecialRequestsInput(normalizedPhone, message, currentState);
                
            case QUEUE_STATES.CONFIRMING_QUEUE_ENTRY:
                return await handleQueueConfirmation(normalizedPhone, message, currentState);
                
            case QUEUE_STATES.WAITING_FOR_LEAVE_CONFIRMATION:
                return await handleLeaveConfirmation(normalizedPhone, message, currentState);
                
            default:
                return {
                    success: false,
                    reply: 'Sorry, I didn\'t understand that. Please try again.',
                    requiresInput: false
                };
        }
        
    } catch (error) {
        console.error('Error processing queue message:', error);
        
        // Clear state on error
        await clearQueueState(normalizePhoneNumber(phoneNumber));
        
        return {
            success: false,
            reply: 'Sorry, something went wrong. Please try again.',
            requiresInput: false
        };
    }
}

/**
 * Initiate queue joining flow
 * @param {string} phoneNumber - Normalized phone number
 * @returns {Promise<Object>} Flow initiation result
 */
async function initiateQueueFlow(phoneNumber) {
    const state = {
        step: QUEUE_STATES.WAITING_FOR_NAME,
        startedAt: Date.now()
    };
    
    await updateQueueState(phoneNumber, state);
    
    const reply = '🎫 *Welcome to the Queue System!*\n\n' +
                 'I\'ll help you join the queue at your preferred location.\n\n' +
                 'First, please tell me your name:';
    
    return {
        success: true,
        reply,
        requiresInput: true,
        currentStep: QUEUE_STATES.WAITING_FOR_NAME
    };
}

/**
 * Handle name input
 * @param {string} phoneNumber - Normalized phone number
 * @param {string} message - Name input
 * @param {Object} currentState - Current queue state
 * @returns {Promise<Object>} Handling result
 */
async function handleNameInput(phoneNumber, message, currentState) {
    const guestName = message.trim();
    
    if (!guestName || guestName.length < 2) {
        return {
            success: false,
            reply: 'Please enter a valid name (at least 2 characters).',
            requiresInput: true
        };
    }
    
    const updatedState = {
        ...currentState,
        step: QUEUE_STATES.WAITING_FOR_PARTY_SIZE,
        guestName
    };
    
    await updateQueueState(phoneNumber, updatedState);
    
    const reply = `Thank you, ${guestName}! 👋\n\n` +
                 'How many people will be in your party? (1-20)';
    
    return {
        success: true,
        reply,
        requiresInput: true,
        currentStep: QUEUE_STATES.WAITING_FOR_PARTY_SIZE
    };
}

/**
 * Handle party size input
 * @param {string} phoneNumber - Normalized phone number
 * @param {string} message - Party size input
 * @param {Object} currentState - Current queue state
 * @returns {Promise<Object>} Handling result
 */
async function handlePartySizeInput(phoneNumber, message, currentState) {
    const partySize = parseInt(message.trim());
    
    if (isNaN(partySize) || partySize < 1 || partySize > 20) {
        return {
            success: false,
            reply: 'Please enter a valid party size between 1 and 20.',
            requiresInput: true
        };
    }
    
    const updatedState = {
        ...currentState,
        step: QUEUE_STATES.WAITING_FOR_LOCATION,
        partySize
    };
    
    await updateQueueState(phoneNumber, updatedState);
    
    // Get available locations
    const locations = await getAvailableLocations();
    const locationsMessage = formatLocationsMessage(locations);
    
    const reply = `Great! Party size: ${partySize} ${partySize === 1 ? 'person' : 'people'} 👥\n\n` +
                 locationsMessage;
    
    return {
        success: true,
        reply,
        requiresInput: true,
        currentStep: QUEUE_STATES.WAITING_FOR_LOCATION
    };
}

/**
 * Handle location selection
 * @param {string} phoneNumber - Normalized phone number
 * @param {string} message - Location selection
 * @param {Object} currentState - Current queue state
 * @returns {Promise<Object>} Handling result
 */
async function handleLocationInput(phoneNumber, message, currentState) {
    const locations = await getAvailableLocations();
    const locationIndex = parseInt(message.trim()) - 1;
    
    if (isNaN(locationIndex) || locationIndex < 0 || locationIndex >= locations.length) {
        return {
            success: false,
            reply: 'Please select a valid location number from the list.',
            requiresInput: true
        };
    }
    
    const selectedLocation = locations[locationIndex];
    
    const updatedState = {
        ...currentState,
        step: QUEUE_STATES.WAITING_FOR_SPECIAL_REQUESTS,
        location: selectedLocation.id,
        locationName: selectedLocation.name
    };
    
    await updateQueueState(phoneNumber, updatedState);
    
    const reply = `Perfect! Location: ${selectedLocation.name} 📍\n\n` +
                 'Do you have any special requests or dietary requirements?\n\n' +
                 'Type "none" if you don\'t have any special requests.';
    
    return {
        success: true,
        reply,
        requiresInput: true,
        currentStep: QUEUE_STATES.WAITING_FOR_SPECIAL_REQUESTS
    };
}

/**
 * Handle special requests input
 * @param {string} phoneNumber - Normalized phone number
 * @param {string} message - Special requests
 * @param {Object} currentState - Current queue state
 * @returns {Promise<Object>} Handling result
 */
async function handleSpecialRequestsInput(phoneNumber, message, currentState) {
    const specialRequests = message.toLowerCase().trim() === 'none' ? '' : message.trim();
    
    const updatedState = {
        ...currentState,
        step: QUEUE_STATES.CONFIRMING_QUEUE_ENTRY,
        specialRequests
    };
    
    await updateQueueState(phoneNumber, updatedState);
    
    const reply = '📋 *Please confirm your queue entry:*\n\n' +
                 `👤 Name: ${currentState.guestName}\n` +
                 `👥 Party Size: ${currentState.partySize}\n` +
                 `📍 Location: ${currentState.locationName}\n` +
                 `💬 Special Requests: ${specialRequests || 'None'}\n\n` +
                 'Type "YES" to confirm and join the queue, or "NO" to cancel.';
    
    return {
        success: true,
        reply,
        requiresInput: true,
        currentStep: QUEUE_STATES.CONFIRMING_QUEUE_ENTRY
    };
}

/**
 * Handle queue entry confirmation
 * @param {string} phoneNumber - Normalized phone number
 * @param {string} message - Confirmation response
 * @param {Object} currentState - Current queue state
 * @returns {Promise<Object>} Handling result
 */
async function handleQueueConfirmation(phoneNumber, message, currentState) {
    const response = message.toLowerCase().trim();
    
    if (response === 'yes' || response === 'y') {
        // Add guest to queue
        const queueData = {
            locationId: currentState.location,
            guestName: currentState.guestName,
            phoneNumber: phoneNumber,
            partySize: currentState.partySize,
            specialRequests: currentState.specialRequests,
            addedBy: 'guest'
        };
        
        const result = await addGuestToQueue(queueData);
        
        // Clear queue state
        await clearQueueState(phoneNumber);
        
        if (result.success) {
            const reply = '✅ *Queue Entry Confirmed!*\n\n' +
                         `🎫 You have been added to the queue at ${currentState.locationName}\n` +
                         `📍 Position: ${result.queueEntry.position}\n` +
                         `⏰ Estimated wait time: ${result.queueEntry.estimatedWaitTime} minutes\n\n` +
                         'We\'ll notify you when your table is ready!\n\n' +
                         'You can check your queue status anytime by typing "queue status".';
            
            return {
                success: true,
                reply,
                requiresInput: false
            };
        } else {
            const reply = '❌ *Queue Entry Failed*\n\n' +
                         `Sorry, we couldn't add you to the queue: ${result.message}\n\n` +
                         'Please try again later.';
            
            return {
                success: false,
                reply,
                requiresInput: false
            };
        }
    } else if (response === 'no' || response === 'n') {
        // Cancel queue entry
        await clearQueueState(phoneNumber);
        
        const reply = '❌ *Queue Entry Cancelled*\n\n' +
                     'No problem! You can join the queue anytime by typing "join queue".';
        
        return {
            success: true,
            reply,
            requiresInput: false
        };
    } else {
        return {
            success: false,
            reply: 'Please type "YES" to confirm or "NO" to cancel.',
            requiresInput: true
        };
    }
}

/**
 * Helper function to resolve location name from location ID
 * @param {string} locationId - Location ID
 * @returns {Promise<string>} Location name or fallback
 */
async function resolveLocationName(locationId) {
    try {
        const locationSnapshot = await admin.database().ref(`locations/${locationId}`).once('value');
        const location = locationSnapshot.val();
        
        if (location && location.name) {
            return location.name;
        }
        
        // If no location found, try to make ID more readable
        return locationId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    } catch (error) {
        console.error('Error resolving location name:', error);
        return locationId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
}

/**
 * Check user's queue status
 * @param {string} phoneNumber - Normalized phone number
 * @returns {Promise<Object>} Status check result
 */
async function checkUserQueueStatus(phoneNumber) {
    try {
        // Get available locations to check all queues
        const locations = await getAvailableLocations();
        let foundEntry = null;
        let locationName = '';
        let actualLocationId = '';
        
        // Check each location for the user's queue entry
        for (const location of locations) {
            const result = await getGuestQueuePosition(phoneNumber, location.id);
            if (result.success) {
                foundEntry = result.queueEntry;
                actualLocationId = location.id;
                locationName = location.name;
                break;
            }
        }
        
        if (foundEntry) {
            // Double-check location name resolution if it looks like an ID
            if (!locationName || locationName === actualLocationId || locationName.startsWith('location_')) {
                locationName = await resolveLocationName(actualLocationId);
            }
            
            const reply = '🎫 *Your Queue Status*\n\n' +
                         `📍 Location: ${locationName}\n` +
                         `📍 Position: ${foundEntry.position}\n` +
                         `⏰ Estimated wait: ${foundEntry.estimatedWaitTime} minutes\n` +
                         `📊 Status: ${foundEntry.status}\n\n` +
                         'We\'ll notify you when your table is ready!';
            
            return {
                success: true,
                reply,
                requiresInput: false
            };
        } else {
            const reply = '❌ *Not in Queue*\n\n' +
                         'You are not currently in any queue.\n\n' +
                         'Type "join queue" to join the queue at your preferred location.';
            
            return {
                success: false,
                reply,
                requiresInput: false
            };
        }
    } catch (error) {
        console.error('Error checking queue status:', error);
        
        const reply = '❌ *Error*\n\n' +
                     'Sorry, we couldn\'t check your queue status right now. Please try again later.';
        
        return {
            success: false,
            reply,
            requiresInput: false
        };
    }
}

/**
 * Initiate leave queue flow
 * @param {string} phoneNumber - Normalized phone number
 * @returns {Promise<Object>} Flow initiation result
 */
async function initiateLeaveQueueFlow(phoneNumber) {
    try {
        // Check if user is in any queue
        const locations = await getAvailableLocations();
        let foundEntry = null;
        let locationId = '';
        let locationName = '';
        
        for (const location of locations) {
            const result = await getGuestQueuePosition(phoneNumber, location.id);
            if (result.success) {
                foundEntry = result.queueEntry;
                locationId = location.id;
                locationName = location.name;
                break;
            }
        }
        
        if (!foundEntry) {
            return {
                success: false,
                reply: 'You are not currently in any queue.',
                requiresInput: false
            };
        }
        
        // Double-check location name resolution if it looks like an ID
        if (!locationName || locationName === locationId || locationName.startsWith('location_')) {
            locationName = await resolveLocationName(locationId);
        }
        
        const state = {
            step: QUEUE_STATES.WAITING_FOR_LEAVE_CONFIRMATION,
            foundEntry,
            locationId,
            locationName,
            startedAt: Date.now()
        };
        
        await updateQueueState(phoneNumber, state);
        
        const reply = '❓ *Leave Queue Confirmation*\n\n' +
                     `You are currently at position ${foundEntry.position} in the queue at ${locationName}.\n\n` +
                     'Are you sure you want to leave the queue?\n\n' +
                     'Type "YES" to leave the queue, or "NO" to stay.';
        
        return {
            success: true,
            reply,
            requiresInput: true,
            currentStep: QUEUE_STATES.WAITING_FOR_LEAVE_CONFIRMATION
        };
    } catch (error) {
        console.error('Error initiating leave queue flow:', error);
        
        return {
            success: false,
            reply: 'Sorry, we couldn\'t process your request right now. Please try again later.',
            requiresInput: false
        };
    }
}

/**
 * Handle leave queue confirmation
 * @param {string} phoneNumber - Normalized phone number
 * @param {string} message - Confirmation response
 * @param {Object} currentState - Current queue state
 * @returns {Promise<Object>} Handling result
 */
async function handleLeaveConfirmation(phoneNumber, message, currentState) {
    const response = message.toLowerCase().trim();
    
    if (response === 'yes' || response === 'y') {
        // Remove guest from queue
        const result = await removeGuestFromQueue({
            locationId: currentState.locationId,
            entryId: currentState.foundEntry.id,
            reason: 'cancelled'
        });
        
        // Clear queue state
        await clearQueueState(phoneNumber);
        
        if (result.success) {
            const reply = '✅ *Left Queue Successfully*\n\n' +
                         `You have been removed from the queue at ${currentState.locationName}.\n\n` +
                         'You can join the queue again anytime by typing "join queue".';
            
            return {
                success: true,
                reply,
                requiresInput: false
            };
        } else {
            const reply = '❌ *Error Leaving Queue*\n\n' +
                         'Sorry, we couldn\'t remove you from the queue right now. Please try again later.';
            
            return {
                success: false,
                reply,
                requiresInput: false
            };
        }
    } else if (response === 'no' || response === 'n') {
        // Stay in queue
        await clearQueueState(phoneNumber);
        
        const reply = '👍 *Staying in Queue*\n\n' +
                     `Great! You\'re still at position ${currentState.foundEntry.position} in the queue at ${currentState.locationName}.\n\n` +
                     'We\'ll notify you when your table is ready!';
        
        return {
            success: true,
            reply,
            requiresInput: false
        };
    } else {
        return {
            success: false,
            reply: 'Please type "YES" to leave the queue or "NO" to stay.',
            requiresInput: true
        };
    }
}

/**
 * Send queue notifications
 * @param {string} phoneNumber - Guest's phone number
 * @param {string} notificationType - Type of notification
 * @param {Object} queueData - Queue data
 * @returns {Promise<Object>} Notification result
 */
async function sendQueueNotification(phoneNumber, notificationType, queueData) {
    try {
        let message = '';
        
        // Resolve location name if it looks like an ID
        let locationName = queueData.locationName;
        if (queueData.locationId && (!locationName || locationName === queueData.locationId || locationName.startsWith('location_'))) {
            locationName = await resolveLocationName(queueData.locationId);
        }
        
        switch (notificationType) {
            case 'position_update':
                message = `🔔 *Queue Update*\n\n` +
                         `Your position has been updated to: ${queueData.position}\n` +
                         `⏰ New estimated wait time: ${queueData.estimatedWaitTime} minutes\n\n` +
                         'Thank you for your patience!';
                break;
                
            case 'called':
                message = `🔔 *Your Table is Ready!*\n\n` +
                         `${queueData.guestName}, your table is ready at ${locationName}!\n\n` +
                         'Please proceed to the host stand and mention your name.\n\n' +
                         'Thank you for using our queue system!';
                break;
                
            case 'reminder':
                message = `⏰ *Queue Reminder*\n\n` +
                         `Hi ${queueData.guestName}, you're currently at position ${queueData.position} in the queue.\n` +
                         `Estimated wait time: ${queueData.estimatedWaitTime} minutes\n\n` +
                         'We\'ll notify you when your table is ready!';
                break;
                
            case 'manually_added':
                message = `🎫 *Added to Queue!*\n\n` +
                         `Hi ${queueData.guestName}!\n\n` +
                         `You have been added to the queue at ${locationName}.\n\n` +
                         `📋 *Queue Details:*\n` +
                         `• Position: ${queueData.position}\n` +
                         `• Party Size: ${queueData.partySize}\n` +
                         `• Estimated Wait Time: ${queueData.estimatedWaitTime} minutes\n` +
                         `• Special Requests: ${queueData.specialRequests || 'None'}\n\n` +
                         `✅ *Status:* Waiting\n\n` +
                         `We'll notify you when your table is ready!\n\n` +
                         `💬 You can check your queue status anytime by typing "queue status".\n\n` +
                         `🤖 This is an automated message. Reply if you have questions.`;
                break;
                
            default:
                throw new Error('Invalid notification type');
        }
        
        await sendWhatsAppMessage(phoneNumber, message);
        
        return {
            success: true,
            message: 'Notification sent successfully'
        };
    } catch (error) {
        console.error('Error sending queue notification:', error);
        
        return {
            success: false,
            message: error.message || 'Failed to send notification'
        };
    }
}

module.exports = {
    processQueueMessage,
    sendQueueNotification,
    initiateQueueFlow,
    checkUserQueueStatus,
    initiateLeaveQueueFlow,
    QUEUE_STATES
};