const admin = require('firebase-admin');
const { normalizePhoneNumber } = require('./dataManagement');
const {
    cacheQueueMetadata,
    getCachedQueueMetadata,
    cacheQueueEntries,
    getCachedQueueEntries,
    cacheLocationData,
    getCachedLocationData,
    invalidateQueueCache,
    perfMonitor
} = require('./queueCache');

// QMS tier configuration - matches frontend access-control-service.js
const QMS_FEATURE_TIERS = {
    'qmsBasic': 'free',
    'qmsAdvanced': 'starter',
    'qmsWhatsAppIntegration': 'starter',
    'qmsAnalytics': 'professional',
    'qmsAutomation': 'enterprise'
};

const QMS_TIER_LIMITS = {
    'free': {
        queueEntries: 25,
        queueLocations: 1,
        queueHistoryDays: 7
    },
    'starter': {
        queueEntries: 100,
        queueLocations: 2,
        queueHistoryDays: 30
    },
    'professional': {
        queueEntries: 500,
        queueLocations: 5,
        queueHistoryDays: 90
    },
    'enterprise': {
        queueEntries: Infinity,
        queueLocations: Infinity,
        queueHistoryDays: Infinity
    }
};

const TIERS = ['free', 'starter', 'professional', 'enterprise'];

/**
 * Queue Management Firebase Functions
 * Implements FIFO queue system for restaurant guests with tier-based access control
 */

/**
 * Get user's subscription data
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User subscription data
 */
async function getUserSubscription(userId) {
    try {
        const subscriptionSnapshot = await admin.database()
            .ref(`subscriptions/${userId}`)
            .once('value');
        
        return subscriptionSnapshot.val() || { tierId: 'free', status: 'active' };
    } catch (error) {
        console.error('Error getting user subscription:', error);
        return { tierId: 'free', status: 'active' }; // Default to free tier
    }
}

/**
 * Validate QMS feature access for user
 * @param {string} userId - User ID
 * @param {string} featureId - QMS feature ID
 * @returns {Promise<boolean>} Whether user has access to the feature
 */
async function validateQMSFeatureAccess(userId, featureId) {
    try {
        const subscription = await getUserSubscription(userId);
        
        // Check if subscription is active
        if (subscription.status !== 'active' && subscription.status !== 'trial') {
            return false;
        }
        
        // Check direct feature override
        if (subscription.features && subscription.features[featureId] !== undefined) {
            return subscription.features[featureId];
        }
        
        // Check tier-based access
        const requiredTier = QMS_FEATURE_TIERS[featureId] || 'enterprise';
        const userTierIndex = TIERS.indexOf(subscription.tierId || subscription.tier || 'free');
        const requiredTierIndex = TIERS.indexOf(requiredTier);
        
        return userTierIndex >= requiredTierIndex;
    } catch (error) {
        console.error('Error validating QMS feature access:', error);
        return false; // Fail secure
    }
}

/**
 * Get user's resource limit for QMS
 * @param {string} userId - User ID
 * @param {string} limitId - Resource limit ID
 * @returns {Promise<number>} Resource limit value
 */
async function getQMSResourceLimit(userId, limitId) {
    try {
        const subscription = await getUserSubscription(userId);
        
        // Check direct limit override
        if (subscription.limits && subscription.limits[limitId] !== undefined) {
            return subscription.limits[limitId];
        }
        
        // Return tier-based limit
        const tierLimits = QMS_TIER_LIMITS[subscription.tierId || subscription.tier || 'free'] || QMS_TIER_LIMITS.free;
        return tierLimits[limitId] || 0;
    } catch (error) {
        console.error('Error getting QMS resource limit:', error);
        return QMS_TIER_LIMITS.free[limitId] || 0; // Default to free tier limit
    }
}

/**
 * Check if user has reached their queue entry limit for today
 * @param {string} userId - User ID
 * @param {string} locationId - Location ID
 * @returns {Promise<Object>} Usage check result
 */
