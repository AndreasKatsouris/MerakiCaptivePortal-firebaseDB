/**
 * Food Cost Module - Advanced Order Calculator
 * Extends the basic order calculator with historical data analysis
 * Version: 2.1.2-2025-05-15
 */

import { generatePurchaseOrder, calculateOrderDetails, calculateCriticalityScore } from './order-calculator.js';
import HistoricalUsageService from './services/historical-usage-service.js';

/**
 * Enhanced order details calculation that incorporates historical data
 * @param {Object} item - Stock item data
 * @param {Object} historicalSummary - Historical usage summary for this item
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Detailed calculation results
 */
export function calculateAdvancedOrderDetails(item, historicalSummary = null, params = {}) {
    console.log('[AdvancedOrderCalc] Calculating advanced order details');
    
    // If no historical data is available, fall back to basic calculation
    if (!historicalSummary || historicalSummary.dataPoints === 0) {
        console.log('[AdvancedOrderCalc] No historical data, using basic calculation');
        return calculateOrderDetails(item, params);
    }
    
    // Create a deep copy of the item to avoid modifying the original
    const enhancedItem = JSON.parse(JSON.stringify(item));
    
    // Default parameters with advanced options
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
    
    // Log key inputs for debugging
    console.log(`[AdvancedOrderCalc] Item: ${enhancedItem.itemCode} - ${enhancedItem.description}`);
    console.log(`[AdvancedOrderCalc] Current usagePerDay: ${enhancedItem.usagePerDay}, Historical avg: ${historicalSummary.avgDailyUsage}`);
    
    // ENHANCEMENT 1: Replace current usage with historical average if available
    // But blend with current usage to be responsive to recent changes
    // Adjusted to give more weight to current usage for stability
    const currentUsageWeight = 0.7; // 70% weight to current, 30% to historical
    const historicalUsageWeight = 1 - currentUsageWeight;
    
    console.log(`[AdvancedOrderCalc] Blending weights: Current ${currentUsageWeight * 100}%, Historical ${historicalUsageWeight * 100}%`);
    
    const currentUsagePerDay = parseFloat(enhancedItem.usagePerDay) || 0;
    const historicalAvgUsage = parseFloat(historicalSummary.avgDailyUsage) || 0;
    
    // Weighted blend of current and historical usage
    let blendedUsage = (currentUsagePerDay * currentUsageWeight) + 
                       (historicalAvgUsage * historicalUsageWeight);
    
    // Ensure we never have negative usage for calculations
    blendedUsage = Math.max(0, blendedUsage);
    
    console.log(`[AdvancedOrderCalc] Usage calculation: (${currentUsagePerDay.toFixed(2)} × ${currentUsageWeight}) + (${historicalAvgUsage.toFixed(2)} × ${historicalUsageWeight}) = ${blendedUsage.toFixed(2)} units/day`);
    
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
        }
    };
    
    // ENHANCEMENT 2: Apply day-of-week adjustment if available
    if (context.useDayOfWeekPatterns && historicalSummary.dowPatterns) {
        // Determine which days will be covered in the next order cycle
        const today = new Date();
        const todayIndex = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        
        // We need to adjust for the next delivery's day-of-week pattern
        const deliveryDate = new Date();
        deliveryDate.setDate(today.getDate() + context.daysToNextDelivery);
        const deliveryDayIndex = deliveryDate.getDay();
        
        // Get the day name for the delivery day
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const deliveryDay = days[deliveryDayIndex];
        
        // Apply the seasonal adjustment if we have data for this day
        if (historicalSummary.dowPatterns[deliveryDay] && 
            historicalSummary.dowPatterns[deliveryDay].dataPoints > 2) {
            
            const dayFactor = historicalSummary.dowPatterns[deliveryDay].index;
            console.log(`[AdvancedOrderCalc] Applying day-of-week factor for ${deliveryDay}: ${dayFactor}`);
            
            // Adjust usage per day by the day-of-week factor
            enhancedItem.usagePerDay *= dayFactor;
        }
    }
    
    // ENHANCEMENT 3: Apply trend adjustment
    if (historicalSummary.trend && context.trendFactor > 0) {
        // Save the pre-adjustment value for logging
        const preAdjustmentUsage = enhancedItem.usagePerDay;
        
        // Calculate trend factor - more conservative now
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
        
        // Detailed logging
        console.log(`[AdvancedOrderCalc] Trend adjustment (${historicalSummary.trend.direction}): ${preAdjustmentUsage.toFixed(2)} → ${enhancedItem.usagePerDay.toFixed(2)} (${(adjustmentFactor * 100).toFixed(1)}% ${historicalSummary.trend.direction === 'increasing' ? 'increase' : 'decrease'})`);
    }
    
    // Now call the standard calculation with our enhanced item data
    // This maintains compatibility with the existing calculation logic
    const basicDetails = calculateOrderDetails(enhancedItem, context);
    
    // ENHANCEMENT 4: Adjust safety stock based on historical volatility
    if (historicalSummary.volatility > 0 && context.volatilityMultiplier > 0) {
        // The more volatile the usage, the more safety stock we need
        const volatilityAdjustment = historicalSummary.stdDevUsage * context.volatilityMultiplier;
        
        // Get the current calculationDetails
        const origCalculation = basicDetails.calculationDetails;
        
        // Add extra safety stock based on volatility - fix concatenation issue by ensuring numeric values
        const safetyStock = parseFloat(origCalculation.safetyStock) || 0;
        const enhancedSafetyStock = safetyStock + volatilityAdjustment;
        
        console.log(`[AdvancedOrderCalc] Adjusting safety stock for volatility: ${safetyStock.toFixed(2)} + ${volatilityAdjustment.toFixed(2)} = ${enhancedSafetyStock.toFixed(2)}`);
        
        // Update calculation details with enhanced safety stock
        const enhancedCalculation = {
            ...origCalculation,
            safetyStock: enhancedSafetyStock,
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
        const requiredStock = baseUsage + enhancedSafetyStock;
        
        console.log(`[AdvancedOrderCalc] Base usage: ${enhancedItem.usagePerDay.toFixed(2)} units/day × ${forecastPeriod} days = ${baseUsage.toFixed(2)} units`);
        console.log(`[AdvancedOrderCalc] Required Stock: ${baseUsage.toFixed(2)} (base usage) + ${enhancedSafetyStock.toFixed(2)} (safety stock) = ${requiredStock.toFixed(2)}`);
        
        // Calculate order quantity as (Required Stock - Re-order Point)
        // First calculate the re-order point properly - this is the projected level at next delivery
        // (closing stock - projected usage until delivery)
        const closingQty = parseFloat(enhancedItem.closingQty) || 0;
        const projectedUsage = parseFloat(enhancedItem.usagePerDay) * context.daysToNextDelivery;
        
        // Ensure re-order point is never negative (can't have negative stock)
        const reOrderPoint = Math.max(0, closingQty - projectedUsage);
        
        console.log(`[AdvancedOrderCalc] Re-order Point: ${closingQty.toFixed(2)} (current) - ${projectedUsage.toFixed(2)} (projected usage) = ${reOrderPoint.toFixed(2)}`);
        
        // The order quantity is the difference between required stock and re-order point
        // This aligns with the business definition of re-order point in the system
        const orderQuantity = Math.max(0, requiredStock - reOrderPoint);
        const recommendedOrderQty = Math.ceil(orderQuantity);
        
        // Ensure safe logging by checking types
        console.log(`[AdvancedOrderCalc] Calculating Order: Required Stock (${typeof requiredStock === 'number' ? requiredStock.toFixed(2) : requiredStock}) - Re-order Point (${typeof reOrderPoint === 'number' ? reOrderPoint.toFixed(2) : reOrderPoint}) = Order Qty (${recommendedOrderQty})`);
        
        // Flag as needing reordering if we have a positive order quantity
        const needsReordering = recommendedOrderQty > 0;
        
        // Create enhanced order results
        const enhancedOrderResults = {
            needsReordering,
            recommendedOrderQty: formatValue(recommendedOrderQty),
            requiredStock: formatValue(requiredStock)
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
                    volatilityAdjustment,
                    trendAdjustment: enhancedItem.usageCalculation.trendAdjustment || 0,
                    seasonalAdjustment: context.useDayOfWeekPatterns
                }
            }
        };
    } else {
        // Just add historical insights without modifying the calculation
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
                    volatilityAdjustment: 0,
                    trendAdjustment: historicalSummary.trend.direction !== 'stable',
                    seasonalAdjustment: context.useDayOfWeekPatterns
                }
            }
        };
    }
}

