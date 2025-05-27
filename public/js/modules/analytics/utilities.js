/**
 * Analytics Module - Utilities
 * 
 * This file provides utility functions for the Analytics module.
 */

const Utilities = {
    /**
     * Format a number as currency
     * @param {number} value - The value to format
     * @param {string} currencyCode - Currency code (default: 'USD')
     * @returns {string} Formatted currency string
     */
    formatCurrency(value, currencyCode = 'USD') {
        if (isNaN(value) || value === null || value === undefined) {
            return '$0.00';
        }
        
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode
        }).format(value);
    },
    
    /**
     * Format a number with specified decimal places
     * @param {number} value - The value to format
     * @param {number} decimals - Number of decimal places (default: 2)
     * @returns {string} Formatted number string
     */
    formatNumber(value, decimals = 2) {
        if (isNaN(value) || value === null || value === undefined) {
            return '0';
        }
        
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    },
    
    /**
     * Format a date
     * @param {string|number|Date} date - The date to format
     * @param {string} format - Format type ('short', 'medium', 'long')
     * @returns {string} Formatted date string
     */
    formatDate(date, format = 'medium') {
        if (!date) return '';
        
        const dateObj = date instanceof Date ? date : new Date(date);
        
        if (isNaN(dateObj.getTime())) return '';
        
        switch (format) {
            case 'short':
                return dateObj.toLocaleDateString();
            case 'long':
                return dateObj.toLocaleDateString(undefined, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            case 'iso':
                return dateObj.toISOString().split('T')[0];
            default: // medium
                return dateObj.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
        }
    },
    
    /**
     * Calculate date range difference in days
     * @param {string|Date} startDate - Start date
     * @param {string|Date} endDate - End date
     * @returns {number} Number of days between dates
     */
    calculateDateDifference(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        // Calculate the difference in milliseconds
        const diffTime = Math.abs(end - start);
        
        // Convert to days and include both start and end dates
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    },
    
    /**
     * Generate a date range array
     * @param {string|Date} startDate - Start date
     * @param {string|Date} endDate - End date
     * @returns {Array} Array of date strings in ISO format
     */
    generateDateRange(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const dateRange = [];
        
        // Set hours to ensure proper date comparison
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        
        // Loop through dates
        const current = new Date(start);
        while (current <= end) {
            dateRange.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }
        
        return dateRange;
    },
    
    /**
     * Round a number to specified decimal places
     * @param {number} value - The value to round
     * @param {number} decimals - Number of decimal places
     * @returns {number} Rounded number
     */
    round(value, decimals = 2) {
        if (isNaN(value) || value === null || value === undefined) {
            return 0;
        }
        
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    },
    
    /**
     * Calculate percentage change between two values
     * @param {number} oldValue - Original value
     * @param {number} newValue - New value
     * @returns {number} Percentage change
     */
    calculatePercentageChange(oldValue, newValue) {
        if (oldValue === 0) {
            return newValue === 0 ? 0 : 100; // Special case for starting from zero
        }
        
        return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
    },
    
    /**
     * Format percentage change with appropriate sign
     * @param {number} percentChange - Percentage change value
     * @returns {string} Formatted percentage change
     */
    formatPercentageChange(percentChange) {
        if (isNaN(percentChange) || percentChange === null || percentChange === undefined) {
            return '0%';
        }
        
        const sign = percentChange > 0 ? '+' : '';
        return `${sign}${this.round(percentChange, 1)}%`;
    },
    
    /**
     * Debounce a function to limit how often it can be called
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait = 300) {
        let timeout;
        
        return function(...args) {
            const context = this;
            
            clearTimeout(timeout);
            
            timeout = setTimeout(() => {
                func.apply(context, args);
            }, wait);
        };
    },
    
    /**
     * Group an array of objects by a specified key
     * @param {Array} array - Array to group
     * @param {string|Function} key - Key to group by
     * @returns {Object} Grouped object
     */
    groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = typeof key === 'function' ? key(item) : item[key];
            
            if (!result[groupKey]) {
                result[groupKey] = [];
            }
            
            result[groupKey].push(item);
            
            return result;
        }, {});
    },
    
    /**
     * Extract a list of unique values for a property from an array of objects
    }
    
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode
    }).format(value);
},

/**
 * Format a number with specified decimal places
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted number string
 */
