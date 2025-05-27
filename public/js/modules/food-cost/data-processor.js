/**
 * Food Cost Module - Data Processor
 * Handles CSV parsing, data validation, and transformation
 * Version: 1.9.4-2025-04-19
 */

import { extractNumericValue } from './utilities.js';

/**
 * Parse CSV text into an array of arrays
 * @param {string} csvText - Raw CSV text
 * @returns {Array} - Parsed CSV data as array of arrays
 */
export function parseCSV(csvText) {
    if (!csvText) {
        console.error('No CSV text provided for parsing');
        return { headers: [], rows: [] };
    }
    
    try {
        // Split the CSV text into lines
        const lines = csvText.split(/\r?\n/);
        
        // Handle empty file
        if (lines.length === 0) {
            return { headers: [], rows: [] };
        }
        
        // Process headers (first line)
        const headers = processCSVLine(lines[0]);
        
        // Process data rows (remaining lines)
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() !== '') {
                const row = processCSVLine(lines[i]);
                if (row.length > 0) {
                    rows.push(row);
                }
            }
        }
        
        return { headers, rows };
    } catch (error) {
        console.error('Error parsing CSV:', error);
        return { headers: [], rows: [] };
    }
}

/**
 * Process a CSV line into an array of values
 * @param {string} line - CSV line to process
 * @returns {Array} - Array of values
 */
export function processCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        // Handle quotes
        if (char === '"') {
            // Check if this is an escaped quote within quoted field
            if (inQuotes && i < line.length - 1 && line[i + 1] === '"') {
                current += '"';
                i++; // Skip the next quote
            } else {
                inQuotes = !inQuotes;
            }
        }
        // Handle delimiter if not in quotes
        else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        }
        // Regular character
        else {
            current += char;
        }
    }
    
    // Add the last field
    result.push(current.trim());
    
    return result;
}

/**
 * Auto-detect column mappings based on header names
 * @param {Array} headers - CSV headers
 * @returns {Object} - Detected header mappings
 */
