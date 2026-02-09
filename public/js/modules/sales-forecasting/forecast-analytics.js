/**
 * Forecast Analytics
 * 
 * Handles accuracy calculation, pattern learning, and analytics
 * for improving forecast quality over time.
 */

import { rtdb, ref, get, set, update } from '../../config/firebase-config.js';

export class ForecastAnalytics {
    /**
     * Initialize analytics
     * @param {string} userId - Current user ID
     */
    constructor(userId) {
        this.userId = userId;
    }

    /**
     * Get analytics for a location
     * @param {string} locationId - Location ID
     * @returns {Promise<Object>} Location analytics
     */
    async getLocationAnalytics(locationId) {
        try {
            const analyticsRef = ref(rtdb, `forecastAnalytics/byLocation/${locationId}`);
            const snapshot = await get(analyticsRef);

            if (!snapshot.exists()) {
                return this.getDefaultAnalytics();
            }

            return snapshot.val();
        } catch (error) {
            console.error('[ForecastAnalytics] Error getting analytics:', error);
            return this.getDefaultAnalytics();
        }
    }

    /**
     * Calculate accuracy for a forecast vs actuals
     * @param {string} forecastId - Forecast ID
     * @param {string} actualId - Actuals ID
     * @returns {Promise<Object>} Accuracy metrics
     */
    async calculateAccuracy(forecastId, actualId) {
        try {
            console.log('[ForecastAnalytics] ===== CALCULATING ACCURACY =====');
            console.log('[ForecastAnalytics] Forecast ID:', forecastId);
            console.log('[ForecastAnalytics] Actual ID:', actualId);

            // Get forecast
            const forecastRef = ref(rtdb, `forecasts/${forecastId}`);
            const forecastSnapshot = await get(forecastRef);

            if (!forecastSnapshot.exists()) {
                throw new Error('Forecast not found');
            }

            const forecast = forecastSnapshot.val();

            console.log('[ForecastAnalytics] Forecast predictions count:', Object.keys(forecast.predictions || {}).length);
            console.log('[ForecastAnalytics] Forecast predictions sample (first 2):');
            const forecastKeys = Object.keys(forecast.predictions || {}).slice(0, 2);
            forecastKeys.forEach(key => {
                console.log(`  ${key}:`, forecast.predictions[key]);
            });

            // Get actuals
            const actualRef = ref(rtdb, `forecastActuals/${actualId}`);
            const actualSnapshot = await get(actualRef);

            if (!actualSnapshot.exists()) {
                throw new Error('Actuals not found');
            }

            const actuals = actualSnapshot.val();

            console.log('[ForecastAnalytics] Actuals dailyActuals count:', Object.keys(actuals.dailyActuals || {}).length);
            console.log('[ForecastAnalytics] Actuals dailyActuals sample (first 2):');
            const actualsKeys = Object.keys(actuals.dailyActuals || {}).slice(0, 2);
            actualsKeys.forEach(key => {
                console.log(`  ${key}:`, actuals.dailyActuals[key]);
            });

            // Calculate metrics
            const comparison = this.compareForecstWithActuals(
                forecast.predictions,
                actuals.dailyActuals
            );

            console.log('[ForecastAnalytics] Comparison complete:', {
                daysCompared: comparison.daysCompared,
                mape: comparison.mape,
                mae: comparison.mae,
                bias: comparison.bias
            });

            // Update actuals with comparison
            await update(ref(rtdb, `forecastActuals/${actualId}`), {
                comparison
            });

            // Update location analytics
            await this.updateLocationAnalytics(
                forecast.locationId,
                forecast.config.method,
                comparison
            );

            return comparison;
        } catch (error) {
            console.error('[ForecastAnalytics] Error calculating accuracy:', error);
            throw error;
        }
    }

