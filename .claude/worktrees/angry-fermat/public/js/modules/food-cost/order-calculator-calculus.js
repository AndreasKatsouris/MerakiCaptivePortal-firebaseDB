/**
 * Food Cost Module - Calculus-Based Order Calculator
 * Advanced inventory optimization using calculus principles
 * Version: 1.0.0
 */

import { calculateCriticalityScore } from './order-calculator.js';

/**
 * Calculate Economic Order Quantity (EOQ) using calculus optimization
 * Minimizes total cost = ordering cost + holding cost
 * @param {number} annualDemand - Annual demand in units
 * @param {number} orderingCost - Fixed cost per order
 * @param {number} holdingCostPerUnit - Annual holding cost per unit
 * @returns {number} - Optimal order quantity
 */
function calculateEOQ(annualDemand, orderingCost, holdingCostPerUnit) {
    if (annualDemand <= 0 || orderingCost <= 0 || holdingCostPerUnit <= 0) {
        return 0;
    }
    
    // EOQ = √(2DS/H)
    // where D = annual demand, S = ordering cost, H = holding cost per unit
    return Math.sqrt((2 * annualDemand * orderingCost) / holdingCostPerUnit);
}

/**
 * Analyze demand trend using derivatives
 * @param {Array} historicalData - Array of historical usage data points
 * @returns {Object} - Demand analysis with velocity and acceleration
 */
function analyzeDemandTrend(historicalData) {
    if (!historicalData || historicalData.length < 3) {
        return {
            velocity: 0,
            acceleration: 0,
            trend: 'stable',
            confidence: 0
        };
    }
    
    // Sort by date
    const sortedData = [...historicalData].sort((a, b) => a.date - b.date);
    
    // Calculate first derivative (velocity of demand)
    const velocities = [];
    for (let i = 1; i < sortedData.length; i++) {
        const deltaUsage = sortedData[i].usagePerDay - sortedData[i-1].usagePerDay;
        const deltaDays = (sortedData[i].date - sortedData[i-1].date) / (1000 * 60 * 60 * 24);
        
        if (deltaDays > 0) {
            velocities.push(deltaUsage / deltaDays);
        }
    }
    
    // Calculate second derivative (acceleration of demand)
    const accelerations = [];
    for (let i = 1; i < velocities.length; i++) {
        accelerations.push(velocities[i] - velocities[i-1]);
    }
    
    // Get recent values for current state
    const currentVelocity = velocities.length > 0 ? velocities[velocities.length - 1] : 0;
    const currentAcceleration = accelerations.length > 0 ? accelerations[accelerations.length - 1] : 0;
    
    // Determine trend
    let trend = 'stable';
    if (Math.abs(currentVelocity) > 0.1) {
        trend = currentVelocity > 0 ? 'increasing' : 'decreasing';
    }
    if (Math.abs(currentAcceleration) > 0.05) {
        trend = currentAcceleration > 0 ? 'accelerating' : 'decelerating';
    }
    
    // Calculate confidence based on data consistency
    const velocityStdDev = calculateStandardDeviation(velocities);
    const confidence = Math.max(0, Math.min(1, 1 - (velocityStdDev / (Math.abs(currentVelocity) + 0.1))));
    
    return {
        velocity: currentVelocity,
        acceleration: currentAcceleration,
        trend: trend,
        confidence: confidence
    };
}

/**
 * Calculate optimal safety stock using calculus of variations
 * @param {number} demandMean - Average daily demand
 * @param {number} demandStdDev - Standard deviation of demand
 * @param {Object} leadTime - Lead time object with mean and stdDev
 * @param {number} serviceLevel - Desired service level (0-1)
 * @returns {number} - Optimal safety stock quantity
 */
function calculateDynamicSafetyStock(demandMean, demandStdDev, leadTime, serviceLevel) {
    // Get Z-score for desired service level
    const zScore = getZScore(serviceLevel);
    
    // Safety stock formula considering both demand and lead time variability
    // SS = z * √(σ_d² * L + μ_d² * σ_L²)
    const demandVariance = Math.pow(demandStdDev, 2) * leadTime.mean;
    const leadTimeVariance = Math.pow(demandMean, 2) * Math.pow(leadTime.stdDev || 0, 2);
    
    return zScore * Math.sqrt(demandVariance + leadTimeVariance);
}

