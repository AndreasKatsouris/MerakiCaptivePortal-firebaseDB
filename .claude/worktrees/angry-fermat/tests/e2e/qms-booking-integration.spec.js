/**
 * QMS-Booking Tab Integration End-to-End Tests
 * 
 * Comprehensive browser automation tests using Playwright to validate
 * the complete user experience and integration scenarios.
 */

const { test, expect } = require('@playwright/test');

// Test configuration
const TEST_CONFIG = {
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  timeout: 30000,
  slowTimeout: 60000,
  users: {
    admin: {
      email: process.env.ADMIN_EMAIL || 'admin@test.com',
      password: process.env.ADMIN_PASSWORD || 'testpassword123'
    },
    proUser: {
      email: process.env.PRO_USER_EMAIL || 'pro@test.com',
      password: process.env.PRO_USER_PASSWORD || 'testpassword123'
    },
    enterpriseUser: {
      email: process.env.ENTERPRISE_USER_EMAIL || 'enterprise@test.com',
      password: process.env.ENTERPRISE_USER_PASSWORD || 'testpassword123'
    },
    freeUser: {
      email: process.env.FREE_USER_EMAIL || 'free@test.com',
      password: process.env.FREE_USER_PASSWORD || 'testpassword123'
    }
  }
};

// Helper functions
class QMSTestHelper {
  constructor(page) {
    this.page = page;
    this.errors = [];
  }

  async login(userType) {
    const user = TEST_CONFIG.users[userType];
    if (!user) throw new Error(`User type ${userType} not found`);

    await this.page.fill('#email', user.email);
    await this.page.fill('#password', user.password);
    await this.page.click('#loginBtn');
    
    // Wait for login to complete
    await this.page.waitForSelector('.dashboard-content, .admin-dashboard', { timeout: 10000 });
  }

  async navigateToQMS() {
    // Look for QMS navigation in different contexts
    const qmsNavSelector = [
      '[data-section="queueManagementContent"]',
      'a[href*="queue-management"]',
      '.nav-link:has-text("Queue")',
      '.sidebar-nav a:has-text("Queue Management")'
    ].join(', ');

    await this.page.click(qmsNavSelector);
    await this.page.waitForSelector('#queueManagementContent', { timeout: 15000 });
  }

  async waitForVueAppInitialization() {
    // Wait for Vue app to be mounted
    await this.page.waitForSelector('#queue-management-app', { timeout: 10000 });
    
    // Wait for Vue content to be rendered
    await this.page.waitForFunction(() => {
      const vueApp = document.querySelector('#queue-management-app');
      return vueApp && vueApp.innerHTML.trim().length > 0;
    }, { timeout: 5000 });
  }

  async checkTabStructure(context = 'user') {
    const expectedTabs = context === 'admin' 
      ? ['#admin-queue-tab', '#admin-booking-tab']
      : ['#queue-tab', '#booking-tab'];

    for (const tabSelector of expectedTabs) {
      await expect(this.page.locator(tabSelector)).toBeVisible();
    }
  }

  async clickBookingTab(context = 'user') {
    const bookingTabSelector = context === 'admin' ? '#admin-booking-tab' : '#booking-tab';
    await this.page.click(bookingTabSelector);
  }

  async waitForBookingTabLoad() {
    // Wait for booking content to load or error to show
    await this.page.waitForFunction(() => {
      const bookingContent = document.querySelector('#bookingManagementContent, #adminBookingManagementContent');
      if (!bookingContent) return false;
      
      // Check if loading is complete (no loading spinner)
      const loadingSpinner = bookingContent.querySelector('.booking-tab-loading .spinner-border');
      if (loadingSpinner) return false;
      
      // Check if content has loaded or error is shown
      const hasContent = bookingContent.querySelector('.booking-management-container');
      const hasError = bookingContent.querySelector('.alert-danger');
      
      return hasContent || hasError;
    }, { timeout: 10000 });
  }

