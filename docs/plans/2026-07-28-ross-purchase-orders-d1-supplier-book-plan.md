# ROSS Purchase Orders — D1: Supplier Book — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the supplier book — a per-location catalogue of suppliers and their products,
populated either by hand or by a reviewed one-click import from the latest food-cost stock
count — with no purchase order yet.

**Architecture:** Two `onRequest` Cloud Functions (`poCatalog`, `poSeedFromStock`) over a new
top-level `purchasing/{locId}` RTDB node. Pure cores (validation, seed derivation) separated
from db-injected cores, separated from CF shells — the pattern that makes
`functions/agent/**` and `functions/payments/**` unit-testable without an emulator. Client is
a new `?tab=orders` ROSS destination using Hi-Fi components and a Pinia store.

**Tech Stack:** Node 22 CommonJS Cloud Functions v7, Zod 3, `firebase-admin` 12, vitest,
Vue 3 `<script setup>` + Pinia 2.3, Hi-Fi design system (`Hf*` / `--hf-*`).

**Design spec:** `docs/plans/2026-07-28-ross-purchase-orders-design.md` — read §3 (ground
truth), §4 (architecture), §5 (data model + rules) before starting.

---

## Read before writing any code

Six repo-specific traps this slice sits on. Each has bitten a prior PR.

1. **`functions/` is CommonJS.** No `"type": "module"`. An ESM `export` statement **passes
   vitest** (its loader transforms modules) and throws `SyntaxError` at deployed `require()`
   time. Every new file uses `require` / `module.exports`. Task 6 adds a byte-check because
   vitest structurally cannot catch this.
2. **Request body shape diverges across this codebase.** `foodCostOverview` reads
   `req.body` **flat**; `rossGetStaff` (and `people-service.js`) use a `{ data: {...} }`
   envelope. **These CFs use FLAT `req.body`**, matching the newest sibling. The client
   service in Task 8 must therefore **not** wrap in `{ data }`. Getting this wrong produces
   a 400 that looks like a validation bug.
3. **All exports in ONE `module.exports = {}` assignment.** A trailing
   `module.exports = {...}` silently drops anything attached via `exports.name =` above it
   (the #188 export-clobber trap, live in `queueAnalytics.js:343-364`).
4. **`.validate` goes at the LEAF, never on an ancestor.** Whether an ancestor `.validate`
   fires for a deeper write is unresolved in this repo (spec G16) — three sources disagree
   and the settling probe has not been run. Leaf placement is correct either way.
5. **The rules probe must authenticate as a NON-admin.** The global root admin `.write`
   (`database.rules.json:3`) cascades into `purchasing`, so an admin probe returns 200
   through that grant and reads as a false failure.
6. **Two db seams must be set to the same fake in tests.** `callerHasLocationAccess` reads
   through `functions/agent/tools.js`'s own seam, not ours. Tests set both
   (`tools.__setDbForTests` and our `__setDbForTests`) — the established both-seams pattern
   from `tools.test.js`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `functions/purchase-orders/validate.js` | **Pure.** Zod schemas + `sanitizeText` for supplier and product input. No db, no I/O. |
| `functions/purchase-orders/seed.js` | **Pure.** `deriveCatalogFromStock(records)` → suppliers + products + an explicit unassigned bucket. No fetching. |
| `functions/purchase-orders/access.js` | **Thin.** `assertLocationAccess(db, locId, uid)` — reuses `callerHasLocationAccess`, adds the `features.purchaseOrders` entitlement gate. Never a hand-rolled third variant. |
| `functions/purchase-orders/catalog.js` | **db-injected core.** list / save / archive for suppliers and products, cap-enforced. |
| `functions/purchase-orders/index.js` | CF shells: `poCatalog`, `poSeedFromStock`. Validation → auth → core → response. |
| `functions/index.js` | +2 `exports.` lines (shared config — single-owner file). |
| `database.rules.json` | +1 appended top-level `purchasing` block (shared config — single-owner file). |
| `scripts/verify-rules-purchasing.js` | Non-admin post-deploy REST probe, positive checks first. |
| `public/js/modules/ross/v2/orders-service.js` | CF calls. Flat body. No state. |
| `public/js/modules/ross/v2/orders-store.js` | Pinia: supplier book, loading/error, seed preview. |
| `public/js/modules/ross/v2/components/RossOrders.vue` | Tab shell + empty state + seed review. |
| `public/js/modules/ross/v2/components/RossOrdersSupplierList.vue` | Supplier rows, `needs-email` chip, inline delete. |
| `public/js/modules/ross/v2/components/RossOrdersSupplierEditor.vue` | Inline create/edit form. |
| `public/js/modules/ross/v2/components/RossHome.vue` | +`orders` tab registration. |
| `functions/purchase-orders/__tests__/*.test.js` | One suite per server module. |

---

## Task 1: Pure validation core

**Files:**
- Create: `functions/purchase-orders/validate.js`
- Test: `functions/purchase-orders/__tests__/validate.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const { describe, it, expect } = require('vitest');
const {
  sanitizeText, SupplierInput, ProductInput, MAX_SUPPLIERS, MAX_PRODUCTS,
} = require('../validate');

describe('sanitizeText', () => {
  it('strips control characters before truncating', () => {
    expect(sanitizeText('a\x00b\x1Fc')).toBe('abc');
  });
  it('truncates to 200 visible chars', () => {
    expect(sanitizeText('x'.repeat(500))).toHaveLength(200);
  });
  it('coerces null/undefined to empty string', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
  });
});

describe('SupplierInput', () => {
  it('accepts a minimal supplier (name only) — email is optional at D1', () => {
    const out = SupplierInput.parse({ name: 'Peninsula Beverages' });
    expect(out.name).toBe('Peninsula Beverages');
    expect(out.email).toBe('');
  });
  it('trims and strips control chars from the name', () => {
    expect(SupplierInput.parse({ name: '  Bean\x00 There  ' }).name).toBe('Bean There');
  });
  it('rejects an empty name', () => {
    expect(() => SupplierInput.parse({ name: '   ' })).toThrow();
  });
  it('rejects a name over 120 chars', () => {
    expect(() => SupplierInput.parse({ name: 'x'.repeat(121) })).toThrow();
  });
  it('accepts an empty email (the needs-email state)', () => {
    expect(SupplierInput.parse({ name: 'A', email: '' }).email).toBe('');
  });
  it('rejects a malformed email', () => {
    expect(() => SupplierInput.parse({ name: 'A', email: 'not-an-email' })).toThrow();
  });
  it('rejects CR/LF in the name (header-injection precursor)', () => {
    expect(SupplierInput.parse({ name: 'A\r\nBcc: x@y.z' }).name).toBe('ABcc: x@y.z');
  });
  it('bounds deliveryDays to weekday integers', () => {
    expect(SupplierInput.parse({ name: 'A', deliveryDays: [1, 4] }).deliveryDays).toEqual([1, 4]);
    expect(() => SupplierInput.parse({ name: 'A', deliveryDays: [7] })).toThrow();
    expect(() => SupplierInput.parse({ name: 'A', deliveryDays: [1.5] })).toThrow();
  });
  it('rejects a negative minimumOrderValue', () => {
    expect(() => SupplierInput.parse({ name: 'A', minimumOrderValue: -1 })).toThrow();
  });
  it('defaults active to true', () => {
    expect(SupplierInput.parse({ name: 'A' }).active).toBe(true);
  });
});

describe('ProductInput', () => {
  it('accepts a minimal product', () => {
    const out = ProductInput.parse({ description: 'Sparkling water 500ml', unit: 'ea' });
    expect(out.unit).toBe('ea');
    expect(out.lastPrice).toBeNull();
  });
  it('requires description and unit', () => {
    expect(() => ProductInput.parse({ unit: 'ea' })).toThrow();
    expect(() => ProductInput.parse({ description: 'A' })).toThrow();
  });
  it('treats a non-finite or non-positive price as unknown (null)', () => {
    expect(ProductInput.parse({ description: 'A', unit: 'ea', lastPrice: 0 }).lastPrice).toBeNull();
    expect(ProductInput.parse({ description: 'A', unit: 'ea', lastPrice: -5 }).lastPrice).toBeNull();
  });
  it('keeps a valid price', () => {
    expect(ProductInput.parse({ description: 'A', unit: 'ea', lastPrice: 6.5 }).lastPrice).toBe(6.5);
  });
});

describe('caps', () => {
  it('exposes the §5.2 caps', () => {
    expect(MAX_SUPPLIERS).toBe(500);
    expect(MAX_PRODUCTS).toBe(2000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run purchase-orders/__tests__/validate.test.js`
Expected: FAIL — `Cannot find module '../validate'`

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';

/**
 * D1 pure validation core for the ROSS supplier book.
 * Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §5.
 *
 * This is the LOAD-BEARING validation for the feature. The RTDB `.validate`
 * rules are the outer fence only, and they do not constrain our own Cloud
 * Functions at all — the Admin SDK bypasses every rule (design G17).
 *
 * CommonJS: functions/ has no "type":"module". An ESM export here passes vitest
 * and SyntaxErrors at deployed require() time (2026-06-22 LESSON).
 */

const { z } = require('zod');

const MAX_TEXT = 200;      // sanitizeText ceiling
const MAX_SUPPLIERS = 500; // per location   (§5.2)
const MAX_PRODUCTS = 2000; // per supplier   (§5.2)

/**
 * Strip control characters FIRST, then truncate. Same order as
 * functions/agent/food-cost/suggest.js sanitizeText — stripping after
 * truncation would let a control char consume a visible slot.
 * Also removes CR/LF, which is the header-injection precursor for D3's email
 * subject and display name.
 */
function sanitizeText(v) {
  // eslint-disable-next-line no-control-regex
  return String(v == null ? '' : v).replace(/[\x00-\x1F\x7F]/g, '').slice(0, MAX_TEXT);
}

/** Trimmed, control-stripped string with a max visible length. */
function cleanString(max) {
  return z.preprocess((v) => sanitizeText(v).trim(), z.string().max(max));
}

/** Optional free-text field: absent/null/'' all normalise to ''. */
function optionalString(max) {
  return cleanString(max).default('');
}

/**
 * Price gate mirroring suggest.js's P4 cost gate: unknown unless it is a
 * finite number strictly greater than zero. Never store a garbage cost.
 */
const optionalPrice = z.preprocess(
  (v) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  },
  z.number().min(0).max(10000000).nullable(),
).default(null);

const SupplierInput = z.object({
  name: cleanString(120).refine((s) => s.length >= 1, { message: 'name is required' }),
  email: z.preprocess(
    (v) => sanitizeText(v).trim(),
    z.union([z.literal(''), z.string().max(200).email()]),
  ).default(''),
  phone: optionalString(40),
  contactName: optionalString(120),
  accountNumber: optionalString(60),
  deliveryDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  leadTimeDays: z.number().int().min(0).max(60).optional(),
  minimumOrderValue: z.number().min(0).max(10000000).optional(),
  notes: optionalString(1000),
  active: z.boolean().default(true),
});

