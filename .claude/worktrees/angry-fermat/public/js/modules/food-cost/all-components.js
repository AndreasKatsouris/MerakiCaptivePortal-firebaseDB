/**
 * Food Cost Module - All Components Bundle
 * Version: 1.4.0-2025-04-14-A REFACTORED
 * 
 * This file provides a browser-compatible bundle of all the Food Cost Module components.
 * It avoids using ES6 imports/exports to maximize compatibility.
 */

// Create a global namespace for Food Cost components
window.FoodCost = window.FoodCost || {};

// Initialize Firebase connection - MUST run at the beginning
(function initializeFirebase() {
    // Try to find Firebase from global exports
    if (window.firebase || 
        (window.firebaseExports && window.firebaseExports.rtdb)) {
        console.log('Firebase detected, initializing connection...');
        
        // Store Firebase references in window for access
        window.rtdb = window.rtdb || 
                      (window.firebaseExports && window.firebaseExports.rtdb);
        window.ref = window.ref || 
                     (window.firebaseExports && window.firebaseExports.ref);
        window.get = window.get || 
                     (window.firebaseExports && window.firebaseExports.get);
        window.set = window.set || 
                     (window.firebaseExports && window.firebaseExports.set);
        window.update = window.update || 
                        (window.firebaseExports && window.firebaseExports.update);
        window.push = window.push || 
                      (window.firebaseExports && window.firebaseExports.push);
        window.remove = window.remove || 
                        (window.firebaseExports && window.firebaseExports.remove);
        
        // Check if we've got what we need
        if (window.rtdb && window.ref && window.get && window.set) {
            console.log('Firebase connection initialized successfully');
        } else {
            console.warn('Firebase connection partial - some functions may be limited');
        }
    } else {
        console.warn('Firebase not detected - database functionality will be limited');
    }
})();

// Utility functions
window.FoodCost.Utilities = (function() {
    // Format currency values
    function formatCurrency(value, currency = '', decimals = 2) {
        if (value === undefined || value === null || isNaN(value)) {
            return `${currency}0.00`;
        }
        return `${currency}${Number(value).toFixed(decimals)}`;
    }
    
    // Generate random colors for charts
    function generateColors(count) {
        const colors = [
            '#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b',
            '#6f42c1', '#5a5c69', '#858796', '#f8f9fc', '#d1d3e2'
        ];
        
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push(colors[i % colors.length]);
        }
        
        return result;
    }
    
    // Extract numeric value from a string
    function extractNumericValue(value) {
        if (typeof value === 'number') {
            return value;
        }
        
        if (!value || typeof value !== 'string') {
            return 0;
        }
        
        // Remove currency symbols and commas
        value = value.replace(/[^\d.-]/g, '');
        
        return parseFloat(value) || 0;
    }
    
    // Format a value for display
    function formatValue(value) {
        if (value === undefined || value === null) {
            return '';
        }
        
        if (typeof value === 'number') {
            return value.toFixed(2);
        }
        
        return value.toString();
    }
    
    // Calculate days between two dates
    function calculateDaysBetweenDates(startDate, endDate) {
        if (!startDate || !endDate) {
            return 1; // Default to 1 day if dates not provided
        }
        
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            
            // Calculate difference in milliseconds
            const diffTime = Math.abs(end - start);
            
            // Convert to days and ensure at least 1 day
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
        } catch (error) {
            console.error('Error calculating days between dates:', error);
            return 1; // Default to 1 day in case of error
        }
    }
    
    // Generate timestamp-based key for database entries
    function generateTimestampKey() {
        const now = new Date();
        const date = now.toISOString().split('T')[0].replace(/-/g, '');
        const time = now.toTimeString().split(' ')[0].replace(/:/g, '');
        
        return `${date}_${time}`;
    }
    
    // Return public API
    return {
        formatCurrency,
        generateColors,
        extractNumericValue,
        formatValue,
        calculateDaysBetweenDates,
        generateTimestampKey
    };
})();

// Data Service
window.FoodCost.DataService = (function() {
    // Parse CSV data
    function parseCSVData(csvContent) {
        try {
            // Split into lines and remove empty lines
            const lines = csvContent.split(/\r\n|\n/)
                .filter(line => line.trim().length > 0);
                
            if (lines.length === 0) {
                throw new Error('CSV file is empty');
            }
            
            // Extract headers
            const headers = lines[0].split(',').map(header => header.trim());
            
            // Extract data rows
            const rows = [];
            for (let i = 1; i < lines.length; i++) {
                const cells = lines[i].split(',').map(cell => cell.trim());
                if (cells.length === headers.length) {
                    rows.push(cells);
                }
            }
            
            return { headers, rows };
        } catch (error) {
            console.error('Error parsing CSV data:', error);
            throw new Error('Failed to parse CSV data: ' + error.message);
        }
    }
    
    // Return public API
    return {
        parseCSVData
    };
})();

