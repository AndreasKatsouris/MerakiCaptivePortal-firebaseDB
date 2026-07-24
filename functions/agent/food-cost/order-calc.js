'use strict';

/**
 * D2 pure order-calculation core (data-in / data-out) — T3 port.
 *
 * Byte-faithful port of the calculation slice of the live browser modules
 * (D2-2 quirk policy: characterize, preserve, log — see design
 * docs/plans/2026-07-24-ross-foodcost-d2-calculator-design.md §6):
 *
 *   calculateCriticalityScore     ← public/js/modules/food-cost/order-calculator.js:20-151
 *   calculateOrderDetails         ← public/js/modules/food-cost/order-calculator.js:159-231
 *   formatValueBase               ← public/js/modules/food-cost/order-calculator.js:549-560
 *   calculateTimeWeightedAverage  ← public/js/modules/food-cost/order-calculator-advanced.js:16-39
 *   calculateHistoricalConfidence ← public/js/modules/food-cost/order-calculator-advanced.js:47-86
 *   calculateAdvancedOrderDetails ← public/js/modules/food-cost/order-calculator-advanced.js:95-422
 *   formatValueAdv                ← public/js/modules/food-cost/order-calculator-advanced.js:613-626
 *
 * NOT ported: calculateVolatility (order-calculator.js:506-542) — nothing in
 * this calculation chain calls it (its live consumer is elsewhere).
 *
 * TWO formatValue variants exist in the live code and they differ subtly:
 *   - formatValueBase (order-calculator.js:549-560) — consumed by
 *     calculateOrderDetails. undefined/null → '0.00'; strings parseFloat'd;
 *     NaN → '0.00'; but Infinity passes the isNaN check → 'Infinity'.
 *   - formatValueAdv (order-calculator-advanced.js:613-626) — consumed by the
 *     volatility branch of calculateAdvancedOrderDetails. Adds an explicit
 *     typeof/isFinite guard, so Infinity (and any non-number) → '0.00'.
 * Each is ported next to its consumer; do not merge them.
 *
 * Port deltas (design §5.3 — the ONLY intended differences from the live code):
 *   P1: zero console.* calls (the live advanced fn logs ~19 times — all
 *       stripped; no raw stock records may reach server logs, H-2).
 *   P2: signature calculateAdvancedOrderDetails(item, historicalSummary,
 *       params) where params.now (epoch ms, REQUIRED) replaces BOTH live
 *       new Date() uses (order-calculator-advanced.js:212,216):
 *       deliveryDate = now + daysToNextDelivery days.
 *   P7: the JSON deep-copy of item (advanced:105) is kept — it is behaviour —
 *       and ALL writes land on that copy or on the local per-invocation
 *       context object (Q7). No caller argument is ever mutated.
 *   P8: delivery-day weekday pinned to SAST (UTC+2, no DST):
 *       new Date(ts + SAST_OFFSET_MS).getUTCDay() replaces the live
 *       local-timezone getDay() — deterministic on UTC-hosted Cloud
 *       Functions, matches what SA users' browsers computed.
 *
 * Everything else — including every §6 quirk (tags inline below) — is
 * preserved verbatim.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SAST_OFFSET_MS = 2 * 3600e3; // P8: UTC+2, South Africa has no DST

/**
 * Calculate criticality score for a stock item.
 * Port of order-calculator.js:20-151 (pure in the live code — GT2; no deltas).
 * @param {Object} item - Stock item data
 * @param {Object} historicalData - Historical usage data for this item (optional)
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Criticality assessment results
 */
