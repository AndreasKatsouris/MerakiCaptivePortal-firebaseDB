/**
 * Firebase Service for Food Cost Module
 * Handles all Firebase database operations
 */

// Import Firebase functions following the project guidelines
import { 
    rtdb, 
    ref, 
    get, 
    set, 
    update, 
    push, 
    remove,
    query,
    orderByChild,
    limitToLast,
    startAt,
    endAt
} from '../../../config/firebase-config.js';

// Base reference for stock usage data
const STOCK_USAGE_REF = "stockUsage";

/**
 * Save stock usage data to Firebase
 * 
 * @param {Object} data - The stock usage data to save
 * @returns {Promise<string>} - The record ID of the saved data
 */
export async function saveStockUsageData(data) {
  try {
    // Generate a key based on timestamp for better organization
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
    const recordId = `${timestamp}`;
    
    // Reference to the new record
    const recordRef = ref(rtdb, `${STOCK_USAGE_REF}/${recordId}`);
    
    // Ensure we have a timestamp
    const dataToSave = {
      ...data,
      timestamp: data.timestamp || now.toISOString()
    };
    
    // Save to Firebase
    await set(recordRef, dataToSave);
    
    console.log(`Stock usage data saved with ID: ${recordId}`);
    return recordId;
  } catch (error) {
    console.error("Error saving stock usage data:", error);
    throw error;
  }
}

/**
 * Check if a record with similar timestamp already exists
 * 
 * @param {string} timestamp - ISO timestamp to check
 * @returns {Promise<boolean>} - True if duplicate exists
 */
export async function checkForDuplicateRecord(timestamp) {
  try {
    // Get date part of the timestamp
    const date = timestamp.split('T')[0];
    
    // Query records for the same date
    const dateStart = `${date}T00:00:00.000Z`;
    const dateEnd = `${date}T23:59:59.999Z`;
    
    const recordsQuery = query(
      ref(rtdb, STOCK_USAGE_REF),
      orderByChild("timestamp"),
      startAt(dateStart),
      endAt(dateEnd)
    );
    
    const snapshot = await get(recordsQuery);
    return snapshot.exists();
  } catch (error) {
    console.error("Error checking for duplicate record:", error);
    return false; // Assume no duplicate in case of error
  }
}

/**
 * Load all historical stock usage data
 * 
 * @param {number} limit - Optional limit of records to return (default: 50)
 * @returns {Promise<Array>} - Array of historical records with IDs
 */
export async function loadHistoricalData(limit = 50) {
    try {
        // Get reference to stock usage data
        const stockUsageRef = ref(rtdb, STOCK_USAGE_REF);
        
        // Since we don't have an index on timestamp, we'll get all data and sort it in memory
        // This is not ideal for large datasets but works for our current needs
        const snapshot = await get(stockUsageRef);
        
        if (!snapshot.exists()) {
            console.log('No historical data found');
            return [];
        }
        
        const data = snapshot.val();
        
        // Convert object to array with keys
        const records = Object.entries(data).map(([key, value]) => {
            return {
                id: key,
                ...value
            };
        });
        
        // Sort by timestamp (descending) - most recent first
        records.sort((a, b) => {
            // Fall back to the key if timestamp is not available
            const timestampA = a.timestamp || 0;
            const timestampB = b.timestamp || 0;
            return timestampB - timestampA;
        });
        
        // Limit the results
        return records.slice(0, limit);
        
    } catch (error) {
        console.error('Error loading historical data:', error);
        throw error;
    }
}

/**
 * Load a specific stock usage record by ID
 * 
 * @param {string} recordId - The ID of the record to load
 * @returns {Promise<Object|null>} - The record data or null if not found
 */
export async function loadStockUsageRecord(recordId) {
  try {
    const recordRef = ref(rtdb, `${STOCK_USAGE_REF}/${recordId}`);
    const snapshot = await get(recordRef);
    
    if (!snapshot.exists()) {
      console.warn(`Record not found: ${recordId}`);
      return null;
    }
    
    return {
      ...snapshot.val(),
      id: recordId
    };
  } catch (error) {
    console.error(`Error loading record ${recordId}:`, error);
    throw error;
  }
}

