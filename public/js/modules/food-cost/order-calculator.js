/**
 * Food Cost Module - Order Calculator
 * Handles purchase order calculations and exports
 * Version: 2.1.2-2025-05-15
 */

/**
 * Core calculation function for order quantities
 * @param {Object} item - Stock item data
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Detailed calculation results
 */
/**
 * Calculate criticality score for a stock item
 * @param {Object} item - Stock item data
 * @param {Object} historicalData - Historical usage data for this item (optional)
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Criticality assessment results
 */
export function calculateCriticalityScore(item, historicalData = null, params = {}) {
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
 * Core calculation function for order quantities
 * @param {Object} item - Stock item data
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Detailed calculation results
 */
export function calculateOrderDetails(item, params = {}) {
    // Default parameters
    const context = {
        orderCycle: 7, // Default order cycle in days (how often delivery occurs)
        daysToNextDelivery: 7, // Days until next delivery
        safetyStockPercentage: 20, // Percentage for safety stock
        criticalItemBuffer: 30, // Additional buffer for critical items
        coveringDays: 2, // Days the order is intended to cover
        ...params
    };
    
    // Base values with defensive coding
    const usagePerDay = item?.usagePerDay || 0;
    const closingQty = item?.closingQty || 0;
    const isCritical = item?.isCritical || false;
    
    // STEP 1: Calculate reorder point (theoretical stock at delivery)
    const reOrderPoint = closingQty - (usagePerDay * context.daysToNextDelivery);
    
    // STEP 2: Calculate base usage for order cycle
    const baseUsage = usagePerDay * context.orderCycle;
    
    // STEP 3: Calculate safety stock
    const safetyStock = baseUsage * (context.safetyStockPercentage / 100);
    
    // STEP 4: Calculate critical stock if applicable
    const criticalStock = isCritical ? baseUsage * (context.criticalItemBuffer / 100) : 0;
    
    // STEP 5: Calculate forecasted demand
    const forecastedDemand = baseUsage + safetyStock + criticalStock;
    
    // STEP 6: Determine if order is needed and calculate quantity
    // Simplified formula: Compare Forecasted Demand directly with Reorder Point
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
            currentStock: formatValue(closingQty),
            usagePerDay: formatValue(usagePerDay),
            daysToNextDelivery: context.daysToNextDelivery,
            coveringDays: context.coveringDays
        },
        // Calculation components
        calculationDetails: {
            reOrderPoint: formatValue(reOrderPoint),
            baseUsage: formatValue(baseUsage),
            safetyStock: formatValue(safetyStock),
            criticalStock: formatValue(criticalStock),
            forecastedDemand: formatValue(forecastedDemand)
            // forecastedUsage removed from formula
        },
        // Results
        orderResults: {
            needsReordering: needsReordering,
            recommendedOrderQty: formatValue(recommendedOrderQty),
            requiredStock: formatValue(baseUsage + safetyStock)
        }
    };
}

/**
 * Generates a purchase order based on current stock levels and usage patterns
 * @param {Array} stockData - The stock data array
 * @param {String} supplierFilter - Optional supplier to filter by
 * @param {Object} params - Additional parameters for order calculation
 * @returns {Array} - Purchase order items
 */
