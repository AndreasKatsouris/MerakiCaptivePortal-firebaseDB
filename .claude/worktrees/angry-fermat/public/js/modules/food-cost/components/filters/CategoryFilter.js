/**
 * Food Cost Module - Category Filter Component
 * Version: 1.9.4-2025-04-19
 * 
 * This component provides category filtering functionality for the Food Cost module.
 * It allows users to filter stock data by selecting one or more categories.
 */

// Define the component
const CategoryFilter = {
    // Updated version to bust cache
    version: '1.9.4-2025-04-19-11',
    name: 'category-filter',
    
    props: {
        /**
         * Whether the filter popup should be shown
         */
        showFilter: {
            type: Boolean,
            default: false
        },
        
        /**
         * Available categories to filter by
         */
        categories: {
            type: Array,
            default: () => ['All Categories']
        },
        
        /**
         * Currently selected categories
         */
        selectedCategories: {
            type: Array,
            default: () => []
        }
    },
    
    data() {
        return {
            // Local component state
            defaultCategories: ['All Categories'],
            // These are used by the tests - DO NOT REMOVE 
            sampleTestCategories: ['All Categories', 'Beverages', 'Dairy', 'Meat']
        };
    },
    
    computed: {
        /**
         * Filter out 'All Categories' from the available categories
         */
        filterableCategories() {
            // Get categories, ensure it's an array
            const cats = Array.isArray(this.categories) ? this.categories : ['All Categories'];
            // Return filtered categories
            return cats.filter(c => c !== 'All Categories');
        },
        
        /**
         * Check if there are any categories available
         */
        hasCategories() {
            // Get filterable categories length safely
            const length = this.filterableCategories ? this.filterableCategories.length : 0;
            return length > 0;
        }
    },
    
    methods: {
        /**
         * Emit event to toggle a specific category
         * @param {string} category - Category to toggle
         */
        toggleCategory(category) {
            this.$emit('toggle-category', category);
        },
        
        /**
         * Emit event to select all categories
         */
        selectAll() {
            this.$emit('select-all');
        },
        
        /**
         * Emit event to clear all category selections
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
        <div class="filter-popup-overlay" v-if="showFilter" @click="applyAndClose">
            <div class="filter-popup" @click.stop>
                <h4>
                    Filter by Category
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
                    <div v-for="category in filterableCategories" :key="category" class="form-check">
                        <input type="checkbox" 
                               class="form-check-input" 
                               :id="'category-' + category"
                               :value="category"
                               :checked="selectedCategories.includes(category)"
                               @change="toggleCategory(category)">
                        <label class="form-check-label" :for="'category-' + category">{{ category }}</label>
                    </div>
                    <div v-if="!hasCategories" class="text-center text-muted py-3">
                        <i class="fas fa-info-circle mr-1"></i> No categories available
                    </div>
                </div>
                <div class="mt-3">
                    <button class="btn btn-primary w-100" @click="applyAndClose">
                        Apply Filters
                    </button>
                </div>
            </div>
        </div>
    </div>`
};

// Support both module and non-module environments
// If we're in a module environment, export the component
if (typeof exports !== 'undefined') {
    exports.CategoryFilter = CategoryFilter;
}

// Also expose the component globally for direct browser usage
if (typeof window !== 'undefined') {
    window.CategoryFilter = CategoryFilter;
    
    // Register with the FoodCost component registry
    if (window.FoodCost && window.FoodCost.registerCategoryFilter) {
        window.FoodCost.registerCategoryFilter(CategoryFilter);
        console.log('CategoryFilter registered with FoodCost registry');
    }
}

// Add ES module export for the refactored components
export { CategoryFilter };
