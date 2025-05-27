/**
 * Analytics Module - Chart Manager
 * 
 * This file provides functionality for creating and managing charts in the Analytics module.
 * Uses Chart.js for visualizations.
 */

const ChartManager = {
    // Store chart instances for cleanup and reference
    _charts: new Map(),
    
    /**
     * Create a new chart
     * @param {string} elementId - ID of the canvas element
     * @param {string} chartType - Type of chart (line, bar, pie, etc.)
     * @param {Object} data - Data for the chart
     * @param {Object} options - Chart configuration options
     * @returns {Object} The created chart instance
     */
    createChart(elementId, chartType, data, options = {}) {
        console.log(`Creating ${chartType} chart in element: ${elementId}`);
        
        try {
            // Get the canvas element
            const canvas = document.getElementById(elementId);
            if (!canvas) {
                console.error(`Canvas element with ID '${elementId}' not found`);
                return null;
            }
            
            // Destroy any existing chart on this canvas
            this.destroyChart(elementId);
            
            // Set default options based on chart type
            const defaultOptions = this._getDefaultOptions(chartType);
            const mergedOptions = { ...defaultOptions, ...options };
            
            // Create the chart
            const chart = new Chart(canvas, {
                type: chartType,
                data: data,
                options: mergedOptions
            });
            
            // Store the chart instance
            this._charts.set(elementId, chart);
            
            return chart;
        } catch (error) {
            console.error('Error creating chart:', error);
            return null;
        }
    },
    
    /**
     * Update an existing chart
     * @param {string} elementId - ID of the canvas element
     * @param {Object} newData - New data for the chart
     * @param {Object} newOptions - New options to apply
     * @returns {Object} The updated chart instance
     */
    updateChart(elementId, newData, newOptions = {}) {
        console.log(`Updating chart in element: ${elementId}`);
        
        try {
            // Get the existing chart
            const chart = this._charts.get(elementId);
            if (!chart) {
                console.warn(`No chart found with ID '${elementId}', creating new chart`);
                return null;
            }
            
            // Update data if provided
            if (newData) {
                if (newData.labels) {
                    chart.data.labels = newData.labels;
                }
                
                if (newData.datasets) {
                    chart.data.datasets = newData.datasets;
                }
            }
            
            // Update options if provided
            if (newOptions && Object.keys(newOptions).length > 0) {
                // Deep merge options
                chart.options = this._mergeOptions(chart.options, newOptions);
            }
            
            // Update the chart
            chart.update();
            
            return chart;
        } catch (error) {
            console.error('Error updating chart:', error);
            return null;
        }
    },
    
    /**
     * Destroy a chart and remove it from the manager
     * @param {string} elementId - ID of the canvas element
     */
    destroyChart(elementId) {
        console.log(`Destroying chart in element: ${elementId}`);
        
        try {
            // Get the existing chart
            const chart = this._charts.get(elementId);
            if (chart) {
                // Destroy the chart
                chart.destroy();
                // Remove from the map
                this._charts.delete(elementId);
            }
        } catch (error) {
            console.error('Error destroying chart:', error);
        }
    },
    
    /**
     * Destroy all charts and clear the manager
     */
    destroyAllCharts() {
        console.log('Destroying all charts');
        
        try {
            // Destroy each chart
            this._charts.forEach((chart, elementId) => {
                this.destroyChart(elementId);
            });
            
            // Clear the map
            this._charts.clear();
        } catch (error) {
            console.error('Error destroying all charts:', error);
        }
    },
    
    /**
     * Create a food cost trends chart
     * @param {string} elementId - ID of the canvas element
     * @param {Object} data - Data for the chart
     * @param {Object} options - Additional options
     * @returns {Object} The created chart instance
     */
    createFoodCostTrendsChart(elementId, data, options = {}) {
        console.log('Creating food cost trends chart');
        
        const chartData = {
            labels: data.timeLabels || [],
            datasets: [
                {
                    label: 'Usage Quantity',
                    data: data.usage || [],
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'y'
                },
                {
                    label: 'Usage Value',
                    data: data.value || [],
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    borderWidth: 2,
                    tension: 0.1,
                    yAxisID: 'y1'
                }
            ]
        };
        
        const chartOptions = {
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Usage Quantity'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Usage Value ($)'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            ...options
        };
        
        return this.createChart(elementId, 'line', chartData, chartOptions);
    },
    
    /**
     * Create a food cost category chart
     * @param {string} elementId - ID of the canvas element
     * @param {Object} categoryData - Category data
     * @param {Object} options - Additional options
     * @returns {Object} The created chart instance
     */
    createFoodCostCategoryChart(elementId, categoryData, options = {}) {
        console.log('Creating food cost category chart');
        
        // Extract categories and values
        const categories = Object.keys(categoryData);
        const values = categories.map(category => categoryData[category].totalValue);
        
        // Generate colors for each category
        const backgroundColors = this._generateColors(categories.length);
        
        const chartData = {
            labels: categories,
            datasets: [
                {
                    label: 'Usage Value by Category',
                    data: values,
                    backgroundColor: backgroundColors,
                    borderWidth: 1
                }
            ]
        };
        
        const chartOptions = {
            plugins: {
                legend: {
                    position: 'right'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            return `$${value.toFixed(2)}`;
                        }
                    }
                }
            },
            ...options
        };
        
        return this.createChart(elementId, 'pie', chartData, chartOptions);
    },
    
    /**
     * Create a food cost items chart
     * @param {string} elementId - ID of the canvas element
     * @param {Object} itemsData - Items data
     * @param {number} limit - Maximum number of items to display
     * @param {Object} options - Additional options
     * @returns {Object} The created chart instance
     */
    createFoodCostItemsChart(elementId, itemsData, limit = 10, options = {}) {
        console.log('Creating food cost items chart');
        
        // Convert items data to array and sort by value
        const items = Object.entries(itemsData)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.totalValue - a.totalValue)
            .slice(0, limit);
        
        const chartData = {
            labels: items.map(item => item.name),
            datasets: [
                {
                    label: 'Usage Value',
                    data: items.map(item => item.totalValue),
                    backgroundColor: 'rgba(54, 162, 235, 0.8)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }
            ]
        };
        
        const chartOptions = {
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            return `$${value.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Usage Value ($)'
                    }
                }
            },
            ...options
        };
        
        return this.createChart(elementId, 'bar', chartData, chartOptions);
    },
    
    /**
     * Get default options based on chart type
     * @param {string} chartType - Type of chart
     * @returns {Object} Default options
     * @private
     */
    _getDefaultOptions(chartType) {
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000
            },
            plugins: {
                title: {
                    display: true,
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    enabled: true
                },
                legend: {
                    display: true
                }
            }
        };
        
        switch (chartType) {
            case 'line':
                return {
                    ...commonOptions,
                    elements: {
                        line: {
                            tension: 0.1
                        },
                        point: {
                            radius: 4,
                            hoverRadius: 6
                        }
                    }
                };
                
            case 'bar':
                return {
                    ...commonOptions,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                };
                
            case 'pie':
            case 'doughnut':
                return {
                    ...commonOptions,
                    cutout: chartType === 'doughnut' ? '50%' : undefined,
                    plugins: {
                        ...commonOptions.plugins,
                        legend: {
                            position: 'right'
                        }
                    }
                };
                
            default:
                return commonOptions;
        }
    },
    
    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     * @private
     */
    _mergeOptions(target, source) {
        const merged = { ...target };
        
        for (const key in source) {
            if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
                merged[key] = this._mergeOptions(target[key], source[key]);
            } else {
                merged[key] = source[key];
            }
        }
        
        return merged;
    },
    
    /**
     * Generate an array of colors
     * @param {number} count - Number of colors to generate
     * @returns {Array} Array of colors
     * @private
     */
    _generateColors(count) {
        const colors = [
            'rgba(255, 99, 132, 0.8)',
            'rgba(54, 162, 235, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(75, 192, 192, 0.8)',
            'rgba(153, 102, 255, 0.8)',
            'rgba(255, 159, 64, 0.8)',
            'rgba(199, 199, 199, 0.8)',
            'rgba(83, 102, 255, 0.8)',
            'rgba(40, 159, 64, 0.8)',
            'rgba(210, 199, 199, 0.8)',
        ];
        
        // If we need more colors than predefined, generate them
        if (count > colors.length) {
            for (let i = colors.length; i < count; i++) {
                const r = Math.floor(Math.random() * 255);
                const g = Math.floor(Math.random() * 255);
                const b = Math.floor(Math.random() * 255);
                colors.push(`rgba(${r}, ${g}, ${b}, 0.8)`);
            }
        }
        
        return colors.slice(0, count);
    }
};

// Export the Chart Manager
export { ChartManager };
