# QMS-Booking Tab Integration: Comprehensive Test Suite

## Executive Summary

This document provides systematic test cases and protocols to validate the QMS-Booking tab integration based on critical findings from ARCH, FRONT, and UX agents. The test suite addresses container selection inconsistencies, Vue mounting failures, tab lifecycle management issues, and access control verification problems.

## Critical Issues to Test (Based on Agent Findings)

### **ARCH Agent Issues (DOM Structure Integrity Score: 6/10)**
- Complex dual-path tab creation logic with DOM conflicts
- Unreliable container detection with multiple fallback strategies  
- Potential memory leaks and DOM orphaning issues

### **FRONT Agent Issues (HIGH RISK)**
- Vue mounting lacks error handling
- Container selection has 4-tier fallback causing inconsistencies
- Race conditions in async component loading
- No mount error recovery mechanisms

### **UX Agent Issues (Task Completion Rate: ~67%)**
- Unpredictable tab behavior due to async access verification (500ms-2s delay)
- Inconsistent visual feedback across user contexts
- Accessibility Score: 72/100 (fails WCAG AA requirements)

---

## TEST SUITE ORGANIZATION

## 1. CONTAINER SELECTION AND VUE MOUNTING TESTS

### Test Case 1.1: Container Selection Priority Logic
**Objective**: Validate 4-tier container fallback behavior
**Priority**: CRITICAL

```javascript
// Test Implementation
describe('Container Selection Priority', () => {
  test('Admin Dashboard Context - Container Selection', async () => {
    // Setup: Create admin dashboard DOM structure
    const container = document.createElement('div');
    container.id = 'queueManagementContent';
    
    // Create all possible containers in priority order
    const adminVueContent = document.createElement('div');
    adminVueContent.id = 'queueManagementVueContent';
    container.appendChild(adminVueContent);
    
    const queueContent = document.createElement('div');
    queueContent.id = 'queueManagementContent';
    
    const fluidContainer = document.createElement('div');
    fluidContainer.className = 'container-fluid';
    container.appendChild(fluidContainer);
    
    // Test: Initialize queue management
    const result = await initializeQueueManagement();
    
    // Validate: Check Vue app mounted in correct container
    expect(adminVueContent.querySelector('#queue-management-app')).toBeTruthy();
    expect(queueContent.querySelector('#queue-management-app')).toBeFalsy();
    expect(fluidContainer.querySelector('#queue-management-app')).toBeFalsy();
  });
  
  test('User Dashboard Context - Container Selection', async () => {
    // Similar test for user dashboard context
    // Validate different priority order
  });
});
```

### Test Case 1.2: Vue Mounting Error Handling
**Objective**: Test Vue mounting failure scenarios
**Priority**: HIGH

```javascript
describe('Vue Mounting Error Handling', () => {
  test('Missing Container Scenario', async () => {
    // Setup: Remove expected containers
    document.getElementById('queueManagementContent')?.remove();
    
    // Test: Attempt initialization
    const result = await initializeQueueManagement();
    
    // Validate: Should fail gracefully
    expect(result).toBeFalsy();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Container not found'));
  });
  
  test('Vue Mounting Exception Recovery', async () => {
    // Mock Vue.createApp to throw error
    jest.spyOn(Vue, 'createApp').mockImplementation(() => {
      throw new Error('Vue mounting failed');
    });
    
    // Test: Attempt initialization
    const result = await initializeQueueManagement();
    
    // Validate: Should handle error and provide fallback
    expect(document.querySelector('.error-fallback')).toBeTruthy();
  });
});
```

### Test Case 1.3: Race Condition Detection
**Objective**: Test concurrent initialization attempts
**Priority**: HIGH