// CSV Processor
window.FoodCost.CSVProcessor = (function() {
    // Parse CSV data
    function parseCSVData(csvContent) {
        try {
            // Split into lines and remove empty lines
            const lines = csvContent.split(/\r\n|\n/)
                .filter(line => line.trim().length > 0);
                
            if (lines.length === 0) {
                throw new Error('CSV file is empty');
            }
            
            // Extract headers
            const headers = lines[0].split(',').map(header => header.trim());
            
            // Extract data rows
            const rows = [];
            for (let i = 1; i < lines.length; i++) {
                const cells = lines[i].split(',').map(cell => cell.trim());
                if (cells.length === headers.length) {
                    rows.push(cells);
                }
            }
            
            return { headers, rows };
        } catch (error) {
            console.error('Error parsing CSV data:', error);
            throw new Error('Failed to parse CSV data: ' + error.message);
        }
    }
    
    // Return public API
    return {
        parseCSVData
    };
})();

// Firebase Service
window.FoodCost.FirebaseService = (function() {
    // Check if Firebase is properly initialized
    function isFirebaseInitialized() {
        // Check specifically for the required Firebase functions following project standards
        return !!(window.rtdb && 
                window.ref && 
                window.get && 
                window.set && 
                window.update && 
                window.push && 
                window.remove);
    }
    
    // Save stock usage data following project Firebase patterns
    async function saveStockUsageData(data) {
        if (!isFirebaseInitialized()) {
            console.error('Firebase is not initialized');
            return Promise.reject(new Error('Firebase is not initialized'));
        }
        
        try {
            // Format timestamp for key (YYYYMMDD_HHMMSS format) - Following project convention
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
            const key = `${dateStr}_${timeStr}`;
            
            // CORRECT pattern following project standard:
            // await set(ref(rtdb, 'path/to/data'), data);
            await window.set(window.ref(window.rtdb, `stockUsage/${key}`), {
                ...data,
                timestamp: now.toISOString(),
                createdAt: Date.now()
            });
            
            console.log('Stock usage data saved successfully:', key);
            return key;
        } catch (error) {
            console.error('Error saving stock usage data:', error);
            throw error;
        }
    }
    
    // Load historical stock usage data
    async function loadHistoricalData() {
        if (!isFirebaseInitialized()) {
            return Promise.reject(new Error('Firebase is not initialized'));
        }
        
        try {
            // CORRECT pattern following project standard:
            // const snapshot = await get(ref(rtdb, 'path/to/data'));
            const snapshot = await window.get(window.ref(window.rtdb, 'stockUsage'));
            const data = snapshot.val() || {};
            
            // Convert to array format with ID included (following project patterns)
            return Object.entries(data).map(([id, entry]) => ({
                id,
                ...entry,
                formattedDate: new Date(entry.timestamp).toLocaleString()
            }));
        } catch (error) {
            console.error('Error loading historical data:', error);
            throw error;
        }
    }
    
    // Get recent store context for pre-filling forms
    async function getRecentStoreContext() {
        if (!isFirebaseInitialized()) {
            return {
                storeName: 'Default Store',
                daysToNextDelivery: 3,
                safetyStockPercentage: 15,
                criticalItemBuffer: 50
            };
        }
        
        try {
            // CORRECT pattern following project standard:
            // const snapshot = await get(ref(rtdb, 'path'));
            const snapshot = await window.get(window.ref(window.rtdb, 'stockUsage'));
            const data = snapshot.val() || {};
            
            // Convert to array and sort by timestamp (newest first)
            const entries = Object.values(data).sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );
            
            // Return the most recent entry's context if available
            if (entries.length > 0) {
                const recentEntry = entries[0];
                return {
                    storeName: recentEntry.storeName || 'Default Store',
                    daysToNextDelivery: recentEntry.daysToNextDelivery || 3,
                    safetyStockPercentage: recentEntry.safetyStockPercentage || 15,
                    criticalItemBuffer: recentEntry.criticalItemBuffer || 50
                };
            }
            
            // Return default values if no entries exist
            return {
                storeName: 'Default Store',
                daysToNextDelivery: 3,
                safetyStockPercentage: 15,
                criticalItemBuffer: 50
            };
        } catch (error) {
            console.error('Error getting recent store context:', error);
            // Return default values if there's an error
            return {
                storeName: 'Default Store',
                daysToNextDelivery: 3,
                safetyStockPercentage: 15,
                criticalItemBuffer: 50
            };
        }
    }
    
    // Check if a record with the same timestamp already exists
    async function checkForDuplicateRecord(timestamp) {
        if (!isFirebaseInitialized()) {
            return false;
        }
        
        try {
            const formattedTimestamp = timestamp.replace(/[-:T.Z]/g, '').substring(0, 15);
            // CORRECT pattern following project standard:
            // const snapshot = await get(ref(rtdb, 'path'));
            const snapshot = await window.get(window.ref(window.rtdb, `stockUsage/${formattedTimestamp}`));
            return snapshot.exists();
        } catch (error) {
            console.error('Error checking for duplicate record:', error);
            return false;
        }
    }
    
    // Update an existing stock usage record
    async function updateStockUsageRecord(recordId, updates) {
        if (!isFirebaseInitialized()) {
            return Promise.reject(new Error('Firebase is not initialized'));
        }
        
        try {
            // CORRECT pattern following project standard:
            // await update(ref(rtdb, 'path'), updates);
            await window.update(window.ref(window.rtdb, `stockUsage/${recordId}`), {
                ...updates,
                updatedAt: Date.now()
            });
            
            console.log('Stock usage record updated successfully:', recordId);
            return true;
        } catch (error) {
            console.error('Error updating stock usage record:', error);
            throw error;
        }
    }
    
    // Delete a historical record
    async function deleteHistoricalRecord(recordId) {
        if (!isFirebaseInitialized()) {
            return Promise.reject(new Error('Firebase is not initialized'));
        }
        
        try {
            // CORRECT pattern following project standard:
            // await remove(ref(rtdb, 'path'));
            await window.remove(window.ref(window.rtdb, `stockUsage/${recordId}`));
            
            console.log('Historical record deleted successfully:', recordId);
            return true;
        } catch (error) {
            console.error('Error deleting historical record:', error);
            throw error;
        }
    }
    
    // Return public API
    return {
        isFirebaseInitialized,
        saveStockUsageData,
        loadHistoricalData,
        getRecentStoreContext,
        checkForDuplicateRecord,
        updateStockUsageRecord,
        deleteHistoricalRecord
    };
})();

