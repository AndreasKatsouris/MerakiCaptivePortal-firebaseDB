/**
 * Food Cost Module - Database Operations
 * Handles database operations for the Food Cost module
 * Version: 2.1.2-2025-05-15
 */

import { 
    ensureFirebaseInitialized, 
    getRef, 
    getRtdb, 
    ref, 
    get, 
    set, 
    update, 
    remove,
    getAuth 
} from './firebase-helpers.js';
import { generateTimestampKey } from './utilities.js';

// Initialize Firebase on module load
ensureFirebaseInitialized();

/**
 * Save stock data to Firebase Realtime Database
 * @param {Object} data - Stock data to save
 * @returns {Promise} - Promise resolving with the save result
 */
export async function saveStockData(data) {
    // Verify Firebase is initialized
    if (!ensureFirebaseInitialized()) {
        throw new Error('Firebase is not initialized');
    }
    
    // Get current Firebase instances
    const rtdb = getRtdb();
    const auth = getAuth();
    
    // Check if user is authenticated
    const user = auth.currentUser;
    if (!user) {
        throw new Error('User must be authenticated to save stock data');
    }
    
    // Validate that selectedLocationId is provided
    if (!data.selectedLocationId) {
        throw new Error('Location must be selected to save stock data');
    }
    
    // Ensure data is valid
    if (!data || !data.stockItems || !Array.isArray(data.stockItems)) {
        throw new Error('Invalid stock data provided');
    }
    
    try {
        // Generate a unique timestamp-based key for this entry
        const timestamp = generateTimestampKey();
        
        // Log what we're about to save for debugging
        console.log('[StockData] Attempting to save with:', {
            userId: user.uid,
            selectedLocationId: data.selectedLocationId,
            timestamp: Date.now(),
            path: `locations/${data.selectedLocationId}/stockUsage/${timestamp}`
        });
        
        // Create a reference to the location-specific stockUsage path
        const stockUsageRef = ref(rtdb, `locations/${data.selectedLocationId}/stockUsage/${timestamp}`);
        
        // Check if an entry with this exact data already exists to prevent duplicates
        const checkDuplicate = await checkForExistingData(data);
        if (checkDuplicate.exists) {
            throw new Error(`Data has already been uploaded at ${checkDuplicate.timestamp}`);
        }
        
        // Calculate actual period days from opening to closing date if available
        let periodDays = data.stockPeriodDays || 0;
        if (data.openingDate && data.closingDate) {
            const openingDate = new Date(data.openingDate);
            const closingDate = new Date(data.closingDate);
            const diffTime = Math.abs(closingDate - openingDate);
            periodDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
            
            if (periodDays !== data.stockPeriodDays) {
                console.log(`[StockData] Calculated period days from date range: ${periodDays} days`);
            }
        }
        
        // Set data to Firebase
        await set(stockUsageRef, {
            userId: user.uid, // Add user ID for access control
            timestamp: Date.now(),
            formattedTimestamp: new Date().toLocaleString(),
            selectedLocationId: data.selectedLocationId, // Location ID is required
            storeName: data.storeName || 'Default Store', // Keep for backward compatibility
            openingDate: data.openingDate || '',
            closingDate: data.closingDate || '',
            daysToNextDelivery: data.daysToNextDelivery || 0,
            // Store period days in multiple places for backward compatibility
            stockPeriodDays: periodDays,
            periodDays: periodDays, // Add this for historical service compatibility
            // Create a storeContext object that matches what the historical service expects
            storeContext: {
                name: data.storeName || 'Default Store',
                locationId: data.selectedLocationId, // Add location ID for cross-reference
                periodDays: periodDays,
                openingDate: data.openingDate || '',
                closingDate: data.closingDate || ''
            },
            safetyStockPercentage: data.safetyStockPercentage || 0,
            criticalItemBuffer: data.criticalItemBuffer || 0,
            totalItems: data.stockItems.length,
            totalOpeningValue: data.totalOpeningValue || 0,
            totalPurchases: data.totalPurchases || 0,
            totalClosingValue: data.totalClosingValue || 0,
            totalUsage: data.totalUsage || 0,
            totalCostOfUsage: data.totalCostOfUsage || 0,
            salesAmount: data.salesAmount || 0,
            costPercentage: data.costPercentage || 0,
            stockItems: data.stockItems,
        });
        
        return {
            success: true,
            timestamp,
            message: 'Stock data saved successfully'
        };
    } catch (error) {
        console.error('Error saving stock data to database:', error);
        throw error;
    }
}

