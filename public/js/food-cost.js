// Food Cost Module for Laki Sparks Admin Dashboard
// This module provides food cost analysis functionality
// Date: March 2025

'use strict';

// Import Vue from global context since it's already loaded in admin-dashboard.html
const { createApp } = Vue;

// Create Vue app for Food Cost Management
const FoodCostApp = {
    template: `
        <div class="food-cost-container">
            <div class="section-header">
                <h2>{{ title }}</h2>
            </div>
            
            <div class="card shadow mb-4">
                <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                    <h6 class="m-0 font-weight-bold text-primary">Upload Stock Data</h6>
                </div>
                <div class="card-body">
                    <div class="mb-3" v-if="!isDataUploaded || showUploadArea">
                        <div class="custom-file mb-3">
                            <input type="file" class="custom-file-input" id="foodCostFile" accept=".csv" @change="handleFileUpload">
                            <label class="custom-file-label" for="foodCostFile">Choose CSV file</label>
                        </div>
                        <div class="progress mb-3" v-if="isLoading">
                            <div class="progress-bar" role="progressbar" :style="{ width: uploadProgress + '%' }" :aria-valuenow="uploadProgress" aria-valuemin="0" aria-valuemax="100">{{ uploadProgress }}%</div>
                        </div>
                    </div>
                    <div v-if="isDataUploaded">
                        <button class="btn btn-sm btn-outline-primary mb-3" @click="showUploadArea = !showUploadArea">
                            {{ showUploadArea ? 'Hide Upload Area' : 'Show Upload Area' }}
                        </button>
                        
                        <div class="row mb-4">
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label for="foodCostSales">Sales Amount (R)</label>
                                    <input type="number" id="foodCostSales" v-model="salesAmount" class="form-control" 
                                           placeholder="0.00" step="0.01" min="0" @change="recalculateIfDataAvailable">
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Filter by Category</label>
                                    <div class="dropdown">
                                        <button class="btn btn-white dropdown-toggle w-100 border" type="button" 
                                                id="categoryDropdownBtn" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                            {{ filterOptions.selectedCategories.length > 0 ? filterOptions.selectedCategories.length + ' selected' : 'Select categories' }}
                                        </button>
                                        <ul class="dropdown-menu w-100 p-2" aria-labelledby="categoryDropdownBtn" style="position: absolute; z-index: 1050; max-height: 300px; overflow-y: auto;">
                                            <li class="px-2">
                                                <div class="filter-controls mb-2">
                                                    <button type="button" class="btn btn-sm btn-outline-primary me-2" 
                                                            @click.stop="selectAllCategories(true)">
                                                        Select All
                                                    </button>
                                                    <button type="button" class="btn btn-sm btn-outline-secondary" 
                                                            @click.stop="filterOptions.selectedCategories = []">
                                                        Clear All
                                                    </button>
                                                </div>
                                            </li>
                                            <li><hr class="dropdown-divider"></li>
                                            <li class="px-2">
                                                <div style="max-height: 200px; overflow-y: auto;">
                                                    <div v-for="category in categories.filter(c => c !== 'all')" :key="category" class="form-check">
                                                        <input type="checkbox" 
                                                               class="form-check-input" 
                                                               :id="'category-' + category"
                                                               :value="category"
                                                               v-model="filterOptions.selectedCategories"
                                                               @change.stop="applyFilters">
                                                        <label class="form-check-label" :for="'category-' + category">{{ category }}</label>
                                                    </div>
                                                </div>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Filter by Cost Center</label>
                                    <div class="dropdown">
                                        <button class="btn btn-white dropdown-toggle w-100 border" type="button" 
                                                id="costCenterDropdownBtn" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                                            {{ filterOptions.selectedCostCenters.length > 0 ? filterOptions.selectedCostCenters.length + ' selected' : 'Select cost centers' }}
                                        </button>
                                        <ul class="dropdown-menu w-100 p-2" aria-labelledby="costCenterDropdownBtn" style="position: absolute; z-index: 1050; max-height: 300px; overflow-y: auto;">
                                            <li class="px-2">
                                                <div class="filter-controls mb-2">
                                                    <button type="button" class="btn btn-sm btn-outline-primary me-2" 
                                                            @click.stop="selectAllCostCenters(true)">
                                                        Select All
                                                    </button>
                                                    <button type="button" class="btn btn-sm btn-outline-secondary" 
                                                            @click.stop="filterOptions.selectedCostCenters = []">
                                                        Clear All
                                                    </button>
                                                </div>
                                            </li>
                                            <li><hr class="dropdown-divider"></li>
                                            <li class="px-2">
                                                <div style="max-height: 200px; overflow-y: auto;">
                                                    <div v-for="costCenter in costCenters.filter(c => c !== 'all')" :key="costCenter" class="form-check">
                                                        <input type="checkbox" 
                                                               class="form-check-input" 
                                                               :id="'costCenter-' + costCenter"
                                                               :value="costCenter"
                                                               v-model="filterOptions.selectedCostCenters"
                                                               @change.stop="applyFilters">
                                                        <label class="form-check-label" :for="'costCenter-' + costCenter">{{ costCenter }}</label>
                                                    </div>
                                                </div>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Analysis Summary Cards -->
            <div class="row mb-4">
                <div class="col-xl-3 col-md-6 mb-4">
                    <div class="card border-left-primary shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="text-xs font-weight-bold text-primary text-uppercase mb-1">Opening Stock</div>
                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="openingStockValue">{{ formatCurrency(summaryData.totalOpeningStock) }}</div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-calendar-day fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-3 col-md-6 mb-4">
                    <div class="card border-left-success shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="text-xs font-weight-bold text-success text-uppercase mb-1">Purchases</div>
                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="purchasesValue">{{ formatCurrency(summaryData.totalPurchases) }}</div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-shopping-cart fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-3 col-md-6 mb-4">
                    <div class="card border-left-info shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="text-xs font-weight-bold text-info text-uppercase mb-1">Closing Stock</div>
                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="closingStockValue">{{ formatCurrency(summaryData.totalClosingStock) }}</div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-clipboard-check fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-3 col-md-6 mb-4">
                    <div class="card border-left-warning shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="text-xs font-weight-bold text-warning text-uppercase mb-1">Food Cost %</div>
                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="foodCostPercentage">{{ summaryData.foodCostPercentage.toFixed(2) }}%</div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-percentage fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-6">
                    <div class="card shadow mb-4">
                        <div class="card-header py-3">
                            <h5 class="m-0 font-weight-bold text-primary">Category-wise Usage Distribution</h5>
                        </div>
                        <div class="card-body">
                            <canvas ref="categoryChart"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card shadow mb-4">
                        <div class="card-header py-3">
                            <h5 class="m-0 font-weight-bold text-primary">Top 10 Cost Items</h5>
                        </div>
                        <div class="card-body">
                            <canvas ref="topItemsChart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card shadow mb-4">
                <div class="card-header py-3">
                    <h5 class="m-0 font-weight-bold text-primary">Stock Usage Data</h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-bordered table-striped">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th>Category</th>
                                    <th>Cost Center</th>
                                    <th>Unit</th>
                                    <th>Opening Qty</th>
                                    <th>Opening Value</th>
                                    <th>Purchases Qty</th>
                                    <th>Purchases Value</th>
                                    <th>Closing Qty</th>
                                    <th>Closing Value</th>
                                    <th>Usage Qty</th>
                                    <th>Usage Value</th>
                                    <th>Cost %</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="item in filteredStockData" :key="item.productCode">
                                    <td>{{ item.name }}</td>
                                    <td>{{ item.category }}</td>
                                    <td>{{ item.costCenter }}</td>
                                    <td>{{ item.unit }}</td>
                                    <td>{{ item.openingQty.toFixed(2) }}</td>
                                    <td>{{ formatCurrency(item.openingValue) }}</td>
                                    <td>{{ item.purchasesQty.toFixed(2) }}</td>
                                    <td>{{ formatCurrency(item.purchasesValue) }}</td>
                                    <td>{{ item.closingQty.toFixed(2) }}</td>
                                    <td>{{ formatCurrency(item.closingValue) }}</td>
                                    <td>{{ item.usageQty.toFixed(2) }}</td>
                                    <td>{{ formatCurrency(item.usageValue) }}</td>
                                    <td>{{ calculateItemCostPercentage(item).toFixed(2) }}%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `,
    data() {
        return {
            title: 'Food Cost Analysis',
            isLoading: false,
            showUploadArea: true,
            isDataUploaded: false,
            uploadProgress: 0,
            salesAmount: 0,
            stockData: [],
            stores: [],
            startDate: '',
            endDate: '',
            summaryData: {
                totalOpeningStock: 0,
                totalPurchases: 0,
                totalClosingStock: 0,
                totalUsage: 0,
                foodCostPercentage: 0
            },
            categories: ['all'],
            costCenters: ['all'],
            filterOptions: {
                selectedCategories: [],
                selectedCostCenters: [],
                searchTerm: ''
            },
            categoryChart: null,
            topItemsChart: null
        };
    },
    mounted() {
        console.log('Food Cost Module mounted');
        
        // Initialize with empty data
        this.salesAmount = 0;
        this.stockData = [];
        this.summaryData = {
            totalOpeningStock: 0,
            totalPurchases: 0, 
            totalClosingStock: 0,
            totalUsage: 0,
            foodCostPercentage: 0
        };
        
        // Update UI elements with initial values
        this.updateUI();
    },
    computed: {
        /**
         * Get filtered data based on current filter settings
         * @returns {Array} - Filtered data array
         */
        filteredStockData() {
            if (!this.stockData.length) return [];
            
            let result = [...this.stockData];
            
            // Filter by categories if any selected
            if (this.filterOptions.selectedCategories.length > 0) {
                result = result.filter(item => this.filterOptions.selectedCategories.includes(item.category));
            }
            
            // Filter by cost centers if any selected
            if (this.filterOptions.selectedCostCenters.length > 0) {
                result = result.filter(item => this.filterOptions.selectedCostCenters.includes(item.costCenter));
            }
            
            // Filter by search term if any
            if (this.filterOptions.searchTerm) {
                const searchLower = this.filterOptions.searchTerm.toLowerCase();
                result = result.filter(item => 
                    item.name.toLowerCase().includes(searchLower) || 
                    item.category.toLowerCase().includes(searchLower) ||
                    item.costCenter.toLowerCase().includes(searchLower)
                );
            }
            
            return result;
        }
    },
    methods: {
        /**
         * Format currency value
         * @param {number} value - Value to format
         * @returns {string} - Formatted currency string
         */
        formatCurrency(value) {
            return 'R' + value.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
        },
        
        /**
         * Generate random colors for chart segments
         * @param {number} count - Number of colors needed
         * @returns {Array} - Array of color strings
         */
        generateColors(count) {
            const colors = [];
            for (let i = 0; i < count; i++) {
                // Generate pastel colors using HSL
                const hue = i * (360 / count);
                colors.push(`hsl(${hue}, 70%, 65%)`);
            }
            return colors;
        },
        
        /**
         * Handle file upload for CSV processing
         * @param {Event} event - Upload event
         */
        handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            // Update label with filename
            const label = document.querySelector('label[for="foodCostFile"]');
            if (label) {
                label.textContent = file.name;
            }
            
            this.isLoading = true;
            this.uploadProgress = 0;
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    // Parse CSV data
                    const csvData = e.target.result;
                    const parsedData = this.parseCSV(csvData);
                    
                    if (parsedData.length === 0) {
                        alert('No data found in the CSV file or invalid format.');
                        this.isLoading = false;
                        return;
                    }
                    
                    // Process into stock data
                    this.processStockData(parsedData);
                    this.isDataUploaded = true;
                    this.showUploadArea = false;
                    
                    // Update UI with the processed data
                    this.updateUI();
                    
                    console.log('CSV data loaded successfully', this.stockData.length, 'items');
                } catch (error) {
                    console.error('Error processing CSV file:', error);
                    alert('Error processing the CSV file. Please check the format and try again.');
                } finally {
                    this.isLoading = false;
                    this.uploadProgress = 100;
                }
            };
            
            reader.onprogress = (e) => {
                if (e.lengthComputable) {
                    this.uploadProgress = Math.round((e.loaded / e.total) * 100);
                }
            };
            
            reader.onerror = () => {
                console.error('Error reading file');
                alert('Error reading the file. Please try again.');
                this.isLoading = false;
            };
            
            reader.readAsText(file);
        },
        
        /**
         * Apply filters and update UI
         */
        applyFilters() {
            console.log('Applying filters...');
            console.log('Selected categories:', this.filterOptions.selectedCategories);
            console.log('Selected cost centers:', this.filterOptions.selectedCostCenters);
            console.log('Search term:', this.filterOptions.searchTerm);
            
            // Filtering happens in the filteredStockData computed property
            // Update the UI to reflect filtered data
            this.calculateSummary();
            this.updateUI();
        },
        
        /**
         * Update charts with current data
         */
        updateCharts() {
            console.log('Updating charts...');
            this.$nextTick(() => {
                // Only proceed with chart updates if the references exist
                if (!this.$refs.categoryChart || !this.$refs.topItemsChart) {
                    console.log('Chart references not available yet');
                    return;
                }
                
                // Make sure we destroy previous chart instances to prevent memory leaks
                if (this.categoryChart) {
                    this.categoryChart.destroy();
                }
                if (this.topItemsChart) {
                    this.topItemsChart.destroy();
                }
                
                // Get data from filtered stock data
                const dataToUse = this.filteredStockData || this.stockData;
                
                // Prepare data for category chart
                const categoryData = this.prepareCategoryData(dataToUse);
                
                // Create new category chart
                const categoryCtx = this.$refs.categoryChart.getContext('2d');
                this.categoryChart = new Chart(categoryCtx, {
                    type: 'pie',
                    data: {
                        labels: categoryData.labels,
                        datasets: [{
                            data: categoryData.values,
                            backgroundColor: this.generateColors(categoryData.labels.length)
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        legend: {
                            position: 'right'
                        },
                        title: {
                            display: true,
                            text: 'Usage by Category'
                        }
                    }
                });
                
                // Prepare data for top items chart
                const topItemsData = this.prepareTopItemsData(dataToUse);
                
                // Create new top items chart
                const topItemsCtx = this.$refs.topItemsChart.getContext('2d');
                this.topItemsChart = new Chart(topItemsCtx, {
                    type: 'bar',
                    data: {
                        labels: topItemsData.labels,
                        datasets: [{
                            label: 'Usage Value',
                            data: topItemsData.values,
                            backgroundColor: this.generateColors(topItemsData.labels.length)
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Top 10 Cost Items'
                        },
                        indexAxis: 'y',
                        scales: {
                            x: {
                                beginAtZero: true,
                                ticks: {
                                    callback: (value) => `R${value.toFixed(2)}`
                                }
                            }
                        }
                    }
                });
            });
        },
        
        /**
         * Prepare data for category chart
         * @param {Array} data - Stock data to prepare
         * @returns {Object} - Object with labels and values arrays
         */
        prepareCategoryData(data) {
            const categoryTotals = {};
            
            data.forEach(item => {
                if (!categoryTotals[item.category]) {
                    categoryTotals[item.category] = 0;
                }
                categoryTotals[item.category] += item.usageValue;
            });
            
            const labels = Object.keys(categoryTotals);
            const values = Object.values(categoryTotals);
            
            return { labels, values };
        },
        
        /**
         * Prepare data for top items chart
         * @param {Array} data - Stock data to prepare
         * @returns {Object} - Object with labels and values arrays
         */
        prepareTopItemsData(data) {
            // Sort by usage value (descending)
            const sortedData = [...data].sort((a, b) => b.usageValue - a.usageValue);
            
            // Take top 10 items
            const topItems = sortedData.slice(0, 10);
            
            const labels = topItems.map(item => item.name);
            const values = topItems.map(item => item.usageValue);
            
            return { labels, values };
        },
        
        /**
         * Calculate cost percentage for a specific item
         * @param {Object} item - Stock item to calculate percentage for
         * @returns {number} - Cost percentage
         */
        calculateItemCostPercentage(item) {
            if (!this.salesAmount || this.salesAmount === 0) {
                return 0;
            }
            return (item.usageValue / this.salesAmount) * 100;
        },
        
        /**
         * Recalculate summary if data is available
         */
        recalculateIfDataAvailable() {
            if (this.isDataUploaded && this.stockData.length > 0) {
                this.calculateSummary();
                this.updateCharts();
            }
        },
        
        /**
         * Parse CSV text into array of objects
         * @param {string} csvText - Raw CSV text
         * @returns {Array} - Array of data objects
         */
        parseCSV(csvText) {
            console.log('Parsing CSV data...');
            
            // Split by lines and filter out empty lines
            const lines = csvText.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) {
                console.error('CSV file does not contain enough data');
                return [];
            }
            
            // Extract headers (first row)
            const headers = lines[0].split(',').map(header => header.trim());
            
            // Map data rows to objects
            const result = [];
            for (let i = 1; i < lines.length; i++) {
                const values = this.parseCSVLine(lines[i]);
                
                if (values.length !== headers.length) {
                    console.warn(`Skipping row ${i + 1}: column count mismatch`);
                    continue;
                }
                
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index];
                });
                
                result.push(row);
            }
            
            console.log(`Successfully parsed ${result.length} rows from CSV`);
            return result;
        },
        
        /**
         * Parse a single CSV line, handling quoted values correctly
         * @param {string} line - Single line of CSV data
         * @returns {Array} - Array of values
         */
        parseCSVLine(line) {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            
            // Add the last value
            result.push(current.trim());
            
            return result;
        },
        
        /**
         * Process the parsed CSV data into stock data
         * @param {Array} parsedData - Parsed CSV data
         */
        processStockData(parsedData) {
            console.log('Processing stock data...', parsedData);
            this.stockData = [];
            this.categories = ['all'];
            this.costCenters = ['all'];
            
            // Extract store, dates, and categories
            if (parsedData.length > 0) {
                const firstRow = parsedData[0];
                if (firstRow.Store) {
                    this.stores = [firstRow.Store];
                }
                if (firstRow.StartDate) {
                    this.startDate = firstRow.StartDate;
                }
                if (firstRow.EndDate) {
                    this.endDate = firstRow.EndDate;
                }
            }
            
            // Process each item
            parsedData.forEach(item => {
                // Create normalized keys map for case-insensitive matching
                const normalizedItem = {};
                Object.keys(item).forEach(key => {
                    normalizedItem[key.toLowerCase()] = item[key];
                });
                
                // Extract values using normalized keys for better flexibility
                const processedItem = {
                    productCode: normalizedItem.productcode || normalizedItem.prod || '',
                    name: normalizedItem.productname || normalizedItem.name || '',
                    category: normalizedItem.category || 'Uncategorized',
                    costCenter: normalizedItem.costcenter || normalizedItem.ccnt || 'Main',
                    unit: normalizedItem.unit || 'each',
                    openingQty: parseFloat(normalizedItem.openingqty || 0),
                    openingValue: this.extractNumericValue(normalizedItem.openingvalue || normalizedItem.opening || 0),
                    purchasesQty: parseFloat(normalizedItem.purchasesqty || 0),
                    purchasesValue: this.extractNumericValue(normalizedItem.purchasesvalue || normalizedItem.purchases || 0),
                    closingQty: parseFloat(normalizedItem.closingqty || 0),
                    closingValue: this.extractNumericValue(normalizedItem.closingvalue || normalizedItem.closing || 0),
                    storeName: normalizedItem.store || ''
                };
                
                // Calculate usage
                processedItem.usageQty = processedItem.openingQty + processedItem.purchasesQty - processedItem.closingQty;
                processedItem.usageValue = processedItem.openingValue + processedItem.purchasesValue - processedItem.closingValue;
                
                // Add to stock data
                this.stockData.push(processedItem);
                
                // Collect unique categories and cost centers
                if (!this.categories.includes(processedItem.category)) {
                    this.categories.push(processedItem.category);
                }
                
                if (!this.costCenters.includes(processedItem.costCenter)) {
                    this.costCenters.push(processedItem.costCenter);
                }
            });
            
            console.log(`Processed ${this.stockData.length} items into stock data:`, this.stockData);
            console.log(`Found categories: ${this.categories.join(', ')}`);
            console.log(`Found cost centers: ${this.costCenters.join(', ')}`);
            
            // Calculate summary data
            this.calculateSummary();
        },
        
        /**
         * Extract numeric value from string or number
         * @param {string|number} value - Value to extract number from
         * @returns {number} - Extracted number
         */
        extractNumericValue(value) {
            if (typeof value === 'number') return value;
            if (typeof value !== 'string') return parseFloat(value) || 0;
            
            // Handle currency strings like "R450.00" or "$ 45,000.00"
            const matches = value.match(/[0-9,]+(\.[0-9]+)?/);
            return matches ? parseFloat(matches[0].replace(',', '')) : 0;
        },
        
        /**
         * Calculate summary metrics based on filtered data
         */
        calculateSummary() {
            console.log('Calculating summary from filtered data...');
            
            // Use filtered data if available, otherwise use all data
            const dataToUse = this.filteredStockData || this.stockData;
            console.log(`Calculating summary from ${dataToUse.length} items`);
            
            // Reset summary values
            this.summaryData = {
                totalOpeningStock: 0,
                totalPurchases: 0,
                totalClosingStock: 0,
                totalUsage: 0,
                foodCostPercentage: 0
            };
            
            // Sum up values from filtered data
            dataToUse.forEach(item => {
                this.summaryData.totalOpeningStock += item.openingValue || 0;
                this.summaryData.totalPurchases += item.purchasesValue || 0;
                this.summaryData.totalClosingStock += item.closingValue || 0;
                this.summaryData.totalUsage += item.usageValue || 0;
            });
            
            // Calculate food cost percentage
            if (this.salesAmount > 0) {
                this.summaryData.foodCostPercentage = (this.summaryData.totalUsage / this.salesAmount) * 100;
            } else {
                // If no sales amount provided, calculate based on usage / (opening + purchases)
                const totalCost = this.summaryData.totalOpeningStock + this.summaryData.totalPurchases;
                if (totalCost > 0) {
                    this.summaryData.foodCostPercentage = (this.summaryData.totalUsage / totalCost) * 100;
                } else {
                    this.summaryData.foodCostPercentage = 0;
                }
            }
            
            console.log('Summary calculated:', this.summaryData);
        },
        
        /**
         * Update UI elements with current data
         */
        updateUI() {
            console.log('Updating UI with summary data:', this.summaryData);
            
            // Format currency values
            const formatCurrency = (value) => {
                return 'R' + value.toFixed(2);
            };
            
            // Update summary cards with the specific IDs
            const openingStockElement = document.getElementById('openingStockValue');
            const purchasesElement = document.getElementById('purchasesValue');
            const closingStockElement = document.getElementById('closingStockValue');
            const foodCostElement = document.getElementById('foodCostPercentage');
            
            if (openingStockElement) openingStockElement.textContent = formatCurrency(this.summaryData.totalOpeningStock);
            if (purchasesElement) purchasesElement.textContent = formatCurrency(this.summaryData.totalPurchases);
            if (closingStockElement) closingStockElement.textContent = formatCurrency(this.summaryData.totalClosingStock);
            if (foodCostElement) foodCostElement.textContent = this.summaryData.foodCostPercentage.toFixed(2) + '%';
            
            // Update charts
            this.$nextTick(() => {
                this.updateCharts();
            });
        },
        
        /**
         * Select all categories
         * @param {boolean} select - Whether to select or deselect all
         */
        selectAllCategories(select) {
            if (select) {
                this.filterOptions.selectedCategories = this.categories.filter(c => c !== 'all');
            } else {
                this.filterOptions.selectedCategories = [];
            }
            this.applyFilters();
        },
        
        /**
         * Select all cost centers
         * @param {boolean} select - Whether to select or deselect all
         */
        selectAllCostCenters(select) {
            if (select) {
                this.filterOptions.selectedCostCenters = this.costCenters.filter(c => c !== 'all');
            } else {
                this.filterOptions.selectedCostCenters = [];
            }
            this.applyFilters();
        }
    }
};

