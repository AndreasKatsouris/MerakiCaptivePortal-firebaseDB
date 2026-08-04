// Convention: import test globals from vitest (ESM), require the module under
// test (CJS) — matching functions/payments/__tests__/bundles.test.js.
//
// The fake is our OWN copy under __tests__/helpers/, per the convention every
// other module here follows (agent / billing / entitlements / payments each
// keep one). It is the payments implementation — the only one with transaction
// abort — plus a `child()` method.
import { describe, it, expect, beforeEach } from 'vitest';

const { makeFakeRtdb } = require('./helpers/fake-rtdb');
const {
  listSuppliers, saveSupplier, archiveSupplier, saveProduct, listProducts,
} = require('../catalog');

const LOC = 'loc1';
const UID = 'u1';
let db;
beforeEach(() => { db = makeFakeRtdb(); });

describe('saveSupplier', () => {
  it('creates a supplier, returning a generated id', async () => {
    const out = await saveSupplier(db, LOC, UID, { name: 'Peninsula' }, 1000);
    expect(out.supplierId).toBeTruthy();
    const stored = await db.ref(`purchasing/${LOC}/suppliers/${out.supplierId}`).once('value');
    expect(stored.val()).toMatchObject({
      name: 'Peninsula', email: '', active: true, createdBy: UID, createdAt: 1000,
    });
  });

  it('writes under purchasing/{locId}, NOT under locations/ (design G14)', async () => {
    const out = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    const wrong = await db.ref(`locations/${LOC}/suppliers/${out.supplierId}`).once('value');
    expect(wrong.exists()).toBe(false);
  });

  it('updates an existing supplier without clobbering createdAt/createdBy', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    await saveSupplier(db, LOC, 'u2', { name: 'A renamed', email: 'a@b.co' }, 2000, supplierId);
    const v = (await db.ref(`purchasing/${LOC}/suppliers/${supplierId}`).once('value')).val();
    expect(v).toMatchObject({
      name: 'A renamed', email: 'a@b.co', createdAt: 1000, createdBy: UID, updatedAt: 2000,
    });
  });

  it('rejects an update to a supplier that does not exist', async () => {
    await expect(saveSupplier(db, LOC, UID, { name: 'A' }, 1000, 'nope'))
      .rejects.toThrow(/not found/i);
  });

  it('rejects invalid input at the schema boundary', async () => {
    await expect(saveSupplier(db, LOC, UID, { name: '' }, 1000)).rejects.toThrow();
    await expect(saveSupplier(db, LOC, UID, { name: 'A', email: 'bad' }, 1000)).rejects.toThrow();
  });

  it('enforces the per-location supplier cap on CREATE only', async () => {
    const { MAX_SUPPLIERS } = require('../validate');
    const seed = {};
    for (let i = 0; i < MAX_SUPPLIERS; i++) seed[`s${i}`] = { name: `S${i}`, active: true };
    await db.ref(`purchasing/${LOC}/suppliers`).set(seed);

    await expect(saveSupplier(db, LOC, UID, { name: 'one too many' }, 1000))
      .rejects.toThrow(/limit/i);
    // an UPDATE at the cap must still succeed
    await expect(saveSupplier(db, LOC, UID, { name: 'S0 renamed' }, 1000, 's0'))
      .resolves.toMatchObject({ supplierId: 's0' });
  });

  it('rejects a key-unsafe supplierId rather than interpolating it into a path', async () => {
    await expect(saveSupplier(db, LOC, UID, { name: 'A' }, 1000, '../../evil'))
      .rejects.toThrow(/key-safe/i);
  });

  // RTDB forbids . $ # [ ] / and control chars in keys. A caller-supplied id is
  // attacker-controlled, so every one of these must be refused BEFORE it reaches
  // a path, not merely happen to fail at write time.
  it('rejects every RTDB-illegal character in a caller-supplied id', async () => {
    for (const bad of ['a.b', 'a$b', 'a#b', 'a[b', 'a]b', 'a/b', '', 'a b']) {
      await expect(saveSupplier(db, LOC, UID, { name: 'A' }, 1000, bad))
        .rejects.toThrow(/key-safe/i);
    }
  });
});