/**
 * Save stock usage data to Firebase
 * This is the main function used by the refactored-app-component
 * @param {Object} data - Stock data to save
 * @returns {Promise} - Promise resolving with the save result
 */
export async function saveStockUsage(data) {
    return await saveStockData(data);
}

/**
 * Alias for saveStockData for backward compatibility
 * @param {Object} data - Stock data to save
 * @returns {Promise} - Promise resolving with the save result
 */
export async function saveStockDataToDatabase(data) {
    return await saveStockData(data);
}

/**
 * Check for existing data in the database to prevent duplicates
 * @param {Object} data - Data to check
 * @returns {Promise<Object>} - Promise resolving with check result
 */
export async function checkForExistingData(data) {
    try {
        // Get current Firebase instances
        const rtdb = getRtdb();
        const auth = getAuth();
        
        // Get stockUsage entries for the specific location
        const stockUsageRef = ref(rtdb, `locations/${data.selectedLocationId}/stockUsage`);
        const snapshot = await get(stockUsageRef);
        
        if (!snapshot.exists()) {
            return { exists: false };
        }
        
        const stockUsageData = snapshot.val();
        
        // Check each entry for a potential match
        for (const [timestamp, entryData] of Object.entries(stockUsageData)) {
            // Since we're already in location-specific path, just check date range and items
            if (entryData.openingDate === data.openingDate &&
                entryData.closingDate === data.closingDate &&
                entryData.totalItems === data.stockItems.length) {
                
                // If item count matches, check a couple of random items to confirm
                let matchedItems = 0;
                const samplesToCheck = Math.min(5, data.stockItems.length);
                
                for (let i = 0; i < samplesToCheck; i++) {
                    const index = Math.floor(Math.random() * data.stockItems.length);
                    const newItem = data.stockItems[index];
                    
                    // Find a matching item in the existing data
                    const existingItem = entryData.stockItems.find(item => 
                        item.itemCode === newItem.itemCode && 
                        item.description === newItem.description
                    );
                    
                    if (existingItem && 
                        existingItem.openingBalance === newItem.openingBalance && 
                        existingItem.closingBalance === newItem.closingBalance) {
                        matchedItems++;
                    }
                }
                
                // If most of our samples match, consider this a duplicate
                if (matchedItems >= Math.ceil(samplesToCheck * 0.8)) {
                    return { 
                        exists: true, 
                        timestamp, 
                        formattedTimestamp: entryData.formattedTimestamp 
                    };
                }
            }
        }
        
        return { exists: false };
    } catch (error) {
        console.error('Error checking for existing data:', error);
        return { exists: false };
    }
}

/**
 * Load historical stock data from Firebase
 * Filters data to only show records for locations the user has access to
 * @returns {Promise<Array>} - Promise resolving with historical data array
 */
