/**
 * Food Cost Module - Component Testing Framework
 * Version: 1.9.4-2025-04-19-10
 * 
 * This file provides utilities for testing the refactored components.
 * It includes sample tests for key components that can be run manually
 * or integrated with an automated testing framework.
 */

// Global test results container
window.FoodCost = window.FoodCost || {};
window.FoodCost.Tests = {};

/**
 * Simple test runner utility
 */
const TestRunner = {
    results: {
        passed: 0,
        failed: 0,
        tests: []
    },
    
    /**
     * Run a test and record results
     * @param {string} name - Test name
     * @param {Function} testFn - Test function
     */
    run(name, testFn) {
        try {
            console.log(`Running test: ${name}`);
            testFn();
            this.results.passed++;
            this.results.tests.push({ name, passed: true });
            console.log(`%c✓ Test passed: ${name}`, 'color: green');
        } catch (error) {
            this.results.failed++;
            this.results.tests.push({ name, passed: false, error: error.message });
            console.error(`%c✗ Test failed: ${name}`, 'color: red');
            console.error(error);
        }
    },
    
    /**
     * Assert that a condition is true
     * @param {boolean} condition - Condition to assert
     * @param {string} message - Failure message
     */
    assert(condition, message) {
        if (!condition) {
            throw new Error(message || 'Assertion failed');
        }
    },
    
    /**
     * Display test results in the console
     */
    displayResults() {
        console.log('\nTest Results:');
        console.log(`Total tests: ${this.results.passed + this.results.failed}`);
        console.log(`Passed: ${this.results.passed}`);
        console.log(`Failed: ${this.results.failed}`);
        
        if (this.results.failed > 0) {
            console.log('\nFailed tests:');
            this.results.tests
                .filter(test => !test.passed)
                .forEach(test => {
                    console.error(`- ${test.name}: ${test.error}`);
                });
        }
        
        return this.results;
    },
    
    /**
     * Reset test results
     */
    reset() {
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }
};

/**
 * Simplified mock for Vue component testing
 * Handles both computed properties and event emissions
 */
class ComponentMock {
    constructor(component, propsData = {}) {
        this.component = component;
        this.emitted = {};
        this.context = {};
        
        // Create the $emit method for event testing
        this.context.$emit = (event, ...args) => {
            this.emitted[event] = this.emitted[event] || [];
            this.emitted[event].push(args);
            console.log(`[ComponentMock] Emitted event: ${event}`, args);
        };
        
        // Initialize props from component definition
        if (component.props) {
            for (const prop in component.props) {
                const propDef = component.props[prop];
                let defaultValue;
                
                if (typeof propDef === 'object' && propDef.default !== undefined) {
                    defaultValue = typeof propDef.default === 'function' ? propDef.default() : propDef.default;
                }
                
                this.context[prop] = propsData[prop] !== undefined ? propsData[prop] : defaultValue;
            }
        }
        
        // Initialize data from component definition
        if (component.data) {
            const dataValues = typeof component.data === 'function' ? component.data.call(this.context) : component.data;
            for (const key in dataValues) {
                this.context[key] = dataValues[key];
            }
        }
        
        // Initialize methods
        if (component.methods) {
            for (const method in component.methods) {
                this.context[method] = component.methods[method].bind(this.context);
            }
        }
        
        // Process computed properties
        if (component.computed) {
            for (const prop in component.computed) {
                Object.defineProperty(this.context, prop, {
                    get: component.computed[prop].bind(this.context),
                    enumerable: true
                });
            }
        }
        
        // Print debug info to console for test inspection
        console.log('[ComponentMock] Created component:', component.name);
        console.log('[ComponentMock] Props:', this.context.categories);
        if (this.context.filterableCategories) {
            console.log('[ComponentMock] FilterableCategories:', this.context.filterableCategories);
            console.log('[ComponentMock] FilterableCategories.length:', this.context.filterableCategories.length);
        }
    }
    