export function autoDetectHeaders(headers) {
    const mapping = {
        itemCode: -1,
        description: -1,
        category: -1,
        unit: -1,
        costCenter: -1,
        openingQty: -1,
        openingValue: -1,
        purchaseQty: -1,
        purchases: -1,
        closingQty: -1,
        closingValue: -1,
        unitCost: -1,
        supplierName: -1,
        stockLevel: -1,
        totalCost: -1,
        openingStockValue: -1,
        closingStockValue: -1,
        purchaseValue: -1
    };
    
    // Define patterns for each field type with improved matching
    const patterns = {
        // Improved item code matching to catch more variations
        itemCode: /^(item|code|sku|stock|product|item[\s_-]?code|product[\s_-]?code|sku[\s_-]?code|id|product[\s_-]?id|item[\s_-]?id|item[\s_-]?number|part[\s_-]?number|p\/n|stock[\s_-]?code)$/i,
        
        description: /\b(description|desc|name|product[\s_-]?name|item[\s_-]?name|title|product[\s_-]?description|item[\s_-]?description)\b/i,
        
        category: /\b(category|cat|group|department|type|classification|class|product[\s_-]?category|item[\s_-]?category|product[\s_-]?group)\b/i,
        
        unit: /\b(unit|uom|measure|unit[\s_-]?of[\s_-]?measure|measurement|unit[\s_-]?type)\b/i,
        
        // Enhanced cost center pattern to catch more variations
        costCenter: /^(food|cost[\s_-]?center|cost[\s_-]?centre|center|centre|department|dept|cost[\s_-]?dept|profit[\s_-]?center|profit[\s_-]?centre|location|outlet|store|kitchen|restaurant|venue)$/i,
        
        openingQty: /\b(open|opening|start|begin|beginning|initial|prev|previous|opening[\s_-]?(qty|quantity|stock|balance|inventory)|start[\s_-]?(qty|quantity))\b/i,
        
        openingValue: /\b(opening[\s_-]?(value|cost|amount|price)|initial[\s_-]?(value|cost|amount|price)|start[\s_-]?(value|amount))\b/i,
        
        // Enhanced purchase quantity pattern
        purchaseQty: /^(purchase|purchases|purchases[\s_-]?(qty|quantity)|purchase[\s_-]?(qty|quantity|amount)|purch[\s_-]?(qty|quantity)|bought|bought[\s_-]?(qty|quantity)|received[\s_-]?(qty|quantity)|delivery[\s_-]?(qty|quantity)|ordered[\s_-]?(qty|quantity)|buy[\s_-]?(qty|quantity)|additions|added[\s_-]?(qty|quantity))$/i,
        
        purchases: /\b(purchase|buy|bought|acquire|procurement|intake|received|purchases|buying|deliveries|additions|ordered|added)\b/i,
        
        closingQty: /\b(clos|closing|end|final|closing[\s_-]?(qty|quantity|stock|balance|inventory)|end[\s_-]?(qty|quantity))\b/i,
        
        closingValue: /\b(closing[\s_-]?(value|cost|amount|price)|final[\s_-]?(value|cost|amount|price)|end[\s_-]?(value|amount))\b/i,
        
        unitCost: /\b(cost|price|rate|value|unit[\s_-]?cost|unit[\s_-]?price|unit[\s_-]?rate|rate|price[\s_-]?per[\s_-]?unit|cost[\s_-]?per[\s_-]?unit)\b/i,
        
        supplierName: /\b(supplier|vendor|provider|source|distributor|wholesaler|manufacturer)\b/i,
        
        stockLevel: /\b(stock|level|quantity|qty|par|par[\s_-]?level|inventory[\s_-]?level|stock[\s_-]?level|current[\s_-]?level)\b/i,
        
        totalCost: /\b(total|total[\s_-]?cost|total[\s_-]?value|total[\s_-]?price|total[\s_-]?amount)\b/i,
        
        openingStockValue: /\b(opening[\s_-]?stock[\s_-]?value|opening[\s_-]?inventory[\s_-]?value|initial[\s_-]?stock[\s_-]?value|start[\s_-]?value)\b/i,
        
        closingStockValue: /\b(closing[\s_-]?stock[\s_-]?value|closing[\s_-]?inventory[\s_-]?value|final[\s_-]?stock[\s_-]?value|end[\s_-]?value)\b/i,
        
        purchaseValue: /\b(purchase[\s_-]?value|purchase[\s_-]?cost|buying[\s_-]?value|procurement[\s_-]?value|purchases[\s_-]?value|purchases[\s_-]?cost)\b/i
    };
    
    // Check each header against patterns
    console.log('All headers:', headers);
    headers.forEach((header, index) => {
        if (!header) return;
        const normalizedHeader = header.toLowerCase().trim();
        
        // Debug logging to see what headers we're processing
        console.log(`Detecting header: "${header}" (normalized: "${normalizedHeader}") at index ${index}`);
        
        // Exact matches for common header formats
        // Special case for header formats seen in the logs
        if (normalizedHeader === 'item' || normalizedHeader === 'item code' || normalizedHeader === 'itemcode' || 
            normalizedHeader === 'item_code' || normalizedHeader === 'code') {
            mapping.itemCode = index;
            console.log(`Exact match for item code at index ${index}`);
        }
        else if (normalizedHeader === 'purchase' || normalizedHeader === 'purchase qty' || 
                normalizedHeader === 'purchaseqty' || normalizedHeader === 'purchase_qty' || 
                normalizedHeader === 'purchased' || normalizedHeader === 'purchases') {
            mapping.purchaseQty = index;
            console.log(`Exact match for purchase qty at index ${index}`);
        }
        else if (normalizedHeader === 'food' || normalizedHeader === 'cost center' || 
                normalizedHeader === 'costcenter' || normalizedHeader === 'cost_center' || 
                normalizedHeader === 'department') {
            mapping.costCenter = index;
            console.log(`Exact match for cost center at index ${index}`);
        }
        else {
            // If no exact match, try pattern matching
            Object.keys(patterns).forEach(field => {
                if (patterns[field].test(normalizedHeader)) {
                    mapping[field] = index;
                    console.log(`Pattern match for ${field} at index ${index}`);
                }
            });
        }
    });
    
    // Fallbacks for critical fields if they weren't matched
    if (mapping.itemCode === -1 && headers.length > 0) {
        // Search for "item" in any position
        const itemIndex = headers.findIndex(h => h && h.toLowerCase().includes('item'));
        if (itemIndex !== -1) {
            console.log(`Found 'item' in header: ${headers[itemIndex]} at index ${itemIndex}`);
            mapping.itemCode = itemIndex;
        } else {
            // If we didn't find item code but have headers, use the first column as a fallback
            console.log('Using first column as fallback for item code');
            mapping.itemCode = 0;
        }
    }

    // If purchase qty wasn't matched, look for it more aggressively
    if (mapping.purchaseQty === -1) {
        const purchaseIndex = headers.findIndex(h => h && h.toLowerCase().includes('purchase'));
        if (purchaseIndex !== -1) {
            console.log(`Found 'purchase' in header: ${headers[purchaseIndex]} at index ${purchaseIndex}`);
            mapping.purchaseQty = purchaseIndex;
        }
    }

    // If cost center wasn't matched, check for 'food' or other department indicators
    if (mapping.costCenter === -1) {
        const centerIndex = headers.findIndex(h => h && (h.toLowerCase() === 'food' || h.toLowerCase().includes('dept')));
        if (centerIndex !== -1) {
            console.log(`Found cost center indicator in header: ${headers[centerIndex]} at index ${centerIndex}`);
            mapping.costCenter = centerIndex;
        }
    }
    
    return mapping;
}

/**
 * Process the parsed CSV data into stock data
 * @param {Object} parsedData - The parsed CSV data (headers and rows)
 * @param {Object} headerMapping - The mapping of headers to data fields
 * @returns {Array} - Processed stock data
 */
