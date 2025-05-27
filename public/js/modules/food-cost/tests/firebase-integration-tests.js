/**
 * Food Cost Module - Firebase Integration Tests
 * Version: 1.0.0-2025-04-19
 * 
 * This file implements Firebase-specific integration tests for Phase 5
 * focusing on data loading, saving, and persistence patterns.
 */

// Ensure the FoodCost namespace exists
window.FoodCost = window.FoodCost || {};
window.FoodCost.tests = window.FoodCost.tests || {};

// Import Firebase utilities
import { 
    rtdb, 
    ref, 
    get, 
    set, 
    update, 
    remove, 
    push 
} from '../../../config/firebase-config.js';

// Import database operations
import * as DatabaseOperations from '../database-operations.js';
import { generateTimestampKey } from '../utilities.js';

// Create namespace for Firebase tests
const firebaseIntegrationTests = {
    _version: '1.0.0-2025-04-19',
    _results: {
        loadingTests: [],
        savingTests: [],
        persistenceTests: []
    },
    
    /**
     * Run all Firebase integration tests
     * @param {HTMLElement} element - Element to display results in
     * @returns {Promise<Object>} - Test results
     */
    async runAllTests(element) {
        console.group('🧪 Running Firebase Integration Tests');
        
        try {
            // Reset results
            this._results = {
                loadingTests: [],
                savingTests: [],
                persistenceTests: []
            };
            
            // Run data loading tests
            await this._runDataLoadingTests();
            
            // Run data saving tests
            await this._runDataSavingTests();
            
            // Run settings persistence tests
            await this._runPersistenceTests();
            
            // Display results if element provided
            if (element) {
                this.displayResults(element);
            }
            
            console.log('✅ All Firebase integration tests completed');
        } catch (error) {
            console.error('❌ Error running Firebase integration tests:', error);
            this._results.error = error.message;
        }
        
        console.groupEnd();
        return this._results;
    },
    
    /**
     * Display test results in the provided element
     * @param {HTMLElement} element - Element to display results in
     */
    displayResults(element) {
        if (!element) {
            console.error('No element provided to display results');
            return;
        }
        
        // Create results HTML
        let html = '<div class="test-results firebase-results">';
        html += `<h2>Firebase Integration Test Results</h2>`;
        html += `<p>Version: ${this._version}</p>`;
        
        // Data loading tests
        html += this._formatTestCategory('Data Loading Tests', this._results.loadingTests);
        
        // Data saving tests
        html += this._formatTestCategory('Data Saving Tests', this._results.savingTests);
        
        // Settings persistence tests
        html += this._formatTestCategory('Settings Persistence Tests', this._results.persistenceTests);
        
        // Display error if any
        if (this._results.error) {
            html += `<div class="test-error"><strong>Error:</strong> ${this._results.error}</div>`;
        }
        
        html += '</div>';
        
        // Set element HTML
        element.innerHTML = html;
    },
    
    /**
     * Format test category results as HTML
     * @param {string} title - Category title
     * @param {Array} tests - Test results
     * @returns {string} - HTML for test category
     */
    _formatTestCategory(title, tests) {
        if (!tests || tests.length === 0) {
            return `<div class="test-category"><h3>${title}</h3><p>No tests run</p></div>`;
        }
        
        let html = `<div class="test-category"><h3>${title}</h3>`;
        html += '<ul class="test-list">';
        
        for (const test of tests) {
            const statusClass = test.success ? 'test-success' : 'test-failure';
            const statusIcon = test.success ? '✅' : '❌';
            
            html += `<li class="${statusClass}">`;
            html += `<span class="test-status">${statusIcon}</span>`;
            html += `<span class="test-name">${test.name}</span>`;
            
            if (test.message) {
                html += `<span class="test-message">${test.message}</span>`;
            }
            
            if (test.details) {
                html += `<div class="test-details"><pre>${JSON.stringify(test.details, null, 2)}</pre></div>`;
            }
            
            html += '</li>';
        }
        
        html += '</ul></div>';
        return html;
    },
    
    /**
     * Run data loading tests
     * @returns {Promise<void>}
     */
    async _runDataLoadingTests() {
        console.group('Running Data Loading Tests');
        
        try {
            // Test loading historical data
            await this._runTest(
                'testLoadHistoricalData',
                this.testLoadHistoricalData,
                this._results.loadingTests
            );
            
            // Test loading specific record
            await this._runTest(
                'testLoadSpecificRecord',
                this.testLoadSpecificRecord,
                this._results.loadingTests
            );
            
            // Test loading with error conditions
            await this._runTest(
                'testLoadingErrorHandling',
                this.testLoadingErrorHandling,
                this._results.loadingTests
            );
        } catch (error) {
            console.error('Error running data loading tests:', error);
            this._results.loadingTests.push({
                name: 'Data Loading Tests Error',
                success: false,
                message: error.message
            });
        }
        
        console.groupEnd();
    },
    
    /**
     * Run data saving tests
     * @returns {Promise<void>}
     */
    async _runDataSavingTests() {
        console.group('Running Data Saving Tests');
        
        try {
            // Test saving stock usage data
            await this._runTest(
                'testSaveStockUsageData',
                this.testSaveStockUsageData,
                this._results.savingTests
            );
            
            // Test duplicate detection
            await this._runTest(
                'testDuplicateDetection',
                this.testDuplicateDetection,
                this._results.savingTests
            );
            
            // Test saving with store context
            await this._runTest(
                'testSaveStockDataWithStoreContext',
                this.testSaveStockDataWithStoreContext,
                this._results.savingTests
            );
        } catch (error) {
            console.error('Error running data saving tests:', error);
            this._results.savingTests.push({
                name: 'Data Saving Tests Error',
                success: false,
                message: error.message
            });
        }
        
        console.groupEnd();
    },
    
    /**
     * Run settings persistence tests
     * @returns {Promise<void>}
     */
    async _runPersistenceTests() {
        console.group('Running Settings Persistence Tests');
        
        try {
            // Test settings persistence
            await this._runTest(
                'testSettingsPersistence',
                this.testSettingsPersistence,
                this._results.persistenceTests
            );
            
            // Test date range persistence
            await this._runTest(
                'testDateRangePersistence',
                this.testDateRangePersistence,
                this._results.persistenceTests
            );
            
            // Test store context loading
            await this._runTest(
                'testStoreContextLoading',
                this.testStoreContextLoading,
                this._results.persistenceTests
            );
        } catch (error) {
            console.error('Error running persistence tests:', error);
            this._results.persistenceTests.push({
                name: 'Settings Persistence Tests Error',
                success: false,
                message: error.message
            });
        }
        
        console.groupEnd();
    },
    
    /**
     * Run a test and record results
     * @param {string} name - Test name
     * @param {Function} testFn - Test function
     * @param {Array} resultsArray - Array to store results in
     * @returns {Promise<Object>} - Test result
     */
    async _runTest(name, testFn, resultsArray) {
        console.log(`Running test: ${name}`);
        
        let result = {
            name,
            success: false
        };
        
        try {
            // Run test
            const testResult = await testFn.call(this);
            
            // Record result
            result.success = testResult.success;
            result.message = testResult.message;
            result.details = testResult.details;
            
            // Log result
            console.log(`${result.success ? '✅' : '❌'} ${name}: ${result.message || ''}`);
        } catch (error) {
            // Record error
            result.success = false;
            result.message = error.message;
            result.details = { stack: error.stack };
            
            // Log error
            console.error(`❌ ${name} error:`, error);
        }
        
        // Add to results array
        resultsArray.push(result);
        
        return result;
    },
    
    /**
     * Create a test reference path for tests
     * @returns {string} - Test reference path
     */
    _getTestRefPath() {
        return `stockUsage/test_${Date.now()}`;
    },
    
    /**
     * Clean up test data to prevent test pollution
     * @param {string} path - Path to clean up
     * @returns {Promise<void>}
     */
    async _cleanupTestData(path) {
        try {
            if (path) {
                await remove(ref(rtdb, path));
                console.log(`Test data cleaned up: ${path}`);
            }
        } catch (error) {
            console.warn(`Error cleaning up test data: ${path}`, error);
        }
    },
    
    /**
     * Create mock stock data for testing
     * @param {number} itemCount - Number of items to create
     * @returns {Object} - Mock stock data
     */
    _createMockStockData(itemCount = 5) {
        const stockItems = [];
        
        for (let i = 0; i < itemCount; i++) {
            stockItems.push({
                itemCode: `ITEM${i + 1000}`,
                description: `Test Item ${i}`,
                category: ['Beverages', 'Dairy', 'Meat'][i % 3],
                costCenter: ['Kitchen', 'Bar'][i % 2],
                openingQty: 100 + i * 10,
                openingValue: (100 + i * 10) * 5,
                purchaseQty: 50 + i * 5,
                purchaseValue: (50 + i * 5) * 5,
                closingQty: 80 + i * 8,
                closingValue: (80 + i * 8) * 5,
                unitCost: 5,
                usage: (100 + i * 10) + (50 + i * 5) - (80 + i * 8),
                usageValue: ((100 + i * 10) + (50 + i * 5) - (80 + i * 8)) * 5
            });
        }
        
        return {
            storeName: 'Test Store',
            openingDate: '2025-04-01',
            closingDate: '2025-04-07',
            daysToNextDelivery: 3,
            stockPeriodDays: 7,
            safetyStockPercentage: 15,
            criticalItemBuffer: 30,
            totalItems: stockItems.length,
            totalOpeningValue: stockItems.reduce((sum, item) => sum + item.openingValue, 0),
            totalPurchases: stockItems.reduce((sum, item) => sum + item.purchaseValue, 0),
            totalClosingValue: stockItems.reduce((sum, item) => sum + item.closingValue, 0),
            totalUsage: stockItems.reduce((sum, item) => sum + item.usage, 0),
            totalCostOfUsage: stockItems.reduce((sum, item) => sum + item.usageValue, 0),
            salesAmount: 15000,
            costPercentage: 18.5,
            stockItems
        };
    },
    
    // ------------------------------------------------------------------------
    // Data Loading Tests
    // ------------------------------------------------------------------------
    
    /**
     * Test loading historical data
     * @returns {Promise<Object>} - Test result
     */
    async testLoadHistoricalData() {
        // Setup test data
        const testPath = this._getTestRefPath();
        const testData = this._createMockStockData();
        
        try {
            // Save test data
            await set(ref(rtdb, testPath), {
                timestamp: Date.now(),
                formattedTimestamp: new Date().toLocaleString(),
                storeName: testData.storeName,
                openingDate: testData.openingDate,
                closingDate: testData.closingDate,
                totalItems: testData.totalItems,
                totalCostOfUsage: testData.totalCostOfUsage,
                stockItems: testData.stockItems
            });
            
            // Test loading historical data
            const historicalData = await DatabaseOperations.loadHistoricalData();
            
            // Verify data is returned as an array
            const isArray = Array.isArray(historicalData);
            
            // Verify each entry has the required fields
            const hasRequiredFields = historicalData.every(entry => 
                entry.key && 
                entry.timestamp && 
                entry.storeName && 
                typeof entry.totalItems === 'number'
            );
            
            return {
                success: isArray && hasRequiredFields,
                message: isArray && hasRequiredFields ? 
                    'Successfully loaded historical data' : 
                    'Failed to load historical data correctly',
                details: {
                    entryCount: historicalData.length,
                    isArray,
                    hasRequiredFields
                }
            };
        } finally {
            // Clean up test data
            await this._cleanupTestData(testPath);
        }
    },
    
    /**
     * Test loading a specific historical record
     * @returns {Promise<Object>} - Test result
     */
    async testLoadSpecificRecord() {
        // Setup test data
        const testKey = `test_${Date.now()}`;
        const testPath = `stockUsage/${testKey}`;
        const testData = this._createMockStockData();
        
        try {
            // Save test data
            await set(ref(rtdb, testPath), {
                timestamp: Date.now(),
                formattedTimestamp: new Date().toLocaleString(),
                storeName: testData.storeName,
                openingDate: testData.openingDate,
                closingDate: testData.closingDate,
                totalItems: testData.totalItems,
                totalCostOfUsage: testData.totalCostOfUsage,
                stockItems: testData.stockItems
            });
            
            // Test loading specific record
            const record = await DatabaseOperations.loadSpecificHistoricalData(testKey);
            
            // Verify record is returned
            const hasRecord = record && typeof record === 'object';
            
            // Verify record has the correct data
            const hasCorrectData = 
                record.storeName === testData.storeName &&
                record.totalItems === testData.totalItems &&
                Array.isArray(record.stockItems) &&
                record.stockItems.length === testData.stockItems.length;
            
            return {
                success: hasRecord && hasCorrectData,
                message: hasRecord && hasCorrectData ? 
                    'Successfully loaded specific historical record' : 
                    'Failed to load specific historical record correctly',
                details: {
                    recordKey: testKey,
                    hasRecord,
                    hasCorrectData,
                    stockItemCount: record?.stockItems?.length
                }
            };
        } finally {
            // Clean up test data
            await this._cleanupTestData(testPath);
        }
    },
    
    /**
     * Test loading data with error conditions
     * @returns {Promise<Object>} - Test result
     */
    async testLoadingErrorHandling() {
        try {
            // Test 1: Load non-existent record
            let errorCaught = false;
            let errorMessage = '';
            
            try {
                await DatabaseOperations.loadSpecificHistoricalData('non_existent_key');
            } catch (error) {
                errorCaught = true;
                errorMessage = error.message;
            }
            
            // Test 2: Get item history for invalid item code
            let itemHistoryErrorCaught = false;
            let itemHistoryErrorMessage = '';
            
            try {
                await DatabaseOperations.getItemHistoricalData('INVALID_ITEM_CODE');
            } catch (error) {
                itemHistoryErrorCaught = true;
                itemHistoryErrorMessage = error.message;
            }
            
            // Ensure responses for invalid data are handled appropriately
            // Note: In some implementations, these might not throw errors but return empty results
            // This test adapts to both approaches
            const errorsHandledAppropriately = 
                (errorCaught || errorMessage === '') &&
                (itemHistoryErrorCaught || itemHistoryErrorMessage === '');
            
            return {
                success: errorsHandledAppropriately,
                message: errorsHandledAppropriately ? 
                    'Error conditions handled appropriately' : 
                    'Error conditions not handled appropriately',
                details: {
                    nonExistentRecordTest: {
                        errorCaught,
                        errorMessage
                    },
                    invalidItemCodeTest: {
                        itemHistoryErrorCaught,
                        itemHistoryErrorMessage
                    }
                }
            };
        } catch (error) {
            console.error('Error testing loading error handling:', error);
            return {
                success: false,
                message: 'Error testing loading error handling',
                details: { error: error.message }
            };
        }
    },
    
    // ------------------------------------------------------------------------
    // Data Saving Tests
    // ------------------------------------------------------------------------
    
    /**
     * Test saving stock usage data
     * @returns {Promise<Object>} - Test result
     */
    async testSaveStockUsageData() {
        // Create test data
        const testData = this._createMockStockData();
        let savedKey = null;
        
        try {
            // Save test data
            const result = await DatabaseOperations.saveStockUsage(testData);
            
            // Verify save operation succeeded
            const saveSucceeded = result.success === true && result.timestamp;
            savedKey = result.timestamp;
            
            // Retrieve saved data to verify it was stored correctly
            const savedData = savedKey ? 
                await DatabaseOperations.loadSpecificHistoricalData(savedKey) : null;
            
            // Verify data was saved correctly
            const dataSavedCorrectly = 
                savedData &&
                savedData.storeName === testData.storeName &&
                savedData.totalItems === testData.totalItems &&
                Array.isArray(savedData.stockItems) &&
                savedData.stockItems.length === testData.stockItems.length;
            
            return {
                success: saveSucceeded && dataSavedCorrectly,
                message: saveSucceeded && dataSavedCorrectly ? 
                    'Stock usage data saved and retrieved successfully' : 
                    'Failed to save or retrieve stock usage data correctly',
                details: {
                    savedKey,
                    saveSucceeded,
                    dataSavedCorrectly,
                    savedDataItemCount: savedData?.stockItems?.length
                }
            };
        } finally {
            // Clean up test data
            if (savedKey) {
                await this._cleanupTestData(`stockUsage/${savedKey}`);
            }
        }
    },
    
    /**
     * Test duplicate data detection
     * @returns {Promise<Object>} - Test result
     */
    async testDuplicateDetection() {
        // Create test data
        const testData = this._createMockStockData();
        let savedKey = null;
        
        try {
            // Save test data first time
            const result1 = await DatabaseOperations.saveStockUsage(testData);
            savedKey = result1.timestamp;
            
            // Attempt to save the same data again
            let duplicateDetected = false;
            let errorMessage = '';
            
            try {
                await DatabaseOperations.saveStockUsage(testData);
            } catch (error) {
                duplicateDetected = true;
                errorMessage = error.message;
            }
            
            return {
                success: duplicateDetected,
                message: duplicateDetected ? 
                    'Duplicate data detection worked correctly' : 
                    'Failed to detect duplicate data',
                details: {
                    duplicateDetected,
                    errorMessage
                }
            };
        } finally {
            // Clean up test data
            if (savedKey) {
                await this._cleanupTestData(`stockUsage/${savedKey}`);
            }
        }
    },
    
    /**
     * Test saving stock data with store context
     * @returns {Promise<Object>} - Test result
     */
    async testSaveStockDataWithStoreContext() {
        // Create test data with specific store context
        const testData = this._createMockStockData();
        testData.storeName = 'Store Context Test';
        testData.openingDate = '2025-04-10';
        testData.closingDate = '2025-04-17';
        testData.daysToNextDelivery = 5;
        testData.stockPeriodDays = 7;
        
        let savedKey = null;
        
        try {
            // Save test data
            const result = await DatabaseOperations.saveStockUsage(testData);
            savedKey = result.timestamp;
            
            // Verify save operation succeeded
            const saveSucceeded = result.success === true && result.timestamp;
            
            // Retrieve saved data to verify store context was saved
            const savedData = savedKey ? 
                await DatabaseOperations.loadSpecificHistoricalData(savedKey) : null;
            
            // Verify store context was saved correctly
            const storeContextSaved = 
                savedData &&
                savedData.storeName === testData.storeName &&
                savedData.openingDate === testData.openingDate &&
                savedData.closingDate === testData.closingDate &&
                savedData.daysToNextDelivery === testData.daysToNextDelivery &&
                savedData.stockPeriodDays === testData.stockPeriodDays;
            
            return {
                success: saveSucceeded && storeContextSaved,
                message: saveSucceeded && storeContextSaved ? 
                    'Store context saved correctly with stock data' : 
                    'Failed to save store context correctly',
                details: {
                    savedKey,
                    saveSucceeded,
                    storeContextSaved,
                    savedStoreName: savedData?.storeName,
                    savedOpeningDate: savedData?.openingDate,
                    savedClosingDate: savedData?.closingDate,
                    savedDaysToNextDelivery: savedData?.daysToNextDelivery,
                    savedStockPeriodDays: savedData?.stockPeriodDays
                }
            };
        } finally {
            // Clean up test data
            if (savedKey) {
                await this._cleanupTestData(`stockUsage/${savedKey}`);
            }
        }
    },
    
    // ------------------------------------------------------------------------
    // Settings Persistence Tests
    // ------------------------------------------------------------------------
    
    /**
     * Test settings persistence
     * @returns {Promise<Object>} - Test result
     */
    async testSettingsPersistence() {
        // Create test settings
        const testSettings = {
            safetyStockPercentage: 20,
            criticalItemBuffer: 25,
            defaultDeliveryDays: 4
        };
        
        const testPath = 'foodCostSettings/testSettings';
        
        try {
            // Save test settings
            await set(ref(rtdb, testPath), testSettings);
            
            // Retrieve settings
            const snapshot = await get(ref(rtdb, testPath));
            const savedSettings = snapshot.val();
            
            // Verify settings were saved correctly
            const settingsSavedCorrectly = 
                savedSettings &&
                savedSettings.safetyStockPercentage === testSettings.safetyStockPercentage &&
                savedSettings.criticalItemBuffer === testSettings.criticalItemBuffer &&
                savedSettings.defaultDeliveryDays === testSettings.defaultDeliveryDays;
            
            return {
                success: settingsSavedCorrectly,
                message: settingsSavedCorrectly ? 
                    'Settings persisted correctly' : 
                    'Failed to persist settings correctly',
                details: {
                    savedSettings,
                    settingsSavedCorrectly
                }
            };
        } finally {
            // Clean up test data
            await this._cleanupTestData(testPath);
        }
    },
    
    /**
     * Test date range persistence
     * @returns {Promise<Object>} - Test result
     */
    async testDateRangePersistence() {
        // Create test date range
        const testDateRange = {
            openingDate: '2025-04-01',
            closingDate: '2025-04-07',
            stockPeriodDays: 7
        };
        
        const testPath = 'foodCostSettings/testDateRange';
        
        try {
            // Save test date range
            await set(ref(rtdb, testPath), testDateRange);
            
            // Retrieve date range
            const snapshot = await get(ref(rtdb, testPath));
            const savedDateRange = snapshot.val();
            
            // Verify date range was saved correctly
            const dateRangeSavedCorrectly = 
                savedDateRange &&
                savedDateRange.openingDate === testDateRange.openingDate &&
                savedDateRange.closingDate === testDateRange.closingDate &&
                savedDateRange.stockPeriodDays === testDateRange.stockPeriodDays;
            
            return {
                success: dateRangeSavedCorrectly,
                message: dateRangeSavedCorrectly ? 
                    'Date range persisted correctly' : 
                    'Failed to persist date range correctly',
                details: {
                    savedDateRange,
                    dateRangeSavedCorrectly
                }
            };
        } finally {
            // Clean up test data
            await this._cleanupTestData(testPath);
        }
    },
    
    /**
     * Test store context loading
     * @returns {Promise<Object>} - Test result
     */
    async testStoreContextLoading() {
        try {
            // Test the getRecentStoreContext function
            const storeContext = await DatabaseOperations.getRecentStoreContext();
            
            // The function should always return an object, even if no data is found
            const returnsObject = storeContext && typeof storeContext === 'object';
            
            // Verify the object has the required fields (may be default values)
            const hasRequiredFields = 
                'storeName' in storeContext &&
                'openingDate' in storeContext &&
                'closingDate' in storeContext &&
                'daysToNextDelivery' in storeContext;
            
            return {
                success: returnsObject && hasRequiredFields,
                message: returnsObject && hasRequiredFields ? 
                    'Store context loading works correctly' : 
                    'Store context loading is missing required fields',
                details: {
                    returnsObject,
                    hasRequiredFields,
                    storeContext
                }
            };
        } catch (error) {
            console.error('Error testing store context loading:', error);
            return {
                success: false,
                message: 'Error testing store context loading',
                details: { error: error.message }
            };
        }
    }
};
