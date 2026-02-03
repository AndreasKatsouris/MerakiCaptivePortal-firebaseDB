/**
 * Platform Features Definition
 * Version: 1.0.0-2025-05-30
 * 
 * Central definition of all platform features/modules that can be assigned to tiers
 * This serves as the single source of truth for feature-based access control
 */

// Platform feature definitions with metadata
export const PLATFORM_FEATURES = {
  // WiFi Module Features
  wifiBasic: {
    id: 'wifiBasic',
    name: 'Basic WiFi Access',
    module: 'wifi',
    description: 'Basic guest WiFi access with time limits',
    category: 'wifi',
    icon: 'fa-wifi'
  },
  wifiPremium: {
    id: 'wifiPremium',
    name: 'Premium WiFi Access',
    module: 'wifi',
    description: 'Extended WiFi access with higher speeds and no time limits',
    category: 'wifi',
    icon: 'fa-wifi',
    dependencies: ['wifiBasic']
  },
  wifiAnalytics: {
    id: 'wifiAnalytics',
    name: 'WiFi Analytics',
    module: 'wifi',
    description: 'Detailed WiFi usage analytics and reports',
    category: 'analytics',
    icon: 'fa-chart-line'
  },

  // WhatsApp Integration Features
  whatsappBasic: {
    id: 'whatsappBasic',
    name: 'WhatsApp Messaging',
    module: 'whatsapp',
    description: 'Basic WhatsApp communication with guests',
    category: 'communication',
    icon: 'fa-whatsapp'
  },
  whatsappAutomation: {
    id: 'whatsappAutomation',
    name: 'WhatsApp Automation',
    module: 'whatsapp',
    description: 'Automated WhatsApp campaigns and responses',
    category: 'automation',
    icon: 'fa-robot',
    dependencies: ['whatsappBasic']
  },
  whatsappBroadcast: {
    id: 'whatsappBroadcast',
    name: 'WhatsApp Broadcast',
    module: 'whatsapp',
    description: 'Bulk WhatsApp messaging to guest lists',
    category: 'communication',
    icon: 'fa-broadcast-tower',
    dependencies: ['whatsappBasic']
  },

  // Receipt Processing Features
  receiptProcessingManual: {
    id: 'receiptProcessingManual',
    name: 'Manual Receipt Entry',
    module: 'receipts',
    description: 'Manual receipt data entry and management',
    category: 'operations',
    icon: 'fa-receipt'
  },
  receiptProcessingOCR: {
    id: 'receiptProcessingOCR',
    name: 'OCR Receipt Processing',
    module: 'receipts',
    description: 'Automatic receipt scanning and data extraction',
    category: 'operations',
    icon: 'fa-scanner',
    dependencies: ['receiptProcessingManual']
  },
  receiptAnalytics: {
    id: 'receiptAnalytics',
    name: 'Receipt Analytics',
    module: 'receipts',
    description: 'Spending patterns and purchase analytics',
    category: 'analytics',
    icon: 'fa-chart-pie'
  },

  // Rewards System Features
  rewardsBasic: {
    id: 'rewardsBasic',
    name: 'Basic Rewards Program',
    module: 'rewards',
    description: 'Simple points-based rewards system',
    category: 'loyalty',
    icon: 'fa-gift'
  },
  rewardsAdvanced: {
    id: 'rewardsAdvanced',
    name: 'Advanced Rewards',
    module: 'rewards',
    description: 'Tiered rewards with custom rules and campaigns',
    category: 'loyalty',
    icon: 'fa-crown',
    dependencies: ['rewardsBasic']
  },
  rewardsGamefication: {
    id: 'rewardsGamefication',
    name: 'Gamified Rewards',
    module: 'rewards',
    description: 'Challenges, badges, and competitive elements',
    category: 'loyalty',
    icon: 'fa-trophy',
    dependencies: ['rewardsAdvanced']
  },

  // Campaign Management Features
  campaignBasic: {
    id: 'campaignBasic',
    name: 'Basic Campaign Management',
    module: 'campaigns',
    description: 'Create and manage basic marketing campaigns',
    category: 'marketing',
    icon: 'fa-bullhorn'
  },
  campaignAdvanced: {
    id: 'campaignAdvanced',
    name: 'Advanced Campaigns',
    module: 'campaigns',
    description: 'A/B testing, scheduling, and advanced targeting',
    category: 'marketing',
    icon: 'fa-chart-line',
    dependencies: ['campaignBasic']
  },
  campaignAutomation: {
    id: 'campaignAutomation',
    name: 'Campaign Automation',
    module: 'campaigns',
    description: 'Automated campaign triggers and workflows',
    category: 'automation',
    icon: 'fa-cogs',
    dependencies: ['campaignAdvanced']
  },
  campaignsBasic: {
    id: 'campaignsBasic',
    name: 'Basic Campaigns',
    module: 'campaigns',
    description: 'Create and manage simple marketing campaigns',
    category: 'marketing',
    icon: 'fa-bullhorn'
  },
  campaignsAdvanced: {
    id: 'campaignsAdvanced',
    name: 'Advanced Campaigns',
    module: 'campaigns',
    description: 'Multi-channel campaigns with automation',
    category: 'marketing',
    icon: 'fa-rocket',
    dependencies: ['campaignsBasic']
  },
  campaignsSegmentation: {
    id: 'campaignsSegmentation',
    name: 'Customer Segmentation',
    module: 'campaigns',
    description: 'Advanced customer segmentation for targeted campaigns',
    category: 'marketing',
    icon: 'fa-users-cog',
    dependencies: ['campaignsAdvanced']
  },

  // Guest Management Features
  guestManagementBasic: {
    id: 'guestManagementBasic',
    name: 'Basic Guest Database',
    module: 'guests',
    description: 'Store and manage guest information',
    category: 'crm',
    icon: 'fa-users'
  },
  guestManagementAdvanced: {
    id: 'guestManagementAdvanced',
    name: 'Advanced CRM',
    module: 'guests',
    description: 'Full CRM with guest history and preferences',
    category: 'crm',
    icon: 'fa-address-book',
    dependencies: ['guestManagementBasic']
  },
  guestInsights: {
    id: 'guestInsights',
    name: 'Guest Insights',
    module: 'analytics',
    description: 'View customer demographics and behavior analytics',
    category: 'analytics',
    icon: 'fa-users'
  },
  guestInsightsAdvanced: {
    id: 'guestInsightsAdvanced',
    name: 'Guest Insights',
    module: 'guests',
    description: 'AI-powered guest behavior analysis',
    category: 'analytics',
    icon: 'fa-brain',
    dependencies: ['guestManagementAdvanced']
  },

  // Analytics Features
  analyticsBasic: {
    id: 'analyticsBasic',
    name: 'Basic Analytics',
    module: 'analytics',
    description: 'Basic dashboards and reports',
    category: 'analytics',
    icon: 'fa-chart-bar'
  },
  analyticsAdvanced: {
    id: 'analyticsAdvanced',
    name: 'Advanced Analytics',
    module: 'analytics',
    description: 'Custom reports and data export',
    category: 'analytics',
    icon: 'fa-chart-line',
    dependencies: ['analyticsBasic']
  },
  analyticsPredictive: {
    id: 'analyticsPredictive',
    name: 'Predictive Analytics',
    module: 'analytics',
    description: 'AI-powered predictions and trends',
    category: 'analytics',
    icon: 'fa-magic',
    dependencies: ['analyticsAdvanced']
  },

  // Food Cost Management Features
  foodCostBasic: {
    id: 'foodCostBasic',
    name: 'Basic Food Cost Management',
    module: 'foodCost',
    description: 'Track and manage basic food costs and inventory',
    category: 'operations',
    icon: 'fa-utensils'
  },
  foodCostAdvanced: {
    id: 'foodCostAdvanced',
    name: 'Advanced Food Cost Management',
    module: 'foodCost',
    description: 'Advanced cost analysis with recipe management and waste tracking',
    category: 'operations',
    icon: 'fa-chart-pie',
    dependencies: ['foodCostBasic']
  },
  foodCostAnalytics: {
    id: 'foodCostAnalytics',
    name: 'Food Cost Analytics',
    module: 'foodCost',
    description: 'Industry-standard food cost analytics with KPIs, trends, and recommendations',
    category: 'analytics',
    icon: 'fa-chart-line',
    dependencies: ['foodCostAdvanced']
  },

  // Sales Forecasting Features
  salesForecastingBasic: {
    id: 'salesForecastingBasic',
    name: 'Basic Sales Forecasting',
    module: 'salesForecasting',
    description: 'Upload historical sales data and generate revenue predictions',
    category: 'analytics',
    icon: 'fa-chart-line'
  },
  salesForecastingAdvanced: {
    id: 'salesForecastingAdvanced',
    name: 'Advanced Sales Forecasting',
    module: 'salesForecasting',
    description: 'ML-based forecasting with adjustments and actuals comparison',
    category: 'analytics',
    icon: 'fa-brain',
    dependencies: ['salesForecastingBasic']
  },
  salesForecastingAnalytics: {
    id: 'salesForecastingAnalytics',
    name: 'Forecast Analytics & Learning',
    module: 'salesForecasting',
    description: 'Accuracy tracking, pattern learning, and performance insights',
    category: 'analytics',
    icon: 'fa-graduation-cap',
    dependencies: ['salesForecastingAdvanced']
  },

  // Project Management Features
  projectManagementBasic: {
    id: 'projectManagementBasic',
    name: 'Basic Project Tracking',
    module: 'projects',
    description: 'Track development projects and tasks',
    category: 'development',
    icon: 'fa-tasks'
  },
  projectManagementAdvanced: {
    id: 'projectManagementAdvanced',
    name: 'Advanced Project Management',
    module: 'projects',
    description: 'Full project management with team collaboration',
    category: 'development',
    icon: 'fa-project-diagram',
    dependencies: ['projectManagementBasic']
  },

  // Multi-location Features
  multiLocation: {
    id: 'multiLocation',
    name: 'Multi-Location Management',
    module: 'locations',
    description: 'Manage multiple business locations',
    category: 'management',
    icon: 'fa-map-marker-alt'
  },
  franchiseManagement: {
    id: 'franchiseManagement',
    name: 'Franchise Management',
    module: 'core',
    description: 'Advanced franchise management tools',
    category: 'core',
    icon: 'fa-network-wired',
    dependencies: ['multiLocation']
  },

  // API and Integration Features
  apiAccess: {
    id: 'apiAccess',
    name: 'API Access',
    module: 'integrations',
    description: 'Access to platform APIs for custom integrations',
    category: 'technical',
    icon: 'fa-code'
  },
  thirdPartyIntegrations: {
    id: 'thirdPartyIntegrations',
    name: 'Third-Party Integrations',
    module: 'integrations',
    description: 'Connect with POS, accounting, and other systems',
    category: 'technical',
    icon: 'fa-plug'
  },

  // Booking Management Features
  bookingManagement: {
    id: 'bookingManagement',
    name: 'Booking Management System',
    module: 'bookings',
    description: 'Restaurant booking and reservation management with guest notifications',
    category: 'operations',
    icon: 'fa-calendar-alt'
  },
  bookingAdvanced: {
    id: 'bookingAdvanced',
    name: 'Advanced Booking Management',
    module: 'bookings',
    description: 'Advanced booking features with table management and waitlists',
    category: 'operations',
    icon: 'fa-calendar-check',
    dependencies: ['bookingManagement']
  },
  bookingAnalytics: {
    id: 'bookingAnalytics',
    name: 'Booking Analytics',
    module: 'bookings',
    description: 'Booking performance analytics and reporting',
    category: 'analytics',
    icon: 'fa-chart-line',
    dependencies: ['bookingManagement']
  },

  // Queue Management System (QMS) Features
  qmsBasic: {
    id: 'qmsBasic',
    name: 'Basic Queue Management',
    module: 'qms',
    description: 'Basic queue management with limited entries per day',
    category: 'operations',
    icon: 'fa-clock'
  },
  qmsAdvanced: {
    id: 'qmsAdvanced',
    name: 'Advanced Queue Management',
    module: 'qms',
    description: 'Extended queue management with multiple locations and advanced features',
    category: 'operations',
    icon: 'fa-list-ol',
    dependencies: ['qmsBasic']
  },
  qmsWhatsAppIntegration: {
    id: 'qmsWhatsAppIntegration',
    name: 'QMS WhatsApp Integration',
    module: 'qms',
    description: 'WhatsApp notifications for queue updates and guest communication',
    category: 'communication',
    icon: 'fa-whatsapp',
    dependencies: ['qmsBasic', 'whatsappBasic']
  },
  qmsAnalytics: {
    id: 'qmsAnalytics',
    name: 'Queue Analytics',
    module: 'qms',
    description: 'Detailed queue performance analytics and reporting',
    category: 'analytics',
    icon: 'fa-chart-line',
    dependencies: ['qmsAdvanced']
  },
  qmsAutomation: {
    id: 'qmsAutomation',
    name: 'Queue Automation',
    module: 'qms',
    description: 'Automated queue management with smart notifications and flow optimization',
    category: 'automation',
    icon: 'fa-robot',
    dependencies: ['qmsAdvanced', 'qmsWhatsAppIntegration']
  },

  // Support Features
  supportBasic: {
    id: 'supportBasic',
    name: 'Basic Support',
    module: 'support',
    description: 'Email support during business hours',
    category: 'support',
    icon: 'fa-life-ring'
  },
  supportPriority: {
    id: 'supportPriority',
    name: 'Priority Support',
    module: 'support',
    description: '24/7 phone and chat support with dedicated account manager',
    category: 'support',
    icon: 'fa-headset',
    dependencies: ['supportBasic']
  }
};