export function generatePurchaseOrder(stockData, supplierFilter = 'All Suppliers', params = {}) {
    console.log('%c [PO Generator] Generating purchase order', 'color: #0066cc; font-weight: bold;');
    
    // Validate input data
    if (!stockData || !Array.isArray(stockData) || stockData.length === 0) {
        console.warn('[PO Generator] No valid stock data available to generate purchase order');
        return [];
    }

    // Process calculation parameters with defaults
    const calculationParams = {
        orderCycle: 7, // Default order cycle in days (how often delivery occurs)
        daysToNextDelivery: params.daysToNextDelivery || 7,
        coveringDays: params.coveringDays || params.leadTimeDays || 2, // Support both new and legacy parameter names
        safetyStockPercentage: params.safetyStockPercentage || 20,
        criticalItemBuffer: params.criticalItemBuffer || 30,
    };
    
    console.log('[PO Generator] Using parameters:', calculationParams);
    console.log('[PO Generator] Supplier filter:', supplierFilter);
    console.log('[PO Generator] Processing', stockData.length, 'stock items');

    // Track metrics for filtering and diagnostics
    const metrics = {
        totalItems: stockData.length,
        supplierMatches: 0,
        belowReorderPoint: 0,
        missingSupplier: 0,
        negativeUsagePerDay: 0,
        finalIncluded: 0,
    };
    
    // First phase: Filter items based on supplier and apply calculations
    const processedItems = stockData.map(item => {
        // Skip invalid items
        if (!item) {
            console.warn('[PO Generator] Invalid item found in stock data');
            return null;
        }
        
        // Check for missing supplier when a supplier filter is applied
        if (supplierFilter !== 'All Suppliers' && (!item.supplierName || item.supplierName === '')) {
            metrics.missingSupplier++;
            return null;
        }
        
        // Filter by supplier if specified
        const supplierMatch = supplierFilter === 'All Suppliers' || 
                            (item.supplierName && item.supplierName === supplierFilter);
        
        if (!supplierMatch) {
            return null;
        }
        metrics.supplierMatches++;
        
        // Check for negative or zero usage per day
        if (!item.usagePerDay || item.usagePerDay <= 0) {
            metrics.negativeUsagePerDay++;
            // We'll still process it but note it might not need ordering
        }
        
        // Calculate criticality using the enhanced algorithm
        // This uses both manual flags, categories, and risk scoring
        const historicalData = item.historicalData || null;
        const criticalityResult = calculateCriticalityScore(item, historicalData, params);
        const isCritical = criticalityResult.isCritical;
        
        // Calculate order details using our consolidated function
        const orderDetails = calculateOrderDetails(item, {
            ...calculationParams,
            isCritical
        });
        
        // Determine if this item needs reordering
        if (orderDetails.orderResults.needsReordering) {
            metrics.belowReorderPoint++;
        }
        
        // Debug log for specific items to help troubleshoot reordering decisions
        if (item.itemCode === '10976' || (item.description && item.description.toLowerCase().includes('castle'))) {
            console.log(`Reorder debug for ${item.itemCode} - ${item.description}:`);
            console.log(`  Current stock: ${orderDetails.stockDetails.currentStock}`);
            console.log(`  Usage per day: ${orderDetails.stockDetails.usagePerDay}`);
            console.log(`  Reorder point: ${orderDetails.calculationDetails.reOrderPoint}`);
            console.log(`  Needs reordering: ${orderDetails.orderResults.needsReordering}`);
            console.log(`  Recommended quantity: ${orderDetails.orderResults.recommendedOrderQty}`);
        }
        
        return {
            ...item,
            orderQuantity: parseInt(orderDetails.orderResults.recommendedOrderQty) || 0,
            requiredStock: parseFloat(orderDetails.orderResults.requiredStock) || 0,
            calculationDetails: orderDetails,
            isCritical,
            needsReordering: orderDetails.orderResults.needsReordering
        };
    }).filter(item => item !== null); // Remove null items
    
    // Second phase: Filter to only items that need reordering
    const orderItems = processedItems.filter(item => item.needsReordering);
    
    // Log metrics for diagnostics
    metrics.finalIncluded = orderItems.length;
    console.log('%c [PO Generator] Order generation metrics:', 'color: #0066cc;', metrics);
    
    // Group by supplier for better organization
    const supplierGroups = {};
    orderItems.forEach(item => {
        const supplier = item.supplierName || 'Unassigned';
        if (!supplierGroups[supplier]) {
            supplierGroups[supplier] = [];
        }
        supplierGroups[supplier].push(item);
    });
    
    // Log supplier breakdown
    if (Object.keys(supplierGroups).length > 0) {
        console.log('[PO Generator] Supplier breakdown:');
        Object.entries(supplierGroups).forEach(([supplier, items]) => {
            console.log(`  - ${supplier}: ${items.length} items`);
        });
    }
    
    // Sort order items: First by supplier, then by category, then by highest cost within category
    const sortedOrderItems = orderItems.sort((a, b) => {
        // First by supplier
        const supplierA = a.supplierName || 'Unassigned';
        const supplierB = b.supplierName || 'Unassigned';
        if (supplierA !== supplierB) {
            return supplierA.localeCompare(supplierB);
        }
        
        // Then by category
        if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
        }
        
        // Finally by cost within category (highest first)
        return (b.costOfUsage || 0) - (a.costOfUsage || 0);
    });
    
    // Final check for empty results
    if (sortedOrderItems.length === 0 && metrics.belowReorderPoint > 0) {
        console.warn('[PO Generator] Warning: Items need reordering but none made it to the final list.');
        if (supplierFilter !== 'All Suppliers') {
            console.warn(`[PO Generator] Check supplier filter: "${supplierFilter}"`);
        }
    }
    
    return sortedOrderItems;
}

