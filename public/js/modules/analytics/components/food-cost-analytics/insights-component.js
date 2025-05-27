/**
 * Food Cost Analytics - Insights Component
 * 
 * This component provides automated insights and analysis for food cost data.
 */

import { Utilities } from '../../utilities.js';

// Insights Analytics component
const InsightsAnalytics = {
    name: 'InsightsAnalytics',
    props: {
        processedData: {
            type: Object,
            required: true
        }
    },
    data() {
        return {
            loading: false,
            insightFilter: 'all', // 'all', 'cost', 'trend', 'analysis'
            // Make utilities available in the template
            utils: Utilities
        };
    },
    computed: {
        /**
         * Get filtered insights based on selected type
         */
        filteredInsights() {
            if (!this.processedData || !this.processedData.insights) {
                return [];
            }
            
            if (this.insightFilter === 'all') {
                return this.processedData.insights.sort((a, b) => {
                    // Sort by priority first (high, medium, low)
                    const priorityOrder = { high: 0, medium: 1, low: 2 };
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                });
            }
            
            return this.processedData.insights
                .filter(insight => insight.type === this.insightFilter)
                .sort((a, b) => {
                    // Sort by priority first (high, medium, low)
                    const priorityOrder = { high: 0, medium: 1, low: 2 };
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                });
        },
        
        /**
         * Get counts for each insight type
         */
        insightCounts() {
            if (!this.processedData || !this.processedData.insights) {
                return { all: 0, cost: 0, trend: 0, analysis: 0, info: 0 };
            }
            
            const counts = {
                all: this.processedData.insights.length,
                cost: 0,
                trend: 0,
                analysis: 0,
                info: 0
            };
            
            this.processedData.insights.forEach(insight => {
                if (counts[insight.type] !== undefined) {
                    counts[insight.type]++;
                }
            });
            
            return counts;
        },
        
        /**
         * Get key performance indicators
         */
        kpis() {
            if (!this.processedData || !this.processedData.summary) {
                return [];
            }
            
            const summary = this.processedData.summary;
            
            return [
                {
                    title: 'Average Value per Record',
                    value: summary.recordCount > 0 ? summary.totalValue / summary.recordCount : 0,
                    format: 'currency',
                    icon: 'fas fa-dollar-sign',
                    color: 'primary'
                },
                {
                    title: 'Average Usage per Record',
                    value: summary.recordCount > 0 ? summary.totalUsage / summary.recordCount : 0,
                    format: 'number',
                    icon: 'fas fa-cubes',
                    color: 'success'
                },
                {
                    title: 'Categories per Record',
                    value: summary.recordCount > 0 ? summary.categories.length / summary.recordCount : 0,
                    format: 'decimal',
                    icon: 'fas fa-tags',
                    color: 'info'
                },
                {
                    title: 'Items per Record',
                    value: summary.recordCount > 0 ? summary.items.length / summary.recordCount : 0,
                    format: 'decimal',
                    icon: 'fas fa-list',
                    color: 'warning'
                }
            ];
        }
    },
    methods: {
        /**
         * Generate insight icon CSS class based on type and priority
         * @param {string} type - Insight type
         * @param {string} priority - Insight priority
         * @returns {string} CSS class string
         */
        getInsightIconClass(type, priority) {
            // Base icon based on type
            let icon = 'fas ';
            
            switch (type) {
                case 'cost':
                    icon += 'fa-dollar-sign';
                    break;
                case 'trend':
                    icon += 'fa-chart-line';
                    break;
                case 'analysis':
                    icon += 'fa-chart-pie';
                    break;
                case 'info':
                    icon += 'fa-info-circle';
                    break;
                default:
                    icon += 'fa-lightbulb';
            }
            
            // Add color based on priority
            let color = '';
            switch (priority) {
                case 'high':
                    color = 'text-danger';
                    break;
                case 'medium':
                    color = 'text-warning';
                    break;
                case 'low':
                    color = 'text-info';
                    break;
                default:
                    color = 'text-secondary';
            }
            
            return `${icon} ${color}`;
        },
        
        /**
         * Format value based on specified format
         * @param {number} value - Value to format
         * @param {string} format - Format type
         * @returns {string} Formatted value
         */
        formatValue(value, format) {
            switch (format) {
                case 'currency':
                    return this.utils.formatCurrency(value);
                case 'number':
                    return this.utils.formatNumber(value);
                case 'decimal':
                    return this.utils.round(value, 2);
                case 'percentage':
                    return `${this.utils.formatPercentageChange(value)}%`;
                default:
                    return value.toString();
            }
        },
        
        /**
         * Get badge class based on insight priority
         * @param {string} priority - Insight priority
         * @returns {string} CSS class string
         */
        getBadgeClass(priority) {
            switch (priority) {
                case 'high':
                    return 'bg-danger';
                case 'medium':
                    return 'bg-warning text-dark';
                case 'low':
                    return 'bg-info text-dark';
                default:
                    return 'bg-secondary';
            }
        }
    },
    template: `
        <div class="insights-analytics">
            <!-- Key Performance Indicators -->
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <h5 class="card-title">Key Performance Indicators</h5>
                            <div class="row mt-3">
                                <div v-for="(kpi, index) in kpis" :key="index" class="col-md-3 col-sm-6 mb-3">
                                    <div class="kpi-card p-3 bg-light rounded">
                                        <div class="d-flex align-items-center">
                                            <div class="me-3">
                                                <i :class="kpi.icon + ' fa-2x text-' + kpi.color"></i>
                                            </div>
                                            <div>
                                                <h6 class="mb-1">{{ kpi.title }}</h6>
                                                <h4 class="mb-0 fw-bold">{{ formatValue(kpi.value, kpi.format) }}</h4>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Insights -->
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h5 class="card-title mb-0">Automated Insights</h5>
                                <div class="btn-group btn-group-sm">
                                    <button type="button" class="btn" 
                                            :class="insightFilter === 'all' ? 'btn-primary' : 'btn-outline-primary'"
                                            @click="insightFilter = 'all'">
                                        All ({{ insightCounts.all }})
                                    </button>
                                    <button type="button" class="btn" 
                                            :class="insightFilter === 'cost' ? 'btn-primary' : 'btn-outline-primary'"
                                            @click="insightFilter = 'cost'">
                                        Cost ({{ insightCounts.cost }})
                                    </button>
                                    <button type="button" class="btn" 
                                            :class="insightFilter === 'trend' ? 'btn-primary' : 'btn-outline-primary'"
                                            @click="insightFilter = 'trend'">
                                        Trends ({{ insightCounts.trend }})
                                    </button>
                                    <button type="button" class="btn" 
                                            :class="insightFilter === 'analysis' ? 'btn-primary' : 'btn-outline-primary'"
                                            @click="insightFilter = 'analysis'">
                                        Analysis ({{ insightCounts.analysis }})
                                    </button>
                                </div>
                            </div>
                            
                            <!-- Insight Cards -->
                            <div class="row">
                                <div v-for="(insight, index) in filteredInsights" :key="index" class="col-md-6 mb-3">
                                    <div class="card h-100">
                                        <div class="card-body">
                                            <div class="d-flex align-items-center mb-2">
                                                <i :class="getInsightIconClass(insight.type, insight.priority) + ' fa-lg me-2'"></i>
                                                <h6 class="card-title mb-0 me-auto">{{ insight.title }}</h6>
                                                <span :class="'badge ' + getBadgeClass(insight.priority) + ' ms-2'">
                                                    {{ insight.priority }}
                                                </span>
                                            </div>
                                            <p class="card-text">{{ insight.description }}</p>
                                            <div v-if="insight.data && insight.data.length > 0" class="mt-2 small">
                                                <div v-for="(item, idx) in insight.data.slice(0, 3)" :key="idx" class="mb-1">
                                                    <strong>{{ item[0] }}</strong>: 
                                                    <span v-if="insight.type === 'cost'">
                                                        {{ utils.formatCurrency(item[1].totalValue) }}
                                                    </span>
                                                    <span v-else-if="insight.type === 'trend'">
                                                        {{ utils.formatPercentageChange(item[1].trend * 100) }} change
                                                    </span>
                                                    <span v-else>
                                                        {{ item[1].totalUsage }} units
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- No insights message -->
                                <div v-if="filteredInsights.length === 0" class="col-md-12">
                                    <div class="alert alert-info">
                                        No insights available for the selected filter.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Top Categories Analysis -->
            <div class="row mb-4">
                <div class="col-md-12">
                    <div class="card shadow-sm">
                        <div class="card-body">
                            <h5 class="card-title">Category Analysis</h5>
                            <div class="table-responsive">
                                <table class="table table-striped table-hover">
                                    <thead>
                                        <tr>
                                            <th>Category</th>
                                            <th>Total Value</th>
                                            <th>Total Usage</th>
                                            <th>Item Count</th>
                                            <th>Avg Value/Item</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(data, category) in processedData.categoryData" :key="category">
                                            <td>{{ category }}</td>
                                            <td>{{ utils.formatCurrency(data.totalValue) }}</td>
                                            <td>{{ utils.formatNumber(data.totalUsage) }}</td>
                                            <td>{{ data.itemCount }}</td>
                                            <td>{{ utils.formatCurrency(data.itemCount > 0 ? data.totalValue / data.itemCount : 0) }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};

// Export the component
export { InsightsAnalytics };
