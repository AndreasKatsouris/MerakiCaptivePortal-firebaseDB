# Sales Forecasting: Saved Forecasts Feature Design

**Date**: 2026-01-27
**Feature**: Load and manage saved forecasts
**Status**: Design Complete - Ready for Implementation
**Tool**: `public/tools/admin/sales-forecasting.html`

## Overview

The sales forecasting tool currently allows users to save forecasts but provides no way to view, load, or manage them. This design adds a comprehensive saved forecasts management interface with real-time updates.

### User Goals
1. View all saved forecasts for a location
2. Load a saved forecast to restore its visualization and enable editing
3. See forecast accuracy if actuals have been uploaded
4. Name and organize forecasts for easy reference
5. Delete outdated or incorrect forecasts

## Architecture

### Data Structure Enhancement

Extend existing Firebase structure at `forecasts/${userId}/${locationId}/${timestamp}`:

```javascript
{
  metadata: {
    name: "Q1 2026 Conservative Estimate",  // NEW: User-provided name
    description: "Based on holiday season data",  // NEW: Optional description
    locationId: "loc123",
    locationName: "Downtown Branch",
    savedAt: 1706380800000,
    savedBy: "userId",
    method: "seasonalTrend",  // movingAverage, exponential, ml
    horizon: 30,  // days forecasted
    confidenceLevel: 95,
    growthRate: 5,
    updatedAt: 1706380800000  // NEW: Track edits
  },
  historicalDataRef: "salesData/userId/loc123/dataId",  // Link to source data
  summary: {  // NEW: Quick preview metrics
    totalPredictedRevenue: 150000,
    avgDailyRevenue: 5000,
    predictedGrowth: 5.2,
    dateRange: { start: "2026-02-01", end: "2026-03-02" }
  },
  accuracy: {  // NEW: Populated when actuals uploaded
    mape: 12.5,  // Mean Absolute Percentage Error
    rmse: 450,   // Root Mean Squared Error
    calculatedAt: 1706467200000,
    status: "good"  // excellent/good/fair/poor
  },
  forecastData: [ /* existing forecast array */ ],
  adjustments: { /* existing adjustments */ }
}
```

### Service Layer Methods

Add to `SalesDataService` class:

| Method | Purpose | Returns |
|--------|---------|---------|
| `getForecastsList(locationId, callback)` | Real-time forecast list for location | Unsubscribe function |
| `getSavedForecast(locationId, forecastId)` | Load complete forecast data | Promise<ForecastObject> |
| `updateForecastMetadata(locationId, forecastId, updates)` | Edit name/description | Promise<void> |
| `deleteForecast(locationId, forecastId)` | Remove saved forecast | Promise<void> |
| `saveForecast(locationId, salesDataId, forecastPayload, metadata)` | Enhanced save with name/description | Promise<{forecastId, success}> |

## UI Components

### 1. Load Saved Forecast Card

**Position**: Above existing "Load Saved Historical Data" card

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ 📊 Load Saved Forecast                                       │
│ View and restore previously generated forecasts              │
│                                                              │
│ ┌──────────────┐  ┌────────────────────────────────────┐   │
│ │ Location ▼   │  │  Forecast List (live updates)       │   │
│ │ Downtown     │  │                                     │   │
│ └──────────────┘  │  🔄 "Q1 2026 Conservative" - Feb 1 │   │
│                   │     Method: Seasonal | 30 days      │   │
│                   │     Revenue: R150k | Accuracy: 87%  │   │
│                   │     [Load] [Edit] [Delete]          │   │
│                   │                                     │   │
│                   │  📈 "Holiday Peak Projection"       │   │
│                   │     Method: Exponential | 60 days   │   │
│                   │     Revenue: R280k | Not verified   │   │
│                   │     [Load] [Edit] [Delete]          │   │
│                   └────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**List Item Features**:
- Clickable card design (hover effect)
- Status badges for method type and accuracy
- Action buttons: Load, Edit Name, Delete
- Visual indicators:
  - 🎯 Green checkmark if accuracy calculated
  - ⏳ Gray icon if not verified with actuals
  - 📅 Human-readable timestamp ("Saved 2 days ago")

**Empty States**:
- Before location selected: "Select a location to view saved forecasts"
- After location selected (no forecasts): "No saved forecasts yet for this location. Generate a forecast and click 'Save Forecast' to store it."

### 2. Enhanced Save Dialog

When user clicks "Save Forecast" button:

```
┌──────────────────────────────────────────┐
│ Save Forecast                         ✕  │
├──────────────────────────────────────────┤
│ Name your forecast for easy reference    │
│                                          │
│ Forecast Name: *                         │
│ [Q1 2026 Conservative Estimate_____]     │
│                                          │
│ Description (optional):                  │
│ [Based on holiday season data____]       │
│ [________________________________]       │
│                                          │
│ 📍 Location: Downtown Branch             │
│ 📊 Method: Seasonal Trend                │
│ 📅 Period: 30 days (Feb 1 - Mar 2)       │
│ 💰 Predicted Revenue: R150,000           │
│                                          │
│      [Cancel]  [Save Forecast]           │
└──────────────────────────────────────────┘
```

