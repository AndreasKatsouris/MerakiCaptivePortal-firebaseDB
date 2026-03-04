# Forecast Editing & Analytics Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable users to edit saved forecasts (config regeneration and manual adjustments) with save/overwrite options and auto-refresh analytics.

**Architecture:** Add state tracking for loaded forecasts, implement split-button save UI, add update/duplicate methods to SalesDataService, and wire analytics refresh to all mutation operations.

**Tech Stack:** Vanilla JS, Firebase Realtime Database, Bootstrap 5 modals

---

## Task 1: Add State Tracking Variables

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html:1074-1080`

**Step 1: Add state tracking variables after existing state variables**

After line 1080 (`let currentLoadedForecastId = null;`), add:

```javascript
// Edit mode state tracking
let originalForecastState = null;  // Pristine state when forecast loads
let configModified = false;         // Config changed and regenerated
let valuesModified = false;         // Manual adjustments applied
```

**Step 2: Verify variables are in global scope**

Check that these are defined at the same level as other global variables like `currentUser`, `historicData`, etc.

**Step 3: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: add state tracking for forecast editing"
```

---

## Task 2: Implement State Preservation on Load

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html:3065-3180` (loadSavedForecast function)

**Step 1: Save original state after forecast loads**

After line 3163 (where forecast is loaded and displayed), before the success status message, add:

```javascript
// Save pristine state for revert functionality
originalForecastState = {
    forecastId: forecastId,
    forecastData: JSON.parse(JSON.stringify(forecastData)), // Deep copy
    config: forecast.config ? { ...forecast.config } : {},
    metadata: forecast.metadata ? { ...forecast.metadata } : {}
};

// Reset modification flags
configModified = false;
valuesModified = false;

console.log('[SalesForecasting] Original state preserved for revert');
```

**Step 2: Test by loading a forecast**

Action: Load a saved forecast in browser
Expected: Console shows "Original state preserved for revert"

**Step 3: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: preserve original forecast state on load"
```

---

## Task 3: Add Split Button UI for Save Options

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (find the Save Forecast button around line 800-900)

**Step 1: Find the existing Save Forecast button**

Search for `id="saveForecastBtn"` in the HTML

**Step 2: Replace single button with Bootstrap split button group**

Replace the existing button with:

```html
<div class="btn-group" role="group">
    <button type="button" class="btn btn-primary-custom" id="saveForecastBtn" disabled>
        <i class="fas fa-save me-2"></i>Save Forecast
    </button>
    <button type="button" class="btn btn-primary-custom dropdown-toggle dropdown-toggle-split"
            id="saveForecastDropdown" data-bs-toggle="dropdown" aria-expanded="false" disabled>
        <span class="visually-hidden">Toggle Dropdown</span>
    </button>
    <ul class="dropdown-menu" aria-labelledby="saveForecastDropdown">
        <li><a class="dropdown-item" href="#" id="updateForecastBtn">
            <i class="fas fa-save me-2"></i>Update Forecast
        </a></li>
        <li><a class="dropdown-item" href="#" id="saveAsNewBtn">
            <i class="fas fa-copy me-2"></i>Save As New
        </a></li>
        <li><hr class="dropdown-divider"></li>
        <li><a class="dropdown-item" href="#" id="revertChangesBtn" style="display: none;">
            <i class="fas fa-undo me-2"></i>Revert Changes
        </a></li>
    </ul>
</div>
```

**Step 3: Update the primary button enable/disable logic**

Find where `saveForecastBtn` is enabled (after forecast generation). Update to also enable dropdown:

```javascript
document.getElementById('saveForecastBtn').disabled = false;
document.getElementById('saveForecastDropdown').disabled = false;
```

**Step 4: Test UI in browser**

Action: Load page and generate/load a forecast
Expected: Split button appears with dropdown containing 3 options (Revert hidden initially)

**Step 5: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: add split button UI for save options"
```

---

## Task 4: Update Button Labels Based on Edit Mode

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (loadSavedForecast function around line 3160)

**Step 1: Change button label to indicate edit mode**

After setting the forecast loaded and before showing success message (around line 3163), add:

```javascript
// Update button labels for edit mode
const saveForecastBtn = document.getElementById('saveForecastBtn');
if (saveForecastBtn) {
    saveForecastBtn.innerHTML = '<i class="fas fa-save me-2"></i>Update Forecast';
}

