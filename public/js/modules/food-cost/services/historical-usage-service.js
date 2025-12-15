/**
 * Food Cost Module - Historical Usage Service
 * Provides data retrieval and analysis for historical stock usage
 * Version: 2.0.0-alpha-2025-04-24
 */

import { getRtdb, getAuth, ref, get } from '../firebase-helpers.js?v=2.1.5-20250606';
import { query, orderByChild, startAt, endAt } from '../../../config/firebase-config.js';

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
     * @param {string} storeIdentifier - The store name or location ID to retrieve data for
     * @param {Object} dateRange - Date range to query { startDate, endDate }
     * @param {number} lookbackDays - Alternative to dateRange, days to look back from today
     * @returns {Promise<Array>} - Array of historical stock records
     */
    async getHistoricalData(storeIdentifier, { dateRange = null, lookbackDays = 30 } = {}) {
        // Check if user is authenticated
        const user = getAuth().currentUser;
        if (!user) {
            throw new Error('User must be authenticated to access historical data');
        }
        
        // Calculate date range
        const range = dateRange || this._calculateDateRange(lookbackDays);
        
        // Check cache first
        const cacheKey = `${storeIdentifier}_${range.startDate.getTime()}_${range.endDate.getTime()}`;
        const cachedData = this._getFromCache(cacheKey);
        
        if (cachedData) {
            console.log('[HistoricalUsage] Returning cached data');
            return cachedData;
        }
        
        try {
            // Get timestamps for query
            const startTimestamp = range.startDate.getTime();
            const endTimestamp = range.endDate.getTime();
            
            // First, get user's accessible locations
            const userLocationsRef = ref(getRtdb(), `userLocations/${user.uid}`);
            const userLocationsSnapshot = await get(userLocationsRef);
            
            const accessibleLocationIds = new Set();
            if (userLocationsSnapshot.exists()) {
                Object.keys(userLocationsSnapshot.val()).forEach(locationId => {
                    accessibleLocationIds.add(locationId);
                });
            }
            
            // Check if user is admin
            const adminRef = ref(getRtdb(), `admins/${user.uid}`);
            const adminSnapshot = await get(adminRef);
            const isAdmin = adminSnapshot.exists();
            
            // If admin, get all locations
            if (isAdmin) {
                const locationsRef = ref(getRtdb(), 'locations');
                const locationsSnapshot = await get(locationsRef);
                if (locationsSnapshot.exists()) {
                    const allLocationIds = Object.keys(locationsSnapshot.val());
                    allLocationIds.forEach(id => accessibleLocationIds.add(id));
                }
            }
            
            // Query database for records within date range and matching store
            let stockRecords = [];
            
            // If storeIdentifier looks like a location ID (starts with '-'), 
            // check that specific location
            if (storeIdentifier.startsWith('-')) {
                console.log(`[HistoricalUsage] Looking for data in location: ${storeIdentifier}`);
                
                // Check if user has access to this location
                if (accessibleLocationIds.has(storeIdentifier) || isAdmin) {
                    const locationStockRef = ref(getRtdb(), `locations/${storeIdentifier}/stockUsage`);
                    const locationSnapshot = await get(locationStockRef);
                    
                    if (locationSnapshot.exists()) {
                        const locationData = locationSnapshot.val();
                        
                        // Filter by date range
                        stockRecords = Object.entries(locationData)
                            .map(([key, record]) => ({
                                id: key,
                                ...record
                            }))
                            .filter(record => {
                                const recordDate = record.timestamp || record.recordDate || 0;
                                return recordDate >= startTimestamp && recordDate <= endTimestamp;
                            });
                        
                        console.log(`[HistoricalUsage] Found ${stockRecords.length} records in location ${storeIdentifier}`);
                    }
                }
            } else {
                // If it's a store name, check all accessible locations
                console.log(`[HistoricalUsage] Looking for data with store name: ${storeIdentifier}`);
                
                for (const locationId of accessibleLocationIds) {
                    const locationStockRef = ref(getRtdb(), `locations/${locationId}/stockUsage`);
                    const locationSnapshot = await get(locationStockRef);
                    
                    if (locationSnapshot.exists()) {
                        const locationData = locationSnapshot.val();
                        
                        // Filter by store name and date range
                        const locationRecords = Object.entries(locationData)
                            .map(([key, record]) => ({
                                id: key,
                                ...record
                            }))
                                                    .filter(record => {
                            // Check store name match - be more flexible with matching
                            const recordStore = record.storeName || 
                                              (record.storeContext && record.storeContext.name) ||
                                              (record.metadata && record.metadata.storeName);
                            
                            // Try multiple matching strategies:
                            // 1. Exact match
                            // 2. Case-insensitive match
                            // 3. Partial match (for cases where one has "Ocean Basket Brits" and other has "Brits")
                            const storeMatch = recordStore === storeIdentifier ||
                                             (recordStore && storeIdentifier && 
                                              recordStore.toLowerCase() === storeIdentifier.toLowerCase()) ||
                                             (recordStore && storeIdentifier && 
                                              (recordStore.includes(storeIdentifier) || storeIdentifier.includes(recordStore)));
                            
                            // Check date range match
                            const recordDate = record.timestamp || record.recordDate || 0;
                            const dateMatch = recordDate >= startTimestamp && recordDate <= endTimestamp;
                            
                            return storeMatch && dateMatch;
                        });
                        
                        stockRecords.push(...locationRecords);
                    }
                }
            }
            
            // Also check the root stockUsage path for backward compatibility
            try {
                console.log(`[HistoricalUsage] Checking root stockUsage path for backward compatibility`); 
                const rootStockRef = ref(getRtdb(), 'stockUsage');
                const rootSnapshot = await get(rootStockRef);
                
                if (rootSnapshot.exists()) {
                    const rootData = rootSnapshot.val() || {};
                    console.log(`[HistoricalUsage] Found ${Object.keys(rootData).length} records in root path`);
                    
                    // Filter root data
                    const rootRecords = Object.entries(rootData)
                        .map(([key, record]) => ({
                            id: key,
                            ...record
                        }))
                        .filter(record => {
                            // Check permissions first
                            const hasAccess = isAdmin ||
                                            record.userId === user.uid ||
                                            (record.selectedLocationId && accessibleLocationIds.has(record.selectedLocationId));
                            
                            if (!hasAccess) {
                                return false;
                            }
                            
                            // Check store name or location ID match - be more flexible
                            const recordStore = record.storeName || 
                                              (record.storeContext && record.storeContext.name) ||
                                              (record.metadata && record.metadata.storeName);
                            
                            const recordLocationId = record.selectedLocationId || 
                                                   (record.storeContext && record.storeContext.locationId) ||
                                                   (record.metadata && record.metadata.locationId);
                            
                            // Try multiple matching strategies for better compatibility
                            const storeMatch = recordStore === storeIdentifier || 
                                             recordLocationId === storeIdentifier ||
                                             (recordStore && storeIdentifier && 
                                              recordStore.toLowerCase() === storeIdentifier.toLowerCase()) ||
                                             (recordStore && storeIdentifier && 
                                              (recordStore.includes(storeIdentifier) || storeIdentifier.includes(recordStore)));
                            
                            // Check date range match
                            const recordDate = record.timestamp || record.recordDate || 0;
                            const dateMatch = recordDate >= startTimestamp && recordDate <= endTimestamp;
                            
                            return storeMatch && dateMatch;
                        });
                    
                    // Add any root records not already in our results
                    const existingIds = new Set(stockRecords.map(r => r.id));
                    rootRecords.forEach(record => {
                        if (!existingIds.has(record.id)) {
                            stockRecords.push(record);
                        }
                    });
                }
            } catch (rootError) {
                console.warn(`[HistoricalUsage] Error checking root stockUsage path: ${rootError.message}`);
            }
            
            // ENHANCEMENT: Also check the new normalized stockData structure
            try {
                console.log(`[HistoricalUsage] Checking new normalized stockData structure`);
                const stockDataRef = ref(getRtdb(), 'stockData');
                const stockDataSnapshot = await get(stockDataRef);
                
                if (stockDataSnapshot.exists()) {
                    const stockDataRecords = stockDataSnapshot.val() || {};
                    console.log(`[HistoricalUsage] Found ${Object.keys(stockDataRecords).length} records in stockData`);
                    
                    // Filter stockData records
                    const normalizedRecords = Object.entries(stockDataRecords)
                        .map(([key, record]) => ({
                            id: key,
                            ...record
                        }))
                        .filter(record => {
                            // Check permissions first
                            const hasAccess = isAdmin ||
                                            record.userId === user.uid ||
                                            (record.locationId && accessibleLocationIds.has(record.locationId)) ||
                                            (record.selectedLocationId && accessibleLocationIds.has(record.selectedLocationId));
                            
                            if (!hasAccess) {
                                return false;
                            }
                            
                            // Check location/store match with enhanced matching
                            const recordStore = record.storeName || record.locationName || 
                                              (record.storeContext && record.storeContext.name) ||
                                              (record.metadata && record.metadata.storeName);
                            
                            const recordLocationId = record.locationId || record.selectedLocationId || 
                                                   (record.storeContext && record.storeContext.locationId) ||
                                                   (record.metadata && record.metadata.locationId);
                            
                            // Enhanced matching strategies for post-migration data
                            const storeMatch = recordStore === storeIdentifier || 
                                             recordLocationId === storeIdentifier ||
                                             (recordStore && storeIdentifier && 
                                              recordStore.toLowerCase() === storeIdentifier.toLowerCase()) ||
                                             (recordStore && storeIdentifier && 
                                              (recordStore.includes(storeIdentifier) || storeIdentifier.includes(recordStore))) ||
                                             // Additional matching for location ID to name resolution
                                             (storeIdentifier.startsWith('-') && recordLocationId === storeIdentifier) ||
                                             (!storeIdentifier.startsWith('-') && recordStore && 
                                              (recordStore.toLowerCase().includes(storeIdentifier.toLowerCase()) || 
                                               storeIdentifier.toLowerCase().includes(recordStore.toLowerCase())));
                            
                            // Check date range match
                            const recordDate = record.timestamp || record.recordDate || 0;
                            const dateMatch = recordDate >= startTimestamp && recordDate <= endTimestamp;
                            
                            return storeMatch && dateMatch;
                        });
                    
                    // Add any normalized records not already in our results
                    const existingIds = new Set(stockRecords.map(r => r.id));
                    normalizedRecords.forEach(record => {
                        if (!existingIds.has(record.id)) {
                            stockRecords.push(record);
                        }
                    });
                    
                    console.log(`[HistoricalUsage] Added ${normalizedRecords.length} records from normalized stockData structure`);
                }
            } catch (stockDataError) {
                console.warn(`[HistoricalUsage] Error checking normalized stockData structure: ${stockDataError.message}`);
            }
            
            console.log(`[HistoricalUsage] Found ${stockRecords.length} total historical records for ${storeIdentifier}`);
            
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
                
                // Debug logging for first few items
                if (itemData.length < 2 && item) {
                    console.log(`[HistoricalUsage] Found item ${itemCode} in record:`, {
                        usage: item.usage,
                        costOfUsage: item.costOfUsage,
                        openingQty: item.openingQty,
                        closingQty: item.closingQty,
                        purchases: item.purchases
                    });
                }
                
                if (item) {
                    // Extract usage value, period days and date
                    // ENHANCEMENT: Calculate usage from stock quantities if not directly available
                    let usage = parseFloat(item.usage || 0);
                    
                    // If usage is not directly available, calculate it from stock quantities
                    if (!usage && (item.openingQty !== undefined || item.openingStockValue !== undefined)) {
                        const openingQty = parseFloat(item.openingQty || item.openingStockValue || 0);
                        const purchaseQty = parseFloat(item.purchaseQty || item.purchases || 0);
                        const closingQty = parseFloat(item.closingQty || item.closingStockValue || 0);
                        
                        // Usage = Opening + Purchases - Closing
                        usage = openingQty + purchaseQty - closingQty;
                        
                        console.log(`[HistoricalUsage] Calculated usage for ${itemCode}: ${openingQty} + ${purchaseQty} - ${closingQty} = ${usage}`);
                    }
                    
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
     * @param {string} storeIdentifier - Store name or location ID to analyze
     * @param {Array} items - Current stock items array 
     * @param {Object} options - Options for analysis
     * @returns {Promise<Object>} - Map of itemCode to historical summary
     */
    async generateHistoricalSummaries(storeIdentifier, items, options = {}) {
        if (!items || !Array.isArray(items) || items.length === 0) {
            console.warn('[HistoricalUsage] No items provided for historical summary generation');
            return {};
        }
        
        const lookbackDays = options.lookbackDays || 365; // Default to 365 days to capture all historical data
        const dateRange = options.dateRange || null;
        
        console.log(`[HistoricalUsage] Generating historical summaries for ${items.length} items`);
        
        // ENHANCEMENT: Try multiple identifiers and merge results for maximum data coverage
        let allHistoricalRecords = [];
        const searchStrategies = [];
        
        // Build search strategies based on the store identifier
        if (storeIdentifier.startsWith('-')) {
            // If it's a location ID, also try to get the location name
            searchStrategies.push({
                identifier: storeIdentifier,
                type: 'Location ID'
            });
            
            // Try to resolve location name from the ID
            try {
                const { ref, get, getRtdb } = await import('../../config/firebase-config.js');
                
                const locationRef = ref(getRtdb(), `locations/${storeIdentifier}`);
                const locationSnapshot = await get(locationRef);
                
                if (locationSnapshot.exists()) {
                    const locationData = locationSnapshot.val();
                    if (locationData.name) {
                        searchStrategies.push({
                            identifier: locationData.name,
                            type: 'Location Name'
                        });
                    }
                    if (locationData.displayName && locationData.displayName !== locationData.name) {
                        searchStrategies.push({
                            identifier: locationData.displayName,
                            type: 'Display Name'
                        });
                    }
                }
            } catch (locationError) {
                console.warn(`[HistoricalUsage] Could not resolve location name for ${storeIdentifier}:`, locationError.message);
            }
        } else {
            // If it's a name, use it directly
            searchStrategies.push({
                identifier: storeIdentifier,
                type: 'Store Name'
            });
        }
        
        console.log(`[HistoricalUsage] Using ${searchStrategies.length} search strategies:`, searchStrategies.map(s => `${s.type}: "${s.identifier}"`).join(', '));
        
        // Execute all search strategies and merge results
        const recordsById = new Map(); // Use Map to avoid duplicates
        
        for (const strategy of searchStrategies) {
            try {
                console.log(`[HistoricalUsage] Searching with ${strategy.type}: "${strategy.identifier}"`);
                const records = await this.getHistoricalData(strategy.identifier, { dateRange, lookbackDays });
                
                console.log(`[HistoricalUsage] Found ${records.length} records with ${strategy.type}`);
                
                // Add records to the map, avoiding duplicates by ID
                records.forEach(record => {
                    if (record.id && !recordsById.has(record.id)) {
                        recordsById.set(record.id, record);
                    }
                });
            } catch (searchError) {
                console.warn(`[HistoricalUsage] Search failed for ${strategy.type} "${strategy.identifier}":`, searchError.message);
            }
        }
        
        // Convert map back to array
        allHistoricalRecords = Array.from(recordsById.values());
        
        console.log(`[HistoricalUsage] Combined total: ${allHistoricalRecords.length} unique historical records`);
        
        if (allHistoricalRecords.length === 0) {
            console.warn(`[HistoricalUsage] No historical records found for any search strategy`);
            return {};
        }
        
        // Process each item
        const summaries = {};
        
        for (const item of items) {
            const itemCode = item.itemCode;
            if (!itemCode) continue;
            
            // Calculate statistics for this item
            const stats = this.calculateItemStatistics(allHistoricalRecords, itemCode);
            
            // Only include items with valid data
            if (stats.dataPoints > 0) {
                summaries[itemCode] = stats;
            }
        }
        
        console.log(`[HistoricalUsage] Generated summaries for ${Object.keys(summaries).length} items from ${allHistoricalRecords.length} total records`);
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
    _getFromCache(key) {
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
     * Calculate date range from different input formats
     * @param {number} lookbackDays - Days to look back from today
     * @returns {Object} - Normalized date range
     * @private
     */
    _calculateDateRange(lookbackDays) {
        const endDate = new Date();
        
        // Calculate based on lookback days
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

// Expose to window for global access
if (typeof window !== 'undefined') {
    window.HistoricalUsageService = HistoricalUsageService;
}

export default HistoricalUsageService;
