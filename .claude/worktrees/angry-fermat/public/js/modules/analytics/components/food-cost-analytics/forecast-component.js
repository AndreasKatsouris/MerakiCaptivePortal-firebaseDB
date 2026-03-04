/**
 * Food Cost Analytics - Forecast Component
 * 
 * This component provides forecasting and predictive analysis for food cost data.
 */

import { ChartManager } from '../../chart-manager.js';
import { Utilities } from '../../utilities.js';

// Forecast Analytics component
const ForecastAnalytics = {
    name: 'ForecastAnalytics',
    props: {
        processedData: {
            type: Object,
            required: true
        },
        dateRange: {
            type: Object,
            required: true
        }
    },
    data() {
        return {
            loading: false,
            forecastPeriod: 14, // Default to 14 days
            selectedItems: [],
            forecastMethod: 'linear', // 'linear', 'average', 'weighted'
            showDetailsFor: null,
            forecastData: null,
            utils: Utilities // Make utilities available in the template
        };
    },
    computed: {
        /**
         * Get top items for selection
         */
        topItems() {
            if (!this.processedData || !this.processedData.itemMetrics) {
                return [];
            }
            
            return Object.entries(this.processedData.itemMetrics)
                .map(([name, data]) => ({ name, ...data }))
                .sort((a, b) => b.totalValue - a.totalValue)
                .slice(0, 20); // Top 20 items
        },
        
        /**
         * Get forecast end date
         */
        forecastEndDate() {
            if (!this.dateRange || !this.dateRange.endDate) return '';
            
            const endDate = new Date(this.dateRange.endDate);
            endDate.setDate(endDate.getDate() + this.forecastPeriod);
            
            return Utilities.formatDate(endDate);
        }
    },
    methods: {
        /**
         * Initialize the component
         */
        initialize() {
            this.loading = true;
            
            // Pre-select top 5 items for forecasting
            this.selectedItems = this.topItems.slice(0, 5).map(item => item.name);
            
            // Generate forecast
            this.generateForecast();
            
            this.loading = false;
        },
        
        /**
         * Generate forecast data based on historical data
         */
        generateForecast() {
            if (!this.processedData || !this.processedData.itemMetrics || this.selectedItems.length === 0) {
                this.forecastData = null;
                return;
            }
            
            try {
                // Get date range for forecast
                const endDate = new Date(this.dateRange.endDate);
                const forecastDates = [];
                
                // Generate dates for forecast period
                for (let i = 1; i <= this.forecastPeriod; i++) {
                    const date = new Date(endDate);
                    date.setDate(date.getDate() + i);
                    forecastDates.push(date.toISOString().split('T')[0]);
                }
                
                // Generate forecast for each selected item
                const itemForecasts = {};
                
                this.selectedItems.forEach(itemName => {
                    const item = this.processedData.itemMetrics[itemName];
                    if (!item) return;
                    
                    // Get the usage history
                    const usageHistory = item.usageHistory || [];
                    const dateHistory = item.dateHistory || [];
                    
                    if (usageHistory.length === 0) return;
                    
                    let forecastValues;
                    
                    // Apply the selected forecast method
                    switch (this.forecastMethod) {
                        case 'average':
                            // Simple average of past usage
                            const avgUsage = usageHistory.reduce((sum, val) => sum + val, 0) / usageHistory.length;
                            forecastValues = forecastDates.map(() => avgUsage);
                            break;
                            
                        case 'weighted':
                            // Weighted average with more weight to recent values
                            const weights = Array.from({ length: usageHistory.length }, (_, i) => i + 1);
                            const weightSum = weights.reduce((sum, val) => sum + val, 0);
                            const weightedAvg = usageHistory.reduce((sum, val, i) => sum + val * weights[i], 0) / weightSum;
                            forecastValues = forecastDates.map(() => weightedAvg);
                            break;
                            
                        case 'linear':
                        default:
                            // Linear regression
                            forecastValues = this.linearRegressionForecast(
                                usageHistory, 
                                dateHistory, 
                                forecastDates
                            );
                            break;
                    }
                    
                    itemForecasts[itemName] = {
                        name: itemName,
                        category: item.category || 'Uncategorized',
                        history: {
                            dates: dateHistory,
                            values: usageHistory
                        },
                        forecast: {
                            dates: forecastDates,
                            values: forecastValues
                        },
                        combined: {
                            dates: [...dateHistory, ...forecastDates],
                            values: [...usageHistory, ...forecastValues]
                        },
                        totalForecast: forecastValues.reduce((sum, val) => sum + val, 0),
                        avgHistory: usageHistory.length > 0 ? 
                            usageHistory.reduce((sum, val) => sum + val, 0) / usageHistory.length : 0,
                        avgForecast: forecastValues.length > 0 ? 
                            forecastValues.reduce((sum, val) => sum + val, 0) / forecastValues.length : 0
                    };
                    
                    // Calculate projected value based on average unit cost
                    if (item.totalUsage > 0 && item.totalValue > 0) {
                        const avgUnitCost = item.totalValue / item.totalUsage;
                        itemForecasts[itemName].unitCost = avgUnitCost;
                        itemForecasts[itemName].projectedValue = itemForecasts[itemName].totalForecast * avgUnitCost;
                    }
                });
                
                this.forecastData = {
                    dates: forecastDates,
                    items: itemForecasts
                };
                
                // Create or update the forecast chart
                this.$nextTick(() => {
                    this.createForecastChart();
                });
            } catch (error) {
                console.error('Error generating forecast:', error);
                this.forecastData = null;
            }
        },
        
        /**
         * Create forecast chart
         */
        createForecastChart() {
            if (!this.forecastData || Object.keys(this.forecastData.items).length === 0) return;
            
            // Prepare chart datasets
            const datasets = [];
            const colorPalette = [
                'rgba(75, 192, 192, 1)',
                'rgba(255, 99, 132, 1)',
                'rgba(54, 162, 235, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(153, 102, 255, 1)',
                'rgba(255, 159, 64, 1)',
                'rgba(76, 175, 80, 1)',
                'rgba(233, 30, 99, 1)',
                'rgba(3, 169, 244, 1)',
                'rgba(255, 152, 0, 1)'
            ];
            
            // Create a dataset for each item
            Object.values(this.forecastData.items).forEach((item, index) => {
                const color = colorPalette[index % colorPalette.length];
                const bgColor = color.replace('1)', '0.2)');
                
                datasets.push({
                    label: item.name,
                    data: item.combined.values,
                    borderColor: color,
                    backgroundColor: bgColor,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    segment: {
                        borderDash: function(ctx) {
                            // Use dashed line for forecast part
                            return ctx.p1DataIndex >= item.history.dates.length ? [6, 6] : undefined;
                        }
                    }
                });
            });
            
            // Create chart data
            const chartData = {
                labels: this.forecastData.items[this.selectedItems[0]].combined.dates,
                datasets: datasets
            };
            
            // Get or create the chart
            const chartCanvas = document.getElementById('forecastChart');
            if (!chartCanvas) return;
            
            ChartManager.createChart('forecastChart', 'line', chartData, {
                plugins: {
                    title: {
                        display: true,
                        text: `Usage Forecast (${this.forecastPeriod} days)`
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.raw;
                                return `${context.dataset.label}: ${Utilities.formatNumber(value)} units`;
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line',
                                xMin: this.forecastData.items[this.selectedItems[0]].history.dates.length - 0.5,
                                xMax: this.forecastData.items[this.selectedItems[0]].history.dates.length - 0.5,
                                borderColor: 'rgba(0, 0, 0, 0.5)',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    content: 'Forecast Start',
                                    display: true,
                                    position: 'start',
                                    backgroundColor: 'rgba(0, 0, 0, 0.7)'
                                }
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Usage Quantity'
                        },
                        beginAtZero: true
                    }
                }
            });
        },
        
        /**
         * Linear regression forecast
         * @param {Array} historicalValues - Historical usage values
         * @param {Array} historicalDates - Historical dates
         * @param {Array} forecastDates - Dates to forecast for
         * @returns {Array} Forecasted values
         */
        linearRegressionForecast(historicalValues, historicalDates, forecastDates) {
            if (!historicalValues || historicalValues.length < 2) {
                // If insufficient data, return average
                const avg = historicalValues.length > 0 ? 
                    historicalValues.reduce((sum, val) => sum + val, 0) / historicalValues.length : 0;
                return forecastDates.map(() => avg);
            }
            
            // Convert dates to numeric values (days since first date)
            const firstDate = new Date(historicalDates[0]);
            const dayValues = historicalDates.map(date => {
                const days = (new Date(date) - firstDate) / (1000 * 60 * 60 * 24);
                return days;
            });
            
            // Calculate linear regression
            const n = dayValues.length;
            const sumX = dayValues.reduce((sum, x) => sum + x, 0);
            const sumY = historicalValues.reduce((sum, y) => sum + y, 0);
            const sumXY = dayValues.reduce((sum, x, i) => sum + x * historicalValues[i], 0);
            const sumXX = dayValues.reduce((sum, x) => sum + x * x, 0);
            
            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;
            
            // Generate forecast based on regression
            return forecastDates.map(date => {
                const days = (new Date(date) - firstDate) / (1000 * 60 * 60 * 24);
                let predicted = intercept + slope * days;
                
                // Ensure no negative values
                predicted = Math.max(0, predicted);
                
                return predicted;
            });
        },
        
        /**
         * Update forecast parameters and regenerate
         */
        updateForecast() {
            this.generateForecast();
        },
        
        /**
         * Toggle item details
         * @param {string} itemName - Name of the item to show/hide details for
         */
        toggleItemDetails(itemName) {
            this.showDetailsFor = this.showDetailsFor === itemName ? null : itemName;
        },
        
        /**
         * Calculate change percentage
         * @param {number} before - Value before
         * @param {number} after - Value after
         * @returns {string} Formatted percentage
         */
        calculateChange(before, after) {
            const change = Utilities.calculatePercentageChange(before, after);
            return Utilities.formatPercentageChange(change);
        }
    },
    mounted() {
        this.initialize();
    },
    watch: {
        // Re-initialize when processed data changes
        processedData: {
            handler() {
                this.initialize();
            },
            deep: true
        }
    },
    template: `
        <div class="forecast-analytics">
            <!-- Loading indicator -->
            <div v-if="loading" class="text-center py-3">
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span class="ms-2">Generating forecast...</span>
            </div>
            
            <!-- Forecast Controls -->
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <h5 class="card-title">Forecast Configuration</h5>
                            <div class="row align-items-end">
                                <div class="col-md-3 mb-3">
                                    <label for="forecastPeriod" class="form-label">Forecast Period (Days)</label>
                                    <select id="forecastPeriod" class="form-select" v-model.number="forecastPeriod">
                                        <option value="7">7 Days</option>
                                        <option value="14">14 Days</option>
                                        <option value="30">30 Days</option>
                                        <option value="60">60 Days</option>
                                        <option value="90">90 Days</option>
                                    </select>
                                </div>
                                <div class="col-md-3 mb-3">
                                    <label for="forecastMethod" class="form-label">Forecast Method</label>
                                    <select id="forecastMethod" class="form-select" v-model="forecastMethod">
                                        <option value="linear">Linear Regression</option>
                                        <option value="average">Simple Average</option>
                                        <option value="weighted">Weighted Average</option>
                                    </select>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label">Date Range</label>
                                    <div class="input-group">
                                        <span class="input-group-text">From</span>
                                        <input type="text" class="form-control" :value="dateRange.startDate" disabled>
                                        <span class="input-group-text">To</span>
                                        <input type="text" class="form-control" :value="forecastEndDate" disabled>
                                    </div>
                                </div>
                                <div class="col-md-2 mb-3">
                                    <button class="btn btn-primary w-100" @click="updateForecast">
                                        <i class="fas fa-sync-alt me-2"></i> Update Forecast
                                    </button>
                                </div>
                            </div>
                            <div class="row mt-2">
                                <div class="col-md-12">
                                    <label class="form-label">Select Items to Forecast</label>
                                    <div class="item-selection">
                                        <div class="row">
                                            <div v-for="item in topItems" :key="item.name" class="col-md-3 col-sm-6 mb-2">
                                                <div class="form-check">
                                                    <input class="form-check-input" type="checkbox" :id="'item-' + item.name"
                                                        v-model="selectedItems" :value="item.name">
                                                    <label class="form-check-label" :for="'item-' + item.name">
                                                        {{ item.name }} ({{ utils.formatCurrency(item.totalValue) }})
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Forecast Chart -->
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <h5 class="card-title">Usage Forecast</h5>
                            <p class="text-muted">
                                Solid lines represent historical data, dashed lines show the forecast for the next 
                                {{ forecastPeriod }} days.
                            </p>
                            <div class="chart-container" style="position: relative; height: 400px;">
                                <canvas id="forecastChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Forecast Results -->
            <div v-if="forecastData && Object.keys(forecastData.items).length > 0" class="row mb-4">
                <div class="col-md-12">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <h5 class="card-title">Forecast Summary</h5>
                            <div class="table-responsive">
                                <table class="table table-striped table-hover">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Category</th>
                                            <th>Avg. Historical Usage</th>
                                            <th>Forecasted Usage ({{ forecastPeriod }} days)</th>
                                            <th>Avg. Daily Forecast</th>
                                            <th>Change</th>
                                            <th>Est. Value</th>
                                            <th>Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <template v-for="itemName in selectedItems" :key="itemName">
                                            <tr v-if="forecastData.items[itemName]">
                                                <td>{{ itemName }}</td>
                                                <td>{{ forecastData.items[itemName].category }}</td>
                                                <td>{{ Utilities.formatNumber(forecastData.items[itemName].avgHistory) }}</td>
                                                <td>{{ Utilities.formatNumber(forecastData.items[itemName].totalForecast) }}</td>
                                                <td>{{ Utilities.formatNumber(forecastData.items[itemName].avgForecast) }}</td>
                                                <td :class="forecastData.items[itemName].avgForecast > forecastData.items[itemName].avgHistory ? 'text-danger' : 'text-success'">
                                                    {{ calculateChange(forecastData.items[itemName].avgHistory, forecastData.items[itemName].avgForecast) }}
                                                </td>
                                                <td>{{ utils.formatCurrency(forecastData.items[itemName].projectedValue) }}</td>
                                                <td>
                                                    <button @click="toggleItemDetails(itemName)" class="btn btn-sm btn-outline-secondary">
                                                        <i :class="showDetailsFor === itemName ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                            <tr v-if="showDetailsFor === itemName && forecastData.items[itemName]">
                                                <td colspan="8" class="p-0">
                                                    <div class="p-3 bg-light">
                                                        <h6>Forecast Details for {{ itemName }}</h6>
                                                        <div class="row">
                                                            <div class="col-md-6">
                                                                <p><strong>Unit Cost:</strong> {{ utils.formatCurrency(forecastData.items[itemName].unitCost) }}</p>
                                                                <p><strong>Total Historical Records:</strong> {{ forecastData.items[itemName].history.dates.length }}</p>
                                                                <p><strong>Forecast Method:</strong> {{ forecastMethod === 'linear' ? 'Linear Regression' : forecastMethod === 'weighted' ? 'Weighted Average' : 'Simple Average' }}</p>
                                                            </div>
                                                            <div class="col-md-6">
                                                                <p><strong>Projected Daily Usage:</strong> {{ Utilities.formatNumber(forecastData.items[itemName].avgForecast) }} units</p>
                                                                <p><strong>Projected {{ forecastPeriod }}-Day Usage:</strong> {{ Utilities.formatNumber(forecastData.items[itemName].totalForecast) }} units</p>
                                                                <p><strong>Projected {{ forecastPeriod }}-Day Value:</strong> {{ utils.formatCurrency(forecastData.items[itemName].projectedValue) }}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        </template>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- No data message -->
            <div v-if="!forecastData || Object.keys(forecastData.items).length === 0" class="card">
                <div class="card-body text-center py-5">
                    <i class="fas fa-chart-line fa-3x text-muted mb-3"></i>
                    <h4>No Forecast Available</h4>
                    <p class="text-muted">
                        There isn't enough data to generate a forecast.<br>
                        Please select at least one item and ensure there is sufficient historical data.
                    </p>
                </div>
            </div>
        </div>
    `
};

// Export the component
export { ForecastAnalytics };
