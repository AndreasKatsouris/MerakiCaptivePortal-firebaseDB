/**
 * Food Cost Module - Header Mapping Modal Component
 * Allows users to map CSV headers to the required fields
 * Version: 1.9.4-2025-04-19
 */

export const HeaderMappingModal = {
    name: 'header-mapping-modal',
    
    props: {
        /**
         * Control the visibility of the modal
         */
        show: {
            type: Boolean,
            required: true
        },
        
        /**
         * CSV headers parsed from the imported file
         */
        headers: {
            type: Array,
            required: true
        },
        
        /**
         * Current header mapping configuration
         */
        value: {
            type: Object,
            required: true
        }
    },
    
    data() {
        return {
            /**
             * Local copy of header mapping to avoid directly modifying props
             */
            localMapping: {},
            /**
             * Track if we're in the middle of an update to prevent cascading reactivity issues
             */
            isUpdating: false
        };
    },
    
    computed: {
        /**
         * Validate if all required mappings are selected
         */
        isComplete() {
            console.log('Checking mapping completeness:', this.localMapping);
            return this.localMapping.itemCode >= 0 &&
                // Use description field instead of itemName to match auto-detection
                this.localMapping.description >= 0 &&
                this.localMapping.openingQty >= 0 &&
                this.localMapping.closingQty >= 0 &&
                this.localMapping.openingValue >= 0 &&
                this.localMapping.closingValue >= 0;
        }
    },
    
    watch: {
        /**
         * Update local mapping when value prop changes
         */
        value: {
            handler(newValue) {
                if (this.isUpdating) {
                    console.log('Skipping update during local edit');
                    return;
                }
                
                // CRITICAL: Check if this is a DOM event instead of a mapping object
                // This can happen due to event bubbling in Vue
                if (newValue instanceof Event || !newValue || typeof newValue !== 'object') {
                    console.warn('Received invalid mapping value (possibly a DOM event):', newValue);
                    return; // Skip processing invalid values
                }
                
                console.log('Header mapping modal received new mapping:', newValue);
                
                // Deep clone to avoid reference issues
                const mappingCopy = JSON.parse(JSON.stringify(newValue || {}));
                
                // Handle itemName/description discrepancy
                if (mappingCopy.description >= 0 && mappingCopy.itemName === undefined) {
                    // If itemName isn't in mapping but description is, keep them in sync
                    mappingCopy.itemName = mappingCopy.description;
                } else if (mappingCopy.itemName >= 0 && mappingCopy.description === undefined) {
                    // If description exists but itemName doesn't, keep them in sync
                    mappingCopy.description = mappingCopy.itemName;
                }
                
                // Vue 3 doesn't need Vue.set for reactivity
                this.isUpdating = true;
                // Create a fresh object to ensure reactivity
                this.localMapping = {};
                // Then add all properties
                this.$nextTick(() => {
                    Object.keys(mappingCopy).forEach(key => {
                        this.localMapping[key] = mappingCopy[key];
                    });
                    this.isUpdating = false;
                });
                
                console.log('Updated local mapping:', this.localMapping);
            },
            immediate: true,
            deep: true
        },
        
        /**
         * Watch when modal becomes visible to ensure proper initialization
         */
        show: {
            handler(isVisible) {
                if (isVisible && !this.isUpdating) {
                    console.log('Modal is now visible, current mapping:', this.value);
                    // Force refresh of local mapping when modal becomes visible
                    this.isUpdating = true;
                    this.localMapping = JSON.parse(JSON.stringify(this.value || {}));
                    this.isUpdating = false;
                }
            },
            immediate: true
        },
        
        /**
         * Watch for itemCode changes to prevent cascading issues
         */
        'localMapping.itemCode': function(newValue) {
            console.log('itemCode changed to:', newValue);
            this.updateField('itemCode', newValue);
        },
        
        /**
         * Watch for description changes to keep itemName in sync
         */
        'localMapping.description': function(newValue) {
            console.log('description changed to:', newValue);
            this.updateField('description', newValue);
            
            // Keep itemName in sync with description if needed
            if (newValue >= 0 && this.localMapping.itemName === undefined) {
                this.updateField('itemName', newValue);
            }
        }
    },
    
    methods: {
        /**
         * Safely update an individual field
         * @param {string} field - The field name to update
         * @param {any} value - The new value for the field
         */
        updateField(field, value) {
            // Skip if we're already in an update to prevent cascading reactivity
            if (this.isUpdating) return;
            
            console.log(`Safe update of field '${field}' to`, value);
            this.isUpdating = true;
            
            // Direct property assignment works in Vue 3
            this.localMapping[field] = value;
            
            // If this is changing the itemCode field, check if we need to handle special cases
            if (field === 'itemCode' && this.headers && this.headers.length > 0) {
                // Log the current state for debugging
                const headerName = value >= 0 && value < this.headers.length 
                    ? this.headers[value] 
                    : 'None';
                console.log(`Item code mapped to column ${value} ("${headerName}")`); 
            }
            
            this.isUpdating = false;
        },
        
        /**
         * Cancel mapping and close the modal
         */
        onCancel() {
            this.$emit('cancel');
        },
        
        /**
         * Process the mapping and emit the updated value
         */
        onProcess() {
            if (!this.isComplete) return;
            
            // Create deep copy to avoid reference issues
            const finalMapping = JSON.parse(JSON.stringify(this.localMapping));
            
            // Ensure both itemName and description are populated
            // This is important because the auto-detection uses "description"
            // while some UI components expect "itemName"
            if (finalMapping.description >= 0 && (finalMapping.itemName === undefined || finalMapping.itemName === null)) {
                finalMapping.itemName = finalMapping.description;
            } else if (finalMapping.itemName >= 0 && (finalMapping.description === undefined || finalMapping.description === null)) {
                finalMapping.description = finalMapping.itemName;
            }
            
            console.log('Processing header mapping with final mapping:', finalMapping);
            
            // IMPORTANT: Add a timestamp to force the parent component to recognize this as a new value
            // This ensures the data is reprocessed with the updated mapping even if only field-level changes occurred
            finalMapping._timestamp = Date.now();
            finalMapping._manual = true;
            
            // Mark mapping as safe, traceable object to prevent event confusion 
            Object.defineProperty(finalMapping, '_isMappingObject', { value: true });
            
            // Create a synthetic event to prevent DOM event from being passed
            const customEvent = { 
                detail: finalMapping, 
                _isCustomEvent: true,
                data: finalMapping
            };
            
            // First emit the input with explicit data payload
            // This ensures we don't pass the DOM event
            this.$emit('input', finalMapping, customEvent);
            console.log('⚠️ EMITTING MAPPING (safe check):', JSON.stringify(finalMapping));
            
            // Then trigger processing with data attached
            setTimeout(() => {
                this.$emit('process', finalMapping);
                
                // Signal parent to close modal
                this.$emit('cancel');
            }, 50);
        }
    },
    
    template: `
        <div class="modal-overlay header-mapping-modal" v-if="show" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); z-index: 1050; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            <div class="modal-dialog modal-lg" style="width: 90%; max-width: 1000px; margin: 0; position: relative; z-index: 1051;" @click.stop>
                <div class="modal-content" style="border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                    <div class="modal-header bg-primary text-white" style="border-radius: 8px 8px 0 0;">
                        <h5 class="modal-title">
                            <i class="fas fa-table mr-2"></i> CSV Header Mapping
                        </h5>
                        <button type="button" class="close text-white" @click="onCancel" style="background: transparent; border: none; font-size: 24px;">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body bg-white" style="overflow-y: auto; max-height: calc(85vh - 120px);">
                        <div class="alert alert-info mb-3">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Map your CSV columns to the appropriate fields below.</strong>
                            <p class="mb-0 small">Select the corresponding column for each required field. Fields marked with * are required.</p>
                        </div>
                        
                        <div class="row mb-4">
                            <div class="col-md-12">
                                <div class="card border-secondary mb-3">
                                    <div class="card-header bg-secondary text-white">
                                        <strong>Identification Fields</strong>
                                    </div>
                                    <div class="card-body bg-light">
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Item Code*:</label>
                                                    <select class="form-select" v-model="localMapping.itemCode">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Unique identifier for stock items</small>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Item Name*:</label>
                                                    <select class="form-select" v-model="localMapping.description">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Description of the item</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row mb-4">
                            <div class="col-md-12">
                                <div class="card border-secondary mb-3">
                                    <div class="card-header bg-secondary text-white">
                                        <strong>Categorization Fields</strong>
                                    </div>
                                    <div class="card-body bg-light">
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Category:</label>
                                                    <select class="form-select" v-model="localMapping.category">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Product category</small>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Cost Center:</label>
                                                    <select class="form-select" v-model="localMapping.costCenter">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Department or cost center</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row mb-4">
                            <div class="col-md-12">
                                <div class="card border-secondary mb-3">
                                    <div class="card-header bg-secondary text-white">
                                        <strong>Stock Quantity & Value Fields</strong>
                                    </div>
                                    <div class="card-body bg-light">
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Opening Quantity*:</label>
                                                    <select class="form-select" v-model="localMapping.openingQty">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Beginning stock quantity</small>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Opening Value*:</label>
                                                    <select class="form-select" v-model="localMapping.openingValue">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Beginning stock value</small>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Purchase Quantity:</label>
                                                    <select class="form-select" v-model="localMapping.purchaseQty">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Quantity purchased</small>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Purchase Value:</label>
                                                    <select class="form-select" v-model="localMapping.purchaseValue">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Value of purchases</small>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Closing Quantity*:</label>
                                                    <select class="form-select" v-model="localMapping.closingQty">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Ending stock quantity</small>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Closing Value*:</label>
                                                    <select class="form-select" v-model="localMapping.closingValue">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Ending stock value</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row mb-4">
                            <div class="col-md-12">
                                <div class="card border-secondary">
                                    <div class="card-header bg-secondary text-white">
                                        <strong>Additional Fields</strong>
                                    </div>
                                    <div class="card-body bg-light">
                                        <div class="row g-3">
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Unit:</label>
                                                    <select class="form-select" v-model="localMapping.unit">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Unit of measurement</small>
                                                </div>
                                            </div>
                                            <div class="col-md-6">
                                                <div class="form-group">
                                                    <label class="form-label fw-bold">Usage Value:</label>
                                                    <select class="form-select" v-model="localMapping.usageValue">
                                                        <option value="-1">-- Select Column --</option>
                                                        <option v-for="(header, index) in headers" :value="index">{{ header }}</option>
                                                    </select>
                                                    <small class="text-muted">Direct value of usage (if available)</small>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer bg-white">
                        <div class="d-flex justify-content-between w-100">
                            <div>
                                <span v-if="!isComplete" class="text-danger">
                                    <i class="fas fa-exclamation-circle"></i> 
                                    Please map all required fields
                                </span>
                            </div>
                            <div>
                                <button type="button" class="btn btn-secondary me-2" @click="onCancel">
                                    <i class="fas fa-times"></i> Cancel
                                </button>
                                <button type="button" class="btn btn-primary" @click="onProcess" :disabled="!isComplete">
                                    <i class="fas fa-check"></i> Process Data
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
