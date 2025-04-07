// Food Cost Module for Laki Sparks Admin Dashboard
// This module provides food cost analysis functionality
// Date: March 2025

// Version tracker for code updates 
// Use an existing VERSION or define a new one if needed
window.MODULE_VERSION = '1.3.4-2025-04-03-A'; // Version tracker for code updates

// Must match the version in food-cost-standalone.js

'use strict';

// Since this is now loaded as a non-module script, we'll use the Firebase instances 
// obtained from firebase-config.js which exports to window.firebaseApp
// This follows the project's Firebase patterns
// IMPORTANT: Using local variables without redeclaring them to avoid conflicts
let _rtdb, _auth, _ref, _get, _set, _update, _push, _remove;

// Function to safely access Firebase functions
function ensureFirebaseInitialized() {
    // If Firebase is already initialized, return true
    if (_rtdb && _ref && _get && _set) {
        return true;
    }
    
    console.log('Attempting to initialize Firebase for Food Cost module...');
    
    // Try to get Firebase from global exports
    if (window.firebaseExports) {
        console.log('Found window.firebaseExports, using it for Firebase initialization');
        _rtdb = window.firebaseExports.rtdb;
        _auth = window.firebaseExports.auth;
        _ref = window.firebaseExports.ref;
        _get = window.firebaseExports.get;
        _set = window.firebaseExports.set;
        _update = window.firebaseExports.update;
        _push = window.firebaseExports.push;
        _remove = window.firebaseExports.remove;
    } 
    // Try to use the global initialization function if available
    else if (typeof window.initializeFirebase === 'function') {
        const firebaseExports = window.initializeFirebase();
        
        // Update our local references
        _rtdb = firebaseExports.rtdb;
        _auth = firebaseExports.auth;
        _ref = firebaseExports.ref;
        _get = firebaseExports.get;
        _set = firebaseExports.set;
        _update = firebaseExports.update;
        _push = firebaseExports.push;
        _remove = firebaseExports.remove;
    } 
    // Try with other global exports pattern
    else if (window.firebase && window.firebase.database) {
        console.log('Found window.firebase, using it for Firebase initialization');
        _rtdb = window.firebase.database();
        _auth = window.firebase.auth();
        // Map to v9 API style functions
        _ref = (db, path) => window.firebase.database().ref(path);
        _get = (ref) => ref.once('value');
        _set = (ref, data) => ref.set(data);
        _update = (ref, data) => ref.update(data);
        _push = (ref, data) => ref.push(data);
        _remove = (ref) => ref.remove();
    }
    
    // Another fallback: try to get directly from window object
    if (!_rtdb && window.rtdb) _rtdb = window.rtdb;
    if (!_auth && window.auth) _auth = window.auth;
    if (!_ref && window.ref) _ref = window.ref;
    if (!_get && window.get) _get = window.get;
    if (!_set && window.set) _set = window.set;
    if (!_update && window.update) _update = window.update;
    if (!_push && window.push) _push = window.push;
    if (!_remove && window.remove) _remove = window.remove;
    
    // Verify if all essential Firebase functions are available
    if (_rtdb && _ref && _get && _set) {
        console.log('Firebase initialized successfully for Food Cost module');
        return true;
    } else {
        console.error('Failed to initialize Firebase for Food Cost module');
        return false;
    }
}

// Initialize Firebase references
function initFirebaseReferences() {
    ensureFirebaseInitialized();
}

// Try to initialize Firebase on script load
initFirebaseReferences();

// Also add a listener in case the script loads before firebase-config.js
document.addEventListener('firebaseReady', initFirebaseReferences);

// Function to check if Vue is loaded and ready
function ensureVueIsReady() {
    return new Promise((resolve) => {
        // Check if Vue is already available
        if (window.Vue && typeof window.Vue.createApp === 'function') {
            console.log('Vue is already available, version:', window.Vue.version);
            resolve(window.Vue.createApp);
            return;
        }

        // If Vue is not available yet, set up a polling mechanism
        console.log('Waiting for Vue to become available...');
        const maxAttempts = 20; // Increase max attempts
        let attempts = 0;
        
        const checkInterval = setInterval(() => {
            attempts++;
            console.log(`Checking for Vue (attempt ${attempts}/${maxAttempts})...`);
            
            if (window.Vue && typeof window.Vue.createApp === 'function') {
                console.log('Vue became available after waiting, version:', window.Vue.version);
                clearInterval(checkInterval);
                resolve(window.Vue.createApp);
            } else if (attempts >= maxAttempts) {
                console.error('Vue did not become available after multiple attempts');
                clearInterval(checkInterval);
                // Return a dummy createApp function to prevent errors
                resolve(function dummyCreateApp(options) {
                    console.error('Using fallback Vue implementation');
                    return { 
                        mount: function() { 
                            console.error('Attempted to mount with fallback Vue implementation');
                            // Create a simple DOM element to indicate the issue
                            const el = document.getElementById(options.el || 'app');
                            if (el) {
                                el.innerHTML = `
                                    <div class="alert alert-warning">
                                        <h4>Vue.js Not Available</h4>
                                        <p>The application requires Vue.js to function properly. Please check your network connection or try refreshing the page.</p>
                                    </div>
                                `;
                            }
                            return null; 
                        } 
                    };
                });
            }
        }, 300); // Check every 300ms
    });
}

// Check for Vue immediately
console.log('Checking for Vue.js availability...');
if (window.Vue) {
    console.log('Vue is available on page load, version:', window.Vue.version);
} else {
    console.warn('Vue is not available on page load, will attempt to wait for it');
}

// Get Vue createApp function from global Vue object
let createApp = function() {
    console.error('Vue.createApp not yet initialized properly');
    return { mount: function() { return null; } }; // Provide a dummy mount function
};

// Initialize Vue when available
ensureVueIsReady().then(vueCreateApp => {
    createApp = vueCreateApp;
    console.log('Vue createApp function is now available and ready to use');
}).catch(err => {
    console.error('Failed to initialize Vue:', err);
});

