// Convention: import test globals from vitest (ESM), require the module under
// test (CJS) — matching functions/payments/__tests__/bundles.test.js.
import { describe, it, expect } from 'vitest';

const { deriveCatalogFromStock, mergeKeyOf, MAX_SEED_ITEMS } = require('../seed');

const rec = (ts, stockItems) => ({ timestamp: ts, stockItems });

describe('deriveCatalogFromStock', () => {
  it('returns hasData:false for no records', () => {
    expect(deriveCatalogFromStock([])).toEqual({ hasData: false });
    expect(deriveCatalogFromStock(null)).toEqual({ hasData: false });
  });

  it('returns hasData:false when the latest record has no items', () => {
    expect(deriveCatalogFromStock([rec(2, [])])).toEqual({ hasData: false });
  });

  it('uses the LATEST record as the stock position, not the first (design G9)', () => {
    const out = deriveCatalogFromStock([
      rec(1, [{ description: 'old', unit: 'ea', supplierName: 'Old Co' }]),
      rec(2, [{ description: 'new', unit: 'ea', supplierName: 'New Co' }]),
    ]);
    expect(out.suppliers.map((s) => s.name)).toEqual(['New Co']);
  });

  it('sorts by timestamp — input order must not matter', () => {
    const out = deriveCatalogFromStock([
      rec(9, [{ description: 'newest', unit: 'ea', supplierName: 'Z Co' }]),
      rec(1, [{ description: 'oldest', unit: 'ea', supplierName: 'A Co' }]),
    ]);
    expect(out.suppliers.map((s) => s.name)).toEqual(['Z Co']);
  });

  it('groups items by trimmed supplier name and counts them', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'water', unit: 'ea', supplierName: ' Peninsula ' },
      { description: 'cola', unit: 'ea', supplierName: 'Peninsula' },
      { description: 'beans', unit: 'kg', supplierName: 'Bean There' },
    ])]);
    const byName = Object.fromEntries(out.suppliers.map((s) => [s.name, s.itemCount]));
    expect(byName).toEqual({ 'Bean There': 1, Peninsula: 2 });
  });

  it('sorts suppliers alphabetically', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'a', unit: 'ea', supplierName: 'Zulu' },
      { description: 'b', unit: 'ea', supplierName: 'Alpha' },
    ])]);
    expect(out.suppliers.map((s) => s.name)).toEqual(['Alpha', 'Zulu']);
  });

  it('REPORTS unassigned items in their own bucket — never silently drops them (G10)', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'assigned', unit: 'ea', supplierName: 'Peninsula' },
      { description: 'blank', unit: 'ea', supplierName: '   ' },
      { description: 'missing', unit: 'ea' },
    ])]);
    expect(out.suppliers.map((s) => s.name)).toEqual(['Peninsula']);
    expect(out.unassigned.itemCount).toBe(2);
    expect(out.unassigned.items.map((i) => i.description)).toEqual(['blank', 'missing']);
  });

  it('carries unit, itemCode and a usable lastPrice onto each product', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { itemCode: '10127', description: 'water', unit: 'ea', supplierName: 'P', unitCost: 6.5 },
    ])]);
    expect(out.items[0]).toMatchObject({
      supplierName: 'P', itemCode: '10127', description: 'water', unit: 'ea', lastPrice: 6.5,
    });
  });

  it('treats a flagged, absent, zero or non-finite unitCost as unknown price', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'flagged', unit: 'ea', supplierName: 'P', unitCost: 5, hasMissingUnitCost: true },
      { description: 'absent', unit: 'ea', supplierName: 'P' },
      { description: 'zero', unit: 'ea', supplierName: 'P', unitCost: 0 },
      { description: 'nan', unit: 'ea', supplierName: 'P', unitCost: Number.NaN },
    ])]);
    expect(out.items.map((i) => i.lastPrice)).toEqual([null, null, null, null]);
  });

  it('defaults a missing unit to "ea" rather than failing the row', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'no unit', supplierName: 'P' },
    ])]);
    expect(out.items[0].unit).toBe('ea');
  });

  it('flags rows whose unit was defaulted, so the review UI can offer a bulk fix', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'no unit', supplierName: 'P' },
      { description: 'has unit', unit: 'kg', supplierName: 'P' },
    ])]);
    expect(out.items.map((i) => i.unitDefaulted)).toEqual([true, false]);
    expect(out.unitDefaultedCount).toBe(1);
  });

  it('skips rows with no usable description', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: '  ', unit: 'ea', supplierName: 'P' },
      { unit: 'ea', supplierName: 'P' },
      { description: 'real', unit: 'ea', supplierName: 'P' },
    ])]);
    expect(out.items.map((i) => i.description)).toEqual(['real']);
  });

  it('sanitizes control characters out of tenant strings', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'wa\x00ter', unit: 'ea', supplierName: 'P\x1Fenin' },
    ])]);
    expect(out.items[0].description).toBe('water');
    expect(out.suppliers[0].name).toBe('Penin');
  });

  it('caps the number of items processed and reports the truncation', () => {
    const many = Array.from({ length: MAX_SEED_ITEMS + 10 }, (_, i) => (
      { description: `item ${i}`, unit: 'ea', supplierName: 'P' }
    ));
    const out = deriveCatalogFromStock([rec(1, many)]);
    expect(out.items).toHaveLength(MAX_SEED_ITEMS);
    expect(out.truncated).toBe(true);
  });

  it('does not set truncated when under the cap', () => {
    expect(deriveCatalogFromStock([rec(1, [
      { description: 'a', unit: 'ea', supplierName: 'P' },
    ])]).truncated).toBe(false);
  });

  it('tolerates a non-array stockItems shape (GT9) as empty', () => {
    expect(deriveCatalogFromStock([rec(1, { a: { description: 'x' } })])).toEqual({ hasData: false });
  });

  it('reports the source record date so the UI can label the import', () => {
    const out = deriveCatalogFromStock([rec(1717200000000, [
      { description: 'a', unit: 'ea', supplierName: 'P' },
    ])]);
    expect(out.sourceTimestamp).toBe(1717200000000);
  });
});