    /**
     * Compare forecast predictions with actual results
     * @param {Object} predictions - Forecast predictions (indexed by date)
     * @param {Object} dailyActuals - Actual sales data (indexed by date)
     * @returns {Object} Comparison metrics
     */
    compareForecstWithActuals(predictions, dailyActuals) {
        console.log('[ForecastAnalytics] ===== COMPARING FORECAST WITH ACTUALS =====');
        console.log('[ForecastAnalytics] Predictions keys count:', Object.keys(predictions || {}).length);
        console.log('[ForecastAnalytics] Actuals keys count:', Object.keys(dailyActuals || {}).length);

        const comparison = {
            daysCompared: 0,
            dayResults: {},
            revenueVariance: { total: 0, percent: 0 },
            transactionVariance: { total: 0, percent: 0 },
            mape: 0,  // Mean Absolute Percentage Error
            rmse: 0,  // Root Mean Square Error
            mae: 0,   // Mean Absolute Error
            bias: 0   // Systematic over/under forecasting
        };

        let absolutePercentErrors = [];
        let squaredErrors = [];
        let absoluteErrors = [];
        let signedErrors = [];

        let totalPredicted = 0;
        let totalActual = 0;
        let totalPredictedTransactions = 0;
        let totalActualTransactions = 0;

        let matchCount = 0;
        let mismatchCount = 0;

        for (const [date, actual] of Object.entries(dailyActuals)) {
            const prediction = predictions[date];

            if (!prediction) {
                mismatchCount++;
                if (mismatchCount <= 3) {
                    console.log(`[ForecastAnalytics] No prediction found for date: ${date}`);
                }
                continue;
            }

            matchCount++;
            comparison.daysCompared++;

            // Get predicted value (use adjusted if available)
            const predictedRevenue = prediction.adjusted?.revenue || prediction.original?.revenue || prediction.predicted || 0;
            const predictedTransactions = prediction.adjusted?.transactions || prediction.original?.transactions || prediction.transactionQty || 0;

            const actualRevenue = actual.revenue || 0;
            const actualTransactions = actual.transactions || 0;

            // Log first 3 matches to see the data structure
            if (matchCount <= 3) {
                console.log(`[ForecastAnalytics] Match ${matchCount} - Date: ${date}`);
                console.log(`  Prediction structure:`, prediction);
                console.log(`  Extracted predicted revenue: ${predictedRevenue}`);
                console.log(`  Extracted predicted transactions: ${predictedTransactions}`);
                console.log(`  Actual structure:`, actual);
                console.log(`  Actual revenue: ${actualRevenue}`);
                console.log(`  Actual transactions: ${actualTransactions}`);
            }

            // Calculate errors
            const error = actualRevenue - predictedRevenue;

            // Calculate percentage error (MAPE component)
            // When actual is zero, we can't calculate percentage error meaningfully
            // Skip zero actuals from MAPE calculation but include in other metrics
            if (actualRevenue > 0) {
                const percentError = (Math.abs(error) / actualRevenue) * 100;
                absolutePercentErrors.push(percentError);
            }

            squaredErrors.push(error * error);
            absoluteErrors.push(Math.abs(error));
            signedErrors.push(error);

            // Store day-level results
            const dayPercentError = actualRevenue > 0
                ? ((Math.abs(error) / actualRevenue) * 100).toFixed(1)
                : 'N/A';

            comparison.dayResults[date] = {
                predicted: predictedRevenue,
                actual: actualRevenue,
                error,
                percentError: dayPercentError
            };

            // Accumulate totals
            totalPredicted += predictedRevenue;
            totalActual += actualRevenue;
            totalPredictedTransactions += predictedTransactions;
            totalActualTransactions += actualTransactions;
        }

        console.log('[ForecastAnalytics] Date matching summary:');
        console.log(`  Matched dates: ${matchCount}`);
        console.log(`  Unmatched dates: ${mismatchCount}`);
        console.log(`  Total predicted revenue: ${totalPredicted}`);
        console.log(`  Total actual revenue: ${totalActual}`);

        if (comparison.daysCompared > 0) {
            // Calculate aggregate metrics
            comparison.mape = absolutePercentErrors.reduce((a, b) => a + b, 0) / absolutePercentErrors.length;
            comparison.rmse = Math.sqrt(squaredErrors.reduce((a, b) => a + b, 0) / squaredErrors.length);
            comparison.mae = absoluteErrors.reduce((a, b) => a + b, 0) / absoluteErrors.length;
            comparison.bias = signedErrors.reduce((a, b) => a + b, 0) / signedErrors.length;

            // Revenue variance
            comparison.revenueVariance = {
                total: totalActual - totalPredicted,
                percent: totalPredicted > 0 ? ((totalActual - totalPredicted) / totalPredicted) * 100 : 0
            };

            // Transaction variance
            comparison.transactionVariance = {
                total: totalActualTransactions - totalPredictedTransactions,
                percent: totalPredictedTransactions > 0
                    ? ((totalActualTransactions - totalPredictedTransactions) / totalPredictedTransactions) * 100
                    : 0
            };
        }

        console.log('[ForecastAnalytics] Final comparison metrics:', {
            daysCompared: comparison.daysCompared,
            mape: comparison.mape,
            mae: comparison.mae,
            bias: comparison.bias
        });

        return comparison;
    }