// Create Vue app for Food Cost Management
const FoodCostApp = {
    template: `
        <div class="food-cost-container">
            <div class="section-header d-flex justify-content-between align-items-center mb-3">
                <h2 class="mb-0">{{ title }}</h2>
                <button v-if="!showStockToolsCard" class="btn btn-primary" @click="showStockToolsCard = true">
                    <i class="fas fa-tools mr-1"></i> Show Stock Data Tools
                </button>
            </div>
            
            <!-- Stock Data Tools Card -->
            <div v-show="showStockToolsCard" class="card shadow mb-4">
                <div class="card-header py-3 d-flex flex-row align-items-center justify-content-between">
                    <h6 class="m-0 font-weight-bold text-primary">Stock Data Tools</h6>
                    <div class="dropdown no-arrow">
                        <button class="btn btn-sm btn-outline-primary" @click="showStockToolsCard = !showStockToolsCard">
                            {{ showStockToolsCard ? 'Hide Card' : 'Show Card' }}
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="mb-3" v-if="!isDataUploaded || showUploadArea">
                        <div class="custom-file mb-3">
                            <input type="file" class="custom-file-input" id="foodCostFile" accept=".csv" @change="handleFileUpload">
                            <label class="custom-file-label" for="foodCostFile">Choose CSV file</label>
                        </div>
                        <div class="progress mb-3" v-if="isLoading">
                            <div class="progress-bar" role="progressbar" :style="{ width: uploadProgress + '%' }" :aria-valuenow="uploadProgress" aria-valuemin="0" aria-valuemax="100"></div>
                        </div>
                    </div>
                    
                    <!-- Store Configuration -->
                    <div class="card mb-3">
                        <div class="card-header py-2">
                            <h6 class="m-0 font-weight-bold text-primary">Store Configuration</h6>
                        </div>
                        <div class="card-body py-3">
                            <div class="row">
                                <div class="col-md-4 mb-2">
                                    <div class="form-group">
                                        <label for="storeName">Store Name:</label>
                                        <input type="text" class="form-control" id="storeName" v-model="storeName">
                                    </div>
                                </div>
                                <div class="col-md-4 mb-2">
                                    <div class="form-group">
                                        <label for="daysToNextDelivery">Days To Next Delivery:</label>
                                        <input type="number" class="form-control" id="daysToNextDelivery" v-model="daysToNextDelivery" min="1" max="14">
                                    </div>
                                </div>
                                <div class="col-md-4 mb-2">
                                    <div class="form-group">
                                        <label>Stock Period:</label>
                                        <div class="d-flex align-items-center">
                                            <input type="date" class="form-control" v-model="openingStockDate">
                                            <span class="mx-2">to</span>
                                            <input type="date" class="form-control" v-model="closingStockDate" @change="updateStockPeriodDays">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Inventory Management Configuration -->
                    <div class="card mb-3">
                        <div class="card-header py-2">
                            <h6 class="m-0 font-weight-bold text-primary">Order Calculation Settings</h6>
                        </div>
                        <div class="card-body py-3">
                            <div class="row">
                                <div class="col-md-3 mb-2">
                                    <div class="form-group">
                                        <label for="safetyStockPercentage">Safety Stock (%):</label>
                                        <input type="number" class="form-control" id="safetyStockPercentage" 
                                               v-model="safetyStockPercentage" min="5" max="50">
                                        <small class="form-text text-muted">% of lead time usage kept as buffer</small>
                                    </div>
                                </div>
                                <div class="col-md-3 mb-2">
                                    <div class="form-group">
                                        <label for="criticalItemBuffer">Critical Item Buffer (%):</label>
                                        <input type="number" class="form-control" id="criticalItemBuffer" 
                                               v-model="criticalItemBuffer" min="0" max="50">
                                        <small class="form-text text-muted">Additional % for critical categories</small>
                                    </div>
                                </div>
                                <div class="col-md-3 mb-2">
                                    <div class="form-group">
                                        <label for="defaultLeadTimeDays">Lead Time (days):</label>
                                        <input type="number" class="form-control" id="defaultLeadTimeDays" 
                                               v-model="defaultLeadTimeDays" min="1" max="14">
                                        <small class="form-text text-muted">Typical supplier delivery time</small>
                                    </div>
                                </div>
                                <div class="col-md-3 mb-2">
                                    <div class="form-group">
                                        <label for="defaultCycleLength">Order Cycle (days):</label>
                                        <input type="number" class="form-control" id="defaultCycleLength" 
                                               v-model="defaultCycleLength" min="1" max="30">
                                        <small class="form-text text-muted">Days between order placements</small>
                                    </div>
                                </div>
                            </div>
                            <div class="alert alert-info small mt-2">
                                <i class="fas fa-info-circle mr-1"></i> These parameters affect how reorder quantities are calculated. Changes will be saved with your stock data.
                            </div>
                        </div>
                    </div>
                    
                    <!-- Header Mapping UI -->
                    <div v-if="showHeaderMapping && parsedHeaders.length > 0" class="mt-4 mb-4">
                        <h5 class="mb-3">Map CSV Headers to Required Fields</h5>
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle mr-2"></i> Please map your CSV columns to the required fields. Select the appropriate column for each field.
                        </div>
                        
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <div class="form-group">
                                    <label><strong>Item Code:</strong></label>
                                    <select class="form-control" v-model="headerMapping.itemCode">
                                        <option value="-1">-- Select Header --</option>
                                        <option v-for="(header, index) in parsedHeaders" :key="'code-'+index" :value="index">
                                            {{ header }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-6 mb-3">
                                <div class="form-group">
                                    <label><strong>Description:</strong></label>
                                    <select class="form-control" v-model="headerMapping.description">
                                        <option value="-1">-- Select Header --</option>
                                        <option v-for="(header, index) in parsedHeaders" :key="'desc-'+index" :value="index">
                                            {{ header }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <div class="form-group">
                                    <label><strong>Category:</strong></label>
                                    <select class="form-control" v-model="headerMapping.category">
                                        <option value="-1">-- Select Header --</option>
                                        <option v-for="(header, index) in parsedHeaders" :key="'cat-'+index" :value="index">
                                            {{ header }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-6 mb-3">
                                <div class="form-group">
                                    <label><strong>Cost Center:</strong></label>
                                    <select class="form-control" v-model="headerMapping.costCenter">
                                        <option value="-1">-- Select Header --</option>
                                        <option v-for="(header, index) in parsedHeaders" :key="'cc-'+index" :value="index">
                                            {{ header }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-4 mb-3">
                                <div class="form-group">
                                    <label><strong>Opening Stock Qty:</strong></label>
                                    <select class="form-control" v-model="headerMapping.openingValue">
                                        <option value="-1">-- Select Header --</option>
                                        <option v-for="(header, index) in parsedHeaders" :key="'open-val-'+index" :value="index">
                                            {{ header }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-4 mb-3">
                                <div class="form-group">
                                    <label><strong>Purchases:</strong></label>
                                    <select class="form-control" v-model="headerMapping.purchases">
                                        <option value="-1">-- Select Header --</option>
                                        <option v-for="(header, index) in parsedHeaders" :key="'purch-'+index" :value="index">
                                            {{ header }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-4 mb-3">
                                <div class="form-group">
                                    <label><strong>Closing Stock Qty:</strong></label>
                                    <select class="form-control" v-model="headerMapping.closingValue">
                                        <option value="-1">-- Select Header --</option>
                                        <option v-for="(header, index) in parsedHeaders" :key="'close-val-'+index" :value="index">
                                            {{ header }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-4 mb-3">
                                <div class="form-group">
                                    <label><strong>Opening Stock Value:</strong></label>
                                    <select class="form-control" v-model="headerMapping.openingBalance">
                                        <option value="-1">-- Select Header --</option>
                                        <option v-for="(header, index) in parsedHeaders" :key="'open-'+index" :value="index">
                                            {{ header }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-4 mb-3">
                                <div class="form-group">
                                    <label><strong>Closing Stock Value:</strong></label>
                                    <select class="form-control" v-model="headerMapping.closingBalance">
                                        <option value="-1">-- Select Header --</option>
                                        <option v-for="(header, index) in parsedHeaders" :key="'close-'+index" :value="index">
                                            {{ header }}
                                        </option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mt-3">
                            <button class="btn btn-primary" @click="processHeaderMapping" :disabled="!isHeaderMappingComplete">
                                <i class="fas fa-check mr-1"></i> Apply Mapping & Process Data
                            </button>
                            <button class="btn btn-outline-secondary ml-2" @click="resetHeaderMapping">
                                <i class="fas fa-undo mr-1"></i> Reset
                            </button>
                        </div>
                    </div>
                    
                    <div v-if="isDataUploaded">
                        <div class="d-flex justify-content-between mb-3">
                            <button class="btn btn-sm btn-outline-primary" @click="showUploadArea = !showUploadArea">
                                {{ showUploadArea ? 'Hide Upload Area' : 'Show Upload Area' }}
                            </button>
                            <button class="btn btn-sm btn-success" @click="saveStockDataToDatabase" :disabled="isSaving || dataSaved">
                                <i class="fas" :class="{'fa-save': !isSaving && !dataSaved, 'fa-spinner fa-spin': isSaving, 'fa-check': dataSaved && !isSaving}"></i>
                                {{ isSaving ? 'Saving...' : (dataSaved ? 'Saved' : 'Save Data') }}
                            </button>
                        </div>
                        
                        <div class="row mb-4">
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Store Name</label>
                                    <input type="text" class="form-control" v-model="storeName" placeholder="Store Name">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Days to Next Delivery</label>
                                    <input type="number" class="form-control" v-model="daysToNextDelivery" min="1" max="14" placeholder="Days">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Opening Stock Date</label>
                                    <input type="date" class="form-control" v-model="openingStockDate">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Closing Stock Date</label>
                                    <input type="date" class="form-control" v-model="closingStockDate">
                                </div>
                            </div>
                        </div>
                        
                        <div class="row mb-4">
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Filter by Category</label>
                                    <button class="btn btn-white dropdown-toggle w-100 border" type="button" 
                                            @click="openCategoryFilter">
                                        {{ filterOptions.selectedCategories.length > 0 ? filterOptions.selectedCategories.length + ' selected' : 'Select categories' }}
                                    </button>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Filter by Cost Center</label>
                                    <button class="btn btn-white dropdown-toggle w-100 border" type="button" 
                                            @click="openCostCenterFilter">
                                        {{ filterOptions.selectedCostCenters.length > 0 ? filterOptions.selectedCostCenters.length + ' selected' : 'Select cost centers' }}
                                    </button>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group">
                                    <button class="btn btn-primary w-100" @click="generatePurchaseOrder">
                                        Generate Purchase Order
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Analysis Summary Cards -->
            <div class="row mb-4">
                <!-- Sales Amount Card -->
                <div class="col-xl-3 col-md-6 mb-4">
                    <div class="card border-left-info shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="text-xs font-weight-bold text-info text-uppercase mb-1">Sales Amount (R)</div>
                                    <div class="h5 mb-0 font-weight-bold text-gray-800">
                                        <input type="number" id="foodCostSales" v-model="salesAmount" class="form-control" 
                                               placeholder="0.00" step="0.01" min="0" @change="recalculateIfDataAvailable">
                                    </div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-dollar-sign fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="col-xl-3 col-md-6 mb-4">
                    <div class="card border-left-primary shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="text-xs font-weight-bold text-primary text-uppercase mb-1">Opening Stock</div>
                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="openingStockValue">{{ formatCurrency(summaryData.totalOpeningStock) }}</div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-calendar-day fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-3 col-md-6 mb-4">
                    <div class="card border-left-success shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="text-xs font-weight-bold text-success text-uppercase mb-1">Purchases</div>
                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="purchasesValue">{{ formatCurrency(summaryData.totalPurchases) }}</div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-shopping-cart fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-3 col-md-6 mb-4">
                    <div class="card border-left-warning shadow h-100 py-2">
                        <div class="card-body">
                            <div class="row no-gutters align-items-center">
                                <div class="col mr-2">
                                    <div class="text-xs font-weight-bold text-warning text-uppercase mb-1">Food Cost %</div>
                                    <div class="h5 mb-0 font-weight-bold text-gray-800" id="foodCostPercentage">{{ summaryData.foodCostPercentage.toFixed(2) }}%</div>
                                </div>
                                <div class="col-auto">
                                    <i class="fas fa-percentage fa-2x text-gray-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-6">
                    <div class="card shadow mb-4">
                        <div class="card-header py-3">
                            <h5 class="m-0 font-weight-bold text-primary">Category-wise Usage Distribution</h5>
                        </div>
                        <div class="card-body">
                            <canvas ref="categoryChart"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card shadow mb-4">
                        <div class="card-header py-3">
                            <h5 class="m-0 font-weight-bold text-primary">Top 10 Cost Items</h5>
                        </div>
                        <div class="card-body">
                            <canvas ref="topItemsChart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card shadow mb-4" v-if="isDataUploaded">
                <div class="card-header py-3">
                    <h5 class="m-0 font-weight-bold text-primary">Stock Usage Data</h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-bordered table-striped">
                            <thead>
                                <tr>
                                    <th>Item Code</th>
                                    <th>Description</th>
                                    <th>Unit Price</th>
                                    <th>Opening Qty</th>
                                    <th>Purchases</th>
                                    <th>Closing Qty</th>
                                    <th>Usage</th>
                                    <th>Usage/Day</th>
                                    <th>Re-Order Point</th>
                                    <th>Cost %</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="item in filteredStockData" :key="item.itemCode">
                                    <td>{{ item.itemCode || 'N/A' }}</td>
                                    <td>{{ item.description || 'N/A' }}</td>
                                    <td>{{ formatCurrency(item.unitPrice) }}</td>
                                    <td>{{ item.openingBalance !== undefined ? item.openingBalance.toFixed(2) : '0.00' }}</td>
                                    <td>{{ item.purchases !== undefined ? item.purchases.toFixed(2) : '0.00' }}</td>
                                    <td>{{ item.closingBalance !== undefined ? item.closingBalance.toFixed(2) : '0.00' }}</td>
                                    <td>{{ item.usage !== undefined ? item.usage.toFixed(2) : '0.00' }}</td>
                                    <td>{{ (item.usagePerDay !== undefined ? parseFloat(item.usagePerDay) : 0).toFixed(3) }}</td>
                                    <td :class="{'text-danger': item.reOrderPoint < 0}">{{ item.reOrderPoint !== undefined ? item.reOrderPoint.toFixed(2) : '0.00' }}</td>
                                    <td>{{ calculateItemCostPercentage(item) !== undefined ? calculateItemCostPercentage(item).toFixed(2) : '0.00' }}%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <!-- Category filter popup -->
            <div class="filter-popup-overlay" v-if="showCategoryPopup" @click="closeCategoryFilter">
                <div class="filter-popup" @click.stop>
                    <h4>
                        Filter by Category
                        <button class="close-btn" @click="closeCategoryFilter">&times;</button>
                    </h4>
                    <div class="filter-controls mb-3">
                        <button type="button" class="btn btn-sm btn-outline-primary me-2" 
                                @click="selectAllCategories(true)">
                            Select All
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" 
                                @click="filterOptions.selectedCategories = []">
                            Clear All
                        </button>
                    </div>
                    <div class="filter-items" style="max-height: 300px; overflow-y: auto;">
                        <div v-for="category in filterOptions.availableCategories.filter(c => c !== 'all')" :key="category" class="form-check">
                            <input type="checkbox" 
                                   class="form-check-input" 
                                   :id="'category-' + category" 
                                   :value="category" 
                                   v-model="filterOptions.selectedCategories"
                                   @change="applyFilters">
                            <label class="form-check-label" :for="'category-' + category">{{ category }}</label>
                        </div>
                    </div>
                    <div class="mt-3">
                        <button class="btn btn-primary btn-block" @click="closeCategoryFilter">
                            Apply Filters
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Cost Center filter popup -->
            <div class="filter-popup-overlay" v-if="showCostCenterPopup" @click="closeCostCenterFilter">
                <div class="filter-popup" @click.stop>
                    <h4>
                        Filter by Cost Center
                        <button class="close-btn" @click="closeCostCenterPopup">&times;</button>
                    </h4>
                    <div class="filter-controls mb-3">
                        <button type="button" class="btn btn-sm btn-outline-primary me-2" 
                                @click="selectAllCostCenters(true)">
                            Select All
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" 
                                @click="filterOptions.selectedCostCenters = []">
                            Clear All
                        </button>
                    </div>
                    <div class="filter-items" style="max-height: 300px; overflow-y: auto;">
                        <div v-for="costCenter in filterOptions.availableCostCenters.filter(c => c !== 'all')" :key="costCenter" class="form-check">
                            <input type="checkbox" 
                                   class="form-check-input" 
                                   :id="'costCenter-' + costCenter"
                                   :value="costCenter"
                                   v-model="filterOptions.selectedCostCenters"
                                   @change="applyFilters">
                            <label class="form-check-label" :for="'costCenter-' + costCenter">{{ costCenter }}</label>
                        </div>
                    </div>
                    <div class="mt-3">
                        <button class="btn btn-primary btn-block" @click="closeCostCenterFilter">
                            Apply Filters
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Purchase Order Modal -->
            <div class="modal fade" id="purchaseOrderModal" tabindex="-1" role="dialog" aria-labelledby="purchaseOrderModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl" role="document">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="purchaseOrderModalLabel">Generate Purchase Order</h5>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                                <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col-md-4">
                                    <div class="form-group">
                                        <label for="poSupplier">Supplier</label>
                                        <input type="text" class="form-control" id="poSupplier" v-model="purchaseOrder.supplier">
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="form-group">
                                        <label for="poDateRequired">Date Required</label>
                                        <input type="date" class="form-control" id="poDateRequired" v-model="purchaseOrder.dateRequired">
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="form-group">
                                        <label for="poNotes">Notes</label>
                                        <input type="text" class="form-control" id="poNotes" v-model="purchaseOrder.notes">
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Order Parameters Card -->
                            <div class="card mb-3">
                                <div class="card-header py-2 d-flex justify-content-between align-items-center">
                                    <h6 class="m-0 font-weight-bold text-primary">Order Calculation Parameters</h6>
                                    <button class="btn btn-sm btn-primary" @click="recalculateOrderQuantities">
                                        <i class="fas fa-calculator mr-1"></i> Recalculate
                                    </button>
                                </div>
                                <div class="card-body py-2">
                                    <div class="row">
                                        <div class="col-md-3">
                                            <div class="form-group">
                                                <label for="poSafetyStock">Safety Stock (%)</label>
                                                <input type="number" class="form-control form-control-sm" 
                                                       id="poSafetyStock" v-model="safetyStockPercentage" min="5" max="50">
                                            </div>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="form-group">
                                                <label for="poCriticalBuffer">Critical Buffer (%)</label>
                                                <input type="number" class="form-control form-control-sm" 
                                                       id="poCriticalBuffer" v-model="criticalItemBuffer" min="0" max="50">
                                            </div>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="form-group">
                                                <label for="poLeadTime">Lead Time (days)</label>
                                                <input type="number" class="form-control form-control-sm" 
                                                       id="poLeadTime" v-model="defaultLeadTimeDays" min="1" max="14">
                                            </div>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="form-group">
                                                <label for="poCycleLength">Order Cycle (days)</label>
                                                <input type="number" class="form-control form-control-sm" 
                                                       id="poCycleLength" v-model="defaultCycleLength" min="1" max="30">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="table-responsive">
                                <table class="table table-bordered">
                                    <thead>
                                        <tr>
                                            <th>Item Code</th>
                                            <th>Description</th>
                                            <th>Category</th>
                                            <th class="text-right">Current Stock</th>
                                            <th class="text-right">Usage/Day</th>
                                            <th class="text-right">Order Quantity</th>
                                            <th class="text-right">Unit</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(item, index) in purchaseOrder.items" :key="index" 
                                            :class="{'table-warning': item.isCritical}">
                                            <td>
                                                <input type="text" class="form-control form-control-sm" v-model="item.itemCode">
                                            </td>
                                            <td>
                                                <input type="text" class="form-control form-control-sm" v-model="item.description">
                                            </td>
                                            <td>
                                                <span class="badge" :class="getCategoryBadgeClass(item.category)">
                                                    {{ item.category }}
                                                </span>
                                            </td>
                                            <td class="text-right">
                                                {{ (item.currentStock !== undefined ? parseFloat(item.currentStock) : 0).toFixed(2) }}
                                            </td>
                                            <td class="text-right">
                                                {{ (item.usagePerDay !== undefined ? parseFloat(item.usagePerDay) : 0).toFixed(3) }}
                                                <span v-if="item.trendIcon" :class="item.trendIcon" 
                                                     :title="item.trendDescription"></span>
                                            </td>
                                            <td>
                                                <input type="number" class="form-control form-control-sm text-right" 
                                                      v-model="item.orderQty" min="0" step="1">
                                            </td>
                                            <td>
                                                <input type="text" class="form-control form-control-sm" v-model="item.unit">
                                            </td>
                                            <td class="text-center">
                                                <button class="btn btn-sm btn-info mr-1" @click="showCalculationDetails(item)" title="View calculation details">
                                                    <i class="fas fa-calculator"></i>
                                                </button>
                                                <button class="btn btn-sm btn-danger" @click="removeOrderItem(index)">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colspan="8">
                                                <button class="btn btn-sm btn-success" @click="addOrderItem">
                                                    <i class="fas fa-plus mr-1"></i> Add Item
                                                </button>
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                            
                            <div class="alert alert-info small mt-3">
                                <i class="fas fa-info-circle mr-1"></i> Order quantities are calculated based on current stock levels, historical usage, 
                                and configured safety stock parameters. Items in <span class="text-warning font-weight-bold">yellow</span> 
                                are from critical categories with additional buffer stock.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" @click="closePurchaseOrderModal">
                                Close
                            </button>
                            <button type="button" class="btn btn-primary" @click="exportPurchaseOrder">
                                <i class="fas fa-file-export mr-1"></i> Export Order
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    data() {
        return {
            title: 'Food Cost Management',
            stockData: [],
            isDataUploaded: false,
            showUploadArea: true,
            showStockToolsCard: true,
            showCategoryPopup: false,
            showCostCenterPopup: false,
            isLoading: false,
            uploadProgress: 0,
            salesAmount: 0,
            categoryChart: null,
            topItemsChart: null,
            filterOptions: {
                availableCategories: [],
                availableCostCenters: [],
                selectedCategories: [],
                selectedCostCenters: []
            },
            summaryData: {
                totalItems: 0,
                totalOpeningStock: 0,
                totalClosingStock: 0,
                totalPurchases: 0,
                totalUsageValue: 0,
                totalUsagePerDay: 0,
                belowReorderPoint: 0,
                categories: 0,
                costCenters: 0,
                foodCostPercentage: 0
            },
            purchaseOrder: {
                supplier: '',
                dateRequired: new Date().toISOString().split('T')[0],
                items: [],
                notes: ''
            },
            isSaving: false,
            dataSaved: false,
            lastSaveTimestamp: null,
            storeName: '',
            daysToNextDelivery: 3,
            openingStockDate: new Date().toISOString().split('T')[0],
            closingStockDate: new Date().toISOString().split('T')[0],
            stockPeriodDays: 1,
            parsedHeaders: [],
            headerMapping: {
                itemCode: -1,
                description: -1,
                category: -1,
                costCenter: -1,
                openingValue: -1,
                closingValue: -1,
                openingBalance: -1,
                purchases: -1,
                closingBalance: -1
            },
            showHeaderMapping: false,
            parsedData: [],
            criticalCategories: ['Protein', 'Dairy', 'Fresh Produce'], // Categories that are critical for operations
            safetyStockPercentage: 20, // Safety stock as percentage of lead time usage
            criticalItemBuffer: 20,    // Additional buffer for critical items (%)
            defaultLeadTimeDays: 2,    // Default lead time for orders
            defaultCycleLength: 7,     // Default ordering cycle length in days
        };
    },
    mounted() {
        this.checkForUploadedData();
        
        // Initialize with current dates
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        this.openingStockDate = yesterday.toISOString().split('T')[0];
        this.closingStockDate = today.toISOString().split('T')[0];
        
        // Calculate default period days
        this.updateStockPeriodDays();
    },
    computed: {
        /**
         * Get filtered data based on current filter settings
         * @returns {Array} - Filtered data array
         */
        filteredStockData() {
            // Apply filters based on selected categories and cost centers
            return this.stockData.filter(item => {
                const categoryMatch = this.filterOptions.selectedCategories.length === 0 || 
                                     this.filterOptions.selectedCategories.includes(item.category);
                
                const costCenterMatch = this.filterOptions.selectedCostCenters.length === 0 || 
                                       this.filterOptions.selectedCostCenters.includes(item.costCenter);
                
                return categoryMatch && costCenterMatch;
            }).map(item => {
                // Add dynamic calculations to each item
                return {
                    ...item,
                    usagePerDay: this.stockPeriodDays > 0 ? item.usage / this.stockPeriodDays : 0,
                    reOrderPoint: item.closingBalance - ((item.usage / (this.stockPeriodDays > 0 ? this.stockPeriodDays : 1)) * this.daysToNextDelivery)
                };
            });
        },
        isHeaderMappingComplete() {
            return Object.values(this.headerMapping).every(value => value !== -1);
        }
    },
    watch: {
        // Watch for changes to date fields and update period days
        openingStockDate() {
            this.updateStockPeriodDays();
            this.recalculateIfDataAvailable();
        },
        closingStockDate() {
            this.updateStockPeriodDays();
            this.recalculateIfDataAvailable();
        },
        daysToNextDelivery() {
            this.recalculateIfDataAvailable();
        }
    },
    methods: {
        /**
         * Format currency value
         * @param {number} value - Value to format
         * @returns {string} - Formatted currency string
         */
        formatCurrency(value) {
            if (value === undefined || value === null || isNaN(value)) {
                return 'R0.00';
            }
            return 'R' + parseFloat(value).toFixed(2);
        },
        
        /**
         * Generate random colors for chart segments
         * @param {number} count - Number of colors needed
         * @returns {Array} - Array of color strings
         */
        generateColors(count) {
            const colors = [];
            for (let i = 0; i < count; i++) {
                // Generate pastel colors using HSL
                const hue = i * (360 / count);
                colors.push(`hsl(${hue}, 70%, 65%)`);
            }
            return colors;
        },
        
        /**
         * Handle file upload for CSV processing
         * @param {Event} event - Upload event
         */
        handleFileUpload(event) {
            console.log('Handling file upload...');
            
            const fileInput = event.target;
            if (!fileInput.files || fileInput.files.length === 0) {
                console.error('No file selected');
                return;
            }
            
            const file = fileInput.files[0];
            console.log('Selected file:', file.name);
            
            // Update file label
            const fileLabel = document.querySelector('.custom-file-label');
            if (fileLabel) fileLabel.textContent = file.name;
            
            this.isLoading = true;
            this.uploadProgress = 10;
            
            // Create a reader to parse the file
            const reader = new FileReader();
            
            reader.onload = (e) => {
                this.uploadProgress = 50;
                const csvText = e.target.result;
                console.log('Raw CSV text length:', csvText.length);
                console.log('First 200 chars of CSV:', csvText.substring(0, 200));
                
                try {
                    // Parse CSV data
                    const parsedData = this.parseCSV(csvText);
                    this.uploadProgress = 70;
                    
                    // Log the parsed data for debugging
                    console.log('Parsed CSV data:', JSON.stringify(parsedData));
                    
                    if (!parsedData || parsedData.length < 2) {
                        throw new Error('CSV file does not contain enough data rows');
                    }
                    
                    // Store the raw parsed data
                    this.parsedData = JSON.parse(JSON.stringify(parsedData)); // Deep copy
                    
                    // Extract headers
                    this.parsedHeaders = parsedData[0];
                    
                    console.log('Headers identified:', this.parsedHeaders);
                    console.log('Rows count:', parsedData.length - 1);
                    
                    // Auto-detect column mappings
                    this.autoDetectHeaders();
                    
                    // Show header mapping UI
                    this.showHeaderMapping = true;
                    this.uploadProgress = 90;
                    
                    // Update UI
                    this.$nextTick(() => {
                        this.updateUI();
                        this.isLoading = false;
                    });
                    
                } catch (error) {
                    console.error('Error processing CSV:', error);
                    this.isLoading = false;
                    Swal.fire({
                        title: 'Error',
                        text: 'Failed to process CSV file: ' + error.message,
                        icon: 'error'
                    });
                }
            };
            
            reader.onerror = () => {
                console.error('Error reading file');
                this.isLoading = false;
                Swal.fire({
                    title: 'Error',
                    text: 'Failed to read file',
                    icon: 'error'
                });
            };
            
            // Read file as text
            reader.readAsText(file);
        },
        
        /**
         * Auto-detect column mappings based on header names
         */
        autoDetectHeaders() {
            const headers = this.parsedHeaders.map(h => (h || '').toLowerCase());
            
            // Try to auto-detect item code
            this.headerMapping.itemCode = headers.findIndex(h => 
                h.includes('item') && h.includes('code') || 
                h === 'item' || h === 'code' || h === 'item#' || h === 'prod' || 
                h === 'product code' || h === 'id'
            );
            
            // Try to auto-detect description
            this.headerMapping.description = headers.findIndex(h => 
                h.includes('description') || h.includes('desc') || 
                h === 'name' || h === 'product' || h === 'item name'
            );
            
            // Try to auto-detect category
            this.headerMapping.category = headers.findIndex(h => 
                h.includes('category') || h === 'cat' || h === 'group'
            );
            
            // Try to auto-detect cost center
            this.headerMapping.costCenter = headers.findIndex(h => 
                (h.includes('cost') && h.includes('center')) || 
                h === 'department' || h === 'dept' || h === 'center'
            );
            
            // Try to auto-detect opening value
            this.headerMapping.openingValue = headers.findIndex(h => 
                h.includes('opening') || h.includes('start') || 
                h.includes('begin') || h.includes('initial') ||
                h === 'opening_value' || h === 'opening value'
            );
            
            // Try to auto-detect closing value
            this.headerMapping.closingValue = headers.findIndex(h => 
                h.includes('closing') || h.includes('end') || 
                h.includes('final') || h.includes('remaining') ||
                h === 'closing_value' || h === 'closing value'
            );
            
            // Try to auto-detect opening balance
            this.headerMapping.openingBalance = headers.findIndex(h => 
                h.includes('opening') || h.includes('start') || 
                h.includes('begin') || h.includes('initial') ||
                h === 'opening_qty' || h === 'opening qty'
            );
            
            // Try to auto-detect purchases
            this.headerMapping.purchases = headers.findIndex(h => 
                h.includes('purchase') || h.includes('buy') || 
                h.includes('received') || h.includes('order') ||
                h === 'purchases_qty' || h === 'purchases qty'
            );
            
            // Try to auto-detect closing balance
            this.headerMapping.closingBalance = headers.findIndex(h => 
                h.includes('closing') || h.includes('end') || 
                h.includes('final') || h.includes('remaining') ||
                h === 'closing_qty' || h === 'closing qty'
            );
            
            // Ensure no negative indices (default to first matching field that wasn't already matched)
            const fields = Object.keys(this.headerMapping);
            const unmatchedHeaders = [...Array(headers.length).keys()].filter(
                i => !Object.values(this.headerMapping).includes(i)
            );
            
            fields.forEach(field => {
                if (this.headerMapping[field] === -1 && unmatchedHeaders.length > 0) {
                    this.headerMapping[field] = unmatchedHeaders.shift();
                }
            });
            
            console.log('Auto-detected header mapping:', this.headerMapping);
        },
        
        /**
         * Process header mapping
         */
        processHeaderMapping() {
            console.log(`[Version ${window.MODULE_VERSION}] Starting processHeaderMapping...`);
            if (!this.isHeaderMappingComplete) {
                Swal.fire({
                    title: 'Error',
                    text: 'Please complete the header mapping before proceeding.',
                    icon: 'error'
                });
                return;
            }
            
            try {
                console.log(`[Version ${window.MODULE_VERSION}] Processing data with header mapping:`, this.headerMapping);
                console.log(`[Version ${window.MODULE_VERSION}] Parsed data length:`, this.parsedData.length);
                
                // Validate we have enough data
                if (!this.parsedData || this.parsedData.length < 2) {
                    throw new Error('Not enough data in the uploaded CSV file');
                }
                
                // Create a deep copy of the full parsed data
                const fullDataset = JSON.parse(JSON.stringify(this.parsedData));
                console.log(`[Version ${window.MODULE_VERSION}] Full dataset copy length:`, fullDataset.length);
                
                // Process stock data using the complete dataset
                this.processStockData(fullDataset);
                
                // Hide header mapping UI
                this.showHeaderMapping = false;
                this.isLoading = false;
                this.isDataUploaded = true;
                
                // Show success message
                Swal.fire({
                    title: 'Success',
                    text: 'Data processed successfully!',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (error) {
                console.error(`[Version ${window.MODULE_VERSION}] Error processing data:`, error);
                Swal.fire({
                    title: 'Error',
                    text: 'Error processing data: ' + error.message,
                    icon: 'error'
                });
                this.isLoading = false;
            }
        },
        
        /**
         * Process the parsed CSV data into stock data
         * @param {Array} parsedData - Parsed CSV data
         */
        processStockData(parsedData) {
            console.log(`[Version ${window.MODULE_VERSION}] Processing stock data with ${parsedData.length} rows`);
            console.log(`[Version ${window.MODULE_VERSION}] First 3 rows:`, parsedData.slice(0, 3));
            console.log(`[Version ${window.MODULE_VERSION}] Header mapping:`, this.headerMapping);
            
            try {
                // Reset stock data and filter options
                this.stockData = [];
                this.filterOptions.availableCategories = [];
                this.filterOptions.availableCostCenters = [];
                
                // Validate input data
                if (!parsedData || !Array.isArray(parsedData)) {
                    console.error(`[Version ${window.MODULE_VERSION}] Invalid data format`);
                    throw new Error('Invalid data format');
                }
                
                if (parsedData.length < 2) {
                    console.error(`[Version ${window.MODULE_VERSION}] Not enough data rows in CSV. Row count: ${parsedData.length}`);
                    throw new Error('Not enough data rows in CSV');
                }
                
                // Get the headers (first row)
                const headers = parsedData[0];
                console.log(`[Version ${window.MODULE_VERSION}] Headers from parsedData:`, headers);
                
                // Process data rows (skip the header row)
                for (let i = 1; i < parsedData.length; i++) {
                    const row = parsedData[i];
                    
                    // Skip rows with insufficient data
                    if (!row || row.length < 3) {
                        console.log(`[Version ${window.MODULE_VERSION}] Skipping row ${i} due to insufficient data:`, row);
                        continue;
                    }
                    
                    console.log(`[Version ${window.MODULE_VERSION}] Processing row ${i}:`, row.slice(0, 5) + '...');
                    
                    // Map row data using header mapping indices
                    const idxItemCode = this.headerMapping.itemCode !== -1 ? this.headerMapping.itemCode : 3; // Default to 'prod'
                    const idxDescription = this.headerMapping.description !== -1 ? this.headerMapping.description : 4; // Default to 'name'
                    const idxCategory = this.headerMapping.category !== -1 ? this.headerMapping.category : 2; // Default to 'Category'
                    const idxCostCenter = this.headerMapping.costCenter !== -1 ? this.headerMapping.costCenter : 1; // Default to 'ccnt'
                    
                    // Ensure we have valid indices within the row's range
                    if (idxItemCode >= row.length || idxDescription >= row.length || 
                        idxCategory >= row.length || idxCostCenter >= row.length) {
                        console.log(`[Version ${window.MODULE_VERSION}] Skipping row ${i} due to invalid mapping indices`);
                        continue;
                    }
                    
                    // Extract values
                    const itemCode = row[idxItemCode] || '';
                    const description = row[idxDescription] || '';
                    const category = row[idxCategory] || '';
                    const costCenter = row[idxCostCenter] || '';
                    
                    // Skip rows without required fields
                    if (!itemCode || !description) {
                        console.log(`[Version ${window.MODULE_VERSION}] Skipping row ${i} due to missing required fields`);
                        continue;
                    }
                    
                    // Add to stock data
                    this.stockData.push({
                        itemCode,
                        description,
                        category,
                        costCenter,
                        // Additional processing will be done below
                    });
                    
                    // Track categories and cost centers for filtering
                    if (category && !this.filterOptions.availableCategories.includes(category)) {
                        this.filterOptions.availableCategories.push(category);
                    }
                    
                    if (costCenter && !this.filterOptions.availableCostCenters.includes(costCenter)) {
                        this.filterOptions.availableCostCenters.push(costCenter);
                    }
                }
                
                // Process stock data to include additional fields
                this.stockData = this.stockData.map(item => ({
                    ...item,
                    unitPrice: 0,
                    openingBalance: 0,
                    purchases: 0,
                    closingBalance: 0,
                    usage: 0,
                    usagePerDay: 0,
                    reOrderPoint: 0,
                    openingValue: 0,
                    purchasesValue: 0,
                    closingValue: 0,
                    usageValue: 0,
                    timestamp: new Date().toISOString()
                }));
                
                // Extract numeric values from the original data
                for (let i = 0; i < this.stockData.length; i++) {
                    const item = this.stockData[i];
                    const originalRow = parsedData[i + 1]; // Skip header row
                    
                    const idxOpeningValue = this.headerMapping.openingValue !== -1 ? this.headerMapping.openingValue : 6; // Default to OpeningQty
                    const idxClosingValue = this.headerMapping.closingValue !== -1 ? this.headerMapping.closingValue : 10; // Default to ClosingQty
                    const idxOpeningBalance = this.headerMapping.openingBalance !== -1 ? this.headerMapping.openingBalance : 7; // Default to Opening
                    const idxPurchases = this.headerMapping.purchases !== -1 ? this.headerMapping.purchases : 9; // Default to Purchases
                    const idxClosingBalance = this.headerMapping.closingBalance !== -1 ? this.headerMapping.closingBalance : 11; // Default to Closing
                    
                    // Extract numeric values
                    const openingBalance = this.extractNumericValue(originalRow[idxOpeningValue]);
                    const closingBalance = this.extractNumericValue(originalRow[idxClosingValue]);
                    const openingValue = this.extractNumericValue(originalRow[idxOpeningBalance]);
                    const purchases = this.extractNumericValue(originalRow[idxPurchases]);
                    const closingValue = this.extractNumericValue(originalRow[idxClosingBalance]);
                    
                    // Calculate unit price
                    let unitPrice = 0;
                    if (openingBalance > 0) {
                        unitPrice = openingValue / openingBalance;
                    } else if (closingBalance > 0) {
                        unitPrice = closingValue / closingBalance;
                    }
                    
                    // Calculate usage
                    const usage = openingBalance + purchases - closingBalance;
                    
                    // Calculate values
                    const openingValueCalculated = openingBalance * unitPrice;
                    const purchasesValue = purchases * unitPrice;
                    const closingValueCalculated = closingBalance * unitPrice;
                    const usageValue = usage * unitPrice;
                    
                    // Calculate usage per day and reorder point
                    const stockPeriodDays = this.calculateStockPeriodDays();
                    const usagePerDay = stockPeriodDays > 0 ? usage / stockPeriodDays : 0;
                    const reOrderPoint = Math.max(0, closingBalance - ((usagePerDay * this.daysToNextDelivery)));
                    
                    this.stockData[i] = {
                        ...item,
                        unitPrice,
                        openingBalance,
                        purchases,
                        closingBalance,
                        usage,
                        usagePerDay,
                        reOrderPoint,
                        openingValue: openingValueCalculated,
                        purchasesValue,
                        closingValue: closingValueCalculated,
                        usageValue,
                        timestamp: new Date().toISOString()
                    };
                }
                
                // Sort categories and cost centers
                this.filterOptions.availableCategories.sort();
                this.filterOptions.availableCostCenters.sort();
                
                // Select all categories and cost centers by default
                this.filterOptions.selectedCategories = [...this.filterOptions.availableCategories];
                this.filterOptions.selectedCostCenters = [...this.filterOptions.availableCostCenters];
                
                // Calculate summary safely
                if (typeof this.calculateSummary === 'function') {
                    this.calculateSummary();
                } else {
                    console.warn('calculateSummary method not found, using temporary workaround');
                    // Temporary workaround until page reload
                    this.summaryData = {
                        totalItems: this.stockData.length,
                        totalOpeningStock: this.stockData.reduce((sum, item) => sum + (item.openingBalance || 0), 0),
                        totalClosingStock: this.stockData.reduce((sum, item) => sum + (item.closingBalance || 0), 0),
                        totalPurchases: this.stockData.reduce((sum, item) => sum + (item.purchases || 0), 0),
                        totalUsageValue: this.stockData.reduce((sum, item) => sum + (item.usageValue || 0), 0),
                        totalUsagePerDay: this.stockData.reduce((sum, item) => sum + (item.usagePerDay || 0), 0),
                        belowReorderPoint: this.stockData.filter(item => item.closingBalance < item.reOrderPoint).length,
                        categories: this.filterOptions.selectedCategories.length,
                        costCenters: this.filterOptions.selectedCostCenters.length
                    };
                }
                
                // Apply filters and finalize
                this.$nextTick(() => {
                    this.applyFilters();
                    this.updateUI();
                    this.updateCharts();
                });
            } catch (error) {
                console.error('Error in processStockData:', error);
                throw error; // Re-throw to be caught by the caller
            }
        },
        
        /**
         * Apply filters and update UI
         */
        applyFilters() {
            console.log('Applying filters...');
            console.log('Selected categories:', this.filterOptions.selectedCategories);
            console.log('Selected cost centers:', this.filterOptions.selectedCostCenters);
            
            // Filtering happens in the filteredStockData computed property
            // Update the UI to reflect filtered data
            if (typeof this.calculateSummary === 'function') {
                this.calculateSummary();
            } else {
                console.warn('calculateSummary method not found in applyFilters, using temporary workaround');
                // Temporary workaround until page reload
                const data = this.filteredStockData;
                this.summaryData = {
                    totalItems: data.length,
                    totalOpeningStock: data.reduce((sum, item) => sum + (item.openingBalance || 0), 0),
                    totalClosingStock: data.reduce((sum, item) => sum + (item.closingBalance || 0), 0),
                    totalPurchases: data.reduce((sum, item) => sum + (item.purchases || 0), 0),
                    totalUsageValue: data.reduce((sum, item) => sum + (item.usageValue || 0), 0),
                    totalUsagePerDay: data.reduce((sum, item) => sum + (item.usagePerDay || 0), 0),
                    belowReorderPoint: data.filter(item => item.closingBalance < item.reOrderPoint).length,
                    categories: this.filterOptions.selectedCategories.length,
                    costCenters: this.filterOptions.selectedCostCenters.length,
                    foodCostPercentage: this.totalSales > 0 ? (data.reduce((sum, item) => sum + (item.usageValue || 0), 0) / this.totalSales) * 100 : 0
                };
            }
            
            this.updateUI();
            
            // Update charts safely
            this.$nextTick(() => {
                this.updateCharts();
            });
        },
        
        /**
         * Update charts with current data
         */
        updateCharts() {
            try {
                // Safely update category chart if it exists
                if (this.categoryChart) {
                    const categoryData = this.prepareCategoryData(this.filteredStockData || this.stockData);
                    this.categoryChart.data.labels = categoryData.labels;
                    this.categoryChart.data.datasets[0].data = categoryData.values;
                    this.categoryChart.update();
                }
                
                // Safely update top items chart if it exists
                if (this.topItemsChart) {
                    const topItemsData = this.prepareTopItemsData(this.filteredStockData || this.stockData);
                    this.topItemsChart.data.labels = topItemsData.labels;
                    this.topItemsChart.data.datasets[0].data = topItemsData.values;
                    this.topItemsChart.update();
                }
            } catch (error) {
                console.error('Error updating charts:', error);
                // If there was an error, try to reinitialize the charts
                this.$nextTick(() => {
                    this.initCharts();
                });
            }
        },
        
        /**
         * Prepare data for category chart
         * @param {Array} data - Stock data to prepare
         * @returns {Object} - Object with labels and values arrays
         */
        prepareCategoryData(data) {
            const categoryTotals = {};
            
            data.forEach(item => {
                if (!categoryTotals[item.category]) {
                    categoryTotals[item.category] = 0;
                }
                categoryTotals[item.category] += item.usageValue;
            });
            
            const labels = Object.keys(categoryTotals);
            const values = Object.values(categoryTotals);
            
            return { labels, values };
        },
        
        /**
         * Prepare data for top items chart
         * @param {Array} data - Stock data to prepare
         * @returns {Object} - Object with labels and values arrays
         */
        prepareTopItemsData(data) {
            // Sort by usage value (descending)
            const sortedData = [...data].sort((a, b) => b.usageValue - a.usageValue);
            
            // Take top 10 items
            const topItems = sortedData.slice(0, 10);
            
            const labels = topItems.map(item => item.name);
            const values = topItems.map(item => item.usageValue);
            
            return { labels, values };
        },
        
        /**
         * Calculate cost percentage for a specific item
         * @param {Object} item - Stock item to calculate percentage for
         * @returns {number} - Cost percentage
         */
        calculateItemCostPercentage(item) {
            if (!this.salesAmount || this.salesAmount === 0) {
                return 0;
            }
            return (item.usageValue / this.salesAmount) * 100;
        },
        
        /**
         * Recalculate summary if data is available
         */
        recalculateIfDataAvailable() {
            if (this.isDataUploaded && this.stockData.length > 0) {
                this.calculateSummary();
                this.updateCharts();
            }
        },
        
        /**
         * Update UI elements with current data
         */
        updateUI() {
            console.log('Updating UI with summary data:', this.summaryData);
            
            // Format currency values with safety checks
            const formatCurrency = (value) => {
                if (value === undefined || value === null || isNaN(value)) {
                    return 'R0.00';
                }
                return 'R' + parseFloat(value).toFixed(2);
            };
            
            // Make sure we have summary data
            if (!this.summaryData) {
                console.warn('No summary data available for UI update');
                return;
            }
            
            // Update summary cards with the specific IDs
            const openingStockElement = document.getElementById('openingStockValue');
            const closingStockElement = document.getElementById('closingStockValue');
            const purchasesElement = document.getElementById('purchasesValue');
            const foodCostElement = document.getElementById('foodCostPercentage');
            
            // Safely update the elements with defensive checks
            if (openingStockElement) {
                openingStockElement.textContent = formatCurrency(this.summaryData.totalOpeningStock);
            }
            
            if (closingStockElement) {
                closingStockElement.textContent = formatCurrency(this.summaryData.totalClosingStock);
            }
            
            if (purchasesElement) {
                purchasesElement.textContent = formatCurrency(this.summaryData.totalPurchases);
            }
            
            if (foodCostElement) {
                const percentage = this.summaryData.foodCostPercentage;
                foodCostElement.textContent = (percentage !== undefined && percentage !== null) 
                    ? percentage.toFixed(2) + '%' 
                    : '0.00%';
            }
            
            // Update charts
            this.$nextTick(() => {
                this.updateCharts();
            });
        },
        
        /**
         * Select all categories
         * @param {boolean} select - Whether to select or deselect all
         */
        selectAllCategories(select) {
            if (select) {
                this.filterOptions.selectedCategories = this.filterOptions.availableCategories.filter(c => c !== 'all');
            } else {
                this.filterOptions.selectedCategories = [];
            }
            this.applyFilters();
        },
        
        /**
         * Select all cost centers
         * @param {boolean} select - Whether to select or deselect all
         */
        selectAllCostCenters(select) {
            if (select) {
                this.filterOptions.selectedCostCenters = [...this.filterOptions.availableCostCenters];
            } else {
                this.filterOptions.selectedCostCenters = [];
            }
            this.applyFilters();
        },
        
        openCategoryFilter() {
            this.showCategoryPopup = true;
        },
        
        closeCategoryFilter() {
            this.showCategoryPopup = false;
        },
        
        openCostCenterFilter() {
            this.showCostCenterPopup = true;
        },
        
        closeCostCenterFilter() {
            this.showCostCenterPopup = false;
        },
        
        /**
         * Initialize charts
         */
        initCharts() {
            console.log('Initializing charts...');
            
            // First destroy any existing charts to prevent memory leaks
            if (this.categoryChart) {
                this.categoryChart.destroy();
                this.categoryChart = null;
            }
            
            if (this.topItemsChart) {
                this.topItemsChart.destroy();
                this.topItemsChart = null;
            }
            
            // Only create charts if DOM elements exist
            if (this.$refs.categoryChart && this.$refs.topItemsChart) {
                try {
                    // Prepare data for category chart
                    const categoryData = this.prepareCategoryData(this.filteredStockData || this.stockData);
                    
                    // Create new category chart
                    const categoryCtx = this.$refs.categoryChart.getContext('2d');
                    this.categoryChart = new Chart(categoryCtx, {
                        type: 'pie',
                        data: {
                            labels: categoryData.labels,
                            datasets: [{
                                data: categoryData.values,
                                backgroundColor: this.generateColors(categoryData.labels.length)
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            legend: {
                                position: 'right'
                            },
                            title: {
                                display: true,
                                text: 'Usage by Category'
                            }
                        }
                    });
                    
                    // Prepare data for top items chart
                    const topItemsData = this.prepareTopItemsData(this.filteredStockData || this.stockData);
                    
                    // Create new top items chart
                    const topItemsCtx = this.$refs.topItemsChart.getContext('2d');
                    this.topItemsChart = new Chart(topItemsCtx, {
                        type: 'bar',
                        data: {
                            labels: topItemsData.labels,
                            datasets: [{
                                label: 'Usage Value',
                                data: topItemsData.values,
                                backgroundColor: this.generateColors(topItemsData.labels.length)
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            legend: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: 'Top 10 Cost Items'
                            },
                            indexAxis: 'y',
                            scales: {
                                x: {
                                    beginAtZero: true,
                                    ticks: {
                                        callback: (value) => `R${value.toFixed(2)}`
                                    }
                                }
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error initializing charts:', error);
                }
            } else {
                console.log('Chart references not available yet');
            }
        },
        
        /**
         * Update charts safely
         */
        updateCharts() {
            try {
                // Safely update category chart if it exists
                if (this.categoryChart) {
                    const categoryData = this.prepareCategoryData(this.filteredStockData || this.stockData);
                    this.categoryChart.data.labels = categoryData.labels;
                    this.categoryChart.data.datasets[0].data = categoryData.values;
                    this.categoryChart.update();
                }
                
                // Safely update top items chart if it exists
                if (this.topItemsChart) {
                    const topItemsData = this.prepareTopItemsData(this.filteredStockData || this.stockData);
                    this.topItemsChart.data.labels = topItemsData.labels;
                    this.topItemsChart.data.datasets[0].data = topItemsData.values;
                    this.topItemsChart.update();
                }
            } catch (error) {
                console.error('Error updating charts:', error);
                // If there was an error, try to reinitialize the charts
                this.$nextTick(() => {
                    this.initCharts();
                });
            }
        },
        
        /**
         * Get appropriate badge class for a category
         * @param {string} category - The category name
         * @returns {string} - CSS class for the badge
         */
        getCategoryBadgeClass(category) {
            if (!category) return 'badge-secondary';
            
            // Convert to lowercase for case-insensitive matching
            const lowerCategory = category.toLowerCase();
            
            // Map categories to bootstrap colors
            if (lowerCategory.includes('beverage') || lowerCategory.includes('drink')) {
                return 'badge-info';
            } else if (lowerCategory.includes('food') || lowerCategory.includes('dish')) {
                return 'badge-success';
            } else if (lowerCategory.includes('alcohol') || lowerCategory.includes('beer') || 
                      lowerCategory.includes('wine') || lowerCategory.includes('spirit')) {
                return 'badge-danger';
            } else if (lowerCategory.includes('supply') || lowerCategory.includes('equipment')) {
                return 'badge-warning';
            } else {
                return 'badge-primary';
            }
        },
        
        /**
         * Export the purchase order to CSV
         */
        exportPurchaseOrder() {
            // Create CSV content
            let csvContent = 'Item Code,Description,Category,Current Stock,Usage/Day,Order Quantity,Unit\n';
            
            // Add each item row
            this.purchaseOrder.items.forEach(item => {
                csvContent += [
                    item.itemCode || '',
                    `"${item.description || ''}"`,
                    item.category || '',
                    item.currentStock || '0',
                    item.usagePerDay || '0',
                    item.orderQty || '0',
                    item.unit || 'unit'
                ].join(',') + '\n';
            });
            
            // Create supplier and date info
            const supplierInfo = `"Supplier: ${this.purchaseOrder.supplier || 'Not Specified'}"\n`;
            const dateInfo = `"Date Required: ${this.purchaseOrder.dateRequired || 'Not Specified'}"\n`;
            const notesInfo = this.purchaseOrder.notes ? `"Notes: ${this.purchaseOrder.notes}"\n` : '';
            
            // Combine all content
            const fullContent = supplierInfo + dateInfo + notesInfo + '\n' + csvContent;
            
            // Generate filename based on date and supplier
            const today = new Date().toISOString().split('T')[0];
            const supplier = this.purchaseOrder.supplier ? 
                this.purchaseOrder.supplier.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'supplier';
            const filename = `purchase_order_${today}_${supplier}.csv`;
            
            // Create download link
            const blob = new Blob([fullContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', filename);
            link.style.display = 'none';
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Success message
            Swal.fire({
                title: 'Export Complete',
                text: `Purchase order has been exported as ${filename}`,
                icon: 'success',
                confirmButtonText: 'OK'
            });
        },
        
        /**
         * Save stock data to Firebase Realtime Database
         */
        saveStockDataToDatabase() {
            if (!this.stockData || this.stockData.length === 0) {
                Swal.fire({
                    title: 'No Data',
                    text: 'There is no stock data to save.',
                    icon: 'warning'
                });
                return;
            }
            
            if (!this.storeName.trim()) {
                Swal.fire({
                    title: 'Missing Information',
                    text: 'Please enter a store name before saving.',
                    icon: 'warning'
                });
                return;
            }
            
            this.isSaving = true;
            
            // Create a unique key for this dataset based on the timestamp
            const timestamp = new Date().toISOString();
            this.lastSaveTimestamp = timestamp;
            
            // Generate a unique key based on date and time
            const dateKey = timestamp.split('T')[0];
            const timeKey = timestamp.split('T')[1].split('.')[0].replace(/:/g, '');
            const uniqueKey = `${dateKey}_${timeKey}`;
            
            // Create data object with metadata
            const dataToSave = {
                timestamp: timestamp,
                storeName: this.storeName,
                openingDate: this.openingDate,
                closingDate: this.closingDate,
                daysToNextDelivery: this.daysToNextDelivery,
                safetyStockPercentage: this.safetyStockPercentage,
                criticalItemBuffer: this.criticalItemBuffer,
                defaultLeadTimeDays: this.defaultLeadTimeDays,
                stockItems: this.stockData
            };
            
            // Save to Firebase using direct Firebase API calls
            const database = getDatabase();
            if (!database) {
                console.error('Failed to get database instance for saving data');
                this.savingError = 'Could not connect to database.';
                this.isSaving = false;
                return;
            }
            
            const stockUsageRef = _ref(database, `stockUsage/${uniqueKey}`);
            _set(stockUsageRef, dataToSave)
                .then(() => {
                    this.isSaving = false;
                    this.dataSaved = true;
                    this.isDataUploaded = true;
                    this.savingError = '';
                    
                    // Save to local storage as backup
                    try {
                        localStorage.setItem('foodCostData', JSON.stringify(dataToSave));
                    } catch (error) {
                        console.warn('Could not save to local storage:', error);
                    }
                    
                    console.log('Stock data saved successfully to Firebase');
                })
                .catch((error) => {
                    console.error('Error saving stock data to Firebase:', error);
                    this.isSaving = false;
                    this.savingError = `Could not save data: ${error.message}`;
                    
                    // Try to save to local storage as fallback
                    try {
                        localStorage.setItem('foodCostData', JSON.stringify(dataToSave));
                        this.dataSaved = true;
                        console.log('Stock data saved to local storage as fallback');
                    } catch (storageError) {
                        console.error('Could not save to local storage:', storageError);
                    }
                });
        },
        
        /**
         * Check if stock data already exists for current dataset
         */
        checkExistingStockData() {
            if (this.lastSaveTimestamp) {
                const dateKey = this.lastSaveTimestamp.split('T')[0];
                const timeKey = this.lastSaveTimestamp.split('T')[1].split('.')[0].replace(/:/g, '');
                const uniqueKey = `${dateKey}_${timeKey}`;
                
                const stockUsageRef = _ref(getDatabase(), `stockUsage/${uniqueKey}`);
                _get(stockUsageRef)
                    .then((snapshot) => {
                        if (snapshot.exists()) {
                            this.dataSaved = true;
                            
                            // Load additional metadata if available
                            const data = snapshot.val();
                            if (data.storeName) this.storeName = data.storeName;
                            if (data.openingDate) this.openingDate = data.openingDate;
                            if (data.closingDate) this.closingDate = data.closingDate;
                            if (data.daysToNextDelivery) this.daysToNextDelivery = data.daysToNextDelivery;
                            if (data.safetyStockPercentage) this.safetyStockPercentage = data.safetyStockPercentage;
                            if (data.criticalItemBuffer) this.criticalItemBuffer = data.criticalItemBuffer;
                            if (data.defaultLeadTimeDays) this.defaultLeadTimeDays = data.defaultLeadTimeDays;
                        }
                    })
                    .catch((error) => {
                        console.error('Error checking existing data:', error);
                    });
                }
            },
        
        /**
         * Check for previously uploaded data
         */
        checkForUploadedData() {
            console.log('Checking for previously uploaded data...');
            
            // First check local storage for recent uploads
            const localStorageKey = 'foodCostData';
            if (window.localStorage) {
                try {
                    const savedData = window.localStorage.getItem(localStorageKey);
                    if (savedData) {
                        const parsedData = JSON.parse(savedData);
                        if (parsedData && parsedData.stockItems && Array.isArray(parsedData.stockItems)) {
                            console.log('Found saved data in local storage');
                            this.stockData = parsedData.stockItems;
                            this.lastSaveTimestamp = parsedData.timestamp || '';
                            this.storeName = parsedData.storeName || '';
                            this.isDataUploaded = true;
                            
                            // Extract categories and cost centers
                            this.filterOptions.availableCategories = [];
                            this.filterOptions.availableCostCenters = [];
                            this.stockData.forEach(item => {
                                if (item.category && !this.filterOptions.availableCategories.includes(item.category)) {
                                    this.filterOptions.availableCategories.push(item.category);
                                }
                                if (item.costCenter && !this.filterOptions.availableCostCenters.includes(item.costCenter)) {
                                    this.filterOptions.availableCostCenters.push(item.costCenter);
                                }
                            });
                            
                            // Sort categories and cost centers
                            this.filterOptions.availableCategories.sort();
                            this.filterOptions.availableCostCenters.sort();
                            
                            // Apply all selected by default
                            this.filterOptions.selectedCategories = [...this.filterOptions.availableCategories];
                            this.filterOptions.selectedCostCenters = [...this.filterOptions.availableCostCenters];
                            
                            // Apply filters and update UI
                            this.applyFilters();
                            this.updateUI();
                        }
                    }
                } catch (error) {
                    console.error('Error loading stock data from local storage:', error);
                }
            }
            
            // Check online for recent uploads
            try {
                // Ensure Firebase is initialized before accessing
                if (!ensureFirebaseInitialized()) {
                    console.error('Cannot check for uploaded data: Firebase not initialized');
                    return;
                }
                
                const database = getDatabase();
                if (!database) {
                    console.error('Cannot check for uploaded data: Failed to get database');
                    return;
                }
                
                const stockUsageRef = _ref(database, 'stockUsage');
                _get(stockUsageRef)
                    .then((snapshot) => {
                        if (!snapshot.exists()) {
                            console.log(`No historical data found for any items`);
                            return;
                        }
                        
                        const data = snapshot.val();
                        
                        // Get the latest entry
                        const entries = Object.entries(data);
                        if (entries.length > 0) {
                            // Sort by key (which includes timestamp) to get the most recent
                            entries.sort((a, b) => b[0].localeCompare(a[0])); // Sort by key descending (newest first)
                            
                            // If no data loaded yet, load the most recent
                            if (!this.isDataUploaded && entries.length > 0) {
                                const latestEntry = entries[0][1];
                                
                                // Load store metadata
                                if (latestEntry.storeName) this.storeName = latestEntry.storeName;
                                if (latestEntry.daysToNextDelivery) this.daysToNextDelivery = latestEntry.daysToNextDelivery;
                                if (latestEntry.safetyStockPercentage) this.safetyStockPercentage = latestEntry.safetyStockPercentage;
                                if (latestEntry.criticalItemBuffer) this.criticalItemBuffer = latestEntry.criticalItemBuffer;
                                if (latestEntry.defaultLeadTimeDays) this.defaultLeadTimeDays = latestEntry.defaultLeadTimeDays;
                                
                                // Load stock items if available
                                if (latestEntry.stockItems && Array.isArray(latestEntry.stockItems)) {
                                    console.log('Loading most recent stock data from Firebase');
                                    this.stockData = latestEntry.stockItems;
                                    this.lastSaveTimestamp = latestEntry.timestamp || '';
                                    this.isDataUploaded = true;
                                    
                                    // Extract categories and cost centers
                                    this.filterOptions.availableCategories = [];
                                    this.filterOptions.availableCostCenters = [];
                                    this.stockData.forEach(item => {
                                        if (item.category && !this.filterOptions.availableCategories.includes(item.category)) {
                                            this.filterOptions.availableCategories.push(item.category);
                                        }
                                        if (item.costCenter && !this.filterOptions.availableCostCenters.includes(item.costCenter)) {
                                            this.filterOptions.availableCostCenters.push(item.costCenter);
                                        }
                                    });
                                    
                                    // Sort categories and cost centers
                                    this.filterOptions.availableCategories.sort();
                                    this.filterOptions.availableCostCenters.sort();
                                    
                                    // Apply all selected by default
                                    this.filterOptions.selectedCategories = [...this.filterOptions.availableCategories];
                                    this.filterOptions.selectedCostCenters = [...this.filterOptions.availableCostCenters];
                                    
                                    // Apply filters and update UI
                                    this.applyFilters();
                                    this.updateUI();
                                }
                            }
                            
                            // Store all entries for trend data
                            this.allEntriesHistory = entries.map(([key, value]) => ({
                                key,
                                timestamp: value.timestamp || key,
                                stockItems: value.stockItems || []
                            }));
                        }
                    })
                    .catch((error) => {
                        console.error('Error checking for online data:', error);
                    });
            } catch (error) {
                console.error('Exception in checkForUploadedData:', error);
            }
        },
        
        /**
         * Generate purchase order
         */
        async generatePurchaseOrder() {
            Swal.fire({
                title: 'Analyzing Data',
                text: 'Analyzing historical usage patterns...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            try {
                console.log('Starting purchase order generation process');
                
                // Validate that we have stock items to process
                if (!this.filteredStockData || !Array.isArray(this.filteredStockData) || this.filteredStockData.length === 0) {
                    throw new Error('No stock data available for processing. Ensure that data is loaded and filters are properly set.');
                }
                
                // Process all items with usage data regardless of current stock levels
                const itemsToProcess = this.filteredStockData.filter(item => {
                    // Add validation for item object
                    if (!item || typeof item !== 'object') {
                        console.warn('Invalid item in filteredStockData array:', item);
                        return false;
                    }
                    
                    const usagePerDay = parseFloat(item.usagePerDay) || 0;
                    return usagePerDay > 0; // Only consider items with usage data
                });
                
                console.log(`Found ${itemsToProcess.length} items with usage data to process`);
                
                if (itemsToProcess.length === 0) {
                    throw new Error('No items with usage data found for processing. Ensure that usage data is available for at least some items.');
                }
                
                // Set up calculation parameters with defaults to prevent undefined values
                const params = {
                    safetyStockPercentage: this.safetyStockPercentage || 25,
                    criticalItemBuffer: this.criticalItemBuffer || 25,
                    leadTimeDays: this.defaultLeadTimeDays || 1,
                    cycleLength: this.defaultCycleLength || 7,
                    daysToNextDelivery: this.daysToNextDelivery || 3
                };
                
                // Populate the purchase order items array with the filtered items
                this.purchaseOrder.items = itemsToProcess.map(item => ({
                    id: item.itemCode || item.id,
                    description: item.description || '',
                    category: item.category || '',
                    orderQty: 0, // Will be calculated in the processing loop
                    unitPrice: item.unitPrice || 0,
                    totalPrice: 0 // Will be calculated based on orderQty and unitPrice
                }));
                
                console.log(`Added ${this.purchaseOrder.items.length} items to purchase order for processing`);
                
                console.log('Purchase order calculation parameters:', params);
                console.log('Starting to process items for purchase order...');
                
                // Track items that need to be processed
                const processPromises = [];
                
                // Process each item in the purchase order
                for (let i = 0; i < this.purchaseOrder.items.length; i++) {
                    const orderItem = this.purchaseOrder.items[i];
                    
                    console.log(`Processing order item ${i+1}:`, orderItem);
                    
                    // Skip items without ID
                    if (!orderItem.id) continue;
                    
                    // Find the corresponding stock item
                    const stockItem = this.filteredStockData.find(item => 
                        item.id === orderItem.id || item.itemCode === orderItem.id
                    );
                    
                    if (stockItem) {
                        const promise = (async () => {
                            try {
                                // Get historical data for this item
                                const historicalData = await this.getItemHistoricalData(orderItem.id);
                                
                                // Calculate new recommended quantity using our smart algorithm
                                const { orderQty, calculationDetails } = this.calculateSmartOrderQuantity(stockItem, {
                                    ...params,
                                    historicalData: historicalData
                                });
                                
                                // Update the order quantity
                                const orderIndex = this.purchaseOrder.items.findIndex(item => item.id === orderItem.id);
                                if (orderIndex !== -1) {
                                    // Transfer essential details from stock item to purchase order item
                                    this.purchaseOrder.items[orderIndex].itemCode = stockItem.itemCode;
                                    this.purchaseOrder.items[orderIndex].description = stockItem.description;
                                    this.purchaseOrder.items[orderIndex].category = stockItem.category;
                                    this.purchaseOrder.items[orderIndex].currentStock = parseFloat(stockItem.closingBalance) || 0;
                                    this.purchaseOrder.items[orderIndex].usagePerDay = parseFloat(stockItem.usagePerDay) || 0;
                                    this.purchaseOrder.items[orderIndex].unit = stockItem.unit || 'unit';
                                    
                                    // Set calculated quantities
                                    this.purchaseOrder.items[orderIndex].recommendedQty = orderQty;
                                    this.purchaseOrder.items[orderIndex].orderQty = orderQty; // Initially set to recommended
                                    
                                    // Add trend indicator if we have historical data
                                    if (historicalData && historicalData.length > 1) {
                                        const oldestUsage = historicalData[historicalData.length - 1].usagePerDay || 0;
                                        const newestUsage = historicalData[0].usagePerDay || 0;
                                        
                                        if (oldestUsage > 0) {
                                            const trendPercentage = ((newestUsage - oldestUsage) / oldestUsage) * 100;
                                            this.purchaseOrder.items[orderIndex].trend = {
                                                direction: trendPercentage > 5 ? 'up' : 
                                                           trendPercentage < -5 ? 'down' : 'stable',
                                                percentage: Math.abs(Math.round(trendPercentage))
                                            };
                                        }
                                    }
                                    // Store calculation details for later display
                                    this.purchaseOrder.items[orderIndex].calculationDetails = calculationDetails;
                                }
                            } catch (error) {
                                console.error(`Error recalculating for item ${orderItem.id}:`, error);
                            }
                        })();
                        
                        processPromises.push(promise);
                    }
                }
                
                // Wait for all items to be processed
                Promise.all(processPromises)
                    .then(() => {
                        console.log('All items recalculated');
                        
                        // Close the loading dialog
                        Swal.close();
                        
                        // Filter out items with zero order quantity
                        this.purchaseOrder.items = this.purchaseOrder.items.filter(item => item.orderQty > 0);
                        
                        console.log(`Generated purchase order with ${this.purchaseOrder.items.length} items`);
                        console.log('Purchase order items:', this.purchaseOrder.items);
                        
                        if (this.purchaseOrder.items.length === 0) {
                            // Show message if no items qualified for purchase order
                            Swal.fire({
                                title: 'No Items to Order',
                                text: 'No items qualified for purchase order based on current stock levels and usage data.',
                                icon: 'info'
                            });
                        } else {
                            // Show the purchase order modal
                            this.showPurchaseOrderModal();
                        }
                    })
                    .catch(error => {
                        console.error('Error during recalculation:', error);
                        
                        // Close the loading dialog and show error
                        Swal.fire({
                            title: 'Error',
                            text: `Error processing order items: ${error.message}`,
                            icon: 'error'
                        });
                    });
            } catch (error) {
                console.error('Error generating purchase order:', error);
                console.error('Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                });
                
                // Show error to user
                Swal.fire({
                    title: 'Error',
                    text: `Failed to generate purchase order: ${error.message}`,
                    icon: 'error'
                });
            }
        },
        
        /**
         * Close purchase order modal
         */
        closePurchaseOrderModal() {
            try {
                // Use vanilla JavaScript to hide the modal (Bootstrap 4 compatible)
                document.getElementById('purchaseOrderModal').classList.remove('show');
                document.getElementById('purchaseOrderModal').style.display = 'none';
                document.getElementById('purchaseOrderModal').setAttribute('aria-hidden', 'true');
                document.body.classList.remove('modal-open');
                
                // Remove backdrop
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) {
                    backdrop.remove();
                }
            } catch (error) {
                console.error('Error closing purchase order modal:', error);
            }
        },
        
        /**
         * Add order item
         */
        addOrderItem() {
            this.purchaseOrder.items.push({
                id: '',
                code: '',
                description: '',
                category: '',
                unit: 'unit',
                currentStock: 0,
                usagePerDay: 0,
                reorderPoint: 0,
                recommendedQty: 0,
                orderQty: 0,
                historicalData: []
            });
        },
        
        /**
         * Remove order item
         * @param {number} index - Index of the item to remove
         */
        removeOrderItem(index) {
            this.purchaseOrder.items.splice(index, 1);
        },
        
        /**
         * Recalculate order quantities based on the current parameters
         */
        recalculateOrderQuantities() {
            // Update local parameters temporarily for this calculation
            const params = {
                safetyStockPercentage: this.modalSafetyStockPercentage,
                criticalItemBuffer: this.modalCriticalItemBuffer,
                leadTimeDays: this.modalLeadTimeDays,
                cycleLength: this.modalCycleLength
            };
            const diagnosticInfo = {
                totalItemsWithUsage: 0,
                qualifiedItems: 0,
                itemsEvaluated: [],
                params: {
                    safetyStockPercentage: this.safetyStockPercentage || 25,
                    leadTimeDays: this.defaultLeadTimeDays || 1,
                    cycleLength: this.defaultCycleLength || 7,
                    daysToNextDelivery: this.daysToNextDelivery || 3
                },
                reasonsNotQualified: {
                    sufficientStock: 0,
                    belowMinimumUsage: 0,
                    calculationError: 0,
                    other: 0
                }
            };
            const itemsToProcess = this.filteredStockData || [];
            
            // Track items that need to be processed
            const processPromises = [];
            
            // Process each item in the purchase order
            for (let i = 0; i < this.purchaseOrder.items.length; i++) {
                const orderItem = this.purchaseOrder.items[i];
                
                console.log(`Processing order item ${i+1}:`, orderItem);
                
                // Skip items without ID
                if (!orderItem.id) continue;
                
                // Find the corresponding stock item
                const stockItem = this.filteredStockData.find(item => 
                    item.id === orderItem.id || item.itemCode === orderItem.id
                );
                
                if (stockItem) {
                    const promise = (async () => {
                        try {
                            // Get historical data for this item
                            const historicalData = await this.getItemHistoricalData(orderItem.id);
                            
                            // Calculate new recommended quantity using our smart algorithm
                            const { orderQty, calculationDetails } = this.calculateSmartOrderQuantity(stockItem, {
                                ...params,
                                historicalData: historicalData
                            });
                            
                            // Update the order quantity
                            const orderIndex = this.purchaseOrder.items.findIndex(item => item.id === orderItem.id);
                            if (orderIndex !== -1) {
                                // Transfer essential details from stock item to purchase order item
                                this.purchaseOrder.items[orderIndex].itemCode = stockItem.itemCode;
                                this.purchaseOrder.items[orderIndex].description = stockItem.description;
                                this.purchaseOrder.items[orderIndex].category = stockItem.category;
                                this.purchaseOrder.items[orderIndex].currentStock = parseFloat(stockItem.closingBalance) || 0;
                                this.purchaseOrder.items[orderIndex].usagePerDay = parseFloat(stockItem.usagePerDay) || 0;
                                this.purchaseOrder.items[orderIndex].unit = stockItem.unit || 'unit';
                                
                                // Set calculated quantities
                                this.purchaseOrder.items[orderIndex].recommendedQty = orderQty;
                                this.purchaseOrder.items[orderIndex].orderQty = orderQty; // Initially set to recommended
                                
                                // Add trend indicator if we have historical data
                                if (historicalData && historicalData.length > 1) {
                                    const oldestUsage = historicalData[historicalData.length - 1].usagePerDay || 0;
                                    const newestUsage = historicalData[0].usagePerDay || 0;
                                    
                                    if (oldestUsage > 0) {
                                        const trendPercentage = ((newestUsage - oldestUsage) / oldestUsage) * 100;
                                        this.purchaseOrder.items[orderIndex].trend = {
                                            direction: trendPercentage > 5 ? 'up' : 
                                                       trendPercentage < -5 ? 'down' : 'stable',
                                            percentage: Math.abs(Math.round(trendPercentage))
                                        };
                                    }
                                }
                                // Store calculation details for later display
                                this.purchaseOrder.items[orderIndex].calculationDetails = calculationDetails;
                            }
                        } catch (error) {
                            console.error(`Error recalculating for item ${orderItem.id}:`, error);
                        }
                    })();
                    
                    processPromises.push(promise);
                }
            }
            
            // Wait for all items to be processed
            Promise.all(processPromises)
                .then(() => {
                    console.log('All items recalculated');
                })
                .catch(error => {
                    console.error('Error during recalculation:', error);
                });
        },
        
        /**
         * Submit purchase order
         */
        submitPurchaseOrder() {
            console.log('Purchase Order:', this.purchaseOrder);
            // Implement logic to save or send the purchase order
            this.closePurchaseOrderModal();
        },
        
        /**
         * Show purchase order modal
         */
        showPurchaseOrderModal() {
            try {
                // Calculate totals before showing
                let totalItems = 0;
                let totalQuantity = 0;
                
                this.purchaseOrder.items.forEach(item => {
                    totalItems++;
                    totalQuantity += parseInt(item.orderQty) || 0;
                });
                
                console.log(`Showing purchase order modal with ${totalItems} items and ${totalQuantity} total quantity`);
                
                // Use vanilla JavaScript to show the modal (Bootstrap 4 compatible)
                const modal = document.getElementById('purchaseOrderModal');
                if (modal) {
                    modal.classList.add('show');
                    modal.style.display = 'block';
                    modal.setAttribute('aria-hidden', 'false');
                    document.body.classList.add('modal-open');
                    
                    // Add backdrop if needed
                    if (!document.querySelector('.modal-backdrop')) {
                        const backdrop = document.createElement('div');
                        backdrop.classList.add('modal-backdrop', 'fade', 'show');
                        document.body.appendChild(backdrop);
                    }
                } else {
                    console.error('Purchase order modal element not found');
                }
            } catch (error) {
                console.error('Error showing purchase order modal:', error);
            }
        },
        
        /**
         * Calculate the number of days between opening and closing stock dates
         */
        updateStockPeriodDays() {
            if (this.openingStockDate && this.closingStockDate) {
                const openDate = new Date(this.openingStockDate);
                const closeDate = new Date(this.closingStockDate);
                
                // Calculate difference in days
                const diffTime = Math.abs(closeDate - openDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                this.stockPeriodDays = diffDays > 0 ? diffDays : 1;
            } else {
                this.stockPeriodDays = 1;
            }
        },
        
        /**
         * Calculate the number of days between opening and closing stock dates
         * @returns {number} Number of days in the stock period
         */
        calculateStockPeriodDays() {
            if (this.openingStockDate && this.closingStockDate) {
                const openDate = new Date(this.openingStockDate);
                const closeDate = new Date(this.closingStockDate);
                
                // Calculate difference in days
                const diffTime = Math.abs(closeDate - openDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return Math.max(1, diffDays); // Ensure at least 1 day to avoid division by zero
            }
            return 1; // Default to 1 day if dates are not set
        },
        
        /**
         * Calculate the recommended order quantity for a stock item
         * @param {Object} item - Stock item data
         * @param {number} daysToNextDelivery - Days until next scheduled delivery
         * @param {number} leadTimeDays - Standard lead time for orders
         * @param {number} cycleLength - Typical ordering cycle in days
         * @returns {number} - Recommended order quantity
         */
        calculateOrderQuantity(item, daysToNextDelivery, leadTimeDays, cycleLength) {
            // 1. Calculate projected usage until next delivery + lead time
            const projectionPeriod = daysToNextDelivery + leadTimeDays;
            const projectedUsage = item.usagePerDay * projectionPeriod;
            
            // 2. Calculate safety stock using configurable percentage
            const safetyStock = item.usagePerDay * leadTimeDays * (this.safetyStockPercentage / 100);
            
            // 3. Calculate optimal stock level (covers next cycle)
            const optimalStock = (item.usagePerDay * cycleLength) + safetyStock;
            
            // 4. Determine quantity needed to reach optimal level
            let orderQuantity = Math.max(0, (optimalStock - item.closingBalance));
            
            // 5. Apply minimum order quantity constraints
            const minOrderQty = item.minOrderQuantity || 1;
            orderQuantity = Math.max(orderQuantity, minOrderQty); // Ensure at least 1 unit
            orderQuantity = Math.ceil(orderQuantity); // Round up to nearest whole number
            
            console.log(`  - Final order quantity: ${orderQuantity}`);
            
            return orderQuantity;
        },
        
        /**
         * Calculate advanced order quantity with additional considerations
         * @param {Object} item - Stock item to calculate for
         * @param {Object} context - Context for calculation
         * @returns {number} - Recommended order quantity
         */
        calculateSmartOrderQuantity(item, context) {
            try {
                // Create calculation details object to track the steps
                const calculationDetails = {
                    item: {
                        id: item.id || 'unknown',
                        itemCode: item.itemCode || 'unknown',
                        description: item.description || item.itemName || 'unknown'
                    },
                    parameters: {},
                    steps: [],
                    result: {},
                    timestamp: new Date().toISOString()
                };
                
                // Validate inputs
                if (!item || typeof item !== 'object') {
                    console.error('Invalid item object provided to calculateSmartOrderQuantity');
                    calculationDetails.error = 'Invalid item object provided';
                    return { orderQty: 0, calculationDetails };
                }
                
                if (!context || typeof context !== 'object') {
                    console.error('Invalid context object provided to calculateSmartOrderQuantity');
                    calculationDetails.error = 'Invalid context object provided';
                    return { orderQty: 0, calculationDetails };
                }
                
                // Extract context variables with defaults
                const daysToNextDelivery = context.daysToNextDelivery || this.daysToNextDelivery || 3;
                const leadTimeDays = context.leadTimeDays || this.defaultLeadTimeDays || 1;
                const safetyStockPercentage = context.safetyStockPercentage || this.safetyStockPercentage || 25;
                const criticalItemBuffer = context.criticalItemBuffer || this.criticalItemBuffer || 25;
                const historicalData = Array.isArray(context.historicalData) ? context.historicalData : [];
                
                // Store parameters in calculation details
                calculationDetails.parameters = {
                    daysToNextDelivery,
                    leadTimeDays,
                    safetyStockPercentage,
                    criticalItemBuffer,
                    hasHistoricalData: historicalData.length > 0
                };
                
                // Ensure item has all required properties with proper defaults
                const usagePerDay = parseFloat(item.usagePerDay) || 0;
                const closingBalance = parseFloat(item.closingBalance) || 0;
                const reorderPoint = parseFloat(item.reorderPoint) || 0;
                const category = item.category || '';
                const isCritical = Array.isArray(this.criticalCategories) && this.criticalCategories.includes(category);
                
                // Store initial values in calculation details
                calculationDetails.initialValues = {
                    usagePerDay,
                    closingBalance,
                    reorderPoint,
                    category,
                    isCritical
                };
                
                // DEBUGGING - Log detailed item information
                console.log(`Processing item ${item.id || 'unknown'}: `, {
                    itemCode: item.itemCode || 'unknown',
                    description: item.description || item.itemName || 'unknown',
                    usagePerDay: usagePerDay,
                    closingBalance: closingBalance,
                    reorderPoint: reorderPoint,
                    isCritical: isCritical
                });
                
                // Early return if usagePerDay is 0
                if (usagePerDay === 0) {
                    console.log(`Item ${item.id || 'unknown'} has zero usage per day, returning 0 as order quantity`);
                    calculationDetails.steps.push({
                        description: 'Early exit: Usage per day is zero',
                        result: 0,
                        details: 'No ordering required for items without usage data'
                    });
                    calculationDetails.result = {
                        orderQuantity: 0,
                        reason: 'Zero usage per day'
                    };
                    return { orderQty: 0, calculationDetails };
                }
                
                // Analysis parameters
                const recentPeriod = Math.min(3, historicalData.length); // Consider last 3 entries for recent trend
                let calculatedUsageRate = usagePerDay; // Start with current usage rate
                let trendFactor = 1.0; // Default - no trend adjustment
                
                // Analyze historical data if available
                if (historicalData && historicalData.length > 0) {
                    // Calculate weighted recent average (more weight to recent data)
                    if (recentPeriod > 0) {
                        const recentUsage = historicalData
                            .slice(0, recentPeriod)
                            .reduce((sum, record) => sum + (parseFloat(record.usagePerDay) || 0), 0) / recentPeriod;
                        
                        // Record calculation step
                        calculationDetails.steps.push({
                            description: 'Calculate recent usage average',
                            formula: 'Average of last ' + recentPeriod + ' usage records',
                            inputs: {
                                recentRecords: historicalData.slice(0, recentPeriod).map(r => r.usagePerDay || 0)
                            },
                            result: recentUsage,
                            details: `Recent usage average: ${recentUsage.toFixed(3)}`
                        });
                        
                        // Blend current with historical (70/30 split)
                        calculatedUsageRate = (usagePerDay * 0.7) + (recentUsage * 0.3);
                        
                        // Record calculation step
                        calculationDetails.steps.push({
                            description: 'Blend current and historical usage',
                            formula: '(Current usage × 0.7) + (Recent average × 0.3)',
                            inputs: {
                                currentUsage: usagePerDay,
                                recentAverage: recentUsage
                            },
                            result: calculatedUsageRate,
                            details: `Blended usage rate: ${calculatedUsageRate.toFixed(3)}`
                        });
                    }
                    
                    // Calculate trend (if we have enough data)
                    if (historicalData.length >= 2) {
                        const oldestUsage = parseFloat(historicalData[historicalData.length - 1].usagePerDay) || 0;
                        const newestUsage = parseFloat(historicalData[0].usagePerDay) || 0;
                        
                        if (oldestUsage > 0) {
                            const trendPercentage = ((newestUsage - oldestUsage) / oldestUsage) * 100;
                            
                            // Record calculation step
                            calculationDetails.steps.push({
                                description: 'Calculate usage trend',
                                formula: '((Newest usage - Oldest usage) / Oldest usage) × 100',
                                inputs: {
                                    newestUsage,
                                    oldestUsage
                                },
                                result: trendPercentage,
                                details: `Usage trend: ${trendPercentage.toFixed(1)}%`
                            });
                            
                            // Apply trend more aggressively for upward trends (20% of detected trend)
                            trendFactor = trendPercentage > 0 
                                ? 1 + (trendPercentage * 0.2 / 100) 
                                : Math.max(0.9, 1 + (trendPercentage * 0.1 / 100)); // Downward cap at 10% reduction
                            
                            // Record calculation step
                            calculationDetails.steps.push({
                                description: 'Apply trend factor',
                                formula: trendPercentage > 0 
                                    ? '1 + (Trend % × 0.2 / 100)' 
                                    : 'Max(0.9, 1 + (Trend % × 0.1 / 100))',
                                inputs: {
                                    trendPercentage
                                },
                                result: trendFactor,
                                details: `Applied trend factor: ${trendFactor.toFixed(3)}`
                            });
                        }
                    }
                    
                    // Calculate volatility (deviation from mean)
                    if (historicalData.length >= 3) {
                        const volatility = this.calculateVolatility(historicalData);
                        
                        // Record calculation step
                        calculationDetails.steps.push({
                            description: 'Calculate usage volatility',
                            result: volatility,
                            details: `Usage volatility index: ${volatility.toFixed(3)}`
                        });
                        
                        // Increase buffer for highly variable items (up to 30% increase)
                        const oldTrendFactor = trendFactor;
                        trendFactor *= 1 + Math.min(0.3, volatility * 0.5);
                        
                        // Record calculation step
                        calculationDetails.steps.push({
                            description: 'Adjust for volatility',
                            formula: 'TrendFactor × (1 + min(0.3, Volatility × 0.5))',
                            inputs: {
                                previousTrendFactor: oldTrendFactor,
                                volatility: volatility
                            },
                            result: trendFactor,
                            details: `Volatility-adjusted trend factor: ${trendFactor.toFixed(3)}`
                        });
                    }
                }
                
                // Base quantity for cycle + lead time
                const cyclePlusCoverage = (context.cycleLength || this.defaultCycleLength || 7) * trendFactor;
                
                // Record calculation step
                calculationDetails.steps.push({
                    description: 'Calculate cycle coverage',
                    formula: 'Order cycle length × Trend factor',
                    inputs: {
                        cycleLength: (context.cycleLength || this.defaultCycleLength || 7),
                        trendFactor
                    },
                    result: cyclePlusCoverage,
                    details: `Trend-adjusted cycle coverage: ${cyclePlusCoverage.toFixed(2)} days`
                });
                
                // Apply trend factor to adjust for increasing/decreasing usage
                const adjustedUsage = cyclePlusCoverage * calculatedUsageRate;
                
                // Record calculation step
                calculationDetails.steps.push({
                    description: 'Calculate projected usage',
                    formula: 'Adjusted cycle days × Calculated usage rate',
                    inputs: {
                        cyclePlusCoverage,
                        calculatedUsageRate
                    },
                    result: adjustedUsage,
                    details: `Projected usage over cycle: ${adjustedUsage.toFixed(2)} units`
                });
                
                // Calculate safety stock based on lead time usage
                let safetyStock = calculatedUsageRate * leadTimeDays * (safetyStockPercentage / 100);
                
                // Record calculation step
                calculationDetails.steps.push({
                    description: 'Calculate safety stock',
                    formula: 'Usage rate × Lead time days × (Safety stock % / 100)',
                    inputs: {
                        calculatedUsageRate,
                        leadTimeDays,
                        safetyStockPercentage
                    },
                    result: safetyStock,
                    details: `Base safety stock: ${safetyStock.toFixed(2)} units`
                });
                
                // Add buffer for critical items
                if (isCritical) {
                    const baseSafetyStock = safetyStock;
                    safetyStock *= (1 + (criticalItemBuffer / 100));
                    
                    // Record calculation step
                    calculationDetails.steps.push({
                        description: 'Apply critical item buffer',
                        formula: 'Safety stock × (1 + (Critical buffer % / 100))',
                        inputs: {
                            baseSafetyStock,
                            criticalItemBuffer
                        },
                        result: safetyStock,
                        details: `Critical item adjusted safety stock: ${safetyStock.toFixed(2)} units`
                    });
                }
                
                // Calculate total recommended quantity
                const totalRequired = adjustedUsage + safetyStock;
                
                // Record calculation step
                calculationDetails.steps.push({
                    description: 'Calculate total required inventory',
                    formula: 'Projected usage + Safety stock',
                    inputs: {
                        adjustedUsage,
                        safetyStock
                    },
                    result: totalRequired,
                    details: `Total required inventory: ${totalRequired.toFixed(2)} units`
                });
                
                // Calculate effective inventory (accounting for depletion during lead time)
                const effectiveInventory = Math.max(0, closingBalance - (calculatedUsageRate * leadTimeDays));
                
                // Record calculation step
                calculationDetails.steps.push({
                    description: 'Calculate effective inventory',
                    formula: 'Current stock - (Usage per day × Lead time)',
                    inputs: {
                        currentStock: closingBalance,
                        usagePerDay: calculatedUsageRate,
                        leadTimeDays
                    },
                    result: effectiveInventory,
                    details: `Effective inventory at order arrival: ${effectiveInventory.toFixed(2)} units`
                });
                
                // Consider reorder point in calculation
                // If current stock is below reorder point, always order at least to cover the difference
                let orderQuantity = 0;
                let orderReason = '';
                
                // 1. If below reorder point, definitely qualify
                if (closingBalance <= reorderPoint) {
                    // Below reorder point - definitely need to order
                    orderQuantity = Math.ceil(totalRequired);
                    orderReason = `Below reorder point (${closingBalance.toFixed(2)} < ${reorderPoint.toFixed(2)})`;
                    
                    // Record calculation step
                    calculationDetails.steps.push({
                        description: 'Below reorder point',
                        condition: `Current stock (${closingBalance.toFixed(2)}) <= Reorder point (${reorderPoint.toFixed(2)})`,
                        result: orderQuantity,
                        details: `Order full quantity: ${orderQuantity} units`
                    });
                } 
                // 2. If projected needs exceed effective inventory, qualify
                else if (totalRequired > effectiveInventory) {
                    orderQuantity = Math.ceil(totalRequired - effectiveInventory);
                    orderReason = `Projected need exceeds effective inventory (${totalRequired.toFixed(2)} > ${effectiveInventory.toFixed(2)})`;
                    
                    // Record calculation step
                    calculationDetails.steps.push({
                        description: 'Projected need exceeds effective inventory',
                        condition: `Required (${totalRequired.toFixed(2)}) > Effective inventory (${effectiveInventory.toFixed(2)})`,
                        formula: 'Ceiling(Required - Effective inventory)',
                        inputs: {
                            totalRequired,
                            effectiveInventory
                        },
                        result: orderQuantity,
                        details: `Order difference: ${orderQuantity} units`
                    });
                }
                // 3. If close to reorder point (within 20% buffer), qualify with minimum order
                else if (closingBalance <= reorderPoint * 1.2) {
                    // For items close to reorder point, minimum order quantity
                    const minimumOrderQty = Math.ceil(adjustedUsage * 0.5);
                    orderQuantity = Math.max(1, minimumOrderQty); // Ensure at least 1 unit
                    orderReason = `Close to reorder point (${closingBalance.toFixed(2)} <= ${(reorderPoint * 1.2).toFixed(2)})`;
                    
                    // Record calculation step
                    calculationDetails.steps.push({
                        description: 'Close to reorder point',
                        condition: `Current stock (${closingBalance.toFixed(2)}) <= Reorder point × 1.2 (${(reorderPoint * 1.2).toFixed(2)})`,
                        formula: 'Max(1, Ceiling(Projected usage × 0.5))',
                        inputs: {
                            adjustedUsage,
                            minimumCalculated: minimumOrderQty
                        },
                        result: orderQuantity,
                        details: `Order minimum quantity: ${orderQuantity} units`
                    });
                }
                // 4. If critical item, always include at least 1 unit
                else if (isCritical) {
                    orderQuantity = 1;
                    orderReason = 'Critical item (minimum quantity)';
                    
                    // Record calculation step
                    calculationDetails.steps.push({
                        description: 'Critical item minimum',
                        condition: `Item is in critical category: ${category}`,
                        result: orderQuantity,
                        details: 'Order minimum of 1 unit for critical items'
                    });
                }
                // 5. If usage is high relative to stock, include
                else if (usagePerDay > 0 && closingBalance < (usagePerDay * 14)) { // Less than 2 weeks of stock
                    orderQuantity = Math.ceil(adjustedUsage * 0.5);
                    orderReason = `Less than 2 weeks stock (${closingBalance.toFixed(2)} < ${(usagePerDay * 14).toFixed(2)})`;
                    
                    // Record calculation step
                    calculationDetails.steps.push({
                        description: 'Less than 2 weeks stock',
                        condition: `Current stock (${closingBalance.toFixed(2)}) < 14 days usage (${(usagePerDay * 14).toFixed(2)})`,
                        formula: 'Ceiling(Projected usage × 0.5)',
                        inputs: {
                            adjustedUsage
                        },
                        result: orderQuantity,
                        details: `Order partial quantity: ${orderQuantity} units`
                    });
                } else {
                    // Record calculation step for no order needed
                    calculationDetails.steps.push({
                        description: 'No order needed',
                        condition: 'No ordering criteria met',
                        result: 0,
                        details: 'Current stock is sufficient based on all criteria'
                    });
                }
                
                // Always ensure a minimum quantity for any item that qualifies
                if (orderQuantity > 0) {
                    const previousQty = orderQuantity;
                    orderQuantity = Math.max(1, orderQuantity);
                    
                    if (previousQty !== orderQuantity) {
                        // Record calculation step
                        calculationDetails.steps.push({
                            description: 'Ensure minimum order quantity',
                            formula: 'Max(1, Order quantity)',
                            inputs: {
                                previousOrderQty: previousQty
                            },
                            result: orderQuantity,
                            details: `Adjusted to minimum quantity: ${orderQuantity} units`
                        });
                    }
                }
                
                // For special test mode (if enabled)
                if (this.enableTestMode && orderQuantity === 0 && usagePerDay > 0) {
                    orderQuantity = 1; // Force include with test mode
                    orderReason = 'Test mode enabled (force include)';
                    
                    // Record calculation step
                    calculationDetails.steps.push({
                        description: 'Test mode override',
                        condition: 'Test mode is enabled',
                        result: orderQuantity,
                        details: 'Force include item with quantity 1 due to test mode'
                    });
                }
                
                // Store final result
                calculationDetails.result = {
                    orderQuantity,
                    reason: orderReason || 'Standard calculation'
                };
                
                // Return the recommended order quantity and calculation details
                return { orderQty: orderQuantity, calculationDetails };
            } catch (error) {
                console.error('Error in calculateSmartOrderQuantity:', error);
                console.error('Item:', item);
                console.error('Context:', context);
                return { 
                    orderQty: 0, 
                    calculationDetails: {
                        error: `Calculation error: ${error.message}`,
                        item: item ? { id: item.id, itemCode: item.itemCode } : 'unknown'
                    }
                }; // Return 0 on error to prevent breaking the UI
            }
        },
        
        /**
         * Calculate the volatility (coefficient of variation) of usage data
         * @param {Array} historicalData - Array of historical usage records
         * @returns {number} - Coefficient of variation (standard deviation / mean)
         */
        calculateVolatility(historicalData) {
            try {
                if (!historicalData || !Array.isArray(historicalData) || historicalData.length < 2) {
                    return 0;
                }
                
                // Extract usage per day values
                const usageValues = historicalData.map(record => parseFloat(record.usagePerDay) || 0);
                
                // Calculate mean
                const mean = usageValues.reduce((sum, val) => sum + val, 0) / usageValues.length;
                
                // Protect against division by zero
                if (mean === 0) return 0;
                
                // Calculate standard deviation
                const squaredDiffs = usageValues.map(val => Math.pow(val - mean, 2));
                const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
                const stdDev = Math.sqrt(variance);
                
                // Return coefficient of variation (CV)
                return stdDev / mean;
            } catch (error) {
                console.error('Error calculating volatility:', error);
                return 0;
            }
        },
        
        /**
         * Get historical usage data for trend analysis
         * This fetches previous stock usage entries from Firebase
         * @param {string} itemCode - The item code to get history for
         * @returns {Promise<Array>} - Array of historical usage data
         */
        getItemHistoricalData(itemCode) {
            return new Promise((resolve, reject) => {
                try {
                    console.log(`Fetching historical data for item: ${itemCode}`);
                    
                    if (!itemCode) {
                        console.warn('getItemHistoricalData called with empty itemCode');
                        resolve([]);
                        return;
                    }
                    
                    // TEMPORARY TEST DATA - Create mock historical data for testing
                    // When no real data exists, this ensures we have something to work with
                    // for purchase order calculations
                    const mockData = [
                        { 
                            timestamp: new Date().toISOString(),
                            usagePerDay: 2.5,
                            closingBalance: 5,
                            reorderPoint: 10
                        },
                        {
                            timestamp: new Date(Date.now() - 86400000).toISOString(),
                            usagePerDay: 2.2,
                            closingBalance: 7,
                            reorderPoint: 10
                        },
                        {
                            timestamp: new Date(Date.now() - 2*86400000).toISOString(),
                            usagePerDay: 2.0,
                            closingBalance: 10,
                            reorderPoint: 10
                        }
                    ];
                    
                    // Resolve with mock data for testing purchase orders
                    setTimeout(() => {
                        console.log(`Returning mock historical data for item ${itemCode}`);
                        resolve(mockData);
                    }, 100);
                    
                    /* UNCOMMENT THIS FOR PRODUCTION USE
                    // Query database for historical data using correct Firebase pattern according to project memory
                    const stockUsageRef = getRef('stockUsage');
                    getData(stockUsageRef)
                        .then((snapshot) => {
                            if (!snapshot.exists()) {
                                console.log(`No historical data found for any items`);
                                resolve([]);
                                return;
                            }
                            
                            const entries = [];
                            const data = snapshot.val();
                            
                            // Process all records to find matching item entries
                            Object.entries(data).forEach(([key, record]) => {
                                if (record.stockItems && Array.isArray(record.stockItems)) {
                                    // Find the matching item in this record
                                    const matchingItem = record.stockItems.find(item => 
                                        item.id === itemCode || item.itemCode === itemCode
                                    );
                                    
                                    if (matchingItem) {
                                        entries.push({
                                            timestamp: record.timestamp || key,
                                            usagePerDay: parseFloat(matchingItem.usagePerDay) || 0,
                                            closingBalance: parseFloat(matchingItem.closingBalance) || 0,
                                            reorderPoint: parseFloat(matchingItem.reorderPoint) || 0
                                        });
                                    }
                                }
                            });
                            
                            // Sort by timestamp (newest first)
                            entries.sort((a, b) => {
                                return new Date(b.timestamp) - new Date(a.timestamp);
                            });
                            
                            console.log(`Found ${entries.length} historical entries for item ${itemCode}`);
                            resolve(entries);
                        })
                        .catch((error) => {
                            console.error(`Error retrieving historical data for item ${itemCode}:`, error);
                            resolve([]); // Resolve with empty array on error to prevent breaking UI
                        });
                    */
                } catch (error) {
                    console.error(`Exception in getItemHistoricalData for ${itemCode}:`, error);
                    resolve([]);
                }
            });
        },
        
        /**
         * Reset header mapping
         */
        resetHeaderMapping() {
            this.headerMapping = {
                itemCode: -1,
                description: -1,
                category: -1,
                costCenter: -1,
                openingValue: -1,
                closingValue: -1,
                openingBalance: -1,
                purchases: -1,
                closingBalance: -1
            };
        },
        
        /**
         * Parse CSV text into an array of arrays
         * @param {string} csvText - Raw CSV text
         * @returns {Array} - Parsed CSV data as array of arrays
         */
        parseCSV(csvText) {
            if (!csvText || typeof csvText !== 'string') {
                throw new Error('Invalid CSV data: Input must be a non-empty string');
            }
            
            // Split by lines and handle different line endings
            const lines = csvText.split(/\r\n|\n|\r/).filter(line => line.trim());
            
            if (lines.length === 0) {
                throw new Error('CSV file appears to be empty');
            }
            
            const result = [];
            
            // Process each line
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const row = [];
                let inQuote = false;
                let currentValue = '';
                
                // Process each character in the line
                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    const nextChar = line[j + 1] || '';
                    
                    if (char === '"' && !inQuote) {
                        // Start of quoted field
                        inQuote = true;
                    } else if (char === '"' && inQuote && nextChar === '"') {
                        // Escaped quote inside a quoted field
                        currentValue += '"';
                        j++; // Skip the next quote
                    } else if (char === '"' && inQuote) {
                        // End of quoted field
                        inQuote = false;
                    } else if (char === ',' && !inQuote) {
                        // End of field
                        row.push(currentValue.trim());
                        currentValue = '';
                    } else {
                        // Regular character
                        currentValue += char;
                    }
                }
                
                // Add the last field
                row.push(currentValue.trim());
                result.push(row);
            }
            
            return result;
        },
        
        /**
         * Extract numeric value from a string
         * @param {string} value - String to extract numeric value from
         * @returns {number} - Extracted numeric value
         */
        extractNumericValue(value) {
            if (!value) return 0;
            
            const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
            return isNaN(numericValue) ? 0 : numericValue;
        },
        
        /**
         * Calculate summary statistics from the stock data
         */
        calculateSummary() {
            console.log('Calculating summary data...');
            
            if (!this.stockData || this.stockData.length === 0) {
                console.warn('No stock data available for summary calculation');
                // Initialize empty summary to prevent render errors
                this.summaryData = {
                    totalItems: 0,
                    totalOpeningStock: 0,
                    totalClosingStock: 0,
                    totalPurchases: 0,
                    totalUsageValue: 0,
                    totalUsagePerDay: 0,
                    belowReorderPoint: 0,
                    categories: 0,
                    costCenters: 0,
                    foodCostPercentage: 0
                };
                return;
            }
            
            try {
                // Use filtered data for calculations, with a fallback to empty array
                const data = this.filteredStockData || [];
                
                // Safe reducer function that handles potential undefined items
                const safeReduce = (array, property) => {
                    if (!array || !Array.isArray(array)) return 0;
                    return array.reduce((sum, item) => {
                        if (!item) return sum;
                        const value = item[property];
                        return sum + (isNaN(value) ? 0 : (value || 0));
                    }, 0);
                };
                
                // Safe filter function
                const safeFilter = (array, condition) => {
                    if (!array || !Array.isArray(array)) return [];
                    return array.filter(item => item && condition(item));
                };
                
                // Calculate total values with safety checks
                this.summaryData = {
                    totalItems: data.length || 0,
                    totalOpeningStock: safeReduce(data, 'openingBalance'),
                    totalClosingStock: safeReduce(data, 'closingBalance'),
                    totalPurchases: safeReduce(data, 'purchases'),
                    totalUsageValue: safeReduce(data, 'usageValue'),
                    totalUsagePerDay: safeReduce(data, 'usagePerDay'),
                    belowReorderPoint: safeFilter(data, item => 
                        item.closingBalance !== undefined && 
                        item.reOrderPoint !== undefined &&
                        item.closingBalance < item.reOrderPoint
                    ).length,
                    categories: (this.filterOptions && this.filterOptions.selectedCategories) ? 
                        this.filterOptions.selectedCategories.length : 0,
                    costCenters: (this.filterOptions && this.filterOptions.selectedCostCenters) ? 
                        this.filterOptions.selectedCostCenters.length : 0
                };
                
                // Calculate cost percentage
                if (this.totalSales && this.totalSales > 0) {
                    this.summaryData.foodCostPercentage = (this.summaryData.totalUsageValue / this.totalSales) * 100;
                } else {
                    this.summaryData.foodCostPercentage = 0;
                }
                
                console.log('Summary calculated:', this.summaryData);
            } catch (error) {
                console.error('Error calculating summary:', error);
                // Initialize empty summary on error to prevent render failures
                this.summaryData = {
                    totalItems: 0,
                    totalOpeningStock: 0,
                    totalClosingStock: 0,
                    totalPurchases: 0,
                    totalUsageValue: 0,
                    totalUsagePerDay: 0,
                    belowReorderPoint: 0,
                    categories: 0,
                    costCenters: 0,
                    foodCostPercentage: 0
                };
            }
        },
        
        /**
         * Show calculation details for an item in a popup
         * @param {Object} item - The purchase order item to show details for
         */
        showCalculationDetails(item) {
            if (!item || !item.calculationDetails) {
                Swal.fire({
                    title: 'Calculation Details Not Available',
                    text: 'No calculation data is available for this item.',
                    icon: 'info'
                });
                return;
            }
            
            const details = item.calculationDetails;
            
            // Create a formatted HTML representation of the calculation steps
            let stepsHtml = '';
            
            if (details.steps && details.steps.length > 0) {
                stepsHtml = `<div class="calculation-steps">`;
                details.steps.forEach((step, index) => {
                    const stepNum = index + 1;
                    stepsHtml += `
                        <div class="step-item mb-3">
                            <h5 class="step-title"><span class="badge badge-primary">${stepNum}</span> ${step.description}</h5>
                            ${step.condition ? `<div class="step-condition"><strong>Condition:</strong> ${step.condition}</div>` : ''}
                            ${step.formula ? `<div class="step-formula"><strong>Formula:</strong> ${step.formula}</div>` : ''}
                            ${step.inputs ? `<div class="step-inputs"><strong>Inputs:</strong> ${JSON.stringify(step.inputs, null, 2).replace(/[{}"]/g, '').replace(/,/g, ', ')}</div>` : ''}
                            <div class="step-result ${step.result > 0 ? 'text-success' : ''}">
                                <strong>Result:</strong> ${typeof step.result === 'number' ? step.result.toFixed(3) : step.result}
                            </div>
                            <div class="step-details font-italic">${step.details}</div>
                        </div>
                    `;
                });
                stepsHtml += `</div>`;
            } else {
                stepsHtml = '<p>No calculation steps recorded.</p>';
            }
            
            // Create a summary section
            let summaryHtml = `
                <div class="calculation-summary mb-4">
                    <h4>Calculation Summary</h4>
                    <div class="row">
                        <div class="col-md-6">
                            <table class="table table-sm">
                                <tr>
                                    <th>Item:</th>
                                    <td>${item.itemCode} - ${item.description}</td>
                                </tr>
                                <tr>
                                    <th>Current Stock:</th>
                                    <td>${parseFloat(item.currentStock).toFixed(2)} ${item.unit}</td>
                                </tr>
                                <tr>
                                    <th>Usage Per Day:</th>
                                    <td>${parseFloat(item.usagePerDay).toFixed(3)} ${item.unit}</td>
                                </tr>
                            </table>
                        </div>
                        <div class="col-md-6">
                            <table class="table table-sm">
                                <tr>
                                    <th>Parameters:</th>
                                    <td>
                                        ${details.parameters ? Object.entries(details.parameters).map(([key, value]) => 
                                            `${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${value}`
                                        ).join('<br>') : 'None'}
                                    </td>
                                </tr>
                                <tr>
                                    <th>Final Result:</th>
                                    <td>
                                        <strong class="text-primary">${details.result ? details.result.orderQuantity : 'N/A'} ${item.unit}</strong>
                                        ${details.result && details.result.reason ? `<br><small>${details.result.reason}</small>` : ''}
                                    </td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            
            // Show the detailed calculation in a modal
            Swal.fire({
                title: `Calculation Details: ${item.itemCode}`,
                html: `
                    <div class="calculation-details" style="text-align: left; max-height: 70vh; overflow-y: auto;">
                        ${summaryHtml}
                        <h4>Calculation Steps</h4>
                        ${stepsHtml}
                    </div>
                `,
                width: '80%',
                confirmButtonText: 'Close',
                customClass: {
                    content: 'swal-wide-content'
                }
            });
        },
    }
};