function calculateCriticalityScore(item, historicalData = null, params = {}) {
    // Default parameters
    const criticalityParams = {
        // Threshold for automatic criticality (0-100)
        criticalScoreThreshold: 70,
        // Categories that are always considered critical
        criticalCategories: ['Fresh Produce', 'Protein', 'Dairy', 'High Volume', 'Essential'],
        // Weight factors for different components
        volatilityWeight: 40,  // Max points from volatility
        stockLevelWeight: 30,  // Max points from stock level
        supplyReliabilityWeight: 30, // Max points from supplier reliability
        ...params
    };

    // Initialize result object
    const result = {
        isCritical: false,
        isManuallyMarked: false,
        isInCriticalCategory: false,
        hasCriticalScore: false,
        criticalityScore: 0,
        criticalityReason: '',
        criticalityDetails: {}
    };

    // STEP 1: Check if item is manually marked as critical
    if (item.isCritical === true) {
        result.isCritical = true;
        result.isManuallyMarked = true;
        result.criticalityReason = 'Manually marked as critical';
        // Continue with scoring for informational purposes
    }

    // STEP 2: Check if item belongs to a critical category
    if (item.category && criticalityParams.criticalCategories.some(
        category => item.category.toLowerCase().includes(category.toLowerCase())
    )) {
        result.isCritical = true;
        result.isInCriticalCategory = true;
        result.criticalityReason = result.criticalityReason || `Category '${item.category}' is marked as critical`;
        // Continue with scoring for informational purposes
    }

    // STEP 3: Calculate volatility factor (0-40 points)
    let volatilityScore = 0;
    let volatilityFactor = 0;
    if (historicalData && historicalData.volatility) {
        // Convert volatility (coefficient of variation) to a 0-40 score
        // Typical values: 0.1 (low) to 0.7+ (high volatility)
        volatilityFactor = Math.min(1, historicalData.volatility); // Cap at 1.0
        volatilityScore = Math.round(volatilityFactor * criticalityParams.volatilityWeight);
    } else if (item.usagePerDay > 0) {
        // Use a moderate default if we have usage but no historical data
        volatilityScore = Math.round(0.5 * criticalityParams.volatilityWeight);
    }

    // STEP 4: Calculate stock level factor (0-30 points)
    let stockLevelScore = 0;
    let stockLevelFactor = 0;

    if (item.closingQty >= 0 && item.usagePerDay > 0) {
        // Days of stock remaining = current stock / daily usage
        const daysOfStockRemaining = item.closingQty / item.usagePerDay;

        // Score based on days of stock (lower days = higher score)
        // 0-3 days: high risk (0.7-1.0 factor)
        // 4-7 days: medium risk (0.3-0.6 factor)
        // 8+ days: low risk (0-0.2 factor)
        if (daysOfStockRemaining <= 3) {
            stockLevelFactor = 1.0 - (daysOfStockRemaining / 10); // 0.7-1.0
        } else if (daysOfStockRemaining <= 7) {
            stockLevelFactor = 0.6 - ((daysOfStockRemaining - 3) / 10); // 0.3-0.6
        } else {
            stockLevelFactor = Math.max(0, 0.3 - ((daysOfStockRemaining - 7) / 35)); // 0-0.3
        }

        stockLevelScore = Math.round(stockLevelFactor * criticalityParams.stockLevelWeight);
    }

    // STEP 5: Supplier reliability factor (0-30 points)
    let supplierScore = 0;
    let supplierFactor = 0;

    // Check if supplier reliability data exists
    if (item.supplierReliability) {
        // Direct value: 0 (perfect) to 1.0 (unreliable)
        supplierFactor = Math.min(1, item.supplierReliability);
    } else if (item.supplierName) {
        // Default to moderate score if we have a supplier but no reliability data
        supplierFactor = 0.3;
    } else {
        // No supplier data = higher risk
        supplierFactor = 0.7;
    }

    supplierScore = Math.round(supplierFactor * criticalityParams.supplyReliabilityWeight);

    // STEP 6: Calculate total criticality score (0-100)
    const totalScore = volatilityScore + stockLevelScore + supplierScore;
    result.criticalityScore = totalScore;

    // Store detailed scoring for transparency
    result.criticalityDetails = {
        volatility: {
            factor: volatilityFactor,
            score: volatilityScore,
            maxPossible: criticalityParams.volatilityWeight
        },
        stockLevel: {
            factor: stockLevelFactor,
            score: stockLevelScore,
            maxPossible: criticalityParams.stockLevelWeight,
            daysRemaining: item.usagePerDay > 0 ? (item.closingQty / item.usagePerDay).toFixed(1) : 'N/A'
        },
        supplierReliability: {
            factor: supplierFactor,
            score: supplierScore,
            maxPossible: criticalityParams.supplyReliabilityWeight,
            supplierName: item.supplierName || 'Unknown'
        }
    };

    // STEP 7: Determine if score exceeds threshold
    if (totalScore >= criticalityParams.criticalScoreThreshold) {
        result.hasCriticalScore = true;
        result.isCritical = true;
        result.criticalityReason = result.criticalityReason ||
            `Criticality score (${totalScore}) exceeds threshold (${criticalityParams.criticalScoreThreshold})`;
    }

    return result;
}

