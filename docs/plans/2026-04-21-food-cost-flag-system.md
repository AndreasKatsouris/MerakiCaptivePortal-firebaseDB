# Food Cost Flag System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an end-to-end flagging system to the Food Cost module so stock items can be auto-flagged (anomaly detection) and manually tagged, with persistent per-item flags, smart auto-clear, visible badges in the stock table, a dedicated Flags tab, and re-surfacing of the currently-orphaned Analytics dashboard.

**Architecture:** Shared `flag-service.js` owns CRUD and identity hashing. `flag-detection-engine.js` runs six rules against a processed stock record plus historical data from `historical-usage-service.js`. `flag-display-merger.js` injects flagged-historical items into the displayed table. The Food Cost module gains top-level tabs (Stock Data / Orders / Flags / Analytics) added to `#foodCostContent` in `admin-dashboard.html`. Flag data persists in three new RTDB nodes: `stockItemFlags/{locationId}/{itemKey}`, `stockFlagConfig`, `stockFlagAudit`.

**Tech Stack:** Vanilla JS (existing module style), Firebase RTDB, Bootstrap 5 tabs, SweetAlert2 modals, Chart.js where relevant, existing test harness in `public/js/modules/food-cost/tests/`.

**Source spec:** `docs/superpowers/specs/2026-04-21-food-cost-flag-system-design.md`

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `public/js/modules/food-cost/services/flag-service.js` | Flag CRUD, identity hashing, auto-clear, config resolution |
| `public/js/modules/food-cost/services/flag-detection-engine.js` | Six auto-flag rules + composite culprit scoring |
| `public/js/modules/food-cost/flag-display-merger.js` | Merge flagged-historical items into display array |
| `public/js/modules/food-cost/constants/flag-types.js` | Enum-like frozen objects for rule IDs, manual flag types, severities, implicit severity mapping |
| `public/js/modules/food-cost/components/flags/FlagBadge.js` | Severity-colored pill component |
| `public/js/modules/food-cost/components/flags/FlagTagModal.js` | Apply / remove manual flags on an item |
| `public/js/modules/food-cost/components/flags/FlagsDashboard.js` | Full Flags tab view |
| `public/js/modules/food-cost/components/flags/FlagDetailDrawer.js` | Per-item flag detail/history drawer |
| `public/js/modules/food-cost/components/flags/FlagConfigPanel.js` | Per-location threshold overrides |
| `public/js/modules/food-cost/tests/flag-service.test.js` | Unit tests for service |
| `public/js/modules/food-cost/tests/flag-detection-engine.test.js` | Unit tests for detection rules |
| `public/js/modules/food-cost/tests/flag-display-merger.test.js` | Unit tests for merger |
| `public/js/modules/food-cost/tests/flag-flow.integration.test.js` | End-to-end flow against emulator |
| `tests/e2e/food-cost-flags.spec.js` | Playwright E2E journey |

**Modified files:**

| Path | Change |
|---|---|
| `database.rules.json` | Add rules for `stockItemFlags`, `stockFlagConfig`, `stockFlagAudit`, plus `wastageFlags` child under `stockUsage/$recordId` |
| `public/js/modules/food-cost/data-processor.js:428-468` | Attach `itemKey` to each stock row |
| `public/js/modules/food-cost/components/tables/EditableStockDataTable.js` | Add Flags column, "show historical" toggle |
| `public/js/modules/food-cost/components/purchase-order/po-modal.js` | Pre-submit warning if draft PO contains flagged items |
| `public/js/modules/food-cost/index.js` | Export new services; run detection after upload |
| `public/admin-dashboard.html` (around line 1225) | Wrap `#foodCostContent` body in Bootstrap `nav-tabs` with four panes |
| `public/js/modules/food-cost/setup.js` | Wire tab activation; initialize flag count badge |

---

## Phases

1. **Foundation** — identity, types, security rules, config, empty service (Tasks 1-6)
2. **Service layer** — flag CRUD + auto-clear (Tasks 7-10)
3. **Detection engine** — six rules + composite scorer (Tasks 11-17)
4. **Display merger + data-processor integration** (Tasks 18-20)
5. **UI — tabs + stock table integration** (Tasks 21-26)
6. **UI — Flags tab full feature set** (Tasks 27-32)
7. **UI — Orders integration** (Task 33)
8. **E2E + rollout** (Tasks 34-35)

---

## Task 1: Flag type constants

**Files:**
- Create: `public/js/modules/food-cost/constants/flag-types.js`
- Test: `public/js/modules/food-cost/tests/flag-types.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/flag-types.test.js
import { RULE_IDS, MANUAL_FLAG_TYPES, SEVERITIES, MANUAL_SEVERITY_MAP } from '../constants/flag-types.js';

describe('flag-types constants', () => {
  test('RULE_IDS has six auto-flag rules', () => {
    expect(Object.keys(RULE_IDS)).toEqual([
      'HIGH_FC_PCT', 'COST_SPIKE', 'USAGE_ANOMALY',
      'DEAD_STOCK', 'MISSING_WITH_HISTORY', 'INVALID_VALUES'
    ]);
  });
  test('MANUAL_FLAG_TYPES has eight types', () => {
    expect(Object.keys(MANUAL_FLAG_TYPES)).toHaveLength(8);
  });
  test('SEVERITIES ordered critical > warning > info', () => {
    expect(SEVERITIES.CRITICAL.rank).toBeGreaterThan(SEVERITIES.WARNING.rank);
    expect(SEVERITIES.WARNING.rank).toBeGreaterThan(SEVERITIES.INFO.rank);
  });
  test('constants frozen', () => {
    expect(Object.isFrozen(RULE_IDS)).toBe(true);
  });
  test('MANUAL_SEVERITY_MAP maps every manual type', () => {
    Object.keys(MANUAL_FLAG_TYPES).forEach(t =>
      expect(MANUAL_SEVERITY_MAP[t]).toBeDefined()
    );
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run tests using the module's existing harness (open `tests/index.html` or run the Jest-like harness). Expected: module not found.

- [ ] **Step 3: Implement constants**

```javascript
// constants/flag-types.js
export const RULE_IDS = Object.freeze({
  HIGH_FC_PCT: 'HIGH_FC_PCT',
  COST_SPIKE: 'COST_SPIKE',
  USAGE_ANOMALY: 'USAGE_ANOMALY',
  DEAD_STOCK: 'DEAD_STOCK',
  MISSING_WITH_HISTORY: 'MISSING_WITH_HISTORY',
  INVALID_VALUES: 'INVALID_VALUES',
});

export const MANUAL_FLAG_TYPES = Object.freeze({
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  OFF_MENU: 'OFF_MENU',
  SEASONAL: 'SEASONAL',
  INVESTIGATION: 'INVESTIGATION',
  SUPPLIER_ISSUE: 'SUPPLIER_ISSUE',
  RECIPE_CHANGE: 'RECIPE_CHANGE',
  WASTAGE: 'WASTAGE',
  CUSTOM: 'CUSTOM',
});

export const SEVERITIES = Object.freeze({
  CRITICAL: Object.freeze({ id: 'critical', rank: 3, label: 'Critical', colorClass: 'bg-danger' }),
  WARNING:  Object.freeze({ id: 'warning',  rank: 2, label: 'Warning',  colorClass: 'bg-warning text-dark' }),
  INFO:     Object.freeze({ id: 'info',     rank: 1, label: 'Info',     colorClass: 'bg-info text-dark' }),
});

export const MANUAL_SEVERITY_MAP = Object.freeze({
  OUT_OF_STOCK: SEVERITIES.WARNING.id,
  OFF_MENU: SEVERITIES.INFO.id,
  SEASONAL: SEVERITIES.INFO.id,
  INVESTIGATION: SEVERITIES.WARNING.id,
  SUPPLIER_ISSUE: SEVERITIES.WARNING.id,
  RECIPE_CHANGE: SEVERITIES.INFO.id,
  WASTAGE: SEVERITIES.WARNING.id,
  CUSTOM: SEVERITIES.INFO.id,
});

export const MANUAL_AUTO_CLEAR = Object.freeze({
  OUT_OF_STOCK: 'reappearsWithUsage',
  SEASONAL: 'expiresAt',
  RECIPE_CHANGE: 'decay8weeks',
  // others → never auto-clear
});
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/food-cost/constants/flag-types.js public/js/modules/food-cost/tests/flag-types.test.js
git commit -m "feat(food-cost): flag-type constants and severity map"
```

---

## Task 2: Stable item identity helper

**Files:**
- Create: `public/js/modules/food-cost/services/item-identity.js`
- Test: `public/js/modules/food-cost/tests/item-identity.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { computeItemKey } from '../services/item-identity.js';

