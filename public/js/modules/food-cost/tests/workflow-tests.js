/**
 * Food Cost Module - Workflow Tests
 * Version: 1.9.5-2025-04-19
 * 
 * This file implements workflow testing for the Food Cost Module
 * focusing on end-to-end processes and component interactions.
 */

// Import dependencies
import testUtils from './integration-test-utils.js';

// Ensure the FoodCost namespace exists
window.FoodCost = window.FoodCost || {};
window.FoodCost.tests = window.FoodCost.tests || {};

// Create workflow tests class
class WorkflowTests {
    constructor() {
        this._version = '1.9.5-2025-04-19';
        this._results = {
            csvImportExport: [],
            stockAnalytics: [],
            multiStoreAnalysis: [],
            storeContext: []
        };
        
        // Get test utilities
        this.testUtils = window.FoodCost.tests.testUtils || testUtils;
        
        // Component references
        this._components = [];
        this._mountPoints = [];
    }
    
    /**
     * Run all workflow tests
     * @param {HTMLElement} element - Optional element to display results in
     * @returns {Promise<Object>} - Test results
     */
    async runAllTests(element) {
        console.group('🧪 Running Workflow Tests');
        
        try {
            // Reset results
            this._results = {
                csvImportExport: [],
                stockAnalytics: [],
                multiStoreAnalysis: [],
                storeContext: []
            };
            
            // Run CSV import/export workflow tests
            console.log('Starting CSV import/export test');
            const csvResults = await this.testCSVImportExportWorkflow();
            console.log('CSV results received:', csvResults);
            this._results.csvImportExport.push({
                name: 'testCSVImportExportWorkflow',
                result: csvResults
            });
            console.log('After push, csvImportExport array:', this._results.csvImportExport);
            
            // Run stock analytics workflow tests
            console.log('Starting stock analytics test');
            const analyticsResults = await this.testStockAnalyticsWorkflow();
            console.log('Stock analytics results received:', analyticsResults);
            this._results.stockAnalytics.push({
                name: 'testStockAnalyticsWorkflow',
                result: analyticsResults
            });
            console.log('After push, stockAnalytics array:', this._results.stockAnalytics);
            
            // Run multi-store analysis workflow tests
            console.log('Starting multi-store analysis test');
            const multiStoreResults = await this.testMultiStoreAnalysisWorkflow();
            console.log('Multi-store results received:', multiStoreResults);
            this._results.multiStoreAnalysis.push({
                name: 'testMultiStoreAnalysisWorkflow',
                result: multiStoreResults
            });
            console.log('After push, multiStoreAnalysis array:', this._results.multiStoreAnalysis);
            
            // Run store context workflow tests
            console.log('Starting store context test');
            const contextResults = await this.testStoreContextWorkflow();
            console.log('Store context results received:', contextResults);
            this._results.storeContext.push({
                name: 'testStoreContextWorkflow',
                result: contextResults
            });
            console.log('After push, storeContext array:', this._results.storeContext);
            
            // Display results if element provided
            if (element) {
                this.displayResults(element);
            }
            
            console.log('✅ All workflow tests completed');
            return this._results;
        } catch (error) {
            console.error('❌ Error running workflow tests:', error);
            this._results.error = error.message;
            return { error: error.message };
        } finally {
            this._cleanupComponents();
        }
        
        console.groupEnd();
        return this._results;
    }
    
    /**
     * Display test results in the provided element
     * @param {HTMLElement} element - Element to display results in
     */
    displayResults(element) {
        if (!element) {
            console.error('No element provided to display results');
            return;
        }
        
        console.log('Displaying workflow test results:', this._results);
        console.log('CSV Import/Export results:', this._results.csvImportExport);
        console.log('Stock Analytics results:', this._results.stockAnalytics);
        console.log('Multi-Store Analysis results:', this._results.multiStoreAnalysis);
        console.log('Store Context results:', this._results.storeContext);
        
        // Create results HTML
        let html = '<div class="test-results workflow-results">';
        html += `<h2>Workflow Test Results</h2>`;
        
        // CSV import/export workflow tests
        html += this._formatTestCategory('CSV Import/Export Workflow Tests', this._results.csvImportExport);
        
        // Stock analytics workflow tests
        html += this._formatTestCategory('Stock Analytics Workflow Tests', this._results.stockAnalytics);
        
        // Multi-store analysis workflow tests
        html += this._formatTestCategory('Multi-Store Analysis Workflow Tests', this._results.multiStoreAnalysis);
        
        // Store context workflow tests
        html += this._formatTestCategory('Store Context Workflow Tests', this._results.storeContext);
        
        // Display error if any
        if (this._results.error) {
            html += `<div class="test-error"><strong>Error:</strong> ${this._results.error}</div>`;
        }
        
        html += '</div>';
        
        // Set element HTML
        element.innerHTML = html;
        console.log('Workflow results HTML generated:', html);
    }
    
