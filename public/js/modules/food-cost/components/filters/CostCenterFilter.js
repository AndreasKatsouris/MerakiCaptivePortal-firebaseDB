/**
 * Food Cost Module - Cost Center Filter Component
 * Version: 1.9.4-2025-04-19
 * 
 * This component provides cost center filtering functionality for the Food Cost module.
 * It allows users to filter stock data by selecting one or more cost centers.
 */

// Define the component
const CostCenterFilter = {
    name: 'cost-center-filter',
    
    props: {
        /**
         * Whether the filter popup should be shown
         */
        showFilter: {
            type: Boolean,
            required: true,
            default: false
        },
        
        /**
         * Available cost centers to filter by
         */
        availableCostCenters: {
            type: Array,
            default: () => []
        },
        
        /**
         * Currently selected cost centers
         */
        selectedCostCenters: {
            type: Array,
            default: () => []
        }
    },
    
    computed: {
        /**
         * Filter out 'All Cost Centers' from the available cost centers
         */
        filterableCostCenters() {
            return (this.availableCostCenters || []).filter(c => c !== 'All Cost Centers');
        },
        
        /**
         * Check if there are any cost centers available
         */
        hasCostCenters() {
            return this.filterableCostCenters && this.filterableCostCenters.length > 0;
        },
        
        /**
         * Check if all cost centers are selected
         */
        isAllSelected() {
            return this.filterableCostCenters &&
                   this.selectedCostCenters &&
                   this.filterableCostCenters.length > 0 &&
                   this.filterableCostCenters.length === this.selectedCostCenters.length &&
                   this.filterableCostCenters.every(cc => this.selectedCostCenters.includes(cc));
        }
    },
    
    methods: {
        /**
         * Emit event to toggle a specific cost center
         * @param {string} costCenter - Cost center to toggle
         */
        toggleCostCenter(costCenter) {
            this.$emit('toggle-cost-center', costCenter);
        },
        
        /**
         * Emit event to select all cost centers
         */
        selectAll() {
            this.$emit('select-all');
        },
        
        /**
         * Emit event to clear all cost center selections
         */
        clearAll() {
            this.$emit('clear-all');
        },
        
        /**
         * Emit event to close the filter and apply selected filters
         */
        applyAndClose() {
            this.$emit('close');
        }
    },
    
    template: `
        <div class="filter-popup-overlay cost-center-popup" v-if="showFilter" @click="applyAndClose">
            <div class="filter-popup" @click.stop>
                <h4>
                    Filter by Cost Center
                    <button class="close-btn" @click="applyAndClose">&times;</button>
                </h4>
                <div class="filter-controls mb-3">
                    <button type="button" class="btn btn-sm btn-outline-primary me-2" 
                            @click="selectAll">
                        Select All
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" 
                            @click="clearAll">
                        Clear All
                    </button>
                </div>
                <div class="filter-items" style="max-height: 300px; overflow-y: auto;">
                    <div v-for="costCenter in filterableCostCenters" :key="costCenter" class="form-check">
                        <input type="checkbox" 
                               class="form-check-input" 
                               :id="'costcenter-' + costCenter"
                               :value="costCenter"
                               :checked="selectedCostCenters.includes(costCenter)"
                               @change="toggleCostCenter(costCenter)">
                        <label class="form-check-label" :for="'costcenter-' + costCenter">{{ costCenter }}</label>
                    </div>
                    <div v-if="!hasCostCenters" class="text-center text-muted py-3">
                        <i class="fas fa-info-circle mr-1"></i> No cost centers available
                    </div>
                </div>
                <div class="mt-3">
                    <button class="btn btn-primary w-100" @click="applyAndClose">
                        Apply Filters
                    </button>
                </div>
            </div>
        </div>
    `
};

// Support both module and non-module environments
// If we're in a module environment, export the component
if (typeof exports !== 'undefined') {
    exports.CostCenterFilter = CostCenterFilter;
}

// Also expose the component globally for direct browser usage
if (typeof window !== 'undefined') {
    window.CostCenterFilter = CostCenterFilter;
    
    // Register with the FoodCost component registry
    if (window.FoodCost && window.FoodCost.registerCostCenterFilter) {
        window.FoodCost.registerCostCenterFilter(CostCenterFilter);
        console.log('CostCenterFilter registered with FoodCost registry');
    }
}

// Add ES module export for the refactored components
export { CostCenterFilter };
