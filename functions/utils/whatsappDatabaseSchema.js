/**
 * WhatsApp Multi-Location Database Schema
 * Version: 1.0.0-2025-07-17
 * 
 * Handles database schema for location-specific WhatsApp numbers
 * Integrates with existing tier management system
 */

const { rtdb, ref, get, set, update, remove, push, serverTimestamp } = require('../config/firebase-admin');

// WhatsApp tier-based limits
const WHATSAPP_TIER_LIMITS = {
  free: {
    whatsappNumbers: 0,
    messagesPerMonth: 0,
    locationsAllowed: 0,
    analyticsAccess: false,
    broadcastSupport: false
  },
  starter: {
    whatsappNumbers: 1,
    messagesPerMonth: 1000,
    locationsAllowed: 2,
    analyticsAccess: false,
    broadcastSupport: false
  },
  professional: {
    whatsappNumbers: 3,
    messagesPerMonth: 5000,
    locationsAllowed: 5,
    analyticsAccess: true,
    broadcastSupport: true
  },
  enterprise: {
    whatsappNumbers: 20,
    messagesPerMonth: -1, // Unlimited
    locationsAllowed: -1, // Unlimited
    analyticsAccess: true,
    broadcastSupport: true
  }
};

// WhatsApp number status types
const WHATSAPP_NUMBER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING_VERIFICATION: 'pending_verification',
  VERIFICATION_FAILED: 'verification_failed'
};

// Message types for tracking
const MESSAGE_TYPES = {
  QUEUE_NOTIFICATION: 'queue_notification',
  BOOKING_CONFIRMATION: 'booking_confirmation',
  BOOKING_REMINDER: 'booking_reminder',
  RECEIPT_CONFIRMATION: 'receipt_confirmation',
  WELCOME_MESSAGE: 'welcome_message',
  CONSENT_PROMPT: 'consent_prompt',
  BROADCAST: 'broadcast',
  GENERAL: 'general'
};

/**
 * Initialize WhatsApp database schema
 * Creates all necessary database structures
 */
async function initializeWhatsAppSchema() {
  try {
    console.log('🔄 Initializing WhatsApp database schema...');
    
    // Initialize WhatsApp numbers collection
    const whatsappNumbersRef = ref(rtdb, 'whatsapp-numbers');
    const whatsappNumbersSnapshot = await get(whatsappNumbersRef);
    
    if (!whatsappNumbersSnapshot.exists()) {
      await set(whatsappNumbersRef, {
        _initialized: {
          timestamp: serverTimestamp(),
          version: '1.0.0'
        }
      });
      console.log('✅ WhatsApp numbers collection initialized');
    }
    
    // Initialize location-whatsapp mapping
    const locationMappingRef = ref(rtdb, 'location-whatsapp-mapping');
    const locationMappingSnapshot = await get(locationMappingRef);
    
    if (!locationMappingSnapshot.exists()) {
      await set(locationMappingRef, {
        _initialized: {
          timestamp: serverTimestamp(),
          version: '1.0.0'
        }
      });
      console.log('✅ Location-WhatsApp mapping initialized');
    }
    
    // Initialize WhatsApp tier limits
    const whatsappTierLimitsRef = ref(rtdb, 'whatsapp-tier-limits');
    const whatsappTierLimitsSnapshot = await get(whatsappTierLimitsRef);
    
    if (!whatsappTierLimitsSnapshot.exists()) {
      await set(whatsappTierLimitsRef, WHATSAPP_TIER_LIMITS);
      console.log('✅ WhatsApp tier limits initialized');
    }
    
    // Initialize WhatsApp message history
    const messageHistoryRef = ref(rtdb, 'whatsapp-message-history');
    const messageHistorySnapshot = await get(messageHistoryRef);
    
    if (!messageHistorySnapshot.exists()) {
      await set(messageHistoryRef, {
        _initialized: {
          timestamp: serverTimestamp(),
          version: '1.0.0'
        }
      });
      console.log('✅ WhatsApp message history initialized');
    }
    
    console.log('✅ WhatsApp database schema initialization complete');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Failed to initialize WhatsApp database schema:', error);
    throw error;
  }
}

