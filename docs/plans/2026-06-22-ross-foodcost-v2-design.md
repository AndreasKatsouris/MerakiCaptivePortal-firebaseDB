# ROSS-FoodCost-v2 — Design

**Date:** 2026-06-22
**Status:** Draft v2 (adversarial review folded — pending user approval)
**Sprint context:** W1 — capability breadth (Ross can actually *see* the restaurant). Launch-gate wheel.
**Author:** primary dev agent + operator (Andreas)

---

## 1. Problem & intent

Ross (the askRoss agent) currently cannot see food cost. The `getFoodCostSummary`
tool is a `pending` stub that throws `AdapterPendingError`
([functions/agent/tools.js:160](../../functions/agent/tools.js)). Wiring it is the
smallest high-value step of W1.

But the food-cost module it would read from is a sprawling, ~v2.1.x admin-dashboard
surface with real liabilities (dead code, a dual storage-path ambiguity, zero
CI-enforced tests on its calculation core, a ~3k-line Vue 2 monolith). Wiring Ross
naively against it would either read the wrong data or bind the agent to fragile code.

The operator's instinct — *"strip the noise, harden the functions we keep"* — is the
right one. This design turns that into a **surgical strip-and-harden**, NOT a greenfield
rebuild, and uses Ross as the first clean consumer of the hardened core.

**Non-goal:** a from-scratch rewrite of ~20k LOC. The calculation logic is the asset;
we preserve it, test it, and clean up around it.

---

## 2. Architecture

**Important correction (adversarial review):** the "one hardened core, two consumers"
picture below is the **end-state of Deliverable 2+**, NOT Deliverable 1. Deliverable 1
needs **zero calculator extraction** — the saved stock record already persists a
denormalised summary (`costPercentage`, `totalCostOfUsage`, `salesAmount`, `stockItems[]`
at `database-operations.js:118`), so the reader reads those values directly. See §7/O4.

### 2a. Deliverable 1 (what ships first) — pure reader, no shared core

```
   locations/{locId}/stockUsage/{ts}        ┌──────────────────────────┐
   (persisted denormalised summary:   ─────▶│ getFoodCostSummary adapter│──▶ Ross
    costPercentage, salesAmount,            │ read-only, access-checked  │
    totalCostOfUsage, stockItems[])         └──────────────────────────┘
```

No extraction. No calculator. Just an access-checked read + light aggregation across
records (the shape `ross/v2/detectors.js` already uses).

### 2b. Deliverable 2+ end-state — one hardened core, two consumers

```
        ┌─────────────────────────────────────────────┐
        │   HARDENED CORE  (extract + unit-test)        │
        │   • CSV ingestion (+ mapping memory)          │
        │   • Advanced calc (reorder, criticality)        │
        │     ⚠ inner math is pure; the UI entry point    │
        │       does an async RTDB read — see G8/R2       │
        └─────────────────────────────────────────────┘
                  │                          │
        ┌─────────▼──────────┐    ┌──────────▼───────────┐
        │ ROSS-FoodCost-v2   │    │  Ross reader (D2+)    │
        │ (Hi-Fi UI surface) │    │  adds "suggestedOrder"│
        └────────────────────┘    └───────────────────────┘
```

The shared core becomes worth building when Ross needs *"what should I order"* — which
requires the advanced calculator, not just persisted values. Until then, extraction is
speculative; D1 deliberately avoids it.

---

## 3. Ground truth (verify each in adversarial review)

Confidence levels are explicit so the review can target the weak claims.

All rows below were independently verified against live code in adversarial review
(2026-06-22). Verdicts and corrections are folded in.

