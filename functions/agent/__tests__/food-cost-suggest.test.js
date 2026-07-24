'use strict';

/**
 * T4 (D2) — tests for functions/agent/food-cost/suggest.js (pure orchestrator).
 *
 * Contract under test: design docs/plans/2026-07-24-ross-foodcost-d2-calculator-design.md
 * §5.2 (model-facing output shape), §5.3 P4/P5/P6, GT7 (params resolution),
 * §6 Q16 (inclusion filter), §8 (bounded output / anti-enumeration no-data shape).
 *
 * Orchestration semantics mirror the live entry point
 * public/js/modules/food-cost/order-calculator-advanced.js:432-606
 * (supplier filter → criticality → advanced-vs-basic branch on dataPoints >= 2
 * → orderQty > 0 inclusion) WITHOUT its I/O (P3).
 *
 * Oracle note (deviation from "golden end-to-end" — reason documented in the
 * task report): the golden fixtures ran the chain against each scenario's
 * separate `item`, whereas suggestOrder's current items come from the LATEST
 * record's stockItems — the two item shapes differ (closingQty etc.), so golden
 * end-to-end equality is structurally impossible. Instead, end-to-end
 * consistency is asserted against the ALREADY-PROVEN T2/T3 ported modules
 * (stats.js + order-calc.js — themselves golden-parity-tested), fed the exact
 * inputs suggestOrder feeds them.
 */

const fs = require('node:fs');
const path = require('node:path');
const inputs = require('./fixtures/food-cost-golden-inputs.js');
const { calculateItemStatistics } = require('../food-cost/stats.js');
const {
  calculateCriticalityScore,
  calculateHistoricalConfidence,
  calculateAdvancedOrderDetails,
} = require('../food-cost/order-calc.js');
const { suggestOrder } = require('../food-cost/suggest.js');

const { PINNED_NOW_MS, scenarios } = inputs;
const NOW = PINNED_NOW_MS; // 2026-07-20T08:00:00Z (Monday 10:00 SAST)
const DAY_MS = 24 * 60 * 60 * 1000;

const TOP_LEVEL_KEYS = [
  'asOf',
  'caveats',
  'dataAgeDays',
  'hasData',
  'historyDepth',
  'items',
  'params',
  'totals',
  'truncated',
];
const PARAMS_KEYS = [
  'coveringDays',
  'criticalItemBuffer',
  'daysToNextDelivery',
  'safetyStockPercentage',
  'source',
];
const HISTORY_DEPTH_KEYS = [
  'advancedCalculations',
  'basicCalculations',
  'itemsWithHistory',
  'records',
];
const TOTALS_KEYS = ['estimatedTotalCost', 'itemsToOrder', 'itemsWithUnknownCost'];
// §5.2 per-item keys WITHOUT the optional confidence field (Q14).
const ITEM_KEYS = [
  'calculationType',
  'criticalityReason',
  'currentStock',
  'description',
  'estimatedCost',
  'isCritical',
  'itemCode',
  'orderQty',
  'requiredStock',
  'stockStatus',
  'supplierName',
  'unitCost',
  'usagePerDay',
];

/** Orderable stock item: closingQty 0 + usagePerDay 5 always orders (basic). */
function item(over = {}) {
  return {
    itemCode: 'IT-1',
    description: 'Test Widget',
    category: 'Dry Goods',
    supplierName: 'Acme Foods',
    unit: 'ea',
    openingQty: 35,
    purchaseQty: 0,
    closingQty: 0,
    usage: 35,
    usagePerDay: 5,
    unitCost: 10,
    ...over,
  };
}

/** Minimal persisted stockUsage record (no calc params unless supplied). */
function rec(over = {}) {
  return {
    timestamp: NOW - 2 * DAY_MS,
    periodDays: 7,
    stockItems: [item()],
    ...over,
  };
}

/** The calc params suggestOrder builds internally (GT7 + live advanced:484-494 + P2). */
function calcParams(over = {}) {
  return {
    orderCycle: 7,
    daysToNextDelivery: 7,
    coveringDays: 2,
    safetyStockPercentage: 20,
    criticalItemBuffer: 30,
    volatilityMultiplier: 1.0,
    trendFactor: 0.5,
    useDayOfWeekPatterns: true,
    now: NOW,
    ...over,
  };
}