```javascript
describe('Race Condition Handling', () => {
  test('Concurrent Initialization Attempts', async () => {
    const container = createTestContainer();
    
    // Test: Start multiple initialization attempts simultaneously
    const promises = [
      initializeQueueManagement(),
      initializeQueueManagement(),
      initializeQueueManagement()
    ];
    
    const results = await Promise.allSettled(promises);
    
    // Validate: Only one should succeed, others should be handled gracefully
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    expect(successCount).toBe(1);
    
    // Validate: No duplicate Vue apps
    const vueApps = document.querySelectorAll('#queue-management-app');
    expect(vueApps.length).toBe(1);
  });
});
```

---

## 2. TAB LIFECYCLE AND STATE MANAGEMENT TESTS

### Test Case 2.1: Tab Creation and Cleanup Cycles
**Objective**: Test reliable tab lifecycle management
**Priority**: CRITICAL

```javascript
describe('Tab Lifecycle Management', () => {
  test('Admin Dashboard Tab Structure Creation', async () => {
    const container = createAdminDashboardContainer();
    
    // Test: Initialize admin dashboard booking support
    await initializeAdminDashboardBookingSupport();
    
    // Validate: Proper tab structure created
    expect(document.querySelector('#adminQmsTabsNav')).toBeTruthy();
    expect(document.querySelector('#admin-queue-tab')).toBeTruthy();
    expect(document.querySelector('#admin-booking-tab')).toBeTruthy();
    expect(document.querySelector('#admin-queue-pane')).toBeTruthy();
    expect(document.querySelector('#admin-booking-pane')).toBeTruthy();
  });
  
  test('Tab Cleanup and Recreation', async () => {
    // Setup: Create existing tabs
    await initializeAdminDashboardBookingSupport();
    const initialTabCount = document.querySelectorAll('.nav-tabs').length;
    
    // Test: Navigate away and back
    cleanupQueueManagement();
    await initializeQueueManagement();
    
    // Validate: Clean recreation without duplicates
    const finalTabCount = document.querySelectorAll('.nav-tabs').length;
    expect(finalTabCount).toBe(initialTabCount);
    
    // Validate: No orphaned DOM elements
    expect(document.querySelectorAll('.nav-tabs.orphaned')).toHaveLength(0);
  });
});
```

### Test Case 2.2: Navigation State Persistence
**Objective**: Test tab state during context switches
**Priority**: MEDIUM

```javascript
describe('Navigation State Persistence', () => {
  test('QMS Section Navigation Cycles', async () => {
    await initializeQueueManagement();
    
    // Test: Navigate between QMS sections
    document.getElementById('admin-booking-tab')?.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    document.getElementById('admin-queue-tab')?.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    document.getElementById('admin-booking-tab')?.click();
    
    // Validate: State maintained consistently
    expect(document.querySelector('#admin-booking-pane.active')).toBeTruthy();
    expect(document.querySelector('#admin-queue-pane.active')).toBeFalsy();
  });
});
```

---

## 3. ACCESS CONTROL AND PERMISSION TESTS

### Test Case 3.1: Tier-Based Access Verification
**Objective**: Test booking tab access for different user tiers
**Priority**: MEDIUM

```javascript
describe('Tier-Based Access Control', () => {
  const testCases = [
    { tier: 'free', hasBooking: false, hasAdmin: false, expected: 'disabled' },
    { tier: 'starter', hasBooking: false, hasAdmin: true, expected: 'disabled' },
    { tier: 'professional', hasBooking: true, hasAdmin: false, expected: 'disabled' },
    { tier: 'professional', hasBooking: true, hasAdmin: true, expected: 'enabled' },
    { tier: 'enterprise', hasBooking: true, hasAdmin: false, expected: 'enabled' },
    { tier: 'enterprise', hasBooking: true, hasAdmin: true, expected: 'enabled' }
  ];
  
  testCases.forEach(({ tier, hasBooking, hasAdmin, expected }) => {
    test(`${tier} tier - booking:${hasBooking}, admin:${hasAdmin} -> ${expected}`, async () => {
      // Mock subscription and admin status
      mockUserSubscription({ tierId: tier });
      mockAdminStatus(hasAdmin);
      mockFeatureAccess('bookingManagement', hasBooking);
      
      await initializeQueueManagement();
      await checkBookingAccess();
      
      const bookingTab = document.getElementById('booking-tab') || document.getElementById('admin-booking-tab');
      const isDisabled = bookingTab?.classList.contains('disabled');
      
      if (expected === 'disabled') {
        expect(isDisabled).toBe(true);
      } else {
        expect(isDisabled).toBe(false);
      }
    });
  });
});
```

