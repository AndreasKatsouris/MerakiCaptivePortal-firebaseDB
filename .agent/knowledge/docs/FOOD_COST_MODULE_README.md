# Food Cost Management Module - Comprehensive Documentation

**Version:** 2.1.2-2025-05-15  
**Author:** Laki Sparks Development Team

## Overview

The Food Cost Management module has been refactored from a monolithic structure to a modular architecture for improved:
- Maintainability
- Testability
- Scalability
- Code organization

This document provides comprehensive documentation of the module structure, functionality, and usage.

## Module Files

### Core HTML Tools
- **`cost-driver.html`** - Cost driver analysis tool that loads and utilizes the food cost module for analyzing and visualizing cost drivers in business operations. This tool provides insights into what factors are driving costs up or down across different categories and time periods.

## Latest Update: Enhanced Order Calculation (v2.1.2)

We've implemented significant improvements to the order calculation system with two key enhancements:

### 1. Terminology Update: "Covering Days"
- Renamed "lead time" to "covering days" throughout the system
- This better reflects the purpose of this parameter: the number of days the new order is intended to cover
- Maintains compatibility with existing configurations through backward compatibility support

### 2. Intelligent Critical Item Identification
- Implemented a sophisticated multi-factor criticality scoring system (0-100)
- Algorithm blends three approaches:
  - **Category-Based:** Automatically flags items in critical categories like Fresh Produce, Protein, Dairy, etc.
  - **Manual Designation:** Preserves existing manual critical item flags
  - **Risk Scoring:** Calculates criticality based on usage volatility (40%), stock level (30%), and supplier reliability (30%)
- Items scoring above threshold (default: 70) are automatically marked as critical
- Full transparency with detailed scoring breakdown for each factor
- Visual indicators maintained (yellow highlighting, warning badge)

## Upcoming Update: Editable Stock Data

We're adding robust functionality to edit stock data directly within the application. This enhancement will allow administrators to correct errors or update stock data without having to re-upload CSV files.

### Implementation Plan

#### Phase 1: Core Editing Functionality (v2.1.0)
- Add an "Edit" toggle button next to the existing "Export CSV" button
- Implement role-based access control (admin/owner only)
- Create editable cell components for the StockDataTable
- Add real-time validation for edited values
- Develop save mechanism that preserves original record ID
- Implement edit metadata tracking (who, when)

#### Phase 2: Advanced Edit Features (v2.1.0)
- Add comprehensive edit history tracking
- Implement version history browser UI
- Add rollback functionality to previous versions
- Create diff visualization to highlight changes
- Implement edit notifications for admins

#### Phase 3: Edit Automation & Analytics (v2.1.0)
- Add batch editing capabilities for multiple items
- Implement edit reason categorization
- Create edit frequency analytics
- Add audit reporting features
- Develop edit suggestion engine based on historical patterns

## Current Major Update: Advanced Purchase Order System (v2.0.0)

The Food Cost Management module will be enhanced with an Advanced Purchase Order system that leverages historical stock usage data to generate more accurate and efficient purchase orders. This implementation will follow a phased approach while maintaining full compatibility with the existing purchase order functionality.

### Implementation Plan

#### Phase 1: Historical Data Service (v2.0.0)
- Create a standalone `historical-usage-service.js` module to query and analyze historical stock usage data
- Implement basic statistical analysis (average usage, standard deviation, volatility)
- Develop efficient Firebase query patterns to retrieve store-specific historical data
- Add caching mechanisms to optimize performance
- Create unit tests for data retrieval and statistical calculations

#### Phase 2: Algorithm Enhancement (v2.0.0)
- Extend the order calculator with an advanced calculation option
- Implement weighted moving averages for usage forecasting
- Add seasonality detection for day-of-week patterns
- Develop dynamic safety stock calculations based on usage volatility
- Create a wrapper function that maintains compatibility with existing code
- Implement comprehensive unit tests with synthetic data scenarios

#### Phase 3: UI Integration (v2.0.0)
- Add a simple toggle in the PO modal for "Basic" vs "Advanced" calculation
- Implement a look-back period selector (7/14/30 days)
- Enhance item details to show historical average vs. current usage
- Add visualization for usage trends on expanded item view
- Maintain all existing UI functionality for seamless user experience

## Module Roadmap

