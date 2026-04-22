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

export function detectDeadStock(item, historicalData, thresholds) {
  if (Number(item.usage) > 0) return {};
  if (Number(item.openingQty) <= 0) return {};
  const h = historicalData?.[item.itemKey];
  const daysSince = h?.daysSinceLastUsage ?? thresholds.deadStockDaysThreshold + 1;
  if (daysSince < thresholds.deadStockDaysThreshold) return {};
  return {
    [RULE_IDS.DEAD_STOCK]: {
      severity: SEVERITIES.INFO.id,
      score: Math.min(100, Math.round((daysSince / thresholds.deadStockDaysThreshold) * 50)),
      detectedAt: Date.now(),
      sourceRecordId: item.__recordId || null,
      details: { daysSinceLastUsage: daysSince, openingQty: Number(item.openingQty) }
    }
  };
}

export function detectMissingWithHistory(currentItemKeys, historicalData, thresholds, existingFlags) {
  const results = {};
  for (const [itemKey, h] of Object.entries(historicalData || {})) {
    if (currentItemKeys.has(itemKey)) continue;
    const weeks = h?.weeksSinceLastSeen ?? Infinity;
    if (weeks > thresholds.missingItemLookbackWeeks) continue;
    const hasManualFlag = !!(
      existingFlags?.[itemKey]?.manualFlags &&
      Object.keys(existingFlags[itemKey].manualFlags).length > 0
    );
    results[itemKey] = {
      [RULE_IDS.MISSING_WITH_HISTORY]: {
        severity: hasManualFlag ? SEVERITIES.WARNING.id : SEVERITIES.INFO.id,
        score: 40,
        detectedAt: Date.now(),
        sourceRecordId: null,
        details: { weeksSinceLastSeen: weeks, hasManualFlag }
      }
    };
  }
  return results;
}

export function scoreCulprit(item, historicalData, ctx) {
  const h = historicalData?.[item.itemKey] || {};
  const totalCost = Number(ctx?.totalCurrentCost) || 0;
  const contribution = totalCost > 0 ? Number(item.usageValue) / totalCost : 0;
  const normalizedContribution = Math.min(1, contribution / 0.3);

  const currentShare = contribution;
  const histShare = h.historicalCostShare ?? currentShare;
  const shareStd = h.historicalCostShareStdDev ?? Math.max(0.01, histShare * 0.2);
  const shareDeviation = Math.min(1, Math.abs(currentShare - histShare) / shareStd / 5);

  const unitCostChange = h.unitCostMean > 0
    ? Math.min(1, Math.max(0, (Number(item.unitCost) - h.unitCostMean) / h.unitCostMean))
    : 0;

  const score = 100 * (0.4 * normalizedContribution + 0.3 * shareDeviation + 0.3 * unitCostChange);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function detectHighFcPct({ foodCostPct, processedItems, historicalData, totalCurrentCost }, thresholds) {
  if (foodCostPct < thresholds.foodCostPctWarning) return {};
  const isCritical = foodCostPct >= thresholds.foodCostPctCritical;
  const severity = isCritical ? SEVERITIES.CRITICAL.id : SEVERITIES.WARNING.id;
  const ctx = { totalCurrentCost };
  const results = {};
  for (const item of processedItems) {
    const score = scoreCulprit(item, historicalData, ctx);
    if (score < thresholds.highFcPctCulpritMinScore) continue;
    results[item.itemKey] = {
      [RULE_IDS.HIGH_FC_PCT]: {
        severity,
        score,
        detectedAt: Date.now(),
        sourceRecordId: item.__recordId || null,
        details: { foodCostPct, culpritScore: score }
      }
    };
  }
  return results;
}

export function runDetection() {
  // Implemented incrementally across tasks 12-17
  return {};
}
