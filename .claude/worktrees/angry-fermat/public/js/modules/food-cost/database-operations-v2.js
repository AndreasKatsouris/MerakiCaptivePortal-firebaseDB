/**
 * Enhanced Database Operations Module (v2)
 * Supports both old nested structure and new normalized structure
 * Includes dual-write functionality for seamless migration
 */

// Import Firebase functions from the global window object
const { rtdb, ref, get, set, remove } = window.firebaseExports || {};

class DatabaseOperationsV2 {
    constructor() {
        this.migrationConfig = null;
        this.initializeMigrationConfig();
    }

    /**
     * Initialize migration configuration
     */
    async initializeMigrationConfig() {
        try {
            const configRef = ref(rtdb, 'migrationConfig');
            const snapshot = await get(configRef);
            this.migrationConfig = snapshot.exists() ? snapshot.val() : {
                dualWriteEnabled: false,
                preferNewStructure: false,
                migrationStatus: 'not-started'
            };
            
            console.log('Migration config loaded:', this.migrationConfig);
        } catch (error) {
            console.error('Error loading migration config:', error);
            this.migrationConfig = {
                dualWriteEnabled: false,
                preferNewStructure: false,
                migrationStatus: 'error'
            };
        }
    }

    /**
     * Save stock data with dual-write support
     */
    async saveStockData(stockData, locationId, locationName) {
        const timestamp = Date.now();
        const errors = [];
        let primarySuccess = false;
        let secondarySuccess = false;

        // Prepare data for both structures
        const oldStructureData = {
            ...stockData,
            timestamp,
            selectedLocationId: locationId,
            storeName: locationName, // Fixed: Use actual location name
            savedAt: timestamp
        };

        const newStructureData = {
            ...stockData,
            locationId,
            locationName,
            timestamp,
            savedAt: timestamp,
            structureVersion: 'v2'
        };

        try {
            if (this.migrationConfig.dualWriteEnabled) {
                // Dual-write mode: Write to both structures
                console.log('Dual-write mode: Saving to both structures');

                // Write to old structure
                try {
                    const oldRef = ref(rtdb, `locations/${locationId}/stockUsage/${timestamp}`);
                    await set(oldRef, oldStructureData);
                    console.log('✅ Saved to old structure');
                    primarySuccess = true;
                } catch (error) {
                    console.error('❌ Failed to save to old structure:', error);
                    errors.push({ structure: 'old', error: error.message });
                }

                // Write to new structure
                try {
                    const newRef = ref(rtdb, `stockData/${timestamp}`);
                    await set(newRef, newStructureData);

                    // Create index entry
                    const indexRef = ref(rtdb, `stockDataIndex/byLocation/${locationId}/${timestamp}`);
                    await set(indexRef, true);

                    console.log('✅ Saved to new structure');
                    secondarySuccess = true;
                } catch (error) {
                    console.error('❌ Failed to save to new structure:', error);
                    errors.push({ structure: 'new', error: error.message });
                }

                // Success if at least one write succeeded
                if (primarySuccess || secondarySuccess) {
                    return {
                        success: true,
                        timestamp,
                        dualWrite: true,
                        oldStructureSuccess: primarySuccess,
                        newStructureSuccess: secondarySuccess,
                        errors: errors.length > 0 ? errors : null
                    };
                } else {
                    throw new Error('Both write operations failed');
                }

            } else if (this.migrationConfig.preferNewStructure) {
                // New structure only
                console.log('Using new structure only');
                
                const newRef = firebase.database().ref(`stockData/${timestamp}`);
                await newRef.set(newStructureData);

                // Create index entry
                const indexRef = firebase.database().ref(`stockDataIndex/byLocation/${locationId}/${timestamp}`);
                await indexRef.set(true);

                return {
                    success: true,
                    timestamp,
                    structure: 'new'
                };

            } else {
                // Old structure only (default)
                console.log('Using old structure only');
                
                const oldRef = firebase.database().ref(`locations/${locationId}/stockUsage/${timestamp}`);
                await oldRef.set(oldStructureData);

                return {
                    success: true,
                    timestamp,
                    structure: 'old'
                };
            }

        } catch (error) {
            console.error('Save operation failed:', error);
            throw new Error(`Failed to save stock data: ${error.message}`);
        }
    }