// Feature categories for organization
export const FEATURE_CATEGORIES = {
  wifi: { name: 'WiFi Management', icon: 'fa-wifi', order: 1 },
  communication: { name: 'Communication', icon: 'fa-comments', order: 2 },
  operations: { name: 'Operations', icon: 'fa-cogs', order: 3 },
  loyalty: { name: 'Loyalty & Rewards', icon: 'fa-gift', order: 4 },
  marketing: { name: 'Marketing', icon: 'fa-bullhorn', order: 5 },
  analytics: { name: 'Analytics', icon: 'fa-chart-bar', order: 6 },
  automation: { name: 'Automation', icon: 'fa-robot', order: 7 },
  development: { name: 'Development', icon: 'fa-code-branch', order: 8 },
  core: { name: 'Core Features', icon: 'fa-server', order: 9 },
  technical: { name: 'Technical', icon: 'fa-tools', order: 10 },
  support: { name: 'Support', icon: 'fa-life-ring', order: 11 },
  management: { name: 'Management', icon: 'fa-building', order: 12 },
  guests: { name: 'Guests', icon: 'fa-users', order: 13 }
};

// Platform modules
export const PLATFORM_MODULES = {
  wifi: 'WiFi Management',
  whatsapp: 'WhatsApp Integration',
  receipts: 'Receipt Processing',
  rewards: 'Rewards System',
  campaigns: 'Campaign Management',
  guests: 'Guest Management',
  analytics: 'Analytics Dashboard',
  projects: 'Project Management',
  foodCost: 'Food Cost Management',
  salesForecasting: 'Sales Forecasting',
  bookings: 'Booking Management',
  qms: 'Queue Management System',
  integrations: 'Integrations',
  support: 'Support',
  core: 'Core Platform',
  locations: 'Location Management'
};