describe('suggestOrder — no-data shape (§5.2 / anti-enumeration §8)', () => {
  it('empty records → bare {hasData:false}, deep-equal to the adapter no-access return', () => {
    const res = suggestOrder([], { now: NOW });
    expect(res).toEqual({ hasData: false });
    expect(Object.keys(res)).toEqual(['hasData']); // NO extra fields
  });

  it('null / undefined records → {hasData:false}', () => {
    expect(suggestOrder(null, { now: NOW })).toEqual({ hasData: false });
    expect(suggestOrder(undefined, { now: NOW })).toEqual({ hasData: false });
  });

  it('latest record with absent stockItems → {hasData:false}', () => {
    expect(suggestOrder([{ timestamp: NOW - DAY_MS, periodDays: 7 }], { now: NOW }))
      .toEqual({ hasData: false });
  });

  it('latest record with non-array stockItems (GT9 shape) is treated as empty → {hasData:false}', () => {
    expect(suggestOrder([rec({ stockItems: { 'IT-1': item() } })], { now: NOW }))
      .toEqual({ hasData: false });
    expect(suggestOrder([rec({ stockItems: 'garbage' })], { now: NOW }))
      .toEqual({ hasData: false });
  });

  it('latest record with empty stockItems array → {hasData:false}', () => {
    expect(suggestOrder([rec({ stockItems: [] })], { now: NOW })).toEqual({ hasData: false });
  });

  it('non-object record entries are dropped before latest selection', () => {
    expect(suggestOrder(['junk', 42, null], { now: NOW })).toEqual({ hasData: false });
  });
});

describe('suggestOrder — §5.2 output shape exactness', () => {
  const res = suggestOrder([rec()], { now: NOW });

  it('top level carries exactly the §5.2 keys', () => {
    expect(res.hasData).toBe(true);
    expect(Object.keys(res).sort()).toEqual(TOP_LEVEL_KEYS);
  });

  it('params / historyDepth / totals carry exactly their §5.2 keys', () => {
    expect(Object.keys(res.params).sort()).toEqual(PARAMS_KEYS);
    expect(Object.keys(res.historyDepth).sort()).toEqual(HISTORY_DEPTH_KEYS);
    expect(Object.keys(res.totals).sort()).toEqual(TOTALS_KEYS);
  });

  it('items carry exactly the §5.2 per-item keys (confidence absent off the ≥5-point path)', () => {
    expect(res.items).toHaveLength(1);
    expect(Object.keys(res.items[0]).sort()).toEqual(ITEM_KEYS);
  });

  it('asOf is the latest timestamp; dataAgeDays floors the day delta', () => {
    expect(res.asOf).toBe(NOW - 2 * DAY_MS);
    expect(res.dataAgeDays).toBe(2);
  });

  it('truncated is null and caveats [] on a small healthy result', () => {
    expect(res.truncated).toBeNull();
    expect(res.caveats).toEqual([]);
  });

  it('numeric per-item fields are numbers, not the calculators’ 2dp strings', () => {
    const it0 = res.items[0];
    expect(typeof it0.currentStock).toBe('number');
    expect(typeof it0.usagePerDay).toBe('number');
    expect(typeof it0.orderQty).toBe('number');
    expect(Number.isInteger(it0.orderQty)).toBe(true);
    expect(typeof it0.requiredStock).toBe('number');
    expect(typeof it0.unitCost).toBe('number');
    expect(typeof it0.estimatedCost).toBe('number');
  });

  it('records passed unsorted still resolve the newest record as latest', () => {
    const older = rec({ timestamp: NOW - 9 * DAY_MS, stockItems: [item({ usage: 70, usagePerDay: 10 })] });
    const newest = rec({ timestamp: NOW - 2 * DAY_MS });
    const out = suggestOrder([newest, older], { now: NOW }); // newest FIRST in input
    expect(out.asOf).toBe(NOW - 2 * DAY_MS);
    expect(out.dataAgeDays).toBe(2);
  });
});

