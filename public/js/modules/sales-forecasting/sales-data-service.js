/**
 * Sales Data Service
 * 
 * Handles CRUD operations for sales data, forecasts, and actuals
 * in Firebase Realtime Database.
 */

import { rtdb, ref, get, set, push, update, remove, query, orderByChild, equalTo, onValue } from '../../config/firebase-config.js';

export class SalesDataService {
    /**
     * Initialize the service
     * @param {string} userId - Current user ID
     */
    constructor(userId) {
        this.userId = userId;
        console.log('[SalesDataService] Initialized for user:', userId);
    }

    // ==========================================
    // Historical Sales Data Operations
    // ==========================================

    /**
     * Save historical sales data for a location
     * @param {string} locationId - Location ID
     * @param {Array} dailyData - Array of daily sales records
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Save result with salesDataId
     */
    async saveHistoricalData(locationId, dailyData, options = {}) {
        try {
            const salesDataRef = push(ref(rtdb, 'salesData'));
            const salesDataId = salesDataRef.key;

            // Calculate summary statistics
            const summary = this.calculateDataSummary(dailyData);

            // Get date range
            const dates = dailyData.map(d => d.date).sort();
            const dateRange = {
                startDate: dates[0],
                endDate: dates[dates.length - 1]
            };

            // Get location name
            const locationName = options.locationName || await this.getLocationName(locationId);

            // Prepare the data record
            const salesDataRecord = {
                locationId,
                locationName,
                userId: this.userId,
                uploadedAt: Date.now(),
                dataSource: options.dataSource || 'csv_upload',
                dateRange,
                recordCount: dailyData.length,
                summary,
                dailyData: this.indexDailyData(dailyData)
            };

            // Save the data
            await set(salesDataRef, salesDataRecord);

            // Update index
            await this.updateSalesDataIndex(salesDataId, locationId, this.userId);

            console.log('[SalesDataService] Saved historical data:', salesDataId);

            return {
                salesDataId,
                recordCount: dailyData.length,
                dateRange
            };
        } catch (error) {
            console.error('[SalesDataService] Error saving historical data:', error);
            throw error;
        }
    }

    /**
     * Get list of saved historical data sets for a location
     * @param {string} locationId - Location ID
     * @returns {Promise<Array>} List of saved data sets
     */
    async getHistoricalDataList(locationId) {
        try {
            const indexRef = ref(rtdb, `salesDataIndex/byLocation/${locationId}`);
            const snapshot = await get(indexRef);

            if (!snapshot.exists()) {
                return [];
            }

            const dataIds = Object.keys(snapshot.val());
            const dataSets = [];

            for (const id of dataIds) {
                const dataRef = ref(rtdb, `salesData/${id}`);
                const dataSnapshot = await get(dataRef);

                if (dataSnapshot.exists()) {
                    const data = dataSnapshot.val();
                    dataSets.push({
                        id,
                        locationId: data.locationId,
                        locationName: data.locationName,
                        uploadedAt: data.uploadedAt,
                        dateRange: data.dateRange,
                        recordCount: data.recordCount,
                        summary: data.summary
                    });
                }
            }

            // Sort by upload date descending
            dataSets.sort((a, b) => b.uploadedAt - a.uploadedAt);

            return dataSets;
        } catch (error) {
            console.error('[SalesDataService] Error getting historical data list:', error);
            throw error;
        }
    }

    /**
     * Get full historical data set
     * @param {string} salesDataId - Sales data ID
     * @returns {Promise<Object>} Full data set including daily data
     */
    async getHistoricalData(salesDataId) {
        try {
            const dataRef = ref(rtdb, `salesData/${salesDataId}`);
            const snapshot = await get(dataRef);

            if (!snapshot.exists()) {
                throw new Error('Sales data not found');
            }

            const data = snapshot.val();

            // Convert indexed daily data back to array
            data.dailyDataArray = this.dailyDataToArray(data.dailyData);

            return data;
        } catch (error) {
            console.error('[SalesDataService] Error getting historical data:', error);
            throw error;
        }
    }

