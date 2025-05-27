/**
 * Food Cost Module - Integration Test Utilities
 * Version: 1.0.0-2025-04-19
 * 
 * This file provides utility functions for integration testing
 */

// Ensure the FoodCost namespace exists
window.FoodCost = window.FoodCost || {};
window.FoodCost.tests = window.FoodCost.tests || {};

/**
 * Integration Test Utilities
 * Provides methods for creating and interacting with components in an integrated environment
 */
class IntegrationTestUtils {
    // Make it accessible globally
    static init() {
        if (!window.IntegrationTestUtils) {
            window.IntegrationTestUtils = IntegrationTestUtils;
        }
        
        if (!window.FoodCost.tests.testUtils) {
            window.FoodCost.tests.testUtils = new IntegrationTestUtils();
        }
        
        return window.FoodCost.tests.testUtils;
    }
    /**
     * Constructor
     */
    constructor() {
        this.components = {};
        this.mountPoints = {};
        this.eventListeners = {};
    }
    
    /**
     * Create a Vue component and mount it to the DOM
     * @param {Object} component - Component definition 
     * @param {Object} props - Props to pass to the component
     * @param {string} mountId - ID of element to mount to (will be created if not exists)
     * @returns {Object} Component context with methods and props
     */
    async createComponent(component, props = {}, mountId) {
        console.log(`Creating component ${component.name || 'unnamed'} with mountId ${mountId}`);
        
        if (!mountId) {
            mountId = `test-mount-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        }
        
        // Create mount point if it doesn't exist
        let mountPoint = document.getElementById(mountId);
        if (!mountPoint) {
            mountPoint = document.createElement('div');
            mountPoint.id = mountId;
            document.body.appendChild(mountPoint);
        }
        
        // Store reference to mount point
        this.mountPoints[mountId] = mountPoint;
        
        // Create component wrapper to handle component interaction
        const wrapper = {
            component,
            props,
            mountId,
            el: mountPoint,
            instance: null,
            methods: {},
            // Add proper event handling via Vue instance
            $on: function(event, handler) {
                if (this.instance) {
                    this.instance.$on(event, handler);
                }
                return this;
            },
            $emit: function(event, ...args) {
                if (this.instance) {
                    this.instance.$emit(event, ...args);
                }
                return this;
            },
            $off: function(event, handler) {
                if (this.instance) {
                    this.instance.$off(event, handler);
                }
                return this;
            },
            updateProps: function(newProps) {
                // Update props on the Vue instance
                if (this.instance) {
                    Object.entries(newProps).forEach(([key, value]) => {
                        this.instance.$props[key] = value;
                    });
                    this.instance.$forceUpdate();
                }
                
                // Update stored props
                this.props = { ...this.props, ...newProps };
                return this;
            }
        };
        
        // Create Vue instance with component
        try {
            const ComponentClass = Vue.extend(component);
            wrapper.instance = new ComponentClass({
                propsData: props
            });
            
            // Mount component
            wrapper.instance.$mount(mountPoint);
            
            // Expose component methods
            if (component.methods) {
                Object.keys(component.methods).forEach(methodName => {
                    wrapper.methods[methodName] = async (...args) => {
                        // Call method on instance
                        if (wrapper.instance && wrapper.instance[methodName]) {
                            const result = await wrapper.instance[methodName](...args);
                            // Wait for next tick to ensure DOM updates
                            await Vue.nextTick();
                            return result;
                        }
                        console.warn(`Method ${methodName} not found on component`);
                        return null;
                    };
                });
            }
            
            // Store component
            this.components[mountId] = wrapper;
            
            // Wait for next tick to ensure component is mounted
            await Vue.nextTick();
        } catch (error) {
            console.error('Error creating component:', error);
            // Clean up mount point to avoid leaks
            if (mountPoint.parentNode) {
                try {
                    mountPoint.parentNode.removeChild(mountPoint);
                } catch (e) {
                    console.warn('Error removing mount point:', e);
                }
            }
            delete this.mountPoints[mountId];
            throw error;
        }
        
        return wrapper;
    }
    
    /**
     * Add event listener to a component by mount ID
     * @param {string} mountId - Mount ID of the component
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     */
    listenToComponent(mountId, event, handler) {
        const wrapper = this.components[mountId];
        if (wrapper && wrapper.instance) {
            wrapper.instance.$on(event, handler);
            return true;
        }
        return false;
    }
    
    /**
     * Emit an event on a component by mount ID
     * @param {string} mountId - Mount ID of the component
     * @param {string} event - Event name
     * @param  {...any} args - Event arguments
     */
    emitOnComponent(mountId, event, ...args) {
        const wrapper = this.components[mountId];
        if (wrapper && wrapper.instance) {
            wrapper.instance.$emit(event, ...args);
            return true;
        }
        return false;
    }
    
    /**
     * Clean up all created components
     */
    cleanupComponents() {
        console.log('Cleaning up test components');
        // Destroy all components
        Object.values(this.components).forEach(wrapper => {
            try {
                if (wrapper.instance) {
                    wrapper.instance.$destroy();
                }
            } catch (error) {
                console.warn('Error destroying component:', error);
            }
        });
        
        // Remove all mount points
        Object.values(this.mountPoints).forEach(mountPoint => {
            try {
                if (mountPoint && mountPoint.parentNode) {
                    mountPoint.parentNode.removeChild(mountPoint);
                }
            } catch (error) {
                console.warn('Error removing mount point:', error);
            }
        });
        
        // Clear references
        this.components = {};
        this.mountPoints = {};
        this.eventListeners = {};
    }
    
    /**
     * Create a mock data set for testing
     * @param {number} count - Number of items to create
     * @returns {Array} Mock stock data items
     */
    createMockStockData(count = 10) {
        const items = [];
        const categories = ['Beverages', 'Dairy', 'Meat', 'Produce', 'Dry Goods'];
        const costCenters = ['Kitchen', 'Bar', 'Catering'];
        
        for (let i = 0; i < count; i++) {
            const openingQty = Math.floor(Math.random() * 100) + 50;
            const openingValue = openingQty * (Math.random() * 10 + 5);
            const purchaseQty = Math.floor(Math.random() * 50);
            const purchaseValue = purchaseQty * (Math.random() * 10 + 5);
            const closingQty = Math.floor(Math.random() * (openingQty + purchaseQty - 10)) + 10;
            const closingValue = closingQty * (Math.random() * 10 + 5);
            const usage = openingQty + purchaseQty - closingQty;
            const unitCost = (openingValue / openingQty + closingValue / closingQty) / 2;
            
            items.push({
                itemCode: `ITEM${i + 1000}`,
                description: `Test Item ${i + 1}`,
                category: categories[i % categories.length],
                costCenter: costCenters[i % costCenters.length],
                openingQty,
                openingValue,
                purchaseQty,
                purchaseValue,
                closingQty,
                closingValue,
                unitCost,
                usage,
                usageValue: usage * unitCost
            });
        }
        
        return items;
    }
    
    /**
     * Filter stock data by category
     * @param {Array} stockData - Stock data to filter
     * @param {Array} categories - Categories to filter by
     * @returns {Array} Filtered stock data
     */
    filterStockDataByCategory(stockData, categories) {
        if (!categories || categories.length === 0 || categories.includes('All Categories')) {
            return stockData;
        }
        
        return stockData.filter(item => categories.includes(item.category));
    }
    
    /**
     * Filter stock data by cost center
     * @param {Array} stockData - Stock data to filter
     * @param {Array} costCenters - Cost centers to filter by
     * @returns {Array} Filtered stock data
     */
    filterStockDataByCostCenter(stockData, costCenters) {
        if (!costCenters || costCenters.length === 0 || costCenters.includes('All Cost Centers')) {
            return stockData;
        }
        
        return stockData.filter(item => costCenters.includes(item.costCenter));
    }
    
    /**
     * Process stock data to calculate usage values
     * @param {Array} stockData - Stock data to process
     * @returns {Array} Processed stock data
     */
    processStockData(stockData) {
        return stockData.map(item => {
            const usage = item.openingQty + item.purchaseQty - item.closingQty;
            const usageValue = usage * item.unitCost;
            
            return {
                ...item,
                usage,
                usageValue
            };
        });
    }
}

// Initialize and expose the IntegrationTestUtils class
IntegrationTestUtils.init = function() {
    // Initialize the class
};

// Export the default instance
export default window.FoodCost.tests.testUtils = new IntegrationTestUtils();

// Create a shared instance
window.FoodCost.tests.testUtils = new IntegrationTestUtils();

export { IntegrationTestUtils };
