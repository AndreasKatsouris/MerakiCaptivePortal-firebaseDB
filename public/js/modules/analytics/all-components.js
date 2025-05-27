/**
 * Analytics Module - Component Registration
 * 
 * This file registers all Vue components used in the Analytics module.
 */

// Import components for Food Cost Analytics
import { FoodCostAnalyticsDashboard } from './components/food-cost-analytics/dashboard-component.js';
import { TrendsAnalytics } from './components/food-cost-analytics/trends-component.js';
import { InsightsAnalytics } from './components/food-cost-analytics/insights-component.js';
import { ForecastAnalytics } from './components/food-cost-analytics/forecast-component.js';

// Components object to export
const AllComponents = {
    // Food Cost Analytics Components
    'food-cost-analytics-dashboard': FoodCostAnalyticsDashboard,
    'trends-analytics': TrendsAnalytics,
    'insights-analytics': InsightsAnalytics,
    'forecast-analytics': ForecastAnalytics,
};

// Export for registration
export { AllComponents };