export function processStockData(parsedData, headerMapping) {
    // Make a copy of mapping at entry point for debugging
    console.log('processStockData ENTRY - headerMapping:', JSON.stringify(headerMapping));
    
    if (!parsedData || !parsedData.rows || parsedData.rows.length === 0) {
        // This is an expected case when the app first starts, so use a more informative message
        console.log('No data to process - waiting for CSV upload');
    }
    // Skip if missing required indices
    if (headerMapping.itemCode === undefined || headerMapping.description === undefined) {
        console.warn('Header mapping missing required fields');
        return [];
    }

    // IMPORTANT: Create a local copy of the mapping to prevent mutation of the original object
    // This ensures we don't modify the object passed by reference
    const localHeaderMapping = JSON.parse(JSON.stringify(headerMapping));

    // Log the exact mapping we'll use for processing
    console.log('Using LOCAL COPY of header mapping for processing:', JSON.stringify(localHeaderMapping));

    // Print all headers for debugging
    if (parsedData.headers && parsedData.headers.length > 0) {
        console.log('CSV headers:', parsedData.headers);
        console.log('USING LOCAL HEADER MAPPING:', localHeaderMapping);
        
        // Log mapping in user-friendly format
        console.log('===== HEADER MAPPING BEING USED =====');
        Object.keys(localHeaderMapping).forEach(field => {
            const index = localHeaderMapping[field];
            const headerValue = index >= 0 && index < parsedData.headers.length ? parsedData.headers[index] : 'N/A';
            console.log(`${field}: Column ${index} ("${headerValue}")`);
        });
        console.log('===== END HEADER MAPPING =====');
        
        // DIAGNOSTIC - Log sample data for verification
        console.log('--- SAMPLE DATA FOR VERIFICATION ---');
        // Log first 2 rows with mapped fields
        for (let i = 0; i < Math.min(parsedData.rows.length, 2); i++) {
            const row = parsedData.rows[i];
            console.log(`Row ${i} mapped values:`);
            Object.keys(localHeaderMapping).forEach(field => {
                const index = localHeaderMapping[field];
                const value = index >= 0 && index < row.length ? row[index] : 'N/A';
                console.log(`  ${field}: "${value}"`); 
            });
        }
        console.log('--- END SAMPLE DATA ---');
    }
    
    const stockData = [];
    
    // Process each row
    parsedData.rows.forEach(row => {
        // Skip empty rows
        if (!row || row.length === 0) return;
        
        // Extract data from row using LOCAL header mapping (prevents mutation of original)
        const itemCode = row[localHeaderMapping.itemCode] || '';
        const description = row[localHeaderMapping.description] || '';
        
        // Skip rows without item code or description
        if (!itemCode && !description) return;
        
        // Handle category with proper fallback
        const category = row[localHeaderMapping.category] || 'Uncategorized';
        
        // Extract cost center with proper normalization
        let costCenter = 'Unassigned';
        if (localHeaderMapping.costCenter !== undefined && localHeaderMapping.costCenter !== -1) {
            costCenter = row[localHeaderMapping.costCenter] || 'Unassigned';
            
            // Always store cost center values in a consistent format
            if (costCenter) {
                // If the value is just 'FOOD', normalize it to something more descriptive
                if (costCenter.toUpperCase() === 'FOOD') {
                    costCenter = 'Food Department';
                }
                console.log(`Extracted cost center: "${costCenter}"`);
            }
        }
        
        // Get unit or default to 'ea'
        const unit = row[localHeaderMapping.unit] || 'ea';
        
        // Log extracted fields for debugging
        console.log(`Processing row: Item Code=${itemCode}, Description=${description}, Category=${category}, Cost Center=${costCenter}`);
        
        // Get numeric values with better error handling
        const openingQty = extractNumericValue(row[localHeaderMapping.openingQty]);
        const openingValue = extractNumericValue(row[localHeaderMapping.openingValue]);
        
        // Handle purchase qty specifically since it's reported as a problem
        let purchaseQty = 0;
        if (localHeaderMapping.purchaseQty !== undefined && localHeaderMapping.purchaseQty !== -1) {
            purchaseQty = extractNumericValue(row[localHeaderMapping.purchaseQty]);
            console.log(`Extracted purchase qty: ${row[localHeaderMapping.purchaseQty]} -> ${purchaseQty}`);
        } else if (localHeaderMapping.purchases !== undefined && localHeaderMapping.purchases !== -1) {
            // Fall back to 'purchases' field if purchaseQty is not found
            purchaseQty = extractNumericValue(row[localHeaderMapping.purchases]);
            console.log(`Using purchases as fallback for purchase qty: ${purchaseQty}`);
        }
        
        const purchases = extractNumericValue(row[headerMapping.purchases]);
        const closingQty = extractNumericValue(row[headerMapping.closingQty]);
        const closingValue = extractNumericValue(row[headerMapping.closingValue]);
        
        // Additional log for debugging
        console.log(`Numeric values: Opening Qty=${openingQty}, Purchase Qty=${purchaseQty}, Closing Qty=${closingQty}`);
        
        // Calculate derived values
        const usage = openingQty + purchaseQty - closingQty;
        let calculatedUnitCost = 0;
        let unitCostCalculationMethod = 'derived'; // Always use derived calculation method
        let hasMissingUnitCost = false; // Flag for missing unit cost
        let hasNegativeUnitCost = false; // Flag for suspicious unit cost values
        
        // Calculate unit cost from opening and closing values
        // Track values for calculation
        let openingUnitCost = 0;
        let closingUnitCost = 0;
        let validCalculations = 0;
        
        // Calculate from opening values
        if (openingQty > 0 && openingValue > 0) {
            openingUnitCost = openingValue / openingQty;
            validCalculations++;
            console.log(`Opening unit cost for ${description}: ${openingUnitCost}`);
        }
        
        // Calculate from closing values
        if (closingQty > 0 && closingValue > 0) {
            closingUnitCost = closingValue / closingQty;
            validCalculations++;
            console.log(`Closing unit cost for ${description}: ${closingUnitCost}`);
        }
            
        // Average of valid calculations
        if (validCalculations > 0) {
            const totalUnitCost = openingUnitCost + closingUnitCost;
            calculatedUnitCost = totalUnitCost / validCalculations;
            console.log(`Calculated unit cost for ${description}: ${calculatedUnitCost}`);
            
            // Check for suspicious unit cost (negative or zero)
            const minReasonableUnitCost = 0.01; // Minimum reasonable unit cost
            
            if (calculatedUnitCost <= minReasonableUnitCost) {
                hasNegativeUnitCost = true;
                console.log(`Suspicious unit cost detected for ${description}: ${calculatedUnitCost}. This may need manual verification.`);
            }
        } else {
            // No valid calculations were possible
            calculatedUnitCost = 0;
            unitCostCalculationMethod = 'missing';
            hasMissingUnitCost = true;
            console.log(`Unable to calculate unit cost for ${description}. Using 0.`);
        }
        
        // Calculate cost of usage with the proper unit cost
        // Ensure usage is not negative, and cost calculation is accurate
        const adjustedUsage = Math.max(0, usage);
        const costOfUsage = adjustedUsage * calculatedUnitCost;
        
        // Check if we have opening/closing stock values provided directly
        const openingStockValue = headerMapping.openingStockValue !== -1 ? 
            extractNumericValue(row[headerMapping.openingStockValue]) : 
            openingQty * calculatedUnitCost;
            
        const closingStockValue = headerMapping.closingStockValue !== -1 ? 
            extractNumericValue(row[headerMapping.closingStockValue]) : 
            closingQty * calculatedUnitCost;
            
        const purchaseValue = headerMapping.purchaseValue !== -1 ? 
            extractNumericValue(row[headerMapping.purchaseValue]) : 
            purchaseQty * calculatedUnitCost;
        
        // Stock level is the same as closing balance if not explicitly provided
        const stockLevel = row[headerMapping.stockLevel] !== undefined 
            ? extractNumericValue(row[headerMapping.stockLevel]) 
            : closingQty;
            
        // Create stock item object - ULTRA FIXED IMPLEMENTATION
        // Log values before creating the object
        console.log('Creating stock item with these properties:');
        console.log(`- itemCode: "${itemCode}"`);
        console.log(`- description: "${description}"`);
        console.log(`- category: "${category}"`);
        console.log(`- costCenter: "${costCenter}"`);
        
        const stockItem = {
            // CRITICAL: Use the EXACT values from the row with NO substitution
            '__raw_itemCode': row[headerMapping.itemCode],
            '__raw_description': row[headerMapping.description],
            '__raw_category': row[headerMapping.category],
            '__raw_costCenter': row[headerMapping.costCenter],
            
            // Basic identification - with fallbacks only if absolutely needed
            itemCode: itemCode || `ITEM-${Math.floor(Math.random() * 1000)}`, 
            description: description || 'Unknown Item',
            category: category || 'Uncategorized',
            unit: unit || '',
            
            // CRITICAL: Ensure costCenter is properly set with multiple property names
            costCenter: costCenter || 'Main',
            'cost_center': costCenter || 'Main',  // Using quotes to ensure exact property name
            
            // Quantities and values
            openingQty,
            openingValue,
            purchaseQty,
            purchases,
            closingQty,
            closingValue,
            usage: adjustedUsage,   // Use adjusted usage to ensure it's not negative
            usagePerDay: 0,         // Will be calculated after stock period days are known
            unitCost: calculatedUnitCost,
            usageValue: costOfUsage,
            supplierName: row[headerMapping.supplierName] || '',
            stockLevel,
            reorderPoint: 0,        // Will be calculated later
            openingStockValue,
            closingStockValue,
            purchaseValue,
            
            // Status flags
            hasMissingUnitCost,
            hasNegativeUnitCost,
            unitCostCalculationMethod,
            needsAttention: hasMissingUnitCost
        };
        
        // DIAGNOSTIC: Print the entire object
        console.log('FINAL STOCK ITEM CREATED:', {
            itemCode: stockItem.itemCode,
            description: stockItem.description,
            category: stockItem.category,
            costCenter: stockItem.costCenter,
            '__raw_itemCode': stockItem.__raw_itemCode,
            '__raw_description': stockItem.__raw_description,
            '__raw_category': stockItem.__raw_category,
            '__raw_costCenter': stockItem.__raw_costCenter
        });
        
        // Force key properties to ensure filtering works
        if (!stockItem.category) stockItem.category = 'Uncategorized';
        if (!stockItem.costCenter) stockItem.costCenter = 'Main';
        
        // Adding the properties with Object.defineProperty to ensure they show up
        Object.defineProperty(stockItem, 'category', { 
            value: stockItem.category || 'Uncategorized',
            enumerable: true,
            configurable: true,
            writable: true
        });
        
        Object.defineProperty(stockItem, 'costCenter', { 
            value: stockItem.costCenter || 'Main',
            enumerable: true,
            configurable: true,
            writable: true
        });
        
        // Add enumerable property for filters
        stockItem.CATEGORY = stockItem.category;
        stockItem.COST_CENTER = stockItem.costCenter;
        
        stockData.push(stockItem);
    });
    
    return stockData;
}

