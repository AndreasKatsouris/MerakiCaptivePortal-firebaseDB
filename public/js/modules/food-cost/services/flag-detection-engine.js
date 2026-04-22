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

export function runDetection() {
  // Implemented incrementally across tasks 12-17
  return {};
}
