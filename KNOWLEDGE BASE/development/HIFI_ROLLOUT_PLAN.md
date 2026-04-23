# Hi-Fi Redesign — Rollout Plan

**Status:** approved direction, not yet started.
**Approach:** D → C → A — extract design system, ship Ross-first slice, then roll remaining pages.

## Context

The Sparks Hi-Fi handoff (`public/hifi/` previews) establishes a new "editorial hospitality OS" direction: bone/sand palette, Instrument Serif + Geist + JetBrains Mono, Ross as the home experience, editorial card layouts. The current product uses Bootstrap 5 with a conventional admin-dashboard aesthetic. Porting is a redesign, not a reskin.

Preview pages exist at `public/hifi/*-v2.html` and are **design reference only** — they are not on the rollout path.

### Locked decisions
- **Ross engine:** scripted placeholders. No LLM wiring in this project. All "Ross says" text is hand-authored, venue-realistic, shipped as data.
- **Charts:** replace Chart.js with bespoke SVG. The handoff `LineChart`/`BarChart`/`Donut`/`Sparkline` become our production chart library. This implies we rebuild axes, tooltips, legends, and a11y on top of them — that work lives in Phase D.
- **Fonts:** self-host Instrument Serif + Geist + JetBrains Mono under `public/fonts/`. No third-party Google Fonts dependency.
- **Dark mode:** out of scope. Tweaks panel from the handoff is ignored.
- **Mobile:** responsive breakpoints (not scale-to-fit) defined per phase. Ross mobile is 390px baseline; desktop screens gracefully degrade from 1440 → 1200 → 992 → fallback.
- **Delivery:** new pages are Vue 3 SFCs under Vite, following existing `public/js/modules/` + Pinia conventions from the dashboard rewrite. No new React runtime in prod.

---

## Phase D — Design system (1 sprint)

**Goal:** ship reusable primitives so every subsequent page port consumes the same tokens, not one-off inlined styles.

### D1. Tokens + typography
- `public/css/hifi-tokens.css` — all `HIFI` colors from `public/hifi/kit.jsx` as CSS custom properties on `:root`.
- `public/fonts/hifi/` — self-hosted Instrument Serif (regular + italic), Geist (300/400/500/600), JetBrains Mono (400/500). `@font-face` with `font-display: swap`.
- `public/css/hifi-base.css` — `.hf-body`, `.hf-display`, `.hf-mono`, `.hf-eyebrow`, `.hf-hair`, `.hf-num`, scrollbar reset. Extracted verbatim from kit.jsx `css` template.

### D2. Vue component library
New folder: `public/js/design-system/hifi/`

| Component | Source in handoff | Notes |
|---|---|---|
| `HfButton.vue` | `.hf-btn` + variants | `variant="solid|ghost|outline|accent"`, `size="sm|md"` |
| `HfChip.vue` | `.hf-chip` + variants | `tone="default|solid|accent|warn|good"` |
| `HfCard.vue` | `.hf-card` | Slot-based, optional eyebrow/title props |
| `HfInput.vue` | `.hf-input` | Wraps native input with icon slot |
| `HfIcon.vue` | `Ico` component | Same 40-icon set, 1.5px stroke |
| `HfAvatar.vue` | `Avatar` | Initials + tone rotation |
| `HfLogo.vue` | `Logo` | The 8-pointed star + Sparks wordmark |
| `HfNavItem.vue` | `.hf-nav-item` | Sidebar row with icon + label + active state |
| `HfKbd.vue` | `.hf-kbd` | Keyboard shortcut pill |

### D3. Chart library (bespoke SVG)
New folder: `public/js/design-system/charts/`

Port from kit.jsx, **plus** the production features the handoff lacks:

| Component | Adds over handoff |
|---|---|
| `HfLineChart.vue` | Real data input (not seeded random), x/y axes with tick labels, hover tooltip, responsive width, ARIA `role="img"` with text summary |
| `HfBarChart.vue` | Same + accessible alternative table |
| `HfDonut.vue` | Same + center label binding to props |
| `HfSparkline.vue` | Real data, no axes (existing handoff version is close) |
| `HfCompareChart.vue` | Two-series line overlay |

Tooltip pattern: single shared `HfChartTooltip.vue`, positioned absolutely via pointer events on the SVG.

### D4. Chart.js removal audit
- Grep for `Chart.js`, `new Chart(`, `chart-config`, chartjs imports.
- List every chart in the product (analytics, food-cost, sales-forecasting, dashboard KPI tiles, etc.) into a spreadsheet.
- Classify: trivial replace (sparkline/donut) vs complex (sales-forecasting with hover, confidence bands, legend toggles).
- Each "complex" chart is a separate story in Phase A. Do not remove Chart.js until the last migration lands.

### D5. Storybook-lite preview
`public/hifi/components.html` — single page that renders every component in every state. Used by designers to QA without running a build. Same React/Babel pattern as the existing hifi previews so it's cheap to maintain.