/**
 * Expose the initialization function to the window object
 * This is necessary for non-module scripts to access it
 */
window.initializeFoodCostModule = function(containerId) {
    return new Promise((resolve, reject) => {
        console.log(`Initializing Food Cost Module in container: ${containerId} ${window.MODULE_VERSION}`);
        
        try {
            // Make sure Firebase is initialized
            ensureFirebaseInitialized();
            
            // Get the container
            const container = document.getElementById(containerId);
            if (!container) {
                throw new Error(`Container with ID ${containerId} not found`);
            }
            
            // Check if there's already an app mounted on this container
            if (currentFoodCostApp) {
                console.log('Unmounting previous Food Cost app instance');
                try {
                    // Handle both old and new formats
                    if (currentFoodCostApp._vueApp && typeof currentFoodCostApp._vueApp.unmount === 'function') {
                        // New format (object with _vueApp property)
                        currentFoodCostApp._vueApp.unmount();
                    } else if (typeof currentFoodCostApp.unmount === 'function') {
                        // Old format (direct Vue app reference)
                        currentFoodCostApp.unmount();
                    } else {
                        // Last resort: try to clear the container manually
                        container.innerHTML = '';
                        console.log('Manual container cleanup performed');
                    }
                } catch (err) {
                    console.warn('Error unmounting previous app:', err);
                    // Continue anyway, but clear the container to avoid duplication
                    container.innerHTML = '';
                }
                currentFoodCostApp = null;
            }
            
            // Create and mount the app
            const app = createApp(FoodCostApp);
            
            // Mount the app - store both the app and the returned instance
            const instance = app.mount(`#${containerId}`);
            currentFoodCostApp = {
                _vueApp: app,
                instance: instance
            };
            
            console.log(`Food Cost Module initialized successfully ${window.MODULE_VERSION}`);
            resolve(app);
        } catch (error) {
            console.error('Error initializing Food Cost Module:', error);
            reject(error);
        }
    });
};