/**
 * Calculate Z-score for a given service level
 * @param {number} serviceLevel - Service level (0-1)
 * @returns {number} - Z-score
 */
function getZScore(serviceLevel) {
    // Approximate inverse normal distribution
    // Using a simplified table for common service levels
    const zTable = {
        0.50: 0.00,
        0.75: 0.67,
        0.80: 0.84,
        0.85: 1.04,
        0.90: 1.28,
        0.95: 1.65,
        0.98: 2.05,
        0.99: 2.33
    };
    
    // Find closest service level in table
    const levels = Object.keys(zTable).map(Number).sort((a, b) => a - b);
    let closestLevel = levels[0];
    
    for (const level of levels) {
        if (Math.abs(level - serviceLevel) < Math.abs(closestLevel - serviceLevel)) {
            closestLevel = level;
        }
    }
    
    return zTable[closestLevel];
}

/**
 * Calculate optimal order timing for perishable items
 * @param {Object} item - Item with shelf life information
 * @param {number} dailyUsage - Daily usage rate
 * @param {number} holdingCostRate - Holding cost as percentage of item value
 * @returns {Object} - Optimal order timing and quantity
 */
function optimizePerishableOrder(item, dailyUsage, holdingCostRate) {
    if (!item.shelfLife || item.shelfLife <= 0) {
        return { maxOrderDays: Infinity, adjustmentFactor: 1 };
    }
    
    // Decay rate (λ) = 1 / shelf life
    const decayRate = 1 / item.shelfLife;
    
    // Daily holding cost
    const dailyHoldingCost = item.unitCost * holdingCostRate / 365;
    
    // Optimal holding time before quality degrades too much
    // We want to use items when quality is still above 70%
    const minQuality = 0.7;
    const maxHoldingDays = -Math.log(minQuality) / decayRate;
    
    // Maximum order should not exceed what can be used within quality window
    const maxOrderDays = Math.min(maxHoldingDays, item.shelfLife * 0.8);
    
    // Adjustment factor for order quantity
    const adjustmentFactor = Math.min(1, maxOrderDays / (dailyUsage > 0 ? maxOrderDays : 1));
    
    return {
        maxOrderDays: maxOrderDays,
        adjustmentFactor: adjustmentFactor,
        qualityAtExpiry: Math.exp(-decayRate * maxOrderDays)
    };
}

/**
 * Multi-variable optimization for items with interdependencies
 * @param {Array} items - Array of items that might have volume discounts or combined shipping
 * @param {Object} constraints - Budget, storage, and other constraints
 * @returns {Object} - Optimized order quantities for all items
 */
