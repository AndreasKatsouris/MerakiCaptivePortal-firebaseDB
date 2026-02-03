# Stock Data to Location Migration Tool

## Overview
This tool helps migrate orphaned or legacy stock data to the proper Firebase location structure.

## Background
The stock data in this system should be stored under:
```
locations/{locationId}/stockUsage/{timestamp}
```

However, some stock data may exist in other paths due to:
- Legacy data structures
- Import errors
- Manual data entries
- Test data

## How to Use

1. **Access the Tool**
   - Open `/allocate-stock-to-locations.html` in your browser
   - Login with admin credentials

2. **Scan for Stock Data**
   - Click "Scan for Stock Data" to search the database
   - The tool will check common paths like:
     - `stockData`
     - `stock`
     - `stockUsage`
     - `inventory`
     - `items`

3. **Find Orphaned Data**
   - Click "Find Orphaned Data" to see only data outside location structures
   - Use the "Show Orphaned Only" checkbox to filter results

4. **Select Data to Migrate**
   - Click on orphaned entries to select them
   - Multiple entries can be selected at once

5. **Choose Target Location**
   - Select the location where the data should be moved
   - The new path will be: `locations/{locationId}/stockUsage/{timestamp}`

6. **Migrate Data**
   - Click "Migrate Selected"
   - Review the migration preview
   - Check "Delete original entries" if you want to remove the old data
   - Click "Confirm Migration"

7. **Export Report**
   - Click "Export Report" to download a CSV of all found stock data
   - Useful for auditing and backup purposes

## Important Notes

⚠️ **Always backup your database before running migrations**

- This tool modifies production data
- Deleted data cannot be recovered
- Test with a small batch first

## Data Structure

The tool looks for objects with these properties to identify stock data:
- `items` (array)
- `stockItems`
- `category`
- `usage`
- `quantity`
- `cost`

## Troubleshooting

If no data is found:
1. Check Firebase security rules allow read access
2. Verify you're logged in as admin
3. Check browser console for errors
4. The stock data might already be properly structured

## Support

This is a one-time migration tool. Once all data is properly allocated, this tool won't be needed. 