    /**
     * Load historical stock data with fallback support
     */
    async loadHistoricalData(locationId, locationName, options = {}) {
        const { limit = 10, startDate = null, endDate = null } = options;
        
        try {
            if (this.migrationConfig.preferNewStructure) {
                // Try new structure first
                console.log('Loading from new structure first');
                const newData = await this.loadFromNewStructure(locationId, locationName, options);
                
                if (newData && newData.length > 0) {
                    return newData;
                }
                
                // Fallback to old structure
                console.log('Falling back to old structure');
                return await this.loadFromOldStructure(locationId, locationName, options);
                
            } else {
                // Try old structure first
                console.log('Loading from old structure first');
                const oldData = await this.loadFromOldStructure(locationId, locationName, options);
                
                if (this.migrationConfig.dualWriteEnabled && (!oldData || oldData.length === 0)) {
                    // Fallback to new structure if dual-write is enabled
                    console.log('Falling back to new structure');
                    return await this.loadFromNewStructure(locationId, locationName, options);
                }
                
                return oldData;
            }
            
        } catch (error) {
            console.error('Error loading historical data:', error);
            throw error;
        }
    }

    /**
     * Load data from new normalized structure
     */
    async loadFromNewStructure(locationId, locationName, options = {}) {
        try {
            const { limit = 10, startDate = null, endDate = null } = options;
            
            // Use index for efficient querying
            const indexRef = firebase.database().ref(`stockDataIndex/byLocation/${locationId}`);
            let query = indexRef.orderByKey();
            
            if (endDate) {
                query = query.endAt(endDate.toString());
            }
            if (startDate) {
                query = query.startAt(startDate.toString());
            }
            
            query = query.limitToLast(limit);
            
            const indexSnapshot = await query.once('value');
            
            if (!indexSnapshot.exists()) {
                return [];
            }
            
            const timestamps = Object.keys(indexSnapshot.val());
            const stockDataPromises = timestamps.map(timestamp => 
                firebase.database().ref(`stockData/${timestamp}`).once('value')
            );
            
            const stockSnapshots = await Promise.all(stockDataPromises);
            const stockData = stockSnapshots
                .filter(snapshot => snapshot.exists())
                .map(snapshot => ({
                    timestamp: snapshot.key,
                    ...snapshot.val()
                }))
                .sort((a, b) => b.timestamp - a.timestamp);
            
            console.log(`Loaded ${stockData.length} records from new structure`);
            return stockData;
            
        } catch (error) {
            console.error('Error loading from new structure:', error);
            return [];
        }
    }

    /**
     * Load data from old nested structure
     */
    async loadFromOldStructure(locationId, locationName, options = {}) {
        try {
            const { limit = 10, startDate = null, endDate = null } = options;
            
            const stockUsageRef = firebase.database().ref(`locations/${locationId}/stockUsage`);
            let query = stockUsageRef.orderByKey();
            
            if (endDate) {
                query = query.endAt(endDate.toString());
            }
            if (startDate) {
                query = query.startAt(startDate.toString());
            }
            
            query = query.limitToLast(limit);
            
            const snapshot = await query.once('value');
            
            if (!snapshot.exists()) {
                return [];
            }
            
            const stockData = Object.entries(snapshot.val())
                .map(([timestamp, data]) => ({
                    timestamp,
                    ...data
                }))
                .sort((a, b) => b.timestamp - a.timestamp);
            
            console.log(`Loaded ${stockData.length} records from old structure`);
            return stockData;
            
        } catch (error) {
            console.error('Error loading from old structure:', error);
            return [];
        }
    }

    /**
     * Get all locations with stock data
     */
    async getLocationsWithStockData() {
        try {
            const locations = [];
            
            if (this.migrationConfig.preferNewStructure) {
                // Query new structure
                const indexRef = firebase.database().ref('stockDataIndex/byLocation');
                const indexSnapshot = await indexRef.once('value');
                
                if (indexSnapshot.exists()) {
                    const locationIds = Object.keys(indexSnapshot.val());
                    
                    // Get location details
                    const locationPromises = locationIds.map(async (locationId) => {
                        const locationRef = firebase.database().ref(`locations/${locationId}`);
                        const locationSnapshot = await locationRef.once('value');
                        
                        if (locationSnapshot.exists()) {
                            const locationData = locationSnapshot.val();
                            const recordCount = Object.keys(indexSnapshot.val()[locationId] || {}).length;
                            
                            return {
                                id: locationId,
                                name: locationData.name || locationData.displayName || 'Unknown Location',
                                recordCount,
                                structure: 'new'
                            };
                        }
                        return null;
                    });
                    
                    const locationResults = await Promise.all(locationPromises);
                    locations.push(...locationResults.filter(loc => loc !== null));
                }
            }
            
            // Also check old structure
            const locationsRef = firebase.database().ref('locations');
            const locationsSnapshot = await locationsRef.once('value');
            
            if (locationsSnapshot.exists()) {
                const locationData = locationsSnapshot.val();
                
                for (const [locationId, data] of Object.entries(locationData)) {
                    const stockUsageRef = firebase.database().ref(`locations/${locationId}/stockUsage`);
                    const stockSnapshot = await stockUsageRef.once('value');
                    const recordCount = stockSnapshot.exists() ? Object.keys(stockSnapshot.val()).length : 0;
                    
                    // Check if we already have this location from new structure
                    const existingLocation = locations.find(loc => loc.id === locationId);
                    
                    if (existingLocation) {
                        existingLocation.recordCount += recordCount;
                        existingLocation.structure = 'both';
                    } else if (recordCount > 0) {
                        locations.push({
                            id: locationId,
                            name: data.name || data.displayName || 'Unknown Location',
                            recordCount,
                            structure: 'old'
                        });
                    }
                }
            }
            
            return locations.sort((a, b) => a.name.localeCompare(b.name));
            
        } catch (error) {
            console.error('Error getting locations with stock data:', error);
            return [];
        }
    }