export async function loadHistoricalData() {
    // Get current Firebase instances
    const rtdb = getRtdb();
    const auth = getAuth();
    
    if (!rtdb) {
        throw new Error('Firebase is not initialized');
    }
    
    // Check if user is authenticated
    const user = auth.currentUser;
    if (!user) {
        throw new Error('User must be authenticated to load stock data');
    }
    
    try {
        // First, get user's accessible locations
        const userLocationsRef = ref(rtdb, `userLocations/${user.uid}`);
        const userLocationsSnapshot = await get(userLocationsRef);
        
        // Create a set of accessible location IDs
        const accessibleLocationIds = new Set();
        if (userLocationsSnapshot.exists()) {
            Object.keys(userLocationsSnapshot.val()).forEach(locationId => {
                accessibleLocationIds.add(locationId);
            });
        }
        
        // Check if user is admin
        const adminRef = ref(rtdb, `admins/${user.uid}`);
        const adminSnapshot = await get(adminRef);
        const isAdmin = adminSnapshot.exists();
        
        // Collect all stock data from accessible locations
        const allHistoricalEntries = [];
        
        // If admin, get all locations
        if (isAdmin) {
            const locationsRef = ref(rtdb, 'locations');
            const locationsSnapshot = await get(locationsRef);
            if (locationsSnapshot.exists()) {
                const allLocationIds = Object.keys(locationsSnapshot.val());
                allLocationIds.forEach(id => accessibleLocationIds.add(id));
            }
        }
        
        // Load stock data from each accessible location
        for (const locationId of accessibleLocationIds) {
            const locationStockRef = ref(rtdb, `locations/${locationId}/stockUsage`);
            const locationSnapshot = await get(locationStockRef);
            
            if (locationSnapshot.exists()) {
                const locationData = locationSnapshot.val();
                Object.entries(locationData).forEach(([key, data]) => {
                    allHistoricalEntries.push({
                        key,
                        locationId,
                        timestamp: data.formattedTimestamp || new Date(data.timestamp).toLocaleString(),
                        storeName: data.storeName || 'Unknown Store',
                        selectedLocationId: locationId,
                        openingDate: data.openingDate || '',
                        closingDate: data.closingDate || '',
                        totalItems: data.totalItems || (data.stockItems ? data.stockItems.length : 0),
                        stockItems: data.stockItems,
                        totalCostOfUsage: data.totalCostOfUsage || 0,
                        salesAmount: data.salesAmount || 0,
                        costPercentage: data.costPercentage || 0,
                        totalOpeningValue: data.totalOpeningValue || 0,
                        totalClosingValue: data.totalClosingValue || 0,
                        stockPeriodDays: data.stockPeriodDays || 0,
                        _rawTimestamp: data.timestamp
                    });
                });
            }
        }
        
        // Sort by timestamp (most recent first)
        allHistoricalEntries.sort((a, b) => {
            if (a._rawTimestamp && b._rawTimestamp) {
                return b._rawTimestamp - a._rawTimestamp;
            }
            return b.key.localeCompare(a.key);
        });
        
        return allHistoricalEntries;
    } catch (error) {
        console.error('Error loading historical data:', error);
        throw error;
    }
}

/**
 * Load a specific historical data entry
 * @param {string} key - The unique key of the historical data entry
 * @returns {Promise<Object>} - Promise resolving with the data
 */
export async function loadSpecificHistoricalData(key) {
    // Verify Firebase is initialized
    if (!ensureFirebaseInitialized()) {
        throw new Error('Firebase is not initialized');
    }
    
    // Get current Firebase instances
    const rtdb = getRtdb();
    const auth = getAuth();
    
    if (!key) {
        throw new Error('No key provided for loading historical data');
    }
    
    try {
        // Get the specific stockUsage entry
        const stockUsageRef = ref(rtdb, `stockUsage/${key}`);
        const snapshot = await get(stockUsageRef);
        
        if (!snapshot.exists()) {
            throw new Error('Historical data entry not found');
        }
        
        return snapshot.val();
    } catch (error) {
        console.error('Error loading specific historical data:', error);
        throw error;
    }
}

/**
 * Load a specific historical record (alias for loadSpecificHistoricalData)
 * @param {string} recordId - The record ID to load
 * @returns {Promise<Object>} - Promise resolving with the data
 */
export async function loadHistoricalRecord(recordId) {
    return await loadSpecificHistoricalData(recordId);
}

/**
 * Delete a specific historical data entry
 * @param {string} key - The key of the historical data entry to delete
 * @param {string} locationId - The location ID where the record is stored
 * @returns {Promise<Object>} - Promise resolving when the data is deleted
 */
