# Food Cost Analytics Documentation

## Overview

The Food Cost Analytics feature provides industry-standard KPIs, trend analysis, and actionable recommendations for hospitality businesses to optimize their food cost management. This premium feature analyzes historical stock usage data and provides insights based on hospitality industry best practices.

## Currency Display
The analytics module displays all monetary values without currency symbols, making it platform-agnostic and ready for future multi-currency support. All values are formatted using locale-appropriate number formatting (thousands separators, decimal places) without currency indicators.

## Key Features

### 1. Industry-Standard KPIs

The analytics dashboard tracks four primary KPIs:

- **Food Cost Percentage** (Target: 25-35%)
  - Calculated as: (Total Cost of Goods Sold / Total Revenue) × 100
  - Industry benchmark for profitable restaurant operations

- **Waste Percentage** (Target: <4%)
  - Tracks variance between expected and actual usage
  - Helps identify areas for improved inventory management

- **Inventory Turnover** (Target: 4-8x per month)
  - Measures how efficiently inventory is being used
  - Higher turnover indicates fresher ingredients and better cash flow

- **Prime Cost** (Target: <60%)
  - Combined food cost and labor cost as percentage of revenue
  - Critical metric for overall restaurant profitability

### 2. Visual Analytics

The dashboard includes four interactive charts:

1. **Cost vs Revenue Trend**: Line chart showing the relationship between food costs and revenue over time
2. **Category Breakdown**: Doughnut chart displaying cost distribution by category
3. **Top 5 Cost Items**: Bar chart highlighting the most expensive inventory items
4. **Waste Trend**: Line chart tracking waste value over time

### 3. Intelligent Recommendations

The system provides contextual recommendations based on your metrics:

- **Cost Optimization**: Suggestions for high-cost items
- **Waste Reduction**: Strategies to minimize food waste
- **Inventory Management**: Tips for improving turnover rates
- **Menu Engineering**: Advice on pricing and product mix

## Accessing the Feature

### Tier Requirements

Food Cost Analytics is available in tiers that include the `foodCostAnalytics` feature:
- Professional and Enterprise tiers typically include this feature
- Check your subscription details in the admin dashboard

### Navigation

Access the analytics dashboard through:
1. From the Food Cost Module: Actions dropdown → Analytics Dashboard
2. Direct URL: `/public/food-cost-analytics.html`

## Using the Analytics Dashboard

### 1. Select Location and Date Range

- Choose the location you want to analyze
- Set the date range for the analysis period
- The system will load all stock usage data within that range

### 2. Review KPIs

Each KPI card shows:
- Current value
- Industry standard/target
- Color coding (green=excellent, blue=good, yellow=warning, red=critical)

### 3. Analyze Charts

- Hover over chart elements for detailed values
- Charts update automatically when you change location or date range

### 4. Act on Recommendations

- Expand recommendation cards to see detailed action items
- Prioritize based on severity (critical > warning > info)
- Track improvements over time

## Industry Standards Reference

### Food Cost Percentage Benchmarks
- **Quick Service**: 25-30%
- **Casual Dining**: 30-35%
- **Fine Dining**: 35-40%

### Waste Percentage Guidelines
- **Excellent**: 0-2%
- **Good**: 2-4%
- **Needs Improvement**: 4-6%
- **Critical**: >6%

### Inventory Turnover Rates
- **Perishables**: 8-12x per month
- **Dry Goods**: 4-6x per month
- **Frozen Items**: 2-4x per month

## Calculation Methods

### Food Cost Percentage
```
Food Cost % = (Total Cost of Usage / Total Revenue) × 100
```

### Waste Calculation
```
Waste = Opening Stock + Purchases - Closing Stock - Usage
Waste % = (Waste Value / Total Cost) × 100
```

### Inventory Turnover
```
Turnover = Annual COGS / Average Inventory Value
```

### Prime Cost
```
Prime Cost % = ((Food Cost + Labor Cost) / Revenue) × 100
```

## Best Practices

1. **Regular Analysis**: Review analytics at least weekly
2. **Set Targets**: Use industry standards as baseline, adjust for your concept
3. **Track Trends**: Focus on trends rather than single data points
4. **Act on Insights**: Implement recommendations systematically
5. **Measure Impact**: Compare metrics before and after changes

## Troubleshooting

### No Data Showing
- Ensure you have saved stock usage data for the selected location
- Check that the date range includes saved records
- Verify you have the required tier access

### Incorrect Calculations
- Verify sales data is entered correctly
- Check that all stock items have unit costs
- Ensure opening/closing quantities are accurate

### Performance Issues
- Limit date range to 30-60 days for optimal performance
- Clear browser cache if charts don't render properly

## Future Enhancements

Planned features include:
- Predictive analytics for demand forecasting
- Supplier performance metrics
- Recipe costing integration
- Multi-location comparative analysis
- Automated alert system for KPI thresholds

## Support

For assistance with Food Cost Analytics:
1. Check your tier includes the feature
2. Review this documentation
3. Contact support with specific questions 