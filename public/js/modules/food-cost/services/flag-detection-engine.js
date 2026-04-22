import { RULE_IDS, SEVERITIES } from '../constants/flag-types.js';

const EPSILON = 0.0001;

export function detectInvalidValues(item) {
  const reasons = [];
  const closing = Number(item.closingQty);
  const opening = Number(item.openingQty);
  const purchases = Number(item.purchaseQty);
  const unitCost = Number(item.unitCost);

  if (closing < 0) reasons.push('negativeClosing');
  if (closing > opening + purchases + EPSILON) reasons.push('closingExceedsAvailable');
  if (unitCost < 0) reasons.push('negativeUnitCost');

  if (!reasons.length) return {};
  return {
    [RULE_IDS.INVALID_VALUES]: {
      severity: SEVERITIES.CRITICAL.id,
      score: 100,
      detectedAt: Date.now(),
      sourceRecordId: item.__recordId || null,
      details: { reasons }
    }
  };
}

export function detectCostSpike(item, historicalData, thresholds) {
  const h = historicalData?.[item.itemKey];
  if (!h || !h.unitCostMean || h.unitCostSamples < 2) return {};
  const delta = (Number(item.unitCost) - h.unitCostMean) / h.unitCostMean;
  if (delta < thresholds.unitCostSpikePct / 100) return {};
  const severity = delta >= thresholds.unitCostSpikeCriticalPct / 100
    ? SEVERITIES.CRITICAL.id
    : SEVERITIES.WARNING.id;
  return {
    [RULE_IDS.COST_SPIKE]: {
      severity,
      score: Math.min(100, Math.round(delta * 100)),
      detectedAt: Date.now(),
      sourceRecordId: item.__recordId || null,
      details: { historicalMean: h.unitCostMean, current: Number(item.unitCost), delta }
    }
  };
}

export function detectUsageAnomaly(item, historicalData, thresholds) {
  const h = historicalData?.[item.itemKey];
  if (!h || h.usageSamples < 3 || !h.usageStdDev) return {};
  const z = Math.abs((Number(item.usage) - h.usageMean) / h.usageStdDev);
  if (z < thresholds.usageVarianceStdDev) return {};
  const severity = z >= thresholds.usageVarianceCriticalStdDev
    ? SEVERITIES.CRITICAL.id
    : SEVERITIES.WARNING.id;
  return {
    [RULE_IDS.USAGE_ANOMALY]: {
      severity,
      score: Math.min(100, Math.round((z / thresholds.usageVarianceCriticalStdDev) * 100)),
      detectedAt: Date.now(),
      sourceRecordId: item.__recordId || null,
      details: {
        zScore: z,
        mean: h.usageMean,
        stdDev: h.usageStdDev,
        current: Number(item.usage)
      }
    }
  };
}

export function runDetection() {
  // Implemented incrementally across tasks 12-17
  return {};
}