| # | Claim | Verdict | Evidence |
|---|-------|---------|----------|
| G1 | Live **read** path for stock data is `locations/{locationId}/stockUsage/{recordId}` | ✅ CONFIRMED | `public/js/modules/ross/v2/detectors.js:110` reads it; `database-operations.js:67,165,292,414,709`. (Note: the reading file is in `ross/v2/`, not `food-cost/`.) |
| G2 | Live **write** (save) path is the same `locations/{locId}/stockUsage/...` | ✅ CONFIRMED | Live Save handler `saveStockUsage()` `refactored-app-component.js:1823` → `saveStockData()` :1892 → `database-operations.js:67,89` writes ONLY `locations/{selectedLocationId}/stockUsage/{timestamp}`. Root path never touched on save. |
| G2b | Saved record persists a **denormalised summary** (no recompute needed for D1) | ✅ CONFIRMED | `database-operations.js:89-119` writes `costPercentage`, `totalCostOfUsage`, `salesAmount`, `totalUsage`, `stockItems[]` (:118). **This answers O4.** |
| G3 | Root `stockUsage/{recordId}` is the governed-but-ghost write path | ✅ CONFIRMED | `database.rules.json:243-249` governs it; `services/firebase-service.js:39` writes it, but its only importers (`react-adapter.js`, food-cost `all-components.js`) are dead. **NB:** `firebase-service.js` also *reads* root `stockUsage` (:97,186,238) and is imported live for `getRecentStoreContext` — the file is not wholly dead. |
| G4 | Live order calculator is `order-calculator-advanced.js` | ✅ CONFIRMED | Imported by live `components/purchase-order/po-modal.js:8`; runtime log cites it |
| G5 | ~~base + calculus calculators are dead~~ **CORRECTED** | ❌ REFUTED (base) / PARTIAL (calculus) | `order-calculator.js` (**base**) is **LIVE** — imported by `index.js:21`, `order-calculator-advanced.js:7`, `po-modal.js:7`; the advanced calc delegates to it. Only `order-calculator-calculus.js` is an alternate (wired into `po-modal.js:9`). **Deliverable 4 must NOT delete the base calculator.** |
| G6 | `database-operations-v2.js`, `react-adapter.js`, and `firebase-service.js`'s *write* fn are dead | ✅ CONFIRMED | No live importer. ⚠ duplicate-filename trap: food-cost `all-components.js` ≠ the live `analytics/all-components.js`. |
| G7 | `refactored-app-component.js` is the live admin surface (~3k LOC, Vue 2 options API) | ✅ CONFIRMED | `admin-dashboard.html:1383/1422` → `food-cost-with-guard.js:69-71` → `index.js:10` → `refactored-app-component.js` |
| G8 | ~~Calc core is pure & extractable~~ **CORRECTED** | ⚠ PARTIAL | The **inner** `calculateAdvancedOrderDetails()` (`order-calculator-advanced.js:95`) is pure. But the UI entry `generateAdvancedPurchaseOrder()` (:432) is **async and does an RTDB read** (`HistoricalUsageService.generateHistoricalSummaries`, :464). D2 extraction = lift the inner fn + re-inject the historical summary as a param. Heavier than first claimed (see R2). |
| G9 | Calc core has zero CI-enforced tests | ✅ CONFIRMED | 9 vitest `*.test.js` in `food-cost/tests/` cover flags/itemkey/identity/summary — **none import `order-calculator*`**. Calc-specific suites are `*-tests.js` browser runners, not picked up by `vitest run`. |
| G10 | ROSS has 10 task input types, none for file/dataset upload | ✅ CONFIRMED | `ross/v2/constants/input-types.js:12-15` = `functions/ross.js:42-45 VALID_INPUT_TYPES` |
| G11 | ROSS has no workflow→workflow trigger/chain mechanism | ✅ CONFIRMED | grep `ross.js` trigger/chain/onComplete/cascade → 0 matches |
| G12 | Agent adapter pattern = `getDb()`-seamed, owner-scoped, Zod-typed `run`, `STATUS.READY` | ✅ CONFIRMED | `tools.js:80-152` (4 live adapters) |
| G13 | **The live read path has NO rules-level tenant isolation** | ✅ CONFIRMED (new) | `locations/$locationId` is `".read": "auth != null"` (`database.rules.json:48`) — any authed user can already read any location's stock. Per-owner scoping exists ONLY on the ghost root path (:248). **The reader's own access check is therefore the only boundary — see C-1/C-2 in §5.1.** |

---