/**
 * Generate an advanced purchase order using historical usage data
 * @param {Array} stockData - The stock data array
 * @param {String} storeName - Store name to get historical data for
 * @param {String} supplierFilter - Optional supplier to filter by
 * @param {Object} params - Additional parameters for order calculation
 * @returns {Promise<Array>} - Purchase order items with historical insights
 */
export async function generateAdvancedPurchaseOrder(stockData, storeName, supplierFilter = 'All Suppliers', params = {}) {
    console.log('%c [Advanced PO Generator] Generating purchase order with historical data', 'color: #0066cc; font-weight: bold;');
    console.log(`[Advanced PO Generator] Store: ${storeName}, Supplier: ${supplierFilter}`);
    
    // Validate input data
    if (!stockData || !Array.isArray(stockData) || stockData.length === 0) {
        console.warn('[Advanced PO Generator] No valid stock data available to generate purchase order');
        return [];
    }
    
    if (!storeName) {
        console.warn('[Advanced PO Generator] No store name provided, falling back to basic calculation');
        return generatePurchaseOrder(stockData, supplierFilter, params);
    }
    
    // Enhanced parameters with defaults for advanced features
    const advancedParams = {
        lookbackDays: 14, // Default to 2 weeks of history
        volatilityMultiplier: 1.0, // How much to adjust for historical volatility
        trendFactor: 0.5, // How much to consider trend direction
        useDayOfWeekPatterns: true, // Whether to use day-of-week seasonality
        minimumHistoryRequired: 3, // Minimum data points needed for advanced calculation (lowered from 5)
        ...params
    };
    
    try {
        console.log('[Advanced PO Generator] Fetching historical data...');
        
        // Step 1: Generate historical summaries for all stock items
        const historicalSummaries = await HistoricalUsageService.generateHistoricalSummaries(
            storeName, 
            stockData, 
            { lookbackDays: advancedParams.lookbackDays }
        );
        
        console.log(`[Advanced PO Generator] Retrieved historical data for ${Object.keys(historicalSummaries).length} items`);
        
        // Step 2: Generate basic purchase order but with item-by-item advanced calculations
        // This is a modified version of the generatePurchaseOrder function
        
        // Process calculation parameters with defaults
        const calculationParams = {
            orderCycle: 7, // Default order cycle in days (how often delivery occurs)
            daysToNextDelivery: params.daysToNextDelivery || 7,
            coveringDays: params.coveringDays || params.leadTimeDays || 2, // Support both new and legacy parameter names
            safetyStockPercentage: params.safetyStockPercentage || 20,
            criticalItemBuffer: params.criticalItemBuffer || 30,
            // Add advanced parameters
            volatilityMultiplier: advancedParams.volatilityMultiplier,
            trendFactor: advancedParams.trendFactor,
            useDayOfWeekPatterns: advancedParams.useDayOfWeekPatterns
        };
        
        console.log('[Advanced PO Generator] Using parameters:', calculationParams);
        
        // Track metrics
        const metrics = {
            totalItems: stockData.length,
            itemsWithHistory: Object.keys(historicalSummaries).length,
            advancedCalculations: 0,
            basicCalculations: 0,
            finalIncluded: 0,
        };
        
        // First phase: Process each item with advanced calculations when history is available
        const processedItems = stockData.map(item => {
            // Skip invalid items
            if (!item) return null;
            
            // Check for missing supplier when a supplier filter is applied
            if (supplierFilter !== 'All Suppliers' && (!item.supplierName || item.supplierName === '')) {
                return null;
            }
            
            // Filter by supplier if specified
            const supplierMatch = supplierFilter === 'All Suppliers' || 
                               (item.supplierName && item.supplierName === supplierFilter);
            
            if (!supplierMatch) {
                return null;
            }
            
            // Set critical item flag based on category or existing flag
            // Get historical summary for this item if available
            const historicalSummary = historicalSummaries[item.itemCode];
            
            // Use the enhanced criticality score calculation
            const criticalityResult = calculateCriticalityScore(item, historicalSummary, params);
            const isCritical = criticalityResult.isCritical;
            
            // Store criticality details for reporting and UI
            item.criticalityDetails = criticalityResult.criticalityDetails;
            item.criticalityScore = criticalityResult.criticalityScore;
            item.criticalityReason = criticalityResult.criticalityReason;
            
            let orderDetails;
            
            // Use advanced calculation if we have sufficient historical data
            if (historicalSummary && historicalSummary.dataPoints >= advancedParams.minimumHistoryRequired) {
                orderDetails = calculateAdvancedOrderDetails(
                    { ...item, isCritical }, 
                    historicalSummary,
                    calculationParams
                );
                metrics.advancedCalculations++;
            } else {
                // Fall back to basic calculation
                orderDetails = calculateOrderDetails(
                    { ...item, isCritical },
                    calculationParams
                );
                metrics.basicCalculations++;
            }
            
            return {
                ...item,
                orderQuantity: parseInt(orderDetails.orderResults.recommendedOrderQty) || 0,
                requiredStock: parseFloat(orderDetails.orderResults.requiredStock) || 0,
                calculationDetails: orderDetails,
                isCritical,
                needsReordering: orderDetails.orderResults.needsReordering,
                // Add historical insights if available
                historicalInsights: orderDetails.historicalInsights || null,
                calculationType: orderDetails.historicalInsights ? 'advanced' : 'basic'
            };
        }).filter(item => item !== null);
        
        // Second phase: Filter to only items that need reordering
        // An item needs reordering if it has a positive order quantity
        const orderItems = processedItems.filter(item => {
            const orderQty = parseInt(item.orderQuantity) || 0;
            return orderQty > 0;
        });
        
        // Log metrics
        metrics.finalIncluded = orderItems.length;
        console.log('%c [Advanced PO Generator] Order generation metrics:', 'color: #0066cc;', metrics);
        
        // Sort by supplier and category for better organization
        orderItems.sort((a, b) => {
            // First by supplier
            if (a.supplierName < b.supplierName) return -1;
            if (a.supplierName > b.supplierName) return 1;
            
            // Then by category
            if (a.category < b.category) return -1;
            if (a.category > b.category) return 1;
            
            // Then by item code
            return a.itemCode.localeCompare(b.itemCode);
        });
        
        return orderItems;
        
    } catch (error) {
        console.error('[Advanced PO Generator] Error generating advanced purchase order:', error);
        
        // Fall back to basic purchase order generation
        console.log('[Advanced PO Generator] Falling back to basic purchase order generation');
        return generatePurchaseOrder(stockData, supplierFilter, params);
    }
}

