# Chart.js removal audit — Phase D4

**Scope:** every production chart, classified by migration effort.
**Decision (recap):** replace Chart.js with the HiFi SVG chart library from Phase D3 (`public/js/design-system/hifi/charts/`).
**Rule:** do NOT remove the Chart.js `<script>` tag or strip imports until the last migration has landed and the last sprint in Phase A verifies no page regressed.

---

## Summary

- **23 `new Chart(…)` call sites** across 13 JS/HTML files.
- **7 HTML host pages** load `chart.js` via CDN (inconsistent versions: latest, 3.9.1, 3.7.1).
- **0 npm dependency** on `chart.js` — removal is purely deleting CDN `<script>` tags after the last call-site is migrated.
- Chart types in use: `line` (11), `bar` (7), `doughnut` (2), `pie` (1), `line+confidence-band` (2).

## Host HTML pages (CDN script tag to remove at the end)

| Page | Where the charts render |
|---|---|
| `public/admin-dashboard.html` | `dashboard.js` campaign + receipt charts |
| `public/analytics.html` | `modules/analytics/chart-manager.js` |
| `public/food-cost-analytics.html` | `modules/food-cost/*` |
| `public/receipt-settings.html` | `modules/receipt-settings.js` |
| `public/js/modules/food-cost/cost-driver.html` | cost driver view |
| `public/tools/admin/sales-forecasting.html` | inline + module forecasts |
| `public/tools/dev/firebase-performance-monitor.html` | perf monitor (dev tool) |

Dev/test pages (`tools/dev/test-*.html`, `backup/*.html`) can be deleted wholesale at end of rollout — they're not production.

---

## Classification

### Trivial — one-line component swap (migrate during the page's Phase A sprint)

| # | File:line | Chart | Replace with | Notes |
|---|---|---|---|---|
| 1 | `js/dashboard.js:96` | `bar` — campaignPerformance | `<HfBarChart>` | 7-day campaign response rate. |
| 2 | `js/dashboard.js:128` | `doughnut` — receiptStatus | `<HfDonut>` **(multi-segment — see gap G1)** | Three segments: processed / pending / rejected. |
| 3 | `js/modules/food-cost/chart-manager.js:260` | `bar` — categoryChart | `<HfBarChart>` | Cost by category. |
| 4 | `js/modules/food-cost/chart-manager.js:309` | `bar` — topItemsChart | `<HfBarChart>` | Top-N items, accentIndex for hero. |
| 5 | `js/modules/food-cost/analytics-dashboard.js:923` | `bar` — topItems | `<HfBarChart>` | Duplicate of 4; consolidate in port. |
| 6 | `js/modules/food-cost/components/analytics/DataSummary.js:310` | `bar` — topItems | `<HfBarChart>` | Third duplicate. Refactor to one shared component. |
| 7 | `js/modules/access-control/admin/enhanced-user-subscription-manager.js:1675` | `doughnut` — tier distribution | `<HfPieChart>` (gap G1) | — |
| 8 | `js/modules/access-control/admin/enhanced-user-subscription-manager.js:1696` | `bar` — feature usage | `<HfBarChart>` | — |
| 9 | `js/modules/access-control/admin/enhanced-user-subscription-manager.js:1730` | `bar` — subscription growth | `<HfBarChart>` | — |
| 10 | `js/modules/access-control/admin/enhanced-user-subscription-manager.js:1768` | `line` — MRR trend | `<HfLineChart>` | — |
| 11 | `js/modules/firebase-performance-monitor.js:574` | `line` — functions | `<HfLineChart>` | Dev tool; lower priority. |
| 12 | `js/modules/firebase-performance-monitor.js:609` | `line` — database | `<HfLineChart>` | Dev tool; lower priority. |
| 13 | `js/modules/receipt-settings.js:890` | `line` — performance | `<HfLineChart>` | — |

### Medium — needs a library feature we have but with real-world polish

| # | File:line | Chart | Need | Work |
|---|---|---|---|---|
| 14 | `js/modules/food-cost/analytics-dashboard.js:710` | `line` — costTrend | date-formatted x-axis | 1–2h: add `xFormat` prop to HfLineChart, parse ISO strings |
| 15 | `js/modules/food-cost/analytics-dashboard.js:995` | `line` — wasteTrend | same as above | same as above |
| 16 | `js/modules/analytics/components/food-cost-analytics/forecast-component.js:254` | `line` | forecast line with historical split (solid past, dashed future) | Use `dashed` prop on HfLineChart or split into two HfLineCharts in same SVG — feature G2 |
| 17 | `js/modules/food-cost/components/analytics/DataSummary.js:236` | `pie` — cost by category | multi-segment pie | G1 |
| 18 | `js/modules/analytics/chart-manager.js:39` | generic | refactor the manager itself — it's a factory, so we port the factory once and every chart that uses it migrates for free | 3–4h |

