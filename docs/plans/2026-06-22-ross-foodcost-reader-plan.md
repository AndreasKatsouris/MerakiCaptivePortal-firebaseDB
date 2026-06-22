# ROSS Food-Cost Reader (Deliverable 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the askRoss agent a read-only `getFoodCostSummary` tool that reports a location's cost %, trend vs last period, and which items are running low — built on the denormalised summary the food-cost module already persists, with no calculator extraction.

**Architecture:** A pure summariser (`food-cost-summary.js`, data-in/data-out) + a thin, access-checked adapter in the existing agent tool registry (`functions/agent/tools.js`). The adapter reads `locations/{locationId}/stockUsage`, gates the model-supplied `locationId` against the caller's access (mirroring `resolveWorkflowOwner`'s IDOR-safe pattern), and hands the records to the summariser. Flip the tool `pending → READY`; add eval coverage.

**Tech Stack:** Node.js 22, Firebase Functions, Zod, vitest. Tests use the in-memory `makeFakeRtdb` helper — no emulator.

**Spec:** [docs/plans/2026-06-22-ross-foodcost-v2-design.md](./2026-06-22-ross-foodcost-v2-design.md) (Deliverable 1 + §5.1 security gates).

**Ground truth (verified 2026-06-22):**
- Persisted record (`public/js/modules/food-cost/database-operations.js:89-119`): `{ userId, timestamp:<number Date.now()>, selectedLocationId, costPercentage, salesAmount, totalCostOfUsage, totalUsage, openingDate, closingDate, stockItems:[…] }` at `locations/{locationId}/stockUsage/{timestampKey}`.
- Per-item (`data-processor.js:437-475`): `{ itemCode, description, closingQty:<number>, usagePerDay:<number>, reorderPoint:<number>, … }`.
- Access map: `userLocations/{uid}/{locationId} === true` (canonical, used by `resolveWorkflowOwner` `tools.js:69`); `locations/{locationId}/ownerId` is a secondary owner marker.
- Adapter + cross-tenant test pattern: `functions/agent/tools.js:113-152` + `functions/agent/__tests__/tools.test.js:228-256`.

**Run tests from `functions/`:** `cd functions && npx vitest run agent/__tests__/<file>`

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `functions/agent/food-cost-summary.js` | Pure: `summariseFoodCost(records, opts)` → summary object. No I/O. | Create |
| `functions/agent/__tests__/food-cost-summary.test.js` | Unit tests for the summariser | Create |
| `functions/agent/tools.js` | Add `callerHasLocationAccess` helper; replace the `getFoodCostSummary` pending stub with a READY adapter | Modify |
| `functions/agent/__tests__/tools.test.js` | Add adapter + cross-tenant tests; bump the ready-tool integrity expectations 8→9 | Modify |
| `functions/agent/evals/fixtures.js` | Seed `locations/locA/stockUsage` so the eval case has data | Modify |
| `functions/agent/evals/cases.js` | Add a `q-foodcost` grounded case | Modify |
| `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md` + `public/kb/features/ROSS.md` | Document the new tool | Modify |
| `KNOWLEDGE BASE/PROJECT_BACKLOG.md` + `public/data/project-status.json` | Reflect W1 progress | Modify |

---

## Task 1: Pure food-cost summariser