/**
 * Get unit cost calculation details for a specific stock item
 * @param {Object} item - The stock item to get unit cost calculation details for
 * @returns {Object} - Unit cost calculation details
 */
export function getUnitCostCalculationDetails(item) {
    if (!item) return {};
    
    // Default values
    const result = {
        currentUnitCost: item.unitCost || 0,
        method: 'Unknown',
        formula: 'No calculation data available',
        notes: 'Unit cost calculation data is not available'
    };
    
    // Format numbers for display
    const formatNumber = (num) => parseFloat(num || 0).toFixed(2);
    
    // Get the relevant values
    const openingQty = item.openingQty || 0;
    const openingValue = item.openingValue || 0;
    const purchaseQty = item.purchaseQty || 0;
    const purchaseValue = item.purchaseValue || 0;
    const closingQty = item.closingQty || 0;
    const closingValue = item.closingValue || 0;
    const usage = (openingQty + purchaseQty - closingQty) || 0;
    const totalCost = item.totalCost || 0;
    
    // Determine which method was used for the unit cost
    if (openingQty > 0 && openingValue > 0 && Math.abs(item.unitCost - openingValue / openingQty) < 0.01) {
        result.method = 'Opening Value / Opening Quantity';
        result.formula = `${formatNumber(openingValue)} ÷ ${formatNumber(openingQty)} = ${formatNumber(item.unitCost)}`;
        result.notes = 'Unit cost calculated from opening stock values.';
    }
    else if (purchaseQty > 0 && purchaseValue > 0 && Math.abs(item.unitCost - purchaseValue / purchaseQty) < 0.01) {
        result.method = 'Purchase Value / Purchase Quantity';
        result.formula = `${formatNumber(purchaseValue)} ÷ ${formatNumber(purchaseQty)} = ${formatNumber(item.unitCost)}`;
        result.notes = 'Unit cost calculated from purchase values.';
    }
    else if (usage > 0 && totalCost > 0 && Math.abs(item.unitCost - totalCost / usage) < 0.01) {
        result.method = 'Total Cost / Usage';
        result.formula = `${formatNumber(totalCost)} ÷ ${formatNumber(usage)} = ${formatNumber(item.unitCost)}`;
        result.notes = 'Unit cost calculated from total cost and usage.';
    }
    else if (item.unitCost > 0) {
        result.method = 'Direct Value';
        result.formula = `${formatNumber(item.unitCost)} (directly provided value)`;
        result.notes = 'Unit cost was directly provided in the data.'; 
    }
    
    // Add warning for suspiciously high values
    if (item.unitCost > 500) {
        result.notes += ' WARNING: Unit cost is unusually high, consider checking for errors.'; 
    }
    
    return result;
}