const ProductInput = z.object({
  description: cleanString(200).refine((s) => s.length >= 1, { message: 'description is required' }),
  unit: cleanString(20).refine((s) => s.length >= 1, { message: 'unit is required' }),
  packSize: optionalString(60),
  itemCode: optionalString(60),
  lastPrice: optionalPrice,
  active: z.boolean().default(true),
});

// ALL exports in ONE assignment — the #188 export-clobber trap.
module.exports = {
  sanitizeText, cleanString, SupplierInput, ProductInput,
  MAX_TEXT, MAX_SUPPLIERS, MAX_PRODUCTS,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run purchase-orders/__tests__/validate.test.js`
Expected: PASS — 18 tests

- [ ] **Step 5: Commit**

```bash
git add functions/purchase-orders/validate.js functions/purchase-orders/__tests__/validate.test.js
git commit -m "feat(purchase-orders): pure validation core for the supplier book"
```

---

## Task 2: Pure seed derivation from stock

**Files:**
- Create: `functions/purchase-orders/seed.js`
- Test: `functions/purchase-orders/__tests__/seed.test.js`

Derives a proposed supplier book from a location's `stockUsage` records. **Pure — it never
fetches.** Records arrive from one access-checked read in the CF shell, exactly as
`functions/agent/food-cost/stats.js` documents for its own do-not-port boundary.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const { describe, it, expect } = require('vitest');
const { deriveCatalogFromStock, MAX_SEED_ITEMS } = require('../seed');

const rec = (ts, stockItems) => ({ timestamp: ts, stockItems });

describe('deriveCatalogFromStock', () => {
  it('returns hasData:false for no records', () => {
    expect(deriveCatalogFromStock([])).toEqual({ hasData: false });
    expect(deriveCatalogFromStock(null)).toEqual({ hasData: false });
  });

  it('returns hasData:false when the latest record has no items', () => {
    expect(deriveCatalogFromStock([rec(2, [])])).toEqual({ hasData: false });
  });

  it('uses the LATEST record as the stock position, not the first (design G9)', () => {
    const out = deriveCatalogFromStock([
      rec(1, [{ description: 'old', unit: 'ea', supplierName: 'Old Co' }]),
      rec(2, [{ description: 'new', unit: 'ea', supplierName: 'New Co' }]),
    ]);
    expect(out.suppliers.map((s) => s.name)).toEqual(['New Co']);
  });

  it('sorts by timestamp — input order must not matter', () => {
    const out = deriveCatalogFromStock([
      rec(9, [{ description: 'newest', unit: 'ea', supplierName: 'Z Co' }]),
      rec(1, [{ description: 'oldest', unit: 'ea', supplierName: 'A Co' }]),
    ]);
    expect(out.suppliers.map((s) => s.name)).toEqual(['Z Co']);
  });

  it('groups items by trimmed supplier name and counts them', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'water', unit: 'ea', supplierName: ' Peninsula ' },
      { description: 'cola', unit: 'ea', supplierName: 'Peninsula' },
      { description: 'beans', unit: 'kg', supplierName: 'Bean There' },
    ])]);
    const byName = Object.fromEntries(out.suppliers.map((s) => [s.name, s.itemCount]));
    expect(byName).toEqual({ 'Bean There': 1, Peninsula: 2 });
  });

  it('sorts suppliers alphabetically', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'a', unit: 'ea', supplierName: 'Zulu' },
      { description: 'b', unit: 'ea', supplierName: 'Alpha' },
    ])]);
    expect(out.suppliers.map((s) => s.name)).toEqual(['Alpha', 'Zulu']);
  });

  it('REPORTS unassigned items in their own bucket — never silently drops them (G10)', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'assigned', unit: 'ea', supplierName: 'Peninsula' },
      { description: 'blank', unit: 'ea', supplierName: '   ' },
      { description: 'missing', unit: 'ea' },
    ])]);
    expect(out.suppliers.map((s) => s.name)).toEqual(['Peninsula']);
    expect(out.unassigned.itemCount).toBe(2);
    expect(out.unassigned.items.map((i) => i.description)).toEqual(['blank', 'missing']);
  });

  it('carries unit, itemCode and a usable lastPrice onto each product', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { itemCode: '10127', description: 'water', unit: 'ea', supplierName: 'P', unitCost: 6.5 },
    ])]);
    expect(out.items[0]).toMatchObject({
      supplierName: 'P', itemCode: '10127', description: 'water', unit: 'ea', lastPrice: 6.5,
    });
  });

  it('treats a flagged, absent, zero or non-finite unitCost as unknown price', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'flagged', unit: 'ea', supplierName: 'P', unitCost: 5, hasMissingUnitCost: true },
      { description: 'absent', unit: 'ea', supplierName: 'P' },
      { description: 'zero', unit: 'ea', supplierName: 'P', unitCost: 0 },
      { description: 'nan', unit: 'ea', supplierName: 'P', unitCost: Number.NaN },
    ])]);
    expect(out.items.map((i) => i.lastPrice)).toEqual([null, null, null, null]);
  });

  it('defaults a missing unit to "ea" rather than failing the row', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'no unit', supplierName: 'P' },
    ])]);
    expect(out.items[0].unit).toBe('ea');
  });

  it('skips rows with no usable description', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: '  ', unit: 'ea', supplierName: 'P' },
      { unit: 'ea', supplierName: 'P' },
      { description: 'real', unit: 'ea', supplierName: 'P' },
    ])]);
    expect(out.items.map((i) => i.description)).toEqual(['real']);
  });

  it('sanitizes control characters out of tenant strings', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'wa\x00ter', unit: 'ea', supplierName: 'P\x1Fenin' },
    ])]);
    expect(out.items[0].description).toBe('water');
    expect(out.suppliers[0].name).toBe('Penin');
  });

  it('caps the number of items processed and reports the truncation', () => {
    const many = Array.from({ length: MAX_SEED_ITEMS + 10 }, (_, i) => (
      { description: `item ${i}`, unit: 'ea', supplierName: 'P' }
    ));
    const out = deriveCatalogFromStock([rec(1, many)]);
    expect(out.items).toHaveLength(MAX_SEED_ITEMS);
    expect(out.truncated).toBe(true);
  });

  it('does not set truncated when under the cap', () => {
    expect(deriveCatalogFromStock([rec(1, [
      { description: 'a', unit: 'ea', supplierName: 'P' },
    ])]).truncated).toBe(false);
  });

  it('tolerates a non-array stockItems shape (GT9) as empty', () => {
    expect(deriveCatalogFromStock([rec(1, { a: { description: 'x' } })])).toEqual({ hasData: false });
  });

  it('reports the source record date so the UI can label the import', () => {
    const out = deriveCatalogFromStock([rec(1717200000000, [
      { description: 'a', unit: 'ea', supplierName: 'P' },
    ])]);
    expect(out.sourceTimestamp).toBe(1717200000000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run purchase-orders/__tests__/seed.test.js`
Expected: FAIL — `Cannot find module '../seed'`

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';

/**
 * D1 pure seed derivation: one location's stockUsage records -> a PROPOSED
 * supplier book for the owner to review.
 *
 * Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §4.3, §8.2.
 *
 * PURE — never fetches. Records arrive from exactly one access-checked read in
 * the CF shell (same boundary functions/agent/food-cost/stats.js documents).
 *
 * Two behaviours that are requirements, not conveniences:
 *  - The LATEST record is the stock position (design G9). Records are sorted by
 *    `timestamp`; caller order is irrelevant.
 *  - Items with no supplier are REPORTED in their own bucket, never dropped
 *    (design G10 / §8.2). suggestOrder's supplierFilter silently excludes them,
 *    which is the behaviour this bucket exists to make visible.
 */

const { sanitizeText } = require('./validate');

const MAX_SEED_ITEMS = 2000; // matches suggest.js MAX_ITEMS_PER_RECORD (P5)

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** suggest.js P4 cost gate: unknown unless flagged-clean, finite and > 0. */
function priceOf(item) {
  const raw = item.unitCost;
  const ok = item.hasMissingUnitCost !== true
    && typeof raw === 'number' && Number.isFinite(raw) && raw > 0;
  return ok ? raw : null;
}

/**
 * @param {object[]} records raw stockUsage records (Object.values of the node)
 * @returns {{hasData:false}|{
 *   hasData:true, sourceTimestamp:number, truncated:boolean,
 *   suppliers:{name:string,itemCount:number}[],
 *   items:{supplierName:string,description:string,unit:string,itemCode:string,lastPrice:number|null}[],
 *   unassigned:{itemCount:number,items:object[]}
 * }}
 */
function deriveCatalogFromStock(records) {
  const recs = (records || [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ ...r, ts: num(r.timestamp) }))
    .sort((a, b) => a.ts - b.ts);
  if (!recs.length) return { hasData: false };

  const latest = recs[recs.length - 1];
  const raw = Array.isArray(latest.stockItems) ? latest.stockItems : [];
  const truncated = raw.length > MAX_SEED_ITEMS;
  const slice = truncated ? raw.slice(0, MAX_SEED_ITEMS) : raw;
  if (!slice.length) return { hasData: false };

  const items = [];
  const unassignedItems = [];
  const counts = new Map();

  for (const it of slice) {
    if (!it || typeof it !== 'object') continue;
    const description = sanitizeText(it.description).trim();
    if (!description) continue; // a row with no name is not a product

    const product = {
      supplierName: sanitizeText(it.supplierName).trim(),
      description,
      unit: sanitizeText(it.unit).trim() || 'ea',
      itemCode: sanitizeText(it.itemCode).trim(),
      lastPrice: priceOf(it),
    };

    if (!product.supplierName) {
      unassignedItems.push(product);
      continue;
    }
    items.push(product);
    counts.set(product.supplierName, (counts.get(product.supplierName) || 0) + 1);
  }

  if (!items.length && !unassignedItems.length) return { hasData: false };

  const suppliers = [...counts.entries()]
    .map(([name, itemCount]) => ({ name, itemCount }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    hasData: true,
    sourceTimestamp: latest.ts,
    truncated,
    suppliers,
    items,
    unassigned: { itemCount: unassignedItems.length, items: unassignedItems },
  };
}

module.exports = { deriveCatalogFromStock, MAX_SEED_ITEMS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run purchase-orders/__tests__/seed.test.js`
Expected: PASS — 16 tests

> One test intentionally documents a live quirk rather than fixing it: the
> non-array `stockItems` case returns `hasData:false`. `stats.js` handles the
> object shape with a keyed lookup, but every live save path writes arrays
> (GT9), and inventing a second shape-tolerance here would diverge from
> `suggest.js:124`, which does exactly the same thing.

- [ ] **Step 5: Commit**

```bash
git add functions/purchase-orders/seed.js functions/purchase-orders/__tests__/seed.test.js
git commit -m "feat(purchase-orders): derive a proposed supplier book from a stock count"
```

---

## Task 3: Access + entitlement gate

**Files:**
- Create: `functions/purchase-orders/access.js`
- Test: `functions/purchase-orders/__tests__/access.test.js`

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const { describe, it, expect, beforeEach, vi } = require('vitest');
const tools = require('../../agent/tools');
const { assertLocationAccess } = require('../access');

function fakeDb(store) {
  return {
    ref: (path) => ({
      once: async () => {
        const val = path.split('/').reduce((n, k) => (n == null ? undefined : n[k]), store);
        return { exists: () => val !== undefined && val !== null, val: () => val };
      },
    }),
  };
}

describe('assertLocationAccess', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('denies when the caller has no access to the location', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(false);
    const db = fakeDb({ subscriptions: { u1: { features: { purchaseOrders: true } } } });
    await expect(assertLocationAccess(db, 'loc1', 'u1')).resolves.toBe(false);
  });

  it('denies an entitled-but-unauthorised caller — access is checked FIRST', async () => {
    const spy = vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(false);
    const db = fakeDb({ subscriptions: { u1: { features: { purchaseOrders: true } } } });
    await assertLocationAccess(db, 'loc1', 'u1');
    expect(spy).toHaveBeenCalledWith('loc1', 'u1');
  });

  it('denies when the caller lacks the purchaseOrders feature', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(true);
    const db = fakeDb({ subscriptions: { u1: { features: { foodCost: true } } } });
    await expect(assertLocationAccess(db, 'loc1', 'u1')).resolves.toBe(false);
  });

  it('denies when the caller has no features node at all', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(true);
    await expect(assertLocationAccess(fakeDb({}), 'loc1', 'u1')).resolves.toBe(false);
  });

  it('allows an entitled caller with access', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(true);
    const db = fakeDb({ subscriptions: { u1: { features: { purchaseOrders: true } } } });
    await expect(assertLocationAccess(db, 'loc1', 'u1')).resolves.toBe(true);
  });

  it('bypasses the entitlement check for an admin, but NOT the access check', async () => {
    vi.spyOn(tools, 'callerHasLocationAccess').mockResolvedValue(true);
    const db = fakeDb({ admins: { a1: true } });
    await expect(assertLocationAccess(db, 'loc1', 'a1')).resolves.toBe(true);

    tools.callerHasLocationAccess.mockResolvedValue(false);
    await expect(assertLocationAccess(db, 'loc1', 'a1')).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run purchase-orders/__tests__/access.test.js`
Expected: FAIL — `Cannot find module '../access'`

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';

/**
 * D1 access gate. Two checks, in this order:
 *   1. location access — REUSED from agent/tools (design F3: never a third
 *      hand-rolled variant of this predicate);
 *   2. the `purchaseOrders` entitlement, admins-first, mirroring
 *      food-cost-overview.js:118-124 and ross.js:104-120.
 *
 * Access precedes entitlement deliberately: an unauthorised caller must not be
 * able to distinguish "not yours" from "not on your plan".
 *
 * Callers treat `false` as the anti-enumeration outcome — return a bare
 * {hasData:false} rather than a distinguishing error (design §7.1 / the agent
 * tools' convention).
 */

const tools = require('../agent/tools');

async function assertLocationAccess(db, locationId, uid) {
  // Property access (not destructured at require time) so vi.spyOn in tests
  // intercepts the call — a destructured binding would capture the original.
  if (!(await tools.callerHasLocationAccess(locationId, uid))) return false;

  const adminSnap = await db.ref(`admins/${uid}`).once('value');
  if (adminSnap.exists()) return true;

  const featSnap = await db.ref(`subscriptions/${uid}/features`).once('value');
  const features = featSnap.val();
  return !!features && features.purchaseOrders === true;
}

module.exports = { assertLocationAccess };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run purchase-orders/__tests__/access.test.js`
Expected: PASS — 6 tests

> The `require('../agent/tools')` + property-access call is deliberate and
> load-bearing for the test seam. Destructuring `{ callerHasLocationAccess }` at
> module load captures the original function, so `vi.spyOn(tools, …)` would not
> intercept it and every test would hit the real db.

- [ ] **Step 5: Commit**

```bash
git add functions/purchase-orders/access.js functions/purchase-orders/__tests__/access.test.js
git commit -m "feat(purchase-orders): reuse location access + gate on purchaseOrders entitlement"
```

---

## Task 4: db-injected catalogue core

**Files:**
- Create: `functions/purchase-orders/catalog.js`
- Test: `functions/purchase-orders/__tests__/catalog.test.js`

Uses the in-memory RTDB fake. **Copy `functions/payments/__tests__/fake-rtdb.js`**, not the
billing one — the payments version implements transaction abort. D1 does not use
transactions, but D3's send claim does, and copying the correct fake now avoids a subtly
broken guard later (spec §7.2).

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const { describe, it, expect, beforeEach } = require('vitest');
const makeFake = require('../../payments/__tests__/fake-rtdb');
const {
  listSuppliers, saveSupplier, archiveSupplier, saveProduct, listProducts,
} = require('../catalog');

const LOC = 'loc1';
const UID = 'u1';
let db;
beforeEach(() => { db = makeFake(); });

describe('saveSupplier', () => {
  it('creates a supplier, returning a generated id', async () => {
    const out = await saveSupplier(db, LOC, UID, { name: 'Peninsula' }, 1000);
    expect(out.supplierId).toBeTruthy();
    const stored = await db.ref(`purchasing/${LOC}/suppliers/${out.supplierId}`).once('value');
    expect(stored.val()).toMatchObject({
      name: 'Peninsula', email: '', active: true, createdBy: UID, createdAt: 1000,
    });
  });

  it('writes under purchasing/{locId}, NOT under locations/ (design G14)', async () => {
    const out = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    const wrong = await db.ref(`locations/${LOC}/suppliers/${out.supplierId}`).once('value');
    expect(wrong.exists()).toBe(false);
  });

  it('updates an existing supplier without clobbering createdAt/createdBy', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    await saveSupplier(db, LOC, 'u2', { name: 'A renamed', email: 'a@b.co' }, 2000, supplierId);
    const v = (await db.ref(`purchasing/${LOC}/suppliers/${supplierId}`).once('value')).val();
    expect(v).toMatchObject({
      name: 'A renamed', email: 'a@b.co', createdAt: 1000, createdBy: UID, updatedAt: 2000,
    });
  });

  it('rejects an update to a supplier that does not exist', async () => {
    await expect(saveSupplier(db, LOC, UID, { name: 'A' }, 1000, 'nope'))
      .rejects.toThrow(/not found/i);
  });

  it('rejects invalid input at the schema boundary', async () => {
    await expect(saveSupplier(db, LOC, UID, { name: '' }, 1000)).rejects.toThrow();
    await expect(saveSupplier(db, LOC, UID, { name: 'A', email: 'bad' }, 1000)).rejects.toThrow();
  });

  it('enforces the per-location supplier cap on CREATE only', async () => {
    const { MAX_SUPPLIERS } = require('../validate');
    const seed = {};
    for (let i = 0; i < MAX_SUPPLIERS; i++) seed[`s${i}`] = { name: `S${i}`, active: true };
    await db.ref(`purchasing/${LOC}/suppliers`).set(seed);

    await expect(saveSupplier(db, LOC, UID, { name: 'one too many' }, 1000))
      .rejects.toThrow(/limit/i);
    // an UPDATE at the cap must still succeed
    await expect(saveSupplier(db, LOC, UID, { name: 'S0 renamed' }, 1000, 's0'))
      .resolves.toMatchObject({ supplierId: 's0' });
  });

  it('rejects a key-unsafe supplierId rather than interpolating it into a path', async () => {
    await expect(saveSupplier(db, LOC, UID, { name: 'A' }, 1000, '../../evil'))
      .rejects.toThrow(/key-safe/i);
  });
});

describe('listSuppliers', () => {
  it('returns [] for a location with no book', async () => {
    expect(await listSuppliers(db, LOC)).toEqual([]);
  });

  it('returns suppliers sorted by name with their ids', async () => {
    await saveSupplier(db, LOC, UID, { name: 'Zulu' }, 1000);
    await saveSupplier(db, LOC, UID, { name: 'Alpha' }, 1000);
    expect((await listSuppliers(db, LOC)).map((s) => s.name)).toEqual(['Alpha', 'Zulu']);
    expect((await listSuppliers(db, LOC))[0].supplierId).toBeTruthy();
  });

  it('excludes archived suppliers by default and includes them on request', async () => {
    const a = await saveSupplier(db, LOC, UID, { name: 'Gone' }, 1000);
    await saveSupplier(db, LOC, UID, { name: 'Here' }, 1000);
    await archiveSupplier(db, LOC, a.supplierId, 2000);
    expect((await listSuppliers(db, LOC)).map((s) => s.name)).toEqual(['Here']);
    expect((await listSuppliers(db, LOC, { includeArchived: true })).map((s) => s.name))
      .toEqual(['Gone', 'Here']);
  });

  it('flags a supplier with no email as needsEmail — the D1 export-only state', async () => {
    await saveSupplier(db, LOC, UID, { name: 'No mail' }, 1000);
    await saveSupplier(db, LOC, UID, { name: 'Has mail', email: 'a@b.co' }, 1000);
    const byName = Object.fromEntries((await listSuppliers(db, LOC)).map((s) => [s.name, s.needsEmail]));
    expect(byName).toEqual({ 'Has mail': false, 'No mail': true });
  });
});

describe('archiveSupplier', () => {
  it('soft-deletes by setting active:false — never removes the record', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    await archiveSupplier(db, LOC, supplierId, 2000);
    const v = (await db.ref(`purchasing/${LOC}/suppliers/${supplierId}`).once('value')).val();
    expect(v).toMatchObject({ name: 'A', active: false, updatedAt: 2000 });
  });

  it('rejects archiving a supplier that does not exist', async () => {
    await expect(archiveSupplier(db, LOC, 'nope', 2000)).rejects.toThrow(/not found/i);
  });
});

describe('products', () => {
  it('stores a product under catalog/{supplierId}/{productId}', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    const out = await saveProduct(db, LOC, supplierId, { description: 'water', unit: 'ea' }, 1000);
    const v = (await db.ref(`purchasing/${LOC}/catalog/${supplierId}/${out.productId}`).once('value')).val();
    expect(v).toMatchObject({ description: 'water', unit: 'ea', active: true, lastPrice: null });
  });

  it('stamps lastPriceAt when a price is supplied', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    const out = await saveProduct(db, LOC, supplierId, { description: 'w', unit: 'ea', lastPrice: 6.5 }, 4242);
    const v = (await db.ref(`purchasing/${LOC}/catalog/${supplierId}/${out.productId}`).once('value')).val();
    expect(v).toMatchObject({ lastPrice: 6.5, lastPriceAt: 4242 });
  });

  it('refuses to add a product to a supplier that does not exist', async () => {
    await expect(saveProduct(db, LOC, 'nope', { description: 'w', unit: 'ea' }, 1000))
      .rejects.toThrow(/not found/i);
  });

  it('enforces the per-supplier product cap', async () => {
    const { MAX_PRODUCTS } = require('../validate');
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    const seed = {};
    for (let i = 0; i < MAX_PRODUCTS; i++) seed[`p${i}`] = { description: `P${i}`, unit: 'ea', active: true };
    await db.ref(`purchasing/${LOC}/catalog/${supplierId}`).set(seed);
    await expect(saveProduct(db, LOC, supplierId, { description: 'over', unit: 'ea' }, 1000))
      .rejects.toThrow(/limit/i);
  });

  it('lists a supplier\'s active products sorted by description', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    await saveProduct(db, LOC, supplierId, { description: 'zebra', unit: 'ea' }, 1000);
    await saveProduct(db, LOC, supplierId, { description: 'apple', unit: 'ea' }, 1000);
    expect((await listProducts(db, LOC, supplierId)).map((p) => p.description))
      .toEqual(['apple', 'zebra']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run purchase-orders/__tests__/catalog.test.js`
Expected: FAIL — `Cannot find module '../catalog'`

> If it instead fails on `Cannot find module '../../payments/__tests__/fake-rtdb'`,
> the fake is not extractable as a module in that repo location. Extract it to
> `functions/purchase-orders/__tests__/fake-rtdb.js` by copying the **payments**
> implementation verbatim, keeping its header note about the abort semantics, and
> point the require at the local copy.

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';

/**
 * D1 db-injected catalogue core: suppliers + their products.
 * Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §5.
 *
 * Storage is the new TOP-LEVEL node `purchasing/{locId}`, deliberately NOT
 * `locations/{locId}/…`: that parent cascades a world-readable `.read` and an
 * owner `.write` into every descendant (design G14), which would both leak
 * supplier data cross-tenant and make CF-mediated writes unenforceable.
 *
 * Deletes are SOFT (active:false). A supplier referenced by a sent PO must stay
 * resolvable forever, and D3 snapshots supplier fields onto the PO precisely so
 * history survives later edits.
 */

const { SupplierInput, ProductInput, MAX_SUPPLIERS, MAX_PRODUCTS } = require('./validate');

const KEY_SAFE = /^[A-Za-z0-9_-]+$/;

function assertKeySafe(label, key) {
  if (typeof key !== 'string' || !KEY_SAFE.test(key)) {
    throw new Error(`${label} must be a key-safe string ([A-Za-z0-9_-])`);
  }
}

function suppliersRef(db, locId) { return db.ref(`purchasing/${locId}/suppliers`); }
function catalogRef(db, locId, supplierId) { return db.ref(`purchasing/${locId}/catalog/${supplierId}`); }

async function countChildren(ref) {
  const snap = await ref.once('value');
  return snap.exists() ? Object.keys(snap.val()).length : 0;
}

/** @returns {Promise<{supplierId:string}>} */
async function saveSupplier(db, locId, uid, input, now, supplierId) {
  const data = SupplierInput.parse(input);

  let existing = null;
  if (supplierId !== undefined) {
    assertKeySafe('supplierId', supplierId);
    const snap = await suppliersRef(db, locId).child(supplierId).once('value');
    if (!snap.exists()) throw new Error('Supplier not found');
    existing = snap.val();
  } else if (await countChildren(suppliersRef(db, locId)) >= MAX_SUPPLIERS) {
    // Cap CREATE only — an update at the cap must remain possible, otherwise a
    // full book becomes uneditable.
    throw new Error(`Supplier limit reached (${MAX_SUPPLIERS} per location)`);
  }

  const id = supplierId !== undefined ? supplierId : suppliersRef(db, locId).push().key;
  const record = {
    ...data,
    createdAt: existing ? existing.createdAt : now,
    createdBy: existing ? existing.createdBy : uid,
    updatedAt: now,
  };
  await suppliersRef(db, locId).child(id).set(record);
  return { supplierId: id };
}

async function archiveSupplier(db, locId, supplierId, now) {
  assertKeySafe('supplierId', supplierId);
  const ref = suppliersRef(db, locId).child(supplierId);
  const snap = await ref.once('value');
  if (!snap.exists()) throw new Error('Supplier not found');
  await ref.set({ ...snap.val(), active: false, updatedAt: now });
  return { supplierId, active: false };
}

async function listSuppliers(db, locId, { includeArchived = false } = {}) {
  const snap = await suppliersRef(db, locId).once('value');
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([supplierId, v]) => ({
      supplierId,
      ...v,
      // Surfaces the seeded/export-only state explicitly. A supplier with no
      // email can be exported but not emailed (design §3 R3) — the UI must show
      // that rather than let it fail at send time in D3.
      needsEmail: !v.email,
    }))
    .filter((s) => (includeArchived ? true : s.active !== false))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

async function saveProduct(db, locId, supplierId, input, now, productId) {
  assertKeySafe('supplierId', supplierId);
  const supplier = await suppliersRef(db, locId).child(supplierId).once('value');
  if (!supplier.exists()) throw new Error('Supplier not found');

  const data = ProductInput.parse(input);
  const ref = catalogRef(db, locId, supplierId);

  if (productId !== undefined) {
    assertKeySafe('productId', productId);
    const snap = await ref.child(productId).once('value');
    if (!snap.exists()) throw new Error('Product not found');
  } else if (await countChildren(ref) >= MAX_PRODUCTS) {
    throw new Error(`Product limit reached (${MAX_PRODUCTS} per supplier)`);
  }

  const id = productId !== undefined ? productId : ref.push().key;
  const record = { ...data, updatedAt: now };
  if (data.lastPrice !== null) record.lastPriceAt = now;
  await ref.child(id).set(record);
  return { productId: id };
}

async function listProducts(db, locId, supplierId, { includeArchived = false } = {}) {
  assertKeySafe('supplierId', supplierId);
  const snap = await catalogRef(db, locId, supplierId).once('value');
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([productId, v]) => ({ productId, ...v }))
    .filter((p) => (includeArchived ? true : p.active !== false))
    .sort((a, b) => String(a.description || '').localeCompare(String(b.description || '')));
}

module.exports = {
  saveSupplier, archiveSupplier, listSuppliers, saveProduct, listProducts,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run purchase-orders/__tests__/catalog.test.js`
Expected: PASS — 17 tests

- [ ] **Step 5: Commit**

```bash
git add functions/purchase-orders/catalog.js functions/purchase-orders/__tests__/
git commit -m "feat(purchase-orders): catalogue core — suppliers + products under purchasing/{locId}"
```

---

## Task 5: CF shells — `poCatalog` and `poSeedFromStock`

**Files:**
- Create: `functions/purchase-orders/index.js`
- Test: `functions/purchase-orders/__tests__/handlers.test.js`

Copies the envelope of `functions/food-cost-overview.js:216-269` exactly: validation before
auth (malformed input never costs a token verification), normalised 401/403 strings with the
real reason logged server-side, `maxInstances` to bound an unmetered endpoint, and bare
`{ hasData: false }` for every access/entitlement/no-data outcome so they are
indistinguishable.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const { describe, it, expect, beforeEach, vi } = require('vitest');
const mod = require('../index');
const access = require('../access');
const makeFake = require('../../payments/__tests__/fake-rtdb');

function res() {
  const r = { statusCode: 200, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const req = (body, method = 'POST') => ({ method, body, headers: {} });

let db;
beforeEach(() => {
  vi.restoreAllMocks();
  db = makeFake();
  mod.__setDbForTests(db);
  mod.__setVerifyAuthForTests(async () => ({ uid: 'u1' }));
});

describe('handleCatalogRequest — envelope', () => {
  it('rejects a non-POST method with 405', async () => {
    const r = res();
    await mod.handleCatalogRequest(req({}, 'GET'), r);
    expect(r.statusCode).toBe(405);
  });

  it('400s a missing or key-unsafe locationId BEFORE auth runs', async () => {
    const verify = vi.fn();
    mod.__setVerifyAuthForTests(verify);
    const r = res();
    await mod.handleCatalogRequest(req({ action: 'listSuppliers', locationId: '../evil' }), r);
    expect(r.statusCode).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it('400s an unknown action', async () => {
    const r = res();
    await mod.handleCatalogRequest(req({ action: 'dropTables', locationId: 'loc1' }), r);
    expect(r.statusCode).toBe(400);
  });

  it('reads req.body FLAT — a {data:{}} envelope is a 400, not a silent pass', async () => {
    const r = res();
    await mod.handleCatalogRequest(req({ data: { action: 'listSuppliers', locationId: 'loc1' } }), r);
    expect(r.statusCode).toBe(400);
  });

  it('401s on an auth error and never leaks the underlying message', async () => {
    mod.__setVerifyAuthForTests(async () => { throw new Error('Missing authorization header'); });
    const r = res();
    await mod.handleCatalogRequest(req({ action: 'listSuppliers', locationId: 'loc1' }), r);
    expect(r.statusCode).toBe(401);
    expect(JSON.stringify(r.body)).not.toMatch(/authorization header/i);
  });

  it('returns a bare {hasData:false} when access is denied — anti-enumeration', async () => {
    vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(false);
    const r = res();
    await mod.handleCatalogRequest(req({ action: 'listSuppliers', locationId: 'loc1' }), r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ hasData: false });
  });

  it('500s without leaking tenant data when the core throws', async () => {
    vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(true);
    const r = res();
    await mod.handleCatalogRequest(
      req({ action: 'saveSupplier', locationId: 'loc1', supplier: { name: '' } }), r,
    );
    expect(r.statusCode).toBe(400);
    expect(JSON.stringify(r.body)).not.toMatch(/loc1/);
  });
});

describe('handleCatalogRequest — actions', () => {
  beforeEach(() => vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(true));

  it('listSuppliers returns hasData:true with an empty list', async () => {
    const r = res();
    await mod.handleCatalogRequest(req({ action: 'listSuppliers', locationId: 'loc1' }), r);
    expect(r.body).toEqual({ hasData: true, suppliers: [] });
  });

  it('saveSupplier then listSuppliers round-trips', async () => {
    let r = res();
    await mod.handleCatalogRequest(
      req({ action: 'saveSupplier', locationId: 'loc1', supplier: { name: 'Peninsula' } }), r,
    );
    expect(r.body.supplierId).toBeTruthy();

    r = res();
    await mod.handleCatalogRequest(req({ action: 'listSuppliers', locationId: 'loc1' }), r);
    expect(r.body.suppliers).toHaveLength(1);
    expect(r.body.suppliers[0]).toMatchObject({ name: 'Peninsula', needsEmail: true });
  });
});

describe('handleSeedRequest', () => {
  beforeEach(() => vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(true));

  it('preview returns hasData:false when the location has no stock counts', async () => {
    const r = res();
    await mod.handleSeedRequest(req({ action: 'preview', locationId: 'loc1' }), r);
    expect(r.body).toEqual({ hasData: false });
  });

  it('preview derives suppliers from the latest count and does NOT write', async () => {
    await db.ref('locations/loc1/stockUsage/r1').set({
      timestamp: 1000,
      stockItems: [{ description: 'water', unit: 'ea', supplierName: 'Peninsula', unitCost: 6.5 }],
    });
    const r = res();
    await mod.handleSeedRequest(req({ action: 'preview', locationId: 'loc1' }), r);
    expect(r.body.suppliers).toEqual([{ name: 'Peninsula', itemCount: 1 }]);
    const after = await db.ref('purchasing/loc1/suppliers').once('value');
    expect(after.exists()).toBe(false);
  });

  it('commit writes ONLY the supplier names the caller ticked', async () => {
    await db.ref('locations/loc1/stockUsage/r1').set({
      timestamp: 1000,
      stockItems: [
        { description: 'water', unit: 'ea', supplierName: 'Peninsula', unitCost: 6.5 },
        { description: 'beans', unit: 'kg', supplierName: 'Bean There' },
      ],
    });
    const r = res();
    await mod.handleSeedRequest(
      req({ action: 'commit', locationId: 'loc1', supplierNames: ['Peninsula'] }), r,
    );
    expect(r.body.suppliersCreated).toBe(1);
    expect(r.body.productsCreated).toBe(1);
    const stored = (await db.ref('purchasing/loc1/suppliers').once('value')).val();
    expect(Object.values(stored).map((s) => s.name)).toEqual(['Peninsula']);
  });

  it('commit is idempotent on supplier NAME — a second run creates no duplicates', async () => {
    await db.ref('locations/loc1/stockUsage/r1').set({
      timestamp: 1000,
      stockItems: [{ description: 'water', unit: 'ea', supplierName: 'Peninsula' }],
    });
    const body = { action: 'commit', locationId: 'loc1', supplierNames: ['Peninsula'] };
    await mod.handleSeedRequest(req(body), res());
    const r = res();
    await mod.handleSeedRequest(req(body), r);
    expect(r.body.suppliersCreated).toBe(0);
    const stored = (await db.ref('purchasing/loc1/suppliers').once('value')).val();
    expect(Object.keys(stored)).toHaveLength(1);
  });

  it('commit ignores a supplier name that was not in the derived preview', async () => {
    await db.ref('locations/loc1/stockUsage/r1').set({
      timestamp: 1000,
      stockItems: [{ description: 'water', unit: 'ea', supplierName: 'Peninsula' }],
    });
    const r = res();
    await mod.handleSeedRequest(
      req({ action: 'commit', locationId: 'loc1', supplierNames: ['Injected Co'] }), r,
    );
    expect(r.body.suppliersCreated).toBe(0);
  });

  it('400s a supplierNames list that is not an array of strings', async () => {
    const r = res();
    await mod.handleSeedRequest(
      req({ action: 'commit', locationId: 'loc1', supplierNames: 'Peninsula' }), r,
    );
    expect(r.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run purchase-orders/__tests__/handlers.test.js`
Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 3: Write minimal implementation**

```js
'use strict';

/**
 * D1 CF shells for the ROSS supplier book.
 * Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §4.4.
 *
 * Envelope copied from functions/food-cost-overview.js:216-269:
 *  - validation BEFORE auth (malformed input never costs a token verify)
 *  - normalised 401/403 strings, real reason logged server-side
 *  - maxInstances bounds an unmetered endpoint
 *  - access / entitlement / no-data all return a bare {hasData:false}, so they
 *    are indistinguishable (anti-enumeration)
 *
 * BODY SHAPE: this reads `req.body` FLAT, matching food-cost-overview. It does
 * NOT use the `{data:{...}}` envelope that rossGetStaff and people-service.js
 * use. The two shapes coexist in this codebase and mixing them yields a 400 that
 * looks like a validation bug (2026-06-04 LESSON).
 */

const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { corsOptions } = require('../cors-allowlist');
const cors = require('cors')(corsOptions);

const access = require('./access');
const catalog = require('./catalog');
const { deriveCatalogFromStock } = require('./seed');
const { SupplierInput, ProductInput } = require('./validate');

const LOCATION_ID_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_RECORDS = 30;          // same bounded read as foodCostOverview
const MAX_SEED_NAMES = 500;      // matches MAX_SUPPLIERS
const DENIED = { hasData: false };

const CATALOG_ACTIONS = new Set([
  'listSuppliers', 'saveSupplier', 'archiveSupplier', 'listProducts', 'saveProduct',
]);

// --- seams (both match food-cost-overview) ------------------------------------
let _db = null;
function getDb() {
  if (!_db) _db = admin.database();
  return _db;
}
function __setDbForTests(fake) { _db = fake; }

let _verifyAuth = null;
function getVerifyAuth() {
  if (!_verifyAuth) _verifyAuth = require('../ross').verifyAuthToken;
  return _verifyAuth;
}
function __setVerifyAuthForTests(fake) { _verifyAuth = fake; }

/** Shared 401/403 handling. Returns the decoded token, or null once it has responded. */
async function authenticate(req, res, tag) {
  try {
    return await getVerifyAuth()(req);
  } catch (err) {
    const isAuthErr = /authorization|token/i.test(err.message || '');
    console.warn(`[${tag}] auth rejected:`, err && err.message);
    res.status(isAuthErr ? 401 : 403).json({
      error: isAuthErr ? 'Authentication failed' : 'Access denied',
    });
    return null;
  }
}

function readLocationId(body) {
  const locationId = body && body.locationId;
  return typeof locationId === 'string' && LOCATION_ID_RE.test(locationId) ? locationId : null;
}

async function handleCatalogRequest(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body || {};
  const locationId = readLocationId(body);
  if (!locationId) {
    res.status(400).json({ error: 'locationId must be a key-safe string ([A-Za-z0-9_-])' });
    return;
  }
  if (!CATALOG_ACTIONS.has(body.action)) {
    res.status(400).json({ error: 'Unknown action' });
    return;
  }

  const decoded = await authenticate(req, res, 'poCatalog');
  if (!decoded) return;

  const db = getDb();
  if (!(await access.assertLocationAccess(db, locationId, decoded.uid))) {
    res.json(DENIED);
    return;
  }

  const now = Date.now();
  try {
    switch (body.action) {
      case 'listSuppliers':
        res.json({ hasData: true, suppliers: await catalog.listSuppliers(db, locationId) });
        return;
      case 'saveSupplier': {
        SupplierInput.parse(body.supplier); // surface a 400 before touching the db
        const out = await catalog.saveSupplier(
          db, locationId, decoded.uid, body.supplier, now, body.supplierId,
        );
        res.json({ hasData: true, ...out });
        return;
      }
      case 'archiveSupplier':
        res.json({ hasData: true, ...await catalog.archiveSupplier(db, locationId, body.supplierId, now) });
        return;
      case 'listProducts':
        res.json({
          hasData: true,
          products: await catalog.listProducts(db, locationId, body.supplierId),
        });
        return;
      case 'saveProduct': {
        ProductInput.parse(body.product);
        const out = await catalog.saveProduct(
          db, locationId, body.supplierId, body.product, now, body.productId,
        );
        res.json({ hasData: true, ...out });
        return;
      }
      default:
        res.status(400).json({ error: 'Unknown action' });
        return;
    }
  } catch (err) {
    // Client errors (validation, not-found, caps) are 400 with a safe message;
    // anything else is a 500 with nothing tenant-shaped in it.
    const msg = String((err && err.message) || '');
    const isClient = /required|not found|limit reached|key-safe|invalid|expected|must be/i.test(msg);
    if (isClient) {
      console.warn('[poCatalog] rejected:', msg);
      res.status(400).json({ error: 'The supplier or product details were not accepted' });
      return;
    }
    console.error('[poCatalog] failed:', msg);
    res.status(500).json({ error: 'Failed to update the supplier book' });
  }
}

async function handleSeedRequest(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body || {};
  const locationId = readLocationId(body);
  if (!locationId) {
    res.status(400).json({ error: 'locationId must be a key-safe string ([A-Za-z0-9_-])' });
    return;
  }
  if (body.action !== 'preview' && body.action !== 'commit') {
    res.status(400).json({ error: 'action must be "preview" or "commit"' });
    return;
  }
  let names = null;
  if (body.action === 'commit') {
    names = body.supplierNames;
    if (!Array.isArray(names) || names.length > MAX_SEED_NAMES
        || !names.every((n) => typeof n === 'string')) {
      res.status(400).json({ error: 'supplierNames must be an array of at most 500 strings' });
      return;
    }
  }

  const decoded = await authenticate(req, res, 'poSeedFromStock');
  if (!decoded) return;

  const db = getDb();
  if (!(await access.assertLocationAccess(db, locationId, decoded.uid))) {
    res.json(DENIED);
    return;
  }

  try {
    const snap = await db.ref(`locations/${locationId}/stockUsage`)
      .orderByKey().limitToLast(MAX_RECORDS).once('value');
    const records = snap.exists() ? Object.values(snap.val()) : [];
    const derived = deriveCatalogFromStock(records);
    if (!derived.hasData) { res.json(DENIED); return; }

    if (body.action === 'preview') { res.json(derived); return; }

    // COMMIT. Only names present in the DERIVED set are honoured — a name the
    // client invents is ignored rather than trusted (the tool-arg-is-attacker-
    // controlled rule, 2026-06-05 LESSON).
    const derivedNames = new Set(derived.suppliers.map((s) => s.name));
    const wanted = names.filter((n) => derivedNames.has(n));

    // Idempotent on NAME: re-running the import must not duplicate the book.
    const existing = await catalog.listSuppliers(db, locationId, { includeArchived: true });
    const existingByName = new Map(existing.map((s) => [s.name, s.supplierId]));

    const now = Date.now();
    let suppliersCreated = 0;
    let productsCreated = 0;

    for (const name of wanted) {
      let supplierId = existingByName.get(name);
      if (!supplierId) {
        ({ supplierId } = await catalog.saveSupplier(db, locationId, decoded.uid, { name }, now));
        suppliersCreated++;
      }
      for (const item of derived.items.filter((i) => i.supplierName === name)) {
        await catalog.saveProduct(db, locationId, supplierId, {
          description: item.description,
          unit: item.unit,
          itemCode: item.itemCode,
          lastPrice: item.lastPrice === null ? undefined : item.lastPrice,
        }, now);
        productsCreated++;
      }
    }

    res.json({ hasData: true, suppliersCreated, productsCreated });
  } catch (err) {
    console.error('[poSeedFromStock] failed:', err && err.message);
    res.status(500).json({ error: 'Failed to import the supplier book' });
  }
}

const poCatalog = onRequest(
  { maxInstances: 5 },
  (req, res) => cors(req, res, () => handleCatalogRequest(req, res)),
);
const poSeedFromStock = onRequest(
  { maxInstances: 3 },
  (req, res) => cors(req, res, () => handleSeedRequest(req, res)),
);

module.exports = {
  poCatalog, poSeedFromStock,
  handleCatalogRequest, handleSeedRequest,
  __setDbForTests, __setVerifyAuthForTests,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && npx vitest run purchase-orders/__tests__/handlers.test.js`
Expected: PASS — 15 tests

> **Known limitation to record, not fix:** `commit` writes suppliers and products
> with sequential `set()` calls rather than one atomic multi-path `update()`. A
> crash mid-import leaves a partial book. That is acceptable here **because the
> import is idempotent on supplier name** — re-running completes it. Do not
> "improve" this into a single atomic update without re-checking the
> `MAX_PRODUCTS` cap logic, which reads counts between writes.

- [ ] **Step 5: Commit**

```bash
git add functions/purchase-orders/index.js functions/purchase-orders/__tests__/handlers.test.js
git commit -m "feat(purchase-orders): poCatalog + poSeedFromStock CF shells"
```

---

## Task 6: Wire exports + CJS byte-check guard

**Files:**
- Modify: `functions/index.js` (append near `exports.foodCostOverview`, line ~3759)
- Create: `functions/purchase-orders/__tests__/cjs-dialect.test.js`

`functions/index.js` is a **single-owner shared config file** (CLAUDE.md). Check for a
competing open PR before editing.

- [ ] **Step 1: Write the failing guard test**

This guard exists because vitest **cannot** catch the defect it guards: its loader
transforms ESM, so an `export` statement passes every test and throws `SyntaxError` at
deployed `require()` time (2026-06-22 LESSON).

```js
'use strict';
const { describe, it, expect } = require('vitest');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(path.join(dir, e.name));
    return e.name.endsWith('.js') ? [path.join(dir, e.name)] : [];
  });
}

describe('functions/purchase-orders is CommonJS', () => {
  const files = sourceFiles(DIR);

  it('finds the module files', () => expect(files.length).toBeGreaterThanOrEqual(5));

  it.each(files)('%s uses no ESM import/export statements', (file) => {
    const src = fs.readFileSync(file, 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/^\s*export\s/m);
  });

  it.each(files)('%s is require()-able as CommonJS', (file) => {
    expect(() => require(file)).not.toThrow();
  });

  it.each(files)('%s assigns module.exports exactly once (#188 clobber trap)', (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const assignments = (src.match(/^\s*module\.exports\s*=/gm) || []).length;
    expect(assignments).toBeLessThanOrEqual(1);
    if (assignments === 1) expect(src).not.toMatch(/^\s*exports\.\w+\s*=/m);
  });
});

describe('functions/index.js registers both CFs', () => {
  it('exports poCatalog and poSeedFromStock', () => {
    const src = fs.readFileSync(path.join(DIR, '..', 'index.js'), 'utf8');
    expect(src).toMatch(/exports\.poCatalog\s*=/);
    expect(src).toMatch(/exports\.poSeedFromStock\s*=/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && npx vitest run purchase-orders/__tests__/cjs-dialect.test.js`
Expected: FAIL on the last block — `functions/index.js` has no `exports.poCatalog` yet.

- [ ] **Step 3: Add the two export lines**

In `functions/index.js`, immediately after the existing `exports.foodCostOverview` line:

```js
// ROSS Purchase Orders D1 — supplier book (design docs/plans/2026-07-28-ross-purchase-orders-design.md)
exports.poCatalog = require('./purchase-orders').poCatalog;
exports.poSeedFromStock = require('./purchase-orders').poSeedFromStock;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd functions && npx vitest run purchase-orders/`
Expected: PASS — all suites, ~76 tests

- [ ] **Step 5: Commit**

```bash
git add functions/index.js functions/purchase-orders/__tests__/cjs-dialect.test.js
git commit -m "feat(purchase-orders): register poCatalog + poSeedFromStock; guard CJS dialect"
```

---

## Task 7: RTDB rules block + non-admin verification probe

**Files:**
- Modify: `database.rules.json` (append one top-level `purchasing` block)
- Create: `scripts/verify-rules-purchasing.js`

`database.rules.json` is a **single-owner shared config file**. The security session's #205
has merged, but its next item (`receipts` root `.write`, Critical) will touch this file —
**check `gh pr list` for an open PR against it before editing, and rebase rather than
resolve semantically.**

- [ ] **Step 1: Append the rules block**

Insert after the `foodCostMappings` block. Every `.validate` is at a **LEAF** — spec G16:
whether an ancestor `.validate` reaches a deeper write is unresolved in this repo, and leaf
placement is correct under either answer.

```jsonc
"purchasing": {
  "$locId": {
    ".read": "auth != null && (auth.token.admin === true || root.child('userLocations').child(auth.uid).child($locId).exists() || root.child('locations').child($locId).child('ownerId').val() === auth.uid)",
    ".write": false,
    "suppliers": {
      "$supplierId": {
        ".validate": "newData.hasChildren(['name', 'active', 'createdAt'])",
        "name": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 120" },
        "email": { ".validate": "newData.isString() && newData.val().length <= 200" },
        "phone": { ".validate": "newData.isString() && newData.val().length <= 40" },
        "contactName": { ".validate": "newData.isString() && newData.val().length <= 120" },
        "accountNumber": { ".validate": "newData.isString() && newData.val().length <= 60" },
        "notes": { ".validate": "newData.isString() && newData.val().length <= 1000" },
        "leadTimeDays": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 60" },
        "minimumOrderValue": { ".validate": "newData.isNumber() && newData.val() >= 0" },
        "deliveryDays": { "$i": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 6" } },
        "active": { ".validate": "newData.isBoolean()" },
        "createdAt": { ".validate": "newData.isNumber()" },
        "createdBy": { ".validate": "newData.isString() && newData.val().length <= 128" },
        "updatedAt": { ".validate": "newData.isNumber()" },
        "$other": { ".validate": false }
      }
    },
    "catalog": {
      "$supplierId": {
        "$productId": {
          ".validate": "newData.hasChildren(['description', 'unit'])",
          "description": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 200" },
          "unit": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 20" },
          "packSize": { ".validate": "newData.isString() && newData.val().length <= 60" },
          "itemCode": { ".validate": "newData.isString() && newData.val().length <= 60" },
          "lastPrice": { ".validate": "newData.isNumber() && newData.val() >= 0" },
          "lastPriceAt": { ".validate": "newData.isNumber()" },
          "active": { ".validate": "newData.isBoolean()" },
          "updatedAt": { ".validate": "newData.isNumber()" },
          "$other": { ".validate": false }
        }
      }
    },
    "orders": {
      "$poId": {
        ".validate": "newData.hasChildren(['status', 'supplierId'])"
      }
    },
    "counters": {
      "purchaseOrder": { ".validate": "newData.isNumber() && newData.val() >= 0" }
    }
  }
},
```

> `orders` and `counters` are stubbed with a minimal `.validate` in D1 so the node's shape is
> reserved and the block is not restructured mid-slice. D3 fills in the full PO schema. No D1
> code writes to either path.

- [ ] **Step 2: Validate the JSON parses and the key is unique**

```bash
node -e "const r=require('./database.rules.json');const k=Object.keys(r.rules);console.log('purchasing present:',!!r.rules.purchasing,'| dupes:',k.length!==new Set(k).size)"
```
Expected: `purchasing present: true | dupes: false`

- [ ] **Step 3: Write the non-admin probe**

Modelled on `scripts/verify-rules-foodcost-mappings.js`. **Positive checks first** — a
denial-only probe passes trivially against an over-tight rules file, which is the trap that
hid the `locations`/`ownerId` bug for ~7 weeks.

```js
#!/usr/bin/env node
'use strict';

/**
 * Post-deploy verification probe for the D1 `purchasing` rules node
 * (docs/plans/2026-07-28-ross-purchase-orders-design.md §5.1).
 *
 * WHY THIS EXISTS: the RTDB emulator needs Java (unavailable here) and
 * @firebase/rules-unit-testing is not a dependency, so the rules are proven
 * empirically over REST post-deploy.
 *
 * THE TOKEN MUST BE NON-ADMIN. The global root admin `.write`
 * (database.rules.json:3) cascades into `purchasing` and cannot be revoked from
 * below, so an admin token returns 200 on every write check and the probe would
 * report a false failure (the D4 lesson).
 *
 * WHAT THIS NODE CLAIMS, precisely:
 *  - non-admin WRITES are denied at every depth (all writes are CF-mediated;
 *    Cloud Functions use the Admin SDK and bypass rules entirely);
 *  - READS are allowed only to admins, `userLocations` members, and the
 *    location owner — and the read grant CASCADES to children by design.
 * It does NOT claim the node is closed to admins. It is not.
 *
 * The `.validate` rules are NOT exercisable by a non-admin here, because the
 * write is denied before validation runs. They constrain only a human admin
 * using the client SDK (design G17); the load-bearing schema check is the CF's
 * Zod boundary.
 *
 * USAGE (post-deploy only):
 *   USER_ID_TOKEN=<non-admin id token> OWNED_LOCATION_ID=<a location that user owns or is a member of> \
 *     node scripts/verify-rules-purchasing.js
 *   Optionally FOREIGN_LOCATION_ID=<a location that user must NOT see>
 *
 * Exits 0 only if every check matches its expectation.
 */

const DB = process.env.RTDB_URL
  || 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com';
const USER = process.env.USER_ID_TOKEN || '';
const OWNED = process.env.OWNED_LOCATION_ID || '';
const FOREIGN = process.env.FOREIGN_LOCATION_ID || '';

const PROBE_ID = `probe_${'ab'.repeat(8)}`;

async function attempt(method, path, token, body) {
  const url = `${DB}/${path}.json${token ? `?auth=${encodeURIComponent(token)}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
}

function verdict(status, expect) {
  const allowed = status >= 200 && status < 300;
  const denied = status === 401 || status === 403;
  if (expect === 'allow') return allowed ? 'PASS' : 'FAIL';
  return denied ? 'PASS' : 'FAIL';
}

(async () => {
  if (!USER || !OWNED) {
    console.error('Set USER_ID_TOKEN (a NON-admin user) and OWNED_LOCATION_ID.');
    process.exit(2);
  }

  // Preflight: a stale token makes every deny-check a false PASS.
  const pre = await attempt('GET', 'scanningData', USER);
  if (pre === 401 || pre === 403) {
    console.error('PREFLIGHT FAILED — token cannot read an auth-gated node (expired?). Aborting.');
    process.exit(3);
  }

  const supplier = {
    name: 'Probe Supplier', email: '', active: true,
    createdAt: Date.now(), createdBy: 'probe', updatedAt: Date.now(),
  };

  const checks = [
    // POSITIVE FIRST — these are what an over-tight rule would break silently.
    { name: 'POSITIVE: own-location suppliers node READS (the fails-closed check)',
      expect: 'allow', run: () => attempt('GET', `purchasing/${OWNED}/suppliers`, USER) },
    { name: 'POSITIVE: own-location catalog node READS (read cascades to children)',
      expect: 'allow', run: () => attempt('GET', `purchasing/${OWNED}/catalog`, USER) },
    { name: 'POSITIVE: own-location orders node READS',
      expect: 'allow', run: () => attempt('GET', `purchasing/${OWNED}/orders`, USER) },

    // The write claim: denied at every depth for a non-admin.
    { name: 'non-admin write to own-location supplier DENIED (CF-mediated only)',
      expect: 'deny', run: () => attempt('PUT', `purchasing/${OWNED}/suppliers/${PROBE_ID}`, USER, supplier) },
    { name: 'non-admin DEEP-PATH write (supplier field) DENIED',
      expect: 'deny', run: () => attempt('PUT', `purchasing/${OWNED}/suppliers/${PROBE_ID}/name`, USER, 'x') },
    { name: 'non-admin write to catalog DENIED',
      expect: 'deny', run: () => attempt('PUT', `purchasing/${OWNED}/catalog/${PROBE_ID}/p1`, USER, { description: 'x', unit: 'ea' }) },
    { name: 'non-admin write to counters DENIED',
      expect: 'deny', run: () => attempt('PUT', `purchasing/${OWNED}/counters/purchaseOrder`, USER, 99) },
    { name: 'non-admin DELETE of own-location suppliers DENIED',
      expect: 'deny', run: () => attempt('DELETE', `purchasing/${OWNED}/suppliers`, USER) },

    // No cross-location read, and no query across the whole node.
    { name: 'unauthenticated read DENIED',
      expect: 'deny', run: () => attempt('GET', `purchasing/${OWNED}/suppliers`, '') },
    { name: 'read of the purchasing ROOT DENIED (no root .read → no cross-location query)',
      expect: 'deny', run: () => attempt('GET', 'purchasing', USER) },
  ];

  if (FOREIGN) {
    checks.push({
      name: "another location's suppliers read DENIED",
      expect: 'deny',
      run: () => attempt('GET', `purchasing/${FOREIGN}/suppliers`, USER),
    });
  } else {
    console.log('  NOTE: FOREIGN_LOCATION_ID unset — the cross-tenant READ check was SKIPPED.');
  }

  console.log(`Probing ${DB}`);
  console.log(`  owned location: ${OWNED}\n`);

  let failed = 0;
  for (const c of checks) {
    let status;
    try {
      status = await c.run();
    } catch (err) {
      console.log(`  ERROR ${c.name} — ${err.code || err.name || 'request failed'}`);
      failed++;
      continue;
    }
    const v = verdict(status, c.expect);
    if (v === 'FAIL') failed++;
    console.log(`  ${v}  ${c.name}  [expected ${c.expect}, HTTP ${status}]`);
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) {
    console.log('If a POSITIVE check failed: the rules are not deployed yet OR the .read is over-tight — do not ship the UI on top until it passes.');
    console.log('If a DENY check returned 200: confirm the token is NON-admin before concluding the rules are open.');
  }
  process.exit(failed === 0 ? 0 : 1);
})();
```

- [ ] **Step 4: Verify the probe runs and refuses to run half-configured**

```bash
node scripts/verify-rules-purchasing.js
```
Expected: exit 2 with `Set USER_ID_TOKEN (a NON-admin user) and OWNED_LOCATION_ID.`
(A real run is post-deploy and operator-gated.)

- [ ] **Step 5: Commit**

```bash
git add database.rules.json scripts/verify-rules-purchasing.js
git commit -m "feat(purchase-orders): purchasing rules block (leaf .validate) + non-admin probe"
```

---

## Task 8: Client service

**Files:**
- Create: `public/js/modules/ross/v2/orders-service.js`

- [ ] **Step 1: Write the implementation**

Mirrors `people-service.js` **except for the body shape** — `poCatalog` / `poSeedFromStock`
read `req.body` flat, so there is **no `{ data }` wrapper**. This divergence is the whole
reason the file has its own `callFunction`.

```js
// Purchase-order service — the supplier book (D1).
// Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §4.2.
//
// BODY SHAPE WARNING: poCatalog / poSeedFromStock read `req.body` FLAT, matching
// foodCostOverview. people-service.js in this same folder wraps its payload in
// `{ data }` for the rossGetStaff family. Do NOT copy that wrapper here — both
// shapes are live in this codebase and mixing them yields a 400 that reads like
// a validation bug (2026-06-04 LESSON).
//
// Server returns a bare { hasData: false } for no-access / not-entitled / no-data
// alike (anti-enumeration). Callers must not try to distinguish them.

import { auth } from '../../../config/firebase-config.js'

const FUNCTIONS_BASE_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net'

async function callFunction(functionName, payload) {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  const idToken = await user.getIdToken()
  const res = await fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload), // FLAT — no { data } envelope
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${functionName} failed (${res.status}): ${text}`)
  }
  return res.json()
}

