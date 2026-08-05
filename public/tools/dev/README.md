# Development & Testing Tools

Diagnostic, debugging, and testing utilities for development purposes.

## Categories

### Authentication & Access Testing
- admin-verification-test.html
- check-user-auth.html
- debug-auth-session.html
- test-auth-status.html

### Tier & Subscription Testing
- check-tier-features.html
- test-tier-access.html
- test-tier-access-v2.html
- test-tier-management.html
- test-subscription-page.html
- test-subscription-fix.html (+ .js)
- test-table-visibility.html

### Analytics Testing
- test-analytics-admin.html
- test-analytics-simple.html
- test-analytics-with-sales.html
- test-food-cost-analytics.html
- verify-analytics.html

### Food Cost Module
- food-cost-test.html
- test-food-cost-tables.html
- allocate-stock-to-locations.html
- check-stock-data.html
- generate-test-stock-data.html

### Purchase Orders
- test-advanced-purchase-orders.html
- test-enhanced-purchase-order.html
- test-purchase-order-fix.html
- purchase-order-workflow-diagnostic.html

### Firebase & Database
- test-firebase-v9.html
- test-firebase-rules.html
- test-firebase-paths.html
- firebase-performance-monitor.html

### Location & Navigation
- test-locations.html
- quick-location-diagnostic.html
- test-wms-navigation-fix.html
- test-location-resolution.js

### QMS Testing
- qms-tier-test-execution.js
- qms-upgrade-flow-test.js
- run-qms-tests.js

## Usage

These tools are for development and testing only. They should **NOT** be accessible in production environments.

**Access**: Development/staging environments only

## Notes

- Most tools are self-contained HTML files
- Some require Firebase authentication
- Results may modify test data in Firebase

---

**Last Updated**: 2025-12-15

> **Removed 2026-08-05** (API key incident): `test-booking-access.html`, `test-phone-protection.html`,
> `test-feature-67-pagination.html`, `test-feature-70-multi-tab-auth-production.html` and the
> `public/test-*.html` set. Each carried a hand-written Firebase config with a fabricated
> `messagingSenderId`/`appId`, so none of them could initialise Firebase — and all were being
> served in production. See `docs/security/API_KEY_INCIDENT_2026-08-05.md`.
>
> New dev tools must import from `public/js/config/firebase-config.js`. A config literal
> anywhere else fails `npm run security:scan` in CI.