    /**
     * Delete historical data set
     * @param {string} salesDataId - Sales data ID
     */
    async deleteHistoricalData(salesDataId) {
        try {
            // Get the data first to get location info
            const dataRef = ref(rtdb, `salesData/${salesDataId}`);
            const snapshot = await get(dataRef);

            if (snapshot.exists()) {
                const data = snapshot.val();

                // Remove from index
                const indexRef = ref(rtdb, `salesDataIndex/byLocation/${data.locationId}/${salesDataId}`);
                await remove(indexRef);

                const userIndexRef = ref(rtdb, `salesDataIndex/byUser/${this.userId}/${salesDataId}`);
                await remove(userIndexRef);
            }

            // Remove the data
            await remove(dataRef);

            console.log('[SalesDataService] Deleted historical data:', salesDataId);
        } catch (error) {
            console.error('[SalesDataService] Error deleting historical data:', error);
            throw error;
        }
    }

    /**
     * Get list of forecasts for a location with real-time updates
     * @param {string} locationId - Location ID
     * @param {Function} callback - Callback function(forecasts)
     * @returns {Function} Unsubscribe function
     */
    getForecastsList(locationId, callback) {
        console.log('[SalesDataService] Attaching real-time listener for forecasts:', locationId);

        const forecastsRef = ref(rtdb, `forecastIndex/byLocation/${locationId}`);

        const unsubscribe = onValue(forecastsRef, async (snapshot) => {
            const forecasts = [];

            if (snapshot.exists()) {
                const forecastIds = Object.keys(snapshot.val());

                for (const forecastId of forecastIds) {
                    try {
                        const forecastRef = ref(rtdb, `forecasts/${forecastId}`);
                        const forecastSnapshot = await get(forecastRef);

                        if (forecastSnapshot.exists()) {
                            const forecast = forecastSnapshot.val();

                            forecasts.push({
                                id: forecastId,
                                name: forecast.metadata?.name || this.generateDefaultName(forecast),
                                description: forecast.metadata?.description || '',
                                savedAt: forecast.metadata?.savedAt || forecast.createdAt,
                                method: forecast.config?.method || 'unknown',
                                horizon: forecast.config?.horizon || 0,
                                summary: forecast.summary || null,
                                accuracy: forecast.accuracy || null,
                                savedAgo: this.getTimeAgo(forecast.metadata?.savedAt || forecast.createdAt)
                            });
                        }
                    } catch (error) {
                        console.error('[SalesDataService] Error loading forecast:', forecastId, error);
                    }
                }

                // Sort by most recent first
                forecasts.sort((a, b) => b.savedAt - a.savedAt);
            }

            console.log('[SalesDataService] Forecasts updated:', forecasts.length);
            callback(forecasts);
        });

        return unsubscribe;
    }

    /**
     * Get complete saved forecast data
     * @param {string} forecastId - Forecast ID
     * @returns {Promise<Object>} Complete forecast object
     */
    async getSavedForecast(forecastId) {
        try {
            console.log('[SalesDataService] Loading saved forecast:', forecastId);

            const forecastRef = ref(rtdb, `forecasts/${forecastId}`);
            const snapshot = await get(forecastRef);

            if (!snapshot.exists()) {
                throw new Error('Forecast not found');
            }

            const forecast = snapshot.val();

            return {
                id: forecastId,
                ...forecast
            };
        } catch (error) {
            console.error('[SalesDataService] Error loading forecast:', error);
            throw error;
        }
    }

    /**
     * Update forecast name and description
     * @param {string} forecastId - Forecast ID
     * @param {Object} updates - {name, description}
     * @returns {Promise<void>}
     */
    async updateForecastMetadata(forecastId, updates) {
        try {
            console.log('[SalesDataService] Updating forecast metadata:', forecastId);

            const metadataRef = ref(rtdb, `forecasts/${forecastId}/metadata`);

            await update(metadataRef, {
                name: updates.name,
                description: updates.description || '',
                updatedAt: Date.now()
            });

            console.log('[SalesDataService] Forecast metadata updated');
        } catch (error) {
            console.error('[SalesDataService] Error updating forecast metadata:', error);
            throw error;
        }
    }

    /**
     * Delete a saved forecast
     * @param {string} forecastId - Forecast ID
     * @returns {Promise<void>}
     */
    async deleteForecast(forecastId) {
        try {
            console.log('[SalesDataService] Deleting forecast:', forecastId);

            // Get forecast to find location
            const forecastRef = ref(rtdb, `forecasts/${forecastId}`);
            const snapshot = await get(forecastRef);

            if (snapshot.exists()) {
                const forecast = snapshot.val();

                // Remove from location index
                if (forecast.locationId) {
                    const locationIndexRef = ref(rtdb, `forecastIndex/byLocation/${forecast.locationId}/${forecastId}`);
                    await remove(locationIndexRef);
                }

                // Remove from user index
                const userIndexRef = ref(rtdb, `forecastIndex/byUser/${this.userId}/${forecastId}`);
                await remove(userIndexRef);
            }

            // Remove the forecast
            await remove(forecastRef);

            console.log('[SalesDataService] Forecast deleted');
        } catch (error) {
            console.error('[SalesDataService] Error deleting forecast:', error);
            throw error;
        }
    }