/**
 * Calculate derived values for stock data based on period days and other parameters
 * @param {Array} stockData - The stock data array
 * @param {number} periodDays - Number of days in the stock period
 * @param {number} daysToNextDelivery - Days until next delivery
 * @returns {Array} - Updated stock data with calculated values
 */
export function calculateDerivedValues(stockData, periodDays, daysToNextDelivery) {
    if (!stockData || !Array.isArray(stockData)) {
        return [];
    }
    
    // Default values if not provided
    const days = periodDays || 1; // Avoid division by zero
    const nextDelivery = daysToNextDelivery || 0;
    
    return stockData.map(item => {
        // Calculate usage per day
        const usagePerDay = item.usage / days;
        
        // Calculate reorder point
        const reorderPoint = Math.max(0, item.closingQty - (usagePerDay * nextDelivery));
        
        // Return updated item with calculated values
        return {
            ...item,
            usagePerDay,
            reorderPoint
        };
    });
}

/**
 * Prepare data for category chart
 * @param {Array} data - Stock data to prepare
 * @returns {Object} - Object with labels and values arrays
 */
export function prepareCategoryData(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return { labels: [], values: [] };
    }
    
    // Group by category and sum the cost of usage
    const categoryMap = {};
    
    data.forEach(item => {
        const category = item.category || 'Uncategorized';
        if (!categoryMap[category]) {
            categoryMap[category] = 0;
        }
        categoryMap[category] += item.costOfUsage || 0;
    });
    
    // Sort categories by cost (descending)
    const sortedCategories = Object.entries(categoryMap)
        .sort((a, b) => b[1] - a[1]);
    
    // Extract labels and values
    const labels = sortedCategories.map(([category]) => category);
    const values = sortedCategories.map(([, cost]) => cost);
    
    return { labels, values };
}