### Test Case 3.2: Async Access Verification Race Conditions
**Objective**: Test network delays during access verification
**Priority**: HIGH

```javascript
describe('Async Access Verification', () => {
  test('Network Delay During Verification', async () => {
    // Mock delayed network response
    jest.spyOn(AccessControl, 'getCurrentSubscription').mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ tierId: 'enterprise' }), 2000))
    );
    
    await initializeQueueManagement();
    
    // Test: Click booking tab during verification delay
    const bookingTab = document.getElementById('booking-tab');
    bookingTab?.click();
    
    // Validate: Should show loading state
    expect(document.querySelector('.booking-tab-loading')).toBeTruthy();
    
    // Wait for async completion
    await new Promise(resolve => setTimeout(resolve, 2100));
    
    // Validate: Should complete successfully
    expect(document.querySelector('.booking-tab-loading')).toBeFalsy();
  });
  
  test('Rapid Tab Switching During Verification', async () => {
    // Test rapid switching behavior
    const bookingTab = document.getElementById('booking-tab');
    
    // Rapid clicks
    for (let i = 0; i < 5; i++) {
      bookingTab?.click();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Validate: Should handle gracefully without errors
    expect(console.error).not.toHaveBeenCalled();
  });
});
```

---

## 4. ERROR HANDLING AND RECOVERY TESTS

### Test Case 4.1: Vue Mounting Recovery
**Objective**: Test recovery from Vue mounting failures
**Priority**: HIGH

```javascript
describe('Error Recovery Mechanisms', () => {
  test('Vue Mount Failure Recovery', async () => {
    // Mock Vue mounting failure
    const originalCreateApp = Vue.createApp;
    Vue.createApp = jest.fn().mockImplementation(() => {
      throw new Error('Mount failed');
    });
    
    // Test: Attempt initialization
    const result = await initializeQueueManagement();
    
    // Validate: Should provide error UI
    expect(document.querySelector('.error-fallback')).toBeTruthy();
    expect(document.querySelector('.retry-button')).toBeTruthy();
    
    // Test: Retry mechanism
    Vue.createApp = originalCreateApp;
    document.querySelector('.retry-button')?.click();
    
    // Validate: Should recover successfully
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(document.querySelector('#queue-management-app')).toBeTruthy();
  });
});
```

### Test Case 4.2: DOM Cleanup Failure Handling
**Objective**: Test handling of DOM cleanup issues
**Priority**: MEDIUM

```javascript
describe('DOM Cleanup Error Handling', () => {
  test('Cleanup During Active Operations', async () => {
    await initializeQueueManagement();
    
    // Start an async operation
    const loadingPromise = new Promise(resolve => setTimeout(resolve, 1000));
    
    // Attempt cleanup during operation
    cleanupQueueManagement();
    
    // Validate: Should handle gracefully
    expect(console.error).not.toHaveBeenCalled();
    
    await loadingPromise;
    
    // Validate: No memory leaks
    expect(document.querySelector('#queue-management-app')).toBeFalsy();
  });
});
```

---

## 5. PERFORMANCE AND MEMORY TESTS

### Test Case 5.1: Memory Leak Detection
**Objective**: Test for memory leaks during tab operations
**Priority**: MEDIUM

