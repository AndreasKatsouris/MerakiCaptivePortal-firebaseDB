# Purchase Order Location Name Fix

## Problem Summary

The advanced Purchase Order functionality was not working correctly because of a location name mismatch issue:

1. **Hardcoded Store Name**: Stock data was being saved with `storeName: 'Store'` instead of the actual location name
2. **Historical Data Mismatch**: The Historical Usage Service couldn't match "Ocean Basket Brits" with the stored "Store" value
3. **Migration Tool Issue**: The Stock Data to Location Migration Tool showed "Store" instead of actual location names

## Root Cause

In `refactored-app-component.js`, the `saveStockUsage()` method was using:
```javascript
storeName: 'Store', // Keep for backward compatibility
```

This meant all stock data was saved with a generic "Store" name instead of the actual location name like "Ocean Basket Brits".

## Solution Implemented

### 1. Fixed Data Saving (refactored-app-component.js)

**Before:**
```javascript
storeName: 'Store', // Keep for backward compatibility
```

**After:**
```javascript
// Get the actual location name using computed property
const locationName = this.selectedLocationName;
// ...
storeName: locationName, // Use actual location name for proper historical matching
```

### 2. Added Computed Properties

Added computed properties for better location handling:
```javascript
computed: {
    selectedLocationName() {
        const selectedLocation = this.userLocations.find(loc => loc.id === this.selectedLocationId);
        return selectedLocation ? (selectedLocation.displayName || selectedLocation.name) : 'Unknown Location';
    },
    
    isLocationSelected() {
        return this.selectedLocationId && this.userLocations.some(loc => loc.id === this.selectedLocationId);
    }
}
```

### 3. Updated Purchase Order Modal Props

**Before:**
```javascript
:store-name="selectedLocationId"
```

**After:**
```javascript
:store-name="selectedLocationName"
```

### 4. Enhanced Historical Data Matching

Updated the Historical Usage Service to be more flexible with location name matching:

```javascript
// Try multiple matching strategies:
// 1. Exact match
// 2. Case-insensitive match  
// 3. Partial match (for cases where one has "Ocean Basket Brits" and other has "Brits")
const storeMatch = recordStore === storeIdentifier ||
                 (recordStore && storeIdentifier && 
                  recordStore.toLowerCase() === storeIdentifier.toLowerCase()) ||
                 (recordStore && storeIdentifier && 
                  (recordStore.includes(storeIdentifier) || storeIdentifier.includes(recordStore)));
```

### 5. Enhanced Database Operations

Updated `database-operations.js` to include location ID in storeContext:
```javascript
storeContext: {
    name: data.storeName || 'Default Store',
    locationId: data.selectedLocationId, // Add location ID for cross-reference
    periodDays: periodDays,
    openingDate: data.openingDate || '',
    closingDate: data.closingDate || ''
}
```

### 6. Added Validation

Added validation to prevent saving without a location selected:
```javascript
if (!this.isLocationSelected) {
    Swal.fire({
        icon: 'error',
        title: 'No Location Selected',
        text: 'Please select a location before saving stock data.',
        confirmButtonColor: '#3085d6'
    });
    return;
}
```

## Files Modified

1. `public/js/modules/food-cost/refactored-app-component.js`
2. `public/js/modules/food-cost/services/historical-usage-service.js`
3. `public/js/modules/food-cost/database-operations.js`

## Testing

Created `public/admin_tools/test-purchase-order-fix.html` to verify:
- Location names are properly retrieved
- Historical data service can match location names
- Stock data is saved with proper location names

## Expected Results

After this fix:
1. ✅ New stock data will be saved with actual location names (e.g., "Ocean Basket Brits")
2. ✅ Advanced Purchase Order will be able to find historical data for the location
3. ✅ Stock Data Migration Tool will show proper location names
4. ✅ Historical data matching will work with flexible name matching

## Next Steps

1. **Test the Fix**: Use the test tool to verify the fix is working
2. **Plan Database Migration**: Design the new normalized structure
3. **Create Migration Tool**: Build a tool to migrate to the better structure
4. **Gradual Migration**: Implement dual-write approach for smooth transition

## Database Structure Migration (Planned)

The current structure has limitations. We plan to migrate to:

```
📁 stockData/
  └── {stockDataId}/
      ├── locationId: "-OSKIKirLR-OeWqP7ZI-"
      ├── locationName: "Ocean Basket Brits"
      ├── timestamp: 1744820269356
      ├── stockItems: {...}
      └── metadata: {...}

📁 stockDataIndex/
  └── byLocation/{locationId}/{timestamp}: true
```

This will provide:
- Better separation of concerns
- Efficient cross-location queries
- Improved scalability
- Flexible access control 