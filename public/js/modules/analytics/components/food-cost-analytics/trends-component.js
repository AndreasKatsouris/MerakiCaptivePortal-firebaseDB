/**
 * Food Cost Analytics - Trends Component
 * 
 * This component provides trend analysis for food cost data.
 */

import { ChartManager } from '../../chart-manager.js';
import { Utilities } from '../../utilities.js';

// Trends Analytics component
const TrendsAnalytics = {
    name: 'TrendsAnalytics',
    props: {
        processedData: {
            type: Object,
            required: true
        }
    },
    data() {
        return {
            loading: false,
            categoryFilter: 'all',
            topItemsCount: 10,
            viewMode: 'value', // 'value' or 'quantity'
            // Make utilities available in the template
            utils: Utilities
        };
    },
    computed: {
        /**
         * Get available categories for filtering
         */
        availableCategories() {
            if (!this.processedData || !this.processedData.categoryData) {
                return [];
            }
            
            return Object.keys(this.processedData.categoryData).sort();
        },
        
        /**
         * Get chart title based on view mode
         */
        chartTitle() {
            return this.viewMode === 'value' 
                ? 'Usage Value Trends' 
                : 'Usage Quantity Trends';
        }
    },
    methods: {
        /**
         * Initialize charts
         */
        initCharts() {
            this.loading = true;
            
            // Wait for DOM to be ready
            this.$nextTick(() => {
                // Create trend chart
                this.createTrendChart();
                
                // Create category breakdown chart
                this.createCategoryChart();
                
                // Create top items chart
                this.createTopItemsChart();
                
                this.loading = false;
            });
        },
        
        /**
         * Create trend chart
         */
        createTrendChart() {
            if (!this.processedData || !this.processedData.trends) return;
            
            const trendData = {
                timeLabels: this.processedData.trends.timeLabels,
                usage: this.processedData.trends.usage,
                value: this.processedData.trends.value
            };
            
            ChartManager.createFoodCostTrendsChart('trendChart', trendData, {
                plugins: {
                    title: {
                        display: true,
                        text: 'Food Cost Usage Trends Over Time'
                    }
                }
            });
        },
        
        /**
         * Create category breakdown chart
         */
        createCategoryChart() {
            if (!this.processedData || !this.processedData.categoryData) return;
            
            ChartManager.createFoodCostCategoryChart('categoryChart', this.processedData.categoryData, {
                plugins: {
                    title: {
                        display: true,
                        text: 'Usage by Category'
                    }
                }
            });
        },
        
        /**
         * Create top items chart
         */
        createTopItemsChart() {
            if (!this.processedData || !this.processedData.itemMetrics) return;
            
            // Filter items by category if needed
            let itemsData = this.processedData.itemMetrics;
            if (this.categoryFilter !== 'all') {
                itemsData = Object.entries(this.processedData.itemMetrics)
                    .filter(([, item]) => item.category === this.categoryFilter)
                    .reduce((obj, [key, value]) => {
                        obj[key] = value;
                        return obj;
                    }, {});
            }
            
            // Determine which property to use for sorting and display
            const valueProperty = this.viewMode === 'value' ? 'totalValue' : 'totalUsage';
            
            ChartManager.createFoodCostItemsChart('topItemsChart', itemsData, this.topItemsCount, {
                plugins: {
                    title: {
                        display: true,
                        text: `Top ${this.topItemsCount} Items by ${this.viewMode === 'value' ? 'Value' : 'Quantity'}`
                    }
                }
            });
        },
        
        /**
         * Update view mode and refresh charts
         */
        updateViewMode(mode) {
            this.viewMode = mode;
            this.createTopItemsChart();
        },
        
        /**
         * Update category filter and refresh top items chart
         */
        updateCategoryFilter(category) {
            this.categoryFilter = category;
            this.createTopItemsChart();
        },
        
        /**
         * Update top items count and refresh chart
         */
        updateTopItemsCount(count) {
            this.topItemsCount = count;
            this.createTopItemsChart();
        }
    },
    mounted() {
        // Initialize charts once the component is mounted
        this.initCharts();
    },
    watch: {
        // Only reinitialize charts when processedData changes
        processedData: {
            handler(newData, oldData) {
                // Check if we need to update charts
                if (newData && (!oldData || JSON.stringify(newData) !== JSON.stringify(oldData))) {
                    console.log('Processed data changed, updating charts');
                    this.initCharts();
                }
            },
            deep: true
        },
        // Watch for view mode changes
        viewMode() {
            // Only update trend chart when view mode changes
            this.createTrendChart();
        },
        // Watch for category filter changes
        categoryFilter() {
            // Only update items chart when category filter changes
            this.createTopItemsChart();
        },
        // Watch for top items count changes
        topItemsCount() {
            // Only update items chart when count changes
            this.createTopItemsChart();
        }
    },
    template: `
        <div class="trends-analytics">
            <!-- Loading indicator -->
            <div v-if="loading" class="text-center py-3">
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <span class="ms-2">Loading charts...</span>
            </div>
            
            <!-- Trend Analysis -->
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <h5 class="card-title">Usage Trends Over Time</h5>
                            <p class="text-muted">This chart shows how usage has changed over the analyzed period.</p>
                            <div class="chart-container" style="position: relative; height: 300px;">
                                <canvas id="trendChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Category and Top Items -->
            <div class="row">
                <!-- Category Breakdown -->
                <div class="col-md-5 mb-4">
                    <div class="card shadow-sm h-100">
                        <div class="card-body">
                            <h5 class="card-title">Category Breakdown</h5>
                            <p class="text-muted">Distribution of usage across categories.</p>
                            <div class="chart-container" style="position: relative; height: 300px;">
                                <canvas id="categoryChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Top Items -->
                <div class="col-md-7 mb-4">
                    <div class="card shadow-sm h-100">
                        <div class="card-body">
                            <h5 class="card-title">
                                Top Items 
                                <div class="float-end">
                                    <div class="btn-group btn-group-sm" role="group">
                                        <button type="button" class="btn" 
                                                :class="viewMode === 'value' ? 'btn-primary' : 'btn-outline-primary'"
                                                @click="updateViewMode('value')">
                                            Value
                                        </button>
                                        <button type="button" class="btn" 
                                                :class="viewMode === 'quantity' ? 'btn-primary' : 'btn-outline-primary'"
                                                @click="updateViewMode('quantity')">
                                            Quantity
                                        </button>
                                    </div>
                                </div>
                            </h5>
                            
                            <div class="mb-3 d-flex align-items-center">
                                <label for="categoryFilter" class="form-label me-2 mb-0">Category:</label>
                                <select id="categoryFilter" class="form-select form-select-sm" style="width: auto;" 
                                        v-model="categoryFilter" @change="updateCategoryFilter(categoryFilter)">
                                    <option value="all">All Categories</option>
                                    <option v-for="category in availableCategories" :key="category" :value="category">
                                        {{ category }}
                                    </option>
                                </select>
                                
                                <label for="topItemsCount" class="form-label ms-3 me-2 mb-0">Show:</label>
                                <select id="topItemsCount" class="form-select form-select-sm" style="width: auto;" 
                                        v-model="topItemsCount" @change="updateTopItemsCount(topItemsCount)">
                                    <option value="5">Top 5</option>
                                    <option value="10">Top 10</option>
                                    <option value="15">Top 15</option>
                                    <option value="20">Top 20</option>
                                </select>
                            </div>
                            
                            <div class="chart-container" style="position: relative; height: 300px;">
                                <canvas id="topItemsChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};

// Export the component
export { TrendsAnalytics };
