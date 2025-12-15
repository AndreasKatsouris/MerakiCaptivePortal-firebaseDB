/**
 * Phone Number Alert System
 * Provides visual and audio alerts when phone numbers are detected missing
 */

class PhoneNumberAlerts {
    constructor() {
        this.alertsEnabled = true;
        this.soundEnabled = true;
        this.logHistory = [];
        this.maxLogHistory = 100;
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    /**
     * Initialize the alert system
     */
    initialize() {
        // Create alert container
        this.createAlertContainer();
        
        // Subscribe to phone number monitor
        if (typeof window.PhoneNumberMonitor !== 'undefined') {
            window.PhoneNumberMonitor.addListener(this.handlePhoneNumberChange.bind(this));
        }
        
        console.log('📱 Phone Number Alert System initialized');
    }

    /**
     * Create alert container in DOM
     */
    createAlertContainer() {
        // Check if document.body exists
        if (!document.body) {
            console.warn('📱 [PhoneAlerts] Document body not ready, retrying...');
            setTimeout(() => this.createAlertContainer(), 100);
            return;
        }

        // Create alerts container if it doesn't exist
        if (!document.getElementById('phoneNumberAlerts')) {
            const alertsContainer = document.createElement('div');
            alertsContainer.id = 'phoneNumberAlerts';
            alertsContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                max-width: 400px;
                pointer-events: none;
            `;
            document.body.appendChild(alertsContainer);
            console.log('📱 [PhoneAlerts] Alert container created');
        }
    }

    /**
     * Handle phone number change events
     * @param {Object} changeData - Change data from monitor
     */
    handlePhoneNumberChange(changeData) {
        if (!this.alertsEnabled) return;

        const { userId, type, details } = changeData;
        
        // Log the change
        this.logChange(changeData);
        
        // Determine alert level
        const alertLevel = this.determineAlertLevel(type, details);
        
        // Show appropriate alert
        switch (alertLevel) {
            case 'critical':
                this.showCriticalAlert(changeData);
                break;
            case 'warning':
                this.showWarningAlert(changeData);
                break;
            case 'info':
                this.showInfoAlert(changeData);
                break;
        }
    }

    /**
     * Determine alert level based on change type and details
     * @param {string} type - Change type
     * @param {Object} details - Change details
     * @returns {string} Alert level
     */
    determineAlertLevel(type, details) {
        const criticalTypes = [
            'ADMIN_WITHOUT_PHONE',
            'MISSING_PHONE_NUMBERS',
            'RECENT_UPDATE_MISSING_PHONE'
        ];
        
        const warningTypes = [
            'SUSPICIOUS_PATTERNS',
            'EMPTY_PHONENUMBER',
            'EMPTY_PHONE',
            'EMPTY_BUSINESSPHONE'
        ];
        
        if (criticalTypes.includes(type)) {
            return 'critical';
        } else if (warningTypes.includes(type)) {
            return 'warning';
        } else {
            return 'info';
        }
    }

    /**
     * Show critical alert
     * @param {Object} changeData - Change data
     */
    showCriticalAlert(changeData) {
        const { userId, type, details } = changeData;
        
        // Visual alert
        this.showVisualAlert({
            title: '🚨 CRITICAL: Phone Number Lost!',
            message: `Admin user phone number has been deleted!\n\nUser: ${userId}\nType: ${type}\nTime: ${new Date().toLocaleString()}`,
            type: 'critical',
            duration: 0, // Don't auto-dismiss
            actions: [
                {
                    label: 'View Details',
                    action: () => this.showDetailedAlert(changeData)
                },
                {
                    label: 'Go to Phone Mapping',
                    action: () => window.open('/admin_tools/admin-phone-mapping.html', '_blank')
                }
            ]
        });
        
        // Sound alert
        this.playAlertSound('critical');
        
        // Console error
        console.error('🚨 CRITICAL PHONE NUMBER ALERT:', changeData);
        
        // SweetAlert if available
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'Phone Number Lost!',
                html: `
                    <div class="text-start">
                        <p><strong>Admin user phone number has been deleted!</strong></p>
                        <p><strong>User:</strong> ${userId}</p>
                        <p><strong>Type:</strong> ${type}</p>
                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                        <p><strong>Details:</strong> ${JSON.stringify(details, null, 2)}</p>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'Go to Phone Mapping',
                cancelButtonText: 'Close',
                confirmButtonColor: '#d33',
                allowOutsideClick: false
            }).then((result) => {
                if (result.isConfirmed) {
                    window.open('/admin_tools/admin-phone-mapping.html', '_blank');
                }
            });
        }
    }

    /**
     * Show warning alert
     * @param {Object} changeData - Change data
     */
    showWarningAlert(changeData) {
        const { userId, type, details } = changeData;
        
        this.showVisualAlert({
            title: '⚠️ Phone Number Warning',
            message: `Suspicious phone number activity detected.\n\nUser: ${userId}\nType: ${type}\nTime: ${new Date().toLocaleString()}`,
            type: 'warning',
            duration: 10000
        });
        
        this.playAlertSound('warning');
        console.warn('⚠️ PHONE NUMBER WARNING:', changeData);
    }

    /**
     * Show info alert
     * @param {Object} changeData - Change data
     */
    showInfoAlert(changeData) {
        const { userId, type } = changeData;
        
        this.showVisualAlert({
            title: 'ℹ️ Phone Number Info',
            message: `Phone number activity logged.\n\nUser: ${userId}\nType: ${type}`,
            type: 'info',
            duration: 5000
        });
        
        console.info('ℹ️ PHONE NUMBER INFO:', changeData);
    }

    /**
     * Show visual alert
     * @param {Object} options - Alert options
     */
    showVisualAlert(options) {
        const { title, message, type, duration = 5000, actions = [] } = options;
        
        // Create alert element
        const alertElement = document.createElement('div');
        alertElement.className = `alert alert-${type === 'critical' ? 'danger' : type === 'warning' ? 'warning' : 'info'} alert-dismissible fade show`;
        alertElement.style.cssText = `
            margin-bottom: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            border-left: 4px solid ${type === 'critical' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#0dcaf0'};
            pointer-events: auto;
        `;
        
        // Create actions HTML
        const actionsHTML = actions.map(action => 
            `<button type="button" class="btn btn-sm btn-outline-${type === 'critical' ? 'danger' : type === 'warning' ? 'warning' : 'info'} me-2" onclick="(${action.action.toString()})()">${action.label}</button>`
        ).join('');
        
        alertElement.innerHTML = `
            <div class="d-flex align-items-start">
                <div class="flex-grow-1">
                    <h6 class="alert-heading mb-1">${title}</h6>
                    <p class="mb-2" style="white-space: pre-line; font-size: 0.9em;">${message}</p>
                    ${actionsHTML}
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        // Add to container
        const container = document.getElementById('phoneNumberAlerts');
        container.appendChild(alertElement);
        
        // Auto-dismiss if duration is set
        if (duration > 0) {
            setTimeout(() => {
                if (alertElement.parentNode) {
                    alertElement.remove();
                }
            }, duration);
        }
    }

    /**
     * Play alert sound
     * @param {string} type - Alert type
     */
    playAlertSound(type) {
        if (!this.soundEnabled) return;
        
        try {
            // Create audio context for web audio
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Set frequency based on alert type
            const frequency = type === 'critical' ? 880 : type === 'warning' ? 440 : 220;
            oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
            
            // Set volume
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.5);
            
        } catch (error) {
            console.warn('Could not play alert sound:', error);
        }
    }

    /**
     * Show detailed alert information
     * @param {Object} changeData - Change data
     */
    showDetailedAlert(changeData) {
        const { userId, type, details, timestamp } = changeData;
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'info',
                title: 'Phone Number Change Details',
                html: `
                    <div class="text-start">
                        <h6>Change Information:</h6>
                        <ul>
                            <li><strong>User ID:</strong> ${userId}</li>
                            <li><strong>Change Type:</strong> ${type}</li>
                            <li><strong>Timestamp:</strong> ${timestamp}</li>
                        </ul>
                        
                        <h6>Details:</h6>
                        <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; text-align: left; overflow-x: auto;">${JSON.stringify(details, null, 2)}</pre>
                        
                        <h6>Recent Activity:</h6>
                        <div style="max-height: 200px; overflow-y: auto;">
                            ${this.getRecentActivityHTML()}
                        </div>
                    </div>
                `,
                width: '600px',
                showCloseButton: true,
                confirmButtonText: 'OK'
            });
        } else {
            console.log('Detailed change information:', changeData);
        }
    }

    /**
     * Get recent activity HTML
     * @returns {string} HTML for recent activity
     */
    getRecentActivityHTML() {
        return this.logHistory.slice(-10).map(entry => 
            `<div class="border-bottom py-2">
                <small class="text-muted">${entry.timestamp}</small><br>
                <strong>${entry.type}</strong> - ${entry.userId}
            </div>`
        ).join('');
    }

    /**
     * Log phone number change
     * @param {Object} changeData - Change data
     */
    logChange(changeData) {
        const logEntry = {
            ...changeData,
            timestamp: new Date().toISOString()
        };
        
        this.logHistory.push(logEntry);
        
        // Limit history size
        if (this.logHistory.length > this.maxLogHistory) {
            this.logHistory.shift();
        }
    }

    /**
     * Get alert statistics
     * @returns {Object} Alert statistics
     */
    getStats() {
        const stats = {
            totalAlerts: this.logHistory.length,
            criticalAlerts: this.logHistory.filter(e => this.determineAlertLevel(e.type, e.details) === 'critical').length,
            warningAlerts: this.logHistory.filter(e => this.determineAlertLevel(e.type, e.details) === 'warning').length,
            infoAlerts: this.logHistory.filter(e => this.determineAlertLevel(e.type, e.details) === 'info').length,
            recentAlerts: this.logHistory.filter(e => 
                Date.now() - new Date(e.timestamp).getTime() < 3600000 // 1 hour
            ).length
        };
        
        return stats;
    }

    /**
     * Enable/disable alerts
     * @param {boolean} enabled - Whether to enable alerts
     */
    setAlertsEnabled(enabled) {
        this.alertsEnabled = enabled;
        console.log(`📱 Phone number alerts ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Enable/disable sound
     * @param {boolean} enabled - Whether to enable sound
     */
    setSoundEnabled(enabled) {
        this.soundEnabled = enabled;
        console.log(`🔊 Alert sounds ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Test the alert system
     */
    testAlerts() {
        console.log('🧪 Testing alert system...');
        
        // Test critical alert
        this.showCriticalAlert({
            userId: 'test-user',
            type: 'ADMIN_WITHOUT_PHONE',
            details: { test: true },
            timestamp: new Date().toISOString()
        });
        
        // Test warning alert after 2 seconds
        setTimeout(() => {
            this.showWarningAlert({
                userId: 'test-user',
                type: 'SUSPICIOUS_PATTERNS',
                details: { patterns: ['EMPTY_PHONENUMBER'] },
                timestamp: new Date().toISOString()
            });
        }, 2000);
        
        // Test info alert after 4 seconds
        setTimeout(() => {
            this.showInfoAlert({
                userId: 'test-user',
                type: 'PHONE_NUMBER_UPDATED',
                details: { old: '+27123456789', new: '+27987654321' },
                timestamp: new Date().toISOString()
            });
        }, 4000);
    }
}

// Create global instance
const phoneNumberAlerts = new PhoneNumberAlerts();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = phoneNumberAlerts;
} else if (typeof window !== 'undefined') {
    window.PhoneNumberAlerts = phoneNumberAlerts;
    
    // Add global test function
    window.testPhoneAlerts = () => phoneNumberAlerts.testAlerts();
    
    // Add global stats function
    window.getPhoneAlertStats = () => phoneNumberAlerts.getStats();
}