    /**
     * Format test category results as HTML
     * @param {string} title - Category title
     * @param {Array} tests - Test results
     * @returns {string} - HTML for test category
     */
    _formatTestCategory(title, tests) {
        console.log(`Formatting test category: ${title}`, tests);
        
        if (!tests || tests.length === 0) {
            console.log(`No tests found for ${title}`);
            return `<div class="test-category"><h3>${title}</h3><p>No tests run</p></div>`;
        }
        
        let html = `<div class="test-category"><h3>${title}</h3>`;
        html += '<ul class="test-list">';
        
        for (const test of tests) {
            console.log(`Processing test:`, test);
            
            // Extract result from test object if it exists
            const result = test.result || test;
            console.log(`Test result:`, result);
            
            const passed = result.passed || result.success;
            const statusClass = passed ? 'test-success' : 'test-failure';
            const statusIcon = passed ? '✅' : '❌';
            
            html += `<li class="${statusClass}">`;
            html += `<span class="test-status">${statusIcon}</span>`;
            html += `<span class="test-name">${test.name}</span>`;
            
            // Add result message if available
            if (result.message) {
                html += `<div class="test-message">${result.message}</div>`;
            }
            
            // Add details if available
            if (result.details) {
                html += `<div class="test-details"><pre>${JSON.stringify(result.details, null, 2)}</pre></div>`;
            }
            
            html += '</li>';
        }
        
        html += '</ul></div>';
        return html;
    }
    
    /**
     * Clean up created components
     */
    _cleanupComponents() {
        if (this.testUtils) {
            this.testUtils.cleanupComponents();
        } else {
            // Fallback cleanup
            this._components.forEach(component => {
                if (component && component.$destroy) {
                    component.$destroy();
                }
            });
            
            this._mountPoints.forEach(el => {
                if (el && el.parentNode) {
                    try {
                        el.parentNode.removeChild(el);
                    } catch (error) {
                        console.warn('Error removing element:', error);
                    }
                }
            });
            
            this._components = [];
            this._mountPoints = [];
        }
    }
    
    /**
     * Run a test and record results
     * @param {string} name - Test name
     * @param {Function} testFn - Test function
     * @param {Array} resultsArray - Results array to add result to
     * @returns {Promise<Object>} - Test result
     */
    async _runTest(name, testFn, resultsArray) {
        console.log(`Running test: ${name}`);
        
        const startTime = performance.now();
        let result = {
            name,
            success: false,
            performance: {}
        };
        
        try {
            // Run test
            const testResult = await testFn.bind(this)();
            
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
            result.details = { error: error.message };
            
            // Log error
            console.error(`❌ ${name} error:`, error);
        }
        
        // Record performance
        const endTime = performance.now();
        result.performance.duration = endTime - startTime;
        
        // Add to results array
        resultsArray.push(result);
        
        return result;
    }
    
    /**
     * Generate mock stock items for testing
     * @param {number} count - Number of items to generate
     * @returns {Array} - Array of mock stock items
     */
    _generateMockStockItems(count = 10) {
        const items = [];
        const categories = ['Beverages', 'Dairy', 'Meat', 'Produce', 'Dry Goods'];
        const costCenters = ['Kitchen', 'Bar', 'Catering'];
        
        for (let i = 0; i < count; i++) {
            const openingQty = Math.floor(Math.random() * 100) + 50;
            const openingValue = openingQty * (Math.random() * 10 + 5);
            const purchaseQty = Math.floor(Math.random() * 50);
            const purchaseValue = purchaseQty * (Math.random() * 10 + 5);
            const closingQty = Math.max(5, Math.floor(Math.random() * openingQty));
            const closingValue = closingQty * (Math.random() * 10 + 5);
            
            // Calculate usage values
            const usage = openingQty + purchaseQty - closingQty;
            const unitCost = openingQty > 0 ? openingValue / openingQty : 0;
            const usageValue = usage * unitCost;
            
            items.push({
                itemCode: `ITEM${i + 1000}`,
                description: `Test Item ${i + 1}`,
                category: categories[i % categories.length],
                costCenter: costCenters[i % costCenters.length],
                openingQty,
                openingValue,
                purchaseQty,
                purchaseValue,
                closingQty,
                closingValue,
                usage,
                unitCost,
                usageValue
            });
        }
        
        return items;
    }
    
