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

const { client, twilioPhone } = require('./twilioClient');

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
        
        const isAdmin = await validateAdminAccess(userId);
        
        if (!isAdmin) {
            return res.status(403).json({ error: 'Only administrators can delete WhatsApp numbers' });
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

/**
 * Cloud Function: Get WhatsApp Template Config
 * Admin-only. Returns all template config rows.
 */
async function getWhatsAppTemplateConfigFunction(req, res) {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const isAdmin = await validateAdminAccess(userId);
        if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

        const configRef = ref(rtdb, 'whatsapp-template-config');
        const snapshot = await get(configRef);

        res.json({
            success: true,
            config: snapshot.exists() ? snapshot.val() : {}
        });
    } catch (error) {
        console.error('❌ Error in getWhatsAppTemplateConfigFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Cloud Function: Update WhatsApp Template Config
 * Admin-only. Saves contentSid + enabled for one template key.
 */
async function updateWhatsAppTemplateConfigFunction(req, res) {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const isAdmin = await validateAdminAccess(userId);
        if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

        const { templateKey, contentSid, enabled } = req.body;

        if (!templateKey) {
            return res.status(400).json({ error: 'templateKey is required' });
        }

        // Validate ContentSid format if provided
        if (contentSid && contentSid.trim() !== '') {
            const sid = contentSid.trim();
            if (!/^HX[a-f0-9]{32}$/.test(sid)) {
                return res.status(400).json({
                    error: 'Invalid ContentSid format. Must be HX followed by 32 hex characters.'
                });
            }
        }

        const configRef = ref(rtdb, `whatsapp-template-config/${templateKey}`);
        await update(configRef, {
            contentSid: (contentSid && contentSid.trim()) ? contentSid.trim() : null,
            enabled: Boolean(enabled)
        });

        res.json({ success: true, message: 'Template config updated' });
    } catch (error) {
        console.error('❌ Error in updateWhatsAppTemplateConfigFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

const TEST_VARIABLE_SAMPLES = {
    booking_confirmation: { "1":"Test Guest","2":"BK-TEST001","3":"2026-02-25","4":"19:00","5":"Test Restaurant","6":"Main","7":"2","8":"None","9":"confirmed" },
    booking_status_update: { "1":"✅","2":"Test Guest","3":"Your booking has been confirmed.","4":"BK-TEST001","5":"2026-02-25","6":"19:00","7":"Test Restaurant","8":"Main","9":"2","10":"None" },
    booking_reminder: { "1":"Test Guest","2":"2026-02-25","3":"19:00","4":"Test Restaurant","5":"2" },
    receipt_confirmation: { "1":"Test Guest","2":"• 50 points earned","3":"150" },
    welcome_message: { "1":"Test Guest" },
    queue_manual_addition: { "1":"Test Guest","2":"Test Restaurant","3":"3","4":"2","5":"15","6":"None" },
    admin_new_booking_notification: { "1":"Admin","2":"Test Guest","3":"BK-TEST001","4":"2026-02-25","5":"19:00","6":"Test Restaurant","7":"Main","8":"2","9":"+27000000000","10":"None" }
};

/**
 * Cloud Function: Send WhatsApp Test Message
 * Admin-only. Fires a real template send with sample variables.
 */
async function sendWhatsAppTestMessageFunction(req, res) {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const isAdmin = await validateAdminAccess(userId);
        if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

        const { templateKey, toPhone } = req.body;

        if (!templateKey || !toPhone) {
            return res.status(400).json({ error: 'templateKey and toPhone are required' });
        }

        const configRef = ref(rtdb, `whatsapp-template-config/${templateKey}`);
        const snapshot = await get(configRef);

        if (!snapshot.exists() || !snapshot.val().contentSid) {
            return res.status(400).json({ error: 'Template has no ContentSid configured' });
        }

        const config = snapshot.val();
        const contentVariables = TEST_VARIABLE_SAMPLES[templateKey] || { "1": "Test" };

        const whatsappTo = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;

        try {
            const message = await client.messages.create({
                contentSid: config.contentSid,
                contentVariables: JSON.stringify(contentVariables),
                from: `whatsapp:${twilioPhone}`,
                to: whatsappTo
            });

            res.json({
                success: true,
                messageSid: message.sid,
                status: message.status
            });
        } catch (twilioError) {
            // Return full Twilio error — do NOT swallow
            res.status(twilioError.status || 400).json({
                success: false,
                twilioError: {
                    code: twilioError.code,
                    message: twilioError.message,
                    moreInfo: twilioError.moreInfo || null,
                    status: twilioError.status || null
                }
            });
        }

    } catch (error) {
        console.error('❌ Error in sendWhatsAppTestMessageFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Cloud Function: Add WhatsApp Template Config
 * Admin-only. Creates a new template config entry.
 */
async function addWhatsAppTemplateConfigFunction(req, res) {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const isAdmin = await validateAdminAccess(userId);
        if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

        const { templateKey, name, contentSid, enabled } = req.body;

        if (!templateKey) {
            return res.status(400).json({ error: 'templateKey is required' });
        }

        // Validate templateKey format to prevent RTDB path injection
        if (!/^[a-z0-9_]{3,50}$/.test(templateKey)) {
            return res.status(400).json({
                error: 'Invalid templateKey format. Must be 3-50 characters, lowercase letters, digits, and underscores only.'
            });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }

        // Validate ContentSid format if provided
        if (contentSid && contentSid.trim() !== '') {
            const sid = contentSid.trim();
            if (!/^HX[a-f0-9]{32}$/.test(sid)) {
                return res.status(400).json({
                    error: 'Invalid ContentSid format. Must be HX followed by 32 hex characters.'
                });
            }
        }

        // Prevent overwriting an existing template key
        const configRef = ref(rtdb, `whatsapp-template-config/${templateKey}`);
        const existingSnapshot = await get(configRef);
        if (existingSnapshot.exists()) {
            return res.status(409).json({
                error: `Template key "${templateKey}" already exists. Use updateWhatsAppTemplateConfig to modify it.`
            });
        }

        const now = Date.now();
        const configEntry = {
            name: name.trim(),
            contentSid: (contentSid && contentSid.trim()) ? contentSid.trim() : null,
            enabled: Boolean(enabled),
            createdAt: now,
            createdBy: userId,
            updatedAt: now,
            updatedBy: userId
        };

        await set(configRef, configEntry);

        res.json({
            success: true,
            templateKey,
            config: configEntry
        });
    } catch (error) {
        console.error('❌ Error in addWhatsAppTemplateConfigFunction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Cloud Function: Delete WhatsApp Template Config
 * Admin-only. Removes a template config entry.
 */
async function deleteWhatsAppTemplateConfigFunction(req, res) {
    try {
        const userId = req.user?.uid;
        if (!userId) return res.status(401).json({ error: 'Authentication required' });

        const isAdmin = await validateAdminAccess(userId);
        if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

        const { templateKey } = req.body;

        if (!templateKey) {
            return res.status(400).json({ error: 'templateKey is required' });
        }

        // Validate templateKey format to prevent RTDB path injection
        if (!/^[a-z0-9_]{3,50}$/.test(templateKey)) {
            return res.status(400).json({
                error: 'Invalid templateKey format.'
            });
        }

        const configRef = ref(rtdb, `whatsapp-template-config/${templateKey}`);
        const snapshot = await get(configRef);

        if (!snapshot.exists()) {
            return res.status(404).json({ error: `Template key "${templateKey}" not found.` });
        }

        await remove(configRef);

        res.json({ success: true, templateKey });
    } catch (error) {
        console.error('❌ Error in deleteWhatsAppTemplateConfigFunction:', error);
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
    getWhatsAppTemplateConfigFunction,
    updateWhatsAppTemplateConfigFunction,
    addWhatsAppTemplateConfigFunction,
    deleteWhatsAppTemplateConfigFunction,
    sendWhatsAppTestMessageFunction,
    validateAdminAccess,
    getUserWhatsAppNumbers,
    getUserLocationMappings
};