    /**
     * Update location analytics with new comparison
     * @param {string} locationId - Location ID
     * @param {string} method - Forecast method used
     * @param {Object} comparison - Comparison results
     */
    async updateLocationAnalytics(locationId, method, comparison) {
        try {
            const analyticsRef = ref(rtdb, `forecastAnalytics/byLocation/${locationId}`);
            const snapshot = await get(analyticsRef);

            let analytics;
            if (snapshot.exists()) {
                analytics = snapshot.val();
            } else {
                analytics = this.getDefaultAnalytics();
            }

            // Update overall accuracy
            const totalForecasts = (analytics.overallAccuracy.totalForecasts || 0) + 1;
            const prevMapeSum = (analytics.overallAccuracy.averageMape || 0) * (totalForecasts - 1);
            const newAvgMape = (prevMapeSum + comparison.mape) / totalForecasts;

            analytics.overallAccuracy.totalForecasts = totalForecasts;
            analytics.overallAccuracy.averageMape = newAvgMape;

            // Update method accuracy
            if (!analytics.overallAccuracy.methodAccuracy) {
                analytics.overallAccuracy.methodAccuracy = {};
            }

            const methodStats = analytics.overallAccuracy.methodAccuracy[method] || { mape: 0, forecastCount: 0 };
            const methodCount = methodStats.forecastCount + 1;
            const prevMethodMapeSum = methodStats.mape * methodStats.forecastCount;

            analytics.overallAccuracy.methodAccuracy[method] = {
                mape: (prevMethodMapeSum + comparison.mape) / methodCount,
                forecastCount: methodCount
            };

            // Determine best method
            let bestMethod = null;
            let bestMape = Infinity;
            for (const [m, stats] of Object.entries(analytics.overallAccuracy.methodAccuracy)) {
                if (stats.forecastCount >= 2 && stats.mape < bestMape) {
                    bestMape = stats.mape;
                    bestMethod = m;
                }
            }
            if (bestMethod) {
                analytics.overallAccuracy.bestMethod = bestMethod;
            }

            // Update patterns based on comparison
            analytics.patterns = this.updatePatterns(
                analytics.patterns || {},
                comparison
            );

            // Save updated analytics
            await set(analyticsRef, analytics);

            // Also update system-wide analytics
            await this.updateSystemAnalytics(comparison);

            console.log('[ForecastAnalytics] Updated location analytics:', locationId);
        } catch (error) {
            console.error('[ForecastAnalytics] Error updating analytics:', error);
            throw error;
        }
    }

