'use strict';

/**
 * D1 seed-commit core: write the supplier book the owner reviewed.
 *
 * EXTRACTED FROM THE CF SHELL deliberately. While this logic lived inside
 * `handleSeedRequest` it was reachable only over HTTP, and two independent
 * reviews found five defects in it that the handler tests could not see
 * (duplicate books, dropped products, an unrecoverable archive, a partial write
 * on bad input, and an import that could not finish inside the function
 * timeout). The sibling this module follows — food-cost-overview.js's
 * `buildOverview` — exports its db-injected core for exactly this reason.
 *
 * Takes an injected `db` and performs NO access checks: the caller must have
 * passed access.js first.
 */

const catalog = require('./catalog');
const { SupplierInput, productKey } = require('./validate');

const { ClientError } = catalog;

/**
 * Total products one commit may create. `selections` (<=500) x derived items
 * (<=2000) is a 1,000,000-write request, and nothing stops 500 selections all
 * naming the same source. Design §5.2 promised the caps were "enforced at the
 * Zod boundary, before any work" — for this dimension they were not enforced at
 * all. This is that promise, kept.
 */
const MAX_SEED_PRODUCTS_PER_COMMIT = 5000;

/**
 * Normalise a client-supplied supplier name through the SAME schema that will
 * store it, so the idempotency lookup key and the stored key are identical.
 *
 * Keying the lookup on the RAW string while storing the sanitised one meant any
 * name needing a trim or a control-char strip missed on re-run and duplicated
 * the whole book — including on an exact-replay retry.
 *
 * @throws {ClientError} when the name cannot be stored
 */
function normaliseName(raw) {
  try {
    return SupplierInput.parse({ name: raw }).name;
  } catch (_) {
    throw new ClientError('Each selected supplier needs a name of 1-120 characters');
  }
}

/**
 * @param {object[]} selections [{name?, supplierId?, sourceNames[], itemKeys[]}] — shape-checked
 * @param {object} derived      the server's own derivation for this location
 * @returns {Promise<{suppliersCreated, productsCreated, reactivated, ignoredNames, truncated}>}
 */
async function commitSeedBook(db, locId, uid, { selections, derived }, now) {
  const derivedNames = new Set(derived.suppliers.map((s) => s.name));

  // D1.1: items the owner attaches to a supplier by hand, for stock files whose
  // supplier column is absent or unmapped — which leaves EVERY item here.
  // Indexed by the server's own key so a client can only ever reference stock
  // the server itself derived; an invented key is reported, never trusted (the
  // 2026-06-05 attacker-controlled-arg rule, same as sourceNames).
  const unassignedByKey = new Map(
    (derived.unassigned && derived.unassigned.items ? derived.unassigned.items : [])
      .map((i) => [i.key || productKey(i), i]),
  );

  // VALIDATE EVERYTHING FIRST, WRITE NOTHING YET. Previously a bad name surfaced
  // its ZodError from inside the write loop, so earlier selections were already
  // persisted when the request 500'd — a partial import the owner could neither
  // see nor cleanly retry.
  const existingAll = await catalog.listSuppliers(db, locId, { includeArchived: true });
  const byId = new Map(existingAll.map((s) => [s.supplierId, s]));

  const planned = [];
  const ignoredNames = [];
  const ignoredItemKeys = [];
  for (const sel of selections) {
    const sourceNames = sel.sourceNames || [];
    const itemKeys = sel.itemKeys || [];

    // Target: an existing supplier by id, or a name to find-or-create.
    let target;
    if (sel.supplierId) {
      const match = byId.get(sel.supplierId);
      // Refuse rather than silently creating one — a stale id from a page open
      // across an archive+purge would otherwise fork the book invisibly.
      if (!match) throw new ClientError('Supplier not found');
      target = { supplierId: sel.supplierId, name: match.name };
    } else {
      target = { name: normaliseName(sel.name) };
    }

    const sources = new Set(sourceNames.filter((n) => derivedNames.has(n)));
    for (const n of sourceNames) if (!derivedNames.has(n)) ignoredNames.push(n);

    const assigned = [];
    for (const k of itemKeys) {
      const hit = unassignedByKey.get(k);
      if (hit) assigned.push(hit);
      else ignoredItemKeys.push(k);
    }

    if (!sources.size && !assigned.length) continue; // nothing real selected
    planned.push({ ...target, sources, assigned });
  }

  // Budget the whole request before any write. `sources` is a Set so the
  // membership test below is O(1) rather than a linear scan inside a nested
  // 500 x 2000 loop. Hand-assigned items count too — they are writes like any
  // other, and 500 selections x 2000 items is reachable through them as well.
  const plannedProducts = planned.reduce(
    (n, p) => n + derived.items.filter((i) => p.sources.has(i.supplierName)).length
      + p.assigned.length, 0,
  );
  if (plannedProducts > MAX_SEED_PRODUCTS_PER_COMMIT) {
    throw new ClientError(
      `That import would create ${plannedProducts} products; the limit is `
      + `${MAX_SEED_PRODUCTS_PER_COMMIT} per import. Import fewer suppliers at a time.`,
    );
  }

  const existingByName = new Map(existingAll.map((s) => [s.name, s]));

  let suppliersCreated = 0;
  let productsCreated = 0;
  let reactivated = 0;

  for (const plan of planned) {
    const { name, sources, assigned } = plan;
    // An explicit supplierId skips the find-or-create entirely.
    const match = plan.supplierId ? byId.get(plan.supplierId) : existingByName.get(name);
    let supplierId = plan.supplierId;

    if (!match) {
      ({ supplierId } = await catalog.saveSupplier(db, locId, uid, { name }, now));
      suppliersCreated += 1;
      existingByName.set(name, { supplierId, name, active: true });
    } else {
      supplierId = match.supplierId;
      // Re-importing a supplier the owner archived must bring it BACK, not
      // silently no-op. The lookup includes archived records (so we don't create
      // a duplicate), which previously meant a re-import reported success while
      // changing nothing and leaving the supplier unlistable.
      if (match.active === false) {
        await catalog.saveSupplier(db, locId, uid, { name, active: true }, now, supplierId);
        reactivated += 1;
      }
    }

    // One read for dedupe + count, then ONE atomic write for all the products.
    const already = await catalog.listProducts(db, locId, supplierId, { includeArchived: true });
    const seen = new Set(already.map(productKey));

    const toCreate = [];
    const consider = [
      ...derived.items.filter((i) => sources.has(i.supplierName)),
      ...assigned,
    ];
    for (const item of consider) {
      const key = item.key || productKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      toCreate.push({
        description: item.description,
        unit: item.unit,
        itemCode: item.itemCode,
        lastPrice: item.lastPrice,
      });
    }

    productsCreated += await catalog.createProductsBulk(
      db, locId, supplierId, toCreate, now, already.length,
    );
  }

  return {
    suppliersCreated,
    productsCreated,
    reactivated,
    // Surfaced rather than swallowed: commit RE-DERIVES, so a stock count
    // uploaded between preview and commit can invalidate the owner's ticks and
    // return zeros that otherwise read as success.
    ignoredNames,
    ignoredItemKeys,
    truncated: derived.truncated === true,
  };
}

// ALL exports in ONE assignment — the #188 export-clobber trap.
module.exports = { commitSeedBook, productKey, MAX_SEED_PRODUCTS_PER_COMMIT };
