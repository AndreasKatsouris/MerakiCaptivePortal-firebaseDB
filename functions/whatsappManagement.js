/**
 * WhatsApp Management Cloud Functions
 * Version: 1.0.0-2025-07-17
 * 
 * Cloud Functions for managing WhatsApp numbers and location assignments
 * Includes tier-based validation and admin controls
 */

const { 
    admin,
    auth,
    rtdb, 
    ref, 
    get, 
    set, 
    update, 
    push,
    remove
} = require('./config/firebase-admin');

const {
    initializeWhatsAppSchema,
    createWhatsAppNumber,
    assignWhatsAppToLocation,
    getWhatsAppByLocation,
    getLocationByWhatsApp,
    trackWhatsAppMessage,
    getWhatsAppTierLimits,
    validateWhatsAppAssignment,
    WHATSAPP_TIER_LIMITS,
    WHATSAPP_NUMBER_STATUS,
    MESSAGE_TYPES
} = require('./utils/whatsappDatabaseSchema');

/**
 * Validate admin access
 * @param {string} userId - User ID to validate
 * @returns {Promise<boolean>} True if user is admin
 */
async function validateAdminAccess(userId) {
    try {
        // Check custom claims
        const userRecord = await admin.auth().getUser(userId);
        if (userRecord.customClaims?.admin === true) {
            return true;
        }
        
        // Check admin-claims database
        const adminClaimsRef = ref(rtdb, `admin-claims/${userId}`);
        const snapshot = await get(adminClaimsRef);
        
        return snapshot.exists();
        
    } catch (error) {
        console.error('❌ Error validating admin access:', error);
        return false;
    }
}

/**
 * Get WhatsApp numbers for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of WhatsApp numbers
 */
async function getUserWhatsAppNumbers(userId) {
    try {
        const whatsappNumbersRef = ref(rtdb, 'whatsapp-numbers');
        const snapshot = await get(whatsappNumbersRef);
        
        if (!snapshot.exists()) {
            return [];
        }
        
        const whatsappNumbers = snapshot.val();
        const userNumbers = [];
        
        for (const [numberId, numberData] of Object.entries(whatsappNumbers)) {
            if (numberData.userId === userId) {
                userNumbers.push({
                    id: numberId,
                    ...numberData
                });
            }
        }
        
        return userNumbers;
        
    } catch (error) {
        console.error('❌ Error getting user WhatsApp numbers:', error);
        return [];
    }
}

/**
 * Get location mappings for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of location mappings
 */
async function getUserLocationMappings(userId) {
    try {
        const mappingsRef = ref(rtdb, 'location-whatsapp-mapping');
        const snapshot = await get(mappingsRef);
        
        if (!snapshot.exists()) {
            return [];
        }
        
        const mappings = snapshot.val();
        const userMappings = [];
        
        for (const [locationId, mappingData] of Object.entries(mappings)) {
            if (mappingData.userId === userId) {
                userMappings.push({
                    locationId,
                    ...mappingData
                });
            }
        }
        
        return userMappings;
        
    } catch (error) {
        console.error('❌ Error getting user location mappings:', error);
        return [];
    }
}

