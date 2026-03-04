const { LRUCache } = require('lru-cache');

/**
 * Queue Performance Optimization and Caching
 * Implements in-memory caching for frequently accessed queue data
 */

// Cache configuration
const CACHE_OPTIONS = {
    max: 500, // Maximum number of items
    ttl: 1000 * 60 * 5, // 5 minutes TTL
    allowStale: false,
    updateAgeOnGet: true,
    updateAgeOnHas: true
};

// Cache instances
const queueMetadataCache = new LRUCache(CACHE_OPTIONS);
const queueEntriesCache = new LRUCache(CACHE_OPTIONS);
const locationCache = new LRUCache({
    ...CACHE_OPTIONS,
    ttl: 1000 * 60 * 30 // 30 minutes for location data
});

/**
 * Generate cache key for queue metadata
 * @param {string} locationId - Location ID
 * @param {string} date - Date string
 * @returns {string} Cache key
 */
function getMetadataCacheKey(locationId, date) {
    return `metadata:${locationId}:${date}`;
}

/**
 * Generate cache key for queue entries
 * @param {string} locationId - Location ID
 * @param {string} date - Date string
 * @returns {string} Cache key
 */
function getEntriesCacheKey(locationId, date) {
    return `entries:${locationId}:${date}`;
}

/**
 * Generate cache key for location data
 * @param {string} locationId - Location ID
 * @returns {string} Cache key
 */
function getLocationCacheKey(locationId) {
    return `location:${locationId}`;
}

/**
 * Cache queue metadata
 * @param {string} locationId - Location ID
 * @param {string} date - Date string
 * @param {Object} metadata - Metadata object
 */
function cacheQueueMetadata(locationId, date, metadata) {
    const cacheKey = getMetadataCacheKey(locationId, date);
    queueMetadataCache.set(cacheKey, {
        data: metadata,
        timestamp: Date.now()
    });
}

/**
 * Get cached queue metadata
 * @param {string} locationId - Location ID
 * @param {string} date - Date string
 * @returns {Object|null} Cached metadata or null
 */
function getCachedQueueMetadata(locationId, date) {
    const cacheKey = getMetadataCacheKey(locationId, date);
    const cached = queueMetadataCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 30000) { // 30 second freshness
        return cached.data;
    }
    
    return null;
}

/**
 * Cache queue entries
 * @param {string} locationId - Location ID
 * @param {string} date - Date string
 * @param {Object} entries - Entries object
 */
function cacheQueueEntries(locationId, date, entries) {
    const cacheKey = getEntriesCacheKey(locationId, date);
    queueEntriesCache.set(cacheKey, {
        data: entries,
        timestamp: Date.now()
    });
}

/**
 * Get cached queue entries
 * @param {string} locationId - Location ID
 * @param {string} date - Date string
 * @returns {Object|null} Cached entries or null
 */
function getCachedQueueEntries(locationId, date) {
    const cacheKey = getEntriesCacheKey(locationId, date);
    const cached = queueEntriesCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 15000) { // 15 second freshness
        return cached.data;
    }
    
    return null;
}

/**
 * Cache location data
 * @param {string} locationId - Location ID
 * @param {Object} locationData - Location data object
 */
function cacheLocationData(locationId, locationData) {
    const cacheKey = getLocationCacheKey(locationId);
    locationCache.set(cacheKey, locationData);
}

/**
 * Get cached location data
 * @param {string} locationId - Location ID
 * @returns {Object|null} Cached location data or null
 */
function getCachedLocationData(locationId) {
    const cacheKey = getLocationCacheKey(locationId);
    return locationCache.get(cacheKey);
}

/**
 * Invalidate cache for specific queue
 * @param {string} locationId - Location ID
 * @param {string} date - Date string
 */
function invalidateQueueCache(locationId, date) {
    const metadataKey = getMetadataCacheKey(locationId, date);
    const entriesKey = getEntriesCacheKey(locationId, date);
    
    queueMetadataCache.delete(metadataKey);
    queueEntriesCache.delete(entriesKey);
}

/**
 * Invalidate all cache for a location
 * @param {string} locationId - Location ID
 */
function invalidateLocationCache(locationId) {
    // Clear location cache
    const locationKey = getLocationCacheKey(locationId);
    locationCache.delete(locationKey);
    
    // Clear all queue caches for this location
    const metadataKeys = [...queueMetadataCache.keys()].filter(key => key.includes(locationId));
    const entriesKeys = [...queueEntriesCache.keys()].filter(key => key.includes(locationId));
    
    metadataKeys.forEach(key => queueMetadataCache.delete(key));
    entriesKeys.forEach(key => queueEntriesCache.delete(key));
}