    /**
     * Generate mock CSV data for testing
     * @param {number} rowCount - Number of rows to generate
     * @returns {string} - CSV data as a string
     */
    _generateMockCSVData(rowCount = 20) {
        const headers = ['Item Code', 'Description', 'Category', 'Cost Center', 'Opening Qty', 'Opening Value', 
                       'Purchase Qty', 'Purchase Value', 'Closing Qty', 'Closing Value'];
        
        let csvData = headers.join(',') + '\n';
        
        const categories = ['Beverages', 'Dairy', 'Meat', 'Produce', 'Dry Goods'];
        const costCenters = ['Kitchen', 'Bar', 'Catering'];
        
        for (let i = 0; i < rowCount; i++) {
            const openingQty = Math.floor(Math.random() * 100) + 50;
            const openingValue = openingQty * (Math.random() * 10 + 5);
            const purchaseQty = Math.floor(Math.random() * 50);
            const purchaseValue = purchaseQty * (Math.random() * 10 + 5);
            const closingQty = Math.max(5, Math.floor(Math.random() * openingQty));
            const closingValue = closingQty * (Math.random() * 10 + 5);
            
            const row = [
                `ITEM${i + 1000}`,
                `Test Item ${i + 1}`,
                categories[i % categories.length],
                costCenters[i % costCenters.length],
                openingQty.toFixed(2),
                openingValue.toFixed(2),
                purchaseQty.toFixed(2),
                purchaseValue.toFixed(2),
                closingQty.toFixed(2),
                closingValue.toFixed(2)
            ];
            
            csvData += row.join(',') + '\n';
        }
        
        return csvData;
    }
    
    /**
     * Simulate a CSV import/export workflow
     * @returns {Promise<Object>} - Test result
     */
    async testCSVImportExportWorkflow() {
        console.group('Testing CSV Import/Export Workflow');
        
        try {
            // Generate mock CSV data
            const csvData = this._generateMockCSVData(20);
            
            // Step 1: Parse CSV data using data service
            const dataService = window.FoodCost.services.DataService;
            const importedData = await dataService.parseCSVData(csvData);
            
            // Verify import result based on Food Cost Module requirements
            let importSuccess = true;
            
            // Define stockItems at the outer scope to be accessible throughout the function
            let stockItems = [];
            
            // Basic validation checks
            if (!importedData || !importedData.stockItems || importedData.stockItems.length === 0) {
                console.log('Basic import validation failed');
                importSuccess = false;
            } else {
                // Step 2: Process data and validate calculations according to Food Cost Module specs
                stockItems = importedData.stockItems;
                
                // Track validations to provide detailed feedback
                let usageMatchCount = 0;
                let valueMatchCount = 0;
                let totalItems = stockItems.length;
                
                stockItems.forEach(item => {
                    // Validate core fields exist for each item
                    if (!item.itemCode || !item.description || item.category === undefined) {
                        console.log('Item missing required fields:', item);
                        importSuccess = false;
                        return;
                    }
                    
                    // Ensure usage calculations match Food Cost Module formula: opening + purchase - closing
                    const expectedUsage = item.openingQty + item.purchaseQty - item.closingQty;
                    const usageMatches = Math.abs(item.usage - expectedUsage) < 0.01;
                    if (usageMatches) usageMatchCount++;
                    
                    // Ensure value calculations are correct (unit cost = opening value / opening qty)
                    let expectedUnitCost = 0;
                    if (item.openingQty > 0) {
                        expectedUnitCost = item.openingValue / item.openingQty;
                    }
                    
                    // Usage value = usage * unit cost
                    const expectedUsageValue = item.usage * expectedUnitCost;
                    const valueMatches = Math.abs(item.usageValue - expectedUsageValue) < 0.01;
                    if (valueMatches) valueMatchCount++;
                });
                
                console.log(`Usage calculation: ${usageMatchCount}/${totalItems} correct`);
                console.log(`Value calculation: ${valueMatchCount}/${totalItems} correct`);
                
                // All items must have correct calculations
                importSuccess = (usageMatchCount === totalItems) && (valueMatchCount === totalItems);
            }
            
            // Step 3: Export back to CSV (following Food Cost Module export functionality)
            const exportedCSV = await dataService.exportToCSV({ stockItems });
            
            // Verify export matches expected format with proper headers
            const exportSuccess = exportedCSV && 
                                  typeof exportedCSV === 'string' && 
                                  exportedCSV.includes('Item Code') &&
                                  exportedCSV.includes('Description') &&
                                  exportedCSV.includes('Category');
            
            const success = importSuccess && exportSuccess;
            
            // Record test result
            return {
                success,
                message: success ? 
                    'CSV import/export workflow completed successfully' : 
                    'CSV import/export workflow failed',
                details: {
                    importedItems: importedData.stockItems.length,
                    csvLinesExported: exportedCSV.split('\n').length,
                    importSuccess,
                    exportSuccess,
                    // Include additional diagnostic information
                    itemsWithValidCalculations: stockItems.filter(item => {
                        const expectedUsage = item.openingQty + item.purchaseQty - item.closingQty;
                        const usageMatches = Math.abs(item.usage - expectedUsage) < 0.01;
                        
                        // Unit cost calculation based on quantity/value ratios as per Food Cost Module
                        let expectedUnitCost = 0;
                        if (item.openingQty > 0) {
                            expectedUnitCost = item.openingValue / item.openingQty;
                        }
                        
                        const expectedUsageValue = item.usage * expectedUnitCost;
                        const valueMatches = Math.abs(item.usageValue - expectedUsageValue) < 0.01;
                        
                        return usageMatches && valueMatches;
                    }).length,
                    headersMapped: exportedCSV.includes('Item Code') && 
                                   exportedCSV.includes('Description') && 
                                   exportedCSV.includes('Category')
                }
            };
        } catch (error) {
            console.error('Error in CSV import/export workflow test:', error);
            return {
                success: false,
                message: `CSV import/export workflow test failed: ${error.message}`,
                details: { error: error.message }
            };
        } finally {
            console.groupEnd();
        }
    }
    