// Helper functions
export function getFeaturesByCategory(category) {
  return Object.values(PLATFORM_FEATURES).filter(feature => feature.category === category);
}

export function getFeaturesByModule(module) {
  return Object.values(PLATFORM_FEATURES).filter(feature => feature.module === module);
}

export function getFeatureDependencies(featureId) {
  const feature = PLATFORM_FEATURES[featureId];
  if (!feature || !feature.dependencies) return [];

  const deps = [...feature.dependencies];
  const allDeps = [...deps];

  // Recursively get all dependencies
  deps.forEach(depId => {
    const subDeps = getFeatureDependencies(depId);
    subDeps.forEach(subDep => {
      if (!allDeps.includes(subDep)) {
        allDeps.push(subDep);
      }
    });
  });

  return allDeps;
}

export function validateFeatureSet(features) {
  const featureSet = new Set(features);
  const errors = [];

  features.forEach(featureId => {
    const deps = getFeatureDependencies(featureId);
    deps.forEach(depId => {
      if (!featureSet.has(depId)) {
        errors.push({
          feature: featureId,
          missingDependency: depId,
          message: `Feature "${PLATFORM_FEATURES[featureId]?.name}" requires "${PLATFORM_FEATURES[depId]?.name}"`
        });
      }
    });
  });

  return { valid: errors.length === 0, errors };
}

// Helper function to get all features as an array
function getAllFeatures() {
  return Object.values(PLATFORM_FEATURES);
}

// Export as named exports for better compatibility
export const platformFeatures = {
  PLATFORM_FEATURES,
  FEATURE_CATEGORIES,
  PLATFORM_MODULES,
  getFeaturesByCategory,
  getFeaturesByModule,
  getFeatureDependencies,
  validateFeatureSet,
  getAllFeatures
};

// Also export as default for backward compatibility
export default {
  PLATFORM_FEATURES,
  FEATURE_CATEGORIES,
  PLATFORM_MODULES,
  getFeaturesByCategory,
  getFeaturesByModule,
  getFeatureDependencies,
  validateFeatureSet,
  getAllFeatures
};
