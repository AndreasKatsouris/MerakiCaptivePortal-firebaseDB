/**
 * Forecast Engine
 * 
 * Provides multiple forecasting algorithms with configurable parameters.
 * Supports trend analysis, seasonal patterns, and ML-based predictions.
 */

export class ForecastEngine {
    constructor() {
        this.analyticsData = null;
    }

    /**
     * Set analytics data for learned pattern application
     * @param {Object} analyticsData - Historical analytics and patterns
     */
    setAnalyticsData(analyticsData) {
        this.analyticsData = analyticsData;
    }

    /**
     * Generate forecast using specified method
     * @param {Array} historicalData - Historical sales data
     * @param {Object} config - Forecast configuration
     * @returns {Object} Forecast results with predictions
     */
    async generateForecast(historicalData, config) {
        // Input validation
        if (!historicalData || !Array.isArray(historicalData)) {
            throw new Error('Historical data must be a non-empty array');
        }

        if (historicalData.length === 0) {
            throw new Error('Historical data is required for forecasting');
        }

        if (!config || typeof config !== 'object') {
            throw new Error('Config must be a valid object');
        }

        const {
            method = 'seasonal',
            horizon = 30,
            confidenceLevel = 95,
            startDate = null
        } = config;

        // Validate horizon
        if (typeof horizon !== 'number' || horizon < 1 || horizon > 365) {
            throw new Error('Horizon must be a number between 1 and 365');
        }

        // Validate confidence level
        if (![0, 80, 90, 95, 99].includes(confidenceLevel)) {
            throw new Error('Confidence level must be 0, 80, 90, 95, or 99');
        }

        // Normalize and sort data
        const normalizedData = this.normalizeData(historicalData);

        let predictions;

        switch (method) {
            case 'year_over_year':
            case 'yoy':
                predictions = this.yearOverYearForecast(normalizedData, horizon, startDate);
                break;
            case 'moving_average':
                predictions = this.movingAverageForecast(normalizedData, horizon, startDate);
                break;
            case 'simple_trend':
                predictions = this.linearRegressionForecast(normalizedData, horizon, startDate);
                break;
            case 'exponential':
                predictions = this.exponentialSmoothingForecast(normalizedData, horizon, startDate);
                break;
            case 'seasonal':
                predictions = this.seasonalForecast(normalizedData, horizon, startDate);
                break;
            case 'ml_based':
                predictions = this.mlBasedForecast(normalizedData, horizon, startDate);
                break;
            default:
                predictions = this.seasonalForecast(normalizedData, horizon, startDate);
        }

        // Apply confidence intervals
        if (confidenceLevel > 0) {
            predictions = this.applyConfidenceIntervals(predictions, normalizedData, confidenceLevel);
        }

        // Apply learned patterns if available
        if (this.analyticsData?.patterns) {
            predictions = this.applyLearnedPatterns(predictions, this.analyticsData.patterns);
        }

        return {
            method,
            horizon,
            confidenceLevel,
            predictions,
            metadata: {
                dataPointsUsed: normalizedData.length,
                forecastStart: predictions[0]?.date,
                forecastEnd: predictions[predictions.length - 1]?.date
            }
        };
    }

    /**
     * Normalize input data to consistent format
     */
    normalizeData(data) {
        return data.map(item => ({
            date: item.date instanceof Date ? item.date : new Date(item.date),
            revenue: parseFloat(item.revenue || 0),
            transactions: parseInt(item.transactions || item.transaction_qty || item.transactionQty || 0),
            avgSpend: parseFloat(item.avgSpend || item.avg_spend || 0)
        })).filter(item =>
            !isNaN(item.date.getTime()) && item.revenue > 0
        ).sort((a, b) => a.date - b.date);
    }

