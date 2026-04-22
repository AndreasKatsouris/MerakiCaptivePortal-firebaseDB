import { describe, test, expect } from 'vitest';
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
