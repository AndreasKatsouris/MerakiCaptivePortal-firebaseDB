# Sales Forecasting

## Purpose

The Sales Forecasting module provides multi-algorithm revenue prediction for restaurant locations. It supports CSV data upload, multiple forecasting methods (seasonal, moving average, linear regression, exponential smoothing, year-over-year, and ML-based), confidence intervals, SA public holiday adjustments, and actuals comparison with accuracy analytics.

## Key Files

| File | Description |
|------|-------------|
| `public/sales-forecasting.html` | HTML page that loads the sales forecasting module |
| `public/js/modules/sales-forecasting/index.js` | `SalesForecastingModule` class - entry point, CSV parsing, tab management |
| `public/js/modules/sales-forecasting/forecast-engine.js` | `ForecastEngine` class - all forecasting algorithms |
| `public/js/modules/sales-forecasting/sales-data-service.js` | `SalesDataService` class - RTDB CRUD, index management |
| `public/js/modules/sales-forecasting/forecast-analytics.js` | `ForecastAnalytics` class - accuracy analysis, pattern detection |
| `public/js/modules/sales-forecasting/chart-config.js` | Chart.js configuration, CategoryScale registration |
| `public/css/sales-forecasting.css` | Module-specific styles |

## Data Model (RTDB Paths)

### `salesData/{recordId}`

Uploaded historical sales data:

```json
{
  "userId": "uid123",
  "locationId": "ocean_basket_waterfront",
  "uploadedAt": 1721234567890,
  "data": [
    { "date": "2025-01-15", "revenue": 45000, "transactions": 120, "avgSpend": 375 },
    { "date": "2025-01-16", "revenue": 38000, "transactions": 95, "avgSpend": 400 }
  ]
}
```

### `salesDataIndex/byLocation/{locationId}/{recordId}` and `salesDataIndex/byUser/{uid}/{recordId}`

Index nodes for efficient querying. Value = `true`.

### `forecasts/{forecastId}`

Generated forecast results:

```json
{
  "userId": "uid123",
  "locationId": "ocean_basket_waterfront",
  "createdAt": 1721234567890,
  "method": "seasonal",
  "horizon": 30,
  "confidenceLevel": 95,
  "predictions": [
    {
      "date": "2025-08-01",
      "predicted": 42000,
      "transactions": 110,
      "avgSpend": 382,
      "confidenceLower": 35000,
      "confidenceUpper": 49000
    }
  ],
  "metadata": {
    "dataPointsUsed": 365,
    "forecastStart": "2025-08-01",
    "forecastEnd": "2025-08-30"
  }
}
```

### `forecastIndex/byLocation/{locationId}/{forecastId}` and `forecastIndex/byUser/{uid}/{forecastId}`

Index nodes for forecast querying.

### `forecastActuals/{actualId}`

Actual sales data uploaded for comparison:

```json
{
  "forecastId": "forecast123",
  "locationId": "ocean_basket_waterfront",
  "uploadedAt": 1721234567890,
  "uploadedBy": "uid123",
  "data": [
    { "date": "2025-08-01", "actual": 43500 }
  ]
}
```

### `forecastAnalytics/byLocation/{locationId}` and `forecastAnalytics/systemWide`

Aggregated analytics and pattern data.

## Canonical Prediction Format

Every prediction object follows this shape:

```json
{
  "date": "2025-08-01",
  "predicted": 42000,
  "transactions": 110,
  "avgSpend": 382,
  "confidenceLower": 35000,
  "confidenceUpper": 49000,
  "adjusted": true
}
```

The `adjusted` flag is set when holiday or learned pattern adjustments are applied.

## Forecasting Algorithms

### 1. Seasonal Forecast (default)

`seasonalForecast(data, horizon, startDate)`

Decomposes historical data into weekly seasonal patterns and trend components. Applies day-of-week multipliers to trend projections.

### 2. Year-over-Year (YoY)

`yearOverYearForecast(data, horizon, startDate)`

Uses same-day-from-last-year values with a calculated growth rate. Requires minimum 7 days of data.

### 3. Moving Average

`movingAverageForecast(data, horizon, startDate)`

Sliding window average (typically 7-day or 30-day) projected forward.

### 4. Linear Regression (Simple Trend)

`linearRegressionForecast(data, horizon, startDate)`

Least-squares linear fit on historical revenue, extrapolated to future dates.

