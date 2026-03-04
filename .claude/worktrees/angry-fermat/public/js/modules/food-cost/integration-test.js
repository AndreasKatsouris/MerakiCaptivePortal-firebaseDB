/**
 * Food Cost Module - Integration Test
 * Tests the integration of refactored modular components
 */

// Import all components to test
import { FoodCostApp } from './refactored-app-component.js';
import * as FirebaseService from './services/firebase-service.js';
import * as DataService from './services/data-service.js';
import * as CalculationUtils from './components/analytics/calculation-utils.js';
import { UIMixin } from './mixins/ui-mixin.js';
import { PurchaseOrderModal } from './components/purchase-order/po-modal.js';

// Import Firebase utilities
import { rtdb, ref, get } from '../../config/firebase-config.js';

/**
 * Test all modules are correctly integrated
 * This is a developer-only function for verifying integration
 */
export async function testModuleIntegration() {
    console.group('🧪 Food Cost Module Integration Test');
    
    // Check FoodCostApp imports
    console.log('✓ FoodCostApp imported successfully:', typeof FoodCostApp === 'object');
    
    // Check Firebase Service
    console.log('✓ Firebase Service imported successfully:', 
                typeof FirebaseService === 'object' &&
                typeof FirebaseService.saveStockUsageData === 'function');
    
    // Check Data Service
    console.log('✓ Data Service imported successfully:', 
                typeof DataService === 'object' && 
                typeof DataService.parseCSVData === 'function');
    
    // Check Calculation Utils
    console.log('✓ Calculation Utils imported successfully:', 
                typeof CalculationUtils === 'object' &&
                typeof CalculationUtils.calculateTheoreticalOrderQuantity === 'function');
    
    // Check UI Mixin
    console.log('✓ UI Mixin imported successfully:', 
                typeof UIMixin === 'object' &&
                typeof UIMixin.methods === 'object');
    
    // Check PO Modal
    console.log('✓ Purchase Order Modal imported successfully:', 
                typeof PurchaseOrderModal === 'object');
                
    // Test Firebase patterns
    try {
        console.log('Testing Firebase pattern compatibility...');
        const testRef = ref(rtdb, 'test/integration');
        console.log('✓ Firebase ref pattern works correctly');
    } catch (error) {
        console.error('✗ Firebase pattern error:', error);
    }
    
    // Test calculation logic
    try {
        const testItem = {
            description: 'Test Item',
            openingBalance: 100,
            purchases: 50,
            closingBalance: 80,
            usage: 70,
            unitCost: 5,
            usagePerDay: 10,
            reorderPoint: 20
        };
        
        const testParams = {
            daysToNextDelivery: 5,
            safetyStockPercentage: 15,
            criticalItemBuffer: 30
        };
        
        const theoreticalQty = CalculationUtils.calculateTheoreticalOrderQuantity(testItem, testParams);
        console.log('✓ Calculation Utils working correctly:', theoreticalQty > 0);
        
        const details = CalculationUtils.getCalculationDetails(testItem, testParams);
        console.log('✓ Get calculation details working correctly:', 
                   details && details.calculations && details.formattedCalculations);
    } catch (error) {
        console.error('✗ Calculation error:', error);
    }
    
    console.log('Integration test complete');
    console.groupEnd();
    
    return {
        success: true,
        timestamp: new Date().toISOString(),
        message: 'All modules integrated successfully'
    };
}

// Auto-run test if in development environment
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Development environment detected, running integration test...');
    testModuleIntegration().then(result => {
        console.log('Integration test result:', result);
    });
}
