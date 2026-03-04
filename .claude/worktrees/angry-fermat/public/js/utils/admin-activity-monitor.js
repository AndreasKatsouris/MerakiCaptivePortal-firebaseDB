/**
 * Admin Activity Monitor
 * Tracks and displays real-time admin activities and phone number changes
 */

// Import Firebase from the global scope (it's loaded as modules in the HTML)
// We'll access it via window.firebase after the config loads

class AdminActivityMonitor {
    constructor() {
        this.isMonitoring = false;
        this.activityLog = [];
        this.maxLogSize = 1000;
        this.adminUsers = new Map();
        this.phoneNumberStatus = new Map();
        this.statistics = {
            totalOperations: 0,
            phoneChanges: 0,
            criticalAlerts: 0,
            userOperations: 0,
            adminActions: 0
        };
        
        // Wait for both DOM and Firebase to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                // Add extra delay to ensure all modules are loaded
                setTimeout(() => this.waitForFirebaseAndInitialize(), 2000);
            });
        } else {
            // Add extra delay to ensure all modules are loaded
            setTimeout(() => this.waitForFirebaseAndInitialize(), 2000);
        }
    }

    /**
     * Wait for Firebase to be available before initializing
     */
    async waitForFirebaseAndInitialize() {
        console.log('🔍 [AdminActivityMonitor] Waiting for Firebase to be available...');
        
        let attempts = 0;
        const maxAttempts = 30; // Increased from 20 to 30
        
        const checkFirebase = () => {
            attempts++;
            
            // Check for both window.firebase and window.firebaseExports
            const hasWindowFirebase = typeof window.firebase !== 'undefined' && window.firebase.database && window.firebase.auth;
            const hasFirebaseExports = typeof window.firebaseExports !== 'undefined' && window.firebaseExports.rtdb && window.firebaseExports.auth;
            
            if (hasWindowFirebase || hasFirebaseExports) {
                console.log('✅ [AdminActivityMonitor] Firebase is available, initializing...');
                this.initialize();
                return;
            }
            
            if (attempts >= maxAttempts) {
                console.error('❌ [AdminActivityMonitor] Firebase failed to load after 30 attempts, skipping initialization');
                return;
            }
            
            console.log(`🔍 [AdminActivityMonitor] Firebase not ready yet, waiting... (attempt ${attempts}/${maxAttempts})`);
            setTimeout(checkFirebase, 1000);
        };
        
        checkFirebase();
    }

    /**
     * Initialize the activity monitor
     */
    initialize() {
        console.log('🔍 Admin Activity Monitor initializing...');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load admin users
        this.loadAdminUsers();
        
        // Check phone number status
        this.checkPhoneNumberStatus();
        
        // Subscribe to phone number monitoring
        if (typeof window.PhoneNumberMonitor !== 'undefined') {
            window.PhoneNumberMonitor.addListener(this.handlePhoneNumberEvent.bind(this));
        }
        
        console.log('✅ Admin Activity Monitor initialized');
    }

    /**
     * Set up event listeners for the UI
     */
    setupEventListeners() {
        // Phone number protection settings
        const enablePhoneMonitoring = document.getElementById('enablePhoneMonitoring');
        if (enablePhoneMonitoring) {
            enablePhoneMonitoring.addEventListener('change', (e) => {
                if (typeof window.PhoneNumberMonitor !== 'undefined') {
                    window.PhoneNumberMonitor.isMonitoring = e.target.checked;
                    this.logActivity('MONITORING_TOGGLED', 'Phone number monitoring ' + (e.target.checked ? 'enabled' : 'disabled'));
                }
            });
        }

        const enablePhoneAlerts = document.getElementById('enablePhoneAlerts');
        if (enablePhoneAlerts) {
            enablePhoneAlerts.addEventListener('change', (e) => {
                if (typeof window.PhoneNumberAlerts !== 'undefined') {
                    window.PhoneNumberAlerts.setAlertsEnabled(e.target.checked);
                    this.logActivity('ALERTS_TOGGLED', 'Phone number alerts ' + (e.target.checked ? 'enabled' : 'disabled'));
                }
            });
        }

        const enablePhoneSounds = document.getElementById('enablePhoneSounds');
        if (enablePhoneSounds) {
            enablePhoneSounds.addEventListener('change', (e) => {
                if (typeof window.PhoneNumberAlerts !== 'undefined') {
                    window.PhoneNumberAlerts.setSoundEnabled(e.target.checked);
                    this.logActivity('SOUNDS_TOGGLED', 'Phone number sounds ' + (e.target.checked ? 'enabled' : 'disabled'));
                }
            });
        }

        // Test phone alerts
        const testPhoneAlerts = document.getElementById('testPhoneAlerts');
        if (testPhoneAlerts) {
            testPhoneAlerts.addEventListener('click', () => {
                if (typeof window.PhoneNumberAlerts !== 'undefined') {
                    window.PhoneNumberAlerts.testAlerts();
                    this.logActivity('ALERT_TEST', 'Phone number alert system tested');
                }
            });
        }

        // View phone stats
        const viewPhoneStats = document.getElementById('viewPhoneStats');
        if (viewPhoneStats) {
            viewPhoneStats.addEventListener('click', () => {
                this.showPhoneNumberStatistics();
            });
        }

        // Activity monitoring controls
        const startActivityMonitoring = document.getElementById('startActivityMonitoring');
        if (startActivityMonitoring) {
            startActivityMonitoring.addEventListener('click', () => this.startMonitoring());
        }

        const pauseActivityMonitoring = document.getElementById('pauseActivityMonitoring');
        if (pauseActivityMonitoring) {
            pauseActivityMonitoring.addEventListener('click', () => this.pauseMonitoring());
        }

        const clearActivityLogs = document.getElementById('clearActivityLogs');
        if (clearActivityLogs) {
            clearActivityLogs.addEventListener('click', () => this.clearLogs());
        }

        // Filters
        const activityFilter = document.getElementById('activityFilter');
        if (activityFilter) {
            activityFilter.addEventListener('change', () => this.applyFilters());
        }

        const timeFilter = document.getElementById('timeFilter');
        if (timeFilter) {
            timeFilter.addEventListener('change', () => this.applyFilters());
        }

        // Export and reports
        const exportActivityLog = document.getElementById('exportActivityLog');
        if (exportActivityLog) {
            exportActivityLog.addEventListener('click', () => this.exportActivityLog());
        }

        const generateReport = document.getElementById('generateReport');
        if (generateReport) {
            generateReport.addEventListener('click', () => this.generateReport());
        }
    }

    /**
     * Start activity monitoring
     */
    startMonitoring() {
        this.isMonitoring = true;
        
        // Update UI
        const startBtn = document.getElementById('startActivityMonitoring');
        const pauseBtn = document.getElementById('pauseActivityMonitoring');
        
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Monitoring Active';
        }
        if (pauseBtn) pauseBtn.disabled = false;
        
        // Start monitoring database changes
        this.startDatabaseMonitoring();
        
        // Log start
        this.logActivity('MONITORING_STARTED', 'Admin activity monitoring started');
        
        // Update activity feed
        this.updateActivityFeed();
        
        console.log('📊 Admin activity monitoring started');
    }

    /**
     * Pause activity monitoring
     */
    pauseMonitoring() {
        this.isMonitoring = false;
        
        // Update UI
        const startBtn = document.getElementById('startActivityMonitoring');
        const pauseBtn = document.getElementById('pauseActivityMonitoring');
        
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play me-1"></i>Start Monitoring';
        }
        if (pauseBtn) pauseBtn.disabled = true;
        
        // Stop database monitoring
        this.stopDatabaseMonitoring();
        
        // Log pause
        this.logActivity('MONITORING_PAUSED', 'Admin activity monitoring paused');
        
        console.log('⏸️ Admin activity monitoring paused');
    }

    /**
     * Start monitoring database changes
     */
    startDatabaseMonitoring() {
        const firebaseDB = window.firebase?.database || window.firebaseExports?.rtdb;
        
        if (!firebaseDB) {
            if (!this.monitoringRetryCount) this.monitoringRetryCount = 0;
            
            if (this.monitoringRetryCount < 5) {
                this.monitoringRetryCount++;
                console.warn(`🔍 [AdminActivityMonitor] Firebase not available for monitoring, will retry... (attempt ${this.monitoringRetryCount}/5)`);
                setTimeout(() => this.startDatabaseMonitoring(), 2000);
                return;
            } else {
                console.error('🔍 [AdminActivityMonitor] Firebase monitoring failed to start after 5 attempts');
                return;
            }
        }

        // Get database reference function
        const getRef = window.firebase?.database ? 
            (path) => window.firebase.database().ref(path) : 
            (path) => window.firebaseExports.ref(window.firebaseExports.rtdb, path);

        // Monitor users collection for admin-related changes
        this.usersRef = getRef('users');
        
        if (window.firebase?.database) {
            this.usersListener = this.usersRef.on('child_changed', (snapshot) => {
                const userId = snapshot.key;
                const userData = snapshot.val();
                
                if (userData && (userData.isAdmin || userData.role === 'admin')) {
                    this.handleAdminUserChange(userId, userData);
                }
            });

            // Monitor admin claims
            this.adminClaimsRef = getRef('admin-claims');
            this.adminClaimsListener = this.adminClaimsRef.on('child_added', (snapshot) => {
                const userId = snapshot.key;
                this.logActivity('ADMIN_CLAIM_ADDED', `Admin claim added for user ${userId}`);
            });

            this.adminClaimsListener2 = this.adminClaimsRef.on('child_removed', (snapshot) => {
                const userId = snapshot.key;
                this.logActivity('ADMIN_CLAIM_REMOVED', `Admin claim removed for user ${userId}`);
            });
        } else {
            // Use Firebase v9+ modular SDK
            const { onValue } = window.firebaseExports;
            this.usersListener = onValue(this.usersRef, (snapshot) => {
                // Handle snapshot changes
                console.log('🔍 [AdminActivityMonitor] User data changed');
            });
        }
    }

    /**
     * Stop monitoring database changes
     */
    stopDatabaseMonitoring() {
        if (this.usersRef && this.usersListener) {
            this.usersRef.off('child_changed', this.usersListener);
        }
        if (this.adminClaimsRef && this.adminClaimsListener) {
            this.adminClaimsRef.off('child_added', this.adminClaimsListener);
            this.adminClaimsRef.off('child_removed', this.adminClaimsListener2);
        }
    }

    /**
     * Handle admin user changes
     */
    handleAdminUserChange(userId, userData) {
        if (!this.isMonitoring) return;

        const currentUser = (typeof window.firebase !== 'undefined' && window.firebase.auth) ? window.firebase.auth().currentUser : null;
        const isCurrentUser = currentUser && currentUser.uid === userId;
        
        // Check for phone number changes
        const phoneFields = ['phoneNumber', 'phone', 'businessPhone'];
        const previousData = this.adminUsers.get(userId) || {};
        
        phoneFields.forEach(field => {
            if (previousData[field] !== userData[field]) {
                const changeType = !userData[field] ? 'PHONE_REMOVED' : 
                                 !previousData[field] ? 'PHONE_ADDED' : 'PHONE_CHANGED';
                
                this.logActivity(changeType, `${field} changed for admin user ${userId}`, {
                    userId,
                    field,
                    oldValue: previousData[field],
                    newValue: userData[field],
                    isCurrentUser
                });
                
                this.statistics.phoneChanges++;
                
                if (!userData[field] && previousData[field]) {
                    this.statistics.criticalAlerts++;
                }
            }
        });

        // Check for admin status changes
        if (previousData.isAdmin !== userData.isAdmin || previousData.role !== userData.role) {
            this.logActivity('ADMIN_STATUS_CHANGED', `Admin status changed for user ${userId}`, {
                userId,
                oldAdmin: previousData.isAdmin,
                newAdmin: userData.isAdmin,
                oldRole: previousData.role,
                newRole: userData.role,
                isCurrentUser
            });
        }

        // Update stored data
        this.adminUsers.set(userId, userData);
        this.updateStatistics();
        this.updateActivityFeed();
        this.updatePhoneNumberStatus();
    }

    /**
     * Handle phone number events from monitoring system
     */
    handlePhoneNumberEvent(eventData) {
        if (!this.isMonitoring) return;

        const { userId, type, details } = eventData;
        
        this.logActivity('PHONE_EVENT', `Phone number event: ${type}`, {
            userId,
            type,
            details
        });

        if (type.includes('CRITICAL') || type.includes('MISSING')) {
            this.statistics.criticalAlerts++;
        }

        this.statistics.phoneChanges++;
        this.updateStatistics();
        this.updateActivityFeed();
    }

    /**
     * Log an activity
     */
    logActivity(type, description, details = {}) {
        // Check if Firebase is available
        if (typeof window.firebase === 'undefined' || !window.firebase.auth) {
            console.warn('🔍 [AdminActivityMonitor] Firebase not available for logging, storing locally');
        }
        
        const activity = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            type,
            description,
            details,
            userId: (typeof window.firebase !== 'undefined' && window.firebase.auth && window.firebase.auth().currentUser) ? window.firebase.auth().currentUser.uid : 'unknown'
        };

        this.activityLog.unshift(activity);
        
        // Limit log size
        if (this.activityLog.length > this.maxLogSize) {
            this.activityLog.pop();
        }

        this.statistics.totalOperations++;
        
        // Update UI if monitoring is active
        if (this.isMonitoring) {
            this.updateActivityFeed();
            this.updateStatistics();
        }

        console.log('📝 Activity logged:', activity);
    }

    /**
     * Load admin users
     */
    async loadAdminUsers() {
        try {
            // Wait for Firebase to be available with a maximum retry limit
            const firebaseDB = window.firebase?.database || window.firebaseExports?.rtdb;
            
            if (!firebaseDB) {
                if (!this.firebaseRetryCount) this.firebaseRetryCount = 0;
                
                if (this.firebaseRetryCount < 10) {
                    this.firebaseRetryCount++;
                    console.warn(`🔍 [AdminActivityMonitor] Firebase not yet available, waiting... (attempt ${this.firebaseRetryCount}/10)`);
                    setTimeout(() => this.loadAdminUsers(), 2000);
                    return;
                } else {
                    console.error('🔍 [AdminActivityMonitor] Firebase failed to load after 10 attempts, giving up');
                    return;
                }
            }

            let snapshot;
            if (window.firebase?.database) {
                snapshot = await window.firebase.database().ref('users').once('value');
            } else {
                // Use Firebase v9+ modular SDK
                const { get, ref } = window.firebaseExports;
                const usersRef = ref(firebaseDB, 'users');
                snapshot = await get(usersRef);
            }
            
            const users = snapshot.val() || {};
            
            // Filter admin users
            Object.entries(users).forEach(([userId, userData]) => {
                if (userData && (userData.isAdmin || userData.role === 'admin')) {
                    this.adminUsers.set(userId, userData);
                }
            });

            this.updateActiveAdmins();
            console.log(`👥 Loaded ${this.adminUsers.size} admin users`);
        } catch (error) {
            console.error('Error loading admin users:', error);
        }
    }

    /**
     * Check phone number status for all admin users
     */
    checkPhoneNumberStatus() {
        this.adminUsers.forEach((userData, userId) => {
            const phoneFields = ['phoneNumber', 'phone', 'businessPhone'];
            const hasPhone = phoneFields.some(field => userData[field]);
            
            this.phoneNumberStatus.set(userId, {
                hasPhone,
                phoneNumber: userData.phoneNumber,
                phone: userData.phone,
                businessPhone: userData.businessPhone,
                lastChecked: new Date().toISOString()
            });
        });

        this.updatePhoneNumberStatus();
    }

    /**
     * Update active admins display
     */
    updateActiveAdmins() {
        const container = document.getElementById('activeAdmins');
        if (!container) return;

        if (this.adminUsers.size === 0) {
            container.innerHTML = `
                <div class="text-muted text-center py-4">
                    <small>No admin users found</small>
                </div>
            `;
            return;
        }

        const html = Array.from(this.adminUsers.entries()).map(([userId, userData]) => {
            const currentUser = (typeof window.firebase !== 'undefined' && window.firebase.auth) ? window.firebase.auth().currentUser : null;
            const isCurrentUser = currentUser && currentUser.uid === userId;
            const hasPhone = userData.phoneNumber || userData.phone || userData.businessPhone;
            
            return `
                <div class="border-bottom py-2 ${isCurrentUser ? 'bg-light' : ''}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <strong class="small">${userData.displayName || userData.email || 'Unknown'}</strong>
                            ${isCurrentUser ? '<span class="badge bg-primary ms-1">You</span>' : ''}
                            <br>
                            <small class="text-muted">${userId.substring(0, 8)}...</small>
                        </div>
                        <div class="text-end">
                            <i class="fas fa-phone ${hasPhone ? 'text-success' : 'text-danger'}" 
                               title="${hasPhone ? 'Has phone number' : 'Missing phone number'}"></i>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
    }

    /**
     * Update phone number status display
     */
    updatePhoneNumberStatus() {
        const container = document.getElementById('phoneNumberStatus');
        if (!container) return;

        if (this.phoneNumberStatus.size === 0) {
            container.innerHTML = `
                <div class="text-muted text-center py-4">
                    <small>No phone number data</small>
                </div>
            `;
            return;
        }

        const phoneStats = {
            total: this.phoneNumberStatus.size,
            withPhone: 0,
            withoutPhone: 0
        };

        this.phoneNumberStatus.forEach((status) => {
            if (status.hasPhone) phoneStats.withPhone++;
            else phoneStats.withoutPhone++;
        });

        const html = `
            <div class="row text-center mb-3">
                <div class="col-4">
                    <h6 class="mb-1 text-success">${phoneStats.withPhone}</h6>
                    <small>With Phone</small>
                </div>
                <div class="col-4">
                    <h6 class="mb-1 text-danger">${phoneStats.withoutPhone}</h6>
                    <small>Missing</small>
                </div>
                <div class="col-4">
                    <h6 class="mb-1 text-info">${phoneStats.total}</h6>
                    <small>Total</small>
                </div>
            </div>
            ${phoneStats.withoutPhone > 0 ? `
                <div class="alert alert-warning alert-sm py-2">
                    <small><i class="fas fa-exclamation-triangle me-1"></i>
                    ${phoneStats.withoutPhone} admin user(s) missing phone numbers</small>
                </div>
            ` : ''}
        `;

        container.innerHTML = html;
    }

    /**
     * Update activity feed display
     */
    updateActivityFeed() {
        const container = document.getElementById('activityFeed');
        if (!container) return;

        const filteredActivities = this.getFilteredActivities();

        if (filteredActivities.length === 0) {
            container.innerHTML = `
                <div class="text-muted text-center py-5">
                    <i class="fas fa-info-circle fa-2x mb-2"></i>
                    <p>No activities match the current filter</p>
                </div>
            `;
            return;
        }

        const html = filteredActivities.slice(0, 50).map(activity => {
            const timeAgo = this.getTimeAgo(new Date(activity.timestamp));
            const typeColor = this.getActivityTypeColor(activity.type);
            const icon = this.getActivityTypeIcon(activity.type);
            
            return `
                <div class="border-bottom py-2">
                    <div class="d-flex align-items-start">
                        <div class="me-2">
                            <i class="fas fa-${icon} ${typeColor}"></i>
                        </div>
                        <div class="flex-grow-1">
                            <div class="small">
                                <strong>${activity.description}</strong>
                            </div>
                            <div class="text-muted" style="font-size: 0.8em;">
                                ${timeAgo} • ${activity.type}
                                ${activity.details.userId ? ` • User: ${activity.details.userId.substring(0, 8)}...` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
        
        // Auto-scroll to top for new activities
        container.scrollTop = 0;
    }

    /**
     * Update statistics display
     */
    updateStatistics() {
        const totalOpsEl = document.getElementById('totalOperations');
        const phoneChangesEl = document.getElementById('phoneChanges');
        const criticalAlertsEl = document.getElementById('criticalAlerts');

        if (totalOpsEl) totalOpsEl.textContent = this.statistics.totalOperations;
        if (phoneChangesEl) phoneChangesEl.textContent = this.statistics.phoneChanges;
        if (criticalAlertsEl) criticalAlertsEl.textContent = this.statistics.criticalAlerts;
    }

    /**
     * Get filtered activities based on current filters
     */
    getFilteredActivities() {
        const activityFilter = document.getElementById('activityFilter')?.value || 'all';
        const timeFilter = document.getElementById('timeFilter')?.value || 'last_24h';

        let filtered = [...this.activityLog];

        // Apply activity type filter
        if (activityFilter !== 'all') {
            filtered = filtered.filter(activity => {
                switch (activityFilter) {
                    case 'phone_changes':
                        return activity.type.includes('PHONE_');
                    case 'user_operations':
                        return activity.type.includes('USER_') || activity.type.includes('ADMIN_STATUS_');
                    case 'admin_actions':
                        return activity.type.includes('ADMIN_') || activity.type.includes('MONITORING_');
                    case 'critical_alerts':
                        return activity.type.includes('CRITICAL') || activity.type.includes('REMOVED');
                    default:
                        return true;
                }
            });
        }

        // Apply time filter
        const now = Date.now();
        filtered = filtered.filter(activity => {
            const activityTime = new Date(activity.timestamp).getTime();
            const timeDiff = now - activityTime;

            switch (timeFilter) {
                case 'last_hour':
                    return timeDiff <= 60 * 60 * 1000;
                case 'last_24h':
                    return timeDiff <= 24 * 60 * 60 * 1000;
                case 'last_week':
                    return timeDiff <= 7 * 24 * 60 * 60 * 1000;
                case 'all_time':
                default:
                    return true;
            }
        });

        return filtered;
    }

    /**
     * Apply filters and update display
     */
    applyFilters() {
        this.updateActivityFeed();
    }

    /**
     * Clear activity logs
     */
    clearLogs() {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Clear Activity Logs?',
                text: 'This will permanently delete all activity logs.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Yes, clear logs'
            }).then((result) => {
                if (result.isConfirmed) {
                    this.activityLog = [];
                    this.statistics = {
                        totalOperations: 0,
                        phoneChanges: 0,
                        criticalAlerts: 0,
                        userOperations: 0,
                        adminActions: 0
                    };
                    this.updateActivityFeed();
                    this.updateStatistics();
                    
                    Swal.fire('Cleared!', 'Activity logs have been cleared.', 'success');
                }
            });
        } else {
            if (confirm('Clear all activity logs? This cannot be undone.')) {
                this.activityLog = [];
                this.updateActivityFeed();
                this.updateStatistics();
            }
        }
    }

    /**
     * Export activity log
     */
    exportActivityLog() {
        const filteredActivities = this.getFilteredActivities();
        const csvContent = this.generateCSV(filteredActivities);
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `admin-activity-log-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        this.logActivity('EXPORT_LOG', 'Activity log exported');
    }

    /**
     * Generate CSV from activities
     */
    generateCSV(activities) {
        const headers = ['Timestamp', 'Type', 'Description', 'User ID', 'Details'];
        const rows = activities.map(activity => [
            activity.timestamp,
            activity.type,
            activity.description,
            activity.userId || '',
            JSON.stringify(activity.details)
        ]);

        return [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');
    }

    /**
     * Generate comprehensive report
     */
    generateReport() {
        const report = {
            generatedAt: new Date().toISOString(),
            statistics: this.statistics,
            adminUsers: this.adminUsers.size,
            phoneNumberStatus: {
                total: this.phoneNumberStatus.size,
                withPhone: Array.from(this.phoneNumberStatus.values()).filter(s => s.hasPhone).length,
                withoutPhone: Array.from(this.phoneNumberStatus.values()).filter(s => !s.hasPhone).length
            },
            recentActivities: this.activityLog.slice(0, 20),
            monitoringStatus: this.isMonitoring
        };

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Admin Activity Report',
                html: `
                    <div class="text-start">
                        <h6>Statistics:</h6>
                        <ul>
                            <li>Total Operations: ${report.statistics.totalOperations}</li>
                            <li>Phone Changes: ${report.statistics.phoneChanges}</li>
                            <li>Critical Alerts: ${report.statistics.criticalAlerts}</li>
                        </ul>
                        
                        <h6>Admin Users:</h6>
                        <ul>
                            <li>Total Admin Users: ${report.adminUsers}</li>
                            <li>With Phone Numbers: ${report.phoneNumberStatus.withPhone}</li>
                            <li>Missing Phone Numbers: ${report.phoneNumberStatus.withoutPhone}</li>
                        </ul>
                        
                        <h6>Monitoring Status:</h6>
                        <p>Currently ${report.monitoringStatus ? 'Active' : 'Inactive'}</p>
                    </div>
                `,
                width: '600px',
                showCloseButton: true,
                confirmButtonText: 'Export Full Report',
                showCancelButton: true,
                cancelButtonText: 'Close'
            }).then((result) => {
                if (result.isConfirmed) {
                    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `admin-activity-report-${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }
            });
        }

        this.logActivity('REPORT_GENERATED', 'Activity report generated');
    }

    /**
     * Show phone number statistics
     */
    showPhoneNumberStatistics() {
        if (typeof window.PhoneNumberMonitor !== 'undefined') {
            const stats = window.PhoneNumberMonitor.getStats();
            const report = window.PhoneNumberMonitor.generateReport();
            
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Phone Number Statistics',
                    html: `<pre style="text-align: left; white-space: pre-wrap;">${report}</pre>`,
                    width: '800px',
                    showCloseButton: true
                });
            } else {
                console.log('Phone Number Statistics:', stats);
                console.log('Phone Number Report:', report);
            }
        }
    }

    /**
     * Get activity type color
     */
    getActivityTypeColor(type) {
        if (type.includes('CRITICAL') || type.includes('REMOVED')) return 'text-danger';
        if (type.includes('PHONE_') || type.includes('CHANGED')) return 'text-warning';
        if (type.includes('ADDED') || type.includes('STARTED')) return 'text-success';
        return 'text-info';
    }

    /**
     * Get activity type icon
     */
    getActivityTypeIcon(type) {
        if (type.includes('PHONE_')) return 'phone';
        if (type.includes('ADMIN_')) return 'user-shield';
        if (type.includes('MONITORING_')) return 'eye';
        if (type.includes('ALERT')) return 'exclamation-triangle';
        if (type.includes('EXPORT')) return 'download';
        return 'info-circle';
    }

    /**
     * Get time ago string
     */
    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return `${diffSecs}s ago`;
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }

    /**
     * Get monitoring statistics
     */
    getStatistics() {
        return {
            ...this.statistics,
            isMonitoring: this.isMonitoring,
            adminUsers: this.adminUsers.size,
            logSize: this.activityLog.length
        };
    }
}

// Create global instance
const adminActivityMonitor = new AdminActivityMonitor();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = adminActivityMonitor;
} else if (typeof window !== 'undefined') {
    window.AdminActivityMonitor = adminActivityMonitor;
}