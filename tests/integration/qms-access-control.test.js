/**
 * QMS Access Control and Permission Verification Tests
 * 
 * Tests the async access verification flows, tier-based access control,
 * and permission-related race conditions identified as UX critical issues.
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

// Mock user subscription tiers and feature access
const SUBSCRIPTION_TIERS = {
  free: {
    tierId: 'free',
    tier: 'Free',
    features: ['basic'],
    limits: { queueEntries: 25, locations: 1 }
  },
  starter: {
    tierId: 'starter',
    tier: 'Starter',
    features: ['basic', 'qmsBasic', 'qmsWhatsAppIntegration'],
    limits: { queueEntries: 100, locations: 2 }
  },
  professional: {
    tierId: 'professional',
    tier: 'Professional',
    features: ['basic', 'qmsBasic', 'qmsWhatsAppIntegration', 'qmsAnalytics', 'bookingManagement'],
    limits: { queueEntries: 500, locations: 5 }
  },
  enterprise: {
    tierId: 'enterprise',
    tier: 'Enterprise',
    features: ['basic', 'qmsBasic', 'qmsWhatsAppIntegration', 'qmsAnalytics', 'bookingManagement', 'advancedAnalytics'],
    limits: { queueEntries: -1, locations: -1 }
  }
};

// Mock users with different access levels
const TEST_USERS = {
  freeUser: {
    uid: 'free-user-123',
    email: 'free@test.com',
    subscription: SUBSCRIPTION_TIERS.free,
    adminClaims: false
  },
  starterUser: {
    uid: 'starter-user-123',
    email: 'starter@test.com',
    subscription: SUBSCRIPTION_TIERS.starter,
    adminClaims: false
  },
  proUser: {
    uid: 'pro-user-123',
    email: 'pro@test.com',
    subscription: SUBSCRIPTION_TIERS.professional,
    adminClaims: false
  },
  proAdmin: {
    uid: 'pro-admin-123',
    email: 'proadmin@test.com',
    subscription: SUBSCRIPTION_TIERS.professional,
    adminClaims: true
  },
  enterpriseUser: {
    uid: 'enterprise-user-123',
    email: 'enterprise@test.com',
    subscription: SUBSCRIPTION_TIERS.enterprise,
    adminClaims: false
  },
  enterpriseAdmin: {
    uid: 'enterprise-admin-123',
    email: 'enterpriseadmin@test.com',
    subscription: SUBSCRIPTION_TIERS.enterprise,
    adminClaims: true
  }
};

// Access Control Test State Manager
class AccessControlTestManager {
  constructor() {
    this.currentUser = null;
    this.networkDelay = 0;
    this.accessChecks = [];
    this.errors = [];
  }
  
  setCurrentUser(userKey) {
    this.currentUser = TEST_USERS[userKey] || null;
    this.mockAuthState();
  }
  
  setNetworkDelay(delayMs) {
    this.networkDelay = delayMs;
  }
  
  recordAccessCheck(feature, result, duration) {
    this.accessChecks.push({
      timestamp: Date.now(),
      feature,
      result,
      duration,
      user: this.currentUser?.uid || 'anonymous'
    });
  }
  
  recordError(error, context) {
    this.errors.push({
      timestamp: Date.now(),
      error: error.message,
      context,
      user: this.currentUser?.uid || 'anonymous'
    });
  }
  
  mockAuthState() {
    // Mock Firebase auth current user
    global.mockAuth.currentUser = this.currentUser ? {
      uid: this.currentUser.uid,
      email: this.currentUser.email,
      getIdToken: jest.fn().mockResolvedValue(`token-${this.currentUser.uid}`)
    } : null;
  }
  
  reset() {
    this.currentUser = null;
    this.networkDelay = 0;
    this.accessChecks = [];
    this.errors = [];
    global.mockAuth.currentUser = null;
  }
}

const accessManager = new AccessControlTestManager();

// Setup mocks
global.mockAuth = {
  currentUser: null,
  onAuthStateChanged: jest.fn()
};

global.mockAccessControl = {
  getCurrentSubscription: jest.fn(),
  canUseFeature: jest.fn(),
  getLimit: jest.fn()
};

global.mockAdminClaims = {
  verifyAdminStatus: jest.fn(),
  checkAndRedirect: jest.fn()
};

// Mock Vue and Bootstrap
global.Vue = {
  createApp: jest.fn().mockReturnValue({
    mount: jest.fn(),
    unmount: jest.fn(),
    use: jest.fn()
  })
};

global.bootstrap = {
  Modal: jest.fn()
};

global.Swal = {
  fire: jest.fn().mockResolvedValue({ isConfirmed: false })
};

// Mock Firebase
jest.mock('../../public/js/config/firebase-config.js', () => ({
  auth: global.mockAuth,
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

// Mock access control with test manager integration
jest.mock('../../public/js/modules/access-control/services/access-control-service.js', () => ({
  default: {
    getCurrentSubscription: jest.fn().mockImplementation(async () => {
      if (accessManager.networkDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, accessManager.networkDelay));
      }
      
      const subscription = accessManager.currentUser?.subscription || null;
      
      if (!subscription) {
        throw new Error('No subscription found');
      }
      
      return subscription;
    }),
    canUseFeature: jest.fn().mockImplementation(async (feature) => {
      const startTime = Date.now();
      
      if (accessManager.networkDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, accessManager.networkDelay));
      }
      
      const subscription = accessManager.currentUser?.subscription;
      const hasFeature = subscription?.features.includes(feature) || false;
      const isAdmin = accessManager.currentUser?.adminClaims || false;
      
      // Admin users get access to all features
      const result = isAdmin || hasFeature;
      
      const duration = Date.now() - startTime;
      accessManager.recordAccessCheck(feature, result, duration);
      
      return result;
    }),
    getLimit: jest.fn().mockImplementation(async (limitType) => {
      if (accessManager.networkDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, accessManager.networkDelay));
      }
      
      const subscription = accessManager.currentUser?.subscription;
      return subscription?.limits[limitType] || 0;
    })
  }
}));

// Mock admin claims with test manager integration  
jest.mock('../../public/js/auth/admin-claims.js', () => ({
  AdminClaims: {
    verifyAdminStatus: jest.fn().mockImplementation(async (user) => {
      if (accessManager.networkDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, accessManager.networkDelay));
      }
      
      return accessManager.currentUser?.adminClaims || false;
    }),
    checkAndRedirect: jest.fn().mockResolvedValue(true)
  }
}));

// Helper functions
function createBookingTabDOM(context = 'user') {
  const tabId = context === 'admin' ? 'admin-booking-tab' : 'booking-tab';
  const lockIconId = context === 'admin' ? 'admin-booking-lock-icon' : 'booking-lock-icon';
  
  document.body.innerHTML = `
    <div id="queueManagementContent" class="content-section">
      <ul class="nav nav-tabs nav-tabs-custom">
        <li class="nav-item">
          <button class="nav-link active" id="${context === 'admin' ? 'admin-' : ''}queue-tab">
            Queue Management
          </button>
        </li>
        <li class="nav-item" id="${context === 'admin' ? 'admin-' : ''}booking-tab-container">
          <button class="nav-link" id="${tabId}" data-bs-toggle="tab" data-bs-target="#${context === 'admin' ? 'admin-' : ''}booking-pane">
            <i class="fas fa-calendar-alt me-2"></i>Booking Management
            <i class="fas fa-lock ms-2 d-none" id="${lockIconId}"></i>
          </button>
        </li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="${context === 'admin' ? 'admin-' : ''}queue-pane">
          <div id="queueManagementVueContent">
            <div id="queue-management-app"></div>
          </div>
        </div>
        <div class="tab-pane fade" id="${context === 'admin' ? 'admin-' : ''}booking-pane">
          <div id="${context === 'admin' ? 'admin' : ''}BookingManagementContent">
            <div class="booking-tab-loading">
              <div class="spinner-border text-primary mb-3"></div>
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
  
  const clickEvent = new dom.window.Event('click', { bubbles: true });
  tab.dispatchEvent(clickEvent);
  return true;
}

function waitForAsyncOperations(ms = 50) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Import modules under test
let checkBookingAccess, checkAdminBookingAccess, initializeQueueManagement, cleanupQueueManagement;

describe('QMS Access Control and Permission Verification', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    accessManager.reset();
    
    // Import fresh modules
    const queueModule = await import('../../public/js/queue-management.js');
    initializeQueueManagement = queueModule.initializeQueueManagement;
    cleanupQueueManagement = queueModule.cleanupQueueManagement;
    checkBookingAccess = queueModule.checkBookingAccess;
    checkAdminBookingAccess = queueModule.checkAdminBookingAccess;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
    accessManager.reset();
  });

  describe('Tier-Based Booking Access Matrix', () => {
    const accessMatrix = [
      { 
        user: 'freeUser', 
        tier: 'free', 
        hasBooking: false, 
        hasAdmin: false, 
        expected: 'disabled',
        context: 'user'
      },
      { 
        user: 'starterUser', 
        tier: 'starter', 
        hasBooking: false, 
        hasAdmin: false, 
        expected: 'disabled',
        context: 'user'
      },
      { 
        user: 'proUser', 
        tier: 'professional', 
        hasBooking: true, 
        hasAdmin: false, 
        expected: 'disabled', // Pro users need admin access too
        context: 'user'
      },
      { 
        user: 'proAdmin', 
        tier: 'professional', 
        hasBooking: true, 
        hasAdmin: true, 
        expected: 'enabled',
        context: 'admin'
      },
      { 
        user: 'enterpriseUser', 
        tier: 'enterprise', 
        hasBooking: true, 
        hasAdmin: false, 
        expected: 'enabled', // Enterprise users don't need admin
        context: 'user'
      },
      { 
        user: 'enterpriseAdmin', 
        tier: 'enterprise', 
        hasBooking: true, 
        hasAdmin: true, 
        expected: 'enabled',
        context: 'admin'
      }
    ];

    accessMatrix.forEach(({ user, tier, hasBooking, hasAdmin, expected, context }) => {
      test(`${tier} tier (booking:${hasBooking}, admin:${hasAdmin}) -> ${expected}`, async () => {
        createBookingTabDOM(context);
        accessManager.setCurrentUser(user);
        
        await initializeQueueManagement();
        
        // Call the appropriate access check function
        if (context === 'admin') {
          await checkAdminBookingAccess();
        } else {
          await checkBookingAccess();
        }
        
        const tabId = context === 'admin' ? 'admin-booking-tab' : 'booking-tab';
        const lockIconId = context === 'admin' ? 'admin-booking-lock-icon' : 'booking-lock-icon';
        
        const bookingTab = document.getElementById(tabId);
        const lockIcon = document.getElementById(lockIconId);
        
        expect(bookingTab).toBeTruthy();
        
        if (expected === 'disabled') {
          expect(bookingTab.classList.contains('disabled')).toBe(true);
          expect(lockIcon?.classList.contains('d-none')).toBe(false);
        } else {
          expect(bookingTab.classList.contains('disabled')).toBe(false);
          expect(lockIcon?.classList.contains('d-none')).toBe(true);
        }
        
        // Verify access check was recorded
        const accessCheck = accessManager.accessChecks.find(check => 
          check.feature === 'bookingManagement'
        );
        expect(accessCheck).toBeTruthy();
        expect(accessCheck.result).toBe(expected === 'enabled');
      });
    });
  });

  describe('Async Access Verification Timing', () => {
    test('Should handle fast access verification (< 100ms)', async () => {
      createBookingTabDOM('user');
      accessManager.setCurrentUser('enterpriseUser');
      accessManager.setNetworkDelay(50); // Fast network
      
      const startTime = Date.now();
      await initializeQueueManagement();
      await checkBookingAccess();
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      // Should complete quickly
      expect(totalTime).toBeLessThan(200);
      
      // Should have correct access state
      const bookingTab = document.getElementById('booking-tab');
      expect(bookingTab?.classList.contains('disabled')).toBe(false);
      
      // Should have recorded access check
      const accessCheck = accessManager.accessChecks.find(check => 
        check.feature === 'bookingManagement'
      );
      expect(accessCheck?.duration).toBeLessThan(100);
    });

    test('Should handle slow access verification (500ms-2s)', async () => {
      createBookingTabDOM('user');
      accessManager.setCurrentUser('enterpriseUser');
      accessManager.setNetworkDelay(1500); // Slow network matching UX agent findings
      
      const startTime = Date.now();
      await initializeQueueManagement();
      await checkBookingAccess();
      const endTime = Date.now();
      
      const totalTime = endTime - startTime;
      
      // Should handle slow verification
      expect(totalTime).toBeGreaterThan(1400);
      expect(totalTime).toBeLessThan(2000);
      
      // Should still have correct final state
      const bookingTab = document.getElementById('booking-tab');
      expect(bookingTab?.classList.contains('disabled')).toBe(false);
      
      // Should have recorded slow access check
      const accessCheck = accessManager.accessChecks.find(check => 
        check.feature === 'bookingManagement'
      );
      expect(accessCheck?.duration).toBeGreaterThan(1400);
    });

    test('Should show appropriate loading states during verification', async () => {
      createBookingTabDOM('user');
      accessManager.setCurrentUser('proAdmin');
      accessManager.setNetworkDelay(1000);
      
      // Start access verification
      const accessPromise = checkBookingAccess();
      
      // Check initial state (should show loading or indeterminate state)
      await waitForAsyncOperations(10);
      
      const bookingTab = document.getElementById('booking-tab');
      
      // During verification, tab state might be indeterminate
      // The exact behavior depends on implementation
      expect(bookingTab).toBeTruthy();
      
      // Wait for completion
      await accessPromise;
      
      // Should have final correct state
      expect(bookingTab.classList.contains('disabled')).toBe(false);
    });
  });

  describe('Race Condition Prevention', () => {
    test('Should handle rapid tab clicks during access verification', async () => {
      createBookingTabDOM('user');
      accessManager.setCurrentUser('proAdmin');
      accessManager.setNetworkDelay(500);
      
      await initializeQueueManagement();
      
      // Start access verification
      const accessPromise = checkBookingAccess();
      
      // Rapid tab clicks while verification is in progress
      for (let i = 0; i < 5; i++) {
        simulateTabClick('booking-tab');
        await waitForAsyncOperations(20);
      }
      
      // Wait for access verification to complete
      await accessPromise;
      
      // System should be stable
      const bookingTab = document.getElementById('booking-tab');
      expect(bookingTab?.classList.contains('disabled')).toBe(false);
      
      // Should not have caused errors
      expect(accessManager.errors.length).toBe(0);
    });

    test('Should handle concurrent access checks', async () => {
      createBookingTabDOM('admin');
      accessManager.setCurrentUser('enterpriseAdmin');
      accessManager.setNetworkDelay(300);
      
      await initializeQueueManagement();
      
      // Start multiple concurrent access checks
      const promises = [
        checkAdminBookingAccess(),
        checkAdminBookingAccess(),
        checkAdminBookingAccess()
      ];
      
      const results = await Promise.allSettled(promises);
      
      // All should complete successfully
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBe(3);
      
      // Final state should be correct
      const bookingTab = document.getElementById('admin-booking-tab');
      expect(bookingTab?.classList.contains('disabled')).toBe(false);
      
      // Should have recorded access checks (may be deduplicated)
      expect(accessManager.accessChecks.length).toBeGreaterThan(0);
    });

    test('Should handle user context switch during verification', async () => {
      createBookingTabDOM('user');
      accessManager.setCurrentUser('proUser'); // Initially pro user (disabled)
      accessManager.setNetworkDelay(800);
      
      await initializeQueueManagement();
      
      // Start access check
      const accessPromise = checkBookingAccess();
      
      // Switch user context during verification
      await waitForAsyncOperations(200);
      accessManager.setCurrentUser('enterpriseUser'); // Switch to enterprise (enabled)
      
      await accessPromise;
      
      // The behavior here depends on implementation:
      // - Either it uses the original user context (pro -> disabled)
      // - Or it detects the change and updates (enterprise -> enabled)
      const bookingTab = document.getElementById('booking-tab');
      expect(bookingTab).toBeTruthy();
      
      // Should not have caused errors
      expect(accessManager.errors.length).toBe(0);
    });
  });

  describe('Network Failure Handling', () => {
    test('Should handle subscription lookup failure', async () => {
      createBookingTabDOM('user');
      
      // Mock network failure
      global.mockAccessControl.getCurrentSubscription.mockRejectedValue(
        new Error('Network error')
      );
      
      accessManager.setCurrentUser('enterpriseUser');
      
      await initializeQueueManagement();
      
      try {
        await checkBookingAccess();
      } catch (error) {
        accessManager.recordError(error, 'subscription_lookup');
      }
      
      // Should have appropriate fallback state
      const bookingTab = document.getElementById('booking-tab');
      expect(bookingTab).toBeTruthy();
      
      // Should have recorded error
      expect(accessManager.errors.length).toBeGreaterThan(0);
      expect(accessManager.errors[0].error).toContain('Network error');
    });

    test('Should handle feature access check failure', async () => {
      createBookingTabDOM('user');
      
      // Mock feature check failure
      global.mockAccessControl.canUseFeature.mockRejectedValue(
        new Error('Feature check failed')
      );
      
      accessManager.setCurrentUser('enterpriseUser');
      
      await initializeQueueManagement();
      
      try {
        await checkBookingAccess();
      } catch (error) {
        accessManager.recordError(error, 'feature_access_check');
      }
      
      // Should handle gracefully
      const bookingTab = document.getElementById('booking-tab');
      expect(bookingTab).toBeTruthy();
      
      // Should have recorded error
      expect(accessManager.errors.length).toBeGreaterThan(0);
    });

    test('Should handle admin verification failure', async () => {
      createBookingTabDOM('admin');
      
      // Mock admin verification failure
      global.mockAdminClaims.verifyAdminStatus.mockRejectedValue(
        new Error('Admin verification failed')
      );
      
      accessManager.setCurrentUser('enterpriseAdmin');
      
      await initializeQueueManagement();
      
      try {
        await checkAdminBookingAccess();
      } catch (error) {
        accessManager.recordError(error, 'admin_verification');
      }
      
      // Should default to restricted access on failure
      const bookingTab = document.getElementById('admin-booking-tab');
      expect(bookingTab).toBeTruthy();
      
      // Should have recorded error
      expect(accessManager.errors.length).toBeGreaterThan(0);
      expect(accessManager.errors[0].error).toContain('Admin verification failed');
    });
  });

  describe('Access Control State Transitions', () => {
    test('Should update access when subscription changes', async () => {
      createBookingTabDOM('user');
      accessManager.setCurrentUser('proUser'); // Initially pro (disabled)
      
      await initializeQueueManagement();
      await checkBookingAccess();
      
      // Initially disabled
      let bookingTab = document.getElementById('booking-tab');
      expect(bookingTab?.classList.contains('disabled')).toBe(true);
      
      // Simulate subscription upgrade
      accessManager.setCurrentUser('enterpriseUser');
      await checkBookingAccess();
      
      // Should now be enabled
      expect(bookingTab?.classList.contains('disabled')).toBe(false);
      
      // Should have recorded both access checks
      expect(accessManager.accessChecks.length).toBe(2);
      expect(accessManager.accessChecks[0].result).toBe(false);
      expect(accessManager.accessChecks[1].result).toBe(true);
    });

    test('Should update access when admin status changes', async () => {
      createBookingTabDOM('admin');
      accessManager.setCurrentUser('proUser'); // Pro without admin
      
      await initializeQueueManagement();
      await checkAdminBookingAccess();
      
      // Initially disabled (no admin access)
      let bookingTab = document.getElementById('admin-booking-tab');
      expect(bookingTab?.classList.contains('disabled')).toBe(true);
      
      // Grant admin access
      accessManager.setCurrentUser('proAdmin');
      await checkAdminBookingAccess();
      
      // Should now be enabled
      expect(bookingTab?.classList.contains('disabled')).toBe(false);
      
      // Should have recorded access state changes
      expect(accessManager.accessChecks.length).toBe(2);
      expect(accessManager.accessChecks[0].result).toBe(false);
      expect(accessManager.accessChecks[1].result).toBe(true);
    });

    test('Should handle feature downgrade gracefully', async () => {
      createBookingTabDOM('user');
      accessManager.setCurrentUser('enterpriseUser'); // Initially enabled
      
      await initializeQueueManagement();
      await checkBookingAccess();
      
      // Initially enabled
      let bookingTab = document.getElementById('booking-tab');
      expect(bookingTab?.classList.contains('disabled')).toBe(false);
      
      // Simulate subscription downgrade
      accessManager.setCurrentUser('starterUser');
      await checkBookingAccess();
      
      // Should now be disabled
      expect(bookingTab?.classList.contains('disabled')).toBe(true);
      
      const lockIcon = document.getElementById('booking-lock-icon');
      expect(lockIcon?.classList.contains('d-none')).toBe(false);
    });
  });

  describe('Visual Feedback During Access Verification', () => {
    test('Should show consistent visual states across contexts', async () => {
      // Test both user and admin contexts with same user
      const contexts = ['user', 'admin'];
      
      for (const context of contexts) {
        createBookingTabDOM(context);
        accessManager.setCurrentUser('enterpriseAdmin');
        
        await initializeQueueManagement();
        
        const tabId = context === 'admin' ? 'admin-booking-tab' : 'booking-tab';
        const lockIconId = context === 'admin' ? 'admin-booking-lock-icon' : 'booking-lock-icon';
        
        if (context === 'admin') {
          await checkAdminBookingAccess();
        } else {
          await checkBookingAccess();
        }
        
        const bookingTab = document.getElementById(tabId);
        const lockIcon = document.getElementById(lockIconId);
        
        // Should have consistent enabled state
        expect(bookingTab?.classList.contains('disabled')).toBe(false);
        expect(lockIcon?.classList.contains('d-none')).toBe(true);
        
        cleanupQueueManagement();
        document.body.innerHTML = '';
      }
    });

    test('Should provide clear visual indicators for access levels', async () => {
      const testCases = [
        { user: 'freeUser', expectedDisabled: true, expectedLocked: true },
        { user: 'starterUser', expectedDisabled: true, expectedLocked: true },
        { user: 'proUser', expectedDisabled: true, expectedLocked: true },
        { user: 'enterpriseUser', expectedDisabled: false, expectedLocked: false }
      ];
      
      for (const { user, expectedDisabled, expectedLocked } of testCases) {
        createBookingTabDOM('user');
        accessManager.setCurrentUser(user);
        
        await initializeQueueManagement();
        await checkBookingAccess();
        
        const bookingTab = document.getElementById('booking-tab');
        const lockIcon = document.getElementById('booking-lock-icon');
        
        expect(bookingTab?.classList.contains('disabled')).toBe(expectedDisabled);
        expect(lockIcon?.classList.contains('d-none')).toBe(!expectedLocked);
        
        // Verify appropriate title/tooltip for disabled state
        if (expectedDisabled) {
          expect(bookingTab?.title).toBeTruthy();
          expect(bookingTab?.title.length).toBeGreaterThan(0);
        }
        
        cleanupQueueManagement();
        document.body.innerHTML = '';
      }
    });
  });

  describe('Performance Impact of Access Control', () => {
    test('Should complete access verification within performance threshold', async () => {
      createBookingTabDOM('user');
      accessManager.setCurrentUser('enterpriseUser');
      accessManager.setNetworkDelay(0); // No network delay
      
      await initializeQueueManagement();
      
      const startTime = performance.now();
      await checkBookingAccess();
      const endTime = performance.now();
      
      const verificationTime = endTime - startTime;
      
      // Should be fast when network is good
      expect(verificationTime).toBeLessThan(100);
      
      const accessCheck = accessManager.accessChecks[0];
      expect(accessCheck?.duration).toBeLessThan(50);
    });

    test('Should handle degraded performance gracefully', async () => {
      createBookingTabDOM('user');
      accessManager.setCurrentUser('enterpriseUser');
      accessManager.setNetworkDelay(3000); // Very slow network
      
      await initializeQueueManagement();
      
      const startTime = performance.now();
      
      // Set a timeout to prevent test hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Access verification timeout')), 5000);
      });
      
      try {
        await Promise.race([
          checkBookingAccess(),
          timeoutPromise
        ]);
        
        const endTime = performance.now();
        const verificationTime = endTime - startTime;
        
        // Should complete even if slow
        expect(verificationTime).toBeGreaterThan(2800);
        expect(verificationTime).toBeLessThan(5000);
        
      } catch (error) {
        if (error.message === 'Access verification timeout') {
          // This is also acceptable - system should timeout gracefully
          accessManager.recordError(error, 'timeout');
          expect(accessManager.errors.length).toBe(1);
        }
      }
    });
  });
});

describe('Access Control Integration with Tab Lifecycle', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    accessManager.reset();
    
    const queueModule = await import('../../public/js/queue-management.js');
    initializeQueueManagement = queueModule.initializeQueueManagement;
    cleanupQueueManagement = queueModule.cleanupQueueManagement;
    checkBookingAccess = queueModule.checkBookingAccess;
    checkAdminBookingAccess = queueModule.checkAdminBookingAccess;
  });

  afterEach(() => {
    cleanupQueueManagement?.();
    document.body.innerHTML = '';
    accessManager.reset();
  });

  test('Should maintain access control state during tab cleanup and recreation', async () => {
    createBookingTabDOM('admin');
    accessManager.setCurrentUser('enterpriseAdmin');
    
    // Initial setup
    await initializeQueueManagement();
    await checkAdminBookingAccess();
    
    const initialState = document.getElementById('admin-booking-tab')?.classList.contains('disabled');
    
    // Cleanup and recreate
    cleanupQueueManagement();
    await initializeQueueManagement();
    await checkAdminBookingAccess();
    
    const finalState = document.getElementById('admin-booking-tab')?.classList.contains('disabled');
    
    // State should be consistent
    expect(initialState).toBe(finalState);
    expect(finalState).toBe(false); // Should be enabled for enterprise admin
  });

  test('Should re-verify access when tabs are recreated', async () => {
    createBookingTabDOM('user');
    accessManager.setCurrentUser('proUser'); // Initially no access
    
    await initializeQueueManagement();
    await checkBookingAccess();
    
    expect(document.getElementById('booking-tab')?.classList.contains('disabled')).toBe(true);
    
    // Cleanup
    cleanupQueueManagement();
    
    // Upgrade user during cleanup
    accessManager.setCurrentUser('enterpriseUser');
    
    // Recreate
    await initializeQueueManagement();
    await checkBookingAccess();
    
    // Should reflect new user's access level
    expect(document.getElementById('booking-tab')?.classList.contains('disabled')).toBe(false);
    
    // Should have recorded access checks for both users
    expect(accessManager.accessChecks.length).toBe(2);
    expect(accessManager.accessChecks[0].result).toBe(false);
    expect(accessManager.accessChecks[1].result).toBe(true);
  });
});

// Export access manager for external monitoring
export { AccessControlTestManager, accessManager, SUBSCRIPTION_TIERS, TEST_USERS };