describe('suggestOrder — GT7 params resolution + source provenance', () => {
  it('caller-provided daysToNextDelivery wins and source = caller', () => {
    const res = suggestOrder([rec({ daysToNextDelivery: 3 })], { now: NOW, daysToNextDelivery: 5 });
    expect(res.params).toEqual({
      daysToNextDelivery: 5,
      coveringDays: 2,
      safetyStockPercentage: 20,
      criticalItemBuffer: 30,
      source: 'caller',
    });
  });

  it('record values used when caller silent, source = record', () => {
    const res = suggestOrder(
      [rec({ daysToNextDelivery: 3, safetyStockPercentage: 25, criticalItemBuffer: 40 })],
      { now: NOW }
    );
    expect(res.params).toEqual({
      daysToNextDelivery: 3,
      coveringDays: 2,
      safetyStockPercentage: 25,
      criticalItemBuffer: 40,
      source: 'record',
    });
  });

  it('absent everywhere → live defaults 7/20/30, source = default', () => {
    const res = suggestOrder([rec()], { now: NOW });
    expect(res.params).toEqual({
      daysToNextDelivery: 7,
      coveringDays: 2,
      safetyStockPercentage: 20,
      criticalItemBuffer: 30,
      source: 'default',
    });
  });

  it('GT7 MANDATE: 0 is ||-falsy — persisted zeros fall back to 7/20/30 and source = default', () => {
    const res = suggestOrder(
      [rec({ daysToNextDelivery: 0, safetyStockPercentage: 0, criticalItemBuffer: 0 })],
      { now: NOW }
    );
    expect(res.params).toEqual({
      daysToNextDelivery: 7,
      coveringDays: 2,
      safetyStockPercentage: 20,
      criticalItemBuffer: 30,
      source: 'default',
    });
  });

  it('caller value beats a record zero → source = caller', () => {
    const res = suggestOrder([rec({ daysToNextDelivery: 0 })], { now: NOW, daysToNextDelivery: 4 });
    expect(res.params.daysToNextDelivery).toBe(4);
    expect(res.params.source).toBe('caller');
  });

  it('coveringDays is ALWAYS 2 (never stored — GT7), even if a record carries one', () => {
    const res = suggestOrder([rec({ coveringDays: 10 })], { now: NOW });
    expect(res.params.coveringDays).toBe(2);
  });

  it('params actually feed the calculation (longer delivery horizon → bigger order)', () => {
    const short = suggestOrder([rec()], { now: NOW, daysToNextDelivery: 3 });
    const long = suggestOrder([rec()], { now: NOW, daysToNextDelivery: 14 });
    expect(long.items[0].orderQty).toBeGreaterThan(short.items[0].orderQty);
  });
});

describe('suggestOrder — P4 defensive cost gating (GT1)', () => {
  const noCost = item({ itemCode: 'F2', unitCost: 999 });
  delete noCost.unitCost; // legacy round-trip shape: NO unitCost field at all
  const records = [
    rec({
      stockItems: [
        item({ itemCode: 'F1', unitCost: 5, hasMissingUnitCost: true }), // stale-flag direction
        noCost,
        item({ itemCode: 'F3', unitCost: '5' }), // string
        item({ itemCode: 'F4', unitCost: NaN }),
        item({ itemCode: 'F5', unitCost: 0 }),
        item({ itemCode: 'F6', unitCost: -3 }),
        item({ itemCode: 'F7', unitCost: 12.5 }), // healthy
      ],
    }),
  ];
  const res = suggestOrder(records, { now: NOW });
  const byCode = Object.fromEntries(res.items.map((i) => [i.itemCode, i]));

  it.each(['F1', 'F2', 'F3', 'F4', 'F5', 'F6'])(
    'unknown-cost item %s → unitCost AND estimatedCost both null',
    (code) => {
      expect(byCode[code]).toBeDefined();
      expect(byCode[code].unitCost).toBeNull();
      expect(byCode[code].estimatedCost).toBeNull();
    }
  );

  it('healthy item keeps its cost and estimatedCost = round(orderQty × unitCost, 2dp)', () => {
    const healthy = byCode.F7;
    expect(healthy.unitCost).toBe(12.5);
    expect(healthy.orderQty).toBeGreaterThan(0);
    expect(healthy.estimatedCost).toBe(Math.round(healthy.orderQty * 12.5 * 100) / 100);
  });

  it('unknown-cost items are counted and EXCLUDED from estimatedTotalCost', () => {
    expect(res.totals.itemsWithUnknownCost).toBe(6);
    expect(res.totals.estimatedTotalCost).toBe(byCode.F7.estimatedCost);
  });

  it('caveat names the unknown-cost count', () => {
    expect(res.caveats).toContain('costs-unavailable-for-6-items');
  });

  it('no unknown-cost caveat when every cost is known', () => {
    const clean = suggestOrder([rec()], { now: NOW });
    expect(clean.caveats).toEqual([]);
    expect(clean.totals.itemsWithUnknownCost).toBe(0);
  });
});

