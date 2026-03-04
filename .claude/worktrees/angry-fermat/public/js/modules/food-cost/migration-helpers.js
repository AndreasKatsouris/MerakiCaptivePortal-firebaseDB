/**
 * Food Cost Module - Migration Helpers
 * Helps with transitioning from the monolithic structure to modular architecture
 */

// Import components from both old and new architecture
import { FoodCostApp as RefactoredApp } from './refactored-app-component.js';
// Note: Original app-component is no longer directly imported as it's been moved to backup

// Import Firebase services according to project standards
import { rtdb, ref, get, set, update, push, remove } from '../../config/firebase-config.js';

// Import services
import * as FirebaseService from './services/firebase-service.js';
import * as DataService from './services/data-service.js';
import { calculateDerivedValues } from './data-processor.js';

/**
 * Detect which architecture (old or new) is in use
 * @returns {string} - 'legacy' or 'refactored'
 */
export function detectArchitecture() {
    // This is a simplistic version, you might want to add more checks
    return typeof window.MODULE_VERSION === 'string' && 
           window.MODULE_VERSION.includes('REFACTORED') ? 'refactored' : 'legacy';
}

/**
 * Ensure Firebase operation compatibility
 * Wraps the Firebase operation in the appropriate pattern based on architecture
 * @param {Function} operation - Firebase operation to perform
 * @param {Array} params - Parameters for the operation
 * @returns {Promise} - Result of the operation
 */
export async function ensureFirebaseCompatibility(operation, ...params) {
    // Use the correct Firebase pattern based on the memory guidelines
    try {
        return await operation(...params);
    } catch (error) {
        console.error('Firebase operation error:', error);
        throw error;
    }
}

/**
 * Migrate data from old format to new format
 * @param {Object} legacyData - Data in the old format
 * @returns {Object} - Data in the new format
 */
export function migrateDataFormat(legacyData) {
    if (!legacyData) return null;
    
    // Convert from old format to new format if needed
    // This is just a placeholder - you would implement the actual conversion
    return legacyData;
}

/**
 * Save data to Firebase using the correct pattern
 * @param {string} path - Firebase path
 * @param {Object} data - Data to save
 * @returns {Promise} - Result of save operation
 */
export async function saveToFirebase(path, data) {
    try {
        // Use the correct Firebase pattern
        await set(ref(rtdb, path), data);
        return {
            success: true,
            message: 'Data saved successfully'
        };
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        return {
            success: false,
            error: error.message,
            message: 'Failed to save data'
        };
    }
}

/**
 * Load data from Firebase using the correct pattern
 * @param {string} path - Firebase path
 * @returns {Promise<Object>} - Loaded data
 */
export async function loadFromFirebase(path) {
    try {
        const snapshot = await get(ref(rtdb, path));
        return snapshot.val();
    } catch (error) {
        console.error('Error loading from Firebase:', error);
        throw error;
    }
}

/**
 * Process stock data using either legacy or refactored methods
 * @param {Array} parsedData - Raw parsed data
 * @param {Object} headerMapping - CSV header mapping
 * @param {Object} params - Additional parameters
 * @returns {Array} - Processed stock data
 */
export function processStockData(parsedData, headerMapping, params = {}) {
    const architecture = detectArchitecture();
    
    if (architecture === 'refactored') {
        // Use the new DataService
        return DataService.processDataWithMapping(parsedData, headerMapping, params);
    } else {
        // Use the legacy calculation method
        // This assumes the legacy method is available globally or imported
        // You would need to implement the appropriate fallback
        const stockData = calculateDerivedValues(
            parsedData, 
            params.stockPeriodDays || 7, 
            params.daysToNextDelivery || 5
        );
        
        return stockData;
    }
}

/**
 * Check compatibility and provide backward compatibility warnings
 * @returns {Object} - Compatibility information
 */
export function checkCompatibility() {
    const architecture = detectArchitecture();
    const version = window.MODULE_VERSION || 'unknown';
    
    console.log(`Food Cost Module Architecture: ${architecture}, Version: ${version}`);
    
    return {
        architecture,
        version,
        isCompatible: true, // Modify this based on actual compatibility checks
        warnings: [] // Add warnings if needed
    };
}

// Initialize and verify compatibility on module load
checkCompatibility();