/**
 * Prepare data for top items chart
 * @param {Array} data - Stock data to prepare
 * @param {number} limit - Maximum number of items to include
 * @returns {Object} - Object with labels and values arrays
 */
export function prepareTopItemsData(data, limit = 10) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return { labels: [], values: [] };
    }
    
    // Sort items by cost of usage (descending)
    const sortedItems = [...data]
        .sort((a, b) => (b.costOfUsage || 0) - (a.costOfUsage || 0))
        .slice(0, limit);
    
    // Extract labels and values
    const labels = sortedItems.map(item => item.description || item.itemCode);
    const values = sortedItems.map(item => item.costOfUsage || 0);
    
    return { labels, values };
}

/**
 * Apply filters to stock data
 * @param {Array} stockData - The full stock data array
 * @param {Object} filters - Filter criteria
 * @returns {Array} - Filtered stock data
 */
export function applyFilters(stockData, filters) {
    if (!stockData || !Array.isArray(stockData)) {
        return [];
    }
    
    // Default to all data if no filters provided
    if (!filters) {
        return [...stockData];
    }
    
    return stockData.filter(item => {
        // Apply category filter if selected categories are defined
        if (filters.selectedCategories && filters.selectedCategories.length > 0) {
            if (!filters.selectedCategories.includes(item.category)) {
                return false;
            }
        }
        
        // Apply cost center filter if selected cost centers are defined
        if (filters.selectedCostCenters && filters.selectedCostCenters.length > 0) {
            if (!filters.selectedCostCenters.includes(item.costCenter)) {
                return false;
            }
        }
        
        // Apply search filter if search term is defined
        if (filters.searchTerm && filters.searchTerm.trim() !== '') {
            const searchTerm = filters.searchTerm.toLowerCase();
            const matchesSearch = 
                (item.itemCode && item.itemCode.toLowerCase().includes(searchTerm)) ||
                (item.description && item.description.toLowerCase().includes(searchTerm)) ||
                (item.category && item.category.toLowerCase().includes(searchTerm)) ||
                (item.supplierName && item.supplierName.toLowerCase().includes(searchTerm));
            
            if (!matchesSearch) {
                return false;
            }
        }
        
        // Item passed all filters
        return true;
    });
}

