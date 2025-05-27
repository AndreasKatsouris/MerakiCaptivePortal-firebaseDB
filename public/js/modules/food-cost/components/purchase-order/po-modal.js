/**
 * Purchase Order Modal Component
 * Manages the UI for the purchase order modal dialog
 * Version: 2.0.1-2025-05-15
 */

import { generatePurchaseOrder, exportPurchaseOrderToCSV } from '../../order-calculator.js';
import { generateAdvancedPurchaseOrder, exportAdvancedPurchaseOrderToCSV } from '../../order-calculator-advanced.js';

/**
 * Purchase Order Modal Component
 * Handles UI for purchase order generation and display
 */
export const PurchaseOrderModal = {
    props: {
        showModal: {
            type: Boolean,
            default: false
        },
        stockData: {
            type: Array,
            default: () => []
        },
        suppliers: {
            type: Array,
            default: () => ['All Suppliers']
        },
        storeName: {
            type: String,
            default: 'default'
        },
        daysToNextDelivery: {
            type: Number,
            default: 5
        },
        safetyStockPercentage: {
            type: Number,
            default: 15
        },
        criticalItemBuffer: {
            type: Number,
            default: 30
        },
        availableSuppliers: {
            type: Array,
            default: () => ['All Suppliers']
        }
    },
    
    data() {
        return {
            // Order data
            purchaseOrderItems: [],
            purchaseOrderTotal: 0,
            uniqueCategories: 0,
            criticalItemCount: 0,
            supplierSummary: [],
            expandedItemId: null,
            
            // Loading state
            isLoading: false,
            orderStatus: null,
            
            // Sort controls
            sortField: 'itemCode',
            sortDirection: 'asc',
            
            // Local copies of props to prevent reversion
            localDaysToNextDelivery: this.daysToNextDelivery || 7,
            localSafetyStockPercentage: this.safetyStockPercentage || 15,
            localCriticalItemBuffer: this.criticalItemBuffer || 30,
            localSelectedSupplier: this.selectedSupplier || 'All Suppliers',
            
            // Additional parameters
            coveringDays: 2, // Previously leadTimeDays
            
            // Advanced ordering options
            useAdvancedCalculation: false,
            lookbackDays: 14,
            volatilityMultiplier: 1.0,
            isAdvancedGenerating: false
        };
    },
    
    watch: {
        showModal(newVal) {
            if (newVal) {
                // Initialize local values from props when modal is shown
                this.localDaysToNextDelivery = this.daysToNextDelivery || 7;
                this.localSafetyStockPercentage = this.safetyStockPercentage || 15;
                this.localCriticalItemBuffer = this.criticalItemBuffer || 30;
                this.localSelectedSupplier = this.selectedSupplier || 'All Suppliers';
                this.regeneratePurchaseOrder();
            }
        },
        
        // Watch local parameters instead of props
        localDaysToNextDelivery() {
            this.regeneratePurchaseOrder();
        },
        
        localSafetyStockPercentage() {
            this.regeneratePurchaseOrder();
        },
        
        localCriticalItemBuffer() {
            this.regeneratePurchaseOrder();
        },
        
        localSelectedSupplier() {
            this.regeneratePurchaseOrder();
        },
        
        useAdvancedCalculation() {
            // When advanced calculation is toggled, properly get store name first
            if (this.useAdvancedCalculation && this.stockData && this.stockData.length > 0) {
                // Try to extract store name directly from stock data
                const firstRecord = this.stockData[0];
                if (firstRecord.storeName) {
                    console.log(`[PO Modal] Found store name in stock data: ${firstRecord.storeName}`);
                    // Store the name in localStorage so it persists
                    localStorage.setItem('lastStoreName', firstRecord.storeName);
                } else if (firstRecord.storeContext && firstRecord.storeContext.name) {
                    console.log(`[PO Modal] Found store name in storeContext: ${firstRecord.storeContext.name}`);
                    localStorage.setItem('lastStoreName', firstRecord.storeContext.name);
                } else if (firstRecord.metadata && firstRecord.metadata.storeName) {
                    console.log(`[PO Modal] Found store name in metadata: ${firstRecord.metadata.storeName}`);
                    localStorage.setItem('lastStoreName', firstRecord.metadata.storeName);
                }
            }
            
            // Then regenerate the purchase order
            this.regeneratePurchaseOrder();
        },
        
        lookbackDays() {
            if (this.useAdvancedCalculation) {
                this.regeneratePurchaseOrder();
            }
        }
    },
    
    methods: {
        /**
         * Generate or regenerate purchase order based on current filters and parameters
         */
        async regeneratePurchaseOrder() {
            if (!this.stockData || this.stockData.length === 0) {
                console.warn('No stock data available to generate purchase order');
                return;
            }
            
            this.isLoading = true;
            
            try {
                // Create parameters for order calculation using local values
                const orderParams = {
                    daysToNextDelivery: this.localDaysToNextDelivery,
                    coveringDays: this.coveringDays, // Support for new parameter name
                    safetyStockPercentage: this.localSafetyStockPercentage,
                    criticalItemBuffer: this.localCriticalItemBuffer
                };
                
                // Add advanced parameters if using advanced calculation
                if (this.useAdvancedCalculation) {
                    Object.assign(orderParams, {
                        lookbackDays: this.lookbackDays,
                        volatilityMultiplier: this.volatilityMultiplier
                    });
                    
                    this.isAdvancedGenerating = true;
                    this.orderStatus = {
                        type: 'info',
                        message: 'Generating advanced purchase order using historical data...'
                    };
                    
                    // Use the storeName directly from props
                    // This value is passed from the parent component and should be the most accurate
                    let storeName = this.storeName;
                    
                    // If no store name is provided in props, try to get it from localStorage
                    if (storeName === 'default' && localStorage.getItem('lastStoreName')) {
                        storeName = localStorage.getItem('lastStoreName');
                        console.log(`[PO Modal] Using store name from localStorage: ${storeName}`);
                    }
                    
                    // Store this store name for future use
                    if (storeName !== 'default') {
                        localStorage.setItem('lastStoreName', storeName);
                    }
                    
                    console.log(`Using store context: ${storeName} for advanced order generation`);
                    
                    // Generate advanced purchase order with historical data
                    this.purchaseOrderItems = await generateAdvancedPurchaseOrder(
                        this.stockData,
                        storeName,
                        this.localSelectedSupplier,
                        orderParams
                    );
                    
                    this.isAdvancedGenerating = false;
                } else {
                    // Generate basic purchase order with standard parameters
                    this.purchaseOrderItems = generatePurchaseOrder(
                        this.stockData, 
                        this.localSelectedSupplier, 
                        orderParams
                    );
                }
                
                // Update totals and supplier summary
                this.updatePurchaseOrderTotals();
                this.updateSupplierSummary();
                
                console.log(`Purchase order regenerated with ${this.purchaseOrderItems.length} items using ${this.useAdvancedCalculation ? 'advanced' : 'basic'} calculation`);
                
                // Show confirmation if successful
                if (this.purchaseOrderItems.length > 0) {
                    this.orderStatus = {
                        type: 'success',
                        message: `${this.useAdvancedCalculation ? 'Advanced' : 'Basic'} purchase order generated with ${this.purchaseOrderItems.length} items`
                    };
                } else {
                    this.orderStatus = {
                        type: 'warning',
                        message: 'No items require reordering at this time.'
                    };
                }
            } catch (error) {
                console.error('Error generating purchase order:', error);
                this.orderStatus = {
                    type: 'error',
                    message: `Error generating ${this.useAdvancedCalculation ? 'advanced' : 'basic'} purchase order. Please check console for details.`
                };
                
                // If advanced calculation failed, offer to try basic calculation
                if (this.useAdvancedCalculation) {
                    this.orderStatus.message += ' Consider using Basic calculation method instead.';
                }
            } finally {
                this.isLoading = false;
                this.isAdvancedGenerating = false;
            }
        },
        
        /**
         * Update purchase order totals based on current order quantities
         */
        updatePurchaseOrderTotals() {
            this.purchaseOrderTotal = this.purchaseOrderItems.reduce(
                (total, item) => total + (item.orderQuantity * item.unitCost), 0
            );
            
            // Also calculate item count and category breakdown
            this.uniqueCategories = [...new Set(this.purchaseOrderItems.map(item => item.category))].length;
            
            // Count critical items
            this.criticalItemCount = this.purchaseOrderItems.filter(item => item.isCritical).length;
        },
        
        /**
         * Update supplier summary for the current purchase order
         */
        updateSupplierSummary() {
            // Group items by supplier
            const supplierGroups = {};
            
            this.purchaseOrderItems.forEach(item => {
                const supplier = item.supplierName || 'Unassigned';
                if (!supplierGroups[supplier]) {
                    supplierGroups[supplier] = {
                        itemCount: 0,
                        totalCost: 0
                    };
                }
                supplierGroups[supplier].itemCount++;
                supplierGroups[supplier].totalCost += (item.orderQuantity * item.unitCost);
            });
            
            // Convert to array for template rendering
            this.supplierSummary = Object.entries(supplierGroups).map(([name, data]) => ({
                name,
                itemCount: data.itemCount,
                totalCost: data.totalCost
            })).sort((a, b) => b.totalCost - a.totalCost);
        },
        
        /**
         * Sort purchase order items by specified property
         */
        sortPurchaseOrderItems(property) {
            this.sortField = property;
            this.sortDirection = this.sortField === property && this.sortDirection === 'asc' ? 'desc' : 'asc';
            
            const direction = this.sortDirection === 'asc' ? 1 : -1;
            
            this.purchaseOrderItems.sort((a, b) => {
                // Handle string vs number sorting appropriately
                if (typeof a[property] === 'string') {
                    return direction * a[property].localeCompare(b[property]);
                } else {
                    return direction * (a[property] - b[property]);
                }
            });
        },
        
        /**
         * Get the sort indicator for a column
         */
        getSortIndicator(property) {
            if (this.sortField !== property) return '';
            return this.sortDirection === 'asc' ? '↑' : '↓';
        },
        
        /**
         * Increment order quantity for an item
         */
        incrementOrderQuantity(item) {
            item.orderQuantity = Math.max(0, (item.orderQuantity || 0) + 1);
            this.updatePurchaseOrderTotals();
        },
        
        /**
         * Decrement order quantity for an item
         */
        decrementOrderQuantity(item) {
            item.orderQuantity = Math.max(0, (item.orderQuantity || 0) - 1);
            this.updatePurchaseOrderTotals();
        },
        
        /**
         * Set specific order quantity for an item
         */
        setOrderQuantity(item, quantity) {
            const numericValue = parseFloat(quantity);
            if (!isNaN(numericValue)) {
                item.orderQuantity = Math.max(0, numericValue);
                this.updatePurchaseOrderTotals();
            }
        },
        
        /**
         * Export the purchase order to CSV and download the file
         */
        exportPurchaseOrder() {
            if (this.purchaseOrderItems.length === 0) {
                console.warn('No purchase order items to export');
                return;
            }
            
            try {
                // Format timestamp for filename
                const now = new Date();
                const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
                const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
                const timestamp = `${dateStr}_${timeStr}`;
                
                // Format supplier name for filename
                const supplierStr = this.localSelectedSupplier === 'All Suppliers' 
                    ? 'all-suppliers'
                    : this.localSelectedSupplier.toLowerCase().replace(/\s+/g, '-');
                
                // Add calculation type to filename
                const calcType = this.useAdvancedCalculation ? 'advanced' : 'basic';
                
                // Create filename
                const filename = `purchase_order_${calcType}_${supplierStr}_${timestamp}.csv`;
                
                // Generate CSV content based on calculation type
                const csvContent = this.useAdvancedCalculation
                    ? exportAdvancedPurchaseOrderToCSV(this.purchaseOrderItems)
                    : exportPurchaseOrderToCSV(this.purchaseOrderItems);
                
                // Create download link
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                
                // Add to DOM, trigger download, and clean up
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                console.log(`${calcType} purchase order exported to ${filename}`);
                
                this.orderStatus = {
                    type: 'success',
                    message: `${this.useAdvancedCalculation ? 'Advanced' : 'Basic'} purchase order exported to ${filename}`
                };
                
            } catch (error) {
                console.error('Error exporting purchase order:', error);
                this.orderStatus = {
                    type: 'error',
                    message: 'Error exporting purchase order. Please check console for details.'
                };
            }
        },
        
        /**
         * Close the purchase order modal
         */
        closeModal() {
            this.$emit('close');
        },
        
        /**
         * Get CSS class for category badge
         */
        getCategoryBadgeClass(category) {
            if (!category) return '';
            
            // Create a consistent hash from the category string
            const hash = Array.from(category).reduce(
                (acc, char) => acc + char.charCodeAt(0), 0
            );
            const hue = Math.abs(hash) % 360;
            return `badge-category-${hue % 5}`;
        },
        
        /**
         * Toggle expanded details for an item
         */
        toggleItemDetails(item) {
            if (this.expandedItemId === item.itemCode) {
                this.expandedItemId = null;
            } else {
                this.expandedItemId = item.itemCode;
            }
        },
        
        /**
         * Sort historical data by date (newest first)
         */
        sortedHistoricalData(rawData) {
            // Sort the data by date in descending order (newest first)
            if (!rawData || !Array.isArray(rawData)) return [];
            
            return [...rawData].sort((a, b) => {
                const dateA = a.date instanceof Date ? a.date : new Date(a.date);
                const dateB = b.date instanceof Date ? b.date : new Date(b.date);
                return dateB - dateA; // Descending order
            });
        },
        
        /**
         * Group historical data by week and calculate weekly averages
         */
        getWeeklySummary(rawData) {
            if (!rawData || !Array.isArray(rawData) || rawData.length === 0) return [];
            
            // Group by week
            const weekMap = {};
            
            rawData.forEach(record => {
                const date = record.date instanceof Date ? record.date : new Date(record.date);
                // Get the start of the week (Sunday)
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                weekStart.setHours(0, 0, 0, 0);
                
                const weekKey = weekStart.toISOString();
                
                if (!weekMap[weekKey]) {
                    weekMap[weekKey] = {
                        startDate: weekStart,
                        records: [],
                        totalUsage: 0,
                        totalDays: 0
                    };
                }
                
                weekMap[weekKey].records.push(record);
                weekMap[weekKey].totalUsage += record.usage;
                weekMap[weekKey].totalDays += record.periodDays;
            });
            
            // Convert map to array and calculate the average usage per day
            const weekSummaries = Object.values(weekMap).map(week => {
                return {
                    startDate: week.startDate,
                    totalUsage: week.totalUsage,
                    avgDailyUsage: week.totalDays > 0 ? week.totalUsage / week.totalDays : 0
                };
            });
            
            // Sort by date (most recent first)
            return weekSummaries.sort((a, b) => b.startDate - a.startDate);
        },
        
        /**
         * Format a date as YYYY-MM-DD
         */
        formatDate(date) {
            if (!date) return '';
            const d = date instanceof Date ? date : new Date(date);
            if (isNaN(d.getTime())) return 'Invalid Date';
            
            // Format as YYYY-MM-DD
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        },
        
        /**
         * Reset all parameters to default values
         */
        resetParameters() {
            console.log('Resetting parameters to defaults');
            
            this.localDaysToNextDelivery = 7;
            this.localSafetyStockPercentage = 15;
            this.localCriticalItemBuffer = 30;
            
            // Reset advanced parameters too
            this.lookbackDays = 14;
            this.volatilityMultiplier = 1.0;
            
            // Don't reset supplier selection to allow for easier comparison
            // this.localSelectedSupplier = 'All Suppliers';
            
            this.orderStatus = {
                type: 'info',
                message: 'Order parameters reset to default values'
            };
            
            // Will trigger regeneration through watch property
        },
    },
    
    template: `
        <div class="modal-overlay" v-if="showModal" @click="closeModal">
            <div class="modal-dialog modal-xl" @click.stop style="max-width: 95%; max-height: 90vh; margin: 2vh auto;">
                <div class="modal-content" :class="{ 'shadow-lg': true }" style="padding: 0.75rem;">
                    <!-- Modal Header -->
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title d-flex align-items-center">
                            <i class="fas fa-file-invoice mr-2"></i> Generate Purchase Order
                            <span v-if="useAdvancedCalculation" class="badge bg-info text-white ml-2">Advanced</span>
                        </h5>
                        <button type="button" class="btn-close btn-close-white" @click="closeModal">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    
                    <div class="modal-body" style="overflow-y: auto; max-height: calc(85vh - 130px); padding: 1.5rem;">
                        <!-- Status Messages -->
                        <div v-if="orderStatus" :class="'alert alert-' + orderStatus.type + ' mb-3 d-flex align-items-center justify-content-between'">
                            <div>
                                <i :class="'fas ' + (orderStatus.type === 'success' ? 'fa-check-circle' : orderStatus.type === 'warning' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle') + ' mr-2'"></i>
                                <strong>{{ orderStatus.message }}</strong>
                            </div>
                            <button class="btn btn-sm btn-outline-secondary" @click="orderStatus = null">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <!-- Loading Indicator -->
                        <div v-if="isLoading" class="alert alert-info mb-3 text-center">
                            <div class="spinner-border spinner-border-sm mr-2" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                            <span>Generating purchase order...</span>
                        </div>
                        
                        <!-- Order Overview Card -->
                        <div v-if="purchaseOrderItems.length > 0 && !isLoading" class="card mb-4 border-success">
                            <div class="card-header bg-success text-white">
                                <strong><i class="fas fa-clipboard-check mr-2"></i> Order Summary</strong>
                            </div>
                            <div class="card-body p-4">
                                <div class="row">
                                    <div class="col-md-3 col-6 mb-3">
                                        <div class="card h-100 border-0 bg-light">
                                            <div class="card-body text-center">
                                                <h2 class="mb-1">{{ purchaseOrderItems.length }}</h2>
                                                <div class="text-muted small">Items</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-3 col-6 mb-3">
                                        <div class="card h-100 border-0 bg-light">
                                            <div class="card-body text-center">
                                                <h2 class="mb-1">{{ uniqueCategories }}</h2>
                                                <div class="text-muted small">Categories</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-3 col-6 mb-3">
                                        <div class="card h-100 border-0 bg-light">
                                            <div class="card-body text-center">
                                                <h2 class="mb-1">{{ criticalItemCount }}</h2>
                                                <div class="text-muted small">Critical Items</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-3 col-6 mb-3">
                                        <div class="card h-100 border-0 bg-light">
                                            <div class="card-body text-center">
                                                <h2 class="mb-1">{{ purchaseOrderTotal.toFixed(2) }}</h2>
                                                <div class="text-muted small">Total Value</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Filters and Settings Section -->
                        <div class="card mb-4">
                            <div class="card-header bg-light d-flex justify-content-between align-items-center p-3">
                                <strong><i class="fas fa-sliders-h mr-2"></i> Order Parameters</strong>
                                <button class="btn btn-sm btn-outline-secondary" @click="resetParameters">
                                    <i class="fas fa-redo-alt mr-1"></i> Reset to Defaults
                                </button>
                            </div>
                            <div class="card-body p-4">
                                <div class="row">
                                    <div class="col-md-3 col-sm-6 mb-3">
                                        <div class="form-group mb-4">
                                            <label for="supplier" class="mb-2"><i class="fas fa-truck mr-2"></i> Supplier:</label>
                                            <select class="form-control form-control-sm" v-model="localSelectedSupplier" id="supplier">
                                                <option v-for="supplier in availableSuppliers" :key="supplier">{{ supplier }}</option>
                                            </select>
                                        </div>
                                        
                                        <!-- Advanced Calculation Toggle -->
                                        <div class="form-group mb-4">
                                            <div class="d-flex justify-content-between align-items-center mb-2">
                                                <label class="mb-0"><i class="fas fa-chart-line mr-2"></i> Calculation Method:</label>
                                                <span class="badge" :class="useAdvancedCalculation ? 'bg-info text-white' : 'bg-secondary text-white'">{{ useAdvancedCalculation ? 'Advanced' : 'Basic' }}</span>
                                            </div>
                                            <div class="form-check form-switch">
                                                <input class="form-check-input" type="checkbox" id="useAdvancedCalculation" v-model="useAdvancedCalculation">
                                                <label class="form-check-label" for="useAdvancedCalculation">
                                                    Use Historical Data Analysis
                                                </label>
                                            </div>
                                            <small class="text-muted d-block mt-1" v-if="useAdvancedCalculation">
                                                <i class="fas fa-info-circle mr-1"></i> Uses historical usage patterns to calculate more accurate order quantities.
                                            </small>
                                        </div>
                                        
                                        <!-- Advanced Parameters (only shown when advanced calculation is enabled) -->
                                        <div class="form-group mb-4" v-if="useAdvancedCalculation">
                                            <label for="lookbackDays" class="mb-2">Historical Look-back Period (days):</label>
                                            <select class="form-control form-control-sm" v-model="lookbackDays" id="lookbackDays">
                                                <option value="7">7 days</option>
                                                <option value="14">14 days</option>
                                                <option value="30">30 days</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="col-md-3 col-sm-6 mb-3">
                                        <div class="form-group">
                                            <label class="form-label">Days to Next Delivery:</label>
                                            <input type="number" class="form-control" v-model.number="localDaysToNextDelivery" min="1" max="30">
                                        </div>
                                    </div>
                                    <div class="col-md-3 col-sm-6 mb-3">
                                        <div class="form-group">
                                            <label class="form-label">Covering Days:</label>
                                            <input type="number" class="form-control" v-model.number="coveringDays" min="0" max="14" @change="regeneratePurchaseOrder">
                                        </div>
                                    </div>
                                    <div class="col-md-3 col-sm-6 mb-3">
                                        <div class="form-group">
                                            <label class="form-label">Safety Stock (%):</label>
                                            <input type="number" class="form-control" v-model.number="localSafetyStockPercentage" min="0" max="100">
                                        </div>
                                    </div>
                                </div>
                                <div class="row">
                                    <div class="col-md-3 col-sm-6 mb-3">
                                        <div class="form-group">
                                            <label class="form-label">Critical Item Buffer (%):</label>
                                            <input type="number" class="form-control" v-model.number="localCriticalItemBuffer" min="0" max="100">
                                        </div>
                                    </div>
                                    <div class="col-md-9 col-sm-6 mb-3 d-flex align-items-end">
                                        <button class="btn btn-primary" @click="regeneratePurchaseOrder">
                                            <i class="fas fa-sync-alt mr-1"></i> Generate Purchase Order
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Supplier Summary Section -->
                        <div v-if="supplierSummary.length > 0" class="card mb-4">
                            <div class="card-header bg-light">
                                <strong><i class="fas fa-truck mr-2"></i> Supplier Breakdown</strong>
                            </div>
                            <div class="card-body p-0">
                                <div class="table-responsive">
                                    <table class="table table-sm table-striped table-hover mb-0">
                                        <thead class="thead-light">
                                            <tr>
                                                <th>Supplier</th>
                                                <th class="text-center">Items</th>
                                                <th class="text-right">Total Cost</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="supplier in supplierSummary" :key="supplier.name">
                                                <td>{{ supplier.name }}</td>
                                                <td class="text-center">{{ supplier.itemCount }}</td>
                                                <td class="text-right">{{ supplier.totalCost.toFixed(2) }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Purchase Order Items -->
                        <div class="card mb-0">
                            <div class="card-header bg-light d-flex justify-content-between align-items-center">
                                <strong><i class="fas fa-shopping-cart mr-2"></i> Purchase Order Items</strong>
                                <div>
                                    <button class="btn btn-sm btn-success me-2" @click="exportPurchaseOrder" :disabled="purchaseOrderItems.length === 0">
                                        <i class="fas fa-file-export mr-1"></i> Export to CSV
                                    </button>
                                </div>
                            </div>
                            <div class="card-body p-0">
                                <div class="table-responsive">
                                    <table class="table table-sm table-striped table-hover mb-0">
                                        <thead class="thead-light">
                                            <tr>
                                                <th @click="sortPurchaseOrderItems('itemCode')" class="sortable">Item Code {{ getSortIndicator('itemCode') }}</th>
                                                <th @click="sortPurchaseOrderItems('description')" class="sortable">Description {{ getSortIndicator('description') }}</th>
                                                <th @click="sortPurchaseOrderItems('category')" class="sortable">Category {{ getSortIndicator('category') }}</th>
                                                <th @click="sortPurchaseOrderItems('supplierName')" class="sortable">Supplier {{ getSortIndicator('supplierName') }}</th>
                                                <th @click="sortPurchaseOrderItems('closingBalance')" class="sortable text-right">Current Stock {{ getSortIndicator('closingBalance') }}</th>
                                                <th @click="sortPurchaseOrderItems('usagePerDay')" class="sortable text-right">Usage/Day {{ getSortIndicator('usagePerDay') }}</th>
                                                <th @click="sortPurchaseOrderItems('orderQuantity')" class="sortable text-right">Order Qty {{ getSortIndicator('orderQuantity') }}</th>
                                                <th @click="sortPurchaseOrderItems('unitCost')" class="sortable text-right">Unit Cost {{ getSortIndicator('unitCost') }}</th>
                                                <th class="text-right">Total</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <template v-for="item in purchaseOrderItems">
                                                <tr :key="item.itemCode" :class="{'table-warning': item.isCritical}">
                                                    <td>{{ item.itemCode }}</td>
                                                    <td>
                                                        {{ item.description }}
                                                        <span v-if="item.isCritical" class="badge bg-warning text-dark ml-1" title="Critical Item">
                                                            <i class="fas fa-exclamation-triangle"></i>
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span class="badge text-dark" :class="getCategoryBadgeClass(item.category)">
                                                            {{ item.category }}
                                                        </span>
                                                    </td>
                                                    <td>{{ item.supplierName || 'Unassigned' }}</td>
                                                    <td class="text-right">{{ item.closingQty !== undefined ? item.closingQty.toFixed(2) : '0.00' }}</td>
                                                    <td class="text-right">{{ item.usagePerDay ? item.usagePerDay.toFixed(2) : '0.00' }}</td>
                                                    <td class="text-right">
                                                        <div class="input-group input-group-sm">
                                                            <button class="btn btn-outline-secondary btn-sm" @click="decrementOrderQuantity(item)">
                                                                <i class="fas fa-minus"></i>
                                                            </button>
                                                            <input type="number" class="form-control form-control-sm text-center" :value="item.orderQuantity ? item.orderQuantity.toFixed(0) : '0'" 
                                                                @change="setOrderQuantity(item, $event.target.value)" min="0" style="max-width: 60px">
                                                            <button class="btn btn-outline-secondary btn-sm" @click="incrementOrderQuantity(item)">
                                                                <i class="fas fa-plus"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td class="text-right">{{ item.unitCost ? item.unitCost.toFixed(2) : '0.00' }}</td>
                                                    <td class="text-right font-weight-bold">{{ (item.orderQuantity * item.unitCost).toFixed(2) }}</td>
                                                    <td class="text-center">
                                                        <button class="btn btn-outline-info btn-sm" @click="toggleItemDetails(item)">
                                                            <i :class="expandedItemId === item.itemCode ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
                                                        </button>
                                                    </td>
                                                </tr>
                                                <tr v-if="expandedItemId === item.itemCode" :key="item.itemCode + '-details'" class="bg-light">
                                                    <td colspan="10" class="p-3">
                                                        <div class="row">
                                                            <div class="col-md-6">
                                                                <h6 class="border-bottom pb-2">Calculation Details</h6>
                                                                
                                                                <!-- Advanced calculation insights -->
                                                                <div v-if="useAdvancedCalculation && item.historicalInsights" class="alert alert-info mb-3 py-2 px-3">
                                                                    <h6 class="mb-2 font-weight-bold"><i class="fas fa-chart-line mr-2"></i> Historical Insights</h6>
                                                                    
                                                                    <!-- Basic statistics -->
                                                                    <div class="row mb-2">
                                                                        <div class="col-md-6">
                                                                            <small class="d-block mb-1">
                                                                                <span class="text-muted">Historical Average Usage:</span> 
                                                                                <strong>{{ item.historicalInsights.avgDailyUsage.toFixed(2) }}</strong> per day
                                                                            </small>
                                                                            <small class="d-block mb-1">
                                                                                <span class="text-muted">Usage Volatility:</span> 
                                                                                <strong>{{ (item.historicalInsights.volatility * 100).toFixed(1) }}%</strong>
                                                                            </small>
                                                                        </div>
                                                                        <div class="col-md-6">
                                                                            <small class="d-block mb-1">
                                                                                <span class="text-muted">Trend:</span> 
                                                                                <strong>{{ item.historicalInsights.trend ? item.historicalInsights.trend.direction : 'stable' }}</strong>
                                                                            </small>
                                                                            <small class="d-block mb-1">
                                                                                <span class="text-muted">Data Points:</span> 
                                                                                <strong>{{ item.historicalInsights.dataPoints }}</strong>
                                                                            </small>
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    <!-- Usage Calculation Breakdown -->
                                                                    <div class="border-top pt-2 mt-2">
                                                                        <h6 class="small font-weight-bold">Usage Calculation Breakdown</h6>
                                                                        <table class="table table-sm table-bordered mb-0 small">
                                                                            <tr>
                                                                                <td class="text-muted" width="40%">Current Usage</td>
                                                                                <td class="text-right">{{ item.historicalInsights.adjustments && item.historicalInsights.adjustments.currentUsage ? item.historicalInsights.adjustments.currentUsage.toFixed(2) : '0.00' }} per day</td>
                                                                            </tr>
                                                                            <tr>
                                                                                <td class="text-muted">Historical Average</td>
                                                                                <td class="text-right">{{ item.historicalInsights.avgDailyUsage.toFixed(2) }} per day</td>
                                                                            </tr>
                                                                            <tr class="bg-light font-weight-bold">
                                                                                <td class="text-muted">Blended Usage (70/30)</td>
                                                                                <td class="text-right">{{ item.historicalInsights.adjustments && item.historicalInsights.adjustments.blendedUsage ? item.historicalInsights.adjustments.blendedUsage.toFixed(2) : '0.00' }} per day</td>
                                                                            </tr>
                                                                            <tr v-if="item.historicalInsights.trend && item.historicalInsights.trend.direction !== 'stable'">
                                                                                <td class="text-muted">{{ item.historicalInsights.trend.direction === 'increasing' ? 'Trend Increase' : 'Trend Decrease' }}</td>
                                                                                <td class="text-right">{{ item.historicalInsights.adjustments && item.historicalInsights.adjustments.trendAdjustment ? (item.historicalInsights.adjustments.trendAdjustment * 100).toFixed(1) + '%' : '0.0%' }}</td>
                                                                            </tr>
                                                                            <tr class="bg-light font-weight-bold">
                                                                                <td class="text-muted">Final Usage Rate</td>
                                                                                <td class="text-right">{{ item.usagePerDay.toFixed(2) }} per day</td>
                                                                            </tr>
                                                                        </table>
                                                                    </div>
                                                                    
                                                                    <!-- Raw Historical Data Points -->
                                                                    <div class="border-top pt-2 mt-2" v-if="item.historicalInsights.rawData && item.historicalInsights.rawData.length > 0">
                                                                        <div class="d-flex justify-content-between align-items-center">
                                                                            <h6 class="small font-weight-bold mb-2">Raw Historical Usage Data ({{ item.historicalInsights.rawData.length }} records)</h6>
                                                                            <button class="btn btn-sm btn-outline-secondary py-0 px-2" 
                                                                                    @click="item._showAllData = !item._showAllData">
                                                                                {{ item._showAllData ? 'Show Summary' : 'Show All Data' }}
                                                                            </button>
                                                                        </div>
                                                                        
                                                                        <!-- Summary view (averages by week) -->
                                                                        <div v-if="!item._showAllData" class="small">
                                                                            <p class="text-muted mb-1">Showing weekly averages. Click "Show All Data" for detailed breakdown.</p>
                                                                            <table class="table table-sm table-bordered mb-0 small">
                                                                                <thead>
                                                                                    <tr class="bg-light">
                                                                                        <th>Week</th>
                                                                                        <th class="text-right">Avg Usage/Day</th>
                                                                                        <th class="text-right">Total Usage</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    <tr v-for="(week, index) in getWeeklySummary(item.historicalInsights.rawData)" :key="index">
                                                                                        <td>{{ formatDate(week.startDate) }}</td>
                                                                                        <td class="text-right">{{ week.avgDailyUsage.toFixed(2) }}</td>
                                                                                        <td class="text-right">{{ week.totalUsage.toFixed(2) }}</td>
                                                                                    </tr>
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                        
                                                                        <!-- Detailed view (all data points) -->
                                                                        <div v-else>
                                                                            <table class="table table-sm table-bordered mb-0 small">
                                                                                <thead>
                                                                                    <tr class="bg-light">
                                                                                        <th>Date</th>
                                                                                        <th class="text-right">Period Days</th>
                                                                                        <th class="text-right">Total Usage</th>
                                                                                        <th class="text-right">Usage/Day</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    <tr v-for="(record, index) in sortedHistoricalData(item.historicalInsights.rawData)" :key="index">
                                                                                        <td>{{ formatDate(record.date) }}</td>
                                                                                        <td class="text-right">{{ record.periodDays }}</td>
                                                                                        <td class="text-right">{{ record.usage.toFixed(2) }}</td>
                                                                                        <td class="text-right">{{ record.usagePerDay.toFixed(2) }}</td>
                                                                                    </tr>
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                
                                                                <dl class="row mb-0">
                                                                    <dt class="col-sm-6">Days to Next Delivery:</dt>
                                                                    <dd class="col-sm-6">{{ daysToNextDelivery }} days</dd>
                                                                    
                                                                    <dt class="col-sm-6">Covering Days:</dt>
                                                                    <dd class="col-sm-6">{{ coveringDays }} days</dd>
                                                                    
                                                                    <dt class="col-sm-6">Forecast Period:</dt>
                                                                    <dd class="col-sm-6">{{ daysToNextDelivery + coveringDays }} days</dd>
                                                                    
                                                                    <dt class="col-sm-6">Usage Rate:</dt>
                                                                    <dd class="col-sm-6">{{ item.usagePerDay ? item.usagePerDay.toFixed(2) : '0.00' }} units/day</dd>
                                                                    
                                                                    <dt class="col-sm-6">Safety Stock:</dt>
                                                                    <dd class="col-sm-6">{{ safetyStockPercentage }}%</dd>
                                                                    
                                                                    <dt class="col-sm-6">Critical Status:</dt>
                                                                    <dd class="col-sm-6">{{ item.isCritical ? 'Yes' : 'No' }}</dd>
                                                                </dl>
                                                            </div>
                                                            <div class="col-md-6">
                                                                <h6 class="border-bottom pb-2">Stock Status</h6>
                                                                <dl class="row mb-0">
                                                                    <dt class="col-sm-6">Current Stock:</dt>
                                                                    <dd class="col-sm-6">{{ item.closingBalance ? item.closingBalance.toFixed(2) : '0.00' }} units</dd>
                                                                    
                                                                    <dt class="col-sm-6">Reorder Point:</dt>
                                                                    <dd class="col-sm-6">{{ item.reorderPoint ? item.reorderPoint.toFixed(2) : '0.00' }} units</dd>
                                                                    
                                                                    <dt class="col-sm-6">Required Stock:</dt>
                                                                    <dd class="col-sm-6">{{ item.requiredStock ? item.requiredStock.toFixed(2) : '0.00' }} units</dd>
                                                                    
                                                                    <dt class="col-sm-6">Order Quantity:</dt>
                                                                    <dd class="col-sm-6">{{ item.orderQuantity ? item.orderQuantity.toFixed(2) : '0.00' }} units</dd>
                                                                    
                                                                    <dt class="col-sm-6">Unit Cost:</dt>
                                                                    <dd class="col-sm-6">{{ item.unitCost ? item.unitCost.toFixed(2) : '0.00' }} per unit</dd>
                                                                    
                                                                    <dt class="col-sm-6">Total Cost:</dt>
                                                                    <dd class="col-sm-6">{{ (item.orderQuantity * item.unitCost).toFixed(2) }}</dd>
                                                                </dl>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </template>
                                            <tr v-if="purchaseOrderItems.length === 0 && !isLoading">
                                                <td colspan="10" class="text-center p-4">
                                                    <div class="py-5">
                                                        <i class="fas fa-clipboard-list fa-3x text-muted mb-3"></i>
                                                        <h5>No items need reordering at this time</h5>
                                                        <p class="text-muted mb-0">Try adjusting your parameters or selecting a different supplier.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                        <tfoot v-if="purchaseOrderItems.length > 0">
                                            <tr class="font-weight-bold bg-light">
                                                <td colspan="8" class="text-right">Total Order Value:</td>
                                                <td class="text-right">{{ purchaseOrderTotal.toFixed(2) }}</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-footer bg-light p-3">
                        <div class="d-flex justify-content-between w-100">
                            <div>
                                <button type="button" class="btn btn-primary" @click="regeneratePurchaseOrder">
                                    <i class="fas fa-sync-alt mr-1"></i> Regenerate Order
                                </button>
                            </div>
                            <div>
                                <button type="button" class="btn btn-success me-2" @click="exportPurchaseOrder" :disabled="purchaseOrderItems.length === 0">
                                    <i class="fas fa-file-export mr-1"></i> Export to CSV
                                </button>
                                <button type="button" class="btn btn-secondary" @click="closeModal">
                                    <i class="fas fa-times mr-1"></i> Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
