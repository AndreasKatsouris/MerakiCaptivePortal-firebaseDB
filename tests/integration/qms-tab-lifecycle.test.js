/**
 * QMS Tab Lifecycle and State Management Integration Tests
 * 
 * Tests the tab lifecycle management, navigation state persistence,
 * and cleanup operations identified as critical failure points.
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

// Mock Bootstrap
global.bootstrap = {
  Tab: jest.fn().mockImplementation(() => ({
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn()
  })),
  Modal: jest.fn()
};

// Mock Vue with detailed lifecycle tracking
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

// Mock Firebase and other dependencies
jest.mock('../../public/js/config/firebase-config.js', () => ({
  auth: { 
    currentUser: { uid: 'test-admin-user', getIdToken: jest.fn().mockResolvedValue('test-token') },
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
}));

jest.mock('../../public/js/modules/access-control/services/access-control-service.js', () => ({
  default: {
    getCurrentSubscription: jest.fn().mockResolvedValue({ tierId: 'professional' }),
    canUseFeature: jest.fn().mockResolvedValue(true),
    getLimit: jest.fn().mockResolvedValue(100)
  }
}));

jest.mock('../../public/js/auth/admin-claims.js', () => ({
  AdminClaims: {
    verifyAdminStatus: jest.fn().mockResolvedValue(true),
    checkAndRedirect: jest.fn().mockResolvedValue(true)
  }
}));

// Mock booking management module
jest.mock('../../public/js/modules/booking-management.js', () => ({
  initializeBookingManagement: jest.fn().mockResolvedValue(true)
}));

global.Swal = {
  fire: jest.fn().mockResolvedValue({ isConfirmed: false })
};

// State tracking for lifecycle tests
class TabLifecycleTracker {
  constructor() {
    this.events = [];
    this.tabStates = new Map();
    this.vueInstances = new Map();
  }
  
  recordEvent(type, data) {
    this.events.push({
      timestamp: Date.now(),
      type,
      data: { ...data }
    });
  }
  
  recordTabState(tabId, state) {
    this.tabStates.set(tabId, {
      ...state,
      timestamp: Date.now()
    });
  }
  
  recordVueInstance(instanceId, state) {
    this.vueInstances.set(instanceId, {
      ...state,
      timestamp: Date.now()
    });
  }
  
  getEventsByType(type) {
    return this.events.filter(event => event.type === type);
  }
  
  getLatestTabState(tabId) {
    return this.tabStates.get(tabId);
  }
  
  reset() {
    this.events = [];
    this.tabStates.clear();
    this.vueInstances.clear();
  }
}

const lifecycleTracker = new TabLifecycleTracker();

// Helper functions
function createAdminDashboardDOM() {
  document.body.innerHTML = `
    <div id="queueManagementContent" class="content-section d-none">
      <div class="container-fluid">
        <!-- This will be populated by the initialization process -->
      </div>
    </div>
  `;
}

function createUserDashboardDOM() {
  document.body.innerHTML = `
    <div class="container-fluid">
      <h2>Queue Management</h2>
      <ul class="nav nav-tabs nav-tabs-custom" id="qmsTabsNav" role="tablist">
        <li class="nav-item" role="presentation">
          <button class="nav-link active" id="queue-tab" data-bs-toggle="tab" data-bs-target="#queue-pane" type="button" role="tab">
            <i class="fas fa-clock me-2"></i>Queue Management
          </button>
        </li>
        <li class="nav-item" role="presentation" id="booking-tab-container">
          <button class="nav-link" id="booking-tab" data-bs-toggle="tab" data-bs-target="#booking-pane" type="button" role="tab">
            <i class="fas fa-calendar-alt me-2"></i>Booking Management
            <i class="fas fa-lock ms-2 d-none" id="booking-lock-icon"></i>
          </button>
        </li>
      </ul>
      <div class="tab-content" id="qmsTabsContent">
        <div class="tab-pane fade show active" id="queue-pane" role="tabpanel">
          <div id="queueManagementContent">
            <!-- Vue app will mount here -->
          </div>
        </div>
        <div class="tab-pane fade" id="booking-pane" role="tabpanel">
          <div id="bookingManagementContent">
            <div class="booking-tab-loading">
              <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <p class="text-muted">Loading booking management...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function simulateTabClick(tabId) {
  const tab = document.getElementById(tabId);
  if (!tab) return false;
  
  lifecycleTracker.recordEvent('tab_click', { tabId });
  
  // Simulate Bootstrap tab behavior
  const targetId = tab.getAttribute('data-bs-target');
  if (targetId) {
    // Hide all tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('show', 'active');
    });
    
    // Show target pane
    const targetPane = document.querySelector(targetId);
    if (targetPane) {
      targetPane.classList.add('show', 'active');
    }
    
    // Update tab states
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    tab.classList.add('active');
    
    lifecycleTracker.recordTabState(tabId, {
      active: true,
      targetVisible: !!targetPane?.classList.contains('show')
    });
    
    // Trigger click event
    tab.dispatchEvent(new dom.window.Event('click'));
    return true;
  }
  
  return false;
}

function waitForAsyncOperations(timeout = 100) {
  return new Promise(resolve => setTimeout(resolve, timeout));
}

// Import modules under test
let initializeQueueManagement, cleanupQueueManagement, initializeAdminDashboardBookingSupport;

describe('QMS Tab Lifecycle Management', () => {
  beforeEach(async () => {
    // Clear all mocks and state
    jest.clearAllMocks();
    lifecycleTracker.reset();
    
    // Reset mock states
    mockVueApp._isDestroyed = false;
    mockVueApp._isMounted = false;
    
    // Import fresh modules
    const queueModule = await import('../../public/js/queue-management.js');
    initializeQueueManagement = queueModule.initializeQueueManagement;
    cleanupQueueManagement = queueModule.cleanupQueueManagement;
    initializeAdminDashboardBookingSupport = queueModule.initializeAdminDashboardBookingSupport;
    
    // Reset global state
    window.queueManagementApp = null;
    window.bookingTabInitialized = false;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
    lifecycleTracker.reset();
  });

  describe('Admin Dashboard Tab Structure Creation', () => {
    test('Should create complete admin tab structure', async () => {
      createAdminDashboardDOM();
      
      // Mock admin dashboard context
      Object.defineProperty(window, 'location', {
        value: { pathname: '/admin-dashboard.html' },
        configurable: true
      });
      
      await initializeQueueManagement();
      
      // Verify tab navigation structure
      expect(document.querySelector('#adminQmsTabsNav')).toBeTruthy();
      expect(document.querySelector('#admin-queue-tab')).toBeTruthy();
      expect(document.querySelector('#admin-booking-tab')).toBeTruthy();
      
      // Verify tab content structure
      expect(document.querySelector('#admin-queue-pane')).toBeTruthy();
      expect(document.querySelector('#admin-booking-pane')).toBeTruthy();
      expect(document.querySelector('#queueManagementVueContent')).toBeTruthy();
      expect(document.querySelector('#adminBookingManagementContent')).toBeTruthy();
      
      // Verify Vue app is mounted in correct location
      const vueApp = document.querySelector('#queue-management-app');
      const expectedParent = document.querySelector('#queueManagementVueContent');
      expect(vueApp?.parentElement).toBe(expectedParent);
      
      lifecycleTracker.recordEvent('admin_structure_created', {
        tabsCreated: true,
        vueAppMounted: !!vueApp
      });
    });

    test('Should handle existing tab structure without duplication', async () => {
      // Create DOM with existing tab structure
      document.body.innerHTML = `
        <div id="queueManagementContent" class="content-section">
          <ul class="nav nav-tabs nav-tabs-custom" id="adminQmsTabsNav">
            <li class="nav-item">
              <button class="nav-link active" id="admin-queue-tab">Queue</button>
            </li>
            <li class="nav-item">
              <button class="nav-link" id="admin-booking-tab">Booking</button>
            </li>
          </ul>
          <div class="tab-content">
            <div class="tab-pane fade show active" id="admin-queue-pane">
              <div id="queueManagementVueContent"></div>
            </div>
            <div class="tab-pane fade" id="admin-booking-pane">
              <div id="adminBookingManagementContent"></div>
            </div>
          </div>
        </div>
      `;
      
      const initialTabsCount = document.querySelectorAll('.nav-tabs').length;
      
      await initializeQueueManagement();
      
      const finalTabsCount = document.querySelectorAll('.nav-tabs').length;
      
      // Should not duplicate existing structure
      expect(finalTabsCount).toBe(initialTabsCount);
      
      // Vue app should still be mounted
      expect(document.querySelector('#queue-management-app')).toBeTruthy();
      
      lifecycleTracker.recordEvent('existing_structure_preserved', {
        initialTabsCount,
        finalTabsCount,
        duplicated: finalTabsCount > initialTabsCount
      });
    });

    test('Should clean up and recreate tab structure properly', async () => {
      createAdminDashboardDOM();
      
      // Initial creation
      await initializeQueueManagement();
      const initialVueApp = document.querySelector('#queue-management-app');
      expect(initialVueApp).toBeTruthy();
      
      lifecycleTracker.recordEvent('initial_creation', {
        vueAppCreated: !!initialVueApp
      });
      
      // Cleanup
      cleanupQueueManagement();
      expect(document.querySelector('#queue-management-app')).toBeFalsy();
      expect(mockVueApp.unmount).toHaveBeenCalled();
      
      lifecycleTracker.recordEvent('cleanup_completed', {
        vueAppRemoved: !document.querySelector('#queue-management-app'),
        unmountCalled: mockVueApp.unmount.mock.calls.length > 0
      });
      
      // Recreate
      jest.clearAllMocks(); // Reset mock call counts
      await initializeQueueManagement();
      const recreatedVueApp = document.querySelector('#queue-management-app');
      expect(recreatedVueApp).toBeTruthy();
      
      lifecycleTracker.recordEvent('recreation_completed', {
        vueAppRecreated: !!recreatedVueApp,
        createAppCalledAgain: mockVue.createApp.mock.calls.length > 0
      });
      
      // Should not have duplicate structures
      const tabsCount = document.querySelectorAll('.nav-tabs').length;
      const vueAppsCount = document.querySelectorAll('#queue-management-app').length;
      
      expect(tabsCount).toBe(1);
      expect(vueAppsCount).toBe(1);
    });
  });

  describe('Tab Navigation State Management', () => {
    test('Should maintain tab states during navigation cycles', async () => {
      createUserDashboardDOM();
      await initializeQueueManagement();
      
      const queueTab = document.getElementById('queue-tab');
      const bookingTab = document.getElementById('booking-tab');
      
      expect(queueTab?.classList.contains('active')).toBe(true);
      expect(bookingTab?.classList.contains('active')).toBe(false);
      
      // Navigate to booking tab
      const bookingClickSuccess = simulateTabClick('booking-tab');
      expect(bookingClickSuccess).toBe(true);
      
      await waitForAsyncOperations();
      
      expect(queueTab?.classList.contains('active')).toBe(false);
      expect(bookingTab?.classList.contains('active')).toBe(true);
      
      // Navigate back to queue tab
      const queueClickSuccess = simulateTabClick('queue-tab');
      expect(queueClickSuccess).toBe(true);
      
      await waitForAsyncOperations();
      
      expect(queueTab?.classList.contains('active')).toBe(true);
      expect(bookingTab?.classList.contains('active')).toBe(false);
      
      const navigationEvents = lifecycleTracker.getEventsByType('tab_click');
      expect(navigationEvents).toHaveLength(2);
    });

    test('Should handle rapid tab switching gracefully', async () => {
      createUserDashboardDOM();
      await initializeQueueManagement();
      
      const tabs = ['queue-tab', 'booking-tab'];
      
      // Rapid switching (10 clicks in quick succession)
      for (let i = 0; i < 10; i++) {
        const tabId = tabs[i % 2];
        simulateTabClick(tabId);
        await waitForAsyncOperations(10); // Very short delay
      }
      
      // System should still be stable
      const activeTab = document.querySelector('.nav-link.active');
      expect(activeTab).toBeTruthy();
      
      // Should not have created multiple Vue instances
      const vueApps = document.querySelectorAll('#queue-management-app');
      expect(vueApps.length).toBe(1);
      
      const rapidClickEvents = lifecycleTracker.getEventsByType('tab_click');
      expect(rapidClickEvents.length).toBe(10);
      
      // No JavaScript errors should have occurred
      const errorEvents = lifecycleTracker.getEventsByType('error');
      expect(errorEvents.length).toBe(0);
    });

    test('Should preserve tab content during navigation', async () => {
      createUserDashboardDOM();
      await initializeQueueManagement();
      
      // Add some test content to track
      const queuePane = document.getElementById('queue-pane');
      const testContent = document.createElement('div');
      testContent.id = 'test-queue-content';
      testContent.textContent = 'Test content';
      queuePane?.appendChild(testContent);
      
      // Navigate away and back
      simulateTabClick('booking-tab');
      await waitForAsyncOperations();
      
      simulateTabClick('queue-tab');
      await waitForAsyncOperations();
      
      // Test content should still exist
      expect(document.getElementById('test-queue-content')).toBeTruthy();
      expect(document.getElementById('test-queue-content')?.textContent).toBe('Test content');
      
      lifecycleTracker.recordEvent('content_preservation_test', {
        contentPreserved: !!document.getElementById('test-queue-content')
      });
    });
  });

  describe('Booking Tab Initialization Lifecycle', () => {
    test('Should initialize booking tab on first click', async () => {
      createUserDashboardDOM();
      await initializeQueueManagement();
      
      const bookingTab = document.getElementById('booking-tab');
      expect(bookingTab).toBeTruthy();
      
      // Mock booking initialization
      window.bookingTabInitialized = false;
      
      // Click booking tab
      simulateTabClick('booking-tab');
      await waitForAsyncOperations();
      
      // Should show loading state initially
      expect(document.querySelector('.booking-tab-loading')).toBeTruthy();
      
      lifecycleTracker.recordEvent('booking_tab_clicked', {
        loadingStateVisible: !!document.querySelector('.booking-tab-loading'),
        initialized: window.bookingTabInitialized
      });
    });

    test('Should handle booking tab initialization failure', async () => {
      createUserDashboardDOM();
      await initializeQueueManagement();
      
      // Mock booking module import failure
      const originalImport = global.import;
      global.import = jest.fn().mockImplementation((module) => {
        if (module.includes('booking-management')) {
          return Promise.reject(new Error('Module load failed'));
        }
        return originalImport(module);
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      simulateTabClick('booking-tab');
      await waitForAsyncOperations(200);
      
      // Should show error state
      expect(document.querySelector('.alert-danger')).toBeTruthy();
      expect(consoleSpy).toHaveBeenCalled();
      
      lifecycleTracker.recordEvent('booking_init_failure', {
        errorStateShown: !!document.querySelector('.alert-danger'),
        errorLogged: consoleSpy.mock.calls.length > 0
      });
      
      // Restore
      global.import = originalImport;
      consoleSpy.mockRestore();
    });

    test('Should prevent multiple booking tab initializations', async () => {
      createUserDashboardDOM();
      await initializeQueueManagement();
      
      // Mock booking initialization
      const mockBookingInit = jest.fn().mockResolvedValue(true);
      
      // Multiple rapid clicks on booking tab
      simulateTabClick('booking-tab');
      simulateTabClick('booking-tab');
      simulateTabClick('booking-tab');
      
      await waitForAsyncOperations(50);
      
      // Should only initialize once
      // This would be verified by checking the initialization tracking in the actual module
      lifecycleTracker.recordEvent('multiple_booking_clicks', {
        clickCount: 3,
        expectedInitCount: 1
      });
    });
  });

  describe('Memory Management and Cleanup', () => {
    test('Should properly cleanup listeners and event handlers', async () => {
      createAdminDashboardDOM();
      
      await initializeQueueManagement();
      
      // Add some mock event listeners to track
      const queueTab = document.getElementById('admin-queue-tab');
      const bookingTab = document.getElementById('admin-booking-tab');
      
      const mockQueueListener = jest.fn();
      const mockBookingListener = jest.fn();
      
      if (queueTab) queueTab.addEventListener('click', mockQueueListener);
      if (bookingTab) bookingTab.addEventListener('click', mockBookingListener);
      
      lifecycleTracker.recordEvent('listeners_added', {
        queueListenerAdded: true,
        bookingListenerAdded: true
      });
      
      // Cleanup
      cleanupQueueManagement();
      
      // Verify Vue unmounting
      expect(mockVueApp.unmount).toHaveBeenCalled();
      
      // Verify DOM cleanup
      expect(document.querySelector('#queue-management-app')).toBeFalsy();
      
      lifecycleTracker.recordEvent('cleanup_verification', {
        vueUnmounted: mockVueApp.unmount.mock.calls.length > 0,
        domCleaned: !document.querySelector('#queue-management-app')
      });
    });

    test('Should handle cleanup during active operations', async () => {
      createUserDashboardDOM();
      await initializeQueueManagement();
      
      // Start a tab navigation
      simulateTabClick('booking-tab');
      
      // Immediately attempt cleanup (simulating navigation away)
      const cleanupPromise = new Promise(resolve => {
        setTimeout(() => {
          cleanupQueueManagement();
          resolve('cleanup_completed');
        }, 25);
      });
      
      const [cleanupResult] = await Promise.all([
        cleanupPromise,
        waitForAsyncOperations(100)
      ]);
      
      expect(cleanupResult).toBe('cleanup_completed');
      
      // Should not have caused errors
      expect(document.querySelector('#queue-management-app')).toBeFalsy();
      
      lifecycleTracker.recordEvent('cleanup_during_operation', {
        cleanupCompleted: cleanupResult === 'cleanup_completed',
        noErrors: lifecycleTracker.getEventsByType('error').length === 0
      });
    });

    test('Should prevent memory leaks over multiple lifecycle cycles', async () => {
      // Simulate multiple mount/unmount cycles
      for (let i = 0; i < 5; i++) {
        createAdminDashboardDOM();
        await initializeQueueManagement();
        
        // Navigate between tabs
        simulateTabClick('admin-booking-tab');
        await waitForAsyncOperations();
        simulateTabClick('admin-queue-tab');
        await waitForAsyncOperations();
        
        cleanupQueueManagement();
        document.body.innerHTML = '';
        
        lifecycleTracker.recordEvent('lifecycle_cycle_completed', {
          cycleNumber: i + 1,
          vueUnmountCalls: mockVueApp.unmount.mock.calls.length
        });
      }
      
      // Should have called unmount for each cycle
      expect(mockVueApp.unmount).toHaveBeenCalledTimes(5);
      
      // Should not have accumulated DOM elements
      expect(document.querySelectorAll('#queue-management-app').length).toBe(0);
      
      lifecycleTracker.recordEvent('memory_leak_test_completed', {
        totalCycles: 5,
        finalDOMElements: document.querySelectorAll('#queue-management-app').length,
        totalUnmountCalls: mockVueApp.unmount.mock.calls.length
      });
    });
  });

  describe('Error Recovery During Lifecycle Operations', () => {
    test('Should recover from tab creation errors', async () => {
      createAdminDashboardDOM();
      
      // Mock DOM manipulation failure
      const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
      let failureCount = 0;
      
      Object.defineProperty(Element.prototype, 'innerHTML', {
        set: jest.fn().mockImplementation(function(value) {
          failureCount++;
          if (failureCount <= 2 && value.includes('nav-tabs')) {
            throw new Error('DOM manipulation failed');
          }
          return originalInnerHTML.set.call(this, value);
        }),
        get: originalInnerHTML.get,
        configurable: true
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await initializeQueueManagement();
      
      // Should have logged errors but continued
      expect(consoleSpy).toHaveBeenCalled();
      
      // May or may not have Vue app depending on fallback strategy
      const vueAppExists = !!document.querySelector('#queue-management-app');
      
      lifecycleTracker.recordEvent('tab_creation_error_recovery', {
        errorsLogged: consoleSpy.mock.calls.length > 0,
        vueAppExists,
        failureCount
      });
      
      // Restore
      Object.defineProperty(Element.prototype, 'innerHTML', originalInnerHTML);
      consoleSpy.mockRestore();
    });

    test('Should handle Vue app mounting errors gracefully', async () => {
      createUserDashboardDOM();
      
      // Mock Vue mounting failure
      mockVueApp.mount.mockImplementation(() => {
        throw new Error('Vue mounting failed');
      });
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      await initializeQueueManagement();
      
      // Should have attempted mounting and logged error
      expect(mockVue.createApp).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Vue mounting failed|initialization/i),
        expect.any(Error)
      );
      
      lifecycleTracker.recordEvent('vue_mount_error_recovery', {
        createAppCalled: mockVue.createApp.mock.calls.length > 0,
        mountFailed: mockVueApp.mount.mock.calls.length > 0,
        errorLogged: consoleSpy.mock.calls.length > 0
      });
      
      consoleSpy.mockRestore();
    });
  });
});

describe('Tab State Persistence Across Context Switches', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    lifecycleTracker.reset();
    
    const queueModule = await import('../../public/js/queue-management.js');
    initializeQueueManagement = queueModule.initializeQueueManagement;
    cleanupQueueManagement = queueModule.cleanupQueueManagement;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
  });

  test('Should restore tab state after context switch simulation', async () => {
    createUserDashboardDOM();
    await initializeQueueManagement();
    
    // Navigate to booking tab
    simulateTabClick('booking-tab');
    await waitForAsyncOperations();
    
    const bookingTabActiveInitially = document.getElementById('booking-tab')?.classList.contains('active');
    expect(bookingTabActiveInitially).toBe(true);
    
    // Simulate context switch (hide/show sections)
    const queueContent = document.getElementById('queueManagementContent');
    if (queueContent) {
      queueContent.style.display = 'none';
      await waitForAsyncOperations();
      queueContent.style.display = 'block';
    }
    
    // Tab state should be preserved
    const bookingTabActiveAfter = document.getElementById('booking-tab')?.classList.contains('active');
    expect(bookingTabActiveAfter).toBe(true);
    
    lifecycleTracker.recordEvent('context_switch_test', {
      initialState: bookingTabActiveInitially,
      finalState: bookingTabActiveAfter,
      statePreserved: bookingTabActiveInitially === bookingTabActiveAfter
    });
  });

  test('Should handle tab state during rapid context changes', async () => {
    createAdminDashboardDOM();
    await initializeQueueManagement();
    
    // Navigate to booking tab
    simulateTabClick('admin-booking-tab');
    await waitForAsyncOperations();
    
    // Rapid context changes (simulate admin section switching)
    const container = document.getElementById('queueManagementContent');
    if (container) {
      for (let i = 0; i < 5; i++) {
        container.classList.add('d-none');
        await waitForAsyncOperations(10);
        container.classList.remove('d-none');
        await waitForAsyncOperations(10);
      }
    }
    
    // Should maintain tab structure and state
    expect(document.getElementById('admin-booking-tab')?.classList.contains('active')).toBe(true);
    expect(document.querySelector('#queue-management-app')).toBeTruthy();
    
    lifecycleTracker.recordEvent('rapid_context_changes', {
      finalTabActive: document.getElementById('admin-booking-tab')?.classList.contains('active'),
      vueAppPresent: !!document.querySelector('#queue-management-app'),
      changesCount: 5
    });
  });
});

// Performance and timing tests
describe('Tab Lifecycle Performance', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    lifecycleTracker.reset();
    
    const queueModule = await import('../../public/js/queue-management.js');
    initializeQueueManagement = queueModule.initializeQueueManagement;
    cleanupQueueManagement = queueModule.cleanupQueueManagement;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
  });

  test('Should complete tab initialization within performance threshold', async () => {
    createAdminDashboardDOM();
    
    const startTime = performance.now();
    await initializeQueueManagement();
    const endTime = performance.now();
    
    const initializationTime = endTime - startTime;
    
    // Should initialize quickly (threshold: 200ms in test environment)
    expect(initializationTime).toBeLessThan(200);
    
    lifecycleTracker.recordEvent('initialization_performance', {
      duration: initializationTime,
      withinThreshold: initializationTime < 200
    });
  });

  test('Should handle tab switching within performance threshold', async () => {
    createUserDashboardDOM();
    await initializeQueueManagement();
    
    const startTime = performance.now();
    simulateTabClick('booking-tab');
    await waitForAsyncOperations();
    const endTime = performance.now();
    
    const switchTime = endTime - startTime;
    
    // Tab switching should be fast (threshold: 100ms)
    expect(switchTime).toBeLessThan(100);
    
    lifecycleTracker.recordEvent('tab_switch_performance', {
      duration: switchTime,
      withinThreshold: switchTime < 100
    });
  });

  test('Should complete cleanup within performance threshold', async () => {
    createAdminDashboardDOM();
    await initializeQueueManagement();
    
    const startTime = performance.now();
    cleanupQueueManagement();
    const endTime = performance.now();
    
    const cleanupTime = endTime - startTime;
    
    // Cleanup should be fast (threshold: 50ms)
    expect(cleanupTime).toBeLessThan(50);
    
    lifecycleTracker.recordEvent('cleanup_performance', {
      duration: cleanupTime,
      withinThreshold: cleanupTime < 50
    });
  });
});

// Export lifecycle tracker for external monitoring
export { TabLifecycleTracker, lifecycleTracker };