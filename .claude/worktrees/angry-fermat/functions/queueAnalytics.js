const admin = require('firebase-admin');
const functions = require('firebase-functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getCurrentDate } = require('./queueManagement');

/**
 * Queue Analytics and Cleanup Functions
 */

/**
 * Generate queue summary for analytics
 * @param {Object} queueData - Queue data for a specific date
 * @returns {Object} Queue summary object
 */
function generateQueueSummary(queueData) {
    const entries = Object.values(queueData.entries || {});
    const metadata = queueData.metadata || {};
    
    // Calculate basic statistics
    const totalQueued = entries.length;
    const totalSeated = entries.filter(e => e.status === 'seated').length;
    const totalRemoved = entries.filter(e => e.status === 'removed').length;
    const totalCalled = entries.filter(e => e.status === 'called').length;
    
    // Calculate average wait time for seated guests
    const seatedEntries = entries.filter(e => e.status === 'seated' && e.seatedAt && e.addedAt);
    const averageWaitTime = seatedEntries.length > 0 
        ? seatedEntries.reduce((sum, entry) => sum + (entry.seatedAt - entry.addedAt), 0) / seatedEntries.length / 60000 // Convert to minutes
        : 0;
    
    // Calculate peak queue size
    const peakQueueSize = Math.max(metadata.maxCapacity || 0, totalQueued);
    
    // Generate hourly statistics
    const hourlyStats = generateHourlyStats(entries);
    
    return {
        totalQueued,
        totalSeated,
        totalRemoved,
        totalCalled,
        averageWaitTime: Math.round(averageWaitTime),
        peakQueueSize,
        hourlyStats,
        completionRate: totalQueued > 0 ? Math.round((totalSeated / totalQueued) * 100) : 0,
        cancelationRate: totalQueued > 0 ? Math.round((totalRemoved / totalQueued) * 100) : 0
    };
}

/**
 * Generate hourly statistics from queue entries
 * @param {Array} entries - Array of queue entries
 * @returns {Object} Hourly statistics object
 */
function generateHourlyStats(entries) {
    const hourlyStats = {};
    
    // Initialize all hours (0-23)
    for (let hour = 0; hour < 24; hour++) {
        hourlyStats[hour] = {
            queued: 0,
            seated: 0,
            avgWaitTime: 0,
            removed: 0
        };
    }
    
    // Process each entry
    entries.forEach(entry => {
        if (entry.addedAt) {
            const addedHour = new Date(entry.addedAt).getHours();
            hourlyStats[addedHour].queued++;
            
            if (entry.status === 'seated' && entry.seatedAt) {
                hourlyStats[addedHour].seated++;
                const waitTime = (entry.seatedAt - entry.addedAt) / 60000; // Convert to minutes
                hourlyStats[addedHour].avgWaitTime = 
                    (hourlyStats[addedHour].avgWaitTime + waitTime) / 2; // Simple average
            } else if (entry.status === 'removed') {
                hourlyStats[addedHour].removed++;
            }
        }
    });
    
    // Round wait times
    Object.keys(hourlyStats).forEach(hour => {
        hourlyStats[hour].avgWaitTime = Math.round(hourlyStats[hour].avgWaitTime);
    });
    
    return hourlyStats;
}

/**
 * Clean up old queue data and generate analytics
 * @param {number} retentionDays - Number of days to retain queue data
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanupOldQueues(retentionDays = 7) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        const cutoffDateString = cutoffDate.toISOString().split('T')[0];
        
        console.log(`Starting queue cleanup for dates older than ${cutoffDateString}`);
        
        const queuesRef = admin.database().ref('queues');
        const queuesSnapshot = await queuesRef.once('value');
        const allQueues = queuesSnapshot.val() || {};
        
        const updates = {};
        let processedCount = 0;
        let archivedCount = 0;
        
        // Process each location
        for (const [locationId, locationQueues] of Object.entries(allQueues)) {
            for (const [dateString, queueData] of Object.entries(locationQueues)) {
                processedCount++;
                
                if (dateString < cutoffDateString) {
                    // Generate analytics summary
                    const queueSummary = generateQueueSummary(queueData);
                    
                    // Archive to queue-history
                    updates[`queue-history/${locationId}/${dateString}`] = {
                        ...queueSummary,
                        date: dateString,
                        locationId,
                        archivedAt: admin.database.ServerValue.TIMESTAMP
                    };
                    
                    // Mark for deletion
                    updates[`queues/${locationId}/${dateString}`] = null;
                    archivedCount++;
                    
                    console.log(`Archiving queue data for ${locationId} on ${dateString}`);
                }
            }
        }
        
        // Apply updates if any
        if (Object.keys(updates).length > 0) {
            await admin.database().ref().update(updates);
        }
        
        console.log(`Queue cleanup completed: ${processedCount} queues processed, ${archivedCount} archived`);
        
        return {
            success: true,
            message: `Cleanup completed: ${processedCount} queues processed, ${archivedCount} archived`,
            processedCount,
            archivedCount,
            cutoffDate: cutoffDateString
        };
        
    } catch (error) {
        console.error('Error during queue cleanup:', error);
        return {
            success: false,
            message: error.message || 'Failed to cleanup queues',
            error: error.toString()
        };
    }
}

/**
 * Get queue analytics for a specific location and date range
 * @param {string} locationId - Location ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Analytics data
 */
async function getQueueAnalytics(locationId, startDate, endDate) {
    try {
        const historyRef = admin.database().ref(`queue-history/${locationId}`);
        const historySnapshot = await historyRef
            .orderByKey()
            .startAt(startDate)
            .endAt(endDate)
            .once('value');
        
        const historyData = historySnapshot.val() || {};
        
        if (Object.keys(historyData).length === 0) {
            return {
                success: true,
                data: {
                    totalDays: 0,
                    totalQueued: 0,
                    totalSeated: 0,
                    totalRemoved: 0,
                    avgWaitTime: 0,
                    avgCompletionRate: 0,
                    avgCancelationRate: 0,
                    dailyStats: {},
                    hourlyTrends: {}
                }
            };
        }
        
        // Aggregate data
        const analytics = {
            totalDays: Object.keys(historyData).length,
            totalQueued: 0,
            totalSeated: 0,
            totalRemoved: 0,
            totalCalled: 0,
            avgWaitTime: 0,
            avgCompletionRate: 0,
            avgCancelationRate: 0,
            dailyStats: {},
            hourlyTrends: {}
        };
        
        // Initialize hourly trends
        for (let hour = 0; hour < 24; hour++) {
            analytics.hourlyTrends[hour] = {
                queued: 0,
                seated: 0,
                avgWaitTime: 0,
                removed: 0
            };
        }
        
        // Process each day's data
        Object.entries(historyData).forEach(([date, dayData]) => {
            analytics.totalQueued += dayData.totalQueued || 0;
            analytics.totalSeated += dayData.totalSeated || 0;
            analytics.totalRemoved += dayData.totalRemoved || 0;
            analytics.totalCalled += dayData.totalCalled || 0;
            
            // Store daily stats
            analytics.dailyStats[date] = {
                queued: dayData.totalQueued || 0,
                seated: dayData.totalSeated || 0,
                removed: dayData.totalRemoved || 0,
                avgWaitTime: dayData.averageWaitTime || 0,
                completionRate: dayData.completionRate || 0,
                cancelationRate: dayData.cancelationRate || 0
            };
            
            // Aggregate hourly trends
            if (dayData.hourlyStats) {
                Object.entries(dayData.hourlyStats).forEach(([hour, hourData]) => {
                    analytics.hourlyTrends[hour].queued += hourData.queued || 0;
                    analytics.hourlyTrends[hour].seated += hourData.seated || 0;
                    analytics.hourlyTrends[hour].removed += hourData.removed || 0;
                    analytics.hourlyTrends[hour].avgWaitTime += hourData.avgWaitTime || 0;
                });
            }
        });
        
        // Calculate averages
        analytics.avgWaitTime = analytics.totalSeated > 0 
            ? Math.round(Object.values(analytics.dailyStats).reduce((sum, day) => sum + day.avgWaitTime, 0) / analytics.totalDays)
            : 0;
        
        analytics.avgCompletionRate = analytics.totalQueued > 0
            ? Math.round((analytics.totalSeated / analytics.totalQueued) * 100)
            : 0;
        
        analytics.avgCancelationRate = analytics.totalQueued > 0
            ? Math.round((analytics.totalRemoved / analytics.totalQueued) * 100)
            : 0;
        
        // Average hourly trends
        Object.keys(analytics.hourlyTrends).forEach(hour => {
            analytics.hourlyTrends[hour].avgWaitTime = Math.round(
                analytics.hourlyTrends[hour].avgWaitTime / analytics.totalDays
            );
        });
        
        return {
            success: true,
            data: analytics
        };
        
    } catch (error) {
        console.error('Error getting queue analytics:', error);
        return {
            success: false,
            message: error.message || 'Failed to get queue analytics'
        };
    }
}

/**
 * Generate real-time queue metrics
 * @param {string} locationId - Location ID
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Promise<Object>} Real-time metrics
 */
async function getRealtimeQueueMetrics(locationId, date = getCurrentDate()) {
    try {
        const queuePath = `queues/${locationId}/${date}`;
        
        const [metadataSnapshot, entriesSnapshot] = await Promise.all([
            admin.database().ref(`${queuePath}/metadata`).once('value'),
            admin.database().ref(`${queuePath}/entries`).once('value')
        ]);
        
        const metadata = metadataSnapshot.val() || {};
        const entries = Object.values(entriesSnapshot.val() || {});
        
        // Calculate real-time metrics
        const metrics = {
            currentWaiting: entries.filter(e => e.status === 'waiting').length,
            currentCalled: entries.filter(e => e.status === 'called').length,
            totalToday: entries.length,
            seatedToday: entries.filter(e => e.status === 'seated').length,
            removedToday: entries.filter(e => e.status === 'removed').length,
            averageWaitTime: metadata.estimatedWaitTime || 0,
            longestWaitTime: 0,
            queueStatus: metadata.queueStatus || 'unknown',
            lastUpdated: metadata.updatedAt || Date.now()
        };
        
        // Calculate longest wait time
        const waitingEntries = entries.filter(e => e.status === 'waiting');
        if (waitingEntries.length > 0) {
            const now = Date.now();
            metrics.longestWaitTime = Math.max(
                ...waitingEntries.map(entry => Math.round((now - entry.addedAt) / 60000))
            );
        }
        
        return {
            success: true,
            data: metrics
        };
        
    } catch (error) {
        console.error('Error getting real-time queue metrics:', error);
        return {
            success: false,
            message: error.message || 'Failed to get real-time metrics'
        };
    }
}

/**
 * Scheduled function to clean up old queues daily
 */
exports.cleanupOldQueuesScheduled = onSchedule('every 24 hours', async (event) => {
    console.log('Starting scheduled queue cleanup...');
    
    const result = await cleanupOldQueues(7); // Keep 7 days
    
    if (result.success) {
        console.log('Scheduled cleanup completed successfully:', result.message);
    } else {
        console.error('Scheduled cleanup failed:', result.message);
    }
    
    return result;
});

module.exports = {
    generateQueueSummary,
    generateHourlyStats,
    cleanupOldQueues,
    getQueueAnalytics,
    getRealtimeQueueMetrics
};