**Files:**
- Create: `functions/agent/food-cost-summary.js`
- Test: `functions/agent/__tests__/food-cost-summary.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
'use strict';
const { summariseFoodCost } = require('../food-cost-summary');

const DAY = 86400000;
const NOW = 1_780_000_000_000;

function rec(over = {}) {
  return {
    timestamp: NOW - DAY, costPercentage: 31, salesAmount: 10000,
    totalCostOfUsage: 3100, totalUsage: 500,
    openingDate: '2026-06-08', closingDate: '2026-06-15',
    stockItems: [], ...over,
  };
}

describe('summariseFoodCost', () => {
  it('reports hasData:false for no records', () => {
    expect(summariseFoodCost([]).hasData).toBe(false);
    expect(summariseFoodCost(null).hasData).toBe(false);
  });

  it('uses the latest record by timestamp for the headline numbers', () => {
    const out = summariseFoodCost([
      rec({ timestamp: NOW - 8 * DAY, costPercentage: 28 }),
      rec({ timestamp: NOW - DAY, costPercentage: 31 }),
    ], { now: NOW });
    expect(out.hasData).toBe(true);
    expect(out.foodCostPct).toBe(31);
    expect(out.previousFoodCostPct).toBe(28);
    expect(out.trend).toBe('up');
    expect(out.dataAgeDays).toBe(1);
  });

  it('trend is null with a single record, flat when equal', () => {
    expect(summariseFoodCost([rec()], { now: NOW }).trend).toBe(null);
    expect(summariseFoodCost([
      rec({ timestamp: NOW - 8 * DAY, costPercentage: 30 }),
      rec({ timestamp: NOW - DAY, costPercentage: 30 }),
    ]).trend).toBe('flat');
  });

  it('flags low-stock items (out-of-stock or below cover threshold), sorted by days-of-cover', () => {
    const out = summariseFoodCost([rec({ stockItems: [
      { itemCode: 'A', description: 'beef',    closingQty: 0,  usagePerDay: 2 },  // out of stock
      { itemCode: 'B', description: 'cheese',  closingQty: 4,  usagePerDay: 2 },  // 2 days cover -> low
      { itemCode: 'C', description: 'oil',     closingQty: 70, usagePerDay: 2 },  // 35 days -> fine
      { itemCode: 'D', description: 'salt',    closingQty: 5,  usagePerDay: 0 },  // no usage -> fine
    ] })], { now: NOW, lowCoverDays: 7 });
    expect(out.itemsAnalysed).toBe(4);
    expect(out.lowStockCount).toBe(2);
    expect(out.lowStockItems.map((i) => i.itemCode)).toEqual(['A', 'B']); // 0 cover before 2-day cover
    expect(out.lowStockItems[1]).toMatchObject({ description: 'cheese', daysOfCover: 2 });
  });

  it('caps lowStockItems at topN but lowStockCount counts all', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ itemCode: `i${i}`, description: `d${i}`, closingQty: 0, usagePerDay: 1 }));
    const out = summariseFoodCost([rec({ stockItems: items })], { now: NOW, topN: 5 });
    expect(out.lowStockCount).toBe(8);
    expect(out.lowStockItems).toHaveLength(5);
  });

  it('coerces missing/string numerics and never throws on a sparse record', () => {
    const out = summariseFoodCost([{ timestamp: NOW - DAY, costPercentage: '34.5', stockItems: undefined }], { now: NOW });
    expect(out.foodCostPct).toBe(34.5);
    expect(out.itemsAnalysed).toBe(0);
    expect(out.lowStockItems).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd functions && npx vitest run agent/__tests__/food-cost-summary.test.js`
Expected: FAIL — `Cannot find module '../food-cost-summary'`.

- [ ] **Step 3: Write the implementation**

