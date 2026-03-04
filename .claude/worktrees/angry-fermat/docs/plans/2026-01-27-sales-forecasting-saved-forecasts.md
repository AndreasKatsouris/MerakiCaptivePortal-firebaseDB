# Sales Forecasting Saved Forecasts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ability to view, load, edit, and delete saved forecasts with real-time updates

**Architecture:** Extend SalesDataService with forecast management methods, add UI card above historical data section with real-time Firebase listeners, enhance save dialog to capture name/description

**Tech Stack:** Firebase Realtime Database (onValue listeners), Vanilla JavaScript ES6 modules, Bootstrap 5

---

## Task 1: Enhance SalesDataService with Forecast List Method

**Files:**
- Modify: `public/js/modules/sales-forecasting/sales-data-service.js:194-224`

**Step 1: Add getForecastsList method with real-time listener**

Add after line 181 (after deleteHistoricalData method):

```javascript
/**
 * Get list of forecasts for a location with real-time updates
 * @param {string} locationId - Location ID
 * @param {Function} callback - Callback function(forecasts)
 * @returns {Function} Unsubscribe function
 */
getForecastsList(locationId, callback) {
    console.log('[SalesDataService] Attaching real-time listener for forecasts:', locationId);

    const forecastsRef = ref(rtdb, `forecastIndex/byLocation/${locationId}`);

    const unsubscribe = onValue(forecastsRef, async (snapshot) => {
        const forecasts = [];

        if (snapshot.exists()) {
            const forecastIds = Object.keys(snapshot.val());

            for (const forecastId of forecastIds) {
                try {
                    const forecastRef = ref(rtdb, `forecasts/${forecastId}`);
                    const forecastSnapshot = await get(forecastRef);

                    if (forecastSnapshot.exists()) {
                        const forecast = forecastSnapshot.val();

                        forecasts.push({
                            id: forecastId,
                            name: forecast.metadata?.name || this.generateDefaultName(forecast),
                            description: forecast.metadata?.description || '',
                            savedAt: forecast.metadata?.savedAt || forecast.createdAt,
                            method: forecast.config?.method || 'unknown',
                            horizon: forecast.config?.horizon || 0,
                            summary: forecast.summary || null,
                            accuracy: forecast.accuracy || null,
                            savedAgo: this.getTimeAgo(forecast.metadata?.savedAt || forecast.createdAt)
                        });
                    }
                } catch (error) {
                    console.error('[SalesDataService] Error loading forecast:', forecastId, error);
                }
            }

            // Sort by most recent first
            forecasts.sort((a, b) => b.savedAt - a.savedAt);
        }

        console.log('[SalesDataService] Forecasts updated:', forecasts.length);
        callback(forecasts);
    });

    return unsubscribe;
}
```

**Step 2: Add import for onValue at top of file**

Change line 8 from:
```javascript
import { rtdb, ref, get, set, push, update, remove, query, orderByChild, equalTo } from '../../config/firebase-config.js';
```

To:
```javascript
import { rtdb, ref, get, set, push, update, remove, query, orderByChild, equalTo, onValue } from '../../config/firebase-config.js';
```

**Step 3: Commit the changes**

```bash
cd /c/Users/katso/OneDrive/Documents/GitHub/MerakiCaptivePortal-firebaseDB/.worktrees/feature/sales-forecasting-saved-forecasts
git add public/js/modules/sales-forecasting/sales-data-service.js
git commit -m "feat: add real-time getForecastsList method to SalesDataService"
```

---

## Task 2: Add Helper Methods to SalesDataService

**Files:**
- Modify: `public/js/modules/sales-forecasting/sales-data-service.js:601` (end of file)

**Step 1: Add helper methods before closing brace**

Add before the final `}` of the class:

```javascript
/**
 * Generate default forecast name from metadata
 * @param {Object} forecast - Forecast object
 * @returns {string} Generated name
 */
generateDefaultName(forecast) {
    const method = forecast.config?.method || 'Forecast';
    const date = new Date(forecast.createdAt || Date.now()).toLocaleDateString();
    return `${method} - ${date}`;
}

/**
 * Get human-readable time ago string
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Time ago string
 */
getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return new Date(timestamp).toLocaleDateString();
}

/**
 * Calculate summary metrics from forecast data
 * @param {Array} forecastData - Array of forecast predictions
 * @returns {Object} Summary metrics
 */
calculateForecastSummary(forecastData) {
    if (!forecastData || forecastData.length === 0) {
        return null;
    }

    const totalRevenue = forecastData.reduce((sum, d) => sum + (d.predicted || 0), 0);
    const avgDaily = totalRevenue / forecastData.length;

    const growth = forecastData.length > 1
        ? ((forecastData[forecastData.length - 1].predicted / forecastData[0].predicted - 1) * 100)
        : 0;

    return {
        totalPredictedRevenue: Math.round(totalRevenue),
        avgDailyRevenue: Math.round(avgDaily),
        predictedGrowth: parseFloat(growth.toFixed(1)),
        dateRange: {
            start: forecastData[0]?.date,
            end: forecastData[forecastData.length - 1]?.date
        }
    };
}
```