  async captureErrorsFromConsole() {
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.errors.push({
          type: 'console',
          message: msg.text(),
          timestamp: Date.now()
        });
      }
    });

    this.page.on('pageerror', err => {
      this.errors.push({
        type: 'page',
        message: err.message,
        stack: err.stack,
        timestamp: Date.now()
      });
    });
  }

  async simulateSlowNetwork() {
    await this.page.route('**/*', route => {
      // Delay all network requests by 1-3 seconds
      setTimeout(() => route.continue(), Math.random() * 2000 + 1000);
    });
  }

  async simulateNetworkFailure(pattern = '**/firebase**') {
    await this.page.route(pattern, route => {
      route.abort('failed');
    });
  }

  getErrors() {
    return this.errors;
  }

  reset() {
    this.errors = [];
  }
}

// Test suites
test.describe('QMS-Booking Tab Integration E2E Tests', () => {
  let helper;

  test.beforeEach(async ({ page }) => {
    helper = new QMSTestHelper(page);
    helper.captureErrorsFromConsole();
    await page.goto(TEST_CONFIG.baseURL);
  });

  test.afterEach(async () => {
    // Report any JavaScript errors that occurred
    const errors = helper.getErrors();
    if (errors.length > 0) {
      console.warn('JavaScript errors detected:', errors);
    }
  });

  test.describe('Admin Dashboard Context', () => {
    test('Should create admin tab structure and mount Vue app successfully', async ({ page }) => {
      await helper.login('admin');
      await helper.navigateToQMS();
      
      // Verify admin tab structure is created
      await helper.checkTabStructure('admin');
      
      // Verify Vue app initialization
      await helper.waitForVueAppInitialization();
      
      // Check Vue app is in correct container
      const vueAppContainer = await page.locator('#queue-management-app').first();
      const parentElement = await vueAppContainer.evaluate(el => el.parentElement?.id);
      expect(parentElement).toBe('queueManagementVueContent');
      
      // Verify no JavaScript errors
      const errors = helper.getErrors();
      expect(errors.filter(e => e.type === 'page')).toHaveLength(0);
    });

    test('Should handle admin booking tab access correctly', async ({ page }) => {
      await helper.login('admin');
      await helper.navigateToQMS();
      await helper.waitForVueAppInitialization();
      
      // Admin should have access to booking tab
      const bookingTab = page.locator('#admin-booking-tab');
      await expect(bookingTab).toBeVisible();
      await expect(bookingTab).not.toHaveClass(/disabled/);
      
      // Lock icon should be hidden for admin
      const lockIcon = page.locator('#admin-booking-lock-icon');
      await expect(lockIcon).toHaveClass(/d-none/);
      
      // Click booking tab
      await helper.clickBookingTab('admin');
      await helper.waitForBookingTabLoad();
      
      // Verify booking content loads or shows appropriate message
      const bookingContent = page.locator('#adminBookingManagementContent');
      await expect(bookingContent).toBeVisible();
      
      // Should not show access denied message
      const accessDenied = bookingContent.locator('.alert-warning:has-text("upgrade")');
      await expect(accessDenied).toHaveCount(0);
    });

    test('Should handle rapid navigation between admin tabs', async ({ page }) => {
      await helper.login('admin');
      await helper.navigateToQMS();
      await helper.waitForVueAppInitialization();
      
      const queueTab = page.locator('#admin-queue-tab');
      const bookingTab = page.locator('#admin-booking-tab');
      
      // Rapid navigation cycles
      for (let i = 0; i < 5; i++) {
        await bookingTab.click();
        await page.waitForTimeout(100);
        
        await queueTab.click();
        await page.waitForTimeout(100);
      }
      
      // Final state should be stable
      await expect(queueTab).toHaveClass(/active/);
      await expect(bookingTab).not.toHaveClass(/active/);
      
      // Vue app should still be present and functional
      await expect(page.locator('#queue-management-app')).toBeVisible();
      
      // No errors should occur
      const errors = helper.getErrors();
      const jsErrors = errors.filter(e => e.message.includes('Vue') || e.message.includes('tab'));
      expect(jsErrors).toHaveLength(0);
    });
  });

  test.describe('User Dashboard Context', () => {
    test('Should create user tab structure with proper access control', async ({ page }) => {
      await helper.login('enterpriseUser');
      await page.goto(`${TEST_CONFIG.baseURL}/queue-management.html`);
      
      // Verify user tab structure
      await helper.checkTabStructure('user');
      
      // Verify Vue app initialization
      await helper.waitForVueAppInitialization();
      
      // Enterprise user should have booking access
      const bookingTab = page.locator('#booking-tab');
      await expect(bookingTab).not.toHaveClass(/disabled/);
    });

    test('Should restrict booking access for lower tier users', async ({ page }) => {
      await helper.login('freeUser');
      await page.goto(`${TEST_CONFIG.baseURL}/queue-management.html`);
      
      await helper.waitForVueAppInitialization();
      
      // Free user should not have booking access
      const bookingTab = page.locator('#booking-tab');
      await expect(bookingTab).toHaveClass(/disabled/);
      
      // Lock icon should be visible
      const lockIcon = page.locator('#booking-lock-icon');
      await expect(lockIcon).not.toHaveClass(/d-none/);
      
      // Clicking should show upgrade prompt
      await bookingTab.click();
      
      // Should show SweetAlert or similar prompt
      await page.waitForTimeout(1000);
      
      // Check for upgrade prompt (SweetAlert dialog)
      const upgradeDialog = page.locator('.swal2-popup, .modal:has-text("upgrade")');
      await expect(upgradeDialog).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Access Control Integration', () => {
    const accessTestCases = [
      {
        user: 'freeUser',
        tier: 'free',
        expectedAccess: false,
        description: 'Free tier user should not have booking access'
      },
      {
        user: 'proUser',
        tier: 'professional',
        expectedAccess: false, // Needs admin access too
        description: 'Pro tier user without admin should not have booking access'
      },
      {
        user: 'enterpriseUser',
        tier: 'enterprise',
        expectedAccess: true,
        description: 'Enterprise tier user should have booking access'
      }
    ];

    accessTestCases.forEach(({ user, tier, expectedAccess, description }) => {
      test(description, async ({ page }) => {
        await helper.login(user);
        await page.goto(`${TEST_CONFIG.baseURL}/queue-management.html`);
        
        await helper.waitForVueAppInitialization();
        
        const bookingTab = page.locator('#booking-tab');
        const lockIcon = page.locator('#booking-lock-icon');
        
        if (expectedAccess) {
          await expect(bookingTab).not.toHaveClass(/disabled/);
          await expect(lockIcon).toHaveClass(/d-none/);
          
          // Should load booking content
          await helper.clickBookingTab('user');
          await helper.waitForBookingTabLoad();
          
          const bookingContainer = page.locator('.booking-management-container');
          await expect(bookingContainer).toBeVisible();
        } else {
          await expect(bookingTab).toHaveClass(/disabled/);
          await expect(lockIcon).not.toHaveClass(/d-none/);
          
          // Should show upgrade prompt when clicked
          await bookingTab.click();
          await expect(page.locator('.swal2-popup')).toBeVisible({ timeout: 3000 });
        }
      });
    });
  });

  test.describe('Performance and Timing Tests', () => {
    test('Should complete initialization within performance threshold', async ({ page }) => {
      await helper.login('admin');
      
      const startTime = Date.now();
      await helper.navigateToQMS();
      await helper.waitForVueAppInitialization();
      const endTime = Date.now();
      
      const initializationTime = endTime - startTime;
      
      // Should initialize within 5 seconds
      expect(initializationTime).toBeLessThan(5000);
      
      console.log(`QMS initialization time: ${initializationTime}ms`);
    });

    test('Should handle slow network conditions gracefully', async ({ page }) => {
      await helper.simulateSlowNetwork();
      
      await helper.login('admin');
      
      // Should still complete initialization, even if slower
      const startTime = Date.now();
      await helper.navigateToQMS();
      await helper.waitForVueAppInitialization();
      const endTime = Date.now();
      
      const initializationTime = endTime - startTime;
      
      // Should complete within 15 seconds even with slow network
      expect(initializationTime).toBeLessThan(15000);
      
      // Vue app should still be functional
      await expect(page.locator('#queue-management-app')).toBeVisible();
    });

    test('Should show appropriate loading states during delays', async ({ page }) => {
      await helper.simulateSlowNetwork();
      
      await helper.login('enterpriseUser');
      await page.goto(`${TEST_CONFIG.baseURL}/queue-management.html`);
      
      // Should show loading indicators
      const loadingSpinner = page.locator('.spinner-border, .loading');
      
      // During slow loading, should see loading indicator
      await expect(loadingSpinner).toBeVisible({ timeout: 2000 });
      
      // Eventually should complete
      await helper.waitForVueAppInitialization();
      await expect(page.locator('#queue-management-app')).toBeVisible();
    });
  });

  test.describe('Error Handling and Recovery', () => {
    test('Should handle network failures gracefully', async ({ page }) => {
      await helper.login('enterpriseUser');
      await page.goto(`${TEST_CONFIG.baseURL}/queue-management.html`);
      
      // Simulate network failure for Firebase requests
      await helper.simulateNetworkFailure('**/*firebase*/**');
      
      // Should still attempt to initialize
      await page.waitForSelector('#queueManagementContent', { timeout: 10000 });
      
      // Should show error state or fallback UI
      const errorFallback = page.locator('.alert-danger, .error-message, .offline-indicator');
      await expect(errorFallback).toBeVisible({ timeout: 5000 });
      
      // Should not crash the page
      const criticalErrors = helper.getErrors().filter(e => 
        e.message.includes('Uncaught') || e.message.includes('TypeError')
      );
      expect(criticalErrors).toHaveLength(0);
    });

    test('Should recover from temporary Vue mounting failures', async ({ page }) => {
      await helper.login('admin');
      await helper.navigateToQMS();
      
      // Inject script to simulate Vue failure on first attempt
      await page.addInitScript(() => {
        let vueCreateCallCount = 0;
        const originalVue = window.Vue;
        
        if (originalVue) {
          const originalCreateApp = originalVue.createApp;
          window.Vue.createApp = function(...args) {
            vueCreateCallCount++;
            if (vueCreateCallCount === 1) {
              throw new Error('Simulated Vue failure');
            }
            return originalCreateApp.apply(this, args);
          };
        }
      });
      
      // Page should either show error recovery UI or work on retry
      await page.waitForTimeout(2000);
      
      // Check for error recovery mechanisms
      const errorUI = page.locator('.alert-danger:has-text("Service Temporarily Unavailable")');
      const retryButton = page.locator('button:has-text("Retry")');
      
      if (await errorUI.isVisible()) {
        // If error UI is shown, retry mechanism should work
        if (await retryButton.isVisible()) {
          await retryButton.click();
          
          // After retry, should work
          await helper.waitForVueAppInitialization();
          await expect(page.locator('#queue-management-app')).toBeVisible();
        }
      } else {
        // Should have recovered automatically
        await expect(page.locator('#queue-management-app')).toBeVisible();
      }
    });

    test('Should handle booking module loading failures with error UI', async ({ page }) => {
      await helper.login('enterpriseUser');
      await page.goto(`${TEST_CONFIG.baseURL}/queue-management.html`);
      
      await helper.waitForVueAppInitialization();
      
      // Simulate booking module failure
      await page.route('**/modules/booking-management.js', route => {
        route.abort('failed');
      });
      
      // Click booking tab
      await helper.clickBookingTab('user');
      
      // Should show error UI instead of hanging
      await page.waitForTimeout(3000);
      
      const bookingContent = page.locator('#bookingManagementContent');
      const errorUI = bookingContent.locator('.alert-danger');
      const retryButton = errorUI.locator('button:has-text("Retry")');
      
      await expect(errorUI).toBeVisible();
      await expect(retryButton).toBeVisible();
      
      // Retry button should trigger page reload or retry mechanism
      await retryButton.click();
      
      // Should handle retry gracefully
      await page.waitForTimeout(1000);
    });
  });

  test.describe('Cross-Browser Compatibility', () => {
    // These tests would be run across different browser configurations
    
    test('Should work consistently across browser contexts', async ({ page, browserName }) => {
      console.log(`Testing in ${browserName}`);
      
      await helper.login('admin');
      await helper.navigateToQMS();
      await helper.waitForVueAppInitialization();
      
      // Core functionality should work in all browsers
      await helper.checkTabStructure('admin');
      
      const vueApp = page.locator('#queue-management-app');
      await expect(vueApp).toBeVisible();
      
      // Tab navigation should work
      await helper.clickBookingTab('admin');
      await page.waitForTimeout(1000);
      
      const bookingTab = page.locator('#admin-booking-tab');
      await expect(bookingTab).toHaveClass(/active/);
      
      // No browser-specific errors
      const errors = helper.getErrors();
      const browserSpecificErrors = errors.filter(e => 
        e.message.includes('not supported') || 
        e.message.includes('undefined')
      );
      expect(browserSpecificErrors).toHaveLength(0);
    });
  });

  test.describe('Accessibility Tests', () => {
    test('Should be keyboard navigable', async ({ page }) => {
      await helper.login('enterpriseUser');
      await page.goto(`${TEST_CONFIG.baseURL}/queue-management.html`);
      
      await helper.waitForVueAppInitialization();
      
      // Tab through the interface using keyboard
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      
      // Should be able to reach booking tab
      const bookingTab = page.locator('#booking-tab');
      await expect(bookingTab).toBeFocused({ timeout: 3000 });
      
      // Should be able to activate with Enter
      await page.keyboard.press('Enter');
      
      // Should navigate to booking tab
      await expect(bookingTab).toHaveClass(/active/);
    });

    test('Should have proper ARIA attributes', async ({ page }) => {
      await helper.login('admin');
      await helper.navigateToQMS();
      await helper.waitForVueAppInitialization();
      
      // Check tab navigation has proper ARIA attributes
      const tabList = page.locator('[role="tablist"]');
      await expect(tabList).toBeVisible();
      
      const tabs = page.locator('[role="tab"]');
      const tabCount = await tabs.count();
      expect(tabCount).toBeGreaterThan(0);
      
      // Each tab should have required attributes
      for (let i = 0; i < tabCount; i++) {
        const tab = tabs.nth(i);
        await expect(tab).toHaveAttribute('role', 'tab');
        
        const tabId = await tab.getAttribute('id');
        expect(tabId).toBeTruthy();
      }
    });
  });

  test.describe('Real User Workflow Tests', () => {
    test('Complete admin workflow: Login → QMS → Booking Management', async ({ page }) => {
      // Step 1: Admin login
      await helper.login('admin');
      
      // Step 2: Navigate to QMS
      await helper.navigateToQMS();
      
      // Step 3: Verify QMS loads correctly
      await helper.waitForVueAppInitialization();
      await helper.checkTabStructure('admin');
      
      // Step 4: Access booking management
      await helper.clickBookingTab('admin');
      await helper.waitForBookingTabLoad();
      
      // Step 5: Verify booking interface loads
      const bookingContainer = page.locator('#adminBookingManagementContent');
      await expect(bookingContainer).toBeVisible();
      
      // Step 6: Check for interactive elements
      const interactiveElements = page.locator('button, input, select');
      const elementCount = await interactiveElements.count();
      expect(elementCount).toBeGreaterThan(0);
      
      // Workflow should complete without errors
      const errors = helper.getErrors();
      const criticalErrors = errors.filter(e => e.type === 'page');
      expect(criticalErrors).toHaveLength(0);
    });

    test('Enterprise user workflow: Queue Management → Booking Access', async ({ page }) => {
      // Step 1: User login
      await helper.login('enterpriseUser');
      
      // Step 2: Direct access to queue management
      await page.goto(`${TEST_CONFIG.baseURL}/queue-management.html`);
      
      // Step 3: Use queue management features
      await helper.waitForVueAppInitialization();
      
      const queueSection = page.locator('.queue-management-container');
      await expect(queueSection).toBeVisible();
      
      // Step 4: Access booking features
      await helper.clickBookingTab('user');
      await helper.waitForBookingTabLoad();
      
      // Step 5: Verify booking functionality accessible
      const bookingSection = page.locator('.booking-management-container');
      await expect(bookingSection).toBeVisible();
      
      // User should have seamless experience
      const errors = helper.getErrors();
      expect(errors).toHaveLength(0);
    });

    test('Restricted user workflow: Shows appropriate upgrade prompts', async ({ page }) => {
      // Step 1: Free user login
      await helper.login('freeUser');
      
      // Step 2: Access queue management
      await page.goto(`${TEST_CONFIG.baseURL}/queue-management.html`);
      await helper.waitForVueAppInitialization();
      
      // Step 3: Attempt to access booking
      const bookingTab = page.locator('#booking-tab');
      await expect(bookingTab).toHaveClass(/disabled/);
      
      await bookingTab.click();
      
      // Step 4: Should see upgrade prompt
      const upgradePrompt = page.locator('.swal2-popup');
      await expect(upgradePrompt).toBeVisible({ timeout: 3000 });
      
      const upgradeButton = upgradePrompt.locator('button:has-text("Upgrade")');
      await expect(upgradeButton).toBeVisible();
      
      // Step 5: Clicking upgrade should redirect appropriately
      await upgradeButton.click();
      
      await page.waitForTimeout(2000);
      
      // Should redirect to subscription page or show subscription info
      const currentUrl = page.url();
      expect(currentUrl).toMatch(/(subscription|upgrade|pricing)/i);
    });
  });
});

// Utility for running specific test scenarios
test.describe('QMS Integration Regression Tests', () => {
  test('Critical path validation', async ({ page }) => {
    const helper = new QMSTestHelper(page);
    helper.captureErrorsFromConsole();
    
    await page.goto(TEST_CONFIG.baseURL);
    
    // Test all critical user paths in sequence
    const testPaths = [
      { user: 'admin', context: 'admin' },
      { user: 'enterpriseUser', context: 'user' },
      { user: 'freeUser', context: 'user' }
    ];
    
    for (const { user, context } of testPaths) {
      console.log(`Testing critical path for ${user} in ${context} context`);
      
      // Reset state
      await page.goto(TEST_CONFIG.baseURL);
      helper.reset();
      
      // Execute test path
      await helper.login(user);
      
      if (context === 'admin') {
        await helper.navigateToQMS();
      } else {
        await page.goto(`${TEST_CONFIG.baseURL}/queue-management.html`);
      }
      
      await helper.waitForVueAppInitialization();
      await helper.checkTabStructure(context);
      
      // Verify no critical errors
      const errors = helper.getErrors();
      const criticalErrors = errors.filter(e => e.type === 'page');
      expect(criticalErrors).toHaveLength(0);
    }
  });
});

// Export test configuration for external use
module.exports = { TEST_CONFIG, QMSTestHelper };