/**
 * Format a numeric value for display
 * @param {number|string} value - The value to format
 * @returns {string} - Formatted value with 2 decimal places
 */
function formatValue(value) {
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

/**
 * Export advanced purchase order to CSV format
 * @param {Array} purchaseOrderItems - The purchase order items
 * @returns {String} - CSV content with historical insights
 */
export function exportAdvancedPurchaseOrderToCSV(purchaseOrderItems) {
    if (!purchaseOrderItems || !Array.isArray(purchaseOrderItems) || purchaseOrderItems.length === 0) {
        console.warn('No purchase order items to export');
        return '';
    }
    
    // Enhanced header with historical data columns
    const csvHeader = [
        'Item Code',
        'Description',
        'Supplier',
        'Category',
        'Current Stock',
        'Current Usage/Day',
        'Historical Avg Usage/Day',
        'Volatility',
        'Trend',
        'Order Quantity',
        'Unit',
        'Unit Cost',
        'Total',
        'Notes',
        'Calculation Type'
    ].join(',');
    
    // Generate CSV rows
    const csvRows = purchaseOrderItems.map(item => {
        // Extract historical insights if available
        const historicalAvgUsage = item.historicalInsights ? 
                                 item.historicalInsights.avgDailyUsage.toFixed(2) : 'N/A';
        const volatility = item.historicalInsights ? 
                         (item.historicalInsights.volatility * 100).toFixed(1) + '%' : 'N/A';
        const trend = item.historicalInsights ? 
                    item.historicalInsights.trendDirection : 'N/A';
        
        // Format CSV row
        return [
            escapeCsvValue(item.itemCode || ''),
            escapeCsvValue(item.description || ''),
            escapeCsvValue(item.supplierName || ''),
            escapeCsvValue(item.category || ''),
            formatValue(item.closingQty || 0),
            formatValue(item.usagePerDay || 0),
            historicalAvgUsage,
            volatility,
            trend,
            item.orderQuantity || 0,
            escapeCsvValue(item.unit || 'ea'),
            formatValue(item.unitCost || 0),
            formatValue((item.orderQuantity || 0) * (item.unitCost || 0)),
            escapeCsvValue(item.isCritical ? 'CRITICAL' : ''),
            escapeCsvValue(item.calculationType || 'basic')
        ].join(',');
    });
    
    // Combine header and rows
    return [csvHeader, ...csvRows].join('\n');
}

/**
 * Escape a value for CSV export
 * @param {any} value - The value to escape
 * @returns {string} - CSV-safe value
 */
function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    // Convert to string if not already
    const stringValue = String(value);
    
    // Check if value needs enclosing in quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        // Escape quotes by doubling them and enclose in quotes
        return '"' + stringValue.replace(/"/g, '""') + '"';
    }
    
    return stringValue;
}

export default {
    generateAdvancedPurchaseOrder,
    calculateAdvancedOrderDetails,
    exportAdvancedPurchaseOrderToCSV
};
