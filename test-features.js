import { chromium } from 'playwright';

async function testFeature6() {
  console.log('\n=== Testing Feature 6: App loads without errors ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console messages
  const consoleMessages = [];
  const errors = [];

  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  // Collect page errors
  page.on('pageerror', error => {
    errors.push(`Page Error: ${error.message}`);
  });

  // Monitor network for failed requests
  const failedRequests = [];
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText
    });
  });

  try {
    // Step 1: Open browser to localhost:5173
    console.log('Step 1: Navigating to http://localhost:5173');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Give time for any async JS to execute

    // Step 2 & 3: Check for JavaScript errors
    console.log('\nStep 2-3: Checking for JavaScript errors...');
    if (errors.length > 0) {
      console.log('❌ ERRORS FOUND:');
      errors.forEach((err, i) => console.log(`  ${i + 1}. ${err}`));
    } else {
      console.log('✅ No JavaScript errors found');
    }

    // Step 4: Check for failed network requests
    console.log('\nStep 4: Checking for failed network requests...');
    if (failedRequests.length > 0) {
      console.log('❌ FAILED REQUESTS:');
      failedRequests.forEach((req, i) => {
        console.log(`  ${i + 1}. ${req.url}`);
        console.log(`     Reason: ${req.failure}`);
      });
    } else {
      console.log('✅ No failed network requests');
    }

    // Step 5: Verify page renders completely
    console.log('\nStep 5: Verifying page renders...');
    const bodyContent = await page.content();
    if (bodyContent.length > 1000) {
      console.log('✅ Page renders with substantial content');
    } else {
      console.log('❌ Page content seems minimal');
    }

    // Take screenshot
    await page.screenshot({ path: 'feature-6-screenshot.png', fullPage: true });
    console.log('\n📸 Screenshot saved to feature-6-screenshot.png');

    // Summary
    console.log('\n=== Feature 6 Test Summary ===');
    const passed = errors.length === 0 && failedRequests.length === 0;
    console.log(`Status: ${passed ? '✅ PASSING' : '❌ FAILING'}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Failed Requests: ${failedRequests.length}`);

    await browser.close();
    return { passed, errors, failedRequests };

  } catch (error) {
    console.error('❌ Test failed with exception:', error.message);
    await browser.close();
    return { passed: false, errors: [error.message], failedRequests };
  }
}

async function testFeature7() {
  console.log('\n=== Testing Feature 7: Navigation bar displays correctly ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Load application homepage
    console.log('Step 1: Loading application homepage...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Step 2: Verify top navigation bar is visible
    console.log('\nStep 2: Checking for navigation bar...');
    const navSelectors = [
      'nav',
      '[role="navigation"]',
      '.navbar',
      'header nav',
      '#navbar'
    ];

    let navFound = false;
    let navSelector = null;

    for (const selector of navSelectors) {
      const nav = await page.$(selector);
      if (nav) {
        const isVisible = await nav.isVisible();
        if (isVisible) {
          navFound = true;
          navSelector = selector;
          console.log(`✅ Navigation bar found: ${selector}`);
          break;
        }
      }
    }

    if (!navFound) {
      console.log('❌ Navigation bar not found or not visible');
    }

    // Step 3: Check for expected elements
    console.log('\nStep 3: Checking for navigation elements...');
    const expectedElements = {
      'Location selector': ['[id*="location"]', 'select[name*="location"]', '.location-selector'],
      'Notifications bell': ['[class*="notification"]', '[aria-label*="notification"]', 'i.fa-bell'],
      'User profile': ['[class*="profile"]', '[class*="user"]', '[aria-label*="profile"]'],
      'Search': ['input[type="search"]', '[placeholder*="search"]', '[aria-label*="search"]']
    };

    const foundElements = {};

    for (const [elementName, selectors] of Object.entries(expectedElements)) {
      let found = false;
      for (const selector of selectors) {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            found = true;
            console.log(`  ✅ ${elementName} found`);
            break;
          }
        }
      }
      foundElements[elementName] = found;
      if (!found) {
        console.log(`  ⚠️  ${elementName} not found`);
      }
    }

    // Step 4: Verify clickability
    console.log('\nStep 4: Checking if navigation elements are clickable...');
    const clickableElements = await page.$$('nav a, nav button, [role="navigation"] a, [role="navigation"] button');
    console.log(`Found ${clickableElements.length} clickable navigation elements`);

    // Take screenshot
    await page.screenshot({ path: 'feature-7-screenshot.png', fullPage: true });
    console.log('\n📸 Screenshot saved to feature-7-screenshot.png');

    // Summary
    console.log('\n=== Feature 7 Test Summary ===');
    const allElementsFound = Object.values(foundElements).every(v => v);
    const passed = navFound && clickableElements.length > 0;
    console.log(`Status: ${passed ? '✅ PASSING' : '❌ FAILING'}`);
    console.log(`Navigation bar visible: ${navFound}`);
    console.log(`All expected elements found: ${allElementsFound}`);
    console.log(`Clickable elements: ${clickableElements.length}`);

    await browser.close();
    return { passed, navFound, foundElements, clickableCount: clickableElements.length };

  } catch (error) {
    console.error('❌ Test failed with exception:', error.message);
    await browser.close();
    return { passed: false, error: error.message };
  }
}

async function runTests() {
  console.log('Starting regression tests for features 6 and 7...\n');

  const results = {
    feature6: await testFeature6(),
    feature7: await testFeature7()
  };

  console.log('\n\n=== FINAL RESULTS ===');
  console.log(`Feature 6 (App loads without errors): ${results.feature6.passed ? '✅ PASSING' : '❌ FAILING'}`);
  console.log(`Feature 7 (Navigation bar displays): ${results.feature7.passed ? '✅ PASSING' : '❌ FAILING'}`);

  // Exit with error code if any test failed
  if (!results.feature6.passed || !results.feature7.passed) {
    process.exit(1);
  }
}

runTests().catch(console.error);
