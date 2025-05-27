/**
 * Food Cost Module - Editable Stock Data Table Component
 * Version: 2.1.0-2025-04-29
 * 
 * This component extends the standard StockDataTable with editing capabilities.
 * It provides inline editing for stock data with validation, change tracking,
 * and role-based access control.
 */

// Define the component
const EditableStockDataTable = {
    // Component version
    version: '2.1.0-2025-04-29',
    name: 'editable-stock-data-table',
    
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
        },
        
        /**
         * Whether edit mode is enabled
         */
        editMode: {
            type: Boolean,
            default: false
        },
        
        /**
         * Current user data for edit tracking
         */
        userData: {
            type: Object,
            default: () => ({})
        },
        
        /**
         * Whether the current user has edit permissions
         */
        hasEditPermission: {
            type: Boolean,
            default: false
        },
        
        /**
         * Last edit metadata for the record
         */
        lastEditMetadata: {
            type: Object,
            default: () => null
        },
        
        /**
         * Record ID for the current data
         */
        recordId: {
            type: String,
            default: ''
        }
    },
    
    /**
     * Component data - defines default state
     */
    data() {
        return {
            // Local editable copy of items
            editableItems: [],
            // Track which items have been changed
            changedItems: {},
            // Initialize with default sort field and direction if none provided via props
            localSortField: 'itemCode',
            localSortDirection: 'asc',
            // Validation state
            validationErrors: {},
            // Input validation rules
            validationRules: {
                openingQty: { min: 0, max: 99999, isFloat: true },
                purchaseQty: { min: 0, max: 99999, isFloat: true },
                closingQty: { min: 0, max: 99999, isFloat: true },
                unitCost: { min: 0, max: 999999, isFloat: true }
            }
        };
    },
    
    /**
     * Computed properties
     */
    computed: {
        /**
         * Check if there are any changes to save
         */
        hasChanges() {
            return Object.keys(this.changedItems).length > 0;
        },
        
        /**
         * Count of changed items
         */
        changedItemCount() {
            return Object.keys(this.changedItems).length;
        },
        
        /**
         * Check if the form has any validation errors
         */
        hasValidationErrors() {
            return Object.keys(this.validationErrors).length > 0;
        },
        
        /**
         * Format the last edit date and editor info for display
         */
        lastEditInfo() {
            if (!this.lastEditMetadata) return null;
            
            return {
                date: new Date(this.lastEditMetadata.timestamp).toLocaleString(),
                user: this.lastEditMetadata.userName || 'Unknown User',
                email: this.lastEditMetadata.userEmail || ''
            };
        }
    },
    
    /**
     * Watch for changes to props
     */
    watch: {
        /**
         * Watch for changes to the items array and update editable items
         */
        items: {
            handler(newItems) {
                // Deep clone the items for editing
                this.editableItems = JSON.parse(JSON.stringify(newItems));
                // Reset changed items when items are updated
                this.changedItems = {};
                this.validationErrors = {};
            },
            immediate: true,
            deep: true
        },
        
        /**
         * Watch for changes to edit mode
         */
        editMode(newValue) {
            if (!newValue) {
                // When exiting edit mode, reset if no changes were saved
                this.editableItems = JSON.parse(JSON.stringify(this.items));
                this.changedItems = {};
                this.validationErrors = {};
            }
        }
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
         * Parse a string value to a number, handling empty strings
         * @param {String} value - The string value to parse
         * @returns {Number} The parsed number or 0 if empty
         */
        parseNumberInput(value) {
            if (value === '' || value === null || value === undefined) return 0;
            const parsedValue = parseFloat(value);
            return isNaN(parsedValue) ? 0 : parsedValue;
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
        },
        
        /**
         * Handle input change for an editable field
         * @param {Object} item - The item being edited
         * @param {String} field - The field being edited
         * @param {Event} event - The input event
         */
        handleInputChange(item, field, event) {
            if (!this.editMode || !this.hasEditPermission) return;
            
            const index = this.editableItems.findIndex(i => i.itemCode === item.itemCode);
            if (index === -1) return;
            
            // Get the new value, handling numeric inputs
            let newValue = event.target.value;
            if (this.validationRules[field] && this.validationRules[field].isFloat) {
                newValue = this.parseNumberInput(newValue);
                
                // Validate the input
                const rule = this.validationRules[field];
                const itemKey = `${item.itemCode}-${field}`;
                
                if (newValue < rule.min || newValue > rule.max) {
                    this.validationErrors[itemKey] = `Value must be between ${rule.min} and ${rule.max}`;
                } else {
                    delete this.validationErrors[itemKey];
                }
            }
            
            // Update the editable item
            this.editableItems[index][field] = newValue;
            
            // Mark this item as changed
            if (!this.changedItems[item.itemCode]) {
                this.changedItems[item.itemCode] = {
                    original: { ...this.items.find(i => i.itemCode === item.itemCode) },
                    changes: {}
                };
            }
            
            // Track the specific field change
            this.changedItems[item.itemCode].changes[field] = newValue;
            
            // If this field affects calculated values, update them
            if (['openingQty', 'purchaseQty', 'closingQty', 'unitCost'].includes(field)) {
                this.recalculateItem(index);
            }
            
            // Emit change event
            this.$emit('item-changed', {
                itemCode: item.itemCode,
                field,
                value: newValue,
                changedItems: this.changedItems
            });
        },
        
        /**
         * Recalculate derived values for an item
         * @param {Number} index - The index of the item in editableItems
         */
        recalculateItem(index) {
            const item = this.editableItems[index];
            if (!item) return;
            
            // Calculate usage
            item.usage = item.openingQty + item.purchaseQty - item.closingQty;
            
            // Calculate usage value
            item.usageValue = item.usage * item.unitCost;
            
            // Calculate usage per day if stock period days exists
            if (item.stockPeriodDays > 0) {
                item.usagePerDay = item.usage / item.stockPeriodDays;
            }
            
            // Calculate reorder point if days to next delivery exists
            if (item.daysToNextDelivery > 0) {
                item.reorderPoint = item.closingQty - (item.usagePerDay * item.daysToNextDelivery);
                
                // Update below reorder point flag
                item.belowReorderPoint = item.reorderPoint <= 0;
            }
            
            // Update changes
            if (this.changedItems[item.itemCode]) {
                this.changedItems[item.itemCode].changes.usage = item.usage;
                this.changedItems[item.itemCode].changes.usageValue = item.usageValue;
                this.changedItems[item.itemCode].changes.usagePerDay = item.usagePerDay;
                this.changedItems[item.itemCode].changes.reorderPoint = item.reorderPoint;
                this.changedItems[item.itemCode].changes.belowReorderPoint = item.belowReorderPoint;
            }
        },
        
        /**
         * Discard changes to a specific item
         * @param {String} itemCode - The item code of the item to reset
         */
        resetItem(itemCode) {
            const index = this.editableItems.findIndex(i => i.itemCode === itemCode);
            if (index === -1) return;
            
            // Find the original item
            const originalItem = this.items.find(i => i.itemCode === itemCode);
            if (!originalItem) return;
            
            // Reset the editable item to its original state
            this.editableItems[index] = JSON.parse(JSON.stringify(originalItem));
            
            // Remove from changed items
            delete this.changedItems[itemCode];
            
            // Clear validation errors for this item
            Object.keys(this.validationErrors).forEach(key => {
                if (key.startsWith(`${itemCode}-`)) {
                    delete this.validationErrors[key];
                }
            });
            
            // Emit reset event
            this.$emit('item-reset', itemCode);
        },
        
        /**
         * Discard all changes
         */
        resetAllChanges() {
            this.editableItems = JSON.parse(JSON.stringify(this.items));
            this.changedItems = {};
            this.validationErrors = {};
            this.$emit('reset-all-changes');
        },
        
        /**
         * Save all changes
         */
        saveChanges() {
            if (this.hasValidationErrors) {
                // Notify of validation errors
                this.$emit('validation-error', this.validationErrors);
                return;
            }
            
            // Emit save event with updated items
            this.$emit('save-changes', {
                items: this.editableItems,
                changedItems: this.changedItems
            });
        },
        
        /**
         * Check if a field has a validation error
         * @param {Object} item - The item to check
         * @param {String} field - The field to check
         * @returns {Boolean} True if there is a validation error
         */
        hasError(item, field) {
            return this.validationErrors[`${item.itemCode}-${field}`] !== undefined;
        },
        
        /**
         * Get validation error message for a field
         * @param {Object} item - The item to check
         * @param {String} field - The field to check
         * @returns {String} The validation error message or empty string
         */
        getErrorMessage(item, field) {
            return this.validationErrors[`${item.itemCode}-${field}`] || '';
        }
    },
    
    template: `
        <div>
            <!-- Edit Mode Notification and Last Edit Info -->
            <div class="alert" :class="editMode ? 'alert-warning' : 'alert-info'" v-if="editMode || lastEditMetadata">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <template v-if="editMode">
                            <i class="fas fa-edit mr-2"></i>
                            <strong>Edit Mode Active</strong> - Make changes and click Save to update the record.
                            <span v-if="hasChanges" class="ml-2 badge badge-pill badge-warning">{{ changedItemCount }} item(s) modified</span>
                        </template>
                        <template v-else-if="lastEditMetadata">
                            <i class="fas fa-info-circle mr-2"></i>
                            <strong>Last Edited:</strong> {{ lastEditInfo.date }} by {{ lastEditInfo.user }}
                        </template>
                    </div>
                    <div v-if="editMode">
                        <button @click="resetAllChanges" class="btn btn-sm btn-outline-secondary mr-2" :disabled="!hasChanges">
                            <i class="fas fa-undo"></i> Discard Changes
                        </button>
                        <button @click="saveChanges" class="btn btn-sm btn-success" :disabled="!hasChanges || hasValidationErrors">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Item Count Summary -->
            <div class="row mb-3" v-if="showSummary && items.length > 0">
                <div class="col-md-12">
                    <div class="card bg-light">
                        <div class="card-body py-2">
                            <div class="row">
                                <div class="col-md-6">
                                    <small class="text-muted">
                                        <strong>Displaying:</strong> {{ items.length }} of {{ totalItems }} total items
                                    </small>
                                </div>
                                <div class="col-md-6 text-right">
                                    <small class="text-muted">
                                        <strong>Items Below Reorder Point:</strong> {{ items.filter(i => i.belowReorderPoint).length }}
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Data Table -->
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
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in editableItems" :key="item.itemCode" 
                            :class="{ 
                                'table-danger': item.belowReorderPoint,
                                'table-warning': changedItems[item.itemCode]
                            }">
                            <td>{{ item.itemCode }}</td>
                            <td>{{ item.description }}</td>
                            
                            <!-- Opening Qty - Editable in edit mode -->
                            <td class="text-right" :class="{ 'has-error': hasError(item, 'openingQty') }">
                                <div v-if="editMode && hasEditPermission">
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        min="0"
                                        class="form-control form-control-sm" 
                                        :class="{ 'is-invalid': hasError(item, 'openingQty') }"
                                        v-model="item.openingQty" 
                                        @input="handleInputChange(item, 'openingQty', $event)" 
                                    />
                                    <div v-if="hasError(item, 'openingQty')" class="invalid-feedback">
                                        {{ getErrorMessage(item, 'openingQty') }}
                                    </div>
                                </div>
                                <span v-else>{{ formatNumber(item.openingQty) }}</span>
                            </td>
                            
                            <!-- Purchase Qty - Editable in edit mode -->
                            <td class="text-right" :class="{ 'has-error': hasError(item, 'purchaseQty') }">
                                <div v-if="editMode && hasEditPermission">
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        min="0"
                                        class="form-control form-control-sm" 
                                        :class="{ 'is-invalid': hasError(item, 'purchaseQty') }"
                                        v-model="item.purchaseQty" 
                                        @input="handleInputChange(item, 'purchaseQty', $event)" 
                                    />
                                    <div v-if="hasError(item, 'purchaseQty')" class="invalid-feedback">
                                        {{ getErrorMessage(item, 'purchaseQty') }}
                                    </div>
                                </div>
                                <span v-else>{{ formatNumber(item.purchaseQty) }}</span>
                            </td>
                            
                            <!-- Closing Qty - Editable in edit mode -->
                            <td class="text-right" :class="{ 'has-error': hasError(item, 'closingQty') }">
                                <div v-if="editMode && hasEditPermission">
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        min="0"
                                        class="form-control form-control-sm" 
                                        :class="{ 'is-invalid': hasError(item, 'closingQty') }"
                                        v-model="item.closingQty" 
                                        @input="handleInputChange(item, 'closingQty', $event)" 
                                    />
                                    <div v-if="hasError(item, 'closingQty')" class="invalid-feedback">
                                        {{ getErrorMessage(item, 'closingQty') }}
                                    </div>
                                </div>
                                <span v-else>{{ formatNumber(item.closingQty) }}</span>
                            </td>
                            
                            <!-- Usage - Calculated field, not editable -->
                            <td class="text-right">{{ formatNumber(item.usage) }}</td>
                            
                            <!-- Unit Cost - Editable in edit mode -->
                            <td class="text-right" :class="{ 'has-error': hasError(item, 'unitCost') }">
                                <div v-if="editMode && hasEditPermission">
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        min="0"
                                        class="form-control form-control-sm" 
                                        :class="{ 'is-invalid': hasError(item, 'unitCost') }"
                                        v-model="item.unitCost" 
                                        @input="handleInputChange(item, 'unitCost', $event)" 
                                    />
                                    <div v-if="hasError(item, 'unitCost')" class="invalid-feedback">
                                        {{ getErrorMessage(item, 'unitCost') }}
                                    </div>
                                </div>
                                <span v-else>{{ formatNumber(item.unitCost) }}</span>
                            </td>
                            
                            <!-- Usage Per Day - Calculated field, not editable -->
                            <td class="text-right">{{ formatNumber(item.usagePerDay) }}</td>
                            
                            <!-- Reorder Point - Calculated field, not editable -->
                            <td class="text-right" :class="{ 'font-weight-bold': item.belowReorderPoint }">
                                {{ formatNumber(item.reorderPoint) }}
                            </td>
                            
                            <!-- Actions -->
                            <td class="text-center">
                                <!-- Edit Mode Actions -->
                                <div v-if="editMode && hasEditPermission && changedItems[item.itemCode]" class="btn-group">
                                    <button 
                                        class="btn btn-sm btn-outline-secondary" 
                                        @click.prevent="resetItem(item.itemCode)" 
                                        title="Reset changes"
                                    >
                                        <i class="fas fa-undo"></i>
                                    </button>
                                    <button 
                                        class="btn btn-sm btn-outline-info" 
                                        @click.prevent="showItemDetails(item)" 
                                        title="Show calculation details"
                                    >
                                        <i class="fas fa-calculator"></i>
                                    </button>
                                </div>
                                
                                <!-- View Mode Action -->
                                <button 
                                    v-else
                                    class="btn btn-sm btn-outline-info" 
                                    @click.prevent="showItemDetails(item)" 
                                    title="Show calculation details"
                                >
                                    <i class="fas fa-calculator"></i>
                                </button>
                            </td>
                        </tr>
                        <tr v-if="editableItems.length === 0">
                            <td colspan="10" class="text-center py-3">
                                <i class="fas fa-info-circle mr-1"></i> No items to display
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            <!-- Validation Error Summary (if any) -->
            <div v-if="hasValidationErrors && editMode" class="alert alert-danger mt-3">
                <h6><i class="fas fa-exclamation-triangle mr-2"></i>Please fix the following errors:</h6>
                <ul class="mb-0">
                    <li v-for="(error, key) in validationErrors" :key="key">
                        {{ key.split('-')[0] }}: {{ error }}
                    </li>
                </ul>
            </div>
        </div>
    `
};

// Support both module and non-module environments
// If we're in a module environment, export the component
if (typeof exports !== 'undefined') {
    exports.EditableStockDataTable = EditableStockDataTable;
}

// Also expose the component globally for direct browser usage
if (typeof window !== 'undefined') {
    window.EditableStockDataTable = EditableStockDataTable;
    
    // Register with the FoodCost component registry
    if (window.FoodCost && window.FoodCost.registerEditableStockDataTable) {
        window.FoodCost.registerEditableStockDataTable(EditableStockDataTable);
        console.log('EditableStockDataTable registered with FoodCost registry');
    }
    
    // Create food cost namespace if it doesn't exist for legacy support
    window.FoodCost = window.FoodCost || {};
    window.FoodCost.components = window.FoodCost.components || {};
    window.FoodCost.components.EditableStockDataTable = EditableStockDataTable;
}

// Add ES module export for the refactored architecture
export { EditableStockDataTable };
