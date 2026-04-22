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
import { getFlagsForLocation } from './services/flag-service.js';
import { computeRowSeverity } from './flag-display-merger.js';

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

/**
 * Refresh the Flags tab badge and summary pill from current RTDB flags.
 * Non-throwing: logs on failure so the dashboard keeps working.
 */
async function refreshFlagCountBadge(locationId) {
    if (!locationId) return;
    try {
        const flags = await getFlagsForLocation(locationId);
        let critical = 0;
        let warning = 0;
        for (const entry of Object.values(flags || {})) {
            const sev = computeRowSeverity(entry);
            if (sev === 'critical') critical += 1;
            else if (sev === 'warning') warning += 1;
        }
        const total = critical + warning;

        const badge = document.getElementById('fcFlagsCountBadge');
        if (badge) {
            badge.style.display = total ? 'inline-block' : 'none';
            badge.textContent = String(total);
            badge.className = `badge ms-1 ${critical ? 'bg-danger' : 'bg-warning text-dark'}`;
        }

        const summary = document.getElementById('food-cost-flag-summary');
        if (summary) {
            summary.style.display = total ? 'inline-block' : 'none';
            summary.textContent = total
                ? `${total} flag${total === 1 ? '' : 's'} • ${critical} critical`
                : '';
        }
    } catch (err) {
        console.error('[FoodCost] refreshFlagCountBadge failed:', err);
    }
}

// Export the setup function
export { setupFoodCostModule, refreshFlagCountBadge };

// IMPORTANT: Make absolutely sure it's available globally by assigning it directly to window
window.setupFoodCostModule = setupFoodCostModule;
window.FoodCost = window.FoodCost || {};
window.FoodCost.refreshFlagCountBadge = refreshFlagCountBadge;
console.log('Food Cost Module setup script loaded. setupFoodCostModule is available globally:', 
    typeof window.setupFoodCostModule === 'function' ? 'YES' : 'NO');
