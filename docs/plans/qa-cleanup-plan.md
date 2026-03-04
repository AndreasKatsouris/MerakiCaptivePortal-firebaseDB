in# QA Cleanup Plan — Test Artifact Deletion

## Files to DELETE (tracked — use `git rm`)

### Root-level CJS scripts (test/setup utilities, not application code)
- `populate-subscription-tiers.cjs`
- `set-user-role.cjs`

### public/ — debug pages
- `public/debug-admin-dashboard.html`
- `public/debug-subscription.html`

### public/ — test HTML pages (13 files)
- `public/test-filter-urls.html`
- `public/test-fixes-validation.html`
- `public/test-mobile-bottom-nav.html`
- `public/test-module-resolution.html`
- `public/test-navigation.html`
- `public/test-persistence.html`
- `public/test-phone-preservation.html`
- `public/test-professional-tier-limits.html`
- `public/test-role-based-ui.html`
- `public/test-sidebar-visual.html`
- `public/test-subscription-limits.html`
- `public/test-subscription-status.html`
- `public/test-tier-gating.html`

### public/tools/dev/ — ALL test/debug/verify HTML+JS files (50 files)
- `public/tools/dev/admin-tier-config-test.js`
- `public/tools/dev/admin-verification-test.html`
- `public/tools/dev/debug-auth-session.html`
- `public/tools/dev/generate-test-stock-data.html`
- `public/tools/dev/qms-upgrade-flow-test.js`
- `public/tools/dev/test-advanced-purchase-orders.html`
- `public/tools/dev/test-analytics-admin.html`
- `public/tools/dev/test-analytics-simple.html`
- `public/tools/dev/test-analytics-with-sales.html`
- `public/tools/dev/test-auth-status.html`
- `public/tools/dev/test-booking-access.html`
- `public/tools/dev/test-enhanced-purchase-order.html`
- `public/tools/dev/test-feature-51-network-error.html`
- `public/tools/dev/test-feature-52-phone-validation.html`
- `public/tools/dev/test-feature-53-ui.html`
- `public/tools/dev/test-feature-55-api-error.html`
- `public/tools/dev/test-feature-56-timeout-retry.html`
- `public/tools/dev/test-feature-58-loading-state.html`
- `public/tools/dev/test-feature-60-session-expiry.html`
- `public/tools/dev/test-feature-63-location-dropdown.html`
- `public/tools/dev/test-feature-64-campaign-analytics.html`
- `public/tools/dev/test-feature-65-66-search-sort.html`
- `public/tools/dev/test-feature-67-pagination.html`
- `public/tools/dev/test-feature-68-form-data-persistence.html`
- `public/tools/dev/test-feature-69-session-recovery.html`
- `public/tools/dev/test-feature-70-multi-tab-auth-production.html`
- `public/tools/dev/test-feature-70-multi-tab-auth.html`
- `public/tools/dev/test-feature-73-invalid-id.html`
- `public/tools/dev/test-firebase-paths.html`
- `public/tools/dev/test-firebase-rules.html`
- `public/tools/dev/test-firebase-v9.html`
- `public/tools/dev/test-food-cost-analytics.html`
- `public/tools/dev/test-food-cost-tables.html`
- `public/tools/dev/test-locations.html`
- `public/tools/dev/test-phone-protection.html`
- `public/tools/dev/test-protected-page-session-expiry.html`
- `public/tools/dev/test-purchase-order-fix.html`
- `public/tools/dev/test-subscription-fix.html`
- `public/tools/dev/test-subscription-page.html`
- `public/tools/dev/test-table-visibility.html`
- `public/tools/dev/test-tier-access-v2.html`
- `public/tools/dev/test-tier-access.html`
- `public/tools/dev/test-tier-management.html`
- `public/tools/dev/test-wms-navigation-fix.html`
- `public/tools/dev/verify-analytics.html`

### public/tools/archive/ — test-subscription-fix.js only
- `public/tools/archive/test-subscription-fix.js`

### public/js/modules/access-control/admin/
- `public/js/modules/access-control/admin/setup-test-data.js`

### tests/integration/ — test utility (not a real test framework file)
- `tests/integration/test-queue-location-integration.js`

### documents/screenshots/
- `documents/screenshots/Screenshot 2026-02-02 130606.png`

---

## Files to KEEP (NOT deleting)

### Intentionally kept — application/utility code
- `public/js/modules/access-control/admin/enhanced-user-subscription-manager.js` — application code
- `public/js/modules/access-control/admin/subscription-status-manager.js` — application code
- `public/js/modules/access-control/admin/tier-management.js` — application code
- `public/tools/dev/README.md` — documentation
- `public/tools/dev/check-stock-data.html` — diagnostic tool (not prefixed test-)
- `public/tools/dev/check-tier-features.html` — diagnostic tool
- `public/tools/dev/check-user-auth.html` — diagnostic tool
- `public/tools/dev/firebase-performance-monitor.html` — monitoring tool
- `public/tools/dev/food-cost-test.html` — ambiguous (not prefixed test- in path sense, but name has "test")
- `public/tools/dev/purchase-order-workflow-diagnostic.html` — diagnostic
- `public/tools/dev/quick-location-diagnostic.html` — diagnostic
- `public/tools/archive/` — all other files (archive tooling, kept as-is)
- `public/js/modules/food-cost/tests/` — entire food-cost tests directory (legitimate test suite)
- `tests/e2e/`, `tests/integration/` (except test-queue-location-integration.js), `tests/unit/`, `tests/monitoring/` — legitimate test infrastructure
- `documents/archive/.agent/knowledge/docs/` — archive docs (all MD files)
- `KNOWLEDGE BASE/` — all files
- `functions/utils/seedTemplateConfig.js` — may be needed
- `functions/utils/templateManager.js` — may be needed
- `database.rules.json`, `.env.template`
- `docs/plans/` — all files
- All production `public/` HTML/JS files

### Note on food-cost-test.html
`public/tools/dev/food-cost-test.html` — name contains "test" but lives in tools/dev as a diagnostic. Keeping it since it is not in the `test-*.html` pattern at the root `public/` level and is inside the dev tools folder with legitimate diagnostic tools.

---

## Summary
- **Tracked files to `git rm`**: ~65 files
- **Untracked files**: 0 (none found outside already-tracked list)
- **Directories**: No full directory removal needed (keeping food-cost/tests/, tools/dev/ partially)