    /**
     * Update patterns based on comparison results
     * @param {Object} currentPatterns - Current learned patterns
     * @param {Object} comparison - New comparison data
     * @returns {Object} Updated patterns (new object, not mutated)
     */
    updatePatterns(currentPatterns, comparison) {
        // Deep clone to avoid mutations
        const patterns = {
            ...currentPatterns,
            weekdayFactors: currentPatterns.weekdayFactors
                ? { ...currentPatterns.weekdayFactors }
                : { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
            monthlySeasonality: currentPatterns.monthlySeasonality
                ? { ...currentPatterns.monthlySeasonality }
                : {},
            holidayEffects: currentPatterns.holidayEffects
                ? { ...currentPatterns.holidayEffects }
                : {}
        };

        // Learn weekday adjustments from errors
        const weekdayErrors = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

        for (const [dateStr, result] of Object.entries(comparison.dayResults || {})) {
            const date = new Date(dateStr);
            const dayOfWeek = date.getDay();

            if (result.predicted > 0) {
                // Error ratio: how much we were off
                const errorRatio = result.actual / result.predicted;
                weekdayErrors[dayOfWeek].push(errorRatio);
            }
        }

        // Update factors with exponential moving average (learning rate 0.3)
        // Higher alpha = faster learning, lower alpha = more stable
        const LEARNING_RATE = 0.3;
        const updatedWeekdayFactors = { ...patterns.weekdayFactors };

        for (const [day, errors] of Object.entries(weekdayErrors)) {
            if (errors.length > 0) {
                const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;
                const currentFactor = patterns.weekdayFactors[day] || 1;
                updatedWeekdayFactors[day] = currentFactor * (1 - LEARNING_RATE) + avgError * LEARNING_RATE;
            }
        }

        return {
            ...patterns,
            weekdayFactors: updatedWeekdayFactors
        };
    }

    /**
     * Update system-wide analytics
     */
    async updateSystemAnalytics(comparison) {
        try {
            const systemRef = ref(rtdb, 'forecastAnalytics/systemWide');
            const snapshot = await get(systemRef);

            let systemStats;
            if (snapshot.exists()) {
                systemStats = snapshot.val();
            } else {
                systemStats = { totalForecasts: 0, avgMape: 0 };
            }

            const totalForecasts = (systemStats.totalForecasts || 0) + 1;
            const prevMapeSum = (systemStats.avgMape || 0) * (totalForecasts - 1);

            systemStats.totalForecasts = totalForecasts;
            systemStats.avgMape = (prevMapeSum + comparison.mape) / totalForecasts;
            systemStats.lastUpdated = Date.now();

            await set(systemRef, systemStats);
        } catch (error) {
            console.warn('[ForecastAnalytics] Error updating system analytics:', error);
            // Non-critical, don't throw
        }
    }

    /**
     * Get forecast accuracy summary for a location
     * @param {string} locationId - Location ID
     * @returns {Promise<Object>} Accuracy summary
     */
    async getAccuracySummary(locationId) {
        const analytics = await this.getLocationAnalytics(locationId);

        return {
            totalForecasts: analytics.overallAccuracy?.totalForecasts || 0,
            averageMape: analytics.overallAccuracy?.averageMape || null,
            bestMethod: analytics.overallAccuracy?.bestMethod || null,
            methodPerformance: analytics.overallAccuracy?.methodAccuracy || {},
            hasLearning: (analytics.overallAccuracy?.totalForecasts || 0) >= 3
        };
    }

    /**
     * Get recommendations for a location
     * @param {string} locationId - Location ID
     * @returns {Promise<Object>} Recommendations
     */
    async getRecommendations(locationId) {
        const analytics = await this.getLocationAnalytics(locationId);
        const recommendations = [];

        // Method recommendation
        if (analytics.overallAccuracy?.bestMethod) {
            recommendations.push({
                type: 'method',
                title: 'Recommended Method',
                message: `Based on ${analytics.overallAccuracy.totalForecasts} forecasts, ` +
                    `"${this.formatMethodName(analytics.overallAccuracy.bestMethod)}" ` +
                    `performs best with ${analytics.overallAccuracy.methodAccuracy[analytics.overallAccuracy.bestMethod]?.mape.toFixed(1)}% MAPE`,
                action: analytics.overallAccuracy.bestMethod
            });
        }

        // Bias correction recommendation
        if (analytics.patterns?.weekdayFactors) {
            const factors = Object.values(analytics.patterns.weekdayFactors);
            const maxFactor = Math.max(...factors);
            const minFactor = Math.min(...factors);

            if (maxFactor / minFactor > 1.5) {
                recommendations.push({
                    type: 'pattern',
                    title: 'Strong Weekly Patterns',
                    message: 'Your location shows significant day-of-week variations. ' +
                        'Use Seasonal Analysis method for best results.',
                    action: 'seasonal'
                });
            }
        }

        // Accuracy improvement recommendation
        if (analytics.overallAccuracy?.averageMape > 10) {
            recommendations.push({
                type: 'accuracy',
                title: 'Improve Accuracy',
                message: 'Your average forecast error is above 10%. Consider using the ' +
                    'forecast adjustment feature to account for known events and holidays.',
                action: 'adjust'
            });
        }

        return recommendations;
    }

    /**
     * Get default analytics structure
     */
    getDefaultAnalytics() {
        return {
            overallAccuracy: {
                totalForecasts: 0,
                averageMape: null,
                bestMethod: null,
                methodAccuracy: {}
            },
            patterns: {
                weekdayFactors: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 },
                monthlySeasonality: {},
                holidayEffects: {}
            },
            modelWeights: null
        };
    }

    /**
     * Format method name for display
     */
    formatMethodName(method) {
        const names = {
            'simple_trend': 'Simple Trend',
            'exponential': 'Exponential Smoothing',
            'seasonal': 'Seasonal Analysis',
            'ml_based': 'ML-Based'
        };
        return names[method] || method;
    }

    /**
     * Calculate accuracy rating (1-5 stars)
     * @param {number} mape - Mean Absolute Percentage Error
     * @returns {number} Star rating
     */
    getAccuracyRating(mape) {
        if (mape === null || mape === undefined) return 0;
        if (mape <= 3) return 5;
        if (mape <= 5) return 4;
        if (mape <= 8) return 3;
        if (mape <= 12) return 2;
        return 1;
    }

    /**
     * Get accuracy description
     * @param {number} mape - Mean Absolute Percentage Error
     * @returns {string} Description
     */
    getAccuracyDescription(mape) {
        if (mape === null || mape === undefined) return 'No data yet';
        if (mape <= 3) return 'Excellent';
        if (mape <= 5) return 'Very Good';
        if (mape <= 8) return 'Good';
        if (mape <= 12) return 'Fair';
        return 'Needs Improvement';
    }
}

export default ForecastAnalytics;
