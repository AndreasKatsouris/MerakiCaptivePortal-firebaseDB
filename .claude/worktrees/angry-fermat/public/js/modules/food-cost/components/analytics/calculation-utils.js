/**
 * Food Cost Module - Calculation Utilities
 * Handles stock item calculations and analytics
 */

/**
 * Calculate usage per day for a stock item
 * @param {number} usage - Total usage quantity
 * @param {number} periodDays - Number of days in the stock period
 * @returns {number} - Usage per day
 */
export function calculateUsagePerDay(usage, periodDays) {
    if (!periodDays || periodDays <= 0) {
        console.warn('Invalid period days for usage calculation:', periodDays);
        return 0;
    }
    
    // Calculate usage per day, ensure it's not negative
    return Math.max(0, usage / periodDays);
}

/**
 * Calculate reorder point for a stock item
 * @param {number} closingBalance - Current closing balance
 * @param {number} usagePerDay - Usage per day
 * @param {number} daysToNextDelivery - Days until next delivery
 * @returns {number} - Reorder point
 */
export function calculateReorderPoint(closingBalance, usagePerDay, daysToNextDelivery) {
    if (!daysToNextDelivery || daysToNextDelivery <= 0) {
        console.warn('Invalid days to next delivery:', daysToNextDelivery);
        return closingBalance;
    }
    
    // Calculate reorder point based on usage and delivery schedule
    return closingBalance - (usagePerDay * daysToNextDelivery);
}

/**
 * Calculate theoretical order quantity for an item
 * @param {Object} item - Stock item data
 * @param {Object} params - Calculation parameters 
 * @returns {number} - Theoretical order quantity
 */
export function calculateTheoreticalOrderQuantity(item, params) {
    const {
        daysToNextDelivery = 5,
        safetyStockPercentage = 15,
        criticalItemBuffer = 30,
        coveringDays = 2 // Previously leadTime
    } = params || {};
    
    // Forecast period calculation (days to next delivery + covering days)
    const forecastPeriod = daysToNextDelivery + coveringDays;
    
    // Base forecast usage
    const usagePerDay = item.usagePerDay || 0;
    const baseUsage = usagePerDay * forecastPeriod;
    
    // Apply safety stock percentage
    const safetyFactor = 1 + (safetyStockPercentage / 100);
    let forecastUsage = baseUsage * safetyFactor;
    
    // Apply critical item buffer for critical items
    const isCriticalItem = item.isCritical || 
                          (item.category && item.category.toLowerCase().includes('critical'));
    
    if (isCriticalItem && criticalItemBuffer > 0) {
        const criticalFactor = 1 + (criticalItemBuffer / 100);
        forecastUsage = forecastUsage * criticalFactor;
    }
    
    // Theoretical order quantity (Forecast Usage - Reorder Point)
    // If result is negative, default to 0
    return Math.max(0, Math.ceil(forecastUsage - item.reorderPoint));
}

/**
 * Generate calculation details for a stock item
 * @param {Object} item - Stock item data
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Detailed calculation steps and results
 */
export function getCalculationDetails(item, params) {
    const {
        daysToNextDelivery = 5,
        stockPeriodDays = 7,
        safetyStockPercentage = 15,
        criticalItemBuffer = 30,
        coveringDays = 2 // Previously leadTime
    } = params || {};
    
    // Validate item data
    if (!item) {
        console.error('Invalid item provided to getCalculationDetails');
        return { error: 'Invalid item data' };
    }
    
    // Forecast period calculation
    const forecastPeriod = daysToNextDelivery + coveringDays;
    
    // Base forecast usage
    const usagePerDay = item.usagePerDay || 0;
    const baseUsage = usagePerDay * forecastPeriod;
    
    // Apply safety stock percentage
    const safetyFactor = 1 + (safetyStockPercentage / 100);
    let forecastUsage = baseUsage * safetyFactor;
    
    // Apply critical item buffer for critical items
    const isCriticalItem = item.isCritical || 
                          (item.category && item.category.toLowerCase().includes('critical'));
    
    let criticalApplied = false;
    if (isCriticalItem && criticalItemBuffer > 0) {
        criticalApplied = true;
        const criticalFactor = 1 + (criticalItemBuffer / 100);
        forecastUsage = forecastUsage * criticalFactor;
    }
    
    // Theoretical order quantity calculation
    const theoreticalOrderQty = Math.max(0, Math.ceil(forecastUsage - item.reorderPoint));
    
    // Prepare calculation details
    return {
        item: {
            description: item.description,
            openingBalance: item.openingBalance || 0,
            purchases: item.purchases || 0,
            closingBalance: item.closingBalance || 0,
            usage: item.usage || 0,
            unitCost: item.unitCost || 0,
            costOfUsage: item.costOfUsage || 0,
            usagePerDay: usagePerDay,
            reorderPoint: item.reorderPoint || 0
        },
        params: {
            stockPeriodDays,
            daysToNextDelivery,
            coveringDays,
            safetyStockPercentage,
            criticalItemBuffer,
            isCriticalItem
        },
        calculations: {
            forecastPeriod,
            baseUsage,
            withSafety: baseUsage * safetyFactor,
            criticalApplied,
            forecastUsage,
            theoreticalOrderQty
        },
        formattedCalculations: {
            usageCalculation: `Opening (${item.openingBalance?.toFixed(2) || '0.00'}) + Purchases (${item.purchases?.toFixed(2) || '0.00'}) - Closing (${item.closingBalance?.toFixed(2) || '0.00'}) = ${item.usage?.toFixed(2) || '0.00'}`,
            costOfUsage: `Usage (${item.usage?.toFixed(2) || '0.00'}) × Unit Cost (${item.unitCost?.toFixed(2) || '0.00'}) = ${item.costOfUsage?.toFixed(2) || '0.00'}`,
            usagePerDay: `Usage (${item.usage?.toFixed(2) || '0.00'}) ÷ Period (${stockPeriodDays} days) = ${usagePerDay.toFixed(2)}`,
            reorderPoint: `Closing (${item.closingBalance?.toFixed(2) || '0.00'}) - (Usage/Day (${usagePerDay.toFixed(2)}) × Days to Next Delivery (${daysToNextDelivery})) = ${item.reorderPoint?.toFixed(2) || '0.00'}`,
            forecastPeriod: `Days to Next Delivery (${daysToNextDelivery}) + Covering Days (${coveringDays}) = ${forecastPeriod} days`,
            baseUsage: `Usage/Day (${usagePerDay.toFixed(2)}) × Forecast Period (${forecastPeriod}) = ${baseUsage.toFixed(2)}`,
            safetyStock: `Base Usage (${baseUsage.toFixed(2)}) × Safety Factor (${safetyFactor.toFixed(2)}) = ${(baseUsage * safetyFactor).toFixed(2)}`,
            criticalBuffer: criticalApplied ? 
                `Usage with Safety (${(baseUsage * safetyFactor).toFixed(2)}) × Critical Factor (${(1 + (criticalItemBuffer / 100)).toFixed(2)}) = ${forecastUsage.toFixed(2)}` : '',
            requiredOrder: `Forecast Usage (${forecastUsage.toFixed(2)}) - Reorder Point (${item.reorderPoint?.toFixed(2) || '0.00'}) = ${(forecastUsage - (item.reorderPoint || 0)).toFixed(2)}`,
            finalOrder: `Final Order Quantity = Round up to nearest whole number = ${theoreticalOrderQty}`
        }
    };
}