**Step 2: Commit the helper methods**

```bash
git add public/js/modules/sales-forecasting/sales-data-service.js
git commit -m "feat: add helper methods for forecast name generation and time formatting"
```

---

## Task 3: Add getSavedForecast Method

**Files:**
- Modify: `public/js/modules/sales-forecasting/sales-data-service.js` (after getForecastsList)

**Step 1: Add getSavedForecast method**

Add after the getForecastsList method:

```javascript
/**
 * Get complete saved forecast data
 * @param {string} forecastId - Forecast ID
 * @returns {Promise<Object>} Complete forecast object
 */
async getSavedForecast(forecastId) {
    try {
        console.log('[SalesDataService] Loading saved forecast:', forecastId);

        const forecastRef = ref(rtdb, `forecasts/${forecastId}`);
        const snapshot = await get(forecastRef);

        if (!snapshot.exists()) {
            throw new Error('Forecast not found');
        }

        const forecast = snapshot.val();

        return {
            id: forecastId,
            ...forecast
        };
    } catch (error) {
        console.error('[SalesDataService] Error loading forecast:', error);
        throw error;
    }
}
```

**Step 2: Commit**

```bash
git add public/js/modules/sales-forecasting/sales-data-service.js
git commit -m "feat: add getSavedForecast method to load complete forecast data"
```

---

## Task 4: Add Update and Delete Forecast Methods

**Files:**
- Modify: `public/js/modules/sales-forecasting/sales-data-service.js` (after getSavedForecast)

**Step 1: Add updateForecastMetadata method**

```javascript
/**
 * Update forecast name and description
 * @param {string} forecastId - Forecast ID
 * @param {Object} updates - {name, description}
 * @returns {Promise<void>}
 */
async updateForecastMetadata(forecastId, updates) {
    try {
        console.log('[SalesDataService] Updating forecast metadata:', forecastId);

        const metadataRef = ref(rtdb, `forecasts/${forecastId}/metadata`);

        await update(metadataRef, {
            name: updates.name,
            description: updates.description || '',
            updatedAt: Date.now()
        });

        console.log('[SalesDataService] Forecast metadata updated');
    } catch (error) {
        console.error('[SalesDataService] Error updating forecast metadata:', error);
        throw error;
    }
}

/**
 * Delete a saved forecast
 * @param {string} forecastId - Forecast ID
 * @returns {Promise<void>}
 */
async deleteForecast(forecastId) {
    try {
        console.log('[SalesDataService] Deleting forecast:', forecastId);

        // Get forecast to find location
        const forecastRef = ref(rtdb, `forecasts/${forecastId}`);
        const snapshot = await get(forecastRef);

        if (snapshot.exists()) {
            const forecast = snapshot.val();

            // Remove from location index
            if (forecast.locationId) {
                const locationIndexRef = ref(rtdb, `forecastIndex/byLocation/${forecast.locationId}/${forecastId}`);
                await remove(locationIndexRef);
            }

            // Remove from user index
            const userIndexRef = ref(rtdb, `forecastIndex/byUser/${this.userId}/${forecastId}`);
            await remove(userIndexRef);
        }

        // Remove the forecast
        await remove(forecastRef);

        console.log('[SalesDataService] Forecast deleted');
    } catch (error) {
        console.error('[SalesDataService] Error deleting forecast:', error);
        throw error;
    }
}
```

**Step 2: Commit**

```bash
git add public/js/modules/sales-forecasting/sales-data-service.js
git commit -m "feat: add updateForecastMetadata and deleteForecast methods"
```

---

## Task 5: Enhance saveForecast Method to Support Name/Description

**Files:**
- Modify: `public/js/modules/sales-forecasting/sales-data-service.js:194-224`

**Step 1: Update saveForecast method signature and logic**

Replace the existing saveForecast method (lines 194-224) with:

```javascript
/**
 * Save a forecast
 * @param {string} locationId - Location ID
 * @param {string} salesDataId - Source sales data ID
 * @param {Object} forecast - Forecast data
 * @param {Object} metadata - {name, description, locationName}
 * @returns {Promise<Object>} Save result with forecastId
 */
async saveForecast(locationId, salesDataId, forecast, metadata = {}) {
    try {
        const forecastRef = push(ref(rtdb, 'forecasts'));
        const forecastId = forecastRef.key;
        const timestamp = Date.now();

        // Get location name
        const locationName = metadata.locationName || await this.getLocationName(locationId);

        // Calculate summary
        const summary = this.calculateForecastSummary(forecast.predictions);

        // Prepare the forecast record
        const forecastRecord = {
            locationId,
            locationName,
            userId: this.userId,
            createdAt: timestamp,
            updatedAt: timestamp,
            status: 'active',
            salesDataId,
            historicalDataRef: salesDataId ? `salesData/${salesDataId}` : null,
            config: forecast.config,
            predictions: this.formatPredictions(forecast.predictions),
            metadata: {
                name: metadata.name || this.generateDefaultName(forecast),
                description: metadata.description || '',
                savedAt: timestamp,
                savedBy: this.userId,
                method: forecast.config?.method,
                horizon: forecast.config?.horizon,
                confidenceLevel: forecast.config?.confidenceLevel,
                growthRate: forecast.config?.growthRate
            },
            summary,
            accuracy: null // Populated later when actuals uploaded
        };

        // Save the forecast
        await set(forecastRef, forecastRecord);

        // Update index
        await this.updateForecastIndex(forecastId, locationId);

        console.log('[SalesDataService] Saved forecast:', forecastId);

        return {
            forecastId,
            success: true
        };
    } catch (error) {
        console.error('[SalesDataService] Error saving forecast:', error);
        throw error;
    }
}
```

**Step 2: Commit**

```bash
git add public/js/modules/sales-forecasting/sales-data-service.js
git commit -m "feat: enhance saveForecast to support name, description, and summary"
```

---

## Task 6: Add Load Saved Forecast Card HTML

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html:452-484` (before Load Saved Historical Data card)

**Step 1: Add new card section**

Insert before line 452 (before the "Load Saved Historical Data Card" comment):

```html
        <!-- Load Saved Forecast Card -->
        <div class="card" id="loadSavedForecastCard">
            <h3><i class="fas fa-chart-line me-2"></i>Load Saved Forecast</h3>
            <p class="text-muted mb-3">View and restore previously generated forecasts</p>

            <div class="row">
                <div class="col-md-4">
                    <div class="control-item">
                        <label for="savedForecastLocationSelect"><i class="fas fa-map-marker-alt me-1"></i>Location</label>
                        <select id="savedForecastLocationSelect" class="form-select">
                            <option value="">Select a location...</option>
                        </select>
                    </div>
                </div>
                <div class="col-md-8">
                    <div id="savedForecastListContainer">
                        <div id="savedForecastLoading" class="text-center text-muted py-4 hidden">
                            <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                            Loading saved forecasts...
                        </div>
                        <div id="savedForecastEmpty" class="text-center text-muted py-4">
                            <i class="fas fa-chart-line fa-2x mb-3 d-block"></i>
                            Select a location to view saved forecasts
                        </div>
                        <div id="savedForecastResults" class="hidden">
                            <div class="list-group" id="savedForecastListItems">
                                <!-- Populated dynamically -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

```

**Step 2: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: add Load Saved Forecast card HTML structure"
```

---

## Task 7: Add CSS Styles for Forecast List Items

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html:342-392` (in style section)

**Step 1: Add forecast list styles**

Add after line 392 (after the extended responsive styles):

```css
        /* Saved forecast list styles */
        #savedForecastSection .list-group-item {
            background: #f8f9fa;
            border: none;
            border-radius: 8px;
            margin-bottom: 8px;
            padding: 15px;
            transition: all 0.2s ease;
        }

        #savedForecastSection .list-group-item:hover {
            background: #e9ecef;
            transform: translateX(5px);
        }

        .forecast-list-item {
            background: white;
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 12px;
            border: 2px solid #ecf0f1;
            transition: all 0.2s;
            cursor: pointer;
        }

        .forecast-list-item:hover {
            border-color: #3498db;
            transform: translateX(5px);
            box-shadow: 0 4px 12px rgba(52, 152, 219, 0.15);
        }

        .forecast-list-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .forecast-list-item-title {
            font-weight: 600;
            font-size: 1.05em;
            color: #2c3e50;
        }

        .forecast-list-item-meta {
            font-size: 0.9em;
            color: #7f8c8d;
            margin-bottom: 8px;
        }

        .forecast-list-item-summary {
            display: flex;
            gap: 15px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }

        .forecast-list-item-summary-item {
            font-size: 0.85em;
        }

        .forecast-list-item-summary-label {
            color: #95a5a6;
            margin-right: 4px;
        }

        .forecast-list-item-summary-value {
            color: #2c3e50;
            font-weight: 600;
        }

        .forecast-list-item-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        .forecast-accuracy-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: 600;
        }

        .forecast-accuracy-badge.excellent {
            background: #d4edda;
            color: #155724;
        }

        .forecast-accuracy-badge.good {
            background: #d1ecf1;
            color: #0c5460;
        }

        .forecast-accuracy-badge.fair {
            background: #fff3cd;
            color: #856404;
        }

        .forecast-accuracy-badge.poor {
            background: #f8d7da;
            color: #721c24;
        }

        .forecast-accuracy-badge.pending {
            background: #e2e3e5;
            color: #383d41;
        }
```

**Step 2: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "style: add CSS for forecast list items and badges"
```

