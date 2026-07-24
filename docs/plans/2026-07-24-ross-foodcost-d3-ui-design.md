# ROSS-FoodCost-v2 — Deliverable 3: Hi-Fi UI wired to the cores + CSV mapping-memory — Design

**Date:** 2026-07-24
**Status:** Draft v1 (pending adversarial review)
**Parent:** `docs/plans/2026-06-22-ross-foodcost-v2-design.md` (§5 D3, §5.1 M-1, §6)
**Sibling:** `docs/plans/2026-07-24-ross-foodcost-d2-calculator-design.md` (D2 — merged #189; cores live at `functions/agent/food-cost/`)

---

## 1. Problem & intent

The Hi-Fi `/food-cost-v2.html` surface is a Phase-A scripted wireframe: beautiful,
and fake. Its cards cite data that does not exist anywhere in the system (menu
margin drift needs recipe data; the waste log has no source; the "diagnosis" hero
cites an elasticity model that isn't real), and it has **no upload flow at all** —
while the real value chain (CSV → `stockUsage` → D1 summary → D2 order
suggestions) is now fully built server-side and reachable only through Ross chat.

D3 makes the v2 page REAL: live data from the hardened cores via a CF, plus the
operator's headline ask — **CSV upload with mapping-memory** (upload a POS export
twice, the second time is one click).

**Non-goals:** no edits to any v1 food-cost file (parent R4 — pure-function
imports from them are allowed, edits are not); no CF-mediated *save* path
(D4 hardening); no menu/waste features (no data source — cut per D3-1); no
Chart.js (Hi-Fi SVG charts only).

## 2. Locked decisions (operator, 2026-07-24)

- **D3-1 — Real cards only.** The page is rebuilt around what the data supports.
  Menu-margin and waste cards are CUT (not dimmed) until their data sources exist.
- **D3-2 — Client-side upload path.** Reuse the proven v1 parse/map/compute chain
  (pure imports from `data-processor.js`) with a new Hi-Fi upload UI; save via the
  existing client write to `locations/{loc}/stockUsage` under today's rules.
  Server-side save hardening remains D4.
- **D2-3 (inherited) — reads via a CF.** The UI's computed data (summary, trend,
  runway, suggested order) comes from a new read-only CF that reuses
  `functions/agent/food-cost/*` — the browser never re-implements the maths.

## 3. Ground truth (verified this session)

