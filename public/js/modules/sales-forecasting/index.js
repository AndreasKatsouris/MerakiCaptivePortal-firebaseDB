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

import { SalesDataService } from './sales-data-service.js';
import { ForecastEngine } from './forecast-engine.js';
import { ForecastAnalytics } from './forecast-analytics.js';
import ChartConfig from './chart-config.js';

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

        // State
        this.currentLocation = null;
        this.historicalData = [];
        this.savedDataSets = [];
        this.currentForecast = null;
        this.currentView = 'upload'; // 'upload', 'forecast', 'adjust', 'compare', 'analytics'

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
     * Load saved historical data sets
     */
    async loadSavedData() {
        if (this.isAdmin) {
            // Admin can see all locations
            for (const location of this.locations) {
                const data = await this.dataService.getHistoricalDataList(location.id);
                this.savedDataSets.push(...data);
            }
        } else if (this.currentLocation) {
            // User sees only selected location
            this.savedDataSets = await this.dataService.getHistoricalDataList(this.currentLocation);
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

            this.currentForecast = {
                ...forecast,
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
                                <option value="${loc.id}" ${loc.id === this.currentLocation ? 'selected' : ''}>
                                    ${loc.name}
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
        switch (this.currentView) {
            case 'upload':
                return this.getUploadViewContent();
            case 'forecast':
                return this.getForecastViewContent();
            case 'adjust':
                return this.getAdjustViewContent();
            case 'compare':
                return this.getCompareViewContent();
            case 'analytics':
                return this.getAnalyticsViewContent();
            default:
                return '<p>Select a view</p>';
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
                        <div class="card">
                            <div class="card-header">
                                <h5><i class="fas fa-database me-2"></i>Saved Data Sets</h5>
                            </div>
                            <div class="card-body">
                                ${this.getSavedDataListHtml()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get saved data list HTML
     */
    getSavedDataListHtml() {
        if (this.savedDataSets.length === 0) {
            return `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-2"></i>
                    <p>No saved data sets</p>
                </div>
            `;
        }

        return `
            <div class="list-group">
                ${this.savedDataSets.map(dataset => `
                    <div class="list-group-item list-group-item-action">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-1">${dataset.locationName}</h6>
                                <small class="text-muted">
                                    ${dataset.dateRange.startDate} to ${dataset.dateRange.endDate}
                                    | ${dataset.recordCount} records
                                </small>
                            </div>
                            <div>
                                <button class="btn btn-sm btn-outline-primary sf-use-data" 
                                        data-id="${dataset.id}">
                                    <i class="fas fa-chart-line"></i> Use
                                </button>
                                <button class="btn btn-sm btn-outline-danger sf-delete-data" 
                                        data-id="${dataset.id}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
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
                                        <option value="seasonal" selected>Seasonal Analysis</option>
                                        <option value="simple_trend">Simple Trend (Linear)</option>
                                        <option value="exponential">Exponential Growth</option>
                                        <option value="ml_based">ML-Based (Prophet-like)</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Forecast Horizon</label>
                                    <select id="sf-horizon" class="form-select">
                                        <option value="7">1 Week</option>
                                        <option value="14">2 Weeks</option>
                                        <option value="30" selected>1 Month</option>
                                        <option value="60">2 Months</option>
                                        <option value="90">3 Months</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Confidence Interval</label>
                                    <select id="sf-confidence" class="form-select">
                                        <option value="0">None</option>
                                        <option value="80">80%</option>
                                        <option value="90">90%</option>
                                        <option value="95" selected>95%</option>
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
                                    <button id="sf-save-forecast-btn" class="btn btn-primary btn-sm" disabled>
                                        <i class="fas fa-save me-1"></i> Save Forecast
                                    </button>
                                    <button id="sf-export-btn" class="btn btn-secondary btn-sm" disabled>
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
        `;
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

        return Object.entries(this.currentForecast.predictions).map(([date, pred]) => `
            <tr data-date="${date}">
                <td>${new Date(date).toLocaleDateString()}</td>
                <td>R ${pred.original.revenue.toLocaleString()}</td>
                <td>
                    <input type="number" class="form-control form-control-sm sf-adjust-revenue" 
                           value="${pred.adjusted?.revenue || pred.original.revenue}"
                           data-date="${date}">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm sf-adjust-transactions" 
                           value="${pred.adjusted?.transactions || pred.original.transactions}"
                           data-date="${date}">
                </td>
                <td>R ${(pred.adjusted?.avgSpend || pred.original.avgSpend).toFixed(2)}</td>
                <td>
                    <input type="text" class="form-control form-control-sm sf-adjust-reason" 
                           value="${pred.adjustmentReason || ''}"
                           placeholder="e.g., Holiday expected"
                           data-date="${date}">
                </td>
            </tr>
        `).join('');
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

        // Tab navigation
        container.querySelectorAll('.sf-tabs .nav-link').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.currentView = e.target.dataset.view;
                this.render();
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
        // This will be implemented to parse and process the file
        console.log('[SalesForecastingModule] File upload:', file.name);
    }

    /**
     * Handle generate forecast
     */
    async handleGenerateForecast() {
        // This will be implemented to generate forecast
        console.log('[SalesForecastingModule] Generating forecast...');
    }

    /**
     * Handle save forecast
     */
    async handleSaveForecast() {
        // This will be implemented to save forecast
        console.log('[SalesForecastingModule] Saving forecast...');
    }

    /**
     * Handle export CSV
     */
    handleExportCSV() {
        // This will be implemented to export forecast
        console.log('[SalesForecastingModule] Exporting CSV...');
    }

    /**
     * Handle actuals upload
     */
    async handleActualsUpload(file) {
        // This will be implemented to upload actuals
        console.log('[SalesForecastingModule] Actuals upload:', file.name);
    }

    /**
     * Handle adjustment change
     */
    async handleAdjustmentChange(event) {
        // This will be implemented to handle adjustments
        console.log('[SalesForecastingModule] Adjustment change:', event.target.value);
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
                    <strong>Error:</strong> ${message}
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
            revenue: pred.adjusted?.revenue || pred.original?.revenue || pred.revenue,
            confidenceInterval: pred.confidenceInterval
        }));

        // Create chart
        const config = this.chartConfig.createForecastChartConfig(
            historicalData,
            forecastData,
            {
                showConfidenceInterval: this.currentForecast.confidenceLevel > 0,
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
            revenue: pred.adjusted?.revenue || pred.original?.revenue || pred.revenue
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