export async function listSuppliers(locationId) {
  const out = await callFunction('poCatalog', { action: 'listSuppliers', locationId })
  return Array.isArray(out?.suppliers) ? out.suppliers : []
}

export async function saveSupplier({ locationId, supplierId, supplier }) {
  return callFunction('poCatalog', { action: 'saveSupplier', locationId, supplierId, supplier })
}

export async function archiveSupplier({ locationId, supplierId }) {
  return callFunction('poCatalog', { action: 'archiveSupplier', locationId, supplierId })
}

export async function listProducts({ locationId, supplierId }) {
  const out = await callFunction('poCatalog', { action: 'listProducts', locationId, supplierId })
  return Array.isArray(out?.products) ? out.products : []
}

export async function saveProduct({ locationId, supplierId, productId, product }) {
  return callFunction('poCatalog', { action: 'saveProduct', locationId, supplierId, productId, product })
}

/** Derive a proposed book from the latest stock count. Does NOT write. */
export async function previewSeed(locationId) {
  return callFunction('poSeedFromStock', { action: 'preview', locationId })
}

/** Import only the ticked supplier names. Idempotent on name. */
export async function commitSeed({ locationId, supplierNames }) {
  return callFunction('poSeedFromStock', { action: 'commit', locationId, supplierNames })
}
```

- [ ] **Step 2: Verify the build still passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add public/js/modules/ross/v2/orders-service.js
git commit -m "feat(purchase-orders): client service for the supplier book"
```