**Validation**:
- Name required (min 3 chars)
- Auto-generate if empty: `"Forecast - [Method] - [Date]"`

## User Interaction Flows

### Flow 1: Saving a Forecast (Enhanced)

1. User generates forecast and clicks "Save Forecast"
2. Show enhanced save dialog with name/description fields
3. Validate input (name required)
4. Save to Firebase with complete structure
5. Show success toast: "Forecast saved successfully!"
6. Real-time listener automatically updates forecast list

### Flow 2: Loading a Saved Forecast

1. User selects location in "Load Saved Forecast" card
2. Real-time listener populates list of forecasts
3. User clicks "Load" button on desired forecast
4. Show status: "Loading forecast..."
5. Fetch complete forecast data from Firebase
6. Restore visualization:
   - Populate location selector
   - Render forecast chart
   - Display forecast table
   - Update metrics cards
   - Show accuracy comparison if available
7. Enable editing capabilities:
   - Enable "Manual Adjustments" section
   - Enable "Save Forecast" button (for new version)
   - Add indicator: "📂 Loaded: Q1 2026 Conservative Estimate"
8. If accuracy data exists, automatically show comparison section

### Flow 3: Editing Forecast Name/Description

1. User clicks "Edit" button on forecast list item
2. Show inline editor (name and description fields)
3. Save on blur or Enter key, cancel on Escape
4. Update Firebase immediately
5. Real-time listener propagates change to UI

### Flow 4: Deleting a Forecast

1. User clicks "Delete" button
2. Show confirmation dialog: "Are you sure you want to delete this forecast? This cannot be undone."
3. On confirm, delete from Firebase
4. Real-time listener removes from list with fade-out animation
5. Show success toast

## Technical Implementation

### Real-time Listener Pattern

```javascript
// Global cleanup function reference
let forecastListUnsubscribe = null;

// Attach listener when location selected
savedForecastLocationSelect.addEventListener('change', async (e) => {
  const locationId = e.target.value;

  // Clean up previous listener
  if (forecastListUnsubscribe) {
    forecastListUnsubscribe();
    forecastListUnsubscribe = null;
  }

  if (locationId) {
    // Attach new real-time listener
    forecastListUnsubscribe = dataService.getForecastsList(locationId, (forecasts) => {
      renderSavedForecastsList(forecasts);
    });
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (forecastListUnsubscribe) {
    forecastListUnsubscribe();
  }
});
```

### Key Service Methods

**getForecastsList (Real-time)**:
```javascript
getForecastsList(locationId, callback) {
  const userId = this.userId;
  const forecastsRef = ref(rtdb, `forecasts/${userId}/${locationId}`);

  const unsubscribe = onValue(forecastsRef, (snapshot) => {
    const forecasts = [];

    if (snapshot.exists()) {
      const data = snapshot.val();

      Object.entries(data).forEach(([forecastId, forecast]) => {
        forecasts.push({
          id: forecastId,
          name: forecast.metadata?.name || 'Unnamed Forecast',
          description: forecast.metadata?.description || '',
          savedAt: forecast.metadata?.savedAt,
          method: forecast.metadata?.method,
          horizon: forecast.metadata?.horizon,
          summary: forecast.summary,
          accuracy: forecast.accuracy,
          savedAgo: this.getTimeAgo(forecast.metadata?.savedAt)
        });
      });

      forecasts.sort((a, b) => b.savedAt - a.savedAt);
    }

    callback(forecasts);
  });

  return unsubscribe;
}
```

**Enhanced saveForecast**:
```javascript
async saveForecast(locationId, salesDataId, forecastPayload, metadata) {
  const userId = this.userId;
  const timestamp = Date.now();
  const forecastRef = ref(rtdb, `forecasts/${userId}/${locationId}/${timestamp}`);

  const forecastRecord = {
    metadata: {
      ...forecastPayload.config,
      name: metadata.name || `Forecast - ${forecastPayload.config.method} - ${new Date().toLocaleDateString()}`,
      description: metadata.description || '',
      locationId,
      locationName: metadata.locationName,
      savedAt: timestamp,
      savedBy: userId
    },
    historicalDataRef: salesDataId ? `salesData/${userId}/${locationId}/${salesDataId}` : null,
    summary: this.calculateSummary(forecastPayload.forecastData),
    forecastData: forecastPayload.forecastData,
    accuracy: null
  };

  await set(forecastRef, forecastRecord);

  return { forecastId: timestamp.toString(), success: true };
}
```

## Error Handling & Edge Cases