function optimizeMultiItemOrder(items, constraints) {
    const orderQuantities = {};
    
    // Group items by supplier for potential volume discounts
    const supplierGroups = {};
    items.forEach(item => {
        const supplier = item.supplierName || 'Unknown';
        if (!supplierGroups[supplier]) {
            supplierGroups[supplier] = [];
        }
        supplierGroups[supplier].push(item);
    });
    
    // Optimize each supplier group
    Object.entries(supplierGroups).forEach(([supplier, supplierItems]) => {
        // Calculate total value for volume discount thresholds
        let totalValue = 0;
        const baseQuantities = {};
        
        supplierItems.forEach(item => {
            // Start with EOQ as base
            const annualDemand = item.usagePerDay * 365;
            const orderingCost = constraints.orderingCost || 50;
            const holdingCost = item.unitCost * (constraints.holdingCostRate || 0.2);
            
            const eoq = calculateEOQ(annualDemand, orderingCost, holdingCost);
            baseQuantities[item.itemCode] = eoq;
            totalValue += eoq * item.unitCost;
        });
        
        // Apply volume discount optimization if applicable
        const discountThresholds = constraints.volumeDiscounts || [
            { minValue: 1000, discount: 0.02 },
            { minValue: 2500, discount: 0.05 },
            { minValue: 5000, discount: 0.08 }
        ];
        
        // Find best discount tier
        let bestDiscount = 0;
        let targetValue = totalValue;
        
        for (const threshold of discountThresholds) {
            if (totalValue < threshold.minValue) {
                // Calculate if it's worth ordering more for the discount
                const additionalNeeded = threshold.minValue - totalValue;
                const discountSavings = threshold.minValue * threshold.discount;
                const additionalHoldingCost = additionalNeeded * (constraints.holdingCostRate || 0.2) / 2;
                
                if (discountSavings > additionalHoldingCost) {
                    bestDiscount = threshold.discount;
                    targetValue = threshold.minValue;
                }
            } else {
                bestDiscount = threshold.discount;
            }
        }
        
        // Adjust quantities to reach target value if beneficial
        const scaleFactor = targetValue / totalValue;
        
        supplierItems.forEach(item => {
            let quantity = baseQuantities[item.itemCode] * scaleFactor;
            
            // Apply perishability constraints
            if (item.shelfLife) {
                const perishableOptimization = optimizePerishableOrder(
                    item,
                    item.usagePerDay,
                    constraints.holdingCostRate || 0.2
                );
                quantity = Math.min(quantity, item.usagePerDay * perishableOptimization.maxOrderDays);
            }
            
            // Apply storage constraints
            if (constraints.maxStorage && item.storageVolume) {
                const maxByStorage = constraints.maxStorage / item.storageVolume;
                quantity = Math.min(quantity, maxByStorage);
            }
            
            orderQuantities[item.itemCode] = {
                quantity: Math.ceil(quantity),
                discount: bestDiscount,
                supplier: supplier
            };
        });
    });
    
    return orderQuantities;
}

/**
 * Calculate standard deviation
 * @param {Array} values - Array of numbers
 * @returns {number} - Standard deviation
 */
