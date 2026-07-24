'use strict';

/**
 * D2 pure historical stats core (data-in / data-out) — T2 port.
 *
 * Byte-faithful port of the stats slice of
 * public/js/modules/food-cost/services/historical-usage-service.js
 * (D2-2 quirk policy: characterize, preserve, log — see design
 * docs/plans/2026-07-24-ross-foodcost-d2-calculator-design.md §6):
 *
 *   calculateItemStatistics    ← historical-usage-service.js:179-324
 *   calculateMean              ← historical-usage-service.js:526-531 (_calculateMean)
 *   calculateStandardDeviation ← historical-usage-service.js:540-546 (_calculateStandardDeviation)
 *   calculateTrend             ← historical-usage-service.js:554-579 (_calculateTrend)
 *   calculateDayOfWeekPatterns ← historical-usage-service.js:587-623 (_calculateDayOfWeekPatterns)
 *   getEmptyStatistics         ← historical-usage-service.js:642-655 (_getEmptyStatistics)
 *
 * 1:1 name mapping: the live `_`-prefixed private helpers are exported here
 * without the underscore; behaviour is identical.
 *
 * Port deltas (design §5.3 — the ONLY intended differences from the live code):
 *   P1: zero console.* calls.
 *   P2: signature calculateItemStatistics(records, itemCode, opts) —
 *       opts.now (epoch ms) replaces the Date.now() fallback at
 *       historical-usage-service.js:266.
 *   P8: weekday derivation pinned to SAST (UTC+2, no DST):
 *       new Date(ts + SAST_OFFSET_MS).getUTCDay() replaces date.getDay() in
 *       calculateDayOfWeekPatterns — deterministic on UTC-local Cloud
 *       Functions, matches what SA users' browsers computed. Date-STRING
 *       parsing in the periodDays chain (hus:246-257) stays new Date(str):
 *       ISO date-only strings are UTC-parsed and deterministic everywhere.
 *
 * DO-NOT-PORT (design §5.3, security F1 — the #144 vuln class):
 * HistoricalUsageService's store-NAME search strategy (fuzzy includes() across
 * ALL accessible locations, hus:111-153), generateHistoricalSummaries'
 * multi-strategy record merge (hus:344-411), and the module-level cache are
 * deliberately NOT here. This module NEVER fetches — records arrive from
 * exactly one access-checked node (locations/{locId}/stockUsage) via the
 * tools.js adapter. No name-search, no merge, no cache. Data in, data out.
 */

const SAST_OFFSET_MS = 2 * 3600e3; // P8: UTC+2, South Africa has no DST

/**
 * Calculate statistical metrics for historical stock usage.
 * Port of historical-usage-service.js:179-324 (P1/P2 deltas only).
 *
 * @param {Array} historicalRecords - Array of historical stock records
 * @param {string} itemCode - Item code to calculate statistics for
 * @param {{now?: number}} [opts] - now: epoch ms used as the timestamp
 *   fallback for records missing timestamp/recordDate (P2). REQUIRED whenever
 *   any record may lack both fields — omitting it there yields an Invalid Date
 *   (the adapter always injects ctx.now; review NIT 2026-07-24)
 * @returns {Object} - Statistical metrics for the specified item
 */
