// Guards for the extracted seed-commit core. Every case here corresponds to a
// defect two independent reviews found in this logic while it lived inside the
// CF shell, where the handler tests could not reach it.
import { describe, it, expect, beforeEach } from 'vitest';

const { makeFakeRtdb } = require('./helpers/fake-rtdb');
const { commitSeedBook, productKey, MAX_SEED_PRODUCTS_PER_COMMIT } = require('../commit');
const catalog = require('../catalog');

const LOC = 'loc1';
const UID = 'u1';
let db;
beforeEach(() => { db = makeFakeRtdb(); });

const derivedOf = (suppliers, items, extra = {}) => ({
  hasData: true, sourceTimestamp: 1000, truncated: false,
  suppliers: suppliers.map((n) => ({ name: n, itemCount: 1, mergeKey: n.toLowerCase() })),
  items,
  unassigned: { itemCount: 0, items: [] },
  ...extra,
});
const item = (supplierName, description, itemCode = '') => ({
  supplierName, description, unit: 'ea', itemCode, lastPrice: null,
});

const names = async () => Object.values(
  (await db.ref(`purchasing/${LOC}/suppliers`).once('value')).val() || {},
).map((s) => s.name);

// ---------------------------------------------------------------------------
// The headline bug: the lookup key was the RAW client name, the stored key was
// the sanitised one, so any name needing a trim or a control-strip missed on
// re-run and duplicated the entire book.
describe('idempotency across name normalisation', () => {
  const derived = derivedOf(['Peninsula'], [item('Peninsula', 'water')]);

  it.each([
    ['leading space', '  Peninsula'],
    ['trailing space', 'Peninsula  '],
    ['control char', 'Peninsula'],
  ])('does not duplicate on re-run when the name has a %s', async (_label, raw) => {
    const sel = [{ name: raw, sourceNames: ['Peninsula'] }];
    const first = await commitSeedBook(db, LOC, UID, { selections: sel, derived }, 1000);
    const second = await commitSeedBook(db, LOC, UID, { selections: sel, derived }, 2000);

    expect(first.suppliersCreated).toBe(1);
    expect(second.suppliersCreated).toBe(0);
    expect(second.productsCreated).toBe(0);
    expect(await names()).toEqual(['Peninsula']);
  });

  it('treats variant spellings of one stored name as the same supplier', async () => {
    const derivedTwo = derivedOf(['Peninsula'], [item('Peninsula', 'water')]);
    await commitSeedBook(db, LOC, UID, {
      selections: [{ name: 'Peninsula', sourceNames: ['Peninsula'] }], derived: derivedTwo,
    }, 1000);
    await commitSeedBook(db, LOC, UID, {
      selections: [{ name: ' Peninsula ', sourceNames: ['Peninsula'] }], derived: derivedTwo,
    }, 2000);
    expect(await names()).toEqual(['Peninsula']);
  });

  it('is idempotent on an exact replay of the same payload', async () => {
    const sel = [{ name: 'Peninsula', sourceNames: ['Peninsula'] }];
    await commitSeedBook(db, LOC, UID, { selections: sel, derived }, 1000);
    const again = await commitSeedBook(db, LOC, UID, { selections: sel, derived }, 2000);
    expect(again).toMatchObject({ suppliersCreated: 0, productsCreated: 0 });
  });
});