---

## Task 9: Pinia store

**Files:**
- Create: `public/js/modules/ross/v2/orders-store.js`
- Test: `tests/unit/ross-orders-store.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../public/js/modules/ross/v2/orders-service.js', () => ({
  listSuppliers: vi.fn(),
  saveSupplier: vi.fn(),
  archiveSupplier: vi.fn(),
  listProducts: vi.fn(),
  saveProduct: vi.fn(),
  previewSeed: vi.fn(),
  commitSeed: vi.fn(),
}))

const service = await import('../../public/js/modules/ross/v2/orders-service.js')
const { useOrdersStore } = await import('../../public/js/modules/ross/v2/orders-store.js')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('useOrdersStore.loadSuppliers', () => {
  it('populates suppliers and clears loading', async () => {
    service.listSuppliers.mockResolvedValue([{ supplierId: 's1', name: 'A', needsEmail: false }])
    const store = useOrdersStore()
    await store.loadSuppliers('loc1')
    expect(store.suppliers).toHaveLength(1)
    expect(store.loading).toBe(false)
    expect(store.error).toBe('')
  })

  it('surfaces an error without leaving loading stuck on', async () => {
    service.listSuppliers.mockRejectedValue(new Error('boom'))
    const store = useOrdersStore()
    await store.loadSuppliers('loc1')
    expect(store.error).toBeTruthy()
    expect(store.loading).toBe(false)
    expect(store.suppliers).toEqual([])
  })

  it('ignores a stale response when a newer load has started (race guard)', async () => {
    let resolveFirst
    service.listSuppliers
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockResolvedValueOnce([{ supplierId: 's2', name: 'Second' }])

    const store = useOrdersStore()
    const first = store.loadSuppliers('loc1')
    await store.loadSuppliers('loc2')
    resolveFirst([{ supplierId: 's1', name: 'First' }])
    await first

    expect(store.suppliers.map((s) => s.name)).toEqual(['Second'])
  })

  it('requires a locationId', async () => {
    const store = useOrdersStore()
    await store.loadSuppliers('')
    expect(service.listSuppliers).not.toHaveBeenCalled()
    expect(store.error).toBeTruthy()
  })
})

describe('needsEmailCount', () => {
  it('counts suppliers with no email — the export-only state', async () => {
    service.listSuppliers.mockResolvedValue([
      { supplierId: 's1', name: 'A', needsEmail: true },
      { supplierId: 's2', name: 'B', needsEmail: true },
      { supplierId: 's3', name: 'C', needsEmail: false },
    ])
    const store = useOrdersStore()
    await store.loadSuppliers('loc1')
    expect(store.needsEmailCount).toBe(2)
  })
})

describe('saveSupplier', () => {
  it('reloads the book after a successful save', async () => {
    service.saveSupplier.mockResolvedValue({ supplierId: 's1' })
    service.listSuppliers.mockResolvedValue([{ supplierId: 's1', name: 'A' }])
    const store = useOrdersStore()
    await store.saveSupplier({ locationId: 'loc1', supplier: { name: 'A' } })
    expect(service.listSuppliers).toHaveBeenCalledWith('loc1')
    expect(store.suppliers).toHaveLength(1)
  })

  it('returns false and sets error on failure, leaving the book untouched', async () => {
    service.saveSupplier.mockRejectedValue(new Error('nope'))
    const store = useOrdersStore()
    const ok = await store.saveSupplier({ locationId: 'loc1', supplier: { name: 'A' } })
    expect(ok).toBe(false)
    expect(store.error).toBeTruthy()
    expect(service.listSuppliers).not.toHaveBeenCalled()
  })
})

describe('seed flow', () => {
  it('stores a preview without writing anything', async () => {
    service.previewSeed.mockResolvedValue({
      hasData: true, sourceTimestamp: 1000, truncated: false,
      suppliers: [{ name: 'P', itemCount: 2 }], items: [],
      unassigned: { itemCount: 3, items: [] },
    })
    const store = useOrdersStore()
    await store.loadSeedPreview('loc1')
    expect(store.seedPreview.suppliers).toHaveLength(1)
    expect(store.seedPreview.unassigned.itemCount).toBe(3)
    expect(service.commitSeed).not.toHaveBeenCalled()
  })

  it('records hasData:false as "no stock counts", not as an error', async () => {
    service.previewSeed.mockResolvedValue({ hasData: false })
    const store = useOrdersStore()
    await store.loadSeedPreview('loc1')
    expect(store.seedPreview).toBeNull()
    expect(store.error).toBe('')
    expect(store.seedUnavailable).toBe(true)
  })

  it('commits only ticked names and reloads the book', async () => {
    service.commitSeed.mockResolvedValue({ hasData: true, suppliersCreated: 1, productsCreated: 2 })
    service.listSuppliers.mockResolvedValue([{ supplierId: 's1', name: 'P' }])
    const store = useOrdersStore()
    const out = await store.commitSeed({ locationId: 'loc1', supplierNames: ['P'] })
    expect(service.commitSeed).toHaveBeenCalledWith({ locationId: 'loc1', supplierNames: ['P'] })
    expect(out.suppliersCreated).toBe(1)
    expect(store.suppliers).toHaveLength(1)
    expect(store.seedPreview).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ross-orders-store.test.js`
