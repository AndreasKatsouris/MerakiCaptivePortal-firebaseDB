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
    console.log(`[${type.toUpperCase()}] ${text}`);
  });

  // Collect errors
  const errors = [];
  page.on('pageerror', error => {
    errors.push(error.message);
    console.log(`[PAGE ERROR] ${error.message}`);
  });

  // Monitor network requests
  const failedRequests = [];
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure().errorText
    });
    console.log(`[REQUEST FAILED] ${request.url()} - ${request.failure().errorText}`);
  });

  try {
    console.log('Navigating to http://localhost:5000/');
    await page.goto('http://localhost:5000/', { waitUntil: 'networkidle', timeout: 30000 });

    console.log('\n=== PAGE LOADED ===');

    // Take screenshot
    await page.screenshot({ path: '/tmp/homepage.png', fullPage: true });
    console.log('Screenshot saved to /tmp/homepage.png');

    // Check for sidebar
    const sidebar = await page.$('.sidebar, #sidebar, nav.sidebar');
    if (sidebar) {
      console.log('✓ Sidebar element found');
      const isVisible = await sidebar.isVisible();
      console.log(`Sidebar visible: ${isVisible}`);
    } else {
      console.log('✗ Sidebar element NOT found');
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`Console messages: ${consoleMessages.length}`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Failed requests: ${failedRequests.length}`);

    if (errors.length > 0) {
      console.log('\nErrors detected:');
      errors.forEach(err => console.log(`  - ${err}`));
    }

    if (failedRequests.length > 0) {
      console.log('\nFailed requests:');
      failedRequests.forEach(req => console.log(`  - ${req.url}: ${req.failure}`));
    }

    // Exit code
    const exitCode = (errors.length === 0 && failedRequests.length === 0) ? 0 : 1;
    await browser.close();
    process.exit(exitCode);

  } catch (error) {
    console.error('Test failed:', error);
    await browser.close();
    process.exit(1);
  }
})();
