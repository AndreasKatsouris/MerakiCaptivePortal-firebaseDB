/**
 * Access Tier System - Main Module
 * Version: 1.0.0-2025-04-24
 * 
 * This module implements the tiered access system for the Laki Sparks platform.
 * It provides centralized permission management for feature gating based on user subscription tiers.
 */

import AccessControl from './services/access-control-service.js';
import SubscriptionService from './services/subscription-service.js';

// Export services
export { 
    AccessControl,
    SubscriptionService
};

// Initialize the module
const init = () => {
    console.log('Initializing Access Control Module v1.0.0');
    
    // Make services available globally
    window.AccessControl = AccessControl;
    window.SubscriptionService = SubscriptionService;
    
    // Register any UI components that need to be available globally
    
    return {
        AccessControl,
        SubscriptionService
    };
};

// Create namespaced module
const AccessTierSystem = {
    init,
    AccessControl,
    SubscriptionService
};

// Export as a global module
window.AccessTierSystem = AccessTierSystem;

export default AccessTierSystem;