describe('suggestOrder — P5 input caps', () => {
  it('a 2001-item record is capped at 2000 processed + items-truncated-for-size caveat', () => {
    const big = Array.from({ length: 2001 }, (_, i) =>
      item({ itemCode: `C${i}`, unitCost: 1 })
    );
    const res = suggestOrder([rec({ stockItems: big })], { now: NOW });
    // All 2000 surviving items are orderable; the 2001st never enters.
    expect(res.totals.itemsToOrder).toBe(2000);
    expect(res.truncated).toEqual({ itemCount: 2000 });
    expect(res.items).toHaveLength(30);
    expect(res.caveats).toContain('items-truncated-for-size');
  });

  it('10,000 total cap truncates OLDEST records first; current (newest) items are untouched', () => {
    // latest: 40 current items incl. TRACER + CONTROL.
    const current = [
      item({ itemCode: 'TRACER', unitCost: 2 }),
      item({ itemCode: 'CONTROL', unitCost: 2 }),
      ...Array.from({ length: 38 }, (_, i) => item({ itemCode: `CF${i}`, unitCost: 1 })),
    ];
    const junk = (tag) =>
      Array.from({ length: 2000 }, (_, i) => ({ itemCode: `J${tag}-${i}`, usage: 1, usagePerDay: 1 }));
    // Budget (newest-first): latest 40 → 9,960; four mid records 4×2,000 = 8,000
    // → 1,960 left; the OLDEST record keeps only its first 1,960 items.
    const oldestItems = junk('old');
    oldestItems[0] = item({ itemCode: 'CONTROL', usage: 42, usagePerDay: 6 }); // kept (index 0)
    oldestItems[1995] = item({ itemCode: 'TRACER', usage: 42, usagePerDay: 6 }); // dropped (index ≥ 1960)
    const records = [
      rec({ timestamp: NOW - 12 * DAY_MS, stockItems: oldestItems }),
      rec({ timestamp: NOW - 10 * DAY_MS, stockItems: junk('a') }),
      rec({ timestamp: NOW - 8 * DAY_MS, stockItems: junk('b') }),
      rec({ timestamp: NOW - 6 * DAY_MS, stockItems: junk('c') }),
      rec({ timestamp: NOW - 4 * DAY_MS, stockItems: junk('d') }),
      rec({ timestamp: NOW - 2 * DAY_MS, stockItems: current }),
    ];
    const res = suggestOrder(records, { now: NOW });
    expect(res.caveats).toContain('items-truncated-for-size');
    expect(res.totals.itemsToOrder).toBe(40); // current list untouched
    const byCode = Object.fromEntries(res.items.map((i) => [i.itemCode, i]));
    // CONTROL kept its history point in the oldest record → 2 dataPoints → advanced.
    expect(byCode.CONTROL.calculationType).toBe('advanced');
    // TRACER's history point sat past the truncation boundary → 1 dataPoint → basic.
    expect(byCode.TRACER.calculationType).toBe('basic');
  });
});

describe('suggestOrder — P6 output string hygiene', () => {
  it('description truncated to 120 chars', () => {
    const res = suggestOrder(
      [rec({ stockItems: [item({ description: 'A'.repeat(121) })] })],
      { now: NOW }
    );
    expect(res.items[0].description).toBe('A'.repeat(120));
  });

  it('control characters stripped from description', () => {
    const res = suggestOrder(
      [rec({ stockItems: [item({ description: 'Bad\x00\x01\x1FName\x7F!' })] })],
      { now: NOW }
    );
    expect(res.items[0].description).toBe('BadName!');
  });

  it('supplierName gets the same truncate + strip treatment', () => {
    const res = suggestOrder(
      [rec({ stockItems: [item({ supplierName: `S\x00${'y'.repeat(125)}` })] })],
      { now: NOW }
    );
    expect(res.items[0].supplierName).toBe(`S${'y'.repeat(119)}`);
    expect(res.items[0].supplierName).toHaveLength(120);
  });

  it('criticalityReason (carries tenant category text) is P6-treated too', () => {
    const res = suggestOrder(
      [rec({ stockItems: [item({ isCritical: true, category: 'Dairy\x00Goods' })] })],
      { now: NOW }
    );
    expect(res.items[0].isCritical).toBe(true);
    // eslint-disable-next-line no-control-regex
    expect(res.items[0].criticalityReason).not.toMatch(/[\x00-\x1F\x7F]/);
  });
});

