# A-deletion — pending cleanup

**Status:** A-final shipped 2026-04-23. All v2 flags ON. Old HTML pages remain reachable by direct URL as a safety net. Do not execute the deletions below until v2 has soaked on production for at least one release (~2 weeks). Deletion is a separate sprint.

## Pre-deletion checklist
- [ ] Confirm all 8 v2 pages have been used by real admins on production for ≥ 7 consecutive days.
- [ ] No crash reports mentioning `/ross.html`, `/group-overview-v2.html`, `/food-cost-v2.html`, `/guests-v2.html`, `/queue-v2.html`, `/analytics-v2.html`, `/campaigns-v2.html`, `/receipts-v2.html` in the last 7 days.
- [ ] Playwright visual-regression sweep across the 8 v2 pages passes.
- [ ] No inbound links (emails, docs, bookmarks) to the old URLs that still need to work.

## Files to delete

### Chart.js `<script>` tags (strip inline — do not delete the host HTML)
Each of these pages currently loads `https://cdn.jsdelivr.net/npm/chart.js`. Once the v2 replacement is in prod and verified, strip the `<script src="...chart.js">` line from:
- `public/admin-dashboard.html`
- `public/analytics.html`
- `public/food-cost-analytics.html`
- `public/receipt-settings.html`
- `public/js/modules/food-cost/cost-driver.html`
- `public/tools/admin/sales-forecasting.html`
- `public/tools/dev/firebase-performance-monitor.html` (optional — dev tool)

### Chart.js call-site modules (delete whole file)
Safe to delete once the old HTML pages above are proven unused, or once those pages are themselves deleted.
- `public/js/modules/sales-forecasting/chart-config.js`
- `public/js/modules/food-cost/chart-manager.js`
- `public/js/modules/analytics/chart-manager.js`
- `public/js/modules/analytics/components/food-cost-analytics/forecast-component.js` (or migrate its callers to the v2 analytics page)

### Old Chart.js instantiation sites (migrate or delete)
Each site needs either a migration to `HfLineChart`/`HfBarChart`/`HfDonut`/`HfPieChart` OR deletion of the feature:
- `public/js/dashboard.js:96, 128` — covered by A1; delete after admin-dashboard.html "Dashboard" section is retired.
- `public/js/modules/food-cost/analytics-dashboard.js` (3 charts) — covered by A2; delete after food-cost-analytics.html retires.
- `public/js/modules/food-cost/components/analytics/DataSummary.js` (2 charts) — same.
- `public/js/modules/sales-forecasting/index.js` (4 charts) — covered by A5; delete after analytics.html + tools/admin/sales-forecasting.html retire.
- `public/js/modules/receipt-settings.js:890` — covered by A7 removal (qualitative replaces line chart).
- `public/js/modules/access-control/admin/enhanced-user-subscription-manager.js` (4 charts) — **NOT covered by any A-sprint**. Either migrate to `HfPieChart` + `HfBarChart` + `HfLineChart` in a follow-up, or accept Chart.js stays for subscription admin.

### Legacy HTML pages (delete whole file) — keep ≥ 2 weeks of soak
Only delete after the corresponding v2 page has been flag-ON in prod for 2+ weeks with no rollback:
- `public/admin-dashboard.html` — **do NOT delete**, still hosts the SPA sections for Corporate Compliance and other non-redesigned areas.
- `public/analytics.html`
- `public/campaigns.html`
- `public/food-cost-analytics.html`
- `public/guest-management.html`
- `public/guest-detail.html`
- `public/queue-management.html`
- `public/receipt-settings.html`
- `public/onboarding-wizard.html` — **do NOT delete** unless the business-data wizard has been rebuilt; the v2 onboarding-ross-hello.html hands off to this page.

### Dev/test HTML files (safe to delete now)
These were never production:
- `public/backup/food-cost-test.html`
- `public/backup/food-cost-refactored-test.html`
- `public/tools/dev/test-*.html` (all 12 files)

### Vite entry points to remove from `vite.config.js`
Only after the v2 HTML renames (if any) happen:
- Nothing to remove at A-final; all 8 v2 entries stay.

### Sidebar cleanup in `admin-dashboard.html`
After deletion, the legacy sidebar entries that point at `data-section="..."` for removed features can be deleted. Touching them is risky (they drive the SPA section switcher) — leave for a dedicated sidebar refactor sprint.

## Rollback plan (if a v2 page regresses in prod)

Revert is a one-line change: set the matching flag in `public/js/config/feature-flags.js` back to `false` and strip the matching sidebar link from `admin-dashboard.html` (or point it back to the legacy URL). Because the legacy HTML was NEVER deleted, old behaviour is one flag flip + one-link change away.

After rollback, diagnose the v2 bug, redeploy the v2 page, and flip the flag back on. Do NOT delete the legacy HTML until the v2 page has been stable post-rollback.

## Related docs
- `KNOWLEDGE BASE/development/HIFI_ROLLOUT_PLAN.md` — the overarching roadmap.
- `KNOWLEDGE BASE/development/CHARTJS_REMOVAL_AUDIT.md` — per-chart migration classification.
