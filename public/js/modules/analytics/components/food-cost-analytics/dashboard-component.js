/**
 * Food Cost Analytics Dashboard Component
 * 
 * This component provides comprehensive analytics for food cost data.
 */

import { DatabaseOperations } from '../../database-operations.js';
import { DataProcessor } from '../../data-processor.js';
import { ChartManager } from '../../chart-manager.js';
import { Utilities } from '../../utilities.js';
import { TrendsAnalytics } from './trends-component.js';
import { InsightsAnalytics } from './insights-component.js';
import { ForecastAnalytics } from './forecast-component.js';

// Set up Food Cost Analytics namespace
window.Analytics = window.Analytics || {};
window.Analytics.FoodCostAnalytics = window.Analytics.FoodCostAnalytics || {};

// Food Cost Analytics Dashboard component
const FoodCostAnalyticsDashboard = {
    name: 'FoodCostAnalyticsDashboard',
    components: {
        'trends-analytics': TrendsAnalytics,
        'insights-analytics': InsightsAnalytics,
        'forecast-analytics': ForecastAnalytics
    },
    props: {
        dateRange: {
            type: Object,
            required: true
        }
    },
    data() {
        return {
            loading: false,
            error: null,
            activeTab: 'trends',
            processedData: null,
            utils: Utilities, // Make utilities available in the template
            summary: {
                recordCount: 0,
                totalUsage: 0,
                totalValue: 0,
                categories: [],
                timeRange: ''
            },
            tabs: [
                { id: 'trends', label: 'Trends Analysis', icon: 'fas fa-chart-line' },
                { id: 'insights', label: 'Insights', icon: 'fas fa-lightbulb' },
                { id: 'forecast', label: 'Forecast', icon: 'fas fa-chart-area' }
            ],
            // Multi-file selection related data
            showFileSelector: false,
            availableFiles: [],
            selectedFileIds: [],
            loadingFiles: false,
            fileError: null,
            searchTerm: '',
            sortBy: 'timestamp',
            sortOrder: 'desc',
            filterStore: ''
        };
    },
    computed: {
        formattedTotalValue() {
            return this.utils.formatCurrency(this.summary.totalValue);
        },
        formattedTotalUsage() {
            return this.utils.formatNumber(this.summary.totalUsage);
        },
        formattedRecordCount() {
            return this.utils.formatNumber(this.summary.recordCount);
        },
        formattedCategories() {
            return this.utils.formatNumber(this.summary.categories.length);
        }
    },
    methods: {
        /**
         * Load food cost data for analytics
         * @param {Object} dateRange - Date range with startDate and endDate
         * @param {Array} fileIds - Optional array of specific file IDs to load
         */
        async loadData(dateRange = this.dateRange, fileIds = []) {
            this.loading = true;
            this.error = null;
            
            try {
                // Get food cost data from Firebase - either selected files or by date range
                const rawData = fileIds && fileIds.length > 0
                    ? await DatabaseOperations.getStockUsageData(null, fileIds)
                    : await DatabaseOperations.getStockUsageData(dateRange);
                
                if (!rawData || Object.keys(rawData).length === 0) {
                    this.error = 'No data available for the selected criteria.';
                    this.loading = false;
                    return;
                }
                
                // Process the data
                this.processedData = DataProcessor.processData(rawData, {
                    dataType: 'foodCost',
                    dateRange: dateRange,
                    isMultipleFiles: fileIds && fileIds.length > 1
                });
                
                // Update summary data
                this.updateSummary(this.processedData.summary);
                
                // If we loaded specific files, update the selected file IDs to match
                if (fileIds && fileIds.length > 0) {
                    this.selectedFileIds = [...fileIds];
                }
                
                console.log('Food cost data processed successfully', {
                    fileCount: Object.keys(rawData).length,
                    isMultiFile: fileIds && fileIds.length > 1,
                    processedData: this.processedData
                });
            } catch (error) {
                console.error('Error loading food cost data:', error);
                this.error = `Error loading data: ${error.message}`;
            } finally {
                this.loading = false;
            }
        },
        
        /**
         * Update the summary data
         * @param {Object} summaryData - Summary data from processed data
         */
        updateSummary(summaryData) {
            this.summary = {
                recordCount: summaryData.recordCount || 0,
                totalUsage: summaryData.totalUsage || 0,
                totalValue: summaryData.totalValue || 0,
                categories: summaryData.categories || [],
                timeRange: summaryData.startDate && summaryData.endDate ? 
                    `${Utilities.formatDate(summaryData.startDate)} - ${Utilities.formatDate(summaryData.endDate)}` : 
                    'No data available'
            };
        },
        
        /**
         * Switch to a different tab
         * @param {string} tabId - ID of the tab to switch to
         */
        switchTab(tabId) {
            this.activeTab = tabId;
        },
        
        /**
         * Export analytics data to CSV
         */
        exportAnalyticsData() {
            if (!this.processedData || !this.processedData.rawData) {
                Swal.fire({
                    title: 'No Data',
                    text: 'There is no data available to export.',
                    icon: 'warning'
                });
                return;
            }
            
            try {
                // Build CSV header
                const headers = ['Record ID', 'Date', 'Category', 'Item Name', 'Usage Quantity', 'Usage Value'];
                const csvRows = [headers.join(',')];
                
                // Build CSV rows
                this.processedData.rawData.forEach(record => {
                    const recordId = record.id || '';
                    const recordDate = record.id ? DataProcessor.extractDateFromRecordId(record.id) : '';
                    
                    if (record.stockItems && typeof record.stockItems === 'object') {
                        Object.values(record.stockItems).forEach(item => {
                            const row = [
                                recordId,
                                recordDate,
                                item.category || 'Uncategorized',
                                item.name || '',
                                item.usage || 0,
                                item.usageValue || 0
                            ];
                            
                            // Escape fields and join with commas
                            csvRows.push(row.map(field => {
                                // If the field contains commas, quotes, or newlines, enclose it in quotes
                                if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
                                    return `"${field.replace(/"/g, '""')}"`;
                                }
                                return field;
                            }).join(','));
                        });
                    }
                });
                
                // Create a CSV Blob
                const csvContent = csvRows.join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                
                // Create a download link
                const today = new Date().toISOString().slice(0, 10);
                const filename = `food_cost_analytics_${today}.csv`;
                
                // Create download link and trigger download
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                Swal.fire({
                    title: 'Export Complete',
                    text: `Data has been exported as ${filename}`,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (error) {
                console.error('Error exporting data:', error);
                Swal.fire({
                    title: 'Export Failed',
                    text: 'Failed to export data. Please try again.',
                    icon: 'error'
                });
            }
        },
        
        /**
         * Print the analytics dashboard
         */
        printAnalytics() {
            window.print();
        },
        
        /**
         * Open the file selector modal
         */
        openFileSelector() {
            // Ensure we have the latest data
            if (this.availableFiles.length === 0) {
                this.loadAvailableFiles();
            }
            this.showFileSelector = true;
        },
        
        /**
         * Load available data files
         */
        async loadAvailableFiles() {
            this.loadingFiles = true;
            this.fileError = null;
            
            try {
                // Get available data files from Firebase
                const files = await DatabaseOperations.getAvailableDataFiles();
                if (!files || files.length === 0) {
                    this.fileError = 'No data files available. Please upload stock usage data first.';
                }
                
                this.availableFiles = files;
                console.log('Available data files loaded:', files.length);
                
                // If there are files but none selected, preselect the latest one
                if (files.length > 0 && this.selectedFileIds.length === 0 && !this.processedData) {
                    this.selectedFileIds = [files[0].id];
                    console.log('Preselected latest file:', files[0].id);
                }
            } catch (error) {
                console.error('Error loading available data files:', error);
                this.fileError = `Error loading files: ${error.message}`;
            } finally {
                this.loadingFiles = false;
            }
        },
        
        /**
         * Toggle selection of a file
         * @param {string} fileId - ID of the file to toggle
         * @param {Event} event - Optional click/change event
         */
        toggleFileSelection(fileId, event) {
            // If this came from an event, handle it appropriately
            if (event) {
                event.stopPropagation();
                
                // For checkboxes, we need to check the actual checkbox state
                if (event.target && event.target.type === 'checkbox') {
                    const isChecked = event.target.checked;
                    console.log('Checkbox clicked for', fileId, 'state:', isChecked);
                    
                    // Add or remove based on checkbox state
                    if (isChecked && !this.selectedFileIds.includes(fileId)) {
                        this.selectedFileIds.push(fileId);
                    } else if (!isChecked && this.selectedFileIds.includes(fileId)) {
                        const index = this.selectedFileIds.indexOf(fileId);
                        this.selectedFileIds.splice(index, 1);
                    }
                    return;
                }
            }
            
            // Toggle selection (for row clicks)
            console.log('Toggling selection of file:', fileId);
            const index = this.selectedFileIds.indexOf(fileId);
            if (index === -1) {
                // Add to selection
                this.selectedFileIds.push(fileId);
            } else {
                // Remove from selection
                this.selectedFileIds.splice(index, 1);
            }
        },
        
        /**
         * Apply the selected files and reload data
         */
        applyFileSelection() {
            console.log('Applying file selection:', this.selectedFileIds);
            if (this.selectedFileIds.length === 0) {
                // If nothing is selected, just load by date range
                this.loadData(this.dateRange);
            } else {
                // Load the selected files
                this.loadData(this.dateRange, this.selectedFileIds);
            }
            this.showFileSelector = false;
        },
        
        /**
         * Cancel file selection
         */
        cancelFileSelection() {
            // Reset to what's currently loaded
            if (this.processedData && this.processedData.sources) {
                this.selectedFileIds = this.processedData.sources.map(s => s.id);
            } else {
                this.selectedFileIds = [];
            }
            this.showFileSelector = false;
        },
        
        /**
         * Get filtered and sorted files based on search and filters
         */
        getFilteredFiles() {
            return this.availableFiles
                .filter(file => {
                    // Apply search filter
                    if (this.searchTerm && !file.displayName.toLowerCase().includes(this.searchTerm.toLowerCase())) {
                        return false;
                    }
                    
                    // Apply store filter
                    if (this.filterStore && file.storeName !== this.filterStore) {
                        return false;
                    }
                    
                    return true;
                })
                .sort((a, b) => {
                    // Apply sorting
                    const sortField = this.sortBy;
                    let aValue = a[sortField];
                    let bValue = b[sortField];
                    
                    // Handle nested fields
                    if (sortField.includes('.')) {
                        const parts = sortField.split('.');
                        aValue = a[parts[0]][parts[1]];
                        bValue = b[parts[0]][parts[1]];
                    }
                    
                    // Sort direction
                    const direction = this.sortOrder === 'asc' ? 1 : -1;
                    
                    // Compare based on type
                    if (typeof aValue === 'string') {
                        return direction * aValue.localeCompare(bValue);
                    } else {
                        return direction * (aValue - bValue);
                    }
                });
        },
        
        /**
         * Get list of available stores for filtering
         */
        getAvailableStores() {
            const stores = new Set();
            this.availableFiles.forEach(file => {
                if (file.storeName) {
                    stores.add(file.storeName);
                }
            });
            return Array.from(stores).sort();
        },
        
        /**
         * Reset all file filters
         */
        resetFilters() {
            this.searchTerm = '';
            this.filterStore = '';
            this.sortBy = 'timestamp';
            this.sortOrder = 'desc';
        },
        
        /**
         * Toggle selection of all filtered files
         */
        toggleSelectAll(event) {
            if (event) {
                event.stopPropagation();
                
                // For checkboxes, we need to check the actual checkbox state
                if (event.target && event.target.type === 'checkbox') {
                    const isChecked = event.target.checked;
                    const filteredFiles = this.getFilteredFiles();
                    console.log('Select all checkbox clicked, state:', isChecked);
                    
                    if (isChecked) {
                        // Add all filtered files that aren't already selected
                        filteredFiles.forEach(file => {
                            if (!this.selectedFileIds.includes(file.id)) {
                                this.selectedFileIds.push(file.id);
                            }
                        });
                    } else {
                        // Remove all filtered files from selection
                        this.selectedFileIds = this.selectedFileIds.filter(id => 
                            !filteredFiles.some(file => file.id === id)
                        );
                    }
                    return;
                }
            }
            
            // Default toggle behavior (if not from checkbox)
            const filteredFiles = this.getFilteredFiles();
            const allSelected = filteredFiles.length > 0 && 
                                filteredFiles.every(file => this.selectedFileIds.includes(file.id));
            
            console.log('Toggle all files, current state:', { allSelected, filteredCount: filteredFiles.length });
            
            if (allSelected) {
                // If all are selected, deselect all
                this.selectedFileIds = this.selectedFileIds.filter(id => 
                    !filteredFiles.some(file => file.id === id)
                );
            } else {
                // Otherwise, select all that aren't already selected
                const newSelection = [...this.selectedFileIds];
                
                filteredFiles.forEach(file => {
                    if (!newSelection.includes(file.id)) {
                        newSelection.push(file.id);
                    }
                });
                
                this.selectedFileIds = newSelection;
            }
            
            console.log('After toggle all, selected:', this.selectedFileIds);
        },
        
        /**
         * Get file selection summary text
         */
        getFileSelectionSummary() {
            if (this.selectedFileIds.length === 0) {
                return 'Latest data (date range only)';
            } else if (this.selectedFileIds.length === 1) {
                const selectedFile = this.availableFiles.find(f => f.id === this.selectedFileIds[0]);
                return selectedFile ? selectedFile.displayName : 'One file selected';
            } else {
                return `${this.selectedFileIds.length} files selected`;
            }
        },
        
        /**
         * Format the date from a file ID
         * @param {Object} file - The file object
         * @returns {string} Formatted date string
         */
        formatFileDate(file) {
            if (!file || !file.id) return 'Unknown Date';
            
            // Try to get date from file.date if it exists
            if (file.date && file.date instanceof Date && !isNaN(file.date.getTime())) {
                return file.date.toLocaleDateString();
            }
            
            // Extract date from file ID (format: YYYYMMDD_HHMMSS)
            const match = file.id.match(/^(\d{4})(\d{2})(\d{2})_/);
            if (!match) return 'Unknown Date';
            
            const [, year, month, day] = match;
            try {
                const date = new Date(`${year}-${month}-${day}`);
                if (isNaN(date.getTime())) return 'Invalid Date';
                return date.toLocaleDateString();
            } catch (error) {
                console.error('Error formatting file date:', error);
                return 'Invalid Date';
            }
        }
    },
    template: `
        <div class="food-cost-analytics-dashboard">
            <!-- Header with summary stats -->
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card shadow-sm">
                        <div class="card-header bg-white d-flex justify-content-between align-items-center">
                            <h5 class="mb-0">Food Cost Analytics Dashboard</h5>
                            <div>
                                <button @click="openFileSelector" class="btn btn-sm btn-outline-primary" title="Select data files">
                                    <i class="fas fa-file-alt"></i> {{ getFileSelectionSummary() }}
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            <h4 class="card-title mb-3">Food Cost Analytics</h4>
                            <div class="row">
                                <div class="col-md-3 col-sm-6 mb-3 mb-md-0">
                                    <div class="p-3 bg-light rounded">
                                        <h5 class="text-primary mb-1">
                                            <i class="fas fa-dollar-sign me-2"></i> Total Usage Value
                                        </h5>
                                        <h3 class="mb-0">{{ formattedTotalValue }}</h3>
                                    </div>
                                </div>
                                <div class="col-md-3 col-sm-6 mb-3 mb-md-0">
                                    <div class="p-3 bg-light rounded">
                                        <h5 class="text-primary mb-1">
                                            <i class="fas fa-cube me-2"></i> Total Usage Quantity
                                        </h5>
                                        <h3 class="mb-0">{{ formattedTotalUsage }}</h3>
                                    </div>
                                </div>
                                <div class="col-md-3 col-sm-6 mb-3 mb-md-0">
                                    <div class="p-3 bg-light rounded">
                                        <h5 class="text-primary mb-1">
                                            <i class="fas fa-list me-2"></i> Records Analyzed
                                        </h5>
                                        <h3 class="mb-0">{{ formattedRecordCount }}</h3>
                                    </div>
                                </div>
                                <div class="col-md-3 col-sm-6">
                                    <div class="p-3 bg-light rounded">
                                        <h5 class="text-primary mb-1">
                                            <i class="fas fa-tags me-2"></i> Categories
                                        </h5>
                                        <h3 class="mb-0">{{ formattedCategories }}</h3>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-3 d-flex justify-content-between align-items-center">
                                <span class="text-muted">
                                    <i class="fas fa-calendar-alt me-2"></i> {{ summary.timeRange }}
                                </span>
                                <div class="btn-group">
                                    <button @click="exportAnalyticsData" class="btn btn-sm btn-outline-primary">
                                        <i class="fas fa-file-csv me-1"></i> Export Data
                                    </button>
                                    <button @click="printAnalytics" class="btn btn-sm btn-outline-secondary">
                                        <i class="fas fa-print me-1"></i> Print
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Analytics Tabs -->
            <div class="analytics-tabs mb-3">
                <div class="d-flex justify-content-between align-items-center">
                    <ul class="nav nav-tabs">
                        <li class="nav-item" v-for="tab in tabs" :key="tab.id">
                            <a class="nav-link" :class="{ active: activeTab === tab.id }" href="#"
                              @click.prevent="switchTab(tab.id)">
                                <i :class="tab.icon + ' me-2'"></i> {{ tab.label }}
                            </a>
                        </li>
                    </ul>
                    <button @click="openFileSelector" class="btn btn-sm btn-primary" title="Select data files">
                        <i class="fas fa-file-alt me-1"></i> Select Files
                    </button>
                </div>
            </div>
            
            <!-- Loading spinner -->
            <div v-if="loading" class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Loading food cost analytics data...</p>
            </div>
            
            <!-- Error message -->
            <div v-if="error" class="alert alert-danger">
                {{ error }}
            </div>
            
            <!-- Dynamic tab content -->
            <div v-if="!loading && !error && processedData" class="tab-content">
                <!-- Trends Tab -->
                <div v-show="activeTab === 'trends'" class="tab-pane fade show active">
                    <trends-analytics :processed-data="processedData"></trends-analytics>
                </div>
                
                <!-- Insights Tab -->
                <div v-show="activeTab === 'insights'" class="tab-pane fade show active">
                    <insights-analytics :processed-data="processedData"></insights-analytics>
                </div>
                
                <!-- Forecast Tab -->
                <div v-show="activeTab === 'forecast'" class="tab-pane fade show active">
                    <forecast-analytics :processed-data="processedData" :date-range="dateRange"></forecast-analytics>
                </div>
            </div>
            
            <!-- No data message -->
            <div v-if="!loading && !error && (!processedData || !processedData.rawData || processedData.rawData.length === 0)" class="card">
                <div class="card-body text-center py-5">
                    <i class="fas fa-chart-bar fa-3x text-muted mb-3"></i>
                    <h4>No Data Available</h4>
                    <p class="text-muted">
                        There is no food cost data available for the selected date range.<br>
                        Try selecting a different date range or uploading new stock usage data.
                    </p>
                </div>
            </div>
            
            <!-- File Selection Modal -->
            <div v-if="showFileSelector" class="modal-backdrop fade show" @click="cancelFileSelection"></div>
            <div v-if="showFileSelector" class="modal d-block" tabindex="-1" role="dialog" style="z-index: 1050; overflow-y: auto; padding-right: 15px;">
                <div class="modal-dialog modal-lg" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Select Data Files</h5>
                            <button type="button" class="btn-close" @click="cancelFileSelection"></button>
                        </div>
                        <div class="modal-body">
                            <!-- Search and filters -->
                            <div class="row mb-3">
                                <div class="col-md-6">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <span class="input-group-text"><i class="fas fa-search"></i></span>
                                        </div>
                                        <input type="text" class="form-control" v-model="searchTerm" placeholder="Search files...">
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <select class="form-control" v-model="filterStore">
                                        <option value="">All Stores</option>
                                        <option v-for="store in getAvailableStores()" :key="store" :value="store">{{ store }}</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <button @click="resetFilters" class="btn btn-sm btn-outline-secondary w-100" title="Reset Filters">
                                        <i class="fas fa-undo"></i> Reset
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Loading indicator for files -->
                            <div v-if="loadingFiles" class="text-center my-4">
                                <div class="spinner-border spinner-border-sm text-primary" role="status">
                                    <span class="sr-only">Loading files...</span>
                                </div>
                                <p class="mb-0 mt-2">Loading available data files...</p>
                            </div>
                            
                            <!-- File error -->
                            <div v-if="fileError" class="alert alert-danger py-2" role="alert">
                                <i class="fas fa-exclamation-circle mr-2"></i> {{ fileError }}
                            </div>
                            
                            <!-- File list -->
                            <div v-if="!loadingFiles && !fileError" class="table-responsive">
                                <table class="table table-hover table-sm">
                                    <thead>
                                        <tr>
                                            <th width="40px">
                                                <div class="form-check" style="z-index:2000;">
                                                    <input type="checkbox" 
                                                           class="form-check-input" 
                                                           id="selectAll"
                                                           :checked="getFilteredFiles().length > 0 && getFilteredFiles().every(file => selectedFileIds.includes(file.id))"
                                                           @click.stop="toggleSelectAll($event)">
                                                    <label class="form-check-label" for="selectAll"></label>
                                                </div>
                                            </th>
                                            <th @click="sortBy = 'displayName'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'">
                                                File
                                                <i v-if="sortBy === 'displayName'" 
                                                   :class="['fas', sortOrder === 'asc' ? 'fa-sort-alpha-down' : 'fa-sort-alpha-up']"></i>
                                            </th>
                                            <th @click="sortBy = 'timestamp'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'">
                                                Date
                                                <i v-if="sortBy === 'timestamp'" 
                                                   :class="['fas', sortOrder === 'asc' ? 'fa-sort-numeric-down' : 'fa-sort-numeric-up']"></i>
                                            </th>
                                            <th @click="sortBy = 'storeName'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'">
                                                Store
                                                <i v-if="sortBy === 'storeName'" 
                                                   :class="['fas', sortOrder === 'asc' ? 'fa-sort-alpha-down' : 'fa-sort-alpha-up']"></i>
                                            </th>
                                            <th @click="sortBy = 'itemCount'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'">
                                                Items
                                                <i v-if="sortBy === 'itemCount'" 
                                                   :class="['fas', sortOrder === 'asc' ? 'fa-sort-numeric-down' : 'fa-sort-numeric-up']"></i>
                                            </th>
                                            <th @click="sortBy = 'totalValue'; sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'">
                                                Value
                                                <i v-if="sortBy === 'totalValue'" 
                                                   :class="['fas', sortOrder === 'asc' ? 'fa-sort-numeric-down' : 'fa-sort-numeric-up']"></i>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="file in getFilteredFiles()" :key="file.id" @click="toggleFileSelection(file.id, $event)" style="cursor: pointer" :class="{'table-primary': selectedFileIds.includes(file.id)}">
                                            <td @click.stop="toggleFileSelection(file.id, $event)">
                                                <div class="form-check" style="z-index:2000;">
                                                    <input type="checkbox" 
                                                           :id="'file-' + file.id" 
                                                           class="form-check-input" 
                                                           :checked="selectedFileIds.includes(file.id)"
                                                           @click.stop="toggleFileSelection(file.id, $event)">
                                                    <label class="form-check-label" :for="'file-' + file.id"></label>
                                                </div>
                                            </td>
                                            <td class="text-nowrap">{{ file.displayName }}</td>
                                            <td class="text-nowrap">
                                                {{ formatFileDate(file) }}
                                            </td>
                                            <td>{{ file.storeName || 'Unknown' }}</td>
                                            <td>{{ file.itemCount }}</td>
                                            <td>{{ utils.formatCurrency(file.totalValue) }}</td>
                                        </tr>
                                        <tr v-if="getFilteredFiles().length === 0">
                                            <td colspan="6" class="text-center py-3">
                                                <i class="fas fa-info-circle mr-1"></i> No files match your search criteria
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            
                            <!-- Selection summary -->
                            <div class="d-flex justify-content-between align-items-center mt-3">
                                <div>
                                    <span v-if="selectedFileIds.length > 0" class="badge bg-primary">
                                        {{ selectedFileIds.length }} files selected
                                    </span>
                                    <span v-else class="text-muted">No files selected (will use date range only)</span>
                                </div>
                                <div>
                                    <button class="btn btn-sm btn-outline-secondary" @click="selectedFileIds = []">
                                        Clear Selection
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" @click="cancelFileSelection">Cancel</button>
                            <button type="button" class="btn btn-primary" @click="applyFileSelection">
                                Apply Selection
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `
};

// Register with namespace - with proper context handling
window.Analytics.FoodCostAnalytics.loadData = async function(dateRange) {
    // This will be called by the main Analytics module
    if (window.Analytics.FoodCostAnalytics._appInstance) {
        // If we have a Vue app instance, use it directly
        console.log('Using mounted instance for loadData');
        return await window.Analytics.FoodCostAnalytics._appInstance.loadData(dateRange);
    } else {
        console.log('No mounted instance available, using direct function call');
        // Create a standalone context with the required methods to avoid 'this' binding issues
        const standaloneContext = {
            dateRange: dateRange,
            loading: false,
            error: null,
            processedData: null,
            updateSummary: function(summary) {
                console.log('Using standalone updateSummary with data:', summary);
                // Store summary in the global namespace
                if (!window.Analytics.FoodCostAnalytics.summary) {
                    window.Analytics.FoodCostAnalytics.summary = {};
                }
                window.Analytics.FoodCostAnalytics.summary = summary;
            },
            mounted() {
                // Load data when component is mounted
                this.loadData();

                // Load available files
                this.loadAvailableFiles();

                // Initialize empty file selection
                this.selectedFileIds = [];

                // Register with namespace if needed
                window.Analytics.FoodCostAnalytics.Dashboard = this;
            },
        };

        // Call the method with our standalone context
        return await FoodCostAnalyticsDashboard.methods.loadData.call(standaloneContext, dateRange);
    }
};

// Add the missing initialize method
window.Analytics.FoodCostAnalytics.initialize = async function(container) {
    console.log('Initializing Food Cost Analytics component in container:', container);
    
    if (!container) {
        console.error('No container provided for Food Cost Analytics initialization');
        return null;
    }
    
    // Create a container for the Vue app
    const appContainer = document.createElement('div');
    appContainer.id = 'food-cost-analytics-app';
    container.appendChild(appContainer);
    
    // Mount the Vue application
    const app = Vue.createApp(FoodCostAnalyticsDashboard, {
        dateRange: {
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
        }
    }).mount('#food-cost-analytics-app');
    
    // Store the app instance for potential cleanup
    window.Analytics.FoodCostAnalytics._appInstance = app;
    
    return app;
};

// Export the component
export { FoodCostAnalyticsDashboard };
