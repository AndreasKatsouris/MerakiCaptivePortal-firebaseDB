import { describe, test, expect } from 'vitest';
import { detectInvalidValues } from '../services/flag-detection-engine.js';

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