**Exit criteria for D:** every token and primitive in the handoff has a Vue equivalent, documented in `components.html`, and `hifi-tokens.css` is used by at least one real page in the app (we'll wire it into the ROSS landing as the first consumer in Phase C).

---

## Phase C — Ross-first slice (1 sprint)

**Goal:** ship the three screens that have no current equivalent. Zero regression risk because they're new routes.

### C1. `ross.html` rebuild
- Current `public/ross.html` is a stub — replace its content entirely.
- Desktop: `RossHiFi` from `screens.jsx` lines 2–219. Three-column layout (sidebar / main / right rail).
- Mobile: `MobileHiFi` from `screens.jsx` lines 814–875. Responsive breakpoint at 768px swaps layouts.
- Uses Pinia store `rossStore` with scripted content loaded from `public/js/modules/ross/content.js` (hand-authored per-venue suggestions, margin alerts, guest pings, reply drafts).

### C2. Onboarding
- Current `public/onboarding-wizard.html` — keep the form-based wizard (real business data collection), but precede it with the new `OnboardingHiFi` first-run from `screens-2.jsx` lines 468–525: Ross introduces itself with "three surprising findings."
- Findings are generated from whatever venue data already exists in RTDB (e.g. "Your Tuesday evenings run 23% below weekly average — want a campaign?"). If the user has no data yet, fall back to canned text.

### C3. Ross content service
- `public/js/modules/ross/content.js` — structured scripted content per UI surface.
- `public/js/modules/ross/ross-service.js` — abstraction layer (`getHomeFeed()`, `getMessageDraft(context)`, `getWeeklyBrief(venueId, week)`) that currently returns scripted content but whose interface matches what an LLM call would return. Keeps future migration to real AI a surface-level change.

### C4. Entry points
- Sidebar nav in existing admin-dashboard adds a "Ross" link at the top (above current sections) — this is the only touchpoint into existing UI in Phase C.
- Route: authenticated users land on `ross.html` post-login instead of `admin-dashboard.html`. Config flag `ROSS_IS_HOME` in `public/js/config/feature-flags.js` so we can revert trivially.

**Exit criteria for C:** Ross desktop + mobile + onboarding shipped, instrumented (GA events for tile clicks, message-send, reply-draft-accept), observed in production for 1 week before starting Phase A.

---

## Phase A — Roll existing pages (4–6 sprints, one page per sprint)

**Goal:** port the rest of the product onto hi-fi primitives. Each page is a self-contained sprint with its own PR, QA, and deploy.

Recommended order (by value × risk):

| Sprint | Page | Handoff source | Notes |
|---|---|---|---|
| A1 | Group Overview (dashboard home) | `DashHiFi` screens.jsx:220 | Replaces `admin-dashboard.html` landing section. Highest traffic — validate tokens at scale. |
| A2 | Food Cost | `FoodCostHiFi` screens-2.jsx:4 | Most complex chart port. Chart.js → bespoke is real work here. |
| A3 | Guests | `GuestsHiFi` screens.jsx:364 | Profile page + list. Ross intelligence in the margin is all scripted. |
| A4 | Queue & Floor | `QueueHiFi` screens.jsx:537 | Real-time listener preserved; only visual layer changes. |
| A5 | Analytics (weekly brief) | `AnalyticsHiFi` screens.jsx:692 | Editorial narrative layout. Brief text is generated from real stats via templated strings. |
| A6 | Campaigns | `CampaignsHiFi` screens-2.jsx:162 | Message-draft UI reuses Ross reply-draft pattern from Phase C. |
| A7 | Receipts & Ops Inbox | `ReceiptsHiFi` screens-2.jsx:321 | Ingest pipeline untouched, only UI replaced. |

Per-sprint template:
1. Build the page as a new Vue SFC tree under `public/js/modules/<feature>/v2/`.
2. Wire it to the existing service layer — no backend changes.
3. Hide behind a per-feature flag (`FOOD_COST_V2`, etc.) for internal preview on prod data.
4. Gather feedback for 3–5 days.
5. Flip flag for all users; keep old path available for 1 release as a rollback.
6. Remove old code on the following release.

### Chart.js removal
Happens inside A1/A2/A5 as each page sheds its last Chart.js dependency. Final A-sprint removes the Chart.js `<script>` tag and the package.

---

## Verification + cross-cutting concerns

- **Regression tests:** run existing e2e journeys on every phase-exit. Nothing in the real data path changes, so anything breaking is a UI binding bug.
- **Visual regression:** Playwright screenshot compare on the hifi preview pages at each phase exit — they are the contract.
- **Perf budget:** first-paint on `ross.html` ≤ 1.2s on 4G emulation. Self-hosted fonts + SVG charts should make this easy.
- **a11y:** every component ships with ARIA roles and keyboard support. Chart tooltips reachable by keyboard. Color contrast ≥ 4.5:1 for body text on the bone background.
- **Rollback:** every phase exits behind a feature flag until one release of soak. No irreversible changes until A is complete.

## Out of scope
- Dark mode (the Tweaks panel is decorative).
- Real LLM integration (follow-up project, Ross service interface already LLM-ready).
- POS integration changes.
- Any change to database rules, auth, or Cloud Functions beyond additive telemetry.
- Mobile app rewrite (the mobile hi-fi is the responsive web view of Ross, not a native app).
