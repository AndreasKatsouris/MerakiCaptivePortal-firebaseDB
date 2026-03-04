# Forecast Editing & Analytics Refresh Design

**Date:** 2026-02-03
**Feature:** Edit Saved Forecasts with Save/Overwrite Options
**Component:** Sales Forecasting Tool

## Overview

Enable users to load saved forecasts and make two types of modifications:
1. **Configuration changes** - Modify parameters (growth rate, method, date range) and regenerate predictions
2. **Value adjustments** - Manually adjust individual revenue values in the adjustment table

When saving, users can choose to overwrite the existing forecast or save as a new forecast.

## Current State

- Users can save forecasts to Firebase
- Users can load saved forecasts (read-only view)
- Users can edit forecast metadata (name/description only)
- Adjustment table exists but doesn't persist changes to loaded forecasts
- Analytics section doesn't auto-refresh after operations

## Design Components

### 1. Edit Mode & UI Indicators

**When a forecast loads:**
- Enter "Edit Mode" showing "Editing: [Forecast Name]"
- Display current configuration in editable inline form:
  - Growth rate (editable input)
  - Forecast method (dropdown)
  - Date range (date pickers)
  - Historical data source
- "Generate Forecast" button label changes to "Regenerate with New Settings"
- "Save Forecast" button becomes split button with dropdown

**Save Button Group:**
```
[Update Forecast ▼]
  - Update Forecast (overwrites existing)
  - Save As New (creates copy)
  - Revert Changes (restores original, shown when modified)
```

### 2. Configuration Editing & Regeneration

**Inline Editing:**
- Form fields populate with saved configuration on load
- Any field modification enables regeneration
- Changes tracked via `configModified` flag

**Regeneration Flow:**
1. User modifies config field(s)
2. Button updates to "Regenerate with New Settings"
3. Click shows confirmation: "This will recalculate the forecast. Any manual adjustments will be lost. Continue?"
4. On confirm:
   - Run forecast engine with new parameters
   - Replace forecastData array
   - Re-render chart and tables
   - Mark as "Modified (unsaved)"
   - Set `configModified = true`

### 3. Manual Value Adjustments

**Adjustment Table:**
- Works with loaded forecasts
- Users can modify individual revenue values
- Changes tracked via `valuesModified` flag
- Adjustments stored in `adjustments` object

**State Tracking:**
```javascript
let configModified = false;   // Config changed and regenerated
let valuesModified = false;   // Manual adjustments applied
```

### 4. Save Options

**Update Forecast (Overwrite):**
1. Click "Update Forecast"
2. Show confirmation modal:
   ```
   Update "February Forecast 2026"?

   Changes:
   • Configuration modified (growth rate: 11.8% → 15%)
   • 3 manual adjustments applied

   [Cancel] [Update Forecast]
   ```
3. On confirm:
   - Call `dataService.updateForecast(forecastId, updatedData)`
   - Preserve forecast ID
   - Update metadata: `lastModified`, `modifiedBy`
   - Refresh analytics
   - Show success message

**Save As New:**
1. Click "Save As New"
2. Show modal with name input:
   ```
   Save as new forecast

   Name: [February Forecast 2026 (Copy)]
   Description: [Modified version with 15% growth]

   [Cancel] [Save New Forecast]
   ```
3. On save:
   - Generate new forecast ID
   - Save with new metadata
   - Keep original unchanged
   - Switch UI to show new forecast as loaded

### 5. Revert Functionality

**State Preservation:**
```javascript
let originalForecastState = null;

// On load, save pristine state
originalForecastState = {
    forecastId: forecastId,
    forecastData: JSON.parse(JSON.stringify(forecastData)), // Deep copy
    config: { ...forecast.config },
    metadata: { ...forecast.metadata }
};
```

**Revert Flow:**
1. Click "Revert Changes" (visible when modified)
2. Show confirmation:
   ```
   Revert all changes?

   This will restore the original forecast data and discard:
   • Configuration changes
   • Manual adjustments

   [Cancel] [Revert]
   ```
3. On confirm:
   - Restore `forecastData` from `originalForecastState`
   - Restore config values in form inputs
   - Clear `adjustments` object
   - Re-render chart and tables
   - Reset flags: `configModified = false`, `valuesModified = false`

### 6. Analytics Auto-Refresh

**Refresh Triggers:**
- After forecast deletion → `deleteSavedForecast()`
- After forecast update → `confirmEditForecastName()` and update saves
- After saving new forecast → `confirmSaveForecast()`

**Implementation:**
```javascript
async function refreshAnalytics(locationId) {
    try {
        showStatus('info', 'Updating analytics...');
        await loadLocationAnalytics();
        console.log('[SalesForecasting] Analytics refreshed');
    } catch (error) {
        console.error('[SalesForecasting] Error refreshing analytics:', error);
    }
}
```

**Loading States:**
- Show subtle spinner in analytics card header
- Non-blocking background operation
- Update metrics when complete

## Data Service Updates

### New Methods Required

**`updateForecast(forecastId, updatedData)`**
- Updates existing forecast in Firebase
- Preserves ID and creation metadata
- Updates `lastModified` timestamp

**`duplicateForecast(forecastId, newName, newDescription)`**
- Creates copy with new ID
- Preserves all predictions and config
- New metadata timestamps

## Implementation Order

1. Add state tracking variables (`originalForecastState`, `configModified`, `valuesModified`)
2. Implement state preservation on forecast load
3. Add split button UI for save options
4. Implement "Update Forecast" with confirmation
5. Implement "Save As New" with name modal
6. Implement "Revert Changes" functionality
7. Add `updateForecast()` and `duplicateForecast()` to SalesDataService
8. Add analytics refresh calls to delete/edit/save operations
9. Update button labels and visibility based on modification state
10. Test complete edit → save → revert cycle

## Success Criteria

- ✅ Can load forecast and modify configuration
- ✅ Regenerate creates new predictions with modified config
- ✅ Can make manual adjustments to individual values
- ✅ "Update Forecast" overwrites with confirmation
- ✅ "Save As New" creates copy with new name
- ✅ "Revert Changes" restores original state
- ✅ Analytics refresh after all operations
- ✅ Clear indication of modified vs. saved state
- ✅ No data loss or orphaned forecasts

## Edge Cases

- User loads forecast, makes changes, then loads different forecast → Prompt to save/discard changes
- User regenerates with invalid config → Show validation errors, don't clear data
- Network error during update → Show error, keep modified state, allow retry
- User tries to overwrite forecast they don't own → Permission check, show error
