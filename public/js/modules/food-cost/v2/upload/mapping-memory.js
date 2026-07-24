// Mapping-memory for the food-cost v2 upload wizard (design §4c).
//
// Pure browser-ESM module: no firebase, no DOM at module scope. WebCrypto
// (crypto.subtle) is used only INSIDE fingerprintHeaders — available in the
// browser and in the repo's vitest node environment (probe-verified).
//
// Persisted shape at foodCostMappings/{uid}/{fingerprint}:
//   { headersNorm: string[], mapping: {field: colIndex}, label, savedAt, useCount }
//
// The `mapping` object mirrors detectAndMapHeaders' contract
// (services/data-service.js:142 → data-processor.js:96): ~18 keys always
// present, with -1 as the legal "unmapped" sentinel. Stored mappings are
// UNTRUSTED at apply time — validateStoredMapping is the load-bearing control
// (RTDB rules can't bound array/object cardinality), and it runs on BOTH the
// auto-apply and manual paths (security F4/F5).

const MAX_LABEL_CHARS = 100
const MAX_HEADER_CHARS = 120

// The 18 fields detectAndMapHeaders can produce (data-processor.js:97-116).
// validateStoredMapping rejects any other key (T1 review S2): this bounds the
// mapping's cardinality (§4c's load-bearing-control duty) AND blocks
// __proto__/constructor keys from flowing to the applier in one move.
export const KNOWN_MAPPING_FIELDS = Object.freeze([
  'itemCode', 'description', 'category', 'unit', 'costCenter',
  'openingQty', 'openingValue', 'purchaseQty', 'purchases',
  'closingQty', 'closingValue', 'unitCost', 'supplierName',
  'stockLevel', 'totalCost', 'openingStockValue', 'closingStockValue',
  'purchaseValue',
])
const KNOWN_FIELD_SET = new Set(KNOWN_MAPPING_FIELDS)

/**
 * Normalize a raw CSV header row for fingerprinting and comparison.
 * String()s each entry, NFC-normalizes (composed vs combining accents
 * fingerprint identically — T1 review N1), trims, lowercases, collapses
 * internal whitespace runs to single spaces, and caps each entry to 120 chars.
 * The cap lives HERE so fingerprint, storage, and comparison all share ONE
 * canonical representation (T1 review S1 — a cap applied only at storage time
 * made >120-char headers permanently miss re-validation). ORDER IS PRESERVED —
 * column indexes are positional, so order is part of the fingerprint identity.
 *
 * @param {Array} headers - raw header row
 * @returns {string[]} normalized headers (new array; input untouched)
 */
export function normalizeHeaders(headers) {
  if (!Array.isArray(headers)) return []
  return headers.map((h) =>
    String(h).normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_HEADER_CHARS)
  )
}

/**
 * SHA-256 fingerprint of a normalized header array.
 *
 * JSON.stringify (not join) prevents delimiter-injection collisions —
 * ['a","b'] and ['a','b'] digest differently.
 *
 * CONSUMER CONTRACT: crypto.subtle is undefined in insecure contexts
 * (plain-http non-localhost) and this function will REJECT there. The wizard
 * must try/catch the await and degrade to detect+confirm — never let a
 * fingerprint failure break the whole upload (T1 review).
 *
 * @param {string[]} headersNorm - output of normalizeHeaders
 * @returns {Promise<string>} lowercase hex digest (64 chars)
 */
export async function fingerprintHeaders(headersNorm) {
  const bytes = new TextEncoder().encode(JSON.stringify(headersNorm))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Re-validate a stored mapping record against the incoming normalized headers.
 * Runs on BOTH the auto-apply and manual paths; any failure means fall back to
 * detect+confirm. -1 is the legal "unmapped" sentinel; every other mapping
 * value must be an integer column index in [0, headerCount).
 *
 * @param {object} stored - record read from foodCostMappings/{uid}/{fp}
 * @param {string[]} headersNorm - incoming normalized headers
 * @returns {{valid: true} | {valid: false, reason: string}}
 */
export function validateStoredMapping(stored, headersNorm) {
  if (!isPlainObject(stored)) {
    return { valid: false, reason: 'stored record is not an object' }
  }
  if (!Array.isArray(stored.headersNorm)) {
    return { valid: false, reason: 'stored headersNorm missing or not an array' }
  }
  if (!Array.isArray(headersNorm)) {
    return { valid: false, reason: 'incoming headersNorm is not an array' }
  }
  if (stored.headersNorm.length !== headersNorm.length) {
    return { valid: false, reason: 'header count mismatch' }
  }
  for (let i = 0; i < headersNorm.length; i++) {
    if (stored.headersNorm[i] !== headersNorm[i]) {
      return { valid: false, reason: `header mismatch at column ${i}` }
    }
  }
  if (!isPlainObject(stored.mapping)) {
    return { valid: false, reason: 'stored mapping missing or not an object' }
  }
  const headerCount = headersNorm.length
  for (const [field, colIndex] of Object.entries(stored.mapping)) {
    if (!KNOWN_FIELD_SET.has(field)) {
      // S2: whitelist bounds cardinality to ≤18 AND blocks __proto__/constructor
      return { valid: false, reason: `mapping contains unknown field "${field}"` }
    }
    if (typeof colIndex !== 'number' || !Number.isInteger(colIndex)) {
      return { valid: false, reason: `mapping value for "${field}" is not an integer` }
    }
    if (colIndex < -1 || colIndex >= headerCount) {
      return { valid: false, reason: `mapping value for "${field}" is out of range` }
    }
  }
  if (stored.label !== undefined) {
    if (typeof stored.label !== 'string' || stored.label.length > MAX_LABEL_CHARS) {
      return { valid: false, reason: 'label is not a string of at most 100 chars' }
    }
  }
  return { valid: true }
}

/**
 * Build a fresh mapping record for persistence. Length caps mirror the RTDB
 * rules client-side (label ≤ 100, each header entry ≤ 120).
 *
 * @param {string[]} headersNorm - normalized headers
 * @param {object} mapping - detectAndMapHeaders-shaped {field: colIndex}
 * @param {string} label - user-facing label (coerced, capped)
 * @param {number} now - timestamp for savedAt
 * @returns {object} new record (inputs are not aliased)
 */
export function buildMappingRecord(headersNorm, mapping, label, now) {
  // Keep only the 18 known fields (S2 defensive symmetry with validate).
  const cleanMapping = {}
  for (const field of KNOWN_MAPPING_FIELDS) {
    if (mapping && typeof mapping[field] === 'number') cleanMapping[field] = mapping[field]
  }
  return {
    headersNorm: capHeaderEntries(headersNorm), // belt-and-braces; normalize already caps (S1)
    mapping: cleanMapping,
    label: String(label || '').slice(0, MAX_LABEL_CHARS),
    savedAt: now,
    useCount: 0,
  }
}

function capHeaderEntries(headersNorm) {
  if (!Array.isArray(headersNorm)) return []
  return headersNorm.map((h) => String(h).slice(0, MAX_HEADER_CHARS))
}
