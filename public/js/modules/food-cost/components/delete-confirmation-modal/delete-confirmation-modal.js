/**
 * Food Cost Module - Delete Confirmation Modal Component
 * Allows users to select and delete multiple historical records
 * Version: 1.9.4-2025-04-19
 */

export const DeleteConfirmationModal = {
    name: 'delete-confirmation-modal',
    
    props: {
        /**
         * Control the visibility of the modal
         */
        show: {
            type: Boolean,
            required: true
        },
        
        /**
         * Array of historical data records
         */
        historicalData: {
            type: Array,
            required: true
        },
        
        /**
         * Loading state
         */
        isLoading: {
            type: Boolean,
            default: false
        },
        
        /**
         * Array of selected record IDs for deletion
         */
        selectedRecords: {
            type: Array,
            required: true
        },
        
        /**
         * Whether all records are selected
         */
        selectAll: {
            type: Boolean,
            default: false
        },
        
        /**
         * Whether the deletion is in progress
         */
        isDeleting: {
            type: Boolean,
            default: false
        }
    },
    
    methods: {
        /**
         * Format date for display
         * @param {string} dateString - Date string to format
         */
        formatDate(dateString) {
            if (!dateString) return 'N/A';
            
            try {
                const date = new Date(dateString);
                if (isNaN(date.getTime())) return dateString;
                
                return date.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            } catch (error) {
                console.error('Error formatting date:', error);
                return dateString;
            }
        },
        
        /**
         * Format currency values
         * @param {number} value - Value to format as currency
         */
        formatCurrency(value) {
            if (value === null || value === undefined) return '$0.00';
            return '$' + parseFloat(value).toFixed(2);
        },
        
        /**
         * Close the modal
         */
        close() {
            this.$emit('close');
        },
        
        /**
         * Toggle selection of all records
         */
        toggleAllSelection() {
            this.$emit('toggle-all');
        },
        
        /**
         * Update selected records
         * @param {Event} event - Change event
         */
        updateSelection(event) {
            this.$emit('update-selection', event.target.value);
        },
        
        /**
         * Delete selected records
         */
        deleteSelected() {
            this.$emit('delete-selected');
        },
        
        /**
         * Delete a specific record
         * @param {string} recordId - ID of record to delete
         */
        deleteRecord(recordId) {
            this.$emit('delete-record', recordId);
        }
    },
    
    template: `
        <div class="modal-overlay" v-if="show" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); z-index: 1050; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            <div class="modal-dialog modal-lg" style="max-width: 90%; margin: 30px auto;" @click.stop>
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title">
                            <i class="fas fa-trash-alt mr-2"></i> Delete Historical Stock Data
                        </h5>
                        <button type="button" class="close text-white" @click="close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-warning mb-4">
                            <i class="fas fa-exclamation-triangle mr-2"></i>
                            <strong>Warning:</strong> Deleted records cannot be recovered. Please select the records you want to delete carefully.
                        </div>
                        
                        <div v-if="isLoading" class="text-center py-5">
                            <div class="spinner-border text-primary" role="status">
                                <span class="sr-only">Loading...</span>
                            </div>
                            <p class="mt-3">Loading historical data...</p>
                        </div>
                        <div v-else-if="historicalData.length === 0" class="text-center py-5">
                            <i class="fas fa-folder-open fa-3x text-muted mb-3"></i>
                            <p>No historical data available to delete.</p>
                        </div>
                        <div v-else>
                            <div class="mb-3">
                                <div class="form-check">
                                    <input 
                                        class="form-check-input" 
                                        type="checkbox" 
                                        id="selectAllRecords" 
                                        :checked="selectAll" 
                                        @change="toggleAllSelection"
                                    >
                                    <label class="form-check-label" for="selectAllRecords">
                                        Select All Records
                                    </label>
                                </div>
                            </div>
                            
                            <div class="table-responsive">
                                <table class="table table-bordered table-hover">
                                    <thead class="thead-light">
                                        <tr>
                                            <th width="50">Select</th>
                                            <th>Record ID</th>
                                            <th>Store</th>
                                            <th>Date Range</th>
                                            <th>Items</th>
                                            <th>Total Cost</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="record in historicalData" :key="record.key" :class="{'table-danger': selectedRecords.includes(record.key)}">
                                            <td class="text-center">
                                                <input 
                                                    type="checkbox" 
                                                    :value="record.key" 
                                                    :checked="selectedRecords.includes(record.key)"
                                                    @change="updateSelection"
                                                >
                                            </td>
                                            <td>{{ record.key }}</td>
                                            <td>{{ record.storeName || 'Not specified' }}</td>
                                            <td>
                                                <span v-if="record.openingDate && record.closingDate">
                                                    {{ formatDate(record.openingDate) }} - {{ formatDate(record.closingDate) }}
                                                </span>
                                                <span v-else>Not specified</span>
                                            </td>
                                            <td>{{ record.totalItems || '0' }}</td>
                                            <td>{{ record.totalCostOfUsage ? formatCurrency(record.totalCostOfUsage) : '$0.00' }}</td>
                                            <td>
                                                <button class="btn btn-sm btn-danger" @click="deleteRecord(record.key)">
                                                    <i class="fas fa-trash-alt"></i> Delete
                                                </button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer d-flex justify-content-between">
                        <div>
                            <span v-if="selectedRecords.length > 0" class="text-danger">
                                <i class="fas fa-exclamation-circle mr-1"></i>
                                {{ selectedRecords.length }} record(s) selected for deletion
                            </span>
                        </div>
                        <div>
                            <button type="button" class="btn btn-secondary mr-2" @click="close">Cancel</button>
                            <button 
                                type="button" 
                                class="btn btn-danger" 
                                @click="deleteSelected" 
                                :disabled="selectedRecords.length === 0 || isDeleting"
                            >
                                <i class="fas fa-trash-alt mr-1"></i> 
                                <span v-if="isDeleting">Deleting...</span>
                                <span v-else>Delete Selected</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
