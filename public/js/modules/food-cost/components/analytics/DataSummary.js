/**
 * Food Cost Module - Data Summary Component
 * Version: 1.9.4-2025-04-19
 * 
 * This component displays summary metrics, KPIs and charts for stock data.
 * It shows sales metrics, cost percentages, and visualizations for usage data.
 */

// Define the component
const DataSummary = {
    // Updated version to bust cache
    version: '1.9.4-2025-04-19-11',
    name: 'data-summary',
    
    props: {
        /**
         * Total cost of usage value
         */
        totalCostOfUsage: {
            type: Number,
            default: 0
        },
        
        /**
         * Sales amount value
         */
        salesAmount: {
            type: Number,
            default: 0
        },
        
        /**
         * Cost percentage value
         */
        costPercentage: {
            type: Number,
            default: 0
        },
        
        /**
         * Stock period in days
         */
        stockPeriodDays: {
            type: Number,
            required: true,
            default: 1
        },
        
        /**
         * Stock data for chart visualization
         */
        stockData: {
            type: Array,
            required: true,
            default: () => []
        },
        
        /**
         * Whether the user can edit the sales amount
         */
        editable: {
            type: Boolean,
            default: true
        }
    },
    
    data() {
        return {
            // Chart-related state only (don't shadow props)
            chartInstances: {},
            categoryChart: null,
            topItemsChart: null,
            chartsInitialized: false,
            // Track local values for internal rendering if needed
            localSalesAmount: this.salesAmount || 0
        };
    },
    
    watch: {
        stockData: {
            handler() {
                this.$nextTick(() => {
                    this.updateCharts();
                });
            },
            deep: true
        },
        // Watch for prop changes to update local state
        salesAmount: {
            handler(newValue) {
                this.localSalesAmount = newValue || 0;
            },
            immediate: true
        }
    },
    
    mounted() {
        this.initializeCharts();
    },
    
    updated() {
        if (!this.chartsInitialized && this.stockData.length > 0) {
            this.initializeCharts();
        }
    },
    
    methods: {
        /**
         * Format currency value with 2 decimal places
         * @param {Number} value - The currency value to format
         * @returns {String} Formatted currency value
         */
        formatCurrency(value) {
            if (value === undefined || value === null) return '0.00';
            return Number(value).toFixed(2);
        },
        
        /**
         * Format numeric value with 2 decimal places
         * @param {Number} value - The numeric value to format
         * @returns {String} Formatted number
         */
        formatNumber(value) {
            if (value === undefined || value === null) return '0.00';
            return Number(value).toFixed(2);
        },
        
        /**
         * Format percentage value with 2 decimal places
         * @param {Number} value - The percentage value to format
         * @returns {String} Formatted percentage
         */
        formatPercentage(value) {
            if (value === undefined || value === null) return '0.00';
            return Number(value).toFixed(2);
        },
        
        /**
         * Handle sales amount change
         * @param {Event} event - Input change event
         */
        onSalesAmountChange(event) {
            const value = parseFloat(event.target.value);
            if (!isNaN(value)) {
                this.localSalesAmount = value; // Update local tracking
                this.$emit('update:sales-amount', value);
            }
        },
        
        /**
         * Initialize chart visualizations
         */
        initializeCharts() {
            if (!window.Chart || this.stockData.length === 0) {
                console.warn('Chart.js not available or no data to display');
                return;
            }
            
            this.initializeCategoryChart();
            this.initializeTopItemsChart();
            this.chartsInitialized = true;
        },
        
        /**
         * Initialize usage by category chart
         */
        initializeCategoryChart() {
            const categoryCtx = document.getElementById('categoryChart');
            if (!categoryCtx) return;
            
            // Get categories and aggregate usage by category
            const categoryData = {};
            this.stockData.forEach(item => {
                if (!item.category) return;
                
                const category = item.category.trim();
                const usage = parseFloat(item.usage) || 0;
                const cost = usage * (parseFloat(item.unitCost) || 0);
                
                if (!categoryData[category]) {
                    categoryData[category] = 0;
                }
                
                categoryData[category] += cost;
            });
            
            // Prepare data for chart
            const labels = Object.keys(categoryData);
            const data = Object.values(categoryData);
            
            // Generate random colors for categories
            const backgroundColors = labels.map(() => this.getRandomColor());
            
            this.categoryChart = new Chart(categoryCtx, {
                type: 'pie',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: backgroundColors,
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    legend: {
                        position: 'right'
                    },
                    title: {
                        display: true,
                        text: 'Usage Cost by Category'
                    },
                    tooltips: {
                        callbacks: {
                            label: (tooltipItem, data) => {
                                const value = data.datasets[0].data[tooltipItem.index];
                                return `${data.labels[tooltipItem.index]}: ${this.formatCurrency(value)}`;
                            }
                        }
                    }
                }
            });
        },
        
        /**
         * Initialize top items by usage chart
         */
        initializeTopItemsChart() {
            const topItemsCtx = document.getElementById('topItemsChart');
            if (!topItemsCtx) return;
            
            // Sort items by usage cost (usage * unitCost)
            const sortedItems = [...this.stockData]
                .map(item => ({
                    itemCode: item.itemCode,
                    description: item.description,
                    usage: parseFloat(item.usage) || 0,
                    unitCost: parseFloat(item.unitCost) || 0,
                    cost: (parseFloat(item.usage) || 0) * (parseFloat(item.unitCost) || 0)
                }))
                .sort((a, b) => b.cost - a.cost)
                .slice(0, 10); // Get top 10 items
            
            // Prepare data for chart
            const labels = sortedItems.map(item => item.itemCode);
            const data = sortedItems.map(item => item.cost);
            
            this.topItemsChart = new Chart(topItemsCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Usage Cost',
                        data: data,
                        backgroundColor: '#4e73df',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        yAxes: [{
                            ticks: {
                                beginAtZero: true,
                                callback: value => this.formatCurrency(value)
                            }
                        }]
                    },
                    tooltips: {
                        callbacks: {
                            label: (tooltipItem, data) => {
                                const value = data.datasets[0].data[tooltipItem.index];
                                return `${tooltipItem.xLabel}: ${this.formatCurrency(value)}`;
                            }
                        }
                    }
                }
            });
        },
        
        /**
         * Update charts with current data
         */
        updateCharts() {
            if (!this.chartsInitialized) {
                this.initializeCharts();
                return;
            }
            
            if (this.categoryChart) {
                // Update category chart data
                const categoryData = {};
                this.stockData.forEach(item => {
                    if (!item.category) return;
                    
                    const category = item.category.trim();
                    const usage = parseFloat(item.usage) || 0;
                    const cost = usage * (parseFloat(item.unitCost) || 0);
                    
                    if (!categoryData[category]) {
                        categoryData[category] = 0;
                    }
                    
                    categoryData[category] += cost;
                });
                
                this.categoryChart.data.labels = Object.keys(categoryData);
                this.categoryChart.data.datasets[0].data = Object.values(categoryData);
                this.categoryChart.update();
            }
            
            if (this.topItemsChart) {
                // Update top items chart data
                const sortedItems = [...this.stockData]
                    .map(item => ({
                        itemCode: item.itemCode,
                        description: item.description,
                        usage: parseFloat(item.usage) || 0,
                        unitCost: parseFloat(item.unitCost) || 0,
                        cost: (parseFloat(item.usage) || 0) * (parseFloat(item.unitCost) || 0)
                    }))
                    .sort((a, b) => b.cost - a.cost)
                    .slice(0, 10);
                
                this.topItemsChart.data.labels = sortedItems.map(item => item.itemCode);
                this.topItemsChart.data.datasets[0].data = sortedItems.map(item => item.cost);
                this.topItemsChart.update();
            }
        },
        
        /**
         * Generate a random color for chart elements
         * @returns {String} Random color in hex format
         */
        getRandomColor() {
            const letters = '0123456789ABCDEF';
            let color = '#';
            for (let i = 0; i < 6; i++) {
                color += letters[Math.floor(Math.random() * 16)];
            }
            return color;
        }
    },
    
    template: `
        <div>
            <!-- Sales and Cost Information Panel -->
            <div class="card mb-4">
                <div class="card-header bg-light">
                    <h5 class="mb-0"><i class="fas fa-calculator mr-2"></i>Sales & Cost Information</h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <!-- Sales Amount -->
                        <div class="col-md-4">
                            <div class="form-group">
                                <label>Sales Amount:</label>
                                <div class="input-group">
                                    <input type="number" 
                                           class="form-control" 
                                           v-model.number="localSalesAmount" 
                                           @input="onSalesAmountChange($event)" 
                                           min="0" 
                                           step="0.01"
                                           :readonly="!editable">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Total Cost of Usage -->
                        <div class="col-md-4">
                            <div class="form-group">
                                <label>Total Cost of Usage:</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" :value="formatCurrency(totalCostOfUsage)" readonly>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Cost Percentage -->
                        <div class="col-md-4">
                            <div class="form-group">
                                <label>Cost Percentage:</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" :value="formatPercentage(costPercentage)" readonly>
                                    <div class="input-group-append">
                                        <span class="input-group-text">%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Charts Section -->
            <div class="row" v-if="stockData.length > 0">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header bg-light">
                            <h5 class="mb-0"><i class="fas fa-chart-pie mr-2"></i>Usage by Category</h5>
                        </div>
                        <div class="card-body" style="height: 350px; position: relative;">
                            <canvas id="categoryChart" style="width: 100%; height: 100%;"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header bg-light">
                            <h5 class="mb-0"><i class="fas fa-chart-bar mr-2"></i>Top Items by Usage</h5>
                        </div>
                        <div class="card-body" style="height: 350px; position: relative;">
                            <canvas id="topItemsChart" style="width: 100%; height: 100%;"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};

// Support both module and non-module environments
// If we're in a module environment, export the component
if (typeof exports !== 'undefined') {
    exports.DataSummary = DataSummary;
}

// Also expose the component globally for direct browser usage
if (typeof window !== 'undefined') {
    window.DataSummary = DataSummary;
    
    // Register with the FoodCost component registry
    if (window.FoodCost && window.FoodCost.registerDataSummary) {
        window.FoodCost.registerDataSummary(DataSummary);
        console.log('DataSummary registered with FoodCost registry');
    }
}

// Support both module and non-module environments
// Global registration for direct browser usage
if (typeof window !== 'undefined') {
    window.DataSummary = DataSummary;
    
    // Register with the FoodCost component registry
    if (window.FoodCost && window.FoodCost.registerDataSummary) {
        window.FoodCost.registerDataSummary(DataSummary);
        console.log('DataSummary registered with FoodCost registry');
    }
}

// Add ES module export for the refactored architecture
export { DataSummary };
