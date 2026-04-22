import { describe, test, expect, beforeEach, vi } from 'vitest';
import { get, ref, update, push, set } from '../../../config/firebase-config.js';
import { MANUAL_FLAG_TYPES } from '../constants/flag-types.js';
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

describe('applyManualFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ref).mockImplementation((_db, path) => path ?? '__root__');
    vi.mocked(update).mockResolvedValue(undefined);
    vi.mocked(set).mockResolvedValue(undefined);
    vi.mocked(push).mockReturnValue('stockFlagAudit/LOC1/-NewKey1');
  });

  test('writes flag with appliedBy + timestamp via update()', async () => {
    const before = Date.now();
    await applyManualFlag('LOC1', 'code:SKU001', MANUAL_FLAG_TYPES.OUT_OF_STOCK, {
      appliedBy: 'uid_alice',
      note: 'supplier late'
    });
    const after = Date.now();

    expect(update).toHaveBeenCalledTimes(1);
    const updates = vi.mocked(update).mock.calls[0][1];
    const path = 'stockItemFlags/LOC1/code:SKU001/manualFlags/OUT_OF_STOCK';
    expect(updates).toHaveProperty(path);
    const payload = updates[path];
    expect(payload.appliedBy).toBe('uid_alice');
    expect(payload.note).toBe('supplier late');
    expect(payload.appliedAt).toBeGreaterThanOrEqual(before);
    expect(payload.appliedAt).toBeLessThanOrEqual(after);
  });

  test('rejects invalid flag type', async () => {
    await expect(
      applyManualFlag('LOC1', 'code:SKU001', 'NOT_A_TYPE', { appliedBy: 'u' })
    ).rejects.toThrow(/invalid flag type/i);
    expect(update).not.toHaveBeenCalled();
  });

  test('CUSTOM requires customLabel <= 40 chars', async () => {
    await expect(
      applyManualFlag('LOC1', 'code:SKU001', MANUAL_FLAG_TYPES.CUSTOM, {
        appliedBy: 'u',
        customLabel: 'x'.repeat(41)
      })
    ).rejects.toThrow(/customLabel/);
    expect(update).not.toHaveBeenCalled();
  });

  test('CUSTOM accepts customLabel within limit and stores it', async () => {
    await applyManualFlag('LOC1', 'code:SKU001', MANUAL_FLAG_TYPES.CUSTOM, {
      appliedBy: 'u',
      customLabel: 'special handling'
    });
    const updates = vi.mocked(update).mock.calls[0][1];
    const path = 'stockItemFlags/LOC1/code:SKU001/manualFlags/CUSTOM';
    expect(updates[path].customLabel).toBe('special handling');
  });

  test('writes audit event via push + set', async () => {
    await applyManualFlag('LOC1', 'code:SKU001', MANUAL_FLAG_TYPES.OFF_MENU, {
      appliedBy: 'uid_bob'
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    const event = vi.mocked(set).mock.calls[0][1];
    expect(event.eventType).toBe('manual_flag_applied');
    expect(event.itemKey).toBe('code:SKU001');
    expect(event.actorUid).toBe('uid_bob');
    expect(event.payload.flagType).toBe('OFF_MENU');
    expect(typeof event.timestamp).toBe('number');
  });
});

describe('removeManualFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ref).mockImplementation((_db, path) => path ?? '__root__');
    vi.mocked(update).mockResolvedValue(undefined);
    vi.mocked(set).mockResolvedValue(undefined);
    vi.mocked(push).mockReturnValue('stockFlagAudit/LOC1/-NewKey2');
  });

  test('writes null to flag path and writes audit', async () => {
    await removeManualFlag('LOC1', 'code:X', MANUAL_FLAG_TYPES.INVESTIGATION);
    const updates = vi.mocked(update).mock.calls[0][1];
    const path = 'stockItemFlags/LOC1/code:X/manualFlags/INVESTIGATION';
    expect(updates[path]).toBeNull();

    expect(set).toHaveBeenCalledTimes(1);
    const event = vi.mocked(set).mock.calls[0][1];
    expect(event.eventType).toBe('manual_flag_removed');
    expect(event.payload.flagType).toBe('INVESTIGATION');
  });
});
