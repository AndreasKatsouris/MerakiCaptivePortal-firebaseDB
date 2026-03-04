# Food Cost Analytics

## Purpose

The Food Cost module enables restaurant managers to track stock usage, calculate food cost percentages, analyze cost drivers, generate purchase orders, and monitor historical trends. It is a Vue 3 application mounted into the `food-cost-analytics.html` page, with backend data stored in Firebase RTDB under location-specific paths.

## Key Files

| File | Description |
|------|-------------|
| `public/food-cost-analytics.html` | HTML page that loads the Vue 3 food cost app |
| `public/js/modules/food-cost/index.js` | Module entry point, initializes `FoodCostApp` Vue component |
| `public/js/modules/food-cost/refactored-app-component.js` | Main Vue 3 component with all tabs and logic |
| `public/js/modules/food-cost/database-operations.js` | CRUD operations for stock data (`saveStockData`, `loadStockHistory`) |
| `public/js/modules/food-cost/database-operations-v2.js` | Enhanced database ops (v2 with additional features) |
| `public/js/modules/food-cost/data-processor.js` | Data transformation and calculation utilities |
| `public/js/modules/food-cost/order-calculator.js` | Purchase order generation logic |
| `public/js/modules/food-cost/order-calculator-advanced.js` | Advanced order calculations with forecasting |
| `public/js/modules/food-cost/order-calculator-calculus.js` | Mathematical optimization for order quantities |
| `public/js/modules/food-cost/analytics-dashboard.js` | `FoodCostAnalyticsDashboard` component for trends and charts |
| `public/js/modules/food-cost/chart-manager.js` | Chart.js integration for food cost visualizations |
| `public/js/modules/food-cost/firebase-helpers.js` | Firebase initialization and RTDB helper wrappers |
| `public/js/modules/food-cost/utilities.js` | `generateTimestampKey()` and other utility functions |
| `public/js/modules/food-cost/services/data-service.js` | Service layer for data access patterns |
| `public/js/modules/food-cost/cost-driver.html` | Cost driver analysis component/template |
| `public/js/modules/food-cost/migration-helpers.js` | Data migration utilities for schema changes |
| `public/js/modules/food-cost/setup.js` | Module setup and configuration |

## Data Model (RTDB Paths)

### `locations/{locationId}/stockUsage/{timestampKey}`

Primary stock data storage, scoped per location:

```json
{
  "userId": "uid123",
  "timestamp": 1721234567890,
  "formattedTimestamp": "7/17/2025, 2:22:47 PM",
  "selectedLocationId": "ocean_basket_waterfront",
  "storeName": "Ocean Basket Waterfront",
  "openingDate": "2025-07-01",
  "closingDate": "2025-07-15",
  "daysToNextDelivery": 3,
  "stockPeriodDays": 14,
  "periodDays": 14,
  "storeContext": {
    "name": "Ocean Basket Waterfront",
    "locationId": "ocean_basket_waterfront",
    "periodDays": 14,
    "openingDate": "2025-07-01",
    "closingDate": "2025-07-15"
  },
  "safetyStockPercentage": 10,
  "criticalItemBuffer": 5,
  "totalItems": 25,
  "totalOpeningValue": 15000.00,
  "totalPurchases": 8000.00,
  "totalClosingValue": 12000.00,
  "totalUsage": 11000.00,
  "totalCostOfUsage": 11000.00,
  "salesAmount": 45000.00,
  "costPercentage": 24.4,
  "stockItems": [
    {
      "name": "Hake Fillets",
      "unit": "kg",
      "openingQty": 50,
      "purchaseQty": 30,
      "closingQty": 25,
      "usage": 55,
      "costPerUnit": 85.00,
      "totalCost": 4675.00,
      "category": "Seafood",
      "isCritical": true
    }
  ]
}
```

### `stockUsage/{recordId}` (Legacy)

Older stock data may exist at this top-level path (before location-scoped migration).

```json
"stockUsage": {
  ".indexOn": ["storeName", "timestamp"],
  "$recordId": {
    ".validate": "newData.hasChildren(['timestamp', 'userId', 'selectedLocationId'])"
  }
}
```

## Main Features

### 1. Stock Data Entry

Users input:
- Location selection (from `userLocations`)
- Opening/closing dates and stock period
- Days to next delivery
- Safety stock percentage and critical item buffer
- Per-item: name, unit, opening qty, purchases, closing qty, cost per unit, category

Calculated fields:
- `usage = openingQty + purchaseQty - closingQty`
- `totalCost = usage * costPerUnit`
- `costPercentage = (totalCostOfUsage / salesAmount) * 100`

### 2. Duplicate Detection

`checkForExistingData(data)` prevents uploading the same stock data twice by checking for entries with matching timestamps and location IDs.

### 3. Purchase Order Generation

Three calculation engines:

| Engine | File | Description |
|--------|------|-------------|
| Basic | `order-calculator.js` | Simple reorder based on usage rate and days to delivery |
| Advanced | `order-calculator-advanced.js` | Incorporates forecasting and safety stock |
| Calculus | `order-calculator-calculus.js` | Mathematical optimization for order quantities |

Order calculation formula (basic):
```
dailyUsage = usage / periodDays
orderQty = (dailyUsage * daysToNextDelivery) + (dailyUsage * safetyStockPercentage / 100)
```

### 4. Analytics Dashboard

`FoodCostAnalyticsDashboard` component provides:
- Food cost percentage trending over time
- Category-level cost breakdown
- Cost driver identification
- Stock variance analysis
- Historical comparisons across periods

### 5. Data Processing

`data-processor.js` handles:
- Normalizing stock items from different input formats
- Calculating aggregate metrics (totals, averages, percentages)
- Transforming data for chart visualization
- Period-over-period comparison calculations

### 6. Historical Data

Stock usage history is loaded per location from `locations/{locationId}/stockUsage/`. Users can view past periods and compare cost percentages over time.

## Tier Gating

| Feature | Minimum Tier |
|---------|-------------|
| `foodCostBasic` | `professional` |
| `advancedFoodCostCalculation` | `enterprise` |

The food cost module requires at least a Professional tier subscription.

## UI Components

- **Stock Entry Tab**: Form with item table, opening/closing values, sales input
- **Purchase Order Tab**: Generated orders with suggested quantities
- **Analytics Tab**: Charts showing trends, cost drivers, category breakdowns
- **History Tab**: Previous stock submissions with comparison tools

## Module Versioning

The module uses explicit versioning in imports: `MODULE_VERSION = '2.1.5-2025-06-06'`. Cache-busting query strings are appended to all import paths (e.g., `?v=2.1.5-20250606`).

## Known Gotchas

1. **Period days stored in multiple places**: `stockPeriodDays`, `periodDays`, and `storeContext.periodDays` all store the same value for backward compatibility. Always update all three.
2. **Location-scoped vs legacy paths**: Stock data is stored under `locations/{locationId}/stockUsage/` but older records may be at `stockUsage/`. The `migration-helpers.js` file handles migration.
3. **Vue 3 global mount**: The module uses `Vue.createApp(FoodCostApp).mount()` with Vue 3 loaded via CDN, not a build step.
4. **Authentication required**: `saveStockData()` checks `auth.currentUser` and `data.selectedLocationId` before writing. Both are required.
5. **Cost driver HTML**: `cost-driver.html` is a separate template file that may be loaded as a component or inline - verify integration path before modifying.