export async function deleteHistoricalData(key, locationId) {
    // Get current Firebase instances
    const rtdb = getRtdb();
    const auth = getAuth();
    
    if (!rtdb) {
        throw new Error('Firebase is not initialized');
    }
    
    if (!key) {
        throw new Error('No key provided for deleting historical data');
    }
    
    if (!locationId) {
        throw new Error('No location ID provided for deleting historical data');
    }
    
    // Check if user is authenticated
    const user = auth.currentUser;
    if (!user) {
        throw new Error('User must be authenticated to delete stock data');
    }
    
    try {
        // Get the record to check permissions before deleting
        const stockUsageRef = ref(rtdb, `locations/${locationId}/stockUsage/${key}`);
        const snapshot = await get(stockUsageRef);
        
        if (!snapshot.exists()) {
            throw new Error(`Record with key ${key} does not exist`);
        }
        
        //const existingData = snapshot.val();
        
        // Check if user has permission to delete this record
        // Admin can delete any record
        // Non-admin users can only delete records for their locations
        const adminRef = ref(rtdb, `admins/${user.uid}`);
        const adminSnapshot = await get(adminRef);
        const isAdmin = adminSnapshot.exists();

        if (!isAdmin) {
            // Get user's accessible locations
            const userLocationsRef = ref(rtdb, `userLocations/${user.uid}`);
            const userLocationsSnapshot = await get(userLocationsRef);
            
            const accessibleLocationIds = new Set();
            if (userLocationsSnapshot.exists()) {
                Object.keys(userLocationsSnapshot.val()).forEach(id => {
                    accessibleLocationIds.add(id);
                });
            }
            
            // Check if user has access to this location
            if (!accessibleLocationIds.has(locationId)) {
                throw new Error('You do not have permission to delete stock records for this location');
            }
        }
        
        // Remove the entry
        await remove(stockUsageRef);
        
        return { success: true, message: 'Historical data entry deleted successfully' };
    } catch (error) {
        console.error('Error deleting historical data:', error);
        throw error;
    }
}

/**
 * Delete a historical record (alias for deleteHistoricalData)
 * @param {string} recordId - The record ID to delete
 * @returns {Promise<Object>} - Promise resolving when the data is deleted
 */
export async function deleteHistoricalRecord(recordId) {
    return await deleteHistoricalData(recordId);
}

/**
 * Get historical usage data for an item
 * Filters data to only show records for locations the user has access to
 * @param {string} itemCode - The item code to get history for
 * @param {string} locationId - Optional location ID to filter by specific location
 * @returns {Promise<Array>} - Promise resolving with the historical usage data
 */
export async function getItemHistoricalData(itemCode, locationId = null) {
    // Get current Firebase instances
    const rtdb = getRtdb();
    const auth = getAuth();
    
    if (!rtdb) {
        throw new Error('Firebase is not initialized');
    }
    
    if (!itemCode) {
        throw new Error('No item code provided for historical data');
    }
    
    // Check if user is authenticated
    const user = auth.currentUser;
    if (!user) {
        throw new Error('User must be authenticated to load historical data');
    }
    
    try {
        // First, get user's accessible locations
        const userLocationsRef = ref(rtdb, `userLocations/${user.uid}`);
        const userLocationsSnapshot = await get(userLocationsRef);
        
        // Create a set of accessible location IDs
        const accessibleLocationIds = new Set();
        if (userLocationsSnapshot.exists()) {
            Object.keys(userLocationsSnapshot.val()).forEach(locId => {
                accessibleLocationIds.add(locId);
            });
        }
        
        // Get all stockUsage entries
        const stockUsageRef = ref(rtdb, 'stockUsage');
        const snapshot = await get(stockUsageRef);
        
        if (!snapshot.exists()) {
            return [];
        }
        
        const stockUsageData = snapshot.val();
        const historicalData = [];
        
        // Search through all entries and find matching items
        for (const [key, data] of Object.entries(stockUsageData)) {
            // Check if user has access to this data
            const hasAccess = user.customClaims?.admin === true ||
                            data.userId === user.uid ||
                            (data.selectedLocationId && accessibleLocationIds.has(data.selectedLocationId));
            
            // If locationId is specified, only include data for that location
            if (locationId && data.selectedLocationId !== locationId) {
                continue;
            }
            
            if (hasAccess && data.stockItems && Array.isArray(data.stockItems)) {
                // Find the matching item
                const matchingItem = data.stockItems.find(item => item.itemCode === itemCode);
                
                if (matchingItem) {
                    // Add to historical data with contextual information
                    historicalData.push({
                        timestamp: data.timestamp,
                        formattedTimestamp: data.formattedTimestamp || new Date(data.timestamp).toLocaleString(),
                        storeName: data.storeName || 'Unknown Store',
                        selectedLocationId: data.selectedLocationId || null,
                        openingDate: data.openingDate || '',
                        closingDate: data.closingDate || '',
                        stockPeriodDays: data.stockPeriodDays || 1,
                        usage: matchingItem.usage || 0,
                        usagePerDay: matchingItem.usagePerDay || 0,
                        openingBalance: matchingItem.openingBalance || 0,
                        closingBalance: matchingItem.closingBalance || 0,
                        purchases: matchingItem.purchases || 0,
                        unitCost: matchingItem.unitCost || 0,
                        costOfUsage: matchingItem.costOfUsage || 0
                    });
                }
            }
        }
        
        // Sort by timestamp (oldest first for trend analysis)
        historicalData.sort((a, b) => a.timestamp - b.timestamp);
        
        return historicalData;
    } catch (error) {
        console.error('Error getting item historical data:', error);
        throw error;
    }
}

