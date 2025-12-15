/**
 * Food Cost Module with Feature Guard
 * This module integrates feature access control with the food cost management module
 */

import { featureAccessControl } from '../access-control/services/feature-access-control.js';

// Food Cost module initialization with feature checks
export const FoodCostWithGuard = {
    /**
     * Initialize the food cost module with feature access checks
     * @param {string} containerId - DOM element ID where the module should be mounted
     * @returns {Promise<boolean>} - True if module was initialized, false if access denied
     */
    async initializeWithAccessControl(containerId) {
        try {
            console.log('[FoodCostGuard] Checking feature access for food cost module...');
            
            // Check if user has access to basic food cost features
            const basicAccess = await featureAccessControl.checkFeatureAccess('foodCostBasic');
            
            if (!basicAccess) {
                console.log('[FoodCostGuard] User does not have access to food cost module');
                
                // Show access denied message
                await featureAccessControl.showUpgradePrompt('foodCostBasic');
                
                // Show placeholder in the container
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = `
                        <div class="card">
                            <div class="card-body text-center py-5">
                                <i class="fas fa-calculator fa-3x text-muted mb-3"></i>
                                <h4 class="text-muted">Food Cost Management</h4>
                                <p class="text-muted">Track inventory, calculate food costs, and optimize your menu profitability.</p>
                                <button class="btn btn-primary mt-3" onclick="window.FoodCostWithGuard.showUpgradeOptions()">
                                    <i class="fas fa-arrow-up"></i> Upgrade to Access
                                </button>
                            </div>
                        </div>
                    `;
                }
                
                return false;
            }
            
            // Check for advanced features
            const advancedAccess = await featureAccessControl.checkFeatureAccess('foodCostAdvanced');
            const purchaseOrderAccess = await featureAccessControl.checkFeatureAccess('foodCostPurchaseOrders');
            const multiLocationAccess = await featureAccessControl.checkFeatureAccess('foodCostMultiLocation');
            
            console.log('[FoodCostGuard] Feature access levels:', {
                basic: basicAccess,
                advanced: advancedAccess,
                purchaseOrders: purchaseOrderAccess,
                multiLocation: multiLocationAccess
            });
            
            // Store feature flags globally for the food cost module to use
            window.FoodCostFeatures = {
                hasBasicAccess: basicAccess,
                hasAdvancedAccess: advancedAccess,
                hasPurchaseOrderAccess: purchaseOrderAccess,
                hasMultiLocationAccess: multiLocationAccess
            };
            
            // Initialize the food cost module
            if (typeof window.initializeFoodCostModule === 'function') {
                console.log('[FoodCostGuard] Initializing food cost module with feature restrictions...');
                await window.initializeFoodCostModule(containerId);
                
                // Apply feature restrictions after initialization
                this.applyFeatureRestrictions();
                
                return true;
            } else if (typeof window.setupFoodCostModule === 'function') {
                console.log('[FoodCostGuard] Using setupFoodCostModule function...');
                await window.setupFoodCostModule(containerId);
                
                // Apply feature restrictions after initialization
                this.applyFeatureRestrictions();
                
                return true;
            } else {
                console.error('[FoodCostGuard] Food cost module initializer not found');
                console.log('[FoodCostGuard] Available functions:', Object.keys(window).filter(k => k.includes('FoodCost')));
                
                // Try to load the module dynamically
                try {
                    console.log('[FoodCostGuard] Attempting to load food cost module dynamically...');
                    const script = document.createElement('script');
                    script.type = 'module';
                    script.textContent = `
                        import { setupFoodCostModule } from './js/modules/food-cost/setup.js';
                        window.setupFoodCostModule = setupFoodCostModule;
                        console.log('[FoodCostGuard] Food cost module loaded dynamically');
                    `;
                    document.body.appendChild(script);
                    
                    // Wait a bit for the module to load
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    if (typeof window.setupFoodCostModule === 'function') {
                        await window.setupFoodCostModule(containerId);
                        this.applyFeatureRestrictions();
                        return true;
                    }
                } catch (error) {
                    console.error('[FoodCostGuard] Error loading food cost module:', error);
                }
                
                return false;
            }
            
        } catch (error) {
            console.error('[FoodCostGuard] Error initializing food cost module:', error);
            return false;
        }
    },
    
    /**
     * Apply feature restrictions to the food cost module UI
     */
    applyFeatureRestrictions() {
        console.log('[FoodCostGuard] Applying feature restrictions...');
        
        // Hide advanced features if user doesn't have access
        if (!window.FoodCostFeatures.hasAdvancedAccess) {
            // Hide historical analytics
            const historicalElements = document.querySelectorAll('[data-feature="foodCostAdvanced"]');
            historicalElements.forEach(el => {
                el.style.display = 'none';
            });
            
            // Disable advanced calculation options
            const advancedOptions = document.querySelectorAll('.advanced-calculation-option');
            advancedOptions.forEach(el => {
                el.disabled = true;
                el.title = 'Upgrade to Professional plan for advanced calculations';
            });
        }
        
        // Hide purchase order features if user doesn't have access
        if (!window.FoodCostFeatures.hasPurchaseOrderAccess) {
            const poElements = document.querySelectorAll('[data-feature="foodCostPurchaseOrders"]');
            poElements.forEach(el => {
                el.style.display = 'none';
            });
            
            // Replace PO buttons with upgrade prompts
            const poButtons = document.querySelectorAll('.generate-po-button');
            poButtons.forEach(btn => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    this.showFeatureUpgradePrompt('foodCostPurchaseOrders');
                };
                btn.innerHTML = '<i class="fas fa-lock"></i> Purchase Orders';
                btn.classList.add('btn-secondary');
                btn.classList.remove('btn-primary');
            });
        }
        
        // Hide multi-location features if user doesn't have access
        if (!window.FoodCostFeatures.hasMultiLocationAccess) {
            const locationSelector = document.querySelector('.location-selector');
            if (locationSelector) {
                locationSelector.style.display = 'none';
            }
        }
    },
    
    /**
     * Show upgrade options for food cost features
     */
    async showUpgradeOptions() {
        const upgradeOptions = await featureAccessControl.getUpgradeOptionsForFeature('foodCostBasic');
        
        let optionsHtml = '';
        upgradeOptions.forEach(tier => {
            const features = [];
            if (tier.features.foodCostBasic) features.push('Basic Food Cost');
            if (tier.features.foodCostAdvanced) features.push('Advanced Analytics');
            if (tier.features.foodCostPurchaseOrders) features.push('Purchase Orders');
            if (tier.features.foodCostMultiLocation) features.push('Multi-Location');
            
            optionsHtml += `
                <div class="col-md-4 mb-3">
                    <div class="card h-100">
                        <div class="card-body">
                            <h5 class="card-title">${tier.name}</h5>
                            <p class="card-text">${tier.description || ''}</p>
                            <h6 class="text-primary">$${tier.monthlyPrice}/month</h6>
                            <ul class="list-unstyled mt-3">
                                ${features.map(f => `<li><i class="fas fa-check text-success"></i> ${f}</li>`).join('')}
                            </ul>
                            <button class="btn btn-primary btn-block" onclick="window.location.href='/user-subscription.html'">
                                Choose ${tier.name}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        Swal.fire({
            title: 'Upgrade to Access Food Cost Management',
            html: `
                <div class="container-fluid">
                    <p>Choose a plan that includes Food Cost Management features:</p>
                    <div class="row mt-4">
                        ${optionsHtml}
                    </div>
                </div>
            `,
            width: '800px',
            showCloseButton: true,
            showConfirmButton: false
        });
    },
    
    /**
     * Show upgrade prompt for specific feature
     */
    async showFeatureUpgradePrompt(featureId) {
        await featureAccessControl.showAccessDeniedMessage(featureId, {
            showUpgradeOptions: true
        });
    },
    
    /**
     * Check if a specific food cost feature is available
     */
    hasFeature(featureName) {
        if (!window.FoodCostFeatures) return false;
        
        switch(featureName) {
            case 'basic':
                return window.FoodCostFeatures.hasBasicAccess;
            case 'advanced':
                return window.FoodCostFeatures.hasAdvancedAccess;
            case 'purchaseOrders':
                return window.FoodCostFeatures.hasPurchaseOrderAccess;
            case 'multiLocation':
                return window.FoodCostFeatures.hasMultiLocationAccess;
            default:
                return false;
        }
    }
};

// Make it available globally for easier access
window.FoodCostWithGuard = FoodCostWithGuard;

console.log('[FoodCostGuard] Food Cost feature guard module loaded');
