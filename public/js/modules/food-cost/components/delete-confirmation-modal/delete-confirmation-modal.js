/**
 * Food Cost Module - Delete Confirmation Modal Component
 * Allows users to select and delete multiple historical records
 * Version: 1.9.4-2025-04-19
 */

import { LocationService } from '../../services/location-service.js';

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
    
    data() {
        return {
            locationNames: {} // Map of locationId to location name
        };
    },
    
    async mounted() {
        // Load location names when component mounts
        await this.loadLocationNames();
    },
    
    watch: {
        // Reload location names if historical data changes
        historicalData: {
            handler() {
                this.loadLocationNames();
            },
            deep: true
        }
    },
    
    methods: {
        /**
         * Load location names for all records
         */
        async loadLocationNames() {
            try {
                const locations = await LocationService.getUserLocations();
                this.locationNames = {};
                
                // Create a map of locationId to displayName
                locations.forEach(location => {
                    this.locationNames[location.id] = location.displayName || location.name;
                });
                
                console.log('[DeleteModal] Loaded location names:', this.locationNames);
            } catch (error) {
                console.error('[DeleteModal] Error loading location names:', error);
            }
        },
        
        /**
         * Get display name for a location
         */
        getLocationDisplay(record) {
            // Try to get location name from our map
            if (record.selectedLocationId && this.locationNames[record.selectedLocationId]) {
                return this.locationNames[record.selectedLocationId];
            }
            
            // Fallback to whatever data we have
            return record.locationName || record.selectedLocationId || record.storeName || 'Not specified';
        },
        
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
        <div class="modal-overlay" v-if="show" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 1050; display: flex; align-items: center; justify-content: center; overflow: hidden; backdrop-filter: blur(4px);">
            <div class="modal-dialog" style="max-width: 1000px; width: 95%; margin: 20px; max-height: 90vh; display: flex; flex-direction: column;" @click.stop>
                <div class="modal-content" style="background-color: white; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh;">
                    <!-- Modern Header -->
                    <div class="modal-header" style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 1.5rem; border: none;">
                        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <div style="display: flex; align-items: center;">
                                <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; margin-right: 15px;">
                                    <i class="fas fa-trash-alt" style="color: white; font-size: 1.2rem;"></i>
                                </div>
                                <div>
                                    <h5 class="modal-title mb-0" style="color: white; font-weight: 600; font-size: 1.25rem;">Delete Historical Records</h5>
                                    <p class="mb-0" style="color: rgba(255,255,255,0.8); font-size: 0.875rem;">Permanently remove selected stock data</p>
                                </div>
                            </div>
                            <button type="button" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; opacity: 0.8; transition: opacity 0.2s;" 
                                    @click="close" 
                                    onmouseover="this.style.opacity='1'" 
                                    onmouseout="this.style.opacity='0.8'">
                                <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Modern Body -->
                    <div class="modal-body" style="padding: 0; overflow-y: auto; flex: 1;">
                        <!-- Elegant Warning Banner -->
                        <div style="background: #fff5f5; border-left: 4px solid #dc3545; padding: 1.25rem 1.5rem; margin: 0;">
                            <div style="display: flex; align-items: flex-start;">
                                <i class="fas fa-exclamation-circle" style="color: #dc3545; margin-right: 12px; margin-top: 2px;"></i>
                                <div>
                                    <h6 style="color: #721c24; margin: 0 0 0.25rem 0; font-weight: 600;">This action cannot be undone</h6>
                                    <p style="color: #721c24; margin: 0; font-size: 0.875rem; opacity: 0.9;">
                                        Once deleted, these records cannot be recovered. Please review your selection carefully before proceeding.
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div style="padding: 1.5rem;">
                            <!-- Loading State -->
                            <div v-if="isLoading" class="text-center py-5">
                                <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
                                    <span class="sr-only">Loading...</span>
                                </div>
                                <p class="mt-3" style="color: #6c757d;">Loading historical data...</p>
                            </div>
                            
                            <!-- Empty State -->
                            <div v-else-if="historicalData.length === 0" class="text-center py-5">
                                <i class="fas fa-folder-open fa-3x mb-3" style="color: #dee2e6;"></i>
                                <p style="color: #6c757d; font-size: 1.1rem;">No historical data available to delete</p>
                            </div>
                            
                            <!-- Data Table -->
                            <div v-else>
                                <!-- Select All Section -->
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #e9ecef;">
                                    <div class="form-check" style="margin: 0;">
                                        <input 
                                            class="form-check-input" 
                                            type="checkbox" 
                                            id="selectAllRecords" 
                                            :checked="selectAll" 
                                            @change="toggleAllSelection"
                                            style="width: 18px; height: 18px; cursor: pointer;"
                                        >
                                        <label class="form-check-label" for="selectAllRecords" style="margin-left: 8px; cursor: pointer; font-weight: 500;">
                                            Select All Records ({{ historicalData.length }})
                                        </label>
                                    </div>
                                    <div v-if="selectedRecords.length > 0" style="display: flex; align-items: center; color: #dc3545;">
                                        <i class="fas fa-check-circle" style="margin-right: 8px;"></i>
                                        <span style="font-weight: 500;">{{ selectedRecords.length }} selected</span>
                                    </div>
                                </div>
                                
                                <!-- Responsive Table Container -->
                                <div class="table-responsive" style="background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                    <table class="table table-hover mb-0" style="background-color: white; border: 1px solid #dee2e6;">
                                        <thead style="background: #f8f9fa;">
                                            <tr>
                                                <th style="width: 50px; text-align: center; padding: 1rem 0.5rem; font-weight: 600; color: #495057; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    <i class="fas fa-check-square" style="opacity: 0.5;"></i>
                                                </th>
                                                <th style="padding: 1rem; font-weight: 600; color: #495057; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px;">Record ID</th>
                                                <th style="padding: 1rem; font-weight: 600; color: #495057; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    <i class="fas fa-store" style="margin-right: 6px; opacity: 0.7;"></i>Location
                                                </th>
                                                <th style="padding: 1rem; font-weight: 600; color: #495057; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px;">
                                                    <i class="fas fa-calendar-alt" style="margin-right: 6px; opacity: 0.7;"></i>Date Range
                                                </th>
                                                <th style="padding: 1rem; text-align: center;">
                                                    <i class="fas fa-boxes" style="margin-right: 6px; opacity: 0.7;"></i>Items
                                                </th>
                                                <th style="padding: 1rem; text-align: right; font-weight: 600; color: #495057; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px;">Total Cost</th>
                                                <th style="padding: 1rem; text-align: center;">
                                                    <i class="fas fa-trash-alt" style="margin-right: 6px; opacity: 0.7;"></i>Action
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="record in historicalData" 
                                                :key="record.key" 
                                                :style="selectedRecords.includes(record.key) ? 'background-color: #fff5f5; transition: background-color 0.2s;' : 'transition: background-color 0.2s;'"
                                                onmouseover="if(!this.style.backgroundColor || this.style.backgroundColor !== 'rgb(255, 245, 245)') this.style.backgroundColor='#f8f9fa'" 
                                                onmouseout="if(this.style.backgroundColor === 'rgb(248, 249, 250)') this.style.backgroundColor=''">
                                                <td style="text-align: center; padding: 1rem 0.5rem;">
                                                    <input 
                                                        type="checkbox" 
                                                        :value="record.key" 
                                                        :checked="selectedRecords.includes(record.key)"
                                                        @change="updateSelection"
                                                        style="width: 18px; height: 18px; cursor: pointer;"
                                                    >
                                                </td>
                                                <td style="padding: 1rem; font-family: 'Courier New', monospace; font-size: 0.875rem; color: #495057;">{{ record.key }}</td>
                                                <td style="padding: 1rem;">
                                                    <span style="display: inline-block; padding: 0.25rem 0.75rem; background: #e9ecef; border-radius: 4px; font-size: 0.875rem;">
                                                        {{ getLocationDisplay(record) }}
                                                    </span>
                                                </td>
                                                <td style="padding: 1rem; font-size: 0.875rem; color: #6c757d;">
                                                    <span v-if="record.openingDate && record.closingDate">
                                                        <i class="fas fa-calendar-check" style="margin-right: 6px; opacity: 0.6;"></i>
                                                        {{ formatDate(record.openingDate) }} - {{ formatDate(record.closingDate) }}
                                                    </span>
                                                    <span v-else style="font-style: italic;">Not specified</span>
                                                </td>
                                                <td style="padding: 1rem; text-align: center;">
                                                    <span style="display: inline-block; min-width: 40px; padding: 0.25rem 0.5rem; background: #007bff; color: white; border-radius: 20px; font-size: 0.875rem; font-weight: 500;">
                                                        {{ record.totalItems || '0' }}
                                                    </span>
                                                </td>
                                                <td style="padding: 1rem; text-align: right; font-weight: 600; color: #28a745; font-size: 0.95rem;">
                                                    {{ record.totalCostOfUsage ? formatCurrency(record.totalCostOfUsage) : '$0.00' }}
                                                </td>
                                                <td style="padding: 1rem; text-align: center;">
                                                    <button class="btn btn-sm" 
                                                            @click="deleteRecord(record.key)"
                                                            style="background: none; border: 1px solid #dc3545; color: #dc3545; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; transition: all 0.2s;"
                                                            onmouseover="this.style.backgroundColor='#dc3545'; this.style.color='white';" 
                                                            onmouseout="this.style.backgroundColor='transparent'; this.style.color='#dc3545';">
                                                        <i class="fas fa-trash-alt" style="margin-right: 4px;"></i>Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Modern Footer -->
                    <div class="modal-footer" style="background: #f8f9fa; border-top: 1px solid #dee2e6; padding: 1.25rem 1.5rem;">
                        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <div>
                                <span v-if="selectedRecords.length > 0" style="display: flex; align-items: center; color: #dc3545; font-weight: 500;">
                                    <div style="background: #dc3545; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 8px; font-size: 0.875rem;">
                                        {{ selectedRecords.length }}
                                    </div>
                                    record{{ selectedRecords.length > 1 ? 's' : '' }} will be permanently deleted
                                </span>
                            </div>
                            <div style="display: flex; gap: 12px;">
                                <button type="button" 
                                        class="btn" 
                                        @click="close"
                                        style="background: white; border: 1px solid #dee2e6; color: #495057; padding: 0.5rem 1.5rem; border-radius: 6px; font-weight: 500; transition: all 0.2s;"
                                        onmouseover="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#adb5bd';" 
                                        onmouseout="this.style.backgroundColor='white'; this.style.borderColor='#dee2e6';">
                                    Cancel
                                </button>
                                <button 
                                    type="button" 
                                    class="btn" 
                                    @click="deleteSelected" 
                                    :disabled="selectedRecords.length === 0 || isDeleting"
                                    :style="selectedRecords.length === 0 || isDeleting ? 
                                        'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; padding: 0.5rem 1.5rem; border-radius: 6px; font-weight: 500; cursor: not-allowed; opacity: 0.6;' : 
                                        'background: #dc3545; color: white; border: none; padding: 0.5rem 1.5rem; border-radius: 6px; font-weight: 500; transition: all 0.2s; cursor: pointer;'"
                                    onmouseover="if(!this.disabled) { this.style.backgroundColor='#c82333'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 6px rgba(220, 53, 69, 0.3)'; }" 
                                    onmouseout="if(!this.disabled) { this.style.backgroundColor='#dc3545'; this.style.transform='translateY(0)'; this.style.boxShadow='none'; }">
                                    <i class="fas fa-trash-alt" style="margin-right: 6px;"></i>
                                    <span v-if="isDeleting">Deleting...</span>
                                    <span v-else>Delete Selected</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
