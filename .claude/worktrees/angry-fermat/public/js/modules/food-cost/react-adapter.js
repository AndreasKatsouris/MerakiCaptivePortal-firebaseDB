/**
 * React Adapter for Food Cost Dashboard
 * Provides integration between the React component and the rest of the system
 */

// Import React/ReactDOM (assuming they're available via CDN)
import React from 'https://cdn.jsdelivr.net/npm/react@18.2.0/+esm';
import ReactDOM from 'https://cdn.jsdelivr.net/npm/react-dom@18.2.0/+esm';

// Import Firebase services (using the project pattern)
import { 
    saveStockUsageData, 
    loadHistoricalData,
    deleteHistoricalRecord,
    getRecentStoreContext,
    checkForDuplicateRecord,
    loadStockUsageRecord,
    updateStockUsageRecord,
    isFirebaseAvailable,
    loadStockUsageByDateRange,
    getStockUsageStatistics
} from './services/firebase-service.js';

// Import data processing functions to maintain compatibility
import {
    parseCSVData, 
    processDataWithMapping, 
    detectAndMapHeaders, 
    extractCategoriesAndCostCenters, 
    filterStockData,
    getItemCalculationDetails, 
    downloadCSV
} from './services/data-service.js';

import {
    processStockData,
    calculateDerivedValues,
    calculateReorderPoints, 
    calculateUsagePerDay,
    calculateTotals,
    prepareCategoryData,
    prepareTopItemsData,
    applyFilters,
    calculateSummary
} from './data-processor.js';

// Import purchase order functionality
import {
    calculateOrderDetails,
    generatePurchaseOrder,
    exportPurchaseOrderToCSV,
    getCalculationDetails
} from './order-calculator.js';

// Import the Purchase Order Modal component
import { PurchaseOrderModal } from './components/purchase-order/po-modal.js';

// Allow shadcn UI components to be loaded from CDN
const shadcnComponents = {
    button: React.lazy(() => import('https://cdn.jsdelivr.net/npm/@shadcn/ui@latest/dist/button.js')),
    card: React.lazy(() => import('https://cdn.jsdelivr.net/npm/@shadcn/ui@latest/dist/card.js')),
    input: React.lazy(() => import('https://cdn.jsdelivr.net/npm/@shadcn/ui@latest/dist/input.js')),
    tabs: React.lazy(() => import('https://cdn.jsdelivr.net/npm/@shadcn/ui@latest/dist/tabs.js')),
    table: React.lazy(() => import('https://cdn.jsdelivr.net/npm/@shadcn/ui@latest/dist/table.js')),
    popover: React.lazy(() => import('https://cdn.jsdelivr.net/npm/@shadcn/ui@latest/dist/popover.js')),
    checkbox: React.lazy(() => import('https://cdn.jsdelivr.net/npm/@shadcn/ui@latest/dist/checkbox.js')),
    label: React.lazy(() => import('https://cdn.jsdelivr.net/npm/@shadcn/ui@latest/dist/label.js')),
    separator: React.lazy(() => import('https://cdn.jsdelivr.net/npm/@shadcn/ui@latest/dist/separator.js')),
    badge: React.lazy(() => import('https://cdn.jsdelivr.net/npm/@shadcn/ui@latest/dist/badge.js'))
};

// Import via dynamic import for code splitting
const loadFoodCostDashboard = () => import('./FoodCostDashboard.js');

/**
 * Create React Root and mount the Dashboard component
 * @param {string} containerId - DOM container ID
 * @param {object} initialData - Initial data for the dashboard
 * @returns {object} - Controller with methods to interact with the component
 */