// The CSV parser invents `ITEM-<0..999>` when a row has no item code
// (public/js/modules/food-cost/data-processor.js:400). That value is random per
// parse AND drawn from only 1000 slots, so it is neither stable nor unique. D4
// pre-fill links catalogue products back to stock items by itemCode, so storing
// an invented one would silently mis-link. An absent code is honest.
describe('generated itemCode placeholders', () => {
  it('drops the ITEM-<n> placeholder the CSV parser invents', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { itemCode: 'ITEM-7', description: 'a', unit: 'ea', supplierName: 'P' },
      { itemCode: 'ITEM-999', description: 'b', unit: 'ea', supplierName: 'P' },
    ])]);
    expect(out.items.map((i) => i.itemCode)).toEqual(['', '']);
  });

  it('keeps real codes that merely start with ITEM', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { itemCode: 'ITEM-1234', description: 'a', unit: 'ea', supplierName: 'P' },
      { itemCode: 'ITEM-A7', description: 'b', unit: 'ea', supplierName: 'P' },
      { itemCode: 'ITEMS-7', description: 'c', unit: 'ea', supplierName: 'P' },
    ])]);
    expect(out.items.map((i) => i.itemCode)).toEqual(['ITEM-1234', 'ITEM-A7', 'ITEMS-7']);
  });
});

// The supplier column is free text, so the same supplier arrives under several
// spellings. mergeKeyOf gives the review UI a grouping hint; it NEVER merges
// automatically — which supplier records are really the same is the owner's
// call (operator decision 2026-08-04: tick + rename + merge).
describe('mergeKeyOf', () => {
  it('folds case, punctuation and repeated whitespace', () => {
    expect(mergeKeyOf('ABC Meats')).toBe('abc meats');
    expect(mergeKeyOf('abc  meats')).toBe('abc meats');
    expect(mergeKeyOf('A.B.C. Meats!')).toBe('a b c meats');
  });

  it('folds accents so Café and Cafe group together', () => {
    expect(mergeKeyOf('Café Foods')).toBe(mergeKeyOf('Cafe Foods'));
  });

  it('is empty for a blank name', () => {
    expect(mergeKeyOf('   ')).toBe('');
  });
});

describe('duplicate grouping hints', () => {
  it('exposes a mergeKey on every supplier without collapsing distinct names', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'a', unit: 'ea', supplierName: 'ABC Meats' },
      { description: 'b', unit: 'ea', supplierName: 'abc meats' },
      { description: 'c', unit: 'ea', supplierName: 'Bean There' },
    ])]);
    // Distinct names are preserved — the owner decides what merges. Asserted as
    // a set: the exact ordering of 'ABC Meats' vs 'abc meats' is ICU collation
    // trivia, not behaviour this module owns (the alphabetical-sort test above
    // covers ordering with an unambiguous pair).
    expect(out.suppliers).toHaveLength(3);
    expect(new Set(out.suppliers.map((s) => s.name)))
      .toEqual(new Set(['ABC Meats', 'abc meats', 'Bean There']));
    const keys = Object.fromEntries(out.suppliers.map((s) => [s.name, s.mergeKey]));
    expect(keys['ABC Meats']).toBe(keys['abc meats']);
    expect(keys['Bean There']).not.toBe(keys['ABC Meats']);
  });

  it('reports how many duplicate groups the owner should review', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'a', unit: 'ea', supplierName: 'ABC Meats' },
      { description: 'b', unit: 'ea', supplierName: 'ABC  Meats.' },
      { description: 'c', unit: 'ea', supplierName: 'Solo Co' },
    ])]);
    expect(out.duplicateGroupCount).toBe(1);
  });

  it('reports no duplicate groups when every name is distinct', () => {
    const out = deriveCatalogFromStock([rec(1, [
      { description: 'a', unit: 'ea', supplierName: 'One' },
      { description: 'b', unit: 'ea', supplierName: 'Two' },
    ])]);
    expect(out.duplicateGroupCount).toBe(0);
  });
});