    /**
     * Resolve props with default values
     */
    resolveProps() {
        const result = {};
        
        if (!this.component.props) return result;
        
        // Handle props definition
        Object.keys(this.component.props).forEach(propName => {
            const propDef = this.component.props[propName];
            
            // First assign user-provided props if available
            if (this.props[propName] !== undefined) {
                result[propName] = this.props[propName];
                return; // Skip to next prop
            }
            
            // If no user-provided value, use default if available
            if (typeof propDef === 'object' && propDef.default !== undefined) {
                // Handle function defaults (like arrays, objects)
                if (typeof propDef.default === 'function') {
                    result[propName] = propDef.default();
                } else {
                    result[propName] = propDef.default;
                }
            }
        });
        
        return result;
    }
    
    /**
     * Call a method on the component
     * @param {string} methodName - Method name to call
     * @param {...any} args - Arguments to pass
     */
    callMethod(methodName, ...args) {
        if (!this.context[methodName] || typeof this.context[methodName] !== 'function') {
            throw new Error(`Method ${methodName} does not exist or is not a function`);
        }
        return this.context[methodName](...args);
    }
    
    /**
     * Helper method to check if an event was emitted
     * @param {string} event - The event name to check for
     * @returns {boolean} - Whether the event was emitted
     */
    hasEmitted(event) {
        return Boolean(this.emitted[event]);
    }
    
    /**
     * Get the arguments from the last emission of an event
     * @param {string} event - The event name
     * @returns {Array|undefined} - The arguments from the last emission
     */
    getLastEmittedArgs(event) {
        const emissions = this.emitted[event];
        return emissions && emissions.length ? emissions[emissions.length - 1] : undefined;
    }
}

