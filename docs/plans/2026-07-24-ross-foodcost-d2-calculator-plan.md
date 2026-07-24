# ROSS-FoodCost-v2 D2 — Implementation Plan (subagent-driven TDD)

**Date:** 2026-07-24
**Spec:** `docs/plans/2026-07-24-ross-foodcost-d2-calculator-design.md` (v3 — all
three adversarial reviews folded; the spec is the contract, this plan is the build
sequence). Section references (§, GT, Q, P, F) point at the spec.
**Branch:** `feature/ross-foodcost-d2-calculator` (this worktree)

## Ground rules (every implementer subagent gets these)

- **CJS only under `functions/`** — `'use strict'`, `require`/`module.exports`. An
  ESM `import`/`export` passes vitest but breaks deployed `require()` (LESSONS
  2026-06-22). The controller verifies actual file bytes at T7.
- **Vitest invocations are root-relative ONLY** (`npx vitest run functions/agent`);
  `cd functions && npx vitest` is broken (setupFiles cwd). `functions/node_modules`
  must exist (`cd functions && npm install`, ~50s) for modules requiring `zod` etc.
- **Do not edit anything under `public/`** (spec non-goal; parent R4). The golden
  generator imports live files read-only.
- **DO-NOT-PORT list (§5.3, security F1):** `HistoricalUsageService`'s store-name
  search strategy, multi-location merge, and cache. `stats.js` NEVER fetches.
- **Ported code carries header comments** citing source `file:line` (R-D2-1) and
  quirk-register tags (`// Q11: preserved — see design §6`) where a quirk lives.
- Tests first (RED), then implementation (GREEN). Each task ends with the full
  agent suite green: `npx vitest run functions/agent`.

## Task sequence (implementers strictly sequential; reviews per tier)

### T1 — Golden lattice + generator (live side)

**Files:**
- `functions/agent/__tests__/fixtures/food-cost-golden-inputs.js` (CJS — consumed by
  both sides; the generator imports it from ESM-land via default interop, which
  vitest handles)
- `functions/agent/__tests__/fixtures/food-cost-golden-generator.test.js`
- `functions/agent/__tests__/fixtures/food-cost-golden.json` (generated + committed)

**Build exactly the §7.1 proven shape:** global `vitest.setup.js` mock is already
active; stub `globalThis.window = { firebaseExports: { rtdb: {}, auth: {}, ref() {}, get() {} } }`
and `globalThis.document = { addEventListener() {}, removeEventListener() {} }`
BEFORE dynamic-importing the three live modules
(`public/js/modules/food-cost/order-calculator.js`, `order-calculator-advanced.js`,
`services/historical-usage-service.js`). `vi.useFakeTimers()` +
`vi.setSystemTime(new Date('2026-07-20T10:00:00+02:00'))` in `beforeAll` (a Monday,
SAST). Do NOT `vi.mock` firebase-helpers.

**Lattice (inputs file, one named scenario each — §7.1):** `noHistory`,
`thinHistory2` (Q2/Q6), `confidence5plus`, `dow22daily` (Friday-spike; asserts
delivery-day sensitivity), `stockout` (closingQty 0 → Q7 escalation),
`missingCost` (`hasMissingUnitCost: true` + an item with NO unitCost field at all —
GT1), `negativeUsage` (Q15), `volatilityOff` (volatility 0 → Q8 else-branch),
`criticalItem` (isCritical → Q1/Q12 divergence visible in golden).

For each scenario the generator runs: `calculateItemStatistics(records, code)` →
`calculateOrderDetails`, `calculateCriticalityScore`, and
`calculateAdvancedOrderDetails(item, stats, params)`; results
`JSON.stringify`-ed into the golden. Dual mode: `process.env.GOLDEN_REGEN` writes
the JSON; otherwise deep-equal asserts live modules still match (live-side parity
rides `npm test`). Header comment: regen requires `TZ=Africa/Johannesburg`
(P8 note): `GOLDEN_REGEN=1 npx vitest run functions/agent/__tests__/fixtures/food-cost-golden-generator.test.js`.

**Acceptance:** golden JSON committed; generator passes in assert mode; a tampered
golden value fails it (spot-prove once, revert).

### T2 — `functions/agent/food-cost/stats.js` (port)

RED: `functions/agent/__tests__/food-cost-stats.test.js` — golden parity for the
stats outputs across the lattice + named characterizations: Q15 (negative usage:
simple-avg includes / TWA excludes / recompute guard doesn't fire), GT9 (object
branch byte-faithful, incl. the sparse-array-coercion miss), GT5 (any-throw →
`_getEmptyStatistics()` shape), malformed `stockItems` (object/string/number/null/
absent → degrades, never throws — F7).

GREEN: port `calculateItemStatistics` (`historical-usage-service.js:179-324`) +
`_calculateMean/_calculateStandardDeviation/_calculateTrend/_calculateDayOfWeekPatterns/_getEmptyStatistics`
(`:526-655`). Deltas: P1 (no console), P2 (`now` param replaces `Date.now()`
fallback at `:266`), P8 (weekday = `new Date(ts + 2*3600e3).getUTCDay()` — applies
to `_calculateDayOfWeekPatterns`'s `getDay()`; date-string parsing for periodDays
stays `new Date(str)` — UTC-parsed ISO dates, deterministic). Everything else
byte-faithful, including the whole-body try/catch.