// Food Cost App Component
window.FoodCost.AppComponent = {
    data() {
        return {
            // App state
            isProcessing: false,
            isDataUploaded: false,
            isSaving: false,
            
            // Stock data
            stockData: [],
            filteredStockData: [],
            selectedCategory: 'All Categories',
            selectedCostCenter: 'All Cost Centers',
            categories: ['All Categories'],
            costCenters: ['All Cost Centers'],
            
            // Store information
            storeName: 'Default Store',
            openingStockDate: new Date().toISOString().slice(0, 10),
            closingStockDate: new Date().toISOString().slice(0, 10),
            stockPeriodDays: 0,
            daysToNextDelivery: 3,
            safetyStockPercentage: 15,
            criticalItemBuffer: 50,
            
            // CSV data
            parsedData: [],
            parsedHeaders: [],
            headerMapping: {
                itemCode: -1,
                description: -1,
                category: -1,
                costCenter: -1,
                unit: -1,
                openingQty: -1,
                openingValue: -1,
                purchaseQty: -1,
                purchaseValue: -1,
                closingQty: -1,
                closingValue: -1
            },
            showHeaderMapping: false,
            
            // Sorting
            sortKey: '',
            sortDirection: 'asc',
            
            // Search and filtering
            searchText: '',
            showLowStockOnly: false
        };
    },
    
    computed: {
        // Calculate days in stock period
        stockPeriodDays() {
            if (this.openingStockDate && this.closingStockDate) {
                const opening = new Date(this.openingStockDate);
                const closing = new Date(this.closingStockDate);
                const diffTime = Math.abs(closing - opening);
                
                // Convert to days and ensure at least 1 day
                return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
            }
            return 1;
        },
        
        // Filter stock items by category and cost center
        filteredStockItems() {
            if (!this.stockData.length) return [];
            
            const filteredItems = this.stockData.filter(item => {
                const categoryMatch = this.selectedCategory === 'All Categories' || 
                                      item.category === this.selectedCategory;
                const costCenterMatch = this.selectedCostCenter === 'All Cost Centers' || 
                                       item.costCenter === this.selectedCostCenter;
                const searchMatch = !this.searchText || 
                                    item.itemCode.includes(this.searchText) || 
                                    item.description.includes(this.searchText);
                const lowStockMatch = !this.showLowStockOnly || item.belowReorderPoint;
                
                return categoryMatch && costCenterMatch && searchMatch && lowStockMatch;
            });
            
            // Sort filtered items
            if (this.sortKey) {
                filteredItems.sort((a, b) => {
                    if (this.sortDirection === 'asc') {
                        return a[this.sortKey] < b[this.sortKey] ? -1 : 1;
                    } else {
                        return a[this.sortKey] > b[this.sortKey] ? -1 : 1;
                    }
                });
            }
            
            return filteredItems;
        },
        
        // Check if header mapping is complete
        isHeaderMappingComplete() {
            return this.headerMapping.itemCode >= 0 &&
                this.headerMapping.description >= 0 &&
                this.headerMapping.unit >= 0 &&
                this.headerMapping.openingQty >= 0 &&
                this.headerMapping.openingValue >= 0 &&
                this.headerMapping.purchaseQty >= 0 &&
                this.headerMapping.purchaseValue >= 0 &&
                this.headerMapping.closingQty >= 0 &&
                this.headerMapping.closingValue >= 0;
        }
    },
    
    methods: {
        // Parse CSV file selected by user
        parseCSVFile(file) {
            if (!file) return;
            
            this.isProcessing = true;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const csvContent = e.target.result;
                    const { headers, rows } = window.FoodCost.CSVProcessor.parseCSVData(csvContent);
                    
                    this.parsedHeaders = headers;
                    this.parsedData = rows;
                    
                    console.log('CSV file parsed successfully:', { headers, rowCount: rows.length });
                    
                    // Auto-detect headers and show mapping dialog
                    this.detectHeaderMapping();
                    this.showHeaderMapping = true;
                } catch (error) {
                    console.error('Error reading CSV file:', error);
                    alert(`Error reading CSV file: ${error.message}`);
                } finally {
                    this.isProcessing = false;
                }
            };
            
            reader.onerror = (error) => {
                console.error('FileReader error:', error);
                alert('Failed to read the file. Please try again.');
                this.isProcessing = false;
            };
            
            reader.readAsText(file);
        },
        
        // Auto-detect CSV header mapping
        detectHeaderMapping() {
            const mapping = {
                itemCode: -1,
                description: -1,
                category: -1,
                costCenter: -1,
                unit: -1,
                openingQty: -1,
                openingValue: -1,
                purchaseQty: -1,
                purchaseValue: -1,
                closingQty: -1,
                closingValue: -1
            };
            
            // Try to auto-detect headers with regex patterns
            const headerPatterns = {
                itemCode: /item\s*code|code|item\s*number|sku/i,
                description: /description|item\s*name|product\s*name|name/i,
                category: /category|group|type/i,
                costCenter: /cost\s*center|department|area/i,
                unit: /unit|uom|measure/i,
                openingQty: /opening\s*(stock)?\s*qty|opening\s*(stock)?\s*quantity|start\s*qty|begin\s*qty/i,
                openingValue: /opening\s*(stock)?\s*value|opening\s*(stock)?\s*val|start\s*value|begin\s*value/i,
                purchaseQty: /purchase\s*qty|purchase\s*quantity|ordering\s*qty|received\s*qty|buy\s*qty/i,
                purchaseValue: /purchase\s*value|purchase\s*val|ordering\s*value|received\s*value|buy\s*value/i,
                closingQty: /closing\s*(stock)?\s*qty|closing\s*(stock)?\s*quantity|end\s*qty|final\s*qty/i,
                closingValue: /closing\s*(stock)?\s*value|closing\s*(stock)?\s*val|end\s*value|final\s*value/i
            };
            
            // Try to match headers with patterns
            this.parsedHeaders.forEach((header, index) => {
                for (const [field, pattern] of Object.entries(headerPatterns)) {
                    if (pattern.test(header)) {
                        mapping[field] = index;
                    }
                }
            });
            
            this.headerMapping = mapping;
            console.log('Auto-detected header mapping:', mapping);
        },
        
        // Process header mapping
        processHeaderMapping() {
            if (!this.isHeaderMappingComplete) {
                alert('Please map all required fields before proceeding.');
                this.showHeaderMapping = true;
                return;
            }
            
            this.isProcessing = true;
            
            try {
                console.log('Processing CSV data with mapping:', this.headerMapping);
                
                // Convert parsed data to structured stock data
                this.stockData = [];
                
                if (this.parsedData && this.parsedData.length > 0) {
                    // Process each row based on mapping
                    this.stockData = this.parsedData.map(row => {
                        // Extract values using mapping
                        const itemCode = row[this.headerMapping.itemCode] || '';
                        const description = row[this.headerMapping.description] || '';
                        const category = row[this.headerMapping.category] || 'Uncategorized';
                        const costCenter = row[this.headerMapping.costCenter] || 'General';
                        const unit = row[this.headerMapping.unit] || 'ea';
                        
                        // Extract quantities (numeric values)
                        const openingQty = parseFloat(row[this.headerMapping.openingQty]) || 0;
                        const openingValue = parseFloat(row[this.headerMapping.openingValue]) || 0;
                        const purchaseQty = parseFloat(row[this.headerMapping.purchaseQty]) || 0;
                        const purchaseValue = parseFloat(row[this.headerMapping.purchaseValue]) || 0;
                        const closingQty = parseFloat(row[this.headerMapping.closingQty]) || 0;
                        const closingValue = parseFloat(row[this.headerMapping.closingValue]) || 0;
                        
                        // Calculate unit cost (derive from values and quantities)
                        let unitCost = 0;
                        if (openingQty > 0) {
                            unitCost = openingValue / openingQty;
                        } else if (purchaseQty > 0) {
                            unitCost = purchaseValue / purchaseQty;
                        }
                        
                        // Calculate usage
                        const usage = openingQty + purchaseQty - closingQty;
                        const usageValue = usage * unitCost;
                        
                        // Calculate usage per day
                        const usagePerDay = this.stockPeriodDays > 0 ? usage / this.stockPeriodDays : 0;
                        
                        // Calculate reorder point
                        const reorderPoint = closingQty - (usagePerDay * this.daysToNextDelivery);
                        
                        // Check if below reorder point
                        const belowReorderPoint = closingQty <= reorderPoint;
                        
                        // Return stock item object
                        return {
                            itemCode,
                            description,
                            category,
                            costCenter,
                            unit,
                            unitCost,
                            openingQty,
                            openingValue,
                            purchaseQty,
                            purchaseValue,
                            closingQty, 
                            closingValue,
                            usage,
                            usageValue,
                            usagePerDay,
                            reorderPoint,
                            belowReorderPoint
                        };
                    });
                    
                    // Update categories and cost centers lists
                    this.categories = ['All Categories', ...new Set(this.stockData.map(item => item.category))];
                    this.costCenters = ['All Cost Centers', ...new Set(this.stockData.map(item => item.costCenter))];
                    
                    console.log('Processed stock data:', this.stockData);
                    this.isDataUploaded = true;
                } else {
                    throw new Error('No data to process');
                }
            } catch (error) {
                console.error('Error processing header mapping:', error);
                alert(`Error processing data: ${error.message}`);
            } finally {
                this.isProcessing = false;
            }
        },
        
        // Save stock usage data to Firebase
        async saveStockUsage() {
            if (!this.stockData || this.stockData.length === 0) {
                alert('No stock data to save');
                return;
            }
            
            this.isSaving = true;
            
            try {
                // Prepare data package for saving
                const dataPackage = {
                    storeName: this.storeName,
                    openingDate: this.openingStockDate,
                    closingDate: this.closingStockDate,
                    stockPeriodDays: this.stockPeriodDays,
                    daysToNextDelivery: this.daysToNextDelivery,
                    stockItems: this.stockData,
                    summary: {
                        totalItems: this.stockData.length,
                        totalUsageValue: this.stockData.reduce((sum, item) => sum + item.usageValue, 0),
                        categoriesCount: this.categories.length - 1,
                        costCentersCount: this.costCenters.length - 1
                    }
                };
                
                // Save to Firebase
                const recordId = await window.FoodCost.FirebaseService.saveStockUsageData(dataPackage);
                
                console.log('Stock usage data saved successfully:', recordId);
                alert('Stock usage data saved successfully');
            } catch (error) {
                console.error('Error saving stock usage data:', error);
                alert(`Error saving data: ${error.message}`);
            } finally {
                this.isSaving = false;
            }
        },
        
        // Sort stock items by a specific key
        sortBy(key) {
            if (this.sortKey === key) {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortKey = key;
                this.sortDirection = 'asc';
            }
        },
        
        // Format a number for display
        formatNumber(value) {
            return value.toFixed(2);
        },
        
        // Format currency for display
        formatCurrency(value) {
            return 'R' + value.toFixed(2);
        },
        
        // Export stock data to CSV
        exportToCSV() {
            const csvContent = [
                ['Item Code', 'Description', 'Unit', 'Unit Cost', 'Opening Qty', 'Purchase Qty', 'Closing Qty', 'Usage', 'Usage Value']
            ];
            
            this.stockData.forEach(item => {
                csvContent.push([
                    item.itemCode,
                    item.description,
                    item.unit,
                    item.unitCost,
                    item.openingQty,
                    item.purchaseQty,
                    item.closingQty,
                    item.usage,
                    item.usageValue
                ]);
            });
            
            const csvString = csvContent.map(row => row.join(',')).join('\n');
            const blob = new Blob([csvString], { type: 'text/csv' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'stock_data.csv';
            link.click();
        },
        
        // Print stock report
        printStockReport() {
            const printContent = `
                <h1>Stock Report</h1>
                <table>
                    <tr>
                        <th>Item Code</th>
                        <th>Description</th>
                        <th>Unit</th>
                        <th>Unit Cost</th>
                        <th>Opening Qty</th>
                        <th>Purchase Qty</th>
                        <th>Closing Qty</th>
                        <th>Usage</th>
                        <th>Usage Value</th>
                    </tr>
                    ${this.stockData.map(item => `
                        <tr>
                            <td>${item.itemCode}</td>
                            <td>${item.description}</td>
                            <td>${item.unit}</td>
                            <td>${item.unitCost}</td>
                            <td>${item.openingQty}</td>
                            <td>${item.purchaseQty}</td>
                            <td>${item.closingQty}</td>
                            <td>${item.usage}</td>
                            <td>${item.usageValue}</td>
                        </tr>
                    `).join('')}
                </table>
            `;
            
            const printWindow = window.open('', '', 'height=500,width=800');
            printWindow.document.write(printContent);
            printWindow.print();
            printWindow.close();
        }
    },
    
    // Basic template to show food cost module UI
    template: `
        <div class="food-cost-container">
            <!-- Header Section -->
            <div class="card mb-4">
                <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                    <h6 class="m-0 font-weight-bold text-primary">Food Cost Management</h6>
                </div>
                <div class="card-body">
                    <div class="row">
                        <!-- Store Name -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Store Name:</label>
                                <input type="text" class="form-control" v-model="storeName">
                            </div>
                        </div>
                        
                        <!-- Opening Date -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Opening Stock Date:</label>
                                <input type="date" class="form-control" v-model="openingStockDate">
                            </div>
                        </div>
                        
                        <!-- Closing Date -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Closing Stock Date:</label>
                                <input type="date" class="form-control" v-model="closingStockDate">
                            </div>
                        </div>
                        
                        <!-- Days to Next Delivery -->
                        <div class="col-md-3">
                            <div class="form-group">
                                <label>Days to Next Delivery:</label>
                                <input type="number" class="form-control" v-model="daysToNextDelivery" min="1" max="14">
                            </div>
                        </div>
                    </div>
                    
                    <div class="row mt-3">
                        <div class="col">
                            <button class="btn btn-primary mr-2" @click="$refs.csvFileInput?.click()">
                                <i class="fas fa-file-csv mr-1"></i> Import CSV
                            </button>
                            
                            <button class="btn btn-success mr-2" @click="saveStockUsage" :disabled="!isDataUploaded || isSaving">
                                <i class="fas fa-save mr-1"></i> Save Data
                            </button>
                            
                            <input type="file" ref="csvFileInput" accept=".csv" style="display: none" @change="parseCSVFile($event.target.files[0])">
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Upload/Import Panel -->
            <div class="card mb-4" v-if="!isDataUploaded">
                <div class="card-body">
                    <div class="text-center py-5">
                        <i class="fas fa-file-upload fa-4x mb-3 text-gray-300"></i>
                        <h5>Upload CSV Stock Data</h5>
                        <p>Import your CSV file to begin processing stock data</p>
                        <button class="btn btn-primary" @click="$refs.csvFileInput?.click()">
                            Select CSV File
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Processing Status -->
            <div class="card mb-4" v-if="isProcessing">
                <div class="card-body">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary mb-3" role="status">
                            <span class="sr-only">Processing...</span>
                        </div>
                        <h5>Processing Data</h5>
                        <p>Please wait while we process your CSV data...</p>
                    </div>
                </div>
            </div>
            
            <!-- Stock Data Table -->
            <div class="card mb-4" v-if="isDataUploaded && stockData.length > 0">
                <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                    <h6 class="m-0 font-weight-bold text-primary">Stock Data</h6>
                    <div class="dropdown no-arrow">
                        <button class="btn btn-sm btn-primary dropdown-toggle" type="button" 
                                id="stockOptionsDropdown" data-toggle="dropdown" 
                                aria-haspopup="true" aria-expanded="false">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div class="dropdown-menu dropdown-menu-right shadow" 
                             aria-labelledby="stockOptionsDropdown">
                            <a class="dropdown-item" href="#" @click.prevent="exportToCSV">
                                <i class="fas fa-file-export fa-sm fa-fw mr-2 text-gray-400"></i>
                                Export to CSV
                            </a>
                            <a class="dropdown-item" href="#" @click.prevent="printStockReport">
                                <i class="fas fa-print fa-sm fa-fw mr-2 text-gray-400"></i>
                                Print Report
                            </a>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <!-- Filters -->
                    <div class="row mb-3">
                        <div class="col-md-3">
                            <div class="form-group mb-0">
                                <label class="small mb-1">Category:</label>
                                <select class="form-control form-control-sm" v-model="selectedCategory">
                                    <option v-for="category in categories" :key="category">{{ category }}</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="form-group mb-0">
                                <label class="small mb-1">Cost Center:</label>
                                <select class="form-control form-control-sm" v-model="selectedCostCenter">
                                    <option v-for="costCenter in costCenters" :key="costCenter">{{ costCenter }}</option>
                                </select>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="form-group mb-0">
                                <label class="small mb-1">Search:</label>
                                <input type="text" class="form-control form-control-sm" v-model="searchText" 
                                       placeholder="Search items...">
                            </div>
                        </div>
                        <div class="col-md-3 d-flex align-items-end">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" v-model="showLowStockOnly" 
                                       id="showLowStockOnly">
                                <label class="form-check-label" for="showLowStockOnly">
                                    Show Low Stock Only
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Data Table -->
                    <div class="table-responsive">
                        <table class="table table-bordered table-hover table-sm" id="stockDataTable" width="100%" cellspacing="0">
                            <thead class="thead-light">
                                <tr>
                                    <th @click="sortBy('itemCode')" class="sortable">
                                        Item Code <i v-if="sortKey === 'itemCode'" 
                                               :class="sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
                                    </th>
                                    <th @click="sortBy('description')" class="sortable">
                                        Description <i v-if="sortKey === 'description'" 
                                                   :class="sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
                                    </th>
                                    <th @click="sortBy('unit')" class="sortable">
                                        Unit <i v-if="sortKey === 'unit'" 
                                             :class="sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
                                    </th>
                                    <th @click="sortBy('unitCost')" class="sortable">
                                        Unit Cost <i v-if="sortKey === 'unitCost'" 
                                                 :class="sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
                                    </th>
                                    <th @click="sortBy('openingQty')" class="sortable">
                                        Opening Qty <i v-if="sortKey === 'openingQty'" 
                                                   :class="sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
                                    </th>
                                    <th @click="sortBy('purchaseQty')" class="sortable">
                                        Purchase Qty <i v-if="sortKey === 'purchaseQty'" 
                                                    :class="sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
                                    </th>
                                    <th @click="sortBy('closingQty')" class="sortable">
                                        Closing Qty <i v-if="sortKey === 'closingQty'" 
                                                   :class="sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
                                    </th>
                                    <th @click="sortBy('usage')" class="sortable">
                                        Usage <i v-if="sortKey === 'usage'" 
                                             :class="sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
                                    </th>
                                    <th @click="sortBy('usageValue')" class="sortable">
                                        Usage Value <i v-if="sortKey === 'usageValue'" 
                                                   :class="sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down'"></i>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="item in filteredStockItems" :key="item.itemCode" 
                                    :class="{'table-warning': item.belowReorderPoint}">
                                    <td>{{ item.itemCode }}</td>
                                    <td>{{ item.description }}</td>
                                    <td>{{ item.unit }}</td>
                                    <td>{{ formatCurrency(item.unitCost) }}</td>
                                    <td>{{ formatNumber(item.openingQty) }}</td>
                                    <td>{{ formatNumber(item.purchaseQty) }}</td>
                                    <td>{{ formatNumber(item.closingQty) }}</td>
                                    <td>{{ formatNumber(item.usage) }}</td>
                                    <td>{{ formatCurrency(item.usageValue) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Pagination Controls -->
                    <div class="d-flex justify-content-between align-items-center mt-3">
                        <div>
                            <span class="text-muted">Showing {{ filteredStockItems.length }} of {{ stockData.length }} items</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Header Mapping Modal -->
            <div class="modal-overlay" v-if="showHeaderMapping">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Map CSV Headers</h5>
                        </div>
                        <div class="modal-body">
                            <p>Please map each field to the corresponding CSV column:</p>
                            
                            <div class="form-group row" v-for="(field, key) in headerMapping" :key="key">
                                <label class="col-sm-4 col-form-label">{{ key }}</label>
                                <div class="col-sm-8">
                                    <select class="form-control" v-model="headerMapping[key]">
                                        <option value="-1">Not mapped</option>
                                        <option v-for="(header, index) in parsedHeaders" :value="index">
                                            {{ header }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-primary" 
                                    @click="showHeaderMapping = false; processHeaderMapping()">
                                Apply Mapping
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};

// Main initializer function
window.FoodCostAppInitializer = function(containerId) {
    console.log(`Initializing Food Cost App in container: ${containerId}`);
    
    try {
        // Ensure the container exists
        let container = document.getElementById(containerId);
        if (!container) {
            const errorMessage = `Container with ID ${containerId} not found`;
            console.error(errorMessage);
            
            // Show error message in the DOM (if possible)
            if (document.body) {
                const errorElement = document.createElement('div');
                errorElement.className = 'alert alert-danger';
                errorElement.innerHTML = `<h4>Error Initializing Food Cost Module</h4><p>${errorMessage}</p>`;
                document.body.appendChild(errorElement);
            }
            
            throw new Error(errorMessage);
        }
        
        // Check for Vue availability
        if (!window.Vue) {
            const errorMessage = 'Vue.js is not available - make sure Vue is loaded before initializing the Food Cost Module';
            console.error(errorMessage);
            
            container.innerHTML = `
                <div class="alert alert-danger">
                    <h4>Error Initializing Food Cost Module</h4>
                    <p>${errorMessage}</p>
                </div>
            `;
            
            throw new Error(errorMessage);
        }
        
        // Directly check for Vue.createApp
        if (typeof window.Vue.createApp !== 'function') {
            const errorMessage = 'Vue.js version is incompatible - make sure Vue 3 is being used';
            console.error(errorMessage);
            
            container.innerHTML = `
                <div class="alert alert-danger">
                    <h4>Error Initializing Food Cost Module</h4>
                    <p>${errorMessage}</p>
                </div>
            `;
            
            throw new Error(errorMessage);
        }
        
        // Check for Firebase (but don't fail if it's missing)
        if (!window.rtdb) {
            console.warn('Firebase RTDB not found - some functionality will be limited');
            
            // Show warning in container but keep the same container
            container.innerHTML = `
                <div class="alert alert-warning mb-4">
                    <h4>Limited Functionality Warning</h4>
                    <p>Firebase database connection not available. Some functionality will be limited.</p>
                </div>
                <div id="food-cost-app-mount"></div>
            `;
            
            // Update container reference to the inner div, but don't change containerId
            container = document.getElementById("food-cost-app-mount");
        }
        
        // Create a new Vue app instance
        console.log('Creating Vue app instance...');
        const app = window.Vue.createApp(window.FoodCost.AppComponent);
        
        // Mount the app
        console.log('Mounting Vue app...');
        const mountedApp = app.mount(container);
        console.log('Food Cost App initialized successfully');
        
        // Store a reference to the app
        window.foodCostApp = mountedApp;
        
        return mountedApp;
    } catch (error) {
        console.error('Critical error initializing Food Cost Module:', error);
        
        // Try to show error in container if possible
        try {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = `
                    <div class="alert alert-danger">
                        <h4>Critical Error Initializing Food Cost Module</h4>
                        <p>${error.message}</p>
                        <p>Please check the browser console for more details.</p>
                    </div>
                `;
            }
        } catch (displayError) {
            console.error('Failed to display error message:', displayError);
        }
        
        // Re-throw the error to propagate it up
        throw error;
    }
};

console.log('Food Cost Module bundle loaded successfully');