/**
 * Delete a historical record by ID
 * 
 * @param {string} recordId - The ID of the record to delete
 * @returns {Promise<void>}
 */
export async function deleteHistoricalRecord(recordId) {
  try {
    const recordRef = ref(rtdb, `${STOCK_USAGE_REF}/${recordId}`);
    await remove(recordRef);
    console.log(`Record deleted: ${recordId}`);
  } catch (error) {
    console.error(`Error deleting record ${recordId}:`, error);
    throw error;
  }
}

/**
 * Get context from the most recent stock usage record
 * Useful for initializing a new record with recent settings
 * 
 * @returns {Promise<Object|null>} - Context object or null if no records exist
 */
export async function getRecentStoreContext() {
    try {
        // Load the most recent record (limit to 1)
        const records = await loadHistoricalData(1);
        
        // If no records found, return default context
        if (!records || records.length === 0) {
            console.log('No historical records found for store context, returning defaults');
            return {
                storeName: 'Main Store',
                daysToNextDelivery: 3,
                safetyStockPercentage: 20,
                criticalItemBuffer: 5
            };
        }
        
        const mostRecent = records[0];
        
        // Extract store context data
        return {
            storeName: mostRecent.storeName || 'Main Store',
            daysToNextDelivery: mostRecent.daysToNextDelivery || 3,
            safetyStockPercentage: mostRecent.safetyStockPercentage || 20,
            criticalItemBuffer: mostRecent.criticalItemBuffer || 5
        };
    } catch (error) {
        console.error('Error getting recent store context:', error);
        // Return default values rather than throwing error
        return {
            storeName: 'Main Store',
            daysToNextDelivery: 3,
            safetyStockPercentage: 20,
            criticalItemBuffer: 5
        };
    }
}

/**
 * Load stock usage data by date range
 * 
 * @param {string} startDate - Start date in ISO format (YYYY-MM-DD)
 * @param {string} endDate - End date in ISO format (YYYY-MM-DD)
 * @returns {Promise<Array>} - Array of records in the date range
 */
export async function loadStockUsageByDateRange(startDate, endDate) {
  try {
    // Convert dates to timestamps for query
    const startTimestamp = `${startDate}T00:00:00.000Z`;
    const endTimestamp = `${endDate}T23:59:59.999Z`;
    
    const recordsQuery = query(
      ref(rtdb, STOCK_USAGE_REF),
      orderByChild("timestamp"),
      startAt(startTimestamp),
      endAt(endTimestamp)
    );
    
    const snapshot = await get(recordsQuery);
    
    if (!snapshot.exists()) {
      return [];
    }
    
    // Convert to array and add ID to each record
    const records = [];
    snapshot.forEach(childSnapshot => {
      records.push({
        ...childSnapshot.val(),
        id: childSnapshot.key
      });
    });
    
    return records;
  } catch (error) {
    console.error("Error loading stock usage by date range:", error);
    throw error;
  }
}

/**
 * Get summary statistics for all stock usage records
 * 
 * @returns {Promise<Object>} - Summary statistics
 */
export async function getStockUsageStatistics() {
  try {
    const records = await loadHistoricalData(100);
    
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
      if (record.summary) {
        totalUsage += Number(record.summary.totalUsage) || 0;
        totalValue += Number(record.summary.totalCostOfUsage) || 0;
      }
    });
    
    return {
      totalRecords: records.length,
      averageUsage: records.length > 0 ? totalUsage / records.length : 0,
      totalValue: totalValue,
      oldestRecord: records[records.length - 1]?.timestamp,
      newestRecord: records[0]?.timestamp
    };
  } catch (error) {
    console.error("Error getting stock usage statistics:", error);
    throw error;
  }
}

/**
 * Check if Firebase is available
 * 
 * @returns {Promise<boolean>} - True if Firebase is available
 */
export async function isFirebaseAvailable() {
  try {
    // Try to access the database with a simple query
    const testRef = ref(rtdb, `${STOCK_USAGE_REF}/test`);
    await get(testRef);
    return true;
  } catch (error) {
    console.error("Firebase is not available:", error);
    return false;
  }
}
