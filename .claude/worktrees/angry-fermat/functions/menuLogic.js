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
const { deleteUserData } = require('./dataManagement');
const { sendWhatsAppMessage, sendAdminNewBookingNotificationTemplate } = require('./utils/whatsappClient');
const { formatQueueTime, formatToSASTDateTime, formatToSASTTime } = require('./utils/timezoneUtils');

/**
 * Normalize phone number format by removing + prefix and whatsapp: prefix
 * @param {string} phoneNumber - Phone number to normalize  
 * @returns {string} Normalized phone number without + prefix
 */
function normalizePhoneNumber(phoneNumber) {
    // Ensure input is a string
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        console.error('Invalid phone number input for normalization:', phoneNumber);
        return '';
    }
    
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
    
    // Validate the result - allow + followed by digits
    if (!/^\+?\d+$/.test(cleaned)) {
        console.error('Phone number contains invalid characters after normalization:', {
            original: phoneNumber,
            normalized: cleaned
        });
        return '';
    }
    
    return cleaned;
}

/**
 * Check if a phone number belongs to an admin user from the existing platform admin system
 * @param {string} phoneNumber - Phone number to check
 * @returns {Promise<boolean>} True if phone number belongs to an admin
 */
async function isAdminUser(phoneNumber) {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        
        if (!normalizedPhone) {
            console.error('Invalid phone number for admin check:', phoneNumber);
            return false;
        }
        
        console.log('Checking admin status for phone:', normalizedPhone);
        
        // Step 1: Find user by phone number in the users collection
        const usersSnapshot = await get(ref(rtdb, 'users'));
        const allUsers = usersSnapshot.val() || {};
        
        console.log('Searching through users for phone number match...');
        
        // Find user with matching phone number
        let matchedUserId = null;
        let matchedUserData = null;
        
        for (const [userId, userData] of Object.entries(allUsers)) {
            // Check various phone number fields that might exist
            const userPhone = userData.phoneNumber || userData.phone || userData.businessPhone;
            
            if (userPhone) {
                const normalizedUserPhone = normalizePhoneNumber(userPhone);
                if (normalizedUserPhone === normalizedPhone) {
                    matchedUserId = userId;
                    matchedUserData = userData;
                    console.log('Found matching user:', {
                        userId,
                        email: userData.email,
                        phone: normalizedUserPhone
                    });
                    break;
                }
            }
        }
        
        if (!matchedUserId) {
            console.log('No user found with phone number:', normalizedPhone);
            return false;
        }
        
        // Step 2: Check if this user is in the admin-claims collection
        const adminClaimsSnapshot = await get(ref(rtdb, `admin-claims/${matchedUserId}`));
        const isInAdminClaims = adminClaimsSnapshot.exists() && adminClaimsSnapshot.val() === true;
        
        // Step 3: Also check if user has admin role in their profile
        const hasAdminRole = matchedUserData.role === 'admin' || matchedUserData.isAdmin === true;
        
        // Step 4: Check if user is active
        const isActiveUser = matchedUserData.status !== 'inactive' && matchedUserData.status !== 'deleted';
        
        const isAdmin = (isInAdminClaims || hasAdminRole) && isActiveUser;
        
        console.log('Admin verification result:', {
            phoneNumber: normalizedPhone,
            userId: matchedUserId,
            email: matchedUserData.email,
            isInAdminClaims,
            hasAdminRole,
            isActiveUser,
            finalResult: isAdmin
        });
        
        return isAdmin;
        
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

/**
 * Get daily insights for admin users
 * @param {string} phoneNumber - Admin user's phone number
 * @returns {Promise<Object>} Daily insights data
 */
async function getAdminDailyInsights(phoneNumber) {
    try {
        console.log('Generating daily insights for admin:', phoneNumber);
        
        // Get today's date range (start and end of today)
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const todayEnd = todayStart + (24 * 60 * 60 * 1000) - 1; // End of today
        
        console.log('Date range for insights:', {
            todayStart: new Date(todayStart).toISOString(),
            todayEnd: new Date(todayEnd).toISOString()
        });
        
        // Get new guests signed up today
        const guestsSnapshot = await get(ref(rtdb, 'guests'));
        const allGuests = guestsSnapshot.val() || {};
        
        const newGuestsToday = Object.values(allGuests).filter(guest => {
            const createdAt = guest.createdAt || 0;
            return createdAt >= todayStart && createdAt <= todayEnd;
        });
        
        console.log('New guests today:', newGuestsToday.length);
        
        // Get receipts uploaded today
        const receiptsSnapshot = await get(ref(rtdb, 'receipts'));
        const allReceipts = receiptsSnapshot.val() || {};
        
        const receiptsToday = Object.values(allReceipts).filter(receipt => {
            const uploadedAt = receipt.uploadedAt || receipt.createdAt || 0;
            return uploadedAt >= todayStart && uploadedAt <= todayEnd;
        });
        
        console.log('Receipts uploaded today:', receiptsToday.length);
        
        // Get rewards issued today
        const rewardsSnapshot = await get(ref(rtdb, 'rewards'));
        const allRewards = rewardsSnapshot.val() || {};
        
        const rewardsToday = Object.values(allRewards).filter(reward => {
            const createdAt = reward.createdAt || 0;
            return createdAt >= todayStart && createdAt <= todayEnd;
        });
        
        console.log('Rewards issued today:', rewardsToday.length);
        
        // Calculate additional metrics
        const totalActiveGuests = Object.values(allGuests).filter(guest => guest.name && guest.name.trim().length > 0).length;
        const totalReceipts = Object.keys(allReceipts).length;
        const totalRewards = Object.keys(allRewards).length;
        
        const insights = {
            date: new Date().toISOString().split('T')[0],
            today: {
                newGuests: newGuestsToday.length,
                receiptsUploaded: receiptsToday.length,
                rewardsIssued: rewardsToday.length
            },
            totals: {
                activeGuests: totalActiveGuests,
                receipts: totalReceipts,
                rewards: totalRewards
            },
            generatedAt: Date.now(),
            generatedBy: phoneNumber
        };
        
        console.log('Generated insights:', insights);
        
        return {
            success: true,
            insights
        };
        
    } catch (error) {
        console.error('Error generating admin insights:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Format admin insights into readable message
 * @param {Object} insightsResult - Result from getAdminDailyInsights
 * @returns {Object} Formatted message result
 */
function formatAdminInsightsMessage(insightsResult) {
    if (!insightsResult.success) {
        return {
            success: false,
            message: `🤖 [ADMIN] Error generating insights: ${insightsResult.error}`
        };
    }
    
    const { insights } = insightsResult;
    const { today, totals } = insights;
    
    const message = `🤖 [ADMIN] Daily Insights - ${insights.date}

📈 *Today's Activity:*
• New Guests: ${today.newGuests}
• Receipts Uploaded: ${today.receiptsUploaded}
• Rewards Issued: ${today.rewardsIssued}

📊 *System Totals:*
• Total Active Guests: ${totals.activeGuests}
• Total Receipts: ${totals.receipts}
• Total Rewards: ${totals.rewards}

🕐 Generated: ${formatToSASTDateTime(insights.generatedAt)}`;
    
    return {
        success: true,
        message
    };
}

/**
 * Get guest name from database
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<string>} Guest's name
 */
async function getGuestName(phoneNumber) {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const snapshot = await get(ref(rtdb, `guests/${normalizedPhone}/name`));
        return snapshot.val() || 'Guest';
    } catch (error) {
        console.error('Error getting guest name:', error);
        return 'Guest';
    }
}

/**
 * Process incoming message and route to appropriate handler
 * @param {string} message - The incoming message text
 * @param {string} phoneNumber - Guest's phone number
 * @param {Object} locationContext - Optional location context from WhatsApp routing
 * @returns {Promise<Object>} Processing result
 */
async function processMessage(message, phoneNumber, locationContext = null) {
    // Input validation
    if (!message || typeof message !== 'string') {
        console.error('Invalid message format:', message);
        return {
            success: false,
            message: 'Invalid message format. Please try again.'
        };
    }

    if (!phoneNumber || typeof phoneNumber !== 'string' || !/^\+?\d{10,}$/.test(phoneNumber)) {
        console.error('Invalid phone number format:', phoneNumber);
        return {
            success: false,
            message: 'Invalid phone number format. Please try again.'
        };
    }

    console.log(`Processing message: "${message}" from ${phoneNumber}`);
    
    const normalizedMessage = message.toLowerCase().trim();

    // Check if user is in an active queue flow first
    const queueState = await getQueueState(phoneNumber);
    if (queueState) {
        console.log(`User is in queue flow at step: ${queueState.step}`);
        return await processQueueFlow(phoneNumber, message);
    }

    // Check if user is in an active booking flow
    const bookingState = await getBookingState(phoneNumber);
    if (bookingState) {
        console.log(`User is in booking flow at step: ${bookingState.step}`);
        return await processBookingFlow(phoneNumber, message);
    }

    // Check each command for matching patterns
    for (const [commandType, command] of Object.entries(COMMANDS)) {
        // Skip the PROCESS_BOOKING command as it's handled above
        if (commandType === 'PROCESS_BOOKING') continue;
        
        if (command.patterns.some(pattern => normalizedMessage.includes(pattern))) {
            console.log(`Matched command: ${commandType}`);
            try {
                return await command.handler(phoneNumber, locationContext);
            } catch (error) {
                console.error(`Error executing ${commandType}:`, error);
                return {
                    success: false,
                    message: `🤖 Oops! I ran into an issue processing that request. Please try again in a moment! 🔄`
                };
            }
        }
    }

    // If no command matched, return help message
    return {
        success: false,
        message: `🤖 Hmm, I didn't quite understand that! Let me help you out:\n\n${getHelpMessage()}`
    };
}

/**
 * Get guest's current point balance
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<number>} Point balance
 */
async function getGuestPoints(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        console.error('Invalid phone number:', phoneNumber);
        throw new Error('Invalid phone number format');
    }

    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const snapshot = await get(ref(rtdb, `guests/${normalizedPhone}/points`));
        const points = snapshot.val();
        
        // Validate points value
        if (points !== null && (!Number.isFinite(points) || points < 0)) {
            console.error('Invalid points value in database:', points);
            throw new Error('Invalid points data');
        }
        
        return points || 0;
    } catch (error) {
        console.error('Error fetching points:', error);
        throw new Error('Failed to fetch points');
    }
}

/**
 * Get guest's current rewards
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Array>} List of rewards
 */
async function getGuestRewards(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        console.error('Invalid phone number:', phoneNumber);
        throw new Error('Invalid phone number format');
    }

    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        
        // Ensure normalizedPhone is a valid string
        if (!normalizedPhone || typeof normalizedPhone !== 'string') {
            console.error('Invalid normalized phone number:', normalizedPhone);
            throw new Error('Invalid phone number after normalization');
        }
        
        console.log('🔍 Getting rewards for normalized phone:', normalizedPhone);
        console.log('🔍 Database path:', `guest-rewards/${normalizedPhone}`);
        
        const snapshot = await get(ref(rtdb, `guest-rewards/${normalizedPhone}`));
        let rewards = snapshot.val() || {};
        
        console.log('🔍 Raw rewards data from database:', {
            found: !!rewards,
            rewardIds: Object.keys(rewards),
            rewardCount: Object.keys(rewards).length,
            fullRewardsObject: rewards
        });
        
        // Validate and fix rewards object structure
        if (typeof rewards !== 'object' || rewards === null) {
            console.error('🚨 Invalid rewards data format detected:', {
                type: typeof rewards,
                value: rewards,
                phone: normalizedPhone,
                path: `guest-rewards/${normalizedPhone}`
            });
            
            // If the value is a boolean true, it means the index is corrupted
            if (rewards === true) {
                console.error('🚨 CRITICAL: Guest-rewards index is corrupted (boolean instead of object)');
                
                // Try to fix the database by clearing the corrupted entry
                console.log('🔧 Attempting to clear corrupted index and reset structure...');
                try {
                    const parentPath = `guest-rewards/${normalizedPhone}`;
                    await set(ref(rtdb, parentPath), null);
                    console.log('✅ Corrupted boolean index cleared');
                    
                    // Wait for Firebase to process the clear
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    // Reset to empty object for continued operation
                    rewards = {};
                    
                } catch (clearError) {
                    console.error('❌ Failed to clear corrupted index:', clearError);
                    rewards = {};
                }
            } else {
                // For other invalid types, throw error
                throw new Error(`Invalid rewards data format: expected object, got ${typeof rewards}`);
            }
        }

        // Track orphaned references for cleanup
        const orphanedReferences = [];

        // Fetch full reward details
        console.log('🔍 Fetching details for reward IDs:', Object.keys(rewards));
        const rewardDetails = await Promise.all(
            Object.keys(rewards).map(async (rewardId) => {
                try {
                    console.log('🔍 Fetching reward details for ID:', rewardId);
                    const rewardSnapshot = await get(ref(rtdb, `rewards/${rewardId}`));
                    const reward = rewardSnapshot.val();
                    
                    // Handle null/missing rewards (orphaned references)
                    if (!reward) {
                        console.log('Found orphaned reward reference:', rewardId);
                        orphanedReferences.push(rewardId);
                        return null;
                    }
                    
                    // Validate reward object structure
                    if (!reward.status || !reward.expiresAt || !reward.metadata) {
                        console.error('Invalid reward structure:', rewardId, reward);
                        orphanedReferences.push(rewardId);
                        return null;
                    }
                    
                    return { id: rewardId, ...reward };
                } catch (error) {
                    console.error(`Error fetching reward ${rewardId}:`, error);
                    return null;
                }
            })
        );

        // Clean up orphaned references asynchronously
        if (orphanedReferences.length > 0) {
            console.log(`Cleaning up ${orphanedReferences.length} orphaned reward references for ${normalizedPhone}`);
            cleanupOrphanedReferences(normalizedPhone, orphanedReferences).catch(error => {
                console.error('Error cleaning up orphaned references:', error);
            });
        }

        const validRewards = rewardDetails.filter(Boolean);
        console.log('🎯 Final rewards result:', {
            totalRewards: validRewards.length,
            rewardStatuses: validRewards.map(r => ({ id: r.id, status: r.status }))
        });

        return validRewards;
    } catch (error) {
        console.error('Error fetching rewards:', error);
        throw new Error('Failed to fetch rewards');
    }
}

