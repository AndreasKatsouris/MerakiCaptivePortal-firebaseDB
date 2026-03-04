/**
 * Phone Number Monitoring System
 * Tracks and monitors phone number changes across the application
 */

class PhoneNumberMonitor {
    constructor() {
        this.listeners = new Set();
        this.changeLog = [];
        this.maxLogSize = 1000;
        this.isMonitoring = false;
        
        // Initialize monitoring
        this.startMonitoring();
    }

    /**
     * Start monitoring phone number changes
     */
    startMonitoring() {
        if (this.isMonitoring) {
            console.log('📱 [PhoneMonitor] Already monitoring phone numbers');
            return;
        }

        this.isMonitoring = true;
        console.log('📱 [PhoneMonitor] Starting phone number monitoring');

        // Monitor users collection for phone number changes
        if (typeof rtdb !== 'undefined' && rtdb) {
            const usersRef = ref(rtdb, 'users');
            
            // Listen for changes
            onValue(usersRef, (snapshot) => {
                if (snapshot.exists()) {
                    this.processUserDataSnapshot(snapshot);
                }
            });
        }
    }

    /**
     * Process user data snapshot for phone number changes
     * @param {Object} snapshot - Firebase snapshot
     */
    processUserDataSnapshot(snapshot) {
        const users = snapshot.val();
        
        Object.entries(users).forEach(([userId, userData]) => {
            this.validateUserPhoneNumbers(userId, userData);
        });
    }