// Update generate button label
const generateBtn = document.getElementById('generateForecastBtn');
if (generateBtn) {
    generateBtn.innerHTML = '<i class="fas fa-chart-line me-2"></i>Regenerate with New Settings';
}

console.log('[SalesForecasting] Button labels updated for edit mode');
```

**Step 2: Reset button labels when generating new forecast**

Find the `generateForecast` function. At the start, add:

```javascript
// Reset button labels for new forecast mode
const saveForecastBtn = document.getElementById('saveForecastBtn');
if (saveForecastBtn) {
    saveForecastBtn.innerHTML = '<i class="fas fa-save me-2"></i>Save Forecast';
}

const generateBtn = document.getElementById('generateForecastBtn');
if (generateBtn) {
    generateBtn.innerHTML = '<i class="fas fa-chart-line me-2"></i>Generate Forecast';
}
```

**Step 3: Test button label changes**

Action: Generate new forecast, then load saved forecast
Expected: Button changes from "Save Forecast" to "Update Forecast", Generate becomes "Regenerate"

**Step 4: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: update button labels for edit mode"
```

---

## Task 5: Implement Update Forecast Modal

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (add modal HTML after other modals)

**Step 1: Add update confirmation modal HTML**

Find the existing modals section (search for `editForecastNameModal`), and add after it:

```html
<!-- Update Forecast Confirmation Modal -->
<div class="modal fade" id="updateForecastModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Update Forecast</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <p>Update "<strong id="updateForecastName"></strong>"?</p>
                <div class="alert alert-info">
                    <strong>Changes:</strong>
                    <ul id="updateForecastChanges" class="mb-0">
                    </ul>
                </div>
                <p class="text-muted mb-0">This will overwrite the existing forecast.</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="confirmUpdateForecastBtn">Update Forecast</button>
            </div>
        </div>
    </div>
</div>
```

**Step 2: Add click handler for "Update Forecast" dropdown item**

Find where event listeners are set up (around line 1214), and add:

```javascript
document.getElementById('updateForecastBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    showUpdateForecastModal();
});
```

**Step 3: Implement showUpdateForecastModal function**

Add before the window.addEventListener section (around line 3760):

```javascript
/**
 * Show update forecast confirmation modal
 */
function showUpdateForecastModal() {
    if (!currentLoadedForecastId || !originalForecastState) {
        showStatus('error', 'No forecast loaded to update');
        return;
    }

    // Get forecast name
    const forecastName = originalForecastState.metadata?.name || 'Unnamed Forecast';
    document.getElementById('updateForecastName').textContent = forecastName;

    // Build changes list
    const changesList = document.getElementById('updateForecastChanges');
    changesList.innerHTML = '';

    if (configModified) {
        const li = document.createElement('li');
        li.textContent = 'Configuration modified and regenerated';
        changesList.appendChild(li);
    }

    if (valuesModified) {
        const adjustmentCount = Object.keys(adjustments).length;
        const li = document.createElement('li');
        li.textContent = `${adjustmentCount} manual adjustment${adjustmentCount !== 1 ? 's' : ''} applied`;
        changesList.appendChild(li);
    }

    if (!configModified && !valuesModified) {
        const li = document.createElement('li');
        li.textContent = 'No changes detected';
        li.className = 'text-muted';
        changesList.appendChild(li);
    }

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('updateForecastModal'));
    modal.show();
}
```

**Step 4: Test modal display**

Action: Load forecast, make changes, click "Update Forecast" from dropdown
Expected: Modal appears with forecast name and changes list

**Step 5: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: add update forecast confirmation modal"
```

---

## Task 6: Add updateForecast Method to SalesDataService

**Files:**
- Modify: `public/js/modules/sales-forecasting/sales-data-service.js:700-710` (after deleteActuals method)

**Step 1: Add updateForecast method**

After the `deleteActuals` method (around line 707), add:

```javascript
/**
 * Update an existing forecast
 * @param {string} forecastId - Forecast ID to update
 * @param {Object} updatedData - Updated forecast data
 * @returns {Promise<void>}
 */
