import { describe, it, expect } from 'vitest';
import { summariseFoodCost } from '../food-cost-summary.js';

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
      { itemCode: 'A', description: 'beef',    closingQty: 0,  usagePerDay: 2 },
      { itemCode: 'B', description: 'cheese',  closingQty: 4,  usagePerDay: 2 },
      { itemCode: 'C', description: 'oil',     closingQty: 70, usagePerDay: 2 },
      { itemCode: 'D', description: 'salt',    closingQty: 5,  usagePerDay: 0 },
    ] })], { now: NOW, lowCoverDays: 7 });
    expect(out.itemsAnalysed).toBe(4);
    expect(out.lowStockCount).toBe(2);
    expect(out.lowStockItems.map((i) => i.itemCode)).toEqual(['A', 'B']);
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