    // ==========================================
    // Forecast Operations
    // ==========================================

    /**
     * Save a forecast
     * @param {string} locationId - Location ID
     * @param {string} salesDataId - Source sales data ID
     * @param {Object} forecast - Forecast data
     * @returns {Promise<Object>} Save result with forecastId
     */
    async saveForecast(locationId, salesDataId, forecast) {
        try {
            const forecastRef = push(ref(rtdb, 'forecasts'));
            const forecastId = forecastRef.key;

            // Get location name
            const locationName = await this.getLocationName(locationId);

            // Prepare the forecast record
            const forecastRecord = {
                locationId,
                locationName,
                userId: this.userId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                status: 'active',
                salesDataId,
                config: forecast.config,
                predictions: this.formatPredictions(forecast.predictions),
                metadata: {
                    totalPredictedRevenue: this.calculateTotalPredictedRevenue(forecast.predictions),
                    adjustmentCount: 0
                }
            };

            // Save the forecast
            await set(forecastRef, forecastRecord);

            // Update index
            await this.updateForecastIndex(forecastId, locationId);

            console.log('[SalesDataService] Saved forecast:', forecastId);

            return { forecastId };
        } catch (error) {
            console.error('[SalesDataService] Error saving forecast:', error);
            throw error;
        }
    }

    /**
     * Get forecasts for a location
     * @param {string} locationId - Location ID
     * @param {string} status - Filter by status (optional)
     * @returns {Promise<Array>} List of forecasts
     */
    async getForecasts(locationId, status = null) {
        try {
            const indexRef = ref(rtdb, `forecastIndex/byLocation/${locationId}`);
            const snapshot = await get(indexRef);

            if (!snapshot.exists()) {
                return [];
            }

            const forecastIndex = snapshot.val();
            const forecasts = [];

            for (const [forecastId, indexData] of Object.entries(forecastIndex)) {
                if (status && indexData.status !== status) {
                    continue;
                }

                const dataRef = ref(rtdb, `forecasts/${forecastId}`);
                const dataSnapshot = await get(dataRef);

                if (dataSnapshot.exists()) {
                    forecasts.push({
                        id: forecastId,
                        ...dataSnapshot.val()
                    });
                }
            }

            // Sort by creation date descending
            forecasts.sort((a, b) => b.createdAt - a.createdAt);

            return forecasts;
        } catch (error) {
            console.error('[SalesDataService] Error getting forecasts:', error);
            throw error;
        }
    }

    /**
     * Get a single forecast
     * @param {string} forecastId - Forecast ID
     * @returns {Promise<Object>} Forecast data
     */
    async getForecast(forecastId) {
        try {
            const dataRef = ref(rtdb, `forecasts/${forecastId}`);
            const snapshot = await get(dataRef);

            if (!snapshot.exists()) {
                throw new Error('Forecast not found');
            }

            return {
                id: forecastId,
                ...snapshot.val()
            };
        } catch (error) {
            console.error('[SalesDataService] Error getting forecast:', error);
            throw error;
        }
    }

    /**
     * Update forecast adjustments
     * @param {string} forecastId - Forecast ID
     * @param {Object} adjustments - Adjustments by date
     */
    async updateForecastAdjustments(forecastId, adjustments) {
        try {
            const updates = {};
            let adjustmentCount = 0;

            for (const [date, adjustment] of Object.entries(adjustments)) {
                updates[`forecasts/${forecastId}/predictions/${date}/adjusted`] = adjustment;
                if (adjustment.reason) {
                    updates[`forecasts/${forecastId}/predictions/${date}/adjustmentReason`] = adjustment.reason;
                }
                adjustmentCount++;
            }

            updates[`forecasts/${forecastId}/updatedAt`] = Date.now();
            updates[`forecasts/${forecastId}/metadata/adjustmentCount`] = adjustmentCount;

            await update(ref(rtdb), updates);

            console.log('[SalesDataService] Updated adjustments for forecast:', forecastId);
        } catch (error) {
            console.error('[SalesDataService] Error updating adjustments:', error);
            throw error;
        }
    }

