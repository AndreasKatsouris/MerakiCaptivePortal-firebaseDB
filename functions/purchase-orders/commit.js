'use strict';

/**
 * D1 seed-commit core: write the supplier book the owner reviewed.
 *
 * EXTRACTED FROM THE CF SHELL deliberately — while this lived inside
 * `handleSeedRequest` it was reachable only over HTTP, and reviews found five
 * defects the handler tests could not see.
 *
 * Takes an injected `db` and performs NO access checks: the caller must have
 * passed access.js first.
 *
 * STRUCTURE: every read, every parse and every cap check happens in the PLAN
 * phase; the WRITE phase performs nothing that can fail on caller input. That
 * ordering is the fix for a partial-import bug where a bad row threw mid-loop
 * and left earlier suppliers persisted with no way to retry cleanly.
 */

const catalog = require('./catalog');
const {
  SupplierInput, ProductInput, productKey, MAX_PRODUCTS, MAX_SUPPLIERS,
} = require('./validate');

const { ClientError } = catalog;

/**
 * Total products one commit may create. selections (<=500) x derived items
 * (<=2000) is a 1,000,000-write request, and nothing stops many selections
 * naming the same supplier.
 */
const MAX_SEED_PRODUCTS_PER_COMMIT = 5000;
/** Distinct suppliers one commit may touch — each costs a catalogue read. */
const MAX_PLANS_PER_COMMIT = 200;
/** Reported-back arrays are truncated so a junk payload can't be reflected wholesale. */
const MAX_REPORTED = 50;

function normaliseName(raw) {
  try {
    return SupplierInput.parse({ name: raw }).name;
  } catch (_) {
    throw new ClientError('Each selected supplier needs a name of 1-120 characters');
  }
}

function capReport(list) {
  return list.length > MAX_REPORTED ? list.slice(0, MAX_REPORTED) : list;
}

/**
 * @param {object[]} selections [{name?, supplierId?, sourceNames[], itemRefs[]}]
 * @param {object} derived      the server's own derivation for this location
 * @param {number} [sourceTimestamp] the preview the owner reviewed, echoed back
 */