async updateForecast(forecastId, updatedData) {
    try {
        const forecastRef = ref(rtdb, `forecasts/${forecastId}`);

        // Get existing forecast to preserve creation metadata
        const snapshot = await get(forecastRef);
        if (!snapshot.exists()) {
            throw new Error('Forecast not found');
        }

        const existingForecast = snapshot.val();

        // Prepare update with preserved creation data
        const updatePayload = {
            ...updatedData,
            metadata: {
                ...existingForecast.metadata,
                ...updatedData.metadata,
                createdAt: existingForecast.metadata?.createdAt, // Preserve original
                createdBy: existingForecast.metadata?.createdBy, // Preserve original
                lastModified: Date.now(),
                modifiedBy: this.userId
            }
        };

        await set(forecastRef, updatePayload);

        console.log('[SalesDataService] Updated forecast:', forecastId);
    } catch (error) {
        console.error('[SalesDataService] Error updating forecast:', error);
        throw error;
    }
}
```

**Step 2: Verify method signature and error handling**

Review code to ensure:
- Takes forecastId and updatedData
- Preserves createdAt and createdBy
- Updates lastModified and modifiedBy
- Proper error handling

**Step 3: Commit**

```bash
git add public/js/modules/sales-forecasting/sales-data-service.js
git commit -m "feat: add updateForecast method to SalesDataService"
```

---

## Task 7: Implement Update Forecast Confirmation Handler

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (add confirmUpdateForecast function and event listener)

**Step 1: Add event listener for confirmation button**

In the event listeners section (around line 1232), add:

```javascript
document.getElementById('confirmUpdateForecastBtn')?.addEventListener('click', confirmUpdateForecast);
```

**Step 2: Implement confirmUpdateForecast function**

Add before the window.addEventListener section (around line 3760):

```javascript
/**
 * Confirm and execute forecast update
 */
async function confirmUpdateForecast() {
    const forecastId = currentLoadedForecastId;

    if (!forecastId || !originalForecastState) {
        showStatus('error', 'No forecast loaded to update');
        return;
    }

    try {
        showStatus('info', 'Updating forecast...');

        // Prepare updated forecast data
        const updatedForecast = {
            locationId: originalForecastState.metadata?.locationId,
            predictions: {},
            config: originalForecastState.config,
            metadata: {
                name: originalForecastState.metadata?.name,
                description: originalForecastState.metadata?.description
            }
        };

        // Convert forecastData array to predictions object
        forecastData.forEach(row => {
            const dateStr = row.date.toISOString().split('T')[0];
            updatedForecast.predictions[dateStr] = {
                predicted: row.predicted,
                confidenceLower: row.confidenceLower,
                confidenceUpper: row.confidenceUpper,
                transactionQty: row.transactionQty,
                avgSpend: row.avgSpend
            };
        });

        // Update in Firebase
        await dataService.updateForecast(forecastId, updatedForecast);

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('updateForecastModal'));
        modal.hide();

        // Reset modification flags
        configModified = false;
        valuesModified = false;
        adjustments = {};

        // Update original state to current state
        originalForecastState.forecastData = JSON.parse(JSON.stringify(forecastData));
        originalForecastState.config = { ...updatedForecast.config };

        // Hide revert button
        document.getElementById('revertChangesBtn').style.display = 'none';

        showStatus('success', 'Forecast updated successfully');

        // Refresh analytics
        const locationId = updatedForecast.locationId;
        if (locationId) {
            await refreshAnalytics(locationId);
        }

    } catch (error) {
        console.error('[SalesForecasting] Error updating forecast:', error);
        showStatus('error', `Failed to update forecast: ${error.message}`);
    }
}
```

**Step 3: Test update flow**

Action: Load forecast, make changes, click Update Forecast, confirm
Expected: Forecast updates in Firebase, success message shown, modification flags reset

**Step 4: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: implement update forecast confirmation handler"
```

---

## Task 8: Implement Save As New Modal

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (add modal HTML and handlers)

**Step 1: Add Save As New modal HTML**

After the updateForecastModal, add:

```html
<!-- Save As New Forecast Modal -->
<div class="modal fade" id="saveAsNewModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Save as New Forecast</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label for="saveAsNewNameInput" class="form-label">Forecast Name</label>
                    <input type="text" class="form-control" id="saveAsNewNameInput"
                           placeholder="Enter forecast name" required>
                </div>
                <div class="mb-3">
                    <label for="saveAsNewDescriptionInput" class="form-label">Description (Optional)</label>
                    <textarea class="form-control" id="saveAsNewDescriptionInput"
                              rows="3" placeholder="Enter description"></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="confirmSaveAsNewBtn">Save New Forecast</button>
            </div>
        </div>
    </div>
</div>
```

**Step 2: Add click handler for "Save As New" dropdown item**

In event listeners section:

```javascript
document.getElementById('saveAsNewBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    showSaveAsNewModal();
});
```

**Step 3: Implement showSaveAsNewModal function**

```javascript
/**
 * Show save as new forecast modal
 */
function showSaveAsNewModal() {
    if (!forecastData || forecastData.length === 0) {
        showStatus('error', 'No forecast data to save');
        return;
    }

    // Pre-populate with copy of current name if editing
    let suggestedName = '';
    if (currentLoadedForecastId && originalForecastState) {
        const originalName = originalForecastState.metadata?.name || 'Unnamed Forecast';
        suggestedName = `${originalName} (Copy)`;
    } else {
        const location = locations.find(l => l.id === document.getElementById('locationSelect')?.value);
        const locationName = location?.name || 'Unknown Location';
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        suggestedName = `${locationName} - ${dateStr} Forecast`;
    }

    document.getElementById('saveAsNewNameInput').value = suggestedName;
    document.getElementById('saveAsNewDescriptionInput').value = '';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('saveAsNewModal'));
    modal.show();
}
```

**Step 4: Test modal display**

Action: Load forecast, click "Save As New" from dropdown
Expected: Modal appears with pre-filled name "(Copy)" appended

**Step 5: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: add save as new forecast modal"
```

---

## Task 9: Implement Save As New Confirmation Handler

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html`

**Step 1: Add event listener**

```javascript
document.getElementById('confirmSaveAsNewBtn')?.addEventListener('click', confirmSaveAsNew);
```

**Step 2: Implement confirmSaveAsNew function**

```javascript
/**
 * Confirm and save as new forecast
 */
async function confirmSaveAsNew() {
    const name = document.getElementById('saveAsNewNameInput').value.trim();
    const description = document.getElementById('saveAsNewDescriptionInput').value.trim();

    if (name.length < 3) {
        showStatus('error', 'Name must be at least 3 characters');
        return;
    }

    try {
        showStatus('info', 'Saving new forecast...');

        const locationId = document.getElementById('locationSelect')?.value;
        if (!locationId) {
            throw new Error('No location selected');
        }

        // Prepare forecast data (reuse existing save logic structure)
        const forecastToSave = {
            locationId: locationId,
            predictions: {},
            config: {
                growthRate: parseFloat(document.getElementById('growthRate')?.value || 0),
                method: document.getElementById('forecastMethod')?.value || 'linear',
                startDate: document.getElementById('forecastStartDate')?.value,
                endDate: document.getElementById('forecastEndDate')?.value,
                salesDataId: currentSalesDataId
            },
            metadata: {
                name: name,
                description: description,
                createdAt: Date.now(),
                createdBy: currentUser.uid
            }
        };

        // Convert forecastData to predictions object
        forecastData.forEach(row => {
            const dateStr = row.date.toISOString().split('T')[0];
            forecastToSave.predictions[dateStr] = {
                predicted: row.predicted,
                confidenceLower: row.confidenceLower,
                confidenceUpper: row.confidenceUpper,
                transactionQty: row.transactionQty,
                avgSpend: row.avgSpend
            };
        });

        // Save as new forecast
        const result = await dataService.saveForecast(forecastToSave);

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('saveAsNewModal'));
        modal.hide();

        // Update UI to show this as the loaded forecast
        currentLoadedForecastId = result.forecastId;
        currentForecastId = result.forecastId;

        // Save new state as original
        originalForecastState = {
            forecastId: result.forecastId,
            forecastData: JSON.parse(JSON.stringify(forecastData)),
            config: { ...forecastToSave.config },
            metadata: { ...forecastToSave.metadata }
        };

        // Reset modification flags
        configModified = false;
        valuesModified = false;
        adjustments = {};

        // Update button label
        document.getElementById('saveForecastBtn').innerHTML = '<i class="fas fa-save me-2"></i>Update Forecast';

        showStatus('success', `New forecast "${name}" saved successfully`);

        // Refresh analytics
        await refreshAnalytics(locationId);

    } catch (error) {
        console.error('[SalesForecasting] Error saving new forecast:', error);
        showStatus('error', `Failed to save forecast: ${error.message}`);
    }
}
```

