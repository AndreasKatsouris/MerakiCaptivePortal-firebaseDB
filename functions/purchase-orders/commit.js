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
const { SupplierInput } = require('./validate');

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
 * Dedupe key for a catalogue product.
 *
 * NAMESPACED. An un-namespaced `itemCode || description` let one row's
 * description collide with another row's code and silently drop a real product
 * — not exotic, since seed.js strips generated ITEM-<n> codes and so routinely
 * produces "no code + numeric-looking description".
 */
function productKey(p) {
  const code = String(p.itemCode || '').trim().toLowerCase();
  if (code) return `c:${code}`;
  return `d:${String(p.description || '').trim().toLowerCase()}`;
}

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
 * @param {object[]} selections [{name, sourceNames[]}] — already shape-checked
 * @param {object} derived      the server's own derivation for this location
 * @returns {Promise<{suppliersCreated, productsCreated, reactivated, ignoredNames, truncated}>}
 */
async function commitSeedBook(db, locId, uid, { selections, derived }, now) {
  const derivedNames = new Set(derived.suppliers.map((s) => s.name));

  // VALIDATE EVERYTHING FIRST, WRITE NOTHING YET. Previously a bad name surfaced
  // its ZodError from inside the write loop, so earlier selections were already
  // persisted when the request 500'd — a partial import the owner could neither
  // see nor cleanly retry.
  const planned = [];
  const ignoredNames = [];
  for (const sel of selections) {
    const name = normaliseName(sel.name);
    const sources = new Set(sel.sourceNames.filter((n) => derivedNames.has(n)));
    for (const n of sel.sourceNames) if (!derivedNames.has(n)) ignoredNames.push(n);
    if (!sources.size) continue; // nothing the server actually derived
    planned.push({ name, sources });
  }

  // Budget the whole request before any write. `sources` is a Set so the
  // membership test below is O(1) rather than a linear scan inside a nested
  // 500 x 2000 loop.
  const plannedProducts = planned.reduce(
    (n, p) => n + derived.items.filter((i) => p.sources.has(i.supplierName)).length, 0,
  );
  if (plannedProducts > MAX_SEED_PRODUCTS_PER_COMMIT) {
    throw new ClientError(
      `That import would create ${plannedProducts} products; the limit is `
      + `${MAX_SEED_PRODUCTS_PER_COMMIT} per import. Import fewer suppliers at a time.`,
    );
  }

  const existing = await catalog.listSuppliers(db, locId, { includeArchived: true });
  const existingByName = new Map(existing.map((s) => [s.name, s]));

  let suppliersCreated = 0;
  let productsCreated = 0;
  let reactivated = 0;

  for (const { name, sources } of planned) {
    const match = existingByName.get(name);
    let supplierId;

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
    for (const item of derived.items) {
      if (!sources.has(item.supplierName)) continue;
      const key = productKey(item);
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
    truncated: derived.truncated === true,
  };
}

// ALL exports in ONE assignment — the #188 export-clobber trap.
module.exports = { commitSeedBook, productKey, MAX_SEED_PRODUCTS_PER_COMMIT };