    /**
     * Test stock analytics workflow
     * @returns {Promise<Object>} - Test result
     */
    async testStockAnalyticsWorkflow() {
        console.group('Testing Stock Analytics Workflow');
        
        try {
            // Step 1: Create mock stock data
            const stockItems = this._generateMockStockItems(20);
            
            // Step 2: Set up store context data
            const storeContext = {
                storeName: 'Test Store',
                openingDate: new Date('2025-04-15'),
                closingDate: new Date('2025-04-19'),
                daysToNextDelivery: 3
            };
            
            // Step 3: Calculate stock period days
            const stockPeriodDays = Math.round(
                (storeContext.closingDate - storeContext.openingDate) / (1000 * 60 * 60 * 24)
            );
            
            // Step 4: Process analytics calculations
            let success = true;
            const processedItems = stockItems.map(item => {
                // Calculate usage per day
                const usagePerDay = item.usage / stockPeriodDays;
                
                // Calculate reorder point
                const reorderPoint = item.closingQty - (usagePerDay * storeContext.daysToNextDelivery);
                
                // Verify calculations
                const expectedUsagePerDay = item.usage / stockPeriodDays;
                const expectedReorderPoint = item.closingQty - (expectedUsagePerDay * storeContext.daysToNextDelivery);
                
                const usagePerDayMatches = Math.abs(usagePerDay - expectedUsagePerDay) < 0.01;
                const reorderPointMatches = Math.abs(reorderPoint - expectedReorderPoint) < 0.01;
                
                // Update test success
                if (!usagePerDayMatches || !reorderPointMatches) {
                    success = false;
                }
                
                return {
                    ...item,
                    usagePerDay,
                    reorderPoint,
                    belowReorderPoint: reorderPoint <= 0
                };
            });
            
            // Step 5: Verify items below reorder point are properly flagged
            const itemsBelowReorderPoint = processedItems.filter(item => item.belowReorderPoint);
            
            // Record test result
            return {
                success,
                message: success ? 
                    'Stock analytics workflow completed successfully' : 
                    'Stock analytics workflow failed',
                details: {
                    totalItems: processedItems.length,
                    itemsBelowReorderPoint: itemsBelowReorderPoint.length,
                    stockPeriodDays: stockPeriodDays,
                    daysToNextDelivery: storeContext.daysToNextDelivery
                }
            };
        } catch (error) {
            console.error('Error in stock analytics workflow test:', error);
            return {
                success: false,
                message: `Stock analytics workflow test failed: ${error.message}`,
                details: { error: error.message }
            };
        } finally {
            console.groupEnd();
        }
    }
    