- **v2.0.0** (Completed): Advanced Purchase Order System
- **v2.1.0** (Completed): Editable Stock Data
- **v2.1.2** (Completed): Enhanced Order Calculation with Intelligent Critical Item Identification
- **v2.2.0** (Planned): Enhanced Reporting & Analytics
- **v2.3.0** (Planned): Multi-location Inventory Comparison
- **v2.4.0** (Planned): Supplier Management Integration

#### Phase 4: Advanced Features (v2.1.0+)
- Implement advanced forecasting models (exponential smoothing, ARIMA)
- Add outlier detection and handling
- Develop adaptive safety stock calculations per category
- Create store-specific parameter optimization
- Implement cross-store intelligence sharing (optional)
- Add detailed configuration panel for advanced settings

### Technical Architecture

The Advanced Purchase Order system will follow these architectural principles:

1. **Modularity**: Standalone service with clear interfaces
2. **Compatibility**: Maintain existing functionality with opt-in advanced features
3. **Performance**: Efficient queries and caching to minimize latency
4. **Testability**: Comprehensive test suite for all new components
5. **Transparency**: Clear documentation of algorithms and calculation methods

### Data Flow

1. User opens PO modal and toggles "Advanced" calculation
2. System queries historical data via `historical-usage-service.js`
3. Statistical metrics are calculated for each item
4. Enhanced parameters are passed to the existing order calculation algorithm
5. Results are displayed with additional context about historical trends

### Configuration Parameters

The system will support these configurable parameters:

- **Look-back Period**: How far back to analyze (7/14/30 days, default: 14)
- **Volatility Multiplier**: Weight given to usage volatility in safety stock (default: 1.0)
- **Trend Factor**: How much to adjust for increasing/decreasing trends (default: 0.5)
- **Minimum History Required**: Minimum days of history needed (default: 7)
- **Fallback Behavior**: What to do when insufficient history exists (default: use basic calculation)

### Troubleshooting Guide

If you encounter issues with the Advanced Purchase Order system, use this guide to diagnose and resolve common problems.

#### Testing the Historical Data Service

A test harness is provided to validate the historical data service functionality:

1. Open `/js/modules/food-cost/tests/historical-service-test.html` in your browser
2. Add your store name(s) and item code(s) to test
3. Click "Run All Tests" to validate:
   - Data retrieval from Firebase
   - Statistical calculations
   - Caching performance

#### Common Issues and Solutions

1. **No Historical Data Found**
   - **Symptom**: The advanced PO shows "No historical data" in the calculation details
   - **Possible Causes**:
     - No previous stock usage records for this store
     - Store name mismatch between current context and historical records
     - Firebase permissions issue
   - **Solutions**:
     - Verify store name is consistent across all records
     - Check that at least one stock usage record exists for this store
     - Validate Firebase database access and rules

2. **Historical Data Not Being Used**
   - **Symptom**: Orders look the same in both basic and advanced modes
   - **Possible Causes**:
     - Insufficient historical data points (default minimum: 5)
     - Item codes don't match between current and historical data
   - **Solutions**:
     - Ensure consistent item coding across all records
     - Increase the number of historical records by saving more stock usage data
     - Reduce the minimum required data points in the code if needed

3. **Unexpected Order Quantities**
   - **Symptom**: Advanced calculation suggests unusual quantities
   - **Possible Causes**:
     - Outliers in historical data causing volatility
     - Day-of-week patterns causing seasonal adjustments
   - **Solutions**:
     - Review the historical insights in the item details view
     - Adjust volatility multiplier parameter (default: 1.0)
     - Temporarily switch to basic calculation if needed

4. **Performance Issues**
   - **Symptom**: Advanced PO generation is slow
   - **Possible Causes**:
     - Large number of historical records being processed
     - Inefficient Firebase queries
     - Caching not working properly
   - **Solutions**:
     - Reduce lookback period (7 days instead of 30)
     - Check network performance
     - Clear the service cache and try again

#### Firebase Database Requirements

The historical usage service requires the following Firebase Realtime Database structure:

```
stockUsage/
  {dateTime_key}/
    timestamp: number
    storeName: string
    stockItems: {
      {itemCode}: {
        itemCode: string
        usage: number
        usagePerDay: number
        ...
      }
    }
```

For optimal performance, add the following indexes to your Firebase rules:

```json
{
  "rules": {
    "stockUsage": {
      ".indexOn": ["timestamp", "storeName"]
    }
  }
}
```

## Recent Updates

