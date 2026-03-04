/**
 * Analytics Module - Data Processor
 * 
 * This file contains functions for processing and analyzing data in the Analytics module.
 */

// Data Processor object
const DataProcessor = {
    /**
     * Process raw data for analytics
     * @param {Object} rawData - The raw data to process (can be single or multiple files)
     * @param {Object} options - Processing options
     * @returns {Object} Processed data ready for analysis and visualization
     */
    processData(rawData, options = {}) {
        // Detect if we're dealing with multiple files
        const isMultipleFiles = !Array.isArray(rawData) && typeof rawData === 'object' &&
            Object.keys(rawData).length > 1;

        console.log('Processing data for analytics:', { 
            dataSize: Object.keys(rawData).length, 
            isMultipleFiles, 
            options 
        });
        
        try {
            // Add the multi-file flag to options
            options.isMultipleFiles = isMultipleFiles;
            
            // Extract data points based on the data type
            if (options.dataType === 'foodCost') {
                return this.processFoodCostData(rawData, options);
            }
            
            // Default processing for other data types
            return this.processGenericData(rawData, options);
        } catch (error) {
            console.error('Error processing data:', error);
            throw error;
        }
    },
    
    /**
     * Process food cost data for analytics with support for multiple data sources
     * @param {Object} rawData - Raw food cost data from Firebase (single or multiple files)
     * @param {Object} options - Processing options
     * @returns {Object} Processed food cost data
     */
    processFoodCostData(rawData, options = {}) {
        let processedData;
        
        // Handle single vs multiple file processing differently
        if (options.isMultipleFiles) {
            processedData = this.processMultipleFiles(rawData, options);
        } else {
            // For single file, use the existing logic
            processedData = this.processSingleFile(rawData, options);
        }
        
        return processedData;
    },
    
    /**
     * Process a single food cost data file
     * @param {Object} rawData - Raw food cost data from a single source
     * @param {Object} options - Processing options
     * @returns {Object} Processed food cost data
     */
    processSingleFile(rawData, options = {}) {
        // Convert the raw data object to an array if it's not already
        const dataArray = Array.isArray(rawData) 
            ? rawData 
            : Object.entries(rawData || {}).map(([id, data]) => ({ id, ...data }));
        
        // Apply date filtering if provided
        const filteredData = options.dateRange
            ? dataArray.filter(item => {
                // Extract timestamp from the record ID (format: YYYYMMDD_HHMMSS)
                const recordDate = item.id ? this.extractDateFromRecordId(item.id) : null;
                if (!recordDate) return false;
                
                const itemDate = new Date(recordDate);
                const startDate = new Date(options.dateRange.startDate);
                const endDate = new Date(options.dateRange.endDate);
                
                // Set time to beginning/end of day for accurate comparison
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                
                return itemDate >= startDate && itemDate <= endDate;
            })
            : dataArray;
        
        // Extract summary metrics
        const summaryData = this.extractSummaryMetrics(filteredData);
        
        // Calculate trends
        const trends = this.calculateTrends(filteredData, options);
        
        // Aggregate by category
        const categoryData = this.aggregateByCategory(filteredData);
        
        // Calculate item-specific metrics
        const itemMetrics = this.calculateItemMetrics(filteredData);
        
        // Generate insights based on the processed data
        const insights = this.generateInsights(filteredData, {
            summary: summaryData,
            trends: trends,
            categories: categoryData,
            items: itemMetrics
        });
        
        return {
            summary: summaryData,
            trends: trends,
            categoryData: categoryData,
            itemMetrics: itemMetrics,
            rawData: filteredData,
            insights: insights,
            sources: [{ id: 'single', displayName: 'Current Data' }] // Single source
        };
    },
    
    /**
     * Process multiple food cost data files
     * @param {Object} rawDataFiles - Object containing multiple data files
     * @param {Object} options - Processing options
     * @returns {Object} Processed and merged food cost data
     */
    processMultipleFiles(rawDataFiles, options = {}) {
        console.log('Processing multiple data files', { fileCount: Object.keys(rawDataFiles).length });
        
        // Initialize containers for merged data
        const mergedRawData = [];
        const sources = [];
        const sourceMap = {}; // Maps items to their source files
        
        // Process each file and merge the data
        Object.entries(rawDataFiles).forEach(([fileId, fileData]) => {
            // Skip files without proper data structure
            if (!fileData || !fileData.stockItems) {
                console.warn(`Skipping file ${fileId} - Invalid data structure`);
                return;
            }
            
            // Extract source metadata
            const metadata = fileData.metadata || {};
            let sourceName = metadata.storeName || 'Unknown Store';
            
            // Add date range to the source name if available
            if (metadata.openingDate && metadata.closingDate) {
                const openDate = new Date(metadata.openingDate).toLocaleDateString();
                const closeDate = new Date(metadata.closingDate).toLocaleDateString();
                sourceName += ` (${openDate} - ${closeDate})`;
            } else {
                // Use the file ID date if metadata dates not available
                const match = fileId.match(/^(\d{4})(\d{2})(\d{2})_/);
                if (match) {
                    const [, year, month, day] = match;
                    sourceName += ` (${month}/${day}/${year})`;
                }
            }
            
            // Record the source
            const sourceIndex = sources.length;
            sources.push({
                id: fileId,
                displayName: sourceName,
                storeName: metadata.storeName || 'Unknown Store',
                dateRange: {
                    openingDate: metadata.openingDate,
                    closingDate: metadata.closingDate
                },
                metadata: metadata
            });
            
            // Process stock items with source attribution
            if (fileData.stockItems) {
                Object.entries(fileData.stockItems).forEach(([itemId, itemData]) => {
                    // Create a merged item with source tracking
                    const mergedItem = {
                        ...itemData,
                        id: itemId,
                        sourceId: fileId,
                        sourceIndex: sourceIndex,
                        sourceName: sourceName
                    };
                    
                    // Add to merged data
                    mergedRawData.push(mergedItem);
                    
                    // Track in source map
                    if (!sourceMap[itemId]) {
                        sourceMap[itemId] = [];
                    }
                    sourceMap[itemId].push(fileId);
                });
            }
        });
        
        // Apply any additional filtering from options
        let filteredData = mergedRawData;
        
        if (options.dateRange) {
            filteredData = mergedRawData.filter(item => {
                // For merged data, use the source file ID for date filtering
                const sourceId = item.sourceId;
                if (!sourceId) return false;
                
                const recordDate = this.extractDateFromRecordId(sourceId);
                if (!recordDate) return false;
                
                const itemDate = new Date(recordDate);
                const startDate = new Date(options.dateRange.startDate);
                const endDate = new Date(options.dateRange.endDate);
                
                // Set time to beginning/end of day for accurate comparison
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
                
                return itemDate >= startDate && itemDate <= endDate;
            });
        }
        
        // Process the merged data
        const summaryData = this.extractSummaryMetrics(filteredData);
        const trends = this.calculateTrends(filteredData, options);
        const categoryData = this.aggregateByCategory(filteredData);
        const itemMetrics = this.calculateItemMetrics(filteredData);
        
        // Generate cross-file insights
        const insights = this.generateInsights(filteredData, {
            summary: summaryData,
            trends: trends,
            categories: categoryData,
            items: itemMetrics,
            isMultipleFiles: true,
            sources: sources,
            sourceMap: sourceMap
        });
        
        // Add cross-file comparison insights
        const comparisonInsights = this.generateComparisonInsights(filteredData, sources, sourceMap);
        
        return {
            summary: summaryData,
            trends: trends,
            categoryData: categoryData,
            itemMetrics: itemMetrics,
            rawData: filteredData,
            insights: [...insights, ...comparisonInsights],
            sources: sources,
            sourceMap: sourceMap,
            isMultipleFiles: true
        };
    },
    
    /**
     * Generate insights that compare data across multiple files
     * @param {Array} mergedData - Merged data from multiple sources
     * @param {Array} sources - Array of data sources
     * @param {Object} sourceMap - Map of items to their sources
     * @returns {Array} Comparison insights
     */
    generateComparisonInsights(mergedData, sources, sourceMap) {
        if (!mergedData || mergedData.length === 0 || sources.length < 2) {
            return [];
        }
        
        const insights = [];
        
        // Group items by ID
        const itemGroups = {};
        mergedData.forEach(item => {
            if (!itemGroups[item.id]) {
                itemGroups[item.id] = [];
            }
            itemGroups[item.id].push(item);
        });
        
        // Find items that appear in multiple sources for comparison
        const compareItems = Object.entries(itemGroups)
            .filter(([itemId, items]) => items.length > 1)
            .map(([itemId, items]) => ({
                id: itemId,
                name: items[0].name || itemId,
                category: items[0].category || 'Uncategorized',
                sources: items.map(item => ({
                    sourceId: item.sourceId,
                    sourceName: item.sourceName,
                    usage: item.usage || {}
                }))
            }));
        
        // Generate usage comparison insights
        if (compareItems.length > 0) {
            // Most significant usage variations
            const usageVariations = compareItems
                .filter(item => {
                    // Ensure we have usage data for comparison
                    return item.sources.every(source => 
                        source.usage && typeof source.usage.quantity !== 'undefined'
                    );
                })
                .map(item => {
                    // Calculate variance in usage
                    const usages = item.sources.map(s => parseFloat(s.usage.quantity) || 0);
                    const min = Math.min(...usages);
                    const max = Math.max(...usages);
                    const variance = max - min;
                    const variancePct = min === 0 ? 100 : (variance / min) * 100;
                    
                    return {
                        item,
                        variance,
                        variancePct,
                        min,
                        max
                    };
                })
                .filter(item => item.variancePct > 20) // Only significant variations
                .sort((a, b) => b.variancePct - a.variancePct)
                .slice(0, 5);
            
            if (usageVariations.length > 0) {
                insights.push({
                    type: 'comparison',
                    category: 'usage_variation',
                    title: 'Significant Usage Variations',
                    description: `${usageVariations.length} items show significant usage variations across data sources.`,
                    items: usageVariations.map(v => ({
                        name: v.item.name,
                        category: v.item.category,
                        variationPct: v.variancePct.toFixed(1) + '%',
                        sources: v.item.sources.map(s => ({
                            name: s.sourceName,
                            quantity: s.usage.quantity || 0
                        }))
                    }))
                });
            }
        }
        
        // Unique items by source
        const uniqueItemsBySource = {};
        Object.entries(sourceMap).forEach(([itemId, itemSources]) => {
            if (itemSources.length === 1) {
                const sourceId = itemSources[0];
                if (!uniqueItemsBySource[sourceId]) {
                    uniqueItemsBySource[sourceId] = [];
                }
                
                const item = mergedData.find(i => i.id === itemId && i.sourceId === sourceId);
                if (item) {
                    uniqueItemsBySource[sourceId].push(item);
                }
            }
        });
        
        // Generate insights for unique items by source
        const uniqueItemInsights = sources
            .filter(source => uniqueItemsBySource[source.id] && uniqueItemsBySource[source.id].length > 0)
            .map(source => {
                const uniqueItems = uniqueItemsBySource[source.id];
                return {
                    type: 'comparison',
                    category: 'unique_items',
                    title: `Unique Items in ${source.displayName}`,
                    description: `${uniqueItems.length} items appear only in ${source.displayName}.`,
                    sourceId: source.id,
                    sourceName: source.displayName,
                    count: uniqueItems.length,
                    items: uniqueItems.slice(0, 5).map(item => ({
                        name: item.name || item.id,
                        category: item.category || 'Uncategorized',
                        usage: item.usage ? {
                            quantity: item.usage.quantity || 0,
                            value: item.usage.value || 0
                        } : { quantity: 0, value: 0 }
                    }))
                };
            });
        
        insights.push(...uniqueItemInsights);
        
        return insights;
    },
    
    /**
     * Extract date from record ID (format: YYYYMMDD_HHMMSS)
     * @param {string} recordId - Record ID
     * @returns {string|null} Date string or null if invalid format
     */
    extractDateFromRecordId(recordId) {
        if (!recordId || typeof recordId !== 'string') return null;
        
        // Match YYYYMMDD_HHMMSS format
        const match = recordId.match(/^(\d{4})(\d{2})(\d{2})_/);
        if (!match) return null;
        
        // Extract year, month, day
        const [, year, month, day] = match;
        return `${year}-${month}-${day}`;
    },
    
    /**
     * Extract summary metrics from data
     * @param {Array} data - The data array
     * @returns {Object} Summary metrics
     */
    extractSummaryMetrics(data) {
        const summary = {
            recordCount: data.length,
            totalUsage: 0,
            totalValue: 0,
            avgUsagePerRecord: 0,
            categories: new Set(),
            items: new Set(),
            startDate: null,
            endDate: null
        };
        
        if (data.length === 0) return summary;
        
        // Sort data by date
        const sortedData = [...data].sort((a, b) => {
            const dateA = a.id ? this.extractDateFromRecordId(a.id) : null;
            const dateB = b.id ? this.extractDateFromRecordId(b.id) : null;
            if (!dateA || !dateB) return 0;
            return new Date(dateA) - new Date(dateB);
        });
        
        // Set start and end dates
        summary.startDate = sortedData[0].id ? this.extractDateFromRecordId(sortedData[0].id) : null;
        summary.endDate = sortedData[sortedData.length - 1].id ? 
            this.extractDateFromRecordId(sortedData[sortedData.length - 1].id) : null;
        
        // Calculate metrics
        data.forEach(record => {
            if (record.stockItems && typeof record.stockItems === 'object') {
                Object.values(record.stockItems).forEach(item => {
                    // Add to totals
                    summary.totalUsage += parseFloat(item.usage || 0);
                    summary.totalValue += parseFloat(item.usageValue || 0);
                    
                    // Track unique categories and items
                    if (item.category) summary.categories.add(item.category);
                    if (item.name) summary.items.add(item.name);
                });
            }
        });
        
        // Calculate averages
        if (data.length > 0) {
            summary.avgUsagePerRecord = summary.totalUsage / data.length;
        }
        
        // Convert Sets to arrays for easier consumption
        summary.categories = Array.from(summary.categories);
        summary.items = Array.from(summary.items);
        
        return summary;
    },
    
    /**
     * Calculate trends in the data
     * @param {Array} data - The data array
     * @param {Object} options - Analysis options
     * @returns {Object} Trend data
     */
    calculateTrends(data, options = {}) {
        const trends = {
            usage: [],
            value: [],
            timeLabels: []
        };
        
        if (data.length === 0) return trends;
        
        // Sort data by date
        const sortedData = [...data].sort((a, b) => {
            const dateA = a.id ? this.extractDateFromRecordId(a.id) : null;
            const dateB = b.id ? this.extractDateFromRecordId(b.id) : null;
            if (!dateA || !dateB) return 0;
            return new Date(dateA) - new Date(dateB);
        });
        
        // Extract time series data
        sortedData.forEach(record => {
            const date = record.id ? this.extractDateFromRecordId(record.id) : null;
            if (!date) return;
            
            let totalUsage = 0;
            let totalValue = 0;
            
            if (record.stockItems && typeof record.stockItems === 'object') {
                Object.values(record.stockItems).forEach(item => {
                    totalUsage += parseFloat(item.usage || 0);
                    totalValue += parseFloat(item.usageValue || 0);
                });
            }
            
            trends.usage.push(totalUsage);
            trends.value.push(totalValue);
            trends.timeLabels.push(date);
        });
        
        return trends;
    },
    
    /**
     * Aggregate data by category
     * @param {Array} data - The data array
     * @returns {Object} Category aggregated data
     */
    aggregateByCategory(data) {
        const categoryMap = {};
        
        data.forEach(record => {
            if (record.stockItems && typeof record.stockItems === 'object') {
                Object.values(record.stockItems).forEach(item => {
                    const category = item.category || 'Uncategorized';
                    
                    if (!categoryMap[category]) {
                        categoryMap[category] = {
                            totalUsage: 0,
                            totalValue: 0,
                            itemCount: 0,
                            items: {}
                        };
                    }
                    
                    categoryMap[category].totalUsage += parseFloat(item.usage || 0);
                    categoryMap[category].totalValue += parseFloat(item.usageValue || 0);
                    
                    if (item.name && !categoryMap[category].items[item.name]) {
                        categoryMap[category].items[item.name] = {
                            usage: 0,
                            value: 0,
                            occurrences: 0
                        };
                        categoryMap[category].itemCount++;
                    }
                    
                    if (item.name) {
                        categoryMap[category].items[item.name].usage += parseFloat(item.usage || 0);
                        categoryMap[category].items[item.name].value += parseFloat(item.usageValue || 0);
                        categoryMap[category].items[item.name].occurrences++;
                    }
                });
            }
        });
        
        return categoryMap;
    },
    
    /**
     * Calculate item-specific metrics
     * @param {Array} data - The data array
     * @returns {Object} Item metrics
     */
    calculateItemMetrics(data) {
        const itemMap = {};
        
        data.forEach(record => {
            if (record.stockItems && typeof record.stockItems === 'object') {
                Object.values(record.stockItems).forEach(item => {
                    if (!item.name) return;
                    
                    if (!itemMap[item.name]) {
                        itemMap[item.name] = {
                            category: item.category || 'Uncategorized',
                            totalUsage: 0,
                            totalValue: 0,
                            occurrences: 0,
                            usageHistory: [],
                            valueHistory: [],
                            dateHistory: []
                        };
                    }
                    
                    itemMap[item.name].totalUsage += parseFloat(item.usage || 0);
                    itemMap[item.name].totalValue += parseFloat(item.usageValue || 0);
                    itemMap[item.name].occurrences++;
                    
                    // Add to history if we have a date
                    const date = record.id ? this.extractDateFromRecordId(record.id) : null;
                    if (date) {
                        itemMap[item.name].usageHistory.push(parseFloat(item.usage || 0));
                        itemMap[item.name].valueHistory.push(parseFloat(item.usageValue || 0));
                        itemMap[item.name].dateHistory.push(date);
                    }
                });
            }
        });
        
        // Calculate additional metrics for each item
        Object.values(itemMap).forEach(item => {
            if (item.occurrences > 0) {
                item.avgUsage = item.totalUsage / item.occurrences;
                item.avgValue = item.totalValue / item.occurrences;
            }
            
            // Calculate trend (simple linear regression)
            if (item.usageHistory.length > 1) {
                item.trend = this.calculateSimpleLinearRegression(item.usageHistory);
            }
        });
        
        return itemMap;
    },
    
    /**
     * Calculate simple linear regression to determine trend
     * @param {Array} values - Array of values
     * @returns {number} Slope of the trend line
     */
    calculateSimpleLinearRegression(values) {
        if (!values || values.length < 2) return 0;
        
        const n = values.length;
        const indices = Array.from({ length: n }, (_, i) => i + 1);
        
        const sumX = indices.reduce((sum, x) => sum + x, 0);
        const sumY = values.reduce((sum, y) => sum + y, 0);
        const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
        const sumXX = indices.reduce((sum, x) => sum + x * x, 0);
        
        // Calculate slope of the trend line
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        return slope;
    },
    
    /**
     * Generate insights based on the processed data
     * @param {Array} rawData - The raw data array
     * @param {Object} processedData - The processed data
     * @returns {Array} Array of insights
     */
    generateInsights(rawData, processedData) {
        const insights = [];
        
        // No data insight
        if (rawData.length === 0) {
            insights.push({
                type: 'info',
                title: 'No Data Available',
                description: 'There is no data available for the selected date range.',
                priority: 'high'
            });
            return insights;
        }
        
        // Top categories by usage
        const topCategories = Object.entries(processedData.categories)
            .sort((a, b) => b[1].totalUsage - a[1].totalUsage)
            .slice(0, 3);
        
        if (topCategories.length > 0) {
            insights.push({
                type: 'analysis',
                title: 'Top Usage Categories',
                description: `Your top usage categories are: ${topCategories.map(([name]) => name).join(', ')}`,
                data: topCategories,
                priority: 'medium'
            });
        }
        
        // Items with increasing trend
        const increasingItems = Object.entries(processedData.items)
            .filter(([, item]) => item.trend > 0)
            .sort((a, b) => b[1].trend - a[1].trend)
            .slice(0, 5);
        
        if (increasingItems.length > 0) {
            insights.push({
                type: 'trend',
                title: 'Increasing Usage Trends',
                description: `Items with increasing usage: ${increasingItems.map(([name]) => name).join(', ')}`,
                data: increasingItems,
                priority: 'high'
            });
        }
        
        // Items with decreasing trend
        const decreasingItems = Object.entries(processedData.items)
            .filter(([, item]) => item.trend < 0)
            .sort((a, b) => a[1].trend - b[1].trend)
            .slice(0, 5);
        
        if (decreasingItems.length > 0) {
            insights.push({
                type: 'trend',
                title: 'Decreasing Usage Trends',
                description: `Items with decreasing usage: ${decreasingItems.map(([name]) => name).join(', ')}`,
                data: decreasingItems,
                priority: 'medium'
            });
        }
        
        // High value items
        const highValueItems = Object.entries(processedData.items)
            .sort((a, b) => b[1].totalValue - a[1].totalValue)
            .slice(0, 5);
        
        if (highValueItems.length > 0) {
            insights.push({
                type: 'cost',
                title: 'Highest Value Items',
                description: `Your highest value items are: ${highValueItems.map(([name]) => name).join(', ')}`,
                data: highValueItems,
                priority: 'high'
            });
        }
        
        return insights;
    },
    
    /**
     * Process generic data for analytics
     * @param {Object} rawData - Raw generic data
     * @param {Object} options - Processing options
     * @returns {Object} Processed generic data
     */
    processGenericData(rawData, options = {}) {
        // Basic processing for generic data
        const dataArray = Array.isArray(rawData) 
            ? rawData 
            : Object.entries(rawData || {}).map(([id, data]) => ({ id, ...data }));
        
        return {
            rawData: dataArray,
            count: dataArray.length,
            summary: {
                recordCount: dataArray.length
            }
        };
    }
};

// Export the Data Processor
export { DataProcessor };
