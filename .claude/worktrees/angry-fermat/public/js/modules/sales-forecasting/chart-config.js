/**
 * Chart.js Configuration for Sales Forecasting
 * Version: 2.1.5-20250606
 *
 * Provides consistent Chart.js configurations matching the platform design system
 */

// Import Chart.js components with explicit registration for ESM usage
import {
    Chart,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    BarController,
    LineController,
    Filler,
    Tooltip,
    Legend,
    Title
} from 'https://cdn.jsdelivr.net/npm/chart.js/+esm';

// Register all required Chart.js components for ESM usage
Chart.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    BarController,
    LineController,
    Filler,
    Tooltip,
    Legend,
    Title
);

/**
 * Platform color scheme
 */
export const CHART_COLORS = {
    primary: '#667eea',
    primaryGradientStart: '#667eea',
    primaryGradientEnd: '#764ba2',
    secondary: '#6c757d',
    success: '#28a745',
    successGradientStart: '#00b894',
    successGradientEnd: '#00a085',
    danger: '#dc3545',
    warning: '#ffc107',
    info: '#17a2b8',
    light: '#f8f9fa',
    dark: '#343a40',

    // Transparent versions for fills
    primaryAlpha: 'rgba(102, 126, 234, 0.1)',
    successAlpha: 'rgba(40, 167, 69, 0.1)',
    dangerAlpha: 'rgba(220, 53, 69, 0.1)',
    warningAlpha: 'rgba(255, 193, 7, 0.1)',
    infoAlpha: 'rgba(23, 162, 184, 0.1)',

    // Grid and text
    gridColor: 'rgba(0, 0, 0, 0.1)',
    textColor: '#495057',
    textMuted: '#6c757d'
};

/**
 * Default font configuration
 */
export const CHART_FONTS = {
    family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    size: 12,
    weight: '400',
    lineHeight: 1.5
};

/**
 * Create a gradient for chart backgrounds
 */
export function createGradient(ctx, colorStart, colorEnd, isVertical = true) {
    const gradient = isVertical
        ? ctx.createLinearGradient(0, 0, 0, ctx.canvas.height)
        : ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);

    gradient.addColorStop(0, colorStart);
    gradient.addColorStop(1, colorEnd);

    return gradient;
}

/**
 * Get default chart options following platform conventions
 */
export function getDefaultChartOptions(type = 'line') {
    const baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                align: 'center',
                labels: {
                    font: {
                        family: CHART_FONTS.family,
                        size: CHART_FONTS.size,
                        weight: '500'
                    },
                    color: CHART_COLORS.textColor,
                    padding: 15,
                    usePointStyle: true,
                    pointStyle: 'circle',
                    boxWidth: 8,
                    boxHeight: 8
                }
            },
            tooltip: {
                enabled: true,
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleFont: {
                    family: CHART_FONTS.family,
                    size: 13,
                    weight: '600'
                },
                bodyFont: {
                    family: CHART_FONTS.family,
                    size: 12,
                    weight: '400'
                },
                padding: 12,
                cornerRadius: 8,
                displayColors: true,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1
            }
        },
        scales: {
            x: {
                grid: {
                    display: true,
                    color: CHART_COLORS.gridColor,
                    drawBorder: false
                },
                ticks: {
                    font: {
                        family: CHART_FONTS.family,
                        size: CHART_FONTS.size
                    },
                    color: CHART_COLORS.textMuted,
                    maxRotation: 45,
                    minRotation: 0
                }
            },
            y: {
                grid: {
                    display: true,
                    color: CHART_COLORS.gridColor,
                    drawBorder: false
                },
                ticks: {
                    font: {
                        family: CHART_FONTS.family,
                        size: CHART_FONTS.size
                    },
                    color: CHART_COLORS.textMuted,
                    callback: function(value) {
                        // Format currency for revenue charts
                        if (this.chart?.config?.options?.isCurrency) {
                            return `R ${value.toLocaleString()}`;
                        }
                        return value.toLocaleString();
                    }
                },
                beginAtZero: true
            }
        },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        },
        animation: {
            duration: 750,
            easing: 'easeInOutQuart'
        }
    };

    // Type-specific customizations
    if (type === 'line') {
        baseOptions.elements = {
            line: {
                tension: 0.3,
                borderWidth: 2,
                fill: false
            },
            point: {
                radius: 4,
                hoverRadius: 6,
                hitRadius: 10,
                borderWidth: 2,
                backgroundColor: '#fff'
            }
        };
    }

    if (type === 'bar') {
        baseOptions.scales.x.grid.display = false;
        baseOptions.elements = {
            bar: {
                borderRadius: 6,
                borderSkipped: false
            }
        };
    }

    return baseOptions;
}