    /**
     * Archive a forecast
     * @param {string} forecastId - Forecast ID
     */
    async archiveForecast(forecastId) {
        try {
            const updates = {
                [`forecasts/${forecastId}/status`]: 'archived',
                [`forecasts/${forecastId}/updatedAt`]: Date.now()
            };

            // Also update index
            const forecast = await this.getForecast(forecastId);
            updates[`forecastIndex/byLocation/${forecast.locationId}/${forecastId}/status`] = 'archived';

            await update(ref(rtdb), updates);

            console.log('[SalesDataService] Archived forecast:', forecastId);
        } catch (error) {
            console.error('[SalesDataService] Error archiving forecast:', error);
            throw error;
        }
    }

    // ==========================================
    // Actuals Operations
    // ==========================================

    /**
     * Save actual sales data for comparison
     * @param {string} forecastId - Forecast to compare against
     * @param {Array} dailyActuals - Actual sales data
     * @returns {Promise<Object>} Save result with actualId
     */
    async saveActuals(forecastId, dailyActuals) {
        try {
            const actualRef = push(ref(rtdb, 'forecastActuals'));
            const actualId = actualRef.key;

            // Get the forecast to get location info
            const forecast = await this.getForecast(forecastId);

            // Get date range
            const dates = dailyActuals.map(d => d.date).sort();
            const dateRange = {
                startDate: dates[0],
                endDate: dates[dates.length - 1]
            };

            // Prepare the actuals record
            const actualsRecord = {
                forecastId,
                locationId: forecast.locationId,
                uploadedAt: Date.now(),
                uploadedBy: this.userId,
                dateRange,
                dailyActuals: this.indexDailyData(dailyActuals),
                comparison: null // Will be calculated by analytics
            };

            // Save the actuals
            await set(actualRef, actualsRecord);

            console.log('[SalesDataService] Saved actuals:', actualId);

            return { actualId };
        } catch (error) {
            console.error('[SalesDataService] Error saving actuals:', error);
            throw error;
        }
    }

