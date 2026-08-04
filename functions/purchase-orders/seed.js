'use strict';

/**
 * D1 pure seed derivation: one location's stockUsage records -> a PROPOSED
 * supplier book for the owner to review.
 *
 * Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §4.3, §8.2.
 *
 * PURE — never fetches. Records arrive from exactly one access-checked read in
 * the CF shell (same boundary functions/agent/food-cost/stats.js documents).
 *
 * Two behaviours that are requirements, not conveniences:
 *  - The LATEST record is the stock position (design G9). Records are sorted by
 *    `timestamp`; caller order is irrelevant.
 *  - Items with no supplier are REPORTED in their own bucket, never dropped
 *    (design G10 / §8.2). suggestOrder's supplierFilter silently excludes them,
 *    which is the behaviour this bucket exists to make visible.
 *
 * NOTHING here is written directly. Everything this returns is a PROPOSAL the
 * owner reviews and ticks; `poSeedFromStock` commit writes only what came back.
 */

const { sanitizeText, productKey } = require('./validate');

const MAX_SEED_ITEMS = 2000; // matches suggest.js MAX_ITEMS_PER_RECORD (P5)

/**
 * The CSV parser invents an item code when a row has none:
 *   itemCode: itemCode || `ITEM-${Math.floor(Math.random() * 1000)}`
 *   (public/js/modules/food-cost/data-processor.js:400)
 *
 * That value is random per parse AND drawn from only 1000 slots, so it is
 * neither stable across re-uploads nor unique within one count. D4 pre-fill
 * links catalogue products back to stock items by itemCode, so persisting an
 * invented code would silently mis-link products later — the expensive kind of
 * bug, because it looks like data corruption rather than a seeding choice.
 *
 * Anchored and bounded to 1-3 digits so genuine codes that merely start with
 * "ITEM" (ITEM-1234, ITEM-A7, ITEMS-7) are kept.
 */
const GENERATED_ITEM_CODE = /^ITEM-\d{1,3}$/;

function isGeneratedItemCode(code) {
  return GENERATED_ITEM_CODE.test(code);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** suggest.js P4 cost gate: unknown unless flagged-clean, finite and > 0. */
function priceOf(item) {
  const raw = item.unitCost;
  const ok = item.hasMissingUnitCost !== true
    && typeof raw === 'number' && Number.isFinite(raw) && raw > 0;
  return ok ? raw : null;
}

// Combining diacritical marks. Built via RegExp from an escaped string rather
// than a literal character class so the range survives any file encoding.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Grouping hint for the seed review UI. The supplier column is free text, so
 * one supplier routinely arrives as "ABC Meats", "abc  meats" and "A.B.C.
 * Meats." Folding case, accents and punctuation lets the UI PROPOSE that those
 * are the same company.
 *
 * This never merges anything on its own — which records are really the same
 * supplier is the owner's call (operator decision 2026-08-04). Auto-merging on
 * a fuzzy key would silently destroy a real distinction like "Cape Fruit" vs
 * "Cape Fruit Wholesale".
 */
function mergeKeyOf(name) {
  return String(name == null ? '' : name)
    .normalize('NFD')
    .replace(COMBINING_MARKS, '') // strip combining accents: Cafe' -> Cafe
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * @param {object[]} records raw stockUsage records (Object.values of the node)
 * @returns {{hasData:false}|{
 *   hasData:true, sourceTimestamp:number, truncated:boolean,
 *   unitDefaultedCount:number, duplicateGroupCount:number,
 *   suppliers:{name:string,itemCount:number,mergeKey:string}[],
 *   items:{supplierName:string,description:string,unit:string,unitDefaulted:boolean,
 *          itemCode:string,lastPrice:number|null}[],
 *   unassigned:{itemCount:number,items:object[]}
 * }}
 */
function deriveCatalogFromStock(records) {
  const recs = (records || [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ ...r, ts: num(r.timestamp) }))
    .sort((a, b) => a.ts - b.ts);
  if (!recs.length) return { hasData: false };

  const latest = recs[recs.length - 1];
  const raw = Array.isArray(latest.stockItems) ? latest.stockItems : [];
  const truncated = raw.length > MAX_SEED_ITEMS;
  const slice = truncated ? raw.slice(0, MAX_SEED_ITEMS) : raw;
  if (!slice.length) return { hasData: false };

  const items = [];
  const unassignedItems = [];
  const counts = new Map();
  let unitDefaultedCount = 0;

  for (const it of slice) {
    if (!it || typeof it !== 'object') continue;
    const description = sanitizeText(it.description).trim();
    if (!description) continue; // a row with no name is not a product

    const unit = sanitizeText(it.unit).trim();
    const itemCode = sanitizeText(it.itemCode).trim();

    const product = {
      supplierName: sanitizeText(it.supplierName).trim(),
      description,
      // Defaults mirror the CSV parser's own (data-processor.js:400-405) so a
      // grouping UI never renders a nameless bucket.
      category: sanitizeText(it.category).trim() || 'Uncategorized',
      costCenter: sanitizeText(it.costCenter).trim() || 'Main',
      unit: unit || 'ea',
      // Surfaced so the review UI can offer a bulk unit fix instead of leaving
      // the owner to spot every silently-defaulted row by eye.
      unitDefaulted: !unit,
      itemCode: isGeneratedItemCode(itemCode) ? '' : itemCode,
      lastPrice: priceOf(it),
    };
    // Stable handle the client sends back on commit to say "assign THIS item to
    // that supplier". Deliberately the same key the catalogue dedupes on, so an
    // assignment and an existing product collapse rather than duplicate. Two
    // codeless items sharing a description share a key — they are duplicates of
    // each other anyway and dedupe would have merged them regardless.
    product.key = productKey(product);
    if (product.unitDefaulted) unitDefaultedCount += 1;

    if (!product.supplierName) {
      unassignedItems.push(product);
      continue;
    }
    items.push(product);
    counts.set(product.supplierName, (counts.get(product.supplierName) || 0) + 1);
  }

  if (!items.length && !unassignedItems.length) return { hasData: false };

  const suppliers = [...counts.entries()]
    .map(([name, itemCount]) => ({ name, itemCount, mergeKey: mergeKeyOf(name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // How many mergeKeys are claimed by more than one distinct spelling — i.e.
  // how many groups the owner is being asked to look at, not how many rows.
  const byKey = new Map();
  for (const s of suppliers) {
    // An EMPTY mergeKey means "no ASCII alphanumerics to fold" — e.g. names in
    // Cyrillic, Japanese or pure punctuation. Those are not duplicates of each
    // other, and grouping them would propose merging unrelated companies, which
    // is precisely the outcome this hint exists to avoid.
    if (!s.mergeKey) continue;
    byKey.set(s.mergeKey, (byKey.get(s.mergeKey) || 0) + 1);
  }
  let duplicateGroupCount = 0;
  for (const n of byKey.values()) if (n > 1) duplicateGroupCount += 1;

  return {
    hasData: true,
    sourceTimestamp: latest.ts,
    truncated,
    unitDefaultedCount,
    duplicateGroupCount,
    suppliers,
    items,
    unassigned: { itemCount: unassignedItems.length, items: unassignedItems },
  };
}

// ALL exports in ONE assignment — the #188 export-clobber trap.
module.exports = {
  deriveCatalogFromStock, mergeKeyOf, isGeneratedItemCode, MAX_SEED_ITEMS,
};