```javascript
'use strict';

/**
 * Pure food-cost summariser for the askRoss reader (Deliverable 1).
 *
 * Data-in / data-out — NO Firebase, NO Vue, NO I/O. The adapter
 * (tools.js getFoodCostSummary) reads `locations/{loc}/stockUsage` and passes the
 * record values here. Reads the DENORMALISED summary the food-cost module already
 * persists (database-operations.js:89-119) — deliberately no recompute / calculator
 * (that is Deliverable 2). Low-stock is a light days-of-cover heuristic, not the
 * advanced reorder calculation.
 */

const DAY_MS = 86400000;

function num(v) { return Number(v) || 0; }

/**
 * @param {object[]} records  raw stockUsage records (Object.values of the node)
 * @param {{now?:number, lowCoverDays?:number, topN?:number}} [opts]
 * @returns {object} summary (hasData:false when empty)
 */
function summariseFoodCost(records, opts = {}) {
  const now = num(opts.now);
  const lowCoverDays = opts.lowCoverDays || 7;
  const topN = opts.topN || 5;

  const recs = (records || [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ ...r, ts: num(r.timestamp) }))
    .sort((a, b) => a.ts - b.ts);

  if (!recs.length) return { hasData: false };

  const latest = recs[recs.length - 1];
  const prev = recs.length > 1 ? recs[recs.length - 2] : null;

  const foodCostPct = num(latest.costPercentage);
  const previousFoodCostPct = prev ? num(prev.costPercentage) : null;
  const trend = previousFoodCostPct === null ? null
    : foodCostPct > previousFoodCostPct ? 'up'
      : foodCostPct < previousFoodCostPct ? 'down' : 'flat';

  const items = Array.isArray(latest.stockItems) ? latest.stockItems : [];
  const low = items
    .map((it) => {
      const closingQty = num(it.closingQty);
      const usagePerDay = num(it.usagePerDay);
      const daysOfCover = usagePerDay > 0 ? closingQty / usagePerDay : Infinity;
      return { itemCode: it.itemCode, description: it.description, closingQty, daysOfCover };
    })
    .filter((it) => it.closingQty <= 0 || it.daysOfCover < lowCoverDays)
    .sort((a, b) => a.daysOfCover - b.daysOfCover);

  return {
    hasData: true,
    period: { openingDate: latest.openingDate || null, closingDate: latest.closingDate || null, asOf: latest.ts },
    dataAgeDays: now ? Math.floor((now - latest.ts) / DAY_MS) : null,
    foodCostPct,
    previousFoodCostPct,
    trend,
    salesAmount: num(latest.salesAmount),
    totalCostOfUsage: num(latest.totalCostOfUsage),
    itemsAnalysed: items.length,
    lowStockCount: low.length,
    lowStockItems: low.slice(0, topN).map((it) => ({
      itemCode: it.itemCode,
      description: it.description,
      closingQty: it.closingQty,
      daysOfCover: it.daysOfCover === Infinity ? null : Math.round(it.daysOfCover * 10) / 10,
    })),
  };
}

module.exports = { summariseFoodCost };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd functions && npx vitest run agent/__tests__/food-cost-summary.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/agent/food-cost-summary.js functions/agent/__tests__/food-cost-summary.test.js
git commit -m "feat(agent): pure food-cost summariser for the askRoss reader"
```

---

## Task 2: Access-checked `getFoodCostSummary` adapter (flip pending → READY)

**Files:**
- Modify: `functions/agent/tools.js` (add helper near `resolveWorkflowOwner` ~line 63; replace the `getFoodCostSummary` pending entry ~line 160)
- Modify: `functions/agent/__tests__/tools.test.js` (integrity lists ~line 10-12, 27-28, 33; add adapter tests)

- [ ] **Step 1: Write the failing tests** (append inside `describe('ready adapters (via fake RTDB)', …)` in `tools.test.js`, after the `getRunHistory` cross-tenant tests at line ~256)