## Key Purchasing Concepts

### Re-order Point
The re-order point is a critical concept in the purchase order system. It represents the theoretical stock level at the time of your next delivery date. It is calculated as:

`Re-order Point = Current Stock - (Usage/Day × Days to Next Delivery)`

This is NOT the level at which reordering is triggered. Rather, it's used to determine how much to order:

`Order Quantity = Required Stock - Re-order Point`

Where:
- **Required Stock**: The total amount needed for the forecast period, including base usage, safety stock, and critical buffer
- **Re-order Point**: The projected remaining stock at the next delivery date

The Advanced Purchase Order system enhances these calculations by using historical usage patterns to better predict future needs.

### Latest Update (v2.0.7) - 2025-04-24

1. **Enhanced Historical Data Transparency**:
   - Added comprehensive historical data breakdown in the UI
   - Implemented raw data point display for each item with historical records
   - Added weekly usage summary view with toggleable detailed data display
   - Included complete calculation transparency showing each component of the calculation
   - Enhanced historical insights panel with usage breakdown table
   - Improved blended usage rate display (70% current, 30% historical)
   - Added trend adjustment percentage display

2. **Advanced Purchase Order System Improvements**:
   - Fixed base usage calculation to prevent negative values
   - Enhanced trend adjustment with more conservative limits (max 5% up, 2.5% down)
   - Improved required stock formula to use projected usage per day × forecast period
   - Enhanced logging for all calculation steps
   - Fixed type safety throughout the calculation pipeline
   - Added detailed logging in the console for troubleshooting

3. **Original Implementation (v2.0.0-2.0.2)**:
   - Added historical data analysis to purchase order generation
   - Created standalone Historical Usage Service with statistical analysis
   - Implemented weighted averages and trend detection algorithms
   - Added day-of-week pattern detection for seasonal adjustments
   - Enhanced safety stock calculations based on usage volatility
   - Added toggle in PO modal for Basic/Advanced calculation methods
   - Fixed store context integration to properly use store name for historical queries
   - Added key purchasing concepts documentation
   - Optimized data retrieval and caching for better performance

### Previous Update (v1.9.20) - 2025-04-23

1. **Financial Data Calculation Improvements**:
   - Fixed issues with sales information card not updating when entering values
   - Resolved total cost of usage calculation inconsistencies
   - Improved cost percentage calculation with proper numerical handling
   - Added robust data parsing with fallbacks to prevent NaN values
   - Enhanced console logging for easier debugging of financial calculations
   - Fixed reactivity conflicts between data properties and computed properties

2. **Historical Data Loading Enhancements**:
   - Improved historical data loading interface with searchable records list
   - Added date range display showing both opening and closing dates for clarity
   - Fixed item count display to accurately show the number of items in each record
   - Enhanced record selection with improved visual feedback
   - Added data filtering capabilities when browsing historical records

3. **Data Flow and Component Communication**:
   - Improved data flow between parent and child components
   - Fixed data shadowing issues in child components
   - Implemented consistent calculation triggers after data changes
   - Enhanced error handling during data loading operations
   - Added safeguards for missing or inconsistent data during load operations

### Previous Update (v1.9.18) - 2025-04-22

1. **CSV Header Mapping Enhancements**:
   - Fixed CSV header detection and mapping for enhanced reliability
   - Resolved reactivity issues in Vue 3 header mapping implementation
   - Added robust DOM event handling between header mapping components
   - Fixed cost center filter component binding to display available cost centers
   - Enhanced data transformation flow to preserve mapping integrity
   - Implemented detailed debugging and logging for mapping process
   - Added safeguards against reference mutations during data processing

2. **Component Communication Improvements**:
   - Enhanced event communication between parent and child components
   - Added comprehensive error handling in event propagation
   - Fixed component prop naming consistency across the module
   - Implemented safe cloning of data objects to prevent reference issues

3. **Data Processing Reliability**:
   - Added validation for header mapping at multiple pipeline stages
   - Enhanced CSV data transformation with fallback mechanisms
   - Improved diagnostic information for data processing errors
   - Prevented data loss during manual header mapping operations

### Previous Update (v1.9.5) - 2025-04-19

1. **Enhanced Integration Testing Framework**:
   - Implemented comprehensive component communication pipeline tests
   - Created robust Firebase database integration tests with proper clean-up
   - Added performance optimization testing with benchmarks
   - Developed end-to-end workflow testing infrastructure
   - Created unified test runner with detailed reporting dashboard

