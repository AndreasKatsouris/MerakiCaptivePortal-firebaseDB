# Food Cost Module - Component Integration Test Plan

*Version: 1.9.4-2025-04-19*

This document provides a structured plan for testing the integration between components after Phase 3 refactoring. Each test verifies the interactions between two or more components.

## Component Integration Test Cases

### 1. Filter Components → Table Component Flow

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|----------------|
| INT-F-01 | CategoryFilter updates StockDataTable | 1. Open the application<br>2. Import or load stock data<br>3. Open category filter<br>4. Select/deselect specific categories<br>5. Apply filter | StockDataTable only displays items from selected categories |
| INT-F-02 | CostCenterFilter updates StockDataTable | 1. Open the application<br>2. Import or load stock data<br>3. Open cost center filter<br>4. Select/deselect specific cost centers<br>5. Apply filter | StockDataTable only displays items from selected cost centers |
| INT-F-03 | Combined filters update StockDataTable | 1. Open the application<br>2. Import or load stock data<br>3. Apply category filter<br>4. Apply cost center filter<br>5. Enter search term | StockDataTable correctly reflects the combined filtering criteria |
| INT-F-04 | Clearing filters resets StockDataTable | 1. Apply various filters<br>2. Clear all filters | StockDataTable displays all stock items without filtering |

### 2. Table Component → Modal Component Flow

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|----------------|
| INT-T-01 | StockDataTable invokes ItemCalculationDetailsModal | 1. Load stock data<br>2. Click calculation details button for any item | ItemCalculationDetailsModal opens with correct item details |
| INT-T-02 | ItemCalculationDetailsModal receives proper props | 1. Load stock data<br>2. Click calculation details for specific item | Modal displays all calculation factors and values specific to that item |
| INT-T-03 | Modal closes and returns to table view | 1. Open item calculation details<br>2. Close the modal | Modal closes and returns focus to the StockDataTable without altering data |

### 3. Data Changes → Multi-Component Updates

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|----------------|
| INT-D-01 | CSV import updates all components | 1. Import new CSV file<br>2. Complete header mapping<br>3. Process data | All components (filters, table, and summary) update with new data |
| INT-D-02 | Historical data load updates all components | 1. Click "Load Data"<br>2. Select a historical record<br>3. Load the record | All components update with the historical data |
| INT-D-03 | Date range changes update calculations | 1. Change opening stock date<br>2. Change closing stock date | StockPeriodDays updates correctly<br>DataSummary reflects updated usage calculations |

### 4. DataSummary Component Interactions

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|----------------|
| INT-S-01 | Sales amount changes update cost percentage | 1. Enter new sales amount<br>2. Tab out of field | Cost percentage recalculates based on new sales amount |
| INT-S-02 | Filtered data updates charts | 1. Apply category filter<br>2. View DataSummary charts | Charts only display data based on the current filtered dataset |
| INT-S-03 | Chart interactions work correctly | 1. Hover over chart elements<br>2. Click on legend items | Tooltips display correctly<br>Legend interaction toggles visibility |

### 5. End-to-End Component Chains

| Test ID | Description | Steps | Expected Result |
|---------|-------------|-------|----------------|
| INT-E-01 | Complete user workflow with all components | 1. Import CSV<br>2. Map headers<br>3. Apply filters<br>4. Sort data<br>5. View item details<br>6. Update sales amount | All components respond correctly through the entire workflow |
| INT-E-02 | Component state consistency | 1. Perform various operations<br>2. Switch between features (charts, table)<br>3. Open and close modals | Component state remains consistent across interactions |

## Testing Environment

### Prerequisites
- Firebase configuration properly set up
- Chart.js library loaded
- Sample CSV file with representative data
- All component files properly included and registered

### Known Limitations
- Chart IDs require unique DOM elements (categoryChart and topItemsChart)
- Components must be mounted in the correct order for event propagation
- Some components require specific data formats for proper rendering

## Documentation Updates

After completing the integration tests, update the following documentation:
1. README.md with any discovered constraints or requirements
2. Component JSDocs with any clarified prop requirements
3. Main App Component with any identified initialization requirements

## Sign-off Criteria

The component integration is considered successful when:
1. All test cases pass successfully
2. No console errors occur during normal operations
3. Performance metrics remain within acceptable ranges
4. Visual appearance matches design specifications
5. All extracted components function identically to the original implementation