---

## Task 8: Add Enhanced Save Forecast Modal HTML

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (add before closing body tag)

**Step 1: Add modal HTML**

Add before the closing `</body>` tag (around line 3000):

```html
    <!-- Save Forecast Modal -->
    <div class="modal fade" id="saveForecastModal" tabindex="-1" aria-labelledby="saveForecastModalLabel" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="saveForecastModalLabel">
                        <i class="fas fa-save me-2"></i>Save Forecast
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p class="text-muted mb-3">Name your forecast for easy reference</p>

                    <div class="mb-3">
                        <label for="forecastNameInput" class="form-label">
                            Forecast Name <span class="text-danger">*</span>
                        </label>
                        <input type="text" class="form-control" id="forecastNameInput"
                               placeholder="e.g., Q1 2026 Conservative Estimate" required>
                        <div class="invalid-feedback">
                            Please provide a name (minimum 3 characters)
                        </div>
                    </div>

                    <div class="mb-3">
                        <label for="forecastDescriptionInput" class="form-label">
                            Description <span class="text-muted">(optional)</span>
                        </label>
                        <textarea class="form-control" id="forecastDescriptionInput" rows="2"
                                  placeholder="e.g., Based on holiday season data"></textarea>
                    </div>

                    <div class="alert alert-info mb-0">
                        <div class="row">
                            <div class="col-6">
                                <strong>📍 Location:</strong> <span id="modalLocationName">-</span>
                            </div>
                            <div class="col-6">
                                <strong>📊 Method:</strong> <span id="modalMethod">-</span>
                            </div>
                        </div>
                        <div class="row mt-2">
                            <div class="col-6">
                                <strong>📅 Period:</strong> <span id="modalPeriod">-</span>
                            </div>
                            <div class="col-6">
                                <strong>💰 Revenue:</strong> <span id="modalRevenue">-</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary-custom" id="confirmSaveForecastBtn">
                        <i class="fas fa-save me-2"></i>Save Forecast
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Edit Forecast Name Modal -->
    <div class="modal fade" id="editForecastNameModal" tabindex="-1" aria-labelledby="editForecastNameModalLabel" aria-hidden="true">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="editForecastNameModalLabel">
                        <i class="fas fa-edit me-2"></i>Edit Forecast Name
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="editForecastNameInput" class="form-label">Forecast Name</label>
                        <input type="text" class="form-control" id="editForecastNameInput" required>
                    </div>

                    <div class="mb-3">
                        <label for="editForecastDescriptionInput" class="form-label">Description</label>
                        <textarea class="form-control" id="editForecastDescriptionInput" rows="2"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary-custom" id="confirmEditForecastNameBtn">
                        <i class="fas fa-save me-2"></i>Save Changes
                    </button>
                </div>
            </div>
        </div>
    </div>
```

**Step 2: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: add save and edit forecast modals"
```

---

## Task 9: Wire Up Saved Forecast Location Selector

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (in loadLocations function, around line 958-982)

**Step 1: Add forecast location selector population**

In the `loadLocations` function, after line 977 (where `savedDataLocationSelect?.appendChild(option2);` is), add:

```javascript
                        // Also add to saved forecast location selector
                        const option3 = document.createElement('option');
                        option3.value = id;
                        option3.textContent = data.name;
                        document.getElementById('savedForecastLocationSelect')?.appendChild(option3);
```

**Step 2: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: populate saved forecast location selector"
```

---

## Task 10: Add Saved Forecast Location Change Handler

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (after saved data location handler, around line 1062)

**Step 1: Add global variable for forecast listener**

Add after line 881 (where `currentSalesDataId` is declared):

```javascript
        let forecastListUnsubscribe = null;
        let currentLoadedForecastId = null;
```

**Step 2: Add location change event listener**

Add after line 1062 (after the saved data location select handler):

```javascript
            // Saved Forecast location selector change
            const savedForecastLocationSelect = document.getElementById('savedForecastLocationSelect');
            savedForecastLocationSelect?.addEventListener('change', async (e) => {
                const locationId = e.target.value;

                // Clean up previous listener
                if (forecastListUnsubscribe) {
                    forecastListUnsubscribe();
                    forecastListUnsubscribe = null;
                }

                if (locationId) {
                    await loadSavedForecastsForLocation(locationId);
                } else {
                    // Clear the list
                    document.getElementById('savedForecastEmpty').classList.remove('hidden');
                    document.getElementById('savedForecastResults').classList.add('hidden');
                }
            });
```

**Step 3: Add cleanup on page unload**

Add after the window load event listener (around line 1075):

```javascript
        // Clean up listeners on page unload
        window.addEventListener('beforeunload', () => {
            if (forecastListUnsubscribe) {
                forecastListUnsubscribe();
            }
        });
```