/**
 * Calculate summary statistics from the stock data
 * @param {Array} stockData - The stock data array
 * @returns {Object} - Summary statistics
 */
export function calculateSummary(stockData) {
    if (!stockData || !Array.isArray(stockData) || stockData.length === 0) {
        return {
            totalOpeningValue: 0,
            totalPurchases: 0,
            totalClosingValue: 0,
            totalUsage: 0,
            totalCostOfUsage: 0,
            salesAmount: 0,
            costPercentage: 0,
            categoryData: { labels: [], values: [] },
            topItemsData: { labels: [], values: [] }
        };
    }
    
    // Calculate totals
    let totalOpeningValue = 0;
    let totalPurchases = 0;
    let totalClosingValue = 0;
    let totalUsage = 0;
    let totalCostOfUsage = 0;
    
    stockData.forEach(item => {
        totalOpeningValue += item.openingValue;
        totalPurchases += item.purchases;
        totalClosingValue += item.closingValue;
        totalUsage += item.usage;
        totalCostOfUsage += item.costOfUsage;
    });
    
    // Default sales amount (can be overridden)
    const salesAmount = totalCostOfUsage * 3; // Rough estimate based on typical markup
    
    // Calculate cost percentage
    const costPercentage = salesAmount > 0 ? (totalCostOfUsage / salesAmount) * 100 : 0;
    
    // Prepare chart data
    const categoryData = prepareCategoryData(stockData);
    const topItemsData = prepareTopItemsData(stockData);
    
    return {
        totalOpeningValue,
        totalPurchases,
        totalClosingValue,
        totalUsage,
        totalCostOfUsage,
        salesAmount,
        costPercentage,
        categoryData,
        topItemsData
    };
}

/**
 * Calculate reorder points for stock items based on usage per day and days to next delivery
 * @param {Array} stockData - The stock data array
 * @param {number} daysToNextDelivery - Days until next delivery
 * @returns {Array} - Updated stock data with reorder points
 */
export function calculateReorderPoints(stockData, daysToNextDelivery) {
    if (!stockData || !Array.isArray(stockData)) {
        return [];
    }
    
    const nextDelivery = daysToNextDelivery || 0;
    
    return stockData.map(item => {
        // Calculate reorder point
        const reorderPoint = Math.max(0, item.closingQty - (item.usagePerDay * nextDelivery));
        
        // Return updated item with calculated values
        return {
            ...item,
            reorderPoint
        };
    });
}

/**
 * Calculate usage per day for stock items
 * @param {Array} stockData - The stock data array
 * @param {number} periodDays - Number of days in the stock period
 * @returns {Array} - Updated stock data with usage per day
 */
export function calculateUsagePerDay(stockData, periodDays) {
    if (!stockData || !Array.isArray(stockData)) {
        return [];
    }
    
    // Default to 1 day to avoid division by zero
    const days = periodDays || 1;
    
    return stockData.map(item => {
        // Calculate usage per day
        const usagePerDay = item.usage / days;
        
        // Return updated item with calculated values
        return {
            ...item,
            usagePerDay
        };
    });
}

/**
 * Calculate totals for stock data
 * @param {Array} stockData - The stock data array
 * @returns {Object} - Object with calculated totals
 */
export function calculateTotals(stockData) {
    if (!stockData || !Array.isArray(stockData) || stockData.length === 0) {
        return {
            totalOpeningValue: 0,
            totalClosingValue: 0,
            totalPurchaseValue: 0,
            totalUsage: 0,
            totalCostOfUsage: 0
        };
    }
    
    // Calculate totals
    const totals = {
        totalOpeningValue: 0,
        totalClosingValue: 0,
        totalPurchaseValue: 0,
        totalUsage: 0,
        totalCostOfUsage: 0
    };
    
    stockData.forEach(item => {
        totals.totalOpeningValue += Number(item.openingValue) || 0;
        totals.totalClosingValue += Number(item.closingValue) || 0;
        totals.totalPurchaseValue += Number(item.purchaseValue) || 0;
        totals.totalUsage += Number(item.usage) || 0;
        totals.totalCostOfUsage += Number(item.costOfUsage) || 0;
    });
    
    // Round all values to 2 decimal places
    Object.keys(totals).forEach(key => {
        totals[key] = Math.round(totals[key] * 100) / 100;
    });
    
    return totals;
}

