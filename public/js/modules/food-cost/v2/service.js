// Food Cost v2 service — the module's ONLY I/O boundary (D3 T4).
//
// Everything side-effectful lives here so the stores stay pure state machines:
//   - the `foodCostOverview` CF fetch (authed onRequest, flat JSON body —
//     mirrors public/js/modules/ross/v2/agent/ross-agent-client.js minus SSE);
//   - mapping-memory reads/writes to foodCostMappings/{uid}/{fp} via the
//     client SDK (rules: database.rules.json, owner-scoped — design §4c);
//   - thin wrappers over the v1 parse chain (pure imports from
//     services/data-service.js, NO ?v= suffix — G3);
//   - saveStockUsage, LAZY-imported from database-operations.js because that
//     module firebase-inits at load (G3) — deferring keeps this file
//     importable outside the page (vitest mocks this module wholesale anyway).
//
// Every export is never-throws: failures come back as envelope values
// ({hasData:false, error} / {ok:false, error} / null) so the stores render
// inline banners uniformly (no SweetAlert2 on v2 surfaces).

import { auth, rtdb, ref, get, set, update } from '../../../config/firebase-config.js'
import {
  parseCSVData,
  detectAndMapHeaders,
  processDataWithMapping,
} from '../services/data-service.js'

const FUNCTIONS_BASE_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net'
const OVERVIEW_URL = `${FUNCTIONS_BASE_URL}/foodCostOverview`

// fingerprintHeaders emits a 64-char lowercase hex digest; anything else never
// touches an RTDB path (paths are interpolated — keep them key-safe).
const FINGERPRINT_RE = /^[a-f0-9]{64}$/

function mappingPath(uid, fingerprint) {
  return `foodCostMappings/${uid}/${fingerprint}`
}

/**
 * Fetch the §5 overview payload from the foodCostOverview CF.
 * Never throws. Returns the CF's JSON on success (hasData true or false);
 * transport/HTTP/auth failures come back as { hasData:false, error } so the
 * store can distinguish "empty state" (no error key) from "failed" (error key).
 *
 * @param {{locationId: string, daysToNextDelivery?: number}} opts
 * @returns {Promise<object>}
 */
export async function getFoodCostOverview({ locationId, daysToNextDelivery } = {}) {
  const user = auth.currentUser
  if (!user) {
    return { hasData: false, error: 'Please sign in to view food costs.' }
  }
  let res
  try {
    const idToken = await user.getIdToken()
    const body = { locationId }
    if (daysToNextDelivery !== undefined && daysToNextDelivery !== null) {
      body.daysToNextDelivery = daysToNextDelivery
    }
    res = await fetch(OVERVIEW_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    return { hasData: false, error: 'Could not reach the server. Check your connection and try again.' }
  }
  if (!res.ok) {
    // Normalized client-side string — never echo server error bodies into the UI.
    return { hasData: false, error: 'Could not load the food-cost overview. Please try again.' }
  }
  try {
    return await res.json()
  } catch {
    return { hasData: false, error: 'Unexpected server response. Please try again.' }
  }
}

/**
 * Read a stored mapping record for a header fingerprint. Never throws;
 * returns null when signed out, on an invalid fingerprint, on a miss, or on
 * any read failure — the caller treats every null as a fingerprint MISS.
 *
 * @param {string} fingerprint - 64-char hex from fingerprintHeaders
 * @returns {Promise<object|null>}
 */
export async function loadMapping(fingerprint) {
  try {
    const user = auth.currentUser
    if (!user || !FINGERPRINT_RE.test(String(fingerprint))) return null
    const snap = await get(ref(rtdb, mappingPath(user.uid, fingerprint)))
    return snap.exists() ? snap.val() : null
  } catch (error) {
    console.error('[food-cost-v2] loadMapping failed:', error && error.message)
    return null
  }
}

/**
 * Persist a mapping record (buildMappingRecord shape) under the fingerprint.
 * Never throws.
 *
 * @param {string} fingerprint
 * @param {object} record - output of buildMappingRecord (mapping-memory.js)
 * @returns {Promise<{ok: true} | {ok: false, error: string}>}
 */
export async function saveMapping(fingerprint, record) {
  try {
    const user = auth.currentUser
    if (!user) return { ok: false, error: 'Not signed in' }
    if (!FINGERPRINT_RE.test(String(fingerprint))) return { ok: false, error: 'Invalid fingerprint' }
    await set(ref(rtdb, mappingPath(user.uid, fingerprint)), record)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error && error.message) || 'Failed to save the column mapping.' }
  }
}

/**
 * Bump a stored mapping's useCount after a successful one-click reuse.
 * Best-effort: a failure never disturbs the save flow. Never throws.
 *
 * @param {string} fingerprint
 * @param {number} currentUseCount - from the stored record read this session
 * @returns {Promise<{ok: boolean}>}
 *
 * KNOWN RACE (T4 review N2, accepted): read-modify-write, not a transaction —
 * two concurrent uploads sharing a fingerprint can lose an increment. useCount
 * is a soft popularity counter, never load-bearing; switch to runTransaction
 * if that ever changes. Silent-degradation catches here and in loadMapping log
 * via console.error BECAUSE their failures are otherwise invisible; saveMapping
 * doesn't log — its failure surfaces in the save-failed banner (N1 rationale).
 */
export async function bumpMappingUseCount(fingerprint, currentUseCount) {
  try {
    const user = auth.currentUser
    if (!user || !FINGERPRINT_RE.test(String(fingerprint))) return { ok: false }
    const next = (Number(currentUseCount) || 0) + 1
    await update(ref(rtdb, mappingPath(user.uid, fingerprint)), { useCount: next })
    return { ok: true }
  } catch (error) {
    console.error('[food-cost-v2] bumpMappingUseCount failed:', error && error.message)
    return { ok: false }
  }
}

/**
 * v1 parse-chain wrappers (probe-proven side-effect-free imports — G3).
 * Wrapped rather than re-exported so the stores depend on ONE module and the
 * tests mock ONE module. parseCsv returns {headers, data:{headers, rows}} —
 * `data` is the whole parse object (services/data-service.js:34-37).
 */
export function parseCsv(csvContent) {
  return parseCSVData(csvContent)
}

export function detectMapping(headers) {
  return detectAndMapHeaders(headers)
}

export function processWithMapping(parsedData, mapping, params) {
  return processDataWithMapping(parsedData, mapping, params)
}

/**
 * Save a processed stock count via the existing v1 client write path
 * (locations/{loc}/stockUsage — D3-2; server-side save hardening is D4).
 * database-operations.js runs ensureFirebaseInitialized() AT MODULE LOAD, so
 * it is imported lazily here: page-only, never at unit-test import time.
 * Never throws.
 *
 * @param {object} data - the v1 saveStockUsage payload
 *   (refactored-app-component.js:1860-1889 shape)
 * @returns {Promise<{ok: true, result: object} | {ok: false, error: string}>}
 */
export async function saveStockUsage(data) {
  try {
    const { saveStockUsage: v1SaveStockUsage } = await import('../database-operations.js')
    const result = await v1SaveStockUsage(data)
    return { ok: true, result }
  } catch (error) {
    return { ok: false, error: (error && error.message) || 'Failed to save the stock count.' }
  }
}