```javascript
describe('Memory Leak Detection', () => {
  test('Repeated Mount/Unmount Cycles', async () => {
    const initialMemory = performance.memory?.usedJSHeapSize || 0;
    
    // Perform multiple mount/unmount cycles
    for (let i = 0; i < 10; i++) {
      await initializeQueueManagement();
      cleanupQueueManagement();
    }
    
    // Force garbage collection if available
    if (global.gc) global.gc();
    
    const finalMemory = performance.memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Validate: Memory increase should be minimal
    expect(memoryIncrease).toBeLessThan(1024 * 1024); // Less than 1MB
  });
});
```

### Test Case 5.2: Tab Loading Performance
**Objective**: Test tab loading times and responsiveness
**Priority**: MEDIUM

```javascript
describe('Performance Benchmarks', () => {
  test('Tab Loading Performance', async () => {
    const startTime = performance.now();
    
    await initializeQueueManagement();
    
    const mountTime = performance.now() - startTime;
    
    // Validate: Initial mount should be fast
    expect(mountTime).toBeLessThan(500); // Less than 500ms
    
    // Test booking tab loading
    const bookingStartTime = performance.now();
    document.getElementById('booking-tab')?.click();
    
    await waitForElement('#bookingManagementContent .booking-management-container');
    
    const bookingLoadTime = performance.now() - bookingStartTime;
    
    // Validate: Booking tab should load within reasonable time
    expect(bookingLoadTime).toBeLessThan(2000); // Less than 2 seconds
  });
});
```

---

## AUTOMATED TEST SCRIPTS

### Browser Automation Tests (Playwright)

```javascript
// playwright-tests/qms-booking-integration.spec.js
const { test, expect } = require('@playwright/test');

test.describe('QMS-Booking Tab Integration E2E', () => {
  test('Admin Dashboard Tab Navigation Flow', async ({ page }) => {
    await page.goto('/admin-dashboard.html');
    
    // Login as admin
    await page.fill('#email', 'admin@test.com');
    await page.fill('#password', 'testpassword');
    await page.click('#loginBtn');
    
    // Navigate to QMS
    await page.click('[data-section="queueManagementContent"]');
    
    // Validate queue tab is active
    await expect(page.locator('#admin-queue-tab.active')).toBeVisible();
    
    // Click booking tab
    await page.click('#admin-booking-tab');
    
    // Validate booking content loads
    await expect(page.locator('#adminBookingManagementContent')).toBeVisible();
    await expect(page.locator('.booking-management-container')).toBeVisible({ timeout: 5000 });
    
    // Validate no JavaScript errors
    const errors = await page.evaluate(() => window.testErrors || []);
    expect(errors).toHaveLength(0);
  });
  
  test('Container Selection Consistency', async ({ page }) => {
    await page.goto('/admin-dashboard.html');
    
    // Check container structure after initialization
    const containerStructure = await page.evaluate(() => {
      const queueContent = document.querySelector('#queueManagementContent');
      const vueContent = document.querySelector('#queueManagementVueContent');
      const vueApp = document.querySelector('#queue-management-app');
      
      return {
        hasQueueContent: !!queueContent,
        hasVueContent: !!vueContent,
        hasVueApp: !!vueApp,
        vueAppParent: vueApp?.parentElement?.id || null
      };
    });
    
    expect(containerStructure.hasQueueContent).toBe(true);
    expect(containerStructure.hasVueContent).toBe(true);
    expect(containerStructure.hasVueApp).toBe(true);
    expect(containerStructure.vueAppParent).toBe('queueManagementVueContent');
  });
});
```

### JavaScript Unit Tests (Jest)

