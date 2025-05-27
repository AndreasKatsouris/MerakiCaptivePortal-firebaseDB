/**
 * Food Cost Module - Historical Usage Service
 * Provides data retrieval and analysis for historical stock usage
 * Version: 2.0.0-alpha-2025-04-24
 */

import { rtdb, ref, get, query, orderByChild, startAt, endAt } from '../../../config/firebase-config.js';

/**
 * Service for retrieving and analyzing historical stock usage data
 * This standalone service supports the advanced purchase order functionality
 */
const HistoricalUsageService = {
    /**
     * Cache of historical data to minimize database reads
     * Structure: { storeId_dateRange: { timestamp, data } }
     */
    _cache: {},
    
    /**
     * Cache time-to-live in milliseconds (30 minutes)
     */
    _cacheTTL: 30 * 60 * 1000,
    
    /**
     * Retrieve historical stock usage data for a specific store and date range
     * @param {string} storeName - The store to retrieve data for
     * @param {Object} dateRange - Date range to query { startDate, endDate }
     * @param {number} lookbackDays - Alternative to dateRange, days to look back from today
     * @returns {Promise<Array>} - Array of historical stock records
     */
    async getHistoricalData(storeName, dateRange = null, lookbackDays = 14) {
        console.log(`[HistoricalUsage] Retrieving data for store: ${storeName}`);
        
        // Determine date range
        const range = this._normalizeDateRange(dateRange, lookbackDays);
        console.log(`[HistoricalUsage] Date range: ${range.startDate.toISOString()} to ${range.endDate.toISOString()}`);
        
        // Create cache key
        const cacheKey = `${storeName}_${range.startDate.toISOString()}_${range.endDate.toISOString()}`;
        
        // Check cache first
        const cachedData = this._checkCache(cacheKey);
        if (cachedData) {
            console.log(`[HistoricalUsage] Using cached data for ${storeName}`);
            return cachedData;
        }
        
        try {
            // Convert dates to timestamps for Firebase query
            const startTimestamp = range.startDate.getTime();
            const endTimestamp = range.endDate.getTime();
            
            // Query database for records within date range and matching store
            let stockRecords = [];
            
            // Try a different approach that doesn't require indexing
            // Get all stock usage records and filter in memory
            try {
                console.log(`[HistoricalUsage] Retrieving all stock usage records for filtering`); 
                const allRecordsQuery = query(ref(rtdb, 'stockUsage'));
                const snapshot = await get(allRecordsQuery);
                const allData = snapshot.val() || {};
                
                console.log(`[HistoricalUsage] Retrieved ${Object.keys(allData).length} records, filtering for ${storeName}`);
                
                // Filter in memory by store name and date range
                stockRecords = Object.entries(allData)
                    .map(([key, record]) => ({
                        id: key,
                        ...record
                    }))
                    .filter(record => {
                        // Check store name match
                        const recordStore = record.storeName || 
                                          (record.storeContext && record.storeContext.name) ||
                                          (record.metadata && record.metadata.storeName);
                                          
                        const storeMatch = recordStore === storeName;
                        
                        // Check date range match
                        const recordDate = record.timestamp || record.recordDate || 0;
                        const dateMatch = recordDate >= startTimestamp && recordDate <= endTimestamp;
                        
                        return storeMatch && dateMatch;
                    });
            } catch (indexError) {
                console.warn(`[HistoricalUsage] Error retrieving all records: ${indexError.message}`);
                
                // If the above approach fails, try a fallback method
                // This is less efficient but should work in most cases
                console.log(`[HistoricalUsage] Trying fallback approach with date-based queries`);
                
                // Try querying by date range instead, since timestamp is more likely to be indexed
                try {
                    const dateQuery = query(
                        ref(rtdb, 'stockUsage'),
                        orderByChild('timestamp'),
                        startAt(startTimestamp),
                        endAt(endTimestamp)
                    );
                    
                    const dateSnapshot = await get(dateQuery);
                    const dateFilteredData = dateSnapshot.val() || {};
                    
                    // Then filter by store name in memory
                    stockRecords = Object.entries(dateFilteredData)
                        .map(([key, record]) => ({
                            id: key,
                            ...record
                        }))
                        .filter(record => {
                            const recordStore = record.storeName || 
                                              (record.storeContext && record.storeContext.name) ||
                                              (record.metadata && record.metadata.storeName);
                                              
                            return recordStore === storeName;
                        });
                } catch (dateError) {
                    console.warn(`[HistoricalUsage] Date-based query failed: ${dateError.message}`);
                    throw new Error(`Unable to retrieve historical data: ${dateError.message}. Please add indexing for 'storeName' and 'timestamp' in Firebase rules.`);
                }
            }
            
            // If no store-specific data found, fall back to checking all records
            // (handles older data format without storeName field)
            if (stockRecords.length === 0) {
                console.log(`[HistoricalUsage] No store-specific data found, checking all records`);
                
                // Query by date range
                const dateQuery = query(
                    ref(rtdb, 'stockUsage'),
                    orderByChild('timestamp'),
                    startAt(startTimestamp),
                    endAt(endTimestamp)
                );
                
                const dateSnapshot = await get(dateQuery);
                const allData = dateSnapshot.val() || {};
                
                // Filter by store name within metadata or context
                stockRecords = Object.entries(allData)
                    .map(([key, record]) => ({
                        id: key,
                        ...record
                    }))
                    .filter(record => {
                        // Check various potential locations for store information
                        const recordStore = record.storeName || 
                                          (record.storeContext && record.storeContext.name) ||
                                          (record.metadata && record.metadata.storeName);
                                          
                        return recordStore === storeName;
                    });
            }
            
            console.log(`[HistoricalUsage] Found ${stockRecords.length} historical records for ${storeName}`);
            
            // Cache the results
            this._updateCache(cacheKey, stockRecords);
            
            return stockRecords;
            
        } catch (error) {
            console.error(`[HistoricalUsage] Error retrieving historical data:`, error);
            return [];
        }
    },
    
    /**
     * Calculate statistical metrics for historical stock usage
     * @param {Array} historicalRecords - Array of historical stock records
     * @param {string} itemCode - Item code to calculate statistics for
     * @returns {Object} - Statistical metrics for the specified item
     */
    calculateItemStatistics(historicalRecords, itemCode) {
        console.log(`[HistoricalUsage] Calculating statistics for item: ${itemCode}`);
        
        if (!historicalRecords || historicalRecords.length === 0) {
            console.warn(`[HistoricalUsage] No historical records available for analysis`);
            return this._getEmptyStatistics();
        }
        
        try {
            // Extract usage data for this specific item across all records
            const itemData = [];
            
            historicalRecords.forEach(record => {
                // Skip if no stock items
                if (!record.stockItems) return;
                
                // Find the item in this record
                const item = typeof record.stockItems === 'object' && !Array.isArray(record.stockItems)
                    ? record.stockItems[itemCode] // Object format with itemCode keys
                    : Array.isArray(record.stockItems) 
                      ? record.stockItems.find(i => i.itemCode === itemCode) // Array format
                      : null;
                
                if (item) {
                    // Extract usage value, period days and date
                    const usage = parseFloat(item.usage || 0);
                    
                    // Calculate period days from multiple possible sources
                    let periodDays;
                    
                    // Try to use directly stored period days first
                    if (record.periodDays) {
                        periodDays = record.periodDays;
                    }
                    // Then check store context
                    else if (record.storeContext && record.storeContext.periodDays) {
                        periodDays = record.storeContext.periodDays;
                    }
                    // Try using stockPeriodDays as fallback
                    else if (record.stockPeriodDays) {
                        periodDays = record.stockPeriodDays;
                    }
                    // If we have dates, calculate the period
                    else if (record.openingDate && record.closingDate) {
                        const openingDate = new Date(record.openingDate);
                        const closingDate = new Date(record.closingDate);
                        
                        if (!isNaN(openingDate) && !isNaN(closingDate)) {
                            const diffTime = Math.abs(closingDate - openingDate);
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            periodDays = diffDays + 1; // Include both start and end date
                        } else {
                            periodDays = 7; // Default if dates are invalid
                        }
                    }
                    // Final fallback
                    else {
                        periodDays = 7; // Default to weekly if nothing else is available
                    }
                    
                    // Log period days calculation to help diagnose issues
                    console.log(`[HistoricalUsage] Item ${itemCode}: Using ${periodDays} days for period calculation from ${record.openingDate || 'unknown'} to ${record.closingDate || 'unknown'}`);
                    
                    const timestamp = record.timestamp || record.recordDate || Date.now();
                    const date = new Date(timestamp);
                    
                    // Calculate usage per day for this record
                    const usagePerDay = periodDays > 0 ? usage / periodDays : 0;
                    
                    if (!isNaN(usagePerDay) && isFinite(usagePerDay)) {
                        itemData.push({
                            date,
                            usage,
                            usagePerDay,
                            periodDays
                        });
                    }
                }
            });
            
            // Sort data chronologically
            itemData.sort((a, b) => a.date - b.date);
            
            if (itemData.length === 0) {
                console.warn(`[HistoricalUsage] No valid usage data found for item ${itemCode}`);
                return this._getEmptyStatistics();
            }
            
            // Calculate average daily usage
            const usagePerDayValues = itemData.map(d => d.usagePerDay);
            const avgDailyUsage = this._calculateMean(usagePerDayValues);
            
            // Calculate standard deviation
            const stdDevUsage = this._calculateStandardDeviation(usagePerDayValues, avgDailyUsage);
            
            // Calculate coefficient of variation (volatility)
            const volatility = avgDailyUsage > 0 ? stdDevUsage / avgDailyUsage : 0;
            
            // Calculate trend (simple linear regression slope)
            const trend = this._calculateTrend(itemData);
            
            // Calculate day-of-week patterns if enough data
            const dowPatterns = itemData.length >= 14 ? this._calculateDayOfWeekPatterns(itemData) : null;
            
            return {
                itemCode,
                dataPoints: itemData.length,
                avgDailyUsage,
                stdDevUsage,
                volatility,
                trend,
                dowPatterns,
                firstDate: itemData[0].date,
                lastDate: itemData[itemData.length - 1].date,
                raw: itemData
            };
            
        } catch (error) {
            console.error(`[HistoricalUsage] Error calculating statistics for ${itemCode}:`, error);
            return this._getEmptyStatistics(itemCode);
        }
    },
    
    /**
     * Generate comprehensive historical summaries for a list of items
     * @param {string} storeName - Store to analyze
     * @param {Array} items - Current stock items array 
     * @param {Object} options - Options for analysis
     * @returns {Promise<Object>} - Map of itemCode to historical summary
     */
    async generateHistoricalSummaries(storeName, items, options = {}) {
        if (!items || !Array.isArray(items) || items.length === 0) {
            console.warn('[HistoricalUsage] No items provided for historical summary generation');
            return {};
        }
        
        const lookbackDays = options.lookbackDays || 14;
        const dateRange = options.dateRange || null;
        
        console.log(`[HistoricalUsage] Generating historical summaries for ${items.length} items`);
        
        // Get historical data for the specified store
        const historicalRecords = await this.getHistoricalData(storeName, dateRange, lookbackDays);
        
        if (historicalRecords.length === 0) {
            console.warn(`[HistoricalUsage] No historical records found for ${storeName}`);
            return {};
        }
        
        // Process each item
        const summaries = {};
        
        for (const item of items) {
            const itemCode = item.itemCode;
            if (!itemCode) continue;
            
            // Calculate statistics for this item
            const stats = this.calculateItemStatistics(historicalRecords, itemCode);
            
            // Only include items with valid data
            if (stats.dataPoints > 0) {
                summaries[itemCode] = stats;
            }
        }
        
        console.log(`[HistoricalUsage] Generated summaries for ${Object.keys(summaries).length} items`);
        return summaries;
    },
    
    /**
     * Clear the cache or a specific cache entry
     * @param {string} cacheKey - Optional specific cache key to clear
     */
    clearCache(cacheKey = null) {
        if (cacheKey) {
            delete this._cache[cacheKey];
            console.log(`[HistoricalUsage] Cleared cache for ${cacheKey}`);
        } else {
            this._cache = {};
            console.log('[HistoricalUsage] Cleared entire cache');
        }
    },
    
    /**
     * Get the current cache stats
     * @returns {Object} - Cache statistics
     */
    getCacheStats() {
        return {
            entries: Object.keys(this._cache).length,
            size: JSON.stringify(this._cache).length,
            keys: Object.keys(this._cache)
        };
    },
    
    /**
     * Check the cache for valid data
     * @param {string} key - Cache key to check
     * @returns {Array|null} - Cached data or null if not found/expired
     * @private
     */
    _checkCache(key) {
        const cached = this._cache[key];
        
        if (!cached) return null;
        
        const now = Date.now();
        if (now - cached.timestamp > this._cacheTTL) {
            // Cache expired
            delete this._cache[key];
            return null;
        }
        
        return cached.data;
    },
    
    /**
     * Update the cache with new data
     * @param {string} key - Cache key
     * @param {Array} data - Data to cache
     * @private
     */
    _updateCache(key, data) {
        this._cache[key] = {
            timestamp: Date.now(),
            data: data
        };
    },
    
    /**
     * Normalize date range from different input formats
     * @param {Object} dateRange - Date range object { startDate, endDate }
     * @param {number} lookbackDays - Days to look back from today
     * @returns {Object} - Normalized date range
     * @private
     */
    _normalizeDateRange(dateRange, lookbackDays) {
        const endDate = new Date();
        
        // If date range is provided, use that
        if (dateRange && dateRange.startDate && dateRange.endDate) {
            return {
                startDate: new Date(dateRange.startDate),
                endDate: new Date(dateRange.endDate)
            };
        }
        
        // Otherwise calculate based on lookback days
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - lookbackDays);
        
        // Set times to beginning and end of day
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        return { startDate, endDate };
    },
    
    /**
     * Calculate the mean of an array of numbers
     * @param {Array} values - Array of numeric values
     * @returns {number} - The mean value
     * @private
     */
    _calculateMean(values) {
        if (!values || values.length === 0) return 0;
        
        const sum = values.reduce((acc, val) => acc + val, 0);
        return sum / values.length;
    },
    
    /**
     * Calculate standard deviation
     * @param {Array} values - Array of numeric values
     * @param {number} mean - The mean of the values
     * @returns {number} - Standard deviation
     * @private
     */
    _calculateStandardDeviation(values, mean) {
        if (!values || values.length < 2) return 0;
        
        const squaredDifferences = values.map(v => Math.pow(v - mean, 2));
        const variance = this._calculateMean(squaredDifferences);
        return Math.sqrt(variance);
    },
    
    /**
     * Calculate trend using simple linear regression
     * @param {Array} data - Array of {date, usagePerDay} objects
     * @returns {Object} - Trend information
     * @private
     */
    _calculateTrend(data) {
        if (!data || data.length < 3) {
            return { slope: 0, direction: 'stable' };
        }
        
        // Convert dates to x values (days since first date)
        const firstDateMs = data[0].date.getTime();
        const xValues = data.map(d => (d.date.getTime() - firstDateMs) / (1000 * 60 * 60 * 24));
        const yValues = data.map(d => d.usagePerDay);
        
        // Calculate slope using least squares method
        const n = xValues.length;
        const sumX = xValues.reduce((acc, val) => acc + val, 0);
        const sumY = yValues.reduce((acc, val) => acc + val, 0);
        const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i], 0);
        const sumXX = xValues.reduce((acc, x) => acc + x * x, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        // Determine trend direction
        let direction = 'stable';
        if (slope > 0.05) direction = 'increasing';
        else if (slope < -0.05) direction = 'decreasing';
        
        return { slope, direction };
    },
    
    /**
     * Calculate day-of-week patterns
     * @param {Array} data - Array of {date, usagePerDay} objects
     * @returns {Object} - Day of week patterns
     * @private
     */
    _calculateDayOfWeekPatterns(data) {
        // Group data by day of week
        const dowGroups = [[], [], [], [], [], [], []];
        
        data.forEach(item => {
            const dayOfWeek = item.date.getDay();
            dowGroups[dayOfWeek].push(item.usagePerDay);
        });
        
        // Calculate average for each day of week
        const dowAverages = dowGroups.map(group => 
            group.length > 0 ? this._calculateMean(group) : null
        );
        
        // Calculate overall average
        const allValues = data.map(d => d.usagePerDay);
        const overallAvg = this._calculateMean(allValues);
        
        // Calculate index for each day (relative to overall average)
        const dowIndices = dowAverages.map(avg => 
            avg !== null ? avg / overallAvg : 1
        );
        
        // Create named day object
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const result = {};
        
        days.forEach((day, i) => {
            result[day] = {
                average: dowAverages[i] || 0,
                index: dowIndices[i] || 1,
                dataPoints: dowGroups[i].length
            };
        });
        
        return result;
    },
    
    /**
     * Get empty statistics object for items with no data
     * @param {string} itemCode - Optional item code
     * @returns {Object} - Empty statistics object
     * @private
     */
    _getEmptyStatistics(itemCode = '') {
        return {
            itemCode,
            dataPoints: 0,
            avgDailyUsage: 0,
            stdDevUsage: 0,
            volatility: 0,
            trend: { slope: 0, direction: 'stable' },
            dowPatterns: null,
            firstDate: null,
            lastDate: null,
            raw: []
        };
    }
};

export default HistoricalUsageService;
