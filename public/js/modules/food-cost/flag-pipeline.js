import * as flagService from './services/flag-service.js';
import { runDetection } from './services/flag-detection-engine.js';

export async function runFlagPipeline({
  locationId,
  recordId,
  processedItems,
  foodCostPct,
  totalCurrentCost,
  historicalData
}) {
  const thresholds = await flagService.getThresholds(locationId);
  const existingFlags = await flagService.getFlagsForLocation(locationId);
  const cleared = await flagService.runAutoClear(locationId, processedItems);

  const perItemFlags = runDetection({
    foodCostPct,
    processedItems,
    historicalData,
    existingFlags,
    totalCurrentCost,
    thresholds
  });

  const autoFlagsWritten = {};
  const detectedKeys = Object.keys(perItemFlags);
  console.log(
    `[FlagPipeline] runDetection produced ${detectedKeys.length} flagged itemKeys (sample:`,
    detectedKeys.slice(0, 3),
    ')'
  );
  for (const [itemKey, flags] of Object.entries(perItemFlags)) {
    if (!/^(code:|hash:).+/.test(itemKey)) {
      console.warn(
        `[FlagPipeline] skipping write — itemKey "${itemKey}" does not match required format`
      );
      continue;
    }
    const fromUpload = processedItems.find((p) => p.itemKey === itemKey);
    const fromExisting = existingFlags?.[itemKey];
    const itemMeta = fromUpload
      ? {
          itemCode: fromUpload.itemCode ?? null,
          description: fromUpload.description ?? null,
          category: fromUpload.category ?? null,
          costCenter: fromUpload.costCenter ?? null
        }
      : {
          itemCode: fromExisting?.itemCode ?? null,
          description: fromExisting?.description ?? null,
          category: fromExisting?.category ?? null,
          costCenter: fromExisting?.costCenter ?? null
        };
    await flagService.writeAutoFlags(locationId, itemKey, { itemMeta, recordId, flags });
    autoFlagsWritten[itemKey] = flags;
  }

  return { autoFlagsWritten, cleared };
}