### Error Scenarios

| Error | User Message | Technical Action |
|-------|--------------|------------------|
| Failed to load forecast | "Could not load forecast. Please try again." | Log error, maintain UI state |
| Network disconnection | "Connection lost. Changes will sync when reconnected." | Queue operations, show offline badge |
| Missing historical data | "Source data for this forecast no longer exists." | Allow viewing forecast, disable regenerate |
| Corrupted forecast data | "This forecast data appears corrupted. You may want to delete it." | Validate structure, offer delete option |

### Edge Cases

1. **No Forecasts Yet**: Show helpful empty state with CTA
2. **Many Forecasts (50+)**: Lazy-load, add search/filter bar
3. **Loading While Another Active**: Warn about unsaved changes
4. **Duplicate Names**: Allow (unique IDs), differentiate by timestamp
5. **Slow Network**: Show loading indicators, disable actions during fetch

### Performance Optimizations

1. **Real-time Listener Efficiency**:
   - Only attach when card visible (intersection observer)
   - Detach when scrolled out or location changed
   - Use `.limitToLast(50)` to cap data

2. **Data Loading**:
   - Load full forecast only on "Load" click
   - List view uses lightweight metadata
   - Cache loaded forecasts (with TTL)

3. **UI Rendering**:
   - Debounce rapid Firebase updates
   - Virtual scrolling for 100+ forecasts
   - Smooth animations for add/delete

## Backward Compatibility

For existing forecasts without new fields:
- **No name**: Auto-generate from metadata
- **No description**: Default to empty string
- **No summary**: Calculate on-the-fly from forecastData
- **No accuracy**: Show as "Not verified yet"

No migration required - handle gracefully in rendering logic.

## Success Metrics

### User Experience
- Users can find and load saved forecasts in <10 seconds
- Real-time updates feel instantaneous (<500ms)
- Zero data loss during normal operations
- Intuitive naming makes forecasts easy to identify

### Technical Performance
- Page load time increases by <200ms
- Real-time listener reconnects automatically on network issues
- Memory usage remains stable with 50+ forecasts
- UI remains responsive during all operations

## Future Enhancements (Post-MVP)

1. **Search & Filter**: By date range, method, accuracy level
2. **Forecast Comparison**: Side-by-side comparison of multiple forecasts
3. **Version History**: Track changes to forecasts over time
4. **Export Collection**: Bulk export all forecasts for location
5. **Sharing**: Share forecast with team members (when integrated into user features)
6. **Templates**: Save forecast configurations as reusable templates
7. **Notifications**: Alert when forecast accuracy can be calculated

## Implementation Checklist

### Phase 1: Data Structure & Service Layer
- [ ] Update Firebase data structure documentation
- [ ] Implement `getForecastsList` with real-time listener
- [ ] Implement `getSavedForecast` method
- [ ] Implement `updateForecastMetadata` method
- [ ] Implement `deleteForecast` method
- [ ] Enhance `saveForecast` with name/description
- [ ] Add `calculateSummary` helper method
- [ ] Add `getTimeAgo` helper method

### Phase 2: UI Components
- [ ] Create "Load Saved Forecast" card HTML structure
- [ ] Add location selector for saved forecasts
- [ ] Build forecast list item template
- [ ] Implement empty state displays
- [ ] Create enhanced save dialog modal
- [ ] Add validation for forecast name input
- [ ] Style components matching existing design

### Phase 3: Interaction Logic
- [ ] Wire up location selector change handler
- [ ] Implement real-time listener attachment/cleanup
- [ ] Build `renderSavedForecastsList` function
- [ ] Implement "Load" button functionality
- [ ] Build inline edit functionality
- [ ] Implement delete with confirmation
- [ ] Add loading states and error handling

### Phase 4: Integration & Polish
- [ ] Update existing save flow to show new dialog
- [ ] Test backward compatibility with existing forecasts
- [ ] Add smooth animations (fade-in/out)
- [ ] Implement all error scenarios
- [ ] Add performance optimizations
- [ ] Test with 50+ forecasts per location

### Phase 5: Testing & Documentation
- [ ] Manual testing of all user flows
- [ ] Test real-time updates across multiple tabs
- [ ] Test offline behavior and reconnection
- [ ] Update tool documentation
- [ ] Create user guide for saved forecasts feature
- [ ] Add inline help text and tooltips

## Notes

- This feature is in beta and will eventually integrate into user-facing dashboard
- Real-time updates provide modern UX suitable for production user features
- Design maintains consistency with existing sales forecasting tool patterns
- All Firebase operations use existing authentication and security rules
- Feature can be developed incrementally without breaking existing functionality

---

**Design Approved**: 2026-01-27
**Ready for Implementation**: Yes
**Estimated Effort**: 2-3 days
**Dependencies**: Existing SalesDataService, Firebase RTDB
