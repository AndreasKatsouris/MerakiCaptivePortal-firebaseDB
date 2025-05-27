/**
 * Food Cost Module - Refactored App Component
 * Version: 1.9.3-2025-04-16
 */

// Import services
import { 
    parseCSVData, 
    processDataWithMapping, 
    detectAndMapHeaders, 
    extractCategoriesAndCostCenters, 
    filterStockData, 
    getItemCalculationDetails, 
    downloadCSV 
} from './services/data-service.js';

import { 
    processStockData,
    calculateDerivedValues,
    calculateReorderPoints, 
    calculateUsagePerDay,
    calculateTotals
} from './data-processor.js';

import { 
    initCharts, 
    updateCharts, 
    destroyCharts,
    resetChartInitialization
} from './chart-manager.js';

import { 
    saveStockDataToDatabase,
    loadHistoricalData,
    loadSpecificHistoricalData,
    deleteHistoricalData,
    getItemHistoricalData
} from './database-operations.js';

// Import Firebase service for store context
import { getRecentStoreContext } from './services/firebase-service.js';

// Import mixins
import { UIMixin } from './mixins/ui-mixin.js';
import { ShadcnUIMixin } from './mixins/shadcn-ui-mixin.js';

// Import modular components
import { PurchaseOrderModal } from './components/purchase-order/po-modal.js';
import { HeaderMappingModal } from './components/header-mapping-modal/header-mapping-modal.js';
import { HistoricalDataModal } from './components/historical-data-modal/historical-data-modal.js';
import { DeleteConfirmationModal } from './components/delete-confirmation-modal/delete-confirmation-modal.js';
import { ItemCalculationDetailsModal } from './components/item-calculation-details/item-calculation-details.js';
import { CategoryFilter } from './components/filters/CategoryFilter.js';
import { CostCenterFilter } from './components/filters/CostCenterFilter.js';
import { StockDataTable } from './components/tables/StockDataTable.js';
import { EditableStockDataTable } from './components/tables/EditableStockDataTable.js';
import { DataSummary } from './components/analytics/DataSummary.js';

// Import all database operations
import * as DatabaseOperations from './database-operations.js';

// Import Firebase auth
import { auth } from './firebase-helpers.js';

// Add styles for filter popups
const filterStyles = `
    .filter-popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 1050;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .filter-popup {
        background-color: white;
        border-radius: 8px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
        padding: 20px;
        width: 90%;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
    }
    
    .filter-popup h4 {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #eee;
    }
    
    .filter-popup .close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
    }
    
    .filter-items {
        margin-bottom: 15px;
    }
    
    .form-check {
        margin-bottom: 8px;
    }
`;

// Add style element
const styleEl = document.createElement('style');
styleEl.textContent = filterStyles;
document.head.appendChild(styleEl);