/**
 * Clean up orphaned reward references from guest-rewards index
 * @param {string} phoneNumber - Guest's phone number (should already be normalized)
 * @param {Array} orphanedIds - Array of orphaned reward IDs
 */
async function cleanupOrphanedReferences(phoneNumber, orphanedIds) {
    try {
        // Ensure phone number is normalized for database operations
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        
        const updates = {};
        orphanedIds.forEach(rewardId => {
            updates[`guest-rewards/${normalizedPhone}/${rewardId}`] = null;
        });
        
        // Use rtdb.ref() directly for batch updates at root level
        await update(rtdb.ref(), updates);
        console.log(`Successfully cleaned up ${orphanedIds.length} orphaned references for ${normalizedPhone}`);
    } catch (error) {
        console.error('Failed to clean up orphaned references:', error);
        throw error;
    }
}

// ===============================================
// QUEUE SYSTEM FUNCTIONS
// ===============================================

/**
 * Get guest queue state from database
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Object|null>} Queue state or null
 */
async function getQueueState(phoneNumber) {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const snapshot = await get(ref(rtdb, `queue-states/${normalizedPhone}`));
        return snapshot.val();
    } catch (error) {
        console.error('Error getting queue state:', error);
        return null;
    }
}

/**
 * Save guest queue state to database
 * @param {string} phoneNumber - Guest's phone number
 * @param {Object} state - Queue state
 */