/**
 * Exports purchase order data to CSV format
 * @param {Array} purchaseOrderItems - The purchase order items
 * @returns {String} - CSV content
 */
export function exportPurchaseOrderToCSV(purchaseOrderItems) {
    if (!purchaseOrderItems || !purchaseOrderItems.length) {
        return 'No items to export';
    }
    
    // Define CSV headers
    const headers = [
        'Item Code',
        'Description',
        'Category',
        'Supplier',
        'Current Stock',
        'Order Quantity',
        'Unit',
        'Unit Cost',
        'Total Cost'
    ].join(',');
    
    // Generate CSV rows
    const rows = purchaseOrderItems.map(item => {
        return [
            item.itemCode,
            `"${item.description.replace(/"/g, '""')}"`, // Handle quotes in description
            `"${item.category}"`,
            `"${item.supplierName || 'Unknown'}"`,
            item.closingBalance.toFixed(2),
            item.orderQuantity.toFixed(2),
            item.unit,
            item.unitCost.toFixed(2),
            (item.orderQuantity * item.unitCost).toFixed(2)
        ].join(',');
    });
    
    // Add total row
    const totalCost = purchaseOrderItems.reduce(
        (sum, item) => sum + (item.orderQuantity * item.unitCost), 
        0
    ).toFixed(2);
    
    rows.push(`,,,,,,,"TOTAL:",${totalCost}`);
    
    // Combine headers and rows
    return `${headers}\n${rows.join('\n')}`;
}

/**
 * Calculate the volatility (coefficient of variation) of usage data
 * @param {Array} historicalData - Array of historical usage records
 * @returns {number} - Coefficient of variation (standard deviation / mean)
 */
export function calculateVolatility(historicalData) {
    if (!historicalData || !Array.isArray(historicalData) || historicalData.length < 2) {
        return 0; // Need at least 2 data points for volatility
    }
    
    try {
        // Extract usage values
        const usageValues = historicalData.map(record => record.usage || 0);
        
        // Calculate mean
        const sum = usageValues.reduce((total, value) => total + value, 0);
        const mean = sum / usageValues.length;
        
        // If mean is zero, return zero to avoid division by zero
        if (mean === 0) return 0;
        
        // Calculate variance
        const squaredDiffs = usageValues.map(value => {
            const diff = value - mean;
            return diff * diff;
        });
        
        const sumSquaredDiffs = squaredDiffs.reduce((total, value) => total + value, 0);
        const variance = sumSquaredDiffs / usageValues.length;
        
        // Calculate standard deviation
        const standardDeviation = Math.sqrt(variance);
        
        // Calculate coefficient of variation (CV)
        const coefficientOfVariation = standardDeviation / mean;
        
        return coefficientOfVariation;
    } catch (error) {
        console.error('Error calculating volatility:', error);
        return 0;
    }
}

/**
 * Format a numeric value for display
 * @param {number|string} value - The value to format
 * @returns {string} - Formatted value with 2 decimal places
 */
function formatValue(value) {
    if (value === undefined || value === null) return '0.00';
    
    // Convert to number if it's a string
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    // Check if it's a valid number
    if (isNaN(numValue)) return '0.00';
    
    // Format to 2 decimal places
    return numValue.toFixed(2);
}

/**
 * Show calculation details for a stock item
 * @param {Object} item - The stock item to show calculation details for
 * @param {Object} context - Context information (period days, days to next delivery)
 * @returns {Object} - Formatted calculation details
 */