async function checkQueueEntryLimit(userId, locationId) {
    try {
        const today = getCurrentDate();
        const userLimit = await getQMSResourceLimit(userId, 'queueEntries');
        
        // For unlimited tiers
        if (userLimit === Infinity) {
            return { 
                withinLimit: true, 
                currentUsage: 0, 
                limit: Infinity,
                message: 'Unlimited queue entries' 
            };
        }
        
        // Get today's queue entries added by this user
        const queuePath = getQueuePath(locationId, today);
        const entriesSnapshot = await admin.database().ref(`${queuePath}/entries`).once('value');
        const entries = entriesSnapshot.val() || {};
        
        // Count entries added by this user today
        const userEntriesToday = Object.values(entries).filter(entry => 
            entry.adminUserId === userId && entry.addedBy === 'admin'
        ).length;
        
        const withinLimit = userEntriesToday < userLimit;
        
        return {
            withinLimit,
            currentUsage: userEntriesToday,
            limit: userLimit,
            message: withinLimit 
                ? `${userEntriesToday}/${userLimit} queue entries used today`
                : `Queue entry limit reached (${userLimit}/day). Upgrade to add more entries.`
        };
    } catch (error) {
        console.error('Error checking queue entry limit:', error);
        return { 
            withinLimit: false, 
            currentUsage: 0, 
            limit: 0,
            message: 'Error checking queue limits' 
        };
    }
}

/**
 * Check if user has access to the specified location for QMS
 * @param {string} userId - User ID
 * @param {string} locationId - Location ID
 * @returns {Promise<boolean>} Whether user has location access
 */
async function validateQMSLocationAccess(userId, locationId) {
    try {
        // First check basic location access
        const hasLocationAccess = await validateLocationAccess(userId, locationId);
        if (!hasLocationAccess) {
            return false;
        }
        
        // Then check QMS location limits
        const locationLimit = await getQMSResourceLimit(userId, 'queueLocations');
        
        // For unlimited tiers
        if (locationLimit === Infinity) {
            return true;
        }
        
        // Get user's accessible locations
        const userLocationsSnapshot = await admin.database()
            .ref(`userLocations/${userId}`)
            .once('value');
        
        const userLocations = userLocationsSnapshot.val() || {};
        const accessibleLocationCount = Object.keys(userLocations).length;
        
        return accessibleLocationCount <= locationLimit;
    } catch (error) {
        console.error('Error validating QMS location access:', error);
        return false;
    }
}

/**
 * Get current date in YYYY-MM-DD format
 * @returns {string} Current date string
 */
function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Get queue path for a specific location and date
 * @param {string} locationId - Location identifier
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {string} Firebase path for queue
 */
function getQueuePath(locationId, date = getCurrentDate()) {
    return `queues/${locationId}/${date}`;
}

/**
 * Validate location access for user
 * @param {string} userId - User ID
 * @param {string} locationId - Location ID
 * @returns {Promise<boolean>} Access validation result
 */
async function validateLocationAccess(userId, locationId) {
    try {
        const user = await admin.auth().getUser(userId);
        const customClaims = user.customClaims || {};
        
        // Admin access
        if (customClaims.admin === true) {
            return true;
        }
        
        // Location-specific access
        const locationAccessSnapshot = await admin.database()
            .ref(`userLocations/${userId}/${locationId}`)
            .once('value');
        
        return locationAccessSnapshot.exists();
    } catch (error) {
        console.error('Error validating location access:', error);
        return false;
    }
}

/**
 * Calculate estimated wait time based on queue position
 * @param {number} position - Queue position
 * @param {string} locationId - Location ID
 * @returns {number} Estimated wait time in minutes
 */
function calculateEstimatedWaitTime(position, locationId) {
    // Base service time per party (can be configured per location)
    const averageServiceTime = 15; // minutes
    
    // Current hour adjustment
    const currentHour = new Date().getHours();
    let hourlyMultiplier = 1;
    
    // Peak hours (lunch and dinner)
    if ((currentHour >= 12 && currentHour <= 14) || (currentHour >= 18 && currentHour <= 21)) {
        hourlyMultiplier = 1.5;
    }
    
    // Calculate base wait time
    let estimatedWait = position * averageServiceTime * hourlyMultiplier;
    
    // Round to nearest 5 minutes
    return Math.round(estimatedWait / 5) * 5;
}

/**
 * Recalculate queue positions for all waiting entries
 * @param {string} locationId - Location ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<void>}
 */
