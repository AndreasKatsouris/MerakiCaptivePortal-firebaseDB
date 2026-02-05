# Food Cost Analytics Test Data Guide

## Overview
The Food Cost Analytics module requires properly structured data with the correct permissions to function. This guide explains how to generate test data and troubleshoot permission issues.

## Permission Requirements

### Database Rules for `stockUsage`
The Firebase database rules require:

1. **Authentication**: User must be logged in
2. **Required Fields**:
   - `timestamp` - The date/time of the record
   - `userId` - Must match the authenticated user's UID
   - `selectedLocationId` - The location ID for the data
3. **Location Access**: The user must have access to the location in `userLocations/{userId}/{locationId}`

### Admin vs Regular Users

#### Admin Users
- Can read/write all stockUsage records
- Don't need location access entries
- Can clear any user's data

#### Regular Users
- Can only create records with their own userId
- Must have location access set up first
- Can only clear their own data

## Test Data Generation

### Option 1: Admin Test Page (Recommended)
Navigate to `/test-analytics-admin.html`

**Features:**
- Shows your authentication status
- Handles both admin and regular users
- Automatically sets up location access for regular users
- Shows success/error counts
- Preview of generated data

### Option 2: Simple Test Page
Navigate to `/test-analytics-with-sales.html`

**Note:** This page requires manual authentication checks and may fail for users without proper permissions.

## Data Structure

The test data includes:

```javascript
{
  timestamp: 1234567890,
  userId: "user-uid-here",
  selectedLocationId: "location-id",
  storeName: "Ocean Basket V&A",
  stockItems: {
    item_0: {
      itemName: "Seafood Item 0",
      category: "Seafood",
      costCenter: "Main Kitchen",
      unit: "kg",
      unitCost: 25.50,
      usage: 45.5,
      costOfUsage: 1160.25
    }
    // ... more items
  },
  totals: {
    totalCostOfUsage: 3500.00,
    totalItems: 25
  },
  salesData: {
    total: 7500.00,
    salesTotal: 7500.00,
    date: "2024-01-15T10:30:00.000Z"
  },
  salesAmount: 7500.00,
  salesTotal: 7500.00
}
```

### Sales Data Fields
The analytics module looks for sales data in multiple fields for compatibility:
- `salesData.total`
- `salesData.salesTotal`
- `salesAmount`
- `salesTotal`
- `totals.salesTotal`

## Troubleshooting

### Permission Denied Error
If you see: `permission_denied at /stockUsage/xxxxx`

**Solutions:**
1. Ensure you're logged in
2. Use the admin test page which handles permissions automatically
3. For regular users, ensure location access is set up
4. Check that all required fields are present

### No Data Showing in Analytics
1. Check the date range - default is last 7 days
2. Verify data exists for the selected location
3. Use the "Debug Mode" toggle to see raw data
4. Check browser console for errors

### Sales Data Not Showing
1. Ensure at least one of the sales fields is populated
2. Check that sales values are numbers, not strings
3. Use debug mode to verify data structure

## Quick Start

1. **Login**: Go to `/admin-login.html` and sign in
2. **Generate Data**: Navigate to `/test-analytics-admin.html`
3. **Click "Generate Test Data"**: This creates 7 days of data for 2 locations
4. **View Analytics**: Click "View Analytics" or go to `/food-cost-analytics.html`
5. **Select Location**: Choose a location from the dropdown
6. **View Results**: You should see:
   - Cost vs Revenue trend chart with data
   - Filterable item list instead of pie chart
   - KPI cards with calculated metrics
   - Recommendations based on performance

## Best Practices

1. **Use Admin Account for Testing**: Simplifies permission management
2. **Generate Fresh Data**: Clear old data before generating new test data
3. **Check Multiple Locations**: Test data is generated for multiple locations
4. **Verify Sales Data**: Use the preview to ensure sales fields are populated
5. **Test Filters**: Try different date ranges and location selections

## Related Pages

- `/test-analytics-admin.html` - Admin-friendly test data generator
- `/test-analytics-with-sales.html` - Simple test data generator
- `/food-cost-analytics.html` - Main analytics dashboard
- `/check-stock-data.html` - Debug tool to inspect raw data 