async function saveQueueState(phoneNumber, state) {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        await set(ref(rtdb, `queue-states/${normalizedPhone}`), {
            ...state,
            updatedAt: Date.now()
        });
    } catch (error) {
        console.error('Error saving queue state:', error);
        throw error;
    }
}

/**
 * Clear guest queue state
 * @param {string} phoneNumber - Guest's phone number
 */
async function clearQueueState(phoneNumber) {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        await set(ref(rtdb, `queue-states/${normalizedPhone}`), null);
    } catch (error) {
        console.error('Error clearing queue state:', error);
    }
}

/**
 * Start queue flow for a guest
 * @param {string} phoneNumber - Guest's phone number
 * @param {string} guestName - Guest's name
 * @param {Object} locationContext - Optional location context from WhatsApp routing
 * @returns {Promise<Object>} Response object
 */
async function startQueueFlow(phoneNumber, guestName, locationContext = null) {
    try {
        // Check if guest is already in a queue today
        const existingQueueEntry = await findGuestInTodaysQueue(phoneNumber);
        if (existingQueueEntry) {
            return {
                success: true,
                message: `🎯 You're already in the queue at ${existingQueueEntry.locationName}!\n\n` +
                        `📍 Position: ${existingQueueEntry.position}\n` +
                        `⏰ Estimated wait: ${existingQueueEntry.estimatedWaitTime} minutes\n` +
                        `👥 Party size: ${existingQueueEntry.partySize}\n\n` +
                        `I'll notify you when your table is ready! 🍽️`
            };
        }

        // If location context is provided, skip location selection step
        if (locationContext && locationContext.locationId) {
            console.log(`🎯 Using location context: ${locationContext.mapping.locationName}`);
            
            const queueState = {
                step: 'party_size',
                guestName: guestName,
                phoneNumber: phoneNumber,
                location: locationContext.mapping.locationName,
                locationId: locationContext.locationId,
                startedAt: Date.now()
            };
            
            await saveQueueState(phoneNumber, queueState);
            
            return {
                success: true,
                message: `🎯 Great! Let's add you to the queue at ${locationContext.mapping.locationName}, ${guestName}!\n\n` +
                        `👥 How many people will be in your party?\n` +
                        `Please enter a number (1-20)\n\n` +
                        `Type "cancel queue" anytime to stop.`
            };
        }

        // No location context - proceed with traditional location selection
        const queueState = {
            step: 'location',
            guestName: guestName,
            phoneNumber: phoneNumber,
            startedAt: Date.now()
        };
        
        await saveQueueState(phoneNumber, queueState);
        
        return {
            success: true,
            message: `🎯 Great! Let's add you to the queue, ${guestName}!\n\n` +
                    `📍 Which location would you like to join?\n` +
                    `Please type the location name:\n` +
                    `• Ocean Basket The Grove\n` +
                    `• Ocean Basket Sandton\n` +
                    `• Ocean Basket Waterfront\n\n` +
                    `Type "cancel queue" anytime to stop.`
        };
    } catch (error) {
        console.error('Error starting queue flow:', error);
        return {
            success: false,
            message: '🤖 Sorry, I encountered an error starting the queue process. Please try again later.'
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
        const locationSnapshot = await get(ref(rtdb, `locations/${locationId}`));
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
 * Check if guest is already in today's queue
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Object|null>} Queue entry or null
 */
async function findGuestInTodaysQueue(phoneNumber) {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const today = new Date().toISOString().split('T')[0];
        
        // Check all locations for today's queues
        const queuesSnapshot = await get(ref(rtdb, 'queues'));
        const allQueues = queuesSnapshot.val() || {};
        
        for (const [locationId, locationQueues] of Object.entries(allQueues)) {
            const todaysQueue = locationQueues[today];
            if (todaysQueue && todaysQueue.entries) {
                for (const [entryId, entry] of Object.entries(todaysQueue.entries)) {
                    if (entry.phoneNumber === normalizedPhone && entry.status === 'waiting') {
                        // Resolve location name properly
                        let locationName = todaysQueue.metadata?.locationName;
                        if (!locationName || locationName === locationId) {
                            locationName = await resolveLocationName(locationId);
                        }
                        
                        return {
                            ...entry,
                            locationId,
                            locationName
                        };
                    }
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error finding guest in today\'s queue:', error);
        return null;
    }
}

/**
 * Check queue status for a guest
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Object>} Response object
 */
async function checkQueueStatus(phoneNumber) {
    try {
        const queueEntry = await findGuestInTodaysQueue(phoneNumber);
        
        if (!queueEntry) {
            return {
                success: true,
                message: '🎯 You\'re not currently in any queue today.\n\n' +
                        'Type "add me to queue" to join a queue! 🍽️'
            };
        }

        const statusMessage = `🎯 Your Queue Status:\n\n` +
            `📍 Location: ${queueEntry.locationName}\n` +
            `📊 Position: ${queueEntry.position}\n` +
            `⏰ Estimated wait: ${queueEntry.estimatedWaitTime} minutes\n` +
            `👥 Party size: ${queueEntry.partySize}\n` +
            `🕐 Added at: ${formatQueueTime(queueEntry.addedAt)}\n\n` +
            `I'll notify you when your table is ready! 🍽️`;

        return {
            success: true,
            message: statusMessage
        };
    } catch (error) {
        console.error('Error checking queue status:', error);
        return {
            success: false,
            message: '🤖 Sorry, I encountered an error checking your queue status. Please try again.'
        };
    }
}

/**
 * Remove guest from queue
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Object>} Response object
 */
async function leaveQueue(phoneNumber) {
    try {
        const queueEntry = await findGuestInTodaysQueue(phoneNumber);
        
        if (!queueEntry) {
            return {
                success: true,
                message: '🎯 You\'re not currently in any queue today.\n\n' +
                        'Type "add me to queue" to join a queue! 🍽️'
            };
        }

        // Remove from queue
        const today = new Date().toISOString().split('T')[0];
        const entryPath = `queues/${queueEntry.locationId}/${today}/entries/${queueEntry.id}`;
        
        await update(ref(rtdb, entryPath), {
            status: 'removed',
            removedAt: Date.now(),
            removeReason: 'guest_cancelled'
        });

        // Clear queue state if any
        await clearQueueState(phoneNumber);

        return {
            success: true,
            message: `✅ You've been removed from the queue at ${queueEntry.locationName}.\n\n` +
                    'Type "add me to queue" if you\'d like to join again! 🍽️'
        };
    } catch (error) {
        console.error('Error leaving queue:', error);
        return {
            success: false,
            message: '🤖 Sorry, I encountered an error removing you from the queue. Please try again.'
        };
    }
}

/**
 * Process queue flow step
 * @param {string} phoneNumber - Guest's phone number
 * @param {string} message - User's message
 * @returns {Promise<Object>} Response object
 */
async function processQueueFlow(phoneNumber, message) {
    try {
        const state = await getQueueState(phoneNumber);
        
        if (!state) {
            return {
                success: false,
                message: '🤖 No active queue flow found. Type "add me to queue" to start.'
            };
        }
        
        const userInput = message.toLowerCase().trim();
        
        // Handle cancellation
        if (userInput.includes('cancel queue') || userInput === 'cancel') {
            await clearQueueState(phoneNumber);
            return {
                success: true,
                message: '🤖 Queue process cancelled. Type "add me to queue" if you\'d like to start again.'
            };
        }
        
        switch (state.step) {
            case 'location':
                return await processQueueLocationStep(phoneNumber, message, state);
            case 'party_size':
                return await processQueuePartySizeStep(phoneNumber, message, state);
            case 'special_requests':
                return await processQueueSpecialRequestsStep(phoneNumber, message, state);
            default:
                await clearQueueState(phoneNumber);
                return {
                    success: false,
                    message: '🤖 Something went wrong with the queue process. Please start again with "add me to queue".'
                };
        }
    } catch (error) {
        console.error('Error processing queue flow:', error);
        return {
            success: false,
            message: '🤖 Sorry, I encountered an error processing your queue request. Please try again.'
        };
    }
}

/**
 * Process queue location selection step
 */
async function processQueueLocationStep(phoneNumber, message, state) {
    const location = message.trim();
    
    if (location.length < 3) {
        return {
            success: true,
            message: '📍 Please provide a valid location name.\n\n' +
                    'Type "cancel queue" to cancel.'
        };
    }
    
    // Convert location name to ID (simplified for now)
    const locationId = location.toLowerCase().replace(/\s+/g, '_');
    
    const newState = { 
        ...state, 
        location: location,
        locationId: locationId,
        step: 'party_size' 
    };
    await saveQueueState(phoneNumber, newState);
    
    return {
        success: true,
        message: `✅ Location selected: ${location}\n\n` +
                `👥 How many people will be in your party?\n` +
                `Please enter a number (1-20)\n\n` +
                `Type "cancel queue" to cancel.`
    };
}

/**
 * Process queue party size step
 */
async function processQueuePartySizeStep(phoneNumber, message, state) {
    const input = message.trim();
    const partySize = parseInt(input);
    
    if (isNaN(partySize) || partySize < 1 || partySize > 20) {
        return {
            success: true,
            message: '👥 Please enter a valid party size (1-20).\n\n' +
                    'Type "cancel queue" to cancel.'
        };
    }
    
    const newState = { 
        ...state, 
        partySize: partySize,
        step: 'special_requests' 
    };
    await saveQueueState(phoneNumber, newState);
    
    return {
        success: true,
        message: `✅ Party size: ${partySize}\n\n` +
                `🎉 Any special requests or notes?\n` +
                `Examples:\n` +
                `• High chair needed\n` +
                `• Wheelchair accessible\n` +
                `• Quiet area preferred\n` +
                `• No special requests\n\n` +
                `Type your request or "none" if no special requests.`
    };
}

/**
 * Process queue special requests step and add to queue
 */
async function processQueueSpecialRequestsStep(phoneNumber, message, state) {
    const specialRequests = message.trim() === 'none' ? '' : message.trim();
    
    try {
        // Add guest to queue
        const queueEntry = await addGuestToQueue({
            locationId: state.locationId,
            locationName: state.location,
            guestName: state.guestName,
            phoneNumber: phoneNumber,
            partySize: state.partySize,
            specialRequests: specialRequests
        });
        
        if (!queueEntry) {
            return {
                success: false,
                message: '🤖 Sorry, there was an error adding you to the queue. Please try again later.'
            };
        }
        
        // Clear queue state
        await clearQueueState(phoneNumber);
        
        // Send confirmation
        const confirmationMessage = `🎯 You've been added to the queue!\n\n` +
            `📍 Location: ${state.location}\n` +
            `📊 Position: ${queueEntry.position}\n` +
            `⏰ Estimated wait: ${queueEntry.estimatedWaitTime} minutes\n` +
            `👥 Party size: ${state.partySize}\n` +
            `${specialRequests ? `🎉 Special requests: ${specialRequests}\n` : ''}` +
            `\n✅ I'll notify you when your table is ready! 🍽️\n\n` +
            `Type "queue status" to check your position anytime!`;
        
        return {
            success: true,
            message: confirmationMessage
        };
        
    } catch (error) {
        console.error('Error adding guest to queue:', error);
        return {
            success: false,
            message: '🤖 Sorry, there was an error adding you to the queue. Please try again later.'
        };
    }
}

/**
 * Add guest to queue - core queue management function
 * @param {Object} queueData - Queue entry data
 * @returns {Promise<Object|null>} Queue entry or null if failed
 */
async function addGuestToQueue(queueData) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const queuePath = `queues/${queueData.locationId}/${today}`;
        
        // Resolve location name properly
        let locationName = queueData.locationName;
        if (!locationName || locationName === queueData.locationId) {
            locationName = await resolveLocationName(queueData.locationId);
        }
        
        // Initialize queue if it doesn't exist
        const queueRef = ref(rtdb, queuePath);
        const queueSnapshot = await get(queueRef);
        
        if (!queueSnapshot.exists()) {
            await set(queueRef, {
                metadata: {
                    date: today,
                    locationId: queueData.locationId,
                    locationName: locationName,
                    queueStatus: 'active',
                    maxCapacity: 100,
                    currentCount: 0,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                },
                entries: {}
            });
        }
        
        // Generate unique entry ID
        const entryId = `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Calculate position and wait time
        const entriesSnapshot = await get(ref(rtdb, `${queuePath}/entries`));
        const existingEntries = entriesSnapshot.val() || {};
        const activeEntries = Object.values(existingEntries).filter(e => e.status === 'waiting');
        const position = activeEntries.length + 1;
        const estimatedWaitTime = Math.max(5, position * 15); // 15 minutes per position, minimum 5 minutes
        
        // Create queue entry
        const queueEntry = {
            id: entryId,
            position: position,
            guestName: queueData.guestName,
            phoneNumber: normalizePhoneNumber(queueData.phoneNumber),
            partySize: queueData.partySize,
            specialRequests: queueData.specialRequests,
            status: 'waiting',
            estimatedWaitTime: estimatedWaitTime,
            addedAt: Date.now(),
            updatedAt: Date.now(),
            addedBy: 'guest',
            notificationsSent: {
                added: false,
                positionUpdate: false,
                called: false,
                reminder: false
            }
        };
        
        // Save to database
        await set(ref(rtdb, `${queuePath}/entries/${entryId}`), queueEntry);
        
        // Update queue metadata
        await update(ref(rtdb, `${queuePath}/metadata`), {
            currentCount: position,
            updatedAt: Date.now()
        });
        
        console.log('✅ Guest added to queue:', entryId);
        return queueEntry;
        
    } catch (error) {
        console.error('Error adding guest to queue:', error);
        return null;
    }
}

// ===============================================
// BOOKING SYSTEM FUNCTIONS
// ===============================================

/**
 * Get guest booking state from database
 * @param {string} phoneNumber - Guest's phone number
 * @returns {Promise<Object|null>} Booking state or null
 */
async function getBookingState(phoneNumber) {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const snapshot = await rtdb.ref(`booking-states/${normalizedPhone}`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Error getting booking state:', error);
        return null;
    }
}

/**
 * Save guest booking state to database
 * @param {string} phoneNumber - Guest's phone number
 * @param {Object} state - Booking state
 */
async function saveBookingState(phoneNumber, state) {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        await rtdb.ref(`booking-states/${normalizedPhone}`).set({
            ...state,
            updatedAt: Date.now()
        });
    } catch (error) {
        console.error('Error saving booking state:', error);
        throw error;
    }
}

/**
 * Clear guest booking state
 * @param {string} phoneNumber - Guest's phone number
 */
async function clearBookingState(phoneNumber) {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        await rtdb.ref(`booking-states/${normalizedPhone}`).set(null);
    } catch (error) {
        console.error('Error clearing booking state:', error);
    }
}

/**
 * Start a new booking flow for a guest
 * @param {string} phoneNumber - Guest's phone number
 * @param {string} guestName - Guest's name
 * @param {Object} locationContext - Optional location context from WhatsApp routing
 * @returns {Promise<Object>} Response object
 */
async function startBookingFlow(phoneNumber, guestName, locationContext = null) {
    try {
        // If location context is provided, skip location selection step
        if (locationContext && locationContext.locationId) {
            console.log(`🎯 Using location context for booking: ${locationContext.mapping.locationName}`);

            // Resolve location name properly
            let locationName = locationContext.mapping.locationName;
            if (!locationName || locationName === locationContext.locationId) {
                locationName = await resolveLocationName(locationContext.locationId);
            }

            const bookingState = {
                step: 'date',
                guestName: guestName,
                phoneNumber: phoneNumber,
                location: locationName,
                locationId: locationContext.locationId,
                startedAt: Date.now()
            };

            await saveBookingState(phoneNumber, bookingState);

            return {
                success: true,
                message: `🍽️ Great! Let's make a booking for you at ${locationName}, ${guestName}!\n\n` +
                        `Please provide the date you'd like to book:\n` +
                        `📅 Format: YYYY-MM-DD (e.g., 2024-02-15)\n` +
                        `Or say "today" or "tomorrow"\n\n` +
                        `Type "cancel booking" anytime to stop.`
            };
        }

        // No location context - proceed with traditional flow starting at date step
        const bookingState = {
            step: 'date',
            guestName: guestName,
            phoneNumber: phoneNumber,
            startedAt: Date.now()
        };

        await saveBookingState(phoneNumber, bookingState);

        return {
            success: true,
            message: `🍽️ Great! Let's make a booking for you, ${guestName}!\n\n` +
                    `Please provide the date you'd like to book:\n` +
                    `📅 Format: YYYY-MM-DD (e.g., 2024-02-15)\n` +
                    `Or say "today" or "tomorrow"\n\n` +
                    `Type "cancel booking" anytime to stop.`
        };
    } catch (error) {
        console.error('Error starting booking flow:', error);
        return {
            success: false,
            message: '🤖 Sorry, I encountered an error starting your booking. Please try again later.'
        };
    }
}