```javascript
// tests/unit/queue-management.test.js
import { initializeQueueManagement, cleanupQueueManagement } from '../../public/js/queue-management.js';

describe('Queue Management Unit Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="queueManagementContent">
        <div id="queueManagementVueContent"></div>
      </div>
    `;
    
    // Mock Vue
    global.Vue = {
      createApp: jest.fn().mockReturnValue({
        mount: jest.fn(),
        unmount: jest.fn()
      })
    };
  });
  
  afterEach(() => {
    cleanupQueueManagement();
    document.body.innerHTML = '';
  });
  
  test('Initialization creates Vue app in correct container', async () => {
    await initializeQueueManagement();
    
    const vueApp = document.querySelector('#queue-management-app');
    const expectedParent = document.querySelector('#queueManagementVueContent');
    
    expect(vueApp).toBeTruthy();
    expect(vueApp.parentElement).toBe(expectedParent);
  });
  
  test('Cleanup removes Vue app completely', async () => {
    await initializeQueueManagement();
    cleanupQueueManagement();
    
    expect(document.querySelector('#queue-management-app')).toBeFalsy();
  });
});
```

---

## MANUAL TESTING PROTOCOLS

### Protocol 1: Container Selection Verification
**Tester**: Manual QA
**Duration**: 30 minutes
**Frequency**: Before each release

#### Steps:
1. **Admin Dashboard Context**:
   - Navigate to admin dashboard
   - Go to QMS section
   - Inspect DOM structure using DevTools
   - Verify Vue app is in `#queueManagementVueContent`
   - Document any container selection fallbacks used

2. **User Dashboard Context**:
   - Navigate to queue-management.html
   - Inspect DOM structure
   - Verify Vue app is in expected container
   - Note any differences from admin context

3. **Edge Cases**:
   - Test with missing containers (manually remove via DevTools)
   - Test container selection with partial DOM structure
   - Validate fallback behavior matches expected priority

### Protocol 2: Tab Lifecycle Testing
**Tester**: Manual QA
**Duration**: 45 minutes
**Frequency**: Weekly regression

#### Steps:
1. **Initial Tab Creation**:
   - Access QMS for first time
   - Verify tab structure is created properly
   - Check both queue and booking tabs are present
   - Validate default active state

2. **Tab Navigation Cycles**:
   - Click between queue and booking tabs 10 times
   - Note any visual glitches or delays
   - Check for duplicate tabs or orphaned content
   - Test rapid clicking behavior

3. **Context Switching**:
   - Navigate away from QMS to different admin section
   - Return to QMS
   - Verify tab state is properly restored
   - Check for memory leaks (monitor DevTools Performance)

### Protocol 3: Access Control Verification
**Tester**: Manual QA with different user accounts
**Duration**: 60 minutes
**Frequency**: Before subscription changes

#### Test Matrix:
| User Type | Tier | Booking Feature | Admin Status | Expected Behavior |
|-----------|------|----------------|--------------|-------------------|
| User A | Free | No | No | Booking tab disabled with upgrade prompt |
| User B | Starter | No | Yes | Booking tab disabled (needs feature) |
| User C | Professional | Yes | No | Booking tab disabled (needs admin) |
| User D | Professional | Yes | Yes | Booking tab enabled |
| User E | Enterprise | Yes | No | Booking tab enabled |
| User F | Enterprise | Yes | Yes | Booking tab enabled |

#### Steps for Each User:
1. Login with test account
2. Navigate to QMS section
3. Check booking tab state (enabled/disabled)
4. Click booking tab
5. Verify appropriate response (load content or show upgrade prompt)
6. Document actual vs expected behavior

---

## ACCESSIBILITY TESTING PROTOCOLS

### Protocol 4: Screen Reader Compatibility
**Tester**: Accessibility QA with screen reader
**Duration**: 30 minutes
**Frequency**: Monthly

#### Steps:
1. **Tab Navigation with Screen Reader**:
   - Use NVDA/JAWS to navigate tab structure
   - Verify proper ARIA labels and roles
   - Check tab announcement consistency
   - Test keyboard navigation (Tab, Arrow keys, Enter)

2. **Content Access Verification**:
   - Ensure all interactive elements are accessible
   - Verify proper focus management during tab switches
   - Check loading states are announced properly

### Protocol 5: Keyboard Navigation Testing
**Tester**: Manual QA
**Duration**: 20 minutes
**Frequency**: Before releases

