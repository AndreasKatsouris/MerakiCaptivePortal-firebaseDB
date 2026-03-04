/**
 * Food Cost Module - Test Shims
 * Version: 1.0.0-2025-04-19
 * 
 * This file provides mock implementations of imported modules
 * to support the testing framework without requiring the actual module files.
 */

// Create and export mock components for module imports
export const CategoryFilter = {
    name: 'category-filter',
    template: '<div class="category-filter">Mock Category Filter</div>',
    props: {
        categories: { type: Array, default: () => ['All Categories'] },
        selectedCategories: { type: Array, default: () => [] }
    },
    methods: {
        toggleCategory(category) {
            this.$emit('toggle-category', category);
        }
    }
};

export const CostCenterFilter = {
    name: 'cost-center-filter',
    template: '<div class="cost-center-filter">Mock Cost Center Filter</div>',
    props: {
        costCenters: { type: Array, default: () => ['All Cost Centers'] },
        selectedCostCenters: { type: Array, default: () => [] }
    },
    methods: {
        toggleCostCenter(costCenter) {
            this.$emit('toggle-cost-center', costCenter);
        }
    }
};

export const StockDataTable = {
    name: 'stock-data-table',
    template: '<div class="stock-data-table">Mock Stock Data Table</div>',
    props: {
        stockItems: { type: Array, default: () => [] },
        filteredItems: { type: Array, default: () => [] }
    },
    methods: {
        updateDisplayedItems() {
            // No-op for testing
        }
    }
};

// Mock services for workflow tests
export const DataService = {
    parseCSVData(csvData) {
        console.log('[MOCK] DataService.parseCSVData called');
        // Simple CSV parsing implementation
        const lines = csvData.split('\n');
        const headers = lines[0].split(',');
        const stockItems = [];
        
        // Create a header mapping to handle different formats
        const headerMap = {
            'Item Code': 'itemCode',
            'Description': 'description',
            'Category': 'category',
            'Cost Center': 'costCenter',
            'Opening Qty': 'openingQty',
            'Opening Value': 'openingValue',
            'Purchase Qty': 'purchaseQty',
            'Purchase Value': 'purchaseValue',
            'Closing Qty': 'closingQty',
            'Closing Value': 'closingValue'
        };
        
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',');
            const item = {};
            
            // Map headers to standardized field names
            headers.forEach((header, index) => {
                const standardizedField = headerMap[header.trim()] || header.trim();
                item[standardizedField] = values[index] ? values[index].trim() : '';
            });
            
            // Convert numeric fields
            ['openingQty', 'openingValue', 'purchaseQty', 'purchaseValue', 'closingQty', 'closingValue'].forEach(field => {
                if (item[field]) {
                    item[field] = parseFloat(item[field]);
                } else {
                    item[field] = 0;
                }
            });
            
            // Calculate usage and other derived fields
            // Use the formula from Food Cost Module: opening + purchase - closing
            item.usage = item.openingQty + item.purchaseQty - item.closingQty;
            // Unit cost calculation based on quantity/value ratios
            item.unitCost = item.openingQty > 0 ? item.openingValue / item.openingQty : 0;
            // Usage value = usage * unitCost
            item.usageValue = item.usage * item.unitCost;
            
            stockItems.push(item);
        }
        
        return { stockItems };
    },
    
    exportToCSV(data) {
        console.log('[MOCK] DataService.exportToCSV called');
        const { stockItems } = data;
        
        // Use the expected headers format as per the Food Cost Module spec
        // The test is looking for "Item Code" in the exported CSV
        const headers = [
            'Item Code', 'Description', 'Category', 'Cost Center',
            'Opening Qty', 'Opening Value', 'Purchase Qty', 'Purchase Value', 
            'Closing Qty', 'Closing Value', 'Usage', 'Unit Cost', 'Usage Value'
        ];
        
        // Field mapping from camelCase to display format
        const fieldMap = {
            'Item Code': 'itemCode',
            'Description': 'description',
            'Category': 'category',
            'Cost Center': 'costCenter',
            'Opening Qty': 'openingQty',
            'Opening Value': 'openingValue',
            'Purchase Qty': 'purchaseQty',
            'Purchase Value': 'purchaseValue',
            'Closing Qty': 'closingQty',
            'Closing Value': 'closingValue',
            'Usage': 'usage',
            'Unit Cost': 'unitCost',
            'Usage Value': 'usageValue'
        };
        
        let csvContent = headers.join(',') + '\n';
        stockItems.forEach(item => {
            const row = headers.map(header => {
                const field = fieldMap[header];
                return item[field] !== undefined ? item[field] : '';
            });
            csvContent += row.join(',') + '\n';
        });
        
        return csvContent;
    },
    
    saveData(data) {
        console.log('[MOCK] DataService.saveData called');
        return Promise.resolve({ success: true, key: 'mock-data-key-' + Date.now() });
    },
    
    loadData(key) {
        console.log('[MOCK] DataService.loadData called');
        return Promise.resolve({
            stockItems: [],
            metadata: {
                storeName: 'Test Store',
                openingDate: '2025-04-10',
                closingDate: '2025-04-17',
                daysToNextDelivery: 3
            }
        });
    }
};

// Mock Firebase service
export const FirebaseService = {
    saveStockUsage(stockData) {
        console.log('[MOCK] FirebaseService.saveStockUsage called');
        return Promise.resolve({ success: true, key: 'mock-firebase-key-' + Date.now() });
    },
    
    loadStockUsage(key) {
        console.log('[MOCK] FirebaseService.loadStockUsage called');
        return Promise.resolve({
            items: [],
            metadata: {
                timestamp: Date.now(),
                userId: 'test-user',
                storeName: 'Test Store'
            }
        });
    },
    
    getRecentStockUsage() {
        console.log('[MOCK] FirebaseService.getRecentStockUsage called');
        return Promise.resolve([{
            key: 'mock-key-1',
            timestamp: Date.now() - 86400000,
            storeName: 'Test Store',
            itemCount: 25
        }]);
    }
};

export const DataSummary = {
    name: 'data-summary',
    template: '<div class="data-summary">Mock Data Summary</div>',
    props: {
        totalCostOfUsage: { type: Number, default: 0 },
        salesAmount: { type: Number, default: 0 }
    }
};

export const DeleteConfirmationModal = { 
    name: 'delete-confirmation-modal',
    template: '<div>Mock Delete Confirmation Modal</div>'
};

export const ItemCalculationDetailsModal = { 
    name: 'item-calculation-details',
    template: '<div>Mock Item Calculation Details</div>'
};