/**
 * Cloud Function: Initialize WhatsApp Schema
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function initializeWhatsAppSchemaFunction(req, res) {
    try {
        const userId = req.user?.uid;
        
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Check admin access
        const isAdmin = await validateAdminAccess(userId);
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const result = await initializeWhatsAppSchema();
        
        res.json({
            success: true,
            message: 'WhatsApp schema initialized successfully',
            result
        });
        
    } catch (error) {
        console.error('❌ Error in initializeWhatsAppSchemaFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Cloud Function: Create WhatsApp Number
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function createWhatsAppNumberFunction(req, res) {
    try {
        const userId = req.user?.uid;
        const { phoneNumber, displayName, metadata } = req.body;
        
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (!phoneNumber || !displayName) {
            return res.status(400).json({ error: 'Phone number and display name are required' });
        }
        
        // Validate WhatsApp assignment
        const validation = await validateWhatsAppAssignment(userId, null);
        if (!validation.isValid) {
            return res.status(400).json({ 
                error: validation.message,
                reason: validation.reason,
                upgradeRequired: validation.upgradeRequired,
                recommendedTier: validation.recommendedTier
            });
        }
        
        const result = await createWhatsAppNumber(phoneNumber, displayName, userId, metadata);
        
        res.json({
            success: true,
            message: 'WhatsApp number created successfully',
            whatsappNumber: result
        });
        
    } catch (error) {
        console.error('❌ Error in createWhatsAppNumberFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Cloud Function: Assign WhatsApp to Location
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function assignWhatsAppToLocationFunction(req, res) {
    try {
        const userId = req.user?.uid;
        const { locationId, whatsappNumberId } = req.body;
        
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (!locationId || !whatsappNumberId) {
            return res.status(400).json({ error: 'Location ID and WhatsApp number ID are required' });
        }
        
        // Validate WhatsApp assignment
        const validation = await validateWhatsAppAssignment(userId, locationId);
        if (!validation.isValid) {
            return res.status(400).json({ 
                error: validation.message,
                reason: validation.reason,
                upgradeRequired: validation.upgradeRequired,
                recommendedTier: validation.recommendedTier
            });
        }
        
        const result = await assignWhatsAppToLocation(locationId, whatsappNumberId, userId);
        
        res.json({
            success: true,
            message: 'WhatsApp number assigned to location successfully',
            mapping: result.mapping
        });
        
    } catch (error) {
        console.error('❌ Error in assignWhatsAppToLocationFunction:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
}

/**
 * Cloud Function: Get WhatsApp by Location
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function getWhatsAppByLocationFunction(req, res) {
    try {
        const userId = req.user?.uid;
        const { locationId } = req.query;
        
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (!locationId) {
            return res.status(400).json({ error: 'Location ID is required' });
        }
        
        // Validate user has access to this location
        const locationRef = ref(rtdb, `locations/${locationId}`);
        const locationSnapshot = await get(locationRef);
        
        if (!locationSnapshot.exists()) {
            return res.status(404).json({ error: 'Location not found' });
        }
        
        const locationData = locationSnapshot.val();
        const isAdmin = await validateAdminAccess(userId);
        
        if (!isAdmin && locationData.ownerId !== userId) {
            return res.status(403).json({ error: 'Access denied to this location' });
        }
        
        const result = await getWhatsAppByLocation(locationId);
        
        res.json({
            success: true,
            whatsappData: result
        });
        
    } catch (error) {
        console.error('❌ Error in getWhatsAppByLocationFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Cloud Function: Get Location by WhatsApp
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function getLocationByWhatsAppFunction(req, res) {
    try {
        const userId = req.user?.uid;
        const { phoneNumber } = req.query;
        
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }
        
        const result = await getLocationByWhatsApp(phoneNumber);
        
        if (!result) {
            return res.status(404).json({ error: 'Location not found for this WhatsApp number' });
        }
        
        // Validate user has access to this location
        const isAdmin = await validateAdminAccess(userId);
        
        if (!isAdmin && result.mapping.userId !== userId) {
            return res.status(403).json({ error: 'Access denied to this location' });
        }
        
        res.json({
            success: true,
            locationData: result
        });
        
    } catch (error) {
        console.error('❌ Error in getLocationByWhatsAppFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Cloud Function: Get User WhatsApp Numbers
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function getUserWhatsAppNumbersFunction(req, res) {
    try {
        const userId = req.user?.uid;
        
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const whatsappNumbers = await getUserWhatsAppNumbers(userId);
        const locationMappings = await getUserLocationMappings(userId);
        const tierLimits = await getWhatsAppTierLimits(userId);
        
        res.json({
            success: true,
            whatsappNumbers,
            locationMappings,
            tierLimits,
            usage: {
                numbersUsed: whatsappNumbers.length,
                numbersLimit: tierLimits.whatsappNumbers,
                locationsWithWhatsApp: locationMappings.length
            }
        });
        
    } catch (error) {
        console.error('❌ Error in getUserWhatsAppNumbersFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Cloud Function: Get WhatsApp Analytics
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function getWhatsAppAnalyticsFunction(req, res) {
    try {
        const userId = req.user?.uid;
        const { locationId, startDate, endDate } = req.query;
        
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Check analytics access
        const tierLimits = await getWhatsAppTierLimits(userId);
        if (!tierLimits.analyticsAccess) {
            return res.status(403).json({ 
                error: 'Analytics access not available in your current plan',
                upgradeRequired: true,
                recommendedTier: 'professional'
            });
        }
        
        // Validate location access
        if (locationId) {
            const locationRef = ref(rtdb, `locations/${locationId}`);
            const locationSnapshot = await get(locationRef);
            
            if (!locationSnapshot.exists()) {
                return res.status(404).json({ error: 'Location not found' });
            }
            
            const locationData = locationSnapshot.val();
            const isAdmin = await validateAdminAccess(userId);
            
            if (!isAdmin && locationData.ownerId !== userId) {
                return res.status(403).json({ error: 'Access denied to this location' });
            }
        }
        
        // Get analytics data
        const analyticsRef = ref(rtdb, 'whatsapp-message-history');
        const snapshot = await get(analyticsRef);
        
        if (!snapshot.exists()) {
            return res.json({
                success: true,
                analytics: {
                    totalMessages: 0,
                    messagesByType: {},
                    messagesByLocation: {},
                    messagesByDate: {}
                }
            });
        }
        
        const messages = snapshot.val();
        const analytics = {
            totalMessages: 0,
            messagesByType: {},
            messagesByLocation: {},
            messagesByDate: {}
        };
        
        // Filter messages by date range and location
        const startTimestamp = startDate ? new Date(startDate).getTime() : 0;
        const endTimestamp = endDate ? new Date(endDate).getTime() : Date.now();
        
        for (const [messageId, messageData] of Object.entries(messages)) {
            // Skip if not in date range
            if (messageData.timestamp < startTimestamp || messageData.timestamp > endTimestamp) {
                continue;
            }
            
            // Skip if location filter doesn't match
            if (locationId && messageData.locationId !== locationId) {
                continue;
            }
            
            // Validate user has access to this message's location
            const messageLocationRef = ref(rtdb, `locations/${messageData.locationId}`);
            const messageLocationSnapshot = await get(messageLocationRef);
            
            if (messageLocationSnapshot.exists()) {
                const messageLocationData = messageLocationSnapshot.val();
                const isAdmin = await validateAdminAccess(userId);
                
                if (!isAdmin && messageLocationData.ownerId !== userId) {
                    continue; // Skip messages from locations user doesn't own
                }
            }
            
            analytics.totalMessages++;
            
            // Count by message type
            analytics.messagesByType[messageData.messageType] = 
                (analytics.messagesByType[messageData.messageType] || 0) + 1;
            
            // Count by location
            analytics.messagesByLocation[messageData.locationId] = 
                (analytics.messagesByLocation[messageData.locationId] || 0) + 1;
            
            // Count by date
            const messageDate = new Date(messageData.timestamp).toISOString().split('T')[0];
            analytics.messagesByDate[messageDate] = 
                (analytics.messagesByDate[messageDate] || 0) + 1;
        }
        
        res.json({
            success: true,
            analytics
        });
        
    } catch (error) {
        console.error('❌ Error in getWhatsAppAnalyticsFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Cloud Function: Remove WhatsApp Number
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function removeWhatsAppNumberFunction(req, res) {
    try {
        const userId = req.user?.uid;
        const { whatsappNumberId } = req.body;
        
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        if (!whatsappNumberId) {
            return res.status(400).json({ error: 'WhatsApp number ID is required' });
        }
        
        // Validate user owns this WhatsApp number
        const whatsappNumberRef = ref(rtdb, `whatsapp-numbers/${whatsappNumberId}`);
        const whatsappNumberSnapshot = await get(whatsappNumberRef);
        
        if (!whatsappNumberSnapshot.exists()) {
            return res.status(404).json({ error: 'WhatsApp number not found' });
        }
        
        const whatsappNumberData = whatsappNumberSnapshot.val();
        const isAdmin = await validateAdminAccess(userId);
        
        if (!isAdmin && whatsappNumberData.userId !== userId) {
            return res.status(403).json({ error: 'Access denied to this WhatsApp number' });
        }
        
        // Remove all location mappings for this number
        const mappingsRef = ref(rtdb, 'location-whatsapp-mapping');
        const mappingsSnapshot = await get(mappingsRef);
        
        if (mappingsSnapshot.exists()) {
            const mappings = mappingsSnapshot.val();
            const updatesMap = {};
            
            for (const [locationId, mappingData] of Object.entries(mappings)) {
                if (mappingData.whatsappNumberId === whatsappNumberId) {
                    updatesMap[locationId] = null; // Remove mapping
                }
            }
            
            if (Object.keys(updatesMap).length > 0) {
                await update(mappingsRef, updatesMap);
            }
        }
        
        // Remove WhatsApp number
        await remove(whatsappNumberRef);
        
        res.json({
            success: true,
            message: 'WhatsApp number removed successfully'
        });
        
    } catch (error) {
        console.error('❌ Error in removeWhatsAppNumberFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

module.exports = {
    initializeWhatsAppSchemaFunction,
    createWhatsAppNumberFunction,
    assignWhatsAppToLocationFunction,
    getWhatsAppByLocationFunction,
    getLocationByWhatsAppFunction,
    getUserWhatsAppNumbersFunction,
    getWhatsAppAnalyticsFunction,
    removeWhatsAppNumberFunction,
    validateAdminAccess,
    getUserWhatsAppNumbers,
    getUserLocationMappings
};