#### Steps:
1. **Tab Key Navigation**:
   - Navigate through entire tab structure using only Tab key
   - Verify logical tab order
   - Check focus indicators are visible
   - Test Shift+Tab reverse navigation

2. **Arrow Key Navigation**:
   - Test Arrow keys for tab navigation (if supported)
   - Verify Enter/Space activate tabs properly
   - Check Escape key behavior in modals

---

## CROSS-BROWSER COMPATIBILITY TESTS

### Protocol 6: Browser Matrix Testing
**Browsers**: Chrome, Firefox, Safari, Edge
**Devices**: Desktop, Mobile, Tablet
**Duration**: 2 hours
**Frequency**: Before major releases

#### Test Cases per Browser:
1. **Tab Structure Creation**: Verify consistent DOM structure
2. **Vue Mounting**: Check Vue app initialization
3. **Access Control**: Test permission verification
4. **Performance**: Measure loading times
5. **Visual Consistency**: Check CSS rendering
6. **JavaScript Errors**: Monitor console for errors

---

## REGRESSION TESTING FRAMEWORK

### Monitoring and Alerting Setup

```javascript
// monitoring/qms-health-check.js
class QMSHealthMonitor {
  static checkTabIntegrity() {
    const results = {
      timestamp: new Date().toISOString(),
      checks: {},
      overall: 'healthy'
    };
    
    // Check 1: Container Structure
    results.checks.containerStructure = this.checkContainerStructure();
    
    // Check 2: Vue App Status
    results.checks.vueAppStatus = this.checkVueAppStatus();
    
    // Check 3: Tab Navigation
    results.checks.tabNavigation = this.checkTabNavigation();
    
    // Check 4: Access Control
    results.checks.accessControl = this.checkAccessControl();
    
    // Determine overall health
    const failedChecks = Object.values(results.checks).filter(check => !check.passed);
    if (failedChecks.length > 0) {
      results.overall = 'degraded';
      if (failedChecks.length > 2) {
        results.overall = 'unhealthy';
      }
    }
    
    return results;
  }
  
  static async runContinuousMonitoring() {
    setInterval(() => {
      const health = this.checkTabIntegrity();
      
      if (health.overall !== 'healthy') {
        console.warn('[QMS Health Monitor] Issues detected:', health);
        
        // Send alert to monitoring system
        if (window.errorReporting) {
          window.errorReporting.reportHealth('qms-tab-integration', health);
        }
      }
    }, 60000); // Check every minute
  }
}

// Initialize monitoring
document.addEventListener('DOMContentLoaded', () => {
  QMSHealthMonitor.runContinuousMonitoring();
});
```

### Performance Benchmarks

```javascript
// performance/qms-benchmarks.js
const QMS_PERFORMANCE_THRESHOLDS = {
  initialMount: 500, // ms
  tabSwitch: 200, // ms
  bookingTabLoad: 2000, // ms
  containerSelection: 50, // ms
  memoryLeakThreshold: 1024 * 1024 // 1MB
};

class QMSPerformanceMonitor {
  static async measureInitializationTime() {
    const startTime = performance.now();
    await initializeQueueManagement();
    const endTime = performance.now();
    
    const duration = endTime - startTime;
    
    if (duration > QMS_PERFORMANCE_THRESHOLDS.initialMount) {
      console.warn(`[Performance] QMS initialization took ${duration}ms (threshold: ${QMS_PERFORMANCE_THRESHOLDS.initialMount}ms)`);
    }
    
    return duration;
  }
  
  static measureTabSwitchTime(fromTab, toTab) {
    const startTime = performance.now();
    
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (toTab.classList.contains('active')) {
          const duration = performance.now() - startTime;
          observer.disconnect();
          resolve(duration);
          
          if (duration > QMS_PERFORMANCE_THRESHOLDS.tabSwitch) {
            console.warn(`[Performance] Tab switch took ${duration}ms (threshold: ${QMS_PERFORMANCE_THRESHOLDS.tabSwitch}ms)`);
          }
        }
      });
      
      observer.observe(toTab, { attributes: true, attributeFilter: ['class'] });
      toTab.click();
    });
  }
}
```