### Complex — needs net-new chart features (build in Phase D3.1 before Phase A uses them)

| # | File:line | Chart | New feature required |
|---|---|---|---|
| 19 | `js/modules/sales-forecasting/index.js:2250` | `line` — forecast with confidence band | G3 — confidence interval shading |
| 20 | `js/modules/sales-forecasting/index.js:2292` | `line` — method comparison | G4 — 3+ series overlay with interactive legend toggles |
| 21 | `js/modules/sales-forecasting/index.js:2315` | `line` — method performance (accuracy) | G4 |
| 22 | `js/modules/sales-forecasting/index.js:2338` | `line` — seasonal decomposition | G4 |
| 23 | `tools/admin/sales-forecasting.html:2446, 3765` | `line` — inline forecast + comparison | same as 19/20; retire the inline versions in favor of the module |

---

## Gaps in the HiFi chart library

These block Phase A sprints that touch sales-forecasting, food-cost analytics, and admin dashboards. Address in a **D3.1 follow-up** before Phase A3 (Guests) starts.

| Gap | Needed feature | Impact |
|---|---|---|
| **G1** | `HfPieChart` — multi-segment pie / donut with legend + tooltip. Current `HfDonut` is single-value progress only. | Blocks migrations 2, 7, 17. |
| **G2** | `segments` support on `HfLineChart` — split one series into solid vs dashed segments at a given index (historical vs forecast). | Blocks migration 16. |
| **G3** | `confidenceBand` prop on `HfLineChart` — takes `{lower, upper}` values per point, renders shaded region between them. | Blocks migrations 19, 23 (partial). |
| **G4** | `HfMultiLineChart` — N series with interactive legend (click to toggle series visibility), shared tooltip showing all values at hover x. | Blocks migrations 20, 21, 22, 23 (partial). |
| **G5** | Date/time x-axis formatter — accept JS Date values, format ticks with `Intl.DateTimeFormat` in SA locale (DD/MM). | Blocks migrations 14, 15 (polish). |
| **G6** | Export-to-PNG helper — `HfChart.exportPNG()`. Optional; needed if analytics page has a "download brief" feature. | None block — nice-to-have. |

---

## Migration order (aligns with the rollout plan's Phase A sprints)

| Sprint | What it removes |
|---|---|
| **D3.1** (wedged before Phase A3) | Build G1, G2, G3, G4, G5. Extend component preview. No page migrations yet. |
| **A1 — Group Overview (dashboard home)** | Migrations 1, 2. Stops `admin-dashboard.html` needing Chart.js. |
| **A2 — Food Cost** | Migrations 3, 4, 5, 6, 14, 15, 17, 18. Stops `food-cost-analytics.html` + `cost-driver.html` needing Chart.js. |
| **A3 — Guests** | No Chart.js touched. |
| **A4 — Queue & Floor** | No Chart.js touched. |
| **A5 — Analytics (weekly brief)** | Migration 16 + migrations 19–23 (sales-forecasting merged into analytics page per hi-fi). Kills `analytics.html`'s dependency. |
| **A6 — Campaigns** | Migration 11, 12 if perf monitor is reviewed; otherwise defers to dev-tool cleanup. Migrations 7, 8, 9, 10 if we move subscription admin charts into redesigned admin-dashboard. |
| **A7 — Receipts & Ops Inbox** | Migration 13. |
| **A-final / cleanup** | Delete `<script src="chart.js">` tags from all 7 host HTML pages; delete `js/modules/sales-forecasting/chart-config.js`, `js/modules/food-cost/chart-manager.js`, `js/modules/analytics/chart-manager.js`; delete dev/backup test HTMLs. Run Playwright visual regression across all production pages. |

---

## Tracking

- This file is the single source of truth for the removal. Update it as sprints land — mark each migration with `~~strikethrough~~` and a commit SHA.
- At the end of A-final, delete this file and mark `Chart.js` as "removed 2026-MM-DD" in `LESSONS.md`.