/**
 * Create WhatsApp number record
 * @param {string} phoneNumber - WhatsApp number in E.164 format
 * @param {string} displayName - Display name for the number
 * @param {string} userId - User ID who owns this number
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} Created WhatsApp number record
 */
async function createWhatsAppNumber(phoneNumber, displayName, userId, metadata = {}) {
  try {
    const whatsappNumberId = phoneNumber.replace(/\+/g, '').replace(/\s/g, '');
    
    const whatsappNumberData = {
      id: whatsappNumberId,
      phoneNumber: phoneNumber,
      displayName: displayName,
      userId: userId,
      status: WHATSAPP_NUMBER_STATUS.PENDING_VERIFICATION,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isActive: true,
      twilioConfiguration: {
        accountSid: null,
        authToken: null,
        messagingServiceSid: null,
        webhookUrl: null,
        statusCallbackUrl: null
      },
      usage: {
        messagesThisMonth: 0,
        lastMessageAt: null,
        totalMessages: 0,
        locationsAssigned: 0
      },
      metadata: {
        ...metadata,
        createdBy: userId,
        platform: 'MerakiCaptivePortal'
      }
    };
    
    const whatsappNumberRef = ref(rtdb, `whatsapp-numbers/${whatsappNumberId}`);
    await set(whatsappNumberRef, whatsappNumberData);
    
    console.log(`✅ WhatsApp number ${phoneNumber} created successfully`);
    return whatsappNumberData;
    
  } catch (error) {
    console.error('❌ Failed to create WhatsApp number:', error);
    throw error;
  }
}

/**
 * Assign WhatsApp number to location
 * @param {string} locationId - Location ID
 * @param {string} whatsappNumberId - WhatsApp number ID
 * @param {string} userId - User ID performing the assignment
 * @returns {Promise<Object>} Assignment result
 */