/**
 * Process booking flow step
 * @param {string} phoneNumber - Guest's phone number
 * @param {string} message - User's message
 * @returns {Promise<Object>} Response object
 */
async function processBookingFlow(phoneNumber, message) {
    try {
        const state = await getBookingState(phoneNumber);
        
        if (!state) {
            return {
                success: false,
                message: '🤖 No active booking found. Type "make booking" to start a new one.'
            };
        }
        
        const userInput = message.toLowerCase().trim();
        
        // Handle cancellation
        if (userInput.includes('cancel booking') || userInput === 'cancel') {
            await clearBookingState(phoneNumber);
            return {
                success: true,
                message: '🤖 Your booking has been cancelled. Type "make booking" if you\'d like to start again.'
            };
        }
        
        switch (state.step) {
            case 'date':
                return await processDateStep(phoneNumber, message, state);
            case 'time':
                return await processTimeStep(phoneNumber, message, state);
            case 'location':
                return await processLocationStep(phoneNumber, message, state);
            case 'section':
                return await processSectionStep(phoneNumber, message, state);
            case 'guests':
                return await processGuestsStep(phoneNumber, message, state);
            case 'special-requests':
                return await processSpecialRequestsStep(phoneNumber, message, state);
            default:
                await clearBookingState(phoneNumber);
                return {
                    success: false,
                    message: '🤖 Something went wrong with your booking. Please start again with "make booking".'
                };
        }
    } catch (error) {
        console.error('Error processing booking flow:', error);
        return {
            success: false,
            message: '🤖 Sorry, I encountered an error processing your booking. Please try again.'
        };
    }
}

