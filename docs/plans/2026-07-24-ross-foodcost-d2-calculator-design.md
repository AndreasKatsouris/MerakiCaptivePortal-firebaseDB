# ROSS-FoodCost-v2 — Deliverable 2: Order Calculator Core + `getSuggestedOrder` — Design

**Date:** 2026-07-24
**Status:** v3 — ALL THREE adversarial reviews folded (security: 1 HIGH + 3 MED →
P5/P6 + do-not-port list + §7.3 acceptance tests; ground-truth: 4 GT corrections +
quirks Q10–Q16 + P7/P8; test-feasibility: golden strategy empirically validated,
§7.1 is the proven shape). Ready for plan + build.
**Parent design:** `docs/plans/2026-06-22-ross-foodcost-v2-design.md` (§5 Deliverable 2)
**Sprint context:** W1 — capability breadth. D1 (read-only `getFoodCostSummary`, PR #167) is live; this is the sequenced next step.

---

## 1. Problem & intent

Ross can now answer *"how's my food cost?"* (D1) but not *"what should I order?"* —
the question that actually saves an owner money before a delivery. The maths that
answers it already exists and is battle-tested in the v1 admin surface
(`order-calculator-advanced.js`: confidence-weighted usage blending, volatility
safety stock, stockout escalation, criticality scoring), but it is browser-ESM,
riddled with console noise, coupled to an RTDB-reading service with fuzzy
cross-location matching (parent design R5), and has **zero CI-enforced tests**
(parent G9).

D2 ports the calculation chain into a **pure, vitest-tested CommonJS core under
`functions/`** and exposes it to Ross as a new read-only agent tool,
**`getSuggestedOrder`**.

**Non-goals (locked):** no edits to any `public/js/modules/food-cost/` file (parent
R4 — the live monolith is untouched until D4); no CF endpoint for the v2 UI (that is
D3, which consumes this same core); no CSV work (D3); no dead-code deletion (D4).

---

## 2. Locked decisions (operator, 2026-07-24)

- **D2-1 — Tool shape:** a **new dedicated `getSuggestedOrder` tool**, not an
  extension of `getFoodCostSummary`. The summary stays cheap; the order tool reads
  deeper history and is a distinct capability for the model to reach for.
- **D2-2 — Quirk policy: characterize, preserve, log.** The port is byte-faithful to
  the live maths. Every discovered behavioural quirk is locked in a characterization
  test and logged in §6 for an explicit later decision. An extraction PR must prove
  parity, not improve behaviour. (Exceptions: the four **port deltas** in §5.3, each
  of which is a mechanical necessity, not a behaviour opinion.)
- **D2-3 — Core location: server-side CJS.** "One hardened core, two consumers"
  resolves to: core lives in `functions/agent/food-cost/`; Ross consumes it now via
  the tool; the v2 UI consumes it in D3 via a CF. No dual-format ESM/CJS module —
  this sidesteps the ESM-in-CJS deploy trap (LESSONS 2026-06-22) entirely.
- **D2-4 — Full lifecycle this session:** spec → adversarial review → plan →
  subagent-driven TDD build → PR.

---

## 3. Ground truth (verified against live code this session; adversarial review to re-verify)

| # | Claim | Evidence |
|---|-------|----------|
| GT1 | **`unitCost` is present on the CSV-upload path** (`0`+flags `hasMissingUnitCost`/`unitCostCalculationMethod:'missing'`/`needsAttention` when underivable). **Adversarial review downgraded "always": legacy records edited + re-saved round-trip verbatim** (`refactored-app-component.js:2178→1883/797`; `saveStockData` validates only `Array.isArray`) so items can persist with NO `unitCost`/flag fields; and `EditableStockDataTable.js:269-354` lets a user edit `unitCost` without recomputing the flag → **flags can be stale in both directions** | `data-processor.js:352-396,455-468`. Resolves parent O5, with the correction: cost-gate defensively — treat cost as unknown when `hasMissingUnitCost === true` **OR `unitCost` is absent/non-finite/≤0**; never trust the flag alone (P4) |
| GT2 | Base `calculateOrderDetails` and `calculateCriticalityScore` are **already pure** (no I/O, no Date, no module state, no input mutation) | `order-calculator.js:159-231`, `:20-151` — independently re-verified |
| GT3 | `calculateAdvancedOrderDetails` is pure **except**: 19 `console.*` calls, `new Date()` twice for day-of-week seasonality (`:212,216`), `JSON.parse(JSON.stringify(item))` deep-copy (`:105`). Mutates its local `context` (Q7) but never the caller's `params`. Delegates to base calc at `:299` | `order-calculator-advanced.js:95-422` |
| GT4 | The impure boundary is exactly the entry point: `generateAdvancedPurchaseOrder` (`:432`) awaits `HistoricalUsageService.generateHistoricalSummaries` (RTDB read) at `:464`. **The entry point is NOT ported** — its orchestration (filter → criticality → calc → sort, `:508-596`) is reimplemented purely. Its two fallbacks (no storeIdentifier `:443-445`, catch `:599-605` → basic generator) don't apply server-side | `order-calculator-advanced.js:432-606` |
| GT5 | `HistoricalUsageService.calculateItemStatistics` is **deterministic given a records array + `now`**, but not clean: 7 `console.*` calls (`:180-321`), `Date.now()` fallback (`:266`), and a **whole-body try/catch that converts ANY throw into `_getEmptyStatistics()`** (`:320-323`) — an error-shape behaviour the port must preserve. Helpers (`_calculateMean`, `_calculateStandardDeviation`, `_calculateTrend`, `_calculateDayOfWeekPatterns`, `_getEmptyStatistics`) are pure. ⚠ `getDay()`/date parsing are **timezone-sensitive** — see P8 | `historical-usage-service.js:179-324`, `:526-655` |
| GT6 | **R5 cross-location blending confirmed live:** name-strategy search scans ALL accessible locations with case-insensitive `includes()` matching and merges by record id | `historical-usage-service.js:128-153` (fuzzy match), `:344-411` (multi-strategy merge). The server core reads ONLY `locations/{locId}/stockUsage` — blending is structurally impossible |
| GT7 | The persisted record carries `daysToNextDelivery`, `safetyStockPercentage`, `criticalItemBuffer` — **but all written with `\|\| 0` fallbacks (0 is a legitimate persisted value), no `coveringDays` is stored, and the live PO modal ignores the record entirely** (supplies its own locally-defaulted params, `po-modal.js:78-84,168-173`). "Defaults from the record" is therefore a D2 **design choice, not a parity fact** — and the tool must apply the same `\|\|`-falsy defaulting the live calculators do (0 → 7/20/30, coveringDays → 2) or it diverges from every calculator in the file | `database-operations.js:97,109-110`; `po-modal.js:78-84`; adversarial review GT7 |
| GT8 | D1 adapter pattern to copy: `callerHasLocationAccess` (C-1) then `orderByKey().limitToLast(N)` bounded read, lazy-require of the pure core | `functions/agent/tools.js:82-87,180-197` |
| GT9 | Persisted `stockItems` is an **array** (all four live save paths write arrays); the stats builder's object-keyed branch is ported byte-faithfully **but is NOT a safety net** — the only object shape real data can take is RTDB sparse-array coercion (numeric-index keys), where `stockItems[itemCode]` looks up a *code* against *indices* → silent misses or a wrong item for small-integer codes | `database-operations.js:119`; `historical-usage-service.js:196-200`; adversarial review GT9 |
| GT10 | `historicalSummary` consumed shape: `{ dataPoints, avgDailyUsage, stdDevUsage, volatility, trend:{slope,direction}, dowPatterns:{<day>:{average,index,dataPoints}}\|null, raw:[{date,usage,usagePerDay,periodDays}] }` (+ `itemCode`,`firstDate`,`lastDate`) | producer `historical-usage-service.js:307-318`; consumer `order-calculator-advanced.js:47-86,176-234,302-304`. Consumer also reads `trend.strength`, which the producer never emits — see Q10 |

---

## 4. Architecture

```
functions/agent/food-cost/
├── stats.js          pure: records[] → per-item historical stats
│                     (port of calculateItemStatistics + mean/stddev/trend/dow helpers)
├── order-calc.js     pure: (item, historicalSummary, params) → order details
│                     (port of calculateOrderDetails + calculateCriticalityScore
│                      + calculateAdvancedOrderDetails; now-injected, console-free)
└── suggest.js        pure orchestrator: (records, opts) → suggestedOrder result
                      (reimplements the entry point's filter→criticality→calc→sort
                       loop WITHOUT the RTDB read; model-facing output shape §5.2)

functions/agent/tools.js   + getSuggestedOrder adapter (§5.1) — the only I/O
functions/agent/__tests__/ + food-cost-stats.test.js, food-cost-order-calc.test.js,
                             food-cost-suggest.test.js, golden parity fixtures (§7)
```

All files `'use strict'` + `require`/`module.exports` CJS. Data-in/data-out like
D1's `food-cost-summary.js` — no Firebase, no Vue, no I/O in the three core modules.
(`food-cost-summary.js` itself is untouched; a later cleanup may relocate it into
the directory, but D2 does not move shipped files.)

### Historical stats source (R5 fix, structural)

The adapter reads the SAME node D1 reads — `locations/{locId}/stockUsage`,
`orderByKey().limitToLast(30)` (uploads are ~weekly; 30 records ≈ 6+ months of
history, comfortably above the calculator's `minimumHistoryRequired: 2` and the
14-point day-of-week threshold) — and `stats.js` builds per-item summaries from
those records only. No name matching, no multi-location merge, no cache.

---

## 5. The `getSuggestedOrder` tool

### 5.1 Registry entry (mirrors D1)

- `tier: AUTO, ceiling: AUTO, status: READY` — **read-only**; computes and returns,
  writes nothing.
- `args` (Zod): `locationId: z.string()` (access-checked, C-1);
  `daysToNextDelivery: z.number().int().min(1).max(30).optional()` (owner may ask
  "what if delivery is Friday?"); `supplierFilter: z.string().max(100).optional()`
  (security review F2: the `.max()` bounds CPU, model context AND the audit row —
  `executeTool` persists args verbatim to `ross/agentAudit`). **Matching is
  mandated as case-insensitive substring** —
  `String(supplierName).toLowerCase().includes(filter.toLowerCase())` — **never
  `new RegExp(...)`** (model-supplied pattern → ReDoS).
  All other calc params come from the latest record (GT7) or the live defaults.
- `run`: `callerHasLocationAccess` gate → bounded read → lazy-require
  `./food-cost/suggest` → return. On access failure return `{ hasData: false }`
  (indistinguishable from no-data, as D1).

### 5.2 Model-facing output (no PII; bounded)

```js
{
  hasData: true,
  asOf, dataAgeDays,                  // from latest record, as D1
  params: { daysToNextDelivery, coveringDays, safetyStockPercentage,
            criticalItemBuffer, source: 'record'|'default'|'caller' },
  historyDepth: { records, itemsWithHistory, advancedCalculations, basicCalculations },
  items: [{                            // ONLY items with orderQty > 0,
    itemCode, description, supplierName,     // sorted critical-first then cost desc,
    currentStock, usagePerDay,               // capped at 30
    orderQty, requiredStock,
    isCritical, criticalityReason,
    stockStatus: 'stockout'|'low'|'ok',
    unitCost, estimatedCost,           // BOTH null when hasMissingUnitCost (GT1)
    calculationType: 'advanced'|'basic',
    confidence,                        // overall 0-1; OPTIONAL — only present on
                                       // advanced items with ≥5 data points (Q14)
  }],
  truncated: { itemCount } | null,     // when >30 items need ordering
  totals: { itemsToOrder, estimatedTotalCost,   // total EXCLUDES unknown-cost items
            itemsWithUnknownCost },             // and says how many were excluded
  caveats: []                          // e.g. 'costs-unavailable-for-N-items'
}
```

The description tells the model quantities are recommendations from usage history,
and that `estimatedCost: null` means the upload had no derivable unit cost — never
invent a Rand figure for those (mirrors the no-fabrication posture, LESSONS
2026-05-31).

### 5.3 Port deltas (mechanical, not behavioural — the ONLY intended differences)

| Δ | Delta | Why |
|---|-------|-----|
| P1 | All `console.*` calls dropped | Parent D2 requirement ("strip the verbose logging"); H-2 says no raw stock records in server logs |
| P2 | `new Date()` / `Date.now()` replaced by injected `now` (epoch ms) threaded from `ctx.now` | Determinism + testability; same seam D1 uses |
| P3 | The entry point's RTDB read + fuzzy multi-location history search (GT4/GT6) replaced by location-scoped records passed in by the adapter | R5 fix; structural tenant isolation |
| P4 | Cost gating: `estimatedCost`/`unitCost` are `null` when cost is **unknown — `hasMissingUnitCost === true` OR `unitCost` absent/non-finite/≤0** (GT1 correction: legacy round-tripped items can lack the field entirely, and the flag can be stale) — instead of multiplying by 0 | New output field, not a change to ported maths — order *quantities* are unaffected. Known residual (GT1): a stale flag can null a genuinely-costed item; acceptable — under-claiming beats a wrong Rand figure |
| P5 | Input bound: at most **2,000 stock items per record** and **10,000 items total** enter the stats/calc chain; excess is truncated with `caveats: ['items-truncated-for-size']` | Security F3 (HIGH): `locations/{locId}` is owner-writable via the client SDK, so `stockItems[]` size is attacker-controlled; D2's per-item stats+deep-copy chain is O(records×items×history) vs D1's single O(items) map — uncapped it is a self-service CF DoS |
| P6 | Output strings `description` and `supplierName` truncated to 120 chars, control characters stripped | Security F4: tenant-CSV strings flow into the model conversation (and into super-admin sessions — priv-esc surface); `supplierName` is a NEW sink vs D1 |
| P7 | **No input mutation.** The live orchestrator writes `criticalityDetails`/`criticalityScore`/`criticalityReason` onto the caller's `item` objects before spreading (`order-calculator-advanced.js:534-536`); the port produces the identical OUTPUT fields via spread without mutating inputs | Repo immutability rule; output parity preserved — golden fixtures compare returned objects, not input side-effects |
| P8 | **Timezone pinned to SAST (UTC+2, no DST).** `getDay()` for day-of-week patterns + delivery-day selection is local-timezone-dependent: browser (SAST) vs CF (UTC) can bucket the same epoch to different weekdays → different dow factors. The port computes weekday as `new Date(ts + 2*3600e3).getUTCDay()` — deterministic everywhere, matches what SA users' browsers computed | Adversarial review MISSED#6. Clock injection (P2) pins the instant, not the zone. Golden generation must run with `TZ=Africa/Johannesburg` so the live module agrees (note in the generator header: regenerating on a UTC machine breaks dow fixtures) |

Everything else — including the quirks below — ports byte-faithfully.

**DO-NOT-PORT list (security F1 — the #144 vuln class, named so no implementer
copies it "for fidelity"):** `HistoricalUsageService.getHistoricalData`'s store-NAME
search strategy (fuzzy `includes()` match scanning ALL accessible locations,
`historical-usage-service.js:111-153`), `generateHistoricalSummaries`' multi-strategy
record merge (`:344-411`), and its module-level cache. `stats.js` receives records
from exactly one access-checked node and never fetches. Acceptance test: two
locations sharing an `itemCode` — location B's records must never influence
location A's numbers.

---

## 6. Quirk register (characterized + preserved, per D2-2)

Each gets a characterization test asserting the CURRENT behaviour, with a comment
citing this section. None are "fixed" in D2.

| # | Quirk | Where |
|---|-------|-------|
| Q1 | The advanced volatility branch computes `requiredStock = baseUsage + enhancedSafetyStock` — **dropping `criticalStock`** which the base calc includes in `forecastedDemand`; a critical item can get a SMALLER order via the advanced path than the basic path | `order-calculator-advanced.js:319,332` vs `order-calculator.js:186-189` |
| Q2 | The low-data fallback weighting (`dataPoints < 5`) can never leave 50/50: `max(dataPoints − 7, 0)` is always 0 when `dataPoints < 5` | `order-calculator-advanced.js:153-171` |
| Q3 | `needsReordering` semantics differ by branch: base = `forecastedDemand > reOrderPoint`; advanced = `recommendedOrderQty > 0` (after `Math.max(0, …)`) | `order-calculator.js:193` vs `order-calculator-advanced.js:350-357` |
| Q4 | Trend adjustment is asymmetric: max +5% for increasing, max −2.5% for decreasing | `order-calculator-advanced.js:245-258` |
| Q5 | Day-of-week factor needs ≥14 total data points to exist and >2 points on the delivery day to apply; it scales the WHOLE forecast period's usage by the delivery-day index | `historical-usage-service.js:305`; `order-calculator-advanced.js:225-233` |
| Q6 | Advanced path threshold is `dataPoints >= minimumHistoryRequired (2)` at the orchestrator but confidence weighting needs `>= 5` — 2-4 data points get advanced maths with the Q2 fallback weights | `order-calculator-advanced.js:453,541` vs `:132` |
| Q7 | Stockout escalation mutates the params for that item: `coveringDays → max(2×, 7)`, `safetyStockPercentage → max(1.5×, 30)` | `order-calculator-advanced.js:280-290` |
| Q8 | The advanced branch's volatility path only fires when `volatility > 0 && volatilityMultiplier > 0`; otherwise the item silently gets base-calc numbers + insights bolted on | `order-calculator-advanced.js:302,396-421` |
| Q9 | `calculateTimeWeightedAverage` ignores records with `usagePerDay <= 0` entirely (they don't drag the average down) and falls back to the simple average when ALL raw values are ≤0 | `order-calculator-advanced.js:29-38,176-180` |
| Q10 | `calculateHistoricalConfidence` reads `trend.strength`, which `_calculateTrend` **never produces** (returns only `{slope,direction}`) → `trendConfidence` is a constant `0.6`; the `0.8` clear-trend branch is dead code | `order-calculator-advanced.js:61-62` vs `historical-usage-service.js:578` |
| Q11 | **String-concatenation bug**: the volatility branch's `calculationDetails.forecastedDemand` adds `formatValue()` STRINGS — `origCalculation.baseUsage + enhancedSafetyStock + origCalculation.criticalStock` yields e.g. `"14.003.24.20"`. Display-only field (order quantities unaffected — the branch recomputes from numerics at `:328-351`); ported byte-faithfully so golden fixtures match; NOT exposed in the §5.2 model output | `order-calculator-advanced.js:316-320` |
| Q12 | **Reorder-point clamp asymmetry**: base calc's `reOrderPoint` is unclamped and can go negative (inflating base orders on stockouts); the advanced volatility branch clamps to ≥0. Second independent mechanism (with Q1) by which advanced can order LESS than basic | `order-calculator.js:176` vs `order-calculator-advanced.js:344` |
| Q13 | `historicalInsights.adjustments.trendAdjustment` is a signed NUMBER in the volatility branch but a BOOLEAN (`direction !== 'stable'`) in the else-branch | `order-calculator-advanced.js:385` vs `:410` |
| Q14 | For `dataPoints ∈ {2,3,4}` the advanced path runs with Q2's 50/50 weights and **no `confidence` object is ever stored** (`:142-152` only executes in the ≥5 branch) → §5.2's `confidence` field is absent for those items; the output schema marks it optional | `order-calculator-advanced.js:132,142-152` |
| Q15 | **Negative persisted usage** reaches RTDB (`data-service.js:103-112` recomputes without the `Math.max(0,·)` clamp `data-processor.js:400` applies): the simple average includes negatives, the time-weighted average excludes them (Q9), and the stats recompute path (`hus:219`, `!usage` guard) does NOT fire for negative (truthy) values | adversarial review MISSED#8 |
| Q16 | The advanced orchestrator's inclusion filter is `orderQuantity > 0` vs the base generator's `needsReordering` — provably equivalent for base-branch items (`needsReordering ⇒ ceil ≥ 1`); the port keeps `orderQuantity > 0` with a comment | `order-calculator-advanced.js:574-577` vs `order-calculator.js:339` |

---

## 7. Testing strategy

1. **Golden-master parity (the extraction proof) — design VALIDATED empirically by
   the feasibility probe; this is the proven shape:**
   - **File:** `functions/agent/__tests__/fixtures/food-cost-golden-generator.test.js`
     + committed lattice inputs + `food-cost-golden.json`. Dual-mode: with
     `GOLDEN_REGEN=1` it regenerates the JSON from the LIVE browser modules; without,
     it asserts the live modules still match the committed golden (live-side parity
     rides `npm test`). The CJS port's tests separately deep-equal the same JSON.
   - **Proven preamble:** the existing global `vitest.setup.js` firebase-config mock
     (free) + `globalThis.window = {firebaseExports: {…stubs}}` and a stub
     `document` BEFORE any import (without this, `firebase-helpers.js:244-245`'s
     module-scope `getRtdb()` fires 2 unhandled rejections → exit 1 even with tests
     green) + `vi.useFakeTimers()`/`vi.setSystemTime(<pinned ISO>)` (proven to
     pierce the internal `new Date()` dow branch) + dynamic `await import(...)` of
     the three live modules. Do NOT `vi.mock` `firebase-helpers.js` — the mock only
     matches with the `?v=` query verbatim and silently no-ops without it.
   - **Comparison contract: exact deep JSON equality** (NOT numeric-to-Ndp) — the
     live output mixes 2dp strings (`"35.00"`), raw numbers, and Q11's
     concat-garbage string; pinned runs are byte-deterministic so exact equality is
     both achievable and the strongest proof.
   - **Runner facts (probe-verified):** ONE runner — root vitest (v4.1.6) collects
     `functions/agent/__tests__/**` via the default include; new filenames need no
     config. `cd functions && npx vitest` is BROKEN (setupFiles resolves against
     the wrong cwd) — all documented invocations are root-relative:
     `npx vitest run functions/agent`. Regen: `GOLDEN_REGEN=1 npx vitest run <generator>`
     with `TZ=Africa/Johannesburg` (P8).
   - Lattice: items × (no history / 2-record thin history (Q2/Q6) / ≥5-point
     confidence / 22-daily-record dow-patterned / stockout / missing-cost /
     negative-usage (Q15)), pinned `now`. Caveat honestly recorded: parity holds
     for the lattice, not universally — the lattice is chosen to cross every §6
     branch.
2. **Characterization tests** for Q1–Q16 (some fall out of the golden lattice; each
   quirk gets at least one named, commented assertion — including Q11's
   concatenated-string field and Q15's negative-usage averaging split).
3. **Adapter tests** in `tools.test.js`: cross-tenant (attacker → `{hasData:false}`,
   owner → served, delegated via `userLocations` → served — same trio as D1's C-1
   gate), empty-node, bounded-read shape, cost-gating (missing-cost item →
   `estimatedCost: null` + counted in `itemsWithUnknownCost`). Plus the security
   review's named acceptance assertions (F7):
   - **hostile `supplierFilter`**: regex metacharacters treated as literals (substring
     match, no ReDoS), >100-char string rejected by Zod, control chars, empty string,
     no-match;
   - **malformed `stockItems`**: object / string / number / `null` / absent — `stats.js`
     degrades like D1's `Array.isArray` guard, never throws;
   - **oversized record**: huge `stockItems[]` → P5 caps hold, `items-truncated-for-size`
     caveat emitted;
   - **anti-enumeration**: the no-access and no-data returns are **deep-equal**
     (`{hasData:false}` byte-identical — a `reason` field would rebuild the locationId
     oracle);
   - **`daysToNextDelivery` bounds**: 0, 31, −1, 1.5, `"5"`, NaN all rejected at the
     Zod boundary;
   - **two-location bleed** (F1): shared `itemCode` across locations A and B —
     B never influences A.
4. **Eval case** (`q-suggest-order`): seeded tenant with a stockout + a low item →
   grader checks Ross recommends ordering, names the stockout item, and does NOT
   state a total including unknown-cost items as if complete. **Three touches
   (probe-verified):** case entry in `evals/cases.js`; extend `baselineFixture()`'s
   `stockUsage` records in `evals/fixtures.js` (they already seed a stockout item
   `'10127'` + low item `'11413'` but lack usage/period richness for the advanced
   path); **bump the `CASES.length` pin in `evals/__tests__/evals-cases.test.js:6-8`
   from 22 → 23** or the offline suite goes red.
5. Existing 165+ functions tests stay green; `npm run build` green.

---

## 8. Security envelope (locked; mirrors D1's §5.1)

- **C-1** — `locationId` is model-supplied → attacker-controlled; gate with
  `callerHasLocationAccess(locationId, ctx.uid)` BEFORE any read. Admin SDK bypasses
  rules; the adapter is the only tenant boundary. Cross-tenant test is an acceptance
  gate, not an eval.
- **H-2** — AUTO-tier, read-only, no PII in output (supplier names are business
  data, not guest PII), no raw records/costs logged server-side (P1 guarantees this
  structurally — the core has no logging at all).
- **No fabrication** — the tool computes from persisted uploads only; `hasData:
  false` when the location has never uploaded (never a guessed order). Cost gating
  per GT1/P4.
- **Bounded work** — `limitToLast(30)` read; **input caps per P5** (2,000
  items/record, 10,000 total — the attacker-controlled dimension, security F3);
  output capped at 30 items + truncation marker; Zod bounds on `daysToNextDelivery`
  (1–30) and `supplierFilter` (≤100 chars, substring-only matching).
- **Injection-via-data containment** — tenant-CSV strings (`description`,
  `supplierName`) truncated + control-stripped per P6 before entering the model
  conversation. (The same gap exists in D1's `description` output — logged to the
  backlog as a backport candidate, NOT bundled here.)
- **Presentation honesty** — per-item `confidence` is in the output so Ross does not
  speak low-confidence quantities as firm (security F6 note; the eval asserts this).

## 9. Risks

- **R-D2-1 — Port drift.** Two implementations of the same maths now exist until D4
  deletes the browser one. Mitigation: golden-master fixtures are the contract; each
  ported function carries a header comment citing its source file:line; D3/D4 route
  the UI onto this core, after which the browser copy dies.
- **R-D2-2 — Golden generator fragility: RESOLVED.** The import-chain hazard
  (firebase init side effects, `?v=` query specifiers, module-scope `window`
  access) is real but tamed by the probe-validated preamble in §7.1 (global
  setup mock + `window`/`document` stubs before import). Never edit `public/`.
- **R-D2-3 — Real-data shape variance.** Old records may predate some fields.
  `stats.js` keeps the live service's defensive fallbacks (usage recompute, periodDays
  chain, GT9 dual format); the empty/absent path returns `hasData: false`.
- **R-D2-4 — Underwhelm risk (parent gate #3 analogue).** A suggested order with
  null costs everywhere reads as broken. Caveats array + `itemsWithUnknownCost`
  make the gap explicit, and the eval asserts honest presentation.
