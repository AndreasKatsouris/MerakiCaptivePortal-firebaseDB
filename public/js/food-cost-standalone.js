/**
 * Food Cost Module Standalone Initializer
 * Version: 1.3.2-2025-04-02-C
 * This file exposes ONLY the initialization function globally
 */

// IMPORTANT: This must be a global variable declaration to ensure it's accessible everywhere
window.initializeFoodCostModule = function(containerId) {
    console.log('Food Cost Module initialization requested for container:', containerId);
    
    // Make sure the container exists
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID "${containerId}" not found!`);
        return Promise.reject(new Error(`Container not found: ${containerId}`));
    }
    
    // Show a loading message
    container.innerHTML = `
        <div class="alert alert-info">
            <h4>Food Cost Module Loading...</h4>
            <p>Please wait while the module initializes.</p>
            <div class="progress">
                <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 100%"></div>
            </div>
        </div>
    `;
    
    // Create a promise to represent the initialization
    return new Promise((resolve, reject) => {
        // Check if the module is already loaded by looking for global indicators
        // We have multiple checks to be certain
        const isModuleLoaded = 
            window.MODULE_VERSION && 
            typeof window.initializeFoodCostModule === 'function' &&
            typeof window.checkFoodCostModuleVersion === 'function';
        
        // Check if script tag for food-cost.js already exists
        const existingScript = document.querySelector('script[src*="food-cost.js"]');
        
        if (isModuleLoaded) {
            console.log('Food Cost Module already fully loaded with version:', window.MODULE_VERSION);
            
            // Call the normal initialization flow
            try {
                // Try to initialize the food cost module
                const moduleVersionInfo = window.checkFoodCostModuleVersion ? 
                    window.checkFoodCostModuleVersion() : 
                    { version: 'unknown', timestamp: Date.now() };
                    
                console.log('Initializing already loaded module:', moduleVersionInfo);
                
                // Initialize the module
                if (typeof window.FoodCostApp !== 'undefined') {
                    console.log('Food Cost App is globally available, initializing directly');
                    
                    // Apply some basic styling to show success
                    container.innerHTML = `
                        <div class="alert alert-success">
                            <h4>Food Cost Module Loaded</h4>
                            <p>Version: ${moduleVersionInfo.version}</p>
                        </div>
                    `;
                    
                    // Resolve with a mock app
                    resolve({ version: moduleVersionInfo.version });
                } else {
                    // The normal case - module needs to be initialized
                    window.initializeFoodCostModule(containerId)
                        .then(app => {
                            console.log('Food Cost Module initialized successfully via direct call');
                            resolve(app);
                        })
                        .catch(error => {
                            console.error('Error initializing Food Cost Module via direct call:', error);
                            reject(error);
                        });
                }
            } catch (error) {
                console.error('Error initializing already loaded Food Cost Module:', error);
                container.innerHTML = `
                    <div class="alert alert-danger">
                        <h4>Error Initializing Module</h4>
                        <p>There was an error initializing the Food Cost Module. Please try refreshing the page.</p>
                        <button onclick="location.reload()" class="btn btn-primary">Refresh Page</button>
                    </div>
                `;
                reject(error);
            }
        } else if (existingScript) {
            console.log('Food Cost Module script tag exists but module not fully initialized yet');
            
            // The script tag exists but the module might not be fully loaded
            // Wait for it to load completely
            let waitAttempts = 0;
            const checkModuleInterval = setInterval(() => {
                waitAttempts++;
                
                if (window.MODULE_VERSION && typeof window.checkFoodCostModuleVersion === 'function') {
                    clearInterval(checkModuleInterval);
                    console.log('Module became available while waiting, version:', window.MODULE_VERSION);
                    
                    // Initialize the module
                    window.initializeFoodCostModule(containerId)
                        .then(app => {
                            console.log('Food Cost Module initialized successfully after waiting');
                            resolve(app);
                        })
                        .catch(error => {
                            console.error('Error initializing Food Cost Module after waiting:', error);
                            reject(error);
                        });
                } else if (waitAttempts >= 20) {
                    clearInterval(checkModuleInterval);
                    console.error('Timed out waiting for Food Cost Module to initialize');
                    
                    // Show error and try to load it again
                    container.innerHTML = `
                        <div class="alert alert-warning">
                            <h4>Module Loading Timeout</h4>
                            <p>Attempting to reload the module...</p>
                        </div>
                    `;
                    
                    // Try loading the script again as a last resort
                    loadFoodCostScript();
                }
            }, 300);
        } else {
            // Need to load the script
            console.log('Food Cost Module not loaded, loading script now');
            loadFoodCostScript();
        }
        
        // Function to load the food-cost.js script
        function loadFoodCostScript() {
            const script = document.createElement('script');
            script.src = 'js/food-cost.js';
            
            script.onload = function() {
                console.log('Food Cost Module script loaded successfully');
                
                // Wait a bit for the module to initialize fully
                setTimeout(() => {
                    if (window.MODULE_VERSION) {
                        console.log('Module initialized after script load, version:', window.MODULE_VERSION);
                        
                        // Initialize the module
                        window.initializeFoodCostModule(containerId)
                            .then(app => {
                                console.log('Food Cost Module initialized successfully after script load');
                                resolve(app);
                            })
                            .catch(error => {
                                console.error('Error initializing Food Cost Module after script load:', error);
                                reject(error);
                            });
                    } else {
                        console.error('Module did not initialize properly after script load');
                        container.innerHTML = `
                            <div class="alert alert-danger">
                                <h4>Module Initialization Failed</h4>
                                <p>The Food Cost Module script loaded but failed to initialize properly.</p>
                                <button onclick="location.reload()" class="btn btn-primary">Refresh Page</button>
                            </div>
                        `;
                        reject(new Error('Module did not initialize properly after script load'));
                    }
                }, 1000);
            };
            
            script.onerror = function(error) {
                console.error('Error loading Food Cost Module script:', error);
                container.innerHTML = `
                    <div class="alert alert-danger">
                        <h4>Error Loading Module</h4>
                        <p>There was an error loading the Food Cost Module. Please try refreshing the page.</p>
                        <button onclick="location.reload()" class="btn btn-primary">Refresh Page</button>
                    </div>
                `;
                reject(error);
            };
            
            // Add the script to the page
            document.head.appendChild(script);
        }
    });
};

// Output to console that the function is available
console.log('Food Cost Module initializer loaded. Global function available:', 
            typeof window.initializeFoodCostModule === 'function' ? 'YES ✓' : 'NO ✗');
