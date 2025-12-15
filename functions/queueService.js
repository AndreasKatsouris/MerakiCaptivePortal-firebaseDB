const {
    admin,
    rtdb,
    ref,
    get,
    set,
    update,
    push
} = require('./config/firebase-admin');
const { sendWhatsAppMessage } = require('./utils/whatsappClient');

/**
 * Normalize phone number format by removing + prefix and whatsapp: prefix
 * @param {string} phoneNumber - Phone number to normalize  
 * @returns {string} Normalized phone number with + prefix for international numbers
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
 * Call next guest in queue (mark as called and send notification)
 * @param {string} locationId - Location ID
 * @param {string} entryId - Queue entry ID
 * @param {string} adminUserId - Admin user ID
 * @returns {Promise<Object>} Result object
 */
async function callNextGuest(locationId, entryId, adminUserId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const entryPath = `queues/${locationId}/${today}/entries/${entryId}`;
        
        // Get current entry data
        const entrySnapshot = await get(ref(rtdb, entryPath));
        const entryData = entrySnapshot.val();
        
        if (!entryData) {
            return {
                success: false,
                message: 'Queue entry not found'
            };
        }
        
        if (entryData.status !== 'waiting') {
            return {
                success: false,
                message: `Guest is already ${entryData.status}`
            };
        }
        
        // Update entry status to called
        await update(ref(rtdb, entryPath), {
            status: 'called',
            calledAt: Date.now(),
            updatedAt: Date.now(),
            calledByAdmin: adminUserId
        });
        
        // Send WhatsApp notification to guest
        const phoneNumber = entryData.phoneNumber;
        const locationName = entryData.locationName || locationId;
        
        const notificationMessage = `🍽️ Your table is ready!\n\n` +
            `📍 Location: ${locationName}\n` +
            `👥 Party size: ${entryData.partySize}\n` +
            `🕐 Please arrive within 10 minutes\n\n` +
            `Thank you for your patience! 🎉`;
        
        await sendWhatsAppMessage(phoneNumber, notificationMessage);
        
        // Mark notification as sent
        await update(ref(rtdb, `${entryPath}/notificationsSent`), {
            called: true
        });
        
        console.log(`✅ Guest ${entryData.guestName} called for table at ${locationName}`);
        
        return {
            success: true,
            message: `Guest ${entryData.guestName} has been called and notified`,
            guestData: entryData
        };
        
    } catch (error) {
        console.error('Error calling next guest:', error);
        return {
            success: false,
            message: 'Error calling guest: ' + error.message
        };
    }
}

/**
 * Mark guest as seated and remove from active queue
 * @param {string} locationId - Location ID
 * @param {string} entryId - Queue entry ID
 * @param {string} adminUserId - Admin user ID
 * @returns {Promise<Object>} Result object
 */
async function seatGuest(locationId, entryId, adminUserId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const entryPath = `queues/${locationId}/${today}/entries/${entryId}`;
        
        // Get current entry data
        const entrySnapshot = await get(ref(rtdb, entryPath));
        const entryData = entrySnapshot.val();
        
        if (!entryData) {
            return {
                success: false,
                message: 'Queue entry not found'
            };
        }
        
        // Update entry status to seated
        await update(ref(rtdb, entryPath), {
            status: 'seated',
            seatedAt: Date.now(),
            updatedAt: Date.now(),
            seatedByAdmin: adminUserId
        });
        
        // Send confirmation message to guest
        const phoneNumber = entryData.phoneNumber;
        const locationName = entryData.locationName || locationId;
        
        const confirmationMessage = `✅ Enjoy your meal at ${locationName}!\n\n` +
            `Thank you for using our queue system. Have a wonderful dining experience! 🍽️✨`;
        
        await sendWhatsAppMessage(phoneNumber, confirmationMessage);
        
        // Recalculate queue positions for remaining guests
        await recalculateQueuePositions(locationId, today);
        
        console.log(`✅ Guest ${entryData.guestName} seated at ${locationName}`);
        
        return {
            success: true,
            message: `Guest ${entryData.guestName} has been seated`,
            guestData: entryData
        };
        
    } catch (error) {
        console.error('Error seating guest:', error);
        return {
            success: false,
            message: 'Error seating guest: ' + error.message
        };
    }
}

/**
 * Remove guest from queue (no-show, cancellation, etc.)
 * @param {string} locationId - Location ID
 * @param {string} entryId - Queue entry ID
 * @param {string} reason - Reason for removal
 * @param {string} adminUserId - Admin user ID
 * @returns {Promise<Object>} Result object
 */