describe('suggestOrder — supplierFilter substring semantics (F2/F7)', () => {
  const twoSuppliers = [
    rec({
      stockItems: [
        item({ itemCode: 'A1', supplierName: 'Acme Foods' }),
        item({ itemCode: 'B1', supplierName: 'Bidfood SA' }),
      ],
    }),
  ];

  it('case-insensitive substring hit', () => {
    const res = suggestOrder(twoSuppliers, { now: NOW, supplierFilter: 'ACME' });
    expect(res.items.map((i) => i.itemCode)).toEqual(['A1']);
  });

  it('substring may match several suppliers', () => {
    const res = suggestOrder(twoSuppliers, { now: NOW, supplierFilter: 'food' });
    expect(res.items.map((i) => i.itemCode).sort()).toEqual(['A1', 'B1']);
  });

  it('regex metacharacters are LITERAL — ".*" matches nothing', () => {
    const res = suggestOrder(twoSuppliers, { now: NOW, supplierFilter: '.*' });
    expect(res.hasData).toBe(true);
    expect(res.items).toEqual([]);
    expect(res.totals.itemsToOrder).toBe(0);
  });

  it('literal dots DO match a supplier that really contains them', () => {
    const res = suggestOrder(
      [rec({ stockItems: [item({ itemCode: 'D1', supplierName: 'A.C.M.E Traders' })] })],
      { now: NOW, supplierFilter: '.c.m' }
    );
    expect(res.items.map((i) => i.itemCode)).toEqual(['D1']);
  });

  it('missing/empty supplierName is EXCLUDED when a filter is active (live advanced:513-515)', () => {
    const noSupplier = item({ itemCode: 'N1' });
    delete noSupplier.supplierName;
    const records = [
      rec({ stockItems: [noSupplier, item({ itemCode: 'E1', supplierName: '' }), item({ itemCode: 'A1' })] }),
    ];
    const filtered = suggestOrder(records, { now: NOW, supplierFilter: 'acme' });
    expect(filtered.items.map((i) => i.itemCode)).toEqual(['A1']);
  });

  it('missing supplierName is INCLUDED when no filter is active', () => {
    const noSupplier = item({ itemCode: 'N1' });
    delete noSupplier.supplierName;
    const res = suggestOrder([rec({ stockItems: [noSupplier] })], { now: NOW });
    expect(res.items.map((i) => i.itemCode)).toEqual(['N1']);
    expect(res.items[0].supplierName).toBe('');
  });
});