Expected: FAIL — cannot resolve `orders-store.js`

- [ ] **Step 3: Write minimal implementation**

```js
// Pinia store for the ROSS supplier book (D1).
//
// Race guard: every async load stamps a monotonically increasing request id and
// discards its own result if a newer load has started. Without it, switching
// location twice quickly can leave the first response overwriting the second
// (the pattern D3's stores adopted after the same bug).

import { defineStore } from 'pinia'
import * as service from './orders-service.js'

export const useOrdersStore = defineStore('rossOrders', {
  state: () => ({
    suppliers: [],
    loading: false,
    error: '',
    seedPreview: null,
    seedUnavailable: false,
    _seq: 0,
  }),

  getters: {
    // Suppliers that can be exported but not emailed until an address is added.
    needsEmailCount: (s) => s.suppliers.filter((x) => x.needsEmail).length,
    hasSuppliers: (s) => s.suppliers.length > 0,
  },

  actions: {
    async loadSuppliers(locationId) {
      if (!locationId) { this.error = 'No location selected.'; return }
      const seq = ++this._seq
      this.loading = true
      this.error = ''
      try {
        const suppliers = await service.listSuppliers(locationId)
        if (seq !== this._seq) return // a newer load won
        this.suppliers = suppliers
      } catch (err) {
        if (seq !== this._seq) return
        this.error = 'Could not load your suppliers. Please try again.'
        console.error('[orders-store] loadSuppliers failed:', err && err.message)
      } finally {
        if (seq === this._seq) this.loading = false
      }
    },

    async saveSupplier({ locationId, supplierId, supplier }) {
      this.error = ''
      try {
        await service.saveSupplier({ locationId, supplierId, supplier })
      } catch (err) {
        this.error = 'Could not save that supplier. Check the details and try again.'
        console.error('[orders-store] saveSupplier failed:', err && err.message)
        return false
      }
      await this.loadSuppliers(locationId)
      return true
    },

    async archiveSupplier({ locationId, supplierId }) {
      this.error = ''
      try {
        await service.archiveSupplier({ locationId, supplierId })
      } catch (err) {
        this.error = 'Could not remove that supplier.'
        console.error('[orders-store] archiveSupplier failed:', err && err.message)
        return false
      }
      await this.loadSuppliers(locationId)
      return true
    },

    async loadSeedPreview(locationId) {
      this.error = ''
      this.seedUnavailable = false
      this.seedPreview = null
      try {
        const out = await service.previewSeed(locationId)
        // hasData:false covers no-access / not-entitled / no-stock-counts alike
        // (anti-enumeration). To the owner it means "nothing to import".
        if (!out || out.hasData !== true) { this.seedUnavailable = true; return }
        this.seedPreview = out
      } catch (err) {
        this.error = 'Could not read your latest stock count.'
        console.error('[orders-store] loadSeedPreview failed:', err && err.message)
      }
    },

    async commitSeed({ locationId, supplierNames }) {
      this.error = ''
      let out
      try {
        out = await service.commitSeed({ locationId, supplierNames })
      } catch (err) {
        this.error = 'Could not import those suppliers.'
        console.error('[orders-store] commitSeed failed:', err && err.message)
        return null
      }
      this.seedPreview = null
      await this.loadSuppliers(locationId)
      return out
    },
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ross-orders-store.test.js`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/ross/v2/orders-store.js tests/unit/ross-orders-store.test.js
git commit -m "feat(purchase-orders): Pinia store for the supplier book, with race guard"
```

---

## Task 10: Supplier list + inline editor components

**Files:**
- Create: `public/js/modules/ross/v2/components/RossOrdersSupplierList.vue`
- Create: `public/js/modules/ross/v2/components/RossOrdersSupplierEditor.vue`

**Follow `RossPeople.vue` exactly for structure and styling** — it is the established
edit-capable v2 pattern (inline editor, two-step inline delete, inline error banner). Read it
before writing these. Do not introduce SweetAlert2: it silently no-ops on the Hi-Fi mount
shell (PR #42 lesson), which is why v2 surfaces use inline banners.

- [ ] **Step 1: Build `RossOrdersSupplierEditor.vue`**

Contract:

| | |
|---|---|
| **Props** | `supplier: Object \| null` (null = create mode), `saving: Boolean` |
| **Emits** | `save` → `{ supplier }` payload matching `SupplierInput`; `cancel` |
| **Fields** | `name` (required), `email`, `contactName`, `phone`, `accountNumber`, `deliveryDays` (7 weekday toggles), `leadTimeDays`, `minimumOrderValue`, `notes` |
| **Client validation** | name non-empty and ≤120; email either empty or matching a basic address shape. Mirror-only — the CF's Zod schema is authoritative. |
| **Email hint** | When `email` is empty, show: *"Without an email you can export this order but not send it from Ross."* States the D1 limitation at the point of decision rather than at send time. |
| **Escaping** | Vue text interpolation auto-escapes. **No `v-html` anywhere.** |

- [ ] **Step 2: Build `RossOrdersSupplierList.vue`**

Contract:

| | |
|---|---|
| **Props** | `suppliers: Array`, `busyId: String` |
| **Emits** | `edit` → `supplierId`; `archive` → `supplierId`; `add` |
| **Row** | name, contact, email or a **"Needs email"** chip (`--hf-warn` tone), item count when known |
| **Delete** | Two-step slide-down confirm on the row — the Playbook/People pattern. Copy states "Removing hides this supplier from new orders. Past orders keep their record." (it is a soft archive, and that must be honest) |
| **Empty state** | Rendered by the parent shell, not here |

- [ ] **Step 3: Verify the build passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add public/js/modules/ross/v2/components/RossOrdersSupplierList.vue \
        public/js/modules/ross/v2/components/RossOrdersSupplierEditor.vue
git commit -m "feat(purchase-orders): supplier list + inline editor components"
```