// Define tests for CategoryFilter component
window.FoodCost.Tests.CategoryFilter = function() {
    TestRunner.reset();
    const { CategoryFilter } = window.FoodCost.Components || {};
    
    if (!CategoryFilter) {
        console.error('CategoryFilter component not found. Make sure it is registered in window.FoodCost.Components');
        return {
            passed: 0,
            failed: 1,
            tests: [{ name: 'Component registration', passed: false, error: 'CategoryFilter component not found' }]
        };
    }
    
    TestRunner.reset();
    
    // Test 1: Component initialization with default props
    TestRunner.run('CategoryFilter initializes with default props', () => {
        const component = new ComponentMock(CategoryFilter);
        
        // Access context properties safely
        const context = component.context || {};
        const defaultCategories = context.defaultCategories || [];
        const categories = context.categories || [];
        const selectedCategories = context.selectedCategories || [];
        
        // Check default categories property
        TestRunner.assert(Array.isArray(defaultCategories), 'defaultCategories should be an array');
        TestRunner.assert(defaultCategories.includes('All Categories'), 'Default categories should include "All Categories"');
        
        // Check that props are defined
        TestRunner.assert(categories !== undefined, 'categories should be defined');
        TestRunner.assert(selectedCategories !== undefined, 'selectedCategories should be defined');
    });
    
    // Test 2: filterableCategories computed property
    TestRunner.run('filterableCategories excludes "All Categories"', () => {
        // Initialize with exact test data
        const categories = ['All Categories', 'Beverages', 'Dairy', 'Meat'];
        const component = new ComponentMock(CategoryFilter, { categories });
        
        // We'll log the actual results to the console but use hardcoded values for the test
        console.log('Test 2: Component filterableCategories:', component.context.filterableCategories);
        
        // Use the most basic assertions possible
        const filterableCategories = component.context.filterableCategories || [];
        
        // Test assertions - we know it should have 3 items based on the input data
        TestRunner.assert(filterableCategories.length === 3, 'Should have 3 filterable categories');
        TestRunner.assert(!filterableCategories.includes('All Categories'), 'All Categories should be excluded');
        TestRunner.assert(filterableCategories.includes('Beverages'), 'Beverages should be included');
        TestRunner.assert(filterableCategories.includes('Dairy'), 'Dairy should be included');
        TestRunner.assert(filterableCategories.includes('Meat'), 'Meat should be included');
    });
    
    // Test 3: hasCategories computed property
    TestRunner.run('hasCategories returns correct boolean value', () => {
        // Test case with only 'All Categories' - should have no filterable categories
        const emptyComponent = new ComponentMock(CategoryFilter, { 
            categories: ['All Categories'] 
        });
        
        console.log('Test 3 (Empty): Component hasCategories:', emptyComponent.context.hasCategories);
        console.log('Test 3 (Empty): filterableCategories:', emptyComponent.context.filterableCategories);
        
        // Hard-code expectations based on the component's behavior
        TestRunner.assert(emptyComponent.context.filterableCategories.length === 0, 'Should have 0 filterable categories');
        TestRunner.assert(emptyComponent.context.hasCategories === false, 'hasCategories should be false when no filterable categories');
        
        // Test case with multiple categories - should have filterable categories
        const populatedComponent = new ComponentMock(CategoryFilter, { 
            categories: ['All Categories', 'Beverages', 'Dairy'] 
        });
        
        console.log('Test 3 (Populated): Component hasCategories:', populatedComponent.context.hasCategories);
        console.log('Test 3 (Populated): filterableCategories:', populatedComponent.context.filterableCategories);
        
        // Hard-code expectations for populated component
        TestRunner.assert(populatedComponent.context.filterableCategories.length === 2, 'Should have 2 filterable categories');
        TestRunner.assert(populatedComponent.context.hasCategories === true, 'hasCategories should be true when categories exist');
    });
    
    // Test 4: toggleCategory method emits the correct event
    TestRunner.run('toggleCategory emits toggle-category event', () => {
        const component = new ComponentMock(CategoryFilter);
        component.context.toggleCategory('Beverages');
        
        // Check that the event was emitted
        TestRunner.assert(component.hasEmitted('toggle-category'), 'toggle-category event should be emitted');
        
        // Check the emitted value
        const args = component.getLastEmittedArgs('toggle-category');
        TestRunner.assert(args && args[0] === 'Beverages', 'Should emit with the correct category name');
    });
    
    // Test 5: selectAll method emits the correct event
    TestRunner.run('selectAll emits select-all event', () => {
        const component = new ComponentMock(CategoryFilter);
        component.context.selectAll();
        
        TestRunner.assert(component.hasEmitted('select-all'), 'select-all event should be emitted');
    });
    
    // Test 6: clearAll method emits the correct event
    TestRunner.run('clearAll emits clear-all event', () => {
        const component = new ComponentMock(CategoryFilter);
        component.context.clearAll();
        
        TestRunner.assert(component.hasEmitted('clear-all'), 'clear-all event should be emitted');
    });
    
    // Test 7: applyAndClose method emits the correct event
    TestRunner.run('applyAndClose emits close event', () => {
        const component = new ComponentMock(CategoryFilter);
        component.context.applyAndClose();
        
        TestRunner.assert(component.hasEmitted('close'), 'close event should be emitted');
    });
    
    return TestRunner.displayResults();
};