/**
 * Get historical data for a specific item (alias for getItemHistoricalData)
 * @param {string} itemCode - The item code to get history for
 * @returns {Promise<Array>} - Promise resolving with the historical usage data
 */
export async function getItemHistory(itemCode) {
    return await getItemHistoricalData(itemCode);
}

/**
 * Get stock usage statistics
 * @returns {Promise<Object>} - Promise resolving with usage statistics
 */
export async function getStockStatistics() {
    // Verify Firebase is initialized
    if (!ensureFirebaseInitialized()) {
        throw new Error('Firebase is not initialized');
    }
    
    // Get current Firebase instances
    const rtdb = getRtdb();
    const auth = getAuth();
    
    try {
        // Get all historical data
        const records = await loadHistoricalData();
        
        if (records.length === 0) {
            return {
                totalRecords: 0,
                averageUsage: 0,
                totalValue: 0,
                oldestRecord: null,
                newestRecord: null
            };
        }
        
        // Calculate statistics
        let totalUsage = 0;
        let totalValue = 0;
        
        records.forEach(record => {
            totalUsage += Number(record.totalUsage) || 0;
            totalValue += Number(record.totalCostOfUsage) || 0;
        });
        
        // Prepare results
        return {
            totalRecords: records.length,
            averageUsage: records.length > 0 ? totalUsage / records.length : 0,
            totalValue: totalValue,
            oldestRecord: records[records.length - 1]?.timestamp,
            newestRecord: records[0]?.timestamp
        };
    } catch (error) {
        console.error('Error getting stock statistics:', error);
        throw error;
    }
}

/**
 * Get recent store context from most recent record
 * @returns {Promise<Object>} - Promise resolving with store context data
 */
export async function getRecentStoreContext() {
    // Verify Firebase is initialized
    if (!ensureFirebaseInitialized()) {
        throw new Error('Firebase is not initialized');
    }
    
    // Get current Firebase instances
    const rtdb = getRtdb();
    const auth = getAuth();
    
    try {
        // Get the most recent record
        const records = await loadHistoricalData();
        
        if (records.length === 0) {
            return null;
        }
        
        const mostRecent = records[0]; // Records are sorted newest first
        
        // Extract store context
        return {
            storeName: mostRecent.storeName,
            openingDate: mostRecent.openingDate,
            closingDate: mostRecent.closingDate,
            stockPeriodDays: mostRecent.stockPeriodDays,
            daysToNextDelivery: mostRecent.daysToNextDelivery,
            safetyStockPercentage: mostRecent.safetyStockPercentage,
            criticalItemBuffer: mostRecent.criticalItemBuffer
        };
    } catch (error) {
        console.error('Error getting recent store context:', error);
        throw error;
    }
}

/**
 * Update an existing stock usage record in Firebase
 * @param {string} recordId - The ID of the record to update
 * @param {Object} data - The updated stock data
 * @param {Object} userData - Information about the user making the edit
 * @param {string} locationId - The location ID where the record is stored
 * @returns {Promise<Object>} - Promise resolving with the update result
 */
