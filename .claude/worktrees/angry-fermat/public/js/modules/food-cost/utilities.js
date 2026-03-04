/**
 * Food Cost Module - Utilities
 * Shared utility functions for the Food Cost module
 * Version: 1.9.4-2025-04-19
 */

/**
 * Format a currency value
 * @param {number} value - The value to format
 * @param {string} [currency=''] - The currency symbol (empty by default)
 * @param {number} [decimals=2] - The number of decimal places
 * @returns {string} - The formatted currency string
 */
export function formatCurrency(value, currency = '', decimals = 2) {
    if (value === undefined || value === null || isNaN(value)) {
        return `${currency}0.00`;
    }
    return `${currency}${Number(value).toFixed(decimals)}`;
}

/**
 * Generate random colors for chart segments
 * @param {number} count - The number of colors needed
 * @returns {Array} - Array of color strings
 */
export function generateColors(count) {
    const colors = [];
    const baseColors = [
        '#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b',
        '#858796', '#5a5c69', '#6f42c1', '#20c9a6', '#27a844',
        '#fd7e14', '#e83e8c', '#f8f9fc', '#ced4da', '#6c757d'
    ];
    
    // Use predefined colors first, then generate random ones if needed
    for (let i = 0; i < count; i++) {
        if (i < baseColors.length) {
            colors.push(baseColors[i]);
        } else {
            // Generate random color
            const r = Math.floor(Math.random() * 200) + 20; // Avoid too dark/light
            const g = Math.floor(Math.random() * 200) + 20;
            const b = Math.floor(Math.random() * 200) + 20;
            colors.push(`rgb(${r}, ${g}, ${b})`);
        }
    }
    
    return colors;
}

/**
 * Extract numeric value from a string
 * @param {string} value - String to extract numeric value from
 * @returns {number} - Extracted numeric value
 */
export function extractNumericValue(value) {
    if (value === undefined || value === null) return 0;
    
    if (typeof value === 'number') return value;
    
    // Handle string values
    if (typeof value === 'string') {
        // Remove currency symbols and other non-numeric characters except for decimal point
        const numericString = value.replace(/[^0-9.-]/g, '');
        return parseFloat(numericString) || 0;
    }
    
    return 0;
}

/**
 * Format a value for display
 * @param {any} value - The value to format
 * @returns {string} - The formatted value
 */
export function formatValue(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return '0';
    }
    return typeof value === 'number' ? Number(value).toFixed(2) : value;
}

/**
 * Calculate the number of days between two dates
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {number} - Number of days between the dates
 */
export function calculateDaysBetweenDates(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        // Check for valid dates
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return 0;
        }
        
        // Calculate difference in days
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Include the end date in the count (adding 1)
        return diffDays + 1;
    } catch (error) {
        console.error('Error calculating days between dates:', error);
        return 0;
    }
}

/**
 * Get a category badge class based on the category name
 * @param {string} category - The category name
 * @returns {string} - CSS class for the badge
 */
export function getCategoryBadgeClass(category) {
    if (!category) return 'badge-secondary';
    
    // Normalize the category name to lowercase for comparison
    const normalizedCategory = category.toLowerCase();
    
    // Map categories to badge classes based on their content
    if (normalizedCategory.includes('meat') || normalizedCategory.includes('beef') || 
        normalizedCategory.includes('chicken') || normalizedCategory.includes('pork')) {
        return 'badge-danger';
    } else if (normalizedCategory.includes('fish') || normalizedCategory.includes('seafood')) {
        return 'badge-info';
    } else if (normalizedCategory.includes('vegetable') || normalizedCategory.includes('produce') || 
               normalizedCategory.includes('veg')) {
        return 'badge-success';
    } else if (normalizedCategory.includes('dairy') || normalizedCategory.includes('milk') || 
               normalizedCategory.includes('cheese')) {
        return 'badge-light';
    } else if (normalizedCategory.includes('grain') || normalizedCategory.includes('bread') || 
               normalizedCategory.includes('pasta')) {
        return 'badge-warning';
    } else if (normalizedCategory.includes('spice') || normalizedCategory.includes('seasoning')) {
        return 'badge-dark';
    } else if (normalizedCategory.includes('beverage') || normalizedCategory.includes('drink')) {
        return 'badge-primary';
    }
    
    // Default badge class
    return 'badge-secondary';
}

/**
 * Format a date for display
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} - Formatted date string (e.g., "Apr 12, 2025")
 */
export function formatDate(dateString) {
    if (!dateString) {
        return 'N/A';
    }
    
    try {
        const date = new Date(dateString);
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return dateString;
        }
        
        // Format date
        return date.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return dateString;
    }
}

/**
 * Format a date string to a simple format (e.g., "03/15/2025")
 * @param {string} dateString - Date string to format
 * @returns {string} - Formatted date string
 */
export function formatSimpleDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString();
}

/**
 * Generate a timestamp-based key for database entries
 * @returns {string} - Timestamp-based key in YYYYMMDD_HHMMSS format
 */
export function generateTimestampKey() {
    const now = new Date();
    
    // Format date components
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    // Create timestamp key in YYYYMMDD_HHMMSS format
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * Get yesterday's date in ISO format (YYYY-MM-DD)
 * @returns {string} - Yesterday's date in ISO format
 */
export function getYesterdayDate() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
}

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 * @returns {string} - Today's date in ISO format
 */
export function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

/**
 * Calculate stock period days based on date range
 * @param {string} openingDate - Opening stock date in YYYY-MM-DD format
 * @param {string} closingDate - Closing stock date in YYYY-MM-DD format
 * @returns {number} - Number of days in the stock period (minimum 1)
 */
export function calculateStockPeriodDays(openingDate, closingDate) {
    if (!openingDate || !closingDate) return 1;
    
    const openingDateObj = new Date(openingDate);
    const closingDateObj = new Date(closingDate);
    
    // Calculate days difference
    const timeDiff = closingDateObj - openingDateObj;
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    // Ensure at least 1 day
    return Math.max(1, daysDiff);
}

/**
 * Format number with 2 decimal places
 * @param {number} num - Number to format
 * @returns {string} - Formatted number
 */
export function formatNumber(num) {
    return (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2);
}
