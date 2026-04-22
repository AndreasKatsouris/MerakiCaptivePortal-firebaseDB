import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as flagService from '../services/flag-service.js';
import { runFlagPipeline } from '../flag-pipeline.js';

describe('runFlagPipeline orchestrator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(flagService, 'getThresholds').mockResolvedValue({
      foodCostPctWarning: 35,
      foodCostPctCritical: 40,
      unitCostSpikePct: 15,
      unitCostSpikeCriticalPct: 30,
      usageVarianceStdDev: 2,
      usageVarianceCriticalStdDev: 3,
      deadStockDaysThreshold: 28,
      missingItemLookbackWeeks: 4,
      highFcPctCulpritMinScore: 50
    });
    vi.spyOn(flagService, 'getFlagsForLocation').mockResolvedValue({});
    vi.spyOn(flagService, 'runAutoClear').mockResolvedValue([]);
    vi.spyOn(flagService, 'writeAutoFlags').mockResolvedValue(undefined);
  });

  test('writes auto flags for items detected as flagged', async () => {
    const result = await runFlagPipeline({
      locationId: 'LOC1',
      recordId: 'REC_X',
      processedItems: [
        {
          itemKey: 'code:A',
          unitCost: 140,
          usage: 5,
          openingQty: 10,
          closingQty: 2,
          purchaseQty: 0,
          usageValue: 700,
          itemCode: 'A',
          description: 'Apple',
          category: 'P',
          costCenter: 'K'
        }
      ],
      foodCostPct: 30,
      totalCurrentCost: 700,
      historicalData: {
        'code:A': {
          unitCostMean: 100,
          unitCostSamples: 5,
          usageMean: 5,
          usageStdDev: 1,
          usageSamples: 5
        }
      }
    });

    expect(result.autoFlagsWritten['code:A'].COST_SPIKE).toBeDefined();
    expect(flagService.writeAutoFlags).toHaveBeenCalledWith(
      'LOC1',
      'code:A',
      expect.objectContaining({
        recordId: 'REC_X',
        itemMeta: expect.objectContaining({ itemCode: 'A' })
      })
    );
  });

  test('returns cleared flags from runAutoClear', async () => {
    vi.mocked(flagService.runAutoClear).mockResolvedValue([
      { itemKey: 'code:B', flagType: 'OUT_OF_STOCK', reason: 'auto' }
    ]);
    const result = await runFlagPipeline({
      locationId: 'LOC1',
      recordId: 'REC_Y',
      processedItems: [],
      foodCostPct: 20,
      totalCurrentCost: 0,
      historicalData: {}
    });
    expect(result.cleared).toEqual([
      { itemKey: 'code:B', flagType: 'OUT_OF_STOCK', reason: 'auto' }
    ]);
  });

  test('falls back to existingFlags meta when item not in current upload', async () => {
    vi.mocked(flagService.getFlagsForLocation).mockResolvedValue({
      'code:Z': {
        itemCode: 'Z',
        description: 'Zucchini',
        category: 'Produce',
        costCenter: 'Kitchen',
        weeksSinceLastSeen: 1
      }
    });
    await runFlagPipeline({
      locationId: 'LOC1',
      recordId: 'REC_Z',
      processedItems: [],
      foodCostPct: 20,
      totalCurrentCost: 0,
      historicalData: { 'code:Z': { weeksSinceLastSeen: 1 } }
    });
    const writeCall = vi
      .mocked(flagService.writeAutoFlags)
      .mock.calls.find((c) => c[1] === 'code:Z');
    expect(writeCall).toBeDefined();
    expect(writeCall[2].itemMeta.description).toBe('Zucchini');
  });

  test('returns empty autoFlagsWritten when no flags detected', async () => {
    const result = await runFlagPipeline({
      locationId: 'LOC1',
      recordId: 'R',
      processedItems: [
        {
          itemKey: 'code:A',
          unitCost: 100,
          usage: 5,
          openingQty: 10,
          closingQty: 5,
          purchaseQty: 0,
          usageValue: 500
        }
      ],
      foodCostPct: 20,
      totalCurrentCost: 500,
      historicalData: {}
    });
    expect(result.autoFlagsWritten).toEqual({});
    expect(flagService.writeAutoFlags).not.toHaveBeenCalled();
  });
});