export async function mountReactDashboard(containerId, initialData = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container #${containerId} not found`);
        return null;
    }

    // Add tailwind styles to document
    const style = document.createElement('style');
    style.textContent = `
        /* Add base tailwind utilities */
        .container { width: 100%; margin-left: auto; margin-right: auto; }
        @media (min-width: 640px) { .container { max-width: 640px; } }
        @media (min-width: 768px) { .container { max-width: 768px; } }
        @media (min-width: 1024px) { .container { max-width: 1024px; } }
        @media (min-width: 1280px) { .container { max-width: 1280px; } }
        
        /* Grid utilities */
        .grid { display: grid; }
        .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
        @media (min-width: 768px) { .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 768px) { .md\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        .gap-6 { gap: 1.5rem; }
        
        /* Flex utilities */
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .items-center { align-items: center; }
        .justify-between { justify-content: space-between; }
        
        /* Spacing */
        .m-0 { margin: 0; }
        .mx-auto { margin-left: auto; margin-right: auto; }
        .my-2 { margin-top: 0.5rem; margin-bottom: 0.5rem; }
        .mb-4 { margin-bottom: 1rem; }
        .mb-6 { margin-bottom: 1.5rem; }
        .mb-8 { margin-bottom: 2rem; }
        .mb-10 { margin-bottom: 2.5rem; }
        .mr-2 { margin-right: 0.5rem; }
        .mt-2 { margin-top: 0.5rem; }
        .ml-auto { margin-left: auto; }
        
        /* Typography */
        .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
        .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
        .font-bold { font-weight: 700; }
        .font-medium { font-weight: 500; }
        .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        
        /* Colors */
        .bg-black { background-color: #000; }
        .bg-white { background-color: #fff; }
        .bg-white\\/10 { background-color: rgba(255, 255, 255, 0.1); }
        .text-white { color: #fff; }
        .text-black { color: #000; }
        .text-gray-400 { color: #9ca3af; }
        .text-red-500 { color: #ef4444; }
        .text-green-500 { color: #22c55e; }
        .border-white\\/20 { border-color: rgba(255, 255, 255, 0.2); }
        
        /* Sizing */
        .min-h-screen { min-height: 100vh; }
        .h-4 { height: 1rem; }
        .w-4 { width: 1rem; }
        .h-12 { height: 3rem; }
        .w-12 { width: 3rem; }
        .h-\\[200px\\] { height: 200px; }
        .h-100 { height: 100%; }
        
        /* Borders */
        .border { border-width: 1px; }
        .rounded-lg { border-radius: 0.5rem; }
        
        /* Other */
        .space-y-2 > * + * { margin-top: 0.5rem; }
        .opacity-50 { opacity: 0.5; }
        .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
        .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
        .py-10 { padding-top: 2.5rem; padding-bottom: 2.5rem; }
        .p-6 { padding: 1.5rem; }
        
        /* SHADCN specific styles */
        .bg-green-600 { background-color: #16a34a; }
        .bg-yellow-600 { background-color: #ca8a04; }
        .bg-red-600 { background-color: #dc2626; }
    `;
    document.head.appendChild(style);

    // Clear container and add a loading indicator
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;min-height:300px;"><p>Loading Food Cost Dashboard...</p></div>';

    try {
        // Prepare module services and utilities for the dashboard
        const services = {
            // Firebase operations
            firebase: {
                saveStockUsageData,
                loadHistoricalData,
                deleteHistoricalRecord,
                getRecentStoreContext,
                checkForDuplicateRecord,
                loadStockUsageRecord,
                updateStockUsageRecord,
                isFirebaseAvailable,
                loadStockUsageByDateRange,
                getStockUsageStatistics
            },
            
            // Data processing
            dataService: {
                parseCSVData,
                processDataWithMapping,
                detectAndMapHeaders,
                extractCategoriesAndCostCenters,
                filterStockData,
                getItemCalculationDetails,
                downloadCSV
            },
            
            // Data processor functions
            dataProcessor: {
                processStockData,
                calculateDerivedValues,
                calculateReorderPoints,
                calculateUsagePerDay,
                calculateTotals,
                prepareCategoryData,
                prepareTopItemsData,
                applyFilters,
                calculateSummary
            },
            
            // Purchase order functionality
            orderCalculator: {
                calculateOrderDetails,
                generatePurchaseOrder,
                exportPurchaseOrderToCSV,
                getCalculationDetails
            }
        };
        
        // Combine initial data with the services
        const dashboardProps = {
            ...initialData,
            services,
            components: {
                PurchaseOrderModal
            }
        };
    
        // Dynamic import of the Dashboard component
        const { default: FoodCostDashboard } = await loadFoodCostDashboard();
        
        // Create a root and render
        const root = ReactDOM.createRoot(container);
        
        // Actual rendering with Suspense for code splitting
        root.render(
            React.createElement(
                React.Suspense, 
                { fallback: React.createElement('div', null, 'Loading components...') },
                React.createElement(FoodCostDashboard, dashboardProps)
            )
        );
        
        // Return controller object with methods to interact with the dashboard
        return {
            // Method to update data
            updateData: (newData) => {
                root.render(
                    React.createElement(
                        React.Suspense, 
                        { fallback: React.createElement('div', null, 'Loading components...') },
                        React.createElement(FoodCostDashboard, { 
                            ...dashboardProps, 
                            ...newData,
                            services // Always include services
                        })
                    )
                );
            },
            
            // Method to destroy the component
            destroy: () => {
                root.unmount();
            },
            
            // Access to React and ReactDOM
            react: React,
            reactDOM: ReactDOM,
            
            // Access to service objects
            services
        };
    } catch (error) {
        console.error('Error mounting React dashboard:', error);
        container.innerHTML = `<div class="error">Error loading dashboard: ${error.message}</div>`;
        return null;
    }
}

// Add this to the global namespace for easy access
window.FoodCost = window.FoodCost || {};
window.FoodCost.mountReactDashboard = mountReactDashboard;

// Expose the services and utilities to the global namespace for easier access
window.FoodCost.Firebase = {
    saveStockUsageData,
    loadHistoricalData,
    deleteHistoricalRecord,
    getRecentStoreContext,
    checkForDuplicateRecord,
    loadStockUsageRecord,
    updateStockUsageRecord,
    isFirebaseAvailable,
    loadStockUsageByDateRange,
    getStockUsageStatistics
};

window.FoodCost.DataService = {
    parseCSVData,
    processDataWithMapping,
    detectAndMapHeaders,
    extractCategoriesAndCostCenters,
    filterStockData,
    getItemCalculationDetails,
    downloadCSV
};

window.FoodCost.DataProcessor = {
    processStockData,
    calculateDerivedValues,
    calculateReorderPoints,
    calculateUsagePerDay,
    calculateTotals,
    prepareCategoryData,
    prepareTopItemsData,
    applyFilters,
    calculateSummary
};

window.FoodCost.OrderCalculator = {
    calculateOrderDetails,
    generatePurchaseOrder,
    exportPurchaseOrderToCSV,
    getCalculationDetails
};
