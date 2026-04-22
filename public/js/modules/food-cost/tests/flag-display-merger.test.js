import { describe, test, expect } from 'vitest';
import {
  mergeFlaggedHistoricalItems,
  computeRowSeverity
} from '../flag-display-merger.js';

describe('mergeFlaggedHistoricalItems', () => {
  const current = [
    { itemKey: 'code:A', description: 'Apple', openingQty: 10, usage: 5 }
  ];
  const flags = {
    'code:A': { manualFlags: { INVESTIGATION: { appliedAt: 1 } } },
    'code:B': {
      itemCode: 'B',
      description: 'Banana',
      category: 'Produce',
      costCenter: 'Kitchen',
      manualFlags: { OUT_OF_STOCK: { appliedAt: 1 } }
    },
    'code:C': {
      itemCode: 'C',
      description: 'Cherry'
    }
  };

  test('returns current items when toggle off', () => {
    const out = mergeFlaggedHistoricalItems(current, flags, { showHistorical: false });
    expect(out.length).toBe(1);
    expect(out[0].itemKey).toBe('code:A');
  });

  test('injects historical flagged items when toggle on', () => {
    const out = mergeFlaggedHistoricalItems(current, flags, { showHistorical: true });
    expect(out.length).toBe(2);
    const injected = out.find((r) => r.itemKey === 'code:B');
    expect(injected).toBeDefined();
    expect(injected.__isHistoricalPlaceholder).toBe(true);
    expect(injected.openingQty).toBe(0);
    expect(injected.usage).toBe(0);
    expect(injected.description).toBe('Banana');
  });

  test('does not inject historical items lacking any active flag', () => {
    const out = mergeFlaggedHistoricalItems(current, flags, { showHistorical: true });
    expect(out.find((r) => r.itemKey === 'code:C')).toBeUndefined();
  });

  test('does not duplicate items already present in current', () => {
    const out = mergeFlaggedHistoricalItems(current, flags, { showHistorical: true });
    const aRows = out.filter((r) => r.itemKey === 'code:A');
    expect(aRows.length).toBe(1);
    expect(aRows[0].__isHistoricalPlaceholder).toBeUndefined();
  });

  test('handles empty/missing flags map', () => {
    expect(mergeFlaggedHistoricalItems(current, null, { showHistorical: true })).toEqual(current);
    expect(mergeFlaggedHistoricalItems(current, {}, { showHistorical: true })).toEqual(current);
  });
});

describe('computeRowSeverity', () => {
  test('returns null for empty entry', () => {
    expect(computeRowSeverity(null)).toBeNull();
    expect(computeRowSeverity({})).toBeNull();
  });

  test('picks highest severity across manual + auto', () => {
    const sev = computeRowSeverity({
      manualFlags: { INVESTIGATION: {} },
      autoFlags: { COST_SPIKE: { severity: 'critical' } }
    });
    expect(sev).toBe('critical');
  });

  test('uses manual severity map when no auto flags', () => {
    expect(computeRowSeverity({ manualFlags: { OFF_MENU: {} } })).toBe('info');
    expect(computeRowSeverity({ manualFlags: { OUT_OF_STOCK: {} } })).toBe('warning');
  });

  test('uses auto flag severity when no manual', () => {
    expect(computeRowSeverity({ autoFlags: { DEAD_STOCK: { severity: 'info' } } })).toBe('info');
  });

  test('warning beats info, critical beats warning', () => {
    expect(
      computeRowSeverity({
        autoFlags: {
          A: { severity: 'info' },
          B: { severity: 'warning' }
        }
      })
    ).toBe('warning');
    expect(
      computeRowSeverity({
        autoFlags: {
          A: { severity: 'warning' },
          B: { severity: 'critical' }
        }
      })
    ).toBe('critical');
  });
});