// ---------------------------------------------------------------------------
describe('validate-before-write', () => {
  const derived = derivedOf(['Good Co', 'Peninsula'], [
    item('Good Co', 'apples'), item('Peninsula', 'water'),
  ]);

  it('writes NOTHING when a later selection carries an unstorable name', async () => {
    const selections = [
      { name: 'Good Co', sourceNames: ['Good Co'] },
      { name: 'x'.repeat(121), sourceNames: ['Peninsula'] },
    ];
    await expect(commitSeedBook(db, LOC, UID, { selections, derived }, 1000))
      .rejects.toBeInstanceOf(catalog.ClientError);
    // The partial import is the real defect: previously "Good Co" was already
    // persisted when the request 500'd.
    expect(await names()).toEqual([]);
  });

  it('rejects a name that sanitises away to nothing', async () => {
    const selections = [{ name: '', sourceNames: ['Good Co'] }];
    await expect(commitSeedBook(db, LOC, UID, { selections, derived }, 1000))
      .rejects.toBeInstanceOf(catalog.ClientError);
    expect(await names()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('product dedupe', () => {
  it('NAMESPACES the key so a description cannot collide with another code', async () => {
    // seed.js strips generated ITEM-<n> codes, so "no code + numeric-looking
    // description" is a shape the seeder itself produces.
    const derived = derivedOf(['P'], [
      item('P', '9001', ''),
      item('P', 'beef mince', '9001'),
    ]);
    const out = await commitSeedBook(db, LOC, UID, {
      selections: [{ name: 'P', sourceNames: ['P'] }], derived,
    }, 1000);
    expect(out.productsCreated).toBe(2);
  });

  it('still dedupes genuine repeats across merged spellings', async () => {
    const derived = {
      ...derivedOf(['ABC Meats', 'abc meats'], [
        item('ABC Meats', 'beef mince', '9001'),
        item('abc meats', 'beef mince', '9001'),
      ]),
    };
    const out = await commitSeedBook(db, LOC, UID, {
      selections: [{ name: 'ABC Meats', sourceNames: ['ABC Meats', 'abc meats'] }], derived,
    }, 1000);
    expect(out.productsCreated).toBe(1);
  });

  it('productKey namespaces code and description distinctly', () => {
    expect(productKey({ itemCode: '9001', description: 'x' })).toBe('c:9001');
    expect(productKey({ itemCode: '', description: '9001' })).toBe('d:9001');
    expect(productKey({ itemCode: '9001', description: 'x' }))
      .not.toBe(productKey({ itemCode: '', description: '9001' }));
  });
});

// ---------------------------------------------------------------------------
describe('archived suppliers', () => {
  const derived = derivedOf(['Peninsula'], [item('Peninsula', 'water')]);
  const sel = [{ name: 'Peninsula', sourceNames: ['Peninsula'] }];

  it('re-importing an archived supplier REACTIVATES it rather than silently no-opping', async () => {
    const first = await commitSeedBook(db, LOC, UID, { selections: sel, derived }, 1000);
    const supplierId = (await catalog.listSuppliers(db, LOC))[0].supplierId;
    await catalog.archiveSupplier(db, LOC, supplierId, 1500);
    expect(await catalog.listSuppliers(db, LOC)).toEqual([]);

    const out = await commitSeedBook(db, LOC, UID, { selections: sel, derived }, 2000);
    expect(out.reactivated).toBe(1);
    const live = await catalog.listSuppliers(db, LOC);
    expect(live.map((s) => s.name)).toEqual(['Peninsula']);
    // Reactivated, not duplicated.
    expect(live).toHaveLength(1);
    expect(first.suppliersCreated).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('work budget', () => {
  it('refuses an import that would exceed the per-commit product budget', async () => {
    const many = Array.from({ length: 60 }, (_, i) => item('P', `item ${i}`, `c${i}`));
    const derived = derivedOf(['P'], many);
    // 100 selections x 60 items = 6000 > 5000
    const selections = Array.from({ length: 100 }, (_, i) => (
      { name: `Clone ${i}`, sourceNames: ['P'] }
    ));
    await expect(commitSeedBook(db, LOC, UID, { selections, derived }, 1000))
      .rejects.toThrow(/limit is 5000/);
    expect(await names()).toEqual([]);
  });

  it('exposes the budget constant', () => {
    expect(MAX_SEED_PRODUCTS_PER_COMMIT).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
describe('reporting what was dropped', () => {
  it('reports source names the server did not derive instead of swallowing them', async () => {
    const derived = derivedOf(['Peninsula'], [item('Peninsula', 'water')]);
    const out = await commitSeedBook(db, LOC, UID, {
      selections: [{ name: 'X', sourceNames: ['Peninsula', 'Injected Co'] }], derived,
    }, 1000);
    expect(out.ignoredNames).toEqual(['Injected Co']);
  });

  it('propagates truncation so a partial derivation is not reported as a clean import', async () => {
    const derived = derivedOf(['P'], [item('P', 'a')], { truncated: true });
    const out = await commitSeedBook(db, LOC, UID, {
      selections: [{ name: 'P', sourceNames: ['P'] }], derived,
    }, 1000);
    expect(out.truncated).toBe(true);
  });
});