/**
 * Calculate food cost percentage based on cost of usage and sales amount
 * @param {number} totalCostOfUsage - Total cost of usage
 * @param {number} salesAmount - Sales amount
 * @returns {number} - Food cost percentage
 */
export function calculateFoodCostPercentage(totalCostOfUsage, salesAmount) {
    return salesAmount > 0 
        ? (totalCostOfUsage / salesAmount) * 100 
        : 0;
}

/**
 * Extract unique categories and cost centers from stock data
 * @param {Array} stockData - Stock data array
 * @returns {Object} - Object containing unique categories and cost centers
 */
export function extractCategoriesAndCostCenters(stockData) {
    if (!stockData || !Array.isArray(stockData)) {
        console.error('Invalid stock data provided to extractCategoriesAndCostCenters');
        return { categories: [], costCenters: [] };
    }

    // First run diagnostic to check for property format inconsistencies
    this.verifyDataConsistency(stockData, 3); // Check first 3 items

    // Extract unique categories and cost centers
    const categories = new Set();
    const costCenters = new Set();

    // Enhanced version with multiple property name support
    stockData.forEach(item => {
        // Category - try all possible naming variations
        let categoryValue = '';

        // Use raw value first if available
        if (item.__raw_category && typeof item.__raw_category === 'string' && item.__raw_category.trim() !== '') {
            categoryValue = item.__raw_category.trim();
        }
        // Try uppercase next
        else if (item.CATEGORY && typeof item.CATEGORY === 'string' && item.CATEGORY.trim() !== '') {
            categoryValue = item.CATEGORY.trim();
        }
        // Finally try camelCase
        else if (item.category && typeof item.category === 'string' && item.category.trim() !== '') {
            categoryValue = item.category.trim();
        }

        if (categoryValue !== '') {
            categories.add(categoryValue);
            // Also ensure the item has consistent properties
            item.category = categoryValue;
            item.CATEGORY = categoryValue;
        }

        // Cost center - try all possible naming variations
        let costCenterValue = '';

        // Use raw value first if available
        if (item.__raw_costCenter && typeof item.__raw_costCenter === 'string' && item.__raw_costCenter.trim() !== '') {
            costCenterValue = item.__raw_costCenter.trim();
        }
        // Try uppercase
        else if (item.COST_CENTER && typeof item.COST_CENTER === 'string' && item.COST_CENTER.trim() !== '') {
            costCenterValue = item.COST_CENTER.trim();
        }
        // Try camelCase
        else if (item.costCenter && typeof item.costCenter === 'string' && item.costCenter.trim() !== '') {
            costCenterValue = item.costCenter.trim();
        }
        // Try snake_case
        else if (item.cost_center && typeof item.cost_center === 'string' && item.cost_center.trim() !== '') {
            costCenterValue = item.cost_center.trim();
        }

        if (costCenterValue !== '') {
            costCenters.add(costCenterValue);
            // Also ensure the item has consistent properties
            item.costCenter = costCenterValue;
            item.cost_center = costCenterValue;
            item.COST_CENTER = costCenterValue;
        }
    });

    return {
        categories: [...categories].sort(),
        costCenters: [...costCenters].sort()
    };
}

/**
 * Extract unique supplier names from stock data
 * @param {Array} stockData - Stock data array
 * @returns {Array} - Array of unique supplier names
 */
export function extractSuppliers(stockData) {
    if (!stockData || !Array.isArray(stockData) || stockData.length === 0) {
        return [];
    }

    // Extract unique supplier names
    const suppliers = new Set();
    stockData.forEach(item => {
        if (item.supplierName && item.supplierName.trim()) {
            suppliers.add(item.supplierName.trim());
        }
    });

    // Convert set to sorted array
    return Array.from(suppliers).sort();
}

/**
 * Filter stock data based on selected categories, cost centers, search term, and low stock flag
 * @param {Array} stockData - Full stock data array
 * @param {Object} filters - Filter criteria
 * @param {Array} filters.categories - Selected categories
 * @param {Array} filters.costCenters - Selected cost centers
 * @param {string} filters.searchTerm - Search term
 * @param {boolean} filters.lowStockOnly - Whether to show only low stock items
 * @returns {Array} - Filtered stock data
 */
