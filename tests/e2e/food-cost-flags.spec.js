/**
 * Food Cost Flag System — E2E journey
 *
 * Covers the end-to-end lifecycle of a manual flag:
 *   1. Upload a stock file, see per-row flag controls.
 *   2. Apply OUT_OF_STOCK via FlagTagModal.
 *   3. Badge appears on row + on Flags tab.
 *   4. Open detail drawer, resolve all.
 *   5. Badge removed from row.
 *
 * Requires a running dev server and seeded test user.
 * Expects a fixture CSV at tests/fixtures/stock-sample.csv.
 */

import { test, expect } from '@playwright/test';

test.describe('food-cost flag lifecycle', () => {
  test('apply, see badge, switch tabs, resolve', async ({ page }) => {
    await page.goto('/admin-dashboard.html');

    // Project uses a custom login flow — assume test fixture handles auth.
    // Navigate into the Food Cost section.
    await page.click('#foodCostMenu');
    await page.click('[data-bs-target="#fcStockPane"]');

    // Upload the known fixture CSV.
    await page.setInputFiles('input[type=file]', 'tests/fixtures/stock-sample.csv');

    // Enter edit mode so the Flags column + controls become interactive.
    await page.click('button:has-text("Edit Data")');
    await page.waitForSelector('.fa-flag');

    // Open FlagTagModal on the first row.
    await page.locator('button:has(.fa-flag)').first().click();
    await page.check('input[value="OUT_OF_STOCK"]');
    await page.click('.swal2-confirm');

    // Row badge should appear.
    await expect(page.locator('.badge', { hasText: /OUT OF STOCK/i }).first()).toBeVisible();

    // Tab badge should update.
    await expect(page.locator('#fcFlagsCountBadge')).toBeVisible();

    // Switch to Flags tab and confirm the dashboard lists it.
    await page.click('[data-bs-target="#fcFlagsPane"]');
    await expect(page.locator('#food-cost-flags-app table')).toContainText(/OUT OF STOCK/i);

    // Open detail drawer and resolve.
    await page.click('.js-view-detail >> nth=0');
    await page.click('.swal2-confirm');

    // Back on Stock Data the badge should be gone.
    await page.click('[data-bs-target="#fcStockPane"]');
    await expect(page.locator('.badge', { hasText: /OUT OF STOCK/i })).toHaveCount(0);
  });
});