async function removeGuestFromQueue(locationId, entryId, reason, adminUserId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const entryPath = `queues/${locationId}/${today}/entries/${entryId}`;
        
        // Get current entry data
        const entrySnapshot = await get(ref(rtdb, entryPath));
        const entryData = entrySnapshot.val();
        
        if (!entryData) {
            return {
                success: false,
                message: 'Queue entry not found'
            };
        }
        
        // Update entry status to removed
        await update(ref(rtdb, entryPath), {
            status: 'removed',
            removedAt: Date.now(),
            updatedAt: Date.now(),
            removeReason: reason,
            removedByAdmin: adminUserId
        });
        
        // Send notification to guest if appropriate
        if (reason === 'no_show') {
            const phoneNumber = entryData.phoneNumber;
            const locationName = entryData.locationName || locationId;
            
            const notificationMessage = `⏰ Your table reservation at ${locationName} has expired.\n\n` +
                `Unfortunately, we had to release your table due to the 10-minute arrival window. ` +
                `You're welcome to rejoin the queue if you'd still like to dine with us!\n\n` +
                `Type "add me to queue" to rejoin. 🍽️`;
            
            await sendWhatsAppMessage(phoneNumber, notificationMessage);
        }
        
        // Recalculate queue positions for remaining guests
        await recalculateQueuePositions(locationId, today);
        
        console.log(`✅ Guest ${entryData.guestName} removed from queue at ${locationName} - Reason: ${reason}`);
        
        return {
            success: true,
            message: `Guest ${entryData.guestName} has been removed from queue`,
            guestData: entryData
        };
        
    } catch (error) {
        console.error('Error removing guest from queue:', error);
        return {
            success: false,
            message: 'Error removing guest: ' + error.message
        };
    }
}

/**
 * Recalculate queue positions after a guest is removed or seated
 * @param {string} locationId - Location ID
 * @param {string} date - Date string (YYYY-MM-DD)
 */
async function recalculateQueuePositions(locationId, date) {
    try {
        const queuePath = `queues/${locationId}/${date}/entries`;
        const entriesSnapshot = await get(ref(rtdb, queuePath));
        const entries = entriesSnapshot.val();
        
        if (!entries) return;
        
        // Get all waiting entries and sort by addedAt timestamp
        const waitingEntries = Object.values(entries)
            .filter(entry => entry.status === 'waiting')
            .sort((a, b) => a.addedAt - b.addedAt);
        
        // Update positions and wait times
        const updates = {};
        waitingEntries.forEach((entry, index) => {
            const newPosition = index + 1;
            const newWaitTime = Math.max(5, newPosition * 15); // 15 minutes per position
            
            updates[`${queuePath}/${entry.id}/position`] = newPosition;
            updates[`${queuePath}/${entry.id}/estimatedWaitTime`] = newWaitTime;
            updates[`${queuePath}/${entry.id}/updatedAt`] = Date.now();
        });
        
        // Apply all updates
        if (Object.keys(updates).length > 0) {
            await update(ref(rtdb), updates);
        }
        
        // Update queue metadata
        await update(ref(rtdb, `queues/${locationId}/${date}/metadata`), {
            currentCount: waitingEntries.length,
            updatedAt: Date.now()
        });
        
        console.log(`✅ Queue positions recalculated for ${locationId} on ${date}`);
        
    } catch (error) {
        console.error('Error recalculating queue positions:', error);
    }
}

/**
 * Get queue status for a location
 * @param {string} locationId - Location ID
 * @param {string} date - Date string (YYYY-MM-DD), defaults to today
 * @returns {Promise<Object>} Queue status
 */
async function getQueueStatus(locationId, date = null) {
    try {
        const targetDate = date || new Date().toISOString().split('T')[0];
        const queuePath = `queues/${locationId}/${targetDate}`;
        
        const queueSnapshot = await get(ref(rtdb, queuePath));
        const queueData = queueSnapshot.val();
        
        if (!queueData) {
            return {
                success: true,
                queue: {
                    metadata: {
                        date: targetDate,
                        locationId: locationId,
                        queueStatus: 'inactive',
                        currentCount: 0
                    },
                    entries: []
                }
            };
        }
        
        // Convert entries to array and sort by position
        const entries = Object.values(queueData.entries || {})
            .sort((a, b) => a.position - b.position);
        
        return {
            success: true,
            queue: {
                metadata: queueData.metadata,
                entries: entries
            }
        };
        
    } catch (error) {
        console.error('Error getting queue status:', error);
        return {
            success: false,
            message: 'Error getting queue status: ' + error.message
        };
    }
}

