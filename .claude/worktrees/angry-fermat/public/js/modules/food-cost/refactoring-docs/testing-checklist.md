# Food Cost Module - Refactoring Testing Checklist

This document outlines a comprehensive testing plan to verify functionality during and after refactoring. Updated for Phase 4: Integration and Testing (2025-04-19).

## Core Functionality Test Cases

### CSV Import & Processing

- [ ] **File Upload**
  - Upload a valid CSV file
  - Verify file selection UI works
  - Confirm CSV parsing happens successfully

- [ ] **Header Mapping**
  - Header mapping modal appears after CSV upload
  - Auto-detection correctly identifies column mappings
  - Manual mapping can be adjusted via dropdowns
  - "Process Data" button is disabled until all required fields are mapped
  - "Process Data" button becomes active once all required fields are mapped
  - Cancel button closes modal and resets file input
  - Can upload a new CSV file after closing header mapping modal

- [ ] **Data Processing**
  - Data is correctly processed based on header mapping
  - Stock items appear in table after processing
  - All calculated fields (usage, unit cost, etc.) are correct
  - Charts update with new data

### Data Management

- [ ] **Store Context**
  - Store name can be entered and persists
  - Opening stock date can be set and persists
  - Closing stock date can be set and persists
  - Period days calculation is accurate based on date range
  - Days to next delivery can be set and persists
  - Recent store context is loaded when initializing

- [ ] **Save Operations**
  - Save button works and shows loading state
  - Success/error notifications appear appropriately
  - Duplicate record detection works
  - Data is correctly stored in Firebase

- [ ] **Load Operations**
  - Historical data loads correctly
  - Historical data selection UI works
  - Loaded data populates tables and charts
  - Record timestamp and metadata is displayed

- [ ] **Delete Operations**
  - Delete confirmation UI works
  - Single record deletion works
  - Multiple record selection works
  - Select all/deselect all functions work
  - Deleted records are removed from the database
  - UI updates after deletion

### Data Visualization

- [ ] **Charts**
  - Category chart renders correctly with data
  - Top items chart renders correctly with data
  - Charts update when filters change
  - No chart errors when data changes

- [ ] **Summary Statistics**
  - Food cost percentage calculates correctly
  - Sales amount input works
  - Total opening, purchase, closing and usage values are correct
  - All calculated metrics match expected values

### Filtering and Search

- [ ] **Category Filtering**
  - Category filter popup opens and closes
  - Category selection correctly filters data
  - "Select All" button works
  - "Clear" button works
  - Filter count indicator shows correct number

- [ ] **Cost Center Filtering**
  - Cost center filter popup opens and closes
  - Cost center selection correctly filters data
  - "Select All" button works
  - "Clear" button works
  - Filter count indicator shows correct number

- [ ] **Text Search**
  - Search box filters data correctly
  - Searching item code works
  - Searching item name works
  - Search is case-insensitive
  - Empty search shows all items (subject to other filters)

- [ ] **Low Stock Filtering**
  - Low stock filter button toggles correctly
  - Only items below reorder point are shown when active
  - Items below reorder point are highlighted

### Data Manipulation

- [ ] **Sorting**
  - Clicking column headers sorts data
  - Sort direction toggles (ascending/descending)
  - Sort indicator shows in column header
  - Initial sort is by item code

- [ ] **Item Details**
  - Clicking item details button shows calculation details
  - All calculation factors are displayed correctly
  - Modal can be closed
  - Information is accurate and matches backend calculations

### Export Functionality

- [ ] **CSV Export**
  - Export to CSV button works
  - Downloaded file contains correct data
  - All required columns are included
  - Data format is correct

- [ ] **Print Functionality**
  - Print button generates printable view
  - All data is included in print view
  - Print formatting is usable

### Purchase Order Generation

- [ ] **Order Modal**
  - Purchase order button shows modal
  - Order calculations are correct
  - Supplier filtering works
  - Item quantity adjustments work
  - Order summary updates dynamically
  - Modal can be closed

## Cross-cutting Concerns

- [ ] **Error Handling**
  - Error messages are clear and helpful
  - Application doesn't crash on invalid input
  - Network errors are handled gracefully
  - Database operation failures show appropriate messages

- [ ] **Performance**
  - Large datasets load and display without significant lag
  - Filtering operations are responsive
  - Chart rendering is efficient
  - Memory usage is reasonable

- [ ] **Browser Compatibility**
  - Works in Chrome
  - Works in Firefox
  - Works in Edge
  - Works in Safari (if applicable)

- [ ] **Mobile Responsiveness**
  - Layout adapts to different screen sizes
  - Usable on tablet
  - Critical functions accessible on mobile

## Regression Test Cases

- [ ] **All features from v1.9.3 work as expected**
- [ ] **Features added in v1.9.2 (Item Calculation Details) work as expected**
- [ ] **Features added in v1.9.1 (Order Generation) work as expected**
- [ ] **Features added in v1.8.0 (UI Reorganization) work as expected**
- [ ] **No new bugs or regressions introduced during refactoring**

## Testing Approach

1. **Manual Testing**
   - Follow test cases with real data
   - Document any issues found
   - Verify fixed issues don't reappear

2. **Comparison Testing**
   - Run original and refactored versions side by side
   - Verify identical behavior with same inputs
   - Check for visual or functional differences

3. **Edge Case Testing**
   - Test with extremely large datasets
   - Test with empty or minimal data
   - Test with various special characters and formats
   - Test with invalid input

This checklist will be used throughout the refactoring process to ensure all functionality is maintained and verified.