## 4. Corrected ROSS integration model

The operator's first mental model chained workflows and used a file-upload task. Two
ROSS mechanics make that the wrong shape:

- **No file-upload task type** (G10) — a task captures one small value, not a parsed
  dataset of hundreds of line-items.
- **No workflow chaining** (G11) — workflows fire on a schedule, they don't trigger
  each other.

**Two more corrections from review — neither mechanism exists in ROSS today:**
- **"Sequential tasks" is not a feature.** Task `order` is a cosmetic sort hint; run
  completion counts required tasks regardless of order (`ross.js` allowed-fields ~:1238,
  completion ~:1290). There is no "Task 2 unlocks after Task 1" gating. So a workflow is a
  **flat checklist**, not a sequence.
- **Task-level deep-link buttons do not exist.** The task schema (`ross.js:1216-1228`) has
  `title/inputType/inputConfig/required/status/dueDate/completedAt/assignedTo/order` — **no
  `action`/`href` field.** The only live deep-links are in the Ross *home feed* (scripted
  Phase C content, `ross/v2/content.js:136-181`), not workflow task cards.

**Corrected model — ROSS orchestrates; the food-cost surface does the data work:**

- A **"Weekly Stock & Ordering"** workflow (`recurrence: 'weekly'`, a valid value in
  `ross.js VALID_RECURRENCES`) is a **flat checklist**:
  - *"Upload this week's stock file"* (checkbox/timestamp)
  - *"Review & approve purchase order"* (checkbox/timestamp)
- The owner gets to the food-cost surface either by (a) the **Ross agent driving it
  conversationally** ("your stock file is due — here's the link"), or (b) a **net-new
  task-level `action` field** (schema + run-UI work — scoped as its own item, NOT assumed
  idiomatic).
- The **Ross agent** reads `getFoodCostSummary` and builds reports on request; later it can
  nudge proactively via the W2 rail.

**Honest stance:** the deep-link hand-off is a **stopgap with a known-rough UX** (ROSS task
→ separate surface → upload → manually return → tick box; no return signal, no shared
state). The clean answer is the §8 first-class `dataset` task type. W1 does NOT build
task-level deep-links; Ross drives the flow conversationally until the `dataset` type lands.

---

## 5. Sequenced deliverables (each its own spec → plan → PR)

### Deliverable 1 — Minimal Ross reader over persisted summaries (W1, FIRST)
- **No calculator extraction** (G2b/O4). Build a **read-only, access-checked**
  `getFoodCostSummary` adapter that reads the denormalised summary already persisted in
  `locations/{locationId}/stockUsage/{ts}` (`costPercentage`, `salesAmount`,
  `totalCostOfUsage`, `stockItems[]`) and aggregates across recent records (cost%, trend,
  low/critical items) — the shape `ross/v2/detectors.js` already uses.
- Flip the tool to `STATUS.READY`; add eval coverage (a food-cost case in `npm run eval`).
- **Summary fields are an OPEN ITEM** (§7/O1) — finalised during this build against real
  output. `suggestedOrder` is explicitly OUT of D1 (needs the D2 calculator).

**Hard acceptance gates (not prose — each is a named, testable deliverable):**
1. **Tenant isolation (C-1, §5.1).** The model-supplied `locationId` is access-checked
   against `ctx.uid` (`userLocations/{ctx.uid}/{locationId}` OR
   `locations/{locationId}/ownerId === ctx.uid`) BEFORE any read — mirroring
   `resolveWorkflowOwner` (`tools.js:63-75`). **A cross-tenant unit test in
   `functions/agent/__tests__/tools.test.js` (attacker→empty, owner→served,
   delegated-via-`userLocations`→served) is an acceptance gate.** An eval is not a security
   guard.
2. **Empty-data path.** For a location that has **never uploaded**, Ross says "no stock data
   yet for this location" — not an error, not a hallucinated number. Covered by a test.
3. **Demonstrable-W1 sign-off.** Before build, lock a concrete scripted Q&A
   (e.g. *"how's my food cost?"* → *"31%, up from 28%, 11 items low…"*) and confirm with the
   operator that THAT answer — without `suggestedOrder` — clears the W1 bar. (Review flagged
   the risk that a reader without "what to order" underwhelms.)