/**
 * Initialize the Food Cost Module
 */
function initializeFoodCostModule() {
    console.log('Initializing Food Cost Module');
    
    // Make sure the content section is visible
    const foodCostContent = document.getElementById('foodCostContent');
    if (!foodCostContent) {
        console.error('Food Cost content element not found');
        return null;
    }
    
    console.log('Food Cost content element found, creating Vue app');
    
    // Ensure the element is visible before mounting Vue
    foodCostContent.style.display = 'block';
    
    // Find the Vue mount target
    const mountTarget = document.getElementById('food-cost-app');
    if (!mountTarget) {
        console.error('Vue app mount target not found');
        return null;
    }
    
    try {
        // Check for any existing Vue app instances
        if (window.foodCostVueApp) {
            console.log('Unmounting previous Food Cost Vue app');
            try {
                // Get the app instance from the Vue component
                const appInstance = window.foodCostVueApp.__vue__;
                if (appInstance && typeof appInstance.$destroy === 'function') {
                    appInstance.$destroy();
                    console.log('Previous Vue app successfully unmounted');
                }
            } catch (unmountError) {
                console.warn('Could not unmount previous Vue app:', unmountError);
                // Continue anyway, as we'll create a new app
            }
            window.foodCostVueApp = null;
        }
        
        // Create and mount the Vue app
        const app = createApp(FoodCostApp);
        console.log('Mounting Vue app to #food-cost-app');
        
        // Clear the mount target before mounting
        mountTarget.innerHTML = '';
        
        const vueApp = app.mount('#food-cost-app');
        
        // Store reference for cleanup
        window.foodCostVueApp = vueApp;
        
        console.log('Food Cost Vue app successfully mounted');
        return vueApp;
    } catch (error) {
        console.error('Error initializing Food Cost Vue app:', error);
        return null;
    }
}