| # | Fact | Evidence |
|---|------|----------|
| G1 | The v2 shell gates on auth + `featureAccessControl.checkFeatureAccess('foodCost')` then dynamic-imports `v2/main.js`; module = Pinia store + `service.js` returning scripted `content.js` shapes; single 343-line `FoodCostApp.vue` | `public/food-cost-v2.html:23-48`; `v2/service.js`, `v2/store.js`, `v2/content.js` |
| G2 | Scripted-vs-real: KPI `COGS` ↔ `costPercentage` ✓; `Food spend` ↔ `totalCostOfUsage` ✓ (trend across records ✓); `Waste` ✗ no source; `Menu margin` ✗ no source; menu-drift table ✗; stock runway ✓ (`closingQty/usagePerDay` = daysOfCover, exactly D1's low-stock signal); diagnosis hero ✗ as scripted but replaceable with a REAL Ross summary (D1 `summariseFoodCost` + D2 `suggestOrder` output) | `v2/content.js` vs `database-operations.js:89-119`, `functions/agent/food-cost-summary.js`, `functions/agent/food-cost/suggest.js` |
| G3 | v1 upload chain (to be reused as pure imports): `parseCSVData(csvContent)` → `{headers, data}`; `detectAndMapHeaders(headers)` → regex auto-mapping; user-confirmed mapping → `processDataWithMapping(parsedData, mapping, {stockPeriodDays, daysToNextDelivery})` → `stockData` items; save via `saveStockUsage(data)` → `locations/{loc}/stockUsage/{ts}` | `refactored-app-component.js:1126-1247`; `data-processor.js`; `database-operations.js:67-120` |
| G4 | The v1 mapping modal has NO memory — every upload re-runs regex detection + manual confirmation | `refactored-app-component.js:1157-1195` |
| G5 | `locations/{loc}` client writes are owner-permitted under current rules (the D2 security review's F3 note) — D3-2's save path is the same one v1 uses today; no rules change needed for saves | `database.rules.json:48-49` |
| G6 | No `foodCostMappings`-like node exists; mapping-memory needs a NEW RTDB node + rules (additive; zero existing writers — census trivially clean, verified `rg foodCostMappings` → 0 hits) | `database.rules.json` |
| G7 | Ask Ross ⌘K modal is live on `/ross.html` only; the v2 page's "Ask Ross" button can deep-link `/ross.html#ask=<seed>` (the hash-seed path shipped in slice 5) | memory `project_phase7_askross_agent`; `RossAskModal.vue` |

## 4. Architecture

```
                       ┌─ NEW CF: foodCostOverview (read-only) ─────────────┐
 locations/{loc}/      │ verify auth → callerHasLocationAccess → read       │
   stockUsage ────────▶│ limitToLast(30) → summariseFoodCost (D1) +         │──▶ v2 service.js
                       │ suggestOrder (D2) → UI-shaped payload               │    (Pinia store unchanged
                       └────────────────────────────────────────────────────┘     call-site contract)

 CSV file ─▶ [NEW Hi-Fi upload wizard, client-side]
   parseCSVData ─▶ fingerprint(headers) ─▶ foodCostMappings/{uid}/{fp} hit?
     ├─ EXACT hit → auto-apply mapping (one-click confirm)
     └─ miss → detectAndMapHeaders → Hi-Fi mapping editor → save mapping
   processDataWithMapping ─▶ preview ─▶ saveStockUsage (existing client path)
```

### 4a. New CF `foodCostOverview` (`functions/food-cost-overview.js`)

- Callable-style `onRequest` following the repo's authed-CF conventions
  (`verifyAuthToken` + location access mirroring `verifyLocationAccess`), CORS
  allowlist via `functions/cors-allowlist.js`.
- Input: `{ locationId, daysToNextDelivery? }`. Access-checked exactly like the
  agent adapter (model/tenant-supplied locationId → attacker-controlled).
- Reads `locations/{loc}/stockUsage` `orderByKey().limitToLast(30)` once; computes
  `summariseFoodCost(records, {now})` + `suggestOrder(records, {now, ...})`
  (lazy-required from `./agent/food-cost/`); returns
  `{ hasData, summary, order, kpis, runway }` shaped for the UI (§5).
- Returns `{hasData:false}` on no access / no data (same anti-enumeration
  convention as the tools).

### 4b. v2 module rewire (all under `public/js/modules/food-cost/v2/`)

- `service.js`: swap scripted body for the CF call (keep the exported function
  name/shape — the store doesn't change its call-site).
- `store.js`: + upload-wizard state slice (or a second small store) — parse
  status, fingerprint hit, mapping, preview, save status.
- `FoodCostApp.vue`: real-cards layout (D3-1): header KPIs (cost% + spend, real
  sparkline trends from record history), Ross summary hero (low-stock count,
  trend direction, top order recommendations + "Ask Ross" deep-link G7),
  stock-runway card (daysOfCover bars), order-suggestion table (replaces menu
  drift; columns from D2 §5.2 items), upload entry point + empty state ("no
  stock data yet — upload your first count").
- New components: `FoodCostUploadWizard.vue` (+ small pieces as needed), reusing
  v1 pure functions via import (NO edits to v1 files).

### 4c. Mapping-memory node + rules

- Path: `foodCostMappings/{uid}/{fingerprint}` →
  `{ headersNorm: string[], mapping: {field: colIndex}, label, savedAt, useCount }`.
- Fingerprint: SHA-256 (WebCrypto) of the JSON of the **normalized full header
  array** (trim/lowercase/collapse-whitespace, ORDER PRESERVED — column indexes
  are positional, so order is part of identity). M-1: auto-apply ONLY on exact
  fingerprint match AND a re-validation that the stored `headersNorm` deep-equals
  the incoming normalized headers (hash collision paranoia + fail-safe); any
  mismatch → fall back to the detect+confirm flow. Mapping re-validated against
  the actual header count before apply (no out-of-range column indexes).
- Rules (additive): `foodCostMappings/$uid` — `.read`/`.write` `auth.uid === $uid`
  with `.validate` bounding children (headersNorm/mapping/label/savedAt/useCount,
  string-length caps). Writer census: new node, zero existing writers (G6).

### 4d. M-1 ingestion guards (client, from parent §5.1)

- Reject before parse: file > 2 MB, > 5,000 rows, > 60 columns; clear inline error.
- Formula-injection: on any CSV **export** from the v2 surface, prefix-neutralise
  `= + - @` leading chars (`'` prefix) — D3 ships export only if trivially done,
  else defers export (decide at plan time; the scripted Export button may be cut).
- The upload preview renders via Vue text interpolation only (auto-escaped; no
  `v-html` — the #184 lesson).

## 5. CF payload (the UI contract; draft — finalise in plan)

```js
{
  hasData: true, asOf, dataAgeDays,
  kpis: { costPct, costPctTrend: [..], spend, spendTrend: [..], prevCostPct },
  summary: { trend, lowStockCount, lowStockItems: [...D1 shape], itemsAnalysed },
  order:   { ...D2 §5.2 output (items capped 30, totals, caveats) },
  runway:  [{ item, daysLeft, tone }],   // derived from D1 lowStock daysOfCover
}
```

Trend arrays come from the record history (costPercentage/totalCostOfUsage per
record, oldest→newest, max 30 points). All tenant strings pass the D2
`sanitizeText` discipline before returning (shared helper or same pattern).

## 6. Security envelope

- CF: auth required; caller→location access check BEFORE read (same C-1 pattern
  and `{hasData:false}` convention as `getSuggestedOrder`); no PII; no raw-record
  logging; output strings sanitized (D2 P6 discipline).
- Mapping node: owner-scoped rules + size-capped `.validate`; mapping applied
  only after re-validation (§4c) — a corrupted/hostile stored mapping cannot
  mis-map silently.
- Upload: M-1 caps before parse; no `v-html` anywhere; the save path's rules
  posture is unchanged (explicitly D4's problem — logged, not bundled).

## 7. Testing

- CF handler tests (fake-rtdb + env pattern from the repo): access trio,
  no-data, payload shape, trend arrays, sanitization.
- Pure unit tests: fingerprint (normalization, order-sensitivity, collision-path
  re-validation), mapping re-validation (out-of-range index, count mismatch),
  M-1 rejectors (size/rows/cols).
- Store tests: upload-wizard state transitions (hit → one-click; miss → editor),
  overview load.
- Preview channel deploy + operator click-through (golden path: upload → map →
  save → dashboard updates; error path: oversized file; mobile breakpoint) —
  the validated "operator preview catches what reviews can't" pattern.

## 8. Risks

- **R-D3-1 — v1 pure-import coupling:** `data-processor.js` functions import
  nothing side-effectful (verified for `parseCSVData`/`detectAndMapHeaders`/
  `processDataWithMapping` at plan time — feasibility check in review). If any
  drags the firebase chain, wrap or extract-copy WITH a source citation, never
  edit v1.
- **R-D3-2 — service-shape drift:** the store/component contract changes from
  scripted shapes to the §5 payload — one PR, both sides updated together; no
  other consumer of `v2/service.js` exists (G1).
- **R-D3-3 — rules addition:** additive node, but `database.rules.json` is
  single-owner-at-a-time; this PR owns it alone.
- **R-D3-4 — CF cold-start on first paint:** the dashboard blocks on the CF;
  acceptable for v2 (same as other v2 surfaces); loading skeleton in the UI.