### 5. Exponential Smoothing

`exponentialSmoothingForecast(data, horizon, startDate)`

Single exponential smoothing with configurable alpha parameter. More recent data weighted higher.

### 6. ML-Based

`mlBasedForecast(data, horizon, startDate)`

Combines multiple algorithm outputs with weighted ensemble. Uses learned patterns from `ForecastAnalytics`.

## Confidence Intervals

`applyConfidenceIntervals(predictions, historicalData, confidenceLevel)`

Supported levels: 0 (none), 80, 90, 95, 99.

Calculates standard deviation of historical residuals and applies z-scores:
- 80% -> z = 1.28
- 90% -> z = 1.645
- 95% -> z = 1.96
- 99% -> z = 2.576

## SA Public Holidays

The forecast engine includes South African public holiday detection with Easter calculation using the Anonymous Gregorian algorithm:

- New Year's Day (1 Jan)
- Human Rights Day (21 Mar)
- Good Friday (calculated)
- Family Day (calculated)
- Freedom Day (27 Apr)
- Workers' Day (1 May)
- Youth Day (16 Jun)
- National Women's Day (9 Aug)
- Heritage Day (24 Sep)
- Day of Reconciliation (16 Dec)
- Christmas Day (25 Dec)
- Day of Goodwill (26 Dec)

Holidays trigger adjustments to predictions (typically increased or decreased revenue depending on the holiday type).

## CSV Import

`parseCsv(text)` in `index.js` handles:
- BOM stripping (`\uFEFF`)
- Line ending normalization (`\r\n`, `\r` -> `\n`)
- Delimiter detection (`;` or `,`)
- Quoted field parsing
- Header normalization to lowercase

`normalizeDate(dateStr)` handles:
- `YYYY-MM-DD` (pass-through)
- `DD/MM/YYYY` (SA default for ambiguous dates)
- `MM/DD/YYYY` (detected when month > 12)
- Generic `Date()` parsing as fallback

## Chart.js Integration

**Critical**: Uses `CategoryScale` (NOT `TimeScale`) to avoid ESM dual-package hazard.

`chart-config.js` registers:
```javascript
Chart.register(CategoryScale, LinearScale, PointElement, LineElement, ...);
```

Chart types used:
- Line chart for forecast vs actuals
- Area fill for confidence intervals
- Multi-dataset for algorithm comparison

## Learned Patterns

`applyLearnedPatterns(predictions, patterns)` adjusts predictions based on:
- Historical accuracy patterns per day-of-week
- Seasonal correction factors from `forecastAnalytics`
- Location-specific adjustment coefficients

## Tab System

The module uses `switchTab()` with `display:none/block` toggling (no full DOM re-render):
- **Data Upload**: CSV import and data management
- **Forecast**: Algorithm selection, horizon, confidence config, generate forecast
- **Comparison**: Side-by-side forecast vs actuals
- **Analytics**: Accuracy metrics, pattern analysis

## Security Rules

```json
"salesData": {
  ".indexOn": ["locationId", "userId", "uploadedAt"],
  "$recordId": {
    ".write": "auth != null && (admin || owner || new record with valid location)",
    ".read": "auth != null && (admin || owner)"
  }
}
```

Forecasts, actuals, and analytics follow similar owner-or-admin access patterns with location validation.

## Known Gotchas

1. **CategoryScale required**: Do NOT switch to TimeScale - it causes ESM dual-package hazard with Chart.js.
2. **SA date format default**: Ambiguous dates like `01/02/2025` are interpreted as DD/MM/YYYY (Feb 1st), not MM/DD/YYYY (Jan 2nd).
3. **Index nodes for queries**: Data uses dual-index pattern (`salesDataIndex/byLocation` and `salesDataIndex/byUser`) for efficient querying without scanning all records.
4. **Atomic deletes**: Deleting sales data requires multi-path update to null both the record and its index entries: `update(ref(rtdb), { 'salesData/id': null, 'salesDataIndex/byLocation/loc/id': null, 'salesDataIndex/byUser/uid/id': null })`.
5. **Linter/hooks auto-run**: Editing JS files in this module may trigger auto-formatting hooks. Always re-read files before subsequent edits.
6. **`getPredictionRevenue()` helper**: Exported from `sales-data-service.js`, extracts revenue from the canonical prediction format.
