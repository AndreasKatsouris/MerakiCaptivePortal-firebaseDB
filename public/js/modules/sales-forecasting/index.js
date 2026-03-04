/**
 * Sales Forecasting Module - Entry Point
 * 
 * This module provides sales forecasting functionality with:
 * - Historical sales data management
 * - Multiple forecasting algorithms
 * - Forecast adjustments
 * - Actuals comparison and accuracy analytics
 * - Machine learning-based improvements
 */

import { SalesDataService, getPredictionRevenue } from './sales-data-service.js';
import { ForecastEngine } from './forecast-engine.js';
import { ForecastAnalytics } from './forecast-analytics.js';
import ChartConfig, { Chart } from './chart-config.js';

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Normalize date string to YYYY-MM-DD, detecting DD/MM/YYYY vs MM/DD/YYYY
 */
function normalizeDate(dateStr) {
    if (!dateStr) return null;
    const str = dateStr.trim();

    // Already ISO YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // YYYY/MM/DD or YYYY-MM-DD with slashes (safe: no timezone ambiguity)
    const isoSlash = str.match(/^(\d{4})[\/](\d{2})[\/](\d{2})$/);
    if (isoSlash) {
        return `${isoSlash[1]}-${isoSlash[2]}-${isoSlash[3]}`;
    }

    // DD/MM/YYYY or MM/DD/YYYY
    const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
        const [, a, b, year] = match;
        const numA = parseInt(a, 10);
        const numB = parseInt(b, 10);

        if (numA > 12) {
            return `${year}-${String(numB).padStart(2, '0')}-${String(numA).padStart(2, '0')}`;
        }
        if (numB > 12) {
            return `${year}-${String(numA).padStart(2, '0')}-${String(numB).padStart(2, '0')}`;
        }
        // Ambiguous: prefer DD/MM/YYYY (South African standard)
        return `${year}-${String(numB).padStart(2, '0')}-${String(numA).padStart(2, '0')}`;
    }

    // Last resort — force local-time parse to avoid UTC midnight offset
    const d = new Date(str + (str.includes('T') ? '' : 'T00:00:00'));
    if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    return null;
}

/**
 * Parse CSV text into { headers, rows } with robust handling of
 * BOM, line endings, delimiter detection, and quoted fields
 */
function parseCsv(text) {
    const cleanText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleanText.split('\n').filter(row => row.trim());

    if (lines.length === 0) return { headers: [], rows: [] };

    const delimiter = lines[0].includes(';') ? ';' : ',';

    const parseRow = (row) => {
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < row.length; i++) {
            const ch = row[i];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === delimiter && !inQuotes) {
                fields.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        fields.push(current.trim());
        return fields;
    };

    const headers = parseRow(lines[0]).map(h => h.toLowerCase());
    const rows = lines.slice(1).map(line => parseRow(line));

    return { headers, rows };
}

export class SalesForecastingModule {
    /**
     * Initialize the Sales Forecasting Module
     * @param {Object} options - Configuration options
     * @param {string} options.containerId - DOM container ID for the UI
     * @param {Array} options.locations - User's locations
     * @param {string} options.userId - Current user ID
     * @param {boolean} options.isAdmin - Whether user is admin (cross-location access)
     */
    constructor(options = {}) {
        this.containerId = options.containerId || 'sales-forecasting-container';
        this.locations = options.locations || [];
        this.userId = options.userId;
        this.isAdmin = options.isAdmin || false;

        // Initialize services
        this.dataService = new SalesDataService(this.userId);
        this.forecastEngine = new ForecastEngine();
        this.analytics = new ForecastAnalytics(this.userId);

        // State - auto-select if user has exactly one location
        this.currentLocation = this.locations.length === 1 ? this.locations[0].id : null;
        this.historicalData = [];
        this.savedDataSets = [];
        this.savedForecasts = [];
        this.currentForecast = null;
        this.currentView = 'upload'; // 'upload', 'forecast', 'adjust', 'compare', 'analytics'
        this.historicalFilter = 'all'; // period filter for historical viewer
        this.historicalCustomStart = null; // custom range start (YYYY-MM-DD)
        this.historicalCustomEnd = null;   // custom range end (YYYY-MM-DD)

        // Forecast form config — persisted across re-renders
        this.forecastConfig = {
            method: 'seasonal',
            horizon: '30',
            confidenceLevel: '95',
            growthRate: 5,
            customStartDate: null,
            customEndDate: null
        };

        // Chart instances for cleanup
        this.chartInstances = {
            forecast: null,
            comparison: null,
            methodPerformance: null,
            seasonal: null
        };

        // Chart configuration
        this.chartConfig = ChartConfig;

        console.log('[SalesForecastingModule] Initialized');
    }