**Step 4: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: add saved forecast location change handler and cleanup"
```

---

## Task 11: Implement loadSavedForecastsForLocation Function

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (add after loadSavedDataForLocationCard function, around line 2640)

**Step 1: Add function implementation**

```javascript
        /**
         * Load saved forecasts for a location with real-time updates
         */
        async function loadSavedForecastsForLocation(locationId) {
            console.log('[SalesForecasting] Loading saved forecasts for location:', locationId);

            const loadingEl = document.getElementById('savedForecastLoading');
            const emptyEl = document.getElementById('savedForecastEmpty');
            const resultsEl = document.getElementById('savedForecastResults');
            const listEl = document.getElementById('savedForecastListItems');

            loadingEl?.classList.remove('hidden');
            emptyEl?.classList.add('hidden');
            resultsEl?.classList.add('hidden');

            try {
                if (!dataService) {
                    throw new Error('Data service not initialized');
                }

                // Attach real-time listener
                forecastListUnsubscribe = dataService.getForecastsList(locationId, (forecasts) => {
                    loadingEl?.classList.add('hidden');

                    if (!forecasts || forecasts.length === 0) {
                        emptyEl.innerHTML = `
                            <i class="fas fa-chart-line fa-2x mb-3 d-block"></i>
                            <p class="mb-1">No saved forecasts yet for this location</p>
                            <small class="text-muted">Generate a forecast and click "Save Forecast" to store it</small>
                        `;
                        emptyEl.classList.remove('hidden');
                        resultsEl?.classList.add('hidden');
                    } else {
                        renderSavedForecastsList(forecasts);
                        emptyEl?.classList.add('hidden');
                        resultsEl?.classList.remove('hidden');
                    }
                });

            } catch (error) {
                console.error('[SalesForecasting] Error loading saved forecasts:', error);
                loadingEl?.classList.add('hidden');
                emptyEl.innerHTML = `
                    <i class="fas fa-exclamation-triangle fa-2x mb-3 d-block text-danger"></i>
                    <p>Error loading saved forecasts</p>
                    <small>${error.message}</small>
                `;
                emptyEl.classList.remove('hidden');
            }
        }
```

**Step 2: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: implement loadSavedForecastsForLocation with real-time updates"
```

---

## Task 12: Implement renderSavedForecastsList Function

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (after loadSavedForecastsForLocation)

**Step 1: Add render function**

```javascript
        /**
         * Render list of saved forecasts
         */
        function renderSavedForecastsList(forecasts) {
            const listEl = document.getElementById('savedForecastListItems');

            if (!listEl) return;

            listEl.innerHTML = '';

            forecasts.forEach(forecast => {
                const item = document.createElement('div');
                item.className = 'forecast-list-item';

                // Determine accuracy badge
                let accuracyBadge = '<span class="forecast-accuracy-badge pending">Not verified</span>';
                if (forecast.accuracy) {
                    const status = forecast.accuracy.status || 'pending';
                    const mape = forecast.accuracy.mape;
                    accuracyBadge = `<span class="forecast-accuracy-badge ${status}">Accuracy: ${(100 - mape).toFixed(1)}%</span>`;
                }

                // Format method name
                const methodNames = {
                    'movingAverage': 'Moving Average',
                    'exponential': 'Exponential',
                    'seasonalTrend': 'Seasonal Trend',
                    'ml': 'Machine Learning'
                };
                const methodDisplay = methodNames[forecast.method] || forecast.method;

                // Format revenue
                const revenue = forecast.summary?.totalPredictedRevenue || 0;
                const revenueDisplay = `R ${revenue.toLocaleString()}`;

                item.innerHTML = `
                    <div class="forecast-list-item-header">
                        <div class="forecast-list-item-title">${forecast.name}</div>
                        <div>${accuracyBadge}</div>
                    </div>
                    ${forecast.description ? `<div class="text-muted mb-2" style="font-size: 0.9em;">${forecast.description}</div>` : ''}
                    <div class="forecast-list-item-meta">
                        <i class="fas fa-clock me-1"></i>${forecast.savedAgo}
                    </div>
                    <div class="forecast-list-item-summary">
                        <div class="forecast-list-item-summary-item">
                            <span class="forecast-list-item-summary-label">Method:</span>
                            <span class="forecast-list-item-summary-value">${methodDisplay}</span>
                        </div>
                        <div class="forecast-list-item-summary-item">
                            <span class="forecast-list-item-summary-label">Period:</span>
                            <span class="forecast-list-item-summary-value">${forecast.horizon} days</span>
                        </div>
                        <div class="forecast-list-item-summary-item">
                            <span class="forecast-list-item-summary-label">Revenue:</span>
                            <span class="forecast-list-item-summary-value">${revenueDisplay}</span>
                        </div>
                    </div>
                    <div class="forecast-list-item-actions">
                        <button class="btn btn-sm btn-primary-custom" onclick="loadSavedForecast('${forecast.id}')">
                            <i class="fas fa-folder-open me-1"></i>Load
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="editForecastName('${forecast.id}', '${forecast.name.replace(/'/g, "\\'")}', '${(forecast.description || '').replace(/'/g, "\\'")}')">
                            <i class="fas fa-edit me-1"></i>Edit
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteSavedForecast('${forecast.id}')">
                            <i class="fas fa-trash me-1"></i>Delete
                        </button>
                    </div>
                `;

                listEl.appendChild(item);
            });
        }
```

