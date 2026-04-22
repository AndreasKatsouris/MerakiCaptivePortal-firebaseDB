import { describe, test, expect, beforeEach, vi } from 'vitest';
import { get, ref } from '../../../config/firebase-config.js';
import {
  DEFAULT_THRESHOLDS,
  getThresholds,
  getFlagsForLocation,
  applyManualFlag,
  removeManualFlag,
  resolveFlag,
  writeAutoFlags,
  runAutoClear
} from '../services/flag-service.js';

describe('flag-service exports', () => {
  test('exports functions and defaults', () => {
    expect(typeof getFlagsForLocation).toBe('function');
    expect(typeof applyManualFlag).toBe('function');
    expect(typeof removeManualFlag).toBe('function');
    expect(typeof resolveFlag).toBe('function');
    expect(typeof writeAutoFlags).toBe('function');
    expect(typeof runAutoClear).toBe('function');
    expect(typeof getThresholds).toBe('function');
    expect(DEFAULT_THRESHOLDS.foodCostPctWarning).toBe(35);
    expect(DEFAULT_THRESHOLDS.foodCostPctCritical).toBe(40);
    expect(DEFAULT_THRESHOLDS.unitCostSpikePct).toBe(15);
    expect(DEFAULT_THRESHOLDS.unitCostSpikeCriticalPct).toBe(30);
    expect(DEFAULT_THRESHOLDS.usageVarianceStdDev).toBe(2);
    expect(DEFAULT_THRESHOLDS.usageVarianceCriticalStdDev).toBe(3);
    expect(DEFAULT_THRESHOLDS.deadStockDaysThreshold).toBe(28);
    expect(DEFAULT_THRESHOLDS.missingItemLookbackWeeks).toBe(4);
    expect(DEFAULT_THRESHOLDS.highFcPctCulpritMinScore).toBe(50);
  });

  test('DEFAULT_THRESHOLDS is frozen', () => {
    expect(Object.isFrozen(DEFAULT_THRESHOLDS)).toBe(true);
  });
});

describe('getThresholds resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('location overrides beat seeded defaults beat built-in DEFAULT_THRESHOLDS', async () => {
    vi.mocked(get).mockImplementation(async (refArg) => {
      const pathStr = String(refArg);
      if (pathStr.includes('_defaults/thresholds')) {
        return { exists: () => true, val: () => ({ foodCostPctWarning: 35, foodCostPctCritical: 40 }) };
      }
      if (pathStr.includes('LOC1/thresholds')) {
        return { exists: () => true, val: () => ({ foodCostPctCritical: 38, unitCostSpikePct: 10 }) };
      }
      return { exists: () => false, val: () => null };
    });
    vi.mocked(ref).mockImplementation((_db, path) => path);

    const t = await getThresholds('LOC1');
    expect(t.foodCostPctWarning).toBe(35);
    expect(t.foodCostPctCritical).toBe(38);
    expect(t.unitCostSpikePct).toBe(10);
    expect(t.deadStockDaysThreshold).toBe(28);
  });

  test('missing location config falls back to defaults', async () => {
    vi.mocked(get).mockImplementation(async (refArg) => {
      const pathStr = String(refArg);
      if (pathStr.includes('_defaults/thresholds')) {
        return { exists: () => true, val: () => ({}) };
      }
      return { exists: () => false, val: () => null };
    });
    vi.mocked(ref).mockImplementation((_db, path) => path);

    const t = await getThresholds('LOC_UNKNOWN');
    expect(t.foodCostPctWarning).toBe(35);
    expect(t.deadStockDaysThreshold).toBe(28);
  });
});
