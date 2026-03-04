# Food Cost Module - Component Event Flow

This document outlines the event communication flow between components in the refactored architecture.

## Main Component -> Child Components (Props)

The main component will provide data to child components through props:

### HeaderMappingModal Props
```
- showModal: Boolean - Controls modal visibility
- parsedHeaders: Array - CSV headers detected from file
- headerMapping: Object - Current header mapping state
- isHeaderMappingComplete: Boolean - Whether all required fields are mapped
```

### HistoricalDataModal Props
```
- showModal: Boolean - Controls modal visibility
- historicalRecords: Array - List of available historical records
- isLoadingHistoricalData: Boolean - Loading state
```

### DeleteConfirmationModal Props
```
- showModal: Boolean - Controls modal visibility
- historicalRecords: Array - List of all historical records
- selectedRecords: Array - Currently selected records for deletion
- isProcessing: Boolean - Whether deletion is in progress
```

### ItemCalculationDetailsModal Props
```
- showModal: Boolean - Controls modal visibility
- item: Object - The stock item being viewed
- calculationDetails: Object - Details about the calculation breakdown
- stockPeriodDays: Number - Days in current stock period
- daysToNextDelivery: Number - Days until next delivery
```

### CategoryFilter Props
```
- showFilter: Boolean - Controls filter popup visibility
- categories: Array - List of all available categories
- selectedCategories: Array - Currently selected categories
```

### CostCenterFilter Props
```
- showFilter: Boolean - Controls filter popup visibility
- costCenters: Array - List of all available cost centers
- selectedCostCenters: Array - Currently selected cost centers
```

### StockDataTable Props
```
- stockData: Array - The filtered stock data to display
- sortKey: String - Current sort field
- sortDirection: String - Current sort direction ('asc' or 'desc')
- lowStockItems: Array - List of items below reorder point
```

### DataSummary Props
```
- totals: Object - Calculated totals from stock data
- foodCostPercentage: Number - Calculated food cost percentage
- salesAmount: Number - User-entered sales amount
- stockPeriodDays: Number - Days in current stock period
```

## Child Components -> Main Component (Events)

Child components will communicate with the parent through events:

### HeaderMappingModal Events
```
- @process-header-mapping - When user clicks "Process Data" button
- @close-modal - When user closes the modal
```

### HistoricalDataModal Events
```
- @load-record - When user selects a record to load (includes recordId parameter)
- @close-modal - When user closes the modal
```

### DeleteConfirmationModal Events
```
- @toggle-selection - When user toggles a record selection (includes recordId parameter)
- @toggle-all-selection - When user toggles selection of all records
- @delete-selected-records - When user confirms deletion of selected records
- @close-modal - When user closes the modal
```

### ItemCalculationDetailsModal Events
```
- @close-modal - When user closes the modal
```

### CategoryFilter Events
```
- @toggle-category - When user toggles category selection (includes category parameter)
- @select-all - When user selects all categories
- @clear-all - When user clears all category selections
- @close - When user closes the filter popup
```

### CostCenterFilter Events
```
- @toggle-cost-center - When user toggles cost center selection (includes costCenter parameter)
- @select-all - When user selects all cost centers
- @clear-all - When user clears all cost center selections
- @close - When user closes the filter popup
```

### StockDataTable Events
```
- @sort - When user clicks a column header to sort (includes field parameter)
- @show-item-details - When user clicks to view item calculation details (includes item parameter)
```

### DataSummary Events
```
- @update-sales-amount - When user updates the sales amount input
```

## Component Event Handling in Main Component

The main component will handle events from child components as follows:

```javascript
// HeaderMappingModal events
handleProcessHeaderMapping() {
    // Call processHeaderMapping method
    // Update data state based on header mapping
    // Close modal if successful
}

// HistoricalDataModal events
handleLoadRecord(recordId) {
    // Call loadHistoricalRecord method with recordId
    // Update data state with loaded record
    // Close modal if successful
}

// DeleteConfirmationModal events
handleToggleSelection(recordId) {
    // Toggle selection in selectedRecordsForDeletion array
}

handleToggleAllSelection() {
    // Toggle selection of all records in selectedRecordsForDeletion
}

handleDeleteSelectedRecords() {
    // Call deleteSelectedHistoricalRecords method
    // Update UI after deletion
    // Close modal if successful
}

// CategoryFilter events
handleToggleCategory(category) {
    // Toggle category selection in categoryFilters array
    // Update filtered data
}

handleSelectAllCategories() {
    // Select all categories in categoryFilters
    // Update filtered data
}

handleClearAllCategories() {
    // Clear all categories in categoryFilters
    // Update filtered data
}

// CostCenterFilter events (similar to CategoryFilter)
...

// StockDataTable events
handleSort(field) {
    // Update sortKey and sortDirection
    // Re-sort filteredData
}

handleShowItemDetails(item) {
    // Set current item details
    // Show item calculation details modal
}

// DataSummary events
handleUpdateSalesAmount(amount) {
    // Update salesAmount
    // Recalculate foodCostPercentage
}
```

## Component Lifecycle Management

The main component will be responsible for mounting and destroying all components:

```javascript
// In mounted()
mounted() {
    // Initialize data state
    // Load store context
    // Set up event listeners
    // Initialize charts
}

// In beforeDestroy()
beforeDestroy() {
    // Clean up event listeners
    // Destroy charts
    // Release resources
}
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Component                           │
│                                                                 │
│  ┌─────────────┐                              ┌──────────────┐  │
│  │  Data State │                              │Event Handlers│  │
│  └──────┬──────┘                              └───────┬──────┘  │
└────────┬──────────────────────────────────────────────┬─────────┘
         │        Props                         Events  ▲
         │                                              │
         ▼                                              │
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │ Header     │ │ Historical │ │ Delete     │ │ Item       │  │
│  │ Mapping    │ │ Data       │ │ Confirm    │ │ Calculation│  │
│  │ Modal      │ │ Modal      │ │ Modal      │ │ Modal      │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│                                                                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │ Category   │ │ Cost Center│ │ Stock Data │ │ Data       │  │
│  │ Filter     │ │ Filter     │ │ Table      │ │ Summary    │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                      Child Components
```
