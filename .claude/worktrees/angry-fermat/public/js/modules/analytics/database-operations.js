/**
 * Analytics Module - Database Operations
 * 
 * This file contains Firebase database operations for the Analytics module.
 * Following the Firebase Realtime Database Operations guidelines from the project.
 */

import { rtdb, ref, get, set, update, push, remove } from '../../../js/config/firebase-config.js';

const DatabaseOperations = {
    /**
     * Get analytics data from Firebase
     * @param {string} dataType - Type of data to retrieve (e.g., 'foodCost')
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Retrieved data
     */
    async getAnalyticsData(dataType, options = {}) {
        console.log(`Getting ${dataType} analytics data with options:`, options);
        
        try {
            let dataPath;
            
            // Determine the data path based on the data type
            switch (dataType) {
                case 'foodCost':
                    // For food cost, we get stock usage data
                    dataPath = 'stockUsage';
                    break;
                case 'guests':
                    dataPath = 'guests';
                    break;
                case 'campaigns':
                    dataPath = 'campaigns';
                    break;
                default:
                    throw new Error(`Unknown data type: ${dataType}`);
            }
            
            // Get data from Firebase
            const snapshot = await get(ref(rtdb, dataPath));
            const data = snapshot.val() || {};
            
            // Convert data to array if requested
            if (options.asArray) {
                return Object.entries(data).map(([id, item]) => ({
                    id,
                    ...item
                }));
            }
            
            return data;
        } catch (error) {
            console.error(`Error getting ${dataType} analytics data:`, error);
            throw error;
        }
    },
    
    /**
     * Save analytics data to Firebase
     * @param {string} dataType - Type of data to save (e.g., 'foodCostAnalytics')
     * @param {Object} data - Data to save
     * @returns {Promise<string>} ID of the saved data
     */
    async saveAnalyticsData(dataType, data) {
        console.log(`Saving ${dataType} analytics data:`, data);
        
        try {
            // Create a timestamp-based ID
            const timestamp = new Date();
            const id = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(timestamp.getDate()).padStart(2, '0')}_${String(timestamp.getHours()).padStart(2, '0')}${String(timestamp.getMinutes()).padStart(2, '0')}${String(timestamp.getSeconds()).padStart(2, '0')}`;
            
            // Determine the data path based on the data type
            let dataPath;
            switch (dataType) {
                case 'foodCostAnalytics':
                    dataPath = `analytics/foodCost/${id}`;
                    break;
                case 'guestAnalytics':
                    dataPath = `analytics/guests/${id}`;
                    break;
                case 'campaignAnalytics':
                    dataPath = `analytics/campaigns/${id}`;
                    break;
                default:
                    dataPath = `analytics/${dataType}/${id}`;
            }
            
            // Add metadata
            const dataToSave = {
                ...data,
                timestamp: timestamp.getTime(),
                createdAt: timestamp.toISOString(),
            };
            
            // Save to Firebase
            await set(ref(rtdb, dataPath), dataToSave);
            
            return id;
        } catch (error) {
            console.error(`Error saving ${dataType} analytics data:`, error);
            throw error;
        }
    },
    
    /**
     * Get saved analytics reports
     * @param {string} analysisType - Type of analysis (e.g., 'foodCost')
     * @returns {Promise<Array>} Array of saved reports
     */
    async getSavedReports(analysisType) {
        console.log(`Getting saved ${analysisType} reports`);
        
        try {
            const dataPath = `analytics/${analysisType}`;
            
            // Get data from Firebase
            const snapshot = await get(ref(rtdb, dataPath));
            const data = snapshot.val() || {};
            
            // Convert to array and sort by timestamp (newest first)
            return Object.entries(data).map(([id, report]) => ({
                id,
                ...report
            })).sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            console.error(`Error getting saved ${analysisType} reports:`, error);
            throw error;
        }
    },
    
    /**
     * Delete a saved report
     * @param {string} analysisType - Type of analysis (e.g., 'foodCost')
     * @param {string} reportId - ID of the report to delete
     * @returns {Promise<void>}
     */
    async deleteReport(analysisType, reportId) {
        console.log(`Deleting ${analysisType} report: ${reportId}`);
        
        try {
            const dataPath = `analytics/${analysisType}/${reportId}`;
            
            // Delete from Firebase
            await remove(ref(rtdb, dataPath));
            
            console.log(`Successfully deleted ${analysisType} report: ${reportId}`);
        } catch (error) {
            console.error(`Error deleting ${analysisType} report:`, error);
            throw error;
        }
    },
    
    /**
     * Get stock usage data for analytics with support for multiple files
     * @param {Object} dateRange - Date range with startDate and endDate (optional filter)
     * @param {Array} dataFileIds - Array of specific file IDs to fetch (optional)
     * @returns {Object} Stock usage data object
     */
    async getStockUsageData(dateRange = null, dataFileIds = []) {
        console.log(
            'Getting stock usage data',
            dateRange ? `for date range: ${JSON.stringify(dateRange)}` : '',
            dataFileIds.length ? `for specific files: ${dataFileIds.join(', ')}` : ''
        );
        
        try {
            // If specific file IDs are provided, fetch only those files
            if (dataFileIds && dataFileIds.length > 0) {
                const result = {};
                
                // Using Promise.all for parallel fetching of multiple files
                const promises = dataFileIds.map(fileId => 
                    get(ref(rtdb, `stockUsage/${fileId}`))
                );
                
                const snapshots = await Promise.all(promises);
                
                // Process each snapshot and add to result if it exists
                snapshots.forEach((snapshot, index) => {
                    const fileId = dataFileIds[index];
                    if (snapshot.exists()) {
                        result[fileId] = snapshot.val();
                    }
                });
                
                return result;
            }
            
            // Otherwise, get all stock usage data and filter by date range if provided
            const snapshot = await get(ref(rtdb, 'stockUsage'));
            const data = snapshot.val() || {};
            
            // If date range is provided, filter the data
            if (dateRange && dateRange.startDate && dateRange.endDate) {
                const startDate = new Date(dateRange.startDate);
                const endDate = new Date(dateRange.endDate);
                
                // Set time to beginning/end of day for accurate comparison
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                
                const filteredData = {};
                
                // Filter by date range
                Object.entries(data).forEach(([id, item]) => {
                    // Extract date from record ID (format: YYYYMMDD_HHMMSS)
                    if (!id || typeof id !== 'string') return;
                    
                    const match = id.match(/^(\d{4})(\d{2})(\d{2})_/);
                    if (!match) return;
                    
                    const [, year, month, day] = match;
                    const itemDate = new Date(`${year}-${month}-${day}`);
                    
                    if (itemDate >= startDate && itemDate <= endDate) {
                        filteredData[id] = item;
                    }
                });
                
                return filteredData;
            }
            
            return data;
        } catch (error) {
            console.error('Error getting stock usage data:', error);
            throw error;
        }
    },
    
    /**
     * Get available data files with metadata
     * @returns {Array} List of available data files with metadata
     */
    async getAvailableDataFiles() {
        try {
            // Get all stock usage data
            const snapshot = await get(ref(rtdb, 'stockUsage'));
            
            if (!snapshot.exists()) {
                return [];
            }
            
            const data = snapshot.val();
            
            // Transform to array with metadata
            return Object.entries(data).map(([id, fileData]) => {
                // Handle different potential metadata locations based on the implementation memory
                // Start by defaulting our object structures
                const metadata = fileData.metadata || {};
                const stockItems = fileData.stockItems || {};
                
                // Calculate total value and usage
                let totalValue = 0;
                let totalUsage = 0;
                let categories = new Set();
                
                // Try different value sources based on our implementation memory
                // 1. Try summary data first (preferred if available)
                if (fileData.summary) {
                    if (fileData.summary.totalValue !== undefined) {
                        totalValue = parseFloat(fileData.summary.totalValue) || 0;
                    }
                    if (fileData.summary.totalUsage !== undefined) {
                        totalUsage = parseFloat(fileData.summary.totalUsage) || 0;
                    }
                    if (Array.isArray(fileData.summary.categories)) {
                        fileData.summary.categories.forEach(cat => categories.add(cat));
                    }
                }
                
                // 2. Calculate from stock items if needed
                if (totalValue === 0 && Object.keys(stockItems).length > 0) {
                    Object.values(stockItems).forEach(item => {
                        if (item.usage) {
                            // Check the different ways usage value might be stored
                            if (item.usage.value !== undefined) {
                                totalValue += parseFloat(item.usage.value) || 0;
                            } else if (item.usage.cost !== undefined) {
                                totalValue += parseFloat(item.usage.cost) || 0;
                            } else if (typeof item.usage === 'number') {
                                totalValue += parseFloat(item.usage) || 0;
                            }
                            
                            // Check for usage quantity
                            if (item.usage.quantity !== undefined) {
                                totalUsage += parseFloat(item.usage.quantity) || 0;
                            }
                        }
                        
                        // Check for category information
                        if (item.category) {
                            categories.add(item.category);
                        }
                    });
                }
                
                // Try to extract store name from multiple possible locations
                // based on the implementation memory
                let storeName = 'Unknown';
                
                if (metadata.storeName) {
                    storeName = metadata.storeName;
                } else if (fileData.storeName) {
                    storeName = fileData.storeName;
                } else if (fileData.storeInfo && fileData.storeInfo.name) {
                    storeName = fileData.storeInfo.name;
                } else if (fileData.userInfo && fileData.userInfo.store) {
                    storeName = fileData.userInfo.store;
                }
                
                // Parse the date from file ID
                const dateFromId = this.parseDateFromFileId(id);
                
                // Generate a meaningful display name
                let displayName = storeName || 'Unknown Store';
                
                if (metadata.openingDate && metadata.closingDate) {
                    // Use stored date range if available
                    const openDate = new Date(metadata.openingDate).toLocaleDateString();
                    const closeDate = new Date(metadata.closingDate).toLocaleDateString();
                    displayName += ` (${openDate} - ${closeDate})`;
                } else if (dateFromId) {
                    // Use date from the file ID
                    displayName += ` (${dateFromId.toLocaleDateString()})`;
                }
                
                // Debug logging for troubleshooting
                console.log(`File ${id} metadata:`, {
                    storeName,
                    totalValue,
                    itemCount: Object.keys(stockItems).length
                });
                
                return {
                    id,
                    displayName,
                    storeName,
                    dateRange: {
                        openingDate: metadata.openingDate || (dateFromId ? dateFromId.toISOString() : null),
                        closingDate: metadata.closingDate || (dateFromId ? dateFromId.toISOString() : null)
                    },
                    date: dateFromId,
                    timestamp: id, // Use ID as timestamp (already in YYYYMMDD_HHMMSS format)
                    itemCount: Object.keys(stockItems).length || 0,
                    totalValue: totalValue,
                    totalUsage: totalUsage,
                    categories: Array.from(categories)
                };
            }).sort((a, b) => {
                // Sort by timestamp (newest first)
                return b.timestamp.localeCompare(a.timestamp);
            });
            
        } catch (error) {
            console.error('Error getting available data files:', error);
            return [];
        }
    },
    
    /**
     * Parse a date from a file ID (format: YYYYMMDD_HHMMSS)
     * @param {string} fileId - The file ID to parse
     * @returns {Date|null} - Parsed date or null if invalid format
     */
    parseDateFromFileId(fileId) {
        if (!fileId || typeof fileId !== 'string') return null;
        
        const match = fileId.match(/^(\d{4})(\d{2})(\d{2})_/);
        if (!match) return null;
        
        const [, year, month, day] = match;
        try {
            const dateString = `${year}-${month}-${day}`;
            const date = new Date(dateString);
            
            // Check if the date is valid (not NaN)
            if (isNaN(date.getTime())) {
                return null;
            }
            
            return date;
        } catch (error) {
            console.error('Error parsing date from file ID:', error);
            return null;
        }
    }
};

// Export the Database Operations
export { DatabaseOperations };
