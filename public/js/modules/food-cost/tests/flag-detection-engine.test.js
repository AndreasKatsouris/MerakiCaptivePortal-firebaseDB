import { describe, test, expect } from 'vitest';
import {
  detectInvalidValues,
  detectCostSpike,
  detectUsageAnomaly,
  detectDeadStock
} from '../services/flag-detection-engine.js';

describe('INVALID_VALUES', () => {
  test('flags negative closing', () => {
    const flags = detectInvalidValues({
      itemKey: 'code:X',
      closingQty: -1,
      openingQty: 5,
      purchaseQty: 0,
      unitCost: 10
    });
    expect(flags.INVALID_VALUES.severity).toBe('critical');
    expect(flags.INVALID_VALUES.details.reasons).toContain('negativeClosing');
  });

  test('flags closing > opening + purchases', () => {
    const flags = detectInvalidValues({
      itemKey: 'code:X',
      closingQty: 100,
      openingQty: 5,
      purchaseQty: 10,
      unitCost: 10
    });
    expect(flags.INVALID_VALUES.details.reasons).toContain('closingExceedsAvailable');
  });

  test('flags negative unit cost', () => {
    const flags = detectInvalidValues({
      itemKey: 'code:X',
      closingQty: 1,
      openingQty: 5,
      purchaseQty: 0,
      unitCost: -1
    });
    expect(flags.INVALID_VALUES.details.reasons).toContain('negativeUnitCost');
  });

  test('no flag for valid data', () => {
    expect(
      detectInvalidValues({
        itemKey: 'code:X',
        closingQty: 2,
        openingQty: 5,
        purchaseQty: 0,
        unitCost: 10
      })
    ).toEqual({});
  });

  test('score is 100 and sourceRecordId captured', () => {
    const flags = detectInvalidValues({
      itemKey: 'code:X',
      closingQty: -1,
      openingQty: 5,
      purchaseQty: 0,
      unitCost: 10,
      __recordId: 'REC1'
    });
    expect(flags.INVALID_VALUES.score).toBe(100);
    expect(flags.INVALID_VALUES.sourceRecordId).toBe('REC1');
  });
});

describe('COST_SPIKE', () => {
  const thresholds = { unitCostSpikePct: 15, unitCostSpikeCriticalPct: 30 };
  const hist = { 'code:X': { unitCostMean: 100, unitCostSamples: 6 } };

  test('no spike below warning threshold', () => {
    expect(detectCostSpike({ itemKey: 'code:X', unitCost: 105 }, hist, thresholds)).toEqual({});
  });

  test('warning spike (>=15% <30%)', () => {
    const r = detectCostSpike({ itemKey: 'code:X', unitCost: 120 }, hist, thresholds);
    expect(r.COST_SPIKE.severity).toBe('warning');
    expect(r.COST_SPIKE.details.delta).toBeCloseTo(0.2, 5);
  });

  test('critical spike (>=30%)', () => {
    const r = detectCostSpike({ itemKey: 'code:X', unitCost: 140 }, hist, thresholds);
    expect(r.COST_SPIKE.severity).toBe('critical');
  });

  test('no history → no flag', () => {
    expect(detectCostSpike({ itemKey: 'code:Y', unitCost: 1000 }, hist, thresholds)).toEqual({});
  });

  test('insufficient samples → no flag', () => {
    const lowHist = { 'code:X': { unitCostMean: 100, unitCostSamples: 1 } };
    expect(detectCostSpike({ itemKey: 'code:X', unitCost: 200 }, lowHist, thresholds)).toEqual({});
  });
});

describe('USAGE_ANOMALY', () => {
  const thresholds = { usageVarianceStdDev: 2, usageVarianceCriticalStdDev: 3 };
  const hist = { 'code:X': { usageMean: 10, usageStdDev: 2, usageSamples: 8 } };

  test('within 2σ → no flag', () => {
    expect(detectUsageAnomaly({ itemKey: 'code:X', usage: 13 }, hist, thresholds)).toEqual({});
  });

  test('between 2σ and 3σ → warning', () => {
    const r = detectUsageAnomaly({ itemKey: 'code:X', usage: 15 }, hist, thresholds);
    expect(r.USAGE_ANOMALY.severity).toBe('warning');
    expect(r.USAGE_ANOMALY.details.zScore).toBeCloseTo(2.5, 5);
  });

  test('beyond 3σ → critical', () => {
    const r = detectUsageAnomaly({ itemKey: 'code:X', usage: 18 }, hist, thresholds);
    expect(r.USAGE_ANOMALY.severity).toBe('critical');
  });

  test('samples < 3 → no flag (insufficient history)', () => {
    const lowHist = { 'code:X': { usageMean: 10, usageStdDev: 2, usageSamples: 2 } };
    expect(detectUsageAnomaly({ itemKey: 'code:X', usage: 30 }, lowHist, thresholds)).toEqual({});
  });

  test('zero stdDev → no flag (avoid division by zero)', () => {
    const flatHist = { 'code:X': { usageMean: 10, usageStdDev: 0, usageSamples: 8 } };
    expect(detectUsageAnomaly({ itemKey: 'code:X', usage: 30 }, flatHist, thresholds)).toEqual({});
  });
});

describe('DEAD_STOCK', () => {
  const thresholds = { deadStockDaysThreshold: 28 };

  test('opening qty + zero usage + days >= threshold → info flag', () => {
    const h = { 'code:X': { daysSinceLastUsage: 30 } };
    const r = detectDeadStock({ itemKey: 'code:X', openingQty: 10, usage: 0 }, h, thresholds);
    expect(r.DEAD_STOCK.severity).toBe('info');
  });

  test('item with usage → no flag', () => {
    const h = { 'code:X': { daysSinceLastUsage: 30 } };
    expect(detectDeadStock({ itemKey: 'code:X', openingQty: 10, usage: 3 }, h, thresholds)).toEqual({});
  });

  test('zero opening → no flag', () => {
    const h = { 'code:X': { daysSinceLastUsage: 30 } };
    expect(detectDeadStock({ itemKey: 'code:X', openingQty: 0, usage: 0 }, h, thresholds)).toEqual({});
  });

  test('days below threshold → no flag', () => {
    const h = { 'code:X': { daysSinceLastUsage: 10 } };
    expect(detectDeadStock({ itemKey: 'code:X', openingQty: 5, usage: 0 }, h, thresholds)).toEqual({});
  });

  test('no history defaults past threshold → flag', () => {
    const r = detectDeadStock({ itemKey: 'code:Y', openingQty: 5, usage: 0 }, {}, thresholds);
    expect(r.DEAD_STOCK.severity).toBe('info');
  });
});