async function commitSeedBook(db, locId, uid, { selections, derived, sourceTimestamp }, now) {
  // STALENESS. `ref` is positional within ONE derivation, so a stock count
  // uploaded between preview and commit would silently rebind every ref to a
  // different row — new price, new unit, new supplier — and write it as though
  // it had been reviewed. Refuse, and tell the owner to re-review.
  if (sourceTimestamp !== undefined
      && Number(sourceTimestamp) !== Number(derived.sourceTimestamp)) {
    throw new ClientError(
      'Your stock count changed since you started reviewing. Run the import again so you '
      + 'can check the new figures before anything is saved.',
    );
  }

  const derivedNames = new Set(derived.suppliers.map((s) => s.name));
  // Indexed on the OPAQUE POSITIONAL REF, never the content key: the content key
  // is not unique (two rows of one description in different cost centres share
  // it), so a ref-keyed map is what stops one row silently standing in for
  // another's unit and price.
  const derivedByRef = new Map(
    [...derived.items, ...((derived.unassigned && derived.unassigned.items) || [])]
      .filter((i) => i.ref)
      .map((i) => [i.ref, i]),
  );

  // ---------- PLAN PHASE — reads and checks only, no writes ----------
  const existingAll = await catalog.listSuppliers(db, locId, { includeArchived: true });
  const byId = new Map(existingAll.map((s) => [s.supplierId, s]));
  const byName = new Map(existingAll.map((s) => [s.name, s]));

  /** Coalesced by target, so N selections naming one supplier cost ONE read. */
  const plans = new Map();
  const ignoredNames = [];
  const ignoredItemRefs = [];

  for (const sel of selections) {
    let name;
    let supplierId;
    if (sel.supplierId !== undefined) {
      const match = byId.get(sel.supplierId);
      if (!match) throw new ClientError('Supplier not found');
      supplierId = sel.supplierId;
      name = match.name;
    } else {
      name = normaliseName(sel.name);
      const match = byName.get(name);
      supplierId = match ? match.supplierId : undefined;
    }

    const targetKey = supplierId || `name:${name}`;
    if (!plans.has(targetKey)) {
      plans.set(targetKey, { name, supplierId, sources: new Set(), refs: new Set() });
    }
    const plan = plans.get(targetKey);

    for (const n of (sel.sourceNames || [])) {
      if (derivedNames.has(n)) plan.sources.add(n);
      else ignoredNames.push(n);
    }
    for (const r of (sel.itemRefs || [])) {
      if (derivedByRef.has(r)) plan.refs.add(r);
      else ignoredItemRefs.push(r);
    }
  }

  for (const [k, p] of [...plans]) if (!p.sources.size && !p.refs.size) plans.delete(k);
  if (plans.size > MAX_PLANS_PER_COMMIT) {
    throw new ClientError(`An import may touch at most ${MAX_PLANS_PER_COMMIT} suppliers at a time.`);
  }

  // SUPPLIER CAP, checked here rather than inside saveSupplier. catalog.js
  // enforces it per-create, which meant a commit crossing the cap partway
  // through wrote its earlier suppliers and then threw — the exact partial write
  // the PLAN/WRITE split exists to prevent, and the one case that slipped
  // through it. Counting includes archived suppliers, matching countChildren.
  const willCreate = [...plans.values()].filter((p) => !p.supplierId).length;
  if (existingAll.length + willCreate > MAX_SUPPLIERS) {
    throw new ClientError(
      `This location already has ${existingAll.length} suppliers and this import would add `
      + `${willCreate}; the limit is ${MAX_SUPPLIERS}. Import fewer suppliers at a time.`,
    );
  }

  // A hand-assigned item WINS over the supplier it was derived under: the owner
  // is correcting the stock file, and a catalogue entry means "we normally buy
  // this here", which cannot truthfully point at two suppliers at once. The
  // genuine backup-supplier case is an ORDER LINE, which is D2's job (design L8)
  // — conflating the two is precisely what L8 says would corrupt the next
  // suggested order.
  const handAssigned = new Set([...plans.values()].flatMap((p) => [...p.refs]));

  let plannedTotal = 0;
  for (const plan of plans.values()) {
    const fromDerivation = derived.items.filter(
      (i) => plan.sources.has(i.supplierName) && !handAssigned.has(i.ref),
    );
    const fromHand = [...plan.refs].map((r) => derivedByRef.get(r));

    plan.existing = plan.supplierId
      ? await catalog.listProducts(db, locId, plan.supplierId, { includeArchived: true })
      : [];
    const existingByKey = new Map(plan.existing.map((p) => [productKey(p), p]));

    const seen = new Set();
    plan.toCreate = [];
    plan.toRevive = [];
    for (const item of [...fromDerivation, ...fromHand]) {
      const key = productKey(item);
      if (seen.has(key)) continue;
      seen.add(key);

      const already = existingByKey.get(key);
      if (already) {
        // Archived products are revived, mirroring the supplier path. Without
        // this, re-assigning an archived product reported success and did
        // nothing.
        if (already.active === false) plan.toRevive.push(already);
        continue;
      }
      // PARSED HERE, in the plan phase. Previously this ran inside the write
      // loop, so an over-long `unit` threw a ZodError after earlier suppliers
      // had already been saved — a partial import every retry reproduced.
      plan.toCreate.push(ProductInput.parse({
        description: item.description,
        unit: item.unit,
        itemCode: item.itemCode,
        lastPrice: item.lastPrice,
      }));
    }

    // Per-supplier cap checked BEFORE any write, not mid-loop.
    if (plan.existing.length + plan.toCreate.length > MAX_PRODUCTS) {
      throw new ClientError(
        `${plan.name} would end up with more than ${MAX_PRODUCTS} products. `
        + 'Assign fewer items to that supplier.',
      );
    }
    plannedTotal += plan.toCreate.length;
  }

  if (plannedTotal > MAX_SEED_PRODUCTS_PER_COMMIT) {
    throw new ClientError(
      `That import would create ${plannedTotal} products; the limit is `
      + `${MAX_SEED_PRODUCTS_PER_COMMIT} per import. Import fewer suppliers at a time.`,
    );
  }

  // ---------- WRITE PHASE — nothing here can fail on caller input ----------
  let suppliersCreated = 0;
  let productsCreated = 0;
  let reactivated = 0;

  for (const plan of plans.values()) {
    let { supplierId } = plan;
    if (!supplierId) {
      ({ supplierId } = await catalog.saveSupplier(db, locId, uid, { name: plan.name }, now));
      suppliersCreated += 1;
    } else {
      const match = byId.get(supplierId);
      if (match && match.active === false) {
        await catalog.saveSupplier(db, locId, uid, { name: plan.name, active: true }, now, supplierId);
        reactivated += 1;
      }
    }

    for (const p of plan.toRevive) {
      const { productId, ...fields } = p;
      await catalog.saveProduct(db, locId, supplierId, { ...fields, active: true }, now, productId);
      reactivated += 1;
    }

    productsCreated += await catalog.createProductsBulk(
      db, locId, supplierId, plan.toCreate, now, plan.existing.length,
    );
  }

  return {
    suppliersCreated,
    productsCreated,
    reactivated,
    // Surfaced so the CLIENT can render them. Truncated: unmatched refs are
    // caller-supplied and would otherwise be reflected back wholesale.
    ignoredNames: capReport(ignoredNames),
    ignoredItemRefs: capReport(ignoredItemRefs),
    ignoredCount: ignoredNames.length + ignoredItemRefs.length,
    truncated: derived.truncated === true,
  };
}

// ALL exports in ONE assignment — the #188 export-clobber trap.
module.exports = {
  commitSeedBook, MAX_SEED_PRODUCTS_PER_COMMIT, MAX_PLANS_PER_COMMIT,
};