async function assignWhatsAppToLocation(locationId, whatsappNumberId, userId) {
  try {
    // Validate user has access to this location
    const locationRef = ref(rtdb, `locations/${locationId}`);
    const locationSnapshot = await get(locationRef);
    
    if (!locationSnapshot.exists()) {
      throw new Error('Location not found');
    }
    
    const locationData = locationSnapshot.val();
    if (locationData.ownerId !== userId) {
      throw new Error('User does not have permission to assign WhatsApp to this location');
    }
    
    // Validate WhatsApp number exists and belongs to user
    const whatsappNumberRef = ref(rtdb, `whatsapp-numbers/${whatsappNumberId}`);
    const whatsappNumberSnapshot = await get(whatsappNumberRef);
    
    if (!whatsappNumberSnapshot.exists()) {
      throw new Error('WhatsApp number not found');
    }
    
    const whatsappNumberData = whatsappNumberSnapshot.val();
    if (whatsappNumberData.userId !== userId) {
      throw new Error('User does not have permission to assign this WhatsApp number');
    }
    
    // Check if WhatsApp number is already assigned to another location
    const existingMappingRef = ref(rtdb, 'location-whatsapp-mapping');
    const existingMappingSnapshot = await get(existingMappingRef);
    
    if (existingMappingSnapshot.exists()) {
      const existingMappings = existingMappingSnapshot.val();
      for (const [existingLocationId, mapping] of Object.entries(existingMappings)) {
        if (mapping.whatsappNumberId === whatsappNumberId && existingLocationId !== locationId) {
          throw new Error('WhatsApp number is already assigned to another location');
        }
      }
    }
    
    // Check for existing mapping to preserve data
    const mappingRef = ref(rtdb, `location-whatsapp-mapping/${locationId}`);
    const currentMappingSnapshot = await get(mappingRef);
    
    // Create base mapping data
    const baseMappingData = {
      locationId: locationId,
      whatsappNumberId: whatsappNumberId,
      phoneNumber: whatsappNumberData.phoneNumber,
      displayName: whatsappNumberData.displayName,
      userId: userId,
      assignedAt: serverTimestamp(),
      isActive: true,
      locationName: locationData.name,
      locationAddress: locationData.address || '',
      configuration: {
        autoResponder: true,
        businessHours: {
          enabled: false,
          monday: { start: '09:00', end: '17:00' },
          tuesday: { start: '09:00', end: '17:00' },
          wednesday: { start: '09:00', end: '17:00' },
          thursday: { start: '09:00', end: '17:00' },
          friday: { start: '09:00', end: '17:00' },
          saturday: { start: '09:00', end: '17:00' },
          sunday: { start: '09:00', end: '17:00' }
        }
      },
      analytics: {
        messagesReceived: 0,
        messagesSent: 0,
        lastActivity: null,
        popularMessageTypes: {}
      }
    };
    
    // If mapping exists, preserve existing data and only update necessary fields
    if (currentMappingSnapshot.exists()) {
      const existingMapping = currentMappingSnapshot.val();
      
      // Preserve existing analytics and configuration if they exist
      const mappingData = {
        ...existingMapping,
        ...baseMappingData,
        // Preserve existing analytics data
        analytics: {
          ...baseMappingData.analytics,
          ...existingMapping.analytics
        },
        // Preserve existing configuration data
        configuration: {
          ...baseMappingData.configuration,
          ...existingMapping.configuration
        },
        // Ensure both active field variations are set for compatibility
        isActive: true,
        active: true,
        // Update assignment timestamp
        lastUpdatedAt: serverTimestamp()
      };
      
      await update(mappingRef, mappingData);
      console.log(`✅ Updated existing WhatsApp mapping for location ${locationId} with proper active status`);
    } else {
      // No existing mapping, create new one with both active field variations
      const newMappingData = {
        ...baseMappingData,
        isActive: true,
        active: true // Add compatibility field
      };
      
      await set(mappingRef, newMappingData);
      console.log(`✅ Created new WhatsApp mapping for location ${locationId} with proper active status`);
    }
    
    // Update WhatsApp number usage
    const whatsappUsageRef = ref(rtdb, `whatsapp-numbers/${whatsappNumberId}/usage`);
    await update(whatsappUsageRef, {
      locationsAssigned: (whatsappNumberData.usage?.locationsAssigned || 0) + 1
    });
    
    console.log(`✅ WhatsApp number ${whatsappNumberData.phoneNumber} assigned to location ${locationId}`);
    
    // Return the appropriate mapping data
    const finalMappingData = currentMappingSnapshot.exists() 
      ? { ...currentMappingSnapshot.val(), ...baseMappingData, lastUpdatedAt: Date.now() }
      : baseMappingData;
    
    return { success: true, mapping: finalMappingData };
    
  } catch (error) {
    console.error('❌ Failed to assign WhatsApp to location:', error);
    throw error;
  }
}

/**
 * Get WhatsApp number by location
 * @param {string} locationId - Location ID
 * @returns {Promise<Object|null>} WhatsApp number data or null
 */
async function getWhatsAppByLocation(locationId) {
  try {
    const mappingRef = ref(rtdb, `location-whatsapp-mapping/${locationId}`);
    const mappingSnapshot = await get(mappingRef);
    
    if (!mappingSnapshot.exists()) {
      return null;
    }
    
    const mappingData = mappingSnapshot.val();
    
    // Get full WhatsApp number data
    const whatsappNumberRef = ref(rtdb, `whatsapp-numbers/${mappingData.whatsappNumberId}`);
    const whatsappNumberSnapshot = await get(whatsappNumberRef);
    
    if (!whatsappNumberSnapshot.exists()) {
      return null;
    }
    
    return {
      mapping: mappingData,
      whatsappNumber: whatsappNumberSnapshot.val()
    };
    
  } catch (error) {
    console.error('❌ Failed to get WhatsApp by location:', error);
    return null;
  }
}

