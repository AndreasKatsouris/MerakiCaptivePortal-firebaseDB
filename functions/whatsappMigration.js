/**
 * WhatsApp Multi-Location Migration Strategy
 * Version: 1.0.0-2025-07-17
 * 
 * Handles migration from single platform-wide WhatsApp number to multi-location system
 * Provides utilities to migrate existing setup to location-specific numbers
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
    WHATSAPP_NUMBER_STATUS
} = require('./utils/whatsappDatabaseSchema');

const { twilioPhone } = require('./twilioClient');

/**
 * Migration status tracking
 */
const MIGRATION_STATUS = {
    NOT_STARTED: 'not_started',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

/**
 * Check if migration is needed
 * @returns {Promise<Object>} Migration status
 */
async function checkMigrationStatus() {
    try {
        // Check if WhatsApp schema exists
        const whatsappNumbersRef = ref(rtdb, 'whatsapp-numbers');
        const whatsappNumbersSnapshot = await get(whatsappNumbersRef);
        
        // Check if location mappings exist
        const locationMappingsRef = ref(rtdb, 'location-whatsapp-mapping');
        const locationMappingsSnapshot = await get(locationMappingsRef);
        
        // Check if migration status exists
        const migrationStatusRef = ref(rtdb, 'whatsapp-migration-status');
        const migrationStatusSnapshot = await get(migrationStatusRef);
        
        const migrationStatus = migrationStatusSnapshot.exists() ? 
            migrationStatusSnapshot.val() : { status: MIGRATION_STATUS.NOT_STARTED };
        
        const needsMigration = !whatsappNumbersSnapshot.exists() || !locationMappingsSnapshot.exists();
        const isCompleted = migrationStatus.status === MIGRATION_STATUS.COMPLETED;
        
        return {
            needsMigration: needsMigration,
            schemaExists: whatsappNumbersSnapshot.exists(),
            hasMappings: locationMappingsSnapshot.exists(),
            migrationStatus: migrationStatus,
            platformNumber: twilioPhone,
            canMigrate: needsMigration && !isCompleted && twilioPhone,
            existingNumber: twilioPhone,
            status: twilioPhone ? 'active' : 'not_configured',
            message: isCompleted ? 'Migration already completed' : 
                    !twilioPhone ? 'No TWILIO_PHONE environment variable configured' :
                    needsMigration ? 'Ready to migrate existing WhatsApp configuration' :
                    'WhatsApp multi-location system already set up'
        };
        
    } catch (error) {
        console.error('❌ Error checking migration status:', error);
        return {
            needsMigration: true,
            schemaExists: false,
            hasMappings: false,
            migrationStatus: { status: MIGRATION_STATUS.NOT_STARTED },
            error: error.message
        };
    }
}

/**
 * Start migration process
 * @param {Object} options - Migration options
 * @param {string} options.displayName - Display name for the migrated number
 * @param {string} options.description - Description for the migrated number
 * @returns {Promise<Object>} Migration result
 */
async function startMigration(options = {}) {
    try {
        console.log('🚀 Starting WhatsApp multi-location migration...');
        
        // Update migration status
        const migrationStatusRef = ref(rtdb, 'whatsapp-migration-status');
        await set(migrationStatusRef, {
            status: MIGRATION_STATUS.IN_PROGRESS,
            startedAt: admin.database.ServerValue.TIMESTAMP,
            platformNumber: twilioPhone
        });
        
        // Initialize WhatsApp schema
        console.log('📋 Initializing WhatsApp schema...');
        await initializeWhatsAppSchema();
        
        // Create platform default number
        console.log('📞 Creating platform default WhatsApp number...');
        const displayName = options.displayName || 'Platform Default';
        const description = options.description || 'Migrated from existing platform configuration';
        
        const defaultNumber = await createWhatsAppNumber(
            twilioPhone,
            displayName,
            'system', // System user
            {
                isPlatformDefault: true,
                migratedAt: admin.database.ServerValue.TIMESTAMP,
                description: description
            }
        );
        
        console.log('✅ Platform default number created:', defaultNumber.phoneNumber);
        
        // Get all users and their locations
        console.log('📍 Discovering user locations...');
        const userLocations = await getUserLocations();
        
        // Create migration plan
        const migrationPlan = {
            totalUsers: userLocations.length,
            totalLocations: userLocations.reduce((sum, user) => sum + user.locations.length, 0),
            usersProcessed: 0,
            locationsProcessed: 0,
            errors: []
        };
        
        console.log('📋 Migration plan:', migrationPlan);
        
        // Process each user
        for (const userRecord of userLocations) {
            try {
                await migrateUserLocations(userRecord, migrationPlan);
                migrationPlan.usersProcessed++;
            } catch (error) {
                console.error(`❌ Error migrating user ${userRecord.userId}:`, error);
                migrationPlan.errors.push({
                    userId: userRecord.userId,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
        }
        
        // Update migration status
        await update(migrationStatusRef, {
            status: MIGRATION_STATUS.COMPLETED,
            completedAt: admin.database.ServerValue.TIMESTAMP,
            migrationPlan: migrationPlan
        });
        
        console.log('✅ Migration completed successfully!');
        
        return {
            success: true,
            migrationPlan: migrationPlan,
            migratedNumber: twilioPhone,
            message: 'WhatsApp multi-location migration completed successfully'
        };
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        
        // Update migration status
        const migrationStatusRef = ref(rtdb, 'whatsapp-migration-status');
        await update(migrationStatusRef, {
            status: MIGRATION_STATUS.FAILED,
            failedAt: admin.database.ServerValue.TIMESTAMP,
            error: error.message
        });
        
        return {
            success: false,
            error: error.message,
            message: 'WhatsApp multi-location migration failed'
        };
    }
}

/**
 * Get all users and their locations
 * @returns {Promise<Array>} Array of user records with locations
 */
async function getUserLocations() {
    try {
        const userLocations = [];
        
        // Get all user locations mappings
        const userLocationsRef = ref(rtdb, 'userLocations');
        const userLocationsSnapshot = await get(userLocationsRef);
        
        if (!userLocationsSnapshot.exists()) {
            return userLocations;
        }
        
        const userLocationsData = userLocationsSnapshot.val();
        
        for (const [userId, locationIds] of Object.entries(userLocationsData)) {
            const locations = [];
            
            // Get location details
            for (const locationId of Object.keys(locationIds)) {
                const locationRef = ref(rtdb, `locations/${locationId}`);
                const locationSnapshot = await get(locationRef);
                
                if (locationSnapshot.exists()) {
                    locations.push({
                        id: locationId,
                        ...locationSnapshot.val()
                    });
                }
            }
            
            if (locations.length > 0) {
                userLocations.push({
                    userId: userId,
                    locations: locations
                });
            }
        }
        
        return userLocations;
        
    } catch (error) {
        console.error('❌ Error getting user locations:', error);
        throw error;
    }
}

/**
 * Migrate user locations
 * @param {Object} userRecord - User record with locations
 * @param {Object} migrationPlan - Migration plan to update
 * @returns {Promise<void>}
 */
async function migrateUserLocations(userRecord, migrationPlan) {
    try {
        console.log(`👤 Migrating user ${userRecord.userId} with ${userRecord.locations.length} locations...`);
        
        // For migration, we'll assign the platform default number to the first location
        // Users can later configure dedicated numbers through the admin interface
        
        if (userRecord.locations.length > 0) {
            const firstLocation = userRecord.locations[0];
            
            // Create location mapping to platform default number
            const mappingData = {
                locationId: firstLocation.id,
                whatsappNumberId: twilioPhone.replace(/\+/g, '').replace(/\s/g, ''),
                phoneNumber: twilioPhone,
                displayName: 'Platform Default',
                userId: userRecord.userId,
                assignedAt: admin.database.ServerValue.TIMESTAMP,
                isActive: true,
                locationName: firstLocation.name,
                locationAddress: firstLocation.address || '',
                isMigrated: true,
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
            
            // Save location mapping
            const mappingRef = ref(rtdb, `location-whatsapp-mapping/${firstLocation.id}`);
            await set(mappingRef, mappingData);
            
            migrationPlan.locationsProcessed++;
            
            console.log(`✅ Migrated location ${firstLocation.name} to platform default number`);
            
            // For additional locations, create placeholder mappings
            for (let i = 1; i < userRecord.locations.length; i++) {
                const location = userRecord.locations[i];
                
                // Create inactive mapping (user needs to configure WhatsApp number)
                const inactiveMappingData = {
                    locationId: location.id,
                    whatsappNumberId: null,
                    phoneNumber: null,
                    displayName: null,
                    userId: userRecord.userId,
                    assignedAt: admin.database.ServerValue.TIMESTAMP,
                    isActive: false,
                    locationName: location.name,
                    locationAddress: location.address || '',
                    isMigrated: true,
                    needsConfiguration: true,
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
                
                // Save inactive mapping
                const inactiveMappingRef = ref(rtdb, `location-whatsapp-mapping/${location.id}`);
                await set(inactiveMappingRef, inactiveMappingData);
                
                migrationPlan.locationsProcessed++;
                
                console.log(`📋 Created placeholder mapping for location ${location.name}`);
            }
        }
        
        console.log(`✅ User ${userRecord.userId} migration completed`);
        
    } catch (error) {
        console.error(`❌ Error migrating user ${userRecord.userId}:`, error);
        throw error;
    }
}

/**
 * Rollback migration
 * @returns {Promise<Object>} Rollback result
 */
async function rollbackMigration() {
    try {
        console.log('🔄 Rolling back WhatsApp multi-location migration...');
        
        // Remove WhatsApp schema
        const whatsappNumbersRef = ref(rtdb, 'whatsapp-numbers');
        await remove(whatsappNumbersRef);
        
        const locationMappingsRef = ref(rtdb, 'location-whatsapp-mapping');
        await remove(locationMappingsRef);
        
        const whatsappTierLimitsRef = ref(rtdb, 'whatsapp-tier-limits');
        await remove(whatsappTierLimitsRef);
        
        const whatsappMessageHistoryRef = ref(rtdb, 'whatsapp-message-history');
        await remove(whatsappMessageHistoryRef);
        
        // Update migration status
        const migrationStatusRef = ref(rtdb, 'whatsapp-migration-status');
        await update(migrationStatusRef, {
            status: MIGRATION_STATUS.NOT_STARTED,
            rolledBackAt: admin.database.ServerValue.TIMESTAMP
        });
        
        console.log('✅ Migration rollback completed');
        
        return {
            success: true,
            message: 'WhatsApp multi-location migration rolled back successfully'
        };
        
    } catch (error) {
        console.error('❌ Rollback failed:', error);
        
        return {
            success: false,
            error: error.message,
            message: 'WhatsApp multi-location migration rollback failed'
        };
    }
}

/**
 * Get migration statistics
 * @returns {Promise<Object>} Migration statistics
 */
async function getMigrationStatistics() {
    try {
        const migrationStatusRef = ref(rtdb, 'whatsapp-migration-status');
        const migrationStatusSnapshot = await get(migrationStatusRef);
        
        if (!migrationStatusSnapshot.exists()) {
            return {
                status: MIGRATION_STATUS.NOT_STARTED,
                needsMigration: true
            };
        }
        
        const migrationStatus = migrationStatusSnapshot.val();
        
        // Get current WhatsApp numbers count
        const whatsappNumbersRef = ref(rtdb, 'whatsapp-numbers');
        const whatsappNumbersSnapshot = await get(whatsappNumbersRef);
        const numbersCount = whatsappNumbersSnapshot.exists() ? 
            Object.keys(whatsappNumbersSnapshot.val()).length : 0;
        
        // Get location mappings count
        const locationMappingsRef = ref(rtdb, 'location-whatsapp-mapping');
        const locationMappingsSnapshot = await get(locationMappingsRef);
        const mappingsCount = locationMappingsSnapshot.exists() ? 
            Object.keys(locationMappingsSnapshot.val()).length : 0;
        
        return {
            ...migrationStatus,
            currentStatistics: {
                whatsappNumbers: numbersCount,
                locationMappings: mappingsCount
            }
        };
        
    } catch (error) {
        console.error('❌ Error getting migration statistics:', error);
        return {
            status: MIGRATION_STATUS.FAILED,
            error: error.message
        };
    }
}

module.exports = {
    checkMigrationStatus,
    startMigration,
    rollbackMigration,
    getMigrationStatistics,
    getUserLocations,
    migrateUserLocations,
    MIGRATION_STATUS
};