/**
 * Process date selection step
 */
async function processDateStep(phoneNumber, message, state) {
    const input = message.toLowerCase().trim();
    let selectedDate = '';
    
    if (input === 'today') {
        selectedDate = new Date().toISOString().split('T')[0];
    } else if (input === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        selectedDate = tomorrow.toISOString().split('T')[0];
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        selectedDate = input;
    } else {
        return {
            success: true,
            message: '📅 Please provide a valid date format:\n' +
                    '• YYYY-MM-DD (e.g., 2024-02-15)\n' +
                    '• "today"\n' +
                    '• "tomorrow"\n\n' +
                    'Type "cancel booking" to cancel.'
        };
    }
    
    // Update state
    const newState = { ...state, date: selectedDate, step: 'time' };
    await saveBookingState(phoneNumber, newState);
    
    return {
        success: true,
        message: `✅ Date selected: ${selectedDate}\n\n` +
                `🕐 What time would you like to book?\n` +
                `Format: HH:MM (e.g., 19:00 or 7:00 PM)\n\n` +
                `Type "cancel booking" to cancel.`
    };
}

/**
 * Process time selection step
 */
async function processTimeStep(phoneNumber, message, state) {
    const input = message.trim();

    // Simple time validation (accepts various formats)
    if (!/\d{1,2}[:\s]*\d{2}|^\d{1,2}\s*(am|pm)/i.test(input)) {
        return {
            success: true,
            message: '🕐 Please provide a valid time format:\n' +
                    '• 19:00 or 19:30\n' +
                    '• 7:00 PM or 7:30 PM\n\n' +
                    'Type "cancel booking" to cancel.'
        };
    }

    // Check if location was already set (from location context)
    if (state.location && state.locationId) {
        // Skip location step, go directly to section
        const newState = { ...state, time: input, step: 'section' };
        await saveBookingState(phoneNumber, newState);

        return {
            success: true,
            message: `✅ Time selected: ${input}\n\n` +
                    `🪑 Which section would you prefer?\n` +
                    `• Indoor\n` +
                    `• Outdoor\n` +
                    `• Bar area\n` +
                    `• No preference\n\n` +
                    `Type "cancel booking" to cancel.`
        };
    }

    // Location not set, proceed to location step
    const newState = { ...state, time: input, step: 'location' };
    await saveBookingState(phoneNumber, newState);

    return {
        success: true,
        message: `✅ Time selected: ${input}\n\n` +
                `📍 Which location would you like to book at?\n` +
                `Examples:\n` +
                `• Ocean Basket The Grove\n` +
                `• Ocean Basket Sandton\n` +
                `• Ocean Basket Waterfront\n\n` +
                `Type the location name or "cancel booking" to cancel.`
    };
}

