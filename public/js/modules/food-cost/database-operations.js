/**
 * Food Cost Module - Database Operations
 * Handles database operations for the Food Cost module
 * Version: 2.1.2-2025-05-15
 */

import { 
    ensureFirebaseInitialized, 
    getRef, 
    rtdb, 
    ref, 
    get, 
    set, 
    update, 
    remove 
} from './firebase-helpers.js';
import { generateTimestampKey } from './utilities.js';

/**
 * Save stock data to Firebase Realtime Database
 * @param {Object} data - Stock data to save
 * @returns {Promise} - Promise resolving with the save result
 */
export async function saveStockDataToDatabase(data) {
    // Verify Firebase is initialized
    if (!ensureFirebaseInitialized()) {
        throw new Error('Firebase is not initialized');
    }
    
    // Ensure data is valid
    if (!data || !data.stockItems || !Array.isArray(data.stockItems)) {
        throw new Error('Invalid stock data provided');
    }
    
    // Function is aliased as saveStockUsage in the component
    return await saveStockUsage(data);
}

/**
 * Save stock usage data to Firebase
 * This is the main function used by the refactored-app-component
 * @param {Object} data - Stock data to save
 * @returns {Promise} - Promise resolving with the save result
 */
export async function saveStockUsage(data) {
    
    try {
        // Generate a unique timestamp-based key for this entry
        const timestamp = generateTimestampKey();
        
        // Create a reference to the stockUsage/{timestamp} path
        const stockUsageRef = ref(rtdb, `stockUsage/${timestamp}`);
        
        // Check if an entry with this exact data already exists to prevent duplicates
        const checkDuplicate = await checkForExistingData(data);
        if (checkDuplicate.exists) {
            throw new Error(`Data has already been uploaded at ${checkDuplicate.timestamp}`);
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
                
                // Use calculated period days (DONT add 1 because we include both start and end dates)
                periodDays = diffDays;
                console.log(`[StockData] Calculated period days from date range: ${periodDays} days`);
            }
        }
        
        // Set data to Firebase
        await set(stockUsageRef, {
            timestamp: Date.now(),
            formattedTimestamp: new Date().toLocaleString(),
            storeName: data.storeName || 'Default Store',
            openingDate: data.openingDate || '',
            closingDate: data.closingDate || '',
            daysToNextDelivery: data.daysToNextDelivery || 0,
            // Store period days in multiple places for backward compatibility
            stockPeriodDays: periodDays,
            periodDays: periodDays, // Add this for historical service compatibility
            // Create a storeContext object that matches what the historical service expects
            storeContext: {
                name: data.storeName || 'Default Store',
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
 * Check for existing data in the database to prevent duplicates
 * @param {Object} data - Data to check
 * @returns {Promise<Object>} - Promise resolving with check result
 */
export async function checkForExistingData(data) {
    try {
        // Get all stockUsage entries
        const stockUsageRef = ref(rtdb, 'stockUsage');
        const snapshot = await get(stockUsageRef);
        
        if (!snapshot.exists()) {
            return { exists: false };
        }
        
        const stockUsageData = snapshot.val();
        
        // Check each entry for a potential match
        for (const [timestamp, entryData] of Object.entries(stockUsageData)) {
            // Check if this is the same store and date range
            if (entryData.storeName === data.storeName &&
                entryData.openingDate === data.openingDate &&
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
 * Load historical stock data from the database
 * @returns {Promise<Array>} - Promise resolving with historical data entries
 */
export async function loadHistoricalData() {
    // Verify Firebase is initialized
    if (!ensureFirebaseInitialized()) {
        throw new Error('Firebase is not initialized');
    }
    
    try {
        // Get all stockUsage entries
        const stockUsageRef = ref(rtdb, 'stockUsage');
        const snapshot = await get(stockUsageRef);
        
        if (!snapshot.exists()) {
            return [];
        }
        
        const stockUsageData = snapshot.val();
        
        // Convert to array and add the key to each entry
        const historicalEntries = Object.entries(stockUsageData).map(([key, data]) => ({
            key,
            timestamp: data.formattedTimestamp || new Date(data.timestamp).toLocaleString(),
            storeName: data.storeName || 'Unknown Store',
            openingDate: data.openingDate || '',
            closingDate: data.closingDate || '',
            totalItems: data.totalItems || (data.stockItems ? data.stockItems.length : 0),
            stockItems: data.stockItems, // Include actual stockItems array for accurate count
            totalCostOfUsage: data.totalCostOfUsage || 0,
            costPercentage: data.costPercentage || 0
        }));
        
        // Sort by timestamp (most recent first)
        historicalEntries.sort((a, b) => {
            // If using numeric timestamps
            if (stockUsageData[a.key].timestamp && stockUsageData[b.key].timestamp) {
                return stockUsageData[b.key].timestamp - stockUsageData[a.key].timestamp;
            }
            // Fallback to string comparison of keys (assuming timestamp-based keys)
            return b.key.localeCompare(a.key);
        });
        
        return historicalEntries;
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
 * @param {string} key - The unique key of the historical data entry to delete
 * @returns {Promise<Object>} - Promise resolving when the data is deleted
 */
export async function deleteHistoricalData(key) {
    // Verify Firebase is initialized
    if (!ensureFirebaseInitialized()) {
        throw new Error('Firebase is not initialized');
    }
    
    if (!key) {
        throw new Error('No key provided for deleting historical data');
    }
    
    try {
        // Get a reference to the specific stockUsage entry
        const stockUsageRef = ref(rtdb, `stockUsage/${key}`);
        
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
 * @param {string} itemCode - The item code to get history for
 * @returns {Promise<Array>} - Promise resolving with the historical usage data
 */
export async function getItemHistoricalData(itemCode) {
    // Verify Firebase is initialized
    if (!ensureFirebaseInitialized()) {
        throw new Error('Firebase is not initialized');
    }
    
    if (!itemCode) {
        throw new Error('No item code provided for historical data');
    }
    
    try {
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
            if (data.stockItems && Array.isArray(data.stockItems)) {
                // Find the matching item
                const matchingItem = data.stockItems.find(item => item.itemCode === itemCode);
                
                if (matchingItem) {
                    // Add to historical data with contextual information
                    historicalData.push({
                        timestamp: data.timestamp,
                        formattedTimestamp: data.formattedTimestamp || new Date(data.timestamp).toLocaleString(),
                        storeName: data.storeName || 'Unknown Store',
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
 * @returns {Promise<Object>} - Promise resolving with the update result
 */
export async function updateStockUsage(recordId, data, userData) {
    // Verify Firebase is initialized
    if (!ensureFirebaseInitialized()) {
        throw new Error('Firebase is not initialized');
    }
    
    if (!recordId) {
        throw new Error('No record ID provided for update');
    }
    
    // Ensure data is valid
    if (!data || !data.stockItems || !Array.isArray(data.stockItems)) {
        throw new Error('Invalid stock data provided for update');
    }
    
    // Ensure user data is provided
    if (!userData || !userData.uid) {
        throw new Error('User data required for edit tracking');
    }
    
    try {
        // Get the existing record to check if it exists and to create edit history
        const stockUsageRef = ref(rtdb, `stockUsage/${recordId}`);
        const snapshot = await get(stockUsageRef);
        
        if (!snapshot.exists()) {
            throw new Error(`Record with ID ${recordId} does not exist`);
        }
        
        const existingData = snapshot.val();
        
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
                
                // Use calculated period days (add 1 because we include both start and end dates)
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