/**
 * Core calculation function for order quantities.
 * Port of order-calculator.js:159-231 (pure in the live code — GT2; no deltas).
 * @param {Object} item - Stock item data
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Detailed calculation results
 */
function calculateOrderDetails(item, params = {}) {
    // Default parameters
    const context = {
        orderCycle: 7, // Default order cycle in days (deprecated - use coveringDays instead)
        daysToNextDelivery: params.daysToNextDelivery || 7, // Days until next delivery
        safetyStockPercentage: params.safetyStockPercentage || 20, // Percentage for safety stock
        criticalItemBuffer: params.criticalItemBuffer || 30, // Additional buffer for critical items
        coveringDays: params.coveringDays || params.leadTimeDays || 2, // Days the order is intended to cover after delivery
        ...params
    };

    // Base values with defensive coding
    const usagePerDay = item?.usagePerDay || 0;
    const closingQty = item?.closingQty || 0;
    const isCritical = item?.isCritical || false;

    // STEP 1: Calculate reorder point (theoretical stock at delivery)
    // Q12: unclamped — can go NEGATIVE (inflating base orders on stockouts).
    // The advanced volatility branch clamps its own reorder point to >= 0.
    // Preserved — see design §6 Q12.
    const reOrderPoint = closingQty - (usagePerDay * context.daysToNextDelivery);

    // STEP 2: Calculate base usage for forecast period (days to next delivery + covering days)
    const forecastPeriod = context.daysToNextDelivery + context.coveringDays;
    const baseUsage = usagePerDay * forecastPeriod;

    // STEP 3: Calculate safety stock
    const safetyStock = baseUsage * (context.safetyStockPercentage / 100);

    // STEP 4: Calculate critical stock if applicable
    const criticalStock = isCritical ? baseUsage * (context.criticalItemBuffer / 100) : 0;

    // STEP 5: Calculate forecasted demand
    const forecastedDemand = baseUsage + safetyStock + criticalStock;

    // STEP 6: Determine if order is needed and calculate quantity
    // Simplified formula: Compare Forecasted Demand directly with Reorder Point
    // Q3: base semantics — needsReordering = forecastedDemand > reOrderPoint
    // (the advanced branch instead defines it as recommendedOrderQty > 0).
    // Preserved — see design §6 Q3.
    const needsReordering = forecastedDemand > reOrderPoint;
    const orderQuantity = needsReordering ? Math.max(0, forecastedDemand - reOrderPoint) : 0;

    // Round to appropriate unit (ceil for whole units)
    const recommendedOrderQty = Math.ceil(orderQuantity);

    // Return comprehensive calculation details
    return {
        // Item details
        itemDetails: {
            itemCode: item?.itemCode || '',
            description: item?.description || '',
            category: item?.category || '',
            supplier: item?.supplierName || 'Unassigned'
        },
        // Stock details
        stockDetails: {
            currentStock: formatValueBase(closingQty),
            usagePerDay: formatValueBase(usagePerDay),
            daysToNextDelivery: context.daysToNextDelivery,
            coveringDays: context.coveringDays
        },
        // Calculation components
        calculationDetails: {
            reOrderPoint: formatValueBase(reOrderPoint),
            baseUsage: formatValueBase(baseUsage),
            safetyStock: formatValueBase(safetyStock),
            criticalStock: formatValueBase(criticalStock),
            forecastedDemand: formatValueBase(forecastedDemand)
            // forecastedUsage removed from formula
        },
        // Results
        orderResults: {
            needsReordering: needsReordering,
            recommendedOrderQty: formatValueBase(recommendedOrderQty),
            requiredStock: formatValueBase(baseUsage + safetyStock)
        }
    };
}

/**
 * Format a numeric value for display — BASE variant.
 * Port of order-calculator.js:549-560, consumed by calculateOrderDetails.
 * NOTE: no isFinite guard — Infinity formats as 'Infinity' (differs from
 * formatValueAdv below). Preserved verbatim.
 * @param {number|string} value - The value to format
 * @returns {string} - Formatted value with 2 decimal places
 */