**Step 2: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: implement renderSavedForecastsList with formatted forecast cards"
```

---

## Task 13: Implement loadSavedForecast Function

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (after renderSavedForecastsList)

**Step 1: Add load function**

```javascript
        /**
         * Load a saved forecast
         */
        async function loadSavedForecast(forecastId) {
            try {
                showStatus('info', 'Loading forecast...');
                console.log('[SalesForecasting] Loading forecast:', forecastId);

                const forecast = await dataService.getSavedForecast(forecastId);

                if (!forecast || !forecast.predictions) {
                    throw new Error('No forecast data found');
                }

                // Store current forecast ID
                currentLoadedForecastId = forecastId;

                // Set location
                const locationSelect = document.getElementById('locationSelect');
                if (locationSelect && forecast.locationId) {
                    locationSelect.value = forecast.locationId;
                    locationSelect.dispatchEvent(new Event('change'));
                }

                // Restore forecast data
                forecastData = forecast.predictions.map(p => ({
                    date: p.date,
                    predicted: p.predicted,
                    confidenceLower: p.confidenceLower,
                    confidenceUpper: p.confidenceUpper
                }));

                // Update metrics
                const totalRevenue = forecastData.reduce((sum, d) => sum + d.predicted, 0);
                const avgDaily = totalRevenue / forecastData.length;

                document.getElementById('totalRevenue').textContent = `R ${Math.round(totalRevenue).toLocaleString()}`;
                document.getElementById('avgDailySales').textContent = `R ${Math.round(avgDaily).toLocaleString()}`;

                if (forecast.config?.growthRate) {
                    document.getElementById('growthRateDisplay').textContent = `${forecast.config.growthRate}%`;
                }

                // Show metrics section
                document.getElementById('metricsSection').classList.remove('hidden');

                // Render chart and table
                renderForecastChart();
                renderForecastTable();

                // Enable adjustment and export buttons
                document.getElementById('saveForecastBtn').disabled = false;
                document.getElementById('exportCsvBtn').disabled = false;

                // Show loaded indicator
                showStatus('success', `Loaded forecast: ${forecast.metadata?.name || 'Unnamed Forecast'}`, 5000);

                // If accuracy data exists, show comparison
                if (forecast.accuracy) {
                    document.getElementById('forecastAccuracy').textContent =
                        `${(100 - forecast.accuracy.mape).toFixed(1)}%`;
                }

            } catch (error) {
                console.error('[SalesForecasting] Error loading forecast:', error);
                showStatus('error', `Failed to load forecast: ${error.message}`);
            }
        }
```

**Step 2: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: implement loadSavedForecast to restore forecast visualization"
```

---

## Task 14: Implement editForecastName Function

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (after loadSavedForecast)

**Step 1: Add edit function**

```javascript
        /**
         * Edit forecast name and description
         */
        function editForecastName(forecastId, currentName, currentDescription) {
            console.log('[SalesForecasting] Editing forecast name:', forecastId);

            // Populate modal
            document.getElementById('editForecastNameInput').value = currentName;
            document.getElementById('editForecastDescriptionInput').value = currentDescription;

            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('editForecastNameModal'));
            modal.show();

            // Store forecast ID for confirmation
            window.currentEditingForecastId = forecastId;
        }

        /**
         * Confirm forecast name edit
         */
        async function confirmEditForecastName() {
            const forecastId = window.currentEditingForecastId;

            if (!forecastId) {
                return;
            }

            const name = document.getElementById('editForecastNameInput').value.trim();
            const description = document.getElementById('editForecastDescriptionInput').value.trim();

            if (name.length < 3) {
                showStatus('error', 'Name must be at least 3 characters');
                return;
            }

            try {
                showStatus('info', 'Updating forecast...');

                await dataService.updateForecastMetadata(forecastId, {
                    name,
                    description
                });

                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('editForecastNameModal'));
                modal.hide();

                showStatus('success', 'Forecast updated successfully');

                // Clear editing state
                delete window.currentEditingForecastId;

            } catch (error) {
                console.error('[SalesForecasting] Error updating forecast:', error);
                showStatus('error', `Failed to update: ${error.message}`);
            }
        }
```

**Step 2: Wire up confirm button**

Add event listener in the initialization section (around line 1025):

```javascript
            // Edit forecast name confirmation
            document.getElementById('confirmEditForecastNameBtn')?.addEventListener('click', confirmEditForecastName);
```

