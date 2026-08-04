'use strict';

/**
 * D1 db-injected catalogue core: suppliers + their products.
 * Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §5.
 *
 * Storage is the new TOP-LEVEL node `purchasing/{locId}`, deliberately NOT
 * `locations/{locId}/…`: that parent cascades a world-readable `.read` and an
 * owner `.write` into every descendant (design G14), which would both leak
 * supplier data cross-tenant and make CF-mediated writes unenforceable.
 *
 * Deletes are SOFT (active:false). A supplier referenced by a sent PO must stay
 * resolvable forever, and D3 snapshots supplier fields onto the PO precisely so
 * history survives later edits.
 *
 * This core takes an injected `db` and performs NO access checks of its own —
 * every caller must have passed access.js first. Keeping the gate in exactly one
 * place is what makes "who may do this" a single decision rather than one per
 * action.
 */

const { SupplierInput, ProductInput, MAX_SUPPLIERS, MAX_PRODUCTS } = require('./validate');

/**
 * RTDB forbids . $ # [ ] / and control characters in keys. Ids reaching here can
 * be caller-supplied, so they are validated BEFORE being interpolated into any
 * path — a traversal guard, not merely a data-quality check. Deliberately
 * stricter than RTDB itself: push keys and seeded ids are all [A-Za-z0-9_-].
 */
const KEY_SAFE = /^[A-Za-z0-9_-]+$/;

/**
 * Errors the CALLER caused (bad input, not found, cap reached) — distinguished
 * by type so the shell can answer 400 without regexing `err.message`, which
 * false-positived on infrastructure failures like "Invalid Firebase Database
 * URL" and "connection was forcefully killed; invalid token".
 */
class ClientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClientError';
  }
}

function assertKeySafe(label, key) {
  if (typeof key !== 'string' || !KEY_SAFE.test(key)) {
    throw new ClientError(`${label} must be a key-safe string ([A-Za-z0-9_-])`);
  }
}

function suppliersRef(db, locId) {
  // locId is the highest-value id in the path and was previously interpolated
  // unvalidated, while this module's own comment claimed every caller-supplied
  // id was guarded. Both shells validate it, but these cores are explicitly
  // reusable and D2-D4 will add call sites.
  assertKeySafe('locationId', locId);
  return db.ref(`purchasing/${locId}/suppliers`);
}
function catalogRef(db, locId, supplierId) {
  assertKeySafe('locationId', locId);
  return db.ref(`purchasing/${locId}/catalog/${supplierId}`);
}

async function countChildren(ref) {
  const snap = await ref.once('value');
  return snap.exists() ? Object.keys(snap.val()).length : 0;
}

/** @returns {Promise<{supplierId:string}>} */
async function saveSupplier(db, locId, uid, input, now, supplierId) {
  const data = SupplierInput.parse(input);

  let existing = null;
  if (supplierId !== undefined) {
    assertKeySafe('supplierId', supplierId);
    const snap = await suppliersRef(db, locId).child(supplierId).once('value');
    if (!snap.exists()) throw new ClientError('Supplier not found');
    existing = snap.val();
  } else if (await countChildren(suppliersRef(db, locId)) >= MAX_SUPPLIERS) {
    // Cap CREATE only — an update at the cap must remain possible, otherwise a
    // full book becomes uneditable.
    throw new ClientError(`Supplier limit reached (${MAX_SUPPLIERS} per location)`);
  }

  const id = supplierId !== undefined ? supplierId : suppliersRef(db, locId).push().key;
  const record = {
    ...data,
    // `|| now` / `|| uid`: a record written by some other path (an admin via the
    // client SDK, a future writer) may lack these, and spreading `undefined`
    // into a set() is a hard 500 -- the Admin SDK rejects undefined values and
    // the app does not set ignoreUndefinedProperties.
    createdAt: (existing && existing.createdAt) || now,
    createdBy: (existing && existing.createdBy) || uid,
    updatedAt: now,
  };
  await suppliersRef(db, locId).child(id).set(record);
  return { supplierId: id };
}