/**
 * Process location selection step
 */
async function processLocationStep(phoneNumber, message, state) {
    const location = message.trim();
    
    if (location.length < 3) {
        return {
            success: true,
            message: '📍 Please provide a valid location name.\n\n' +
                    'Type "cancel booking" to cancel.'
        };
    }
    
    const newState = { ...state, location: location, step: 'section' };
    await saveBookingState(phoneNumber, newState);
    
    return {
        success: true,
        message: `✅ Location selected: ${location}\n\n` +
                `🪑 Which section would you prefer?\n` +
                `Options:\n` +
                `• Inside\n` +
                `• Outside/Patio\n` +
                `• Bar Area\n` +
                `• Private Dining\n\n` +
                `Type your preference or "cancel booking" to cancel.`
    };
}

/**
 * Process section selection step
 */
async function processSectionStep(phoneNumber, message, state) {
    const section = message.trim();
    
    if (section.length < 2) {
        return {
            success: true,
            message: '🪑 Please specify your seating preference:\n' +
                    '• Inside\n' +
                    '• Outside/Patio\n' +
                    '• Bar Area\n' +
                    '• Private Dining\n\n' +
                    'Type "cancel booking" to cancel.'
        };
    }
    
    const newState = { ...state, section: section, step: 'guests' };
    await saveBookingState(phoneNumber, newState);
    
    return {
        success: true,
        message: `✅ Section selected: ${section}\n\n` +
                `👥 How many guests will be joining?\n` +
                `Please enter a number (e.g., 2, 4, 6)\n\n` +
                `Type "cancel booking" to cancel.`
    };
}

/**
 * Process number of guests step
 */
async function processGuestsStep(phoneNumber, message, state) {
    const input = message.trim();
    const numberOfGuests = parseInt(input);
    
    if (isNaN(numberOfGuests) || numberOfGuests < 1 || numberOfGuests > 20) {
        return {
            success: true,
            message: '👥 Please enter a valid number of guests (1-20).\n\n' +
                    'Type "cancel booking" to cancel.'
        };
    }
    
    const newState = { ...state, numberOfGuests: numberOfGuests, step: 'special-requests' };
    await saveBookingState(phoneNumber, newState);
    
    return {
        success: true,
        message: `✅ Number of guests: ${numberOfGuests}\n\n` +
                `🎉 Any special requests or occasions?\n` +
                `Examples:\n` +
                `• Birthday celebration\n` +
                `• Anniversary dinner\n` +
                `• Business meeting\n` +
                `• No special requests\n\n` +
                `Type your request or "none" if no special requests.`
    };
}

/**
 * Process special requests step and complete booking
 */
async function processSpecialRequestsStep(phoneNumber, message, state) {
    const specialRequests = message.trim() === 'none' ? '' : message.trim();
    
    // Create the final booking
    const booking = {
        ...state,
        specialRequests: specialRequests,
        status: 'pending',
        createdAt: Date.now(),
        createdBy: 'guest'
    };
    
    // Save booking to database
    const bookingId = await createBooking(booking);
    
    if (!bookingId) {
        return {
            success: false,
            message: '🤖 Sorry, there was an error creating your booking. Please try again later.'
        };
    }
    
    // Clear booking state
    await clearBookingState(phoneNumber);
    
    // Send confirmation to guest
    const confirmationMessage = `🎉 Booking confirmed!\n\n` +
        `📋 **Booking Details:**\n` +
        `• Booking ID: ${bookingId}\n` +
        `• Date: ${state.date}\n` +
        `• Time: ${state.time}\n` +
        `• Location: ${state.location}\n` +
        `• Section: ${state.section}\n` +
        `• Guests: ${state.numberOfGuests}\n` +
        `${specialRequests ? `• Special Requests: ${specialRequests}\n` : ''}` +
        `\n✅ Your booking is pending confirmation. You'll receive an update once it's confirmed by our team.\n\n` +
        `Questions? Reply to this message anytime!`;
    
    // Send admin notification asynchronously
    sendBookingNotificationToAdmins(booking, bookingId).catch(error => {
        console.error('Error sending admin notification:', error);
    });
    
    return {
        success: true,
        message: confirmationMessage
    };
}

/**
 * Create a new booking in the database
 * @param {Object} bookingData - Booking data
 * @returns {Promise<string|null>} Booking ID or null if failed
 */
async function createBooking(bookingData) {
    try {
        // Use Firebase Admin SDK syntax for push
        const bookingRef = rtdb.ref('bookings').push();
        const bookingId = bookingRef.key;
        
        const booking = {
            id: bookingId,
            ...bookingData,
            updatedAt: Date.now()
        };
        
        await bookingRef.set(booking);
        
        console.log('✅ Booking created:', bookingId);
        return bookingId;
    } catch (error) {
        console.error('Error creating booking:', error);
        return null;
    }
}

/**
 * Send booking notification to admin users
 * @param {Object} booking - Booking data
 * @param {string} bookingId - Booking ID
 */