formatNumber(value, decimals = 2) {
    if (isNaN(value) || value === null || value === undefined) {
        return '0';
    }
    
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value);
},

/**
 * Format a date
 * @param {string|number|Date} date - The date to format
 * @param {string} format - Format type ('short', 'medium', 'long')
 * @returns {string} Formatted date string
 */
formatDate(date, format = 'medium') {
    if (!date) return '';
    
    const dateObj = date instanceof Date ? date : new Date(date);
    
    if (isNaN(dateObj.getTime())) return '';
    
    switch (format) {
        case 'short':
            return dateObj.toLocaleDateString();
        case 'long':
            return dateObj.toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        case 'iso':
            return dateObj.toISOString().split('T')[0];
        default: // medium
            return dateObj.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
    }
},

/**
 * Calculate date range difference in days
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @returns {number} Number of days between dates
 */
calculateDateDifference(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate the difference in milliseconds
    const diffTime = Math.abs(end - start);
    
    // Convert to days and include both start and end dates
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
},

/**
 * Generate a date range array
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @returns {Array} Array of date strings in ISO format
 */
generateDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dateRange = [];
    
    // Set hours to ensure proper date comparison
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    // Loop through dates
    const current = new Date(start);
    while (current <= end) {
        dateRange.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }
    
    return dateRange;
},

/**
 * Round a number to specified decimal places
 * @param {number} value - The value to round
 * @param {number} decimals - Number of decimal places
 * @returns {number} Rounded number
 */
round(value, decimals = 2) {
    if (isNaN(value) || value === null || value === undefined) {
        return 0;
    }
    
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
},

/**
 * Calculate percentage change between two values
 * @param {number} oldValue - Original value
 * @param {number} newValue - New value
 * @returns {number} Percentage change
 */
calculatePercentageChange(oldValue, newValue) {
    if (oldValue === 0) {
        return newValue === 0 ? 0 : 100; // Special case for starting from zero
    }
    
    return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
},

/**
 * Format percentage change with appropriate sign
 * @param {number} percentChange - Percentage change value
 * @returns {string} Formatted percentage change
 */
formatPercentageChange(percentChange) {
    if (isNaN(percentChange) || percentChange === null || percentChange === undefined) {
        return '0%';
    }
    
    const sign = percentChange > 0 ? '+' : '';
    return `${sign}${this.round(percentChange, 1)}%`;
},

/**
 * Debounce a function to limit how often it can be called
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
debounce(func, wait = 300) {
    let timeout;
    
    return function(...args) {
        const context = this;
        
        clearTimeout(timeout);
        
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
},

/**
 * Group an array of objects by a specified key
 * @param {Array} array - Array to group
 * @param {string|Function} key - Key to group by
 * @returns {Object} Grouped object
 */
groupBy(array, key) {
    return array.reduce((result, item) => {
        const groupKey = typeof key === 'function' ? key(item) : item[key];
        
        if (!result[groupKey]) {
            result[groupKey] = [];
        }
        
        result[groupKey].push(item);
        
        return result;
    }, {});
},

/**
 * Extract a list of unique values for a property from an array of objects
 * @param {Array} array - Array of objects
 * @param {string} property - Property to extract
 * @returns {Array} Array of unique values
 */
extractUniqueValues(array, property) {
    if (!Array.isArray(array) || array.length === 0) {
        return [];
    }
    
    return [...new Set(array.map(item => item[property]).filter(value => value != null))];
},

/**
 * Format a date for display
 * @param {Date|string} date - The date to format
 * @param {string} format - Format style (default: 'short')
 * @returns {string} Formatted date string
 */
formatDateForDisplay(date, format = 'short') {
    if (!date) return 'Unknown';
    
    try {
        // Handle string dates
        const dateObj = (typeof date === 'string') ? new Date(date) : date;
        
        // Check if date is valid
        if (isNaN(dateObj.getTime())) {
            return 'Invalid Date';
        }
        
        const options = { year: 'numeric', month: 'numeric', day: 'numeric' };
        
        // Customize the format if needed
        if (format === 'full') {
            options.weekday = 'long';
            options.month = 'long';
        } else if (format === 'month-year') {
            delete options.day;
        }
        
        return dateObj.toLocaleDateString('en-US', options);
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Error';
    }
}
};

// Export the Utilities
export { Utilities };
