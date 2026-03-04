/**
 * Food Cost Module - Chart Manager
 * Handles chart initialization and updates
 */

import { generateColors } from './utilities.js';

// Object to store chart instances
const charts = {
    categoryChart: null,
    topItemsChart: null
};

// Track initialization status
let chartsInitialized = false;
let initializationAttempts = 0;
const MAX_INITIALIZATION_ATTEMPTS = 3;
const INITIALIZATION_DELAY = 500; // ms

// Debouncing chart updates to prevent forced reflows
let chartUpdateTimeout = null;
const CHART_UPDATE_DEBOUNCE = 250; // ms

// Modern color palette
const CHART_COLORS = {
    background: [
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 99, 132, 0.7)',
        'rgba(75, 192, 192, 0.7)',
        'rgba(255, 159, 64, 0.7)',
        'rgba(153, 102, 255, 0.7)',
        'rgba(255, 205, 86, 0.7)',
        'rgba(201, 203, 207, 0.7)',
        'rgba(94, 204, 152, 0.7)',
        'rgba(209, 100, 189, 0.7)',
        'rgba(132, 158, 231, 0.7)'
    ],
    border: [
        'rgba(54, 162, 235, 1)',
        'rgba(255, 99, 132, 1)',
        'rgba(75, 192, 192, 1)',
        'rgba(255, 159, 64, 1)',
        'rgba(153, 102, 255, 1)',
        'rgba(255, 205, 86, 1)',
        'rgba(201, 203, 207, 1)',
        'rgba(94, 204, 152, 1)',
        'rgba(209, 100, 189, 1)',
        'rgba(132, 158, 231, 1)'
    ]
};

// Modern chart options - Updated for Chart.js v3.x compatibility
const CHART_OPTIONS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
        duration: 800,
        easing: 'easeOutQuart'
    },
    layout: {
        padding: {
            top: 10,
            right: 20,
            bottom: 20,
            left: 20
        }
    },
    // Updated scales config for Chart.js v3
    scales: {
        y: {
            beginAtZero: true,
            ticks: {
                font: {
                    size: 12,
                    family: "'Poppins', 'Helvetica', 'Arial', sans-serif"
                }
            },
            grid: {
                color: 'rgba(200, 200, 200, 0.2)'
            }
        },
        x: {
            ticks: {
                font: {
                    size: 12,
                    family: "'Poppins', 'Helvetica', 'Arial', sans-serif"
                }
            },
            grid: {
                display: false
            }
        }
    },
    plugins: {
        legend: {
            position: 'bottom',
            labels: {
                boxWidth: 15,
                padding: 15,
                font: {
                    size: 12,
                    family: "'Poppins', 'Helvetica', 'Arial', sans-serif"
                }
            }
        },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleFont: {
                size: 14,
                weight: 'bold',
                family: "'Poppins', 'Helvetica', 'Arial', sans-serif"
            },
            bodyFont: {
                size: 13,
                family: "'Poppins', 'Helvetica', 'Arial', sans-serif"
            },
            padding: 10,
            cornerRadius: 6,
            displayColors: true,
            usePointStyle: true
        },
        title: {
            display: true,
            text: 'Usage Data',
            font: {
                size: 16,
                weight: 'bold',
                family: "'Poppins', 'Helvetica', 'Arial', sans-serif"
            },
            padding: {
                top: 10,
                bottom: 10
            }
        }
    }
};

/**
 * Reset chart initialization state
 * This allows charts to be re-initialized after they've been destroyed
 */
export function resetChartInitialization() {
    // First destroy any existing charts
    destroyCharts();
    
    // Reset initialization state variables
    chartsInitialized = false;
    initializationAttempts = 0;
    
    console.log('Chart initialization reset, ready for new charts');
}

/**
 * Initialize charts
 * @param {string} categoryChartId - ID of the category chart canvas element
 * @param {string} topItemsChartId - ID of the top items chart canvas element
 * @returns {Promise<boolean>} - Promise resolving to true if charts were initialized successfully
 */
export function initCharts(categoryChartId, topItemsChartId) {
    return new Promise((resolve) => {
        try {
            // Force destroy any existing charts first
            destroyCharts();
            
            // Reset initialization state
            chartsInitialized = false;
            
            // Check if Chart.js is available
            if (typeof Chart === 'undefined') {
                console.error('Chart.js is not available');
                resolve(false);
                return;
            }
            
            // Reset attempts when making a fresh initialization call
            initializationAttempts = 0;
            
            // Try to initialize with retry logic
            attemptChartInitialization(categoryChartId, topItemsChartId, resolve);
        } catch (error) {
            console.error('Error in chart initialization:', error);
            resolve(false);
        }
    });
}

/**
 * Attempt to initialize charts with retry logic
 * @private
 */