2. **Performance Optimization Suite**:
   - Added component initialization time metrics (target: <300ms)
   - Implemented large dataset rendering tests (500+ items)
   - Added memory management and leak detection tooling
   - Optimized CSV processing for large datasets
   - Set performance budgets for critical operations

3. **Firebase Integration Enhancements**:
   - Implemented robust store context tracking tests
   - Created mock database environment for isolated testing
   - Added date range and delivery date persistence verification
   - Enhanced duplicate detection with sampling algorithm
   - Implemented test-safe database operations with cleanup

4. **Workflow Testing Automation**:
   - Added CSV import/export cycle testing
   - Implemented stock analytics workflow validation
   - Created multi-store analysis testing framework
   - Automated verification of critical user journeys
   - Enhanced error state testing and recovery

### Previous Update (v1.9.4) - 2025-04-19

1. **Global Component Registry System**:
   - Implemented a robust global component registration system
   - Created `window.FoodCost.components` namespace for consistent access
   - Added component registration functions for each component
   - Ensured compatibility with both module and non-module environments
   - Enhanced component discovery and access for testing frameworks

2. **Comprehensive Component Testing Framework**:
   - Completed component testing for all extracted components
   - Created `ComponentMock` utility for isolated component testing
   - Implemented browser-based test runner with interactive UI
   - Achieved 100% component test coverage (23/23 tests passed)
   - Added detailed test documentation for each component

3. **Integration Testing Framework**:
   - Developed robust integration test infrastructure
   - Created test utilities for mock data generation
   - Implemented comprehensive component interaction testing
   - Added fallback mock components for testing resilience
   - Enhanced test runner with detailed reporting and error tracking

4. **Firebase Integration Validation**:
   - Verified Firebase Realtime Database patterns across components
   - Implemented consistent error handling for database operations
   - Ensured proper data flow between components and database
   - Enhanced data validation before database operations
   - Improved state synchronization with database changes

### Previous Update (v1.9.3) - 2025-04-16

1. **Current Stock Display Fix**:
   - Fixed incorrect current stock values (showing as 0.00) in purchase order display
   - Enhanced stock value display with safer null checking
   - Ensured consistent stock representation across all UI components
   - Improved data passing between components for reliable display

2. **Parameter Persistence Improvement**:
   - Fixed issue where critical parameters (safety stock, days to delivery, etc.) would revert to defaults
   - Implemented local state management to preserve user modifications
   - Enhanced parameter UI with more reliable state tracking
   - Eliminated unnecessary parameter resets during UI interactions
   - Added responsive parameter controls with proper validation

3. **Unit Cost Calculation Enhancement**:
   - Implemented advanced unit cost calculation using average of opening and closing values
   - Added clear tracking of calculation method used (mapped, average, opening-only, etc.)
   - Enhanced fallback mechanisms when calculation data is incomplete
   - Added flagging system for items with missing or problematic unit costs
   - Improved calculation flow with proper logical structure and error handling
   - Added comprehensive logging for easier troubleshooting

### Previous Update (v1.9.2) - 2025-04-16
1. **Unit Cost Calculation Improvements**:
   - Implemented multi-step unit cost calculation with robust validation
   - Added transparent unit cost calculation display in item details modal
   - Set reasonable thresholds for unit cost values with fallback mechanisms
   - Added formulas and calculation methods to enable troubleshooting
   - Enhanced user experience by showing exactly how each unit cost is derived

2. **Reordering Logic Refinement**:
   - Fixed inconsistency between calculation details and purchase order generation
   - Implemented consistent reordering decision logic across all functions
   - Added reorder point information to calculation details display
   - Enhanced defensive coding to prevent calculation errors
   - Added additional checks for edge cases in stock projections

3. **Purchase Order Enhancements**:
   - Modified purchase order generation to respect UI filters
   - Implemented proper function placement following modular architecture
   - Enhanced error handling during order generation
   - Fixed numeric formatting issues for more reliable calculations
   - Added better debugging information for troubleshooting

### Previous Update (v1.9.1) - 2025-04-16

1. **Item Calculation Details Feature**:
   - Added item-level calculation details button to stock data table
   - Implemented detailed calculation breakdown modal for each item
   - Shows theoretical order quantity with component breakdown
   - Uses existing calculation functions from OrderCalculator module
   - Added comprehensive documentation for code maintainability
   - Emphasized DRY principles in implementation

