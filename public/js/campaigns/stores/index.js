// Core functionality
export { initializeCampaignManagement } from './campaigns.js'

// Store
export { useCampaignStore } from './store/campaign.store'

// Components
export { default as CampaignManager } from './components/CampaignManager.vue'

// Types
export * from '../types/campaign.types.js'

// Campaign-related utilities
export {
  validateCampaign,
  formatCampaignDates,
  calculateCampaignStatus,
  getCampaignMetrics
} from './utils/campaign.utils'

// Campaign constants
export {
  CAMPAIGN_STATUS,
  CAMPAIGN_TYPES,
  VALIDATION_RULES,
  DEFAULT_CAMPAIGN_SETTINGS
} from './constants/campaign.constants'