---

## BUG REPRODUCTION GUIDELINES

### Critical Bug Scenarios

#### Scenario 1: Vue Mounting Failure
**Steps to Reproduce**:
1. Open admin dashboard
2. Navigate to QMS section quickly (within 1 second of page load)
3. Observe if Vue app fails to mount
4. Check console for errors related to container selection

**Expected Indicators**:
- Error: "Container not found" in console
- Empty QMS section with no Vue content
- Tab structure may be malformed

**Data Collection**:
- Browser version and type
- Network timing (DevTools Network tab)
- DOM structure at time of failure (HTML snapshot)
- Console error logs

#### Scenario 2: Container Selection Inconsistency
**Steps to Reproduce**:
1. Navigate between admin sections rapidly
2. Open QMS section multiple times
3. Check DOM structure with DevTools
4. Look for Vue app in unexpected containers

**Expected Indicators**:
- Vue app in wrong container
- Multiple Vue apps created
- Orphaned DOM elements

#### Scenario 3: Access Control Race Condition
**Steps to Reproduce**:
1. Login with Professional tier account
2. Navigate to QMS immediately after login
3. Click booking tab rapidly before access verification completes
4. Observe behavior during async verification

**Expected Indicators**:
- Booking tab shows different states inconsistently
- JavaScript errors during access check
- Tab remains in loading state indefinitely

---

## TESTING ENVIRONMENT SETUP

### Prerequisites
```bash
# Install testing dependencies
npm install --save-dev @playwright/test jest @testing-library/jest-dom

# Install browser automation tools
npx playwright install

# Setup testing database
firebase emulators:start --only database,auth
```

### Test Data Setup
```javascript
// test-helpers/setup-test-data.js
export async function setupTestEnvironment() {
  // Create test users with different subscription tiers
  const testUsers = [
    { email: 'free@test.com', tier: 'free', admin: false },
    { email: 'starter@test.com', tier: 'starter', admin: false },
    { email: 'pro@test.com', tier: 'professional', admin: false },
    { email: 'admin@test.com', tier: 'enterprise', admin: true }
  ];
  
  // Create test locations and queue data
  const testLocations = [
    { id: 'loc1', name: 'Main Restaurant' },
    { id: 'loc2', name: 'Branch Location' }
  ];
  
  // Setup Firebase emulator data
  await setupFirebaseTestData(testUsers, testLocations);
}
```

---

## SUCCESS CRITERIA

### Test Completion Criteria
- [ ] All container selection tests pass (100% success rate)
- [ ] Vue mounting error handling validates successfully
- [ ] Tab lifecycle tests complete without memory leaks
- [ ] Access control tests verify correctly for all user tiers
- [ ] Performance tests meet established thresholds
- [ ] Cross-browser compatibility confirmed
- [ ] Accessibility tests achieve WCAG AA compliance

### Quality Gates
- **Critical Issues**: 0 unresolved critical issues
- **High Priority Issues**: <2 unresolved high priority issues  
- **Performance**: Tab loading <500ms, booking tab <2s
- **Memory**: <1MB memory increase over 10 mount/unmount cycles
- **Accessibility**: 90+ accessibility score
- **Browser Coverage**: 95%+ functionality across target browsers

### Monitoring Thresholds
- **Error Rate**: <1% of tab navigation attempts
- **Performance Degradation**: <10% slowdown from baseline
- **User Task Completion**: >90% successful booking access
- **Support Tickets**: <5 QMS-related tickets per month

---

This comprehensive test suite addresses all critical issues identified by the ARCH, FRONT, and UX agents, providing systematic validation of the QMS-Booking tab integration functionality, performance, and user experience.