function formatValueBase(value) {
    if (value === undefined || value === null) return '0.00';

    // Convert to number if it's a string
    const numValue = typeof value === 'string' ? parseFloat(value) : value;

    // Check if it's a valid number
    if (isNaN(numValue)) return '0.00';

    // Format to 2 decimal places
    return numValue.toFixed(2);
}

/**
 * Calculate time-weighted historical average giving more weight to recent data.
 * Port of order-calculator-advanced.js:16-39 (no deltas — date sorting reads
 * record.date/record.timestamp values already present in the summary's raw
 * array; no clock access).
 * Q9: records with usagePerDay <= 0 are ignored entirely (they still consume
 * a decay index via the sorted position, but contribute no weight); if ALL
 * raw values are <= 0 this returns 0 and the caller falls back to the simple
 * average. Preserved — see design §6 Q9.
 * @param {Array} historicalRecords - Array of historical usage records
 * @param {number} decayRate - Rate of exponential decay (default: 0.1)
 * @returns {number} - Time-weighted average usage
 */
function calculateTimeWeightedAverage(historicalRecords, decayRate = 0.1) {
    if (!historicalRecords || historicalRecords.length === 0) return 0;

    // Sort by date, newest first
    const sortedRecords = [...historicalRecords].sort((a, b) => {
        const dateA = new Date(a.date || a.timestamp);
        const dateB = new Date(b.date || b.timestamp);
        return dateB - dateA;
    });

    let weightedSum = 0;
    let totalWeight = 0;

    sortedRecords.forEach((record, index) => {
        const usageValue = parseFloat(record.usagePerDay) || 0;
        if (usageValue > 0) { // Only include valid usage data
            const weight = Math.exp(-index * decayRate);
            weightedSum += usageValue * weight;
            totalWeight += weight;
        }
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate confidence scores for historical data quality.
 * Port of order-calculator-advanced.js:47-86 (no deltas).
 * @param {Object} historicalSummary - Historical usage summary
 * @param {number} currentUsage - Current usage per day
 * @returns {Object} - Confidence scores and recommended weights
 */
function calculateHistoricalConfidence(historicalSummary, currentUsage) {
    const dataPoints = historicalSummary.dataPoints || 0;
    const volatility = historicalSummary.volatility || 0;
    const stdDev = historicalSummary.stdDevUsage || 0;

    // Data quantity confidence (0-1)
    const dataQuantityConfidence = Math.min(dataPoints / 30, 1); // 30 days for full confidence

    // Data stability confidence (0-1) - lower volatility = higher confidence
    const avgUsage = historicalSummary.avgDailyUsage || 1;
    const coefficientOfVariation = avgUsage > 0 ? stdDev / avgUsage : 1;
    const stabilityConfidence = Math.max(0, 1 - Math.min(coefficientOfVariation, 1));

    // Trend consistency confidence (0-1)
    // Q10: trend.strength is NEVER produced by the stats side (calculateTrend
    // returns only {slope, direction}) → trendStrength is always 0 →
    // trendConfidence is a constant 0.6; the 0.8 branch is dead code.
    // Preserved — see design §6 Q10.
    const trendStrength = historicalSummary.trend?.strength || 0;
    const trendConfidence = Math.abs(trendStrength) > 0.1 ? 0.8 : 0.6; // Higher if clear trend

    // Current vs historical deviation confidence
    const currentVsHistoricalRatio = currentUsage > 0 && avgUsage > 0 ?
        Math.min(currentUsage / avgUsage, avgUsage / currentUsage) : 0.5;
    const deviationConfidence = Math.max(0, currentVsHistoricalRatio);

    // Overall confidence (weighted average)
    const overallConfidence = (
        dataQuantityConfidence * 0.4 +
        stabilityConfidence * 0.3 +
        trendConfidence * 0.2 +
        deviationConfidence * 0.1
    );

    return {
        overall: overallConfidence,
        dataQuantity: dataQuantityConfidence,
        stability: stabilityConfidence,
        trend: trendConfidence,
        deviation: deviationConfidence,
        recommendedHistoricalWeight: 0.3 + (0.5 * overallConfidence), // 30-80% range
        recommendedCurrentWeight: 0.7 - (0.5 * overallConfidence)     // 70-20% range
    };
}

/**
 * Enhanced order details calculation that incorporates historical data.
 * Port of order-calculator-advanced.js:95-422.
 * Deltas: P1 (all ~19 console.* calls stripped), P2 (params.now — epoch ms,
 * REQUIRED — replaces the two new Date() uses at :212,216), P7 (deep-copy of
 * item kept, all writes land on the copy or the local context), P8 (SAST
 * weekday for the delivery day). Everything else verbatim.
 * @param {Object} item - Stock item data
 * @param {Object} historicalSummary - Historical usage summary for this item
 * @param {Object} params - Calculation parameters; params.now (epoch ms) REQUIRED
 * @returns {Object} - Detailed calculation results
 */
function calculateAdvancedOrderDetails(item, historicalSummary = null, params = {}) {
    // If no historical data is available, fall back to basic calculation
    if (!historicalSummary || historicalSummary.dataPoints === 0) {
        return calculateOrderDetails(item, params);
    }

    // Create a deep copy of the item to avoid modifying the original
    // P7: this deep-copy IS behaviour (advanced:105) — every enhancedItem.*
    // write below lands on this copy, never on the caller's item.
    const enhancedItem = JSON.parse(JSON.stringify(item));

    // Default parameters with advanced options
    // Q7 note: this per-invocation context object is mutated by the stockout
    // escalation below — the caller's params object is never written to.
    const context = {
        orderCycle: 7, // Default order cycle in days (how often delivery occurs)
        daysToNextDelivery: 7, // Days until next delivery
        safetyStockPercentage: 20, // Percentage for safety stock
        criticalItemBuffer: 30, // Additional buffer for critical items
        coveringDays: 2, // Days the order is intended to cover
        volatilityMultiplier: 1.0, // How much to adjust for historical volatility
        trendFactor: 0.5, // How much to consider trend direction
        useDayOfWeekPatterns: true, // Whether to use day-of-week seasonality
        ...params
    };

    // ENHANCEMENT 1: Replace current usage with historical average if available
    // But blend with current usage to be responsive to recent changes
    // IMPROVED: Dynamic weighting based on historical data quality

    // Calculate usage weights based on confidence scores
    let currentUsageWeight, historicalUsageWeight;

    // Only use confidence-based weighting if we have sufficient data
    // Q6: the >= 5 gate here vs the orchestrator's minimumHistoryRequired (2)
    // means 2-4 data points get advanced maths with the Q2 fallback weights.
    // Preserved — see design §6 Q6.
    if (historicalSummary.dataPoints >= 5) {
        const confidence = calculateHistoricalConfidence(historicalSummary, parseFloat(enhancedItem.usagePerDay) || 0);

        currentUsageWeight = confidence.recommendedCurrentWeight;
        historicalUsageWeight = confidence.recommendedHistoricalWeight;

        // Store confidence details for UI display
        // Q14: this confidence object only ever exists in the >= 5 branch —
        // for dataPoints 2-4 no confidence key is stored anywhere.
        // Preserved — see design §6 Q14.
        enhancedItem.usageCalculation = {
            confidence: {
                overall: confidence.overall,
                breakdown: {
                    dataQuantity: confidence.dataQuantity,
                    stability: confidence.stability,
                    trend: confidence.trend,
                    deviation: confidence.deviation
                }
            }
        };
    } else {
        // Fall back to simple weighting for insufficient data
        // Q2: max(dataPoints - 7, 0) is always 0 when dataPoints < 5, so this
        // branch can never leave 50/50. Preserved — see design §6 Q2.
        const minDataPoints = 7;
        const optimalDataPoints = 21;

        const dataConfidenceFactor = Math.min(
            Math.max(historicalSummary.dataPoints - minDataPoints, 0) / (optimalDataPoints - minDataPoints),
            1
        );

        const baseCurrentWeight = 0.5;
        const baseHistoricalWeight = 0.5;
        const maxAdjustment = 0.2;

        currentUsageWeight = baseCurrentWeight - (maxAdjustment * dataConfidenceFactor);
        historicalUsageWeight = baseHistoricalWeight + (maxAdjustment * dataConfidenceFactor);
    }

    const currentUsagePerDay = parseFloat(enhancedItem.usagePerDay) || 0;

    // Use time-weighted historical average instead of simple average
    const simpleHistoricalAvg = parseFloat(historicalSummary.avgDailyUsage) || 0;
    const timeWeightedAvg = calculateTimeWeightedAverage(historicalSummary.raw || []);

    // Use time-weighted if we have raw data, otherwise fall back to simple average
    // Q9: an all-<=0 raw array yields timeWeightedAvg 0 → simple average used.
    const historicalAvgUsage = timeWeightedAvg > 0 ? timeWeightedAvg : simpleHistoricalAvg;

    // Weighted blend of current and historical usage
    let blendedUsage = (currentUsagePerDay * currentUsageWeight) +
                       (historicalAvgUsage * historicalUsageWeight);

    // Ensure we never have negative usage for calculations
    blendedUsage = Math.max(0, blendedUsage);

    // Store the blended usage rate
    enhancedItem.usagePerDay = blendedUsage;

    // Store these values for the UI breakdown
    enhancedItem.usageCalculation = {
        currentUsage: currentUsagePerDay,
        historicalAvg: historicalAvgUsage,
        blendedUsage: blendedUsage,
        weights: {
            current: currentUsageWeight,
            historical: historicalUsageWeight
        },
        // Add confidence data if it was calculated
        ...(enhancedItem.usageCalculation?.confidence && { confidence: enhancedItem.usageCalculation.confidence })
    };

    // ENHANCEMENT 2: Apply day-of-week adjustment if available
    if (context.useDayOfWeekPatterns && historicalSummary.dowPatterns) {
        // Determine which days will be covered in the next order cycle
        // P2: injected clock — the live code read new Date() twice here
        // (advanced:212,216); the delivery instant is now + daysToNextDelivery
        // days on the injected epoch.
        const deliveryTs = params.now + context.daysToNextDelivery * DAY_MS;
        // P8: weekday of the delivery instant computed in SAST (UTC+2), not
        // the host's local timezone.
        const deliveryDayIndex = new Date(deliveryTs + SAST_OFFSET_MS).getUTCDay();

        // Get the day name for the delivery day
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const deliveryDay = days[deliveryDayIndex];

        // Apply the seasonal adjustment if we have data for this day
        // Q5: the factor applies only when the delivery day has > 2 data
        // points; it scales the WHOLE forecast period's usage by that day's
        // index. Preserved — see design §6 Q5.
        if (historicalSummary.dowPatterns[deliveryDay] &&
            historicalSummary.dowPatterns[deliveryDay].dataPoints > 2) {

            const dayFactor = historicalSummary.dowPatterns[deliveryDay].index;

            // Adjust usage per day by the day-of-week factor
            enhancedItem.usagePerDay *= dayFactor;
        }
    }

    // ENHANCEMENT 3: Apply trend adjustment
    if (historicalSummary.trend && context.trendFactor > 0) {
        // Calculate trend factor - more conservative now
        // Q4: asymmetric caps — max +5% for increasing, max −2.5% for
        // decreasing. Preserved — see design §6 Q4.
        let adjustmentFactor = 0;

        // Apply a subtle adjustment based on trend direction
        if (historicalSummary.trend.direction === 'increasing') {
            // Increase projected usage slightly for upward trends (max 5% adjustment)
            adjustmentFactor = Math.min(0.05, context.trendFactor * 0.1);
            enhancedItem.usagePerDay *= (1 + adjustmentFactor);
            // Track the adjustment direction
            enhancedItem.usageCalculation.trendAdjustment = adjustmentFactor;
        }
        else if (historicalSummary.trend.direction === 'decreasing') {
            // Decrease projected usage slightly for downward trends (max 2.5% adjustment)
            adjustmentFactor = Math.min(0.025, context.trendFactor * 0.05);
            enhancedItem.usagePerDay *= (1 - adjustmentFactor);
            // Track the adjustment direction (negative value for decrease)
            enhancedItem.usageCalculation.trendAdjustment = -adjustmentFactor;
        }
        else {
            // No trend adjustment
            enhancedItem.usageCalculation.trendAdjustment = 0;
        }
    }

    // Store the final calculated usage for the UI
    enhancedItem.usageCalculation.finalUsage = enhancedItem.usagePerDay;

    // ENHANCEMENT 3.5: Check for critical stockout situation
    const currentStock = parseFloat(enhancedItem.closingQty) || 0;
    const isStockout = currentStock <= 0;
    const isNearStockout = currentStock < (enhancedItem.usagePerDay * 2); // Less than 2 days of stock

    if (isStockout || isNearStockout) {
        // Increase covering days for stockout situations
        // Q7: stockout escalation mutates the LOCAL context for this item —
        // coveringDays → max(2×, 7), safetyStockPercentage → max(1.5×, 30);
        // near-stockout only sets the flag. Caller params untouched (P7).
        // Preserved — see design §6 Q7.
        if (isStockout) {
            // For complete stockout, order for more days
            context.coveringDays = Math.max(context.coveringDays * 2, 7); // At least 7 days or double normal

            // Also increase safety stock for stockout items
            context.safetyStockPercentage = Math.max(context.safetyStockPercentage * 1.5, 30); // At least 30% or 1.5x normal
        }

        // Mark this as a stockout situation for reporting
        enhancedItem.isStockout = isStockout;
        enhancedItem.isNearStockout = isNearStockout;
    }

    // Now call the standard calculation with our enhanced item data
    // This maintains compatibility with the existing calculation logic
    const basicDetails = calculateOrderDetails(enhancedItem, context);

    // ENHANCEMENT 4: Adjust safety stock based on historical volatility
    // Q8: this volatility path only fires when volatility > 0 AND
    // volatilityMultiplier > 0; otherwise the item silently gets base-calc
    // numbers + insights bolted on. Preserved — see design §6 Q8.
    if (historicalSummary.volatility > 0 && context.volatilityMultiplier > 0) {
        // The more volatile the usage, the more safety stock we need
        const volatilityAdjustment = historicalSummary.stdDevUsage * context.volatilityMultiplier;

        // Get the current calculationDetails
        const origCalculation = basicDetails.calculationDetails;

        // Add extra safety stock based on volatility - fix concatenation issue by ensuring numeric values
        const safetyStock = parseFloat(origCalculation.safetyStock) || 0;
        const enhancedSafetyStock = safetyStock + volatilityAdjustment;

        // Update calculation details with enhanced safety stock
        const enhancedCalculation = {
            ...origCalculation,
            safetyStock: enhancedSafetyStock,
            // Q11: STRING-CONCATENATION BUG preserved — baseUsage and
            // criticalStock are formatted STRINGS here, so this "sum" is a
            // concatenated string (e.g. "22.565.010.00"). Display-only field;
            // order quantities are recomputed from numerics below.
            // Preserved — see design §6 Q11.
            forecastedDemand: origCalculation.baseUsage + enhancedSafetyStock + origCalculation.criticalStock
        };

        // Calculate order quantity as (Required Stock - Re-order Point)
        // The re-order point is the theoretical stock level at next delivery date
        // This calculation is ALWAYS performed regardless of forecasted demand

        // Required stock calculation - ensure all values are properly parsed as numbers
        // Base usage is the projected usage for the forecast period
        const forecastPeriod = context.daysToNextDelivery + context.coveringDays;
        const baseUsage = Math.max(0, enhancedItem.usagePerDay * forecastPeriod); // Ensure base usage is never negative

        // Total required stock is base usage plus safety stock
        // Q1: criticalStock is NOT added here — a critical item can get a
        // SMALLER order via this branch than via the basic path (which folds
        // criticalStock into forecastedDemand). Preserved — see design §6 Q1.
        const requiredStock = baseUsage + enhancedSafetyStock;

        // Calculate order quantity as (Required Stock - Re-order Point)
        // First calculate the re-order point properly - this is the projected level at next delivery
        // (closing stock - projected usage until delivery)
        const closingQty = parseFloat(enhancedItem.closingQty) || 0;
        const projectedUsage = parseFloat(enhancedItem.usagePerDay) * context.daysToNextDelivery;

        // Ensure re-order point is never negative (can't have negative stock)
        // Q12: clamped >= 0 here — the base calc's reOrderPoint is UNclamped.
        // Preserved — see design §6 Q12.
        const reOrderPoint = Math.max(0, closingQty - projectedUsage);

        // The order quantity is the difference between required stock and re-order point
        // This aligns with the business definition of re-order point in the system
        const orderQuantity = Math.max(0, requiredStock - reOrderPoint);
        const recommendedOrderQty = Math.ceil(orderQuantity);

        // Flag as needing reordering if we have a positive order quantity
        // Q3: advanced semantics — needsReordering === (recommendedOrderQty > 0).
        // Preserved — see design §6 Q3.
        const needsReordering = recommendedOrderQty > 0;

        // Create enhanced order results
        const enhancedOrderResults = {
            needsReordering,
            recommendedOrderQty: formatValueAdv(recommendedOrderQty),
            requiredStock: formatValueAdv(requiredStock)
        };

        // Return enhanced calculation details
        return {
            ...basicDetails,
            calculationDetails: enhancedCalculation,
            orderResults: enhancedOrderResults,
            historicalInsights: {
                avgDailyUsage: historicalSummary.avgDailyUsage,
                stdDevUsage: historicalSummary.stdDevUsage,
                volatility: historicalSummary.volatility,
                trend: historicalSummary.trend,
                dataPoints: historicalSummary.dataPoints,
                // Include the raw historical records so they can be displayed in the UI
                rawData: historicalSummary.raw || [],
                adjustments: {
                    // Include the usage calculation data for UI breakdown
                    currentUsage: enhancedItem.usageCalculation.currentUsage,
                    blendedUsage: enhancedItem.usageCalculation.blendedUsage,
                    finalUsage: enhancedItem.usageCalculation.finalUsage || enhancedItem.usagePerDay,
                    volatilityAdjustment,
                    // Q13: signed NUMBER here vs a BOOLEAN in the else-branch.
                    // Preserved — see design §6 Q13.
                    trendAdjustment: enhancedItem.usageCalculation.trendAdjustment || 0,
                    seasonalAdjustment: context.useDayOfWeekPatterns
                }
            },
            // Add stockout status
            stockStatus: {
                isStockout: enhancedItem.isStockout || false,
                isNearStockout: enhancedItem.isNearStockout || false,
                currentStock: parseFloat(enhancedItem.closingQty) || 0
            }
        };
    } else {
        // Just add historical insights without modifying the calculation
        // (Q8 else-branch: NO rawData key here, and blendedUsage/finalUsage
        // both report the final post-dow/post-trend usage.)
        return {
            ...basicDetails,
            historicalInsights: {
                avgDailyUsage: historicalSummary.avgDailyUsage,
                stdDevUsage: historicalSummary.stdDevUsage,
                volatility: historicalSummary.volatility,
                trend: historicalSummary.trend,
                dataPoints: historicalSummary.dataPoints,
                adjustments: {
                    blendedUsage: enhancedItem.usagePerDay,
                    finalUsage: enhancedItem.usagePerDay,
                    volatilityAdjustment: 0,
                    // Q13: BOOLEAN here (direction !== 'stable') vs the signed
                    // number in the volatility branch. Preserved — design §6 Q13.
                    trendAdjustment: historicalSummary.trend.direction !== 'stable',
                    seasonalAdjustment: context.useDayOfWeekPatterns
                }
            },
            // Add stockout status
            stockStatus: {
                isStockout: enhancedItem.isStockout || false,
                isNearStockout: enhancedItem.isNearStockout || false,
                currentStock: parseFloat(enhancedItem.closingQty) || 0
            }
        };
    }
}

/**
 * Format a numeric value for display — ADVANCED variant.
 * Port of order-calculator-advanced.js:613-626, consumed by the volatility
 * branch of calculateAdvancedOrderDetails.
 * NOTE: unlike formatValueBase, this guards typeof/isFinite — Infinity and
 * any non-number → '0.00'. Preserved verbatim.
 * @param {number|string} value - The value to format
 * @returns {string} - Formatted value with 2 decimal places
 */
function formatValueAdv(value) {
    // If value is already a string, try to parse it
    if (typeof value === 'string') {
        value = parseFloat(value);
    }

    // Check if value is a valid number
    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
        return '0.00';
    }

    // Format to 2 decimal places
    return value.toFixed(2);
}

module.exports = {
    calculateOrderDetails,
    calculateCriticalityScore,
    calculateTimeWeightedAverage,
    calculateHistoricalConfidence,
    calculateAdvancedOrderDetails
};