```javascript
    // --- getFoodCostSummary (Deliverable 1) -----------------------------------
    // Seed location-scoped stock data + access map. owner1 owns loc1 (userLocations);
    // mgr1 is delegated; attacker1 has no access.
    function seedFoodCost() {
      return makeFakeRtdb({
        userLocations: { owner1: { loc1: true }, mgr1: { loc1: true } },
        locations: { loc1: { ownerId: 'owner1', stockUsage: {
          k1: { timestamp: 1000, costPercentage: 28, salesAmount: 9000, stockItems: [] },
          k2: { timestamp: 2000, costPercentage: 33, salesAmount: 9500, stockItems: [
            { itemCode: 'A', description: 'beef', closingQty: 0, usagePerDay: 2 },
            { itemCode: 'C', description: 'oil', closingQty: 70, usagePerDay: 2 },
          ] } },
        } },
      });
    }

    it('getFoodCostSummary returns the latest summary for an owner', async () => {
      __setDbForTests(seedFoodCost());
      const out = await REGISTRY.getFoodCostSummary.run({ uid: 'owner1', now: 2000 + 86400000 }, { locationId: 'loc1' });
      expect(out.hasData).toBe(true);
      expect(out.foodCostPct).toBe(33);
      expect(out.previousFoodCostPct).toBe(28);
      expect(out.trend).toBe('up');
      expect(out.lowStockItems.map((i) => i.itemCode)).toEqual(['A']);
    });

    it('getFoodCostSummary serves a delegated manager with location access', async () => {
      __setDbForTests(seedFoodCost());
      const out = await REGISTRY.getFoodCostSummary.run({ uid: 'mgr1', now: 2000 }, { locationId: 'loc1' });
      expect(out.hasData).toBe(true);
    });

    // SECURITY (cross-tenant isolation, C-1): a caller without access to the location
    // must NOT read its food cost, even with a valid victim locationId. The agent runs
    // via Admin SDK (rules bypassed) so this code check is the only tenant boundary.
    it('getFoodCostSummary refuses cross-tenant: caller without location access gets hasData:false', async () => {
      __setDbForTests(seedFoodCost());
      const out = await REGISTRY.getFoodCostSummary.run({ uid: 'attacker1', now: 2000 }, { locationId: 'loc1' });
      expect(out).toEqual({ hasData: false }); // MUST NOT leak owner1's 33% / beef
    });

    it('getFoodCostSummary returns hasData:false when a location has never uploaded', async () => {
      __setDbForTests(makeFakeRtdb({ userLocations: { owner1: { loc1: true } }, locations: { loc1: { ownerId: 'owner1' } } }));
      const out = await REGISTRY.getFoodCostSummary.run({ uid: 'owner1', now: 2000 }, { locationId: 'loc1' });
      expect(out).toEqual({ hasData: false });
    });
```

- [ ] **Step 2: Update the registry-integrity expectations** (so the suite is green after the flip). In `tools.test.js`:

Change line ~10:
```javascript
const AUTO_READY = ['getWorkflowDigest', 'getStaff', 'getRunHistory', 'snoozeCard', 'getFoodCostSummary'];
```
Change the test title + expectation at line ~27:
```javascript
    it('exposes the 9 ready tools (5 auto + 4 confirm) to the engine', () => {
        expect(enabledToolNames().sort()).toEqual([...READY].sort());
    });
```
Update the `autoAllowlist` tighten-case at line ~36 (it lists the auto set minus snoozeCard — add the new tool):
```javascript
        expect(autoAllowlist({ policy: { snoozeCard: 'confirm' } }).sort())
            .toEqual(['getFoodCostSummary', 'getRunHistory', 'getStaff', 'getWorkflowDigest']);
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd functions && npx vitest run agent/__tests__/tools.test.js`
Expected: FAIL — `getFoodCostSummary` is still the pending stub (throws `AdapterPendingError`), and `enabledToolNames` returns 8 not 9.

- [ ] **Step 4: Add the access helper** in `tools.js`, immediately after `resolveWorkflowOwner` (after line 75):

```javascript
// Caller→location access check for location-scoped readers (C-1, IDOR-safe).
// The agent runs via the Admin SDK (RTDB rules bypassed), so this is the ONLY tenant
// boundary. `userLocations/{caller}/{loc}` is the canonical access map; the
// `locations/{loc}/ownerId` match is a defensive fallback. Mirrors the human CFs'
// verifyLocationAccess. locationId is model-supplied → treated as attacker-controlled.
async function callerHasLocationAccess(locationId, callerUid) {
    const access = await getDb().ref(`userLocations/${callerUid}/${locationId}`).once('value');
    if (access.exists()) return true;
    const owner = await getDb().ref(`locations/${locationId}/ownerId`).once('value');
    return owner.exists() && owner.val() === callerUid;
}
```

