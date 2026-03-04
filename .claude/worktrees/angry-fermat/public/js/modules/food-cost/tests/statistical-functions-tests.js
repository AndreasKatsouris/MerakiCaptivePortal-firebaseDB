/**
 * Statistical Functions Unit Tests
 * 
 * This file contains unit tests for the statistical functions used in the
 * historical-usage-service.js module.
 * 
 * Version: 2.0.0-2025-04-24
 */

/**
 * Unit Test Suite for Advanced Purchase Order statistical functions
 */
const StatisticalFunctionsTests = {
    /**
     * Test results
     */
    results: {
        status: 'pending',
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        testResults: {}
    },
    
    /**
     * Run all tests
     * @param {Function} updateUI - Function to update the UI with results
     */
    runTests(updateUI = null) {
        console.log('%c Running Statistical Functions Tests', 'background: #222; color: #bada55; padding: 5px;');
        
        this.results = {
            status: 'running',
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            testResults: {}
        };
        
        if (updateUI) updateUI(this.results);
        
        // Run all test suites
        this.testCalculateMean();
        this.testCalculateStandardDeviation();
        this.testCalculateVolatility();
        this.testCalculateTrend();
        this.testCalculateDayOfWeekPatterns();
        
        // Set overall status
        this.results.status = this.results.failedTests === 0 ? 'passed' : 'failed';
        
        console.log('%c Test Results: ', 'background: #222; color: #bada55; padding: 5px;');
        console.log(`Total Tests: ${this.results.totalTests}`);
        console.log(`Passed: ${this.results.passedTests}`);
        console.log(`Failed: ${this.results.failedTests}`);
        
        if (updateUI) updateUI(this.results);
        
        return this.results;
    },
    
    /**
     * Assert that a condition is true
     * @param {string} testName - Name of the test
     * @param {boolean} condition - Condition to assert
     * @param {string} message - Message to display if assertion fails
     * @param {any} expected - Expected value
     * @param {any} actual - Actual value
     * @returns {boolean} - Whether the assertion passed
     */
    assert(testName, condition, message, expected = null, actual = null) {
        this.results.totalTests++;
        
        const result = {
            name: testName,
            status: condition ? 'passed' : 'failed',
            message: condition ? 'Test passed' : message,
            expected,
            actual
        };
        
        if (condition) {
            this.results.passedTests++;
            console.log(`%c ✓ PASS: ${testName}`, 'color: green');
        } else {
            this.results.failedTests++;
            console.error(`✗ FAIL: ${testName} - ${message}`);
            console.error(`  Expected: ${expected}, Actual: ${actual}`);
        }
        
        this.results.testResults[testName] = result;
        return condition;
    },
    
    /**
     * Test the mean calculation function
     */
    testCalculateMean() {
        // Test case 1: Basic mean calculation
        const data1 = [10, 20, 30, 40, 50];
        const mean1 = this.calculateMean(data1);
        this.assert(
            'Mean Calculation - Basic',
            Math.abs(mean1 - 30) < 0.0001,
            'Mean calculation with basic data failed',
            30,
            mean1
        );
        
        // Test case 2: Mean with zero values
        const data2 = [0, 0, 5, 10, 15];
        const mean2 = this.calculateMean(data2);
        this.assert(
            'Mean Calculation - With Zeros',
            Math.abs(mean2 - 6) < 0.0001,
            'Mean calculation with zero values failed',
            6,
            mean2
        );
        
        // Test case 3: Mean with negative values
        const data3 = [-10, -5, 0, 5, 10];
        const mean3 = this.calculateMean(data3);
        this.assert(
            'Mean Calculation - With Negative Values',
            Math.abs(mean3 - 0) < 0.0001,
            'Mean calculation with negative values failed',
            0,
            mean3
        );
        
        // Test case 4: Empty array
        const data4 = [];
        const mean4 = this.calculateMean(data4);
        this.assert(
            'Mean Calculation - Empty Array',
            mean4 === 0,
            'Mean calculation with empty array should return 0',
            0,
            mean4
        );
        
        // Test case 5: Single value
        const data5 = [42];
        const mean5 = this.calculateMean(data5);
        this.assert(
            'Mean Calculation - Single Value',
            Math.abs(mean5 - 42) < 0.0001,
            'Mean calculation with single value failed',
            42,
            mean5
        );
    },
    
    /**
     * Test the standard deviation calculation function
     */
    testCalculateStandardDeviation() {
        // Test case 1: Basic standard deviation
        const data1 = [10, 20, 30, 40, 50];
        const mean1 = this.calculateMean(data1);
        const stdDev1 = this.calculateStandardDeviation(data1, mean1);
        this.assert(
            'Standard Deviation - Basic',
            Math.abs(stdDev1 - 15.811) < 0.001,
            'Standard deviation calculation with basic data failed',
            15.811,
            stdDev1
        );
        
        // Test case 2: All same values (should be 0)
        const data2 = [5, 5, 5, 5, 5];
        const mean2 = this.calculateMean(data2);
        const stdDev2 = this.calculateStandardDeviation(data2, mean2);
        this.assert(
            'Standard Deviation - All Same Values',
            Math.abs(stdDev2 - 0) < 0.0001,
            'Standard deviation with same values should be 0',
            0,
            stdDev2
        );
        
        // Test case 3: With negative values
        const data3 = [-10, -5, 0, 5, 10];
        const mean3 = this.calculateMean(data3);
        const stdDev3 = this.calculateStandardDeviation(data3, mean3);
        this.assert(
            'Standard Deviation - With Negative Values',
            Math.abs(stdDev3 - 7.906) < 0.001,
            'Standard deviation calculation with negative values failed',
            7.906,
            stdDev3
        );
        
        // Test case 4: Empty array or single value (should return 0)
        const data4 = [];
        const stdDev4 = this.calculateStandardDeviation(data4, 0);
        this.assert(
            'Standard Deviation - Empty Array',
            stdDev4 === 0,
            'Standard deviation with empty array should return 0',
            0,
            stdDev4
        );
        
        const data5 = [42];
        const stdDev5 = this.calculateStandardDeviation(data5, 42);
        this.assert(
            'Standard Deviation - Single Value',
            stdDev5 === 0,
            'Standard deviation with single value should return 0',
            0,
            stdDev5
        );
    },
    
    /**
     * Test the volatility calculation function
     */
    testCalculateVolatility() {
        // Test case 1: Basic volatility (coefficient of variation)
        const data1 = [10, 20, 30, 40, 50];
        const volatility1 = this.calculateVolatility(data1);
        this.assert(
            'Volatility - Basic',
            Math.abs(volatility1 - 0.527) < 0.001,
            'Volatility calculation with basic data failed',
            0.527,
            volatility1
        );
        
        // Test case 2: All same values (should be 0)
        const data2 = [5, 5, 5, 5, 5];
        const volatility2 = this.calculateVolatility(data2);
        this.assert(
            'Volatility - All Same Values',
            Math.abs(volatility2 - 0) < 0.0001,
            'Volatility with same values should be 0',
            0,
            volatility2
        );
        
        // Test case 3: Data with a mean of 0 (should handle gracefully)
        const data3 = [-10, -5, 0, 5, 10];
        const volatility3 = this.calculateVolatility(data3);
        this.assert(
            'Volatility - Mean Zero',
            isNaN(volatility3) || volatility3 === 0 || volatility3 === Infinity,
            'Volatility with zero mean should be handled gracefully',
            'NaN, 0, or Infinity',
            volatility3
        );
        
        // Test case 4: Empty array or single value (should return 0)
        const data4 = [];
        const volatility4 = this.calculateVolatility(data4);
        this.assert(
            'Volatility - Empty Array',
            volatility4 === 0,
            'Volatility with empty array should return 0',
            0,
            volatility4
        );
        
        const data5 = [42];
        const volatility5 = this.calculateVolatility(data5);
        this.assert(
            'Volatility - Single Value',
            volatility5 === 0,
            'Volatility with single value should return 0',
            0,
            volatility5
        );
    },
    
    /**
     * Test the trend calculation function
     */
    testCalculateTrend() {
        // Create test data with a clear increasing trend
        const increasingTrendData = [];
        const now = new Date();
        for (let i = 30; i > 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            increasingTrendData.push({
                date,
                usagePerDay: 10 + (i * 0.5) // Increasing trend
            });
        }
        
        // Create test data with a clear decreasing trend
        const decreasingTrendData = [];
        for (let i = 30; i > 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            decreasingTrendData.push({
                date,
                usagePerDay: 30 - (i * 0.5) // Decreasing trend
            });
        }
        
        // Create test data with no trend (flat)
        const flatTrendData = [];
        for (let i = 30; i > 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            flatTrendData.push({
                date,
                usagePerDay: 20 // Flat trend
            });
        }
        
        // Test case 1: Increasing trend
        const trend1 = this.calculateTrend(increasingTrendData);
        this.assert(
            'Trend - Increasing',
            trend1.direction === 'increasing' && trend1.slope > 0,
            'Failed to detect increasing trend',
            'increasing direction with positive slope',
            `${trend1.direction} direction with slope ${trend1.slope}`
        );
        
        // Test case 2: Decreasing trend
        const trend2 = this.calculateTrend(decreasingTrendData);
        this.assert(
            'Trend - Decreasing',
            trend2.direction === 'decreasing' && trend2.slope < 0,
            'Failed to detect decreasing trend',
            'decreasing direction with negative slope',
            `${trend2.direction} direction with slope ${trend2.slope}`
        );
        
        // Test case 3: Flat trend
        const trend3 = this.calculateTrend(flatTrendData);
        this.assert(
            'Trend - Flat',
            trend3.direction === 'stable' && Math.abs(trend3.slope) < 0.1,
            'Failed to detect flat trend',
            'stable direction with slope near 0',
            `${trend3.direction} direction with slope ${trend3.slope}`
        );
        
        // Test case 4: Insufficient data
        const trend4 = this.calculateTrend([{date: new Date(), usagePerDay: 10}]);
        this.assert(
            'Trend - Insufficient Data',
            trend4.direction === 'stable' && trend4.slope === 0,
            'Failed to handle insufficient data',
            'stable direction with slope 0',
            `${trend4.direction} direction with slope ${trend4.slope}`
        );
        
        // Test case 5: Empty array
        const trend5 = this.calculateTrend([]);
        this.assert(
            'Trend - Empty Array',
            trend5.direction === 'stable' && trend5.slope === 0,
            'Failed to handle empty array',
            'stable direction with slope 0',
            `${trend5.direction} direction with slope ${trend5.slope}`
        );
    },
    
    /**
     * Test the day-of-week patterns calculation function
     */
    testCalculateDayOfWeekPatterns() {
        // Create test data with clear day-of-week patterns
        const patternedData = [];
        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 60); // Go back 60 days
        
        for (let i = 0; i < 60; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dayOfWeek = date.getDay();
            
            // Create a pattern where weekends have lower usage
            const usagePerDay = dayOfWeek === 0 || dayOfWeek === 6 
                ? 10 // Lower on weekends (Saturday and Sunday)
                : 20; // Higher on weekdays
                
            patternedData.push({
                date,
                usagePerDay
            });
        }
        
        // Calculate day-of-week patterns
        const patterns = this.calculateDayOfWeekPatterns(patternedData);
        
        // Test case 1: Check if weekend days have lower indexes
        const weekendIndices = [patterns.sunday.index, patterns.saturday.index];
        const weekdayIndices = [
            patterns.monday.index, 
            patterns.tuesday.index, 
            patterns.wednesday.index, 
            patterns.thursday.index, 
            patterns.friday.index
        ];
        
        // Check if all weekend indices are less than weekday indices
        const allWeekendsLower = weekendIndices.every(weekend => 
            weekdayIndices.every(weekday => weekend < weekday)
        );
        
        this.assert(
            'Day-of-Week Patterns - Weekend vs Weekday',
            allWeekendsLower,
            'Failed to detect lower usage on weekends',
            'weekend indices < weekday indices',
            `weekend indices: ${weekendIndices}, weekday indices: ${weekdayIndices}`
        );
        
        // Test case 2: Check if average calculations are correct
        const expectedWeekendAvg = 10;
        const expectedWeekdayAvg = 20;
        
        const weekendAvgsCorrect = Math.abs(patterns.sunday.average - expectedWeekendAvg) < 0.1 &&
                                Math.abs(patterns.saturday.average - expectedWeekendAvg) < 0.1;
                                
        const weekdayAvgsCorrect = Math.abs(patterns.monday.average - expectedWeekdayAvg) < 0.1 &&
                                Math.abs(patterns.tuesday.average - expectedWeekdayAvg) < 0.1 &&
                                Math.abs(patterns.wednesday.average - expectedWeekdayAvg) < 0.1 &&
                                Math.abs(patterns.thursday.average - expectedWeekdayAvg) < 0.1 &&
                                Math.abs(patterns.friday.average - expectedWeekdayAvg) < 0.1;
        
        this.assert(
            'Day-of-Week Patterns - Average Calculations',
            weekendAvgsCorrect && weekdayAvgsCorrect,
            'Day-of-week average calculations are incorrect',
            `Weekend: ${expectedWeekendAvg}, Weekday: ${expectedWeekdayAvg}`,
            `Weekend: ${patterns.sunday.average}/${patterns.saturday.average}, Weekday: ${patterns.monday.average}/${patterns.tuesday.average}/${patterns.wednesday.average}/${patterns.thursday.average}/${patterns.friday.average}`
        );
        
        // Test case 3: Empty array
        const emptyPatterns = this.calculateDayOfWeekPatterns([]);
        this.assert(
            'Day-of-Week Patterns - Empty Array',
            emptyPatterns !== null && typeof emptyPatterns === 'object',
            'Failed to handle empty array',
            'object with default values',
            emptyPatterns
        );
    },
    
    /**
     * --- Implementation of statistical functions for testing ---
     * These implement the same algorithms as in historical-usage-service.js
     */
    
    /**
     * Calculate mean of an array of values
     * @param {Array} values - Array of numeric values
     * @returns {number} - Mean value
     */
    calculateMean(values) {
        if (!values || values.length === 0) return 0;
        
        const sum = values.reduce((acc, val) => acc + val, 0);
        return sum / values.length;
    },
    
    /**
     * Calculate standard deviation
     * @param {Array} values - Array of numeric values
     * @param {number} mean - Mean of the values
     * @returns {number} - Standard deviation
     */
    calculateStandardDeviation(values, mean) {
        if (!values || values.length < 2) return 0;
        
        const squaredDifferences = values.map(v => Math.pow(v - mean, 2));
        const variance = this.calculateMean(squaredDifferences);
        return Math.sqrt(variance);
    },
    
    /**
     * Calculate volatility (coefficient of variation)
     * @param {Array} values - Array of numeric values
     * @returns {number} - Coefficient of variation
     */
    calculateVolatility(values) {
        if (!values || values.length < 2) return 0;
        
        const mean = this.calculateMean(values);
        if (mean === 0) return 0; // Avoid division by zero
        
        const stdDev = this.calculateStandardDeviation(values, mean);
        return stdDev / mean;
    },
    
    /**
     * Calculate trend using simple linear regression
     * @param {Array} data - Array of {date, usagePerDay} objects
     * @returns {Object} - Trend information
     */
    calculateTrend(data) {
        if (!data || data.length < 3) {
            return { slope: 0, direction: 'stable' };
        }
        
        // Convert dates to x values (days since first date)
        const firstDateMs = data[0].date.getTime();
        const xValues = data.map(d => (d.date.getTime() - firstDateMs) / (1000 * 60 * 60 * 24));
        const yValues = data.map(d => d.usagePerDay);
        
        // Calculate slope using least squares method
        const n = xValues.length;
        const sumX = xValues.reduce((acc, val) => acc + val, 0);
        const sumY = yValues.reduce((acc, val) => acc + val, 0);
        const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i], 0);
        const sumXX = xValues.reduce((acc, x) => acc + x * x, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        
        // Determine trend direction
        let direction = 'stable';
        if (slope > 0.05) direction = 'increasing';
        else if (slope < -0.05) direction = 'decreasing';
        
        return { slope, direction };
    },
    
    /**
     * Calculate day-of-week patterns
     * @param {Array} data - Array of {date, usagePerDay} objects
     * @returns {Object} - Day of week patterns
     */
    calculateDayOfWeekPatterns(data) {
        if (!data || data.length < 7) {
            // Return default pattern with no seasonal effects
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const defaultPattern = {};
            
            days.forEach(day => {
                defaultPattern[day] = {
                    average: 0,
                    index: 1, // No seasonal effect
                    dataPoints: 0
                };
            });
            
            return defaultPattern;
        }
        
        // Group data by day of week
        const dowGroups = [[], [], [], [], [], [], []];
        
        data.forEach(item => {
            const dayOfWeek = item.date.getDay();
            dowGroups[dayOfWeek].push(item.usagePerDay);
        });
        
        // Calculate average for each day of week
        const dowAverages = dowGroups.map(group => 
            group.length > 0 ? this.calculateMean(group) : null
        );
        
        // Calculate overall average
        const allValues = data.map(d => d.usagePerDay);
        const overallAvg = this.calculateMean(allValues);
        
        // Calculate index for each day (relative to overall average)
        const dowIndices = dowAverages.map(avg => 
            avg !== null ? avg / overallAvg : 1
        );
        
        // Create named day object
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const result = {};
        
        days.forEach((day, i) => {
            result[day] = {
                average: dowAverages[i] || 0,
                index: dowIndices[i] || 1,
                dataPoints: dowGroups[i].length
            };
        });
        
        return result;
    }
};

export default StatisticalFunctionsTests;