describe('computeItemKey', () => {
  test('prefers real itemCode', () => {
    expect(computeItemKey({ itemCode: 'SKU123', description: 'X' }))
      .toBe('code:SKU123');
  });
  test('falls back to hash when itemCode is empty', () => {
    const k = computeItemKey({ itemCode: '', description: 'Chicken Breast', category: 'Protein', costCenter: 'Kitchen' });
    expect(k).toMatch(/^hash:[a-f0-9]{40}$/);
  });
  test('falls back to hash when itemCode has ITEM- random prefix', () => {
    const k = computeItemKey({ itemCode: 'ITEM-472', description: 'Lamb Shoulder', category: 'Protein', costCenter: 'Kitchen' });
    expect(k.startsWith('hash:')).toBe(true);
  });
  test('hash is deterministic across case/whitespace', () => {
    const a = computeItemKey({ itemCode: '', description: 'Lamb  Shoulder ', category: 'protein', costCenter: 'kitchen' });
    const b = computeItemKey({ itemCode: '', description: 'lamb shoulder',  category: 'Protein', costCenter: 'Kitchen' });
    expect(a).toBe(b);
  });
  test('hash differs when description differs', () => {
    const a = computeItemKey({ itemCode: '', description: 'Chicken', category: 'Protein', costCenter: 'K' });
    const b = computeItemKey({ itemCode: '', description: 'Beef',    category: 'Protein', costCenter: 'K' });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

- [ ] **Step 3: Implement**

```javascript
// services/item-identity.js
// SHA-1 using Web Crypto API (available in browser and Node 16+)
async function sha1Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sync fallback using a small inline SHA-1 (kept tiny; used only if crypto unavailable)
// For browser contexts this file is used in, crypto.subtle exists.

function normalize(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isRandomFallbackCode(code) {
  return /^ITEM-\d{1,6}$/.test(String(code || ''));
}

export async function computeItemKey(item) {
  const code = String(item?.itemCode || '').trim();
  if (code && !isRandomFallbackCode(code)) {
    return `code:${code}`;
  }
  const payload = [
    normalize(item?.description),
    normalize(item?.category),
    normalize(item?.costCenter),
  ].join('|');
  const h = await sha1Hex(payload);
  return `hash:${h}`;
}

export const __test__ = { normalize, isRandomFallbackCode };
```

Note: `computeItemKey` is async. Adjust Task 1 tests to `await` — update now if needed.

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/food-cost/services/item-identity.js public/js/modules/food-cost/tests/item-identity.test.js
git commit -m "feat(food-cost): stable item identity helper (code-or-hash)"
```

---

## Task 3: Security rules for flag nodes

**Files:**
- Modify: `database.rules.json` (add three new top-level nodes + `wastageFlags` child)

- [ ] **Step 1: Write the rules**

Append inside the top-level `rules` object (co-located alphabetically):

```json
"stockItemFlags": {
  ".read": "auth != null",
  "$locationId": {
    ".read": "auth != null && (auth.token.admin === true || root.child('userLocations').child(auth.uid).child($locationId).exists() || root.child('locations').child($locationId).child('ownerId').val() === auth.uid)",
    ".write": "auth != null && (auth.token.admin === true || root.child('userLocations').child(auth.uid).child($locationId).exists() || root.child('locations').child($locationId).child('ownerId').val() === auth.uid)",
    ".indexOn": ["lastSeenAt"],
    "$itemKey": {
      ".validate": "$itemKey.matches(/^(code:|hash:).+$/)",
      "manualFlags": {
        "$flagType": {
          ".validate": "newData.hasChildren(['appliedBy', 'appliedAt'])",
          "appliedBy": { ".validate": "newData.isString()" },
          "appliedAt": { ".validate": "newData.isNumber()" },
          "note": { ".validate": "newData.isString() || newData.val() == null" },
          "expiresAt": { ".validate": "newData.isNumber() || newData.val() == null" },
          "customLabel": { ".validate": "newData.isString() && newData.val().length <= 40" }
        }
      },
      "autoFlags": {
        "$ruleId": {
          ".validate": "newData.hasChildren(['severity', 'detectedAt']) && newData.child('severity').val().matches(/^(critical|warning|info)$/)"
        }
      }
    }
  }
},
"stockFlagConfig": {
  ".read": "auth != null",
  "_defaults": {
    ".write": "auth != null && auth.token.admin === true"
  },
  "$locationId": {
    ".write": "auth != null && (auth.token.admin === true || root.child('locations').child($locationId).child('ownerId').val() === auth.uid)"
  }
},
"stockFlagAudit": {
  "$locationId": {
    ".read": "auth != null && (auth.token.admin === true || root.child('userLocations').child(auth.uid).child($locationId).exists() || root.child('locations').child($locationId).child('ownerId').val() === auth.uid)",
    ".indexOn": ["timestamp"],
    "$eventId": {
      ".write": "auth != null && !data.exists() && (auth.token.admin === true || root.child('userLocations').child(auth.uid).child($locationId).exists() || root.child('locations').child($locationId).child('ownerId').val() === auth.uid)",
      ".validate": "newData.hasChildren(['itemKey', 'eventType', 'actorUid', 'timestamp'])"
    }
  }
}
```

Also modify the existing `stockUsage/$recordId` validate to allow `wastageFlags` (no change needed if `.validate` is non-restrictive; verify by reading existing rule at `database.rules.json:206-213`).

- [ ] **Step 2: Validate locally**

```bash
firebase deploy --only database --project default --dry-run 2>&1 | head -30
```

Expected: no parse errors.

- [ ] **Step 3: Commit**

```bash
git add database.rules.json
git commit -m "feat(rules): security rules for stock flag system"
```

---

## Task 4: Seed default config + flag-service scaffold

**Files:**
- Create: `public/js/modules/food-cost/services/flag-service.js`
- Test: `public/js/modules/food-cost/tests/flag-service.test.js`

- [ ] **Step 1: Test skeleton exports**

```javascript
import {
  DEFAULT_THRESHOLDS,
  getThresholds,
  getFlagsForLocation,
  applyManualFlag,
  removeManualFlag,
  resolveFlag,
  writeAutoFlags,
  runAutoClear,
} from '../services/flag-service.js';

describe('flag-service exports', () => {
  test('exports functions and defaults', () => {
    expect(typeof getFlagsForLocation).toBe('function');
    expect(DEFAULT_THRESHOLDS.foodCostPctWarning).toBe(35);
    expect(DEFAULT_THRESHOLDS.foodCostPctCritical).toBe(40);
    expect(DEFAULT_THRESHOLDS.unitCostSpikePct).toBe(15);
    expect(DEFAULT_THRESHOLDS.usageVarianceStdDev).toBe(2);
    expect(DEFAULT_THRESHOLDS.deadStockDaysThreshold).toBe(28);
    expect(DEFAULT_THRESHOLDS.missingItemLookbackWeeks).toBe(4);
    expect(DEFAULT_THRESHOLDS.highFcPctCulpritMinScore).toBe(50);
  });
});
```

- [ ] **Step 2: Verify test fails**

- [ ] **Step 3: Write scaffold**

```javascript
// services/flag-service.js
import {
  rtdb, ref, get, set, update, push, remove,
  query, orderByChild, limitToLast,
} from '../../../config/firebase-config.js';
import { RULE_IDS, MANUAL_FLAG_TYPES, SEVERITIES, MANUAL_SEVERITY_MAP, MANUAL_AUTO_CLEAR } from '../constants/flag-types.js';

export const DEFAULT_THRESHOLDS = Object.freeze({
  foodCostPctWarning: 35,
  foodCostPctCritical: 40,
  unitCostSpikePct: 15,
  unitCostSpikeCriticalPct: 30,
  usageVarianceStdDev: 2,
  usageVarianceCriticalStdDev: 3,
  deadStockDaysThreshold: 28,
  missingItemLookbackWeeks: 4,
  highFcPctCulpritMinScore: 50,
});

const FLAGS_PATH   = 'stockItemFlags';
const CONFIG_PATH  = 'stockFlagConfig';
const AUDIT_PATH   = 'stockFlagAudit';

export async function getThresholds(locationId) {
  const [defSnap, locSnap] = await Promise.all([
    get(ref(rtdb, `${CONFIG_PATH}/_defaults/thresholds`)),
    get(ref(rtdb, `${CONFIG_PATH}/${locationId}/thresholds`)),
  ]);
  const seeded = defSnap.exists() ? defSnap.val() : DEFAULT_THRESHOLDS;
  const overrides = locSnap.exists() ? locSnap.val() : {};
  return { ...DEFAULT_THRESHOLDS, ...seeded, ...overrides };
}

export async function getFlagsForLocation(locationId) {
  const snap = await get(ref(rtdb, `${FLAGS_PATH}/${locationId}`));
  return snap.exists() ? snap.val() : {};
}

// Stubs — implemented in tasks 7-10
export async function applyManualFlag(_locationId, _itemKey, _flagType, _data)  { throw new Error('not implemented'); }
export async function removeManualFlag(_locationId, _itemKey, _flagType)         { throw new Error('not implemented'); }
export async function resolveFlag(_locationId, _itemKey, _flagType, _reason)     { throw new Error('not implemented'); }
export async function writeAutoFlags(_locationId, _itemKey, _autoFlags)          { throw new Error('not implemented'); }
export async function runAutoClear(_locationId, _processedItems)                 { throw new Error('not implemented'); }
```

- [ ] **Step 4: Run, verify tests pass**

- [ ] **Step 5: Seed the defaults node**

Write a one-off seed script that an admin runs from the browser console (or via Firebase console). Document it in the commit message:

```javascript
// One-off: run once from admin console to seed defaults
import { rtdb, ref, set } from './public/js/config/firebase-config.js';
import { DEFAULT_THRESHOLDS } from './public/js/modules/food-cost/services/flag-service.js';
set(ref(rtdb, 'stockFlagConfig/_defaults/thresholds'), DEFAULT_THRESHOLDS);
```

- [ ] **Step 6: Commit**

```bash
git add public/js/modules/food-cost/services/flag-service.js public/js/modules/food-cost/tests/flag-service.test.js
git commit -m "feat(food-cost): flag-service scaffold + default thresholds"
```

---

## Task 5: Data-processor itemKey attachment

**Files:**
- Modify: `public/js/modules/food-cost/data-processor.js:428-468`
- Test: `public/js/modules/food-cost/tests/data-processor-itemkey.test.js`

- [ ] **Step 1: Write test**

```javascript
import { processStockData } from '../data-processor.js';

describe('data-processor attaches itemKey', () => {
  test('every processed row has itemKey starting with code: or hash:', async () => {
    const headers = ['Item Code', 'Description', 'Category', 'Cost Center', 'Opening Qty', 'Closing Qty', 'Purchases', 'Unit Cost'];
    const rows = [
      ['SKU001', 'Chicken Breast', 'Protein', 'Kitchen', '10', '4', '0', '50'],
      ['',       'Lamb Shoulder',  'Protein', 'Kitchen', '5',  '2', '0', '120'],
    ];
    const result = await processStockData(rows, headers, { stockPeriodDays: 7 });
    expect(result.stockData[0].itemKey).toBe('code:SKU001');
    expect(result.stockData[1].itemKey).toMatch(/^hash:/);
  });
});
```

- [ ] **Step 2: Verify test fails**

- [ ] **Step 3: Modify data-processor.js**

At the top, add import:

```javascript
import { computeItemKey } from './services/item-identity.js';
```

After `stockItem` is created (after line 468), add:

```javascript
stockItem.itemKey = await computeItemKey(stockItem);
```

If `processStockData` is currently synchronous, mark the item-producing loop `async` and await inside. If restructuring the loop is intrusive, compute keys in a batch after the sync loop completes:

```javascript
// after sync loop produces `processedItems`
await Promise.all(processedItems.map(async (it) => {
  it.itemKey = await computeItemKey(it);
}));
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/food-cost/data-processor.js public/js/modules/food-cost/tests/data-processor-itemkey.test.js
git commit -m "feat(food-cost): attach stable itemKey to processed stock rows"
```

---

## Task 6: flag-service — getThresholds integration test

**Files:**
- Modify: `public/js/modules/food-cost/tests/flag-service.test.js`

- [ ] **Step 1: Add test using Firebase emulator**

```javascript
describe('getThresholds resolves merged config', () => {
  beforeEach(async () => {
    await set(ref(rtdb, 'stockFlagConfig/_defaults/thresholds'), {
      foodCostPctWarning: 35, foodCostPctCritical: 40,
    });
    await set(ref(rtdb, 'stockFlagConfig/LOC1/thresholds'), {
      foodCostPctCritical: 38, unitCostSpikePct: 10,
    });
  });

  test('location overrides > defaults > built-ins', async () => {
    const t = await getThresholds('LOC1');
    expect(t.foodCostPctWarning).toBe(35);      // from _defaults
    expect(t.foodCostPctCritical).toBe(38);     // from location
    expect(t.unitCostSpikePct).toBe(10);        // from location
    expect(t.deadStockDaysThreshold).toBe(28);  // built-in fallback
  });
});
```

- [ ] **Step 2: Run with emulator, verify pass**

- [ ] **Step 3: Commit**

```bash
git add public/js/modules/food-cost/tests/flag-service.test.js
git commit -m "test(food-cost): threshold resolution integration test"
```

---

## Task 7: flag-service — applyManualFlag / removeManualFlag

**Files:**
- Modify: `public/js/modules/food-cost/services/flag-service.js`
- Modify: `public/js/modules/food-cost/tests/flag-service.test.js`

- [ ] **Step 1: Write tests**

```javascript
describe('applyManualFlag', () => {
  test('writes flag with appliedBy + timestamp', async () => {
    await applyManualFlag('LOC1', 'code:SKU001', MANUAL_FLAG_TYPES.OUT_OF_STOCK, {
      appliedBy: 'uid_alice', note: 'supplier late',
    });
    const snap = await get(ref(rtdb, 'stockItemFlags/LOC1/code:SKU001/manualFlags/OUT_OF_STOCK'));
    expect(snap.exists()).toBe(true);
    expect(snap.val().appliedBy).toBe('uid_alice');
    expect(snap.val().note).toBe('supplier late');
    expect(typeof snap.val().appliedAt).toBe('number');
  });
  test('rejects invalid flag type', async () => {
    await expect(applyManualFlag('LOC1', 'code:SKU001', 'NOT_A_TYPE', { appliedBy: 'u' }))
      .rejects.toThrow(/invalid flag type/i);
  });
  test('CUSTOM requires customLabel <= 40 chars', async () => {
    await expect(applyManualFlag('LOC1', 'code:SKU001', MANUAL_FLAG_TYPES.CUSTOM, { appliedBy: 'u', customLabel: 'x'.repeat(41) }))
      .rejects.toThrow(/customLabel/);
  });
  test('writes audit event', async () => {
    await applyManualFlag('LOC1', 'code:SKU001', MANUAL_FLAG_TYPES.OFF_MENU, { appliedBy: 'uid_bob' });
    const auditSnap = await get(query(ref(rtdb, 'stockFlagAudit/LOC1'), orderByChild('timestamp'), limitToLast(1)));
    const events = auditSnap.val();
    const last = Object.values(events)[0];
    expect(last.eventType).toBe('manual_flag_applied');
    expect(last.itemKey).toBe('code:SKU001');
  });
});

describe('removeManualFlag', () => {
  test('removes the flag and writes audit', async () => {
    await applyManualFlag('LOC1', 'code:X', MANUAL_FLAG_TYPES.INVESTIGATION, { appliedBy: 'u' });
    await removeManualFlag('LOC1', 'code:X', MANUAL_FLAG_TYPES.INVESTIGATION);
    const snap = await get(ref(rtdb, 'stockItemFlags/LOC1/code:X/manualFlags/INVESTIGATION'));
    expect(snap.exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Verify tests fail**

- [ ] **Step 3: Implement**

```javascript
export async function applyManualFlag(locationId, itemKey, flagType, data) {
  if (!MANUAL_FLAG_TYPES[flagType]) throw new Error(`invalid flag type: ${flagType}`);
  if (flagType === MANUAL_FLAG_TYPES.CUSTOM) {
    if (!data?.customLabel || data.customLabel.length > 40) {
      throw new Error('CUSTOM flag requires customLabel <= 40 chars');
    }
  }
  const now = Date.now();
  const payload = {
    appliedBy: data.appliedBy,
    appliedAt: now,
    note: data?.note ?? null,
    expiresAt: data?.expiresAt ?? null,
    ...(data?.customLabel ? { customLabel: data.customLabel } : {}),
  };
  const updates = {
    [`${FLAGS_PATH}/${locationId}/${itemKey}/manualFlags/${flagType}`]: payload,
  };
  await update(ref(rtdb), updates);
  await writeAudit(locationId, {
    itemKey, eventType: 'manual_flag_applied',
    actorUid: data.appliedBy, timestamp: now,
    payload: { flagType, ...payload },
  });
}

export async function removeManualFlag(locationId, itemKey, flagType) {
  const updates = {
    [`${FLAGS_PATH}/${locationId}/${itemKey}/manualFlags/${flagType}`]: null,
  };
  await update(ref(rtdb), updates);
  await writeAudit(locationId, {
    itemKey, eventType: 'manual_flag_removed',
    actorUid: 'system', timestamp: Date.now(),
    payload: { flagType },
  });
}

async function writeAudit(locationId, event) {
  const evRef = push(ref(rtdb, `${AUDIT_PATH}/${locationId}`));
  await set(evRef, event);
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/food-cost/services/flag-service.js public/js/modules/food-cost/tests/flag-service.test.js
git commit -m "feat(food-cost): apply/remove manual flags with audit"
```

---

## Task 8: flag-service — resolveFlag with ring-buffered audit

**Files:**
- Modify: `services/flag-service.js`
- Modify: `tests/flag-service.test.js`

- [ ] **Step 1: Write test**

```javascript
describe('resolveFlag', () => {
  test('moves flag into resolvedFlags with push key and reason', async () => {
    await applyManualFlag('LOC1', 'code:Z', MANUAL_FLAG_TYPES.OUT_OF_STOCK, { appliedBy: 'u' });
    await resolveFlag('LOC1', 'code:Z', 'OUT_OF_STOCK', { resolvedBy: 'u', reason: 'back in stock' });
    const flagSnap = await get(ref(rtdb, 'stockItemFlags/LOC1/code:Z/manualFlags/OUT_OF_STOCK'));
    expect(flagSnap.exists()).toBe(false);
    const resolvedSnap = await get(ref(rtdb, 'stockItemFlags/LOC1/code:Z/resolvedFlags'));
    const vals = Object.values(resolvedSnap.val());
    expect(vals[0].flagType).toBe('OUT_OF_STOCK');
    expect(vals[0].reason).toBe('back in stock');
  });
  test('trims resolvedFlags to most recent 20', async () => {
    for (let i = 0; i < 25; i++) {
      await applyManualFlag('LOC1', 'code:R', MANUAL_FLAG_TYPES.INVESTIGATION, { appliedBy: 'u', note: `#${i}` });
      await resolveFlag('LOC1', 'code:R', 'INVESTIGATION', { resolvedBy: 'u', reason: `r${i}` });
    }
    const snap = await get(ref(rtdb, 'stockItemFlags/LOC1/code:R/resolvedFlags'));
    expect(Object.keys(snap.val()).length).toBe(20);
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
export async function resolveFlag(locationId, itemKey, flagType, { resolvedBy, reason = null } = {}) {
  const now = Date.now();
  const entry = { flagType, resolvedBy, resolvedAt: now, reason };
  const resolvedRef = push(ref(rtdb, `${FLAGS_PATH}/${locationId}/${itemKey}/resolvedFlags`));

  const removeUpdates = {};
  if (MANUAL_FLAG_TYPES[flagType]) {
    removeUpdates[`${FLAGS_PATH}/${locationId}/${itemKey}/manualFlags/${flagType}`] = null;
  } else if (RULE_IDS[flagType]) {
    removeUpdates[`${FLAGS_PATH}/${locationId}/${itemKey}/autoFlags/${flagType}`] = null;
  }
  if (Object.keys(removeUpdates).length) {
    await update(ref(rtdb), removeUpdates);
  }
  await set(resolvedRef, entry);
  await trimResolvedFlags(locationId, itemKey, 20);
  await writeAudit(locationId, {
    itemKey, eventType: 'flag_resolved', actorUid: resolvedBy, timestamp: now,
    payload: { flagType, reason },
  });
}

async function trimResolvedFlags(locationId, itemKey, max) {
  const snap = await get(ref(rtdb, `${FLAGS_PATH}/${locationId}/${itemKey}/resolvedFlags`));
  if (!snap.exists()) return;
  const entries = Object.entries(snap.val());
  if (entries.length <= max) return;
  entries.sort((a, b) => (a[1].resolvedAt ?? 0) - (b[1].resolvedAt ?? 0));
  const toRemove = entries.slice(0, entries.length - max);
  const updates = {};
  toRemove.forEach(([id]) => {
    updates[`${FLAGS_PATH}/${locationId}/${itemKey}/resolvedFlags/${id}`] = null;
  });
  await update(ref(rtdb), updates);
}
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/food-cost/services/flag-service.js public/js/modules/food-cost/tests/flag-service.test.js
git commit -m "feat(food-cost): resolveFlag with ring-buffered audit trail"
```

---

## Task 9: flag-service — writeAutoFlags + lastSeen update

**Files:**
- Modify: `services/flag-service.js`, `tests/flag-service.test.js`

- [ ] **Step 1: Test**

```javascript
describe('writeAutoFlags', () => {
  test('replaces autoFlags set and updates lastSeen', async () => {
    await writeAutoFlags('LOC1', 'code:A', {
      itemMeta: { itemCode: 'A', description: 'Apple', category: 'Produce', costCenter: 'Kitchen' },
      recordId: 'REC1',
      flags: {
        COST_SPIKE: { severity: 'warning', score: 62, detectedAt: 1000, sourceRecordId: 'REC1', details: { delta: 0.22 } },
      },
    });
    const snap = await get(ref(rtdb, 'stockItemFlags/LOC1/code:A'));
    const v = snap.val();
    expect(v.autoFlags.COST_SPIKE.severity).toBe('warning');
    expect(v.itemCode).toBe('A');
    expect(v.lastSeenRecordId).toBe('REC1');
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
export async function writeAutoFlags(locationId, itemKey, { itemMeta, recordId, flags }) {
  const now = Date.now();
  const base = `${FLAGS_PATH}/${locationId}/${itemKey}`;
  const updates = {
    [`${base}/itemKey`]: itemKey,
    [`${base}/itemCode`]: itemMeta.itemCode ?? null,
    [`${base}/description`]: itemMeta.description ?? null,
    [`${base}/category`]: itemMeta.category ?? null,
    [`${base}/costCenter`]: itemMeta.costCenter ?? null,
    [`${base}/lastSeenRecordId`]: recordId,
    [`${base}/lastSeenAt`]: now,
    [`${base}/autoFlags`]: flags,  // full replace; autoFlags are re-evaluated each upload
  };
  await update(ref(rtdb), updates);
}
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(food-cost): writeAutoFlags with lastSeen tracking"
```

---

## Task 10: flag-service — runAutoClear

**Files:**
- Modify: `services/flag-service.js`, `tests/flag-service.test.js`

- [ ] **Step 1: Test**

```javascript
describe('runAutoClear', () => {
  test('OUT_OF_STOCK clears when item reappears with usage > 0', async () => {
    await applyManualFlag('LOC1', 'code:B', MANUAL_FLAG_TYPES.OUT_OF_STOCK, { appliedBy: 'u' });
    const cleared = await runAutoClear('LOC1', [
      { itemKey: 'code:B', usage: 5 },
    ]);
    expect(cleared).toContainEqual(expect.objectContaining({ itemKey: 'code:B', flagType: 'OUT_OF_STOCK' }));
    const snap = await get(ref(rtdb, 'stockItemFlags/LOC1/code:B/manualFlags/OUT_OF_STOCK'));
    expect(snap.exists()).toBe(false);
  });
  test('OUT_OF_STOCK does not clear when usage is 0', async () => {
    await applyManualFlag('LOC1', 'code:C', MANUAL_FLAG_TYPES.OUT_OF_STOCK, { appliedBy: 'u' });
    await runAutoClear('LOC1', [{ itemKey: 'code:C', usage: 0 }]);
    const snap = await get(ref(rtdb, 'stockItemFlags/LOC1/code:C/manualFlags/OUT_OF_STOCK'));
    expect(snap.exists()).toBe(true);
  });
  test('SEASONAL clears on expiresAt elapsed', async () => {
    await applyManualFlag('LOC1', 'code:D', MANUAL_FLAG_TYPES.SEASONAL, {
      appliedBy: 'u', expiresAt: Date.now() - 1000,
    });
    await runAutoClear('LOC1', []);
    const snap = await get(ref(rtdb, 'stockItemFlags/LOC1/code:D/manualFlags/SEASONAL'));
    expect(snap.exists()).toBe(false);
  });
  test('RECIPE_CHANGE decays after 8 weeks', async () => {
    const eightWeeksAgo = Date.now() - (8 * 7 * 24 * 3600 * 1000) - 1;
    // seed directly to bypass applyManualFlag timestamp
    await set(ref(rtdb, 'stockItemFlags/LOC1/code:E/manualFlags/RECIPE_CHANGE'), {
      appliedBy: 'u', appliedAt: eightWeeksAgo, note: null, expiresAt: null,
    });
    await runAutoClear('LOC1', []);
    const snap = await get(ref(rtdb, 'stockItemFlags/LOC1/code:E/manualFlags/RECIPE_CHANGE'));
    expect(snap.exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
const EIGHT_WEEKS_MS = 8 * 7 * 24 * 3600 * 1000;

export async function runAutoClear(locationId, processedItems) {
  const flags = await getFlagsForLocation(locationId);
  const byKey = Object.fromEntries(processedItems.map(i => [i.itemKey, i]));
  const now = Date.now();
  const cleared = [];
  const updates = {};

  for (const [itemKey, itemData] of Object.entries(flags)) {
    const manual = itemData.manualFlags || {};
    for (const [type, entry] of Object.entries(manual)) {
      let clear = false;

      if (type === MANUAL_FLAG_TYPES.OUT_OF_STOCK) {
        const cur = byKey[itemKey];
        if (cur && Number(cur.usage) > 0) clear = true;
      } else if (type === MANUAL_FLAG_TYPES.SEASONAL) {
        if (entry.expiresAt && entry.expiresAt < now) clear = true;
      } else if (type === MANUAL_FLAG_TYPES.RECIPE_CHANGE) {
        if (entry.appliedAt && (now - entry.appliedAt) > EIGHT_WEEKS_MS) clear = true;
      }

      if (clear) {
        updates[`${FLAGS_PATH}/${locationId}/${itemKey}/manualFlags/${type}`] = null;
        cleared.push({ itemKey, flagType: type, reason: 'auto' });
      }
    }
  }

  if (Object.keys(updates).length) {
    await update(ref(rtdb), updates);
    for (const c of cleared) {
      await writeAudit(locationId, {
        itemKey: c.itemKey, eventType: 'flag_auto_cleared',
        actorUid: 'system', timestamp: now,
        payload: { flagType: c.flagType, reason: c.reason },
      });
    }
  }
  return cleared;
}
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(food-cost): auto-clear manual flags on upload"
```

---

## Task 11: Detection engine scaffold + INVALID_VALUES rule

**Files:**
- Create: `public/js/modules/food-cost/services/flag-detection-engine.js`
- Create: `public/js/modules/food-cost/tests/flag-detection-engine.test.js`

- [ ] **Step 1: Test**

```javascript
import { detectInvalidValues, runDetection } from '../services/flag-detection-engine.js';

describe('INVALID_VALUES', () => {
  test('flags negative closing', () => {
    const flags = detectInvalidValues({ itemKey: 'code:X', closingQty: -1, openingQty: 5, purchaseQty: 0, unitCost: 10 });
    expect(flags.INVALID_VALUES.severity).toBe('critical');
    expect(flags.INVALID_VALUES.details.reasons).toContain('negativeClosing');
  });
  test('flags closing > opening + purchases', () => {
    const flags = detectInvalidValues({ itemKey: 'code:X', closingQty: 100, openingQty: 5, purchaseQty: 10, unitCost: 10 });
    expect(flags.INVALID_VALUES.details.reasons).toContain('closingExceedsAvailable');
  });
  test('flags negative unit cost', () => {
    const flags = detectInvalidValues({ itemKey: 'code:X', closingQty: 1, openingQty: 5, purchaseQty: 0, unitCost: -1 });
    expect(flags.INVALID_VALUES.details.reasons).toContain('negativeUnitCost');
  });
  test('no flag for valid data', () => {
    expect(detectInvalidValues({ itemKey: 'code:X', closingQty: 2, openingQty: 5, purchaseQty: 0, unitCost: 10 }))
      .toEqual({});
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
// services/flag-detection-engine.js
import { RULE_IDS, SEVERITIES } from '../constants/flag-types.js';

export function detectInvalidValues(item) {
  const reasons = [];
  if (Number(item.closingQty) < 0) reasons.push('negativeClosing');
  if (Number(item.closingQty) > Number(item.openingQty) + Number(item.purchaseQty) + 0.0001) reasons.push('closingExceedsAvailable');
  if (Number(item.unitCost) < 0) reasons.push('negativeUnitCost');

  if (!reasons.length) return {};
  return {
    [RULE_IDS.INVALID_VALUES]: {
      severity: SEVERITIES.CRITICAL.id,
      score: 100,
      detectedAt: Date.now(),
      sourceRecordId: item.__recordId || null,
      details: { reasons },
    },
  };
}

export async function runDetection({ locationId, recordId, processedItems, thresholds, historicalData }) {
  // implemented across tasks 12-17
  return {};
}
```

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/food-cost/services/flag-detection-engine.js public/js/modules/food-cost/tests/flag-detection-engine.test.js
git commit -m "feat(food-cost): detection engine scaffold + INVALID_VALUES rule"
```

---

## Task 12: COST_SPIKE rule

**Files:**
- Modify: `services/flag-detection-engine.js`, `tests/flag-detection-engine.test.js`

- [ ] **Step 1: Test**

```javascript
import { detectCostSpike } from '../services/flag-detection-engine.js';

describe('COST_SPIKE', () => {
  const thresholds = { unitCostSpikePct: 15, unitCostSpikeCriticalPct: 30 };
  const hist = { 'code:X': { unitCostMean: 100, unitCostSamples: 6 } };

  test('no spike', () => {
    expect(detectCostSpike({ itemKey: 'code:X', unitCost: 105 }, hist, thresholds)).toEqual({});
  });
  test('warning spike (>=15% <30%)', () => {
    const r = detectCostSpike({ itemKey: 'code:X', unitCost: 120 }, hist, thresholds);
    expect(r.COST_SPIKE.severity).toBe('warning');
  });
  test('critical spike (>=30%)', () => {
    const r = detectCostSpike({ itemKey: 'code:X', unitCost: 140 }, hist, thresholds);
    expect(r.COST_SPIKE.severity).toBe('critical');
  });
  test('no history → no flag', () => {
    expect(detectCostSpike({ itemKey: 'code:Y', unitCost: 1000 }, hist, thresholds)).toEqual({});
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
export function detectCostSpike(item, historicalData, thresholds) {
  const h = historicalData?.[item.itemKey];
  if (!h || !h.unitCostMean || h.unitCostSamples < 2) return {};
  const delta = (Number(item.unitCost) - h.unitCostMean) / h.unitCostMean;
  if (delta < thresholds.unitCostSpikePct / 100) return {};
  const severity = delta >= thresholds.unitCostSpikeCriticalPct / 100
    ? SEVERITIES.CRITICAL.id : SEVERITIES.WARNING.id;
  return {
    [RULE_IDS.COST_SPIKE]: {
      severity,
      score: Math.min(100, Math.round(delta * 100)),
      detectedAt: Date.now(),
      sourceRecordId: item.__recordId || null,
      details: { historicalMean: h.unitCostMean, current: item.unitCost, delta },
    },
  };
}
```

- [ ] **Step 4: Verify pass. Commit**

```bash
git commit -am "feat(food-cost): COST_SPIKE detection rule"
```

---

## Task 13: USAGE_ANOMALY rule

**Files:**
- Modify: `services/flag-detection-engine.js`, `tests/flag-detection-engine.test.js`

- [ ] **Step 1: Test**

```javascript
import { detectUsageAnomaly } from '../services/flag-detection-engine.js';

describe('USAGE_ANOMALY', () => {
  const thresholds = { usageVarianceStdDev: 2, usageVarianceCriticalStdDev: 3 };
  const hist = { 'code:X': { usageMean: 10, usageStdDev: 2, usageSamples: 8 } };

  test('within 2σ → no flag', () => {
    expect(detectUsageAnomaly({ itemKey: 'code:X', usage: 13 }, hist, thresholds)).toEqual({});
  });
  test('between 2σ and 3σ → warning', () => {
    const r = detectUsageAnomaly({ itemKey: 'code:X', usage: 15 }, hist, thresholds);
    expect(r.USAGE_ANOMALY.severity).toBe('warning');
  });
  test('beyond 3σ → critical', () => {
    const r = detectUsageAnomaly({ itemKey: 'code:X', usage: 18 }, hist, thresholds);
    expect(r.USAGE_ANOMALY.severity).toBe('critical');
  });
  test('samples < 3 → no flag (insufficient history)', () => {
    const lowHist = { 'code:X': { usageMean: 10, usageStdDev: 2, usageSamples: 2 } };
    expect(detectUsageAnomaly({ itemKey: 'code:X', usage: 30 }, lowHist, thresholds)).toEqual({});
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
export function detectUsageAnomaly(item, historicalData, thresholds) {
  const h = historicalData?.[item.itemKey];
  if (!h || h.usageSamples < 3 || !h.usageStdDev) return {};
  const z = Math.abs((Number(item.usage) - h.usageMean) / h.usageStdDev);
  if (z < thresholds.usageVarianceStdDev) return {};
  const severity = z >= thresholds.usageVarianceCriticalStdDev
    ? SEVERITIES.CRITICAL.id : SEVERITIES.WARNING.id;
  return {
    [RULE_IDS.USAGE_ANOMALY]: {
      severity,
      score: Math.min(100, Math.round((z / thresholds.usageVarianceCriticalStdDev) * 100)),
      detectedAt: Date.now(),
      sourceRecordId: item.__recordId || null,
      details: { zScore: z, mean: h.usageMean, stdDev: h.usageStdDev, current: item.usage },
    },
  };
}
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(food-cost): USAGE_ANOMALY detection rule"
```

---

## Task 14: DEAD_STOCK rule

**Files:**
- Modify: `services/flag-detection-engine.js`, `tests/flag-detection-engine.test.js`

- [ ] **Step 1: Test**

```javascript
import { detectDeadStock } from '../services/flag-detection-engine.js';

describe('DEAD_STOCK', () => {
  const thresholds = { deadStockDaysThreshold: 28 };
  test('item with opening but zero usage for >28 days → info flag', () => {
    const h = { 'code:X': { daysSinceLastUsage: 30 } };
    const r = detectDeadStock({ itemKey: 'code:X', openingQty: 10, usage: 0 }, h, thresholds);
    expect(r.DEAD_STOCK.severity).toBe('info');
  });
  test('item with usage → no flag', () => {
    const h = { 'code:X': { daysSinceLastUsage: 30 } };
    expect(detectDeadStock({ itemKey: 'code:X', openingQty: 10, usage: 3 }, h, thresholds)).toEqual({});
  });
  test('item with zero opening → no flag', () => {
    const h = { 'code:X': { daysSinceLastUsage: 30 } };
    expect(detectDeadStock({ itemKey: 'code:X', openingQty: 0, usage: 0 }, h, thresholds)).toEqual({});
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
export function detectDeadStock(item, historicalData, thresholds) {
  if (Number(item.usage) > 0) return {};
  if (Number(item.openingQty) <= 0) return {};
  const h = historicalData?.[item.itemKey];
  const daysSince = h?.daysSinceLastUsage ?? thresholds.deadStockDaysThreshold + 1;
  if (daysSince < thresholds.deadStockDaysThreshold) return {};
  return {
    [RULE_IDS.DEAD_STOCK]: {
      severity: SEVERITIES.INFO.id,
      score: Math.min(100, Math.round((daysSince / thresholds.deadStockDaysThreshold) * 50)),
      detectedAt: Date.now(),
      sourceRecordId: item.__recordId || null,
      details: { daysSinceLastUsage: daysSince, openingQty: item.openingQty },
    },
  };
}
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(food-cost): DEAD_STOCK detection rule"
```

---

## Task 15: MISSING_WITH_HISTORY rule

**Files:**
- Modify: `services/flag-detection-engine.js`, `tests/flag-detection-engine.test.js`

- [ ] **Step 1: Test**

```javascript
import { detectMissingWithHistory } from '../services/flag-detection-engine.js';

describe('MISSING_WITH_HISTORY', () => {
  const thresholds = { missingItemLookbackWeeks: 4 };
  const currentKeys = new Set(['code:A', 'code:B']);
  const hist = {
    'code:A': { weeksSinceLastSeen: 0 },
    'code:B': { weeksSinceLastSeen: 0 },
    'code:C': { weeksSinceLastSeen: 1, itemCode: 'C', description: 'Gone', category: 'x', costCenter: 'y' },
    'code:D': { weeksSinceLastSeen: 10 },  // outside lookback
  };
  const existingFlags = {};

  test('item absent + within lookback → info flag', () => {
    const result = detectMissingWithHistory(currentKeys, hist, thresholds, existingFlags);
    expect(result['code:C'].MISSING_WITH_HISTORY.severity).toBe('info');
  });
  test('item absent + outside lookback → no flag', () => {
    const result = detectMissingWithHistory(currentKeys, hist, thresholds, existingFlags);
    expect(result['code:D']).toBeUndefined();
  });
  test('elevates to warning when unresolved manual flag exists', () => {
    const existing = { 'code:C': { manualFlags: { OUT_OF_STOCK: { appliedAt: 1 } } } };
    const result = detectMissingWithHistory(currentKeys, hist, thresholds, existing);
    expect(result['code:C'].MISSING_WITH_HISTORY.severity).toBe('warning');
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
export function detectMissingWithHistory(currentItemKeys, historicalData, thresholds, existingFlags) {
  const results = {};
  for (const [itemKey, h] of Object.entries(historicalData || {})) {
    if (currentItemKeys.has(itemKey)) continue;
    if ((h.weeksSinceLastSeen ?? Infinity) > thresholds.missingItemLookbackWeeks) continue;
    const hasManualFlag = existingFlags?.[itemKey]?.manualFlags
      && Object.keys(existingFlags[itemKey].manualFlags).length > 0;
    results[itemKey] = {
      [RULE_IDS.MISSING_WITH_HISTORY]: {
        severity: hasManualFlag ? SEVERITIES.WARNING.id : SEVERITIES.INFO.id,
        score: 40,
        detectedAt: Date.now(),
        sourceRecordId: null,
        details: { weeksSinceLastSeen: h.weeksSinceLastSeen, hasManualFlag },
      },
    };
  }
  return results;
}
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(food-cost): MISSING_WITH_HISTORY detection rule"
```

---

## Task 16: HIGH_FC_PCT rule + composite culprit scorer

**Files:**
- Modify: `services/flag-detection-engine.js`, `tests/flag-detection-engine.test.js`

- [ ] **Step 1: Test**

```javascript
import { detectHighFcPct, scoreCulprit } from '../services/flag-detection-engine.js';

describe('scoreCulprit composite', () => {
  test('returns 0-100 number', () => {
    const s = scoreCulprit(
      { itemKey: 'code:A', usageValue: 200, unitCost: 120 },
      { 'code:A': { unitCostMean: 100, historicalCostShare: 0.1, historicalCostShareStdDev: 0.02 } },
      { totalCurrentCost: 1000 },
    );
    expect(typeof s).toBe('number');
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe('HIGH_FC_PCT', () => {
  const thresholds = {
    foodCostPctWarning: 35, foodCostPctCritical: 40,
    highFcPctCulpritMinScore: 50,
  };
  test('fc% below warning → no flags', () => {
    expect(detectHighFcPct({ foodCostPct: 30, processedItems: [], historicalData: {} }, thresholds)).toEqual({});
  });
  test('fc% between warning and critical → culprits at warning severity', () => {
    const items = [
      { itemKey: 'code:A', usageValue: 800, unitCost: 120 },  // big + spike
      { itemKey: 'code:B', usageValue: 50,  unitCost: 10 },
    ];
    const hist = {
      'code:A': { unitCostMean: 100, historicalCostShare: 0.1, historicalCostShareStdDev: 0.02 },
    };
    const r = detectHighFcPct({ foodCostPct: 37, processedItems: items, historicalData: hist, totalCurrentCost: 1000 }, thresholds);
    expect(r['code:A'].HIGH_FC_PCT.severity).toBe('warning');
    expect(r['code:B']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
export function scoreCulprit(item, historicalData, ctx) {
  const h = historicalData?.[item.itemKey] || {};
  const contribution = ctx.totalCurrentCost > 0
    ? Number(item.usageValue) / ctx.totalCurrentCost : 0;
  const normalizedContribution = Math.min(1, contribution / 0.3);  // cap at 30% share

  const currentShare = contribution;
  const histShare = h.historicalCostShare ?? currentShare;
  const shareStd  = h.historicalCostShareStdDev ?? Math.max(0.01, histShare * 0.2);
  const shareDeviation = Math.min(1, Math.abs(currentShare - histShare) / shareStd / 5);

  const unitCostChange = h.unitCostMean > 0
    ? Math.min(1, Math.max(0, (Number(item.unitCost) - h.unitCostMean) / h.unitCostMean))
    : 0;

  const score = 100 * (0.4 * normalizedContribution + 0.3 * shareDeviation + 0.3 * unitCostChange);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function detectHighFcPct({ foodCostPct, processedItems, historicalData, totalCurrentCost }, thresholds) {
  if (foodCostPct < thresholds.foodCostPctWarning) return {};
  const isCritical = foodCostPct >= thresholds.foodCostPctCritical;
  const severity = isCritical ? SEVERITIES.CRITICAL.id : SEVERITIES.WARNING.id;
  const ctx = { totalCurrentCost };
  const results = {};
  for (const item of processedItems) {
    const score = scoreCulprit(item, historicalData, ctx);
    if (score < thresholds.highFcPctCulpritMinScore) continue;
    results[item.itemKey] = {
      [RULE_IDS.HIGH_FC_PCT]: {
        severity, score,
        detectedAt: Date.now(),
        sourceRecordId: item.__recordId || null,
        details: { foodCostPct, culpritScore: score },
      },
    };
  }
  return results;
}
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(food-cost): HIGH_FC_PCT rule with composite culprit scorer"
```

---

## Task 17: Detection engine — runDetection orchestrator

**Files:**
- Modify: `services/flag-detection-engine.js`, `tests/flag-detection-engine.test.js`

- [ ] **Step 1: Test**

```javascript
import { runDetection } from '../services/flag-detection-engine.js';

describe('runDetection orchestrator', () => {
  test('combines per-item rules under each item key', () => {
    const thresholds = { foodCostPctWarning: 35, foodCostPctCritical: 40, unitCostSpikePct: 15, unitCostSpikeCriticalPct: 30, usageVarianceStdDev: 2, usageVarianceCriticalStdDev: 3, deadStockDaysThreshold: 28, missingItemLookbackWeeks: 4, highFcPctCulpritMinScore: 50 };
    const items = [
      { itemKey: 'code:A', unitCost: 140, usage: 5, closingQty: 2, openingQty: 10, purchaseQty: 0, usageValue: 700 },
    ];
    const hist = { 'code:A': { unitCostMean: 100, unitCostSamples: 5, usageMean: 5, usageStdDev: 1, usageSamples: 5, daysSinceLastUsage: 0, historicalCostShare: 0.3, historicalCostShareStdDev: 0.05 } };
    const result = runDetection({
      foodCostPct: 32, processedItems: items, historicalData: hist,
      existingFlags: {}, totalCurrentCost: 700, thresholds,
    });
    expect(result['code:A'].COST_SPIKE.severity).toBe('critical');
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
export function runDetection({
  foodCostPct, processedItems, historicalData, existingFlags,
  totalCurrentCost, thresholds,
}) {
  const perItem = {};
  const merge = (key, ruleResults) => {
    if (!Object.keys(ruleResults).length) return;
    perItem[key] = { ...(perItem[key] || {}), ...ruleResults };
  };

  for (const item of processedItems) {
    merge(item.itemKey, detectInvalidValues(item));
    merge(item.itemKey, detectCostSpike(item, historicalData, thresholds));
    merge(item.itemKey, detectUsageAnomaly(item, historicalData, thresholds));
    merge(item.itemKey, detectDeadStock(item, historicalData, thresholds));
  }

  const high = detectHighFcPct(
    { foodCostPct, processedItems, historicalData, totalCurrentCost },
    thresholds,
  );
  for (const [k, v] of Object.entries(high)) merge(k, v);

  const currentKeys = new Set(processedItems.map(i => i.itemKey));
  const missing = detectMissingWithHistory(currentKeys, historicalData, thresholds, existingFlags);
  for (const [k, v] of Object.entries(missing)) merge(k, v);

  return perItem;
}
```

- [ ] **Step 4: Run full detection-engine tests, verify pass. Commit**

```bash
git commit -am "feat(food-cost): runDetection orchestrator combining all rules"
```

---

## Task 18: flag-display-merger

**Files:**
- Create: `public/js/modules/food-cost/flag-display-merger.js`
- Create: `public/js/modules/food-cost/tests/flag-display-merger.test.js`

- [ ] **Step 1: Test**

```javascript
import { mergeFlaggedHistoricalItems, computeRowSeverity } from '../flag-display-merger.js';

describe('mergeFlaggedHistoricalItems', () => {
  const current = [
    { itemKey: 'code:A', description: 'Apple', openingQty: 10, usage: 5 },
  ];
  const flags = {
    'code:A': { manualFlags: { INVESTIGATION: { appliedAt: 1 } } },
    'code:B': {
      itemCode: 'B', description: 'Banana', category: 'Produce', costCenter: 'Kitchen',
      manualFlags: { OUT_OF_STOCK: { appliedAt: 1 } },
    },
  };

  test('returns current items when toggle off', () => {
    const out = mergeFlaggedHistoricalItems(current, flags, { showHistorical: false });
    expect(out.length).toBe(1);
  });
  test('injects historical flagged items when toggle on', () => {
    const out = mergeFlaggedHistoricalItems(current, flags, { showHistorical: true });
    expect(out.length).toBe(2);
    const injected = out.find(r => r.itemKey === 'code:B');
    expect(injected.__isHistoricalPlaceholder).toBe(true);
    expect(injected.openingQty).toBe(0);
    expect(injected.usage).toBe(0);
  });
});

describe('computeRowSeverity', () => {
  test('picks highest severity', () => {
    const sev = computeRowSeverity({
      manualFlags: { INVESTIGATION: {} },
      autoFlags: { COST_SPIKE: { severity: 'critical' } },
    });
    expect(sev).toBe('critical');
  });
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
// flag-display-merger.js
import { SEVERITIES, MANUAL_SEVERITY_MAP } from './constants/flag-types.js';

export function computeRowSeverity(flagEntry) {
  if (!flagEntry) return null;
  let maxRank = 0;
  let out = null;
  const consider = (sevId) => {
    const s = Object.values(SEVERITIES).find(v => v.id === sevId);
    if (s && s.rank > maxRank) { maxRank = s.rank; out = sevId; }
  };
  for (const type of Object.keys(flagEntry.manualFlags || {})) {
    consider(MANUAL_SEVERITY_MAP[type]);
  }
  for (const auto of Object.values(flagEntry.autoFlags || {})) {
    consider(auto.severity);
  }
  return out;
}

export function mergeFlaggedHistoricalItems(currentItems, flagsByKey, { showHistorical }) {
  if (!showHistorical) return currentItems;
  const currentKeys = new Set(currentItems.map(i => i.itemKey));
  const historical = [];
  for (const [itemKey, entry] of Object.entries(flagsByKey || {})) {
    if (currentKeys.has(itemKey)) continue;
    if (!computeRowSeverity(entry)) continue;   // only inject if any active flag
    historical.push({
      itemKey,
      itemCode: entry.itemCode || '',
      description: entry.description || '',
      category: entry.category || '',
      costCenter: entry.costCenter || '',
      openingQty: 0, closingQty: 0, purchaseQty: 0,
      usage: 0, unitCost: 0, usageValue: 0,
      __isHistoricalPlaceholder: true,
    });
  }
  return [...currentItems, ...historical];
}
```

- [ ] **Step 4: Run, verify pass. Commit**

```bash
git add public/js/modules/food-cost/flag-display-merger.js public/js/modules/food-cost/tests/flag-display-merger.test.js
git commit -m "feat(food-cost): flag-display-merger with severity rollup"
```

---

## Task 19: Detection orchestration on upload

**Files:**
- Modify: `public/js/modules/food-cost/index.js`
- Modify: `public/js/modules/food-cost/tests/flag-flow.integration.test.js` (create)

- [ ] **Step 1: Write integration test**

```javascript
import { runFlagPipeline } from '../index.js';
// Uses Firebase emulator; seeds historical data and a processed record

test('upload pipeline writes auto flags, runs auto-clear, returns merged view', async () => {
  // seed historical: item A has mean unitCost 100
  // seed manual flag OUT_OF_STOCK on item B
  // processed: item A @ unitCost 140, item B not present
  const result = await runFlagPipeline({
    locationId: 'LOC1', recordId: 'REC_X',
    processedItems: [{ itemKey: 'code:A', unitCost: 140, usage: 5, openingQty: 10, closingQty: 2, purchaseQty: 0, usageValue: 700, itemCode: 'A', description: 'Apple', category: 'P', costCenter: 'K' }],
    foodCostPct: 30, totalCurrentCost: 700,
    historicalData: { 'code:A': { unitCostMean: 100, unitCostSamples: 5, usageMean: 5, usageStdDev: 1, usageSamples: 5 } },
  });
  expect(result.autoFlagsWritten['code:A'].COST_SPIKE).toBeDefined();
  expect(result.cleared.length).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement in index.js**

Add (preserving existing exports):

```javascript
import * as flagService from './services/flag-service.js';
import { runDetection } from './services/flag-detection-engine.js';

export async function runFlagPipeline({
  locationId, recordId, processedItems,
  foodCostPct, totalCurrentCost, historicalData,
}) {
  const thresholds = await flagService.getThresholds(locationId);
  const existingFlags = await flagService.getFlagsForLocation(locationId);
  const cleared = await flagService.runAutoClear(locationId, processedItems);

  const perItemFlags = runDetection({
    foodCostPct, processedItems, historicalData,
    existingFlags, totalCurrentCost, thresholds,
  });

  const autoFlagsWritten = {};
  for (const [itemKey, flags] of Object.entries(perItemFlags)) {
    const itemMeta = processedItems.find(p => p.itemKey === itemKey)
      || { itemCode: existingFlags[itemKey]?.itemCode, description: existingFlags[itemKey]?.description, category: existingFlags[itemKey]?.category, costCenter: existingFlags[itemKey]?.costCenter };
    await flagService.writeAutoFlags(locationId, itemKey, { itemMeta, recordId, flags });
    autoFlagsWritten[itemKey] = flags;
  }
  return { autoFlagsWritten, cleared };
}

window.FoodCost = window.FoodCost || {};
window.FoodCost.runFlagPipeline = runFlagPipeline;
window.FoodCost.flagService = flagService;
```

Hook the pipeline into the existing post-upload flow — find where `saveStockUsageData` is called (likely in `setup.js` or `refactored-app-component.js`) and invoke `runFlagPipeline` after save. Keep a try/catch so a flag failure doesn't block the save.

- [ ] **Step 4: Run integration test, verify pass. Commit**

```bash
git add public/js/modules/food-cost/index.js public/js/modules/food-cost/tests/flag-flow.integration.test.js
git commit -m "feat(food-cost): orchestrate flag pipeline on upload"
```

---

## Task 20: Wire pipeline call after saveStockUsageData

**Files:**
- Modify: `public/js/modules/food-cost/refactored-app-component.js` (or wherever `saveStockUsageData` is invoked — search first)

- [ ] **Step 1: Locate call site**

```bash
grep -n "saveStockUsageData" public/js/modules/food-cost -r
```

- [ ] **Step 2: Add pipeline invocation**

After the existing save completes successfully:

```javascript
try {
  await window.FoodCost.runFlagPipeline({
    locationId: this.selectedLocationId,
    recordId: savedRecordId,
    processedItems: this.stockData,
    foodCostPct: this.foodCostPercentage,
    totalCurrentCost: this.totalCostValue,
    historicalData: await this.historicalUsageService.getSummaryByItemKey(this.selectedLocationId),
  });
} catch (err) {
  console.error('Flag pipeline failed (non-blocking):', err);
}
```

Note: `historicalUsageService.getSummaryByItemKey` does not exist yet. Add it in this task as a thin method on `historical-usage-service.js`:

```javascript
// append to historical-usage-service.js
export async function getSummaryByItemKey(locationId, { lookbackWeeks = 12 } = {}) {
  const records = await fetchRecentStockRecords(locationId, lookbackWeeks);  // existing helper
  const byKey = {};
  const now = Date.now();
  for (const rec of records) {
    for (const item of rec.stockItems || []) {
      if (!item.itemKey) continue;
      const b = byKey[item.itemKey] ||= {
        itemCode: item.itemCode, description: item.description, category: item.category, costCenter: item.costCenter,
        unitCosts: [], usages: [], lastUsageAt: 0, firstSeenAt: rec.timestamp, costShares: [],
      };
      if (Number(item.unitCost) > 0) b.unitCosts.push(Number(item.unitCost));
      b.usages.push(Number(item.usage) || 0);
      if (Number(item.usage) > 0) b.lastUsageAt = Math.max(b.lastUsageAt, new Date(rec.timestamp).getTime());
    }
  }
  // compute means/stddev
  const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const std  = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
  const out = {};
  for (const [k, b] of Object.entries(byKey)) {
    out[k] = {
      itemCode: b.itemCode, description: b.description, category: b.category, costCenter: b.costCenter,
      unitCostMean: mean(b.unitCosts), unitCostSamples: b.unitCosts.length,
      usageMean: mean(b.usages), usageStdDev: std(b.usages), usageSamples: b.usages.length,
      daysSinceLastUsage: b.lastUsageAt ? Math.floor((now - b.lastUsageAt) / 86400000) : Infinity,
      weeksSinceLastSeen: Math.floor((now - new Date(b.firstSeenAt).getTime()) / (7 * 86400000)),
      historicalCostShare: 0,            // compute if needed; 0 is a safe default for scorer
      historicalCostShareStdDev: 0.02,
    };
  }
  return out;
}
```

If `fetchRecentStockRecords` doesn't exist under that name, use the equivalent existing helper in `historical-usage-service.js` (it already queries stockUsage records).

- [ ] **Step 3: Manually smoke-test** by uploading a file in a dev build, checking `stockItemFlags/{loc}` in RTDB.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(food-cost): invoke flag pipeline after stock record save"
```

---

## Task 21: Top tab navigation in food cost module

**Files:**
- Modify: `public/admin-dashboard.html` (around line 1225 inside `#foodCostContent`)

- [ ] **Step 1: Wrap existing body in nav-tabs**

Replace the section inside `#foodCostContent` (keep the header + version block untouched) with:

```html
<div id="foodCostContent" class="content-section dashboard-content d-none">
  <div class="section-header">
    <h2>Food Cost Management</h2>
    <p class="text-muted">Track and analyze stock usage across multiple locations</p>
    <small class="text-muted" id="food-cost-version">Loading version...</small>
    <span id="food-cost-flag-summary" class="ms-2 badge bg-secondary" style="display:none;"></span>
  </div>

  <ul class="nav nav-tabs mt-3" id="foodCostTabs" role="tablist">
    <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#fcStockPane" type="button" role="tab">Stock Data</button></li>
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#fcOrdersPane" type="button" role="tab">Orders</button></li>
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#fcFlagsPane" type="button" role="tab">Flags <span id="fcFlagsCountBadge" class="badge bg-danger ms-1" style="display:none;">0</span></button></li>
    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#fcAnalyticsPane" type="button" role="tab">Analytics</button></li>
  </ul>

  <div class="tab-content pt-3">
    <div class="tab-pane fade show active" id="fcStockPane" role="tabpanel">
      <!-- existing food-cost-app mount point moves here -->
      <div id="food-cost-app"></div>
    </div>
    <div class="tab-pane fade" id="fcOrdersPane" role="tabpanel">
      <div id="food-cost-orders-app"></div>
    </div>
    <div class="tab-pane fade" id="fcFlagsPane" role="tabpanel">
      <div id="food-cost-flags-app"></div>
    </div>
    <div class="tab-pane fade" id="fcAnalyticsPane" role="tabpanel">
      <div id="food-cost-analytics-app"></div>
    </div>
  </div>
</div>
```

Move any existing children of the old `#foodCostContent` body into `#fcStockPane`. Leave the version-detection script block in place.

- [ ] **Step 2: Manually open the admin dashboard → Food Cost menu → confirm four tabs appear and switching works (tabs are empty aside from Stock Data for now).**

- [ ] **Step 3: Commit**

```bash
git add public/admin-dashboard.html
git commit -m "feat(food-cost): add top-level tabs (Stock Data / Orders / Flags / Analytics)"
```

---

## Task 22: Wire unresolved flag count badge

**Files:**
- Modify: `public/js/modules/food-cost/setup.js`

- [ ] **Step 1: Add badge refresh logic**

```javascript
import { getFlagsForLocation } from './services/flag-service.js';
import { computeRowSeverity } from './flag-display-merger.js';

export async function refreshFlagCountBadge(locationId) {
  const flags = await getFlagsForLocation(locationId);
  let critical = 0, warning = 0;
  for (const entry of Object.values(flags)) {
    const sev = computeRowSeverity(entry);
    if (sev === 'critical') critical++;
    else if (sev === 'warning') warning++;
  }
  const badge = document.getElementById('fcFlagsCountBadge');
  const summary = document.getElementById('food-cost-flag-summary');
  const total = critical + warning;
  if (badge) {
    badge.style.display = total ? 'inline-block' : 'none';
    badge.textContent = String(total);
    badge.className = `badge ms-1 ${critical ? 'bg-danger' : 'bg-warning text-dark'}`;
  }
  if (summary) {
    summary.style.display = total ? 'inline-block' : 'none';
    summary.textContent = `${total} flag${total === 1 ? '' : 's'} • ${critical} critical`;
  }
}

window.FoodCost = window.FoodCost || {};
window.FoodCost.refreshFlagCountBadge = refreshFlagCountBadge;
```

Call `refreshFlagCountBadge(currentLocationId)` on: (a) module init, (b) after pipeline run, (c) after any manual flag apply/resolve.

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(food-cost): flag count badge in tab nav + header"
```

---

## Task 23: FlagBadge component

**Files:**
- Create: `public/js/modules/food-cost/components/flags/FlagBadge.js`
- Create: `public/js/modules/food-cost/tests/flag-badge.test.js`

- [ ] **Step 1: Test**

```javascript
import { renderFlagBadgeCluster } from '../components/flags/FlagBadge.js';

test('renders one pill per active flag', () => {
  const html = renderFlagBadgeCluster({
    manualFlags: { OUT_OF_STOCK: {}, OFF_MENU: {} },
    autoFlags: { COST_SPIKE: { severity: 'critical' } },
  });
  expect(html).toMatch(/bg-danger/);
  expect(html).toMatch(/OUT OF STOCK/i);
  expect(html).toMatch(/COST SPIKE/i);
});
test('returns empty string for no flags', () => {
  expect(renderFlagBadgeCluster({})).toBe('');
});
```

- [ ] **Step 2: Verify fail**

- [ ] **Step 3: Implement**

```javascript
// components/flags/FlagBadge.js
import { SEVERITIES, MANUAL_SEVERITY_MAP } from '../../constants/flag-types.js';
import { escapeHtml } from '../../utilities.js';  // verify export name

function pill(label, severityId, title) {
  const sev = Object.values(SEVERITIES).find(s => s.id === severityId) || SEVERITIES.INFO;
  return `<span class="badge ${sev.colorClass} me-1" title="${escapeHtml(title || label)}">${escapeHtml(label)}</span>`;
}

export function renderFlagBadgeCluster(flagEntry) {
  if (!flagEntry) return '';
  const pills = [];
  for (const [type, data] of Object.entries(flagEntry.manualFlags || {})) {
    const label = (type === 'CUSTOM' && data.customLabel) ? data.customLabel : type.replace(/_/g, ' ');
    pills.push(pill(label, MANUAL_SEVERITY_MAP[type], type));
  }
  for (const [rule, data] of Object.entries(flagEntry.autoFlags || {})) {
    pills.push(pill(rule.replace(/_/g, ' '), data.severity, rule));
  }
  return pills.join('');
}
```

- [ ] **Step 4: Verify `escapeHtml` is exported from `utilities.js`:**

```bash
grep -n "export.*escapeHtml" public/js/modules/food-cost/utilities.js
```

If it isn't, add it.

- [ ] **Step 5: Commit**

```bash
git add public/js/modules/food-cost/components/flags/FlagBadge.js public/js/modules/food-cost/tests/flag-badge.test.js
git commit -m "feat(food-cost): FlagBadge cluster component"
```

---

## Task 24: Flag column in EditableStockDataTable

**Files:**
- Modify: `public/js/modules/food-cost/components/tables/EditableStockDataTable.js`

- [ ] **Step 1: Add Flags column to the table header and row template**

Locate the column definitions. Add a new column between "Description" and "Opening Qty":

```javascript
import { renderFlagBadgeCluster } from '../flags/FlagBadge.js';

// in column spec
{ key: 'flags', label: 'Flags', width: '160px', sortable: false,
  render: (item, ctx) => {
    const entry = ctx.flagsByKey?.[item.itemKey];
    const cluster = renderFlagBadgeCluster(entry);
    const btn = `<button class="btn btn-sm btn-outline-secondary js-flag-edit" data-item-key="${item.itemKey}">+</button>`;
    return `<div class="d-flex align-items-center">${cluster}${btn}</div>`;
  }
},
```

Pass `flagsByKey` through the table's render context from the parent component (load once via `getFlagsForLocation` and cache; refresh on flag mutations).

Placeholder rows (`__isHistoricalPlaceholder: true`) render with `class="table-secondary"` applied at the `<tr>`:

```javascript
// row renderer
const rowClass = item.__isHistoricalPlaceholder ? 'table-secondary' : '';
```

- [ ] **Step 2: Add click handler for `.js-flag-edit`** that opens `FlagTagModal` (next task).

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(food-cost): flag column + historical row styling in stock table"
```

---

## Task 25: FlagTagModal component

**Files:**
- Create: `public/js/modules/food-cost/components/flags/FlagTagModal.js`

- [ ] **Step 1: Implement using SweetAlert2 (per project convention)**

```javascript
// components/flags/FlagTagModal.js
import Swal from 'sweetalert2';  // verify project import pattern
import { MANUAL_FLAG_TYPES, MANUAL_SEVERITY_MAP, SEVERITIES } from '../../constants/flag-types.js';
import { applyManualFlag, removeManualFlag } from '../../services/flag-service.js';
import { escapeHtml } from '../../utilities.js';

export async function openFlagTagModal({ locationId, item, currentEntry, userUid, onChange }) {
  const active = new Set(Object.keys(currentEntry?.manualFlags || {}));
  const checkboxes = Object.keys(MANUAL_FLAG_TYPES).map(type => {
    const checked = active.has(type) ? 'checked' : '';
    const sevClass = Object.values(SEVERITIES).find(s => s.id === MANUAL_SEVERITY_MAP[type])?.colorClass || '';
    return `
      <label class="d-flex align-items-center mb-2">
        <input type="checkbox" class="form-check-input me-2 js-flag-type" value="${type}" ${checked}>
        <span class="badge ${sevClass} me-2">${type.replace(/_/g,' ')}</span>
      </label>`;
  }).join('');

  const { isConfirmed, value } = await Swal.fire({
    title: `Flags — ${escapeHtml(item.description || item.itemCode || item.itemKey)}`,
    html: `
      <div class="text-start">
        ${checkboxes}
        <hr>
        <label>Note (optional)</label>
        <textarea id="flagNote" class="form-control" rows="2"></textarea>
        <label class="mt-2">Custom label (if CUSTOM checked)</label>
        <input id="flagCustomLabel" class="form-control" maxlength="40">
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Save',
    preConfirm: () => {
      const selected = Array.from(document.querySelectorAll('.js-flag-type:checked')).map(i => i.value);
      return {
        selected,
        note: document.getElementById('flagNote').value || null,
        customLabel: document.getElementById('flagCustomLabel').value.trim() || null,
      };
    },
  });
  if (!isConfirmed) return;

  const now = Date.now();
  const target = new Set(value.selected);
  // additions
  for (const type of target) {
    if (active.has(type)) continue;
    await applyManualFlag(locationId, item.itemKey, type, {
      appliedBy: userUid, note: value.note,
      ...(type === 'CUSTOM' ? { customLabel: value.customLabel } : {}),
    });
  }
  // removals
  for (const type of active) {
    if (target.has(type)) continue;
    await removeManualFlag(locationId, item.itemKey, type);
  }
  onChange?.();
}
```

- [ ] **Step 2: Wire handler** in the stock table click-binding code:

```javascript
tableEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.js-flag-edit');
  if (!btn) return;
  const itemKey = btn.dataset.itemKey;
  const item = this.stockData.find(i => i.itemKey === itemKey) || { itemKey };
  await openFlagTagModal({
    locationId: this.selectedLocationId, item,
    currentEntry: this.flagsByKey?.[itemKey],
    userUid: this.currentUser.uid,
    onChange: () => this.reloadFlagsAndRerender(),
  });
});
```

- [ ] **Step 3: Manually test** — click + in a flag cell, tick OUT_OF_STOCK, save, confirm badge renders.

- [ ] **Step 4: Commit**

```bash
git add public/js/modules/food-cost/components/flags/FlagTagModal.js
git commit -m "feat(food-cost): flag tag modal for manual flag apply/remove"
```

---

## Task 26: "Show flagged historical items" toggle

**Files:**
- Modify: `public/js/modules/food-cost/components/tables/EditableStockDataTable.js`
- Modify: toolbar owner (likely `refactored-app-component.js`)

- [ ] **Step 1: Add toolbar control**

In the stock table toolbar:

```html
<div class="form-check form-switch">
  <input class="form-check-input" type="checkbox" id="fcShowHistoricalFlagged">
  <label class="form-check-label" for="fcShowHistoricalFlagged">Show flagged historical items</label>
</div>
```

- [ ] **Step 2: Wire toggle**

```javascript
import { mergeFlaggedHistoricalItems } from '../../flag-display-merger.js';

this.showHistoricalFlagged = false;
document.getElementById('fcShowHistoricalFlagged').addEventListener('change', (e) => {
  this.showHistoricalFlagged = e.target.checked;
  this.renderTable();
});

renderTable() {
  const rows = mergeFlaggedHistoricalItems(
    this.stockData, this.flagsByKey, { showHistorical: this.showHistoricalFlagged }
  );
  this.tableComponent.setRows(rows);
}
```

- [ ] **Step 3: Manually test:** apply OUT_OF_STOCK to an item, then upload a file that excludes it, toggle on — it appears as greyed row.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(food-cost): 'show flagged historical items' toggle"
```

---

## Task 27: FlagsDashboard — list + filters

**Files:**
- Create: `public/js/modules/food-cost/components/flags/FlagsDashboard.js`

- [ ] **Step 1: Implement list view**

```javascript
// components/flags/FlagsDashboard.js
import { getFlagsForLocation, resolveFlag } from '../../services/flag-service.js';
import { renderFlagBadgeCluster } from './FlagBadge.js';
import { computeRowSeverity } from '../../flag-display-merger.js';
import { SEVERITIES } from '../../constants/flag-types.js';
import { escapeHtml } from '../../utilities.js';

export class FlagsDashboard {
  constructor(containerId, { locationId, userUid, onChange }) {
    this.container = document.getElementById(containerId);
    this.locationId = locationId;
    this.userUid = userUid;
    this.onChange = onChange;
    this.filters = { severity: 'all', source: 'all', text: '' };
  }

  async load() {
    this.flags = await getFlagsForLocation(this.locationId);
    this.render();
  }

  render() {
    const rows = Object.entries(this.flags || {})
      .filter(([, e]) => this.matchesFilter(e))
      .map(([itemKey, entry]) => ({ itemKey, entry, severity: computeRowSeverity(entry) }))
      .filter(r => r.severity)
      .sort((a, b) => (rankOf(b.severity) - rankOf(a.severity)));

    const critCount = rows.filter(r => r.severity === 'critical').length;
    const warnCount = rows.filter(r => r.severity === 'warning').length;
    const infoCount = rows.filter(r => r.severity === 'info').length;

    this.container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <span class="badge bg-danger me-2">${critCount} Critical</span>
          <span class="badge bg-warning text-dark me-2">${warnCount} Warning</span>
          <span class="badge bg-info text-dark">${infoCount} Info</span>
        </div>
        <div>
          <button class="btn btn-sm btn-primary js-rerun-detection">Re-run detection</button>
          <button class="btn btn-sm btn-outline-secondary js-open-config">Settings</button>
        </div>
      </div>
      <div class="mb-3 d-flex gap-2">
        <select class="form-select form-select-sm js-filter-severity" style="width:auto">
          <option value="all">All severities</option>
          <option value="critical">Critical only</option>
          <option value="warning">Warning+</option>
        </select>
        <select class="form-select form-select-sm js-filter-source" style="width:auto">
          <option value="all">All sources</option>
          <option value="manual">Manual only</option>
          <option value="auto">Auto only</option>
        </select>
        <input class="form-control form-control-sm js-filter-text" placeholder="Search items…" style="max-width:240px">
      </div>
      <table class="table table-sm table-hover">
        <thead><tr><th>Item</th><th>Flags</th><th>Last Seen</th><th></th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${escapeHtml(r.entry.description || r.itemKey)}<br><small class="text-muted">${escapeHtml(r.entry.category || '')}</small></td>
              <td>${renderFlagBadgeCluster(r.entry)}</td>
              <td>${r.entry.lastSeenAt ? new Date(r.entry.lastSeenAt).toLocaleDateString('en-ZA') : '—'}</td>
              <td>
                <button class="btn btn-sm btn-outline-primary js-view-detail" data-item-key="${r.itemKey}">View</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
    this.bindEvents();
  }

  matchesFilter(entry) {
    if (this.filters.severity === 'critical' && computeRowSeverity(entry) !== 'critical') return false;
    if (this.filters.severity === 'warning' && !['critical','warning'].includes(computeRowSeverity(entry))) return false;
    if (this.filters.source === 'manual' && !Object.keys(entry.manualFlags || {}).length) return false;
    if (this.filters.source === 'auto' && !Object.keys(entry.autoFlags || {}).length) return false;
    if (this.filters.text && !(entry.description || '').toLowerCase().includes(this.filters.text.toLowerCase())) return false;
    return true;
  }

  bindEvents() {
    this.container.querySelector('.js-filter-severity').addEventListener('change', e => { this.filters.severity = e.target.value; this.render(); });
    this.container.querySelector('.js-filter-source').addEventListener('change', e => { this.filters.source = e.target.value; this.render(); });
    this.container.querySelector('.js-filter-text').addEventListener('input', e => { this.filters.text = e.target.value; this.render(); });
  }
}

function rankOf(sev) { return Object.values(SEVERITIES).find(s => s.id === sev)?.rank ?? 0; }
```

- [ ] **Step 2: Mount in `#food-cost-flags-app`** from `setup.js` when the Flags tab is first activated. Use `shown.bs.tab` event so data loads lazily.

- [ ] **Step 3: Commit**

```bash
git add public/js/modules/food-cost/components/flags/FlagsDashboard.js
git commit -m "feat(food-cost): Flags dashboard list + filters"
```

---

## Task 28: FlagDetailDrawer + resolve action

**Files:**
- Create: `public/js/modules/food-cost/components/flags/FlagDetailDrawer.js`

- [ ] **Step 1: Implement offcanvas drawer**

```javascript
// components/flags/FlagDetailDrawer.js
import { resolveFlag } from '../../services/flag-service.js';
import { escapeHtml } from '../../utilities.js';
import Swal from 'sweetalert2';

export async function openFlagDetail({ locationId, itemKey, entry, userUid, onChange }) {
  const { value: reason, isConfirmed } = await Swal.fire({
    title: escapeHtml(entry.description || itemKey),
    html: `
      <div class="text-start">
        <h6>Active flags</h6>
        <ul>
          ${Object.keys(entry.manualFlags || {}).map(t => `<li>${escapeHtml(t)} (manual)</li>`).join('')}
          ${Object.entries(entry.autoFlags || {}).map(([t, d]) => `<li>${escapeHtml(t)} — ${escapeHtml(d.severity)} (auto)</li>`).join('')}
        </ul>
        <h6>Resolved history</h6>
        <ul>
          ${Object.values(entry.resolvedFlags || {}).map(r => `<li>${escapeHtml(r.flagType)} — ${new Date(r.resolvedAt).toLocaleDateString('en-ZA')} ${escapeHtml(r.reason || '')}</li>`).join('') || '<li class="text-muted">none</li>'}
        </ul>
        <label>Resolve reason (optional)</label>
        <textarea id="resolveReason" class="form-control"></textarea>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Resolve all active',
    preConfirm: () => document.getElementById('resolveReason').value || null,
  });
  if (!isConfirmed) return;
  const activeTypes = [
    ...Object.keys(entry.manualFlags || {}),
    ...Object.keys(entry.autoFlags || {}),
  ];
  for (const t of activeTypes) {
    await resolveFlag(locationId, itemKey, t, { resolvedBy: userUid, reason });
  }
  onChange?.();
}
```

- [ ] **Step 2: Wire `.js-view-detail` in FlagsDashboard** to call `openFlagDetail`.

- [ ] **Step 3: Commit**

```bash
git add public/js/modules/food-cost/components/flags/FlagDetailDrawer.js
git commit -m "feat(food-cost): flag detail drawer with resolve-all action"
```

---

## Task 29: Re-run detection button

**Files:**
- Modify: `components/flags/FlagsDashboard.js`, `setup.js`

- [ ] **Step 1: Wire `.js-rerun-detection`**

```javascript
this.container.querySelector('.js-rerun-detection').addEventListener('click', async () => {
  if (!window.FoodCost?.currentProcessingContext) {
    Swal.fire('No data loaded', 'Load a stock file first.', 'info');
    return;
  }
  const ctx = window.FoodCost.currentProcessingContext;
  await window.FoodCost.runFlagPipeline(ctx);
  await this.load();
  this.onChange?.();
});
```

Add `window.FoodCost.currentProcessingContext` stashing in Task 20 where the pipeline runs initially (store the last-used argument bundle).

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(food-cost): re-run detection button in Flags tab"
```

---

## Task 30: FlagConfigPanel

**Files:**
- Create: `public/js/modules/food-cost/components/flags/FlagConfigPanel.js`

- [ ] **Step 1: Implement**

```javascript
// components/flags/FlagConfigPanel.js
import { rtdb, ref, get, set } from '../../../../config/firebase-config.js';
import { DEFAULT_THRESHOLDS } from '../../services/flag-service.js';
import Swal from 'sweetalert2';

export async function openFlagConfigPanel({ locationId, userUid, isAdmin, isLocationOwner }) {
  if (!isAdmin && !isLocationOwner) {
    return Swal.fire('Permission denied', 'Only owners/admins edit flag thresholds.', 'warning');
  }
  const snap = await get(ref(rtdb, `stockFlagConfig/${locationId}/thresholds`));
  const current = { ...DEFAULT_THRESHOLDS, ...(snap.val() || {}) };

  const fields = Object.entries(current).map(([k, v]) =>
    `<div class="mb-2"><label class="form-label">${k}</label><input id="cfg_${k}" class="form-control" type="number" step="0.01" value="${v}"></div>`
  ).join('');

  const { isConfirmed, value } = await Swal.fire({
    title: 'Flag thresholds',
    html: `<div class="text-start">${fields}</div>`,
    showCancelButton: true,
    preConfirm: () => {
      const out = {};
      Object.keys(current).forEach(k => {
        out[k] = Number(document.getElementById(`cfg_${k}`).value);
      });
      return out;
    },
  });
  if (!isConfirmed) return;
  await set(ref(rtdb, `stockFlagConfig/${locationId}/thresholds`), {
    ...value, updatedBy: userUid, updatedAt: Date.now(),
  });
}
```

- [ ] **Step 2: Wire `.js-open-config` in FlagsDashboard** to call `openFlagConfigPanel`.

- [ ] **Step 3: Commit**

```bash
git add public/js/modules/food-cost/components/flags/FlagConfigPanel.js
git commit -m "feat(food-cost): per-location flag threshold settings panel"
```

---

## Task 31: Analytics tab resurfacing

**Files:**
- Modify: `public/admin-dashboard.html`, `public/js/modules/food-cost/setup.js`

- [ ] **Step 1: On first activation of `#fcAnalyticsPane`, dynamically import and mount the existing analytics dashboard**

```javascript
// setup.js
document.querySelector('[data-bs-target="#fcAnalyticsPane"]').addEventListener('shown.bs.tab', async () => {
  if (window.__fcAnalyticsMounted) return;
  const { mountAnalyticsDashboard } = await import('./analytics-dashboard.js');
  mountAnalyticsDashboard('food-cost-analytics-app');
  window.__fcAnalyticsMounted = true;
});
```

If `analytics-dashboard.js` doesn't have a `mountAnalyticsDashboard` export, add a thin one that calls its existing init function against a container element. Do not modify analytics internals.

- [ ] **Step 2: Smoke-test:** switch to Analytics tab, verify dashboard renders.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(food-cost): re-surface analytics dashboard in new Analytics tab"
```

---

## Task 32: Orders tab relocation

**Files:**
- Modify: files owning the existing purchase order modal / panel

- [ ] **Step 1: Locate existing Orders UI**

```bash
grep -rn "purchase-order\|poModal\|purchaseOrder" public/js/modules/food-cost --include="*.js" -l
```

- [ ] **Step 2: Mount existing purchase order component into `#food-cost-orders-app`**

If it's currently a modal triggered from a button, keep the button but also add a persistent panel view in the Orders tab. Reuse the component, don't fork it.

- [ ] **Step 3: Smoke-test, commit**

```bash
git commit -am "feat(food-cost): Orders tab hosts purchase order workflow"
```

---

## Task 33: Pre-submit flag warning in Orders

**Files:**
- Modify: `public/js/modules/food-cost/components/purchase-order/po-modal.js`

- [ ] **Step 1: Inject warning step before PO submit**

```javascript
import { getFlagsForLocation } from '../../services/flag-service.js';
import { renderFlagBadgeCluster } from '../flags/FlagBadge.js';
import Swal from 'sweetalert2';

async function warnIfFlaggedItems(locationId, draftOrderItems) {
  const flags = await getFlagsForLocation(locationId);
  const flagged = draftOrderItems.filter(i => flags[i.itemKey]);
  if (!flagged.length) return true;
  const rows = flagged.map(i =>
    `<tr><td>${i.description}</td><td>${renderFlagBadgeCluster(flags[i.itemKey])}</td></tr>`
  ).join('');
  const { isConfirmed } = await Swal.fire({
    icon: 'warning',
    title: `${flagged.length} flagged item${flagged.length === 1 ? '' : 's'} in draft`,
    html: `<table class="table table-sm">${rows}</table>`,
    showCancelButton: true,
    confirmButtonText: 'Submit anyway',
  });
  return isConfirmed;
}

// call in submit flow, before the existing commit
const ok = await warnIfFlaggedItems(locationId, orderDraft.items);
if (!ok) return;
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat(food-cost): warn when draft PO contains flagged items"
```

---

## Task 34: E2E journey

**Files:**
- Create: `tests/e2e/food-cost-flags.spec.js`

- [ ] **Step 1: Write Playwright test**

```javascript
// tests/e2e/food-cost-flags.spec.js
import { test, expect } from '@playwright/test';

test('flag lifecycle: apply, see badge, switch tabs, resolve', async ({ page }) => {
  await page.goto('/admin-dashboard.html');
  // login via test fixture
  await page.click('#foodCostMenu');
  await page.click('[data-bs-target="#fcStockPane"]');

  // upload a known test CSV via the upload input (fixture)
  await page.setInputFiles('input[type=file]', 'tests/fixtures/stock-sample.csv');
  await page.waitForSelector('.js-flag-edit');

  // open flag modal on first row, tick OUT_OF_STOCK, save
  await page.click('.js-flag-edit >> nth=0');
  await page.check('input[value="OUT_OF_STOCK"]');
  await page.click('.swal2-confirm');

  // badge should render in row
  await expect(page.locator('.badge', { hasText: /OUT OF STOCK/i })).toBeVisible();

  // switch to Flags tab
  await page.click('[data-bs-target="#fcFlagsPane"]');
  await expect(page.locator('#food-cost-flags-app table')).toContainText('OUT OF STOCK');

  // open detail drawer + resolve
  await page.click('.js-view-detail >> nth=0');
  await page.click('.swal2-confirm');

  // badge gone back on stock tab
  await page.click('[data-bs-target="#fcStockPane"]');
  await expect(page.locator('.badge', { hasText: /OUT OF STOCK/i })).toHaveCount(0);
});
```

- [ ] **Step 2: Run:**

```bash
npx playwright test tests/e2e/food-cost-flags.spec.js
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/food-cost-flags.spec.js
git commit -m "test(food-cost): E2E flag lifecycle journey"
```

---

## Task 35: Documentation + rollout checklist

**Files:**
- Create: `KNOWLEDGE BASE/FOOD_COST_FLAG_SYSTEM.md`
- Modify: `CLAUDE.md` Knowledge Base table (add row)

- [ ] **Step 1: Write user-facing doc**

Content: overview, flag types table, how auto-clear works, how to adjust thresholds, screenshots placeholders.

- [ ] **Step 2: Add to CLAUDE.md Knowledge Base table:**

```markdown
| Flag system for food cost | `KNOWLEDGE BASE/FOOD_COST_FLAG_SYSTEM.md` |
```

- [ ] **Step 3: Deploy checklist (run manually during rollout window):**

1. `firebase deploy --only database` — new rules
2. Seed `stockFlagConfig/_defaults/thresholds` via admin console snippet from Task 4
3. `npm run build && firebase deploy --only hosting`
4. Verify: open admin dashboard → Food Cost → four tabs present → upload test file → auto-flags appear → manual tag → resolve
5. Monitor `stockFlagAudit/{locationId}` for first week; tune thresholds via Flags → Settings if noisy

- [ ] **Step 4: Commit**

```bash
git add KNOWLEDGE\ BASE/FOOD_COST_FLAG_SYSTEM.md CLAUDE.md
git commit -m "docs(food-cost): user guide for flag system + rollout checklist"
```

---

## Summary of Commits

Final branch has ~35 commits across 8 phases. Each task is self-contained and can be reviewed/reverted independently. Merge to `master` only after all tests pass and manual smoke test succeeds in dev deploy.