    /**
     * Get actuals for a forecast
     * @param {string} forecastId - Forecast ID
     * @returns {Promise<Object|null>} Actuals data or null
     */
    async getActuals(forecastId) {
        try {
            // Query actuals by forecastId
            const actualsRef = ref(rtdb, 'forecastActuals');
            const snapshot = await get(actualsRef);

            if (!snapshot.exists()) {
                return null;
            }

            const allActuals = snapshot.val();
            for (const [id, actuals] of Object.entries(allActuals)) {
                if (actuals.forecastId === forecastId) {
                    return {
                        id,
                        ...actuals,
                        dailyActualsArray: this.dailyDataToArray(actuals.dailyActuals)
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('[SalesDataService] Error getting actuals:', error);
            throw error;
        }
    }

    /**
     * Update comparison results for actuals
     * @param {string} actualId - Actuals ID
     * @param {Object} comparison - Comparison results
     */
    async updateComparison(actualId, comparison) {
        try {
            const updates = {
                [`forecastActuals/${actualId}/comparison`]: comparison
            };

            await update(ref(rtdb), updates);

            console.log('[SalesDataService] Updated comparison for actuals:', actualId);
        } catch (error) {
            console.error('[SalesDataService] Error updating comparison:', error);
            throw error;
        }
    }

    // ==========================================
    // Helper Methods
    // ==========================================

    /**
     * Calculate summary statistics for daily data
     */
    calculateDataSummary(dailyData) {
        const totalRevenue = dailyData.reduce((sum, d) => sum + (d.revenue || 0), 0);
        const totalTransactions = dailyData.reduce((sum, d) => sum + (d.transactions || d.transaction_qty || 0), 0);

        return {
            totalRevenue,
            avgDailyRevenue: dailyData.length > 0 ? totalRevenue / dailyData.length : 0,
            totalTransactions,
            avgTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0
        };
    }

    /**
     * Index daily data by date for efficient storage
     * Aggregates duplicate dates by summing revenue and transactions
     */
    indexDailyData(dailyData) {
        const indexed = {};

        // Helper to format date without timezone issues
        const formatDateKey = (date) => {
            if (typeof date === 'string') return date.split('T')[0].replace(/\//g, '-');
            const d = new Date(date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        for (const day of dailyData) {
            const dateKey = formatDateKey(day.date);

            // If date already exists, aggregate the values
            if (indexed[dateKey]) {
                indexed[dateKey].revenue += (day.revenue || 0);
                indexed[dateKey].transactions += (day.transactions || day.transaction_qty || day.transactionQty || 0);
                // Recalculate avgSpend
                indexed[dateKey].avgSpend = indexed[dateKey].transactions > 0
                    ? indexed[dateKey].revenue / indexed[dateKey].transactions
                    : 0;
            } else {
                indexed[dateKey] = {
                    revenue: day.revenue || 0,
                    transactions: day.transactions || day.transaction_qty || day.transactionQty || 0,
                    avgSpend: day.avgSpend || day.avg_spend || 0
                };
            }
        }

        return indexed;
    }

    /**
     * Convert indexed daily data back to array
     */
    dailyDataToArray(indexedData) {
        if (!indexedData) return [];

        return Object.entries(indexedData).map(([date, data]) => ({
            date,
            ...data
        })).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    /**
     * Format predictions for storage
     */
    formatPredictions(predictions) {
        const formatted = {};

        for (const pred of predictions) {
            const dateKey = typeof pred.date === 'string'
                ? pred.date
                : pred.date.toISOString().split('T')[0];

            formatted[dateKey] = {
                original: {
                    revenue: pred.revenue,
                    transactions: pred.transactionQty || pred.transactions,
                    avgSpend: pred.avgSpend
                },
                confidenceLower: pred.confidenceLower,
                confidenceUpper: pred.confidenceUpper
            };
        }

        return formatted;
    }

    /**
     * Calculate total predicted revenue
     */
    calculateTotalPredictedRevenue(predictions) {
        return predictions.reduce((sum, p) => sum + (p.revenue || 0), 0);
    }

    /**
     * Get location name from ID
     */
    async getLocationName(locationId) {
        try {
            const locationRef = ref(rtdb, `locations/${locationId}/name`);
            const snapshot = await get(locationRef);
            return snapshot.exists() ? snapshot.val() : 'Unknown Location';
        } catch (error) {
            console.warn('[SalesDataService] Could not get location name:', error);
            return 'Unknown Location';
        }
    }

    /**
     * Update sales data index
     */
    async updateSalesDataIndex(salesDataId, locationId, userId) {
        const updates = {
            [`salesDataIndex/byLocation/${locationId}/${salesDataId}`]: true,
            [`salesDataIndex/byUser/${userId}/${salesDataId}`]: true
        };

        await update(ref(rtdb), updates);
    }

    /**
     * Update forecast index
     */
    async updateForecastIndex(forecastId, locationId) {
        const updates = {
            [`forecastIndex/byLocation/${locationId}/${forecastId}`]: {
                createdAt: Date.now(),
                status: 'active'
            },
            [`forecastIndex/byUser/${this.userId}/${forecastId}`]: true
        };

        await update(ref(rtdb), updates);
    }

    /**
     * Generate default forecast name from metadata
     * @param {Object} forecast - Forecast object
     * @returns {string} Generated name
     */
    generateDefaultName(forecast) {
        const method = forecast.config?.method || 'Forecast';
        const date = new Date(forecast.createdAt || Date.now()).toLocaleDateString();
        return `${method} - ${date}`;
    }

    /**
     * Get human-readable time ago string
     * @param {number} timestamp - Unix timestamp
     * @returns {string} Time ago string
     */
    getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    /**
     * Calculate summary metrics from forecast data
     * @param {Array} forecastData - Array of forecast predictions
     * @returns {Object} Summary metrics
     */
    calculateForecastSummary(forecastData) {
        if (!forecastData || forecastData.length === 0) {
            return null;
        }

        const totalRevenue = forecastData.reduce((sum, d) => sum + (d.predicted || 0), 0);
        const avgDaily = totalRevenue / forecastData.length;

        const growth = forecastData.length > 1
            ? ((forecastData[forecastData.length - 1].predicted / forecastData[0].predicted - 1) * 100)
            : 0;

        return {
            totalPredictedRevenue: Math.round(totalRevenue),
            avgDailyRevenue: Math.round(avgDaily),
            predictedGrowth: parseFloat(growth.toFixed(1)),
            dateRange: {
                start: forecastData[0]?.date,
                end: forecastData[forecastData.length - 1]?.date
            }
        };
    }
}

export default SalesDataService;