/**
 * Cleanup Food Cost Module when switching to another section
 */
function cleanupFoodCostModule() {
    console.log('Cleaning up Food Cost Module');
    
    // Clean up Vue app if it exists
    if (window.foodCostVueApp) {
        // In Vue 3, we need to manually clean up any resources not automatically handled
        // like event listeners attached outside of Vue's reactivity system
        window.foodCostVueApp = null;
    }
}

// Make functions available in global scope for admin-dashboard.js to access
window.initializeFoodCostModule = initializeFoodCostModule;
window.cleanupFoodCostModule = cleanupFoodCostModule;

// Add custom styles for the food cost module
document.addEventListener('DOMContentLoaded', function() {
    console.log('Food Cost Module initializing styles...');
    
    const customStyle = document.createElement('style');
    customStyle.textContent = `
        .category-filter, .cost-center-filter {
            position: relative;
        }
        .dropdown-menu {
            max-height: 300px;
            overflow-y: auto;
        }
        .checkbox-item {
            padding: 0.25rem 1.5rem;
        }
        .checkbox-item label {
            width: 100%;
            margin-bottom: 0;
            cursor: pointer;
            white-space: nowrap;
        }
        .filter-button-group {
            display: flex;
            padding: 0.5rem 1.5rem;
            border-top: 1px solid #e3e6f0;
        }
        .filter-button-group button {
            flex: 1;
            font-size: 0.8rem;
        }
    `;
    document.head.appendChild(customStyle);
});