---

## Task 11: Tab shell with empty state and seed review

**Files:**
- Create: `public/js/modules/ross/v2/components/RossOrders.vue`

- [ ] **Step 1: Build the shell**

Structure mirrors `RossPeople.vue`: location picker (reuse `utils/location-names.js` —
already shared by two stores, do not re-implement), heading, inline error banner, content.

Three states:

1. **Empty book** — two doors: *"Import from my stock count"* and *"Add a supplier"*.
2. **Seed review** — after `loadSeedPreview`. **A review screen, never a silent bulk write:**
   - Header naming the source: *"From your stock count of {date} — {n} suppliers, {m} items."*
     Format the date SA-style (DD/MM/YYYY) from `seedPreview.sourceTimestamp`.
   - A tick-list of suppliers with item counts, all ticked by default.
   - When `seedPreview.unassigned.itemCount > 0`, a distinct notice:
     *"{n} items have no supplier in your stock file. They won't be imported — you can add
     them to a supplier by hand later."* **This must not be a quiet omission** — it is the
     G10/§8.2 requirement, and it is the visible half of a behaviour that is otherwise
     silent in `suggestOrder`.
   - When `seedPreview.truncated`, note that only the first 2,000 items were read.
   - Confirm → `commitSeed` with the ticked names → success banner naming the counts.
