/**
 * Food Cost Module - Access Control Integration Example
 * Version: 1.0.0-2025-04-24
 * 
 * Demonstrates how to integrate the Access Tier System with the Food Cost module
 * to enable premium features based on subscription tier.
 */

import AccessControl from '../services/access-control-service.js';

/**
 * Initializes the Food Cost module with access control integration
 * This would be called from the Food Cost module's entry point
 */
export async function initializeFoodCostWithAccessControl() {
    console.log('Initializing Food Cost module with Access Control integration');
    
    // Check if user can access the basic Food Cost module
    const hasBasicAccess = await AccessControl.canUseFeature('foodCostBasic');
    
    if (!hasBasicAccess) {
        // User doesn't have access to the module at all
        console.log('User does not have access to Food Cost module');
        
        // Hide the entire module in the sidebar
        const foodCostMenu = document.querySelector('[data-module="food-cost"]');
        if (foodCostMenu) {
            foodCostMenu.style.display = 'none';
        }
        
        // Early return - no need to initialize the rest
        return;
    }
    
    // User has basic access, check for advanced features
    const hasAdvancedAccess = await AccessControl.canUseFeature('advancedFoodCostCalculation');
    
    // Initialize the Advanced Purchase Order system based on access level
    initializePurchaseOrderSystem(hasAdvancedAccess);
}

/**
 * Initialize the Purchase Order system with appropriate access level
 * @param {boolean} hasAdvancedAccess Whether the user has access to advanced features
 */
function initializePurchaseOrderSystem(hasAdvancedAccess) {
    // Get references to UI elements
    const poModal = document.getElementById('po-modal');
    if (!poModal) return;
    
    const advancedToggle = poModal.querySelector('.advanced-toggle');
    const lookbackPeriodSelector = poModal.querySelector('.lookback-period');
    const upgradeContainer = poModal.querySelector('.upgrade-container') || 
                            createUpgradeContainer(poModal);
    
    if (hasAdvancedAccess) {
        // User has advanced access - show advanced options
        console.log('User has access to Advanced Purchase Order features');
        
        // Show advanced options
        if (advancedToggle) advancedToggle.classList.remove('hidden');
        if (lookbackPeriodSelector) lookbackPeriodSelector.classList.remove('hidden');
        
        // Hide any upgrade prompts
        upgradeContainer.classList.add('hidden');
        
        // Initialize the advanced calculator
        import('../../food-cost/order-calculator-advanced.js')
            .then(module => {
                window.FoodCost.advancedOrderCalculator = new module.default();
                console.log('Advanced Order Calculator initialized');
            })
            .catch(err => console.error('Failed to load advanced calculator:', err));
    } else {
        // User has basic access only - hide advanced options and show upgrade prompt
        console.log('User has basic access to Food Cost module');
        
        // Hide advanced options
        if (advancedToggle) advancedToggle.classList.add('hidden');
        if (lookbackPeriodSelector) lookbackPeriodSelector.classList.add('hidden');
        
        // Show upgrade prompt
        upgradeContainer.classList.remove('hidden');
        AccessControl.showUpgradePrompt('advancedFoodCostCalculation', upgradeContainer);
        
        // Make sure we're using the basic calculator only
        window.FoodCost.advancedOrderCalculator = null;
    }
}

/**
 * Creates a container for the upgrade prompt if it doesn't exist
 * @param {HTMLElement} parent The parent element to append to
 * @returns {HTMLElement} The upgrade container
 */
function createUpgradeContainer(parent) {
    const container = document.createElement('div');
    container.className = 'upgrade-container';
    container.style.margin = '15px 0';
    container.style.padding = '10px';
    container.style.border = '1px solid #ddd';
    container.style.borderRadius = '4px';
    container.style.backgroundColor = '#f9f9f9';
    
    parent.querySelector('.modal-body').appendChild(container);
    return container;
}

/**
 * Patch the Food Cost module's PO modal to integrate with the access control system
 * This should be called when the PO modal is initialized
 */