describe('suggestOrder — Q16 inclusion + 30-item cap + sort contract', () => {
  it('only items with orderQty > 0 are included (Q16)', () => {
    const records = [
      rec({
        stockItems: [
          item({ itemCode: 'NEED' }),
          // Plenty of stock, tiny usage → no order needed.
          item({ itemCode: 'FULL', closingQty: 1000, usagePerDay: 1, usage: 7 }),
        ],
      }),
    ];
    const res = suggestOrder(records, { now: NOW });
    expect(res.items.map((i) => i.itemCode)).toEqual(['NEED']);
    expect(res.totals.itemsToOrder).toBe(1);
  });

  it('suggest.js carries the mandated Q16 comment at the inclusion filter', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'food-cost', 'suggest.js'), 'utf8');
    expect(src).toMatch(/Q16/);
  });

  it('31 orderable items → 30 returned + truncated marker with the FULL count', () => {
    const many = Array.from({ length: 31 }, (_, i) => item({ itemCode: `M${i}`, unitCost: 1 }));
    const res = suggestOrder([rec({ stockItems: many })], { now: NOW });
    expect(res.items).toHaveLength(30);
    expect(res.truncated).toEqual({ itemCount: 31 });
    expect(res.totals.itemsToOrder).toBe(31);
  });

  it('sort: critical first, then estimatedCost desc, nulls last within each group', () => {
    const noCost = item({ itemCode: 'S5' });
    delete noCost.unitCost;
    const critNoCost = item({ itemCode: 'S6', isCritical: true });
    delete critNoCost.unitCost;
    const records = [
      rec({
        stockItems: [
          item({ itemCode: 'S1', isCritical: true, unitCost: 1 }),
          item({ itemCode: 'S2', isCritical: true, unitCost: 50 }),
          item({ itemCode: 'S3', unitCost: 100 }),
          item({ itemCode: 'S4', unitCost: 2 }),
          noCost,
          critNoCost,
        ],
      }),
    ];
    const res = suggestOrder(records, { now: NOW });
    expect(res.items.map((i) => i.itemCode)).toEqual(['S2', 'S1', 'S6', 'S3', 'S4', 'S5']);
  });

  it('deterministic tiebreak: equal criticality + equal cost sorts by itemCode asc', () => {
    const records = [
      rec({ stockItems: [item({ itemCode: 'T2' }), item({ itemCode: 'T1' })] }),
    ];
    const res = suggestOrder(records, { now: NOW });
    expect(res.items.map((i) => i.itemCode)).toEqual(['T1', 'T2']);
  });
});

describe('suggestOrder — stockStatus derivation', () => {
  it('basic path (no calculator stockStatus): stockout / low / ok from advanced:272-274 thresholds', () => {
    const records = [
      rec({
        stockItems: [
          item({ itemCode: 'BS', closingQty: 0 }),
          item({ itemCode: 'BL', closingQty: 5 }), // 5 < 5*2
          item({ itemCode: 'BO', closingQty: 12 }), // 12 >= 10, still orders
        ],
      }),
    ];
    const res = suggestOrder(records, { now: NOW });
    const byCode = Object.fromEntries(res.items.map((i) => [i.itemCode, i]));
    expect(byCode.BS.calculationType).toBe('basic');
    expect(byCode.BS.stockStatus).toBe('stockout');
    expect(byCode.BL.stockStatus).toBe('low');
    expect(byCode.BO.stockStatus).toBe('ok');
  });

  it('advanced path: statuses come from the calculator stockStatus object', () => {
    const older = rec({
      timestamp: NOW - 9 * DAY_MS,
      stockItems: [
        item({ itemCode: 'AS' }),
        item({ itemCode: 'AL' }),
        item({ itemCode: 'AO' }),
      ],
    });
    const latest = rec({
      stockItems: [
        item({ itemCode: 'AS', closingQty: 0 }),
        item({ itemCode: 'AL', closingQty: 5 }),
        item({ itemCode: 'AO', closingQty: 12 }),
      ],
    });
    const res = suggestOrder([older, latest], { now: NOW });
    const byCode = Object.fromEntries(res.items.map((i) => [i.itemCode, i]));
    expect(byCode.AS.calculationType).toBe('advanced');
    expect(byCode.AS.stockStatus).toBe('stockout');
    expect(byCode.AL.stockStatus).toBe('low');
    expect(byCode.AO.stockStatus).toBe('ok');
  });
});

describe('suggestOrder — usagePerDay is the PERSISTED value, not the blended internal one', () => {
  it('history far above current usage does not leak into the reported usagePerDay', () => {
    const older = rec({
      timestamp: NOW - 9 * DAY_MS,
      stockItems: [item({ usage: 140, usagePerDay: 20 })],
    });
    const res = suggestOrder([older, rec()], { now: NOW });
    expect(res.items[0].calculationType).toBe('advanced');
    expect(res.items[0].usagePerDay).toBe(5); // persisted, NOT the ~8.6 blend
  });
});