**Step 3: Test save as new flow**

Action: Load forecast, modify, click "Save As New", enter name, confirm
Expected: New forecast created with new ID, original unchanged

**Step 4: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: implement save as new forecast handler"
```

---

## Task 10: Implement Revert Changes Functionality

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html`

**Step 1: Add click handler for revert button**

```javascript
document.getElementById('revertChangesBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    showRevertConfirmation();
});
```

**Step 2: Implement showRevertConfirmation function**

```javascript
/**
 * Show revert changes confirmation
 */
function showRevertConfirmation() {
    if (!originalForecastState) {
        showStatus('error', 'No original state to revert to');
        return;
    }

    if (!configModified && !valuesModified) {
        showStatus('info', 'No changes to revert');
        return;
    }

    const confirmed = confirm(
        'Revert all changes?\n\n' +
        'This will restore the original forecast data and discard:\n' +
        (configModified ? '• Configuration changes\n' : '') +
        (valuesModified ? '• Manual adjustments\n' : '')
    );

    if (confirmed) {
        revertChanges();
    }
}
```

**Step 3: Implement revertChanges function**

```javascript
/**
 * Revert all changes to original loaded state
 */
function revertChanges() {
    try {
        // Restore forecast data
        forecastData = JSON.parse(JSON.stringify(originalForecastState.forecastData));

        // Restore config values in form
        if (originalForecastState.config) {
            const growthRateInput = document.getElementById('growthRate');
            if (growthRateInput && originalForecastState.config.growthRate !== undefined) {
                growthRateInput.value = originalForecastState.config.growthRate;
            }

            const methodSelect = document.getElementById('forecastMethod');
            if (methodSelect && originalForecastState.config.method) {
                methodSelect.value = originalForecastState.config.method;
            }
        }

        // Clear adjustments
        adjustments = {};

        // Reset modification flags
        configModified = false;
        valuesModified = false;

        // Re-render everything
        renderForecastChart();
        renderForecastTable();
        renderAdjustmentTable();

        // Hide revert button
        document.getElementById('revertChangesBtn').style.display = 'none';

        showStatus('success', 'Changes reverted to original state');
        console.log('[SalesForecasting] Reverted to original state');

    } catch (error) {
        console.error('[SalesForecasting] Error reverting changes:', error);
        showStatus('error', 'Failed to revert changes');
    }
}
```

**Step 4: Show/hide revert button based on modification state**

Create a helper function:

```javascript
/**
 * Update revert button visibility based on modification state
 */
function updateRevertButtonVisibility() {
    const revertBtn = document.getElementById('revertChangesBtn');
    if (revertBtn) {
        if (configModified || valuesModified) {
            revertBtn.style.display = 'block';
        } else {
            revertBtn.style.display = 'none';
        }
    }
}
```

**Step 5: Call updateRevertButtonVisibility when modifications occur**

Add calls after setting `configModified = true` or `valuesModified = true`

**Step 6: Test revert functionality**

Action: Load forecast, make changes, click Revert
Expected: Forecast restored to original state, revert button hidden

**Step 7: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: implement revert changes functionality"
```

---

## Task 11: Track Configuration Modifications

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (generateForecast function)

**Step 1: Set configModified flag when regenerating loaded forecast**

In the `generateForecast` function, after successful forecast generation, add:

```javascript
// If we're regenerating a loaded forecast, mark config as modified
if (currentLoadedForecastId && originalForecastState) {
    configModified = true;
    updateRevertButtonVisibility();
    console.log('[SalesForecasting] Config modified - regenerated with new settings');
}
```

**Step 2: Clear adjustments when regenerating**

In the same location:

```javascript
// Clear manual adjustments when regenerating
if (configModified) {
    adjustments = {};
    valuesModified = false;
    console.log('[SalesForecasting] Manual adjustments cleared due to regeneration');
}
```

**Step 3: Test config modification tracking**

Action: Load forecast, change growth rate, regenerate
Expected: Console shows config modified, revert button appears

**Step 4: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: track configuration modifications on regenerate"
```