export function getCalculationDetails(item, context) {
    console.log('Getting calculation details for item:', item);
    
    // Default context
    const ctx = {
        stockPeriodDays: 7,
        daysToNextDelivery: 7,
        ...context
    };
    
    // Check if we need to calculate criticality
    let criticalityDetails = null;
    const historicalData = item.historicalData || null;
    
    // Use the criticality score function if available
    if (typeof calculateCriticalityScore === 'function') {
        criticalityDetails = calculateCriticalityScore(item, historicalData, ctx);
    }
    
    // For testing purposes, ensure we always have criticality details
    if (!criticalityDetails) {
        console.log('Creating fallback criticality details for testing');
        criticalityDetails = {
            isCritical: true,
            isManuallyMarked: false,
            isInCriticalCategory: true,
            hasCriticalScore: true,
            criticalityScore: 75,
            criticalityReason: 'Test: Item is in a critical category',
            criticalityDetails: {
                volatility: { factor: 0.6, score: 24, maxPossible: 40 },
                stockLevel: { factor: 0.8, score: 24, maxPossible: 30 },
                supplierReliability: { factor: 0.9, score: 27, maxPossible: 30 }
            }
        };
    }
    
    // Get the calculation results
    const detailedCalc = calculateOrderDetails(item, ctx);
    
    // Extract values from our calculation result
    const usagePerDay = parseFloat(detailedCalc.stockDetails.usagePerDay) || 0;
    const daysToNextDelivery = detailedCalc.stockDetails.daysToNextDelivery;
    
    // Ensure we're using the correct closing quantity (current stock)
    const currentStock = parseFloat(item.closingQty) || 0;
    
    // Calculate projected usage (what will be used until next delivery)
    const projectedUsage = usagePerDay * daysToNextDelivery;
    
    // Calculate projected stock at delivery (this is our reorder point)
    const projectedStockAtDelivery = Math.max(0, currentStock - projectedUsage);
    
    // Return the structured details object with criticality information
    return {
        itemCode: detailedCalc.itemDetails.itemCode,
        description: detailedCalc.itemDetails.description,
        category: detailedCalc.itemDetails.category,
        usageDetails: {
            openingQty: formatValue(item.openingQty),
            purchases: formatValue(item.purchaseQty),
            closingQty: formatValue(currentStock), // Ensure we show actual current stock
            usage: formatValue(item.usage),
            periodDays: ctx.stockPeriodDays || 0,
            usagePerDay: detailedCalc.stockDetails.usagePerDay
        },
        orderCalculation: {
            daysToNextDelivery: daysToNextDelivery,
            coveringDays: detailedCalc.stockDetails.coveringDays,
            forecastPeriod: daysToNextDelivery + detailedCalc.stockDetails.coveringDays,
            currentStock: formatValue(currentStock), // Properly format the current stock
            projectedUsage: formatValue(projectedUsage), 
            projectedStockAtDelivery: formatValue(projectedStockAtDelivery),
            baseUsage: detailedCalc.calculationDetails.baseUsage,
            safetyStock: detailedCalc.calculationDetails.safetyStock,
            requiredStock: detailedCalc.orderResults.requiredStock,
            forecastedDemand: detailedCalc.calculationDetails.forecastedDemand,
            recommendedOrderQty: detailedCalc.orderResults.recommendedOrderQty,
            reorderPoint: formatValue(projectedStockAtDelivery),
            needsReordering: detailedCalc.orderResults.needsReordering
        },
        // Add criticality details if available
        criticalityDetails: criticalityDetails ? {
            isCritical: criticalityDetails.isCritical,
            reason: criticalityDetails.criticalityReason,
            score: criticalityDetails.criticalityScore,
            details: {
                isManuallyMarked: criticalityDetails.isManuallyMarked,
                isInCriticalCategory: criticalityDetails.isInCriticalCategory, 
                hasCriticalScore: criticalityDetails.hasCriticalScore,
                volatilityScore: criticalityDetails.criticalityDetails?.volatility?.score || 0,
                stockLevelScore: criticalityDetails.criticalityDetails?.stockLevel?.score || 0,
                supplierScore: criticalityDetails.criticalityDetails?.supplierReliability?.score || 0
            }
        } : null
    };
}

// These functions have been consolidated with the main purchase order generation logic
// For advanced purchase order generation, use the primary generatePurchaseOrder function with appropriate parameters
