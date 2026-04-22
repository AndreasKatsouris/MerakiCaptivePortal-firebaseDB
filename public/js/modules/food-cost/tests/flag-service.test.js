import { describe, test, expect, beforeEach, vi } from 'vitest';
import { get, ref, update, push, set } from '../../../config/firebase-config.js';
import { MANUAL_FLAG_TYPES, RULE_IDS } from '../constants/flag-types.js';
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

describe('resolveFlag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ref).mockImplementation((_db, path) => path ?? '__root__');
    vi.mocked(update).mockResolvedValue(undefined);
    vi.mocked(set).mockResolvedValue(undefined);
    vi.mocked(get).mockResolvedValue({ exists: () => false, val: () => null });
    let pushCounter = 0;
    vi.mocked(push).mockImplementation((path) => `${path}/-NewKey${pushCounter++}`);
  });

  test('removes manual flag, writes resolvedFlags entry, writes audit', async () => {
    await resolveFlag('LOC1', 'code:Z', 'OUT_OF_STOCK', {
      resolvedBy: 'uid_alice',
      reason: 'back in stock'
    });

    const removeCall = vi.mocked(update).mock.calls.find(([, updates]) =>
      Object.prototype.hasOwnProperty.call(updates, 'stockItemFlags/LOC1/code:Z/manualFlags/OUT_OF_STOCK')
    );
    expect(removeCall).toBeDefined();
    expect(removeCall[1]['stockItemFlags/LOC1/code:Z/manualFlags/OUT_OF_STOCK']).toBeNull();

    const setCalls = vi.mocked(set).mock.calls;
    const resolvedSet = setCalls.find(([_ref, val]) => val?.flagType === 'OUT_OF_STOCK');
    expect(resolvedSet).toBeDefined();
    expect(resolvedSet[1].resolvedBy).toBe('uid_alice');
    expect(resolvedSet[1].reason).toBe('back in stock');
    expect(typeof resolvedSet[1].resolvedAt).toBe('number');

    const auditSet = setCalls.find(([_ref, val]) => val?.eventType === 'flag_resolved');
    expect(auditSet).toBeDefined();
    expect(auditSet[1].actorUid).toBe('uid_alice');
    expect(auditSet[1].payload.flagType).toBe('OUT_OF_STOCK');
  });

  test('removes auto flag when flagType is a RULE_ID', async () => {
    await resolveFlag('LOC1', 'code:A', RULE_IDS.COST_SPIKE, { resolvedBy: 'u' });
    const removeCall = vi.mocked(update).mock.calls.find(([, updates]) =>
      Object.prototype.hasOwnProperty.call(updates, 'stockItemFlags/LOC1/code:A/autoFlags/COST_SPIKE')
    );
    expect(removeCall).toBeDefined();
    expect(removeCall[1]['stockItemFlags/LOC1/code:A/autoFlags/COST_SPIKE']).toBeNull();
  });

});

describe('writeAutoFlags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ref).mockImplementation((_db, path) => path ?? '__root__');
    vi.mocked(update).mockResolvedValue(undefined);
  });

  test('replaces autoFlags and updates lastSeen metadata', async () => {
    await writeAutoFlags('LOC1', 'code:A', {
      itemMeta: { itemCode: 'A', description: 'Apple', category: 'Produce', costCenter: 'Kitchen' },
      recordId: 'REC1',
      flags: {
        COST_SPIKE: {
          severity: 'warning',
          score: 62,
          detectedAt: 1000,
          sourceRecordId: 'REC1',
          details: { delta: 0.22 }
        }
      }
    });
    const updates = vi.mocked(update).mock.calls[0][1];
    const base = 'stockItemFlags/LOC1/code:A';
    expect(updates[`${base}/itemKey`]).toBe('code:A');
    expect(updates[`${base}/itemCode`]).toBe('A');
    expect(updates[`${base}/description`]).toBe('Apple');
    expect(updates[`${base}/category`]).toBe('Produce');
    expect(updates[`${base}/costCenter`]).toBe('Kitchen');
    expect(updates[`${base}/lastSeenRecordId`]).toBe('REC1');
    expect(typeof updates[`${base}/lastSeenAt`]).toBe('number');
    expect(updates[`${base}/autoFlags`].COST_SPIKE.severity).toBe('warning');
  });

  test('coerces missing item meta fields to null', async () => {
    await writeAutoFlags('LOC1', 'code:B', {
      itemMeta: {},
      recordId: 'REC2',
      flags: {}
    });
    const updates = vi.mocked(update).mock.calls[0][1];
    const base = 'stockItemFlags/LOC1/code:B';
    expect(updates[`${base}/itemCode`]).toBeNull();
    expect(updates[`${base}/description`]).toBeNull();
    expect(updates[`${base}/category`]).toBeNull();
    expect(updates[`${base}/costCenter`]).toBeNull();
  });
});