async function recalculateQueuePositions(locationId, date = getCurrentDate()) {
    const queuePath = getQueuePath(locationId, date);
    const entriesPath = `${queuePath}/entries`;
    
    try {
        const entriesSnapshot = await admin.database().ref(entriesPath).once('value');
        const entries = entriesSnapshot.val();
        
        if (!entries) return;
        
        // Sort active entries by addedAt timestamp
        const activeEntries = Object.values(entries)
            .filter(entry => entry.status === 'waiting')
            .sort((a, b) => a.addedAt - b.addedAt);
        
        // Update positions and wait times
        const updates = {};
        activeEntries.forEach((entry, index) => {
            const newPosition = index + 1;
            const estimatedWait = calculateEstimatedWaitTime(newPosition, locationId);
            
            updates[`${entriesPath}/${entry.id}/position`] = newPosition;
            updates[`${entriesPath}/${entry.id}/estimatedWaitTime`] = estimatedWait;
        });
        
        // Update queue metadata
        updates[`${queuePath}/metadata/currentCount`] = activeEntries.length;
        updates[`${queuePath}/metadata/updatedAt`] = admin.database.ServerValue.TIMESTAMP;
        
        await admin.database().ref().update(updates);
        
        console.log(`Recalculated positions for ${activeEntries.length} entries in ${locationId} on ${date}`);
    } catch (error) {
        console.error('Error recalculating queue positions:', error);
        throw error;
    }
}

/**
 * Initialize queue metadata for a location/date
 * @param {string} locationId - Location ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<void>}
 */
