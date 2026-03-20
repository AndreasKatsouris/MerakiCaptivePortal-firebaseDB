/**
 * Firebase Service for Corporate Compliance Module
 *
 * Handles all Firebase Realtime Database operations for the
 * compliance tracker — entities, obligations, filings, and settings.
 *
 * Errors are NOT caught here; they bubble up to the calling layer
 * so the UI can present contextual feedback.
 */

// NOTE: Multi-tenancy migration (Track 7) — compliance data paths are now scoped
// to compliance/{uid}/. Existing data at compliance/* must be migrated per user UID
// using the Firebase console or a one-time migration script before going to production.

import {
  rtdb,
  auth,
  ref,
  get,
  set,
  update
} from '../../../config/firebase-config.js';
import { logAuditEvent, AUDIT_ACTIONS } from './audit-service.js';

// Returns the user-scoped base path for all compliance data.
// Throws if there is no authenticated user so callers fail fast.
function getBasePath() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('User not authenticated');
  return `compliance/${uid}`;
}

// Path component validator — prevents path traversal attacks
const VALID_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;

function validatePathSegment(value, label) {
  const str = String(value);
  if (!VALID_PATH_SEGMENT.test(str)) {
    throw new Error(`Invalid ${label}: contains disallowed characters.`);
  }
  return str;
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Load all entities from the compliance node.
 * @returns {Promise<Object>} Map of registrationNumber -> entity object
 */
export async function loadEntities() {
  const snapshot = await get(ref(rtdb, `${getBasePath()}/entities`));
  return snapshot.val() || {};
}

/**
 * Load all obligation definitions.
 * @returns {Promise<Object>} Map of obligationId -> obligation object
 */
export async function loadObligations() {
  const snapshot = await get(ref(rtdb, `${getBasePath()}/obligations`));
  return snapshot.val() || {};
}

/**
 * Load filing records for a specific calendar year.
 * @param {string|number} year — e.g. 2026
 * @returns {Promise<Object>} Nested map: entityId -> obligationId -> filing
 */
export async function loadFilings(year) {
  const safeYear = validatePathSegment(String(year), 'year');
  const snapshot = await get(ref(rtdb, `${getBasePath()}/filings/${safeYear}`));
  return snapshot.val() || {};
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Update (or create) a single filing status record.
 *
 * @param {string|number} year       — Filing year
 * @param {string}        entityId   — CIPC registration number
 * @param {string}        obligationId — Obligation key
 * @param {Object}        data       — Filing payload (status, updatedBy, etc.)
 * @returns {Promise<void>}
 */
export async function updateFilingStatus(year, entityId, obligationId, data) {
  const safeYear = validatePathSegment(year, 'year');
  const safeEntity = validatePathSegment(entityId, 'entityId');
  const safeObligation = validatePathSegment(obligationId, 'obligationId');
  const path = `${getBasePath()}/filings/${safeYear}/${safeEntity}/${safeObligation}`;
  await set(ref(rtdb, path), {
    ...data,
    updatedAt: new Date().toISOString()
  });
  logAuditEvent(AUDIT_ACTIONS.FILING_MARKED, {
    entityId,
    obligationId,
    year,
    filedDate: data.filedDate,
    filedBy: data.filedBy,
    notes: data.notes || null,
    after: data
  }).catch(() => {});
}

/**
 * Update compliance flags on an entity (arCompliant, boCompliant, etc.).
 *
 * @param {string} entityId — CIPC registration number
 * @param {Object} flags    — Key/value pairs to merge
 * @returns {Promise<void>}
 */
export async function updateEntityCompliance(entityId, flags) {
  const safeEntity = validatePathSegment(entityId, 'entityId');
  const entitySnap = await get(ref(rtdb, `${getBasePath()}/entities/${safeEntity}`));
  const before = entitySnap.val() || {};
  await update(ref(rtdb, `${getBasePath()}/entities/${safeEntity}`), {
    ...flags,
    updatedAt: new Date().toISOString()
  });
  const isAR = 'arCompliant' in flags;
  logAuditEvent(isAR ? AUDIT_ACTIONS.AR_TOGGLED : AUDIT_ACTIONS.BO_TOGGLED, {
    entityId: safeEntity,
    entityName: before.name,
    before: { arCompliant: before.arCompliant, boCompliant: before.boCompliant },
    after: { ...before, ...flags }
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Location helpers
// ---------------------------------------------------------------------------

/**
 * Load all locations owned by the currently authenticated user.
 *
 * Reads the `userLocations/{uid}` index (a map of locationId -> true),
 * then fetches each full location record from `locations/{locationId}`.
 *
 * @returns {Promise<Array<{id: string, name: string, address: string, city: string}>>}
 *   Sorted alphabetically by name. Returns [] when the user has no locations.
 */
export async function loadLocations() {
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) {
    throw new Error('loadLocations: no authenticated user.');
  }

  const indexSnapshot = await get(ref(rtdb, `userLocations/${uid}`));
  const indexVal = indexSnapshot.val();
  if (!indexVal) {
    return [];
  }

  const locationIds = Object.keys(indexVal);
  const fetches = locationIds.map((locationId) =>
    get(ref(rtdb, `locations/${locationId}`))
  );
  const snapshots = await Promise.all(fetches);

  const locations = snapshots
    .map((snap, i) => {
      const data = snap.val();
      if (!data) return null;
      return {
        id: locationIds[i],
        name: data.name || '',
        address: data.address || '',
        city: data.city || ''
      };
    })
    .filter(Boolean);

  locations.sort((a, b) => a.name.localeCompare(b.name));
  return locations;
}

// ---------------------------------------------------------------------------
// Entity CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new entity record in Firebase.
 *
 * The CIPC registration number is used as the Firebase key, so it must be
 * unique and contain only alphanumeric, hyphen, or underscore characters.
 *
 * @param {Object} entityData
 * @param {string}   entityData.registrationNumber  — Used as the Firebase key
 * @param {string}   entityData.name
 * @param {string}   entityData.type
 * @param {string}   entityData.status              — 'active' | 'dormant'
 * @param {string}   entityData.purpose
 * @param {string}   entityData.cipcStatus
 * @param {string|null} entityData.oversight
 * @param {string|null} entityData.oversightPhone
 * @param {string|null} entityData.financialYearEnd — MM-DD format
 * @param {string|null} entityData.notes
 * @param {string[]}  entityData.linkedLocationIds  — Array of location push keys
 * @returns {Promise<Object>} The full entity object that was written to Firebase
 * @throws {Error} If the registration number already exists
 */
export async function createEntity(entityData) {
  const safeReg = validatePathSegment(entityData.registrationNumber, 'registrationNumber');

  const existingSnapshot = await get(ref(rtdb, `${getBasePath()}/entities/${safeReg}`));
  if (existingSnapshot.exists()) {
    throw new Error(`Entity with registration number "${safeReg}" already exists.`);
  }

  const now = new Date().toISOString();
  const record = {
    ...entityData,
    registrationNumber: safeReg,
    arCompliant: false,
    boCompliant: false,
    createdAt: now,
    updatedAt: now
  };

  await set(ref(rtdb, `${getBasePath()}/entities/${safeReg}`), record);
  logAuditEvent(AUDIT_ACTIONS.ENTITY_CREATED, {
    entityId: safeReg,
    entityName: entityData.name,
    after: record
  }).catch(() => {});
  return record;
}

/**
 * Partially update fields on an existing entity.
 *
 * Use this for editable fields (name, type, status, etc.).
 * Compliance flags (arCompliant, boCompliant) are managed by updateEntityCompliance().
 *
 * @param {string} registrationNumber — CIPC registration number (Firebase key)
 * @param {Object} updates            — Partial field map to merge
 * @returns {Promise<void>}
 */
export async function updateEntity(registrationNumber, updates) {
  const safeReg = validatePathSegment(registrationNumber, 'registrationNumber');
  const currentSnap = await get(ref(rtdb, `${getBasePath()}/entities/${safeReg}`));
  const before = currentSnap.val() || {};
  await update(ref(rtdb, `${getBasePath()}/entities/${safeReg}`), {
    ...updates,
    updatedAt: new Date().toISOString()
  });
  logAuditEvent(AUDIT_ACTIONS.ENTITY_UPDATED, {
    entityId: safeReg,
    entityName: before.name || updates.name,
    before,
    after: { ...before, ...updates },
    changes: Object.keys(updates)
  }).catch(() => {});
}

/**
 * Atomically delete an entity and three years of its associated filings.
 *
 * Uses a multi-path update (all nulls) so the operation is atomic from
 * the client's perspective and does not leave orphaned filing records.
 *
 * @param {string} registrationNumber — CIPC registration number (Firebase key)
 * @returns {Promise<void>}
 */
export async function deleteEntity(registrationNumber) {
  const safeReg = validatePathSegment(registrationNumber, 'registrationNumber');
  const base = getBasePath();
  const entitySnap = await get(ref(rtdb, `${base}/entities/${safeReg}`));
  const entityBefore = entitySnap.val() || {};
  // Build deletion paths for entity + all filing years from 2024 through next year.
  // This range grows automatically as time passes — no hard-coded upper bound.
  const currentYear = new Date().getFullYear();
  const filingPaths = {};
  for (let y = 2024; y <= currentYear + 1; y++) {
    filingPaths[`${base}/filings/${y}/${safeReg}`] = null;
  }
  const paths = {
    [`${base}/entities/${safeReg}`]: null,
    ...filingPaths
  };
  await update(ref(rtdb), paths);
  logAuditEvent(AUDIT_ACTIONS.ENTITY_DELETED, {
    entityId: safeReg,
    entityName: entityBefore.name,
    before: entityBefore
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Obligation CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new obligation definition.
 *
 * @param {string} obligationId — Unique key (slug, e.g. "custom_municipality_fee")
 * @param {Object} data         — Obligation fields
 * @returns {Promise<Object>} The written record
 * @throws {Error} If obligationId already exists
 */
export async function createObligation(obligationId, data) {
  const safeId = validatePathSegment(obligationId, 'obligationId');
  const base = getBasePath();

  const existingSnap = await get(ref(rtdb, `${base}/obligations/${safeId}`));
  if (existingSnap.exists()) {
    throw new Error(`Obligation "${safeId}" already exists.`);
  }

  const now = new Date().toISOString();
  const record = {
    ...data,
    id: safeId,
    custom: true,
    createdAt: now,
    updatedAt: now
  };

  await set(ref(rtdb, `${base}/obligations/${safeId}`), record);
  logAuditEvent(AUDIT_ACTIONS.OBLIGATION_CREATED, {
    obligationId: safeId,
    obligationName: data.name,
    after: record
  }).catch(() => {});
  return record;
}

/**
 * Partially update an existing obligation.
 *
 * @param {string} obligationId
 * @param {Object} updates — Partial field map to merge
 * @returns {Promise<void>}
 */
export async function updateObligation(obligationId, updates) {
  const safeId = validatePathSegment(obligationId, 'obligationId');
  const base = getBasePath();
  const snap = await get(ref(rtdb, `${base}/obligations/${safeId}`));
  const before = snap.val() || {};

  await update(ref(rtdb, `${base}/obligations/${safeId}`), {
    ...updates,
    updatedAt: new Date().toISOString()
  });
  logAuditEvent(AUDIT_ACTIONS.OBLIGATION_UPDATED, {
    obligationId: safeId,
    obligationName: before.name || updates.name,
    before,
    after: { ...before, ...updates },
    changes: Object.keys(updates)
  }).catch(() => {});
}

/**
 * Delete an obligation and all associated filing records atomically.
 * Cleans up filings from 2024 through currentYear + 1 across all entities.
 *
 * @param {string} obligationId
 * @returns {Promise<void>}
 */
export async function deleteObligation(obligationId) {
  const safeId = validatePathSegment(obligationId, 'obligationId');
  const base = getBasePath();

  const [oblSnap, entitiesSnap] = await Promise.all([
    get(ref(rtdb, `${base}/obligations/${safeId}`)),
    get(ref(rtdb, `${base}/entities`))
  ]);
  const before = oblSnap.val() || {};
  const entityIds = Object.keys(entitiesSnap.val() || {});

  const currentYear = new Date().getFullYear();
  const paths = { [`${base}/obligations/${safeId}`]: null };

  for (let y = 2024; y <= currentYear + 1; y++) {
    for (const entityId of entityIds) {
      paths[`${base}/filings/${y}/${entityId}/${safeId}`] = null;
    }
  }

  await update(ref(rtdb), paths);
  logAuditEvent(AUDIT_ACTIONS.OBLIGATION_DELETED, {
    obligationId: safeId,
    obligationName: before.name,
    before
  }).catch(() => {});
}

/**
 * Set (or update) the manual due date for a specific entity-obligation-year combination.
 *
 * Used for obligations whose deadlineRule is 'manual', 'per_entity_licence_expiry',
 * or 'per_entity_inspection_anniversary' — where the due date is set per entity
 * rather than calculated from a formula.
 *
 * Writes only the manualDueDate field; does not affect filing status.
 *
 * @param {string|number} year         — Filing year
 * @param {string}        entityId     — CIPC registration number
 * @param {string}        obligationId — Obligation key
 * @param {string}        dateStr      — ISO date string "YYYY-MM-DD"
 * @returns {Promise<void>}
 */
export async function setManualDueDate(year, entityId, obligationId, dateStr) {
  const safeYear       = validatePathSegment(String(year), 'year');
  const safeEntity     = validatePathSegment(entityId, 'entityId');
  const safeObligation = validatePathSegment(obligationId, 'obligationId');
  const path = `${getBasePath()}/filings/${safeYear}/${safeEntity}/${safeObligation}`;
  await update(ref(rtdb, path), {
    manualDueDate: dateStr,
    updatedAt: new Date().toISOString()
  });
}

// ---------------------------------------------------------------------------
// Shared template operations (compliance/templates/)
// ---------------------------------------------------------------------------

const TEMPLATES_PATH = 'compliance/templates';

/**
 * Load all shared obligation templates.
 * Readable by any authenticated user.
 * @returns {Promise<Object>} Map of templateId -> template object
 */
export async function loadTemplates() {
  const snapshot = await get(ref(rtdb, TEMPLATES_PATH));
  return snapshot.val() || {};
}

/**
 * Create a new shared template. Requires admin token claim.
 * @param {string} templateId
 * @param {Object} data
 * @returns {Promise<Object>} The saved template object with id attached
 */
export async function createTemplate(templateId, data) {
  const safeId = validatePathSegment(templateId, 'templateId');
  const record = { ...data, custom: true };
  await set(ref(rtdb, `${TEMPLATES_PATH}/${safeId}`), record);
  return { ...record, id: safeId };
}

/**
 * Update an existing shared template. Requires admin token claim.
 * @param {string} templateId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export async function updateTemplate(templateId, updates) {
  const safeId = validatePathSegment(templateId, 'templateId');
  await update(ref(rtdb, `${TEMPLATES_PATH}/${safeId}`), updates);
}

/**
 * Delete a shared template. Requires admin token claim.
 * @param {string} templateId
 * @returns {Promise<void>}
 */
export async function deleteTemplate(templateId) {
  const safeId = validatePathSegment(templateId, 'templateId');
  await set(ref(rtdb, `${TEMPLATES_PATH}/${safeId}`), null);
}
