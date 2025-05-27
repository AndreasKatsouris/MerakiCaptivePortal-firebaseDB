/**
 * Food Cost Module - Simple Setup
 * 
 * This file provides a simpler way to load the Food Cost module
 * without dealing with dynamic imports, which might fail in some environments.
 */

// Import required modules directly
import { FoodCostApp } from './refactored-app-component.js';
import { ensureFirebaseInitialized } from './firebase-helpers.js';
import { initShadcnStyles } from './shadcn-styles.js';

/**
 * Initialize the Food Cost module in a container
 * 
 * @param {string} containerId - The ID of the container element
 * @returns {Promise} A promise that resolves with the app instance
 */
function setupFoodCostModule(containerId) {
    return new Promise((resolve, reject) => {
        try {
            console.log('Setting up Food Cost module in container:', containerId);
            
            // Get container element
            const container = document.getElementById(containerId);
            if (!container) {
                throw new Error(`Container element with ID "${containerId}" not found`);
            }
            
            // Check Vue is available
            if (typeof Vue === 'undefined') {
                throw new Error('Vue is not available - required for the Food Cost Module');
            }
            
            // Initialize Firebase
            ensureFirebaseInitialized();
            
            // Create loading indicator
            container.innerHTML = `
                <div class="d-flex justify-content-center align-items-center" style="min-height: 300px;">
                    <div class="text-center">
                        <div class="spinner-border text-primary mb-3" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <p>Loading Food Cost Dashboard...</p>
                    </div>
                </div>
            `;
            
            // Create Vue app
            const app = Vue.createApp(FoodCostApp);
            
            // Mount the app
            const instance = app.mount('#' + containerId);
            
            // Initialize shadcn-inspired styling
            initShadcnStyles();
            console.log('Applied shadcn-inspired styling to Food Cost Module');
            
            // Create controller
            const controller = {
                app,
                instance,
                unmount: () => {
                    app.unmount();
                    console.log('Food Cost Module unmounted');
                }
            };
            
            console.log('Food Cost Module setup complete');
            resolve(controller);
            
        } catch (error) {
            console.error('Error setting up Food Cost Module:', error);
            reject(error);
        }
    });
}

// Export the setup function
export { setupFoodCostModule };

// IMPORTANT: Make absolutely sure it's available globally by assigning it directly to window
window.setupFoodCostModule = setupFoodCostModule;
console.log('Food Cost Module setup script loaded. setupFoodCostModule is available globally:', 
    typeof window.setupFoodCostModule === 'function' ? 'YES' : 'NO');
