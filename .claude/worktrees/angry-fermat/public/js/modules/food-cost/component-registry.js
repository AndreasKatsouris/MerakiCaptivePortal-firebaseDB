/**
 * Food Cost Module - Component Registry
 * Version: 1.9.4-2025-04-19-11
 * 
 * This file registers all the components for the Food Cost module.
 * It serves as a single point of reference for all components during refactoring.
 */

// Ensure FoodCost namespace exists
window.FoodCost = window.FoodCost || {};

// Create components namespace for testing
window.FoodCost.components = window.FoodCost.components || {};

// Global references to components (no imports needed for the browser)
// These will be assigned when the components are loaded

// Register all components
function registerComponents(Vue) {
    // Register components if Vue is available
    if (Vue) {
        // Register modal components
        if (window.FoodCost.components.HeaderMappingModal) {
            Vue.component('header-mapping-modal', window.FoodCost.components.HeaderMappingModal);
        }
        
        if (window.FoodCost.components.HistoricalDataModal) {
            Vue.component('historical-data-modal', window.FoodCost.components.HistoricalDataModal);
        }
        
        if (window.FoodCost.components.DeleteConfirmationModal) {
            Vue.component('delete-confirmation-modal', window.FoodCost.components.DeleteConfirmationModal);
        }
        
        if (window.FoodCost.components.ItemCalculationDetailsModal) {
            Vue.component('item-calculation-details-modal', window.FoodCost.components.ItemCalculationDetailsModal);
        }
        
        // Register filter components
        if (window.FoodCost.components.CategoryFilter) {
            Vue.component('category-filter', window.FoodCost.components.CategoryFilter);
        }
        
        if (window.FoodCost.components.CostCenterFilter) {
            Vue.component('cost-center-filter', window.FoodCost.components.CostCenterFilter);
        }
        
        // Register table components
        if (window.FoodCost.components.StockDataTable) {
            Vue.component('stock-data-table', window.FoodCost.components.StockDataTable);
        }
        
        // Register analytics components
        if (window.FoodCost.components.DataSummary) {
            Vue.component('data-summary', window.FoodCost.components.DataSummary);
        }
    }
}

// Direct component registration for testing
window.FoodCost.registerComponents = registerComponents;

// Set up component assignment functions
window.FoodCost.registerHeaderMappingModal = function(component) {
    window.FoodCost.components.HeaderMappingModal = component;
};

window.FoodCost.registerHistoricalDataModal = function(component) {
    window.FoodCost.components.HistoricalDataModal = component;
};

window.FoodCost.registerDeleteConfirmationModal = function(component) {
    window.FoodCost.components.DeleteConfirmationModal = component;
};

window.FoodCost.registerItemCalculationDetailsModal = function(component) {
    window.FoodCost.components.ItemCalculationDetailsModal = component;
};

window.FoodCost.registerCategoryFilter = function(component) {
    window.FoodCost.components.CategoryFilter = component;
};

window.FoodCost.registerCostCenterFilter = function(component) {
    window.FoodCost.components.CostCenterFilter = component;
};

window.FoodCost.registerStockDataTable = function(component) {
    window.FoodCost.components.StockDataTable = component;
};

window.FoodCost.registerDataSummary = function(component) {
    window.FoodCost.components.DataSummary = component;
};

// Provide components for use in non-Vue environments via the global namespace
// No export needed as we use the global window.FoodCost namespace
window.FoodCost.exportedComponents = {
    HeaderMappingModal: window.FoodCost.components.HeaderMappingModal,
    HistoricalDataModal: window.FoodCost.components.HistoricalDataModal,
    DeleteConfirmationModal: window.FoodCost.components.DeleteConfirmationModal,
    ItemCalculationDetailsModal: window.FoodCost.components.ItemCalculationDetailsModal,
    CategoryFilter: window.FoodCost.components.CategoryFilter,
    CostCenterFilter: window.FoodCost.components.CostCenterFilter,
    StockDataTable: window.FoodCost.components.StockDataTable,
    DataSummary: window.FoodCost.components.DataSummary
};

// Export mixins
export const mixins = {
    FilterMixin
};