### Previous Update (v1.9.0) - 2025-04-16

1. **Purchase Order Generation Implementation**:
   - Completed fully functional purchase order generation system
   - Added smart reorder calculation with comprehensive formula
   - Added supplier categorization and filtering
   - Implemented interactive order quantity controls
   - Added supplier breakdown and item details in the order UI
   - Implemented CSV export with proper file naming

### Previous Update (v1.8.0) - 2025-04-15

The following improvements were implemented in the previous version:

1. **UI Reorganization & Modern Styling** (v1.8.0):
   - Implemented shadcn/ui-inspired styling for a modern, clean interface
   - Reorganized UI with Data Management controls at the top of the module
   - Moved search, filters, and action buttons above the stock data table
   - Consolidated data action buttons in logical groups for better usability
   - Added consistent styling for buttons, cards, and form controls

2. **Enhanced Data Loading & Management** (v1.8.0):
   - Added a dedicated "Load Data" button for direct access to historical records
   - Implemented a user-friendly data selection dialog with record details
   - Improved CSV header mapping modal display logic and reliability
   - Fixed issues with the data manipulation workflow
   - Optimized loading and saving operations for better performance

3. **Architecture Improvements** (v1.8.0):
   - Added ShadcnUIMixin for modular UI styling without breaking existing patterns
   - Maintained the established modular architecture pattern
   - Implemented proper DOM observation for dynamic style application
   - Fixed modal rendering issues and timing problems
   - Improved error handling for data loading operations

4. **Enhanced UI & Visualization** (v1.7.0):
   - Removed Category and Cost Center columns from the main table for cleaner data presentation
   - Added Purchase Quantity and Unit Cost columns for better inventory tracking
   - Implemented dropdown filter buttons showing count of selected items
   - Added popup filter dialogs with checkbox selection for categories and cost centers
   - Enhanced chart rendering with improved responsiveness and data handling

5. **Functional Improvements** (v1.7.0):
   - Completely redesigned filtering system with multi-select capabilities
   - Enhanced filter UI with "Select All" and "Clear" options for quicker filtering
   - Improved CSV header auto-mapping with smarter detection algorithms
   - Streamlined data upload workflow with optional manual mapping step
   - Added Unit Cost calculation with smart fallback logic

## Module Structure

```
js/modules/food-cost/
├── components/                    # UI Components
│   ├── analytics/
│   │   └── calculation-utils.js   # Calculation utility functions
│   └── purchase-order/
│       └── po-modal.js            # Purchase order modal component
├── mixins/
│   ├── ui-mixin.js                # Reusable UI behavior
│   └── shadcn-ui-mixin.js         # shadcn/ui-inspired styling
├── services/
│   └── data-service.js            # CSV processing and data transformation
├── all-components.js              # Exports all Vue components in one file
├── chart-manager.js               # Chart generation and updates
├── data-processor.js              # Core data processing functions
├── database-operations.js         # Firebase database operations and utilities
├── firebase-helpers.js            # Firebase initialization helpers
├── index.js                       # Main module entry point
├── order-calculator.js            # Purchase order generation
├── refactored-app-component.js    # Main Vue application component
├── shadcn-styles.js              # shadcn/ui style initialization
└── utilities.js                   # General utility functions
```

Additionally, a new CSS file has been added:

```
public/css/
└── shadcn-inspired.css           # shadcn/ui-inspired CSS variables and styles
```

## Core Functions

### 1. CSV Data Loading and Processing

The module provides comprehensive CSV data loading and processing capabilities:

- **Enhanced Automatic Header Detection**: Intelligently maps CSV headers to internal data structure with support for various naming conventions
- **Smart Data Transformation**: Converts raw CSV data into structured stock data with robust calculation methods
- **Improved Header Mapping UI**: Refined interface for manually mapping headers with better visual feedback
- **Advanced Validation**: Ensures data integrity with comprehensive error checking and recovery mechanisms
- **Streamlined Workflow**: Optional header mapping step with automatic processing when headers are recognized

### 2. Firebase Database Integration

The module offers complete Firebase Realtime Database integration for stock usage tracking:

- **Save Stock Usage**: Store stock data with comprehensive metadata and timestamps
- **Load Historical Data**: Retrieve and display past stock usage records
- **Record Management**: View, load, and delete historical records
- **Item History Tracking**: Track specific items across multiple records
- **Statistical Analysis**: Calculate usage patterns and trends over time

