/**
 * Food Cost Module - Main Entry Point
 * Exports the public API for the Food Cost module
 */

// Version tracker for code updates
const MODULE_VERSION = '2.1.5-2025-06-06';

// Import the Vue component
import { FoodCostApp } from './refactored-app-component.js?v=2.1.5-20250606';

// Basic firebase helpers - these should load first
import { 
    ensureFirebaseInitialized
} from './firebase-helpers.js?v=2.1.5-20250606';

// Core services - avoid circular dependencies
import * as DatabaseOperations from './database-operations.js?v=2.1.5-20250606';
import * as DataService from './services/data-service.js?v=2.1.5-20250606';
import * as DataProcessor from './data-processor.js?v=2.1.5-20250606';
import * as OrderCalculator from './order-calculator.js?v=2.1.5-20250606';

// Import Analytics Dashboard
import { FoodCostAnalyticsDashboard, initializeFoodCostAnalytics } from './analytics-dashboard.js?v=2.1.5-20250606';

// Track the current app instance
let currentFoodCostApp = null;

/**
 * Initialize the Food Cost module
 * @param {string} containerId - ID of the container element
 * @returns {Promise} - Promise resolving with the app instance
 */
export function initializeFoodCostModule(containerId) {
    return new Promise((resolve, reject) => {
        console.log(`Initializing Food Cost Module in container: ${containerId} ${MODULE_VERSION}`);
        
        try {
            // Get container element
            const container = document.getElementById(containerId);
            
            if (!container) {
                throw new Error(`Container element with ID "${containerId}" not found`);
            }
            
            // Check Vue is available
            if (typeof Vue === 'undefined') {
                throw new Error('Vue is not available - required for the Food Cost Module');
            }
            
            // Check Firebase is available
            if (typeof firebase === 'undefined') {
                console.warn('Firebase not found - attempting to initialize anyway');
            }
            
            // Initialize Firebase if needed
            ensureFirebaseInitialized();
            
            // Create a new Vue app instance
            const appInstance = Vue.createApp(FoodCostApp);
            
            // Mount the Vue app to the container
            const mountedApp = appInstance.mount('#' + containerId);
            
            // Store the current app instance
            currentFoodCostApp = {
                app: appInstance,
                instance: mountedApp,
                unmount: () => {
                    appInstance.unmount();
                    console.log('Food Cost Module unmounted');
                }
            };
            
            console.log('Food Cost Module initialized successfully');
            window.foodCostApp = currentFoodCostApp; // For debugging only
            resolve(currentFoodCostApp);
            
        } catch (error) {
            console.error('Error initializing Food Cost Module:', error);
            reject(error);
        }
    });
}

/**
 * Check the Food Cost module version
 * @returns {Object} - Version information
 */
export function checkFoodCostModuleVersion() {
    return {
        version: MODULE_VERSION,
        buildDate: '2025-05-15',
        isRefactored: true
    };
}

// Expose the module version globally for compatibility
window.MODULE_VERSION = MODULE_VERSION;

// Create global namespace for the module
window.FoodCost = window.FoodCost || {};

// Expose the services in the global namespace
window.FoodCost.services = {
    DatabaseOperations,
    DataService,
    DataProcessor,
    OrderCalculator
};

// Expose the entry points in the global namespace
window.FoodCost.initializeFoodCostModule = initializeFoodCostModule;
window.FoodCost.checkFoodCostModuleVersion = checkFoodCostModuleVersion;
window.FoodCost.OrderCalculator = OrderCalculator; // Expose OrderCalculator directly for calculation details
window.FoodCost.calculateCriticalityScore = OrderCalculator.calculateCriticalityScore; // Expose criticality calculation
window.FoodCost.AnalyticsDashboard = FoodCostAnalyticsDashboard; // Expose Analytics Dashboard
window.FoodCost.initializeFoodCostAnalytics = initializeFoodCostAnalytics; // Expose Analytics initialization

// Export the public API
export {
    DatabaseOperations,
    DataService,
    DataProcessor,
    OrderCalculator,
    FoodCostAnalyticsDashboard,
    initializeFoodCostAnalytics,
    MODULE_VERSION
};