function calculateStandardDeviation(values) {
    if (!values || values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    
    return Math.sqrt(variance);
}

/**
 * Main calculus-based order calculation function
 * @param {Object} item - Stock item to calculate order for
 * @param {Object} historicalSummary - Historical usage data
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Order calculation results with calculus optimization
 */
export function calculateCalculusOrderDetails(item, historicalSummary, params = {}) {
    // Default parameters
    const context = {
        orderingCost: 50, // Default cost per order
        holdingCostRate: 0.2, // 20% annual holding cost
        serviceLevel: 0.95, // 95% service level
        daysToNextDelivery: params.daysToNextDelivery || 7,
        coveringDays: params.coveringDays || 7,
        leadTimeDays: params.leadTimeDays || params.daysToNextDelivery || 7,
        leadTimeStdDev: 1, // 1 day standard deviation in lead time
        ...params
    };
    
    // Get current stock level
    const currentStock = parseFloat(item.closingQty) || 0;
    
    // Analyze demand using calculus
    const demandAnalysis = analyzeDemandTrend(historicalSummary.raw || []);
    
    // Calculate base usage rate
    let baseUsageRate = parseFloat(item.usagePerDay) || 0;
    
    // Adjust for trend using derivatives
    if (demandAnalysis.confidence > 0.5) {
        // Apply velocity adjustment
        baseUsageRate += demandAnalysis.velocity * context.leadTimeDays;
        
        // Apply acceleration adjustment for longer-term planning
        if (Math.abs(demandAnalysis.acceleration) > 0.01) {
            baseUsageRate += 0.5 * demandAnalysis.acceleration * Math.pow(context.leadTimeDays, 2);
        }
    }
    
    // Ensure non-negative usage rate
    baseUsageRate = Math.max(0, baseUsageRate);
    
    // Calculate EOQ
    const annualDemand = baseUsageRate * 365;
    const holdingCostPerUnit = item.unitCost * context.holdingCostRate;
    const eoq = calculateEOQ(annualDemand, context.orderingCost, holdingCostPerUnit);
    
    // Calculate dynamic safety stock
    const demandStdDev = historicalSummary.stdDevUsage || baseUsageRate * 0.2;
    const leadTime = {
        mean: context.leadTimeDays,
        stdDev: context.leadTimeStdDev
    };
    const safetyStock = calculateDynamicSafetyStock(
        baseUsageRate,
        demandStdDev,
        leadTime,
        context.serviceLevel
    );
    
    // Calculate reorder point
    const reorderPoint = (baseUsageRate * context.leadTimeDays) + safetyStock;
    
    // Determine order quantity
    let orderQuantity = eoq;
    
    // Adjust for perishability
    if (item.shelfLife) {
        const perishableOpt = optimizePerishableOrder(item, baseUsageRate, context.holdingCostRate);
        orderQuantity = Math.min(orderQuantity, baseUsageRate * perishableOpt.maxOrderDays);
    }
    
    // Adjust for covering period
    const minRequired = baseUsageRate * (context.daysToNextDelivery + context.coveringDays);
    orderQuantity = Math.max(orderQuantity, minRequired - currentStock + safetyStock);
    
    // Check if we need to reorder
    const projectedStock = currentStock - (baseUsageRate * context.daysToNextDelivery);
    const needsReordering = projectedStock <= reorderPoint || orderQuantity > 0;
    
    // Round up order quantity
    const finalOrderQty = needsReordering ? Math.ceil(orderQuantity) : 0;
    
    return {
        orderResults: {
            needsReordering: needsReordering,
            recommendedOrderQty: finalOrderQty,
            requiredStock: minRequired + safetyStock
        },
        calculationDetails: {
            currentStock: currentStock,
            usageRate: baseUsageRate,
            eoq: Math.round(eoq),
            reorderPoint: Math.round(reorderPoint),
            safetyStock: Math.round(safetyStock),
            projectedStock: projectedStock,
            demandTrend: demandAnalysis
        },
        calculusInsights: {
            demandVelocity: demandAnalysis.velocity,
            demandAcceleration: demandAnalysis.acceleration,
            trendDirection: demandAnalysis.trend,
            confidenceLevel: demandAnalysis.confidence,
            optimalOrderCycle: eoq / baseUsageRate,
            annualOrderingCost: (annualDemand / eoq) * context.orderingCost,
            annualHoldingCost: (eoq / 2) * holdingCostPerUnit,
            totalAnnualCost: ((annualDemand / eoq) * context.orderingCost) + ((eoq / 2) * holdingCostPerUnit)
        }
    };
}

/**
 * Generate calculus-optimized purchase order
 * @param {Array} stockData - Current stock data
 * @param {string} storeIdentifier - Store/location identifier
 * @param {string} supplierFilter - Supplier filter
 * @param {Object} params - Order parameters
 * @returns {Promise<Array>} - Optimized purchase order items
 */
export async function generateCalculusPurchaseOrder(stockData, storeIdentifier, supplierFilter = 'All Suppliers', params = {}) {
    console.log('%c [Calculus PO Generator] Starting optimization with calculus', 'color: #00cc66; font-weight: bold;');
    
    // Import historical service dynamically
    const HistoricalUsageService = window.HistoricalUsageService;
    
    if (!HistoricalUsageService) {
        console.warn('[Calculus PO Generator] Historical service not available, falling back to basic calculation');
        return [];
    }
    
    // Get historical data
    const historicalSummaries = await HistoricalUsageService.generateHistoricalSummaries(
        storeIdentifier,
        stockData,
        { lookbackDays: params.lookbackDays || 30 }
    );
    
    // Filter items by supplier
    const filteredItems = stockData.filter(item => {
        if (supplierFilter === 'All Suppliers') return true;
        return item.supplierName === supplierFilter;
    });
    
    // Process each item with calculus optimization
    const orderItems = [];
    
    for (const item of filteredItems) {
        const historicalSummary = historicalSummaries[item.itemCode] || {
            avgDailyUsage: item.usagePerDay || 0,
            stdDevUsage: (item.usagePerDay || 0) * 0.2,
            dataPoints: 0,
            raw: []
        };
        
        // Calculate criticality
        const criticalityResult = calculateCriticalityScore(item, historicalSummary, params);
        
        // Calculate order details using calculus
        const orderDetails = calculateCalculusOrderDetails(
            { ...item, isCritical: criticalityResult.isCritical },
            historicalSummary,
            params
        );
        
        // Only include items that need reordering
        if (orderDetails.orderResults.needsReordering) {
            orderItems.push({
                ...item,
                orderQuantity: orderDetails.orderResults.recommendedOrderQty,
                requiredStock: orderDetails.orderResults.requiredStock,
                calculationDetails: orderDetails.calculationDetails,
                isCritical: criticalityResult.isCritical,
                criticalityScore: criticalityResult.criticalityScore,
                criticalityReason: criticalityResult.criticalityReason,
                calculusInsights: orderDetails.calculusInsights,
                historicalInsights: {
                    avgDailyUsage: historicalSummary.avgDailyUsage,
                    stdDevUsage: historicalSummary.stdDevUsage,
                    volatility: historicalSummary.volatility || 0,
                    trend: historicalSummary.trend || { direction: 'stable' },
                    dataPoints: historicalSummary.dataPoints
                },
                calculationType: 'calculus'
            });
        }
    }
    
    // Multi-item optimization
    if (orderItems.length > 1 && params.enableMultiItemOptimization) {
        const optimizedQuantities = optimizeMultiItemOrder(orderItems, {
            orderingCost: params.orderingCost || 50,
            holdingCostRate: params.holdingCostRate || 0.2,
            maxStorage: params.maxStorage,
            volumeDiscounts: params.volumeDiscounts
        });
        
        // Apply optimized quantities
        orderItems.forEach(item => {
            if (optimizedQuantities[item.itemCode]) {
                item.orderQuantity = optimizedQuantities[item.itemCode].quantity;
                item.appliedDiscount = optimizedQuantities[item.itemCode].discount;
            }
        });
    }
    
    // Sort by criticality and value
    orderItems.sort((a, b) => {
        if (a.isCritical !== b.isCritical) return b.isCritical ? 1 : -1;
        return (b.orderQuantity * b.unitCost) - (a.orderQuantity * a.unitCost);
    });
    
    console.log(`[Calculus PO Generator] Generated order for ${orderItems.length} items using calculus optimization`);
    
    return orderItems;
}

/**
 * Export calculus-optimized purchase order to CSV
 * @param {Array} purchaseOrderItems - Purchase order items
 * @returns {string} - CSV content
 */
export function exportCalculusPurchaseOrderToCSV(purchaseOrderItems) {
    const headers = [
        'Item Code',
        'Description',
        'Supplier',
        'Category',
        'Current Stock',
        'Usage/Day',
        'EOQ',
        'Safety Stock',
        'Reorder Point',
        'Order Quantity',
        'Unit Cost',
        'Total Cost',
        'Demand Trend',
        'Annual Cost Savings',
        'Critical',
        'Notes'
    ];
    
    const rows = purchaseOrderItems.map(item => {
        const insights = item.calculusInsights || {};
        const details = item.calculationDetails || {};
        
        // Calculate potential savings vs non-optimized ordering
        const nonOptimizedCost = item.usagePerDay * 365 * item.unitCost * 0.25; // Rough estimate
        const optimizedCost = insights.totalAnnualCost || 0;
        const savings = Math.max(0, nonOptimizedCost - optimizedCost);
        
        return [
            item.itemCode || '',
            item.description || '',
            item.supplierName || '',
            item.category || '',
            details.currentStock || '0',
            (details.usageRate || 0).toFixed(2),
            details.eoq || '0',
            details.safetyStock || '0',
            details.reorderPoint || '0',
            item.orderQuantity || '0',
            (item.unitCost || 0).toFixed(2),
            ((item.orderQuantity || 0) * (item.unitCost || 0)).toFixed(2),
            insights.trendDirection || 'stable',
            savings.toFixed(2),
            item.isCritical ? 'Yes' : 'No',
            item.appliedDiscount ? `${(item.appliedDiscount * 100).toFixed(0)}% discount applied` : ''
        ];
    });
    
    // Combine headers and rows
    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => {
            // Escape cells containing commas or quotes
            const cellStr = String(cell);
            if (cellStr.includes(',') || cellStr.includes('"')) {
                return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
        }).join(','))
        .join('\n');
    
    return csvContent;
}

export default {
    calculateCalculusOrderDetails,
    generateCalculusPurchaseOrder,
    exportCalculusPurchaseOrderToCSV,
    calculateEOQ,
    analyzeDemandTrend,
    calculateDynamicSafetyStock,
    optimizePerishableOrder,
    optimizeMultiItemOrder
}; 