describe('runAutoClear', () => {
  const EIGHT_WEEKS_MS = 8 * 7 * 24 * 3600 * 1000;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ref).mockImplementation((_db, path) => path ?? '__root__');
    vi.mocked(update).mockResolvedValue(undefined);
    vi.mocked(set).mockResolvedValue(undefined);
    let pushCounter = 0;
    vi.mocked(push).mockImplementation((path) => `${path}/-AC${pushCounter++}`);
  });

  test('OUT_OF_STOCK clears when item reappears with usage > 0', async () => {
    const now = Date.now();
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        'code:B': {
          manualFlags: {
            OUT_OF_STOCK: { appliedBy: 'u', appliedAt: now - 1000 }
          }
        }
      })
    });
    const cleared = await runAutoClear('LOC1', [{ itemKey: 'code:B', usage: 5 }]);
    expect(cleared).toEqual([
      expect.objectContaining({ itemKey: 'code:B', flagType: 'OUT_OF_STOCK' })
    ]);
    const updates = vi.mocked(update).mock.calls[0][1];
    expect(updates['stockItemFlags/LOC1/code:B/manualFlags/OUT_OF_STOCK']).toBeNull();
  });

  test('OUT_OF_STOCK does not clear when usage is 0', async () => {
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        'code:C': {
          manualFlags: {
            OUT_OF_STOCK: { appliedBy: 'u', appliedAt: Date.now() }
          }
        }
      })
    });
    const cleared = await runAutoClear('LOC1', [{ itemKey: 'code:C', usage: 0 }]);
    expect(cleared).toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });

  test('SEASONAL clears on expiresAt elapsed', async () => {
    const now = Date.now();
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        'code:D': {
          manualFlags: {
            SEASONAL: { appliedBy: 'u', appliedAt: now - 5000, expiresAt: now - 1000 }
          }
        }
      })
    });
    const cleared = await runAutoClear('LOC1', []);
    expect(cleared).toEqual([
      expect.objectContaining({ itemKey: 'code:D', flagType: 'SEASONAL' })
    ]);
    const updates = vi.mocked(update).mock.calls[0][1];
    expect(updates['stockItemFlags/LOC1/code:D/manualFlags/SEASONAL']).toBeNull();
  });

  test('SEASONAL does not clear when expiresAt is future', async () => {
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        'code:D2': {
          manualFlags: {
            SEASONAL: { appliedBy: 'u', appliedAt: Date.now(), expiresAt: Date.now() + 60_000 }
          }
        }
      })
    });
    const cleared = await runAutoClear('LOC1', []);
    expect(cleared).toEqual([]);
  });

  test('RECIPE_CHANGE decays after 8 weeks', async () => {
    const eightWeeksAgo = Date.now() - EIGHT_WEEKS_MS - 1000;
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        'code:E': {
          manualFlags: {
            RECIPE_CHANGE: { appliedBy: 'u', appliedAt: eightWeeksAgo }
          }
        }
      })
    });
    const cleared = await runAutoClear('LOC1', []);
    expect(cleared).toEqual([
      expect.objectContaining({ itemKey: 'code:E', flagType: 'RECIPE_CHANGE' })
    ]);
  });

  test('writes audit events for cleared flags', async () => {
    const now = Date.now();
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        'code:B': {
          manualFlags: { OUT_OF_STOCK: { appliedBy: 'u', appliedAt: now - 1000 } }
        }
      })
    });
    await runAutoClear('LOC1', [{ itemKey: 'code:B', usage: 3 }]);
    const auditCall = vi.mocked(set).mock.calls.find(
      ([, val]) => val?.eventType === 'flag_auto_cleared'
    );
    expect(auditCall).toBeDefined();
    expect(auditCall[1].actorUid).toBe('system');
    expect(auditCall[1].payload.flagType).toBe('OUT_OF_STOCK');
  });

  test('returns [] when no flags exist', async () => {
    vi.mocked(get).mockResolvedValue({ exists: () => false, val: () => null });
    const cleared = await runAutoClear('LOC1', [{ itemKey: 'code:X', usage: 1 }]);
    expect(cleared).toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });

  test('non-auto-clearable manual flags are preserved', async () => {
    vi.mocked(get).mockResolvedValue({
      exists: () => true,
      val: () => ({
        'code:I': {
          manualFlags: {
            INVESTIGATION: { appliedBy: 'u', appliedAt: Date.now() }
          }
        }
      })
    });
    const cleared = await runAutoClear('LOC1', [{ itemKey: 'code:I', usage: 10 }]);
    expect(cleared).toEqual([]);
  });
});

describe('resolveFlag trim behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ref).mockImplementation((_db, path) => path ?? '__root__');
    vi.mocked(update).mockResolvedValue(undefined);
    vi.mocked(set).mockResolvedValue(undefined);
    let pushCounter = 0;
    vi.mocked(push).mockImplementation((path) => `${path}/-NewKey${pushCounter++}`);
  });

  test('trims resolvedFlags to most recent 20 (oldest dropped)', async () => {
    const fakeResolved = {};
    for (let i = 0; i < 25; i++) {
      fakeResolved[`-K${String(i).padStart(3, '0')}`] = {
        flagType: 'INVESTIGATION',
        resolvedAt: 1000 + i,
        resolvedBy: 'u',
        reason: `r${i}`
      };
    }
    vi.mocked(get).mockImplementation(async (path) => {
      if (String(path).endsWith('resolvedFlags')) {
        return { exists: () => true, val: () => fakeResolved };
      }
      return { exists: () => false, val: () => null };
    });

    await resolveFlag('LOC1', 'code:R', 'INVESTIGATION', { resolvedBy: 'u', reason: 'rN' });

    const trimCall = vi.mocked(update).mock.calls.find(([, updates]) =>
      Object.keys(updates).some((k) => k.includes('/resolvedFlags/-K'))
    );
    expect(trimCall).toBeDefined();
    const trimUpdates = trimCall[1];
    const trimmedKeys = Object.keys(trimUpdates).filter((k) => k.includes('/resolvedFlags/-K'));
    expect(trimmedKeys.length).toBe(5);
    expect(trimmedKeys.every((k) => trimUpdates[k] === null)).toBe(true);
    expect(trimmedKeys.some((k) => k.endsWith('-K000'))).toBe(true);
    expect(trimmedKeys.some((k) => k.endsWith('-K004'))).toBe(true);
    expect(trimmedKeys.some((k) => k.endsWith('-K005'))).toBe(false);
  });
});