async function sendBookingNotificationToAdmins(booking, bookingId) {
    try {
        console.log('📢 Sending booking notification to admins for booking:', bookingId);
        
        // Get all users
        const usersSnapshot = await rtdb.ref('users').once('value');
        const allUsers = usersSnapshot.val() || {};
        
        // Get admin claims
        const adminClaimsSnapshot = await rtdb.ref('admin-claims').once('value');
        const adminClaims = adminClaimsSnapshot.val() || {};
        
        // Find admin users with phone numbers
        const adminUsers = [];
        for (const [userId, userData] of Object.entries(allUsers)) {
            const isInAdminClaims = adminClaims[userId] === true;
            const hasAdminRole = userData.role === 'admin' || userData.isAdmin === true;
            const isActive = userData.status !== 'inactive' && userData.status !== 'deleted';
            const hasPhone = userData.phoneNumber || userData.phone || userData.businessPhone;
            
            if ((isInAdminClaims || hasAdminRole) && isActive && hasPhone) {
                adminUsers.push({
                    userId,
                    name: userData.displayName || userData.firstName || 'Admin',
                    phoneNumber: userData.phoneNumber || userData.phone || userData.businessPhone
                });
            }
        }
        
        console.log(`📱 Found ${adminUsers.length} admin users with phone numbers`);

        // Send notification to each admin using template-based messaging
        const notifications = adminUsers.map(async (admin) => {
            try {
                // Add bookingId to booking object if not present
                const bookingWithId = { ...booking, id: bookingId };
                await sendAdminNewBookingNotificationTemplate(
                    admin.phoneNumber,
                    admin.name,
                    bookingWithId,
                    bookingId
                );
                console.log(`✅ Booking notification template sent to admin: ${admin.name} (${admin.phoneNumber})`);
            } catch (error) {
                console.error(`❌ Failed to send notification to admin ${admin.name}:`, error);
            }
        });

        await Promise.all(notifications);
        console.log('📢 Admin notifications completed');
        
    } catch (error) {
        console.error('Error sending admin notifications:', error);
    }
}

/**
 * Format booking notification message for admins
 * @param {Object} booking - Booking data
 * @param {string} bookingId - Booking ID
 * @returns {string} Formatted notification message
 */
function formatBookingNotificationForAdmin(booking, bookingId) {
    return `🍽️ **New Booking Request**\n\n` +
        `👤 Guest: ${booking.guestName}\n` +
        `📋 Booking ID: ${bookingId}\n` +
        `📅 Date: ${booking.date}\n` +
        `🕐 Time: ${booking.time}\n` +
        `📍 Location: ${booking.location}\n` +
        `🪑 Section: ${booking.section}\n` +
        `👥 Number of Guests: ${booking.numberOfGuests}\n` +
        `${booking.specialRequests ? `🎉 Special Requests: ${booking.specialRequests}\n` : ''}` +
        `📱 Phone: ${booking.phoneNumber}\n\n` +
        `⏰ Status: Pending Confirmation\n\n` +
        `Please review and confirm this booking in the admin panel.`;
}

/**
 * Format rewards list into readable message
 * @param {Array} rewards - List of reward objects
 * @returns {Object} Formatted message result
 */
function formatRewardsMessage(rewards) {
    if (!rewards.length) {
        return {
            success: true,
            message: "🤖 You don't have any rewards yet. Send me a receipt from your next eligible purchase to earn rewards! 📸🎯"
        };
    }

    // Group rewards by status and handle expired rewards
    const groupedRewards = {
        active: [],
        pending: [],
        used: [],
        expired: []
    };

    rewards.forEach(reward => {
        // Update status if reward has expired
        if (reward.expiresAt < Date.now() && (reward.status === 'active' || reward.status === 'available')) {
            reward.status = 'expired';
        }
        
        // Group by status - treat 'available' as 'active'
        let statusGroup = reward.status;
        if (reward.status === 'available') {
            statusGroup = 'active';
        }
        
        if (groupedRewards[statusGroup]) {
            groupedRewards[statusGroup].push(reward);
        } else {
            // Handle any unknown status by treating as pending
            groupedRewards.pending.push(reward);
        }
    });

    const sections = [];

    // Show active rewards first
    if (groupedRewards.active?.length > 0) {
        const activeRewardsList = groupedRewards.active
            .map(reward => formatSingleReward(reward))
            .join('\n\n');
        sections.push(`*Active Rewards:*\n${activeRewardsList}`);
    }

    // Show pending rewards
    if (groupedRewards.pending?.length > 0) {
        const pendingRewardsList = groupedRewards.pending
            .map(reward => `• ${reward.metadata?.description || 'Reward'} (Processing)\n  ID: ${reward.id}`)
            .join('\n\n');
        sections.push(`*Pending Rewards:*\n${pendingRewardsList}\n\n_Note: Pending rewards will become available once processed._`);
    }

    // Show recent used rewards (last 3) for reference
    if (groupedRewards.used?.length > 0) {
        const recentUsed = groupedRewards.used
            .slice(-3) // Last 3 used rewards
            .map(reward => `• ${reward.metadata?.description || 'Reward'} (Used)\n  ID: ${reward.id}`)
            .join('\n\n');
        sections.push(`*Recently Used:*\n${recentUsed}`);
    }

    if (sections.length === 0) {
        return {
            success: true,
            message: "🤖 You don't have any active rewards yet.\n\nSend me a receipt from your next purchase to earn rewards! 📸🎯"
        };
    }

    let message = sections.join('\n\n');
    
    // Add usage instructions if there are active rewards
    if (groupedRewards.active?.length > 0) {
        message += '\n\n' + `💡 To use your reward, remember to show your server on your next visit!`;
    }

    return {
        success: true,
        message: message
    };
}

/**
 * Format single reward details
 * @param {Object} reward - Reward object
 * @returns {string} Formatted reward string
 */