3. **Populated book** — `RossOrdersSupplierList` plus a header count and, when
   `needsEmailCount > 0`, a banner: *"{n} suppliers still need an email address before Ross
   can send their orders."*

When `seedUnavailable` is true, the import door is disabled with *"No stock count found for
this location yet."* — never an error.

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add public/js/modules/ross/v2/components/RossOrders.vue
git commit -m "feat(purchase-orders): Orders tab shell with reviewed stock-count import"
```

---

## Task 12: Register the `orders` tab

**Files:**
- Modify: `public/js/modules/ross/v2/components/RossHome.vue`

- [ ] **Step 1: Add the tab**

Four edits, mirroring the existing `people` tab exactly:

```js
// 1. after the RossPeople import (line ~18)
import RossOrders from './RossOrders.vue'
```

```js
// 2. line 24 — extend the valid-tab set
const VALID_TABS = new Set(['home', 'playbook', 'activity', 'people', 'run', 'orders'])
```

```js
// 3. inside the `view` computed (line ~48), beside the other cases
    case 'orders':   return 'orders'
```

```html
<!-- 4. in the template, after the RossPeople line -->
  <RossOrders v-else-if="view === 'orders'" />
```

- [ ] **Step 2: Verify the build passes and the route resolves**

Run: `npm run build`
Expected: exits 0.

Then confirm `/ross.html?tab=orders` renders the Orders shell and `?tab=nonsense` still falls
back to home.

- [ ] **Step 3: Add nav entries**

Add "Orders" to the desktop sidebar (`RossHomeDesktop.vue`) and the mobile bottom nav
(`RossHomeMobile.vue`), beside Playbook / Activity / People. **Do both** — the mobile variant
historically fails to inherit desktop wiring, twice (#48, #79).

- [ ] **Step 4: Run the whole suite and build**

```bash
cd functions && npx vitest run purchase-orders/ && cd .. && npx vitest run tests/unit/ross-orders-store.test.js && npm run build
```
Expected: all green, build exits 0.

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/ross/v2/components/RossHome.vue \
        public/js/modules/ross/v2/components/RossHomeDesktop.vue \
        public/js/modules/ross/v2/components/RossHomeMobile.vue
git commit -m "feat(purchase-orders): register the Orders tab in desktop + mobile nav"
```