- [ ] **Step 5: Replace the pending stub** in the REGISTRY. Delete the line at ~160:
```javascript
    getFoodCostSummary: pending('Read a food-cost summary for a location.',
        z.object({ locationId: z.string() }), TIER.AUTO, TIER.AUTO),
```
and replace it with the READY adapter:
```javascript
    getFoodCostSummary: {
        description: "Read a food-cost summary for a location — cost %, trend vs the previous period, and which stock items are running low. Read-only.",
        args: z.object({ locationId: z.string() }),
        tier: TIER.AUTO, ceiling: TIER.AUTO, status: STATUS.READY,
        run: async (ctx, args) => {
            // C-1: gate the model-supplied locationId against the caller's access first.
            if (!(await callerHasLocationAccess(args.locationId, ctx.uid))) return { hasData: false };
            const snap = await getDb().ref(`locations/${args.locationId}/stockUsage`).once('value');
            const records = snap.exists() ? Object.values(snap.val()) : [];
            const { summariseFoodCost } = require('./food-cost-summary'); // lazy: keep core import-cheap
            return summariseFoodCost(records, { now: ctx.now });
        },
    },
```

- [ ] **Step 6: Export the helper** (for direct unit-testing parity with `resolveWorkflowOwner`). In the `module.exports` block (~line 305), add `callerHasLocationAccess,` next to `resolveWorkflowOwner,`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd functions && npx vitest run agent/__tests__/tools.test.js`
Expected: PASS (all, including the 4 new food-cost tests and the updated integrity counts).

- [ ] **Step 8: Run the full agent suite for regressions**

Run: `cd functions && npx vitest run agent/`
Expected: PASS — no regression in `execute`/`prompt`/`policy`/`rossChat` (they enumerate ready tools; the new tool is additive and the integrity test now expects 9).

- [ ] **Step 9: Commit**

```bash
git add functions/agent/tools.js functions/agent/__tests__/tools.test.js
git commit -m "feat(agent): READY getFoodCostSummary reader with caller-location access check (C-1)"
```

---

## Task 3: Eval fixture data + a food-cost eval case

**Files:**
- Modify: `functions/agent/evals/fixtures.js` (add `locations` to `baselineFixture` return)
- Modify: `functions/agent/evals/cases.js` (add `q-foodcost`)

- [ ] **Step 1: Add location stock data to the baseline fixture.** In `fixtures.js`, inside the object returned by `baselineFixture()` (after the `subscriptions: {…}` block, ~line 48), add a top-level `locations` key:

```javascript
    // locA food-cost history for the getFoodCostSummary reader (Deliverable 1).
    // Two records so trend is defined; latest shows cost rising + one item out of stock.
    locations: { locA: { ownerId: 'ownerA', stockUsage: {
      fcA1: { timestamp: BASE_2026 - 8 * DAY, costPercentage: 28, salesAmount: 42000, totalCostOfUsage: 11760, stockItems: [] },
      fcA2: { timestamp: BASE_2026 - 1 * DAY, costPercentage: 33, salesAmount: 45000, totalCostOfUsage: 14850, stockItems: [
        { itemCode: '10127', description: 'water sparkling large', closingQty: 0, usagePerDay: 9 },
        { itemCode: '11413', description: 'coffee espresso beans', closingQty: 2, usagePerDay: 2 },
      ] } },
    } } },
```

(`BASE_2026` and `DAY` are already in scope at the top of the file.)

- [ ] **Step 2: Add the eval case.** In `cases.js`, add to the `CASES` array (after the `q-staff-runs` line ~17):

```javascript
  { id: 'q-foodcost', category: 'multitool', prompt: 'How is my food cost at locA, and is anything running low?', seed: base(), expect: { tools: ['getFoodCostSummary'], judge: { grounded: true, honest: true } } },