function formatSingleReward(reward) {
    try {
        const expiryDate = formatToSASTDateTime(reward.expiresAt, { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        const description = reward.metadata?.description || 'Reward';
        
        // Show status for clarity
        const statusText = (reward.status === 'available' || reward.status === 'active') ? '(Ready to use)' : '';
        
        // Include voucher code if available
        let voucherInfo = '';
        if (reward.voucherCode && reward.voucherAssigned) {
            voucherInfo = `\n  Code: *${reward.voucherCode}*`;
        } else if (reward.voucherCode && !reward.voucherAssigned) {
            voucherInfo = `\n  Code: ${reward.voucherCode} (Random)`;
        } else if (reward.status === 'pending' && reward.poolDepleted) {
            voucherInfo = `\n  Status: Waiting for voucher`;
        }
        
        return `• ${description} ${statusText}\n  ID: ${reward.id}${voucherInfo}\n  Expires: ${expiryDate}`;
    } catch (error) {
        console.error('Error formatting reward:', error);
        return `• Reward (see details in app)\n  ID: ${reward.id}`;
    }
}

/**
 * Get help message listing available commands (user commands only)
 * @returns {string} Formatted help message
 */
function getHelpMessage() {
    return `👋 Hi there! I'm your rewards bot assistant.

Here's how I can help you:
• 📸 Send a photo of your receipt to earn rewards
• 🎁 Type "check my points" to see your point balance (feature coming soon)
• 🏆 Type "view my rewards" to see your available rewards
• 🎯 Type "add me to queue" to join a restaurant queue
• 📊 Type "queue status" to check your queue position
• 🍽️ Type "make booking" to reserve a table
• 📋 Type "view booking" to check your reservations
• 🗑️ Type "delete my data" to remove your information
• ❓ Type "help" to see this menu again

Just send me a clear photo of your receipt and I'll check if it qualifies for rewards! 🎉`;
}

/**
 * Get admin help message listing admin-specific commands
 * @returns {string} Formatted admin help message
 */
function getAdminHelpMessage() {
    return `🔐 Admin Commands Available:

📊 **Analytics & Insights:**
• Type "admin insights" - Get daily system statistics
• Type "admin stats" - View system metrics
• Type "admin dashboard" - See activity overview

🛠️ **System Information:**
• Daily guest registrations
• Receipt processing stats  
• Reward issuance metrics
• Total system statistics

💡 **Usage:**
Send any admin command to get real-time system data. All admin commands are logged for audit purposes.

Type "help" for regular user commands.`;
}

// Command definitions with their variations
const COMMANDS = {
    DELETE_DATA: {
        patterns: [
            'delete my data',
            'delete my information',
            'delete my personal info',
            'delete my details',
            'remove my data',
            'remove my information',
            'remove my personal info',
            'remove my details',
            'erase my data',
            'forget my details'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            return await deleteUserData(phoneNumber);
        },
    },
    CHECK_POINTS: {
        patterns: [
            'check points',
            'how many points',
            'point balance',
            'show points',
            'view points',
            'my points',
            'check my points'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            const points = await getGuestPoints(phoneNumber);
            return {
                success: true,
                message: `🤖 You currently have ${points} points! 🎯`
            };
        },
    },
    CHECK_REWARDS: {
        patterns: [
            'check rewards',
            'my rewards',
            'show rewards',
            'view rewards',
            'view my rewards',
            'check my rewards',
            'available rewards'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            const rewards = await getGuestRewards(phoneNumber);
            return formatRewardsMessage(rewards);
        },
    },
    
    // Admin Commands
    ADMIN_INSIGHTS: {
        patterns: [
            'admin insights',
            'admin daily insights',
            'admin stats',
            'admin dashboard',
            'admin daily stats'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            // First verify admin status
            const isAdmin = await isAdminUser(phoneNumber);
            
            if (!isAdmin) {
                return {
                    success: false,
                    message: '🤖 Access denied. This command is only available to verified administrators.'
                };
            }
            
            // Generate insights
            const insightsResult = await getAdminDailyInsights(phoneNumber);
            return formatAdminInsightsMessage(insightsResult);
        },
    },

    ADMIN_HELP: {
        patterns: [
            'admin help',
            'admin commands',
            'admin menu',
            'what admin commands',
            'admin options'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            // First verify admin status
            const isAdmin = await isAdminUser(phoneNumber);
            
            if (!isAdmin) {
                return {
                    success: false,
                    message: '🤖 Access denied. This command is only available to verified administrators.'
                };
            }
            
            return {
                success: true,
                message: getAdminHelpMessage()
            };
        },
    },

    HELP: {
        patterns: [
            'help',
            'menu',
            'what can you do',
            'commands',
            'options',
            'hi',
            'hello',
            'hey',
            'start'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            return {
                success: true,
                message: getHelpMessage()
            };
        },
    },

    // Booking Commands
    MAKE_BOOKING: {
        patterns: [
            'make booking',
            'make a booking',
            'book table',
            'reserve table',
            'book a table',
            'reserve a table',
            'make reservation',
            'table booking'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            const guestName = await getGuestName(phoneNumber);
            return await startBookingFlow(phoneNumber, guestName, locationContext);
        },
    },
    VIEW_BOOKING: {
        patterns: [
            'view booking',
            'my booking',
            'check booking',
            'my reservation',
            'booking status'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            // Check if user has an active booking in progress
            const bookingState = await getBookingState(phoneNumber);
            if (bookingState) {
                return {
                    success: true,
                    message: `🍽️ Your booking in progress:\n\n` +
                            `📅 Date: ${bookingState.date || 'Not set'}\n` +
                            `🕐 Time: ${bookingState.time || 'Not set'}\n` +
                            `📍 Location: ${bookingState.location || 'Not set'}\n` +
                            `🪑 Section: ${bookingState.section || 'Not set'}\n` +
                            `👥 Guests: ${bookingState.numberOfGuests || 'Not set'}\n` +
                            `${bookingState.specialRequests ? `🎉 Special Requests: ${bookingState.specialRequests}\n` : ''}` +
                            `\n📝 Current Step: ${bookingState.step}\n` +
                            `Type "cancel booking" to cancel this booking.`
                };
            }
            
            // Check for completed bookings
            const normalizedPhone = normalizePhoneNumber(phoneNumber);
            const bookingsSnapshot = await rtdb.ref('bookings').once('value');
            const allBookings = bookingsSnapshot.val() || {};
            
            const userBookings = Object.values(allBookings).filter(booking => 
                booking.phoneNumber === normalizedPhone
            );
            
            if (userBookings.length === 0) {
                return {
                    success: true,
                    message: '🤖 You don\'t have any bookings yet. Type "make booking" to create one!'
                };
            }
            
            // Show the most recent booking
            const mostRecentBooking = userBookings.sort((a, b) => b.createdAt - a.createdAt)[0];
            
            return {
                success: true,
                message: `🍽️ Your most recent booking:\n\n` +
                        `📋 Booking ID: ${mostRecentBooking.id}\n` +
                        `📅 Date: ${mostRecentBooking.date}\n` +
                        `🕐 Time: ${mostRecentBooking.time}\n` +
                        `📍 Location: ${mostRecentBooking.location}\n` +
                        `🪑 Section: ${mostRecentBooking.section}\n` +
                        `👥 Guests: ${mostRecentBooking.numberOfGuests}\n` +
                        `${mostRecentBooking.specialRequests ? `🎉 Special Requests: ${mostRecentBooking.specialRequests}\n` : ''}` +
                        `\n⏰ Status: ${mostRecentBooking.status}\n` +
                        `📅 Created: ${formatToSASTDateTime(mostRecentBooking.createdAt)}`
            };
        },
    },
    CANCEL_BOOKING: {
        patterns: [
            'cancel booking',
            'cancel reservation',
            'stop booking',
            'stop reservation'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            await clearBookingState(phoneNumber);
            return {
                success: true,
                message: '🤖 Your booking has been cancelled. Type "make booking" if you\'d like to start again.'
            };
        },
    },

    // Queue Commands
    ADD_TO_QUEUE: {
        patterns: [
            'add me to queue',
            'join queue',
            'add to queue',
            'queue me',
            'join the queue',
            'add me to the queue',
            'queue up',
            'get in line',
            'join line'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            const guestName = await getGuestName(phoneNumber);
            return await startQueueFlow(phoneNumber, guestName, locationContext);
        },
    },
    CHECK_QUEUE_STATUS: {
        patterns: [
            'queue status',
            'check queue',
            'my queue status',
            'where am i in queue',
            'queue position',
            'how long is the wait',
            'queue time'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            return await checkQueueStatus(phoneNumber);
        },
    },
    LEAVE_QUEUE: {
        patterns: [
            'leave queue',
            'remove from queue',
            'exit queue',
            'quit queue',
            'cancel queue',
            'leave the queue'
        ],
        handler: async (phoneNumber, locationContext = null) => {
            return await leaveQueue(phoneNumber);
        },
    },
};

module.exports = {
    processMessage,
    getGuestRewards,
    getGuestPoints,
    cleanupOrphanedReferences,
    formatSingleReward,
    addGuestToQueue,
    COMMANDS
};