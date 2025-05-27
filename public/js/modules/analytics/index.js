/**
 * Analytics Module - Main Entry Point
 * Version: 1.0.2
 * Last Updated: 2025-04-19
 * 
 * This module provides analytics capabilities for existing data in the Laki Sparks platform.
 * It follows the modular architecture pattern with global namespacing.
 */

import { rtdb, ref, get, set, update, push, remove } from '../../config/firebase-config.js';
import { AllComponents } from './all-components.js';
import { DataProcessor } from './data-processor.js';
import { DatabaseOperations } from './database-operations.js';
import { ChartManager } from './chart-manager.js';
import { Utilities } from './utilities.js';

// Define the main Analytics namespace with version info
window.Analytics = window.Analytics || {};

// Module version tracking
window.Analytics.VERSION = {
    number: '1.0.2',
    date: '2025-04-19',
    name: 'Multi-File Enhancement',
    displayVersion: function() {
        return `${this.number} (${this.date})`;
    }
};

// Log version info on load
console.log(`Analytics Module Version ${window.Analytics.VERSION.displayVersion()} loaded.`);

// Ensure the FoodCostAnalytics namespace is initialized
window.Analytics.FoodCostAnalytics = window.Analytics.FoodCostAnalytics || {};

// Main Vue application for Analytics
const AnalyticsApp = {
    name: 'AnalyticsApp',
    components: AllComponents,
    data() {
        return {
            loading: false,
            error: null,
            activePage: 'overview',
            dateRange: {
                startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0], // Default to last 30 days
                endDate: new Date().toISOString().split('T')[0]
            },
            selectedModule: 'foodCost', // Default to food cost analytics
            availableModules: [
                { id: 'foodCost', name: 'Food Cost Analytics', icon: 'fas fa-utensils' },
                { id: 'guests', name: 'Guest Analytics', icon: 'fas fa-users', disabled: true },
                { id: 'campaigns', name: 'Campaign Analytics', icon: 'fas fa-bullhorn', disabled: true }
            ]
        };
    },
    computed: {
        formattedDateRange() {
            const start = new Date(this.dateRange.startDate);
            const end = new Date(this.dateRange.endDate);
            return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
        }
    },
    methods: {
        /**
         * Initialize the module with any required data
         */
        async initialize() {
            try {
                this.loading = true;
                
                // Register global methods
                window.Analytics.showModule = this.showModule;
                window.Analytics.processData = DataProcessor.processData;
                window.Analytics.getAnalyticsData = DatabaseOperations.getAnalyticsData;
                window.Analytics.saveAnalyticsData = DatabaseOperations.saveAnalyticsData;
                window.Analytics.createChart = ChartManager.createChart;
                window.Analytics.updateChart = ChartManager.updateChart;
                
                console.log('Analytics Module initialized successfully');
                
                // Load initial data for the default module
                await this.loadModuleData(this.selectedModule);
            } catch (error) {
                console.error('Error initializing Analytics Module:', error);
                this.error = 'Failed to initialize the Analytics Module. Please try again.';
            } finally {
                this.loading = false;
            }
        },
        
        /**
         * Switch between different analytics modules
         * @param {string} moduleId - ID of the module to display
         */
        showModule(moduleId) {
            const module = this.availableModules.find(m => m.id === moduleId);
            
            if (module && !module.disabled) {
                this.selectedModule = moduleId;
                this.loadModuleData(moduleId);
            } else if (module && module.disabled) {
                // Show a message that this module is coming soon
                Swal.fire({
                    title: 'Coming Soon',
                    text: `${module.name} will be available in a future update.`,
                    icon: 'info'
                });
            }
        },
        
        /**
         * Load data for the selected module
         * @param {string} moduleId - ID of the module
         */
        async loadModuleData(moduleId) {
            try {
                this.loading = true;
                
                if (moduleId === 'foodCost') {
                    // Load food cost analytics data
                    await window.Analytics.FoodCostAnalytics.loadData(this.dateRange);
                }
                
                // Additional modules can be added here in the future
                
            } catch (error) {
                console.error(`Error loading data for module ${moduleId}:`, error);
                this.error = `Failed to load data for ${moduleId} analytics. Please try again.`;
            } finally {
                this.loading = false;
            }
        },
        
        /**
         * Update the date range and reload data
         */
        updateDateRange() {
            this.loadModuleData(this.selectedModule);
        }
    },
    mounted() {
        this.initialize();
    },
    template: `
        <div class="analytics-container">
            <!-- Header with module selection and date range -->
            <div class="analytics-header mb-4">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <h3>Analytics Platform</h3>
                        <p class="text-muted">Uncover hidden insights from your data</p>
                    </div>
                    <div class="col-md-6">
                        <div class="d-flex justify-content-end">
                            <div class="date-range-selector me-3">
                                <div class="input-group">
                                    <input type="date" class="form-control form-control-sm" v-model="dateRange.startDate">
                                    <span class="input-group-text">to</span>
                                    <input type="date" class="form-control form-control-sm" v-model="dateRange.endDate">
                                    <button class="btn btn-primary btn-sm" @click="updateDateRange">
                                        <i class="fas fa-sync-alt"></i> Update
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Module Navigation -->
            <div class="analytics-modules mb-4">
                <div class="d-flex flex-wrap">
                    <div v-for="module in availableModules" :key="module.id" 
                         class="analytics-module-card" 
                         :class="{'active': selectedModule === module.id, 'disabled': module.disabled}"
                         @click="showModule(module.id)">
                        <div class="card h-100">
                            <div class="card-body text-center">
                                <i :class="module.icon + ' fa-2x mb-2'"></i>
                                <h5 class="card-title">{{ module.name }}</h5>
                                <span v-if="module.disabled" class="badge bg-secondary">Coming Soon</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Loading spinner -->
            <div v-if="loading" class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Loading analytics data...</p>
            </div>
            
            <!-- Error message -->
            <div v-if="error" class="alert alert-danger">
                {{ error }}
            </div>
            
            <!-- Dynamic content based on selected module -->
            <div v-if="!loading && !error">
                <!-- Food Cost Analytics -->
                <food-cost-analytics-dashboard v-if="selectedModule === 'foodCost'" :date-range="dateRange"></food-cost-analytics-dashboard>
                
                <!-- Placeholder for future modules -->
                <div v-else class="alert alert-info">
                    Module content is under development.
                </div>
            </div>
        </div>
    `
};