4. **Location-scoped trend.** Trend is computed from location-scoped `stockUsage` records,
   NOT the global-by-`itemCode` `HistoricalUsageService` (which blends locations — see R5).

### Deliverable 2 — Advanced-calculator extraction + hardening
- Extract the live `order-calculator-advanced.js` math (confidence weighting, volatility
  safety stock, stockout escalation) into a pure, vitest-tested shared module.
- Strip the verbose console logging (the runtime log emits hundreds of lines/run).
- Powers the *"what should I order"* summary field for Ross AND the v2 UI.

### Deliverable 3 — ROSS-FoodCost-v2 UI
- Wire the existing scripted Hi-Fi `/food-cost-v2.html` shell to the hardened cores.
- Includes **CSV mapping-memory** (§6).

### Deliverable 4 — Strip-and-harden sweep
- Delete confirmed-dead code (G6 only — `database-operations-v2.js`, `react-adapter.js`,
  the `firebase-service.js` *write* fn, `order-calculator-calculus.js` if confirmed unwired).
  **Do NOT delete `order-calculator.js` (base) — it is live (G5).**
- Retire the ghost root `stockUsage` path — gated on the writer+reader census (H-1, §5.1).
- Consolidate duplicate modals.

---

## 5.1 Security requirements (LOCK NOW — folded from security review)

These are not deferrable; the *summary fields* can stay open (§7/O1) but the security
envelope is fixed here.