export function filterStockData(stockData, filters) {
    if (!stockData || !Array.isArray(stockData)) {
        console.error('Invalid stock data provided to filterStockData');
        return [];
    }

    if (!filters) {
        console.warn('No filters provided to filterStockData, returning all data');
        return [...stockData];
    }

    // Verify data consistency before filtering
    this.verifyDataConsistency(stockData, 0); // No sample logging here

    const { categories = [], costCenters = [], searchTerm = '', lowStockOnly = false } = filters;

    return stockData.filter(item => {
        // Category filter - check all possible property locations
        let itemCategory = '';
        if (item.category) itemCategory = item.category;
        else if (item.CATEGORY) itemCategory = item.CATEGORY;
        else if (item.__raw_category) itemCategory = item.__raw_category;

        if (categories.length > 0 && !categories.includes(itemCategory)) {
            return false;
        }

        // Cost center filter - check all possible property locations
        let itemCostCenter = '';
        if (item.costCenter) itemCostCenter = item.costCenter;
        else if (item.cost_center) itemCostCenter = item.cost_center;
        else if (item.COST_CENTER) itemCostCenter = item.COST_CENTER;
        else if (item.__raw_costCenter) itemCostCenter = item.__raw_costCenter;

        if (costCenters.length > 0 && !costCenters.includes(itemCostCenter)) {
            return false;
        }

        // Search filter - more robust search handling
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            // Include all possible property names in search
            const itemSearchText = [
                item.itemCode, 
                item.__raw_itemCode,
                item.description, 
                item.__raw_description,
                itemCategory, 
                itemCostCenter
            ].filter(val => val).join(' ').toLowerCase();

            if (!itemSearchText.includes(searchLower)) {
                return false;
            }
        }

        // Low stock filter
        if (lowStockOnly && !item.belowReorderPoint) {
            return false;
        }

        return true;
    });
}

/**
 * Verify data consistency across stock items and harmonize property formats
 * @param {Array} stockData - Stock data array to verify
 * @param {Number} sampleSize - Number of items to include in diagnostic logs (0 for no logging) 
 * @returns {Object} - Issues found during verification
 */
export function verifyDataConsistency(stockData, sampleSize = 0) {
    if (!stockData || !Array.isArray(stockData) || stockData.length === 0) {
        console.error('Invalid or empty stock data provided to verifyDataConsistency');
        return { propertyIssues: 0, dataIssues: 0 };
    }

    console.log(`Verifying data consistency for ${stockData.length} items...`);

    const issues = {
        propertyIssues: 0,
        dataIssues: 0
    };

    // Expected critical properties and their type
    const criticalProps = {
        itemCode: 'string',
        description: 'string',
        category: 'string',
        costCenter: 'string',
        openingQty: 'number',
        openingValue: 'number',
        closingQty: 'number',
        closingValue: 'number'
    };

    // Log sample items for diagnostic purposes
    if (sampleSize > 0) {
        console.log('--- DATA CONSISTENCY SAMPLE DIAGNOSTICS ---');
        for (let i = 0; i < Math.min(stockData.length, sampleSize); i++) {
            const item = stockData[i];
            console.log(`Sample Item ${i}:`, {
                // Core properties
                itemCode: item.itemCode,
                description: item.description,
                category: item.category,
                costCenter: item.costCenter,

                // Alternative formats
                CATEGORY: item.CATEGORY,
                COST_CENTER: item.COST_CENTER,
                cost_center: item.cost_center,

                // Raw versions
                __raw_itemCode: item.__raw_itemCode,
                __raw_description: item.__raw_description,
                __raw_category: item.__raw_category,
                __raw_costCenter: item.__raw_costCenter,

                // Property keys list
                propertyKeys: Object.keys(item)
            });
        }
        console.log('--- END SAMPLE DIAGNOSTICS ---');
    }

    // Verify and harmonize each item
    stockData.forEach((item, index) => {
        // Check critical properties
        Object.entries(criticalProps).forEach(([propName, expectedType]) => {
            // Check if property exists in any format
            const camelCase = item[propName];
            const upperCase = item[propName.toUpperCase()];
            const snakeCase = propName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            const snakeCaseValue = item[snakeCase];
            const rawValue = item[`__raw_${propName}`];

            // No value found in any format
            if (camelCase === undefined && upperCase === undefined && 
                snakeCaseValue === undefined && rawValue === undefined) {
                issues.propertyIssues++;

                // Try to repair from raw data if available
                if (rawValue !== undefined) {
                    item[propName] = expectedType === 'number' ? parseFloat(rawValue) || 0 : rawValue;
                } else {
                    // Set default value
                    item[propName] = expectedType === 'number' ? 0 : '';
                }
            }

            // Ensure consistent property formats for filtering
            if (propName === 'category') {
                const bestValue = rawValue || upperCase || camelCase || '';
                if (bestValue) {
                    item.category = bestValue;
                    item.CATEGORY = bestValue;
                }
            } else if (propName === 'costCenter') {
                const bestValue = rawValue || upperCase || camelCase || snakeCaseValue || '';
                if (bestValue) {
                    item.costCenter = bestValue;
                    item.cost_center = bestValue;
                    item.COST_CENTER = bestValue; 
                }
            }

            // Type checking and correction
            if (expectedType === 'number' && typeof item[propName] !== 'number') {
                issues.dataIssues++;
                item[propName] = parseFloat(item[propName]) || 0;
            }
        });
    });

    console.log(`Data consistency check complete. Found ${issues.propertyIssues} property issues and ${issues.dataIssues} data type issues.`);
    return issues;
}