---

## Task 12: Track Manual Value Adjustments

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (saveAdjustments function, if exists, or adjustment handling code)

**Step 1: Find where adjustments are saved**

Search for where the adjustment table values are captured (likely in a saveAdjustments function or similar)

**Step 2: Set valuesModified flag when adjustments are made**

In the adjustment save handler, add:

```javascript
// Mark values as modified
valuesModified = true;
updateRevertButtonVisibility();
console.log('[SalesForecasting] Values modified - manual adjustments applied');
```

**Step 3: Test value modification tracking**

Action: Load forecast, modify revenue value in adjustment table, save
Expected: valuesModified flag set, revert button appears

**Step 4: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: track manual value adjustments"
```

---

## Task 13: Implement refreshAnalytics Function

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (add before window.addEventListener section)

**Step 1: Implement refreshAnalytics function**

Add before line 3768:

```javascript
/**
 * Refresh analytics for a location
 * @param {string} locationId - Location ID to refresh analytics for
 */
async function refreshAnalytics(locationId) {
    if (!locationId) {
        console.warn('[SalesForecasting] Cannot refresh analytics: no location ID');
        return;
    }

    try {
        console.log('[SalesForecasting] Refreshing analytics for location:', locationId);
        await loadLocationAnalytics();
    } catch (error) {
        console.error('[SalesForecasting] Error refreshing analytics:', error);
        // Don't show error to user - analytics refresh is non-critical
    }
}
```

**Step 2: Verify loadLocationAnalytics function exists**

Search for `async function loadLocationAnalytics()` to confirm it exists

**Step 3: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: implement refreshAnalytics function"
```

---

## Task 14: Add Analytics Refresh to Delete Operations

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (deleteSavedForecast function)

**Step 1: Add analytics refresh after successful deletion**

In `deleteSavedForecast` function (around line 3238), after successful deletion and before showing success message, add:

```javascript
// Refresh analytics after deletion
const locationId = document.getElementById('savedForecastLocationSelect')?.value;
if (locationId) {
    await refreshAnalytics(locationId);
}
```

**Step 2: Test analytics refresh on delete**

Action: Delete a forecast
Expected: Analytics section updates, console shows "Refreshing analytics"

**Step 3: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: refresh analytics after forecast deletion"
```

---

## Task 15: Add Analytics Refresh to Edit Operations

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (confirmEditForecastName function)

**Step 1: Add analytics refresh after forecast name edit**

In `confirmEditForecastName` function (around line 3197), after successful update, add:

```javascript
// Refresh analytics after edit
const locationId = document.getElementById('savedForecastLocationSelect')?.value;
if (locationId) {
    await refreshAnalytics(locationId);
}
```

**Step 2: Test analytics refresh on edit**

Action: Edit forecast name
Expected: Analytics section updates

**Step 3: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: refresh analytics after forecast name edit"
```

---

## Task 16: Add Analytics Refresh to New Forecast Save

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (confirmSaveForecast function)

**Step 1: Find confirmSaveForecast function**

Search for the existing function that saves new forecasts

**Step 2: Add analytics refresh after successful save**

After the forecast is saved successfully, add:

```javascript
// Refresh analytics after saving new forecast
const locationId = document.getElementById('locationSelect')?.value;
if (locationId) {
    await refreshAnalytics(locationId);
}
```

**Step 3: Test analytics refresh on new save**

Action: Generate and save a new forecast
Expected: Analytics section updates

**Step 4: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: refresh analytics after saving new forecast"
```

---

## Task 17: Expose New Functions to Global Scope

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html:3760-3766`

**Step 1: Add new functions to window object**

After the existing window assignments, add:

```javascript
window.showUpdateForecastModal = showUpdateForecastModal;
window.showSaveAsNewModal = showSaveAsNewModal;
window.showRevertConfirmation = showRevertConfirmation;
window.confirmUpdateForecast = confirmUpdateForecast;
window.confirmSaveAsNew = confirmSaveAsNew;
window.revertChanges = revertChanges;
window.updateRevertButtonVisibility = updateRevertButtonVisibility;
```

