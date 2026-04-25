/**
 * Dashboard Constants
 * Feature definitions, status maps, and quick action configurations
 */

export const FEATURES_TO_CHECK = [
  'analyticsBasic',
  'campaignBasic',
  'wifiAnalytics',
  'rewardsBasic',
  'guestInsights',
  'multiLocation',
  'foodCostBasic',
  'foodCostAdvanced',
  'foodCostAnalytics',
  'qmsBasic',
  'qmsAdvanced',
  'qmsWhatsAppIntegration',
  'qmsAnalytics',
  'qmsAutomation',
  'salesForecastingBasic',
  'rossBasic',
  'rossAdvanced'
]

export const FEATURE_BADGES = [
  { id: 'analyticsBasic', name: 'Analytics', icon: 'fa-chart-line' },
  { id: 'campaignBasic', name: 'Campaigns', icon: 'fa-bullhorn' },
  { id: 'guestInsights', name: 'Guest Insights', icon: 'fa-users' },
  { id: 'multiLocation', name: 'Multi-Location', icon: 'fa-map-marker-alt' },
  { id: 'wifiAnalytics', name: 'WiFi Analytics', icon: 'fa-wifi' },
  { id: 'rewardsBasic', name: 'Rewards', icon: 'fa-gift' },
  { id: 'foodCostBasic', name: 'Food Cost Basic', icon: 'fa-utensils' },
  { id: 'foodCostAdvanced', name: 'Food Cost Advanced', icon: 'fa-utensils' },
  { id: 'foodCostAnalytics', name: 'Food Cost Analytics', icon: 'fa-chart-line' },
  { id: 'qmsBasic', name: 'Queue Management', icon: 'fa-clock' },
  { id: 'qmsAdvanced', name: 'Advanced Queue', icon: 'fa-list-ol' },
  { id: 'qmsWhatsAppIntegration', name: 'QMS WhatsApp', icon: 'fa-whatsapp' },
  { id: 'qmsAnalytics', name: 'Queue Analytics', icon: 'fa-chart-line' },
  { id: 'qmsAutomation', name: 'Queue Automation', icon: 'fa-robot' },
  { id: 'rossBasic', name: 'ROSS Basic', icon: 'fa-clipboard-list' },
  { id: 'rossAdvanced', name: 'ROSS Advanced', icon: 'fa-clipboard-list' }
]

export const QUICK_ACTIONS = [
  {
    id: 'addLocationAction',
    icon: 'fa-plus-circle',
    title: 'Add Location',
    description: 'Set up a new business location',
    featureId: null,
    href: null,
    action: 'addLocation'
  },
  {
    id: 'manageSubscription',
    icon: 'fa-credit-card',
    title: 'Manage Subscription',
    description: 'View plan & usage details',
    featureId: null,
    href: '/user-subscription.html',
    action: null
  },
  {
    id: 'viewAnalytics',
    icon: 'fa-chart-line',
    title: 'View Analytics',
    description: 'Check your performance metrics',
    featureId: 'analyticsBasic',
    href: '/analytics.html',
    action: null
  },
  {
    id: 'createCampaign',
    icon: 'fa-bullhorn',
    title: 'Create Campaign',
    description: 'Launch a new marketing campaign',
    featureId: 'campaignBasic',
    href: '/campaigns.html',
    action: null
  },
  {
    id: 'guestInsights',
    icon: 'fa-users',
    title: 'Guest Insights',
    description: 'View customer analytics',
    featureId: 'guestInsights',
    href: '/guest-insights.html',
    action: null
  },
  {
    id: 'foodCostBasicAction',
    icon: 'fa-utensils',
    title: 'Food Cost Management',
    description: 'Track food costs & inventory',
    featureId: 'foodCostBasic',
    href: '/js/modules/food-cost/cost-driver.html',
    action: null
  },
  {
    id: 'foodCostAdvancedAction',
    icon: 'fa-chart-pie',
    title: 'Advanced Food Analytics',
    description: 'Recipe costing & waste tracking',
    featureId: 'foodCostAdvanced',
    href: '/js/modules/food-cost/cost-driver.html?view=advanced',
    action: null
  },
  {
    id: 'foodCostAnalyticsAction',
    icon: 'fa-chart-line',
    title: 'Food Cost Analytics',
    description: 'Industry KPIs & insights',
    featureId: 'foodCostAnalytics',
    href: '/food-cost-analytics.html',
    action: null
  },
  {
    id: 'qmsBasicAction',
    icon: 'fa-clock',
    title: 'Queue Management',
    description: 'Manage customer queues & wait times',
    featureId: 'qmsBasic',
    href: '/queue-management.html',
    action: null
  },
  {
    id: 'salesForecastingAction',
    icon: 'fa-chart-area',
    title: 'Sales Forecasting',
    description: 'AI-powered sales predictions & insights',
    featureId: 'salesForecastingBasic',
    href: '/sales-forecasting.html',
    action: null
  },
  {
    id: 'rossAction',
    icon: 'fa-clipboard-list',
    title: 'ROSS',
    description: 'Workflows, tasks & compliance tracking',
    featureId: 'rossBasic',
    href: '/ross.html',
    action: null
  }
]

export const STATUS_MAP = {
  active: 'Active',
  trial: 'Trial',
  pastDue: 'Past Due',
  canceled: 'Canceled',
  none: 'None'
}

export const LOCATION_TYPE_MAP = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  bar: 'Bar',
  hotel: 'Hotel',
  retail: 'Retail Store',
  other: 'Other'
}

export const LOCATION_TYPES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'bar', label: 'Bar' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'retail', label: 'Retail Store' },
  { value: 'other', label: 'Other' }
]

export const TIMEZONES = [
  { value: 'Africa/Johannesburg', label: 'South Africa (SAST)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Asia/Tokyo', label: 'Tokyo' }
]