export function patchPurchaseOrderModal() {
    const originalInitMethod = window.FoodCost.components.poModal.init;
    
    // Override the init method to add access control
    window.FoodCost.components.poModal.init = async function(...args) {
        // Call the original init method
        originalInitMethod.apply(this, args);
        
        // Check access for advanced features
        const hasAdvancedAccess = await AccessControl.canUseFeature('advancedFoodCostCalculation');
        
        // Apply access control to the modal
        const modal = document.getElementById('po-modal');
        if (modal) {
            const advancedOptions = modal.querySelector('.advanced-options');
            const upgradeContainer = modal.querySelector('.upgrade-container') || 
                                   createUpgradeContainer(modal);
            
            if (hasAdvancedAccess) {
                // Show advanced options
                if (advancedOptions) advancedOptions.classList.remove('hidden');
                upgradeContainer.classList.add('hidden');
            } else {
                // Hide advanced options and show upgrade prompt
                if (advancedOptions) advancedOptions.classList.add('hidden');
                upgradeContainer.classList.remove('hidden');
                AccessControl.showUpgradePrompt('advancedFoodCostCalculation', upgradeContainer);
            }
        }
    };
}

/**
 * Patch the historical usage service to respect subscription limits
 */
export function patchHistoricalUsageService() {
    // Import the historical usage service
    import('../../food-cost/services/historical-usage-service.js')
        .then(async module => {
            const originalLoadData = module.loadHistoricalData;
            
            // Override the loadHistoricalData method to respect access tiers
            module.loadHistoricalData = async function(...args) {
                // Check access level
                const hasAdvancedAccess = await AccessControl.canUseFeature('advancedFoodCostCalculation');
                
                if (!hasAdvancedAccess) {
                    // User doesn't have advanced access, return limited data
                    console.log('User does not have access to advanced historical data, returning limited dataset');
                    
                    // Get limit from subscription
                    const historyLimit = await AccessControl.getLimit('historicalDataDays') || 7;
                    
                    // Modify the args to limit the lookback period
                    if (args[1] && args[1].lookbackDays) {
                        const requestedLookback = args[1].lookbackDays;
                        args[1].lookbackDays = Math.min(requestedLookback, historyLimit);
                    }
                }
                
                // Call the original method with possibly modified args
                return originalLoadData.apply(this, args);
            };
        })
        .catch(err => console.error('Failed to patch historical usage service:', err));
}

/**
 * Initialize all Food Cost module access control integrations
 */
export function initializeAllFoodCostIntegrations() {
    // Check access to the module
    AccessControl.canUseFeature('foodCostBasic').then(hasAccess => {
        if (!hasAccess) {
            // Hide the module from the sidebar
            const foodCostMenu = document.querySelector('[data-module="food-cost"]');
            if (foodCostMenu) foodCostMenu.style.display = 'none';
            return;
        }
        
        // User has access to the basic module
        patchPurchaseOrderModal();
        patchHistoricalUsageService();
        
        // Apply feature-specific controls
        applyFeatureSpecificControls();
    });
}

/**
 * Apply feature-specific access controls to the Food Cost module
 */
async function applyFeatureSpecificControls() {
    // Get all feature access
    const features = await AccessControl.getAllFeatures();
    
    // Example: Control access to analytics exports
    if (!features.analyticsExport) {
        const exportButtons = document.querySelectorAll('.food-cost-export-btn');
        exportButtons.forEach(btn => {
            btn.disabled = true;
            btn.title = 'Upgrade to enable export';
            
            // Add upgrade info
            const upgradeInfo = document.createElement('small');
            upgradeInfo.className = 'text-muted upgrade-info';
            upgradeInfo.textContent = 'Upgrade to enable';
            upgradeInfo.style.cursor = 'pointer';
            upgradeInfo.onclick = () => {
                // Navigate to upgrade page
                window.location.href = '/subscription?feature=analyticsExport';
            };
            
            btn.parentNode.appendChild(upgradeInfo);
        });
    }
    
    // Example: Limit the number of items that can be added to purchase orders
    if (features.foodCostBasic && !features.advancedFoodCostCalculation) {
        // Basic tier has item limits
        const itemLimit = await AccessControl.getLimit('purchaseOrderItems') || 25;
        
        // Patch the add item function
        const originalAddItem = window.FoodCost.components.poModal.addItem;
        window.FoodCost.components.poModal.addItem = function(...args) {
            // Check if we're at the limit
            const currentItems = document.querySelectorAll('#po-items-table tbody tr').length;
            
            if (currentItems >= itemLimit) {
                // Show upgrade prompt
                alert(`You've reached the limit of ${itemLimit} items for your current plan. Upgrade to add more items.`);
                return;
            }
            
            // Call original function
            return originalAddItem.apply(this, args);
        };
    }
}

export default {
    initializeFoodCostWithAccessControl,
    patchPurchaseOrderModal,
    patchHistoricalUsageService,
    initializeAllFoodCostIntegrations
};
