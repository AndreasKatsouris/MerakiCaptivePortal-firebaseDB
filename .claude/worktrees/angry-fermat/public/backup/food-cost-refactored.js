/**
 * Food Cost Module Direct Entry Point
 * Version: 1.4.0-2025-04-14-B
 * 
 * This file directly initializes the refactored Food Cost module
 * in a container with ID 'food-cost-container'
 */

// Import the module and related utilities
import { 
    initializeFoodCostModule, 
    MODULE_VERSION,
    FirebaseService,
    DataService,
    CalculationUtils
} from './modules/food-cost/index.js';

// Import migration helpers
import { 
    detectArchitecture, 
    checkCompatibility 
} from './modules/food-cost/migration-helpers.js';

// Simple module initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log(`Food Cost Module direct initializer loaded (${MODULE_VERSION})`);
    
    // Check if container exists
    const container = document.getElementById('food-cost-container');
    if (!container) {
        console.error("Container element with ID 'food-cost-container' not found");
        
        // Try to create a notification if possible
        try {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Initialization Error',
                    text: "Container element with ID 'food-cost-container' not found",
                    icon: 'error'
                });
            }
        } catch (e) {
            // Sweetalert not available, continue silently
        }
        return;
    }
    
    // Show initializing message
    container.innerHTML = `
        <div class="alert alert-info">
            <h4>Food Cost Module Initializing...</h4>
            <p>Version: ${MODULE_VERSION}</p>
            <div class="progress">
                <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 100%"></div>
            </div>
        </div>
    `;
    
    // Initialize the module
    initializeFoodCostModule('food-cost-container')
        .then(result => {
            console.log('Food Cost Module initialized successfully:', result);
            
            // Check compatibility
            const compat = checkCompatibility();
            console.log(`Using architecture: ${compat.architecture}`);
            
            // Log Firebase services availability
            console.log('Firebase services available:', 
                typeof FirebaseService !== 'undefined' && 
                typeof FirebaseService.saveStockUsageData === 'function');
        })
        .catch(error => {
            console.error('Food Cost Module initialization failed:', error);
            
            // Display error in container
            container.innerHTML = `
                <div class="alert alert-danger">
                    <h4>Food Cost Module Initialization Failed</h4>
                    <p>${error.message}</p>
                </div>
            `;
            
            // Try to show a notification if possible
            try {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: 'Initialization Failed',
                        text: error.message,
                        icon: 'error'
                    });
                }
            } catch (e) {
                // Sweetalert not available, continue silently
            }
        });
});

// Export for potential reuse
export { 
    initializeFoodCostModule, 
    MODULE_VERSION,
    detectArchitecture,
    checkCompatibility
};
