// Purchase-order service — the supplier book (D1).
// Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §4.2.
//
// BODY SHAPE WARNING: poCatalog / poSeedFromStock read `req.body` FLAT, matching
// foodCostOverview. people-service.js in this same folder wraps its payload in
// `{ data }` for the rossGetStaff family. Do NOT copy that wrapper here — both
// shapes are live in this codebase and mixing them yields a 400 that reads like
// a validation bug (2026-06-04 LESSON). This divergence is the whole reason this
// file has its own `callFunction`.
//
// Server returns a bare { hasData: false } for no-access / not-entitled / no-data
// alike (anti-enumeration). Callers must not try to distinguish them.

import { auth } from '../../../config/firebase-config.js'

const FUNCTIONS_BASE_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net'

async function callFunction(functionName, payload) {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  const idToken = await user.getIdToken()
  const res = await fetch(`${FUNCTIONS_BASE_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload), // FLAT — no { data } envelope
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${functionName} failed (${res.status}): ${text}`)
  }
  return res.json()
}

export async function listSuppliers(locationId) {
  const out = await callFunction('poCatalog', { action: 'listSuppliers', locationId })
  return Array.isArray(out?.suppliers) ? out.suppliers : []
}

export async function saveSupplier({ locationId, supplierId, supplier }) {
  return callFunction('poCatalog', { action: 'saveSupplier', locationId, supplierId, supplier })
}

export async function archiveSupplier({ locationId, supplierId }) {
  return callFunction('poCatalog', { action: 'archiveSupplier', locationId, supplierId })
}

export async function listProducts({ locationId, supplierId }) {
  const out = await callFunction('poCatalog', { action: 'listProducts', locationId, supplierId })
  return Array.isArray(out?.products) ? out.products : []
}

export async function saveProduct({ locationId, supplierId, productId, product }) {
  return callFunction('poCatalog', { action: 'saveProduct', locationId, supplierId, productId, product })
}

/**
 * Derive a proposed book from the latest stock count. Does NOT write.
 *
 * Returns the server's derivation verbatim:
 *   { hasData, sourceTimestamp, truncated, unitDefaultedCount, duplicateGroupCount,
 *     suppliers:[{name, itemCount, mergeKey}],
 *     items:[{ref, key, supplierName, description, unit, unitDefaulted, itemCode,
 *              lastPrice, category, costCenter}],
 *     unassigned:{itemCount, items:[same shape, supplierName '']} }
 *
 * `ref` is an OPAQUE positional handle valid only for THIS derivation — it is
 * what commit takes in `itemRefs`. `key` is the catalogue's content dedupe key
 * and is NOT unique per row; never use it to identify a row.
 * — or a bare { hasData: false }.
 */
export async function previewSeed(locationId) {
  return callFunction('poSeedFromStock', { action: 'preview', locationId })
}

/**
 * Import the supplier book the owner reviewed. Idempotent on supplier name AND
 * on products, so re-running adds nothing.
 *
 * `selections: [{ name?, supplierId?, sourceNames?: [], itemRefs?: [] }]` is the
 * real contract:
 *   - `name` finds-or-creates a supplier; `supplierId` targets an existing one.
 *   - `sourceNames` are derived supplier names to import wholesale.
 *   - `itemRefs` are individual stock rows the owner assigned by hand. A
 *     hand-assigned row WINS over the supplier it derived under — assignment is
 *     a correction, and a catalogue entry cannot point at two suppliers.
 * The server ignores any name or ref it did not itself derive, and reports the
 * count in `ignoredCount`.
 *
 * `sourceTimestamp` echoes the preview being committed. Refs are positional
 * within one derivation, so the server refuses a stale preview rather than
 * binding them to different rows.
 *
 * `supplierNames: []` is the plain tick-only form, accepted for the simple case.
 */
export async function commitSeed({ locationId, selections, supplierNames, sourceTimestamp }) {
  const payload = { action: 'commit', locationId }
  if (sourceTimestamp !== undefined) payload.sourceTimestamp = sourceTimestamp
  if (Array.isArray(selections)) payload.selections = selections
  else payload.supplierNames = Array.isArray(supplierNames) ? supplierNames : []
  return callFunction('poSeedFromStock', payload)
}