/**
 * Send position update notifications to guests
 * @param {string} locationId - Location ID
 * @param {string} date - Date string (YYYY-MM-DD)
 */
async function sendPositionUpdateNotifications(locationId, date) {
    try {
        const queuePath = `queues/${locationId}/${date}/entries`;
        const entriesSnapshot = await get(ref(rtdb, queuePath));
        const entries = entriesSnapshot.val();
        
        if (!entries) return;
        
        // Get waiting entries that haven't been notified of position updates
        const waitingEntries = Object.values(entries)
            .filter(entry => 
                entry.status === 'waiting' && 
                !entry.notificationsSent?.positionUpdate &&
                entry.position <= 5 // Only notify guests in top 5 positions
            );
        
        // Send notifications
        for (const entry of waitingEntries) {
            const phoneNumber = entry.phoneNumber;
            const locationName = entry.locationName || locationId;
            
            const updateMessage = `🎯 Queue Update - ${locationName}\n\n` +
                `📊 Your position: ${entry.position}\n` +
                `⏰ Estimated wait: ${entry.estimatedWaitTime} minutes\n` +
                `👥 Party size: ${entry.partySize}\n\n` +
                `We'll notify you when your table is ready! 🍽️`;
            
            await sendWhatsAppMessage(phoneNumber, updateMessage);
            
            // Mark notification as sent
            await update(ref(rtdb, `${queuePath}/${entry.id}/notificationsSent`), {
                positionUpdate: true
            });
        }
        
        console.log(`✅ Position update notifications sent for ${locationId} on ${date}`);
        
    } catch (error) {
        console.error('Error sending position update notifications:', error);
    }
}

/**
 * Clean up old queue entries (automated maintenance)
 * @param {number} daysToKeep - Number of days to keep queue data
 */
async function cleanupOldQueues(daysToKeep = 7) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        const queuesRef = ref(rtdb, 'queues');
        const snapshot = await get(queuesRef);
        const allQueues = snapshot.val() || {};
        
        const updates = {};
        
        Object.keys(allQueues).forEach(locationId => {
            Object.keys(allQueues[locationId]).forEach(dateString => {
                const queueDate = new Date(dateString);
                if (queueDate < cutoffDate) {
                    // Move to archive before deletion
                    const queueData = allQueues[locationId][dateString];
                    const summary = generateQueueSummary(queueData);
                    
                    updates[`queue-history/${locationId}/${dateString}`] = summary;
                    updates[`queues/${locationId}/${dateString}`] = null;
                }
            });
        });
        
        if (Object.keys(updates).length > 0) {
            await update(ref(rtdb), updates);
            console.log(`✅ Cleaned up ${Object.keys(updates).length / 2} old queue entries`);
        }
        
    } catch (error) {
        console.error('Error cleaning up old queues:', error);
    }
}

/**
 * Generate queue summary for historical data
 * @param {Object} queueData - Queue data
 * @returns {Object} Queue summary
 */
function generateQueueSummary(queueData) {
    const entries = Object.values(queueData.entries || {});
    
    const summary = {
        date: queueData.metadata?.date,
        locationId: queueData.metadata?.locationId,
        locationName: queueData.metadata?.locationName,
        totalQueued: entries.length,
        totalSeated: entries.filter(e => e.status === 'seated').length,
        totalRemoved: entries.filter(e => e.status === 'removed').length,
        totalCalled: entries.filter(e => e.status === 'called').length,
        averageWaitTime: calculateAverageWaitTime(entries),
        peakQueueSize: queueData.metadata?.maxCapacity || 0,
        generatedAt: Date.now()
    };
    
    return summary;
}

/**
 * Calculate average wait time for seated guests
 * @param {Array} entries - Queue entries
 * @returns {number} Average wait time in minutes
 */
function calculateAverageWaitTime(entries) {
    const seatedEntries = entries.filter(e => e.status === 'seated' && e.seatedAt && e.addedAt);
    
    if (seatedEntries.length === 0) return 0;
    
    const totalWaitTime = seatedEntries.reduce((sum, entry) => {
        const waitTime = (entry.seatedAt - entry.addedAt) / 1000 / 60; // Convert to minutes
        return sum + waitTime;
    }, 0);
    
    return Math.round(totalWaitTime / seatedEntries.length);
}

module.exports = {
    callNextGuest,
    seatGuest,
    removeGuestFromQueue,
    recalculateQueuePositions,
    getQueueStatus,
    sendPositionUpdateNotifications,
    cleanupOldQueues,
    generateQueueSummary
};