function attemptChartInitialization(categoryChartId, topItemsChartId, resolve) {
    // Increment attempts
    initializationAttempts++;
    
    const categoryCanvas = document.getElementById(categoryChartId);
    const topItemsCanvas = document.getElementById(topItemsChartId);
    
    // If both canvases exist, initialize the charts
    if (categoryCanvas && topItemsCanvas) {
        // Initialize category chart
        initializeCategoryChart(categoryChartId);
        
        // Initialize top items chart
        initializeTopItemsChart(topItemsChartId);
        
        chartsInitialized = true;
        console.log('Charts initialized successfully');
        resolve(true);
    } else {
        // If we've reached the max attempts, give up
        if (initializationAttempts >= MAX_INITIALIZATION_ATTEMPTS) {
            console.warn(`Failed to initialize charts after ${MAX_INITIALIZATION_ATTEMPTS} attempts`);
            console.warn('Charts will be initialized when data is available and elements exist');
            resolve(false);
            return;
        }
        
        // Otherwise, retry after a delay
        console.log(`Chart elements not found, retrying in ${INITIALIZATION_DELAY}ms (attempt ${initializationAttempts}/${MAX_INITIALIZATION_ATTEMPTS})`);
        setTimeout(() => {
            attemptChartInitialization(categoryChartId, topItemsChartId, resolve);
        }, INITIALIZATION_DELAY);
    }
}

/**
 * Initialize the category chart
 * @param {string} chartId - ID of the chart canvas element
 */
function initializeCategoryChart(chartId) {
    // Get the canvas element
    const canvas = document.getElementById(chartId);
    if (!canvas) {
        console.error(`Canvas element with ID '${chartId}' not found`);
        return;
    }
    
    // Double-check Chart.js registry to ensure no chart is associated with this canvas
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        console.log(`Found existing chart on canvas '${chartId}', destroying it`);
        existingChart.destroy();
    }
    
    // Destroy our tracked instance if it exists
    if (charts.categoryChart) {
        try {
            charts.categoryChart.destroy();
        } catch (e) {
            console.log('Error destroying existing category chart:', e);
        }
        charts.categoryChart = null;
    }
    
    // Clear the canvas
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Create new chart
    charts.categoryChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: CHART_COLORS.background,
                borderColor: CHART_COLORS.border,
                borderWidth: 1
            }]
        },
        options: CHART_OPTIONS
    });
}

/**
 * Initialize the top items chart
 * @param {string} chartId - ID of the chart canvas element
 */