### 3. Stock Data Visualization

Comprehensive data visualization tools:

- **Category-based Charts**: Visual breakdown of usage by category with smart coloring
- **Top Items Analysis**: Highlights highest usage items with dynamic calculation
- **Trend Analysis**: Shows usage patterns over time
- **Interactive Filtering**: Advanced filtering with multi-select popups for categories and cost centers
- **Export Options**: Download data in various formats for external analysis
- **Responsive Design**: Charts and tables automatically adjust to container size
- **Performance Optimized**: Debounced chart updates to prevent excessive redraws

### 4. Purchase Order Generation

Comprehensive purchase order functionality with smart ordering logic:

- **Smart Reorder Formula**: Calculates optimal order quantities using advanced formula (explained below)
- **Supplier Management**: Orders organized and filtered by supplier
- **Interactive Order Interface**: Easily adjust quantities with visual feedback
- **Supplier Breakdown**: Summary view of orders by supplier 
- **Category Grouping**: Items grouped by category for easier ordering
- **Critical Item Highlighting**: Visual indicators for critical items
- **Item Detail Expansion**: Detailed view of calculation factors for each item
- **Configurable Parameters**: Adjustable safety stock, lead time, delivery times, etc.
- **Export to CSV**: Generate purchase orders in standardized format with smart naming
- **Order Preview**: Review with calculation explanations before finalizing

#### Reorder Formula

The purchase order system uses an advanced formula to calculate optimal order quantities. The formula takes into account multiple factors:

1. **Base Forecast Usage**:
   ```
   baseUsage = usagePerDay × forecastPeriod
   forecastPeriod = daysToNextDelivery + leadTimeDays
   ```

2. **Safety Stock Calculation**:
   ```
   safetyStock = baseUsage × (safetyStockPercentage / 100)
   forecastWithSafety = baseUsage + safetyStock
   ```

3. **Critical Item Buffer** (if applicable):
   ```
   criticalBuffer = forecastWithSafety × (criticalItemBuffer / 100)
   finalForecast = forecastWithSafety + criticalBuffer
   ```

4. **Order Quantity Calculation**:
   ```
   requiredStock = finalForecast
   orderQuantity = max(0, requiredStock - currentStock)
   ```

5. **Advanced Considerations**:
   - Historical usage volatility analysis for high-variance items
   - Unit cost considerations for high-value items
   - Supplier constraints and minimum order quantities
   - Seasonal adjustments (when applicable)

The order quantities are then rounded appropriately for each item's unit of measure and organized by supplier and category in the final purchase order.

## Integration Instructions

### Technical Implementation

### Component Registry System

The module implements a global component registry system:

```javascript
// Global namespace initialization
window.FoodCost = window.FoodCost || {};
window.FoodCost.components = window.FoodCost.components || {};

// Component registration
function registerComponent(name, component) {
    window.FoodCost.components[name] = component;
    return component;
}

// Example component registration
window.FoodCost.components.CategoryFilter = categoryFilterComponent;
```

This system enables:
- Consistent component access across module and non-module environments
- Easier testing and component isolation
- Enhanced interoperability between components
- More reliable component discovery

### Components

Each component follows a consistent structure with global registration: in a new project:

1. Include the required dependencies:
```html
<!-- Required Libraries -->
<script src="https://cdn.jsdelivr.net/npm/vue@3.2.36/dist/vue.global.js"></script>
{{ ... }}
   - Add popup filter dialogs with checkbox selection for categories and cost centers

4. **Consolidate Duplicate Code**
   - Identify and merge duplicate filter functions
   - Create mixins for common behaviors
   - Implement## Planned Development Phases

### Phase 1: Architecture Planning (Completed)

1. **Current Structure Analysis**
   - Code review and architecture mapping
   - Identification of tightly coupled components
   - Documentation of data flow and dependencies
   - Analysis of performance bottlenecks

2. **Modular Design Creation**
   - Component hierarchy planning
   - State management strategy
   - Data flow patterns
   - Reusable component identification

3. **Task Prioritization**
   - Critical path identification
   - Feature preservation checklist
   - Risk assessment for refactoring
   - MVP definition

### Phase 2: Component Extraction (Completed)

1. **Core Component Development**
   - Data table component
   - Filter components
   - Summary components
   - Modal components

2. **Utility Functions**
   - Calculation utilities
   - Formatting utilities
   - Date handling utilities
   - Firebase integration utilities

3. **State Management Implementation**
   - Component state management
   - Global state management
   - Event-based communication
   - Props management

### Phase 3: Integration (Completed)

1. **Component Assembly**
   - Integration of core components
   - Event handling between components
   - Data flow implementation
   - Prop drilling minimization

2. **Firebase Integration**
   - Data loading implementation
   - Data saving implementation
   - Real-time updates
   - Error handling

3. **Feature Verification**
   - Data loading and processing
   - CSV import/export
   - Data visualization
   - Stock usage tracking

### Phase 4: Testing & Validation (In Progress - 95%)

1. **Component Testing (Completed)**
   - Unit tests for components 
   - Mock data testing 
   - Edge case testing 
   - Interface compliance testing 

2. **Integration Testing (In Progress - 90%)**
   - Component interaction testing 
   - Data flow validation 
   - Event handling verification 
   - State management validation (In Progress)

3. **Performance Testing (Planned)**
   - Compare performance before and after refactoring
   - Identify bottlenecks
   - Optimize critical paths
   - Implement performance monitoring

{{ ... }}
   - Deploy changes

### Expected Outcomes

1. **Improved Maintainability**
   -## Refactoring Approach

### 1. Component Architecture

The refactored module follows a component-based architecture with clear separation of concerns and a global registration system:
   - Easier to understand and modify individual components

2. **Better Performance**
   - Reduced memory usage
   - More efficient rendering
{{ ... }}
   - closeCategoryFilter() appears twice (lines 408-414, 835-841)
   - selectAllCategories() appears three times (416-421, 858-865, 1388-1395)
   - Similar duplication for cost center filter functions

2. **Similar Formatting Functions**
   - Several formatting functions with similar patterns that could ```
