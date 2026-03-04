/**
 * QMS-Booking Tab Integration Health Monitor
 * 
 * Continuous monitoring system for QMS-Booking tab integration health,
 * performance metrics, and error detection in production.
 */

class QMSHealthMonitor {
  constructor() {
    this.healthData = {
      containerSelection: {
        checks: 0,
        failures: 0,
        lastFailure: null
      },
      vueInitialization: {
        attempts: 0,
        failures: 0,
        averageTime: 0,
        lastFailure: null
      },
      tabNavigation: {
        attempts: 0,
        failures: 0,
        averageTime: 0,
        lastFailure: null
      },
      bookingAccess: {
        attempts: 0,
        failures: 0,
        accessDeniedCount: 0,
        lastFailure: null
      },
      performance: {
        initializationTimes: [],
        tabSwitchTimes: [],
        bookingLoadTimes: [],
        memoryUsage: []
      },
      errors: {
        critical: [],
        errors: [],
        warnings: []
      },
      userExperience: {
        taskCompletionRate: 0,
        userFeedbackScore: 0,
        abandonmentRate: 0
      }
    };
    
    this.thresholds = {
      initialization: 2000, // 2 seconds
      tabSwitch: 500,       // 500ms
      bookingLoad: 5000,    // 5 seconds
      memoryLeak: 100 * 1024 * 1024, // 100MB
      errorRate: 0.05,      // 5% error rate
      completionRate: 0.85  // 85% task completion
    };
    
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.observers = [];
    this.alerts = [];
    
    this.init();
  }

  init() {
    if (typeof window !== 'undefined') {
      this.setupBrowserMonitoring();
      this.setupPerformanceMonitoring();
      this.setupErrorCapture();
      this.setupUserExperienceTracking();
    }
  }

  setupBrowserMonitoring() {
    // Monitor Vue initialization
    const originalCreateApp = window.Vue?.createApp;
    if (originalCreateApp) {
      window.Vue.createApp = (...args) => {
        this.recordVueInitialization('attempt');
        const startTime = performance.now();
        
        try {
          const app = originalCreateApp.apply(window.Vue, args);
          const endTime = performance.now();
          this.recordVueInitialization('success', endTime - startTime);
          return app;
        } catch (error) {
          this.recordVueInitialization('failure', null, error);
          throw error;
        }
      };
    }

    // Monitor container selection
    this.monitorContainerSelection();
    
    // Monitor tab navigation
    this.monitorTabNavigation();
    
    // Monitor booking access
    this.monitorBookingAccess();
  }

