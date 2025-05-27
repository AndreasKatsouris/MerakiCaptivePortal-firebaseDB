/**
 * Food Cost Module - Stock Data Table Component
 * Version: 1.9.4-2025-04-19
 * 
 * This component provides the main data display table with sorting and row actions.
 * It displays stock items with their quantities, costs, and calculation results,
 * and allows for sorting and detailed item inspection.
 */

// Define the component
const StockDataTable = {
    // Updated version to bust cache
    version: '1.9.4-2025-04-19-3',
    name: 'stock-data-table',
    
    props: {
        /**
         * Stock items to display in the table
         */
        items: {
            type: Array,
            default: () => []
        },
        
        /**
         * Currently active sort field
         */
        sortField: {
            type: String,
            default: 'itemCode'
        },
        
        /**
         * Current sort direction ('asc' or 'desc')
         */
        sortDirection: {
            type: String,
            default: 'asc',
            validator: value => ['asc', 'desc'].includes(value)
        },
        
        /**
         * Whether to show stock item count summary
         */
        showSummary: {
            type: Boolean,
            default: true
        },
        
        /**
         * Total count of items (for filtering summary)
         */
        totalItems: {
            type: Number,
            default: 0
        }
    },
    
    /**
     * Component data - defines default state
     */
    data() {
        return {
            // Initialize with default sort field and direction if none provided via props
            localSortField: 'itemCode',
            localSortDirection: 'asc'
        };
    },
    
    methods: {
        /**
         * Format a numeric value with 2 decimal places
         * @param {Number} value - The numeric value to format
         * @returns {String} Formatted number with 2 decimal places
         */
        formatNumber(value) {
            if (value === undefined || value === null) return '0.00';
            return Number(value).toFixed(2);
        },
        
        /**
         * Request sorting by a specific field
         * @param {String} field - Field name to sort by
         */
        sortBy(field) {
            this.$emit('sort', field);
        },
        
        /**
         * Request to show calculation details for a specific item
         * @param {Object} item - The item to show details for
         */
        showItemDetails(item) {
            this.$emit('show-item-details', item);
        }
    },
    
    template: `
        <div>
            <!-- Item Count Summary -->
            <div class="row mb-3" v-if="showSummary && items.length > 0">
                <div class="col-md-12">
                    <div class="alert alert-info mb-0">
                        <strong>Showing:</strong> {{ items.length }} of {{ totalItemCount }} items
                        <span v-if="items.length !== totalItemCount">
                            (filtered)
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- Stock Data Table -->
            <div class="table-responsive">
                <table class="table table-bordered table-hover table-sm">
                    <thead class="thead-light">
                        <tr>
                            <th @click="sortBy('itemCode')" class="sortable">
                                Item Code 
                                <i class="fas" :class="{
                                    'fa-sort-up': sortField === 'itemCode' && sortDirection === 'asc',
                                    'fa-sort-down': sortField === 'itemCode' && sortDirection === 'desc',
                                    'fa-sort': sortField !== 'itemCode'
                                }"></i>
                            </th>
                            <th @click="sortBy('description')" class="sortable">
                                Description 
                                <i class="fas" :class="{
                                    'fa-sort-up': sortField === 'description' && sortDirection === 'asc',
                                    'fa-sort-down': sortField === 'description' && sortDirection === 'desc',
                                    'fa-sort': sortField !== 'description'
                                }"></i>
                            </th>
                            <th @click="sortBy('openingQty')" class="sortable text-right">
                                Opening Qty 
                                <i class="fas" :class="{
                                    'fa-sort-up': sortField === 'openingQty' && sortDirection === 'asc',
                                    'fa-sort-down': sortField === 'openingQty' && sortDirection === 'desc',
                                    'fa-sort': sortField !== 'openingQty'
                                }"></i>
                            </th>
                            <th @click="sortBy('purchaseQty')" class="sortable text-right">
                                Purchase Qty 
                                <i class="fas" :class="{
                                    'fa-sort-up': sortField === 'purchaseQty' && sortDirection === 'asc',
                                    'fa-sort-down': sortField === 'purchaseQty' && sortDirection === 'desc',
                                    'fa-sort': sortField !== 'purchaseQty'
                                }"></i>
                            </th>
                            <th @click="sortBy('closingQty')" class="sortable text-right">
                                Closing Qty 
                                <i class="fas" :class="{
                                    'fa-sort-up': sortField === 'closingQty' && sortDirection === 'asc',
                                    'fa-sort-down': sortField === 'closingQty' && sortDirection === 'desc',
                                    'fa-sort': sortField !== 'closingQty'
                                }"></i>
                            </th>
                            <th @click="sortBy('usage')" class="sortable text-right">
                                Usage 
                                <i class="fas" :class="{
                                    'fa-sort-up': sortField === 'usage' && sortDirection === 'asc',
                                    'fa-sort-down': sortField === 'usage' && sortDirection === 'desc',
                                    'fa-sort': sortField !== 'usage'
                                }"></i>
                            </th>
                            <th @click="sortBy('unitCost')" class="sortable text-right">
                                Unit Cost 
                                <i class="fas" :class="{
                                    'fa-sort-up': sortField === 'unitCost' && sortDirection === 'asc',
                                    'fa-sort-down': sortField === 'unitCost' && sortDirection === 'desc',
                                    'fa-sort': sortField !== 'unitCost'
                                }"></i>
                            </th>
                            <th @click="sortBy('usagePerDay')" class="sortable text-right">
                                Usage/Day 
                                <i class="fas" :class="{
                                    'fa-sort-up': sortField === 'usagePerDay' && sortDirection === 'asc',
                                    'fa-sort-down': sortField === 'usagePerDay' && sortDirection === 'desc',
                                    'fa-sort': sortField !== 'usagePerDay'
                                }"></i>
                            </th>
                            <th @click="sortBy('reorderPoint')" class="sortable text-right">
                                Reorder Point 
                                <i class="fas" :class="{
                                    'fa-sort-up': sortField === 'reorderPoint' && sortDirection === 'asc',
                                    'fa-sort-down': sortField === 'reorderPoint' && sortDirection === 'desc',
                                    'fa-sort': sortField !== 'reorderPoint'
                                }"></i>
                            </th>
                            <th class="text-center">
                                Details
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in items" :key="item.itemCode" 
                            :class="{ 'table-danger': item.belowReorderPoint }">
                            <td>{{ item.itemCode }}</td>
                            <td>{{ item.description }}</td>
                            <td class="text-right">{{ formatNumber(item.openingQty) }}</td>
                            <td class="text-right">{{ formatNumber(item.purchaseQty) }}</td>
                            <td class="text-right">{{ formatNumber(item.closingQty) }}</td>
                            <td class="text-right">{{ formatNumber(item.usage) }}</td>
                            <td class="text-right">{{ formatNumber(item.unitCost) }}</td>
                            <td class="text-right">{{ formatNumber(item.usagePerDay) }}</td>
                            <td class="text-right" :class="{ 'font-weight-bold': item.belowReorderPoint }">
                                {{ formatNumber(item.reorderPoint) }}
                            </td>
                            <td class="text-center">
                                <button class="btn btn-sm btn-outline-info" @click.prevent="showItemDetails(item)" title="Show calculation details">
                                    <i class="fas fa-calculator"></i>
                                </button>
                            </td>
                        </tr>
                        <tr v-if="items.length === 0">
                            <td colspan="10" class="text-center py-3">
                                <i class="fas fa-info-circle mr-1"></i> No items to display
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `
};

// Support both module and non-module environments
// If we're in a module environment, export the component
if (typeof exports !== 'undefined') {
    exports.StockDataTable = StockDataTable;
}

// Also expose the component globally for direct browser usage
if (typeof window !== 'undefined') {
    window.StockDataTable = StockDataTable;
    
    // Register with the FoodCost component registry
    if (window.FoodCost && window.FoodCost.registerStockDataTable) {
        window.FoodCost.registerStockDataTable(StockDataTable);
        console.log('StockDataTable registered with FoodCost registry');
    }
}

// Add ES module export for the refactored architecture
export { StockDataTable };