public/js/modules/food-cost/
├── component-registry.js             # Global component registration system
├── refactored-app-component.js       # Main application component
├── utils/
│   ├── calculation-utils.js          # Stock calculation utilities
│   ├── csv-utils.js                  # CSV processing utilities
│   ├── date-utils.js                 # Date handling utilities
│   ├── formatting-utils.js           # Data formatting utilities
│   └── firebase-utils.js             # Firebase interaction utilities
├── components/
│   ├── filters/
│   │   ├── CategoryFilter.js         # Category filtering component
│   │   ├── CostCenterFilter.js       # Cost center filtering component
│   │   └── SearchFilter.js           # Search filtering component
│   ├── tables/
│   │   ├── StockDataTable.js         # Main data table component
│   │   └── PurchaseOrderTable.js     # Purchase order table component
│   ├── forms/
│   │   ├── DataInputForm.js          # Data input form component
│   │   └── SettingsForm.js           # Settings form component
│   ├── modals/
│   │   ├── DataLoadModal.js          # Data loading modal component
│   │   ├── DataSaveModal.js          # Data saving modal component
│   │   ├── HeaderMappingModal.js     # CSV header mapping modal component
│   │   └── ItemDetailsModal.js       # Item details modal component
│   ├── analytics/
│   │   ├── DataSummary.js            # Summary statistics component
│   │   └── CategoryChart.js          # Category visualization component
│   └── actions/
│       ├── ImportExportButtons.js    # Import/export action buttons
│       ├── DataActionButtons.js      # Data manipulation buttons
│       └── PurchaseOrderButton.js    # Purchase order generation button
├── tests/
│   ├── component-tests.js            # Component test definitions
│   ├── integration-tests.js          # Integration test framework
│   ├── run-tests.html                # Component test runner
│   └── run-integration-tests.html    # Integration test runner
└── (other existing files)
```

#### 3. Component Blueprint Creation (Completed)

{{ ... }}
   - Check reorder point calculations
   - Ensure supplier information is correctly formatted

For further assistance, contact the development team.

## Testing Framework

### Component Testing

The module includes a comprehensive component testing framework:

- **Test Runner**: Browser-based test runner with interactive UI
- **Component Mocking**: Utilities to mock component dependencies
- **Assertion Framework**: Custom assertions for Vue.js components
- **Test Reporting**: Detailed reporting with pass/fail indicators

### Integration Testing

Integration tests verify component interactions:

- **Mock Data Generation**: Dynamic test data creation
- **Component Communication**: Tests for proper event emission and handling
- **Data Flow Validation**: Verification of data passing between components
- **Global Component Registry**: Tests to verify component registration

## Version History

### v2.1.2 (2025-05-15)
- Renamed "lead time" to "covering days" for clarity
- Implemented multi-factor criticality scoring algorithm
- Enhanced order calculation with improved critical item identification
- Fixed backward compatibility for legacy parameter names

### v1.9.4 (2025-04-19)
- Implemented global component registry system
- Completed comprehensive component testing framework
- Developed integration test infrastructure
- Added fallback mock components for testing resilience
- Verified Firebase Realtime Database patterns

### v1.9.3 (2025-04-16)
- Fixed incorrect current stock values in purchase order display
- Fixed parameter persistence issues
- Enhanced unit cost calculation with average of opening/closing values
- Added tracking of calculation methods with proper flagging
- Fixed syntax errors and improved error handling
- Implemented proper defensive coding techniques
- Added more comprehensive logging for troubleshooting
{{ ... }}
### v1.9.2 (2025-04-16)
- Implemented multi-step unit cost calculation with robust validation
- Fixed inconsistency between calculation details and purchase order generation
- Modified purchase order generation to respect UI filters
- Enhanced error handling during order generation
- Added better debugging information for troubleshooting

### v1.9.1 (2025-04-16)
- Added item-level calculation details feature with per-item order quantity calculation
- Implemented calculation breakdown modal for transparency in inventory decisions
- Enhanced code maintainability through DRY implementation principles
- Improved UI with item-specific calculation information

### v1.9.0 (2025-04-16)
- Implemented fully functional purchase order generation system
- Added smart reorder calculation with comprehensive formula
- Added detailed reorder point documentation
- Implemented supplier categorization and filtering for purchase orders
- Added interactive order quantity controls with real-time updates
- Created supplier breakdown and item details views in order UI
- Implemented order calculations with safety stock and critical item buffers
- Added CSV export with intelligent file naming
- Enhanced order modal with item expandable details
- Added sorting capabilities to the purchase order table

### v1.8.0 (2025-04-15)
- Implemented shadcn/ui-inspired styling for a modern, clean interface
- Reorganized UI with Data Management controls at the top
- Added dedicated "Load Data" button for direct access to historical records
- Improved data selection dialog with record details
- Fixed CSV header mapping modal display logic and reliability
- Added ShadcnUIMixin for modular UI styling
- Fixed modal rendering issues and timing problems
- Improved error handling for data loading operations

### v1.7.0 (2025-04-01)
- Redesigned filtering system with multi-select popups
- Added Purchase Quantity and Unit Cost columns
- Removed Category and Cost Center columns from main table
- Enhanced CSV header auto-mapping with smarter detection
- Added dropdown filter buttons showing count of selected items
- Implemented popup filter dialogs with checkbox selection
- Enhanced chart rendering with improved responsiveness
- Added "Select All" and "Clear" options for quicker filtering

### v1.6.0 (2025-03-15)
- Implemented time-based analysis with automatic period calculation
- Added store context for multi-location support
- Implemented usage per day calculation based on stock period days
- Added re-order point calculation based on usage patterns
- Added visual indicators for items below re-order point
- Added persistence of date settings in Firebase

### v1.5.0 (2025-03-01)
- Implemented stock usage data saving to Firebase RTDB
- Added timestamp-based unique keys in YYYYMMDD_HHMMSS format
- Implemented verification to prevent duplicates
- Added comprehensive error handling with user feedback
- Implemented data transformation for optimal database size

### v1.0.0 (2025-02-15)
- Initial release of the Food Cost Management module
- Basic CSV processing with header mapping
- Implementation of calculation for quantities and values
- Simple data display UI with enhanced historical data display
- Basic chart visualization
- Improved data visualization and UI components
- Fixed various filter and chart issues

### v1.6.0 (2025-04-14)
- Enhanced UI & Visualization
- Functional Improvements
- Data Structure Improvements
- Bug Fixes

### v1.5.0 (2025-04-14)
- Refactored to modular architecture
- Enhanced database integration with historical data tracking
- Improved CSV import with automatic header detection
- Added multi-store support
- Implemented time-based analysis
- Added inventory optimization features

### v1.4.0 (2025-03-01)
- Initial refactored version
- Basic Firebase integration
- CSV import functionality
- Basic stock data visualization

### v1.0.0 (2024-12-15)
- Original monolithic implementation