---

## Definition of done

- [ ] `cd functions && npx vitest run purchase-orders/` — all suites green (~76 tests)
- [ ] `npx vitest run tests/unit/ross-orders-store.test.js` — green (10 tests)
- [ ] `npm run build` — exits 0
- [ ] No new failures against the pre-existing baseline (legacy `sales-forecasting`, `qms-*`
      suites already fail on master — record the baseline before starting so a pre-existing
      red is not attributed to this work)
- [ ] `node -e "require('./database.rules.json')"` parses
- [ ] `node scripts/verify-rules-purchasing.js` exits 2 when unconfigured
- [ ] Manual smoke on a preview channel: empty state → seed review → import → edit a
      supplier → archive → mobile breakpoint. **Budget one preview-driven fix round** — every
      UI-touching PR in this repo's recent history has needed one that the automated reviews
      missed (validated 3×)
- [ ] Grep the diff for `v-html` — expect zero hits

## Operator-gated, explicitly NOT in this slice

1. **Deploy.** `firebase deploy --only functions:poCatalog,functions:poSeedFromStock` then
   rules. Run `cd functions && npm install` **first** — `functions/node_modules` is not
   inherited by a worktree and the first deploy otherwise fails on a missing module
   (validated 3×).
2. **Rules deploy ordering:** functions first, rules last. Then run
   `scripts/verify-rules-purchasing.js` with a **non-admin** token.
3. **Entitlement rollout.** `features.purchaseOrders` must be materialised by the
   entitlement resolver for existing users, or the CFs return `{hasData:false}` for everyone
   and the tab looks broken rather than gated. **Confirm the resolver's catalog includes the
   flag before deploying the client** — this is the most likely day-one failure.
4. **`database.rules.json` / `functions/index.js` contention.** Both are single-owner shared
   config. Check `gh pr list` before Tasks 6 and 7.

## Deferred to later slices

D2 adds `poDraft`, the draft builder, CSV export and the F7 sanitizer. D3 adds `poSend` with
the claim→send→confirm state machine, PO numbering and history. D4 adds the food-cost
quantity pre-fill with the count picker and staleness guard. The `purchase_order` workflow
task `inputType` is out of scope for the whole PO spec and gets its own.
