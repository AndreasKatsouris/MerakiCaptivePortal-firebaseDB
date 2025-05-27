/**
 * Food Cost Module Standalone Initializer
 * Version: 1.5.0-2025-04-14-B BLACK-WHITE-UI
 * This file provides global initialization functions
 */

// Immediately set the MODULE_VERSION so it's available globally
window.MODULE_VERSION = '1.5.0-2025-04-14-B BLACK-WHITE-UI';

// Global initialization function - MUST be attached to window object
window.initializeFoodCostModule = function(containerId) {
    console.log('Food Cost Module initialization requested for container:', containerId, 'VERSION:', window.MODULE_VERSION);
    
    // Create a promise that will be returned
    return new Promise(function(resolve, reject) {
        // Timeout safety mechanism to detect hanging
        var initTimeout = setTimeout(function() {
            console.warn('Food Cost Module initialization timeout - module may be hanging');
            
            // Check for Vue
            if (!window.Vue) {
                console.error('Vue is not available - this is likely causing the Food Cost Module to hang');
                reject(new Error('Vue is not available'));
            } else {
                console.log('Vue is available:', window.Vue.version);
            }
            
            // Check Firebase
            if (!window.firebase) {
                console.warn('Firebase is not available');
            }
            
            // Check the container
            var container = document.getElementById(containerId);
            if (!container) {
                console.error('Container with ID "' + containerId + '" not found - this would cause initialization to fail');
                reject(new Error('Container not found'));
            } else {
                console.log('Container element found:', container);
                
                // Show error in the container
                container.innerHTML = '<div class="alert alert-danger">' +
                    '<h4>Food Cost Module Initialization Timeout</h4>' +
                    '<p>The module is taking too long to initialize. This may be due to missing dependencies.</p>' +
                    '<p>Please check the browser console for more details.</p>' +
                    '<button class="btn btn-primary" onclick="window.location.reload()">Reload Page</button>' +
                    '</div>';
            }
        }, 5000);  // 5 second timeout
        
        try {
            // Make sure the container exists
            var container = document.getElementById(containerId);
            if (!container) {
                throw new Error('Container element with ID "' + containerId + '" not found');
            }
            
            // Check for Vue
            if (!window.Vue) {
                throw new Error('Vue.js is required but not available');
            }
            
            // Show loading indicator
            container.innerHTML = '<div class="d-flex justify-content-center align-items-center" style="min-height: 300px;">' +
                '<div class="text-center">' +
                '<div class="spinner-border text-primary mb-3" role="status">' +
                '<span class="visually-hidden">Loading...</span>' +
                '</div>' +
                '<p>Loading Food Cost Dashboard...</p>' +
                '</div>' +
                '</div>';
            
            // There are two ways to load the component:
            // 1. Direct script loading (non-module)
            // 2. ES6 module import
            
            // Try method 1 first - check if component is already loaded
            if (window.FoodCostApp) {
                console.log('FoodCostApp already loaded globally');
                initializeVueApp(window.FoodCostApp);
            } else {
                // Load using both methods in parallel with preference to non-module
                var scriptLoaded = false;
                
                // Method 1: Load script directly (non-module)
                loadScriptDirectly(function(success) {
                    if (success && !scriptLoaded) {
                        scriptLoaded = true;
                        if (window.FoodCostApp) {
                            console.log('FoodCostApp loaded via direct script');
                            initializeVueApp(window.FoodCostApp);
                        } else {
                            console.error('FoodCostApp not found after direct script load');
                            tryFallbackMethod();
                        }
                    } else if (!success && !scriptLoaded) {
                        console.warn('Direct script loading failed, trying fallback');
                        tryFallbackMethod();
                    }
                });
            }
            
            // Fallback to ES6 module loading
            function tryFallbackMethod() {
                // Check again in case it was loaded by another method
                if (window.FoodCostApp) {
                    scriptLoaded = true;
                    console.log('FoodCostApp found globally during fallback');
                    initializeVueApp(window.FoodCostApp);
                } else {
                    console.warn('Attempting ES6 module import as fallback');
                    
                    // Create a simple module loader script
                    var moduleLoader = document.createElement('script');
                    moduleLoader.textContent = 'import("/js/modules/food-cost/refactored-app-component.js").then(module => {' +
                        'if (module && module.FoodCostApp) {' +
                        '  window.FoodCostAppFromModule = module.FoodCostApp;' +
                        '  document.dispatchEvent(new CustomEvent("food-cost-module-loaded"));' +
                        '} else {' +
                        '  console.error("Module loaded but FoodCostApp not found");' +
                        '  document.dispatchEvent(new CustomEvent("food-cost-module-error"));' +
                        '}' +
                        '}).catch(err => {' +
                        'console.error("Error importing module:", err);' +
                        'document.dispatchEvent(new CustomEvent("food-cost-module-error", {detail: err}));' +
                        '});';
                    moduleLoader.type = 'module';
                    
                    // Handle module loading events
                    document.addEventListener('food-cost-module-loaded', function() {
                        if (!scriptLoaded) {
                            scriptLoaded = true;
                            console.log('FoodCostApp loaded via ES6 module');
                            initializeVueApp(window.FoodCostAppFromModule);
                        }
                    }, {once: true});
                    
                    document.addEventListener('food-cost-module-error', function(e) {
                        if (!scriptLoaded) {
                            console.error('All loading methods failed');
                            clearTimeout(initTimeout);
                            reject(new Error('Failed to load FoodCostApp component: ' + (e.detail ? e.detail.message : 'Unknown error')));
                        }
                    }, {once: true});
                    
                    document.head.appendChild(moduleLoader);
                }
            }
            
            // Initialize Vue app with the component
            function initializeVueApp(component) {
                try {
                    // Clear timeout since initialization is proceeding
                    clearTimeout(initTimeout);
                    
                    // Create a new Vue app instance
                    var appInstance = window.Vue.createApp(component);
                    
                    // Mount to container
                    var mountedApp = appInstance.mount('#' + containerId);
                    
                    // Create controller object
                    var controller = {
                        app: appInstance,
                        instance: mountedApp,
                        unmount: function() {
                            appInstance.unmount();
                            console.log('Food Cost Module unmounted');
                        }
                    };
                    
                    // Create global namespace for the module if it doesn't exist
                    window.FoodCost = window.FoodCost || {};
                    
                    // Store current instance
                    window.FoodCost.currentInstance = controller;
                    
                    console.log('Food Cost Module initialized successfully');
                    resolve(controller);
                } catch (err) {
                    console.error('Error mounting Vue component:', err);
                    reject(err);
                }
            }
            
            // Function to load script directly
            function loadScriptDirectly(callback) {
                var script = document.createElement('script');
                script.src = '/js/modules/food-cost/refactored-app-component.js';
                script.onload = function() {
                    if (window.FoodCostApp) {
                        callback(true);
                    } else {
                        console.warn('Script loaded but FoodCostApp not found');
                        callback(false);
                    }
                };
                script.onerror = function() {
                    console.error('Error loading script directly');
                    callback(false);
                };
                document.head.appendChild(script);
            }
        } catch (err) {
            console.error('Failed to load Food Cost Module:', err);
            clearTimeout(initTimeout);
            reject(err);
        }
    });
};

// Add a version checking function
window.checkFoodCostModuleVersion = function() {
    return {
        version: window.MODULE_VERSION,
        buildDate: '2025-04-14',
        isRefactored: true
    };
};

// IIFE to log initialization and prevent variable leakage
(function() {
    // Output to console that the function is available
    console.log('Food Cost Module initializer loaded. Global function available:', 
        typeof window.initializeFoodCostModule === 'function' ? 'YES ✓' : 'NO ✗',
        'VERSION:', window.MODULE_VERSION);
})();
