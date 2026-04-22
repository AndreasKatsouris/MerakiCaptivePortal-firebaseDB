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
import { FlagsDashboard } from './components/flags/FlagsDashboard.js';

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

/**
 * Lazily mount the FlagsDashboard into #food-cost-flags-app when the Flags tab
 * is first shown. Subsequent shows call load() to refresh.
 */
let _flagsDashboardInstance = null;
function currentLocationId() {
    try {
        const vm = window.FoodCostApp?.vm || window.FoodCostApp;
        return vm?.selectedLocationId || null;
    } catch {
        return null;
    }
}

function currentUserUid() {
    try {
        return window.firebase?.auth?.()?.currentUser?.uid || null;
    } catch {
        return null;
    }
}

async function mountFlagsDashboardLazy() {
    const container = document.getElementById('food-cost-flags-app');
    if (!container) return;
    const locationId = currentLocationId();
    if (!_flagsDashboardInstance) {
        _flagsDashboardInstance = new FlagsDashboard(container, {
            locationId,
            userUid: currentUserUid(),
            onChange: () => refreshFlagCountBadge(locationId),
            onViewDetail: async ({ itemKey, entry }) => {
                const mod = await import('./components/flags/FlagDetailDrawer.js');
                await mod.openFlagDetail({
                    locationId: currentLocationId(),
                    itemKey,
                    entry,
                    userUid: currentUserUid(),
                    onChange: () => _flagsDashboardInstance.load()
                });
            },
            onRerun: async () => {
                const ctx = window.FoodCost?.currentProcessingContext;
                if (!ctx) {
                    if (typeof Swal !== 'undefined') {
                        Swal.fire('No data loaded', 'Load a stock file first.', 'info');
                    }
                    return;
                }
                await window.FoodCost.runFlagPipeline(ctx);
            },
            onOpenConfig: async () => {
                const mod = await import('./components/flags/FlagConfigPanel.js');
                await mod.openFlagConfigPanel({
                    locationId: currentLocationId(),
                    userUid: currentUserUid(),
                    isAdmin: !!window.FoodCost?.currentUserIsAdmin,
                    isLocationOwner: !!window.FoodCost?.currentUserIsLocationOwner
                });
            }
        });
    } else {
        _flagsDashboardInstance.setLocation(locationId);
    }
    await _flagsDashboardInstance.load();
}

/**
 * Render the Orders tab placeholder. The existing purchase-order workflow is
 * a modal owned by the Vue app in the Stock Data tab; this panel provides a
 * one-click hand-off so the new tab is useful without forking the component.
 */
function renderOrdersTabPanel() {
    const container = document.getElementById('food-cost-orders-app');
    if (!container || container.dataset.rendered === '1') return;
    container.dataset.rendered = '1';
    container.innerHTML = `
        <div class="card">
            <div class="card-body">
                <h5 class="card-title">Purchase Orders</h5>
                <p class="text-muted mb-3">
                    Generate a purchase order from the currently loaded stock data.
                    The PO workflow lives alongside the stock table — use the button
                    below to open it without leaving this tab.
                </p>
                <button id="fcOpenPurchaseOrderBtn" class="btn btn-primary">
                    <i class="fas fa-file-invoice me-1"></i> Open Purchase Order
                </button>
                <p class="text-muted small mt-3 mb-0">
                    If the button is disabled, first load a stock file under the
                    <strong>Stock Data</strong> tab.
                </p>
            </div>
        </div>
    `;
    const btn = container.querySelector('#fcOpenPurchaseOrderBtn');
    if (btn) {
        btn.addEventListener('click', () => {
            try {
                const stockTab = document.querySelector('[data-bs-target="#fcStockPane"]');
                if (stockTab && window.bootstrap?.Tab) {
                    window.bootstrap.Tab.getOrCreateInstance(stockTab).show();
                }
                const vm = window.FoodCostApp?.vm || window.FoodCostApp;
                if (vm && typeof vm.showPurchaseOrder === 'function') {
                    vm.showPurchaseOrder();
                } else if (typeof Swal !== 'undefined') {
                    Swal.fire('Stock data not loaded', 'Please load a stock file first.', 'info');
                }
            } catch (err) {
                console.error('[FoodCost] open PO from Orders tab failed:', err);
            }
        });
    }
}

function installOrdersTabHandler() {
    const btn = document.querySelector('[data-bs-target="#fcOrdersPane"]');
    if (!btn || btn.dataset.ordersHandlerInstalled === '1') return;
    btn.dataset.ordersHandlerInstalled = '1';
    btn.addEventListener('shown.bs.tab', () => {
        renderOrdersTabPanel();
    });
}

async function mountAnalyticsTabLazy() {
    if (window.__fcAnalyticsMounted) return;
    try {
        const mod = await import('./analytics-dashboard.js');
        if (typeof mod.initializeFoodCostAnalytics === 'function') {
            mod.initializeFoodCostAnalytics('food-cost-analytics-app');
            window.__fcAnalyticsMounted = true;
        } else {
            console.warn('[FoodCost] initializeFoodCostAnalytics not found in analytics-dashboard.js');
        }
    } catch (err) {
        console.error('[FoodCost] analytics mount failed:', err);
    }
}

function installAnalyticsTabHandler() {
    const btn = document.querySelector('[data-bs-target="#fcAnalyticsPane"]');
    if (!btn || btn.dataset.analyticsHandlerInstalled === '1') return;
    btn.dataset.analyticsHandlerInstalled = '1';
    btn.addEventListener('shown.bs.tab', () => {
        mountAnalyticsTabLazy();
    });
}

function installFlagsTabHandler() {
    const btn = document.querySelector('[data-bs-target="#fcFlagsPane"]');
    if (!btn || btn.dataset.flagsHandlerInstalled === '1') return;
    btn.dataset.flagsHandlerInstalled = '1';
    btn.addEventListener('shown.bs.tab', () => {
        mountFlagsDashboardLazy().catch((err) =>
            console.error('[FoodCost] Flags dashboard mount failed:', err)
        );
    });
}

// Install the lazy-mount handlers after DOM is ready
function installFoodCostTabHandlers() {
    installFlagsTabHandler();
    installAnalyticsTabHandler();
    installOrdersTabHandler();
}

if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installFoodCostTabHandlers);
    } else {
        installFoodCostTabHandlers();
    }
}

// Export the setup function
export { setupFoodCostModule, refreshFlagCountBadge, mountFlagsDashboardLazy };

// IMPORTANT: Make absolutely sure it's available globally by assigning it directly to window
window.setupFoodCostModule = setupFoodCostModule;
window.FoodCost = window.FoodCost || {};
window.FoodCost.refreshFlagCountBadge = refreshFlagCountBadge;
console.log('Food Cost Module setup script loaded. setupFoodCostModule is available globally:', 
    typeof window.setupFoodCostModule === 'function' ? 'YES' : 'NO');