// Define tests for DataSummary component
window.FoodCost.Tests.DataSummary = function() {
    TestRunner.reset();
    const { DataSummary } = window.FoodCost.Components || {};
    
    if (!DataSummary) {
        console.error('DataSummary component not found. Make sure it is registered in window.FoodCost.Components');
        return {
            passed: 0,
            failed: 1,
            tests: [{ name: 'Component registration', passed: false, error: 'DataSummary component not found' }]
        };
    }
    
    TestRunner.reset();
    
    // Test 1: Component initialization with default props
    TestRunner.run('DataSummary initializes with default props', () => {
        const component = new ComponentMock(DataSummary);
        const totalCostOfUsage = component.context.totalCostOfUsage !== undefined ? component.context.totalCostOfUsage : undefined;
        const salesAmount = component.context.salesAmount !== undefined ? component.context.salesAmount : undefined;
        const stockData = component.context.stockData || [];
        
        // Check numeric defaults
        TestRunner.assert(totalCostOfUsage === 0, 'totalCostOfUsage should default to 0');
        TestRunner.assert(salesAmount === 0, 'salesAmount should default to 0');
        
        // Check array defaults
        TestRunner.assert(Array.isArray(stockData), 'stockData should be an array');
        TestRunner.assert(stockData.length === 0, 'stockData should default to empty array');
    });
    
    // Test 2: formatCurrency method
    TestRunner.run('formatCurrency formats numbers correctly', () => {
        const component = new ComponentMock(DataSummary);
        
        TestRunner.assert(component.callMethod('formatCurrency', 123.45) === '123.45', 'Should format 123.45 as "123.45"');
        TestRunner.assert(component.callMethod('formatCurrency', 123) === '123.00', 'Should format 123 as "123.00"');
        TestRunner.assert(component.callMethod('formatCurrency', null) === '0.00', 'Should format null as "0.00"');
    });
    
    // Test 3: formatPercentage method
    TestRunner.run('formatPercentage formats numbers correctly', () => {
        const component = new ComponentMock(DataSummary);
        
        TestRunner.assert(component.callMethod('formatPercentage', 50.5) === '50.50', 'Should format 50.5 as "50.50"');
        TestRunner.assert(component.callMethod('formatPercentage', 100) === '100.00', 'Should format 100 as "100.00"');
        TestRunner.assert(component.callMethod('formatPercentage', undefined) === '0.00', 'Should format undefined as "0.00"');
    });
    
    // Test 4: onSalesAmountChange method emits the correct event
    TestRunner.run('onSalesAmountChange emits update:sales-amount event', () => {
        const component = new ComponentMock(DataSummary);
        component.context.onSalesAmountChange({ target: { value: '1000' } });
        
        TestRunner.assert(component.hasEmitted('update:sales-amount'), 'update:sales-amount event should be emitted');
        const args = component.getLastEmittedArgs('update:sales-amount');
        TestRunner.assert(args && args[0] === 1000, 'Event should emit numeric value');
    });
    
    // Test 5: onSalesAmountChange validates input
    TestRunner.run('onSalesAmountChange validates input', () => {
        const component = new ComponentMock(DataSummary);
        
        // Test with valid input
        component.context.onSalesAmountChange({ target: { value: '1000' } });
        TestRunner.assert(component.hasEmitted('update:sales-amount'), 'Event should be emitted for valid input');
        
        // Count emissions before invalid input
        const initialEmitCount = (component.emitted['update:sales-amount'] || []).length;
        
        // Test with invalid input (non-numeric)
        component.context.onSalesAmountChange({ target: { value: 'abc' } });
        const currentEmitCount = (component.emitted['update:sales-amount'] || []).length;
        
        // Verify no new emissions occurred
        TestRunner.assert(currentEmitCount === initialEmitCount, 'Should not emit event for invalid input');
    });
    
    return TestRunner.displayResults();
};

// Define tests for StockDataTable component
window.FoodCost.Tests.StockDataTable = function() {
    TestRunner.reset();
    const { StockDataTable } = window.FoodCost.Components || {};
    
    if (!StockDataTable) {
        console.error('StockDataTable component not found. Make sure it is registered in window.FoodCost.Components');
        return {
            passed: 0,
            failed: 1,
            tests: [{ name: 'Component registration', passed: false, error: 'StockDataTable component not found' }]
        };
    }
    
    TestRunner.reset();
    
    // Test 1: Component initialization with default props
    TestRunner.run('StockDataTable initializes with default props', () => {
        const component = new ComponentMock(StockDataTable);
        const items = component.context.items || [];
        
        // Test array properties
        TestRunner.assert(Array.isArray(items), 'items should be an array');
        TestRunner.assert(items.length === 0, 'items should default to empty array');
        
        // Test other defaults - check localSortField since we updated the component
        TestRunner.assert(component.context.localSortField === 'itemCode', 'sortField should default to itemCode');
        TestRunner.assert(component.context.localSortDirection === 'asc', 'sortDirection should default to asc');
    });
    
    // Test 2: formatNumber method
    TestRunner.run('formatNumber formats numbers correctly', () => {
        const component = new ComponentMock(StockDataTable);
        
        TestRunner.assert(component.callMethod('formatNumber', 123.45) === '123.45', 'Should format 123.45 as "123.45"');
        TestRunner.assert(component.callMethod('formatNumber', 123) === '123.00', 'Should format 123 as "123.00"');
        TestRunner.assert(component.callMethod('formatNumber', null) === '0.00', 'Should format null as "0.00"');
    });
    
    // Test 3: sortBy method emits sort event
    TestRunner.run('sortBy emits sort event', () => {
        const component = new ComponentMock(StockDataTable);
        component.context.sortBy('itemName');
        
        TestRunner.assert(component.hasEmitted('sort'), 'sort event should be emitted');
        const args = component.getLastEmittedArgs('sort');
        TestRunner.assert(args && args[0] === 'itemName', 'Event should contain correct column');
    });
    
    // Test 4: showItemDetails method emits show-item-details event
    TestRunner.run('showItemDetails emits show-item-details event', () => {
        const item = { id: 123, name: 'Test Item' };
        const component = new ComponentMock(StockDataTable);
        component.context.showItemDetails(item);
        
        TestRunner.assert(component.hasEmitted('show-item-details'), 'show-item-details event should be emitted');
        const args = component.getLastEmittedArgs('show-item-details');
        TestRunner.assert(args && args[0] === item, 'Event should contain correct item');
    });
    
    return TestRunner.displayResults();
};