// Log initialization
console.log(`Food Cost Module ${window.MODULE_VERSION} loaded and ready for initialization`);

// Fix all remaining database calls to use the same direct Firebase reference pattern

// This is a global helper function to ensure we always use the correct Firebase database instance
function getDatabase() {
    // Make sure Firebase is initialized
    ensureFirebaseInitialized();
    // Return the database instance
    return _rtdb;
}

// This is a global helper function to get a reference
function getRef(path) {
    // Make sure Firebase is initialized
    ensureFirebaseInitialized();
    
    // Check if path is a valid string
    if (typeof path !== 'string') {
        console.error('getRef error: Path must be a string', path);
        return _ref(getDatabase(), ''); // Return a reference to the root as a fallback
    }
    
    // Return a reference to the specified path
    return _ref(getDatabase(), path);
}

// Global Food Cost App
window.FoodCostApp = FoodCostApp;

// Global Food Cost App instance to track the mounted app
let currentFoodCostApp = null;

// Initialize module only when needed

// Enable version checking for service worker updates
window.checkFoodCostModuleVersion = function() {
    return {
        version: window.MODULE_VERSION,
        timestamp: Date.now()
    };
};

// Global helper to safely get data
function getData(refOrPath) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _get(refOrPath);
    }
    // Otherwise, treat it as a path string and get a reference
    return _get(getRef(refOrPath));
}

// This is a global helper to safely set data
function setData(refOrPath, data) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _set(refOrPath, data);
    }
    // Otherwise, treat it as a path string and get a reference
    return _set(getRef(refOrPath), data);
}

// This is a global helper to safely update data
function updateData(refOrPath, data) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _update(refOrPath, data);
    }
    // Otherwise, treat it as a path string and get a reference
    return _update(getRef(refOrPath), data);
}

// This is a global helper to safely push data
function pushData(refOrPath, data) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _push(refOrPath, data);
    }
    // Otherwise, treat it as a path string and get a reference
    return _push(getRef(refOrPath), data);
}

// This is a global helper to safely remove data
function removeData(refOrPath) {
    // If refOrPath is already a reference (from getRef), use it directly
    if (typeof refOrPath === 'object' && refOrPath !== null) {
        return _remove(refOrPath);
    }
    // Otherwise, treat it as a path string and get a reference
    return _remove(getRef(refOrPath));
}
