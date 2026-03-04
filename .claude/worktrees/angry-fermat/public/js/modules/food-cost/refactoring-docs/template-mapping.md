# Food Cost Module - Template Section Mapping

This document maps the template sections from the original monolithic component to their future component locations.

## Original Template Structure

The original template in `refactored-app-component.js` can be broken down into these main sections:

### 1. Header Section (Lines ~1765-1856)
```html
<!-- Header Section -->
<div class="card mb-4">
    <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
        <h6 class="m-0 font-weight-bold text-primary">Food Cost Management</h6>
        <!-- ... -->
    </div>
    <div class="card-body">
        <!-- Store Name, Date Inputs, etc. -->
    </div>
</div>
```

### 2. Financial Summary Section (Lines ~1857-1913)
```html
<div class="row mt-3">
    <!-- Sales Amount, Food Cost %, etc. -->
</div>
```

### 3. Charts Section (Lines ~1915-1967)
```html
<!-- Charts Section -->
<div class="row mt-4" v-if="filteredData.length > 0">
    <!-- Category chart, Top items chart -->
</div>
```

### 4. Stock Data Table Section (Lines ~1968-2096)
```html
<div class="card shadow mb-4" v-if="isDataUploaded">
    <!-- Filter controls, Search, Table with stock data -->
</div>
```

### 5. Historical Data Modal (Lines ~2097-2166)
```html
<!-- Historical Data Modal -->
<div class="modal-overlay" v-if="showHistoricalDataModal">
    <!-- Modal dialog with historical records -->
</div>
```

### 6. Delete Historical Data Modal (Lines ~2167-2257)
```html
<div class="modal-overlay" v-if="showDeleteHistoricalDataModal">
    <!-- Delete confirmation UI -->
</div>
```

### 7. Purchase Order Modal (Lines ~2258-2310)
```html
<!-- Purchase Order Modal -->
<purchase-order-modal 
    :show-modal="showPurchaseOrderModal" 
    <!-- ... props -->
></purchase-order-modal>
```

### 8. Filter Popups (Lines ~2311-2347)
```html
<div class="filter-popup-overlay cost-center-popup" v-if="showCostCenterPopup">
    <!-- Cost center filter popup -->
</div>
<!-- Similar structure for Category filter popup -->
```

### 9. Header Mapping Modal (Lines ~2348-2560)
```html
<div class="modal-overlay header-mapping-modal" v-if="showHeaderMapping">
    <!-- CSV header mapping UI -->
</div>
```

## Mapping to New Components

### `components/modals/HeaderMappingModal.js`
- Template sections: 9 (Header Mapping Modal, ~Lines 2348-2560)
- Data needed: parsedHeaders, headerMapping
- Events: process-header-mapping, close-modal

### `components/modals/HistoricalDataModal.js`
- Template sections: 5 (Historical Data Modal, ~Lines 2097-2166)
- Data needed: historicalRecords, isLoadingHistoricalData
- Events: load-record, close-modal

### `components/modals/DeleteConfirmationModal.js`
- Template sections: 6 (Delete Historical Data Modal, ~Lines 2167-2257)
- Data needed: historicalRecords, selectedRecordsForDeletion, isProcessing
- Events: toggle-selection, toggle-all-selection, delete-selected-records, close-modal

### `components/modals/ItemCalculationDetailsModal.js`
- Template sections: Modal for item details (embedded in original template)
- Data needed: item, calculationDetails, stockPeriodDays, daysToNextDelivery
- Events: close-modal

### `components/filters/CategoryFilter.js`
- Template sections: 8 (partial, Category filter popup)
- Data needed: availableCategories, categoryFilters
- Events: toggle-category, select-all, clear-all, close

### `components/filters/CostCenterFilter.js`
- Template sections: 8 (partial, Cost center filter popup)
- Data needed: availableCostCenters, costCenterFilters
- Events: toggle-cost-center, select-all, clear-all, close

### `components/tables/StockDataTable.js`
- Template sections: 4 (Stock Data Table, ~Lines 1968-2096)
- Data needed: filteredData, sortKey, sortDirection, lowStockItems
- Events: sort, show-item-details

### `components/analytics/DataSummary.js`
- Template sections: 2 (Financial Summary, ~Lines 1857-1913)
- Data needed: totals, foodCostPercentage, salesAmount, stockPeriodDays
- Events: None (possibly update-sales-amount)

### Main Component (Simplified version)
- Template sections: 1 (Header), 3 (Charts)
- Responsible for: Component coordination, main data state, event handling, life cycle hooks