    showLoading(message = 'Loading...') {
        const container = document.getElementById(this.containerId);
        if (!container) return;
        let overlay = container.querySelector('.sf-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sf-loading-overlay';
            overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.8);display:flex;align-items:center;justify-content:center;z-index:100;';
            container.style.position = 'relative';
            container.appendChild(overlay);
        }
        overlay.innerHTML = `<div class="text-center"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">${escapeHtml(message)}</p></div>`;
        overlay.style.display = 'flex';
    }

    hideLoading() {
        const container = document.getElementById(this.containerId);
        const overlay = container?.querySelector('.sf-loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    /**
     * Switch visible tab panel without full DOM re-render
     */
    switchTab(view) {
        this.currentView = view;
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.querySelectorAll('.sf-panel').forEach(panel => {
            panel.style.display = panel.dataset.panel === view ? 'block' : 'none';
        });

        container.querySelectorAll('.sf-tabs .nav-link').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === view);
        });

        if (view === 'analytics') {
            requestAnimationFrame(() => this.renderAnalyticsTab());
        }
    }

    /**
     * Initialize the module and render initial UI
     */
    async initialize() {
        try {
            // Load saved data for user's locations
            await this.loadSavedData();

            // Load analytics data for recommendations
            await this.loadAnalytics();

            // Render the main interface
            this.render();

            console.log('[SalesForecastingModule] Ready');
        } catch (error) {
            console.error('[SalesForecastingModule] Initialization error:', error);
            this.renderError(error.message);
        }
    }

    /**
     * Load saved historical data sets and forecasts
     */
    async loadSavedData() {
        this.savedDataSets = [];
        this.savedForecasts = [];

        if (this.isAdmin) {
            // Admin can see all locations - fetch in parallel to avoid N+1
            const results = await Promise.all(
                this.locations.map(loc => Promise.all([
                    this.dataService.getHistoricalDataList(loc.id),
                    this.dataService.getSavedForecastsList(loc.id)
                ]))
            );
            for (const [data, forecasts] of results) {
                this.savedDataSets.push(...data);
                this.savedForecasts.push(...forecasts);
            }
        } else if (this.currentLocation) {
            // User sees only selected location - fetch both in parallel
            const [data, forecasts] = await Promise.all([
                this.dataService.getHistoricalDataList(this.currentLocation),
                this.dataService.getSavedForecastsList(this.currentLocation)
            ]);
            this.savedDataSets = data;
            this.savedForecasts = forecasts;
        }
    }

    /**
     * Load analytics data for forecast recommendations
     */
    async loadAnalytics() {
        if (this.currentLocation) {
            const analytics = await this.analytics.getLocationAnalytics(this.currentLocation);
            this.forecastEngine.setAnalyticsData(analytics);
        }
    }

    /**
     * Set current location
     * @param {string} locationId - Location ID
     */
    async setLocation(locationId) {
        this.currentLocation = locationId;
        await this.loadSavedData();
        await this.loadAnalytics();
        this.render();
    }

    /**
     * Upload and save historical data
     * @param {Array} data - Parsed sales data
     * @param {Object} metadata - Upload metadata
     */
    async uploadHistoricalData(data, metadata = {}) {
        try {
            const result = await this.dataService.saveHistoricalData(
                this.currentLocation,
                data,
                metadata
            );

            // Refresh saved data list
            await this.loadSavedData();

            return result;
        } catch (error) {
            console.error('[SalesForecastingModule] Upload error:', error);
            throw error;
        }
    }

    /**
     * Generate a forecast
     * @param {Object} config - Forecast configuration
     */
    async generateForecast(config) {
        try {
            // Use forecast engine to generate predictions
            const forecast = await this.forecastEngine.generateForecast(
                this.historicalData,
                config
            );

            // Convert predictions array to date-keyed object
            const predictionsMap = {};
            if (Array.isArray(forecast.predictions)) {
                for (const pred of forecast.predictions) {
                    const dateStr = pred.date instanceof Date
                        ? pred.date.toISOString().split('T')[0]
                        : String(pred.date).split('T')[0];
                    predictionsMap[dateStr] = { ...pred, date: dateStr };
                }
            } else {
                Object.assign(predictionsMap, forecast.predictions || {});
            }

            this.currentForecast = {
                ...forecast,
                predictions: predictionsMap,
                config,
                locationId: this.currentLocation,
                createdAt: Date.now(),
                status: 'draft'
            };

            return this.currentForecast;
        } catch (error) {
            console.error('[SalesForecastingModule] Forecast error:', error);
            throw error;
        }
    }

    /**
     * Save current forecast to database
     * @param {string} salesDataId - Reference to source data
     */
    async saveForecast(salesDataId) {
        if (!this.currentForecast) {
            throw new Error('No forecast to save');
        }

        try {
            const result = await this.dataService.saveForecast(
                this.currentLocation,
                salesDataId,
                this.currentForecast
            );

            this.currentForecast.id = result.forecastId;
            this.currentForecast.status = 'active';

            return result;
        } catch (error) {
            console.error('[SalesForecastingModule] Save forecast error:', error);
            throw error;
        }
    }

    /**
     * Update forecast adjustments
     * @param {Object} adjustments - Day-by-day adjustments
     */
    async updateAdjustments(adjustments) {
        if (!this.currentForecast?.id) {
            throw new Error('Forecast must be saved before adjusting');
        }

        try {
            await this.dataService.updateForecastAdjustments(
                this.currentForecast.id,
                adjustments
            );

            // Update local state immutably
            const updatedPredictions = { ...this.currentForecast.predictions };
            Object.entries(adjustments).forEach(([date, adjustment]) => {
                if (updatedPredictions[date]) {
                    updatedPredictions[date] = {
                        ...updatedPredictions[date],
                        adjusted: adjustment
                    };
                }
            });

            this.currentForecast = {
                ...this.currentForecast,
                predictions: updatedPredictions
            };

            return this.currentForecast;
        } catch (error) {
            console.error('[SalesForecastingModule] Adjustment error:', error);
            throw error;
        }
    }

    /**
     * Upload actual sales data for comparison
     * @param {Array} actuals - Actual sales data
     */
    async uploadActuals(actuals) {
        if (!this.currentForecast?.id) {
            throw new Error('No forecast to compare against');
        }

        try {
            const result = await this.dataService.saveActuals(
                this.currentForecast.id,
                actuals
            );

            // Trigger accuracy calculation
            const comparison = await this.analytics.calculateAccuracy(
                this.currentForecast.id,
                result.actualId
            );

            return comparison;
        } catch (error) {
            console.error('[SalesForecastingModule] Actuals upload error:', error);
            throw error;
        }
    }

    /**
     * Render the main interface
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error('[SalesForecastingModule] Container not found:', this.containerId);
            return;
        }

        // Destroy existing chart instances to prevent memory leaks
        this.destroyAllCharts();

        container.innerHTML = this.getTemplate();
        this.attachEventListeners();
    }

    /**
     * Get the main template HTML
     */
    getTemplate() {
        return `
            <div class="sales-forecasting-module">
                <!-- Header with location selector -->
                <div class="sf-header">
                    <h2><i class="fas fa-chart-line me-2"></i>Sales Forecasting</h2>
                    <div class="sf-location-selector">
                        <label for="sf-location">Location:</label>
                        <select id="sf-location" class="form-select">
                            <option value="">Select a location...</option>
                            ${this.locations.map(loc => `
                                <option value="${escapeHtml(loc.id)}" ${loc.id === this.currentLocation ? 'selected' : ''}>
                                    ${escapeHtml(loc.name)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
                
                <!-- Navigation tabs -->
                <ul class="nav nav-tabs sf-tabs" role="tablist">
                    <li class="nav-item">
                        <button class="nav-link ${this.currentView === 'upload' ? 'active' : ''}" 
                                data-view="upload">
                            <i class="fas fa-upload me-1"></i> Data
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link ${this.currentView === 'forecast' ? 'active' : ''}" 
                                data-view="forecast">
                            <i class="fas fa-chart-area me-1"></i> Forecast
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link ${this.currentView === 'adjust' ? 'active' : ''}" 
                                data-view="adjust">
                            <i class="fas fa-edit me-1"></i> Adjust
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link ${this.currentView === 'compare' ? 'active' : ''}" 
                                data-view="compare">
                            <i class="fas fa-balance-scale me-1"></i> Compare
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link ${this.currentView === 'analytics' ? 'active' : ''}" 
                                data-view="analytics">
                            <i class="fas fa-brain me-1"></i> Analytics
                        </button>
                    </li>
                </ul>
                
                <!-- Content area -->
                <div class="sf-content">
                    <div id="sf-view-container">
                        ${this.getViewContent()}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get content for current view
     */
    getViewContent() {
        const views = ['upload', 'forecast', 'adjust', 'compare', 'analytics'];
        return views.map(view => `
            <div class="sf-panel" data-panel="${view}" style="display:${view === this.currentView ? 'block' : 'none'}">
                ${this.getPanelContent(view)}
            </div>
        `).join('');
    }

    getPanelContent(view) {
        switch (view) {
            case 'upload': return this.getUploadViewContent();
            case 'forecast': return this.getForecastViewContent();
            case 'adjust': return this.getAdjustViewContent();
            case 'compare': return this.getCompareViewContent();
            case 'analytics': return this.getAnalyticsViewContent();
            default: return '<p>Select a view</p>';
        }
    }

    /**
     * Get upload view content
     */
    getUploadViewContent() {
        return `
            <div class="sf-upload-view">
                <div class="row">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fas fa-cloud-upload-alt me-2"></i>Upload Sales Data</h5>
                            </div>
                            <div class="card-body">
                                <div id="sf-upload-zone" class="sf-upload-zone">
                                    <i class="fas fa-file-csv fa-3x text-primary mb-3"></i>
                                    <h5>Drag & Drop CSV/Excel File</h5>
                                    <p class="text-muted">or click to browse</p>
                                    <input type="file" id="sf-file-input" accept=".csv,.xlsx,.xls" class="d-none">
                                    <button class="btn btn-primary mt-2" id="sf-browse-btn">
                                        <i class="fas fa-folder-open me-1"></i> Browse Files
                                    </button>
                                </div>
                                <div class="mt-3">
                                    <small class="text-muted">
                                        <strong>Required columns:</strong> date, revenue, transaction_qty, avg_spend
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        ${this.getSavedHistoricalDataCardHtml()}
                        ${this.getSavedForecastsCardHtml()}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get saved historical data card HTML (Bootstrap 5 card layout)
     */
    getSavedHistoricalDataCardHtml() {
        if (this.savedDataSets.length === 0) {
            return `
                <div class="card mb-3">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h6 class="mb-0"><i class="fas fa-database me-2"></i>Saved Historical Data</h6>
                        <span class="badge bg-secondary">0</span>
                    </div>
                    <div class="card-body text-center text-muted py-4">
                        <i class="fas fa-inbox fa-2x mb-2"></i>
                        <p class="mb-0">No saved historical data sets</p>
                    </div>
                </div>
            `;
        }

        return `
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0"><i class="fas fa-database me-2"></i>Saved Historical Data</h6>
                    <span class="badge bg-primary">${this.savedDataSets.length}</span>
                </div>
                <div class="card-body p-0">
                    <div class="list-group list-group-flush">
                        ${this.savedDataSets.map(dataset => `
                            <div class="list-group-item">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div class="flex-grow-1">
                                        <h6 class="mb-1">${escapeHtml(dataset.locationName || 'Unknown Location')}</h6>
                                        <small class="text-muted">
                                            <i class="fas fa-calendar-alt me-1"></i>
                                            ${escapeHtml(dataset.dateRange?.startDate ?? 'N/A')} to ${escapeHtml(dataset.dateRange?.endDate ?? 'N/A')}
                                        </small>
                                        <br>
                                        <small class="text-muted">
                                            <i class="fas fa-chart-bar me-1"></i>${dataset.recordCount || 0} records
                                            ${dataset.uploadedAt ? `<span class="ms-2"><i class="fas fa-clock me-1"></i>${new Date(dataset.uploadedAt).toLocaleDateString()}</span>` : ''}
                                        </small>
                                    </div>
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-outline-primary sf-use-data"
                                                data-id="${escapeHtml(dataset.id)}" title="Load & Use">
                                            <i class="fas fa-play"></i>
                                        </button>
                                        <button class="btn btn-outline-secondary sf-edit-data"
                                                data-id="${escapeHtml(dataset.id)}" title="Edit">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-outline-danger sf-delete-data"
                                                data-id="${escapeHtml(dataset.id)}" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get saved forecasts card HTML (Card 2 of the two-card layout)
     */
    getSavedForecastsCardHtml() {
        if (this.savedForecasts.length === 0) {
            return `
                <div class="card mb-3">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h6 class="mb-0"><i class="fas fa-chart-line me-2"></i>Saved Forecasts</h6>
                        <span class="badge bg-secondary">0</span>
                    </div>
                    <div class="card-body text-center text-muted py-4">
                        <i class="fas fa-chart-area fa-2x mb-2"></i>
                        <p class="mb-0">No saved forecasts yet</p>
                        <small>Generate a forecast from your historical data to get started</small>
                    </div>
                </div>
            `;
        }

        const statusBadge = (status) => {
            const badges = {
                active: '<span class="badge bg-success">Active</span>',
                draft: '<span class="badge bg-warning text-dark">Draft</span>',
                archived: '<span class="badge bg-secondary">Archived</span>'
            };
            return badges[status] || badges.draft;
        };

        const methodLabel = (method) => {
            const labels = {
                yoy: 'Year-over-Year',
                year_over_year: 'Year-over-Year',
                seasonal: 'Seasonal Analysis',
                moving_average: 'Moving Average',
                simple_trend: 'Simple Trend',
                exponential: 'Exponential Growth',
                exponential_smoothing: 'Exponential Smoothing',
                ml_based: 'ML-Based (Ensemble)'
            };
            return labels[method] || method || 'Unknown';
        };

        return `
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0"><i class="fas fa-chart-line me-2"></i>Saved Forecasts</h6>
                    <span class="badge bg-primary">${this.savedForecasts.length}</span>
                </div>
                <div class="card-body p-0">
                    <div class="list-group list-group-flush">
                        ${this.savedForecasts.map(forecast => `
                            <div class="list-group-item">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div class="flex-grow-1">
                                        <div class="d-flex align-items-center mb-1">
                                            <h6 class="mb-0 me-2">${escapeHtml(forecast.name)}</h6>
                                            ${statusBadge(forecast.status)}
                                        </div>
                                        <small class="text-muted">
                                            <i class="fas fa-cog me-1"></i>${methodLabel(forecast.method)}
                                            <span class="ms-2"><i class="fas fa-calendar-alt me-1"></i>${forecast.horizon} days</span>
                                        </small>
                                        <br>
                                        <small class="text-muted">
                                            ${forecast.summary?.totalPredictedRevenue ? `<i class="fas fa-coins me-1"></i>R${Number(forecast.summary.totalPredictedRevenue).toLocaleString()}` : ''}
                                            ${forecast.createdAt ? `<span class="ms-2"><i class="fas fa-clock me-1"></i>${new Date(forecast.createdAt).toLocaleDateString()}</span>` : ''}
                                        </small>
                                    </div>
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-outline-primary sf-load-forecast"
                                                data-id="${escapeHtml(forecast.id)}" title="Load Forecast">
                                            <i class="fas fa-play"></i>
                                        </button>
                                        <button class="btn btn-outline-secondary sf-edit-forecast"
                                                data-id="${escapeHtml(forecast.id)}" title="Edit">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-outline-danger sf-delete-forecast"
                                                data-id="${escapeHtml(forecast.id)}" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get forecast view content
     */
    getForecastViewContent() {
        return `
            <div class="sf-forecast-view">
                <div class="row">
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fas fa-cog me-2"></i>Forecast Configuration</h5>
                            </div>
                            <div class="card-body">
                                <div class="mb-3">
                                    <label class="form-label">Forecast Method</label>
                                    <select id="sf-method" class="form-select">
                                        <option value="yoy" ${this.forecastConfig.method === 'yoy' ? 'selected' : ''}>Year-over-Year</option>
                                        <option value="seasonal" ${this.forecastConfig.method === 'seasonal' ? 'selected' : ''}>Seasonal Analysis</option>
                                        <option value="moving_average" ${this.forecastConfig.method === 'moving_average' ? 'selected' : ''}>Moving Average</option>
                                        <option value="simple_trend" ${this.forecastConfig.method === 'simple_trend' ? 'selected' : ''}>Simple Trend (Linear)</option>
                                        <option value="exponential" ${this.forecastConfig.method === 'exponential' ? 'selected' : ''}>Exponential Growth</option>
                                        <option value="ml_based" ${this.forecastConfig.method === 'ml_based' ? 'selected' : ''}>ML-Based (Ensemble)</option>
                                    </select>
                                </div>
                                <div id="sf-growth-rate-row" class="mb-3" style="display:${this.forecastConfig.method === 'yoy' ? 'block' : 'none'}">
                                    <label class="form-label">Target Growth % <small class="text-muted">(vs last year)</small></label>
                                    <div class="input-group">
                                        <input type="number" id="sf-growth-rate" class="form-control" value="${this.forecastConfig.growthRate}" min="-50" max="100" step="0.5">
                                        <span class="input-group-text">%</span>
                                    </div>
                                    <small class="text-muted">Menu price increases, inflation, growth targets</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Forecast Horizon</label>
                                    <select id="sf-horizon" class="form-select">
                                        <option value="7" ${this.forecastConfig.horizon === '7' ? 'selected' : ''}>1 Week</option>
                                        <option value="14" ${this.forecastConfig.horizon === '14' ? 'selected' : ''}>2 Weeks</option>
                                        <option value="30" ${this.forecastConfig.horizon === '30' ? 'selected' : ''}>1 Month</option>
                                        <option value="60" ${this.forecastConfig.horizon === '60' ? 'selected' : ''}>2 Months</option>
                                        <option value="90" ${this.forecastConfig.horizon === '90' ? 'selected' : ''}>3 Months</option>
                                        <option value="custom" ${this.forecastConfig.horizon === 'custom' ? 'selected' : ''}>Custom Date Range</option>
                                    </select>
                                </div>
                                <div id="sf-custom-dates" class="mb-3" style="display:${this.forecastConfig.horizon === 'custom' ? 'block' : 'none'}">
                                    <label class="form-label">Start Date</label>
                                    <input type="date" id="sf-forecast-start" class="form-control mb-2" value="${this.forecastConfig.customStartDate || ''}">
                                    <label class="form-label">End Date</label>
                                    <input type="date" id="sf-forecast-end" class="form-control" value="${this.forecastConfig.customEndDate || ''}">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Confidence Interval</label>
                                    <select id="sf-confidence" class="form-select">
                                        <option value="0" ${this.forecastConfig.confidenceLevel === '0' ? 'selected' : ''}>None</option>
                                        <option value="80" ${this.forecastConfig.confidenceLevel === '80' ? 'selected' : ''}>80%</option>
                                        <option value="90" ${this.forecastConfig.confidenceLevel === '90' ? 'selected' : ''}>90%</option>
                                        <option value="95" ${this.forecastConfig.confidenceLevel === '95' ? 'selected' : ''}>95%</option>
                                    </select>
                                </div>
                                <div class="mt-4">
                                    <button id="sf-generate-btn" class="btn btn-success w-100">
                                        <i class="fas fa-chart-line me-2"></i>Generate Forecast
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-8">
                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <h5><i class="fas fa-chart-area me-2"></i>Forecast Results</h5>
                                <div>
                                    <button id="sf-save-forecast-btn" class="btn btn-primary btn-sm" ${this.currentForecast ? '' : 'disabled'}>
                                        <i class="fas fa-save me-1"></i> Save Forecast
                                    </button>
                                    <button id="sf-export-btn" class="btn btn-secondary btn-sm" ${this.currentForecast ? '' : 'disabled'}>
                                        <i class="fas fa-download me-1"></i> Export CSV
                                    </button>
                                </div>
                            </div>
                            <div class="card-body">
                                <div id="sf-chart-container" class="sf-chart-container">
                                    <canvas id="sf-forecast-chart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            ${this.getForecastTableHtml()}
            ${this.getHistoricalDataTableHtml()}
        `;
    }

    /**
     * Forecast summary table — all forecast days sorted ascending
     */
    getForecastTableHtml() {
        if (!this.currentForecast?.predictions) return '';

        const fmt = (val) => val != null
            ? `R ${Number(val).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
            : '—';

        const rows = Object.entries(this.currentForecast.predictions)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, pred]) => {
                const displayDate = date.match(/^\d{4}-\d{2}-\d{2}$/)
                    ? new Date(date + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                    : date;
                const predicted = pred.adjusted?.revenue ?? pred.predicted ?? 0;
                const transactions = pred.adjusted?.transactions ?? pred.transactions ?? 0;
                const avgSpend = pred.adjusted?.avgSpend ?? pred.avgSpend ?? 0;
                const confLow = pred.confidenceLower ?? null;
                const confHigh = pred.confidenceUpper ?? null;
                return `<tr>
                    <td>${escapeHtml(displayDate)}</td>
                    <td>${fmt(predicted)}</td>
                    <td>${Number(transactions).toLocaleString('en-ZA')}</td>
                    <td>${fmt(avgSpend)}</td>
                    <td>${fmt(confLow)}</td>
                    <td>${fmt(confHigh)}</td>
                </tr>`;
            }).join('');

        return `
            <div class="mt-4">
                <div class="card">
                    <div class="card-header">
                        <h6 class="mb-0"><i class="fas fa-table me-2"></i>Forecast Summary</h6>
                    </div>
                    <div class="card-body">
                        ${this._buildForecastSummary(this.currentForecast.predictions)}
                        <div class="table-responsive">
                            <table class="table table-sm table-striped mb-0">
                                <thead class="table-light">
                                    <tr>
                                        <th>Date</th>
                                        <th>Predicted Revenue</th>
                                        <th>Transactions</th>
                                        <th>Avg Spend</th>
                                        <th>Conf. Low</th>
                                        <th>Conf. High</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    /**
     * Historical data preview table — filterable by period, collapsible
     */
    getHistoricalDataTableHtml() {
        if (!this.historicalData || this.historicalData.length === 0) return '';

        const total = this.historicalData.length;
        const initialRows = this._buildHistoricalRows(this._getFilteredHistoricalData());
        const initialSummary = this._buildHistoricalSummary(this._getFilteredHistoricalData());
        const currentFilter = this.historicalFilter || 'all';

        return `
            <div class="mt-3">
                <div class="card">
                    <div class="card-header">
                        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <h6 class="mb-0"><i class="fas fa-history me-2"></i>Historical Data Preview
                                <span class="badge bg-secondary ms-1">${total.toLocaleString('en-ZA')}</span>
                            </h6>
                            <div class="d-flex align-items-center gap-2">
                                <select id="sf-hist-filter" class="form-select form-select-sm" style="width:auto">
                                    <option value="week" ${currentFilter === 'week' ? 'selected' : ''}>Last 7 Days</option>
                                    <option value="month" ${currentFilter === 'month' ? 'selected' : ''}>Last 30 Days</option>
                                    <option value="quarter" ${currentFilter === 'quarter' ? 'selected' : ''}>Last Quarter</option>
                                    <option value="year" ${currentFilter === 'year' ? 'selected' : ''}>Last Year</option>
                                    <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>All Records</option>
                                    <option value="custom" ${currentFilter === 'custom' ? 'selected' : ''}>Custom Range</option>
                                </select>
                                <button class="btn btn-sm btn-outline-secondary" type="button"
                                        data-bs-toggle="collapse" data-bs-target="#sf-historical-table-collapse"
                                        aria-expanded="false">
                                    <i class="fas fa-chevron-down"></i>
                                </button>
                            </div>
                        </div>
                        <div id="sf-hist-custom-range" class="d-flex align-items-center gap-2 mt-2 flex-wrap" style="display:${currentFilter === 'custom' ? 'flex' : 'none'}!important">
                            <input type="date" id="sf-hist-start" class="form-control form-control-sm" style="width:auto"
                                   value="${this.historicalCustomStart || ''}">
                            <span class="text-muted small">to</span>
                            <input type="date" id="sf-hist-end" class="form-control form-control-sm" style="width:auto"
                                   value="${this.historicalCustomEnd || ''}">
                            <button id="sf-hist-apply" class="btn btn-sm btn-primary">Apply</button>
                        </div>
                    </div>
                    <div class="collapse" id="sf-historical-table-collapse">
                        <div class="card-body">
                            <div id="sf-hist-summary">${initialSummary}</div>
                            <div class="table-responsive">
                                <table class="table table-sm table-striped mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Date</th>
                                            <th>Revenue</th>
                                            <th>Transactions</th>
                                            <th>Avg Spend</th>
                                        </tr>
                                    </thead>
                                    <tbody id="sf-hist-table-body">${initialRows}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    /**
     * Get adjust view content
     */
    getAdjustViewContent() {
        if (!this.currentForecast) {
            return `
                <div class="text-center py-5">
                    <i class="fas fa-edit fa-3x text-muted mb-3"></i>
                    <h5>No Active Forecast</h5>
                    <p class="text-muted">Generate and save a forecast first to make adjustments.</p>
                    <button class="btn btn-primary" data-view="forecast">
                        Go to Forecast
                    </button>
                </div>
            `;
        }

        return `
            <div class="sf-adjust-view">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Click on any prediction to adjust it. Changes are saved automatically.
                </div>
                <div class="table-responsive">
                    <table class="table table-hover" id="sf-adjust-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Original Revenue</th>
                                <th>Adjusted Revenue</th>
                                <th>Transactions</th>
                                <th>Avg Spend</th>
                                <th>Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.getAdjustmentRowsHtml()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    /**
     * Get adjustment rows HTML
     */
    getAdjustmentRowsHtml() {
        if (!this.currentForecast?.predictions) {
            return '<tr><td colspan="6" class="text-center">No predictions available</td></tr>';
        }

        return Object.entries(this.currentForecast.predictions).map(([date, pred]) => {
            const predicted = Math.round((pred.adjusted?.revenue ?? pred.predicted ?? pred.revenue ?? 0) * 100) / 100;
            const transactions = Math.round(pred.adjusted?.transactions ?? pred.transactions ?? pred.transactionQty ?? 0);
            const avgSpend = pred.adjusted?.avgSpend ?? pred.avgSpend ?? 0;
            const originalRevenue = pred.predicted ?? pred.revenue ?? 0;

            // Format date for display (YYYY-MM-DD -> localised)
            const displayDate = date.match(/^\d{4}-\d{2}-\d{2}$/)
                ? new Date(date + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                : date;

            return `
            <tr data-date="${escapeHtml(date)}">
                <td>${escapeHtml(displayDate)}</td>
                <td>R ${Number(originalRevenue).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>
                    <input type="number" class="form-control form-control-sm sf-adjust-revenue"
                           value="${predicted.toFixed(2)}"
                           data-date="${escapeHtml(date)}"
                           min="0" step="0.01" max="9999999">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm sf-adjust-transactions"
                           value="${transactions}"
                           data-date="${escapeHtml(date)}"
                           min="0" step="1" max="99999">
                </td>
                <td>R ${Number(avgSpend).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td>
                    <input type="text" class="form-control form-control-sm sf-adjust-reason"
                           value="${escapeHtml(pred.adjustmentReason || '')}"
                           placeholder="e.g., Holiday expected"
                           data-date="${escapeHtml(date)}"
                           maxlength="200">
                </td>
            </tr>
        `;
        }).join('');
    }

    /**
     * Get compare view content
     */
    getCompareViewContent() {
        return `
            <div class="sf-compare-view">
                <div class="row">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fas fa-upload me-2"></i>Upload Actual Sales</h5>
                            </div>
                            <div class="card-body">
                                <div id="sf-actuals-upload-zone" class="sf-upload-zone">
                                    <i class="fas fa-file-csv fa-3x text-success mb-3"></i>
                                    <h5>Upload Actual Sales Data</h5>
                                    <p class="text-muted">Compare your forecast against real results</p>
                                    <input type="file" id="sf-actuals-input" accept=".csv,.xlsx,.xls" class="d-none">
                                    <button class="btn btn-success mt-2" id="sf-actuals-browse-btn">
                                        <i class="fas fa-folder-open me-1"></i> Browse Files
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fas fa-chart-bar me-2"></i>Accuracy Metrics</h5>
                            </div>
                            <div class="card-body" id="sf-accuracy-metrics">
                                <div class="text-center text-muted py-4">
                                    <i class="fas fa-balance-scale fa-2x mb-2"></i>
                                    <p>Upload actuals to see comparison</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="row mt-4">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fas fa-chart-line me-2"></i>Forecast vs Actuals</h5>
                            </div>
                            <div class="card-body">
                                <div id="sf-comparison-chart-container" class="sf-chart-container">
                                    <canvas id="sf-comparison-chart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get analytics view content
     */
    getAnalyticsViewContent() {
        return `
            <div class="sf-analytics-view">
                <div class="row">
                    <div class="col-md-4">
                        <div class="card bg-primary text-white">
                            <div class="card-body text-center">
                                <h2 id="sf-overall-accuracy">--</h2>
                                <p class="mb-0">Overall Accuracy (MAPE)</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-success text-white">
                            <div class="card-body text-center">
                                <h2 id="sf-best-method">--</h2>
                                <p class="mb-0">Best Performing Method</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-info text-white">
                            <div class="card-body text-center">
                                <h2 id="sf-total-forecasts">--</h2>
                                <p class="mb-0">Total Forecasts</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="row mt-4">
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fas fa-chart-pie me-2"></i>Method Performance</h5>
                            </div>
                            <div class="card-body">
                                <div id="sf-method-performance-chart-container">
                                    <canvas id="sf-method-chart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fas fa-calendar-week me-2"></i>Seasonal Patterns</h5>
                            </div>
                            <div class="card-body">
                                <div id="sf-seasonal-patterns-container">
                                    <canvas id="sf-seasonal-chart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="row mt-4">
                    <div class="col-12">
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fas fa-lightbulb me-2"></i>Recommendations</h5>
                            </div>
                            <div class="card-body" id="sf-recommendations">
                                <div class="alert alert-success">
                                    <strong>Recommended Method:</strong> Based on your historical data and patterns, 
                                    we recommend using <strong>Seasonal Analysis</strong> for best accuracy.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Location selector
        const locationSelect = container.querySelector('#sf-location');
        locationSelect?.addEventListener('change', (e) => {
            this.setLocation(e.target.value);
        });

        // Tab navigation (toggle visibility, no full re-render)
        container.querySelectorAll('.sf-tabs .nav-link').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const view = e.target.dataset.view || e.target.closest('[data-view]')?.dataset.view;
                if (view) this.switchTab(view);
            });
        });

        // Standalone view-switch buttons (e.g., "Go to Forecast" in empty adjust panel)
        container.querySelectorAll('.sf-panel [data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.dataset.view || e.target.closest('[data-view]')?.dataset.view;
                if (view) this.switchTab(view);
            });
        });

        // File upload
        const browseBtn = container.querySelector('#sf-browse-btn');
        const fileInput = container.querySelector('#sf-file-input');
        browseBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => this.handleFileUpload(e.target.files[0]));

        // Upload zone drag and drop
        const uploadZone = container.querySelector('#sf-upload-zone');
        this.setupDragDrop(uploadZone, (file) => this.handleFileUpload(file));

        // Method select - toggle growth rate field
        const methodSelect = container.querySelector('#sf-method');
        const growthRateRow = container.querySelector('#sf-growth-rate-row');
        methodSelect?.addEventListener('change', () => {
            if (growthRateRow) {
                growthRateRow.style.display = methodSelect.value === 'yoy' ? 'block' : 'none';
            }
        });

        // Horizon select - toggle custom date inputs
        const horizonSelect = container.querySelector('#sf-horizon');
        const customDatesDiv = container.querySelector('#sf-custom-dates');
        horizonSelect?.addEventListener('change', () => {
            if (customDatesDiv) {
                customDatesDiv.style.display = horizonSelect.value === 'custom' ? 'block' : 'none';
            }
        });

        // Generate forecast button
        const generateBtn = container.querySelector('#sf-generate-btn');
        generateBtn?.addEventListener('click', () => this.handleGenerateForecast());

        // Save forecast button
        const saveBtn = container.querySelector('#sf-save-forecast-btn');
        saveBtn?.addEventListener('click', () => this.handleSaveForecast());

        // Export button
        const exportBtn = container.querySelector('#sf-export-btn');
        exportBtn?.addEventListener('click', () => this.handleExportCSV());

        // Actuals upload
        const actualsBrowseBtn = container.querySelector('#sf-actuals-browse-btn');
        const actualsInput = container.querySelector('#sf-actuals-input');
        actualsBrowseBtn?.addEventListener('click', () => actualsInput?.click());
        actualsInput?.addEventListener('change', (e) => this.handleActualsUpload(e.target.files[0]));

        // Use Data buttons
        container.querySelectorAll('.sf-use-data').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const dataId = e.currentTarget.dataset.id;
                try {
                    const data = await this.dataService.getHistoricalData(dataId);
                    if (data) {
                        this.historicalData = Array.isArray(data.dailyDataArray) ? data.dailyDataArray : Object.values(data.dailyData || {});
                        this.currentView = 'forecast';
                        this.render();
                    }
                } catch (error) {
                    console.error('[SalesForecastingModule] Error loading data:', error);
                    Swal.fire('Error', 'Failed to load data: ' + error.message, 'error');
                }
            });
        });

        // Delete Data buttons
        container.querySelectorAll('.sf-delete-data').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const dataId = e.currentTarget.dataset.id;
                const result = await Swal.fire({
                    title: 'Delete Dataset?',
                    text: 'Are you sure you want to delete this dataset? This cannot be undone.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Yes, delete it'
                });
                if (result.isConfirmed) {
                    try {
                        await this.dataService.deleteHistoricalData(dataId);
                        await this.loadSavedData();
                        this.render();
                    } catch (error) {
                        console.error('[SalesForecastingModule] Error deleting data:', error);
                        Swal.fire('Error', 'Failed to delete: ' + error.message, 'error');
                    }
                }
            });
        });

        // Edit historical data buttons
        document.querySelectorAll('.sf-edit-data').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const dataId = e.currentTarget.dataset.id;
                await this.handleEditHistoricalData(dataId);
            });
        });

        // Load forecast buttons
        document.querySelectorAll('.sf-load-forecast').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const forecastId = e.currentTarget.dataset.id;
                await this.handleLoadForecast(forecastId);
            });
        });

        // Edit forecast buttons
        document.querySelectorAll('.sf-edit-forecast').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const forecastId = e.currentTarget.dataset.id;
                await this.handleEditForecast(forecastId);
            });
        });

        // Delete forecast buttons
        document.querySelectorAll('.sf-delete-forecast').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const forecastId = e.currentTarget.dataset.id;
                await this.handleDeleteForecast(forecastId);
            });
        });

        // Historical data period filter
        const histFilterEl = container.querySelector('#sf-hist-filter');
        histFilterEl?.addEventListener('change', () => {
            const customRangeEl = document.getElementById('sf-hist-custom-range');
            if (customRangeEl) {
                customRangeEl.style.display = histFilterEl.value === 'custom' ? 'flex' : 'none';
            }
            if (histFilterEl.value !== 'custom') {
                this.refreshHistoricalTable();
            }
        });

        // Custom range Apply button
        container.querySelector('#sf-hist-apply')?.addEventListener('click', () => {
            const startEl = document.getElementById('sf-hist-start');
            const endEl = document.getElementById('sf-hist-end');
            if (!startEl?.value || !endEl?.value) {
                Swal.fire('Error', 'Please select both a start and end date', 'warning');
                return;
            }
            if (new Date(endEl.value) < new Date(startEl.value)) {
                Swal.fire('Error', 'End date must be on or after start date', 'warning');
                return;
            }
            this.refreshHistoricalTable();
        });

        // Adjustment inputs
        container.querySelectorAll('.sf-adjust-revenue, .sf-adjust-transactions, .sf-adjust-reason')
            .forEach(input => {
                input.addEventListener('change', (e) => this.handleAdjustmentChange(e));
            });
    }

    /**
     * Setup drag and drop for upload zone
     */
    setupDragDrop(zone, callback) {
        if (!zone) return;

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                callback(files[0]);
            }
        });
    }

    /**
     * Handle file upload
     */
    async handleFileUpload(file) {
        try {
            if (!file) return;

            if (!this.currentLocation) {
                Swal.fire('Error', 'Please select a location first', 'warning');
                return;
            }

            const MAX_FILE_SIZE = 5 * 1024 * 1024;
            if (file.size > MAX_FILE_SIZE) {
                Swal.fire('Error', 'File is too large. Maximum 5MB allowed.', 'error');
                return;
            }

            const text = await file.text();
            const { headers, rows } = parseCsv(text);
            if (rows.length === 0) {
                Swal.fire('Error', 'File must contain a header row and at least one data row', 'error');
                return;
            }
            if (rows.length > 10000) {
                Swal.fire('Error', `Too many rows (${rows.length}). Maximum 10,000 allowed.`, 'error');
                return;
            }

            const dateIdx = headers.findIndex(h => h === 'date' || h === 'day');
            const revenueIdx = headers.findIndex(h => h === 'revenue' || h === 'sales' || h === 'total' || h === 'amount');
            const transIdx = headers.findIndex(h =>
                h === 'transaction_qty' || h === 'transactions' || h === 'transaction_count' ||
                h === 'qty' || h === 'covers' || h === 'count'
            );
            const avgSpendIdx = headers.findIndex(h =>
                h === 'avg_spend' || h === 'average_spend' || h === 'avgspend' ||
                h === 'avg spend' || h === 'spend_per_cover' || h === 'spend'
            );

            if (dateIdx === -1 || revenueIdx === -1) {
                Swal.fire('Error', 'CSV must contain "date" and "revenue" (or "sales"/"total"/"amount") columns', 'error');
                return;
            }

            const data = [];
            for (const cols of rows) {
                const date = normalizeDate(cols[dateIdx]);
                const revenue = parseFloat(cols[revenueIdx]);
                if (date && !isNaN(revenue)) {
                    const entry = { date, revenue };
                    if (transIdx !== -1 && cols[transIdx] != null) {
                        entry.transactions = parseInt(cols[transIdx], 10) || 0;
                    }
                    if (avgSpendIdx !== -1 && cols[avgSpendIdx] != null) {
                        entry.avgSpend = parseFloat(cols[avgSpendIdx]) || 0;
                    }
                    data.push(entry);
                }
            }

            if (data.length === 0) {
                Swal.fire('Error', 'No valid data rows found in file', 'error');
                return;
            }

            // Sort by date
            data.sort((a, b) => new Date(a.date) - new Date(b.date));

            this.historicalData = data;

            // Save to database
            const dates = data.map(d => d.date);
            const metadata = {
                fileName: file.name,
                recordCount: data.length,
                dateRange: {
                    startDate: dates[0],
                    endDate: dates[dates.length - 1]
                }
            };

            this.showLoading('Saving historical data...');
            try {
                await this.dataService.saveHistoricalData(this.currentLocation, data, metadata);
            } finally {
                this.hideLoading();
            }

            this.currentView = 'forecast';
            this.render();
        } catch (error) {
            this.hideLoading();
            console.error('[SalesForecastingModule] Error uploading file:', error);
            Swal.fire('Error', 'Failed to upload file: ' + error.message, 'error');
        }
    }

    /**
     * Handle generate forecast
     */
    async handleGenerateForecast() {
        try {
            if (!this.currentLocation) {
                Swal.fire('Error', 'Please select a location first', 'warning');
                return;
            }

            if (!this.historicalData || this.historicalData.length === 0) {
                Swal.fire('Error', 'Please upload historical data first', 'warning');
                return;
            }

            const methodSelect = document.getElementById('sf-method');
            const horizonSelect = document.getElementById('sf-horizon');
            const confidenceSelect = document.getElementById('sf-confidence');
            const growthRateEl = document.getElementById('sf-growth-rate');

            const method = methodSelect?.value || 'seasonal';
            const confidenceLevel = parseFloat(confidenceSelect?.value) || 95;
            const growthRate = growthRateEl ? (parseFloat(growthRateEl.value) ?? 5) : 5;
            const growthRateOverride = method === 'yoy' ? growthRate / 100 : null;

            let horizon;
            let customStartDate = null;
            let customEndDate = null;

            if (horizonSelect?.value === 'custom') {
                const startInput = document.getElementById('sf-forecast-start');
                const endInput = document.getElementById('sf-forecast-end');
                customStartDate = startInput?.value;
                customEndDate = endInput?.value;

                if (!customStartDate || !customEndDate) {
                    Swal.fire('Error', 'Please select both start and end dates', 'warning');
                    return;
                }

                const start = new Date(customStartDate);
                const end = new Date(customEndDate);
                if (end <= start) {
                    Swal.fire('Error', 'End date must be after start date', 'warning');
                    return;
                }

                // +1 makes end date inclusive (1–31 Mar = 31 days, not 30)
                horizon = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                if (horizon > 365) {
                    Swal.fire('Error', 'Custom range cannot exceed 365 days', 'warning');
                    return;
                }
            } else {
                horizon = parseInt(horizonSelect?.value, 10) || 30;
            }

            console.group('[SalesForecasting Debug] Input Data');
            console.log('Historical records:', this.historicalData.length);
            const _dbgMap = d => ({
                date: d.date instanceof Date ? d.date.toISOString().split('T')[0] : d.date,
                revenue: d.revenue,
                transactions: d.transactions
            });
            console.log('First 3 records:', this.historicalData.slice(0, 3).map(_dbgMap));
            console.log('Last 3 records:', this.historicalData.slice(-3).map(_dbgMap));
            console.groupEnd();

            // Persist form config so re-renders don't reset the user's selections
            this.forecastConfig = {
                method,
                horizon: horizonSelect?.value || '30',
                confidenceLevel: String(confidenceLevel),
                growthRate: isNaN(growthRate) ? 5 : growthRate,
                customStartDate: customStartDate || null,
                customEndDate: customEndDate || null
            };

            // Exclude closed days (R0 revenue) so they don't corrupt averages or YoY base values
            const tradingDays = this.historicalData.filter(d => (d.revenue ?? 0) > 0);
            const closedDays = this.historicalData.length - tradingDays.length;
            if (closedDays > 0) {
                console.log(`[SalesForecasting] Excluded ${closedDays} closed day(s) (R0 revenue) from forecast input`);
            }

            this.showLoading('Generating forecast...');
            let forecast;
            try {
                forecast = await this.forecastEngine.generateForecast(
                    tradingDays,
                    {
                        method,
                        horizon,
                        confidenceLevel,
                        ...(customStartDate ? { startDate: customStartDate } : {}),
                        ...(growthRateOverride !== null ? { growthRateOverride } : {})
                    }
                );
            } finally {
                this.hideLoading();
            }

            console.group('[SalesForecasting Debug] Forecast Output');
            console.log('Method:', forecast.method, '| Horizon:', forecast.horizon);
            console.log('First 3 predictions:', (Array.isArray(forecast.predictions) ? forecast.predictions : Object.values(forecast.predictions)).slice(0, 3).map(p => ({
                date: p.date instanceof Date ? p.date.toISOString().split('T')[0] : p.date,
                predicted: p.predicted,
                transactions: p.transactions
            })));
            console.groupEnd();

            // Convert predictions array to date-keyed object
            const predictionsMap = {};
            if (Array.isArray(forecast.predictions)) {
                for (const pred of forecast.predictions) {
                    const dateStr = pred.date instanceof Date
                        ? pred.date.toISOString().split('T')[0]
                        : String(pred.date).split('T')[0];
                    predictionsMap[dateStr] = { ...pred, date: dateStr };
                }
            } else {
                Object.assign(predictionsMap, forecast.predictions || {});
            }

            this.currentForecast = {
                ...forecast,
                predictions: predictionsMap,
                config: {
                    method,
                    horizon,
                    confidenceLevel,
                    ...(customStartDate ? { customStartDate, customEndDate } : {})
                },
                locationId: this.currentLocation,
                createdAt: new Date().toISOString()
            };

            // Re-render all panels so they reflect the new forecast data
            this.render();
            requestAnimationFrame(() => { this.renderForecastChart(); });
        } catch (error) {
            this.hideLoading();
            console.error('[SalesForecastingModule] Error generating forecast:', error);
            Swal.fire('Error', 'Failed to generate forecast: ' + error.message, 'error');
        }
    }

    /**
     * Handle save forecast
     */
    async handleSaveForecast() {
        try {
            if (!this.currentLocation) {
                Swal.fire('Error', 'Please select a location first', 'warning');
                return;
            }

            if (!this.currentForecast) {
                Swal.fire('Error', 'No forecast to save. Generate a forecast first.', 'warning');
                return;
            }

            const forecastData = {
                ...this.currentForecast,
                locationId: this.currentLocation,
                savedAt: new Date().toISOString(),
                status: 'active'
            };

            this.showLoading('Saving forecast...');
            try {
                const result = await this.dataService.saveForecast(
                    this.currentLocation,
                    null,
                    forecastData
                );

                this.currentForecast.id = result.forecastId;

                // Refresh saved forecasts list
                await this.loadSavedData();
            } finally {
                this.hideLoading();
            }

            Swal.fire({ icon: 'success', title: 'Forecast saved successfully!', timer: 2000, showConfirmButton: false });
            this.render();
        } catch (error) {
            this.hideLoading();
            console.error('[SalesForecastingModule] Error saving forecast:', error);
            Swal.fire('Error', 'Failed to save forecast: ' + error.message, 'error');
        }
    }

    /**
     * Handle export CSV
     */
    handleExportCSV() {
        try {
            if (!this.currentForecast?.predictions) {
                Swal.fire('Error', 'No forecast data to export', 'warning');
                return;
            }

            const predictions = this.currentForecast.predictions;
            const rows = [['Date', 'Predicted Revenue', 'Adjusted Revenue', 'Confidence Low', 'Confidence High']];

            Object.entries(predictions).forEach(([date, pred]) => {
                const revenue = pred?.adjusted?.revenue ?? pred?.original?.revenue ?? pred?.predicted ?? pred?.revenue ?? 0;
                const adjusted = pred?.adjusted?.revenue ?? '';
                const low = pred?.confidenceInterval?.lower ?? pred?.confidenceLower ?? '';
                const high = pred?.confidenceInterval?.upper ?? pred?.confidenceUpper ?? '';
                rows.push([date, revenue, adjusted, low, high]);
            });

            const csv = rows.map(r => r.join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `forecast_${this.currentLocation}_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (error) {
            console.error('[SalesForecastingModule] Error exporting CSV:', error);
            Swal.fire('Error', 'Failed to export: ' + error.message, 'error');
        }
    }

    /**
     * Handle actuals upload
     */
    async handleActualsUpload(file) {
        try {
            if (!file || !this.currentForecast) {
                Swal.fire('Error', 'Please load a forecast before uploading actuals', 'warning');
                return;
            }

            if (!this.currentLocation) {
                Swal.fire('Error', 'Please select a location first', 'warning');
                return;
            }

            const MAX_FILE_SIZE = 5 * 1024 * 1024;
            if (file.size > MAX_FILE_SIZE) {
                Swal.fire('Error', 'File is too large. Maximum 5MB allowed.', 'error');
                return;
            }

            const text = await file.text();
            const { headers, rows } = parseCsv(text);
            if (rows.length === 0) {
                Swal.fire('Error', 'File must contain a header row and at least one data row', 'error');
                return;
            }

            const dateIdx = headers.findIndex(h => h === 'date' || h === 'day');
            const revenueIdx = headers.findIndex(h => h === 'revenue' || h === 'sales' || h === 'total' || h === 'amount');

            if (dateIdx === -1 || revenueIdx === -1) {
                Swal.fire('Error', 'CSV must contain "date" and "revenue" columns', 'error');
                return;
            }

            const actuals = [];
            for (const cols of rows) {
                const date = normalizeDate(cols[dateIdx]);
                const revenue = parseFloat(cols[revenueIdx]);
                if (date && !isNaN(revenue)) {
                    actuals.push({ date, revenue });
                }
            }

            if (actuals.length === 0) {
                Swal.fire('Error', 'No valid data rows found', 'error');
                return;
            }

            // Calculate accuracy if analytics service is available
            if (this.analytics && this.analytics.compareForecastWithActuals) {
                // Convert actuals array to date-indexed object expected by compareForecastWithActuals
                const actualsObj = {};
                for (const a of actuals) {
                    actualsObj[a.date] = a;
                }
                const comparison = this.analytics.compareForecastWithActuals(
                    this.currentForecast.predictions,
                    actualsObj
                );

                if (comparison) {
                    console.log('[SalesForecastingModule] Accuracy comparison:', comparison);
                    this.renderComparisonMetrics(comparison);
                }
            }

            // Save actuals
            this.showLoading('Saving actuals...');
            try {
                await this.dataService.saveActuals(this.currentForecast.id, actuals);
            } finally {
                this.hideLoading();
            }

            this.currentView = 'compare';
            this.render();
            requestAnimationFrame(() => { this.renderComparisonChart(actuals); });
        } catch (error) {
            this.hideLoading();
            console.error('[SalesForecastingModule] Error uploading actuals:', error);
            Swal.fire('Error', 'Failed to upload actuals: ' + error.message, 'error');
        }
    }

    /**
     * Handle adjustment change
     */
    handleAdjustmentChange(event) {
        try {
            const row = event.target.closest('tr');
            if (!row) return;

            const date = row.dataset.date;
            if (!date || !this.currentForecast?.predictions?.[date]) return;

            const revenueInput = row.querySelector('.sf-adjust-revenue');
            const transactionsInput = row.querySelector('.sf-adjust-transactions');
            const reasonInput = row.querySelector('.sf-adjust-reason');

            const adjustedRevenue = revenueInput ? parseFloat(revenueInput.value) : null;
            const adjustedTransactions = transactionsInput ? parseInt(transactionsInput.value, 10) : null;
            const reason = reasonInput?.value || '';

            if (adjustedRevenue !== null && !isNaN(adjustedRevenue)) {
                const prediction = this.currentForecast.predictions[date];
                const originalRevenue = prediction?.original?.revenue ?? prediction?.predicted ?? prediction?.revenue ?? 0;

                this.currentForecast = {
                    ...this.currentForecast,
                    predictions: {
                        ...this.currentForecast.predictions,
                        [date]: {
                            ...prediction,
                            adjusted: {
                                revenue: adjustedRevenue,
                                transactions: adjustedTransactions,
                                reason,
                                adjustedAt: new Date().toISOString()
                            },
                            original: prediction.original || {
                                revenue: originalRevenue
                            }
                        }
                    }
                };
            }
        } catch (error) {
            console.error('[SalesForecastingModule] Error handling adjustment:', error);
        }
    }

    /**
     * Handle replacing a historical data file
     * @param {string} dataId - ID of the dataset to replace
     * @param {File} file - New CSV file to upload
     */
    async handleFileReplace(dataId, file) {
        try {
            // Parse the CSV file
            const text = await file.text();
            const { rows } = parseCsv(text);
            if (rows.length === 0) {
                Swal.fire('Error', 'File must contain a header row and at least one data row', 'error');
                return;
            }

            // Update the metadata
            await this.dataService.updateHistoricalDataMetadata(dataId, {
                fileName: file.name,
                updatedAt: new Date().toISOString()
            });

            // Refresh the view
            this.render();
        } catch (error) {
            console.error('[SalesForecastingModule] Error replacing file:', error);
            Swal.fire('Error', 'Failed to replace file: ' + error.message, 'error');
        }
    }

    /**
     * Handle editing a historical data set
     * @param {string} dataId - ID of the dataset to edit
     */
    async handleEditHistoricalData(dataId) {
        try {
            const dataset = this.savedDataSets.find(d => d.id === dataId);
            if (!dataset) {
                Swal.fire('Error', 'Dataset not found', 'error');
                return;
            }

            const fullData = await this.dataService.getHistoricalData(dataId);
            if (!fullData) {
                Swal.fire('Error', 'Could not load dataset', 'error');
                return;
            }

            this.showEditHistoricalDataModal(dataId, fullData);
        } catch (error) {
            console.error('[SalesForecasting] Error editing historical data:', error);
            Swal.fire('Error', 'Failed to load dataset for editing', 'error');
        }
    }

    /**
     * Show a Bootstrap 5 modal for editing historical data metadata
     * @param {string} dataId - ID of the dataset
     * @param {Object} data - Full dataset object
     */
    showEditHistoricalDataModal(dataId, data) {
        const existingModal = document.getElementById('sf-edit-data-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalWrapper = document.createElement('div');
        modalWrapper.innerHTML = `
            <div class="modal fade" id="sf-edit-data-modal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-edit me-2"></i>Edit Historical Data
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <label class="form-label">Location</label>
                                <input type="text" class="form-control" id="sf-edit-location-name"
                                       value="${escapeHtml(data.locationName || '')}" readonly>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Date Range</label>
                                <div class="input-group">
                                    <input type="date" class="form-control" id="sf-edit-start-date"
                                           value="${data.dateRange?.startDate || ''}">
                                    <span class="input-group-text">to</span>
                                    <input type="date" class="form-control" id="sf-edit-end-date"
                                           value="${data.dateRange?.endDate || ''}">
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Records: ${data.recordCount || 0}</label>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Replace Data (CSV/Excel)</label>
                                <input type="file" class="form-control" id="sf-edit-file-input"
                                       accept=".csv,.xlsx,.xls">
                                <small class="text-muted">Upload a new file to replace the existing data</small>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="sf-save-edit-data">
                                <i class="fas fa-save me-1"></i>Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalWrapper);

        const modalEl = document.getElementById('sf-edit-data-modal');

        if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
            console.error('Bootstrap JS not loaded');
            return;
        }

        const bsModal = new bootstrap.Modal(modalEl);

        document.getElementById('sf-save-edit-data').addEventListener('click', async () => {
            const startDate = document.getElementById('sf-edit-start-date').value;
            const endDate = document.getElementById('sf-edit-end-date').value;
            const fileInput = document.getElementById('sf-edit-file-input');

            try {
                await this.dataService.updateHistoricalDataMetadata(dataId, {
                    dateRange: { startDate, endDate }
                });

                if (fileInput.files.length > 0) {
                    await this.handleFileReplace(dataId, fileInput.files[0]);
                }

                bsModal.hide();
                await this.loadSavedData();
                this.render();
            } catch (error) {
                console.error('[SalesForecasting] Error saving edits:', error);
                Swal.fire('Error', 'Failed to save changes', 'error');
            }
        });

        modalEl.addEventListener('hidden.bs.modal', () => {
            modalWrapper.remove();
        });

        bsModal.show();
    }

    /**
     * Handle loading a saved forecast
     * @param {string} forecastId - ID of the forecast to load
     */
    async handleLoadForecast(forecastId) {
        try {
            const forecast = await this.dataService.getForecast(forecastId);
            if (!forecast) {
                Swal.fire('Error', 'Forecast not found', 'error');
                return;
            }

            // Ensure predictions is a date-keyed object (not array)
            let predictions = forecast.predictions || {};
            if (Array.isArray(predictions)) {
                const predictionsMap = {};
                for (const pred of predictions) {
                    const dateStr = pred.date instanceof Date
                        ? pred.date.toISOString().split('T')[0]
                        : String(pred.date).split('T')[0];
                    predictionsMap[dateStr] = { ...pred, date: dateStr };
                }
                predictions = predictionsMap;
            }

            this.currentForecast = { ...forecast, predictions, id: forecastId };

            // Load associated historical data if available
            if (forecast.salesDataId) {
                try {
                    const historicalDataRecord = await this.dataService.getHistoricalData(forecast.salesDataId);
                    if (historicalDataRecord?.dailyDataArray) {
                        this.historicalData = historicalDataRecord.dailyDataArray;
                    } else if (historicalDataRecord?.dailyData) {
                        this.historicalData = Object.values(historicalDataRecord.dailyData);
                    }
                } catch (err) {
                    console.warn('[SalesForecastingModule] Could not load historical data for forecast:', err);
                }
            }

            this.currentView = 'forecast';
            this.render();

            // Render the chart with loaded forecast data
            if (forecast.predictions) {
                requestAnimationFrame(() => { this.renderForecastChart(); });
            }
        } catch (error) {
            console.error('[SalesForecasting] Error loading forecast:', error);
            Swal.fire('Error', 'Failed to load forecast', 'error');
        }
    }

    /**
     * Handle editing a saved forecast's metadata
     * @param {string} forecastId - ID of the forecast to edit
     */
    async handleEditForecast(forecastId) {
        try {
            const forecast = this.savedForecasts.find(f => f.id === forecastId);
            if (!forecast) {
                Swal.fire('Error', 'Forecast not found', 'error');
                return;
            }

            // Remove existing modal if present
            const existingModal = document.getElementById('sf-edit-forecast-modal');
            if (existingModal) {
                existingModal.remove();
            }

            const modalWrapper = document.createElement('div');
            modalWrapper.innerHTML = `
                <div class="modal fade" id="sf-edit-forecast-modal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title"><i class="fas fa-edit me-2"></i>Edit Forecast</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">Forecast Name</label>
                                    <input type="text" class="form-control" id="sf-edit-forecast-name"
                                           value="${escapeHtml(forecast.name || '')}">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea class="form-control" id="sf-edit-forecast-desc" rows="3">${escapeHtml(forecast.description || '')}</textarea>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Status</label>
                                    <select class="form-select" id="sf-edit-forecast-status">
                                        <option value="draft" ${forecast.status === 'draft' ? 'selected' : ''}>Draft</option>
                                        <option value="active" ${forecast.status === 'active' ? 'selected' : ''}>Active</option>
                                        <option value="archived" ${forecast.status === 'archived' ? 'selected' : ''}>Archived</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label text-muted">Method: ${forecast.method || 'N/A'}</label>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-primary" id="sf-save-edit-forecast">
                                    <i class="fas fa-save me-1"></i>Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modalWrapper);

            const modalEl = document.getElementById('sf-edit-forecast-modal');

            if (typeof bootstrap === 'undefined' || !bootstrap.Modal) {
                console.error('Bootstrap JS not loaded');
                return;
            }

            const bsModal = new bootstrap.Modal(modalEl);

            document.getElementById('sf-save-edit-forecast').addEventListener('click', async () => {
                const name = document.getElementById('sf-edit-forecast-name').value;
                const description = document.getElementById('sf-edit-forecast-desc').value;
                const status = document.getElementById('sf-edit-forecast-status').value;

                try {
                    const updateData = { name, description };
                    if (status !== forecast.status) {
                        updateData.status = status;
                    }
                    await this.dataService.updateForecastMetadata(forecastId, updateData);

                    bsModal.hide();
                    await this.loadSavedData();
                    this.render();
                } catch (error) {
                    console.error('[SalesForecasting] Error saving forecast edits:', error);
                    Swal.fire('Error', 'Failed to save changes', 'error');
                }
            });

            modalEl.addEventListener('hidden.bs.modal', () => {
                modalWrapper.remove();
            });

            bsModal.show();
        } catch (error) {
            console.error('[SalesForecasting] Error editing forecast:', error);
            Swal.fire('Error', 'Failed to edit forecast', 'error');
        }
    }

    /**
     * Handle deleting a saved forecast
     * @param {string} forecastId - ID of the forecast to delete
     */
    async handleDeleteForecast(forecastId) {
        const forecast = this.savedForecasts.find(f => f.id === forecastId);
        const confirmMsg = forecast
            ? `Delete forecast "${escapeHtml(forecast.name)}"? This cannot be undone.`
            : 'Delete this forecast? This cannot be undone.';

        const swalResult = await Swal.fire({
            title: 'Delete Forecast?',
            text: confirmMsg,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it'
        });
        if (!swalResult.isConfirmed) return;

        try {
            await this.dataService.deleteForecast(forecastId);

            // Update local state immutably
            this.savedForecasts = this.savedForecasts.filter(f => f.id !== forecastId);
            this.render();
        } catch (error) {
            console.error('[SalesForecasting] Error deleting forecast:', error);
            Swal.fire('Error', 'Failed to delete forecast', 'error');
        }
    }

    /**
     * Render error state
     */
    renderError(message) {
        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Error:</strong> ${escapeHtml(message)}
                </div>
            `;
        }
    }

    /**
     * Render forecast chart
     */
    renderForecastChart() {
        if (!this.currentForecast) {
            console.warn('[SalesForecastingModule] No forecast data to render');
            return;
        }

        const canvas = document.getElementById('sf-forecast-chart');
        if (!canvas) {
            console.error('[SalesForecastingModule] Forecast chart canvas not found');
            return;
        }

        // Destroy existing chart
        if (this.chartInstances.forecast) {
            this.chartConfig.destroyChart(this.chartInstances.forecast);
        }

        // Prepare data
        const historicalData = this.historicalData.map(d => ({
            date: new Date(d.date),
            revenue: d.revenue
        }));

        const forecastData = Object.entries(this.currentForecast.predictions || {}).map(([date, pred]) => ({
            date: new Date(date),
            predicted: getPredictionRevenue(pred),
            confidenceLower: pred.confidenceLower,
            confidenceUpper: pred.confidenceUpper
        }));

        // Create chart
        const confidenceLevel = this.currentForecast.config?.confidenceLevel ?? this.currentForecast.confidenceLevel ?? 0;
        const config = this.chartConfig.createForecastChartConfig(
            historicalData,
            forecastData,
            {
                showConfidenceInterval: confidenceLevel > 0,
                chartTitle: '',
                isCurrency: true
            }
        );

        const ctx = canvas.getContext('2d');
        this.chartInstances.forecast = new Chart(ctx, config);

        console.log('[SalesForecastingModule] Forecast chart rendered');
    }

    /**
     * Render comparison chart (forecast vs actuals)
     */
    renderComparisonChart(actualData) {
        if (!this.currentForecast) {
            console.warn('[SalesForecastingModule] No forecast data to compare');
            return;
        }

        const canvas = document.getElementById('sf-comparison-chart');
        if (!canvas) {
            console.error('[SalesForecastingModule] Comparison chart canvas not found');
            return;
        }

        // Destroy existing chart
        if (this.chartInstances.comparison) {
            this.chartConfig.destroyChart(this.chartInstances.comparison);
        }

        // Prepare forecast data
        const forecastData = Object.entries(this.currentForecast.predictions || {}).map(([date, pred]) => ({
            date: new Date(date),
            revenue: getPredictionRevenue(pred)
        }));

        // Create chart
        const config = this.chartConfig.createComparisonChartConfig(
            forecastData,
            actualData,
            {
                chartTitle: '',
                isCurrency: true
            }
        );

        const ctx = canvas.getContext('2d');
        this.chartInstances.comparison = new Chart(ctx, config);

        console.log('[SalesForecastingModule] Comparison chart rendered');
    }

    /**
     * Render method performance chart
     */
    renderMethodPerformanceChart(methodData) {
        const canvas = document.getElementById('sf-method-chart');
        if (!canvas) {
            console.error('[SalesForecastingModule] Method chart canvas not found');
            return;
        }

        // Destroy existing chart
        if (this.chartInstances.methodPerformance) {
            this.chartConfig.destroyChart(this.chartInstances.methodPerformance);
        }

        // Create chart
        const config = this.chartConfig.createMethodPerformanceChart(methodData);
        const ctx = canvas.getContext('2d');
        this.chartInstances.methodPerformance = new Chart(ctx, config);

        console.log('[SalesForecastingModule] Method performance chart rendered');
    }

    /**
     * Render seasonal pattern chart
     */
    renderSeasonalPatternChart(seasonalData) {
        const canvas = document.getElementById('sf-seasonal-chart');
        if (!canvas) {
            console.error('[SalesForecastingModule] Seasonal chart canvas not found');
            return;
        }

        // Destroy existing chart
        if (this.chartInstances.seasonal) {
            this.chartConfig.destroyChart(this.chartInstances.seasonal);
        }

        // Create chart
        const config = this.chartConfig.createSeasonalPatternChart(seasonalData);
        const ctx = canvas.getContext('2d');
        this.chartInstances.seasonal = new Chart(ctx, config);

        console.log('[SalesForecastingModule] Seasonal pattern chart rendered');
    }

    /**
     * Render analytics tab - populates metrics, charts and recommendations
     */
    async renderAnalyticsTab() {
        if (!this.currentLocation) return;

        const methodLabels = {
            yoy: 'Year-over-Year', year_over_year: 'Year-over-Year',
            seasonal: 'Seasonal', moving_average: 'Moving Avg',
            simple_trend: 'Linear Trend', exponential: 'Exponential',
            exponential_smoothing: 'Exponential', ml_based: 'ML-Based'
        };

        try {
            const summary = await this.analytics.getAccuracySummary(this.currentLocation);

            // Populate headline metrics
            const mapeEl = document.getElementById('sf-overall-accuracy');
            const bestEl = document.getElementById('sf-best-method');
            const totalEl = document.getElementById('sf-total-forecasts');

            if (mapeEl) mapeEl.textContent = summary.averageMape != null ? summary.averageMape.toFixed(1) + '%' : '--';
            if (bestEl) bestEl.textContent = summary.bestMethod ? (methodLabels[summary.bestMethod] || summary.bestMethod) : '--';
            if (totalEl) totalEl.textContent = summary.totalForecasts || 0;

            // Method performance chart
            const methodAccuracy = summary.methodPerformance || {};
            if (Object.keys(methodAccuracy).length > 0) {
                const methodData = Object.entries(methodAccuracy).map(([method, stats]) => ({
                    name: methodLabels[method] || method,
                    mape: stats.mape || 0
                }));
                requestAnimationFrame(() => this.renderMethodPerformanceChart(methodData));
            }

            // Seasonal patterns chart from loaded historical data
            if (this.historicalData && this.historicalData.length >= 7) {
                const dayTotals = [[], [], [], [], [], [], []];
                for (const d of this.historicalData) {
                    const dt = d.date instanceof Date ? d.date : new Date(d.date);
                    if (!isNaN(dt.getTime()) && d.revenue > 0) {
                        dayTotals[dt.getDay()].push(d.revenue);
                    }
                }
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const seasonalData = dayTotals.map((revs, i) => ({
                    label: dayNames[i],
                    avgRevenue: revs.length > 0 ? revs.reduce((a, b) => a + b, 0) / revs.length : 0
                }));
                requestAnimationFrame(() => this.renderSeasonalPatternChart(seasonalData));
            }

            // Recommendations
            const recsEl = document.getElementById('sf-recommendations');
            if (recsEl) {
                const recs = await this.analytics.getRecommendations(this.currentLocation);
                if (recs.length > 0) {
                    const alertType = { method: 'success', pattern: 'info', accuracy: 'warning' };
                    recsEl.innerHTML = recs.map(r => `
                        <div class="alert alert-${alertType[r.type] || 'info'} mb-2 py-2">
                            <strong>${escapeHtml(r.title)}:</strong> ${escapeHtml(r.message)}
                        </div>`).join('');
                } else {
                    recsEl.innerHTML = `<div class="alert alert-info py-2">
                        <strong>Getting Started:</strong> Generate at least 3 forecasts and upload actuals to unlock personalized recommendations.
                    </div>`;
                }
            }
        } catch (error) {
            console.error('[SalesForecastingModule] Analytics render error:', error);
        }
    }

    /**
     * Render comparison accuracy metrics after actuals upload
     */
    renderComparisonMetrics(comparison) {
        const metricsEl = document.getElementById('sf-accuracy-metrics');
        if (!metricsEl) return;

        const fmtR = v => `R ${Number(v).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
        const fmtPct = v => `${Math.abs(Number(v)).toFixed(1)}%`;

        const variancePct = comparison.revenueVariance?.percent ?? 0;
        const varianceColor = variancePct >= 0 ? 'success' : 'danger';
        const varianceLabel = variancePct >= 0 ? 'below forecast' : 'above forecast';
        const mapeRating = comparison.mape < 5 ? 'Excellent' : comparison.mape < 10 ? 'Good' : comparison.mape < 20 ? 'Fair' : 'Needs improvement';
        const mapeAlertClass = comparison.mape < 5 ? 'success' : comparison.mape < 10 ? 'info' : comparison.mape < 20 ? 'warning' : 'danger';

        metricsEl.innerHTML = `
            <div class="row g-2 text-center mb-3">
                <div class="col-6">
                    <div class="p-2 bg-light rounded">
                        <div class="fw-bold text-primary fs-4">${comparison.mape != null ? fmtPct(comparison.mape) : '--'}</div>
                        <small class="text-muted">MAPE</small>
                    </div>
                </div>
                <div class="col-6">
                    <div class="p-2 bg-light rounded">
                        <div class="fw-bold fs-4">${fmtR(comparison.mae ?? 0)}</div>
                        <small class="text-muted">Avg Daily Error</small>
                    </div>
                </div>
                <div class="col-6">
                    <div class="p-2 bg-light rounded">
                        <div class="fw-bold text-${varianceColor} fs-5">${fmtPct(variancePct)} ${varianceLabel}</div>
                        <small class="text-muted">Revenue Variance</small>
                    </div>
                </div>
                <div class="col-6">
                    <div class="p-2 bg-light rounded">
                        <div class="fw-bold fs-5">${comparison.daysCompared ?? 0}</div>
                        <small class="text-muted">Days Compared</small>
                    </div>
                </div>
            </div>
            <div class="alert alert-${mapeAlertClass} py-2 mb-0">
                <strong>${escapeHtml(mapeRating)}</strong> — ${comparison.daysCompared > 0
                    ? `Forecast accuracy: ${fmtPct(comparison.mape)} average error across ${comparison.daysCompared} days.`
                    : 'No matching dates. Ensure actuals overlap with the forecast period.'}
            </div>`;
    }

    /**
     * Refresh the historical data table body (called on filter change)
     */
    refreshHistoricalTable() {
        const filterEl = document.getElementById('sf-hist-filter');
        if (filterEl) this.historicalFilter = filterEl.value;

        if (this.historicalFilter === 'custom') {
            const startEl = document.getElementById('sf-hist-start');
            const endEl = document.getElementById('sf-hist-end');
            this.historicalCustomStart = startEl?.value || null;
            this.historicalCustomEnd = endEl?.value || null;
        }

        const bodyEl = document.getElementById('sf-hist-table-body');
        const summaryEl = document.getElementById('sf-hist-summary');
        if (!bodyEl || !this.historicalData?.length) return;

        const filtered = this._getFilteredHistoricalData();
        bodyEl.innerHTML = this._buildHistoricalRows(filtered);
        if (summaryEl) summaryEl.innerHTML = this._buildHistoricalSummary(filtered);
    }

    _getFilteredHistoricalData() {
        if (!this.historicalData?.length) return [];

        const sorted = (arr) => [...arr].sort((a, b) => new Date(b.date) - new Date(a.date));

        if (this.historicalFilter === 'custom') {
            if (!this.historicalCustomStart || !this.historicalCustomEnd) {
                return sorted(this.historicalData);
            }
            const start = new Date(this.historicalCustomStart + 'T00:00:00');
            const end = new Date(this.historicalCustomEnd + 'T23:59:59');
            return sorted(this.historicalData.filter(d => {
                const dt = d.date instanceof Date ? d.date : new Date(d.date);
                return dt >= start && dt <= end;
            }));
        }

        const cutoffs = { week: 7, month: 30, quarter: 90, year: 365 };
        const days = cutoffs[this.historicalFilter];

        if (!days) return sorted(this.historicalData);

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        return sorted(this.historicalData.filter(d => {
            const dt = d.date instanceof Date ? d.date : new Date(d.date);
            return dt >= cutoff;
        }));
    }

    _buildHistoricalRows(data) {
        if (!data.length) return '<tr><td colspan="4" class="text-center text-muted py-3">No records in selected period</td></tr>';
        const fmt = v => `R ${Number(v).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
        return data.map(d => {
            const dt = d.date instanceof Date ? d.date : new Date(d.date);
            const displayDate = isNaN(dt.getTime()) ? escapeHtml(String(d.date))
                : dt.toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
            const isClosed = (d.revenue ?? 0) === 0;
            const rowClass = isClosed ? ' class="text-muted"' : '';
            const dateCell = isClosed
                ? `${displayDate} <span class="badge bg-secondary ms-1" style="font-size:0.65rem">Closed</span>`
                : displayDate;
            return `<tr${rowClass} style="${isClosed ? 'opacity:0.55' : ''}">
                <td>${dateCell}</td>
                <td>${fmt(d.revenue ?? 0)}</td>
                <td>${Number(d.transactions ?? 0).toLocaleString('en-ZA')}</td>
                <td>${fmt(d.avgSpend ?? 0)}</td>
            </tr>`;
        }).join('');
    }

    _buildForecastSummary(predictions) {
        const entries = Object.entries(predictions || {});
        if (!entries.length) return '';

        const fmt = v => `R ${Number(v).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;

        let totalRevenue = 0;
        let totalSpend = 0;
        let spendCount = 0;
        let peakRevenue = 0;
        let peakDate = null;

        for (const [date, pred] of entries) {
            const revenue = pred.adjusted?.revenue ?? pred.predicted ?? 0;
            const spend = pred.adjusted?.avgSpend ?? pred.avgSpend ?? 0;
            totalRevenue += revenue;
            if (spend > 0) { totalSpend += spend; spendCount++; }
            if (revenue > peakRevenue) { peakRevenue = revenue; peakDate = date; }
        }

        const days = entries.length;
        const avgDaily = days > 0 ? totalRevenue / days : 0;
        const avgSpend = spendCount > 0 ? totalSpend / spendCount : 0;
        const peakDt = peakDate ? new Date(peakDate + 'T00:00:00') : null;
        const peakLabel = peakDt
            ? peakDt.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
            : '—';

        return `
            <div class="row g-2 mb-3">
                <div class="col-6 col-md">
                    <div class="p-2 bg-light rounded text-center">
                        <div class="fw-bold small">${fmt(totalRevenue)}</div>
                        <div class="text-muted" style="font-size:0.75rem">Total Forecast</div>
                    </div>
                </div>
                <div class="col-6 col-md">
                    <div class="p-2 bg-light rounded text-center">
                        <div class="fw-bold small">${fmt(avgDaily)}</div>
                        <div class="text-muted" style="font-size:0.75rem">Avg Daily</div>
                    </div>
                </div>
                <div class="col-6 col-md">
                    <div class="p-2 bg-light rounded text-center">
                        <div class="fw-bold small">${fmt(peakRevenue)}</div>
                        <div class="text-muted" style="font-size:0.75rem">Peak Day (${escapeHtml(peakLabel)})</div>
                    </div>
                </div>
                <div class="col-6 col-md">
                    <div class="p-2 bg-light rounded text-center">
                        <div class="fw-bold small">${fmt(avgSpend)}</div>
                        <div class="text-muted" style="font-size:0.75rem">Avg Spend</div>
                    </div>
                </div>
                <div class="col-6 col-md">
                    <div class="p-2 bg-light rounded text-center">
                        <div class="fw-bold small">${days.toLocaleString('en-ZA')}</div>
                        <div class="text-muted" style="font-size:0.75rem">Forecast Days</div>
                    </div>
                </div>
            </div>`;
    }

    _buildHistoricalSummary(data) {
        if (!data.length) return '';
        const fmt = v => `R ${Number(v).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
        const tradingDays = data.filter(d => (d.revenue ?? 0) > 0);
        const closedCount = data.length - tradingDays.length;
        const totalRevenue = tradingDays.reduce((s, d) => s + (d.revenue ?? 0), 0);
        // Avg daily uses only trading days so closed days don't drag the number down
        const avgDaily = tradingDays.length > 0 ? totalRevenue / tradingDays.length : 0;
        const bestDay = tradingDays.length > 0
            ? tradingDays.reduce((best, d) => (d.revenue ?? 0) > (best.revenue ?? 0) ? d : best, tradingDays[0])
            : null;
        const recordsLabel = closedCount > 0
            ? `${data.length.toLocaleString('en-ZA')} <small class="text-muted">(${closedCount} closed)</small>`
            : data.length.toLocaleString('en-ZA');
        return `
            <div class="row g-2 mb-2">
                <div class="col-6 col-md-3">
                    <div class="p-2 bg-light rounded text-center">
                        <div class="fw-bold small">${fmt(totalRevenue)}</div>
                        <div class="text-muted" style="font-size:0.75rem">Total Revenue</div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="p-2 bg-light rounded text-center">
                        <div class="fw-bold small">${fmt(avgDaily)}</div>
                        <div class="text-muted" style="font-size:0.75rem">Avg Daily (trading)</div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="p-2 bg-light rounded text-center">
                        <div class="fw-bold small">${bestDay ? fmt(bestDay.revenue ?? 0) : '—'}</div>
                        <div class="text-muted" style="font-size:0.75rem">Best Day</div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="p-2 bg-light rounded text-center">
                        <div class="fw-bold small">${recordsLabel}</div>
                        <div class="text-muted" style="font-size:0.75rem">Records</div>
                    </div>
                </div>
            </div>`;
    }

    /**
     * Clean up all chart instances
     */
    destroyAllCharts() {
        Object.keys(this.chartInstances).forEach(key => {
            if (this.chartInstances[key]) {
                this.chartConfig.destroyChart(this.chartInstances[key]);
                this.chartInstances[key] = null;
            }
        });
        console.log('[SalesForecastingModule] All charts destroyed');
    }
}

// Export for ES modules
export default SalesForecastingModule;
