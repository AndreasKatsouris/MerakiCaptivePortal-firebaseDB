import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text });
    if (type === 'error') {
      console.log(`[${type.toUpperCase()}] ${text}`);
    }
  });

  // Collect errors
  const errors = [];
  page.on('pageerror', error => {
    errors.push(error.message);
    console.log(`[PAGE ERROR] ${error.message}`);
  });

  try {
    console.log('Testing sidebar on user-dashboard.html...');
    await page.goto('http://localhost:5000/user-dashboard.html', { waitUntil: 'networkidle', timeout: 30000 });

    console.log('Page loaded, taking screenshot...');
    await page.screenshot({ path: '/tmp/dashboard.png', fullPage: true });
    console.log('Screenshot saved to /tmp/dashboard.png');

    // Look for sidebar - try multiple selectors
    const sidebarSelectors = [
      '.sidebar',
      '#sidebar',
      'nav.sidebar',
      '[class*="sidebar"]',
      'aside',
      'nav[role="navigation"]'
    ];

    let sidebarFound = false;
    let sidebarElement = null;
    let usedSelector = null;

    for (const selector of sidebarSelectors) {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await element.isVisible();
        if (isVisible) {
          sidebarFound = true;
          sidebarElement = element;
          usedSelector = selector;
          console.log(`✓ Sidebar found using selector: "${selector}"`);
          break;
        }
      }
    }

    if (sidebarFound) {
      // Check for menu items
      const menuItems = await page.$$('a[href*="dashboard"], a[href*="queue"], a[href*="booking"], a[href*="guest"], a[href*="food-cost"], a[href*="campaign"]');
      console.log(`✓ Found ${menuItems.length} menu links`);

      // Get menu item texts
      for (let item of menuItems) {
        const text = await item.textContent();
        const href = await item.getAttribute('href');
        console.log(`  - ${text?.trim() || '(no text)'}: ${href}`);
      }

      // Check if sidebar is collapsible (look for toggle button)
      const toggleButton = await page.$('button[data-bs-toggle="collapse"], .sidebar-toggle, [aria-controls*="sidebar"]');
      if (toggleButton) {
        console.log('✓ Sidebar appears to be collapsible');
      } else {
        console.log('⚠ Could not find sidebar toggle button');
      }

    } else {
      console.log('✗ Sidebar NOT found with any common selector');
      console.log('Let me check what navigation exists on the page:');

      // List all nav elements
      const navElements = await page.$$('nav');
      console.log(`Found ${navElements.length} <nav> elements`);

      // List all aside elements
      const asideElements = await page.$$('aside');
      console.log(`Found ${asideElements.length} <aside> elements`);

      // List all elements with "menu" or "nav" in class
      const menuElements = await page.$$('[class*="menu"], [class*="nav"]');
      console.log(`Found ${menuElements.length} elements with menu/nav classes`);
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Sidebar found: ${sidebarFound ? 'YES' : 'NO'}`);
    console.log(`Console errors: ${consoleMessages.filter(m => m.type === 'error').length}`);
    console.log(`JavaScript errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nJavaScript Errors:');
      errors.forEach(err => console.log(`  - ${err}`));
    }

    const exitCode = sidebarFound ? 0 : 1;
    await browser.close();
    process.exit(exitCode);

  } catch (error) {
    console.error('Test failed:', error);
    await browser.close();
    process.exit(1);
  }
})();