// Create the component object first as a regular variable
var FoodCostApp = {
    // Register mixins
    mixins: [UIMixin, ShadcnUIMixin],
    
    // Register components
    components: {
        'purchase-order-modal': PurchaseOrderModal,
        'header-mapping-modal': HeaderMappingModal,
        'historical-data-modal': HistoricalDataModal,
        'delete-confirmation-modal': DeleteConfirmationModal,
        'item-calculation-details-modal': ItemCalculationDetailsModal,
        'category-filter': CategoryFilter,
        'cost-center-filter': CostCenterFilter,
        'stock-data-table': StockDataTable,
        'editable-stock-data-table': EditableStockDataTable,
        'data-summary': DataSummary
    },
    
    data() {
        console.log('Initializing component data');
        return {
            // Initialize permission flag (will be set properly in mounted)
            // Application state
            isDataLoaded: false,
            isDataUploaded: false,
            isSaving: false,
            showPurchaseOrderModal: false,
            isProcessing: false,
            
            // Edit mode state
            isEditMode: false,
            hasEditPermission: false, // Controls visibility of edit button
            isEditingSaving: false,
            editChanges: {},
            lastEditMetadata: null,
            
            // Store context
            storeName: 'Default Store',
            openingStockDate: this.getYesterdayDate(),
            closingStockDate: this.getTodayDate(),
            stockPeriodDays: 1,
            daysToNextDelivery: 5,
            safetyStockPercentage: 20,
            criticalItemBuffer: 30,
            
            // Financial data
            salesAmount: 0,
            totalCostOfUsage: 0,
            costPercentage: 0,
            
            // Stock data
            stockData: [],
            filteredData: [],
            
            // CSV parsing
            parsedData: [],
            parsedHeaders: [],
            headerMapping: {},
            showHeaderMapping: false,
            
            // Filters
            categories: [],
            costCenters: [],
            availableCategories: ['All Categories'],
            availableCostCenters: ['All Cost Centers'],
            selectedCategories: [],
            selectedCostCenters: [],
            showCategoryPopup: false,
            showCostCenterPopup: false,
            searchTerm: '',
            lowStockFilter: false,
            
            // Purchase order
            selectedSupplier: 'All Suppliers',
            availableSuppliers: ['All Suppliers'],
            showPurchaseOrderModal: false,
            
            // Sorting
            sortField: 'itemCode',
            sortDirection: 'asc',
            
            // Historical data
            showHistoricalData: false,
            historicalData: [],
            isLoadingHistorical: false,
            currentHistoricalRecord: null,
            
            // Delete Historical Data
            showDeleteHistoricalDataModal: false,
            selectedRecordsForDeletion: [],
            selectAllRecordsForDeletion: false,
            isDeletingRecords: false,
        };
    },
    
    computed: {
        /**
         * Check if header mapping is complete
         */
        isHeaderMappingComplete() {
            return this.headerMapping.itemCode >= 0 &&
                this.headerMapping.itemName >= 0 &&
                this.headerMapping.openingQty >= 0 &&
                this.headerMapping.closingQty >= 0 &&
                this.headerMapping.openingValue >= 0 &&
                this.headerMapping.closingValue >= 0;
        },
        
        /**
         * Get filtered stock data
         * Note: We use a separate computed property to avoid conflict with the filteredData data property
         */
        filteredStockDataComputed() {
            if (!this.stockData || this.stockData.length === 0) {
                return [];
            }
            
            return this.filteredData;
        },
        
        /**
         * Get items below reorder point
         */
        lowStockItems() {
            if (!this.stockData) return [];
            return this.stockData.filter(item => item.belowReorderPoint);
        }
    },
    
    watch: {
        /**
         * Update stock period days when dates change
         */
        openingStockDate() {
            this.updateStockPeriodDays();
        },
        
        closingStockDate() {
            this.updateStockPeriodDays();
        },
        
        /**
         * Recalculate when stock period days changes
         */
        stockPeriodDays() {
            this.recalculateUsageAndReorderPoints();
        },
        
        /**
         * Recalculate when days to next delivery changes
         */
        daysToNextDelivery() {
            this.recalculateUsageAndReorderPoints();
        },
        
        /**
         * Apply filters when they change
         */
        categoryFilters() {
            this.applyFilters();
        },
        
        costCenterFilters() {
            this.applyFilters();
        },
        
        searchText() {
            this.applyFilters();
        },
        
        lowStockFilter() {
            this.applyFilters();
        }
    },
    
    mounted() {
        this.initialize();
        
        // Register a beforeunload handler to help with refresh issues
        window.addEventListener('beforeunload', () => {
            // Store critical values in sessionStorage to preserve across refreshes
            if (this.isDataLoaded) {
                sessionStorage.setItem('foodCostTotalCostOfUsage', this.totalCostOfUsage);
                sessionStorage.setItem('foodCostSalesAmount', this.salesAmount);
                sessionStorage.setItem('foodCostPercentage', this.costPercentage);
            }
        });
        
        // Load recent store context
        this.loadRecentStoreContext();
    },
    
    beforeDestroy() {
        // Clean up charts
        destroyCharts();
    },
    
    methods: {
        // ===== Historical Data Deletion =====
        
        /**
         * Show the delete historical data UI
         */
        showDeleteHistoricalDataUI() {
            // Reset selection state
            this.selectedRecordsForDeletion = [];
            this.selectAllRecordsForDeletion = false;
            
            // Load historical data if not already loaded
            this.loadHistoricalData();
            
            // Show the delete modal
            this.showDeleteHistoricalDataModal = true;
        },
        
        /**
         * Toggle selection of all records for deletion
         */
        toggleAllRecordsSelection() {
            if (this.selectAllRecordsForDeletion) {
                // Select all records
                this.selectedRecordsForDeletion = this.historicalData.map(record => record.key || record.id);
            } else {
                // Deselect all records
                this.selectedRecordsForDeletion = [];
            }
            this.applyFilters();
        },
        
        /**
         * Update record selection for deletion
         * @param {string} recordKey - Record key to toggle selection
         */
        updateRecordSelection(recordKey) {
            const index = this.selectedRecordsForDeletion.indexOf(recordKey);
            if (index === -1) {
                // Add to selected records
                this.selectedRecordsForDeletion.push(recordKey);
            } else {
                // Remove from selected records
                this.selectedRecordsForDeletion.splice(index, 1);
            }
            
            // Update selectAll checkbox state
            this.selectAllRecordsForDeletion = 
                this.selectedRecordsForDeletion.length === this.historicalData.length;
        },
        
        /**
         * Format a date string to a more readable format
         */
        formatDate(dateString) {
            if (!dateString) return 'N/A';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleDateString();
        },
        
        /**
         * Format a number as currency
         */
        formatCurrency(value) {
            if (value === null || value === undefined) return '$0.00';
            return '$' + parseFloat(value).toFixed(2);
        },
        
        // ===== Edit Mode Methods =====
        
        /**
         * Check if the current user has edit permission
         * This checks if the user is an admin or owner
         */
        async checkEditPermission() {
            console.log('Checking edit permission - DEBUG');
            
            // DEVELOPMENT OVERRIDE - Force permission to true for testing
            // IMPORTANT: REMOVE THIS BEFORE PRODUCTION
            this.hasEditPermission = true;
            console.log('DEVELOPMENT MODE: Edit permission forced to TRUE for testing');
            return true;
            
            // The code below is temporarily bypassed for testing
            /*
            // Get the current user from Firebase Auth using the imported auth
            const user = auth.currentUser;
            console.log('Current user:', user ? user.email : 'No user');
            
            if (!user) {
                console.log('No user logged in, edit permission denied');
                this.hasEditPermission = false;
                return false;
            }
            
            try {
                // Check if the user has admin claims
                // This should be set by your existing admin authentication system
                const idTokenResult = await user.getIdTokenResult();
                
                // Check if the user has admin or owner claims
                const isAdmin = idTokenResult.claims.admin === true;
                const isOwner = idTokenResult.claims.owner === true;
                
                console.log('User claims:', JSON.stringify(idTokenResult.claims));
                console.log('Is admin:', isAdmin, 'Is owner:', isOwner);
                
                // Set the permission flag - this will trigger reactivity
                this.hasEditPermission = isAdmin || isOwner;
                console.log('Has edit permission set to:', this.hasEditPermission);
                    
                return this.hasEditPermission;
            } catch (error) {
                console.error('Error checking admin permissions:', error);
                this.hasEditPermission = false;
                return false;
            }
            */
        },
        
        /**
         * Toggle edit mode on and off
         */
        async toggleEditMode() {
            // If we're already in edit mode, exit it
            if (this.isEditMode) {
                this.cancelEditMode();
                return;
            }
            
            // Check permissions before enabling edit mode
            const hasPermission = await this.checkEditPermission();
            
            if (!hasPermission) {
                this.showToast('error', 'Permission Denied', 'You do not have permission to edit stock data.');
                return;
            }
            
            // Check if we have a current record loaded
            if (!this.currentHistoricalRecord) {
                this.showToast('error', 'No Record Selected', 'Please load a record before entering edit mode.');
                return;
            }
            
            // Enable edit mode
            this.isEditMode = true;
            
            // Set up event listener for beforeunload to warn about unsaved changes
            window.addEventListener('beforeunload', this.warnUnsavedChanges);
            
            this.showToast('info', 'Edit Mode Activated', 'You can now edit stock data. Remember to save your changes.');
        },
        
        /**
         * Get current user data for edit tracking
         */
        getUserData() {
            // Use the imported auth object instead of global firebase
            const user = auth.currentUser;
            
            if (!user) {
                return { uid: 'unknown', displayName: 'Unknown User', email: 'unknown' };
            }
            
            return {
                uid: user.uid,
                displayName: user.displayName || user.email,
                email: user.email
            };
        },
        
        /**
         * Handle changes to stock items during edit
         */
        handleItemChange(changeData) {
            this.editChanges = changeData.changedItems;
            console.log(`Item ${changeData.itemCode} field ${changeData.field} changed to ${changeData.value}`);
        },
        
        /**
         * Save edited stock data back to the database
         */
        async saveEditedStockData(data) {
            // Check if there are any changes to save
            if (!data.changedItems || Object.keys(data.changedItems).length === 0) {
                this.showToast('info', 'No Changes', 'No changes were made to the stock data.');
                return;
            }
            
            // Check permissions again just to be safe
            if (!this.hasEditPermission) {
                this.showToast('error', 'Permission Denied', 'You do not have permission to save changes.');
                return;
            }
            
            // Show confirmation dialog
            const confirmResult = await Swal.fire({
                title: 'Save Changes?',
                html: `You are about to save changes to <strong>${Object.keys(data.changedItems).length}</strong> items. This cannot be undone.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Save Changes',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#3085d6'
            });
            
            if (!confirmResult.isConfirmed) {
                return;
            }
            
            // Show loading state
            this.isEditingSaving = true;
            
            try {
                // Update the stockData with the edited values
                // This ensures that we save a complete record
                const updatedStockData = [...this.stockData];
                
                // Update the items that were changed
                Object.keys(data.changedItems).forEach(itemCode => {
                    const index = updatedStockData.findIndex(item => item.itemCode === itemCode);
                    if (index !== -1) {
                        // Merge the original item with the changes
                        updatedStockData[index] = {
                            ...updatedStockData[index],
                            ...data.changedItems[itemCode].changes
                        };
                    }
                });
                
                // Prepare the data for saving
                const saveData = {
                    ...this.currentData,
                    stockItems: updatedStockData,
                    // Recalculate totals based on the updated data
                    totalOpeningValue: this.calculateTotalOpeningValue(updatedStockData),
                    totalPurchases: this.calculateTotalPurchases(updatedStockData),
                    totalClosingValue: this.calculateTotalClosingValue(updatedStockData),
                    totalUsage: this.calculateTotalUsage(updatedStockData),
                    totalCostOfUsage: this.calculateTotalCostOfUsage(updatedStockData)
                };
                
                // Get the user data for tracking edits
                const userData = this.getUserData();
                
                // Update the record in Firebase
                const result = await DatabaseOperations.updateStockUsage(this.currentHistoricalRecord, saveData, userData);
                
                if (result.success) {
                    // Update the last edit metadata
                    this.lastEditMetadata = result.editMetadata;
                    
                    // Update the local data
                    this.stockData = updatedStockData;
                    this.filteredData = this.filterData();
                    
                    // Reset edit changes
                    this.editChanges = {};
                    
                    // Show success message
                    this.showToast('success', 'Changes Saved', 'Stock data has been updated successfully.');
                    
                    // Exit edit mode
                    this.isEditMode = false;
                    
                    // Remove the beforeunload listener
                    window.removeEventListener('beforeunload', this.warnUnsavedChanges);
                }
            } catch (error) {
                console.error('Error updating stock data:', error);
                this.showToast('error', 'Save Failed', `Failed to save changes: ${error.message}`);
            } finally {
                this.isEditingSaving = false;
            }
        },
        
        /**
         * Cancel edit mode and discard changes
         */
        cancelEditMode() {
            // Show confirmation if there are unsaved changes
            if (this.editChanges && Object.keys(this.editChanges).length > 0) {
                Swal.fire({
                    title: 'Discard Changes?',
                    text: 'You have unsaved changes that will be lost.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Discard Changes',
                    cancelButtonText: 'Continue Editing',
                    confirmButtonColor: '#d33'
                }).then((result) => {
                    if (result.isConfirmed) {
                        this.discardChanges();
                    }
                });
            } else {
                this.discardChanges();
            }
        },
        
        /**
         * Discard all changes and exit edit mode
         */
        discardChanges() {
            // Exit edit mode
            this.isEditMode = false;
            
            // Reset changes
            this.editChanges = {};
            
            // Remove the beforeunload listener
            window.removeEventListener('beforeunload', this.warnUnsavedChanges);
            
            this.showToast('info', 'Edit Mode Exited', 'Changes have been discarded.');
        },
        
        /**
         * Warn user about unsaved changes when leaving the page
         */
        warnUnsavedChanges(event) {
            if (this.isEditMode && this.editChanges && Object.keys(this.editChanges).length > 0) {
                const message = 'You have unsaved changes that will be lost if you leave this page.';
                event.returnValue = message;
                return message;
            }
        },
        
        /**
         * Handle validation errors during editing
         */
        handleValidationError(errors) {
            this.showToast('error', 'Validation Errors', 'Please fix the validation errors before saving.');
            console.error('Validation errors:', errors);
        },
        
        /**
         * Helper functions to calculate totals from stock items
         */
        calculateTotalOpeningValue(items) {
            return items.reduce((sum, item) => sum + (item.openingQty * item.unitCost), 0);
        },
        
        calculateTotalPurchases(items) {
            return items.reduce((sum, item) => sum + (item.purchaseQty * item.unitCost), 0);
        },
        
        calculateTotalClosingValue(items) {
            return items.reduce((sum, item) => sum + (item.closingQty * item.unitCost), 0);
        },
        
        calculateTotalUsage(items) {
            return items.reduce((sum, item) => sum + item.usage, 0);
        },
        
        calculateTotalCostOfUsage(items) {
            return items.reduce((sum, item) => sum + (item.usage * item.unitCost), 0);
        },
        
        // ===== Utility Methods =====

        /**
         * Format number with 2 decimal places
         * @param {number} num - Number to format
         * @returns {string} - Formatted number
         */
        formatNumber(num) {
            return (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2);
        },
        
        /**
         * Format a value for display
         * @param {number|string} value - Value to format
         * @returns {string} - Formatted value
         */
        formatValue(value) {
            // Parse the value into a number (handles strings)  
            const num = parseFloat(value);
            
            // Check if it's a valid number
            if (isNaN(num)) return '0.00';
            
            // Format to 2 decimal places
            return this.formatNumber(num);
        },
        
        /**
         * Open the category filter popup
         */
        openCategoryFilter() {
            // Make sure we have our categories in the available list
            this.updateAvailableFilters();
            console.log('Available categories:', this.availableCategories);
            this.showCategoryPopup = true;
        },
        
        /**
         * Close the category filter popup
         */
        closeCategoryFilter() {
            this.showCategoryPopup = false;
            this.applyFilters();
        },
        
        /**
         * Select all categories
         */
        selectAllCategories() {
            this.selectedCategories = [...this.availableCategories.filter(c => c !== 'All Categories')];
        },
        
        /**
         * Open the cost center filter popup
         */
        openCostCenterFilter() {
            // Make sure we have our cost centers in the available list
            this.updateAvailableFilters();
            console.log('Available cost centers:', this.availableCostCenters);
            this.showCostCenterPopup = true;
        },
        
        /**
         * Close the cost center filter popup
         */
        closeCostCenterFilter() {
            this.showCostCenterPopup = false;
            this.applyFilters();
        },
        
        /**
         * Select all cost centers
         */
        selectAllCostCenters() {
            this.selectedCostCenters = [...this.availableCostCenters.filter(c => c !== 'All Cost Centers')];
        },
        
        /**
         * Delete all selected historical records
         */
        async deleteSelectedHistoricalRecords() {
            if (this.selectedRecordsForDeletion.length === 0) {
                this.showToast('warning', 'No Records Selected', 'Please select at least one record to delete');
                return;
            }
            
            // Confirm deletion with the user
            if (!confirm(`Are you sure you want to delete ${this.selectedRecordsForDeletion.length} selected record(s)? This action cannot be undone.`)) {
                return;
            }
            
            this.isDeletingRecords = true;
            
            try {
                // Delete each selected record
                for (const recordId of this.selectedRecordsForDeletion) {
                    // Use the imported deleteHistoricalData function from database-operations.js
                    await deleteHistoricalData(recordId);
                    console.log(`Deleted historical record ${recordId}`);
                }
                
                // Show success message
                const count = this.selectedRecordsForDeletion.length;
                this.showToast('success', 'Records Deleted', `Successfully deleted ${count} historical record(s)`);
                
                // Reset selection and refresh data
                this.selectedRecordsForDeletion = [];
                this.selectAllRecordsForDeletion = false;
                
                // Reload historical data
                this.loadHistoricalData();
            } catch (error) {
                console.error('Error deleting historical records:', error);
                this.showToast('error', 'Deletion Failed', 'An error occurred while deleting records. Please try again.');
            } finally {
                this.isDeletingRecords = false;
            }
        },
        
        // ===== Date and Time Utilities =====
        
        /**
         * Get yesterday's date in ISO format
         */
        getYesterdayDate() {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return yesterday.toISOString().split('T')[0];
        },
        
        /**
         * Get today's date in ISO format
         */
        getTodayDate() {
            return new Date().toISOString().split('T')[0];
        },
        
        /**
         * Update stock period days based on date range
         */
        updateStockPeriodDays() {
            if (!this.openingStockDate || !this.closingStockDate) return;
            
            const openingDate = new Date(this.openingStockDate);
            const closingDate = new Date(this.closingStockDate);
            
            // Calculate days difference
            const timeDiff = closingDate - openingDate;
            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
            
            this.stockPeriodDays = Math.max(1, daysDiff);
        },
        
        /**
         * Update sales amount and recalculate food cost percentage
         * @param {Number} amount - The new sales amount
         */
        updateSalesAmount(amount) {
            // Ensure we're working with a valid number
            const numAmount = parseFloat(amount);
            this.salesAmount = isNaN(numAmount) ? 0 : numAmount;
            
            // Force immediate recalculation of cost percentage
            this.recalculateFoodCostPercentage();
            
            // Log the update to help with debugging
            console.log(`Sales amount updated to: ${this.salesAmount}`);
            console.log(`Current total cost of usage: ${this.totalCostOfUsage}`);
            console.log(`Current cost percentage: ${this.costPercentage}%`);
        },
        
        /**
         * Recalculate food cost percentage based on sales amount and total cost
         */
        recalculateFoodCostPercentage() {
            if (this.salesAmount > 0 && this.totalCostOfUsage > 0) {
                this.costPercentage = (this.totalCostOfUsage / this.salesAmount) * 100;
            } else {
                this.costPercentage = 0;
            }
        },
        
        // ===== Data Management =====
        
        /**
         * Load recent store context from Firebase
         */
        async loadRecentStoreContext() {
            try {
                const context = await getRecentStoreContext();
                
                // Check if context exists before accessing properties
                if (context) {
                    this.storeName = context.storeName || this.storeName;
                    this.daysToNextDelivery = context.daysToNextDelivery || this.daysToNextDelivery;
                    this.safetyStockPercentage = context.safetyStockPercentage || this.safetyStockPercentage;
                    this.criticalItemBuffer = context.criticalItemBuffer || this.criticalItemBuffer;
                    
                    console.log('Loaded recent store context:', context);
                } else {
                    console.log('No recent store context found, using defaults');
                }
            } catch (error) {
                console.error('Error loading store context:', error);
                // Silently continue with default values
            }
        },
        
        /**
         * Parse a CSV file
         */
        parseCSVFile(file) {
            if (!file) return;
            
            // Reset previous data if any
            if (this.isDataUploaded) {
                this.resetForm();
            }
            
            // Show user feedback during CSV processing
            this.isProcessing = true;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const csvContent = e.target.result;
                    
                    // Parse CSV data
                    const { headers, data } = parseCSVData(csvContent);
                    
                    if (!headers || headers.length === 0) {
                        this.showNotification('Error', 'Could not parse CSV headers. Please check the file format.', 'error');
                        this.isProcessing = false;
                        return;
                    }
                    
                    console.log('CSV parsed successfully:', { headers, dataRows: data.rows?.length || 0 });
                    
                    this.parsedHeaders = headers;
                    this.parsedData = data;
                    this.isDataLoaded = true;
                    
                    // Auto-detect headers if possible
                    if (this.parsedHeaders.length > 0) {
                        // Detect and map headers
                        this.headerMapping = detectAndMapHeaders(this.parsedHeaders);
                        console.log('Auto-detected header mapping:', this.headerMapping);
                        
                        // Ensure we have the minimum required fields
                        if (this.headerMapping.description === undefined && this.headerMapping.itemName !== undefined) {
                            // If itemName exists but description doesn't, copy it (for backwards compatibility)
                            this.headerMapping.description = this.headerMapping.itemName;
                        } else if (this.headerMapping.itemName === undefined && this.headerMapping.description !== undefined) {
                            // If description exists but itemName doesn't, copy it (for modal compatibility)
                            this.headerMapping.itemName = this.headerMapping.description;
                        }
                        
                        // Always show the mapping modal for user confirmation
                        this.showHeaderMapping = true;
                        console.log('Showing header mapping modal with mapping:', this.headerMapping);
                        
                        // Force UI update to ensure modal displays
                        this.$nextTick(() => {
                            // Allow for two render cycles to ensure the modal is fully rendered
                            setTimeout(() => {
                                const modalElements = document.querySelectorAll('.modal-overlay');
                                console.log(`Found ${modalElements.length} modal-overlay elements in the DOM`);
                                
                                // Find the specific header mapping modal
                                const headerMappingModal = Array.from(modalElements).find(el => {
                                    return el.innerHTML.includes('CSV Header Mapping');
                                });
                                
                                if (headerMappingModal) {
                                    headerMappingModal.style.display = 'flex';
                                    console.log('Header mapping modal is now visible');
                                } else {
                                    console.error('Header mapping modal not found in DOM');
                                }
                            }, 100); // Small delay to ensure DOM is updated
                        });
                    } else {
                        this.showNotification('Error', 'Could not parse CSV file. Please check the format.', 'error');
                    }
                } catch (error) {
                    console.error('Error processing CSV file:', error);
                    this.showNotification('Error', 'Failed to process CSV file: ' + error.message, 'error');
                } finally {
                    this.isProcessing = false;
                }
            };
            
            reader.onerror = (error) => {
                console.error('Error reading CSV file:', error);
                this.showNotification('Error', 'Failed to read CSV file', 'error');
                this.isProcessing = false;
            };
            
            reader.readAsText(file);
        },
        
        /**
         * Process CSV data with header mapping
         */
        processHeaderMapping() {
            // Reset chart initialization before processing new data
            resetChartInitialization();
            
            // Store the mapping before processing for comparison later
            const mappingBeforeProcessing = JSON.parse(JSON.stringify(this.headerMapping));
            
            // Log the mapping before processing
            console.log('BEFORE PROCESSING - Current header mapping:', JSON.stringify(this.headerMapping));
            console.log('BEFORE PROCESSING - Headers available:', this.parsedHeaders);
            
            // CRITICAL DEBUG: Log specific mapping values to trace the issue
            console.log(`🔍 ITEM CODE MAPPING: Column ${this.headerMapping.itemCode} ("${this.parsedHeaders[this.headerMapping.itemCode] || 'N/A'}")`);
            console.log(`🔍 DESCRIPTION MAPPING: Column ${this.headerMapping.description} ("${this.parsedHeaders[this.headerMapping.description] || 'N/A'}")`);
            
            // Create a deep clone of the mapping to protect against reference manipulation
            // This is CRITICAL to prevent modification of the original mapping during processing
            const safeMapping = JSON.parse(JSON.stringify(this.headerMapping));
            console.log('🔒 Using SAFE COPY of mapping for processing:', JSON.stringify(safeMapping));
            
            // Process the parsed data with the header mapping
            this.stockData = processDataWithMapping(
                this.parsedData, 
                safeMapping, 
                {
                    stockPeriodDays: this.stockPeriodDays,
                    daysToNextDelivery: this.daysToNextDelivery
                }
            );
            
            // Check if mapping was modified during processing
            const mappingAfterProcessing = JSON.stringify(this.headerMapping);
            if (JSON.stringify(mappingBeforeProcessing) !== mappingAfterProcessing) {
                console.warn('⚠️ MAPPING CHANGED during processing!');
                console.log('ORIGINAL:', JSON.stringify(mappingBeforeProcessing));
                console.log('MODIFIED:', mappingAfterProcessing);
            }
            
            if (this.stockData.length > 0) {
                // Extract available categories and cost centers
                const { categories, costCenters } = extractCategoriesAndCostCenters(this.stockData);
                this.categories = ['All Categories', ...categories];
                this.costCenters = ['All Cost Centers', ...costCenters];
                
                // Update available suppliers
                this.updateAvailableSuppliers();
                
                // Apply filters
                this.applyFilters();
                
                // Calculate totals
                this.calculateTotals();
                
                // Update UI
                this.updateUI();
                
                // Hide header mapping
                this.showHeaderMapping = false;
                
                // Set data uploaded flag
                this.isDataUploaded = true;
            }
        },
        
        /**
         * Filter data based on selected categories, cost centers, and search term
         */
        filterData() {
            if (!this.stockData || this.stockData.length === 0) {
                this.filteredData = [];
                console.warn('No stock data to filter');
                this.calculateTotals(); // Ensure totals are calculated even with empty data
                return;
            }
            
            console.log('Applying filters:', {
                selectedCategories: this.selectedCategories,
                selectedCostCenters: this.selectedCostCenters,
                searchTerm: this.searchTerm,
                lowStockFilter: this.lowStockFilter
            });
            
            // Print out first few stock items to debug filter issues
            if (this.stockData.length > 0) {
                console.log('First 2 stock items before filtering:');
                for (let i = 0; i < Math.min(2, this.stockData.length); i++) {
                    const item = this.stockData[i];
                    console.log(`Item ${i}:`, {
                        itemCode: item.itemCode,
                        category: item.category,
                        CATEGORY: item.CATEGORY,
                        costCenter: item.costCenter,
                        cost_center: item.cost_center,
                        COST_CENTER: item.COST_CENTER
                    });
                }
            }
            
            // Apply category, cost center, and search filters
            this.filteredData = this.stockData.filter(item => {
                // Category filter - check all possible property locations
                let itemCategory = '';
                if (item.category) itemCategory = item.category;
                else if (item.CATEGORY) itemCategory = item.CATEGORY;
                else if (item.__raw_category) itemCategory = item.__raw_category;
                
                const passesCategory = this.selectedCategories.length === 0 || 
                    this.selectedCategories.includes(itemCategory);
                
                // Cost center filter - check all possible property locations
                let itemCostCenter = '';
                if (item.costCenter) itemCostCenter = item.costCenter;
                else if (item.cost_center) itemCostCenter = item.cost_center;
                else if (item.COST_CENTER) itemCostCenter = item.COST_CENTER;
                else if (item.__raw_costCenter) itemCostCenter = item.__raw_costCenter;
                
                const passesCostCenter = this.selectedCostCenters.length === 0 || 
                    this.selectedCostCenters.includes(itemCostCenter);
                
                // Search filter - more robust search handling
                const searchLower = this.searchTerm ? this.searchTerm.toLowerCase() : '';
                const passesSearch = !this.searchTerm || 
                    (item.itemCode && item.itemCode.toLowerCase().includes(searchLower)) ||
                    (item.__raw_itemCode && item.__raw_itemCode.toLowerCase().includes(searchLower)) ||
                    (item.description && item.description.toLowerCase().includes(searchLower)) ||
                    (item.__raw_description && item.__raw_description.toLowerCase().includes(searchLower)) ||
                    (itemCategory && itemCategory.toLowerCase().includes(searchLower)) ||
                    (itemCostCenter && itemCostCenter.toLowerCase().includes(searchLower));
                
                // Low stock filter
                const passesLowStock = !this.lowStockFilter || 
                    (item.belowReorderPoint === true);
                
                return passesCategory && passesCostCenter && passesSearch && passesLowStock;
            });
            
            // Debug output of filtered results
            console.log(`Filtered ${this.stockData.length} items to ${this.filteredData.length} items`);
            
            // Update UI after applying filters
            this.calculateTotals();
            this.updateUI();
        },
        
        /**
         * Calculate totals from filtered data
         * This function is crucial for financial calculations
         */
        calculateTotals() {
            // Calculate total cost of usage from filtered data
            const newTotalCost = this.filteredData.reduce(
                (total, item) => {
                    // Ensure costOfUsage is calculated if not present
                    let costOfUsage;
                    if (item.costOfUsage !== undefined && item.costOfUsage !== null) {
                        costOfUsage = parseFloat(item.costOfUsage);
                    } else {
                        // Calculate based on usage and unit cost
                        const usage = parseFloat(item.usage) || 0;
                        const unitCost = parseFloat(item.unitCost) || 0;
                        costOfUsage = usage * unitCost;
                        // Update the item for future calculations
                        item.costOfUsage = costOfUsage;
                    }
                    
                    return isNaN(costOfUsage) ? total : total + costOfUsage;
                }, 
                0
            );
            
            // Set the total cost with proper validation
            this.totalCostOfUsage = isNaN(newTotalCost) ? 0 : newTotalCost;
            
            console.log(`Calculated totalCostOfUsage: ${this.totalCostOfUsage} from ${this.filteredData.length} items`);
            
            // Calculate cost percentage
            this.recalculateFoodCostPercentage();
        },
        
        /**
         * Recalculate food cost percentage
         * This is called directly when sales amount changes and indirectly via calculateTotals
         */
        recalculateFoodCostPercentage() {
            // Ensure we're using valid numbers
            const salesAmount = parseFloat(this.salesAmount) || 0;
            const totalCostOfUsage = parseFloat(this.totalCostOfUsage) || 0;
            
            // Calculate percentage with safeguards against division by zero
            if (salesAmount > 0) {
                const newPercentage = (totalCostOfUsage / salesAmount) * 100;
                // Protect against invalid results
                this.costPercentage = isNaN(newPercentage) ? 0 : newPercentage;
            } else {
                this.costPercentage = 0;
            }
            
            // Log for debugging
            console.log(`Recalculated costPercentage: ${this.costPercentage.toFixed(2)}% (totalCost: ${totalCostOfUsage.toFixed(2)}, salesAmount: ${salesAmount.toFixed(2)})`);
            
            // Store this in sessionStorage for resilience against refreshes
            sessionStorage.setItem('foodCostTotalCostOfUsage', totalCostOfUsage);
            sessionStorage.setItem('foodCostSalesAmount', salesAmount);
            sessionStorage.setItem('foodCostPercentage', this.costPercentage);
        },
        
        /**
         * Recalculate usage and reorder points
         */
        recalculateUsageAndReorderPoints() {
            if (!this.stockData || this.stockData.length === 0) {
                return;
            }
            
            // Update stock data with new values
            this.stockData = calculateDerivedValues(
                this.stockData, 
                this.stockPeriodDays, 
                this.daysToNextDelivery
            );
            
            // Extract categories and cost centers for filters
            this.updateAvailableFilters();
            

            // Apply filters and update UI
            this.filterData();
        },
        
        /**
         * Update available suppliers list
         */
        updateAvailableSuppliers() {
            if (!this.stockData || this.stockData.length === 0) {
                this.availableSuppliers = ['All Suppliers'];
                return;
            }
            
            // Extract unique supplier names
            const suppliers = new Set();
            this.stockData.forEach(item => {
                if (item.supplierName && item.supplierName.trim()) {
                    suppliers.add(item.supplierName.trim());
                }
            });
            
            // Update the available suppliers list
            this.availableSuppliers = ['All Suppliers', ...Array.from(suppliers).sort()];
            
            console.log('Updated available suppliers:', this.availableSuppliers);
        },
        
        /**
         * Update available filters from stock data
         */
        updateAvailableFilters() {
            if (!this.stockData || this.stockData.length === 0) {
                return;
            }
            
            // Debug log to see what's in the stock data
            console.log('Stock data for filter extraction:', this.stockData.slice(0, 3));
            
            // Extract unique categories and cost centers
            const allCategories = [];
            const allCostCenters = [];
            
            // ENHANCED: Robust property detection for filters
            this.stockData.forEach((item, index) => {
                if (index < 3) { // Only log first few items to avoid console spam
                    console.log(`Item ${index} properties for filters:`, {
                        rawItemCode: item.__raw_itemCode,
                        rawDescription: item.__raw_description, 
                        rawCategory: item.__raw_category,
                        rawCostCenter: item.__raw_costCenter,
                        category: item.category,
                        CATEGORY: item.CATEGORY,
                        costCenter: item.costCenter,
                        cost_center: item.cost_center,
                        COST_CENTER: item.COST_CENTER
                    });
                }
                
                // Extract category - try all possible naming variations
                // Use the raw values directly for better accuracy
                let categoryValue = '';
                let costCenterValue = '';
                
                // For category: try all possible sources with preference order
                if (item.__raw_category) {
                    categoryValue = item.__raw_category.trim();
                } else if (item.CATEGORY) {
                    categoryValue = item.CATEGORY.trim(); 
                } else if (item.category) {
                    categoryValue = item.category.trim();
                }
                
                // For cost center: try all possible sources with preference order
                if (item.__raw_costCenter) {
                    costCenterValue = item.__raw_costCenter.trim();
                } else if (item.COST_CENTER) {
                    costCenterValue = item.COST_CENTER.trim();
                } else if (item.costCenter) {
                    costCenterValue = item.costCenter.trim();
                } else if (item.cost_center) {
                    costCenterValue = item.cost_center.trim();
                }
                
                // Add values to filter lists if they're not empty
                if (categoryValue) {
                    allCategories.push(categoryValue);
                    // Also update the item's category for consistent filtering
                    item.category = categoryValue;
                    item.CATEGORY = categoryValue;
                }
                
                if (costCenterValue) {
                    allCostCenters.push(costCenterValue);
                    // Also update the item's cost center for consistent filtering
                    item.costCenter = costCenterValue;
                    item.cost_center = costCenterValue;
                    item.COST_CENTER = costCenterValue;
                }
            });
            
            // Provide fallbacks if nothing is found
            if (allCategories.length === 0) {
                allCategories.push('Uncategorized');
            }
            
            if (allCostCenters.length === 0) {
                allCostCenters.push('Main');
            }
            
            // Get unique categories and sort them
            const uniqueCategories = [...new Set(allCategories)].sort();
            this.availableCategories = ['All Categories', ...uniqueCategories];
            
            // Get unique cost centers and sort them
            const uniqueCostCenters = [...new Set(allCostCenters)].sort();
            this.availableCostCenters = ['All Cost Centers', ...uniqueCostCenters];
            
            // Log the results
            console.log('Filter data updated:', {
                categories: {
                    all: allCategories.length,
                    unique: uniqueCategories.length,
                    values: this.availableCategories
                },
                costCenters: {
                    all: allCostCenters.length,
                    unique: uniqueCostCenters.length,
                    values: this.availableCostCenters
                }
            });
        },
        
        /**
         * Open category filter popup
         */
        openCategoryFilter() {
            this.showCategoryPopup = true;
        },
        
        /**
         * Close category filter popup
         */
        closeCategoryFilter() {
            this.showCategoryPopup = false;
            this.applyFilters();
        },
        
        /**
         * Open cost center filter popup
         */
        openCostCenterFilter() {
            this.showCostCenterPopup = true;
        },
        
        /**
         * Close cost center filter popup
         */
        closeCostCenterFilter() {
            this.showCostCenterPopup = false;
            this.applyFilters();
        },
        
        /**
         * Select all categories
         */
        selectAllCategories() {
            this.selectedCategories = this.availableCategories
                .filter(cat => cat !== 'All Categories');
            this.applyFilters();
        },
        
        /**
         * Clear all category filters
         */
        clearCategoryFilters() {
            this.selectedCategories = [];
            this.applyFilters();
        },
        
        /**
         * Toggle the selection of a specific category
         * @param {string} category - The category to toggle
         */
        toggleCategorySelection(category) {
            const index = this.selectedCategories.indexOf(category);
            if (index === -1) {
                this.selectedCategories.push(category);
            } else {
                this.selectedCategories.splice(index, 1);
            }
            this.applyFilters();
        },
        
        /**
         * Select all cost centers
         */
        selectAllCostCenters() {
            this.selectedCostCenters = this.availableCostCenters
                .filter(center => center !== 'All Cost Centers');
            this.applyFilters();
        },
        
        /**
         * Clear all cost center filters
         */
        clearCostCenterFilters() {
            this.selectedCostCenters = [];
            this.applyFilters();
        },
        
        /**
         * Toggle the selection of a specific cost center
         * @param {string} costCenter - The cost center to toggle
         */
        toggleCostCenterSelection(costCenter) {
            const index = this.selectedCostCenters.indexOf(costCenter);
            if (index === -1) {
                this.selectedCostCenters.push(costCenter);
            } else {
                this.selectedCostCenters.splice(index, 1);
            }
            this.applyFilters();
        },
        
        /**
         * Apply filters to stock data
         */
        applyFilters() {
            if (!this.stockData || this.stockData.length === 0) {
                this.filteredData = [];
                return;
            }
            
            // Start with all stock data
            let filtered = [...this.stockData];
            
            // Apply category filter
            if (this.selectedCategories.length > 0) {
                filtered = filtered.filter(item => 
                    this.selectedCategories.includes(item.category));
            }
            
            // Apply cost center filter
            if (this.selectedCostCenters.length > 0) {
                filtered = filtered.filter(item => 
                    this.selectedCostCenters.includes(item.costCenter));
            }
            
            // Apply search filter
            if (this.searchTerm && this.searchTerm.trim() !== '') {
                const search = this.searchTerm.toLowerCase().trim();
                filtered = filtered.filter(item => 
                    (item.itemCode && item.itemCode.toLowerCase().includes(search)) ||
                    (item.description && item.description.toLowerCase().includes(search)) ||
                    (item.category && item.category.toLowerCase().includes(search)) ||
                    (item.costCenter && item.costCenter.toLowerCase().includes(search)));
            }
            
            // Update filtered data
            this.filteredData = filtered;
            
            // Update charts
            updateCharts(this.filteredData, this.categories);
        },
        
        /**
         * Update UI elements (charts, etc.)
         */
        updateUI() {
            // Update charts
            updateCharts(this.filteredData, this.categories);
        },
        
        // ===== Purchase Order =====
        
        /**
         * Show purchase order modal
         */
        showPurchaseOrder() {
            // Update the list of available suppliers from stock data
            this.updateAvailableSuppliers();
            
            // Show the purchase order modal
            this.showPurchaseOrderModal = true;
            
            console.log('Purchase order modal opened, with', this.availableSuppliers.length, 'suppliers');
        },
        
        /**
         * Close purchase order modal
         */
        closePurchaseOrder() {
            this.showPurchaseOrderModal = false;
        },
        
        /**
         * Close header mapping modal and reset form state
         */
        closeHeaderMappingModal() {
            // Close the modal
            this.showHeaderMapping = false;
            
            // Reset file input to allow new file selection
            const fileInput = document.getElementById('csvFileInput');
            if (fileInput) {
                fileInput.value = '';
            }
            
            // Reset data states to enable new file uploads
            this.parsedHeaders = [];
            this.parsedData = { rows: [] };
            this.isDataLoaded = false;
            this.isProcessing = false;
            
            console.log('Header mapping modal closed, form reset for new uploads');
        },
        
        /**
         * Update header mapping from modal input
         * @param {Object} newMapping - The new mapping from the modal
         * @param {Object} event - Optional event object that might contain mapping data
         */
        updateHeaderMapping(newMapping, event) {
            console.log('🔍 RECEIVED UPDATE:', { newMapping, event });
            
            // Critical: Handle the case where we're receiving a DOM event instead of mapping data
            let actualMapping = newMapping;
            
            // If it's a DOM event (which has preventDefault method), look for mapping in specific properties
            if (newMapping && typeof newMapping.preventDefault === 'function') {
                console.warn('⚠️ Detected DOM event being passed instead of mapping data');
                
                // Try to extract mapping from event detail or custom property
                if (event && event.detail && typeof event.detail === 'object') {
                    console.log('🔍 Found mapping in event.detail');
                    actualMapping = event.detail;
                } else if (newMapping.detail && typeof newMapping.detail === 'object') {
                    console.log('🔍 Found mapping in event detail');
                    actualMapping = newMapping.detail;
                } else if (event && event.data && typeof event.data === 'object') {
                    console.log('🔍 Found mapping in event.data');
                    actualMapping = event.data;
                } else {
                    // Check for alternative properties based on how modal emit
                    for (const prop of ['_mapping', 'data', 'value', 'mapping']) {
                        if (newMapping[prop] && typeof newMapping[prop] === 'object') {
                            console.log(`🔍 Found mapping in event.${prop}`);
                            actualMapping = newMapping[prop];
                            break;
                        }
                    }
                }
            }
            
            // Skip if still not valid mapping object
            if (!actualMapping || typeof actualMapping !== 'object' || actualMapping instanceof Event) {
                console.warn('⚠️ Could not extract valid mapping data, skipping update');
                return;
            }
            
            // Log mapping changes for debugging
            console.log('⚡ UPDATING MAPPING:', actualMapping);
            
            if (actualMapping._timestamp) {
                console.log(`⚡ Manual mapping update detected (timestamp: ${actualMapping._timestamp})`);
            }
            
            // Check for specific changes in itemCode mapping
            if (this.headerMapping.itemCode !== actualMapping.itemCode) {
                const oldHeader = this.parsedHeaders[this.headerMapping.itemCode] || 'none';
                const newHeader = this.parsedHeaders[actualMapping.itemCode] || 'none';
                console.log(`⚡ Item code mapping changed from ${this.headerMapping.itemCode} ("${oldHeader}") to ${actualMapping.itemCode} ("${newHeader}")`);
            }
            
            // Use a deep clone to ensure reactivity and prevent reference issues
            this.headerMapping = JSON.parse(JSON.stringify(actualMapping));
            
            console.log('⚡ Header mapping updated successfully');
        },
        
        // ===== Database Operations =====
        
        /**
         * Save stock usage data to Firebase
         */
        async saveStockUsage() {
            if (!this.stockData || this.stockData.length === 0) {
                Swal.fire({
                    icon: 'error',
                    title: 'No Data Available',
                    text: 'Please upload and process stock data before saving.',
                    confirmButtonColor: '#3085d6'
                });
                return;
            }
            
            // Show saving indicator
            this.isSaving = true;
            
            try {
                // Calculate stock period days if not set
                if (!this.stockPeriodDays && this.openingStockDate && this.closingStockDate) {
                    const opening = new Date(this.openingStockDate);
                    const closing = new Date(this.closingStockDate);
                    const diffTime = Math.abs(closing - opening);
                    this.stockPeriodDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
                }
                
                // Prepare data for saving
                const dataToSave = {
                    // Store context
                    storeName: this.storeName,
                    openingDate: this.openingStockDate,
                    closingDate: this.closingStockDate,
                    stockPeriodDays: this.stockPeriodDays,
                    daysToNextDelivery: this.daysToNextDelivery,
                    safetyStockPercentage: this.safetyStockPercentage,
                    criticalItemBuffer: this.criticalItemBuffer,
                    
                    // Financial summary
                    totalOpeningValue: this.filteredData.reduce((sum, item) => sum + (parseFloat(item.openingValue) || 0), 0),
                    totalPurchases: this.filteredData.reduce((sum, item) => sum + (parseFloat(item.purchaseValue) || 0), 0),
                    totalClosingValue: this.filteredData.reduce((sum, item) => sum + (parseFloat(item.closingValue) || 0), 0),
                    totalUsage: this.filteredData.reduce((sum, item) => sum + (parseFloat(item.usage) || 0), 0),
                    totalCostOfUsage: this.totalCostOfUsage,
                    salesAmount: this.salesAmount,
                    costPercentage: this.costPercentage,
                    
                    // Stock data
                    stockItems: this.stockData,
                    
                    // Metadata
                    categories: this.categories.filter(cat => cat !== 'All Categories'),
                    costCenters: this.costCenters.filter(cc => cc !== 'All Cost Centers'),
                    lowStockItemCount: this.lowStockItems.length
                };
                
                // Save to Firebase using database-operations.js
                const result = await saveStockDataToDatabase(dataToSave);
                
                // Show success message
                Swal.fire({
                    icon: 'success',
                    title: 'Saved Successfully',
                    text: 'Stock usage data has been saved. ' + result.message,
                    confirmButtonColor: '#3085d6'
                });
                
                console.log('Stock usage data saved successfully:', result.timestamp);
            } catch (error) {
                console.error('Error saving stock usage data:', error);
                
                Swal.fire({
                    icon: 'error',
                    title: 'Save Failed',
                    text: 'Failed to save stock usage data: ' + error.message,
                    confirmButtonColor: '#3085d6'
                });
            } finally {
                this.isSaving = false;
            }
        },
        
        /**
         * Load data for the Food Cost module
         * Shows a selection UI for choosing which data record to load
         */
        async loadData() {
            try {
                // Show loading indicator
                Swal.fire({
                    title: 'Loading Data',
                    text: 'Fetching available data records...',
                    icon: 'info',
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    willOpen: () => {
                        Swal.showLoading();
                    }
                });
                
                // Get historical records from database-operations.js
                const records = await loadHistoricalData();
                
                // Close loading indicator
                Swal.close();
                
                if (records.length === 0) {
                    // No records found
                    Swal.fire({
                        icon: 'info',
                        title: 'No Data Available',
                        text: 'No historical data records were found. Please import a CSV file or save data first.',
                        confirmButtonColor: '#3085d6'
                    });
                    return;
                }
                
                // Format records for selection dialog with improved display including date ranges
                const recordOptions = records.map((record, index) => {
                    const closingDate = record.closingDate || 'Unknown Date';
                    const openingDate = record.openingDate || '';
                    const dateRange = openingDate ? `${openingDate} → ${closingDate}` : closingDate;
                    const store = record.storeName || 'Default Store';
                    const itemCount = record.totalItems || (record.stockItems ? record.stockItems.length : 0);
                    return {
                        value: index.toString(),
                        text: `${dateRange} - ${store} (${itemCount} items)`
                    };
                });
                
                // Create custom HTML for a more scalable interface with search and pagination
                let customHtml = `
                <div class="data-selector">
                    <input type="text" id="data-search" class="form-control mb-3" placeholder="Search records...">
                    <div class="data-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">
                `;
                
                // Add records to the custom HTML
                records.forEach((record, index) => {
                    const closingDate = record.closingDate || 'Unknown Date';
                    const openingDate = record.openingDate || '';
                    const dateRange = openingDate ? `${openingDate} → ${closingDate}` : closingDate;
                    const store = record.storeName || 'Default Store';
                    const itemCount = record.totalItems || (record.stockItems ? record.stockItems.length : 0);
                    
                    customHtml += `
                    <div class="data-item" data-index="${index}" style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;">
                        <strong>${dateRange}</strong><br>
                        ${store} <span class="badge badge-info">${itemCount} items</span>
                    </div>
                    `;
                });
                
                customHtml += `
                    </div>
                </div>
                `;
                
                // Show custom selection dialog
                const { value: selectedIndex, dismiss } = await Swal.fire({
                    title: 'Select Data to Load',
                    html: customHtml,
                    showCancelButton: true,
                    confirmButtonText: 'Load Selected',
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    allowOutsideClick: true,
                    focusConfirm: false,
                    didOpen: () => {
                        // Add click event to items
                        const items = Swal.getPopup().querySelectorAll('.data-item');
                        items.forEach(item => {
                            item.addEventListener('click', () => {
                                // Remove selected class from all items
                                items.forEach(i => i.classList.remove('selected'));
                                // Add selected class to clicked item
                                item.classList.add('selected');
                                item.style.backgroundColor = '#f0f7ff';
                                item.style.borderLeft = '4px solid #3085d6';
                                
                                // Store selected index in a hidden field
                                Swal.getPopup().querySelector('#selected-index').value = item.dataset.index;
                            });
                        });
                        
                        // Add search functionality
                        const searchInput = Swal.getPopup().querySelector('#data-search');
                        if (searchInput) {
                            searchInput.addEventListener('input', () => {
                                const searchValue = searchInput.value.toLowerCase();
                                items.forEach(item => {
                                    const text = item.textContent.toLowerCase();
                                    if (text.includes(searchValue)) {
                                        item.style.display = 'block';
                                    } else {
                                        item.style.display = 'none';
                                    }
                                });
                            });
                        }
                        
                        // Add hidden field to store selected index
                        const hiddenField = document.createElement('input');
                        hiddenField.type = 'hidden';
                        hiddenField.id = 'selected-index';
                        Swal.getPopup().appendChild(hiddenField);
                    },
                    preConfirm: () => {
                        const selectedIndex = Swal.getPopup().querySelector('#selected-index').value;
                        if (!selectedIndex) {
                            Swal.showValidationMessage('Please select a data record');
                            return false;
                        }
                        return selectedIndex;
                    }
                });
                
                if (selectedIndex && !dismiss) {
                    // User selected a record, load it
                    const recordToLoad = records[parseInt(selectedIndex)];
                    await this.loadHistoricalRecord(recordToLoad.key);
                    
                    const recordLabel = recordOptions[parseInt(selectedIndex)].text;
                    this.showToast('success', 'Data Loaded', `Successfully loaded data from ${recordLabel}`);
                }
            } catch (error) {
                console.error('Error in loadData:', error);
                
                Swal.fire({
                    icon: 'error',
                    title: 'Load Failed',
                    text: 'Failed to load data: ' + error.message,
                    confirmButtonColor: '#3085d6'
                });
            }
        },
        
        /**
         * Load historical data records
         */
        async loadHistoricalData() {
            this.isLoadingHistorical = true;
            
            try {
                // Get historical records from database-operations.js
                const records = await loadHistoricalData();
                this.historicalData = records;
                
                // Show the historical data panel
                this.showHistoricalData = true;
                
                // Show message if no records found
                if (records.length === 0) {
                    this.showToast('info', 'No Historical Data', 'No historical data available for statistics.');
                }
            } catch (error) {
                console.error('Error loading historical data:', error);
                
                Swal.fire({
                    icon: 'error',
                    title: 'Load Failed',
                    text: 'Failed to load historical data: ' + error.message,
                    confirmButtonColor: '#3085d6'
                });
            } finally {
                this.isLoadingHistorical = false;
            }
        },
        
        /**
         * Load a specific historical record
         * @param {string} recordId - The record ID to load
         */
        async loadHistoricalRecord(recordId) {
            this.isLoading = true;
            
            try {
                // Load the specific record using database-operations.js
                const record = await loadSpecificHistoricalData(recordId);
                
                if (!record) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Record Not Found',
                        text: 'The requested historical record could not be found.',
                        confirmButtonColor: '#3085d6'
                    });
                    return;
                }
                
                // Update application state with historical data
                this.stockData = record.stockItems || [];
                
                // Ensure each item has a costOfUsage property
                this.stockData.forEach(item => {
                    // If costOfUsage is missing, calculate it from usage and unitCost
                    if (item.costOfUsage === undefined || item.costOfUsage === null) {
                        const usage = parseFloat(item.usage) || 0;
                        const unitCost = parseFloat(item.unitCost) || 0;
                        item.costOfUsage = usage * unitCost;
                    }
                });
                
                this.categories = ['All Categories', ...(record.categories || [])];
                this.costCenters = ['All Cost Centers', ...(record.costCenters || [])];
                
                // Update store settings
                this.storeName = record.storeName || this.storeName;
                this.openingStockDate = record.openingDate || this.openingStockDate;
                this.closingStockDate = record.closingDate || this.closingStockDate;
                this.stockPeriodDays = record.stockPeriodDays || this.stockPeriodDays;
                this.daysToNextDelivery = record.daysToNextDelivery || this.daysToNextDelivery;
                this.safetyStockPercentage = record.safetyStockPercentage || this.safetyStockPercentage;
                this.criticalItemBuffer = record.criticalItemBuffer || this.criticalItemBuffer;
                
                // Load financial data from record if available
                if (record.salesAmount !== undefined) {
                    this.salesAmount = parseFloat(record.salesAmount) || 0;
                }
                if (record.totalCostOfUsage !== undefined) {
                    this.totalCostOfUsage = parseFloat(record.totalCostOfUsage) || 0;
                }
                if (record.costPercentage !== undefined) {
                    this.costPercentage = parseFloat(record.costPercentage) || 0;
                }
                
                // Close the historical data panel
                this.showHistoricalData = false;
                
                // Mark data as uploaded
                this.isDataUploaded = true;
                
                // Store the current historical record ID
                this.currentHistoricalRecord = recordId;
                
                // Apply filters and calculate totals
                this.filterData();
                
                // Recalculate and update UI
                this.recalculateUsageAndReorderPoints();
                this.updateAvailableSuppliers();
                this.calculateTotals(); // Make sure totals are updated
                this.updateUI();
                
                console.log(`Loaded record ${recordId} with ${this.stockData.length} items`);
                console.log(`Updated financial data - Sales: ${this.salesAmount}, Cost of Usage: ${this.totalCostOfUsage}, Percentage: ${this.costPercentage}%`);
                
                this.showToast('success', 'Record Loaded', 'Historical record loaded successfully.');
            } catch (error) {
                console.error('Error loading historical record:', error);
                
                Swal.fire({
                    icon: 'error',
                    title: 'Load Failed',
                    text: 'Failed to load historical record: ' + error.message,
                    confirmButtonColor: '#3085d6'
                });
            } finally {
                this.isLoading = false;
            }
        },
        
        /**
         * Delete a historical record
         * @param {string} recordId - The record ID to delete
         */
        async deleteHistoricalRecord(recordId) {
            // Confirm deletion
            const confirmResult = await Swal.fire({
                icon: 'warning',
                title: 'Confirm Deletion',
                text: 'Are you sure you want to delete this record? This action cannot be undone.',
                showCancelButton: true,
                confirmButtonText: 'Yes, Delete It',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6'
            });
            
            if (!confirmResult.isConfirmed) {
                return;
            }
            
            this.isLoading = true;
            
            try {
                // Delete the record using database-operations.js
                const result = await deleteHistoricalData(recordId);
                
                // Remove from the historicalData array
                this.historicalData = this.historicalData.filter(record => record.key !== recordId);
                
                // If we deleted the current record, clear it
                if (this.currentHistoricalRecord === recordId) {
                    this.currentHistoricalRecord = null;
                }
                
                this.showToast('success', 'Record Deleted', 'Historical record was deleted successfully.');
            } catch (error) {
                console.error('Error deleting historical record:', error);
                
                Swal.fire({
                    icon: 'error',
                    title: 'Delete Failed',
                    text: 'Failed to delete historical record: ' + error.message,
                    confirmButtonColor: '#3085d6'
                });
            } finally {
                this.isLoading = false;
            }
        },
        
        /**
         * Get historical data for a specific item
         * @param {string} itemCode - The item code to get history for
         */
        async getItemHistory(itemCode) {
            try {
                const historyData = await getItemHistoricalData(itemCode);
                
                if (historyData.length === 0) {
                    this.showToast('info', 'No History', 'No historical data found for item ' + itemCode);
                    return;
                }
                
                // Format the data for display
                const formattedData = historyData.map(entry => ({
                    date: new Date(entry.timestamp || Date.now()).toLocaleDateString(),
                    usage: (entry.usage !== undefined && entry.usage !== null) ? Number(entry.usage).toFixed(2) : '0.00',
                    cost: (entry.costOfUsage !== undefined && entry.costOfUsage !== null) ? Number(entry.costOfUsage).toFixed(2) : '0.00',
                    reorderPoint: (entry.reorderPoint !== undefined && entry.reorderPoint !== null) ? Number(entry.reorderPoint).toFixed(2) : '0.00'
                }));
                
                // Show in a modal or SweetAlert
                Swal.fire({
                    icon: 'info',
                    title: 'History for ' + itemCode,
                    html: '<div class="table-responsive">' +
                        '<table class="table table-sm table-bordered">' +
                            '<thead class="thead-light">' +
                                '<tr>' +
                                    '<th>Date</th>' +
                                    '<th>Usage</th>' +
                                    '<th>Cost</th>' +
                                    '<th>Reorder Point</th>' +
                                '</tr>' +
                            '</thead>' +
                            '<tbody>' +
                                formattedData.map(function(item) {
                                    return '<tr>' +
                                        '<td>' + item.date + '</td>' +
                                        '<td>' + item.usage + '</td>' +
                                        '<td>' + item.cost + '</td>' +
                                        '<td>' + item.reorderPoint + '</td>' +
                                    '</tr>';
                                }).join('') +
                            '</tbody>' +
                        '</table>' +
                    '</div>',
                    width: '600px'
                });
            } catch (error) {
                console.error('Error getting item history:', error);
                
                this.showToast('error', 'History Error', 'Failed to get item history: ' + error.message);
            }
        },
        
        /**
         * Get stock usage statistics
         */
        async getStockStatistics() {
            try {
                // Get all historical data
                const records = await loadHistoricalData();
                
                if (records.length === 0) {
                    this.showToast('info', 'No Statistics', 'No historical data available for statistics.');
                    return;
                }
                
                // Calculate statistics
                let totalUsage = 0;
                let totalValue = 0;
                
                records.forEach(record => {
                    totalUsage += Number(record.totalUsage) || 0;
                    totalValue += Number(record.totalCostOfUsage) || 0;
                });
                
                const stats = {
                    totalRecords: records.length,
                    averageUsage: records.length > 0 ? totalUsage / records.length : 0,
                    totalValue: totalValue,
                    oldestRecord: records[records.length - 1]?.timestamp,
                    newestRecord: records[0]?.timestamp
                };
                
                Swal.fire({
                    icon: 'info',
                    title: 'Stock Usage Statistics',
                    html: '<div class="text-left">' +
                        '<p><strong>Total Records:</strong> ' + stats.totalRecords + '</p>' +
                        '<p><strong>Average Usage Value:</strong> ' + (stats.averageUsage !== undefined ? Number(stats.averageUsage).toFixed(2) : '0.00') + '</p>' +
                        '<p><strong>Total Value:</strong> ' + (stats.totalValue !== undefined ? Number(stats.totalValue).toFixed(2) : '0.00') + '</p>' +
                        '<p><strong>Oldest Record:</strong> ' + (stats.oldestRecord ? new Date(stats.oldestRecord).toLocaleString() : 'N/A') + '</p>' +
                        '<p><strong>Newest Record:</strong> ' + (stats.newestRecord ? new Date(stats.newestRecord).toLocaleString() : 'N/A') + '</p>' +
                    '</div>',
                    confirmButtonColor: '#3085d6'
                });
            } catch (error) {
                console.error('Error getting stock statistics:', error);
                
                this.showToast('error', 'Statistics Error', 'Failed to get statistics: ' + error.message);
            }
        },
        
        /**
         * Select all categories for filtering
         */
        selectAllCategories() {
            this.categoryFilters = this.categories
                .filter(category => category !== 'All Categories');
            this.applyFilters();
        },
        
        /**
         * Clear all category filters
         */
        clearCategoryFilters() {
            this.categoryFilters = [];
            this.applyFilters();
        },
        
        /**
         * Select all cost centers for filtering
         */
        selectAllCostCenters() {
            this.costCenterFilters = this.costCenters
                .filter(costCenter => costCenter !== 'All Cost Centers');
            this.applyFilters();
        },
        
        /**
         * Clear all cost center filters
         */
        clearCostCenterFilters() {
            this.costCenterFilters = [];
            this.applyFilters();
        },
        
        /**
         * Show toast notification
         * @param {string} type - Type of toast (success, error, info, warning)
         * @param {string} title - Toast title
         * @param {string} message - Toast message
         */
        showToast(type, title, message) {
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });
            
            Toast.fire({
                icon: type,
                title: title,
                text: message
            });
        },
        
        /**
         * Get calculation details for a stock item
         */
        getItemCalculationDetails(item) {
            return getItemCalculationDetails(item, {
                daysToNextDelivery: this.daysToNextDelivery,
                stockPeriodDays: this.stockPeriodDays,
                safetyStockPercentage: this.safetyStockPercentage,
                criticalItemBuffer: this.criticalItemBuffer
            });
        },
        

        
        /**
         * Show calculation details for a specific stock item
         * Displays theoretical order quantity and calculation breakdown
         * @param {Object} item - The stock item to show calculation details for
         */
        showItemCalculationDetails(item) {
            if (!item) return;
            
            // Use the extracted component to show the calculation details
            this.$refs.itemCalculationDetails.showDetails(item, {
                orderCycle: 7, // How often delivery occurs
                daysToNextDelivery: this.daysToNextDelivery || 7,
                leadTimeDays: 2,
                safetyStockPercentage: this.safetyStockPercentage || 20,
                criticalItemBuffer: 30,
                stockPeriodDays: this.stockPeriodDays || 7
            });
        },
        
        /**
         * Sort stock data by a field
         */
        sortBy(field) {
            if (this.sortField === field) {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortField = field;
                this.sortDirection = 'asc';
            }
            
            this.filteredData.sort((a, b) => {
                if (this.sortDirection === 'asc') {
                    return a[field] < b[field] ? -1 : 1;
                } else {
                    return a[field] > b[field] ? -1 : 1;
                }
            });
        },
        
        /**
         * Get category badge class
         */
        getCategoryBadgeClass(category) {
            switch (category) {
                case 'Beverages':
                    return 'badge-primary';
                case 'Dairy':
                    return 'badge-secondary';
                case 'Meat':
                    return 'badge-success';
                case 'Produce':
                    return 'badge-info';
                case 'Dry Goods':
                    return 'badge-warning';
                default:
                    return 'badge-light';
            }
        },
        
        /**
         * Export stock data to CSV
         */
        exportToCsv() {
            const csvData = this.filteredData.map(item => {
                return [
                    item.itemCode,
                    item.description,
                    item.category,
                    item.costCenter,
                    item.openingQty,
                    item.closingQty,
                    item.usage,
                    item.usageValue,
                    item.reorderPoint
                ];
            });
            
            const csvContent = 'Item Code,Description,Category,Cost Center,Opening Qty,Closing Qty,Usage,Usage Value,Reorder Point\n' + csvData.map(row => row.join(',')).join('\n');
            
            downloadCSV('stock-data.csv', csvContent);
        },
        
        /**
         * Reset form for new CSV upload
         */
        resetForm() {
            // Clear file input
            const fileInput = document.getElementById('csvFileInput');
            if (fileInput) {
                fileInput.value = '';
            }
            
            // Reset data states
            this.parsedHeaders = [];
            this.parsedData = { rows: [] };
            this.isDataLoaded = false;
            this.isDataUploaded = false;
            this.showHeaderMapping = false;
            
            // Allow for new file uploads
            this.isProcessing = false;
            
            // Reset chart initialization to prevent Chart.js canvas reuse errors
            resetChartInitialization();
            
            // Show toast notification
            this.showToast('info', 'Form Reset', 'Upload form has been reset. You can now upload a new CSV file.');
        },
        
        /**
         * Initialize component
         */
        async initialize() {
            console.log('Food Cost App initialized');
            
            // Check edit permissions first - this ensures the Edit button will be visible
            await this.checkEditPermission();
            console.log('Edit permission check completed. Status:', this.hasEditPermission);
            
            // Set default dates if not already set
            if (!this.openingStockDate) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                this.openingStockDate = yesterday.toISOString().split('T')[0];
            }
            
            if (!this.closingStockDate) {
                this.closingStockDate = new Date().toISOString().split('T')[0];
            }
            
            // Check for stored financial values in session storage (for refresh resilience)
            const storedTotalCost = sessionStorage.getItem('foodCostTotalCostOfUsage');
            const storedSalesAmount = sessionStorage.getItem('foodCostSalesAmount');
            const storedPercentage = sessionStorage.getItem('foodCostPercentage');
            
            if (storedTotalCost) this.totalCostOfUsage = parseFloat(storedTotalCost);
            if (storedSalesAmount) this.salesAmount = parseFloat(storedSalesAmount);
            if (storedPercentage) this.costPercentage = parseFloat(storedPercentage);
            
            // Load recent store context
            try {
                const storeContext = await getRecentStoreContext();
                this.storeName = storeContext.storeName;
                this.daysToNextDelivery = storeContext.daysToNextDelivery;
                this.safetyStockPercentage = storeContext.safetyStockPercentage;
                this.criticalItemBuffer = storeContext.criticalItemBuffer;
                console.log('Loaded store context:', storeContext);
            } catch (error) {
                console.error('Error loading store context:', error);
            }
            
            // Ensure initial calculations are performed
            this.$nextTick(() => {
                if (this.isDataLoaded && this.stockData.length > 0) {
                    this.calculateTotals();
                }
            });
        },
    },
    
    template: `
        <div class="food-cost-container">
            <!-- Header Section -->
            <div class="card mb-4">
                <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                    <h6 class="m-0 font-weight-bold text-primary">Food Cost Management</h6>
                    <div class="dropdown no-arrow">
                        <a class="dropdown-toggle" href="#" role="button" id="dropdownMenuLink" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            <i class="fas fa-ellipsis-v fa-sm fa-fw text-gray-400"></i>
                        </a>
                        <div class="dropdown-menu dropdown-menu-right shadow animated--fade-in" aria-labelledby="dropdownMenuLink">
                            <div class="dropdown-header">Actions:</div>
                            <a class="dropdown-item" href="#" @click.prevent="saveStockUsage" :disabled="!isDataUploaded || isSaving">
                                <i class="fas fa-save fa-sm fa-fw mr-2 text-gray-400"></i> Save to Database
                            </a>
                            <a class="dropdown-item" href="#" @click.prevent="loadHistoricalData" :disabled="isLoadingHistorical">
                                <i class="fas fa-history fa-sm fa-fw mr-2 text-gray-400"></i> Load Historical Data
                            </a>
                            <a class="dropdown-item" href="#" @click.prevent="getStockStatistics">
                                <i class="fas fa-chart-bar fa-sm fa-fw mr-2 text-gray-400"></i> View Statistics
                            </a>
                            <a class="dropdown-item" href="#" @click.prevent="showPurchaseOrder" :disabled="!isDataUploaded">
                                <i class="fas fa-file-invoice fa-sm fa-fw mr-2 text-gray-400"></i> Generate Purchase Order
                            </a>
                            <div class="dropdown-divider"></div>
                            <a class="dropdown-item" href="#" @click.prevent="exportToCsv" :disabled="!isDataUploaded">
                                <i class="fas fa-file-csv fa-sm fa-fw mr-2 text-gray-400"></i> Export to CSV
                            </a>
                        </div>
                    </div>
                </div>
                
                <!-- Store Information -->
                <div class="card-body">
                    <div class="row">
                        <!-- Store Name -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Store Name:</label>
                                <input type="text" class="form-control" v-model="storeName">
                            </div>
                        </div>
                        
                        <!-- Opening Stock Date -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Opening Stock Date:</label>
                                <input type="date" class="form-control" v-model="openingStockDate">
                            </div>
                        </div>
                        
                        <!-- Closing Stock Date -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Closing Stock Date:</label>
                                <input type="date" class="form-control" v-model="closingStockDate">
                            </div>
                        </div>
                        
                        <!-- Stock Period Days -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Stock Period (Days):</label>
                                <input type="number" class="form-control" v-model="stockPeriodDays" min="1" readonly>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <!-- Days to Next Delivery -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Days to Next Delivery:</label>
                                <input type="number" class="form-control" v-model="daysToNextDelivery" min="1">
                            </div>
                        </div>
                        
                        <!-- Safety Stock Percentage -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Safety Stock %:</label>
                                <input type="number" class="form-control" v-model="safetyStockPercentage" min="0" max="100">
                            </div>
                        </div>
                        
                        <!-- Critical Item Buffer -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Critical Item Buffer (%):</label>
                                <input type="number" class="form-control" v-model="criticalItemBuffer" min="0" max="200">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Data Summary Component for Sales and Cost Information -->
                    <data-summary
                        :total-cost-of-usage="totalCostOfUsage"
                        :sales-amount="salesAmount"
                        :cost-percentage="costPercentage"
                        :stock-period-days="stockPeriodDays"
                        :stock-data="filteredData"
                        :editable="true"
                        @update:sales-amount="updateSalesAmount"
                    ></data-summary>
                    
                    <!-- Action Buttons -->
                    <div class="row mt-3">
                        <div class="col-md-12">
                            <input type="file" id="csvFileInput" ref="fileInput" style="display: none" accept=".csv" @change="parseCSVFile($event.target.files[0])">
                            
                            <button class="btn btn-primary mr-2" @click="$refs.fileInput.click()">
                                <i class="fas fa-file-csv mr-1"></i> Import CSV
                            </button>
                            
                            <button class="btn btn-info mr-2" @click="loadData">
                                <i class="fas fa-history mr-1"></i> Load Data
                            </button>
                            
                            <button class="btn btn-success mr-2" @click="saveStockUsage" :disabled="!isDataUploaded || isSaving">
                                <i class="fas fa-save mr-1"></i> Save Data
                            </button>
                            
                            <button class="btn btn-danger mr-2" @click="showDeleteHistoricalDataUI">
                                <i class="fas fa-trash-alt mr-1"></i> Delete Historical Data
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Charts are now part of the DataSummary component -->
            
            <!-- Data Management Card -->
            <div class="row mb-4" v-if="isDataUploaded">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header bg-light">
                            <h5 class="mb-0"><i class="fas fa-database mr-2"></i> Data Management</h5>
                        </div>
                        <div class="card-body">
                            <div class="d-flex flex-wrap">
                                <div class="btn-group mr-3 mb-2">
                                    <button class="btn btn-primary" @click="saveStockUsage" :disabled="!isDataUploaded || isSaving">
                                        <i class="fas" :class="isSaving ? 'fa-spinner fa-spin' : 'fa-save'"></i>
                                        {{ isSaving ? 'Saving...' : 'Save to Database' }}
                                    </button>
                                </div>
                                <div class="btn-group mb-2">
                                    <button class="btn btn-warning" @click="recalculateUsageAndReorderPoints">
                                        <i class="fas fa-calculator mr-1"></i> Recalculate
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Stock Data Table Section -->
            <div class="card shadow mb-4" v-if="isDataUploaded">
                <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                    <h6 class="m-0 font-weight-bold text-primary">Stock Data</h6>
                    <div class="dropdown no-arrow">
                        <a class="dropdown-toggle" href="#" role="button" id="dropdownMenuLink" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            <i class="fas fa-ellipsis-v fa-sm fa-fw text-gray-400"></i>
                        </a>
                        <div class="dropdown-menu dropdown-menu-right shadow animated--fade-in" aria-labelledby="dropdownMenuLink">
                            <div class="dropdown-header">Actions:</div>
                            <a class="dropdown-item" href="#" @click.prevent="exportToCsv"><i class="fas fa-file-csv mr-1"></i> Export to CSV</a>
                            <a class="dropdown-item" href="#" @click.prevent="toggleEditMode" v-if="hasEditPermission"><i class="fas fa-edit mr-1"></i> {{ isEditMode ? 'Exit Edit Mode' : 'Edit Stock Data' }}</a>
                            <!-- Debug info -->
                            <div class="dropdown-item text-muted" style="font-size: 10px;">Debug: Edit permission = {{ hasEditPermission ? 'YES' : 'NO' }}</div>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <!-- Filter and Action Buttons -->
                    <div class="row mb-3">
                        <div class="col-md-3">
                            <!-- Search -->
                            <div class="input-group">
                                <div class="input-group-prepend">
                                    <span class="input-group-text"><i class="fas fa-search"></i></span>
                                </div>
                                <input type="text" class="form-control" v-model="searchTerm" placeholder="Search">
                            </div>
                        </div>
                        <div class="col-md-3">
                            <!-- Category Filter -->
                            <div class="form-group mb-0">
                                <button class="btn btn-white dropdown-toggle w-100 border" type="button" 
                                        @click="openCategoryFilter">
                                    {{ selectedCategories.length > 0 ? selectedCategories.length + ' categories selected' : 'Select categories' }}
                                </button>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <!-- Cost Center Filter -->
                            <div class="form-group mb-0">
                                <button class="btn btn-white dropdown-toggle w-100 border" type="button" 
                                        @click="openCostCenterFilter">
                                    {{ selectedCostCenters.length > 0 ? selectedCostCenters.length + ' cost centers selected' : 'Select cost centers' }}
                                </button>
                            </div>
                        </div>
                        <div class="col-md-3 text-right">
                            <button class="btn btn-primary" @click="exportToCsv">
                                <i class="fas fa-file-export mr-1"></i> Export to CSV
                            </button>
                            <button class="btn btn-info ml-2" onclick="window.print()">
                                <i class="fas fa-print mr-1"></i> Print
                            </button>
                            <button v-if="hasEditPermission" 
                                   class="btn ml-2" 
                                   :class="isEditMode ? 'btn-warning' : 'btn-success'" 
                                   @click="toggleEditMode">
                                <i class="fas fa-edit mr-1"></i> {{ isEditMode ? 'Exit Edit Mode' : 'Edit Data' }}
                            </button>
                            <button class="btn btn-primary ml-2" @click="showPurchaseOrder()">
                                <i class="fas fa-file-invoice mr-1"></i> Purchase Order
                            </button>
                        </div>
                    </div>
                    
                    <!-- Stock Data Table Component -->
                    <!-- Regular Stock Data Table (Non-Edit Mode) -->
                    <stock-data-table
                        v-if="!isEditMode"
                        :items="filteredData"
                        :sort-field="sortField"
                        :sort-direction="sortDirection"
                        :total-item-count="stockData.length"
                        @sort="sortBy"
                        @show-item-details="showItemCalculationDetails"
                    ></stock-data-table>
                    
                    <!-- Editable Stock Data Table (Edit Mode) -->
                    <editable-stock-data-table
                        v-if="isEditMode"
                        :items="filteredData"
                        :show-summary="true"
                        :total-items="stockData.length"
                        :sort-field="sortField"
                        :sort-direction="sortDirection"
                        :edit-mode="isEditMode"
                        :has-edit-permission="hasEditPermission"
                        :user-data="getUserData()"
                        :last-edit-metadata="lastEditMetadata"
                        :record-id="currentHistoricalRecord"
                        @sort="sortBy"
                        @show-item-details="showItemCalculationDetails"
                        @item-changed="handleItemChange"
                        @save-changes="saveEditedStockData"
                        @reset-all-changes="cancelEditMode"
                        @validation-error="handleValidationError"
                    ></editable-stock-data-table>
                    
                    <!-- Filters and info moved above the table -->
                </div>
            </div>
            
            <!-- End of Stock Data Section -->
            
            <!-- Historical Data Modal -->
            <historical-data-modal
                :show="showHistoricalDataModal"
                :historical-data="historicalData"
                :is-loading="isLoadingHistoricalData"
                @close="showHistoricalDataModal = false"
                @load-record="loadHistoricalRecord"
                @delete-record="deleteHistoricalRecord"
            ></historical-data-modal>
            
            <!-- Delete Historical Data Modal -->
            <delete-confirmation-modal
                :show="showDeleteHistoricalDataModal"
                :historical-data="historicalData"
                :is-loading="isLoadingHistoricalData"
                :selected-records="selectedRecordsForDeletion"
                :select-all="selectAllRecordsForDeletion"
                :is-deleting="isDeletingRecords"
                @close="showDeleteHistoricalDataModal = false"
                @toggle-all="toggleAllRecordsSelection"
                @update-selection="updateRecordSelection"
                @delete-selected="deleteSelectedHistoricalRecords"
                @delete-record="deleteHistoricalRecord"
            ></delete-confirmation-modal>
            
            <!-- Purchase Order Modal -->
            <purchase-order-modal 
                :show-modal="showPurchaseOrderModal" 
                :stock-data="filteredData" 
                :selected-supplier="selectedSupplier"
                :available-suppliers="availableSuppliers" 
                :days-to-next-delivery="daysToNextDelivery"
                :safety-stock-percentage="safetyStockPercentage || 15"
                :critical-item-buffer="30"
                :store-name="storeName"
                @close="closePurchaseOrder"
            ></purchase-order-modal>
            
            <!-- Category Filter Component -->
            <category-filter
                :show-filter="showCategoryPopup"
                :categories="availableCategories"
                :selected-categories="selectedCategories"
                @toggle-category="toggleCategorySelection"
                @select-all="selectAllCategories"
                @clear-all="clearCategoryFilters"
                @close="closeCategoryFilter"
            ></category-filter>
            
            <!-- Cost Center Filter Component -->
            <cost-center-filter
                :show-filter="showCostCenterPopup"
                :available-cost-centers="availableCostCenters"
                :selected-cost-centers="selectedCostCenters"
                @toggle-cost-center="toggleCostCenterSelection"
                @select-all="selectAllCostCenters"
                @clear-all="clearCostCenterFilters"
                @close="closeCostCenterFilter"
            ></cost-center-filter>
            
            <!-- Header Mapping Modal -->
            <header-mapping-modal
                :show="showHeaderMapping"
                :headers="parsedHeaders"
                :value="headerMapping"
                @input="updateHeaderMapping"
                @cancel="closeHeaderMappingModal"
                @process="processHeaderMapping"
            ></header-mapping-modal>
            
            <!-- Item Calculation Details Modal (referenced) -->
            <item-calculation-details-modal ref="itemCalculationDetails"></item-calculation-details-modal>
        </div>
    `
};

// Make component available globally for standalone initializer
window.FoodCostApp = FoodCostApp;

// Export for ES modules
export { FoodCostApp };
