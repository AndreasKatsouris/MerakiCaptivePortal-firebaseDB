# Purchase Order Location Matching Fix - Complete Documentation

## Summary of Issues and Fixes

### Issue 1: Location Matching Problem
**Problem**: Advanced Purchase Orders were not loading historical data for some locations (e.g., "Ocean Basket Brits") while working for others.

**Root Cause**: Stock data was being saved with hardcoded `storeName: 'Store'` instead of the actual location name, preventing the Historical Usage Service from matching locations correctly.

**Fix Applied**: 
1. Updated `refactored-app-component.js` to use the actual location name via `selectedLocationName()` computed property
2. Enhanced `historical-usage-service.js` with flexible location name matching strategies
3. Fixed `database-operations.js` to include location ID for cross-referencing

### Issue 2: Covering Days Bug
**Problem**: Changing the "Covering Days" parameter in the Purchase Order modal didn't affect the order quantity calculation.

**Root Cause**: The basic order calculator was using a fixed `orderCycle` parameter instead of the dynamic `coveringDays` value.

**Fix Applied**: Updated `order-calculator.js` to use `forecastPeriod = daysToNextDelivery + coveringDays` for base usage calculation.

## Technical Details

### 1. Location Name Fix in refactored-app-component.js

**Before**:
```javascript
storeName: 'Store', // Hardcoded value
```

**After**:
```javascript
storeName: this.selectedLocationName() || 'Unknown Location',
```

### 2. Enhanced Location Matching in historical-usage-service.js

The service now tries multiple matching strategies:
1. Exact match
2. Case-insensitive match
3. Partial match (contains)
4. Normalized match (removing special characters)

### 3. Covering Days Calculation Fix

**Before**:
```javascript
const baseUsage = usagePerDay * context.orderCycle; // Fixed 7 days
```

**After**:
```javascript
const forecastPeriod = context.daysToNextDelivery + context.coveringDays;
const baseUsage = usagePerDay * forecastPeriod; // Dynamic calculation
```

## Testing Results

### Location Matching Test Results
- ✅ Historical data now loads correctly for all locations
- ✅ Purchase Order calculations work with historical data
- ✅ Location name is properly saved with stock data

### Covering Days Test Results
- ✅ Order quantity now adjusts when changing covering days
- ✅ Formula: Order Qty = (Usage/Day × (Days to Delivery + Covering Days) × Safety Factor) - Current Stock

## Migration Strategy

### Phase 1: Immediate Fix (Completed)
- Fixed storeName issue
- Enhanced location matching
- Fixed covering days calculation

### Phase 2: Database Migration (Next Steps)
- Implement dual-write capability
- Create migration tool for historical data
- Move to normalized database structure

### New Database Structure (Proposed)
```
/stockData
  /{documentId}
    - timestamp
    - locationId
    - locationName
    - userId
    - items: []
    
/stockDataIndex
  /byLocation/{locationId}
    /{timestamp}: {documentId}
  /byUser/{userId}
    /{timestamp}: {documentId}
```

## Known Issues and Workarounds

### Issue: Some locations have data stored under different names
**Workaround**: The enhanced matching algorithm handles most cases automatically

### Issue: Historical data uses future dates (test data)
**Workaround**: Quick diagnostic tool now uses 365-day lookback to catch all test data

## Monitoring and Verification

### How to Verify the Fix
1. Load stock data for any location
2. Generate an Advanced Purchase Order
3. Check console logs for:
   - `[HistoricalUsage] Found X records in location Y`
   - `[Advanced PO Generator] Retrieved historical data for X items`

### Key Log Messages
- ✅ Good: "Calculating statistics for item: XXXXX"
- ❌ Bad: "NO HISTORICAL DATA FOUND for store identifier"

## Next Steps

1. **Run Migration Tool**: Use the Database Structure Migration Tool in admin tools
2. **Monitor Performance**: Check for any slowdowns with the new matching logic
3. **Update Documentation**: Ensure all team members know about the covering days parameter

## Support

If you encounter issues:
1. Check the Quick Location Diagnostic tool first
2. Verify location names match between stock data and location records
3. Check console logs for detailed error messages 