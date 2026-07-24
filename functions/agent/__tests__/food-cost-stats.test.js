'use strict';

/**
 * T2 (D2) — CJS port tests for functions/agent/food-cost/stats.js.
 *
 * Two layers (design §7):
 *  1. Golden parity: the port's calculateItemStatistics output deep-equals the
 *     itemStatistics slice of food-cost-golden.json (generated from the LIVE
 *     browser module — see fixtures/food-cost-golden-generator.test.js).
 *     Comparison contract is exact deep JSON equality: the golden was written
 *     via JSON.parse(JSON.stringify(...)) (Dates → ISO strings), so the port's
 *     output is serialized identically before comparing.
 *  2. Named characterization tests pinning the design §6 quirk register
 *     (Q15, GT9, GT5, F7, P2, P8) — each cites its tag.
 */

const inputs = require('./fixtures/food-cost-golden-inputs.js');
const golden = require('./fixtures/food-cost-golden.json');
const {
  calculateItemStatistics,
  getEmptyStatistics,
} = require('../food-cost/stats.js');

const { PINNED_NOW_MS, scenarios } = inputs;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Serialize exactly like the golden generator did (Dates → ISO strings). */
const toJson = (v) => JSON.parse(JSON.stringify(v));

/** Minimal persisted-shape record for characterization inputs. */
function rec(over = {}) {
  return {
    timestamp: Date.UTC(2026, 6, 13, 8), // Monday 2026-07-13 08:00 UTC
    periodDays: 7,
    stockItems: [],
    ...over,
  };
}

describe('food-cost stats port — golden parity (design §7.1)', () => {
  it.each(Object.keys(scenarios))(
    'port matches committed golden stats: %s',
    (name) => {
      const scenario = scenarios[name];
      const stats = calculateItemStatistics(
        scenario.records,
        scenario.item.itemCode,
        { now: PINNED_NOW_MS }
      );
      expect(toJson(stats)).toEqual(golden[name].stats);
    }
  );

  it('port matches golden stats for the NO-unitCost-field item (GT1, missingCost.noCostFieldItem)', () => {
    const scenario = scenarios.missingCost;
    const stats = calculateItemStatistics(
      scenario.records,
      scenario.itemNoCost.itemCode,
      { now: PINNED_NOW_MS }
    );
    expect(toJson(stats)).toEqual(golden.missingCost.noCostFieldItem.stats);
  });
});