- **C-1 (CRITICAL) — caller→location access check.** As Deliverable-1 gate #1 above. The
  agent runs via Admin SDK (rules bypassed); the adapter is the ONLY tenant boundary. Derive
  uid from `ctx.uid`, never from an `args` field. Pattern: `tools.js:63-75`; lesson:
  LESSONS 2026-06-05 (#144 IDOR), "capability-absence > prompt-guarding".
- **C-2 (CRITICAL) — record the read-cascade reality.** The live read path
  `locations/$locationId` is `.read: auth != null` (`database.rules.json:48`) — no
  rules-level tenancy (G13). The adapter must additionally confirm read records belong to the
  access-checked location (don't assume the node holds one tenant). The `locations` root
  read-cascade is a separate, pre-existing platform hardening item — log to backlog,
  **do not bundle** here.
- **H-1 (HIGH) — ghost-path removal census (O2/Deliverable 4).** Before ANY `stockUsage`
  rule edit: `rg --include=*.js --include=*.html --include=*.vue` for ALL writers AND readers
  of root `stockUsage` (inline `<script>` is live code — the #125 catch). `firebase-service.js`
  both writes and reads it. Route/remove every live caller in the SAME PR as the rule change.
  Mark `database.rules.json` + `firebase-service.js` single-owner-at-a-time. Pattern:
  LESSONS 2026-06-02 (#125, validated 3×) + 2026-05-31 rules-cascade (#96).
- **H-2 (HIGH) — auth posture + output envelope.** `getFoodCostSummary` is `tier: AUTO`,
  `STATUS.READY`, **read-only**, acts as `ctx.uid`. Output is location-scoped and carries
  **no guest PII** (cf. sibling `getGuestsSummary` "(no PII)" `tools.js:162`). Adapter must
  not log raw stock records/costs into server logs.
- **M-1 (MEDIUM, Deliverable 3) — CSV ingestion guards (design-record):** neutralise
  formula-injection (`= + - @` lead chars) at export; cap file size / row / column count and
  reject before parse; header-fingerprint must store the **full header set** and require an
  **exact match before auto-applying** a saved mapping (no silent near-match — collisions feed
  wrong columns to Ross); the saved mapping is owner-scoped (`.../{uid}/...`, user-writes-own
  rule) and re-validated against the actual uploaded header every time (fail safe, never
  mis-map).

---

## 6. CSV mapping memory (Deliverable 3 detail)

**Operator goal:** manual CSV upload as simple as possible, POS-agnostic, "remembers" the
user's column mapping and auto-loads it next time.

**Design direction (not locked):** key the saved mapping to a **fingerprint of the CSV's
header row** (e.g. a hash of the normalised column names), so the user never picks a POS —
each distinct export format auto-loads its own remembered mapping, and the second upload of
a known format is one click. Stored per user (path TBD; owner-scoped, server-validated).

This is where the CSV ingestion core gets extracted + hardened.

---

## 7. Open items (decide as we go)

- **O1 — Ross summary fields.** Final content of `getFoodCostSummary` output. Proposed v1
  superset: `period`, `foodCostPct`+`trend`, `itemsAnalysed`, `critical` (count + top N),
  `topCostDrivers`, `suggestedOrder` (deferred — needs Deliverable 2), `dataFreshness`.
  Operator to refine against real output during Deliverable 1.
- **O2 — Ghost path fate.** Remove root `stockUsage` rule + dead writer, or leave dormant?
  Decide after the writer census (per the validated pre-flight-writer-census pattern).
- **O3 — Mapping storage path + shape** (Deliverable 3).
- ~~**O4** — recompute vs read denormalised?~~ **RESOLVED by code:** the saved record
  already persists `costPercentage`/`salesAmount`/`totalCostOfUsage`/`stockItems[]`
  (`database-operations.js:118`). D1 **reads denormalised, does not recompute.** Caveat: the
  persisted `costPercentage` is frozen at upload time — if Ross ever needs a different period
  window it would diverge from a recompute; that's a D2 concern, not D1.
- **O5 — unit-cost availability (gates D2 scope).** Before scoping `suggestedOrder`, confirm
  `unitCost` is reliably present in persisted `stockItems[]` — the advanced calculator emits
  silent 0/NaN order values when it isn't, and a wrong Rand figure Ross speaks as fact is
  worse than no figure.

---

## 8. Deferred goals (on the record, not in scope now)

- **First-class ROSS `dataset`/`file` task input type** — so stock-file upload becomes a
  native ROSS task rather than a deep-link hand-off. Graduate to this once the deep-link
  flow proves the workflow shape.

---

## 9. Risks

- **R1 — Reading the wrong path (G2).** Mitigated by making G2 verification the gating
  first step of Deliverable 1.
- **R2 — Calc coupling (G8, CONFIRMED real).** The UI's calculator entry point
  (`generateAdvancedPurchaseOrder`, `:432`) is async and does an RTDB read inside (`:464`).
  D2 extraction must lift the **inner** pure fn and re-inject the historical summary as a
  param. Heavier than "surgical" — scope D2 accordingly.
- **R3 — Scope creep into a rebuild.** Mitigated by the deliverable split — only
  Deliverable 1 is in the current W1 commitment; 2–4 are sequenced, not bundled.
- **R4 — Touching the live admin monolith.** We do NOT edit `refactored-app-component.js`
  except to delete it at the very end (Deliverable 4), after v2 soaks.
- **R5 — Multi-location blending.** `HistoricalUsageService` keys history by `itemCode`
  **globally, not per-location**, so cross-location trend can blend venues. D1 sidesteps this
  by computing trend from location-scoped `stockUsage` records (D1 gate #4); D2/D3 must
  address it for the group-of-venues target.

---

## 10. What ships first

Deliverable 1 only. Everything else is sequenced behind it and gets its own spec/plan/PR.

### Locked decisions (2026-06-22, operator delegated "you decide")

- **D-1 — upload hand-off:** W1 has Ross point the owner to the food-cost surface
  **conversationally**. NO task-level `action`/deep-link button, NO `dataset` task type in
  W1 — both deferred (§8). Cheapest path that ships.
- **D-2 — W1 bar:** Deliverable 1 is **read-only, no `suggestedOrder` quantities**, but
  MUST include the **low/critical-items signal** from the persisted `stockItems[]`
  (closing qty / flags) so the answer is "cost% + trend + what's running low" — not a single
  number. `suggestedOrder` (reorder quantities) stays Deliverable 2. Revisit if it
  underwhelms on first live use.