async function archiveSupplier(db, locId, supplierId, now) {
  assertKeySafe('supplierId', supplierId);
  const ref = suppliersRef(db, locId).child(supplierId);
  const snap = await ref.once('value');
  if (!snap.exists()) throw new ClientError('Supplier not found');
  await ref.set({ ...snap.val(), active: false, updatedAt: now });
  return { supplierId, active: false };
}

async function listSuppliers(db, locId, { includeArchived = false } = {}) {
  const snap = await suppliersRef(db, locId).once('value');
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([supplierId, v]) => ({
      supplierId,
      ...v,
      // DERIVED, never stored (operator decision 2026-08-04). A stored status
      // would be a second copy of this fact, free to drift from the email field
      // it describes. Surfaces the seeded/export-only state: such a supplier can
      // be exported but not emailed (design §3 R3), and the UI must show that
      // rather than let it fail at send time in D3.
      needsEmail: !v.email,
    }))
    .filter((s) => (includeArchived ? true : s.active !== false))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

async function saveProduct(db, locId, supplierId, input, now, productId) {
  assertKeySafe('supplierId', supplierId);
  const supplier = await suppliersRef(db, locId).child(supplierId).once('value');
  if (!supplier.exists()) throw new ClientError('Supplier not found');

  const data = ProductInput.parse(input);
  const ref = catalogRef(db, locId, supplierId);

  if (productId !== undefined) {
    assertKeySafe('productId', productId);
    const snap = await ref.child(productId).once('value');
    if (!snap.exists()) throw new ClientError('Product not found');
  } else if (await countChildren(ref) >= MAX_PRODUCTS) {
    throw new ClientError(`Product limit reached (${MAX_PRODUCTS} per supplier)`);
  }

  const id = productId !== undefined ? productId : ref.push().key;
  const record = { ...data, updatedAt: now };
  if (data.lastPrice !== null) record.lastPriceAt = now;
  await ref.child(id).set(record);
  return { productId: id };
}

async function listProducts(db, locId, supplierId, { includeArchived = false } = {}) {
  assertKeySafe('supplierId', supplierId);
  const snap = await catalogRef(db, locId, supplierId).once('value');
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([productId, v]) => ({ productId, ...v }))
    .filter((p) => (includeArchived ? true : p.active !== false))
    .sort((a, b) => String(a.description || '').localeCompare(String(b.description || '')));
}

/**
 * Create many products for one supplier in ONE read and ONE atomic multi-path
 * write.
 *
 * Replaces N sequential saveProduct calls in the seed import. Each of those did
 * a supplier read plus a countChildren that downloaded the supplier's ENTIRE
 * catalogue just to call Object.keys().length -- so importing n products pulled
 * down 0+1+...+(n-1) records. Measured at the 2000-product cap that is ~260 MB
 * and ~6,000 round-trips, which does not finish inside the 60s function timeout.
 *
 * @param {number} currentCount products already stored (caller has it in hand)
 * @returns {Promise<number>} how many were written
 */
async function createProductsBulk(db, locId, supplierId, inputs, now, currentCount) {
  assertKeySafe('supplierId', supplierId);
  if (!inputs.length) return 0;
  if (currentCount + inputs.length > MAX_PRODUCTS) {
    throw new ClientError(`Product limit reached (${MAX_PRODUCTS} per supplier)`);
  }
  const ref = catalogRef(db, locId, supplierId);
  const updates = {};
  for (const input of inputs) {
    const data = ProductInput.parse(input);
    const record = { ...data, updatedAt: now };
    if (data.lastPrice !== null) record.lastPriceAt = now;
    updates[ref.push().key] = record;
  }
  await ref.update(updates);
  return Object.keys(updates).length;
}

// ALL exports in ONE assignment — the #188 export-clobber trap.
module.exports = {
  saveSupplier, archiveSupplier, listSuppliers, saveProduct, listProducts,
  createProductsBulk, assertKeySafe, ClientError,
};