function initializeTopItemsChart(chartId) {
    // Get the canvas element
    const canvas = document.getElementById(chartId);
    if (!canvas) {
        console.error(`Canvas element with ID '${chartId}' not found`);
        return;
    }
    
    // Double-check Chart.js registry to ensure no chart is associated with this canvas
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
        console.log(`Found existing chart on canvas '${chartId}', destroying it`);
        existingChart.destroy();
    }
    
    // Destroy our tracked instance if it exists
    if (charts.topItemsChart) {
        try {
            charts.topItemsChart.destroy();
        } catch (e) {
            console.log('Error destroying existing top items chart:', e);
        }
        charts.topItemsChart = null;
    }
    
    // Clear the canvas
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Create new chart - updated for Chart.js v3.x
    charts.topItemsChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: CHART_COLORS.background,
                borderColor: CHART_COLORS.border,
                borderWidth: 1
            }]
        },
        options: {
            ...CHART_OPTIONS,
            indexAxis: 'y', // This makes the bar chart horizontal in Chart.js v3.x
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

/**
 * Update charts with new data
 * @param {Array} stockData - Stock data to visualize
 * @param {Array} categories - Available categories
 */
export function updateCharts(stockData, categories) {
    try {
        // Clear any pending update to prevent multiple rapid updates
        if (chartUpdateTimeout) {
            clearTimeout(chartUpdateTimeout);
        }
        
        // Debounce the chart update to prevent forced reflows
        chartUpdateTimeout = setTimeout(() => {
            // If charts aren't initialized yet, retry initialization
            if (!chartsInitialized) {
                console.log('Charts not initialized, attempting initialization before update');
                initCharts('categoryChart', 'topItemsChart').then(success => {
                    if (success) {
                        // If initialization succeeded, update charts right away
                        updateCategoryChart(stockData, categories);
                        updateTopItemsChart(stockData);
                    } else {
                        console.warn('Could not initialize charts for update, will try again later');
                        // Set a small timeout to ensure DOM is fully loaded
                        setTimeout(() => {
                            const categoryCanvas = document.getElementById('categoryChart');
                            const topItemsCanvas = document.getElementById('topItemsChart');
                            
                            if (categoryCanvas && topItemsCanvas) {
                                initCharts('categoryChart', 'topItemsChart').then(success => {
                                    if (success) {
                                        updateCategoryChart(stockData, categories);
                                        updateTopItemsChart(stockData);
                                    }
                                });
                            }
                        }, 1000);
                    }
                });
                return;
            }
            
            // Update each chart with the new data
            updateCategoryChart(stockData, categories);
            updateTopItemsChart(stockData);
            
        }, CHART_UPDATE_DEBOUNCE); // Debounce timeout
    } catch (error) {
        console.error('Error updating charts:', error);
    }
}

/**
 * Update the category chart
 * @param {Array} stockData - Stock data to visualize
 * @param {Array} categories - Available categories
 */
function updateCategoryChart(stockData, categories) {
    try {
        if (charts.categoryChart && categories && categories.length > 0 && stockData && stockData.length > 0) {
            console.log('Updating category chart with data:', { categories, items: stockData.length });
            
            // Group data by category
            const categoryData = {};
            stockData.forEach(item => {
                if (!item.category) return;
                
                if (!categoryData[item.category]) {
                    categoryData[item.category] = 0;
                }
                
                categoryData[item.category] += Number(item.usage) || 0;
            });
            
            // Convert to arrays for chart (excluding 'All Categories')
            const categoryLabels = Object.keys(categoryData).filter(cat => cat !== 'All Categories');
            const categoryValues = categoryLabels.map(cat => categoryData[cat]);
            
            // Limit to top 10 categories if there are many
            let limitedLabels = categoryLabels;
            let limitedValues = categoryValues;
            
            if (categoryLabels.length > 10) {
                // Sort by value in descending order
                const combined = categoryLabels.map((label, i) => ({ label, value: categoryValues[i] }));
                combined.sort((a, b) => b.value - a.value);
                
                // Get top 10
                limitedLabels = combined.slice(0, 10).map(item => item.label);
                limitedValues = combined.slice(0, 10).map(item => item.value);
            }
            
            // Update the chart data
            charts.categoryChart.data.labels = limitedLabels;
            charts.categoryChart.data.datasets[0].data = limitedValues;
            charts.categoryChart.options.plugins.title.text = 'Usage by Category';
            
            // Update the chart
            charts.categoryChart.update();
        } else {
            console.warn('Cannot update category chart - missing data or chart');
        }
    } catch (error) {
        console.error('Error updating category chart:', error);
    }
}

/**
 * Update the top items chart
 * @param {Array} stockData - Stock data to visualize
 */
function updateTopItemsChart(stockData) {
    try {
        if (charts.topItemsChart && stockData && stockData.length > 0) {
            console.log('Updating top items chart with data:', { items: stockData.length });
            
            // Sort items by usage value in descending order
            const sortedItems = [...stockData]
                .filter(item => item.usage > 0)
                .sort((a, b) => (b.usage || 0) - (a.usage || 0))
                .slice(0, 10); // Get top 10 items
            
            // Extract labels and values
            const itemLabels = sortedItems.map(item => item.description || item.itemCode || 'Unknown');
            const itemValues = sortedItems.map(item => Number(item.usage) || 0);
            
            // Update chart data
            charts.topItemsChart.data.labels = itemLabels;
            charts.topItemsChart.data.datasets[0].data = itemValues;
            charts.topItemsChart.options.plugins.title.text = 'Top Items by Usage';
            
            // Update the chart
            charts.topItemsChart.update();
        } else {
            console.warn('Cannot update top items chart - missing data or chart');
        }
    } catch (error) {
        console.error('Error updating top items chart:', error);
    }
}

/**
 * Destroy charts to prevent memory leaks
 */
export function destroyCharts() {
    // First try to destroy our tracked instances
    if (charts.categoryChart) {
        try {
            console.log('Destroying category chart');
            charts.categoryChart.destroy();
        } catch (e) {
            console.log('Error destroying category chart:', e);
        }
        charts.categoryChart = null;
    }
    
    if (charts.topItemsChart) {
        try {
            console.log('Destroying top items chart');
            charts.topItemsChart.destroy();
        } catch (e) {
            console.log('Error destroying top items chart:', e);
        }
        charts.topItemsChart = null;
    }
    
    // Also look for any Chart.js instances in the DOM that might not be tracked by us
    try {
        // Check if we have access to Chart.getChart (available in Chart.js 3.x+)
        if (typeof Chart !== 'undefined' && typeof Chart.getChart === 'function') {
            const categoryCanvas = document.getElementById('categoryChart');
            if (categoryCanvas) {
                const existingCategoryChart = Chart.getChart(categoryCanvas);
                if (existingCategoryChart) {
                    console.log('Found untracked category chart, destroying it');
                    existingCategoryChart.destroy();
                }
            }
            
            const topItemsCanvas = document.getElementById('topItemsChart');
            if (topItemsCanvas) {
                const existingTopItemsChart = Chart.getChart(topItemsCanvas);
                if (existingTopItemsChart) {
                    console.log('Found untracked top items chart, destroying it');
                    existingTopItemsChart.destroy();
                }
            }
        }
    } catch (e) {
        console.log('Error checking for untracked charts:', e);
    }
    
    // Reset charts initialized flag
    chartsInitialized = false;
    console.log('Charts destroyed successfully');
}

// Export additional functions needed by refactored-app-component.js
export { initializeCategoryChart, initializeTopItemsChart };
