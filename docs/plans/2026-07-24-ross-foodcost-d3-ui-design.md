# ROSS-FoodCost-v2 — Deliverable 3: Hi-Fi UI wired to the cores + CSV mapping-memory — Design

**Date:** 2026-07-24
**Status:** v2 — both adversarial reviews folded (security: F1–F11, no CRITICAL/HIGH;
ground-truth: G3 corrected + 8 missed items). Ready for plan.
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
| G1 | The v2 shell gates on auth + `featureAccessControl.checkFeatureAccess('foodCost')` then dynamic-imports `v2/main.js`; module = Pinia store + `service.js` returning scripted `content.js` shapes; single 318-line `FoodCostApp.vue` | `public/food-cost-v2.html:23-48`; `v2/service.js`, `v2/store.js`, `v2/content.js` |
| G2 | Scripted-vs-real: KPI `COGS` ↔ `costPercentage` ✓; `Food spend` ↔ `totalCostOfUsage` ✓ (trend across records ✓); `Waste` ✗ no source; `Menu margin` ✗ no source; menu-drift table ✗; stock runway ✓ (`closingQty/usagePerDay` = daysOfCover, exactly D1's low-stock signal); diagnosis hero ✗ as scripted but replaceable with a REAL Ross summary (D1 `summariseFoodCost` + D2 `suggestOrder` output) | `v2/content.js` vs `database-operations.js:89-119`, `functions/agent/food-cost-summary.js`, `functions/agent/food-cost/suggest.js` |
| G3 | v1 upload chain (reused as pure imports): `parseCSVData(csvContent)` → `{headers, data:{headers,rows}}` (`data` is the whole parse object), `detectAndMapHeaders(headers)` → regex auto-mapping (**unmapped fields are `-1`, not absent** — ~18 keys always present), `processDataWithMapping(parsedData, mapping, {stockPeriodDays, daysToNextDelivery})` — **all three exported from `services/data-service.js:20/54/142`** (wrappers over `data-processor.js`'s `parseCSV`/`autoDetectHeaders`/`processStockData`; the spec's v1 draft mis-cited `data-processor.js` — both reviews caught it, the probe settled it). Import chain PROVEN side-effect-free (probe 4/4: no firebase, no top-level window/document; `database-operations.js` DOES firebase-init at load — import it only in the page, never in unit tests). **Import WITHOUT the `?v=` suffix** v1 uses (Vite treats suffixed paths as distinct modules). Save via `saveStockUsage(data)` (`database-operations.js:140` → `:67`) | `refactored-app-component.js:1126-1247`; `services/data-service.js:20,54,142`; probe 2026-07-24 |
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

- `onRequest` copying the **`functions/agent/rossChat.js` conventions exactly**
  (GT-verified sibling): `require('../cors-allowlist')` + `cors(corsOptions)`
  (`rossChat.js:23-24`), handler wrapped in `cors(req,res,async()=>…)` (`:589`),
  auth via `verifyAuthToken` from `ross.js` with the normalized 401/403 strings
  (`:628-640`). Registered in `functions/index.js` (**single-owner shared file —
  this PR owns it alongside `database.rules.json`**).
- **Access check: REUSE `callerHasLocationAccess`** (exported,
  `functions/agent/tools.js:82-87,:379`) — do NOT hand-roll a third variant
  (security F3: that's the #144 IDOR failure mode; the `ownerId` fallback matters
  for owners with unpopulated `userLocations`).
- **Entitlement (security F1): server-side `foodCost` feature check** after the
  access check — mirror `ross.js:113-116`'s `subscriptions/{uid}/features` read
  (`features.foodCost`, admin bypass). The client gate (G1) is UX, not security;
  without this the paywall is bypassable by direct CF call.
- **Abuse bounds (security F2):** this endpoint is UNMETERED (unlike the agent
  tool, which costs the caller a billed turn). Set `maxInstances` (e.g. 5) on the
  function; apply the D2 P5 item caps to the **D1 branch too** (`summariseFoodCost`
  iterates `latest.stockItems` uncapped — slice items before both calls); document
  that P5 caps are per-call, not aggregate.
- Input: `{ locationId, daysToNextDelivery? }` (Zod-style validation at the
  boundary, same bounds as the tool). Reads `locations/{loc}/stockUsage`
  `orderByKey().limitToLast(30)` ONCE; computes `summariseFoodCost(records,{now})`
  + `suggestOrder(records,{now,…})` (lazy-required from `./agent/food-cost*`);
  returns the §5 payload. Note: the D1 TOOL reads `limitToLast(20)` — parity
  tests must expect summary-over-30 ≠ tool-summary-over-20 on >20-record tenants.
- **Sanitization (security F8):** `suggestOrder` output is already P6-clean, but
  **`summariseFoodCost` is NOT** (its `itemCode`/`description` return raw — the
  logged D1 backport gap). The CF explicitly `sanitizeText`s the D1-branch
  strings, and bounds/sanitizes the Ask-Ross deep-link seed before it enters a
  URL hash.
- Returns bare `{hasData:false}` on no access / no data / not entitled (same
  anti-enumeration convention as the tools; deep-equal across all three).

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
  **The `mapping` object carries ~18 keys with `-1` for unmapped fields** (that is
  `detectAndMapHeaders`' contract, probe-verified) — rules and re-validation must
  treat `-1` as legal.
- Fingerprint: SHA-256 (WebCrypto — probe-verified available in browser AND the
  repo's vitest node env) of the JSON of the **normalized full header array**
  (trim/lowercase/collapse-whitespace, ORDER PRESERVED — column indexes are
  positional, so order is part of identity). M-1: auto-apply ONLY on exact
  fingerprint match AND a re-validation that the stored `headersNorm` deep-equals
  the incoming normalized headers; re-validation runs on BOTH the auto-apply and
  manual paths (security F4) and checks every mapped index is an integer in
  `[-1, headerCount)`. Any mismatch → fall back to detect+confirm. A hostile
  stored mapping is self-only under the rules (F5) but is still treated as
  untrusted at apply time.
- Rules (additive; concrete shape from the security review, adjusted for `-1`):
  `foodCostMappings/$uid` — `.read`/`.write` `auth != null && auth.uid === $uid`
  (explicit `auth != null` prefix per the null-equality lesson);
  `$fingerprint/.validate` requires `headersNorm`/`mapping`/`savedAt`; child
  `.validate`s: `label` string ≤100, `savedAt` number, `useCount` number ≥0,
  `headersNorm/$i` string ≤120, `mapping/$field` number in `[-1, 60)`;
  `"$other": {".validate": false}` closes bloat. **RTDB can't bound array/object
  cardinality — the client re-validation above is the load-bearing control.**
- **Rules write-test is an acceptance gate (security F4, the fails-closed-invisibly
  lesson):** a positive-path probe (a representative REAL mapping writes
  successfully as a non-admin) + negatives (oversized label, col-index 60, extra
  child) — REST-probe style per the PR-1a pattern (the RTDB emulator needs Java,
  unavailable — same gap as #125).
- Writer census: new node, zero existing writers (G6, `rg` 0 hits).

### 4d. M-1 ingestion guards + UX facts (client)

- Caps at two gates (security F10 placement): 2 MB on `file.size` BEFORE reading
  to string; 5,000-row/60-col AFTER `parseCSVData` returns but BEFORE
  `processDataWithMapping` (`parseCSV` itself has no limits — a 2 MB file of
  short lines can exceed 5,000 rows, so the byte cap alone is insufficient).
  Clear inline error on rejection.
- **The scripted "Export" button is CUT in D3** (F7): the only formula-injection
  sink is a downloadable CSV; shipping no export removes the surface. If export
  returns later it must `'`-prefix-neutralise `= + - @` lead chars.
- **Value-columns warning (GT missed-item #1, probe-proven):** v1 derives
  `unitCost` ONLY from `openingValue/openingQty` + `closingValue/closingQty` — a
  mapped "Unit Cost" COLUMN IS IGNORED (`data-processor.js:352-396`). A qty+
  unit-cost-only POS export silently produces all-zero costs (`hasMissingUnitCost`
  on every item → cost% garbage, null estimated costs). The wizard warns
  prominently when neither value column is mapped: "costs can't be derived from
  this file — cost KPIs and order Rand values will be unavailable."
- Rows with an empty itemCode get `ITEM-<random>` codes from v1
  (`data-processor.js:437`, `Math.random`) — identity survives via the
  description-hash itemKey, but tests must not assert on generated codes.
- **Notifications: inline banners, NOT SweetAlert2** (the established v2-surface
  pattern — `ProjectStatusApp.vue:15`, `RossActivity.vue:24`; no v2 page loads
  the SweetAlert2 CDN, where it would silently no-op — the #42 lesson).
- **Console noise accepted-for-D3:** the v1 parse chain logs tenant stock data
  verbatim to the browser console (R4 forbids editing it). Client-side only —
  visible to the uploading owner in their own devtools, not a server log. Logged
  to the D4 strip list; not mitigated here.
- The upload preview renders via Vue text interpolation only (auto-escaped; no
  `v-html` — the #184 lesson). The Hi-Fi kit has NO file-input/modal/table/
  progress components — the wizard's file input, step container, and preview
  table are bespoke (plan budgets for this).

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
- **R-D3-3 — shared-file ownership:** additive rules node + the CF registration
  line — this PR solely owns `database.rules.json` AND `functions/index.js`
  (both flagged single-owner-at-a-time files).
- **R-D3-4 — CF cold-start on first paint:** the dashboard blocks on the CF;
  acceptable for v2 (same as other v2 surfaces); loading skeleton in the UI.
