import {
  rtdb, ref, get
} from '../../../config/firebase-config.js';

export const DEFAULT_THRESHOLDS = Object.freeze({
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

const FLAGS_PATH = 'stockItemFlags';
const CONFIG_PATH = 'stockFlagConfig';

export async function getThresholds(locationId) {
  const [defSnap, locSnap] = await Promise.all([
    get(ref(rtdb, `${CONFIG_PATH}/_defaults/thresholds`)),
    get(ref(rtdb, `${CONFIG_PATH}/${locationId}/thresholds`))
  ]);
  const seeded = defSnap.exists() ? defSnap.val() : DEFAULT_THRESHOLDS;
  const overrides = locSnap.exists() ? locSnap.val() : {};
  return { ...DEFAULT_THRESHOLDS, ...seeded, ...overrides };
}

export async function getFlagsForLocation(locationId) {
  const snap = await get(ref(rtdb, `${FLAGS_PATH}/${locationId}`));
  return snap.exists() ? snap.val() : {};
}

// Stubs — implemented in tasks 7-10
export async function applyManualFlag() {
  throw new Error('not implemented');
}
export async function removeManualFlag() {
  throw new Error('not implemented');
}
export async function resolveFlag() {
  throw new Error('not implemented');
}
export async function writeAutoFlags() {
  throw new Error('not implemented');
}
export async function runAutoClear() {
  throw new Error('not implemented');
}