/**
 * Initialize the Analytics Module
 * @param {string} containerId - ID of the container element to mount the Vue app
 * @returns {Object} The Vue application instance
 */
window.initializeAnalyticsModule = function(containerId) {
    console.log(`Initializing Analytics Module v${window.Analytics.VERSION.displayVersion()} in container:`, containerId);
    
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID '${containerId}' not found.`);
        return null;
    }
    
    // Clean up ALL potential existing analytics app instances
    console.log('Checking for existing analytics instances to clean up...');
    
    // 1. Clear any previous app instances from the window object
    if (window.Analytics._appInstance) {
        console.log('Existing Analytics app instance reference found. Cleaning up...');
        window.Analytics._appInstance = null;
    }
    
    // 2. Find and remove ALL analytics app containers that might exist
    try {
        // Clear out the container first
        container.innerHTML = '';
        
        // Also check for any potential leaked analytics containers anywhere in the DOM
        document.querySelectorAll('[id^="analytics-app-"]').forEach(element => {
            console.log('Removing existing analytics app container:', element.id);
            element.remove();
        });
    } catch (err) {
        console.error('Error cleaning up previous analytics containers:', err);
    }
    
    // Create a unique container for the Vue app using timestamp to avoid ID collisions
    const uniqueId = 'analytics-app-' + Date.now();
    const appContainer = document.createElement('div');
    appContainer.id = uniqueId;
    container.appendChild(appContainer);
    
    // Mount the Vue application on the unique container
    const app = Vue.createApp(AnalyticsApp).mount('#' + uniqueId);
    
    // Store the app instance and container ID for proper cleanup
    window.Analytics._appInstance = app;
    window.Analytics._currentAppId = uniqueId;
    console.log(`Analytics app successfully mounted with ID: ${uniqueId}`);
    
    return app;
};

/**
 * Cleanup the Analytics Module
 * @returns {boolean} Success indicator
 */
window.cleanupAnalyticsModule = function() {
    console.log('Cleaning up Analytics Module...');
    
    // Clean up the app instance
    let cleaned = false;
    
    try {
        // Reset the app instance reference
        if (window.Analytics._appInstance) {
            window.Analytics._appInstance = null;
            cleaned = true;
        }
        
        // Remove the container element
        if (window.Analytics._currentAppId) {
            const container = document.getElementById(window.Analytics._currentAppId);
            if (container) {
                container.remove();
                console.log(`Removed container with ID: ${window.Analytics._currentAppId}`);
            }
            window.Analytics._currentAppId = null;
            cleaned = true;
        }
        
        // Also check for any potential leaked analytics containers
        document.querySelectorAll('[id^="analytics-app-"]').forEach(element => {
            console.log('Removing leaked analytics container:', element.id);
            element.remove();
            cleaned = true;
        });
        
        // Remove event listeners
        if (window.Analytics._resizeHandler) {
            window.removeEventListener('resize', window.Analytics._resizeHandler);
            window.Analytics._resizeHandler = null;
        }
        
        // Cleanup any charts
        if (typeof ChartManager !== 'undefined' && ChartManager.destroyAllCharts) {
            ChartManager.destroyAllCharts();
        }
        
        console.log('Analytics Module cleaned up successfully.');
    } catch (error) {
        console.error('Error during Analytics Module cleanup:', error);
    }
    
    return cleaned;
};

// Make initialize function directly available on window
window.initializeAnalyticsModule = window.initializeAnalyticsModule || function(containerId) {
    return AnalyticsApp.methods.initialize.call(AnalyticsApp);
};

// Explicitly attach to Analytics namespace for more reliable access
window.Analytics.initializeAnalyticsModule = window.initializeAnalyticsModule;

// Define the function as a named variable for export
const initializeAnalyticsModule = window.initializeAnalyticsModule;

// Export the Analytics objects and functions for direct imports
export {
    DataProcessor,
    DatabaseOperations,
    ChartManager,
    Utilities,
    AnalyticsApp,
    // Export the initialize function directly
    initializeAnalyticsModule
};