describe('food-cost stats port — characterizations (design §6)', () => {
  it('Q15: simple average INCLUDES negative usage; !usage recompute guard does NOT fire for negative (truthy) values', () => {
    // design §6 Q15 — negative persisted usage reaches RTDB. The simple
    // average includes negatives. (The time-weighted average's Q9 exclusion
    // is T3 order-calc territory — NOT asserted here.)
    const records = [
      rec({
        timestamp: Date.UTC(2026, 6, 6, 8),
        stockItems: [
          // If the `!usage` recompute guard fired, usage would recompute to
          // opening + purchases - closing = 10 + 0 - 0 = 10. It must stay -5:
          // -5 is truthy, so the guard does not fire (hus:219).
          { itemCode: 'N1', usage: -5, openingQty: 10, purchaseQty: 0, closingQty: 0 },
        ],
      }),
      rec({
        timestamp: Date.UTC(2026, 6, 13, 8),
        stockItems: [{ itemCode: 'N1', usage: 15 }],
      }),
    ];
    const stats = calculateItemStatistics(records, 'N1', { now: PINNED_NOW_MS });
    expect(stats.dataPoints).toBe(2);
    expect(stats.raw[0].usage).toBe(-5); // guard did NOT recompute to 10
    // Simple mean includes the negative point: ((-5/7) + (15/7)) / 2 = 5/7.
    expect(stats.avgDailyUsage).toBe(((-5 / 7) + (15 / 7)) / 2);
  });

  it('GT9: object-keyed stockItems branch — itemCode-keyed object is found (byte-faithful)', () => {
    // design §3 GT9 — the object branch is ported verbatim.
    const records = [
      rec({ stockItems: { A100: { itemCode: 'A100', usage: 14 } } }),
    ];
    const stats = calculateItemStatistics(records, 'A100', { now: PINNED_NOW_MS });
    expect(stats.dataPoints).toBe(1);
    expect(stats.raw[0].usage).toBe(14);
  });

  it('GT9: RTDB sparse-array coercion (numeric-index keys) — itemCode lookup silently MISSES', () => {
    // design §3 GT9 — the only object shape real data takes is sparse-array
    // coercion; stockItems[itemCode] looks a CODE up against INDICES → miss.
    // Quirk preserved, not fixed.
    const records = [
      rec({
        stockItems: {
          0: { itemCode: 'A100', usage: 14 },
          1: { itemCode: 'B200', usage: 9 },
        },
      }),
    ];
    const stats = calculateItemStatistics(records, 'A100', { now: PINNED_NOW_MS });
    // itemData empty → _getEmptyStatistics() with NO itemCode arg (hus:288).
    expect(toJson(stats)).toEqual(toJson(getEmptyStatistics()));
    expect(stats.itemCode).toBe('');
  });

  it('GT9: small-integer itemCode against numeric-index keys returns the WRONG item (quirk preserved)', () => {
    // design §3 GT9 — "…or a wrong item for small-integer codes".
    const records = [
      rec({
        stockItems: {
          0: { itemCode: '7', usage: 3 },
          1: { itemCode: '999', usage: 50 },
        },
      }),
    ];
    const stats = calculateItemStatistics(records, '1', { now: PINNED_NOW_MS });
    expect(stats.dataPoints).toBe(1);
    expect(stats.raw[0].usage).toBe(50); // item at KEY '1', despite itemCode '999'
  });

  it('GT5: any throw inside the body → _getEmptyStatistics(itemCode) shape', () => {
    // design §3 GT5 — the whole-body try/catch converts ANY throw into the
    // empty-statistics shape (hus:320-323), WITH the itemCode threaded in.
    const evil = [
      {
        get stockItems() {
          throw new Error('boom');
        },
      },
    ];
    const stats = calculateItemStatistics(evil, 'X9', { now: PINNED_NOW_MS });
    expect(stats).toEqual(getEmptyStatistics('X9'));
    expect(stats).toEqual({
      itemCode: 'X9',
      dataPoints: 0,
      avgDailyUsage: 0,
      stdDevUsage: 0,
      volatility: 0,
      trend: { slope: 0, direction: 'stable' },
      dowPatterns: null,
      firstDate: null,
      lastDate: null,
      raw: [],
    });
  });

  it('GT5: non-array records that pass the truthiness check (no .forEach) → empty stats, never throws', () => {
    // design §3 GT5 — a truthy non-array with .length reaches .forEach → throw
    // → caught → empty stats.
    const stats = calculateItemStatistics({ length: 3 }, 'X9', {
      now: PINNED_NOW_MS,
    });
    expect(stats).toEqual(getEmptyStatistics('X9'));
  });

  it('F7: malformed stockItems (string / number / null / absent) — never throws, item just not found in that record', () => {
    // design §7.3 F7 — degrades like D1's Array.isArray guard.
    const good = rec({
      timestamp: Date.UTC(2026, 6, 13, 8),
      stockItems: [{ itemCode: 'M1', usage: 7 }],
    });
    const records = [
      rec({ timestamp: Date.UTC(2026, 5, 15, 8), stockItems: 'not-an-array' }),
      rec({ timestamp: Date.UTC(2026, 5, 22, 8), stockItems: 42 }),
      rec({ timestamp: Date.UTC(2026, 5, 29, 8), stockItems: null }),
      { timestamp: Date.UTC(2026, 6, 6, 8), periodDays: 7 }, // stockItems absent
      good,
    ];
    const stats = calculateItemStatistics(records, 'M1', { now: PINNED_NOW_MS });
    expect(stats.dataPoints).toBe(1); // only the good record contributes
    expect(stats.raw[0].usage).toBe(7);
  });

  it('P2: opts.now replaces the Date.now() fallback (hus:266) for records missing timestamp/recordDate — deterministic', () => {
    // design §5.3 P2 — the live code falls back to Date.now(); the port takes
    // now from opts and uses it as that fallback. With a fixed now the result
    // is fully deterministic.
    const records = [
      { periodDays: 7, stockItems: [{ itemCode: 'T1', usage: 14 }] },
    ];
    const a = calculateItemStatistics(records, 'T1', { now: PINNED_NOW_MS });
    const b = calculateItemStatistics(records, 'T1', { now: PINNED_NOW_MS });
    expect(toJson(a)).toEqual(toJson(b));
    expect(a.dataPoints).toBe(1);
    expect(a.firstDate.getTime()).toBe(PINNED_NOW_MS);
    expect(a.lastDate.getTime()).toBe(PINNED_NOW_MS);
  });

  it('P8: weekday bucketing is SAST (UTC+2) — Friday 23:00 UTC buckets as SATURDAY', () => {
    // design §5.3 P8 — weekday = new Date(ts + 2*3600e3).getUTCDay().
    // 23:00 UTC Friday = 01:00 SAST Saturday. The golden's timestamps are
    // 08:00 UTC (same calendar day in both zones) so parity holds regardless;
    // this test pins the intended zone behaviour for edge-of-day timestamps.
    const FRI_2300_UTC = Date.UTC(2026, 3, 3, 23); // 2026-04-03, a Friday
    expect(new Date(FRI_2300_UTC).getUTCDay()).toBe(5); // sanity: Friday in UTC
    const records = Array.from({ length: 14 }, (_, i) =>
      rec({
        timestamp: FRI_2300_UTC + i * 7 * DAY_MS, // 14 consecutive Fridays 23:00 UTC
        periodDays: 1,
        stockItems: [{ itemCode: 'P8', usage: 5 }],
      })
    );
    const stats = calculateItemStatistics(records, 'P8', { now: PINNED_NOW_MS });
    expect(stats.dataPoints).toBe(14);
    expect(stats.dowPatterns).not.toBeNull();
    expect(stats.dowPatterns.saturday.dataPoints).toBe(14);
    expect(stats.dowPatterns.friday.dataPoints).toBe(0);
  });
});