**Step 3: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: implement editForecastName with modal dialog"
```

---

## Task 15: Implement deleteSavedForecast Function

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (after editForecastName)

**Step 1: Add delete function**

```javascript
        /**
         * Delete a saved forecast
         */
        async function deleteSavedForecast(forecastId) {
            if (!confirm('Are you sure you want to delete this forecast? This cannot be undone.')) {
                return;
            }

            try {
                showStatus('info', 'Deleting forecast...');
                console.log('[SalesForecasting] Deleting forecast:', forecastId);

                await dataService.deleteForecast(forecastId);

                showStatus('success', 'Forecast deleted successfully');

                // If this was the loaded forecast, clear it
                if (currentLoadedForecastId === forecastId) {
                    currentLoadedForecastId = null;
                }

            } catch (error) {
                console.error('[SalesForecasting] Error deleting forecast:', error);
                showStatus('error', `Failed to delete: ${error.message}`);
            }
        }
```

**Step 2: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: implement deleteSavedForecast with confirmation"
```

---

## Task 16: Enhance saveForecast to Show Modal

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html` (replace saveForecast function, around line 2175)

**Step 1: Replace saveForecast function**

Replace the existing `saveForecast` function with:

```javascript
        /**
         * Show save forecast modal
         */
        async function saveForecast() {
            console.log('[SalesForecasting] Save forecast clicked');
            const locationId = document.getElementById('locationSelect').value;
            const method = document.getElementById('forecastMethod').value;

            if (!locationId) {
                showStatus('error', 'Please select a location first');
                return;
            }

            if (!forecastData || forecastData.length === 0) {
                showStatus('error', 'No forecast data to save. Generate a forecast first.');
                return;
            }

            // Populate modal metadata
            const location = locations.find(l => l.id === locationId);
            document.getElementById('modalLocationName').textContent = location?.name || locationId;

            const methodNames = {
                'movingAverage': 'Moving Average',
                'exponential': 'Exponential',
                'seasonalTrend': 'Seasonal Trend',
                'ml': 'Machine Learning'
            };
            document.getElementById('modalMethod').textContent = methodNames[method] || method;
            document.getElementById('modalPeriod').textContent = `${forecastData.length} days`;

            const totalRevenue = forecastData.reduce((sum, d) => sum + d.predicted, 0);
            document.getElementById('modalRevenue').textContent = `R ${Math.round(totalRevenue).toLocaleString()}`;

            // Generate default name
            const defaultName = `${methodNames[method]} - ${new Date().toLocaleDateString()}`;
            document.getElementById('forecastNameInput').value = defaultName;
            document.getElementById('forecastDescriptionInput').value = '';

            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('saveForecastModal'));
            modal.show();
        }

        /**
         * Confirm save forecast from modal
         */
        async function confirmSaveForecast() {
            const locationId = document.getElementById('locationSelect').value;
            const method = document.getElementById('forecastMethod').value;
            const name = document.getElementById('forecastNameInput').value.trim();
            const description = document.getElementById('forecastDescriptionInput').value.trim();

            if (name.length < 3) {
                document.getElementById('forecastNameInput').classList.add('is-invalid');
                return;
            }

            document.getElementById('forecastNameInput').classList.remove('is-invalid');

            try {
                showStatus('info', 'Saving forecast...');

                if (dataService) {
                    const config = {
                        method: method,
                        horizon: forecastData.length,
                        confidenceLevel: parseInt(document.getElementById('confidenceLevel')?.value || '95'),
                        growthRate: parseFloat(document.getElementById('growthRateInput')?.value || '5')
                    };

                    const forecastPayload = {
                        config,
                        predictions: forecastData.map(d => ({
                            date: d.date,
                            predicted: d.predicted,
                            confidenceLower: d.confidenceLower,
                            confidenceUpper: d.confidenceUpper
                        }))
                    };

                    const location = locations.find(l => l.id === locationId);
                    const metadata = {
                        name,
                        description,
                        locationName: location?.name || 'Unknown'
                    };

                    const result = await dataService.saveForecast(
                        locationId,
                        currentSalesDataId || null,
                        forecastPayload,
                        metadata
                    );

                    currentLoadedForecastId = result.forecastId;

                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('saveForecastModal'));
                    modal.hide();

                    showStatus('success', 'Forecast saved successfully!');

                } else {
                    throw new Error('Data service not initialized');
                }

            } catch (error) {
                console.error('[SalesForecasting] Error saving forecast:', error);
                showStatus('error', `Failed to save: ${error.message}`);
            }
        }
```

**Step 2: Wire up confirm button**

Add event listener in initialization (around line 1025):

```javascript
            // Save forecast confirmation
            document.getElementById('confirmSaveForecastBtn')?.addEventListener('click', confirmSaveForecast);
```

**Step 3: Commit**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: enhance saveForecast to show modal with name/description input"
```

---

## Task 17: Test and Verify Implementation

**Files:**
- None (manual testing)

**Step 1: Test forecast saving with name**