```

- [ ] **Step 3: Verify the eval machinery still loads (the live run needs an API key; the machinery is unit-tested).**

Run: `cd functions && npx vitest run agent/evals/__tests__/`
Expected: PASS — fixtures/cases/driver tests still green (the new fixture key + case are additive and well-formed).

- [ ] **Step 4: Commit**

```bash
git add functions/agent/evals/fixtures.js functions/agent/evals/cases.js
git commit -m "test(agent): food-cost eval fixture + q-foodcost grounded case"
```

> The live `npm run eval` (real API + judge) is an operator-run smoke step, not part of CI — flag it in the PR as a manual verification the operator runs with the key.

---

## Task 4: Documentation + backlog

**Files:**
- Modify: `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md`, `public/kb/features/ROSS.md`
- Modify: `KNOWLEDGE BASE/PROJECT_BACKLOG.md`, `public/data/project-status.json`

- [ ] **Step 1: Document the tool.** In the askRoss agent-tools section of `CLOUD_FUNCTIONS_CATALOG.md` and `public/kb/features/ROSS.md`, add a row/line: `getFoodCostSummary(locationId)` — read-only, AUTO tier, returns `{hasData, foodCostPct, trend, previousFoodCostPct, salesAmount, itemsAnalysed, lowStockCount, lowStockItems[]}`; access-checked on `locationId`; reads `locations/{locationId}/stockUsage`. Note it reads persisted summaries (no reorder calculation — that is the deferred `suggestedOrder` field).

- [ ] **Step 2: Update the backlog.** In `PROJECT_BACKLOG.md`, mark W1 as started and move the food-cost reader to "In Progress" → on merge, "Recently Completed". Add the new `getFoodCostSummary` to the list of live agent tools (now 5 auto + 4 confirm = 9 ready; food-cost/guests/sales no longer all stubbed — guests/sales remain pending).

- [ ] **Step 3: Mirror into project-status.json** (same commit — the Step-11 lockstep rule). Add the PR to `recentlyCompleted` (on merge), bump `lastUpdated`/`lastUpdatedNote`. Verify:

Run: `node -e "const d=require('./public/data/project-status.json'); console.log('recent PRs', d.recentlyCompleted.map(r=>r.pr), '| bugs', d.bugs.length)"`
Expected: prints without error; the new PR/notes present.

- [ ] **Step 4: Commit**

```bash
git add "KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md" public/kb/features/ROSS.md "KNOWLEDGE BASE/PROJECT_BACKLOG.md" public/data/project-status.json
git commit -m "docs(agent): catalog getFoodCostSummary + W1 backlog/status update"
```

---

## Final verification (before PR)

- [ ] **Full functions test suite:** `cd functions && npx vitest run agent/` → all green.
- [ ] **Build:** `npm run build` (repo root) → passes.
- [ ] **Pre-push self-review** (CLAUDE.md Step 5b): re-read the diff for the C-1 cross-tenant gate (attacker → `{hasData:false}`), confirm the empty-data path, confirm no `suggestedOrder`/calculator crept in, confirm mocks copy the real persisted shape (`database-operations.js:89-119`).
- [ ] **PR:** `git push -u origin <branch>` + `gh pr create` with a test plan; note the operator-run live `npm run eval` as manual verification.

---

## Spec-coverage self-check (run after writing)

- D1 "read-only summary on persisted data, no extraction" → Task 1 + 2. ✓
- C-1 caller-location access check + cross-tenant unit test (hard gate) → Task 2 Steps 1, 4, 5. ✓
- Empty-data path (never-uploaded location) → Task 2 Step 1 (4th test). ✓
- D-2 decision: low/critical-items signal included, `suggestedOrder` excluded → Task 1 (`lowStockItems`), no calculator. ✓
- Location-scoped trend (not global itemCode history) → Task 1 reads only the location's `stockUsage` records. ✓
- Eval coverage → Task 3. ✓
- Catalog + backlog + status lockstep → Task 4. ✓
- NOT in scope (correctly absent): calculator extraction (D2), CSV mapping (D3), ghost-path removal (D4), task-level deep-links (deferred). ✓