/**
 * Get location by WhatsApp number
 * @param {string} phoneNumber - WhatsApp number in E.164 format
 * @returns {Promise<Object|null>} Location data or null
 */
async function getLocationByWhatsApp(phoneNumber) {
  try {
    console.log(`🔍 DEBUG: Looking for location with WhatsApp number: ${phoneNumber}`);
    
    const mappingRef = ref(rtdb, 'location-whatsapp-mapping');
    const mappingSnapshot = await get(mappingRef);
    
    if (!mappingSnapshot.exists()) {
      console.log('🔍 DEBUG: No location-whatsapp-mapping found in database');
      return null;
    }
    
    const mappings = mappingSnapshot.val();
    console.log('🔍 DEBUG: Found mappings:', Object.keys(mappings));
    
    // Find location by phone number - handle both isActive and active fields
    for (const [locationId, mapping] of Object.entries(mappings)) {
      console.log(`🔍 DEBUG: Checking location ${locationId}: ${mapping.phoneNumber} (isActive: ${mapping.isActive}, active: ${mapping.active})`);
      
      if (mapping.phoneNumber === phoneNumber) {
        // Check both isActive and active fields for compatibility
        const isActiveValue = mapping.isActive !== undefined ? mapping.isActive : mapping.active;
        
        console.log(`🔍 DEBUG: Phone number match! Active status: ${isActiveValue}`);
        
        if (isActiveValue === true) {
          console.log(`✅ DEBUG: Found active mapping for location ${locationId}`);
          return {
            locationId: locationId,
            mapping: mapping
          };
        } else {
          console.log(`⚠️ DEBUG: Mapping found but not active for location ${locationId}`);
        }
      }
    }
    
    console.log('🔍 DEBUG: No active mapping found for phone number');
    return null;
    
  } catch (error) {
    console.error('❌ Failed to get location by WhatsApp:', error);
    return null;
  }
}

/**
 * Track WhatsApp message
 * @param {string} locationId - Location ID
 * @param {string} messageType - Message type from MESSAGE_TYPES
 * @param {string} direction - 'inbound' or 'outbound'
 * @param {Object} messageData - Message data
 * @returns {Promise<Object>} Tracking result
 */
async function trackWhatsAppMessage(locationId, messageType, direction, messageData) {
  try {
    const newMessageRef = push(rtdb, 'whatsapp-message-history');
    const messageId = newMessageRef.key;
    
    const messageRecord = {
      id: messageId,
      locationId: locationId,
      messageType: messageType,
      direction: direction,
      timestamp: serverTimestamp(),
      phoneNumber: messageData.phoneNumber,
      content: messageData.content,
      twilioSid: messageData.twilioSid || null,
      status: messageData.status || 'delivered',
      metadata: messageData.metadata || {}
    };
    
    const messageRef = ref(rtdb, `whatsapp-message-history/${messageId}`);
    await set(messageRef, messageRecord);
    
    // Update location mapping analytics
    const mappingRef = ref(rtdb, `location-whatsapp-mapping/${locationId}/analytics`);
    const mappingSnapshot = await get(mappingRef);
    
    if (mappingSnapshot.exists()) {
      const analytics = mappingSnapshot.val();
      const updates = {
        lastActivity: serverTimestamp(),
        [`popular_message_types/${messageType}`]: (analytics.popularMessageTypes?.[messageType] || 0) + 1
      };
      
      if (direction === 'inbound') {
        updates.messagesReceived = (analytics.messagesReceived || 0) + 1;
      } else {
        updates.messagesSent = (analytics.messagesSent || 0) + 1;
      }
      
      await update(mappingRef, updates);
    }
    
    return { success: true, messageId: messageId };
    
  } catch (error) {
    console.error('❌ Failed to track WhatsApp message:', error);
    throw error;
  }
}

/**
 * Get WhatsApp tier limits for user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Tier limits
 */