1. Open browser: `http://localhost:5000/tools/admin/sales-forecasting.html`
2. Upload CSV file
3. Generate forecast
4. Click "Save Forecast"
5. Verify modal appears with default name
6. Enter custom name and description
7. Click "Save Forecast" in modal
8. Verify success message

Expected: Forecast saves with name and description

**Step 2: Test forecast list loading**

1. Select location in "Load Saved Forecast" card
2. Verify loading indicator appears
3. Verify forecast list populates with saved forecast
4. Verify forecast shows name, method, period, revenue
5. Verify "Not verified" badge appears

Expected: Forecast list displays correctly

**Step 3: Test loading a forecast**

1. Click "Load" button on saved forecast
2. Verify loading message appears
3. Verify forecast chart renders
4. Verify forecast table appears
5. Verify metrics update
6. Verify success message with forecast name

Expected: Forecast loads and visualizes correctly

**Step 4: Test editing forecast name**

1. Click "Edit" button on forecast
2. Verify modal appears with current name/description
3. Change name to "Test Forecast Edited"
4. Click "Save Changes"
5. Verify modal closes
6. Verify forecast name updates in list automatically

Expected: Real-time update shows new name

**Step 5: Test deleting forecast**

1. Click "Delete" button on forecast
2. Verify confirmation dialog appears
3. Click "OK"
4. Verify forecast disappears from list automatically
5. Verify success message

Expected: Forecast deletes and list updates in real-time

**Step 6: Test real-time updates**

1. Open tool in two browser tabs
2. In tab 1: Save a forecast
3. In tab 2: Verify forecast appears automatically in list
4. In tab 1: Edit forecast name
5. In tab 2: Verify name updates automatically
6. In tab 1: Delete forecast
7. In tab 2: Verify forecast disappears automatically

Expected: All changes sync in real-time across tabs

**Step 7: Manual test checklist**

Run through this checklist:
- [ ] Save forecast with name works
- [ ] Save forecast with description works
- [ ] Default name generates correctly if field empty
- [ ] Forecast list loads for location
- [ ] Forecast list shows correct metadata
- [ ] Load forecast restores visualization
- [ ] Load forecast restores metrics
- [ ] Edit forecast name updates correctly
- [ ] Edit forecast description updates correctly
- [ ] Delete forecast removes from list
- [ ] Real-time updates work across tabs
- [ ] Error messages display for failures
- [ ] Loading states show appropriately
- [ ] Empty states display correctly

**Step 8: Document any issues**

If any issues found, document in this plan and fix before proceeding.

---

## Task 18: Final Integration and Polish

**Files:**
- Modify: `public/tools/admin/sales-forecasting.html`

**Step 1: Add Firebase index requirement check**

Add note in Firebase configuration that forecast indexes are needed:
```
// Required Firebase indexes:
// - forecastIndex/byLocation/{locationId}
// - forecastIndex/byUser/{userId}
```

**Step 2: Test backward compatibility**

1. Find any old forecasts without `metadata.name`
2. Verify they display with auto-generated name
3. Verify they can be loaded
4. Verify summary is calculated on-the-fly

**Step 3: Commit final changes**

```bash
git add public/tools/admin/sales-forecasting.html
git commit -m "feat: finalize saved forecasts feature with backward compatibility"
```

**Step 4: Merge to master**

```bash
cd /c/Users/katso/OneDrive/Documents/GitHub/MerakiCaptivePortal-firebaseDB
git checkout master
git merge feature/sales-forecasting-saved-forecasts --no-ff -m "feat: add saved forecasts management to sales forecasting tool

Complete implementation of saved forecasts feature:
- Real-time forecast list with Firebase listeners
- Enhanced save dialog with name/description
- Load, edit, and delete forecast capabilities
- Backward compatibility with existing forecasts
- Performance optimizations for large forecast collections

Closes brainstorming session for sales forecasting saved forecasts feature"
```

---

## Summary

This plan implements the complete saved forecasts feature in 18 bite-sized tasks:

**Phase 1: Service Layer (Tasks 1-5)**
- Add getForecastsList with real-time listener
- Add helper methods for formatting
- Add getSavedForecast method
- Add update/delete methods
- Enhance saveForecast with metadata

**Phase 2: UI Structure (Tasks 6-8)**
- Add Load Saved Forecast card HTML
- Add CSS styles for forecast list
- Add save/edit modals

**Phase 3: Integration (Tasks 9-10)**
- Wire up location selector
- Add event handlers and cleanup

**Phase 4: Core Functions (Tasks 11-16)**
- Implement load forecasts list
- Implement render list
- Implement load forecast
- Implement edit name
- Implement delete
- Enhance save with modal

**Phase 5: Testing & Polish (Tasks 17-18)**
- Manual testing
- Final integration

Each task is designed to take 2-5 minutes and includes a commit step for incremental progress.

---

**Estimated Total Time**: 2-3 hours
**Ready for Execution**: Yes