/**
 * Clear all caches
 */
function clearAllCaches() {
    queueMetadataCache.clear();
    queueEntriesCache.clear();
    locationCache.clear();
}

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
    return {
        metadata: {
            size: queueMetadataCache.size,
            max: queueMetadataCache.max,
            ttl: queueMetadataCache.ttl,
            hits: queueMetadataCache.hits || 0,
            misses: queueMetadataCache.misses || 0
        },
        entries: {
            size: queueEntriesCache.size,
            max: queueEntriesCache.max,
            ttl: queueEntriesCache.ttl,
            hits: queueEntriesCache.hits || 0,
            misses: queueEntriesCache.misses || 0
        },
        location: {
            size: locationCache.size,
            max: locationCache.max,
            ttl: locationCache.ttl,
            hits: locationCache.hits || 0,
            misses: locationCache.misses || 0
        }
    };
}

/**
 * Batch operations helper to reduce database calls
 */
class BatchOperations {
    constructor() {
        this.operations = [];
        this.batchSize = 20;
        this.batchTimeout = 1000; // 1 second
    }
    
    /**
     * Add operation to batch
     * @param {Function} operation - Operation function
     * @param {Array} args - Operation arguments
     * @returns {Promise} Operation promise
     */
    addOperation(operation, args) {
        return new Promise((resolve, reject) => {
            this.operations.push({
                operation,
                args,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            // Execute batch if size limit reached
            if (this.operations.length >= this.batchSize) {
                this.executeBatch();
            }
        });
    }
    
    /**
     * Execute batch operations
     */
    async executeBatch() {
        if (this.operations.length === 0) return;
        
        const batch = this.operations.splice(0, this.batchSize);
        
        // Execute all operations in parallel
        const results = await Promise.allSettled(
            batch.map(({ operation, args }) => operation(...args))
        );
        
        // Resolve/reject individual promises
        results.forEach((result, index) => {
            const { resolve, reject } = batch[index];
            
            if (result.status === 'fulfilled') {
                resolve(result.value);
            } else {
                reject(result.reason);
            }
        });
    }
    
    /**
     * Start batch processing with timeout
     */
    startBatchProcessing() {
        setInterval(() => {
            if (this.operations.length > 0) {
                this.executeBatch();
            }
        }, this.batchTimeout);
    }
}

// Global batch operations instance
const batchOps = new BatchOperations();
batchOps.startBatchProcessing();

/**
 * Performance monitoring utilities
 */
class PerformanceMonitor {
    constructor() {
        this.metrics = {
            operations: {},
            averageResponseTime: 0,
            totalRequests: 0,
            errors: 0
        };
    }
    
    /**
     * Start performance measurement
     * @param {string} operationName - Operation name
     * @returns {Function} End measurement function
     */
    startMeasurement(operationName) {
        const startTime = process.hrtime.bigint();
        
        return (success = true) => {
            const endTime = process.hrtime.bigint();
            const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
            
            if (!this.metrics.operations[operationName]) {
                this.metrics.operations[operationName] = {
                    totalTime: 0,
                    count: 0,
                    errors: 0,
                    averageTime: 0
                };
            }
            
            const operation = this.metrics.operations[operationName];
            operation.totalTime += duration;
            operation.count++;
            
            if (!success) {
                operation.errors++;
                this.metrics.errors++;
            }
            
            operation.averageTime = operation.totalTime / operation.count;
            
            // Update global metrics
            this.metrics.totalRequests++;
            this.metrics.averageResponseTime = 
                Object.values(this.metrics.operations)
                    .reduce((sum, op) => sum + op.averageTime, 0) / 
                Object.keys(this.metrics.operations).length;
        };
    }
    
    /**
     * Get performance metrics
     * @returns {Object} Performance metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    
    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            operations: {},
            averageResponseTime: 0,
            totalRequests: 0,
            errors: 0
        };
    }
}

// Global performance monitor instance
const perfMonitor = new PerformanceMonitor();

module.exports = {
    // Cache functions
    cacheQueueMetadata,
    getCachedQueueMetadata,
    cacheQueueEntries,
    getCachedQueueEntries,
    cacheLocationData,
    getCachedLocationData,
    invalidateQueueCache,
    invalidateLocationCache,
    clearAllCaches,
    getCacheStats,
    
    // Batch operations
    batchOps,
    BatchOperations,
    
    // Performance monitoring
    perfMonitor,
    PerformanceMonitor
};