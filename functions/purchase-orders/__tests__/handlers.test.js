// Convention: import test globals from vitest (ESM), require the module under
// test (CJS) — matching functions/payments/__tests__/bundles.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mod = require('../index');
const access = require('../access');
const { makeFakeRtdb } = require('./helpers/fake-rtdb');

function res() {
  const r = { statusCode: 200, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const req = (body, method = 'POST') => ({ method, body, headers: {} });

let db;
beforeEach(() => {
  vi.restoreAllMocks();
  db = makeFakeRtdb();
  mod.__setDbForTests(db);
  mod.__setVerifyAuthForTests(async () => ({ uid: 'u1' }));
});

describe('handleCatalogRequest — envelope', () => {
  it('rejects a non-POST method with 405', async () => {
    const r = res();
    await mod.handleCatalogRequest(req({}, 'GET'), r);
    expect(r.statusCode).toBe(405);
  });

  it('400s a missing or key-unsafe locationId BEFORE auth runs', async () => {
    const verify = vi.fn();
    mod.__setVerifyAuthForTests(verify);
    const r = res();
    await mod.handleCatalogRequest(req({ action: 'listSuppliers', locationId: '../evil' }), r);
    expect(r.statusCode).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });

  it('400s an unknown action', async () => {
    const r = res();
    await mod.handleCatalogRequest(req({ action: 'dropTables', locationId: 'loc1' }), r);
    expect(r.statusCode).toBe(400);
  });

  it('reads req.body FLAT — a {data:{}} envelope is a 400, not a silent pass', async () => {
    const r = res();
    await mod.handleCatalogRequest(req({ data: { action: 'listSuppliers', locationId: 'loc1' } }), r);
    expect(r.statusCode).toBe(400);
  });

  it('401s on an auth error and never leaks the underlying message', async () => {
    mod.__setVerifyAuthForTests(async () => { throw new Error('Missing authorization header'); });
    const r = res();
    await mod.handleCatalogRequest(req({ action: 'listSuppliers', locationId: 'loc1' }), r);
    expect(r.statusCode).toBe(401);
    expect(JSON.stringify(r.body)).not.toMatch(/authorization header/i);
  });

  it('returns a bare {hasData:false} when access is denied — anti-enumeration', async () => {
    vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(false);
    const r = res();
    await mod.handleCatalogRequest(req({ action: 'listSuppliers', locationId: 'loc1' }), r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ hasData: false });
  });

  it('400s invalid supplier input without echoing tenant data back', async () => {
    vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(true);
    const r = res();
    await mod.handleCatalogRequest(
      req({ action: 'saveSupplier', locationId: 'loc1', supplier: { name: '' } }), r,
    );
    expect(r.statusCode).toBe(400);
    expect(JSON.stringify(r.body)).not.toMatch(/loc1/);
  });
});

// THE GATE GUARD. Every action must pass through assertLocationAccess. This is
// written to fail when a NEW action is added without a gate, which is the way
// an action-routed CF grows a hole: the router is correct on day one and some
// later action forgets the check. Enumerating the exported action list means the
// test covers actions that do not exist yet.
describe('every catalog action is gated', () => {
  it('exports the action list the router actually uses', () => {
    expect(mod.CATALOG_ACTIONS.size).toBeGreaterThan(0);
  });

  it('denies EVERY action when access is denied, with no distinguishing response', async () => {
    const spy = vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(false);
    for (const action of mod.CATALOG_ACTIONS) {
      const r = res();
      await mod.handleCatalogRequest(req({
        action,
        locationId: 'loc1',
        supplier: { name: 'A' },
        product: { description: 'x', unit: 'ea' },
        supplierId: 's1',
      }), r);
      expect(r.statusCode, `action ${action} must not bypass the gate`).toBe(200);
      expect(r.body, `action ${action} must return the bare denial`).toEqual({ hasData: false });
    }
    expect(spy).toHaveBeenCalledTimes(mod.CATALOG_ACTIONS.size);
  });

  it('calls the gate for every action even when it allows', async () => {
    const spy = vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(true);
    for (const action of mod.CATALOG_ACTIONS) {
      await mod.handleCatalogRequest(req({
        action,
        locationId: 'loc1',
        supplier: { name: 'A' },
        product: { description: 'x', unit: 'ea' },
        supplierId: 's1',
      }), res());
    }
    expect(spy).toHaveBeenCalledTimes(mod.CATALOG_ACTIONS.size);
  });

  // Catches a set/switch MISMATCH in both directions: an action listed but never
  // implemented falls through to the default arm, and an action implemented but
  // not listed is unreachable (the router rejects it before the switch).
  it('routes every listed action to a real implementation', async () => {
    vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(true);
    for (const action of mod.CATALOG_ACTIONS) {
      const r = res();
      await mod.handleCatalogRequest(req({
        action,
        locationId: 'loc1',
        supplier: { name: 'A' },
        product: { description: 'x', unit: 'ea' },
        supplierId: 's1',
      }), r);
      expect(JSON.stringify(r.body), `action ${action} is listed but not implemented`)
        .not.toMatch(/Unknown action/);
    }
  });

  it('gates the seed endpoint on both of its actions too', async () => {
    const spy = vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(false);
    for (const action of ['preview', 'commit']) {
      const r = res();
      await mod.handleSeedRequest(req({ action, locationId: 'loc1', supplierNames: [] }), r);
      expect(r.body).toEqual({ hasData: false });
    }
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('handleCatalogRequest — actions', () => {
  beforeEach(() => vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(true));

  it('listSuppliers returns hasData:true with an empty list', async () => {
    const r = res();
    await mod.handleCatalogRequest(req({ action: 'listSuppliers', locationId: 'loc1' }), r);
    expect(r.body).toEqual({ hasData: true, suppliers: [] });
  });

  it('saveSupplier then listSuppliers round-trips', async () => {
    let r = res();
    await mod.handleCatalogRequest(
      req({ action: 'saveSupplier', locationId: 'loc1', supplier: { name: 'Peninsula' } }), r,
    );
    expect(r.body.supplierId).toBeTruthy();

    r = res();
    await mod.handleCatalogRequest(req({ action: 'listSuppliers', locationId: 'loc1' }), r);
    expect(r.body.suppliers).toHaveLength(1);
    expect(r.body.suppliers[0]).toMatchObject({ name: 'Peninsula', needsEmail: true });
  });
});

describe('handleSeedRequest', () => {
  beforeEach(() => vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(true));

  const seedStock = (items) => db.ref('locations/loc1/stockUsage/r1').set({
    timestamp: 1000, stockItems: items,
  });

  it('preview returns hasData:false when the location has no stock counts', async () => {
    const r = res();
    await mod.handleSeedRequest(req({ action: 'preview', locationId: 'loc1' }), r);
    expect(r.body).toEqual({ hasData: false });
  });

  it('preview derives suppliers from the latest count and does NOT write', async () => {
    await seedStock([{ description: 'water', unit: 'ea', supplierName: 'Peninsula', unitCost: 6.5 }]);
    const r = res();
    await mod.handleSeedRequest(req({ action: 'preview', locationId: 'loc1' }), r);
    expect(r.body.suppliers).toHaveLength(1);
    expect(r.body.suppliers[0]).toMatchObject({ name: 'Peninsula', itemCount: 1 });
    const after = await db.ref('purchasing/loc1/suppliers').once('value');
    expect(after.exists()).toBe(false);
  });

  it('commit writes ONLY the supplier names the caller ticked', async () => {
    await seedStock([
      { description: 'water', unit: 'ea', supplierName: 'Peninsula', unitCost: 6.5 },
      { description: 'beans', unit: 'kg', supplierName: 'Bean There' },
    ]);
    const r = res();
    await mod.handleSeedRequest(
      req({ action: 'commit', locationId: 'loc1', supplierNames: ['Peninsula'] }), r,
    );
    expect(r.body.suppliersCreated).toBe(1);
    expect(r.body.productsCreated).toBe(1);
    const stored = (await db.ref('purchasing/loc1/suppliers').once('value')).val();
    expect(Object.values(stored).map((s) => s.name)).toEqual(['Peninsula']);
  });

  it('commit is idempotent on supplier NAME — a second run creates no duplicates', async () => {
    await seedStock([{ description: 'water', unit: 'ea', supplierName: 'Peninsula' }]);
    const body = { action: 'commit', locationId: 'loc1', supplierNames: ['Peninsula'] };
    await mod.handleSeedRequest(req(body), res());
    const r = res();
    await mod.handleSeedRequest(req(body), r);
    expect(r.body.suppliersCreated).toBe(0);
    const stored = (await db.ref('purchasing/loc1/suppliers').once('value')).val();
    expect(Object.keys(stored)).toHaveLength(1);
  });

  // The plan claimed commit is idempotent, but it was idempotent on SUPPLIERS
  // only — every product was rewritten on each run, so clicking Import twice
  // doubled the catalogue.
  it('commit is idempotent on PRODUCTS too — a second run adds none', async () => {
    await seedStock([
      { itemCode: '9001', description: 'water', unit: 'ea', supplierName: 'Peninsula' },
      { description: 'cola', unit: 'ea', supplierName: 'Peninsula' },
    ]);
    const body = { action: 'commit', locationId: 'loc1', supplierNames: ['Peninsula'] };
    const first = res();
    await mod.handleSeedRequest(req(body), first);
    expect(first.body.productsCreated).toBe(2);

    const second = res();
    await mod.handleSeedRequest(req(body), second);
    expect(second.body.productsCreated).toBe(0);

    const supplierId = Object.keys(
      (await db.ref('purchasing/loc1/suppliers').once('value')).val(),
    )[0];
    const products = (await db.ref(`purchasing/loc1/catalog/${supplierId}`).once('value')).val();
    expect(Object.keys(products)).toHaveLength(2);
  });

  it('commit ignores a supplier name that was not in the derived preview', async () => {
    await seedStock([{ description: 'water', unit: 'ea', supplierName: 'Peninsula' }]);
    const r = res();
    await mod.handleSeedRequest(
      req({ action: 'commit', locationId: 'loc1', supplierNames: ['Injected Co'] }), r,
    );
    expect(r.body.suppliersCreated).toBe(0);
  });

  it('400s a supplierNames list that is not an array of strings', async () => {
    const r = res();
    await mod.handleSeedRequest(
      req({ action: 'commit', locationId: 'loc1', supplierNames: 'Peninsula' }), r,
    );
    expect(r.statusCode).toBe(400);
  });
});

// The supplier column is free text, so one supplier arrives under several
// spellings. The owner reviews, renames and MERGES (operator decision
// 2026-08-04) — which a flat supplierNames[] cannot express, so commit also
// accepts selections[{name, sourceNames}].
describe('handleSeedRequest — rename and merge', () => {
  beforeEach(() => vi.spyOn(access, 'assertLocationAccess').mockResolvedValue(true));

  const seedStock = (items) => db.ref('locations/loc1/stockUsage/r1').set({
    timestamp: 1000, stockItems: items,
  });

  it('merges several derived spellings into ONE supplier under a chosen name', async () => {
    await seedStock([
      { description: 'beef', unit: 'kg', supplierName: 'ABC Meats' },
      { description: 'lamb', unit: 'kg', supplierName: 'abc meats' },
    ]);
    const r = res();
    await mod.handleSeedRequest(req({
      action: 'commit',
      locationId: 'loc1',
      selections: [{ name: 'ABC Meats (Pty) Ltd', sourceNames: ['ABC Meats', 'abc meats'] }],
    }), r);

    expect(r.body.suppliersCreated).toBe(1);
    expect(r.body.productsCreated).toBe(2);
    const stored = (await db.ref('purchasing/loc1/suppliers').once('value')).val();
    expect(Object.values(stored).map((s) => s.name)).toEqual(['ABC Meats (Pty) Ltd']);
  });

  it('renames a single supplier on import', async () => {
    await seedStock([{ description: 'water', unit: 'ea', supplierName: 'penin bev' }]);
    const r = res();
    await mod.handleSeedRequest(req({
      action: 'commit',
      locationId: 'loc1',
      selections: [{ name: 'Peninsula Beverages', sourceNames: ['penin bev'] }],
    }), r);
    const stored = (await db.ref('purchasing/loc1/suppliers').once('value')).val();
    expect(Object.values(stored).map((s) => s.name)).toEqual(['Peninsula Beverages']);
  });

  it('does not duplicate the same product across merged spellings', async () => {
    await seedStock([
      { itemCode: '9001', description: 'beef mince', unit: 'kg', supplierName: 'ABC Meats' },
      { itemCode: '9001', description: 'beef mince', unit: 'kg', supplierName: 'abc meats' },
    ]);
    const r = res();
    await mod.handleSeedRequest(req({
      action: 'commit',
      locationId: 'loc1',
      selections: [{ name: 'ABC Meats', sourceNames: ['ABC Meats', 'abc meats'] }],
    }), r);
    expect(r.body.productsCreated).toBe(1);
  });

  it('ignores a sourceName that was not in the derived preview', async () => {
    await seedStock([{ description: 'water', unit: 'ea', supplierName: 'Peninsula' }]);
    const r = res();
    await mod.handleSeedRequest(req({
      action: 'commit',
      locationId: 'loc1',
      selections: [{ name: 'Anything', sourceNames: ['Injected Co'] }],
    }), r);
    expect(r.body.suppliersCreated).toBe(0);
  });

  it('400s a malformed selections payload', async () => {
    for (const selections of ['x', [{ name: 'A' }], [{ sourceNames: ['A'] }], [{ name: '', sourceNames: ['A'] }]]) {
      const r = res();
      await mod.handleSeedRequest(req({ action: 'commit', locationId: 'loc1', selections }), r);
      expect(r.statusCode).toBe(400);
    }
  });
});
