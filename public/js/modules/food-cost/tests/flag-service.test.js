import { describe, test, expect } from 'vitest';
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