export async function updateStockUsage(recordId, data, userData, locationId) {
    // Get current Firebase instances
    const rtdb = getRtdb();
    const auth = getAuth();
    
    if (!rtdb) {
        throw new Error('Firebase is not initialized');
    }
    
    if (!recordId) {
        throw new Error('No record ID provided for update');
    }
    
    if (!locationId) {
        throw new Error('No location ID provided for update');
    }
    
    // Ensure data is valid
    if (!data || !data.stockItems || !Array.isArray(data.stockItems)) {
        throw new Error('Invalid stock data provided for update');
    }
    
    // Check if user is authenticated
    const user = auth.currentUser;
    if (!user) {
        throw new Error('User must be authenticated to update stock data');
    }
    
    // Ensure user data is provided
    if (!userData || !userData.uid) {
        throw new Error('User data required for edit tracking');
    }
    
    try {
        // Get the existing record to check if it exists and check permissions
        const stockUsageRef = ref(rtdb, `locations/${locationId}/stockUsage/${recordId}`);
        const snapshot = await get(stockUsageRef);
        
        if (!snapshot.exists()) {
            throw new Error(`Record with ID ${recordId} does not exist`);
        }
        
        const existingData = snapshot.val();
        
        // Check if user has permission to update this record
        // Admin can update any record
        // Non-admin users can only update records for their locations
        const adminRef = ref(rtdb, `admins/${user.uid}`);
        const adminSnapshot = await get(adminRef);
        const isAdmin = adminSnapshot.exists();
        
        if (!isAdmin) {
            // Get user's accessible locations
            const userLocationsRef = ref(rtdb, `userLocations/${user.uid}`);
            const userLocationsSnapshot = await get(userLocationsRef);
            
            const accessibleLocationIds = new Set();
            if (userLocationsSnapshot.exists()) {
                Object.keys(userLocationsSnapshot.val()).forEach(id => {
                    accessibleLocationIds.add(id);
                });
            }
            
            // Check if user has access to this location
            if (!accessibleLocationIds.has(locationId)) {
                throw new Error('You do not have permission to update stock records for this location');
            }
        }
        
        // Calculate actual period days from opening to closing date if available
        let periodDays = data.stockPeriodDays || 0;
        
        // If we have both opening and closing dates, calculate the actual period
        if (data.openingDate && data.closingDate) {
            const openingDate = new Date(data.openingDate);
            const closingDate = new Date(data.closingDate);
            
            // Ensure dates are valid
            if (!isNaN(openingDate) && !isNaN(closingDate)) {
                // Calculate the difference in days
                const diffTime = Math.abs(closingDate - openingDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                // Use calculated period days
                periodDays = diffDays;
                console.log(`[StockData] Calculated period days from date range: ${periodDays} days`);
            }
        }
        
        // Create edit metadata
        const editMetadata = {
            timestamp: Date.now(),
            formattedTimestamp: new Date().toLocaleString(),
            userId: userData.uid,
            userName: userData.displayName || 'Unknown User',
            userEmail: userData.email || 'Unknown Email'
        };
        
        // Create or update edit history array
        let editHistory = existingData.editHistory || [];
        editHistory.push(editMetadata);
        
        // Create the update object
        const updateData = {
            // Update timestamps
            lastEdited: editMetadata.timestamp,
            lastEditedFormatted: editMetadata.formattedTimestamp,
            lastEditedBy: editMetadata.userName,
            lastEditedByUid: editMetadata.userId,
            lastEditedByEmail: editMetadata.userEmail,
            editHistory: editHistory,
            
            // Update stock data
            storeName: data.storeName || existingData.storeName,
            openingDate: data.openingDate || existingData.openingDate,
            closingDate: data.closingDate || existingData.closingDate,
            daysToNextDelivery: data.daysToNextDelivery || existingData.daysToNextDelivery,
            stockPeriodDays: periodDays,
            periodDays: periodDays, // Add this for historical service compatibility
            safetyStockPercentage: data.safetyStockPercentage || existingData.safetyStockPercentage,
            criticalItemBuffer: data.criticalItemBuffer || existingData.criticalItemBuffer,
            
            // Update core stock data
            stockItems: data.stockItems,
            totalItems: data.stockItems.length,
            totalOpeningValue: data.totalOpeningValue || 0,
            totalPurchases: data.totalPurchases || 0,
            totalClosingValue: data.totalClosingValue || 0,
            totalUsage: data.totalUsage || 0,
            totalCostOfUsage: data.totalCostOfUsage || 0,
            salesAmount: data.salesAmount || existingData.salesAmount || 0,
            costPercentage: data.costPercentage || existingData.costPercentage || 0,
            
            // Update store context for historical service compatibility
            storeContext: {
                name: data.storeName || existingData.storeName,
                periodDays: periodDays,
                openingDate: data.openingDate || existingData.openingDate,
                closingDate: data.closingDate || existingData.closingDate
            }
        };
        
        // Update the record
        await update(stockUsageRef, updateData);
        
        return {
            success: true,
            recordId,
            message: 'Stock data updated successfully',
            editMetadata
        };
    } catch (error) {
        console.error('Error updating stock data:', error);
        throw error;
    }
}