function calculateItemStatistics(historicalRecords, itemCode, opts = {}) {
    if (!historicalRecords || historicalRecords.length === 0) {
        return getEmptyStatistics();
    }

    // GT5: whole-body try/catch — ANY throw converts to the empty-statistics
    // shape (with itemCode). Preserved verbatim from hus:187/320-323.
    try {
        // Extract usage data for this specific item across all records
        const itemData = [];

        historicalRecords.forEach(record => {
            // Skip if no stock items
            if (!record.stockItems) return;

            // Find the item in this record.
            // GT9: dual-format branch preserved — see design §6. The object
            // branch keys by itemCode; RTDB sparse-array coercion produces
            // numeric-INDEX keys, so stockItems[itemCode] silently misses (or
            // returns the wrong item for small-integer codes). NOT fixed here.
            const item = typeof record.stockItems === 'object' && !Array.isArray(record.stockItems)
                ? record.stockItems[itemCode] // Object format with itemCode keys
                : Array.isArray(record.stockItems)
                  ? record.stockItems.find(i => i.itemCode === itemCode) // Array format
                  : null;

            if (item) {
                // Extract usage value, period days and date
                // ENHANCEMENT: Calculate usage from stock quantities if not directly available
                let usage = parseFloat(item.usage || 0);

                // Q15: the `!usage` guard does NOT fire for negative (truthy)
                // usage values — negatives flow into the simple average
                // untouched. Preserved — see design §6 Q15.
                if (!usage && (item.openingQty !== undefined || item.openingStockValue !== undefined)) {
                    const openingQty = parseFloat(item.openingQty || item.openingStockValue || 0);
                    const purchaseQty = parseFloat(item.purchaseQty || item.purchases || 0);
                    const closingQty = parseFloat(item.closingQty || item.closingStockValue || 0);

                    // Usage = Opening + Purchases - Closing
                    usage = openingQty + purchaseQty - closingQty;
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

                // P2: opts.now replaces the live Date.now() fallback (hus:266)
                const timestamp = record.timestamp || record.recordDate || opts.now;
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
            return getEmptyStatistics();
        }

        // Calculate average daily usage
        const usagePerDayValues = itemData.map(d => d.usagePerDay);
        const avgDailyUsage = calculateMean(usagePerDayValues);

        // Calculate standard deviation
        const stdDevUsage = calculateStandardDeviation(usagePerDayValues, avgDailyUsage);

        // Calculate coefficient of variation (volatility)
        const volatility = avgDailyUsage > 0 ? stdDevUsage / avgDailyUsage : 0;

        // Calculate trend (simple linear regression slope)
        const trend = calculateTrend(itemData);

        // Calculate day-of-week patterns if enough data
        const dowPatterns = itemData.length >= 14 ? calculateDayOfWeekPatterns(itemData) : null;

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
        // GT5: preserved error-shape behaviour — any throw → empty statistics.
        return getEmptyStatistics(itemCode);
    }
}

/**
 * Calculate the mean of an array of numbers.
 * Port of historical-usage-service.js:526-531 (_calculateMean).
 * @param {Array} values - Array of numeric values
 * @returns {number} - The mean value
 */
function calculateMean(values) {
    if (!values || values.length === 0) return 0;

    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
}

/**
 * Calculate standard deviation.
 * Port of historical-usage-service.js:540-546 (_calculateStandardDeviation).
 * @param {Array} values - Array of numeric values
 * @param {number} mean - The mean of the values
 * @returns {number} - Standard deviation
 */
function calculateStandardDeviation(values, mean) {
    if (!values || values.length < 2) return 0;

    const squaredDifferences = values.map(v => Math.pow(v - mean, 2));
    const variance = calculateMean(squaredDifferences);
    return Math.sqrt(variance);
}

/**
 * Calculate trend using simple linear regression.
 * Port of historical-usage-service.js:554-579 (_calculateTrend).
 * Q10 note (design §6): returns only {slope, direction} — never `strength`
 * (the advanced calculator reads trend.strength, which is always undefined).
 * @param {Array} data - Array of {date, usagePerDay} objects
 * @returns {Object} - Trend information
 */
function calculateTrend(data) {
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
}

/**
 * Calculate day-of-week patterns.
 * Port of historical-usage-service.js:587-623 (_calculateDayOfWeekPatterns).
 * P8 delta: weekday computed in SAST (UTC+2) instead of the host's local
 * timezone getDay() — see the header note.
 * @param {Array} data - Array of {date, usagePerDay} objects
 * @returns {Object} - Day of week patterns
 */
function calculateDayOfWeekPatterns(data) {
    // Group data by day of week
    const dowGroups = [[], [], [], [], [], [], []];

    data.forEach(item => {
        // P8: SAST weekday, not host-local getDay()
        const dayOfWeek = new Date(item.date.getTime() + SAST_OFFSET_MS).getUTCDay();
        dowGroups[dayOfWeek].push(item.usagePerDay);
    });

    // Calculate average for each day of week
    const dowAverages = dowGroups.map(group =>
        group.length > 0 ? calculateMean(group) : null
    );

    // Calculate overall average
    const allValues = data.map(d => d.usagePerDay);
    const overallAvg = calculateMean(allValues);

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
}

/**
 * Get empty statistics object for items with no data.
 * Port of historical-usage-service.js:642-655 (_getEmptyStatistics).
 * @param {string} itemCode - Optional item code
 * @returns {Object} - Empty statistics object
 */
function getEmptyStatistics(itemCode = '') {
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

module.exports = {
    calculateItemStatistics,
    calculateMean,
    calculateStandardDeviation,
    calculateTrend,
    calculateDayOfWeekPatterns,
    getEmptyStatistics
};