async function initializeQueueMetadata(locationId, date = getCurrentDate()) {
    const queuePath = getQueuePath(locationId, date);
    const metadataPath = `${queuePath}/metadata`;
    
    try {
        const metadataSnapshot = await admin.database().ref(metadataPath).once('value');
        if (metadataSnapshot.exists()) {
            return; // Already initialized
        }
        
        // Get location info
        const locationSnapshot = await admin.database().ref(`locations/${locationId}`).once('value');
        const locationData = locationSnapshot.val();
        
        // Create a readable location name if none exists
        let locationName = locationData?.name;
        if (!locationName) {
            locationName = locationId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
        
        const metadata = {
            date,
            locationId,
            locationName,
            queueStatus: 'active',
            maxCapacity: 100,
            currentCount: 0,
            estimatedWaitTime: 0,
            createdAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP
        };
        
        await admin.database().ref(metadataPath).set(metadata);
        console.log(`Initialized queue metadata for ${locationId} on ${date}`);
    } catch (error) {
        console.error('Error initializing queue metadata:', error);
        throw error;
    }
}

/**
 * Add guest to queue with tier-based validation
 * @param {Object} guestData - Guest information
 * @returns {Promise<Object>} Queue entry result
 */
async function addGuestToQueue(guestData) {
    const {
        locationId,
        guestName,
        phoneNumber,
        partySize,
        specialRequests = '',
        addedBy = 'guest',
        adminUserId = null
    } = guestData;
    
    try {
        // Validate required fields
        if (!locationId || !guestName || !phoneNumber || !partySize) {
            throw new Error('Missing required fields');
        }
        
        // QMS Tier Validation for admin-added guests
        if (addedBy === 'admin' && adminUserId) {
            // Check if user has access to QMS basic features
            const hasQMSAccess = await validateQMSFeatureAccess(adminUserId, 'qmsBasic');
            if (!hasQMSAccess) {
                return {
                    success: false,
                    message: 'Your subscription does not include queue management features. Please upgrade to add guests to the queue.',
                    requiresUpgrade: true,
                    requiredFeature: 'qmsBasic'
                };
            }
            
            // Check location access limits
            const hasLocationAccess = await validateQMSLocationAccess(adminUserId, locationId);
            if (!hasLocationAccess) {
                return {
                    success: false,
                    message: 'Location access limit reached for your subscription tier. Please upgrade to manage more locations.',
                    requiresUpgrade: true,
                    requiredFeature: 'qmsAdvanced'
                };
            }
            
            // Check daily queue entry limits
            const limitCheck = await checkQueueEntryLimit(adminUserId, locationId);
            if (!limitCheck.withinLimit) {
                return {
                    success: false,
                    message: limitCheck.message,
                    requiresUpgrade: true,
                    requiredFeature: 'qmsAdvanced',
                    usageInfo: {
                        currentUsage: limitCheck.currentUsage,
                        limit: limitCheck.limit
                    }
                };
            }
        }
        
        // Normalize phone number
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        
        // Validate party size
        if (partySize < 1 || partySize > 20) {
            throw new Error('Party size must be between 1 and 20');
        }
        
        const date = getCurrentDate();
        const queuePath = getQueuePath(locationId, date);
        
        // Initialize queue metadata if needed
        await initializeQueueMetadata(locationId, date);
        
        // Check if guest is already in queue
        const entriesSnapshot = await admin.database().ref(`${queuePath}/entries`).once('value');
        const existingEntries = entriesSnapshot.val() || {};
        
        const existingEntry = Object.values(existingEntries).find(entry => 
            entry.phoneNumber === normalizedPhone && entry.status === 'waiting'
        );
        
        if (existingEntry) {
            throw new Error('Guest is already in the queue');
        }
        
        // Get current queue size for position calculation
        const activeEntries = Object.values(existingEntries).filter(entry => entry.status === 'waiting');
        const position = activeEntries.length + 1;
        const estimatedWait = calculateEstimatedWaitTime(position, locationId);
        
        // Generate entry ID
        const entryRef = admin.database().ref(`${queuePath}/entries`).push();
        const entryId = entryRef.key;
        
        // Create queue entry
        const queueEntry = {
            id: entryId,
            position,
            guestName,
            phoneNumber: normalizedPhone,
            partySize,
            specialRequests,
            status: 'waiting',
            estimatedWaitTime: estimatedWait,
            addedAt: admin.database.ServerValue.TIMESTAMP,
            updatedAt: admin.database.ServerValue.TIMESTAMP,
            addedBy,
            adminUserId,
            notificationsSent: {
                added: false,
                positionUpdate: false,
                called: false,
                reminder: false
            }
        };
        
        // Update database
        const updates = {};
        updates[`${queuePath}/entries/${entryId}`] = queueEntry;
        updates[`${queuePath}/metadata/currentCount`] = position;
        updates[`${queuePath}/metadata/updatedAt`] = admin.database.ServerValue.TIMESTAMP;
        
        await admin.database().ref().update(updates);
        
        // Invalidate cache for this queue
        invalidateQueueCache(locationId, date);
        
        console.log(`Added ${guestName} to queue at position ${position} for ${locationId}`);
        
        return {
            success: true,
            queueEntry: {
                id: entryId,
                position,
                estimatedWaitTime: estimatedWait
            },
            message: `You have been added to the queue at position ${position}. Estimated wait time: ${estimatedWait} minutes.`
        };
        
    } catch (error) {
        console.error('Error adding guest to queue:', error);
        return {
            success: false,
            message: error.message || 'Failed to add guest to queue'
        };
    }
}

/**
 * Remove guest from queue
 * @param {Object} removeData - Removal information
 * @returns {Promise<Object>} Removal result
 */
async function removeGuestFromQueue(removeData) {
    const {
        locationId,
        entryId,
        reason = 'cancelled',
        adminUserId = null
    } = removeData;
    
    try {
        const date = getCurrentDate();
        const queuePath = getQueuePath(locationId, date);
        const entryPath = `${queuePath}/entries/${entryId}`;
        
        // Get entry details
        const entrySnapshot = await admin.database().ref(entryPath).once('value');
        if (!entrySnapshot.exists()) {
            throw new Error('Queue entry not found');
        }
        
        const entry = entrySnapshot.val();
        
        // Update entry status
        const updates = {};
        updates[`${entryPath}/status`] = 'removed';
        updates[`${entryPath}/removedAt`] = admin.database.ServerValue.TIMESTAMP;
        updates[`${entryPath}/removalReason`] = reason;
        if (adminUserId) {
            updates[`${entryPath}/removedBy`] = adminUserId;
        }
        
        await admin.database().ref().update(updates);
        
        // Invalidate cache for this queue
        invalidateQueueCache(locationId, date);
        
        // Recalculate positions for remaining entries
        await recalculateQueuePositions(locationId, date);
        
        console.log(`Removed ${entry.guestName} from queue (${reason}) for ${locationId}`);
        
        return {
            success: true,
            message: `Guest has been removed from the queue (${reason})`
        };
        
    } catch (error) {
        console.error('Error removing guest from queue:', error);
        return {
            success: false,
            message: error.message || 'Failed to remove guest from queue'
        };
    }
}

/**
 * Update queue entry status
 * @param {Object} updateData - Update information
 * @returns {Promise<Object>} Update result
 */
async function updateQueueEntryStatus(updateData) {
    const {
        locationId,
        entryId,
        status,
        adminUserId = null
    } = updateData;
    
    try {
        const date = getCurrentDate();
        const queuePath = getQueuePath(locationId, date);
        const entryPath = `${queuePath}/entries/${entryId}`;
        
        // Get entry details
        const entrySnapshot = await admin.database().ref(entryPath).once('value');
        if (!entrySnapshot.exists()) {
            throw new Error('Queue entry not found');
        }
        
        const entry = entrySnapshot.val();
        
        // Validate status transition
        const validStatuses = ['waiting', 'called', 'seated', 'removed'];
        if (!validStatuses.includes(status)) {
            throw new Error('Invalid status');
        }
        
        // Update entry
        const updates = {};
        updates[`${entryPath}/status`] = status;
        updates[`${entryPath}/updatedAt`] = admin.database.ServerValue.TIMESTAMP;
        
        if (status === 'called') {
            updates[`${entryPath}/calledAt`] = admin.database.ServerValue.TIMESTAMP;
        } else if (status === 'seated') {
            updates[`${entryPath}/seatedAt`] = admin.database.ServerValue.TIMESTAMP;
        }
        
        if (adminUserId) {
            updates[`${entryPath}/lastUpdatedBy`] = adminUserId;
        }
        
        await admin.database().ref().update(updates);
        
        // Invalidate cache for this queue
        invalidateQueueCache(locationId, date);
        
        // Recalculate positions if status changed to non-waiting
        if (status !== 'waiting') {
            await recalculateQueuePositions(locationId, date);
        }
        
        console.log(`Updated ${entry.guestName} status to ${status} for ${locationId}`);
        
        return {
            success: true,
            updatedEntry: {
                ...entry,
                status,
                updatedAt: Date.now()
            },
            message: `Queue entry status updated to ${status}`
        };
        
    } catch (error) {
        console.error('Error updating queue entry status:', error);
        return {
            success: false,
            message: error.message || 'Failed to update queue entry status'
        };
    }
}

/**
 * Get queue status for a location with tier-based access validation
 * @param {string} locationId - Location ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} userId - User ID for access validation
 * @returns {Promise<Object>} Queue status
 */
async function getQueueStatus(locationId, date = getCurrentDate(), userId = null) {
    const endMeasurement = perfMonitor.startMeasurement('getQueueStatus');
    
    try {
        // QMS Tier Validation for authenticated users
        if (userId) {
            // Check if user has access to QMS basic features
            const hasQMSAccess = await validateQMSFeatureAccess(userId, 'qmsBasic');
            if (!hasQMSAccess) {
                endMeasurement(false);
                return {
                    success: false,
                    message: 'Your subscription does not include queue management features. Please upgrade to view queue status.',
                    requiresUpgrade: true,
                    requiredFeature: 'qmsBasic'
                };
            }
            
            // Check location access
            const hasLocationAccess = await validateQMSLocationAccess(userId, locationId);
            if (!hasLocationAccess) {
                endMeasurement(false);
                return {
                    success: false,
                    message: 'Location access limit reached for your subscription tier. Please upgrade to manage more locations.',
                    requiresUpgrade: true,
                    requiredFeature: 'qmsAdvanced'
                };
            }
        }
        
        const queuePath = getQueuePath(locationId, date);
        
        // Try to get cached data first
        let metadata = getCachedQueueMetadata(locationId, date);
        let entries = getCachedQueueEntries(locationId, date);
        
        // If cache miss, fetch from database
        if (!metadata || !entries) {
            const [metadataSnapshot, entriesSnapshot] = await Promise.all([
                admin.database().ref(`${queuePath}/metadata`).once('value'),
                admin.database().ref(`${queuePath}/entries`).once('value')
            ]);
            
            metadata = metadataSnapshot.val() || {};
            entries = entriesSnapshot.val() || {};
            
            // Cache the results
            cacheQueueMetadata(locationId, date, metadata);
            cacheQueueEntries(locationId, date, entries);
        }
        
        // Process entries
        const entryList = Object.values(entries).sort((a, b) => a.position - b.position);
        
        // Calculate statistics
        const statistics = {
            total: entryList.length,
            waiting: entryList.filter(e => e.status === 'waiting').length,
            called: entryList.filter(e => e.status === 'called').length,
            seated: entryList.filter(e => e.status === 'seated').length,
            removed: entryList.filter(e => e.status === 'removed').length
        };
        
        endMeasurement(true);
        
        return {
            success: true,
            queueData: {
                metadata,
                entries: entryList,
                statistics
            }
        };
        
    } catch (error) {
        endMeasurement(false);
        console.error('Error getting queue status:', error);
        return {
            success: false,
            message: error.message || 'Failed to get queue status'
        };
    }
}

/**
 * Perform bulk queue operations with tier-based validation
 * @param {Object} bulkData - Bulk operation data
 * @returns {Promise<Object>} Bulk operation result
 */
async function bulkQueueOperations(bulkData) {
    const {
        locationId,
        operations,
        adminUserId
    } = bulkData;
    
    try {
        // QMS Tier Validation for admin operations
        if (adminUserId) {
            // Check if user has access to QMS advanced features (bulk operations)
            const hasAdvancedAccess = await validateQMSFeatureAccess(adminUserId, 'qmsAdvanced');
            if (!hasAdvancedAccess) {
                return {
                    success: false,
                    message: 'Bulk operations require advanced queue management features. Please upgrade to perform bulk operations.',
                    requiresUpgrade: true,
                    requiredFeature: 'qmsAdvanced'
                };
            }
            
            // Check location access
            const hasLocationAccess = await validateQMSLocationAccess(adminUserId, locationId);
            if (!hasLocationAccess) {
                return {
                    success: false,
                    message: 'Location access limit reached for your subscription tier. Please upgrade to manage more locations.',
                    requiresUpgrade: true,
                    requiredFeature: 'qmsAdvanced'
                };
            }
        }
        
        const results = [];
        
        for (const operation of operations) {
            const { type, entryId, reason } = operation;
            
            let result;
            if (type === 'call') {
                result = await updateQueueEntryStatus({
                    locationId,
                    entryId,
                    status: 'called',
                    adminUserId
                });
            } else if (type === 'seat') {
                result = await updateQueueEntryStatus({
                    locationId,
                    entryId,
                    status: 'seated',
                    adminUserId
                });
            } else if (type === 'remove') {
                result = await removeGuestFromQueue({
                    locationId,
                    entryId,
                    reason,
                    adminUserId
                });
            }
            
            results.push({ entryId, type, result });
        }
        
        return {
            success: true,
            results,
            message: `Completed ${operations.length} bulk operations`
        };
        
    } catch (error) {
        console.error('Error performing bulk operations:', error);
        return {
            success: false,
            message: error.message || 'Failed to perform bulk operations'
        };
    }
}

/**
 * Get guest's queue position by phone number
 * @param {string} phoneNumber - Guest's phone number
 * @param {string} locationId - Location ID
 * @returns {Promise<Object>} Guest's queue position
 */
async function getGuestQueuePosition(phoneNumber, locationId) {
    try {
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        const date = getCurrentDate();
        const queuePath = getQueuePath(locationId, date);
        
        const entriesSnapshot = await admin.database().ref(`${queuePath}/entries`).once('value');
        const entries = entriesSnapshot.val() || {};
        
        const guestEntry = Object.values(entries).find(entry => 
            entry.phoneNumber === normalizedPhone && entry.status === 'waiting'
        );
        
        if (!guestEntry) {
            return {
                success: false,
                message: 'You are not currently in the queue'
            };
        }
        
        return {
            success: true,
            queueEntry: {
                id: guestEntry.id,
                position: guestEntry.position,
                estimatedWaitTime: guestEntry.estimatedWaitTime,
                status: guestEntry.status,
                addedAt: guestEntry.addedAt
            },
            message: `You are at position ${guestEntry.position} with an estimated wait time of ${guestEntry.estimatedWaitTime} minutes`
        };
        
    } catch (error) {
        console.error('Error getting guest queue position:', error);
        return {
            success: false,
            message: error.message || 'Failed to get queue position'
        };
    }
}

/**
 * Get QMS tier information for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} QMS tier information
 */
async function getQMSTierInfo(userId) {
    try {
        const subscription = await getUserSubscription(userId);
        const tierLimits = QMS_TIER_LIMITS[subscription.tierId || subscription.tier || 'free'] || QMS_TIER_LIMITS.free;
        
        // Get feature access
        const featureAccess = {};
        for (const [feature, requiredTier] of Object.entries(QMS_FEATURE_TIERS)) {
            featureAccess[feature] = await validateQMSFeatureAccess(userId, feature);
        }
        
        return {
            success: true,
            tierInfo: {
                currentTier: subscription.tierId || subscription.tier || 'free',
                status: subscription.status,
                limits: tierLimits,
                features: featureAccess
            }
        };
    } catch (error) {
        console.error('Error getting QMS tier info:', error);
        return {
            success: false,
            message: 'Failed to get tier information'
        };
    }
}

/**
 * Get QMS usage statistics for a user
 * @param {string} userId - User ID
 * @param {string} locationId - Location ID
 * @returns {Promise<Object>} QMS usage statistics
 */
async function getQMSUsageStats(userId, locationId) {
    try {
        // Check if user has access to QMS analytics
        const hasAnalyticsAccess = await validateQMSFeatureAccess(userId, 'qmsAnalytics');
        if (!hasAnalyticsAccess) {
            return {
                success: false,
                message: 'Analytics features require Professional plan or higher. Please upgrade to view detailed usage statistics.',
                requiresUpgrade: true,
                requiredFeature: 'qmsAnalytics'
            };
        }
        
        const today = getCurrentDate();
        const limitCheck = await checkQueueEntryLimit(userId, locationId);
        
        // Get historical usage (last 30 days)
        const stats = {
            today: {
                usage: limitCheck.currentUsage,
                limit: limitCheck.limit,
                percentage: limitCheck.limit === Infinity ? 0 : (limitCheck.currentUsage / limitCheck.limit) * 100
            },
            tier: {
                current: (await getUserSubscription(userId)).tierId || (await getUserSubscription(userId)).tier || 'free',
                limits: QMS_TIER_LIMITS[(await getUserSubscription(userId)).tierId || (await getUserSubscription(userId)).tier || 'free'] || QMS_TIER_LIMITS.free
            }
        };
        
        return {
            success: true,
            usageStats: stats
        };
    } catch (error) {
        console.error('Error getting QMS usage stats:', error);
        return {
            success: false,
            message: 'Failed to get usage statistics'
        };
    }
}

/**
 * Validate WhatsApp integration access for QMS
 * @param {string} userId - User ID
 * @returns {Promise<Object>} WhatsApp integration validation result
 */
async function validateQMSWhatsAppIntegration(userId) {
    try {
        const hasWhatsAppAccess = await validateQMSFeatureAccess(userId, 'qmsWhatsAppIntegration');
        
        if (!hasWhatsAppAccess) {
            return {
                success: false,
                message: 'WhatsApp integration requires Starter plan or higher. Please upgrade to send WhatsApp notifications.',
                requiresUpgrade: true,
                requiredFeature: 'qmsWhatsAppIntegration'
            };
        }
        
        return {
            success: true,
            message: 'WhatsApp integration is available for your subscription'
        };
    } catch (error) {
        console.error('Error validating WhatsApp integration:', error);
        return {
            success: false,
            message: 'Failed to validate WhatsApp integration access'
        };
    }
}

module.exports = {
    addGuestToQueue,
    removeGuestFromQueue,
    updateQueueEntryStatus,
    getQueueStatus,
    bulkQueueOperations,
    getGuestQueuePosition,
    recalculateQueuePositions,
    initializeQueueMetadata,
    getCurrentDate,
    getQueuePath,
    
    // New QMS tier management functions
    getUserSubscription,
    validateQMSFeatureAccess,
    getQMSResourceLimit,
    checkQueueEntryLimit,
    validateQMSLocationAccess,
    getQMSTierInfo,
    getQMSUsageStats,
    validateQMSWhatsAppIntegration
};