    /**
     * Delete stock data entry
     */
    async deleteStockData(timestamp, locationId) {
        const errors = [];
        let deletedFromOld = false;
        let deletedFromNew = false;
        
        try {
            // Try to delete from old structure
            try {
                const oldRef = firebase.database().ref(`locations/${locationId}/stockUsage/${timestamp}`);
                await oldRef.remove();
                deletedFromOld = true;
                console.log('✅ Deleted from old structure');
            } catch (error) {
                console.log('Old structure deletion failed (may not exist):', error.message);
                errors.push({ structure: 'old', error: error.message });
            }
            
            // Try to delete from new structure
            try {
                const newRef = firebase.database().ref(`stockData/${timestamp}`);
                await newRef.remove();
                
                // Remove index entry
                const indexRef = firebase.database().ref(`stockDataIndex/byLocation/${locationId}/${timestamp}`);
                await indexRef.remove();
                
                deletedFromNew = true;
                console.log('✅ Deleted from new structure');
            } catch (error) {
                console.log('New structure deletion failed (may not exist):', error.message);
                errors.push({ structure: 'new', error: error.message });
            }
            
            if (deletedFromOld || deletedFromNew) {
                return {
                    success: true,
                    deletedFromOld,
                    deletedFromNew,
                    errors: errors.length > 0 ? errors : null
                };
            } else {
                throw new Error('Failed to delete from both structures');
            }
            
        } catch (error) {
            console.error('Delete operation failed:', error);
            throw error;
        }
    }

    /**
     * Get migration statistics
     */
    async getMigrationStats() {
        try {
            const stats = {
                oldStructureRecords: 0,
                newStructureRecords: 0,
                locationsInOldStructure: 0,
                locationsInNewStructure: 0,
                migrationConfig: this.migrationConfig
            };
            
            // Count old structure records
            const locationsRef = firebase.database().ref('locations');
            const locationsSnapshot = await locationsRef.once('value');
            
            if (locationsSnapshot.exists()) {
                const locations = locationsSnapshot.val();
                stats.locationsInOldStructure = Object.keys(locations).length;
                
                for (const [locationId, locationData] of Object.entries(locations)) {
                    const stockUsageRef = firebase.database().ref(`locations/${locationId}/stockUsage`);
                    const stockSnapshot = await stockUsageRef.once('value');
                    
                    if (stockSnapshot.exists()) {
                        stats.oldStructureRecords += Object.keys(stockSnapshot.val()).length;
                    }
                }
            }
            
            // Count new structure records
            const stockDataRef = firebase.database().ref('stockData');
            const stockDataSnapshot = await stockDataRef.once('value');
            
            if (stockDataSnapshot.exists()) {
                stats.newStructureRecords = Object.keys(stockDataSnapshot.val()).length;
            }
            
            const indexRef = firebase.database().ref('stockDataIndex/byLocation');
            const indexSnapshot = await indexRef.once('value');
            
            if (indexSnapshot.exists()) {
                stats.locationsInNewStructure = Object.keys(indexSnapshot.val()).length;
            }
            
            return stats;
            
        } catch (error) {
            console.error('Error getting migration stats:', error);
            return null;
        }
    }

    /**
     * Update migration configuration
     */
    async updateMigrationConfig(config) {
        try {
            const configRef = firebase.database().ref('migrationConfig');
            await configRef.update(config);
            
            // Reload config
            await this.initializeMigrationConfig();
            
            return { success: true };
        } catch (error) {
            console.error('Error updating migration config:', error);
            throw error;
        }
    }
}

// Export for use in other modules
window.DatabaseOperationsV2 = DatabaseOperationsV2;

// Create global instance when Firebase is ready
function initializeDatabaseOpsV2() {
    if (window.firebaseExports && window.firebaseExports.rtdb) {
        window.dbOpsV2 = new DatabaseOperationsV2();
        console.log('DatabaseOperationsV2 initialized');
    } else {
        console.log('Waiting for Firebase to be ready...');
        setTimeout(initializeDatabaseOpsV2, 100);
    }
}

// Initialize when Firebase is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDatabaseOpsV2);
} else {
    initializeDatabaseOpsV2();
} 