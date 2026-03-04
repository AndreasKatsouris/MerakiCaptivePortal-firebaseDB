/**
 * Food Cost Module - Historical Data Modal Component
 * Displays and manages historical stock data records
 * Version: 1.9.4-2025-04-19
 */

export const HistoricalDataModal = {
    name: 'historical-data-modal',
    
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
         * Close the modal
         */
        close() {
            this.$emit('close');
        },
        
        /**
         * Load a specific historical record
         * @param {string} recordId - Record ID to load
         */
        loadRecord(recordId) {
            this.$emit('load-record', recordId);
        },
        
        /**
         * Delete a specific historical record
         * @param {string} recordId - Record ID to delete
         */
        deleteRecord(recordId) {
            this.$emit('delete-record', recordId);
        }
    },
    
    template: `
        <div class="modal-overlay" v-if="show" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); z-index: 1050; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            <div class="modal-dialog modal-lg" style="max-width: 90%; margin: 30px auto;" @click.stop>
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-history mr-2"></i> Historical Stock Data
                        </h5>
                        <button type="button" class="close" @click="close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div v-if="isLoading" class="text-center py-5">
                            <div class="spinner-border text-primary" role="status">
                                <span class="sr-only">Loading...</span>
                            </div>
                            <p class="mt-3">Loading historical data...</p>
                        </div>
                        <div v-else-if="historicalData.length === 0" class="text-center py-5">
                            <i class="fas fa-folder-open fa-3x text-muted mb-3"></i>
                            <p>No historical data available.</p>
                        </div>
                        <div v-else>
                            <div class="table-responsive">
                                <table class="table table-bordered table-hover">
                                    <thead class="thead-light">
                                        <tr>
                                            <th>Date</th>
                                            <th>Store</th>
                                            <th>Items</th>
                                            <th>Stock Period</th>
                                            <th>Total Usage</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="record in historicalData" :key="record.id">
                                            <td>{{ record.formattedTimestamp || record.id }}</td>
                                            <td>{{ record.storeName || 'Not specified' }}</td>
                                            <td>{{ record.itemCount || '?' }}</td>
                                            <td>{{ record.stockPeriodDays || 0 }} days</td>
                                            <td>{{ record.totalUsage ? record.totalUsage.toFixed(2) : '0.00' }}</td>
                                            <td>
                                                <button class="btn btn-sm btn-primary mr-1" @click="loadRecord(record.id)">
                                                    <i class="fas fa-folder-open"></i> Load
                                                </button>
                                                <button class="btn btn-sm btn-danger" @click="deleteRecord(record.id)">
                                                    <i class="fas fa-trash-alt"></i> Delete
                                                </button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" @click="close">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `
};