/**
 * Create forecast line chart configuration
 */
export function createForecastChartConfig(historicalData, forecastData, options = {}) {
    const {
        showConfidenceInterval = true,
        chartTitle = 'Sales Forecast',
        isCurrency = true
    } = options;

    // Build unified label array from both historical and forecast dates
    const formatLabel = (d) => {
        const dt = d.date instanceof Date ? d.date : new Date(d.date);
        return dt.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
    };
    const historicalLabels = historicalData.map(formatLabel);
    const forecastLabels = forecastData.map(formatLabel);
    const labels = [...historicalLabels, ...forecastLabels];

    // Historical values padded with nulls for forecast range
    const historicalValues = [
        ...historicalData.map(d => d.revenue),
        ...forecastData.map(() => null)
    ];

    // Forecast values padded with nulls for historical range
    const forecastValues = [
        ...historicalData.map(() => null),
        ...forecastData.map(d => d.predicted ?? d.revenue)
    ];

    const datasets = [
        {
            label: 'Historical Sales',
            data: historicalValues,
            borderColor: CHART_COLORS.success,
            backgroundColor: CHART_COLORS.success,
            pointBackgroundColor: '#fff',
            pointBorderColor: CHART_COLORS.success,
            tension: 0.3,
            fill: false,
            order: 1,
            spanGaps: false
        },
        {
            label: 'Forecast',
            data: forecastValues,
            borderColor: CHART_COLORS.primary,
            backgroundColor: CHART_COLORS.primary,
            pointBackgroundColor: '#fff',
            pointBorderColor: CHART_COLORS.primary,
            borderDash: [5, 5],
            tension: 0.3,
            fill: false,
            order: 2,
            spanGaps: false
        }
    ];

    // Add confidence interval if available
    if (showConfidenceInterval && forecastData[0]?.confidenceLower != null) {
        const upperValues = [
            ...historicalData.map(() => null),
            ...forecastData.map(d => d.confidenceUpper)
        ];
        const lowerValues = [
            ...historicalData.map(() => null),
            ...forecastData.map(d => d.confidenceLower)
        ];
        datasets.push({
            label: 'Confidence Interval',
            data: upperValues,
            borderColor: 'transparent',
            backgroundColor: CHART_COLORS.primaryAlpha,
            fill: '+1',
            pointRadius: 0,
            order: 3
        });
        datasets.push({
            label: 'Lower Bound',
            data: lowerValues,
            borderColor: 'transparent',
            backgroundColor: CHART_COLORS.primaryAlpha,
            fill: false,
            pointRadius: 0,
            order: 3
        });
    }

    const chartOptions = getDefaultChartOptions('line');
    chartOptions.plugins.title = {
        display: !!chartTitle,
        text: chartTitle,
        font: {
            family: CHART_FONTS.family,
            size: 16,
            weight: '600'
        },
        color: CHART_COLORS.textColor,
        padding: {
            top: 10,
            bottom: 20
        }
    };
    chartOptions.isCurrency = isCurrency;

    return {
        type: 'line',
        data: { labels, datasets },
        options: chartOptions
    };
}

/**
 * Create comparison chart (forecast vs actuals)
 */
