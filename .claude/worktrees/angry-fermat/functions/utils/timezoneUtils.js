/**
 * Timezone utility functions for SAST (South Africa Standard Time) conversion
 * SAST is UTC+2 (Africa/Johannesburg)
 */

/**
 * Convert UTC timestamp to SAST timezone
 * @param {number|string|Date} timestamp - UTC timestamp, ISO string, or Date object
 * @returns {Date} Date object adjusted to SAST timezone
 */
function convertToSAST(timestamp) {
    if (!timestamp) {
        return new Date();
    }
    
    // Create Date object from timestamp
    const date = new Date(timestamp);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
        console.error('Invalid timestamp provided:', timestamp);
        return new Date();
    }
    
    return date;
}

/**
 * Format timestamp to SAST time string
 * @param {number|string|Date} timestamp - UTC timestamp, ISO string, or Date object
 * @param {Object} options - Formatting options
 * @returns {string} Formatted time string in SAST
 */
function formatToSASTTime(timestamp, options = {}) {
    const date = convertToSAST(timestamp);
    
    const defaultOptions = {
        timeZone: 'Africa/Johannesburg',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        ...options
    };
    
    try {
        return date.toLocaleTimeString('en-ZA', defaultOptions);
    } catch (error) {
        console.error('Error formatting time to SAST:', error);
        // Fallback to basic formatting
        return date.toLocaleTimeString('en-US', {
            timeZone: 'Africa/Johannesburg',
            hour12: true,
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

/**
 * Format timestamp to SAST date and time string
 * @param {number|string|Date} timestamp - UTC timestamp, ISO string, or Date object
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date and time string in SAST
 */
function formatToSASTDateTime(timestamp, options = {}) {
    const date = convertToSAST(timestamp);
    
    const defaultOptions = {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        ...options
    };
    
    try {
        return date.toLocaleString('en-ZA', defaultOptions);
    } catch (error) {
        console.error('Error formatting datetime to SAST:', error);
        // Fallback to basic formatting
        return date.toLocaleString('en-US', {
            timeZone: 'Africa/Johannesburg',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }
}

/**
 * Get current SAST timestamp
 * @returns {number} Current timestamp in SAST
 */
function getCurrentSASTTimestamp() {
    return Date.now();
}

/**
 * Get current SAST date object
 * @returns {Date} Current Date object
 */
function getCurrentSASTDate() {
    return new Date();
}

/**
 * Format queue timestamp for WhatsApp messages
 * @param {number|string|Date} timestamp - UTC timestamp, ISO string, or Date object
 * @returns {string} Formatted time string for WhatsApp (e.g., "2:30 PM")
 */
function formatQueueTime(timestamp) {
    return formatToSASTTime(timestamp, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * Format queue datetime for WhatsApp messages
 * @param {number|string|Date} timestamp - UTC timestamp, ISO string, or Date object
 * @returns {string} Formatted datetime string for WhatsApp (e.g., "Jan 15, 2:30 PM")
 */
function formatQueueDateTime(timestamp) {
    return formatToSASTDateTime(timestamp, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * Check if a timestamp is from today (in SAST)
 * @param {number|string|Date} timestamp - UTC timestamp, ISO string, or Date object
 * @returns {boolean} True if timestamp is from today in SAST
 */
function isToday(timestamp) {
    const date = convertToSAST(timestamp);
    const today = getCurrentSASTDate();
    
    // Compare dates in SAST timezone
    const dateString = date.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' });
    const todayString = today.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' });
    
    return dateString === todayString;
}

/**
 * Get timezone info for SAST
 * @returns {Object} Timezone information
 */
function getSASTTimezoneInfo() {
    return {
        name: 'South Africa Standard Time',
        abbreviation: 'SAST',
        timezone: 'Africa/Johannesburg',
        offset: '+02:00',
        utcOffset: 2
    };
}

module.exports = {
    convertToSAST,
    formatToSASTTime,
    formatToSASTDateTime,
    getCurrentSASTTimestamp,
    getCurrentSASTDate,
    formatQueueTime,
    formatQueueDateTime,
    isToday,
    getSASTTimezoneInfo
};