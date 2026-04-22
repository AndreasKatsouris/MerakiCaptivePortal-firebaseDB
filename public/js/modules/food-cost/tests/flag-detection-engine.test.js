import { describe, test, expect } from 'vitest';
import {
  detectInvalidValues,
  detectCostSpike
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