  setupPerformanceMonitoring() {
    // Monitor page load performance
    if (typeof PerformanceObserver !== 'undefined') {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.name.includes('queueManagement') || entry.name.includes('booking')) {
            this.recordPerformanceMetric(entry.entryType, entry.duration, entry);
          }
        });
      });
      
      observer.observe({ entryTypes: ['measure', 'navigation', 'paint'] });
      this.observers.push(observer);
    }

    // Monitor memory usage
    this.monitorMemoryUsage();
  }

  setupErrorCapture() {
    // Capture JavaScript errors
    const originalError = window.console.error;
    window.console.error = (...args) => {
      this.recordError('error', args.join(' '), new Error().stack);
      return originalError.apply(console, args);
    };

    const originalWarn = window.console.warn;
    window.console.warn = (...args) => {
      this.recordError('warning', args.join(' '), new Error().stack);
      return originalWarn.apply(console, args);
    };

    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.recordError('critical', event.message, event.error?.stack, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.recordError('critical', `Unhandled Promise Rejection: ${event.reason}`, null, {
        promise: event.promise
      });
    });
  }

  setupUserExperienceTracking() {
    // Track user interactions
    this.trackTabClicks();
    this.trackBookingAccess();
    this.trackTaskCompletion();
    this.trackUserFeedback();
  }

  monitorContainerSelection() {
    const checkContainerIntegrity = () => {
      this.healthData.containerSelection.checks++;
      
      const expectedContainers = [
        '#queueManagementContent',
        '#queueManagementVueContent',
        '#queue-management-app'
      ];
      
      let missingContainers = 0;
      expectedContainers.forEach(selector => {
        if (!document.querySelector(selector)) {
          missingContainers++;
        }
      });
      
      if (missingContainers > 0) {
        this.healthData.containerSelection.failures++;
        this.healthData.containerSelection.lastFailure = new Date();
        
        this.recordError('error', `Missing containers: ${missingContainers}/${expectedContainers.length}`, null, {
          missingCount: missingContainers,
          expectedContainers
        });
      }
      
      return missingContainers === 0;
    };

    // Check container integrity periodically
    setInterval(checkContainerIntegrity, 30000); // Every 30 seconds
    
    return checkContainerIntegrity();
  }

  monitorTabNavigation() {
    const tabSelectors = [
      '#queue-tab', '#booking-tab',
      '#admin-queue-tab', '#admin-booking-tab'
    ];

    tabSelectors.forEach(selector => {
      const tab = document.querySelector(selector);
      if (tab) {
        tab.addEventListener('click', (event) => {
          this.healthData.tabNavigation.attempts++;
          const startTime = performance.now();
          
          // Monitor tab switch completion
          const checkTabSwitch = () => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            if (tab.classList.contains('active')) {
              this.recordTabNavigation('success', duration);
            } else {
              this.recordTabNavigation('failure', duration);
            }
          };
          
          setTimeout(checkTabSwitch, 100);
        });
      }
    });
  }

  monitorBookingAccess() {
    const bookingTabSelectors = ['#booking-tab', '#admin-booking-tab'];
    
    bookingTabSelectors.forEach(selector => {
      const bookingTab = document.querySelector(selector);
      if (bookingTab) {
        bookingTab.addEventListener('click', (event) => {
          this.healthData.bookingAccess.attempts++;
          
          if (bookingTab.classList.contains('disabled')) {
            this.healthData.bookingAccess.accessDeniedCount++;
          } else {
            const startTime = performance.now();
            
            // Monitor booking content loading
            const checkBookingLoad = () => {
              const bookingContent = document.querySelector('#bookingManagementContent, #adminBookingManagementContent');
              if (bookingContent) {
                const hasLoaded = !bookingContent.querySelector('.booking-tab-loading');
                const hasError = bookingContent.querySelector('.alert-danger');
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                if (hasLoaded && !hasError) {
                  this.recordBookingAccess('success', duration);
                } else if (hasError) {
                  this.recordBookingAccess('failure', duration);
                }
              }
            };
            
            setTimeout(checkBookingLoad, 1000);
            setTimeout(checkBookingLoad, 5000); // Check again after 5 seconds
          }
        });
      }
    });
  }

  monitorMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      setInterval(() => {
        const memoryInfo = {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
          timestamp: Date.now()
        };
        
        this.healthData.performance.memoryUsage.push(memoryInfo);
        
        // Keep only last 100 readings
        if (this.healthData.performance.memoryUsage.length > 100) {
          this.healthData.performance.memoryUsage.shift();
        }
        
        // Check for memory leaks
        this.checkForMemoryLeaks();
      }, 60000); // Every minute
    }
  }

  trackTabClicks() {
    let tabClickSequence = [];
    
    document.addEventListener('click', (event) => {
      const isTab = event.target.closest('[role="tab"]');
      if (isTab) {
        tabClickSequence.push({
          tabId: isTab.id,
          timestamp: Date.now(),
          success: true
        });
        
        // Keep only last 10 clicks
        if (tabClickSequence.length > 10) {
          tabClickSequence.shift();
        }
        
        // Analyze click patterns
        this.analyzeTabUsagePatterns(tabClickSequence);
      }
    });
  }

  trackBookingAccess() {
    // Track booking access attempts and success rates
    const trackAccessAttempt = (success, reason = null) => {
      this.healthData.userExperience.bookingAccessAttempts = 
        (this.healthData.userExperience.bookingAccessAttempts || 0) + 1;
      
      if (success) {
        this.healthData.userExperience.bookingAccessSuccesses = 
          (this.healthData.userExperience.bookingAccessSuccesses || 0) + 1;
      } else {
        this.healthData.userExperience.bookingAccessFailures = 
          (this.healthData.userExperience.bookingAccessFailures || 0) + 1;
          
        if (reason) {
          this.recordError('error', `Booking access failed: ${reason}`, null);
        }
      }
      
      this.updateTaskCompletionRate();
    };
    
    // Export function for external tracking
    window.qmsHealthMonitor = window.qmsHealthMonitor || {};
    window.qmsHealthMonitor.trackBookingAccess = trackAccessAttempt;
  }

  trackTaskCompletion() {
    // Track user task completion
    let taskStartTime = null;
    let currentTask = null;
    
    const tasks = {
      'queue-management': { started: 0, completed: 0, abandoned: 0 },
      'booking-access': { started: 0, completed: 0, abandoned: 0 },
      'navigation': { started: 0, completed: 0, abandoned: 0 }
    };
    
    // Track task start
    const startTask = (taskType) => {
      taskStartTime = Date.now();
      currentTask = taskType;
      tasks[taskType].started++;
    };
    
    // Track task completion
    const completeTask = (success = true) => {
      if (currentTask && taskStartTime) {
        const duration = Date.now() - taskStartTime;
        
        if (success) {
          tasks[currentTask].completed++;
        } else {
          tasks[currentTask].abandoned++;
        }
        
        this.updateTaskCompletionRate();
        currentTask = null;
        taskStartTime = null;
      }
    };
    
    // Export functions
    window.qmsHealthMonitor = window.qmsHealthMonitor || {};
    window.qmsHealthMonitor.startTask = startTask;
    window.qmsHealthMonitor.completeTask = completeTask;
    window.qmsHealthMonitor.getTasks = () => tasks;
  }

  trackUserFeedback() {
    // Track user feedback and satisfaction
    const feedbackData = {
      ratings: [],
      issues: [],
      suggestions: []
    };
    
    const recordFeedback = (type, data) => {
      feedbackData[type].push({
        ...data,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        url: window.location.href
      });
      
      this.calculateUserSatisfaction();
    };
    
    // Export feedback function
    window.qmsHealthMonitor = window.qmsHealthMonitor || {};
    window.qmsHealthMonitor.recordFeedback = recordFeedback;
    window.qmsHealthMonitor.getFeedback = () => feedbackData;
  }

  // Recording methods
  recordVueInitialization(type, duration = null, error = null) {
    switch (type) {
      case 'attempt':
        this.healthData.vueInitialization.attempts++;
        break;
      case 'success':
        if (duration !== null) {
          this.updateAverage('vueInitialization', duration);
          this.healthData.performance.initializationTimes.push({
            duration,
            timestamp: Date.now()
          });
        }
        break;
      case 'failure':
        this.healthData.vueInitialization.failures++;
        this.healthData.vueInitialization.lastFailure = new Date();
        if (error) {
          this.recordError('critical', `Vue initialization failed: ${error.message}`, error.stack);
        }
        break;
    }
    
    this.checkHealthThresholds();
  }

  recordTabNavigation(type, duration = null) {
    if (type === 'success') {
      this.updateAverage('tabNavigation', duration);
      this.healthData.performance.tabSwitchTimes.push({
        duration,
        timestamp: Date.now()
      });
    } else if (type === 'failure') {
      this.healthData.tabNavigation.failures++;
      this.healthData.tabNavigation.lastFailure = new Date();
    }
    
    this.checkHealthThresholds();
  }

  recordBookingAccess(type, duration = null) {
    if (type === 'success') {
      this.healthData.performance.bookingLoadTimes.push({
        duration,
        timestamp: Date.now()
      });
    } else if (type === 'failure') {
      this.healthData.bookingAccess.failures++;
      this.healthData.bookingAccess.lastFailure = new Date();
    }
    
    this.checkHealthThresholds();
  }

  recordPerformanceMetric(type, duration, entry = null) {
    const metric = {
      type,
      duration,
      timestamp: Date.now(),
      entry: entry ? {
        name: entry.name,
        entryType: entry.entryType,
        startTime: entry.startTime
      } : null
    };
    
    // Store in appropriate performance array
    if (type.includes('initialization')) {
      this.healthData.performance.initializationTimes.push(metric);
    } else if (type.includes('tab')) {
      this.healthData.performance.tabSwitchTimes.push(metric);
    } else if (type.includes('booking')) {
      this.healthData.performance.bookingLoadTimes.push(metric);
    }
    
    this.checkPerformanceThresholds(type, duration);
  }

  recordError(severity, message, stack = null, context = {}) {
    const errorData = {
      severity,
      message,
      stack,
      context,
      timestamp: Date.now(),
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
    };
    
    this.healthData.errors[severity === 'warning' ? 'warnings' : severity === 'critical' ? 'critical' : 'errors'].push(errorData);
    
    // Trigger alert for critical errors
    if (severity === 'critical') {
      this.triggerAlert('critical_error', errorData);
    }
    
    this.checkErrorThresholds();
  }

  // Analysis methods
  updateAverage(metric, newValue) {
    const currentAverage = this.healthData[metric].averageTime;
    const attempts = this.healthData[metric].attempts;
    
    this.healthData[metric].averageTime = ((currentAverage * (attempts - 1)) + newValue) / attempts;
  }

  checkHealthThresholds() {
    // Check error rates
    const vueFailureRate = this.healthData.vueInitialization.failures / 
                          Math.max(this.healthData.vueInitialization.attempts, 1);
    const tabFailureRate = this.healthData.tabNavigation.failures / 
                          Math.max(this.healthData.tabNavigation.attempts, 1);
    const bookingFailureRate = this.healthData.bookingAccess.failures / 
                              Math.max(this.healthData.bookingAccess.attempts, 1);
    
    if (vueFailureRate > this.thresholds.errorRate) {
      this.triggerAlert('high_vue_failure_rate', { rate: vueFailureRate });
    }
    if (tabFailureRate > this.thresholds.errorRate) {
      this.triggerAlert('high_tab_failure_rate', { rate: tabFailureRate });
    }
    if (bookingFailureRate > this.thresholds.errorRate) {
      this.triggerAlert('high_booking_failure_rate', { rate: bookingFailureRate });
    }
  }

  checkPerformanceThresholds(type, duration) {
    let threshold;
    let alertType;
    
    if (type.includes('initialization')) {
      threshold = this.thresholds.initialization;
      alertType = 'slow_initialization';
    } else if (type.includes('tab')) {
      threshold = this.thresholds.tabSwitch;
      alertType = 'slow_tab_switch';
    } else if (type.includes('booking')) {
      threshold = this.thresholds.bookingLoad;
      alertType = 'slow_booking_load';
    }
    
    if (threshold && duration > threshold) {
      this.triggerAlert(alertType, { duration, threshold });
    }
  }

  checkErrorThresholds() {
    const totalErrors = this.healthData.errors.critical.length + 
                       this.healthData.errors.errors.length;
    const totalOperations = this.healthData.vueInitialization.attempts + 
                           this.healthData.tabNavigation.attempts + 
                           this.healthData.bookingAccess.attempts;
    
    const errorRate = totalErrors / Math.max(totalOperations, 1);
    
    if (errorRate > this.thresholds.errorRate) {
      this.triggerAlert('high_error_rate', { 
        rate: errorRate, 
        totalErrors, 
        totalOperations 
      });
    }
  }

  checkForMemoryLeaks() {
    if (this.healthData.performance.memoryUsage.length < 2) return;
    
    const recent = this.healthData.performance.memoryUsage.slice(-10);
    const baseline = this.healthData.performance.memoryUsage.slice(0, 10);
    
    if (baseline.length === 0 || recent.length === 0) return;
    
    const baselineAvg = baseline.reduce((sum, m) => sum + m.used, 0) / baseline.length;
    const recentAvg = recent.reduce((sum, m) => sum + m.used, 0) / recent.length;
    
    const memoryIncrease = recentAvg - baselineAvg;
    
    if (memoryIncrease > this.thresholds.memoryLeak) {
      this.triggerAlert('memory_leak', { 
        increase: memoryIncrease, 
        threshold: this.thresholds.memoryLeak,
        baselineAvg,
        recentAvg
      });
    }
  }

  analyzeTabUsagePatterns(sequence) {
    // Analyze user tab navigation patterns for UX insights
    if (sequence.length < 3) return;
    
    const recentClicks = sequence.slice(-5);
    const rapidClicks = recentClicks.filter((click, index) => {
      if (index === 0) return false;
      return (click.timestamp - recentClicks[index - 1].timestamp) < 1000;
    });
    
    if (rapidClicks.length > 2) {
      // User is rapidly clicking - possible confusion
      this.recordError('warning', 'Rapid tab clicking detected - possible UX confusion', null, {
        sequence: recentClicks
      });
    }
  }

  updateTaskCompletionRate() {
    const attempts = (this.healthData.userExperience.bookingAccessAttempts || 0);
    const successes = (this.healthData.userExperience.bookingAccessSuccesses || 0);
    
    if (attempts > 0) {
      this.healthData.userExperience.taskCompletionRate = successes / attempts;
      
      if (this.healthData.userExperience.taskCompletionRate < this.thresholds.completionRate) {
        this.triggerAlert('low_completion_rate', {
          rate: this.healthData.userExperience.taskCompletionRate,
          attempts,
          successes
        });
      }
    }
  }

  calculateUserSatisfaction() {
    const feedbackData = window.qmsHealthMonitor?.getFeedback?.() || { ratings: [] };
    
    if (feedbackData.ratings.length > 0) {
      const totalScore = feedbackData.ratings.reduce((sum, rating) => sum + rating.score, 0);
      this.healthData.userExperience.userFeedbackScore = totalScore / feedbackData.ratings.length;
    }
  }

  // Alert system
  triggerAlert(type, data) {
    const alert = {
      type,
      data,
      timestamp: Date.now(),
      severity: this.getAlertSeverity(type),
      acknowledged: false
    };
    
    this.alerts.push(alert);
    
    // Send to monitoring service
    this.sendToMonitoringService(alert);
    
    // Console logging for development
    console.warn(`[QMS Health Monitor] Alert: ${type}`, data);
    
    return alert;
  }

  getAlertSeverity(type) {
    const criticalTypes = ['critical_error', 'memory_leak', 'high_vue_failure_rate'];
    const warningTypes = ['slow_initialization', 'slow_tab_switch', 'low_completion_rate'];
    
    if (criticalTypes.includes(type)) return 'critical';
    if (warningTypes.includes(type)) return 'warning';
    return 'info';
  }

  sendToMonitoringService(alert) {
    // Implementation for sending alerts to external monitoring service
    if (typeof fetch !== 'undefined' && window.location.hostname !== 'localhost') {
      fetch('/api/monitoring/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert)
      }).catch(err => {
        console.warn('Failed to send alert to monitoring service:', err);
      });
    }
  }

  // Public API methods
  getHealthReport() {
    return {
      timestamp: Date.now(),
      status: this.getOverallHealthStatus(),
      data: { ...this.healthData },
      alerts: this.alerts.filter(a => !a.acknowledged),
      thresholds: this.thresholds
    };
  }

  getOverallHealthStatus() {
    const criticalAlerts = this.alerts.filter(a => a.severity === 'critical' && !a.acknowledged);
    const warningAlerts = this.alerts.filter(a => a.severity === 'warning' && !a.acknowledged);
    
    if (criticalAlerts.length > 0) return 'critical';
    if (warningAlerts.length > 3) return 'degraded';
    return 'healthy';
  }

  acknowledgeAlert(alertIndex) {
    if (this.alerts[alertIndex]) {
      this.alerts[alertIndex].acknowledged = true;
      this.alerts[alertIndex].acknowledgedAt = Date.now();
    }
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // Run health checks every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.runHealthChecks();
    }, 30000);
    
    console.log('[QMS Health Monitor] Monitoring started');
  }

  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Cleanup observers
    this.observers.forEach(observer => {
      if (observer.disconnect) {
        observer.disconnect();
      }
    });
    this.observers = [];
    
    console.log('[QMS Health Monitor] Monitoring stopped');
  }

  runHealthChecks() {
    // Run comprehensive health checks
    this.monitorContainerSelection();
    this.checkHealthThresholds();
    this.checkForMemoryLeaks();
    
    // Generate periodic health report
    const report = this.getHealthReport();
    
    // Send to monitoring service if needed
    if (report.status !== 'healthy') {
      this.sendToMonitoringService({
        type: 'health_report',
        data: report,
        timestamp: Date.now()
      });
    }
  }

  // Export data for analysis
  exportHealthData() {
    return JSON.stringify({
      healthData: this.healthData,
      alerts: this.alerts,
      thresholds: this.thresholds,
      exportedAt: Date.now()
    }, null, 2);
  }

  reset() {
    // Reset all health data (useful for testing)
    this.healthData = {
      containerSelection: { checks: 0, failures: 0, lastFailure: null },
      vueInitialization: { attempts: 0, failures: 0, averageTime: 0, lastFailure: null },
      tabNavigation: { attempts: 0, failures: 0, averageTime: 0, lastFailure: null },
      bookingAccess: { attempts: 0, failures: 0, accessDeniedCount: 0, lastFailure: null },
      performance: { initializationTimes: [], tabSwitchTimes: [], bookingLoadTimes: [], memoryUsage: [] },
      errors: { critical: [], errors: [], warnings: [] },
      userExperience: { taskCompletionRate: 0, userFeedbackScore: 0, abandonmentRate: 0 }
    };
    this.alerts = [];
  }
}

// Initialize global monitor instance
if (typeof window !== 'undefined') {
  window.qmsHealthMonitor = window.qmsHealthMonitor || new QMSHealthMonitor();
  
  // Auto-start monitoring in production
  if (window.location.hostname !== 'localhost') {
    window.qmsHealthMonitor.startMonitoring();
  }
  
  // Expose useful methods globally
  window.qmsHealthReport = () => window.qmsHealthMonitor.getHealthReport();
  window.qmsHealthExport = () => window.qmsHealthMonitor.exportHealthData();
}

// Export for Node.js/testing environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QMSHealthMonitor;
}

export { QMSHealthMonitor };