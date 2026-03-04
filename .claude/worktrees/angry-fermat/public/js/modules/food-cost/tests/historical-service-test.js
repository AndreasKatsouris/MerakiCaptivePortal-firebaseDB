/**
 * Test Harness for Historical Usage Service
 * This file provides testing and validation for the historical usage service
 * Version: 2.0.0-2025-04-24
 */

import HistoricalUsageService from '../services/historical-usage-service.js';

/**
 * Test Harness for validating the Historical Usage Service
 * Provides methods to test data retrieval, statistical calculations, and caching
 */
const HistoricalServiceTester = {
    /**
     * Test results to be displayed in the UI
     */
    testResults: {
        dataRetrieval: {
            status: 'pending',
            message: 'Not started',
            details: null,
            records: 0,
            time: 0
        },
        statistics: {
            status: 'pending',
            message: 'Not started',
            details: null,
            itemsProcessed: 0,
            time: 0
        },
        caching: {
            status: 'pending',
            message: 'Not started',
            details: null,
            time: 0
        }
    },
    
    /**
     * Test store names to check
     */
    testStores: [],
    
    /**
     * Test item codes to check
     */
    testItems: [],
    
    /**
     * Initialize the test harness
     * @param {Function} updateUICallback - Callback to update the UI with test results
     */
    init(updateUICallback = null) {
        this.updateUI = updateUICallback || (() => {});
        
        // Try to get stores from localStorage
        const storedStores = localStorage.getItem('historical_test_stores');
        if (storedStores) {
            try {
                this.testStores = JSON.parse(storedStores);
            } catch (e) {
                console.error('Error parsing stored test stores:', e);
                this.testStores = [];
            }
        }
        
        // Try to get items from localStorage
        const storedItems = localStorage.getItem('historical_test_items');
        if (storedItems) {
            try {
                this.testItems = JSON.parse(storedItems);
            } catch (e) {
                console.error('Error parsing stored test items:', e);
                this.testItems = [];
            }
        }
        
        this.updateUI();
    },
    
    /**
     * Save test configuration to localStorage
     */
    saveConfig() {
        localStorage.setItem('historical_test_stores', JSON.stringify(this.testStores));
        localStorage.setItem('historical_test_items', JSON.stringify(this.testItems));
    },
    
    /**
     * Add a store to test
     * @param {string} storeName - Store name to add
     */
    addStore(storeName) {
        if (storeName && !this.testStores.includes(storeName)) {
            this.testStores.push(storeName);
            this.saveConfig();
            this.updateUI();
        }
    },
    
    /**
     * Remove a store from testing
     * @param {string} storeName - Store name to remove
     */
    removeStore(storeName) {
        this.testStores = this.testStores.filter(s => s !== storeName);
        this.saveConfig();
        this.updateUI();
    },
    
    /**
     * Add an item to test
     * @param {string} itemCode - Item code to add
     */
    addItem(itemCode) {
        if (itemCode && !this.testItems.includes(itemCode)) {
            this.testItems.push(itemCode);
            this.saveConfig();
            this.updateUI();
        }
    },
    
    /**
     * Remove an item from testing
     * @param {string} itemCode - Item code to remove
     */
    removeItem(itemCode) {
        this.testItems = this.testItems.filter(i => i !== itemCode);
        this.saveConfig();
        this.updateUI();
    },
    
    /**
     * Test data retrieval from Firebase
     * @param {string} storeName - Store to test (if null, tests all configured stores)
     * @param {Object} dateRange - Optional date range to test
     * @param {number} lookbackDays - Optional lookback days to test
     * @returns {Promise<Object>} - Test results
     */
    async testDataRetrieval(storeName = null, dateRange = null, lookbackDays = 14) {
        const storesToTest = storeName ? [storeName] : this.testStores;
        
        if (storesToTest.length === 0) {
            this.testResults.dataRetrieval = {
                status: 'error',
                message: 'No stores configured for testing',
                details: null,
                records: 0,
                time: 0
            };
            this.updateUI();
            return this.testResults.dataRetrieval;
        }
        
        this.testResults.dataRetrieval = {
            status: 'running',
            message: `Testing data retrieval for ${storesToTest.length} store(s)...`,
            details: null,
            records: 0,
            time: 0
        };
        this.updateUI();
        
        const startTime = performance.now();
        const results = {};
        let totalRecords = 0;
        
        try {
            // Clear cache to ensure fresh retrieval
            HistoricalUsageService.clearCache();
            
            // Test each store
            for (const store of storesToTest) {
                results[store] = {
                    status: 'pending',
                    records: 0,
                    error: null
                };
                
                try {
                    console.log(`Testing data retrieval for store: ${store}`);
                    
                    // Try to retrieve historical data
                    const records = await HistoricalUsageService.getHistoricalData(
                        store, 
                        dateRange, 
                        lookbackDays
                    );
                    
                    results[store] = {
                        status: 'success',
                        records: records.length,
                        firstRecord: records.length > 0 ? records[0] : null,
                        lastRecord: records.length > 0 ? records[records.length - 1] : null
                    };
                    
                    totalRecords += records.length;
                    
                } catch (error) {
                    console.error(`Error testing data retrieval for ${store}:`, error);
                    results[store] = {
                        status: 'error',
                        records: 0,
                        error: error.message
                    };
                }
            }
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            const overallStatus = Object.values(results).some(r => r.status === 'error') 
                ? 'warning' 
                : (totalRecords > 0 ? 'success' : 'warning');
                
            const message = totalRecords > 0 
                ? `Retrieved ${totalRecords} records from ${storesToTest.length} store(s) in ${duration.toFixed(0)}ms` 
                : `No records found for the specified stores and date range`;
            
            this.testResults.dataRetrieval = {
                status: overallStatus,
                message,
                details: results,
                records: totalRecords,
                time: duration
            };
            
        } catch (error) {
            console.error('Error in testDataRetrieval:', error);
            
            this.testResults.dataRetrieval = {
                status: 'error',
                message: `Error testing data retrieval: ${error.message}`,
                details: error,
                records: 0,
                time: performance.now() - startTime
            };
        }
        
        this.updateUI();
        return this.testResults.dataRetrieval;
    },
    
    /**
     * Test statistical calculations for specific items
     * @param {string} storeName - Store to use for data
     * @param {Array} itemCodes - Item codes to test (if null, uses configured test items)
     * @param {Object} options - Test options including date range or lookback
     * @returns {Promise<Object>} - Test results
     */
    async testStatisticalCalculations(storeName, itemCodes = null, options = {}) {
        const store = storeName || (this.testStores.length > 0 ? this.testStores[0] : null);
        
        if (!store) {
            this.testResults.statistics = {
                status: 'error',
                message: 'No store specified for testing',
                details: null,
                itemsProcessed: 0,
                time: 0
            };
            this.updateUI();
            return this.testResults.statistics;
        }
        
        const items = itemCodes || this.testItems;
        
        if (items.length === 0) {
            this.testResults.statistics = {
                status: 'error',
                message: 'No items configured for testing',
                details: null,
                itemsProcessed: 0,
                time: 0
            };
            this.updateUI();
            return this.testResults.statistics;
        }
        
        this.testResults.statistics = {
            status: 'running',
            message: `Testing statistical calculations for ${items.length} item(s) in ${store}...`,
            details: null,
            itemsProcessed: 0,
            time: 0
        };
        this.updateUI();
        
        const startTime = performance.now();
        const results = {};
        
        try {
            // First, get historical data for the store
            const lookbackDays = options.lookbackDays || 30;
            const historicalRecords = await HistoricalUsageService.getHistoricalData(
                store, 
                options.dateRange, 
                lookbackDays
            );
            
            if (historicalRecords.length === 0) {
                this.testResults.statistics = {
                    status: 'warning',
                    message: `No historical records found for ${store}`,
                    details: null,
                    itemsProcessed: 0,
                    time: performance.now() - startTime
                };
                this.updateUI();
                return this.testResults.statistics;
            }
            
            // Process each test item
            for (const itemCode of items) {
                results[itemCode] = {
                    status: 'pending',
                    statistics: null,
                    error: null
                };
                
                try {
                    console.log(`Testing statistical calculations for item: ${itemCode}`);
                    
                    // Calculate statistics for this item
                    const stats = HistoricalUsageService.calculateItemStatistics(
                        historicalRecords,
                        itemCode
                    );
                    
                    results[itemCode] = {
                        status: stats.dataPoints > 0 ? 'success' : 'warning',
                        statistics: stats,
                        error: null
                    };
                    
                } catch (error) {
                    console.error(`Error calculating statistics for ${itemCode}:`, error);
                    results[itemCode] = {
                        status: 'error',
                        statistics: null,
                        error: error.message
                    };
                }
            }
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            const itemsWithData = Object.values(results).filter(r => 
                r.status === 'success' && r.statistics && r.statistics.dataPoints > 0
            ).length;
            
            const overallStatus = Object.values(results).some(r => r.status === 'error') 
                ? 'warning' 
                : (itemsWithData > 0 ? 'success' : 'warning');
                
            const message = itemsWithData > 0 
                ? `Calculated statistics for ${itemsWithData} out of ${items.length} items in ${duration.toFixed(0)}ms` 
                : `No statistical data found for the specified items`;
            
            this.testResults.statistics = {
                status: overallStatus,
                message,
                details: results,
                itemsProcessed: items.length,
                itemsWithData,
                time: duration
            };
            
        } catch (error) {
            console.error('Error in testStatisticalCalculations:', error);
            
            this.testResults.statistics = {
                status: 'error',
                message: `Error testing statistical calculations: ${error.message}`,
                details: error,
                itemsProcessed: 0,
                time: performance.now() - startTime
            };
        }
        
        this.updateUI();
        return this.testResults.statistics;
    },
    
    /**
     * Test caching functionality
     * @param {string} storeName - Store to use for caching test
     * @param {Object} options - Test options
     * @returns {Promise<Object>} - Test results
     */
    async testCaching(storeName, options = {}) {
        const store = storeName || (this.testStores.length > 0 ? this.testStores[0] : null);
        
        if (!store) {
            this.testResults.caching = {
                status: 'error',
                message: 'No store specified for testing',
                details: null,
                time: 0
            };
            this.updateUI();
            return this.testResults.caching;
        }
        
        this.testResults.caching = {
            status: 'running',
            message: `Testing caching functionality for ${store}...`,
            details: null,
            time: 0
        };
        this.updateUI();
        
        const startTime = performance.now();
        
        try {
            // Clear cache to start fresh
            HistoricalUsageService.clearCache();
            
            // First retrieval - should hit the database
            const lookbackDays = options.lookbackDays || 14;
            console.log(`First retrieval for ${store} with ${lookbackDays} days lookback`);
            
            const firstRetrievalStart = performance.now();
            const firstRetrieval = await HistoricalUsageService.getHistoricalData(
                store, 
                null, 
                lookbackDays
            );
            const firstRetrievalTime = performance.now() - firstRetrievalStart;
            
            // Check cache stats after first retrieval
            const cacheStatsAfterFirst = HistoricalUsageService.getCacheStats();
            
            // Second retrieval - should hit the cache
            console.log(`Second retrieval for ${store} with ${lookbackDays} days lookback`);
            
            const secondRetrievalStart = performance.now();
            const secondRetrieval = await HistoricalUsageService.getHistoricalData(
                store, 
                null, 
                lookbackDays
            );
            const secondRetrievalTime = performance.now() - secondRetrievalStart;
            
            // Determine if caching worked as expected
            const cachingWorked = secondRetrievalTime < firstRetrievalTime * 0.5;
            const timeSavings = firstRetrievalTime - secondRetrievalTime;
            const timeSavingsPercent = ((timeSavings / firstRetrievalTime) * 100).toFixed(1);
            
            // Create detailed results
            const results = {
                firstRetrieval: {
                    records: firstRetrieval.length,
                    time: firstRetrievalTime
                },
                secondRetrieval: {
                    records: secondRetrieval.length,
                    time: secondRetrievalTime
                },
                cacheStats: cacheStatsAfterFirst,
                timeSavings,
                timeSavingsPercent
            };
            
            // Set test results
            this.testResults.caching = {
                status: cachingWorked ? 'success' : 'warning',
                message: cachingWorked 
                    ? `Caching is working correctly (${timeSavingsPercent}% faster on second retrieval)` 
                    : `Caching may not be working optimally (only ${timeSavingsPercent}% faster)`,
                details: results,
                time: performance.now() - startTime
            };
            
        } catch (error) {
            console.error('Error in testCaching:', error);
            
            this.testResults.caching = {
                status: 'error',
                message: `Error testing caching: ${error.message}`,
                details: error,
                time: performance.now() - startTime
            };
        }
        
        this.updateUI();
        return this.testResults.caching;
    },
    
    /**
     * Run all tests in sequence
     * @param {string} storeName - Store to use for testing
     * @param {Object} options - Test options
     */
    async runAllTests(storeName, options = {}) {
        const store = storeName || (this.testStores.length > 0 ? this.testStores[0] : null);
        
        if (!store) {
            alert('Please specify a store to test');
            return;
        }
        
        // Run data retrieval test
        await this.testDataRetrieval(store, null, options.lookbackDays || 14);
        
        // Run statistics test if data retrieval was successful
        if (this.testResults.dataRetrieval.status === 'success') {
            await this.testStatisticalCalculations(store, null, options);
        }
        
        // Run caching test
        await this.testCaching(store, options);
        
        console.log('All tests completed');
    },
    
    /**
     * Export test results to JSON
     * @returns {string} - JSON string of test results
     */
    exportResults() {
        return JSON.stringify(this.testResults, null, 2);
    },
    
    /**
     * Create sample mock data for testing when no real data is available
     * @param {string} storeName - Store name to create mock data for
     * @param {Array} itemCodes - Item codes to include in mock data
     * @returns {Array} - Array of mock historical records
     */
    createMockData(storeName, itemCodes) {
        if (!storeName || !itemCodes || !Array.isArray(itemCodes) || itemCodes.length === 0) {
            console.error('Invalid parameters for createMockData');
            return [];
        }
        
        const mockRecords = [];
        const now = new Date();
        
        // Create records for the last 30 days
        for (let i = 30; i >= 0; i -= 7) {
            const recordDate = new Date(now);
            recordDate.setDate(recordDate.getDate() - i);
            
            const timestamp = recordDate.getTime();
            const dateStr = recordDate.toISOString().split('T')[0];
            
            // Create stock items for this record
            const stockItems = {};
            
            itemCodes.forEach(itemCode => {
                // Create somewhat random but consistent usage data
                const baseUsage = Math.round(10 + (parseInt(itemCode) % 20)) + (Math.random() * 5);
                
                // Add some trend and day-of-week patterns
                const dayOfWeek = recordDate.getDay();
                const weekdayFactor = dayOfWeek >= 1 && dayOfWeek <= 5 ? 1.0 : 0.7;
                const trendFactor = 1.0 + (i / 100); // Small increasing trend
                
                const usage = baseUsage * weekdayFactor * trendFactor;
                
                stockItems[itemCode] = {
                    itemCode,
                    description: `Test Item ${itemCode}`,
                    category: `Category ${Math.floor(parseInt(itemCode) / 1000)}`,
                    openingQty: 100,
                    purchaseQty: usage + 5,
                    closingQty: 100 - usage + (usage + 5),
                    usage,
                    usagePerDay: usage / 7,
                    unitCost: 10 + (parseInt(itemCode) % 10),
                    unit: 'ea'
                };
            });
            
            // Create the record
            mockRecords.push({
                id: `mock_${dateStr}`,
                timestamp,
                recordDate: timestamp,
                storeName,
                storeContext: {
                    name: storeName,
                    periodDays: 7
                },
                stockItems,
                metadata: {
                    isMockData: true,
                    createdAt: now.getTime()
                }
            });
        }
        
        return mockRecords;
    }
};

export default HistoricalServiceTester;
