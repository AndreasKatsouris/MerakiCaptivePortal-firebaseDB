import {
  rtdb, ref, get, update, push, set
} from '../../../config/firebase-config.js';
import { MANUAL_FLAG_TYPES, RULE_IDS } from '../constants/flag-types.js';

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
const AUDIT_PATH = 'stockFlagAudit';

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

export async function applyManualFlag(locationId, itemKey, flagType, data) {
  if (!MANUAL_FLAG_TYPES[flagType]) {
    throw new Error(`invalid flag type: ${flagType}`);
  }
  if (flagType === MANUAL_FLAG_TYPES.CUSTOM) {
    if (!data?.customLabel || data.customLabel.length > 40) {
      throw new Error('CUSTOM flag requires customLabel <= 40 chars');
    }
  }
  const now = Date.now();
  const payload = {
    appliedBy: data.appliedBy,
    appliedAt: now,
    note: data?.note ?? null,
    expiresAt: data?.expiresAt ?? null,
    ...(data?.customLabel ? { customLabel: data.customLabel } : {})
  };
  const updates = {
    [`${FLAGS_PATH}/${locationId}/${itemKey}/manualFlags/${flagType}`]: payload
  };
  await update(ref(rtdb), updates);
  await writeAudit(locationId, {
    itemKey,
    eventType: 'manual_flag_applied',
    actorUid: data.appliedBy,
    timestamp: now,
    payload: { flagType, ...payload }
  });
}

export async function removeManualFlag(locationId, itemKey, flagType) {
  const updates = {
    [`${FLAGS_PATH}/${locationId}/${itemKey}/manualFlags/${flagType}`]: null
  };
  await update(ref(rtdb), updates);
  await writeAudit(locationId, {
    itemKey,
    eventType: 'manual_flag_removed',
    actorUid: 'system',
    timestamp: Date.now(),
    payload: { flagType }
  });
}

async function writeAudit(locationId, event) {
  const evRef = push(ref(rtdb, `${AUDIT_PATH}/${locationId}`));
  await set(evRef, event);
}

export async function resolveFlag(locationId, itemKey, flagType, { resolvedBy, reason = null } = {}) {
  const now = Date.now();
  const entry = { flagType, resolvedBy, resolvedAt: now, reason };
  const resolvedRef = push(ref(rtdb, `${FLAGS_PATH}/${locationId}/${itemKey}/resolvedFlags`));

  const removeUpdates = {};
  if (MANUAL_FLAG_TYPES[flagType]) {
    removeUpdates[`${FLAGS_PATH}/${locationId}/${itemKey}/manualFlags/${flagType}`] = null;
  } else if (RULE_IDS[flagType]) {
    removeUpdates[`${FLAGS_PATH}/${locationId}/${itemKey}/autoFlags/${flagType}`] = null;
  }
  if (Object.keys(removeUpdates).length) {
    await update(ref(rtdb), removeUpdates);
  }
  await set(resolvedRef, entry);
  await trimResolvedFlags(locationId, itemKey, 20);
  await writeAudit(locationId, {
    itemKey,
    eventType: 'flag_resolved',
    actorUid: resolvedBy,
    timestamp: now,
    payload: { flagType, reason }
  });
}

async function trimResolvedFlags(locationId, itemKey, max) {
  const snap = await get(ref(rtdb, `${FLAGS_PATH}/${locationId}/${itemKey}/resolvedFlags`));
  if (!snap.exists()) return;
  const entries = Object.entries(snap.val());
  if (entries.length <= max) return;
  entries.sort((a, b) => (a[1].resolvedAt ?? 0) - (b[1].resolvedAt ?? 0));
  const toRemove = entries.slice(0, entries.length - max);
  const updates = {};
  toRemove.forEach(([id]) => {
    updates[`${FLAGS_PATH}/${locationId}/${itemKey}/resolvedFlags/${id}`] = null;
  });
  await update(ref(rtdb), updates);
}

// Stubs — implemented in tasks 9-10
export async function writeAutoFlags() {
  throw new Error('not implemented');
}
export async function runAutoClear() {
  throw new Error('not implemented');
}