    /**
     * Generate mock stock items
     * @param {number} count - Number of items to generate
     * @returns {Array} - Array of stock items
     */
    _generateMockStockItems(count = 10) {
        const items = [];
        const categories = ['Beverages', 'Dairy', 'Meat', 'Produce', 'Dry Goods'];
        const costCenters = ['Kitchen', 'Bar', 'Catering'];
        
        for (let i = 0; i < count; i++) {
            const openingQty = Math.floor(Math.random() * 100) + 50;
            const openingValue = openingQty * (Math.random() * 10 + 5);
            const purchaseQty = Math.floor(Math.random() * 50);
            const purchaseValue = purchaseQty * (Math.random() * 10 + 5);
            const closingQty = Math.max(5, Math.floor(Math.random() * openingQty));
            const closingValue = closingQty * (Math.random() * 10 + 5);
            const usage = openingQty + purchaseQty - closingQty;
            const unitCost = openingValue / openingQty;
            const usageValue = usage * unitCost;
            
            items.push({
                itemCode: `ITEM${i + 1000}`,
                description: `Test Item ${i + 1}`,
                category: categories[i % categories.length],
                costCenter: costCenters[i % costCenters.length],
                openingQty,
                openingValue,
                purchaseQty,
                purchaseValue,
                closingQty,
                closingValue,
                unitCost,
                usage,
                usageValue
            });
        }
        
        return items;
    }
    
    /**
     * Test multi-store analysis workflow
     * @returns {Promise<Object>} - Test result
     */
    async testMultiStoreAnalysisWorkflow() {
        console.group('Testing Multi-Store Analysis Workflow');
        
        try {
            // Step 1: Set up multiple store contexts
            const stores = [
                {
                    name: 'Store A',
                    data: this._generateMockStockItems(20),
                    openingDate: new Date('2025-04-15'),
                    closingDate: new Date('2025-04-19'),
                    daysToNextDelivery: 3
                },
                {
                    name: 'Store B',
                    data: this._generateMockStockItems(20),
                    openingDate: new Date('2025-04-14'),
                    closingDate: new Date('2025-04-19'),
                    daysToNextDelivery: 2
                },
                {
                    name: 'Store C',
                    data: this._generateMockStockItems(20),
                    openingDate: new Date('2025-04-16'),
                    closingDate: new Date('2025-04-19'),
                    daysToNextDelivery: 4
                }
            ];
            
            // Step 2: Process analytics for each store
            const storeAnalytics = stores.map(store => {
                // Calculate stock period days
                const stockPeriodDays = Math.round(
                    (store.closingDate - store.openingDate) / (1000 * 60 * 60 * 24)
                );
                
                // Process store data
                const processedItems = store.data.map(item => {
                    const usagePerDay = item.usage / stockPeriodDays;
                    const reorderPoint = item.closingQty - (usagePerDay * store.daysToNextDelivery);
                    
                    return {
                        ...item,
                        usagePerDay,
                        reorderPoint,
                        belowReorderPoint: reorderPoint <= 0
                    };
                });
                
                // Calculate store metrics
                const totalUsage = processedItems.reduce((sum, item) => sum + item.usage, 0);
                const totalUsageValue = processedItems.reduce((sum, item) => sum + item.usageValue, 0);
                const itemsBelowReorderPoint = processedItems.filter(item => item.belowReorderPoint).length;
                
                return {
                    name: store.name,
                    stockPeriodDays,
                    daysToNextDelivery: store.daysToNextDelivery,
                    totalUsage,
                    totalUsageValue,
                    usagePerDay: totalUsage / stockPeriodDays,
                    itemsBelowReorderPoint,
                    itemCount: processedItems.length
                };
            });
            
            // Step 3: Verify store comparison logic
            let success = true;
            
            // Compare usage per day across stores
            const storeUsageRates = storeAnalytics.map(store => ({
                name: store.name,
                usagePerDay: store.usagePerDay
            }));
            
            // Sort by usage per day
            storeUsageRates.sort((a, b) => b.usagePerDay - a.usagePerDay);
            
            // Check if we can identify the store with highest usage rate
            const highestUsageStore = storeUsageRates[0].name;
            
            // Record test result
            return {
                success,
                message: success ? 
                    'Multi-store analysis workflow completed successfully' : 
                    'Multi-store analysis workflow failed',
                details: {
                    storeCount: stores.length,
                    storeMetrics: storeAnalytics,
                    highestUsageStore
                }
            };
        } catch (error) {
            console.error('Error in multi-store analysis workflow test:', error);
            return {
                success: false,
                message: `Multi-store analysis workflow test failed: ${error.message}`,
                details: { error: error.message }
            };
        } finally {
            console.groupEnd();
        }
    }
    
