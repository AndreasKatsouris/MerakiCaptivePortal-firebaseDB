/**
 * Firebase Service for Corporate Compliance Module
 *
 * Handles all Firebase Realtime Database operations for the
 * compliance tracker — entities, obligations, filings, and settings.
 *
 * Errors are NOT caught here; they bubble up to the calling layer
 * so the UI can present contextual feedback.
 */

import {
  rtdb,
  ref,
  get,
  set,
  update
} from '../../../config/firebase-config.js';

// Base path in RTDB
const BASE_PATH = 'compliance';

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
  const snapshot = await get(ref(rtdb, `${BASE_PATH}/entities`));
  return snapshot.val() || {};
}

/**
 * Load all obligation definitions.
 * @returns {Promise<Object>} Map of obligationId -> obligation object
 */
export async function loadObligations() {
  const snapshot = await get(ref(rtdb, `${BASE_PATH}/obligations`));
  return snapshot.val() || {};
}

/**
 * Load filing records for a specific calendar year.
 * @param {string|number} year — e.g. 2026
 * @returns {Promise<Object>} Nested map: entityId -> obligationId -> filing
 */
export async function loadFilings(year) {
  const safeYear = validatePathSegment(String(year), 'year');
  const snapshot = await get(ref(rtdb, `${BASE_PATH}/filings/${safeYear}`));
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
  const path = `${BASE_PATH}/filings/${safeYear}/${safeEntity}/${safeObligation}`;
  await set(ref(rtdb, path), {
    ...data,
    updatedAt: new Date().toISOString()
  });
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
  await update(ref(rtdb, `${BASE_PATH}/entities/${safeEntity}`), {
    ...flags,
    updatedAt: new Date().toISOString()
  });
}