### T3 — `functions/agent/food-cost/order-calc.js` (port)

RED: `functions/agent/__tests__/food-cost-order-calc.test.js` — golden parity for
all three calc functions across the lattice + named characterizations Q1–Q14
(each one assertion, commented with its § tag; Q11 asserts the literal
concatenated string from the golden).

GREEN: port `calculateOrderDetails` + `calculateCriticalityScore` + local
`formatValue` (`order-calculator.js:159-231,:20-151,:549-560`), and
`calculateTimeWeightedAverage` + `calculateHistoricalConfidence` +
`calculateAdvancedOrderDetails` + its `formatValue`
(`order-calculator-advanced.js:16-39,:47-86,:95-422,:613-626`). Deltas: P1, P2
(`now` param replaces `new Date()` at `:212,216`; delivery-day = P8 weekday of
`now + daysToNextDelivery`), P7 (deep-copy stays — it's behaviour — but no caller
input is mutated), P8. `calculateVolatility` (`order-calculator.js:506-542`) is NOT
ported — nothing in the ported chain calls it (the live consumer is elsewhere).

### T4 — `functions/agent/food-cost/suggest.js` (pure orchestrator)

RED: `functions/agent/__tests__/food-cost-suggest.test.js` — output shape §5.2
exactly; params defaulting per GT7 (record values with `||`-falsy defaulting
0→7/20/30, coveringDays 2, `source` field correct for record/default/caller);
P4 defensive cost-gating (flag OR absent OR non-finite OR ≤0 → both `unitCost` and
`estimatedCost` null, counted in `itemsWithUnknownCost`, excluded from
`estimatedTotalCost`); P5 caps (2,000/record, 10,000 total, caveat emitted);
P6 truncation (120 chars, control chars stripped); supplierFilter substring
semantics (case-insensitive `.includes()`, metacharacters literal — F2/F7);
30-item output cap + `truncated`; sort critical-first then estimatedCost desc
(nulls last); Q16 comment; empty records → `{hasData:false}`.

GREEN: reimplement the orchestration loop (`order-calculator-advanced.js:508-596`
semantics: supplier filter → criticality → advanced-vs-basic branch on
`dataPoints >= 2` → `orderQuantity > 0` inclusion) as a pure function
`suggestOrder(records, opts)`; `opts = { now, daysToNextDelivery?, supplierFilter? }`.
Internally: latest record's items are the current stock; stats from ALL passed
records via `stats.js`; params resolved per GT7.

### T5 — Adapter + registry (`functions/agent/tools.js`)

RED: extend `functions/agent/__tests__/tools.test.js`:
- **update the pinned lists at `:10-12`** — `getSuggestedOrder` joins `AUTO_READY`
  (the registry-integrity + projection tests at `:28,:33,:110,:163` then cover the
  catalog/allowlist automatically);
- C-1 trio (attacker → `{hasData:false}`, owner → served, delegated via
  `userLocations` → served);
- **anti-enumeration deep-equality**: no-access return `toEqual` no-data return;
- Zod bounds: `daysToNextDelivery` 0/31/−1/1.5/"5"/NaN rejected; `supplierFilter`
  >100 chars rejected;
- two-location bleed (F1): shared `itemCode`, B never influences A;
- oversized record (F7): P5 caveat emitted, bounded.

GREEN: add the registry entry per §5.1 — `callerHasLocationAccess` gate →
`orderByKey().limitToLast(30)` on `locations/{locationId}/stockUsage` → lazy
`require('./food-cost/suggest')` → `suggestOrder(records, { now: ctx.now, ...args })`.
Description text per §5.2's model guidance (recommendations from usage history;
null cost = never invent a figure).

### T6 — Eval case (`q-suggest-order`)

Three touches (§7.4, probe-verified): `evals/cases.js` entry (expects
`getSuggestedOrder` called; judge: names the stockout item, does not present the
total as complete when `itemsWithUnknownCost > 0`); enrich `baselineFixture()`
stockUsage records in `evals/fixtures.js` (usage/period fields so the advanced path
fires; keep existing item codes `'10127'` stockout / `'11413'` low); **bump
`CASES.length` pin 22 → 23** in `evals/__tests__/evals-cases.test.js`.

### T7 — Controller verification + reviews

1. Full suite from root: `npx vitest run functions/agent` then the whole
   `npm test`; `npm run build`.
2. **CJS byte-check:** `git diff master --name-only -- functions/ | xargs grep -lE '^(import|export) '`
   must return empty (the ESM-passes-vitest trap).
3. Reviews: T2/T3 get ONE combined spec+quality reviewer each (verbatim ports,
   background); T4/T5 get full two-stage (spec → quality) — they carry the
   judgment surface (orchestration semantics, security gates, pinned-list edits).
   Reviewer briefs include the spec §6 register and the DO-NOT-PORT list; reviewers
   `git show` actual bytes, not just re-run vitest.
4. Pre-push self-review per CLAUDE.md 5b (incl. `npm run status:sync -- --check`).

## Out of scope / notes

- **No deploy in this PR.** The tool goes live at the next `firebase deploy
  --only functions` (operator-gated). PR body carries the deploy note + the
  `functions && npm install` worktree reminder.
- D1's `food-cost-summary.js` is untouched. D1's uncapped `description` output →
  logged to backlog as a P6 backport candidate (security F4), not bundled.
- Backlog/status sync + reflect happen at T7 per Standard Task Workflow step 11.