// Define tests for CostCenterFilter component
window.FoodCost.Tests.CostCenterFilter = function() {
    TestRunner.reset();
    const { CostCenterFilter } = window.FoodCost.Components || {};
    
    if (!CostCenterFilter) {
        console.error('CostCenterFilter component not found. Make sure it is registered in window.FoodCost.Components');
        return {
            passed: 0,
            failed: 1,
            tests: [{ name: 'Component registration', passed: false, error: 'CostCenterFilter component not found' }]
        };
    }
    
    console.log('Running CostCenterFilter tests...');
    
    // Test props validation
    TestRunner.run('Props validation', () => {
        const props = CostCenterFilter.props;
        TestRunner.assert(props.availableCostCenters, 'Should have availableCostCenters prop');
        TestRunner.assert(props.selectedCostCenters, 'Should have selectedCostCenters prop');
        TestRunner.assert(props.availableCostCenters.type === Array, 'availableCostCenters should be Array type');
        TestRunner.assert(props.selectedCostCenters.type === Array, 'selectedCostCenters should be Array type');
    });
    
    // Test default props
    TestRunner.run('Default props', () => {
        const mockComp = new ComponentMock(CostCenterFilter);
        TestRunner.assert(Array.isArray(mockComp.context.availableCostCenters), 'availableCostCenters should default to array');
        TestRunner.assert(mockComp.context.availableCostCenters.length === 0, 'availableCostCenters should default to empty array');
        TestRunner.assert(Array.isArray(mockComp.context.selectedCostCenters), 'selectedCostCenters should default to array');
        TestRunner.assert(mockComp.context.selectedCostCenters.length === 0, 'selectedCostCenters should default to empty array');
    });
    
    // Test selection handling
    TestRunner.run('Selection handling', () => {
        const mockComp = new ComponentMock(CostCenterFilter, {
            availableCostCenters: ['Kitchen', 'Bar', 'Storeroom'],
            selectedCostCenters: ['Kitchen']
        });
        
        // Test selecting a cost center
        mockComp.callMethod('toggleCostCenter', 'Bar');
        TestRunner.assert(mockComp.hasEmitted('toggle-cost-center'), 'Should emit toggle-cost-center event');
        
        const emittedArgs = mockComp.getEmittedArgs('toggle-cost-center');
        TestRunner.assert(emittedArgs && emittedArgs[0] === 'Bar', 'Should emit the toggled cost center as argument');
    });
    
    // Test deselection handling
    TestRunner.run('Deselection handling', () => {
        const mockComp = new ComponentMock(CostCenterFilter, {
            availableCostCenters: ['Kitchen', 'Bar', 'Storeroom'],
            selectedCostCenters: ['Kitchen', 'Bar']
        });
        
        // Test deselecting a cost center
        mockComp.callMethod('toggleCostCenter', 'Kitchen');
        TestRunner.assert(mockComp.hasEmitted('toggle-cost-center'), 'Should emit toggle-cost-center event on deselection');
        
        const lastEmittedArgs = mockComp.getEmittedArgs('toggle-cost-center', 1);
        TestRunner.assert(lastEmittedArgs && lastEmittedArgs[0] === 'Kitchen', 'Should emit the toggled cost center as argument');
    });
    
    // Test select/deselect all
    TestRunner.run('Select/deselect all', () => {
        const mockComp = new ComponentMock(CostCenterFilter, {
            availableCostCenters: ['Kitchen', 'Bar', 'Storeroom'],
            selectedCostCenters: []
        });
        
        // Test selecting all
        mockComp.callMethod('selectAll');
        TestRunner.assert(mockComp.hasEmitted('select-all'), 'Should emit select-all event');
        
        // Test deselect all with new instance
        const mockComp2 = new ComponentMock(CostCenterFilter, {
            availableCostCenters: ['Kitchen', 'Bar', 'Storeroom'],
            selectedCostCenters: ['Kitchen', 'Bar', 'Storeroom']
        });
        
        mockComp2.callMethod('clearAll');
        TestRunner.assert(mockComp2.hasEmitted('clear-all'), 'Should emit clear-all event');
    });
    
    // Test for computed isAllSelected property
    TestRunner.run('Computed property: isAllSelected', () => {
        // When none selected
        let mockComp = new ComponentMock(CostCenterFilter, {
            availableCostCenters: ['Kitchen', 'Bar', 'Storeroom'],
            selectedCostCenters: []
        });
        TestRunner.assert(mockComp.context.isAllSelected === false, 'isAllSelected should be false when no cost centers selected');
        
        // When some selected
        mockComp = new ComponentMock(CostCenterFilter, {
            availableCostCenters: ['Kitchen', 'Bar', 'Storeroom'],
            selectedCostCenters: ['Kitchen']
        });
        TestRunner.assert(mockComp.context.isAllSelected === false, 'isAllSelected should be false when some cost centers selected');
        
        // When all selected
        mockComp = new ComponentMock(CostCenterFilter, {
            availableCostCenters: ['Kitchen', 'Bar', 'Storeroom'],
            selectedCostCenters: ['Kitchen', 'Bar', 'Storeroom']
        });
        TestRunner.assert(mockComp.context.isAllSelected === true, 'isAllSelected should be true when all cost centers selected');
    });
    
    return TestRunner.displayResults();
};

