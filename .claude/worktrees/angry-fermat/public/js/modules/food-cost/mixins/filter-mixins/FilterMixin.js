/**
 * Food Cost Module - Filter Functionality Mixin
 * Version: 1.9.4-2025-04-19
 * 
 * This mixin provides common filter functionality to be shared across filter components.
 * It consolidates duplicate filter methods found in the original monolithic component.
 */

export const FilterMixin = {
    methods: {
        /**
         * Toggle selection status of a filter item
         * @param {Array} selectedItems - Array of currently selected items
         * @param {string} item - Item to toggle
         * @returns {Array} - Updated selection array
         */
        toggleFilterItem(selectedItems, item) {
            const index = selectedItems.indexOf(item);
            if (index === -1) {
                return [...selectedItems, item];
            } else {
                return selectedItems.filter(i => i !== item);
            }
        },
        
        /**
         * Select all available items
         * @param {Array} allItems - Array of all available items
         * @returns {Array} - Array containing all items
         */
        selectAllItems(allItems) {
            return [...allItems];
        },
        
        /**
         * Clear all selected items
         * @returns {Array} - Empty array
         */
        clearAllItems() {
            return [];
        },
        
        /**
         * Get count of selected items to display in filter button
         * @param {Array} selectedItems - Array of currently selected items
         * @param {Array} allItems - Array of all available items
         * @returns {string} - Display text for filter button
         */
        getFilterButtonText(selectedItems, allItems) {
            if (selectedItems.length === 0) {
                return 'None selected';
            } else if (selectedItems.length === allItems.length) {
                return 'All selected';
            } else {
                return `${selectedItems.length} selected`;
            }
        }
    }
};