**Step 2: Verify functions are accessible**

Test in browser console: `typeof window.showUpdateForecastModal` should return "function"

**Step 3: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: expose edit functions to global scope"
```

---

## Task 18: Integration Testing

**Files:**
- Test: `public/tools/admin/sales-forecasting.html` (manual browser testing)

**Step 1: Test complete edit → update flow**

1. Load a saved forecast
2. Modify growth rate
3. Click "Regenerate with New Settings"
4. Verify forecast changes
5. Click "Update Forecast" from dropdown
6. Confirm update
7. Verify forecast saved with same ID

Expected: Forecast updates successfully, analytics refresh

**Step 2: Test complete edit → save as new flow**

1. Load a saved forecast
2. Make manual adjustments in adjustment table
3. Click "Save As New" from dropdown
4. Enter new name
5. Confirm save
6. Verify original forecast unchanged
7. Verify new forecast created

Expected: New forecast with new ID, original preserved

**Step 3: Test revert flow**

1. Load a saved forecast
2. Make changes (config or values)
3. Verify revert button appears
4. Click "Revert Changes"
5. Confirm revert
6. Verify original data restored

Expected: All changes discarded, revert button hidden

**Step 4: Test analytics refresh**

1. Delete a forecast
2. Check analytics section updates
3. Edit forecast name
4. Check analytics section updates
5. Save new forecast
6. Check analytics section updates

Expected: Analytics reflect changes immediately

**Step 5: Document any issues found**

Create notes on any bugs or unexpected behavior

**Step 6: Commit test documentation**

```bash
git add -A
git commit -m "test: complete integration testing for forecast editing"
```

---

## Task 19: Edge Case Handling

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html`

**Step 1: Handle loading different forecast while editing**

In `loadSavedForecast` function, at the start, add:

```javascript
// Check if there are unsaved changes
if (currentLoadedForecastId && (configModified || valuesModified)) {
    const confirmed = confirm(
        'You have unsaved changes to the current forecast.\n\n' +
        'Do you want to discard these changes and load a different forecast?'
    );

    if (!confirmed) {
        return; // Cancel loading
    }
}
```

**Step 2: Add permission check in updateForecast**

In `confirmUpdateForecast`, before updating, add:

```javascript
// Check if user owns the forecast
if (originalForecastState.metadata?.createdBy !== currentUser.uid) {
    showStatus('error', 'You do not have permission to update this forecast');
    return;
}
```

**Step 3: Handle network errors gracefully**

Wrap update/save operations with try-catch and show retry option:

```javascript
catch (error) {
    console.error('[SalesForecasting] Error updating forecast:', error);
    const retry = confirm(`Failed to update forecast: ${error.message}\n\nWould you like to retry?`);
    if (retry) {
        confirmUpdateForecast(); // Retry
    }
}
```

**Step 4: Test edge cases**

Test each scenario manually

**Step 5: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: add edge case handling for forecast editing"
```

---

## Task 20: Final Code Review and Cleanup

**Files:**
- Review: All modified files

**Step 1: Review all console.log statements**

Ensure all logging is helpful and consistent with `[SalesForecasting]` prefix

**Step 2: Check for any TODO or FIXME comments**

Address or document any remaining issues

**Step 3: Verify all functions have proper error handling**

Each async function should have try-catch

**Step 4: Run through complete user flow one more time**

Generate → Save → Load → Edit → Update → Revert → Save As New

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and code review for forecast editing"
```

---

## Success Criteria Verification

After completing all tasks, verify:

- ✅ Can load forecast and modify configuration
- ✅ Regenerate creates new predictions with modified config
- ✅ Can make manual adjustments to individual values
- ✅ "Update Forecast" overwrites with confirmation
- ✅ "Save As New" creates copy with new name
- ✅ "Revert Changes" restores original state
- ✅ Analytics refresh after all operations
- ✅ Clear indication of modified vs. saved state
- ✅ No data loss or orphaned forecasts

## Files Modified

- `public/tools/admin/sales-forecasting.html` - Main UI and logic
- `public/js/modules/sales-forecasting/sales-data-service.js` - Backend service methods

## Estimated Implementation Time

20 tasks × 3-5 minutes average = 60-100 minutes total
