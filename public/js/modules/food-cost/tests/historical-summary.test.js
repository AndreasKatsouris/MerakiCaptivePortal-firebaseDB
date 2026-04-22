import { describe, test, expect } from 'vitest';
import { summarizeRecordsByItemKey } from '../services/historical-summary.js';

describe('summarizeRecordsByItemKey', () => {
  const now = new Date('2026-04-22T00:00:00Z').getTime();
  const day = 86400000;
  const week = 7 * day;

  test('returns empty object for no records', () => {
    expect(summarizeRecordsByItemKey([], now)).toEqual({});
  });

  test('aggregates unitCost mean from records', () => {
    const records = [
      { timestamp: now - day, stockItems: [{ itemKey: 'code:A', unitCost: 100, usage: 5 }] },
      { timestamp: now - 2 * day, stockItems: [{ itemKey: 'code:A', unitCost: 110, usage: 7 }] },
      { timestamp: now - 3 * day, stockItems: [{ itemKey: 'code:A', unitCost: 120, usage: 6 }] }
    ];
    const summary = summarizeRecordsByItemKey(records, now);
    expect(summary['code:A'].unitCostMean).toBeCloseTo(110, 5);
    expect(summary['code:A'].unitCostSamples).toBe(3);
    expect(summary['code:A'].usageMean).toBeCloseTo(6, 5);
    expect(summary['code:A'].usageSamples).toBe(3);
    expect(summary['code:A'].usageStdDev).toBeGreaterThan(0);
  });

  test('skips zero unitCost from cost mean', () => {
    const records = [
      { timestamp: now - day, stockItems: [{ itemKey: 'code:A', unitCost: 0, usage: 5 }] },
      { timestamp: now - 2 * day, stockItems: [{ itemKey: 'code:A', unitCost: 100, usage: 5 }] }
    ];
    const summary = summarizeRecordsByItemKey(records, now);
    expect(summary['code:A'].unitCostMean).toBe(100);
    expect(summary['code:A'].unitCostSamples).toBe(1);
  });

  test('computes daysSinceLastUsage from latest record with usage > 0', () => {
    const records = [
      { timestamp: now - 5 * day, stockItems: [{ itemKey: 'code:A', unitCost: 100, usage: 3 }] },
      { timestamp: now - 10 * day, stockItems: [{ itemKey: 'code:A', unitCost: 100, usage: 4 }] }
    ];
    const summary = summarizeRecordsByItemKey(records, now);
    expect(summary['code:A'].daysSinceLastUsage).toBe(5);
  });

  test('returns Infinity daysSinceLastUsage when no usage observed', () => {
    const records = [
      { timestamp: now - day, stockItems: [{ itemKey: 'code:A', unitCost: 100, usage: 0 }] }
    ];
    expect(summarizeRecordsByItemKey(records, now)['code:A'].daysSinceLastUsage).toBe(Infinity);
  });

  test('weeksSinceLastSeen reflects most recent appearance', () => {
    const records = [
      { timestamp: now - week, stockItems: [{ itemKey: 'code:A', unitCost: 100, usage: 1 }] },
      { timestamp: now - 3 * week, stockItems: [{ itemKey: 'code:A', unitCost: 100, usage: 1 }] }
    ];
    expect(summarizeRecordsByItemKey(records, now)['code:A'].weeksSinceLastSeen).toBe(1);
  });

  test('preserves item meta from most recent record', () => {
    const records = [
      {
        timestamp: now - 2 * day,
        stockItems: [{ itemKey: 'code:A', itemCode: 'A', description: 'old', category: 'X', costCenter: 'Y' }]
      },
      {
        timestamp: now - day,
        stockItems: [{ itemKey: 'code:A', itemCode: 'A', description: 'new', category: 'P', costCenter: 'K' }]
      }
    ];
    const s = summarizeRecordsByItemKey(records, now)['code:A'];
    expect(s.description).toBe('new');
    expect(s.category).toBe('P');
    expect(s.costCenter).toBe('K');
  });

  test('skips items with no itemKey', () => {
    const records = [
      { timestamp: now - day, stockItems: [{ unitCost: 100, usage: 5 }, { itemKey: 'code:A', unitCost: 50, usage: 1 }] }
    ];
    const summary = summarizeRecordsByItemKey(records, now);
    expect(Object.keys(summary)).toEqual(['code:A']);
  });
});