describe('suggestOrder — confidence (Q14) + end-to-end consistency with the proven T2/T3 chain', () => {
  // Wrap of the golden confidence5plus scenario: 6 weekly records; the latest
  // record's stockItems become the current items. Item 11413 has 6 dataPoints
  // (>= 5) → advanced path WITH confidence.
  const records = scenarios.confidence5plus.records;
  const res = suggestOrder(records, { now: NOW });
  const found = res.items.find((i) => i.itemCode === '11413');

  it('≥5-point advanced item is present with a confidence field', () => {
    expect(found).toBeDefined();
    expect(found.calculationType).toBe('advanced');
    expect(typeof found.confidence).toBe('number');
    expect(found.confidence).toBeGreaterThan(0);
    expect(found.confidence).toBeLessThanOrEqual(1);
    expect(Object.keys(found).sort()).toEqual([...ITEM_KEYS, 'confidence'].sort());
  });

  it('end-to-end numbers match the proven ported chain fed the same inputs', () => {
    const latest = records[records.length - 1];
    const current = latest.stockItems.find((i) => i.itemCode === '11413');
    const stats = calculateItemStatistics(records, '11413', { now: NOW });
    expect(stats.dataPoints).toBe(6);
    // GT7: fixture records persist daysToNextDelivery 3 / 20 / 30.
    const params = calcParams({ daysToNextDelivery: 3 });
    const criticality = calculateCriticalityScore(current, stats, params);
    const adv = calculateAdvancedOrderDetails(
      { ...current, isCritical: criticality.isCritical },
      stats,
      params
    );
    expect(res.params).toEqual({
      daysToNextDelivery: 3,
      coveringDays: 2,
      safetyStockPercentage: 20,
      criticalItemBuffer: 30,
      source: 'record',
    });
    expect(found.orderQty).toBe(parseInt(adv.orderResults.recommendedOrderQty, 10));
    expect(found.requiredStock).toBe(parseFloat(adv.orderResults.requiredStock));
    expect(found.isCritical).toBe(criticality.isCritical);
    const conf = calculateHistoricalConfidence(stats, parseFloat(current.usagePerDay) || 0);
    expect(found.confidence).toBe(Math.round(conf.overall * 100) / 100);
  });

  it('historyDepth counts PROCESSED items (both lattice items have 6-point history)', () => {
    expect(res.historyDepth).toEqual({
      records: 6,
      itemsWithHistory: 2, // 11413 + the 99999 filler
      advancedCalculations: 2, // both took the advanced branch...
      basicCalculations: 0,
    });
    // ...but the filler does not need ordering, so it is not in items (Q16).
    expect(res.items.map((i) => i.itemCode)).toEqual(['11413']);
  });

  it('2-point advanced item (Q14: dataPoints 2-4) carries NO confidence key', () => {
    const older = rec({ timestamp: NOW - 9 * DAY_MS });
    const out = suggestOrder([older, rec()], { now: NOW });
    expect(out.items[0].calculationType).toBe('advanced');
    expect('confidence' in out.items[0]).toBe(false);
    expect(Object.keys(out.items[0]).sort()).toEqual(ITEM_KEYS);
  });
});

describe('suggestOrder — determinism + purity', () => {
  it('two calls with the same inputs deep-equal', () => {
    const records = scenarios.confidence5plus.records;
    const a = suggestOrder(records, { now: NOW });
    const b = suggestOrder(records, { now: NOW });
    expect(a).toEqual(b);
  });

  it('does not mutate its inputs', () => {
    const records = [
      rec({ timestamp: NOW - 9 * DAY_MS, stockItems: [item({ isCritical: true })] }),
      rec(),
    ];
    const opts = { now: NOW, daysToNextDelivery: 5, supplierFilter: 'acme' };
    const recordsBefore = JSON.stringify(records);
    const optsBefore = JSON.stringify(opts);
    suggestOrder(records, opts);
    expect(JSON.stringify(records)).toBe(recordsBefore);
    expect(JSON.stringify(opts)).toBe(optsBefore);
  });

  it('malformed stockItems in OLDER records degrade without throwing (F7)', () => {
    const records = [
      rec({ timestamp: NOW - 20 * DAY_MS, stockItems: 'garbage' }),
      rec({ timestamp: NOW - 16 * DAY_MS, stockItems: 42 }),
      rec({ timestamp: NOW - 12 * DAY_MS, stockItems: null }),
      rec({ timestamp: NOW - 9 * DAY_MS, stockItems: { 'IT-1': item() } }),
      rec(),
    ];
    const res = suggestOrder(records, { now: NOW });
    expect(res.hasData).toBe(true);
    expect(res.historyDepth.records).toBe(5);
    expect(res.items).toHaveLength(1);
  });
});