async function getWhatsAppTierLimits(userId) {
  try {
    // Get user subscription
    const subscriptionRef = ref(rtdb, `subscriptions/${userId}`);
    const subscriptionSnapshot = await get(subscriptionRef);
    
    let tierLimits = WHATSAPP_TIER_LIMITS.free; // Default to free tier
    
    if (subscriptionSnapshot.exists()) {
      const subscription = subscriptionSnapshot.val();
      // Use 'tierId' field as the primary field, fallback to 'tier'
      const tierId = subscription.tierId || subscription.tier || 'free';
      tierLimits = WHATSAPP_TIER_LIMITS[tierId] || WHATSAPP_TIER_LIMITS.free;
    }
    
    return tierLimits;
    
  } catch (error) {
    console.error('❌ Failed to get WhatsApp tier limits:', error);
    return WHATSAPP_TIER_LIMITS.free;
  }
}

/**
 * Validate WhatsApp number assignment
 * @param {string} userId - User ID
 * @param {string} locationId - Location ID
 * @returns {Promise<Object>} Validation result
 */
async function validateWhatsAppAssignment(userId, locationId) {
  try {
    const tierLimits = await getWhatsAppTierLimits(userId);
    
    // Check if user has WhatsApp access
    if (tierLimits.whatsappNumbers === 0) {
      return {
        isValid: false,
        reason: 'whatsapp_not_available',
        message: 'WhatsApp integration is not available in your current plan',
        upgradeRequired: true,
        recommendedTier: 'starter'
      };
    }
    
    // Check current usage
    const whatsappNumbersRef = ref(rtdb, 'whatsapp-numbers');
    const whatsappNumbersSnapshot = await get(whatsappNumbersRef);
    
    let currentUsage = 0;
    if (whatsappNumbersSnapshot.exists()) {
      const whatsappNumbers = whatsappNumbersSnapshot.val();
      currentUsage = Object.values(whatsappNumbers).filter(num => num.userId === userId).length;
    }
    
    if (currentUsage >= tierLimits.whatsappNumbers) {
      return {
        isValid: false,
        reason: 'whatsapp_limit_reached',
        message: `You have reached your WhatsApp number limit (${tierLimits.whatsappNumbers})`,
        upgradeRequired: true,
        recommendedTier: tierLimits.whatsappNumbers === 1 ? 'professional' : 'enterprise'
      };
    }
    
    // Check location access
    const locationRef = ref(rtdb, `locations/${locationId}`);
    const locationSnapshot = await get(locationRef);
    
    if (!locationSnapshot.exists()) {
      return {
        isValid: false,
        reason: 'location_not_found',
        message: 'Location not found',
        upgradeRequired: false
      };
    }
    
    const locationData = locationSnapshot.val();
    if (locationData.ownerId !== userId) {
      return {
        isValid: false,
        reason: 'location_access_denied',
        message: 'You do not have access to this location',
        upgradeRequired: false
      };
    }
    
    return {
      isValid: true,
      currentUsage: currentUsage,
      limit: tierLimits.whatsappNumbers,
      remaining: tierLimits.whatsappNumbers - currentUsage
    };
    
  } catch (error) {
    console.error('❌ Failed to validate WhatsApp assignment:', error);
    return {
      isValid: false,
      reason: 'validation_error',
      message: 'Failed to validate WhatsApp assignment',
      upgradeRequired: false
    };
  }
}

module.exports = {
  // Schema initialization
  initializeWhatsAppSchema,
  
  // WhatsApp number management
  createWhatsAppNumber,
  assignWhatsAppToLocation,
  getWhatsAppByLocation,
  getLocationByWhatsApp,
  
  // Message tracking
  trackWhatsAppMessage,
  
  // Tier management
  getWhatsAppTierLimits,
  validateWhatsAppAssignment,
  
  // Constants
  WHATSAPP_TIER_LIMITS,
  WHATSAPP_NUMBER_STATUS,
  MESSAGE_TYPES
};