    /**
     * Year-over-Year forecast
     * Uses same day from last year + growth rate
     */
    yearOverYearForecast(data, horizon, startDate = null) {
        if (data.length < 7) {
            throw new Error('Year-over-Year forecast requires at least 7 days of historical data');
        }

        // Helper to format date as YYYY-MM-DD
        const formatDateKey = (date) => {
            const d = new Date(date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Build lookup map by date for quick access
        const historicByDate = {};
        data.forEach(d => {
            const dateStr = formatDateKey(d.date);
            historicByDate[dateStr] = d;
        });

        // Build average by day of week as fallback
        const weekdayAverages = {};
        const weekdayCounts = {};
        data.forEach(d => {
            const dayOfWeek = d.date.getDay();
            if (!weekdayAverages[dayOfWeek]) {
                weekdayAverages[dayOfWeek] = 0;
                weekdayCounts[dayOfWeek] = 0;
            }
            weekdayAverages[dayOfWeek] += d.revenue;
            weekdayCounts[dayOfWeek]++;
        });
        Object.keys(weekdayAverages).forEach(day => {
            weekdayAverages[day] /= weekdayCounts[day];
        });

        // Calculate YoY growth rate from available data
        let yoyGrowthRate = 0.05; // Default 5% growth
        const yearAgoData = [];
        data.forEach(d => {
            const oneYearEarlier = new Date(d.date);
            oneYearEarlier.setFullYear(oneYearEarlier.getFullYear() - 1);
            const yearAgoKey = formatDateKey(oneYearEarlier);
            if (historicByDate[yearAgoKey]) {
                yearAgoData.push({
                    current: d.revenue,
                    yearAgo: historicByDate[yearAgoKey].revenue
                });
            }
        });

        if (yearAgoData.length > 0) {
            const avgCurrent = yearAgoData.reduce((sum, d) => sum + d.current, 0) / yearAgoData.length;
            const avgYearAgo = yearAgoData.reduce((sum, d) => sum + d.yearAgo, 0) / yearAgoData.length;
            if (avgYearAgo > 0) {
                yoyGrowthRate = (avgCurrent - avgYearAgo) / avgYearAgo;
            }
        }

        // Generate predictions
        const predictions = [];
        const lastDate = startDate ? new Date(startDate) : data[data.length - 1].date;
        const avgTransactionRatio = this.calculateAvgTransactionRatio(data);
        const historicalAvgSpend = this.calculateHistoricalAvgSpend(data);

        for (let i = 0; i < horizon; i++) {
            const forecastDate = new Date(lastDate);
            forecastDate.setDate(forecastDate.getDate() + i + 1);

            // Look for same day last year
            const oneYearEarlier = new Date(forecastDate);
            oneYearEarlier.setFullYear(oneYearEarlier.getFullYear() - 1);
            const yearAgoKey = formatDateKey(oneYearEarlier);

            let predictedRevenue;
            if (historicByDate[yearAgoKey]) {
                // Apply growth rate to last year's value
                predictedRevenue = historicByDate[yearAgoKey].revenue * (1 + yoyGrowthRate);
            } else {
                // Fallback to day-of-week average with growth
                const dayOfWeek = forecastDate.getDay();
                predictedRevenue = (weekdayAverages[dayOfWeek] || 0) * (1 + yoyGrowthRate);
            }

            const predictedTransactions = Math.round(predictedRevenue * avgTransactionRatio);
            const avgSpend = predictedTransactions > 0
                ? predictedRevenue / predictedTransactions
                : historicalAvgSpend;

            predictions.push({
                date: forecastDate,
                revenue: Math.max(0, predictedRevenue),
                transactionQty: predictedTransactions,
                avgSpend
            });
        }

        return predictions;
    }

    /**
     * Moving Average forecast
     * Uses weighted moving average with trend
     */
    movingAverageForecast(data, horizon, startDate = null) {
        if (data.length < 7) {
            throw new Error('Moving Average forecast requires at least 7 days of historical data');
        }

        const revenues = data.map(d => d.revenue);
        const windowSize = Math.min(14, revenues.length); // 2-week window

        // Create linear weights (more recent = higher weight)
        const weights = [];
        let weightSum = 0;
        for (let i = 0; i < windowSize; i++) {
            const weight = i + 1;
            weights.push(weight);
            weightSum += weight;
        }

        // Calculate weighted average of recent data
        const recentData = revenues.slice(-windowSize);
        let weightedSum = 0;
        for (let i = 0; i < windowSize; i++) {
            weightedSum += recentData[i] * weights[i];
        }
        const baseRevenue = weightedSum / weightSum;

        // Calculate trend from comparing two windows
        let trend = 0;
        if (revenues.length >= windowSize * 2) {
            const previousWindow = revenues.slice(-windowSize * 2, -windowSize);
            let previousWeightedSum = 0;
            for (let i = 0; i < windowSize; i++) {
                previousWeightedSum += previousWindow[i] * weights[i];
            }
            const previousAvg = previousWeightedSum / weightSum;
            trend = (baseRevenue - previousAvg) / windowSize;
        }

        // Generate predictions
        const predictions = [];
        const lastDate = startDate ? new Date(startDate) : data[data.length - 1].date;
        const avgTransactionRatio = this.calculateAvgTransactionRatio(data);
        const historicalAvgSpend = this.calculateHistoricalAvgSpend(data);

        for (let i = 0; i < horizon; i++) {
            const forecastDate = new Date(lastDate);
            forecastDate.setDate(forecastDate.getDate() + i + 1);

            const predictedRevenue = Math.max(0, baseRevenue + (trend * (i + 1)));
            const predictedTransactions = Math.round(predictedRevenue * avgTransactionRatio);
            const avgSpend = predictedTransactions > 0
                ? predictedRevenue / predictedTransactions
                : historicalAvgSpend;

            predictions.push({
                date: forecastDate,
                revenue: predictedRevenue,
                transactionQty: predictedTransactions,
                avgSpend
            });
        }

        return predictions;
    }

    /**
     * Linear regression forecast
     * Uses least squares regression for trend projection
     */
    linearRegressionForecast(data, horizon, startDate = null) {
        if (data.length < 2) {
            throw new Error('Linear regression requires at least 2 data points');
        }

        const n = data.length;
        const revenues = data.map(d => d.revenue);

        // Calculate regression coefficients
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += revenues[i];
            sumXY += i * revenues[i];
            sumX2 += i * i;
        }

        // Check for division by zero
        const denominator = n * sumX2 - sumX * sumX;
        if (Math.abs(denominator) < 1e-10) {
            throw new Error('Cannot calculate regression - data points are collinear');
        }

        const slope = (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;

        // Calculate transaction ratio for projections
        const avgTransactionRatio = this.calculateAvgTransactionRatio(data);

        // Calculate historical average spend as fallback
        const historicalAvgSpend = this.calculateHistoricalAvgSpend(data);

        // Generate predictions
        const predictions = [];
        const lastDate = startDate ? new Date(startDate) : data[data.length - 1].date;

        for (let i = 0; i < horizon; i++) {
            const forecastDate = new Date(lastDate);
            forecastDate.setDate(forecastDate.getDate() + i + 1);

            const dayIndex = n + i;
            const predictedRevenue = Math.max(0, intercept + slope * dayIndex);
            const predictedTransactions = Math.round(predictedRevenue * avgTransactionRatio);
            const avgSpend = predictedTransactions > 0
                ? predictedRevenue / predictedTransactions
                : historicalAvgSpend;

            predictions.push({
                date: forecastDate,
                revenue: predictedRevenue,
                transactionQty: predictedTransactions,
                avgSpend
            });
        }

        return predictions;
    }

    /**
     * Exponential smoothing forecast
     * Single exponential smoothing with configurable alpha
     */
    exponentialSmoothingForecast(data, horizon, startDate = null, alpha = 0.3) {
        // Validate alpha parameter
        if (alpha <= 0 || alpha >= 1) {
            throw new Error('Alpha must be between 0 and 1 (exclusive)');
        }

        const revenues = data.map(d => d.revenue);

        // Calculate smoothed values
        let smoothed = revenues[0];
        for (let i = 1; i < revenues.length; i++) {
            smoothed = alpha * revenues[i] + (1 - alpha) * smoothed;
        }

        // Calculate trend using last few periods
        const trendPeriods = Math.min(7, data.length);
        const recentData = data.slice(-trendPeriods);
        const trendSlope = this.calculateTrendSlope(recentData);

        const avgTransactionRatio = this.calculateAvgTransactionRatio(data);

        const predictions = [];
        const lastDate = startDate ? new Date(startDate) : data[data.length - 1].date;

        for (let i = 0; i < horizon; i++) {
            const forecastDate = new Date(lastDate);
            forecastDate.setDate(forecastDate.getDate() + i + 1);

            // Apply exponential growth with trend
            const growthFactor = Math.pow(1 + trendSlope, i);
            const predictedRevenue = Math.max(0, smoothed * growthFactor);
            const predictedTransactions = Math.round(predictedRevenue * avgTransactionRatio);
            const avgSpend = predictedTransactions > 0 ? predictedRevenue / predictedTransactions : 0;

            predictions.push({
                date: forecastDate,
                revenue: predictedRevenue,
                transactionQty: predictedTransactions,
                avgSpend
            });
        }

        return predictions;
    }

    /**
     * Seasonal forecast
     * Combines weekly patterns with trend for more accurate predictions
     */
    seasonalForecast(data, horizon, startDate = null) {
        // Calculate weekly patterns (day-of-week factors)
        const weeklyPatterns = this.calculateWeeklyPatterns(data);

        // Calculate overall trend
        const trendSlope = this.calculateTrendSlope(data);

        // Calculate base value (average of last period)
        const lastPeriod = data.slice(-28); // Last 4 weeks
        const baseValue = lastPeriod.reduce((sum, d) => sum + d.revenue, 0) / lastPeriod.length;

        const avgTransactionRatio = this.calculateAvgTransactionRatio(data);

        const predictions = [];
        const lastDate = startDate ? new Date(startDate) : data[data.length - 1].date;

        for (let i = 0; i < horizon; i++) {
            const forecastDate = new Date(lastDate);
            forecastDate.setDate(forecastDate.getDate() + i + 1);

            const dayOfWeek = forecastDate.getDay();
            const seasonalFactor = weeklyPatterns[dayOfWeek] || 1;

            // Apply trend to base value, then seasonal factor
            const trendedValue = baseValue * (1 + trendSlope * (i / 7));
            const predictedRevenue = Math.max(0, trendedValue * seasonalFactor);
            const predictedTransactions = Math.round(predictedRevenue * avgTransactionRatio);
            const avgSpend = predictedTransactions > 0 ? predictedRevenue / predictedTransactions : 0;

            predictions.push({
                date: forecastDate,
                revenue: predictedRevenue,
                transactionQty: predictedTransactions,
                avgSpend
            });
        }

        return predictions;
    }

    /**
     * ML-based forecast
     * Combines multiple signals for more sophisticated predictions
     */
    mlBasedForecast(data, horizon, startDate = null) {
        // Calculate multiple features
        const weeklyPatterns = this.calculateWeeklyPatterns(data);
        const monthlyPatterns = this.calculateMonthlyPatterns(data);
        const trend = this.calculateTrendSlope(data);
        const volatility = this.calculateVolatility(data);

        // Calculate weighted moving average
        const weights = this.generateExponentialWeights(Math.min(30, data.length));
        const recentData = data.slice(-weights.length);
        let weightedAvg = 0;
        let weightSum = 0;
        for (let i = 0; i < recentData.length; i++) {
            weightedAvg += recentData[i].revenue * weights[i];
            weightSum += weights[i];
        }
        weightedAvg /= weightSum;

        const avgTransactionRatio = this.calculateAvgTransactionRatio(data);

        const predictions = [];
        const lastDate = startDate ? new Date(startDate) : data[data.length - 1].date;

        for (let i = 0; i < horizon; i++) {
            const forecastDate = new Date(lastDate);
            forecastDate.setDate(forecastDate.getDate() + i + 1);

            const dayOfWeek = forecastDate.getDay();
            const month = forecastDate.getMonth();

            // Combine signals
            const weeklyFactor = weeklyPatterns[dayOfWeek] || 1;
            const monthlyFactor = monthlyPatterns[month] || 1;
            const trendFactor = 1 + (trend * i / 7);

            // ML-like ensemble: weighted combination of factors
            const combinedFactor = (
                weeklyFactor * 0.4 +
                monthlyFactor * 0.2 +
                trendFactor * 0.25 +
                1.0 * 0.15 // Base stability factor
            );

            const predictedRevenue = Math.max(0, weightedAvg * combinedFactor);
            const predictedTransactions = Math.round(predictedRevenue * avgTransactionRatio);
            const avgSpend = predictedTransactions > 0 ? predictedRevenue / predictedTransactions : 0;

            predictions.push({
                date: forecastDate,
                revenue: predictedRevenue,
                transactionQty: predictedTransactions,
                avgSpend
            });
        }

        return predictions;
    }

    /**
     * Apply confidence intervals to predictions
     * Uses growing uncertainty based on forecast horizon
     */
    applyConfidenceIntervals(predictions, historicalData, confidenceLevel) {
        const stdDev = this.calculateStdDev(historicalData.map(d => d.revenue));

        // Z-scores for common confidence levels
        const zScores = {
            80: 1.28,
            90: 1.645,
            95: 1.96,
            99: 2.576
        };
        const zScore = zScores[confidenceLevel] || 1.96;

        // Calculate uncertainty growth rate based on data volatility
        const volatility = this.calculateVolatility(historicalData);
        const baseUncertaintyGrowth = Math.max(0.05, Math.min(0.15, volatility));

        return predictions.map((pred, i) => {
            // Increase uncertainty as we forecast further into the future
            // Using square root of time is standard in financial forecasting
            const uncertaintyGrowth = Math.sqrt(1 + i * baseUncertaintyGrowth);
            const margin = stdDev * zScore * uncertaintyGrowth;

            return {
                ...pred,
                confidenceLower: Math.max(0, pred.revenue - margin),
                confidenceUpper: pred.revenue + margin
            };
        });
    }

    /**
     * Apply learned patterns from historical analytics
     */
    applyLearnedPatterns(predictions, patterns) {
        if (!patterns) return predictions;

        return predictions.map(pred => {
            let adjustedRevenue = pred.revenue;

            // Apply learned weekday factors
            if (patterns.weekdayFactors) {
                const dayOfWeek = pred.date.getDay();
                const factor = patterns.weekdayFactors[dayOfWeek];
                if (factor && factor !== 1) {
                    // Blend learned factor with current prediction
                    adjustedRevenue = pred.revenue * (0.7 + 0.3 * factor);
                }
            }

            // Apply learned monthly seasonality
            if (patterns.monthlySeasonality) {
                const month = pred.date.getMonth() + 1;
                const factor = patterns.monthlySeasonality[month];
                if (factor && factor !== 1) {
                    adjustedRevenue = adjustedRevenue * (0.8 + 0.2 * factor);
                }
            }

            // Check for holiday effects
            if (patterns.holidayEffects) {
                const dateStr = pred.date.toISOString().split('T')[0];
                for (const [holiday, factor] of Object.entries(patterns.holidayEffects)) {
                    // Simple check - in production this would be more sophisticated
                    if (this.isNearHoliday(pred.date, holiday)) {
                        adjustedRevenue *= factor;
                        break;
                    }
                }
            }

            return {
                ...pred,
                revenue: adjustedRevenue,
                avgSpend: pred.transactionQty > 0 ? adjustedRevenue / pred.transactionQty : pred.avgSpend
            };
        });
    }

    /**
     * Recommend best forecasting method based on data characteristics
     */
    recommendMethod(historicalData, locationAnalytics = null) {
        const dataLength = historicalData.length;
        const volatility = this.calculateVolatility(historicalData);

        // Check for strong weekly patterns
        const weeklyPatterns = this.calculateWeeklyPatterns(historicalData);
        const patternStrength = this.calculatePatternStrength(weeklyPatterns);

        // Use analytics if available
        if (locationAnalytics?.methodAccuracy) {
            const bestMethod = Object.entries(locationAnalytics.methodAccuracy)
                .sort((a, b) => a[1].mape - b[1].mape)[0];
            if (bestMethod && bestMethod[1].forecastCount >= 3) {
                return {
                    method: bestMethod[0],
                    reason: `Best historical accuracy (${bestMethod[1].mape.toFixed(1)}% MAPE)`,
                    confidence: 'high'
                };
            }
        }

        // Rule-based recommendation
        if (dataLength < 14) {
            return {
                method: 'simple_trend',
                reason: 'Limited historical data - using simple trend',
                confidence: 'low'
            };
        }

        if (patternStrength > 0.3) {
            return {
                method: 'seasonal',
                reason: 'Strong weekly patterns detected',
                confidence: 'medium'
            };
        }

        if (volatility > 0.3) {
            return {
                method: 'ml_based',
                reason: 'High volatility - using ML-based smoothing',
                confidence: 'medium'
            };
        }

        return {
            method: 'seasonal',
            reason: 'Default recommendation for general use',
            confidence: 'medium'
        };
    }

    // ==========================================
    // Helper Methods
    // ==========================================

    calculateWeeklyPatterns(data) {
        const dayTotals = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

        for (const item of data) {
            const dayOfWeek = item.date.getDay();
            dayTotals[dayOfWeek].push(item.revenue);
        }

        const overallAvg = data.reduce((sum, d) => sum + d.revenue, 0) / data.length;
        const patterns = {};

        for (const [day, revenues] of Object.entries(dayTotals)) {
            if (revenues.length > 0) {
                const dayAvg = revenues.reduce((a, b) => a + b, 0) / revenues.length;
                patterns[day] = overallAvg > 0 ? dayAvg / overallAvg : 1;
            } else {
                patterns[day] = 1;
            }
        }

        return patterns;
    }

    calculateMonthlyPatterns(data) {
        const monthTotals = {};

        for (const item of data) {
            const month = item.date.getMonth();
            if (!monthTotals[month]) {
                monthTotals[month] = [];
            }
            monthTotals[month].push(item.revenue);
        }

        const overallAvg = data.reduce((sum, d) => sum + d.revenue, 0) / data.length;
        const patterns = {};

        for (const [month, revenues] of Object.entries(monthTotals)) {
            if (revenues.length > 0) {
                const monthAvg = revenues.reduce((a, b) => a + b, 0) / revenues.length;
                patterns[month] = overallAvg > 0 ? monthAvg / overallAvg : 1;
            }
        }

        return patterns;
    }

    calculateTrendSlope(data) {
        if (data.length < 7) return 0;

        const recentWeek = data.slice(-7);
        const previousWeek = data.slice(-14, -7);

        if (previousWeek.length === 0) return 0;

        const recentAvg = recentWeek.reduce((sum, d) => sum + d.revenue, 0) / recentWeek.length;
        const previousAvg = previousWeek.reduce((sum, d) => sum + d.revenue, 0) / previousWeek.length;

        // Handle division by zero
        if (previousAvg === 0) {
            return recentAvg > 0 ? 1 : 0; // If we went from 0 to positive, assume 100% growth
        }

        return (recentAvg - previousAvg) / previousAvg;
    }

    calculateVolatility(data) {
        if (data.length < 2) return 0;

        const revenues = data.map(d => d.revenue);
        const avg = revenues.reduce((a, b) => a + b, 0) / revenues.length;
        const variance = revenues.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / revenues.length;
        const stdDev = Math.sqrt(variance);

        return avg > 0 ? stdDev / avg : 0; // Coefficient of variation
    }

    calculateStdDev(values) {
        if (values.length === 0) return 0;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const squareDiffs = values.map(value => Math.pow(value - avg, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
        return Math.sqrt(avgSquareDiff);
    }

    calculateAvgTransactionRatio(data) {
        const validData = data.filter(d => d.revenue > 0 && d.transactions > 0);
        if (validData.length === 0) {
            // Calculate fallback from total revenue and transactions
            const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
            const totalTransactions = data.reduce((sum, d) => sum + d.transactions, 0);
            if (totalRevenue > 0 && totalTransactions > 0) {
                return totalTransactions / totalRevenue;
            }
            // Absolute fallback based on typical restaurant metrics (1 transaction per R140)
            return 1 / 140;
        }

        const totalRatio = validData.reduce((sum, d) => sum + (d.transactions / d.revenue), 0);
        return totalRatio / validData.length;
    }

    calculateHistoricalAvgSpend(data) {
        const validData = data.filter(d => d.avgSpend > 0);
        if (validData.length === 0) {
            return 0;
        }
        const totalAvgSpend = validData.reduce((sum, d) => sum + d.avgSpend, 0);
        return totalAvgSpend / validData.length;
    }

    calculatePatternStrength(patterns) {
        const values = Object.values(patterns);
        const max = Math.max(...values);
        const min = Math.min(...values);
        return max - min;
    }

    generateExponentialWeights(n) {
        const weights = [];
        const alpha = 0.94; // Decay factor
        for (let i = 0; i < n; i++) {
            weights.push(Math.pow(alpha, n - 1 - i));
        }
        return weights;
    }

    isNearHoliday(date, holiday) {
        // Simplified holiday detection
        // In production, this would use a proper holiday calendar
        const month = date.getMonth() + 1;
        const day = date.getDate();

        const holidays = {
            'Christmas': { month: 12, days: [24, 25, 26] },
            'Easter': { month: 4, days: [18, 19, 20, 21] }, // Approximate
            'NewYear': { month: 1, days: [1, 2] }
        };

        const holidayDef = holidays[holiday];
        if (holidayDef) {
            return month === holidayDef.month && holidayDef.days.includes(day);
        }

        return false;
    }
}

export default ForecastEngine;