describe('listSuppliers', () => {
  it('returns [] for a location with no book', async () => {
    expect(await listSuppliers(db, LOC)).toEqual([]);
  });

  it('returns suppliers sorted by name with their ids', async () => {
    await saveSupplier(db, LOC, UID, { name: 'Zulu' }, 1000);
    await saveSupplier(db, LOC, UID, { name: 'Alpha' }, 1000);
    expect((await listSuppliers(db, LOC)).map((s) => s.name)).toEqual(['Alpha', 'Zulu']);
    expect((await listSuppliers(db, LOC))[0].supplierId).toBeTruthy();
  });

  it('excludes archived suppliers by default and includes them on request', async () => {
    const a = await saveSupplier(db, LOC, UID, { name: 'Gone' }, 1000);
    await saveSupplier(db, LOC, UID, { name: 'Here' }, 1000);
    await archiveSupplier(db, LOC, a.supplierId, 2000);
    expect((await listSuppliers(db, LOC)).map((s) => s.name)).toEqual(['Here']);
    expect((await listSuppliers(db, LOC, { includeArchived: true })).map((s) => s.name))
      .toEqual(['Gone', 'Here']);
  });

  it('flags a supplier with no email as needsEmail — the D1 export-only state', async () => {
    await saveSupplier(db, LOC, UID, { name: 'No mail' }, 1000);
    await saveSupplier(db, LOC, UID, { name: 'Has mail', email: 'a@b.co' }, 1000);
    const byName = Object.fromEntries((await listSuppliers(db, LOC)).map((s) => [s.name, s.needsEmail]));
    expect(byName).toEqual({ 'Has mail': false, 'No mail': true });
  });

  // needsEmail is DERIVED, never stored (operator decision 2026-08-04). Filling
  // the email in must clear the flag with no separate status write.
  it('clears needsEmail as soon as an email is added, with no stored status', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    expect((await listSuppliers(db, LOC))[0].needsEmail).toBe(true);

    await saveSupplier(db, LOC, UID, { name: 'A', email: 'a@b.co' }, 2000, supplierId);
    expect((await listSuppliers(db, LOC))[0].needsEmail).toBe(false);

    const stored = (await db.ref(`purchasing/${LOC}/suppliers/${supplierId}`).once('value')).val();
    expect(stored).not.toHaveProperty('needsEmail');
    expect(stored).not.toHaveProperty('status');
  });
});

describe('archiveSupplier', () => {
  it('soft-deletes by setting active:false — never removes the record', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    await archiveSupplier(db, LOC, supplierId, 2000);
    const v = (await db.ref(`purchasing/${LOC}/suppliers/${supplierId}`).once('value')).val();
    expect(v).toMatchObject({ name: 'A', active: false, updatedAt: 2000 });
  });

  it('rejects archiving a supplier that does not exist', async () => {
    await expect(archiveSupplier(db, LOC, 'nope', 2000)).rejects.toThrow(/not found/i);
  });
});

describe('products', () => {
  it('stores a product under catalog/{supplierId}/{productId}', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    const out = await saveProduct(db, LOC, supplierId, { description: 'water', unit: 'ea' }, 1000);
    const v = (await db.ref(`purchasing/${LOC}/catalog/${supplierId}/${out.productId}`).once('value')).val();
    expect(v).toMatchObject({ description: 'water', unit: 'ea', active: true, lastPrice: null });
  });

  it('stamps lastPriceAt when a price is supplied', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    const out = await saveProduct(db, LOC, supplierId, { description: 'w', unit: 'ea', lastPrice: 6.5 }, 4242);
    const v = (await db.ref(`purchasing/${LOC}/catalog/${supplierId}/${out.productId}`).once('value')).val();
    expect(v).toMatchObject({ lastPrice: 6.5, lastPriceAt: 4242 });
  });

  it('refuses to add a product to a supplier that does not exist', async () => {
    await expect(saveProduct(db, LOC, 'nope', { description: 'w', unit: 'ea' }, 1000))
      .rejects.toThrow(/not found/i);
  });

  it('enforces the per-supplier product cap', async () => {
    const { MAX_PRODUCTS } = require('../validate');
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    const seed = {};
    for (let i = 0; i < MAX_PRODUCTS; i++) seed[`p${i}`] = { description: `P${i}`, unit: 'ea', active: true };
    await db.ref(`purchasing/${LOC}/catalog/${supplierId}`).set(seed);
    await expect(saveProduct(db, LOC, supplierId, { description: 'over', unit: 'ea' }, 1000))
      .rejects.toThrow(/limit/i);
  });

  it('lists a supplier\'s active products sorted by description', async () => {
    const { supplierId } = await saveSupplier(db, LOC, UID, { name: 'A' }, 1000);
    await saveProduct(db, LOC, supplierId, { description: 'zebra', unit: 'ea' }, 1000);
    await saveProduct(db, LOC, supplierId, { description: 'apple', unit: 'ea' }, 1000);
    expect((await listProducts(db, LOC, supplierId)).map((p) => p.description))
      .toEqual(['apple', 'zebra']);
  });

  // Products live UNDER a supplier id in the path, so an unsafe supplierId is a
  // path-traversal vector on the read side too, not only on write.
  it('rejects a key-unsafe supplierId when listing', async () => {
    await expect(listProducts(db, LOC, '../../evil')).rejects.toThrow(/key-safe/i);
  });
});