export function createComparisonChartConfig(forecastData, actualData, options = {}) {
    const {
        chartTitle = 'Forecast vs Actual',
        isCurrency = true
    } = options;

    // Build labels from the union of forecast and actual dates
    const formatLabel = (d) => {
        const dt = d.date instanceof Date ? d.date : new Date(d.date);
        return dt.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
    };

    // Use forecast dates as primary labels, map actuals into same positions
    const labels = forecastData.map(formatLabel);
    const forecastValues = forecastData.map(d => d.predicted ?? d.revenue);

    // Build a date-indexed map for actuals
    const actualMap = {};
    for (const d of actualData) {
        const label = formatLabel(d);
        actualMap[label] = d.revenue;
    }
    const actualValues = labels.map(label => actualMap[label] ?? null);

    const datasets = [
        {
            label: 'Forecast',
            data: forecastValues,
            borderColor: CHART_COLORS.primary,
            backgroundColor: CHART_COLORS.primaryAlpha,
            tension: 0.3,
            fill: false
        },
        {
            label: 'Actual',
            data: actualValues,
            borderColor: CHART_COLORS.success,
            backgroundColor: CHART_COLORS.successAlpha,
            tension: 0.3,
            fill: false
        }
    ];

    const chartOptions = getDefaultChartOptions('line');
    chartOptions.plugins.title = {
        display: !!chartTitle,
        text: chartTitle,
        font: {
            family: CHART_FONTS.family,
            size: 16,
            weight: '600'
        },
        color: CHART_COLORS.textColor,
        padding: {
            top: 10,
            bottom: 20
        }
    };
    chartOptions.isCurrency = isCurrency;

    return {
        type: 'line',
        data: { labels, datasets },
        options: chartOptions
    };
}

/**
 * Create method performance bar chart
 */
export function createMethodPerformanceChart(methodData) {
    const datasets = [{
        label: 'Accuracy (MAPE)',
        data: methodData.map(m => 100 - m.mape),
        backgroundColor: [
            CHART_COLORS.primary,
            CHART_COLORS.success,
            CHART_COLORS.info,
            CHART_COLORS.warning
        ],
        borderWidth: 0,
        borderRadius: 8
    }];

    const chartOptions = getDefaultChartOptions('bar');
    chartOptions.plugins.title = {
        display: true,
        text: 'Forecasting Method Performance',
        font: {
            family: CHART_FONTS.family,
            size: 16,
            weight: '600'
        },
        color: CHART_COLORS.textColor
    };
    chartOptions.scales.y.title = {
        display: true,
        text: 'Accuracy %',
        font: {
            family: CHART_FONTS.family,
            size: 12,
            weight: '500'
        }
    };

    return {
        type: 'bar',
        data: {
            labels: methodData.map(m => m.name),
            datasets
        },
        options: chartOptions
    };
}

/**
 * Create seasonal pattern chart
 */
export function createSeasonalPatternChart(seasonalData) {
    const datasets = [{
        label: 'Average Daily Revenue',
        data: seasonalData.map(d => d.avgRevenue),
        borderColor: CHART_COLORS.primary,
        backgroundColor: CHART_COLORS.primaryAlpha,
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointHoverRadius: 7
    }];

    const chartOptions = getDefaultChartOptions('line');
    chartOptions.plugins.title = {
        display: true,
        text: 'Seasonal Patterns',
        font: {
            family: CHART_FONTS.family,
            size: 16,
            weight: '600'
        },
        color: CHART_COLORS.textColor
    };
    chartOptions.isCurrency = true;

    return {
        type: 'line',
        data: {
            labels: seasonalData.map(d => d.label),
            datasets
        },
        options: chartOptions
    };
}

/**
 * Format currency for South African Rand
 */
export function formatCurrency(value) {
    return `R ${value.toLocaleString('en-ZA', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    })}`;
}

/**
 * Format percentage
 */
export function formatPercentage(value) {
    return `${value.toFixed(1)}%`;
}

/**
 * Destroy chart instance safely
 */
export function destroyChart(chartInstance) {
    if (chartInstance) {
        try {
            chartInstance.destroy();
        } catch (error) {
            console.warn('Error destroying chart:', error);
        }
    }
}

// Re-export Chart so consumers use the same registered instance
export { Chart };

export default {
    Chart,
    CHART_COLORS,
    CHART_FONTS,
    createGradient,
    getDefaultChartOptions,
    createForecastChartConfig,
    createComparisonChartConfig,
    createMethodPerformanceChart,
    createSeasonalPatternChart,
    formatCurrency,
    formatPercentage,
    destroyChart
};