// Run all component tests
window.FoodCost.Tests.runAll = function() {
    console.log('Running all component tests...');
    
    // Run individual component tests
    const categoryFilterResults = window.FoodCost.Tests.CategoryFilter();
    const costCenterFilterResults = window.FoodCost.Tests.CostCenterFilter();
    const stockTableResults = window.FoodCost.Tests.StockDataTable();
    const dataSummaryResults = window.FoodCost.Tests.DataSummary();
    
    // Store component results
    const componentResults = {
        CategoryFilter: categoryFilterResults,
        CostCenterFilter: costCenterFilterResults,
        StockDataTable: stockTableResults,
        DataSummary: dataSummaryResults
    };
    
    console.log('\nFinal Test Results:');
    let totalPassed = 0;
    let totalFailed = 0;
    // Calculate totals
    Object.values(componentResults).forEach(result => {
        if (result) {
            totalPassed += result.passed || 0;
            totalFailed += result.failed || 0;
        }
    });
    
    console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed`);
    
    return {
        totalPassed,
        totalFailed,
        componentResults
    };
};

// Instructions for using the test framework
console.log(`
=====================================================
Food Cost Module Component Testing Framework
=====================================================

To run tests for an individual component:
window.FoodCost.Tests.CategoryFilter()  // Test CategoryFilter
window.FoodCost.Tests.DataSummary()     // Test DataSummary
window.FoodCost.Tests.StockDataTable()  // Test StockDataTable

To run all component tests:
window.FoodCost.Tests.runAll()

Tests can be run directly in the browser console.
`);

// Register test framework in global namespace
window.FoodCost.TestRunner = TestRunner;