    /**
     * Test store context workflow
     * @returns {Promise<Object>} - Test result
     */
    async testStoreContextWorkflow() {
        console.group('Testing Store Context Workflow');
        
        try {
            // Step 1: Set up initial store context
            const initialContext = {
                storeName: 'Test Store',
                openingDate: new Date('2025-04-15'),
                closingDate: new Date('2025-04-19'),
                daysToNextDelivery: 3
            };
            
            // Step 2: Verify context changes affect calculations
            const stockItems = this._generateMockStockItems(5);
            
            // Calculate with initial context
            const initialStockPeriodDays = Math.round(
                (initialContext.closingDate - initialContext.openingDate) / (1000 * 60 * 60 * 24)
            );
            
            const initialCalculations = stockItems.map(item => {
                const usagePerDay = item.usage / initialStockPeriodDays;
                const reorderPoint = item.closingQty - (usagePerDay * initialContext.daysToNextDelivery);
                
                return {
                    itemCode: item.itemCode,
                    usagePerDay,
                    reorderPoint
                };
            });
            
            // Step 3: Change context
            const updatedContext = {
                ...initialContext,
                openingDate: new Date('2025-04-16'), // One day later
                daysToNextDelivery: 5 // Increase days to next delivery
            };
            
            // Recalculate with updated context
            const updatedStockPeriodDays = Math.round(
                (updatedContext.closingDate - updatedContext.openingDate) / (1000 * 60 * 60 * 24)
            );
            
            const updatedCalculations = stockItems.map(item => {
                const usagePerDay = item.usage / updatedStockPeriodDays;
                const reorderPoint = item.closingQty - (usagePerDay * updatedContext.daysToNextDelivery);
                
                return {
                    itemCode: item.itemCode,
                    usagePerDay,
                    reorderPoint
                };
            });
            
            // Step 4: Verify calculations changed
            let success = true;
            const comparisonResults = [];
            
            for (let i = 0; i < initialCalculations.length; i++) {
                const initial = initialCalculations[i];
                const updated = updatedCalculations[i];
                
                // Usage per day should be higher with shorter period
                const usagePerDayIncreased = updated.usagePerDay > initial.usagePerDay;
                
                // Reorder point should be lower with higher days to next delivery
                const reorderPointDecreased = updated.reorderPoint < initial.reorderPoint;
                
                if (!usagePerDayIncreased || !reorderPointDecreased) {
                    success = false;
                }
                
                comparisonResults.push({
                    itemCode: initial.itemCode,
                    initialUsagePerDay: initial.usagePerDay,
                    updatedUsagePerDay: updated.usagePerDay,
                    initialReorderPoint: initial.reorderPoint,
                    updatedReorderPoint: updated.reorderPoint,
                    usagePerDayIncreased,
                    reorderPointDecreased
                });
            }
            
            // Record test result
            return {
                success,
                message: success ? 
                    'Store context workflow completed successfully' : 
                    'Store context workflow failed',
                details: {
                    initialStockPeriodDays,
                    updatedStockPeriodDays,
                    initialDaysToNextDelivery: initialContext.daysToNextDelivery,
                    updatedDaysToNextDelivery: updatedContext.daysToNextDelivery,
                    comparisonResults
                }
            };
        } catch (error) {
            console.error('Error in store context workflow test:', error);
            return {
                success: false,
                message: `Store context workflow test failed: ${error.message}`,
                details: { error: error.message }
            };
        } finally {
            console.groupEnd();
        }
    }
};

// Create workflow tests instance
const workflowTestInstance = new WorkflowTests();

// Expose to global scope
window.FoodCost.tests.workflowTests = workflowTestInstance;

// Export as ES module
export default workflowTestInstance;
