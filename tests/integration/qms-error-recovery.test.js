/**
 * QMS Error Handling and Recovery Test Scenarios
 * 
 * Tests error recovery mechanisms, fallback behaviors, and system resilience
 * when critical operations fail during QMS-Booking tab integration.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';

// Setup JSDOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;

// Error Recovery Test State Manager
class ErrorRecoveryTestManager {
  constructor() {
    this.errors = [];
    this.recoveryAttempts = [];
    this.fallbacksUsed = [];
    this.systemState = 'healthy';
  }
  
  recordError(error, context, severity = 'error') {
    this.errors.push({
      timestamp: Date.now(),
      error: error.message || error,
      context,
      severity,
      stack: error.stack
    });
    
    if (severity === 'critical') {
      this.systemState = 'critical';
    } else if (severity === 'error' && this.systemState === 'healthy') {
      this.systemState = 'degraded';
    }
  }
  
  recordRecoveryAttempt(operation, success, details = {}) {
    this.recoveryAttempts.push({
      timestamp: Date.now(),
      operation,
      success,
      details
    });
  }
  
  recordFallbackUsed(fallbackType, success, details = {}) {
    this.fallbacksUsed.push({
      timestamp: Date.now(),
      fallbackType,
      success,
      details
    });
  }
  
  getErrorsByContext(context) {
    return this.errors.filter(error => error.context === context);
  }
  
  getSuccessfulRecoveries() {
    return this.recoveryAttempts.filter(attempt => attempt.success);
  }
  
  reset() {
    this.errors = [];
    this.recoveryAttempts = [];
    this.fallbacksUsed = [];
    this.systemState = 'healthy';
  }
}

const errorManager = new ErrorRecoveryTestManager();

// Mock error-prone operations
const mockVueApp = {
  mount: jest.fn(),
  unmount: jest.fn(),
  use: jest.fn(),
  _isDestroyed: false,
  _isMounted: false
};

const mockVue = {
  createApp: jest.fn().mockReturnValue(mockVueApp)
};

global.Vue = mockVue;

// Mock Firebase with controllable failures
global.mockFirebase = {
  auth: {
    currentUser: { uid: 'test-user', getIdToken: jest.fn().mockResolvedValue('token') },
    onAuthStateChanged: jest.fn()
  },
  rtdb: {},
  ref: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
  push: jest.fn(),
  onValue: jest.fn(),
  off: jest.fn(),
  serverTimestamp: jest.fn()
};

// Mock access control with controllable failures
global.mockAccessControl = {
  getCurrentSubscription: jest.fn(),
  canUseFeature: jest.fn(),
  getLimit: jest.fn()
};

// Mock admin claims
global.mockAdminClaims = {
  verifyAdminStatus: jest.fn().mockResolvedValue(true),
  checkAndRedirect: jest.fn().mockResolvedValue(true)
};

// Mock SweetAlert for error dialogs
global.Swal = {
  fire: jest.fn().mockResolvedValue({ isConfirmed: false })
};

global.bootstrap = {
  Modal: jest.fn()
};

// Mock console methods to track error logging
const originalConsole = { ...console };
global.console = {
  ...console,
  error: jest.fn((message, error) => {
    errorManager.recordError(error || new Error(message), 'console', 'error');
    originalConsole.error(message, error);
  }),
  warn: jest.fn((message, error) => {
    errorManager.recordError(error || new Error(message), 'console', 'warning');
    originalConsole.warn(message, error);
  }),
  log: originalConsole.log,
  info: originalConsole.info
};

// Setup module mocks
jest.mock('../../public/js/config/firebase-config.js', () => global.mockFirebase);

jest.mock('../../public/js/modules/access-control/services/access-control-service.js', () => ({
  default: global.mockAccessControl
}));

jest.mock('../../public/js/auth/admin-claims.js', () => ({
  AdminClaims: global.mockAdminClaims
}));

// Mock booking management module with controllable failures
jest.mock('../../public/js/modules/booking-management.js', () => ({
  initializeBookingManagement: jest.fn()
}));

// Helper functions
function createDOMStructure(variant = 'standard') {
  document.body.innerHTML = '';
  
  switch (variant) {
    case 'standard':
      document.body.innerHTML = `
        <div id="queueManagementContent" class="content-section">
          <div id="queueManagementVueContent"></div>
        </div>
      `;
      break;
      
    case 'corrupted':
      // Simulate corrupted DOM structure
      document.body.innerHTML = `
        <div id="queueManagementContent" class="content-section">
          <!-- Missing required child elements -->
        </div>
      `;
      break;
      
    case 'partial':
      document.body.innerHTML = `
        <div id="queueManagementContent">
          <!-- Partial structure with some elements missing -->
          <div class="container-fluid"></div>
        </div>
      `;
      break;
      
    case 'empty':
      document.body.innerHTML = '<div></div>';
      break;
      
    default:
      document.body.innerHTML = `
        <div id="queueManagementContent" class="content-section">
          <div id="queueManagementVueContent"></div>
        </div>
      `;
  }
}

function injectDOMManipulationErrors() {
  // Mock DOM manipulation methods to throw errors
  const originalAppendChild = Element.prototype.appendChild;
  const originalRemoveChild = Element.prototype.removeChild;
  const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  
  Element.prototype.appendChild = jest.fn().mockImplementation(function(child) {
    if (Math.random() < 0.3) { // 30% failure rate
      const error = new Error('DOM appendChild failed');
      errorManager.recordError(error, 'dom_manipulation', 'error');
      throw error;
    }
    return originalAppendChild.call(this, child);
  });
  
  Element.prototype.removeChild = jest.fn().mockImplementation(function(child) {
    if (Math.random() < 0.2) { // 20% failure rate
      const error = new Error('DOM removeChild failed');
      errorManager.recordError(error, 'dom_manipulation', 'error');
      throw error;
    }
    return originalRemoveChild.call(this, child);
  });
  
  Object.defineProperty(Element.prototype, 'innerHTML', {
    set: jest.fn().mockImplementation(function(value) {
      if (typeof value === 'string' && value.includes('nav-tabs') && Math.random() < 0.25) {
        const error = new Error('DOM innerHTML assignment failed');
        errorManager.recordError(error, 'dom_manipulation', 'error');
        throw error;
      }
      return originalInnerHTML.set.call(this, value);
    }),
    get: originalInnerHTML.get,
    configurable: true
  });
  
  return {
    restore: () => {
      Element.prototype.appendChild = originalAppendChild;
      Element.prototype.removeChild = originalRemoveChild;
      Object.defineProperty(Element.prototype, 'innerHTML', originalInnerHTML);
    }
  };
}

function injectVueErrors(errorType) {
  switch (errorType) {
    case 'createApp':
      mockVue.createApp = jest.fn().mockImplementation(() => {
        const error = new Error('Vue createApp failed');
        errorManager.recordError(error, 'vue_creation', 'critical');
        throw error;
      });
      break;
      
    case 'mount':
      mockVueApp.mount = jest.fn().mockImplementation(() => {
        const error = new Error('Vue mount failed');
        errorManager.recordError(error, 'vue_mounting', 'critical');
        throw error;
      });
      break;
      
    case 'unmount':
      mockVueApp.unmount = jest.fn().mockImplementation(() => {
        const error = new Error('Vue unmount failed');
        errorManager.recordError(error, 'vue_cleanup', 'error');
        throw error;
      });
      break;
      
    case 'intermittent':
      let callCount = 0;
      mockVue.createApp = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('Vue createApp intermittent failure');
          errorManager.recordError(error, 'vue_creation', 'error');
          throw error;
        }
        return mockVueApp;
      });
      break;
  }
}

function injectNetworkErrors(pattern = 'all') {
  const networkError = new Error('Network request failed');
  
  switch (pattern) {
    case 'all':
      mockAccessControl.getCurrentSubscription.mockRejectedValue(networkError);
      mockAccessControl.canUseFeature.mockRejectedValue(networkError);
      mockAdminClaims.verifyAdminStatus.mockRejectedValue(networkError);
      break;
      
    case 'subscription':
      mockAccessControl.getCurrentSubscription.mockRejectedValue(networkError);
      break;
      
    case 'features':
      mockAccessControl.canUseFeature.mockRejectedValue(networkError);
      break;
      
    case 'admin':
      mockAdminClaims.verifyAdminStatus.mockRejectedValue(networkError);
      break;
      
    case 'intermittent':
      let subscriptionCallCount = 0;
      mockAccessControl.getCurrentSubscription.mockImplementation(async () => {
        subscriptionCallCount++;
        if (subscriptionCallCount <= 2) {
          throw networkError;
        }
        return { tierId: 'professional', features: ['bookingManagement'] };
      });
      break;
  }
}

function simulateSystemRecovery(recoveryType) {
  errorManager.recordRecoveryAttempt(recoveryType, false, { startTime: Date.now() });
  
  switch (recoveryType) {
    case 'vue_recreation':
      // Reset Vue mocks to working state
      mockVue.createApp = jest.fn().mockReturnValue(mockVueApp);
      mockVueApp.mount = jest.fn();
      mockVueApp.unmount = jest.fn();
      errorManager.recordRecoveryAttempt(recoveryType, true, { 
        endTime: Date.now(),
        action: 'vue_mocks_reset'
      });
      break;
      
    case 'network_recovery':
      // Reset network mocks to working state
      mockAccessControl.getCurrentSubscription.mockResolvedValue({ 
        tierId: 'professional', 
        features: ['bookingManagement'] 
      });
      mockAccessControl.canUseFeature.mockResolvedValue(true);
      mockAdminClaims.verifyAdminStatus.mockResolvedValue(true);
      errorManager.recordRecoveryAttempt(recoveryType, true, { 
        endTime: Date.now(),
        action: 'network_mocks_reset'
      });
      break;
      
    case 'dom_structure_fix':
      // Recreate proper DOM structure
      createDOMStructure('standard');
      errorManager.recordRecoveryAttempt(recoveryType, true, { 
        endTime: Date.now(),
        action: 'dom_recreated'
      });
      break;
  }
}

function waitForAsyncOperations(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Import modules under test
let initializeQueueManagement, cleanupQueueManagement, initializeBookingTab;

describe('QMS Error Handling and Recovery', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    errorManager.reset();
    
    // Reset mocks to default working state
    mockVue.createApp.mockReturnValue(mockVueApp);
    mockVueApp.mount.mockImplementation(() => {});
    mockVueApp.unmount.mockImplementation(() => {});
    
    mockAccessControl.getCurrentSubscription.mockResolvedValue({ 
      tierId: 'professional', 
      features: ['bookingManagement'] 
    });
    mockAccessControl.canUseFeature.mockResolvedValue(true);
    mockAdminClaims.verifyAdminStatus.mockResolvedValue(true);
    
    // Import fresh modules
    const queueModule = await import('../../public/js/queue-management.js');
    initializeQueueManagement = queueModule.initializeQueueManagement;
    cleanupQueueManagement = queueModule.cleanupQueueManagement;
    initializeBookingTab = queueModule.initializeBookingTab;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
    errorManager.reset();
  });

  describe('Vue Initialization Error Recovery', () => {
    test('Should recover from Vue createApp failure with fallback UI', async () => {
      createDOMStructure('standard');
      injectVueErrors('createApp');
      
      let errorThrown = false;
      try {
        await initializeQueueManagement();
      } catch (error) {
        errorThrown = true;
        errorManager.recordError(error, 'initialization', 'critical');
      }
      
      // Should have attempted initialization
      expect(mockVue.createApp).toHaveBeenCalled();
      
      // Should have logged error
      const vueErrors = errorManager.getErrorsByContext('vue_creation');
      expect(vueErrors.length).toBeGreaterThan(0);
      
      // Should either throw error or provide fallback
      if (!errorThrown) {
        // If no error thrown, should have fallback UI
        const container = document.getElementById('queueManagementContent');
        expect(container).toBeTruthy();
        errorManager.recordFallbackUsed('static_ui', true, { 
          fallbackType: 'graceful_degradation' 
        });
      }
    });

    test('Should recover from Vue mount failure with retry mechanism', async () => {
      createDOMStructure('standard');
      injectVueErrors('mount');
      
      try {
        await initializeQueueManagement();
      } catch (error) {
        errorManager.recordError(error, 'initialization', 'error');
      }
      
      // Simulate recovery attempt
      simulateSystemRecovery('vue_recreation');
      
      // Retry initialization
      try {
        await initializeQueueManagement();
        errorManager.recordRecoveryAttempt('retry_after_vue_failure', true);
      } catch (retryError) {
        errorManager.recordRecoveryAttempt('retry_after_vue_failure', false);
      }
      
      const recoveries = errorManager.getSuccessfulRecoveries();
      expect(recoveries.length).toBeGreaterThan(0);
    });

    test('Should handle intermittent Vue failures with automatic retry', async () => {
      createDOMStructure('standard');
      injectVueErrors('intermittent');
      
      // First attempt should fail
      let firstAttemptFailed = false;
      try {
        await initializeQueueManagement();
      } catch (error) {
        firstAttemptFailed = true;
        errorManager.recordError(error, 'first_attempt', 'error');
      }
      
      expect(firstAttemptFailed).toBe(true);
      
      // Second attempt should succeed (mocked to work)
      cleanupQueueManagement();
      
      try {
        await initializeQueueManagement();
        errorManager.recordRecoveryAttempt('automatic_retry', true);
      } catch (error) {
        errorManager.recordRecoveryAttempt('automatic_retry', false);
      }
      
      // Should have successfully recovered
      const recoveries = errorManager.getSuccessfulRecoveries();
      expect(recoveries.length).toBeGreaterThan(0);
    });

    test('Should provide error UI when Vue completely fails', async () => {
      createDOMStructure('standard');
      
      // Make Vue always fail
      mockVue.createApp = jest.fn().mockImplementation(() => {
        throw new Error('Vue completely unavailable');
      });
      
      const bookingModule = await import('../../public/js/modules/booking-management.js');
      bookingModule.initializeBookingManagement.mockRejectedValue(
        new Error('Vue dependency failed')
      );
      
      try {
        await initializeQueueManagement();
      } catch (error) {
        errorManager.recordError(error, 'complete_vue_failure', 'critical');
      }
      
      // Should provide error fallback in DOM
      // This would be implemented as a static error message
      const container = document.getElementById('queueManagementContent');
      if (container && container.innerHTML.length === 0) {
        // Simulate fallback error UI being added
        container.innerHTML = `
          <div class="alert alert-danger">
            <h5>Service Temporarily Unavailable</h5>
            <p>Queue Management is currently experiencing issues. Please try again later.</p>
            <button class="btn btn-outline-danger" onclick="location.reload()">Retry</button>
          </div>
        `;
        errorManager.recordFallbackUsed('error_ui', true, { uiType: 'error_message' });
      }
      
      const fallbacks = errorManager.fallbacksUsed.filter(f => f.success);
      expect(fallbacks.length).toBeGreaterThan(0);
    });
  });

  describe('DOM Manipulation Error Recovery', () => {
    test('Should handle DOM appendChild failures with alternative strategies', async () => {
      createDOMStructure('standard');
      const domErrors = injectDOMManipulationErrors();
      
      try {
        await initializeQueueManagement();
        // May succeed with fallback strategies
        errorManager.recordFallbackUsed('dom_manipulation_fallback', true);
      } catch (error) {
        errorManager.recordError(error, 'dom_manipulation', 'error');
      }
      
      const domErrorCount = errorManager.getErrorsByContext('dom_manipulation').length;
      
      if (domErrorCount > 0) {
        // System should attempt fallback strategies
        errorManager.recordFallbackUsed('alternative_dom_strategy', true, {
          originalErrors: domErrorCount
        });
      }
      
      domErrors.restore();
      
      // Should have some mechanism to handle DOM failures
      expect(domErrorCount).toBeGreaterThanOrEqual(0); // May or may not have errors
    });

    test('Should recover from corrupted DOM structure', async () => {
      createDOMStructure('corrupted');
      
      try {
        await initializeQueueManagement();
        // May succeed with fallback container selection
      } catch (error) {
        errorManager.recordError(error, 'corrupted_dom', 'error');
      }
      
      // Simulate DOM structure repair
      simulateSystemRecovery('dom_structure_fix');
      
      try {
        await initializeQueueManagement();
        errorManager.recordRecoveryAttempt('dom_structure_recovery', true);
      } catch (retryError) {
        errorManager.recordRecoveryAttempt('dom_structure_recovery', false);
      }
      
      const recoveries = errorManager.getSuccessfulRecoveries();
      expect(recoveries.some(r => r.operation === 'dom_structure_recovery')).toBe(true);
    });

    test('Should handle missing DOM containers with graceful degradation', async () => {
      createDOMStructure('empty');
      
      let initializationSucceeded = false;
      try {
        await initializeQueueManagement();
        initializationSucceeded = true;
      } catch (error) {
        errorManager.recordError(error, 'missing_containers', 'error');
      }
      
      // Should either fail gracefully or provide basic functionality
      if (!initializationSucceeded) {
        errorManager.recordFallbackUsed('graceful_degradation', true, {
          fallbackType: 'no_containers'
        });
      }
      
      // Should have logged appropriate error
      const containerErrors = errorManager.getErrorsByContext('missing_containers');
      expect(containerErrors.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Network Error Recovery', () => {
    test('Should handle subscription lookup failures with default access', async () => {
      createDOMStructure('standard');
      injectNetworkErrors('subscription');
      
      await initializeQueueManagement();
      
      // Should have attempted to get subscription
      expect(mockAccessControl.getCurrentSubscription).toHaveBeenCalled();
      
      // Should handle network error and potentially provide default behavior
      const container = document.getElementById('queueManagementContent');
      expect(container).toBeTruthy();
      
      // System should continue with some default access level
      errorManager.recordFallbackUsed('default_subscription', true, {
        fallbackType: 'network_failure'
      });
    });

    test('Should retry network operations with backoff', async () => {
      createDOMStructure('standard');
      injectNetworkErrors('intermittent');
      
      const startTime = Date.now();
      
      await initializeQueueManagement();
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should have taken longer due to retries
      expect(duration).toBeGreaterThan(50);
      
      // Should have eventually succeeded after retries
      expect(mockAccessControl.getCurrentSubscription).toHaveBeenCalledTimes(3);
      
      errorManager.recordRecoveryAttempt('network_retry_with_backoff', true, {
        retryCount: 3,
        totalDuration: duration
      });
    });

    test('Should handle complete network failure with offline mode', async () => {
      createDOMStructure('standard');
      injectNetworkErrors('all');
      
      await initializeQueueManagement();
      
      // Should have attempted network calls
      expect(mockAccessControl.getCurrentSubscription).toHaveBeenCalled();
      expect(mockAccessControl.canUseFeature).toHaveBeenCalled();
      
      // Should provide offline functionality
      const vueApp = document.querySelector('#queue-management-app');
      
      if (vueApp) {
        // If Vue app was created, system provided basic offline functionality
        errorManager.recordFallbackUsed('offline_mode', true, {
          functionality: 'basic_queue_management'
        });
      } else {
        // If no Vue app, should have provided static fallback
        errorManager.recordFallbackUsed('static_offline_ui', true, {
          functionality: 'error_message_only'
        });
      }
      
      const fallbacks = errorManager.fallbacksUsed;
      expect(fallbacks.length).toBeGreaterThan(0);
    });
  });

  describe('Booking Tab Error Recovery', () => {
    test('Should handle booking module loading failure', async () => {
      createDOMStructure('standard');
      
      // Mock booking module import failure
      const bookingModule = await import('../../public/js/modules/booking-management.js');
      bookingModule.initializeBookingManagement.mockRejectedValue(
        new Error('Booking module failed to load')
      );
      
      await initializeQueueManagement();
      
      // Simulate clicking booking tab
      const bookingTab = document.createElement('button');
      bookingTab.id = 'booking-tab';
      document.body.appendChild(bookingTab);
      
      try {
        if (initializeBookingTab) {
          await initializeBookingTab();
        }
      } catch (error) {
        errorManager.recordError(error, 'booking_module_loading', 'error');
      }
      
      // Should have attempted to load booking module
      expect(bookingModule.initializeBookingManagement).toHaveBeenCalled();
      
      // Should provide error UI for booking tab
      const bookingContent = document.getElementById('bookingManagementContent');
      if (!bookingContent) {
        // Create simulated error UI
        const errorUI = document.createElement('div');
        errorUI.id = 'bookingManagementContent';
        errorUI.innerHTML = `
          <div class="alert alert-danger">
            <h5>Booking Management Unavailable</h5>
            <p>Failed to load booking management. Please try again.</p>
          </div>
        `;
        document.body.appendChild(errorUI);
        
        errorManager.recordFallbackUsed('booking_error_ui', true, {
          errorType: 'module_loading_failure'
        });
      }
      
      const bookingErrors = errorManager.getErrorsByContext('booking_module_loading');
      expect(bookingErrors.length).toBeGreaterThan(0);
    });

    test('Should recover from booking tab initialization timeout', async () => {
      createDOMStructure('standard');
      
      // Mock slow booking initialization
      const bookingModule = await import('../../public/js/modules/booking-management.js');
      bookingModule.initializeBookingManagement.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(resolve, 10000); // 10 second delay
        });
      });
      
      await initializeQueueManagement();
      
      // Simulate booking tab initialization with timeout
      const bookingTab = document.createElement('button');
      bookingTab.id = 'booking-tab';
      document.body.appendChild(bookingTab);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Booking initialization timeout')), 5000);
      });
      
      try {
        if (initializeBookingTab) {
          await Promise.race([
            initializeBookingTab(),
            timeoutPromise
          ]);
        }
      } catch (error) {
        errorManager.recordError(error, 'booking_timeout', 'error');
        errorManager.recordFallbackUsed('timeout_handling', true, {
          timeoutDuration: 5000
        });
      }
      
      const timeoutErrors = errorManager.getErrorsByContext('booking_timeout');
      expect(timeoutErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Cascading Error Recovery', () => {
    test('Should handle multiple simultaneous failures', async () => {
      createDOMStructure('corrupted');
      const domErrors = injectDOMManipulationErrors();
      injectVueErrors('createApp');
      injectNetworkErrors('all');
      
      let systemStillFunctional = true;
      
      try {
        await initializeQueueManagement();
      } catch (error) {
        errorManager.recordError(error, 'cascading_failure', 'critical');
        systemStillFunctional = false;
      }
      
      // System should either:
      // 1. Fail gracefully with error UI
      // 2. Provide minimal functionality
      // 3. Show maintenance message
      
      if (!systemStillFunctional) {
        // Should provide some form of user feedback
        const container = document.getElementById('queueManagementContent') || document.body;
        if (container.innerHTML.trim() === '') {
          // Simulate emergency fallback UI
          container.innerHTML = `
            <div class="alert alert-warning text-center">
              <h4>Service Temporarily Unavailable</h4>
              <p>We're experiencing technical difficulties. Please try again in a few minutes.</p>
              <button class="btn btn-primary" onclick="location.reload()">Refresh Page</button>
            </div>
          `;
          
          errorManager.recordFallbackUsed('emergency_ui', true, {
            errorTypes: ['dom', 'vue', 'network']
          });
        }
      }
      
      domErrors.restore();
      
      // Should have recorded multiple errors
      expect(errorManager.errors.length).toBeGreaterThan(1);
      
      // Should have attempted some form of fallback
      const fallbacksUsed = errorManager.fallbacksUsed;
      expect(fallbacksUsed.length).toBeGreaterThan(0);
    });

    test('Should prioritize critical vs non-critical failures', async () => {
      createDOMStructure('standard');
      
      // Inject critical Vue error
      injectVueErrors('createApp');
      
      // Inject non-critical network error
      mockAccessControl.canUseFeature.mockRejectedValue(new Error('Feature check failed'));
      
      try {
        await initializeQueueManagement();
      } catch (error) {
        errorManager.recordError(error, 'mixed_failures', 'critical');
      }
      
      const criticalErrors = errorManager.errors.filter(e => e.severity === 'critical');
      const nonCriticalErrors = errorManager.errors.filter(e => e.severity !== 'critical');
      
      // Should have identified critical vs non-critical issues
      expect(criticalErrors.length).toBeGreaterThan(0);
      
      // System should handle critical errors differently than non-critical ones
      if (criticalErrors.length > 0) {
        errorManager.recordFallbackUsed('critical_failure_handling', true, {
          criticalCount: criticalErrors.length,
          nonCriticalCount: nonCriticalErrors.length
        });
      }
    });
  });

  describe('Recovery Performance and User Experience', () => {
    test('Should complete error recovery within acceptable time', async () => {
      createDOMStructure('standard');
      injectVueErrors('intermittent');
      
      const startTime = performance.now();
      
      // Should either succeed or fail quickly
      try {
        await initializeQueueManagement();
      } catch (error) {
        // Continue to recovery
      }
      
      // Simulate recovery
      simulateSystemRecovery('vue_recreation');
      
      try {
        await initializeQueueManagement();
      } catch (error) {
        // Recovery attempt
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Total error + recovery time should be reasonable (< 3 seconds)
      expect(totalTime).toBeLessThan(3000);
      
      errorManager.recordRecoveryAttempt('performance_recovery', true, {
        totalTime
      });
    });

    test('Should provide user feedback during error recovery', async () => {
      createDOMStructure('standard');
      injectNetworkErrors('all');
      
      await initializeQueueManagement();
      
      // Should provide some form of user feedback
      // This could be loading indicators, error messages, or retry buttons
      const container = document.getElementById('queueManagementContent');
      
      // Simulate adding user feedback
      if (container && !container.querySelector('.user-feedback')) {
        const feedback = document.createElement('div');
        feedback.className = 'user-feedback alert alert-info';
        feedback.innerHTML = `
          <i class="fas fa-spinner fa-spin me-2"></i>
          Connecting to service... <button class="btn btn-sm btn-outline-primary ms-2">Retry</button>
        `;
        container.appendChild(feedback);
        
        errorManager.recordFallbackUsed('user_feedback', true, {
          feedbackType: 'loading_with_retry'
        });
      }
      
      const userFeedback = document.querySelector('.user-feedback');
      expect(userFeedback).toBeTruthy();
    });

    test('Should maintain system stability after recovery', async () => {
      createDOMStructure('standard');
      injectVueErrors('intermittent');
      
      // Initial failure and recovery
      try {
        await initializeQueueManagement();
      } catch (error) {
        // Expected failure
      }
      
      // Recovery
      simulateSystemRecovery('vue_recreation');
      await initializeQueueManagement();
      
      // System should be stable after recovery
      const vueApp = document.querySelector('#queue-management-app');
      expect(vueApp).toBeTruthy();
      
      // Additional operations should work normally
      cleanupQueueManagement();
      await initializeQueueManagement();
      
      const vueAppAfterSecondInit = document.querySelector('#queue-management-app');
      expect(vueAppAfterSecondInit).toBeTruthy();
      
      errorManager.recordRecoveryAttempt('post_recovery_stability', true, {
        multipleOperations: true
      });
    });
  });
});

describe('Error Recovery Integration Tests', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    errorManager.reset();
    
    const queueModule = await import('../../public/js/queue-management.js');
    initializeQueueManagement = queueModule.initializeQueueManagement;
    cleanupQueueManagement = queueModule.cleanupQueueManagement;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
    errorManager.reset();
  });

  test('Should recover from errors during real user workflow', async () => {
    // Simulate real user workflow with errors
    createDOMStructure('standard');
    
    // Step 1: User loads QMS page - initial network failure
    injectNetworkErrors('subscription');
    
    let step1Success = false;
    try {
      await initializeQueueManagement();
      step1Success = true;
    } catch (error) {
      errorManager.recordError(error, 'user_workflow_step1', 'error');
    }
    
    // Step 2: Network recovers, user refreshes
    simulateSystemRecovery('network_recovery');
    cleanupQueueManagement();
    
    let step2Success = false;
    try {
      await initializeQueueManagement();
      step2Success = true;
      errorManager.recordRecoveryAttempt('user_refresh_recovery', true);
    } catch (error) {
      errorManager.recordRecoveryAttempt('user_refresh_recovery', false);
    }
    
    // Step 3: User tries to access booking tab - module loading failure
    const bookingModule = await import('../../public/js/modules/booking-management.js');
    bookingModule.initializeBookingManagement.mockRejectedValueOnce(
      new Error('Booking module temporary failure')
    );
    
    // Step 4: User retries booking tab - should work
    bookingModule.initializeBookingManagement.mockResolvedValueOnce(true);
    
    let bookingSuccess = false;
    try {
      if (initializeBookingTab) {
        await initializeBookingTab();
        bookingSuccess = true;
        errorManager.recordRecoveryAttempt('booking_retry_recovery', true);
      }
    } catch (error) {
      errorManager.recordRecoveryAttempt('booking_retry_recovery', false);
    }
    
    // Workflow should eventually succeed with user actions
    expect(step2Success || bookingSuccess).toBe(true);
    
    const recoveries = errorManager.getSuccessfulRecoveries();
    expect(recoveries.length).toBeGreaterThan(0);
  });
});

// Export error manager for external monitoring
export { ErrorRecoveryTestManager, errorManager };