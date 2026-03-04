# Food Cost Module - Component Architecture

*Version: 1.9.4-2025-04-19*

This document outlines the component architecture for the refactored Food Cost Module, showing the relationships and data flow between components.

## Component Hierarchy

```
FoodCostApp (Main Component)
├── CategoryFilter
├── CostCenterFilter
├── StockDataTable
├── DataSummary
│   ├── SalesMetrics
│   └── Charts (CategoryChart, TopItemsChart)
├── HeaderMappingModal
├── HistoricalDataModal
├── DeleteConfirmationModal
├── ItemCalculationDetailsModal
└── PurchaseOrderModal
```

## Component Interactions and Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                     FoodCostApp (Main Component)                    │
│                                                                     │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐        │
│  │Firebase│  │  CSV   │  │ Filter │  │  Sort  │  │ Export │        │
│  │Database│  │Parsing │  │ Logic  │  │ Logic  │  │ Logic  │        │
│  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘  └────┬───┘        │
│       │           │           │           │           │            │
└───────┼───────────┼───────────┼───────────┼───────────┼────────────┘
        │           │           │           │           │
        ▼           ▼           ▼           ▼           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                         Component Data Flow                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
        │           │           │           │           │
        ▼           │           │           │           │
┌────────────┐      │           │           │           │
│Historical  │      │           │           │           │
│DataModal   │      │           │           │           │
└─────┬──────┘      ▼           │           │           │
      │      ┌────────────┐     │           │           │
      │      │Header      │     │           │           │
      │      │MappingModal│     │           │           │
      │      └─────┬──────┘     │           │           │
      │            │            ▼           │           ▼
      │            │     ┌────────────┐     │    ┌────────────┐
      │            │     │Category    │     │    │Purchase    │
      │            │     │Filter      │     │    │OrderModal  │
      │            │     └─────┬──────┘     │    └────────────┘
      │            │           │            │           ▲
      │            │           │            │           │
      │            │     ┌────────────┐     │           │
      │            │     │CostCenter  │     │           │
      │            │     │Filter      │     │           │
      │            │     └─────┬──────┘     │           │
      │            │           │            │           │
      │            │           ▼            ▼           │
      │            │     ┌────────────────────────┐     │
      │            │     │                        │     │
      │            └────▶│    StockDataTable     │     │
      │                  │                        │     │
      └─────────────────▶│                        │─────┘
                         └──────────┬─────────────┘
                                    │
                                    ▼
                         ┌────────────────────────┐
                         │                        │
                         │     DataSummary        │
                         │                        │
                         └──────────┬─────────────┘
                                    │
                                    ▼
                         ┌────────────────────────┐
                         │Item Calculation        │
                         │Details Modal           │
                         └────────────────────────┘
```

## Component Interfaces

### 1. CategoryFilter

**Props:**
- `showFilter: Boolean` - Controls visibility
- `categories: Array` - Available categories
- `selectedCategories: Array` - Currently selected categories

**Events:**
- `toggle-category` - When a category is toggled
- `select-all` - When "Select All" is clicked
- `clear-all` - When "Clear All" is clicked
- `close` - When the filter is closed/applied

### 2. CostCenterFilter

**Props:**
- `showFilter: Boolean` - Controls visibility
- `costCenters: Array` - Available cost centers
- `selectedCostCenters: Array` - Currently selected cost centers

**Events:**
- `toggle-cost-center` - When a cost center is toggled
- `select-all` - When "Select All" is clicked
- `clear-all` - When "Clear All" is clicked
- `close` - When the filter is closed/applied

### 3. StockDataTable

**Props:**
- `items: Array` - Data items to display
- `sortField: String` - Current sort field
- `sortDirection: String` - Current sort direction
- `showSummary: Boolean` - Whether to show summary row
- `totalItemCount: Number` - Total items before filtering

**Events:**
- `sort` - When a column header is clicked
- `show-item-details` - When details button is clicked

### 4. DataSummary

**Props:**
- `totalCostOfUsage: Number` - Total cost
- `salesAmount: Number` - Sales amount
- `costPercentage: Number` - Cost percentage
- `stockPeriodDays: Number` - Stock period days
- `stockData: Array` - Data for charts
- `editable: Boolean` - Whether sales amount is editable

**Events:**
- `update:sales-amount` - When sales amount changes

### 5. HeaderMappingModal

**Props:**
- `show: Boolean` - Controls visibility
- `headers: Array` - CSV headers
- `v-model` - Current header mapping

**Events:**
- `cancel` - When mapping is canceled
- `process` - When mapping is confirmed

### 6. HistoricalDataModal

**Props:**
- `show: Boolean` - Controls visibility
- `historicalData: Array` - Available historical records
- `isLoading: Boolean` - Loading state

**Events:**
- `close` - When modal is closed
- `load-record` - When a record is selected
- `delete-record` - When a record is deleted

### 7. DeleteConfirmationModal

**Props:**
- `show: Boolean` - Controls visibility
- `historicalData: Array` - Available historical records
- `isLoading: Boolean` - Loading state
- `selectedRecords: Array` - Selected records
- `selectAll: Boolean` - Select all state
- `isDeleting: Boolean` - Deletion in progress

**Events:**
- `close` - When modal is closed
- `toggle-record` - When a record is toggled
- `toggle-select-all` - When select all is toggled
- `delete-selected` - When deletion is confirmed

### 8. ItemCalculationDetailsModal

**Props:**
- References driven, initialized with `ref="itemCalculationDetails"`

**Methods:**
- `showDetails(item, options)` - Shows details for a specific item

## Global Namespacing

All components maintain the established global namespacing pattern using `window.FoodCost` to ensure compatibility with the existing codebase while enabling modular development.

## Firebase Integration

Components maintain established Firebase integration patterns:
- Database operations are centralized in `database-operations.js`
- Data follows the path structure `stockUsage/{dateTime_key}`
- Error handling and validation are consistent
- Components use the rtdb, ref, get, set, update, push, and remove functions from firebase-config.js

## Data Processing Flow

1. **Data Entry/Import:** CSV upload → HeaderMappingModal → Data Processing
2. **Data Filtering:** CategoryFilter + CostCenterFilter → Filtered Data
3. **Data Display:** Filtered Data → StockDataTable + DataSummary
4. **Data Analysis:** StockDataTable → ItemCalculationDetailsModal
5. **Data Export:** StockData → CSV Export or Purchase Order