    /**
     * Validate that user has expected phone numbers
     * @param {string} userId - User ID
     * @param {Object} userData - User data
     */
    validateUserPhoneNumbers(userId, userData) {
        const phoneFields = ['phoneNumber', 'phone', 'businessPhone'];
        const phoneStatus = {};
        let hasAnyPhone = false;

        phoneFields.forEach(field => {
            const value = userData[field];
            phoneStatus[field] = {
                exists: !!value,
                value: value || null,
                isEmpty: value === '' || value === null || value === undefined
            };
            
            if (value && value.trim()) {
                hasAnyPhone = true;
            }
        });

        // Check for suspicious patterns
        this.checkSuspiciousPatterns(userId, userData, phoneStatus);

        // Log if user has no phone numbers but should have them
        if (!hasAnyPhone && this.shouldHavePhoneNumber(userData)) {
            this.logSuspiciousChange(userId, 'MISSING_PHONE_NUMBERS', {
                userData,
                phoneStatus,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Check for suspicious patterns in user data
     * @param {string} userId - User ID
     * @param {Object} userData - User data
     * @param {Object} phoneStatus - Phone field status
     */
    checkSuspiciousPatterns(userId, userData, phoneStatus) {
        const suspiciousPatterns = [];

        // Pattern 1: Admin user without phone number
        if ((userData.isAdmin || userData.role === 'admin') && !this.hasValidPhoneNumber(phoneStatus)) {
            suspiciousPatterns.push('ADMIN_WITHOUT_PHONE');
        }

        // Pattern 2: Empty phone number fields
        Object.entries(phoneStatus).forEach(([field, status]) => {
            if (status.isEmpty && status.value === '') {
                suspiciousPatterns.push(`EMPTY_${field.toUpperCase()}`);
            }
        });

        // Pattern 3: Recently updated but missing phone numbers
        if (userData.updatedAt && Date.now() - userData.updatedAt < 300000) { // 5 minutes
            if (!this.hasValidPhoneNumber(phoneStatus)) {
                suspiciousPatterns.push('RECENT_UPDATE_MISSING_PHONE');
            }
        }

        // Log suspicious patterns
        if (suspiciousPatterns.length > 0) {
            this.logSuspiciousChange(userId, 'SUSPICIOUS_PATTERNS', {
                patterns: suspiciousPatterns,
                userData,
                phoneStatus,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Check if user should have a phone number
     * @param {Object} userData - User data
     * @returns {boolean} Whether user should have phone number
     */
    shouldHavePhoneNumber(userData) {
        return !!(
            userData.isAdmin ||
            userData.role === 'admin' ||
            userData.businessName ||
            userData.subscriptionStatus === 'active'
        );
    }

    /**
     * Check if user has valid phone number
     * @param {Object} phoneStatus - Phone field status
     * @returns {boolean} Whether user has valid phone number
     */
    hasValidPhoneNumber(phoneStatus) {
        return Object.values(phoneStatus).some(status => 
            status.exists && status.value && status.value.trim() && !status.isEmpty
        );
    }

    /**
     * Log suspicious phone number changes
     * @param {string} userId - User ID
     * @param {string} type - Type of suspicious change
     * @param {Object} details - Additional details
     */
    logSuspiciousChange(userId, type, details) {
        const logEntry = {
            userId,
            type,
            details,
            timestamp: new Date().toISOString(),
            stack: new Error().stack
        };

        // Add to change log
        this.changeLog.push(logEntry);
        
        // Limit log size
        if (this.changeLog.length > this.maxLogSize) {
            this.changeLog.shift();
        }

        // Console error for immediate attention
        console.error(`🚨 [PhoneMonitor] SUSPICIOUS PHONE NUMBER CHANGE:`, logEntry);

        // Notify listeners
        this.notifyListeners(logEntry);

        // Send to analytics if available
        if (typeof window !== 'undefined' && window.analytics) {
            window.analytics.track('suspicious_phone_change', {
                userId,
                type,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Add listener for phone number changes
     * @param {Function} listener - Callback function
     */
    addListener(listener) {
        this.listeners.add(listener);
    }

    /**
     * Remove listener for phone number changes
     * @param {Function} listener - Callback function
     */
    removeListener(listener) {
        this.listeners.delete(listener);
    }

    /**
     * Notify all listeners of phone number change
     * @param {Object} logEntry - Log entry
     */
    notifyListeners(logEntry) {
        this.listeners.forEach(listener => {
            try {
                listener(logEntry);
            } catch (error) {
                console.error('❌ [PhoneMonitor] Error notifying listener:', error);
            }
        });
    }

    /**
     * Get change log
     * @returns {Array} Array of change log entries
     */
    getChangeLog() {
        return [...this.changeLog];
    }

    /**
     * Clear change log
     */
    clearChangeLog() {
        this.changeLog = [];
        console.log('📱 [PhoneMonitor] Change log cleared');
    }

    /**
     * Get monitoring statistics
     * @returns {Object} Monitoring statistics
     */
    getStats() {
        const stats = {
            totalChanges: this.changeLog.length,
            isMonitoring: this.isMonitoring,
            listeners: this.listeners.size,
            recentChanges: this.changeLog.filter(entry => 
                Date.now() - new Date(entry.timestamp).getTime() < 3600000 // 1 hour
            ).length
        };

        return stats;
    }

    /**
     * Generate monitoring report
     * @returns {string} Formatted report
     */
    generateReport() {
        const stats = this.getStats();
        const recentChanges = this.changeLog.filter(entry => 
            Date.now() - new Date(entry.timestamp).getTime() < 86400000 // 24 hours
        );

        let report = `📱 Phone Number Monitoring Report\n`;
        report += `================================\n`;
        report += `Monitoring Status: ${stats.isMonitoring ? 'Active' : 'Inactive'}\n`;
        report += `Total Changes Logged: ${stats.totalChanges}\n`;
        report += `Recent Changes (24h): ${recentChanges.length}\n`;
        report += `Active Listeners: ${stats.listeners}\n\n`;

        if (recentChanges.length > 0) {
            report += `Recent Changes:\n`;
            recentChanges.forEach(change => {
                report += `- ${change.timestamp}: ${change.type} (User: ${change.userId})\n`;
            });
        }

        return report;
    }
}

// Create global instance
const phoneNumberMonitor = new PhoneNumberMonitor();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = phoneNumberMonitor;
} else if (typeof window !== 'undefined') {
    window.PhoneNumberMonitor = phoneNumberMonitor;
}