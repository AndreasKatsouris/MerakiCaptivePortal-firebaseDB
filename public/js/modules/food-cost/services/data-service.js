/**
 * Food Cost Module - Data Service
 * Handles data processing, parsing, and transformation
 */

import { 
    processStockData, 
    autoDetectHeaders, 
    calculateDerivedValues,
    parseCSV
} from '../data-processor.js';

import { getCalculationDetails } from '../components/analytics/calculation-utils.js';

/**
 * Parse CSV data into rows and columns
 * @param {string} csvContent - Raw CSV content
 * @returns {Object} - Parsed headers and data
 */
export function parseCSVData(csvContent) {
    if (!csvContent) {
        console.error('No CSV content provided for parsing');
        return {
            headers: [],
            data: { headers: [], rows: [] }
        };
    }
    
    try {
        // Use the parseCSV function from data-processor.js directly
        // This ensures consistent data format between original and refactored code
        const parsedData = parseCSV(csvContent);
        
        return {
            headers: parsedData.headers,
            data: parsedData // Return the whole object with headers and rows
        };
    } catch (error) {
        console.error('Error parsing CSV data:', error);
        return {
            headers: [],
            data: { headers: [], rows: [] }
        };
    }
}

/**
 * Process data with header mapping
 * @param {Array} parsedData - Parsed CSV data
 * @param {Object} headerMapping - Mapping of CSV headers to data fields
 * @param {Object} params - Additional processing parameters
 * @returns {Array} - Processed stock data
 */
export function processDataWithMapping(parsedData, headerMapping, params = {}) {
    try {
        console.log('DATA SERVICE - processDataWithMapping START', { 
            dataRows: parsedData?.rows?.length || 0,
            params
        });
        
        // IMPORTANT: We receive a COPY of the mapping from the app component
        // but need to ensure we don't modify it further during processing
        const mappingForProcessor = JSON.parse(JSON.stringify(headerMapping));
        console.log('DATA SERVICE - Using mapping:', JSON.stringify(mappingForProcessor));
        
        // EXPLICIT DEBUG: Check item code mapping before processing
        if (parsedData.headers && parsedData.headers.length > 0) {
            const itemCodeCol = mappingForProcessor.itemCode;
            const headerName = itemCodeCol >= 0 && itemCodeCol < parsedData.headers.length 
                ? parsedData.headers[itemCodeCol] 
                : 'N/A';
            console.log(`🔑 DATA SERVICE - ITEM CODE mapped to column ${itemCodeCol} ("${headerName}")`);
        }
        
        // Save original mapping for comparison
        const originalMapping = JSON.parse(JSON.stringify(headerMapping));
        
        // Process stock data with the data processor - pass our COPY to avoid mutations
        const stockData = processStockData(parsedData, mappingForProcessor);
        
        // Check if mapping was modified during processing
        const currentMapping = JSON.stringify(headerMapping);
        if (JSON.stringify(originalMapping) !== currentMapping) {
            console.warn('⚠️ MAPPING CHANGED in data-service.js!');
            console.log('BEFORE calling processStockData:', JSON.stringify(originalMapping));
            console.log('AFTER calling processStockData:', currentMapping);
        }
        
        if (!stockData || stockData.length === 0) {
            console.log('No stock data processed - this is normal before data is uploaded');
            return [];
        }
        
        // Calculate derived values
        const { stockPeriodDays = 7, daysToNextDelivery = 5 } = params;
        console.log(`Calculating derived values with: stockPeriodDays=${stockPeriodDays}, daysToNextDelivery=${daysToNextDelivery}`);
        
        // Apply usage per day calculation first
        let processedData = stockData;
        
        // Calculate usage per day
        if (stockPeriodDays > 0) {
            processedData = processedData.map(item => {
                const usage = (item.openingQty || 0) + (item.purchaseQty || 0) - (item.closingQty || 0);
                const usagePerDay = usage / stockPeriodDays;
                return {
                    ...item,
                    usage,
                    usagePerDay,
                    stockPeriodDays
                };
            });
        }
        
        // Calculate reorder points
        if (daysToNextDelivery > 0) {
            processedData = processedData.map(item => {
                const reorderPoint = (item.closingQty || 0) - ((item.usagePerDay || 0) * daysToNextDelivery);
                const belowReorderPoint = (item.closingQty || 0) <= reorderPoint;
                return {
                    ...item,
                    reorderPoint,
                    belowReorderPoint,
                    daysToNextDelivery
                };
            });
        }
        
        console.log(`Processed ${processedData.length} items successfully`);
        return processedData;
    } catch (error) {
        console.error('Error processing data with header mapping:', error);
        return [];
    }
}

/**
 * Auto-detect and apply header mapping from CSV headers
 * @param {Array} headers - CSV header row
 * @returns {Object} - Mapped headers
 */
export function detectAndMapHeaders(headers) {
    return autoDetectHeaders(headers);
}

/**
 * Extract categories and cost centers from stock data
 * @param {Array} stockData - Processed stock data
 * @returns {Object} - Categories and cost centers
 */
export function extractCategoriesAndCostCenters(stockData) {
    if (!stockData || !Array.isArray(stockData)) {
        return {
            categories: [],
            costCenters: []
        };
    }
    
    // Extract unique categories
    const categories = [...new Set(
        stockData
            .filter(item => item.category)
            .map(item => item.category)
    )].sort();
    
    // Extract unique cost centers
    const costCenters = [...new Set(
        stockData
            .filter(item => item.costCenter)
            .map(item => item.costCenter)
    )].sort();
    
    return {
        categories,
        costCenters
    };
}

/**
 * Filter stock data based on specified filters
 * @param {Array} stockData - Full stock data array
 * @param {Object} filters - Filter criteria
 * @returns {Array} - Filtered stock data
 */
export function filterStockData(stockData, filters) {
    if (!stockData || !Array.isArray(stockData)) {
        return [];
    }
    
    const { 
        categoryFilter = 'All Categories',
        costCenterFilter = 'All Cost Centers',
        searchText = '',
        lowStockFilter = false
    } = filters || {};
    
    return stockData.filter(item => {
        // Category filter
        const categoryMatch = categoryFilter === 'All Categories' || 
                             item.category === categoryFilter;
        
        // Cost center filter
        const costCenterMatch = costCenterFilter === 'All Cost Centers' || 
                               item.costCenter === costCenterFilter;
        
        // Search text filter
        const searchMatch = !searchText || 
                          (item.description && item.description.toLowerCase().includes(searchText.toLowerCase())) ||
                          (item.itemCode && item.itemCode.toLowerCase().includes(searchText.toLowerCase()));
        
        // Low stock filter
        const lowStockMatch = !lowStockFilter || 
                            (item.reorderPoint !== undefined && 
                             item.closingBalance !== undefined && 
                             item.closingBalance <= item.reorderPoint);
        
        return categoryMatch && costCenterMatch && searchMatch && lowStockMatch;
    });
}

/**
 * Get calculation details for a stock item
 * @param {Object} item - Stock item to get details for
 * @param {Object} params - Calculation parameters
 * @returns {Object} - Detailed calculation steps
 */
export function getItemCalculationDetails(item, params) {
    return getCalculationDetails(item, params);
}

/**
 * Create a download link for CSV export
 * @param {string} content - CSV content to download
 * @param {string} filename - Name for the downloaded file
 */
export function downloadCSV(content, filename) {
    // Create a Blob with the CSV content
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    
    // Create a download link and trigger the download
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
