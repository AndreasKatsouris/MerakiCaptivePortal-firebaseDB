'use strict';

/**
 * D1 CF shells for the ROSS supplier book.
 * Design: docs/plans/2026-07-28-ross-purchase-orders-design.md §4.4.
 *
 * Envelope copied from functions/food-cost-overview.js:216-269:
 *  - validation BEFORE auth (malformed input never costs a token verify)
 *  - normalised 401/403 strings, real reason logged server-side
 *  - maxInstances bounds an unmetered endpoint
 *  - access / entitlement / no-data all return a bare {hasData:false}, so they
 *    are indistinguishable (anti-enumeration)
 *
 * BODY SHAPE: this reads `req.body` FLAT, matching food-cost-overview. It does
 * NOT use the `{data:{...}}` envelope that rossGetStaff and people-service.js
 * use. The two shapes coexist in this codebase and mixing them yields a 400 that
 * looks like a validation bug (2026-06-04 LESSON).
 */

const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { corsOptions } = require('../cors-allowlist');
const cors = require('cors')(corsOptions);

const access = require('./access');
const catalog = require('./catalog');
const { deriveCatalogFromStock } = require('./seed');
const { SupplierInput, ProductInput } = require('./validate');

const LOCATION_ID_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_RECORDS = 30;          // same bounded read as foodCostOverview
const MAX_SEED_NAMES = 500;      // matches MAX_SUPPLIERS
const DENIED = { hasData: false };

/**
 * The canonical action list. EXPORTED so the gate guard can enumerate it: a test
 * that iterates this set covers actions which do not exist yet, which is how an
 * action-routed CF avoids growing an ungated verb later. Adding an action here
 * without routing it through assertLocationAccess fails that test.
 */
const CATALOG_ACTIONS = new Set([
  'listSuppliers', 'saveSupplier', 'archiveSupplier', 'listProducts', 'saveProduct',
]);

// --- seams (both match food-cost-overview) ------------------------------------
let _db = null;
function getDb() {
  if (!_db) _db = admin.database();
  return _db;
}
function __setDbForTests(fake) { _db = fake; }

let _verifyAuth = null;
function getVerifyAuth() {
  if (!_verifyAuth) _verifyAuth = require('../ross').verifyAuthToken;
  return _verifyAuth;
}
function __setVerifyAuthForTests(fake) { _verifyAuth = fake; }

/** Shared 401/403 handling. Returns the decoded token, or null once it has responded. */
async function authenticate(req, res, tag) {
  try {
    return await getVerifyAuth()(req);
  } catch (err) {
    const isAuthErr = /authorization|token/i.test(err.message || '');
    console.warn(`[${tag}] auth rejected:`, err && err.message);
    res.status(isAuthErr ? 401 : 403).json({
      error: isAuthErr ? 'Authentication failed' : 'Access denied',
    });
    return null;
  }
}

function readLocationId(body) {
  const locationId = body && body.locationId;
  return typeof locationId === 'string' && LOCATION_ID_RE.test(locationId) ? locationId : null;
}

async function handleCatalogRequest(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body || {};
  const locationId = readLocationId(body);
  if (!locationId) {
    res.status(400).json({ error: 'locationId must be a key-safe string ([A-Za-z0-9_-])' });
    return;
  }
  if (!CATALOG_ACTIONS.has(body.action)) {
    res.status(400).json({ error: 'Unknown action' });
    return;
  }

  const decoded = await authenticate(req, res, 'poCatalog');
  if (!decoded) return;

  const db = getDb();
  // EVERY action passes here. Guarded by the enumerated-action test.
  if (!(await access.assertLocationAccess(db, locationId, decoded.uid))) {
    res.json(DENIED);
    return;
  }

  const now = Date.now();
  try {
    switch (body.action) {
      case 'listSuppliers':
        res.json({ hasData: true, suppliers: await catalog.listSuppliers(db, locationId) });
        return;
      case 'saveSupplier': {
        SupplierInput.parse(body.supplier); // surface a 400 before touching the db
        const out = await catalog.saveSupplier(
          db, locationId, decoded.uid, body.supplier, now, body.supplierId,
        );
        res.json({ hasData: true, ...out });
        return;
      }
      case 'archiveSupplier':
        res.json({ hasData: true, ...await catalog.archiveSupplier(db, locationId, body.supplierId, now) });
        return;
      case 'listProducts':
        res.json({
          hasData: true,
          products: await catalog.listProducts(db, locationId, body.supplierId),
        });
        return;
      case 'saveProduct': {
        ProductInput.parse(body.product);
        const out = await catalog.saveProduct(
          db, locationId, body.supplierId, body.product, now, body.productId,
        );
        res.json({ hasData: true, ...out });
        return;
      }
      default:
        res.status(400).json({ error: 'Unknown action' });
        return;
    }
  } catch (err) {
    // Client errors (validation, not-found, caps) are 400 with a safe message;
    // anything else is a 500 with nothing tenant-shaped in it.
    const msg = String((err && err.message) || '');
    const isClient = /required|not found|limit reached|key-safe|invalid|expected|must be/i.test(msg);
    if (isClient) {
      console.warn('[poCatalog] rejected:', msg);
      res.status(400).json({ error: 'The supplier or product details were not accepted' });
      return;
    }
    console.error('[poCatalog] failed:', msg);
    res.status(500).json({ error: 'Failed to update the supplier book' });
  }
}

/**
 * Normalises the two accepted commit payloads into one shape.
 *
 * `selections: [{name, sourceNames[]}]` is the real contract — the owner reviews
 * the derived names, RENAMES them and MERGES several spellings of one company
 * into a single supplier (operator decision 2026-08-04). The supplier column is
 * free text, so "ABC Meats" / "abc  meats" / "A.B.C. Meats." routinely all
 * appear in one count.
 *
 * `supplierNames: [string]` is the plain tick-only form, kept because the simple
 * case should stay simple; it maps to one selection per name.
 *
 * @returns {{selections:{name:string,sourceNames:string[]}[]}|{error:string}}
 */
function normaliseSelections(body) {
  if (body.selections !== undefined) {
    const sel = body.selections;
    if (!Array.isArray(sel) || sel.length > MAX_SEED_NAMES) {
      return { error: 'selections must be an array of at most 500 entries' };
    }
    for (const s of sel) {
      const okName = s && typeof s === 'object'
        && typeof s.name === 'string' && s.name.trim().length > 0;
      const okSources = s && Array.isArray(s.sourceNames)
        && s.sourceNames.length > 0 && s.sourceNames.length <= MAX_SEED_NAMES
        && s.sourceNames.every((n) => typeof n === 'string');
      if (!okName || !okSources) {
        return { error: 'each selection needs a non-empty name and a sourceNames array' };
      }
    }
    return { selections: sel };
  }

  if (body.supplierNames !== undefined) {
    const names = body.supplierNames;
    if (!Array.isArray(names) || names.length > MAX_SEED_NAMES
        || !names.every((n) => typeof n === 'string')) {
      return { error: 'supplierNames must be an array of at most 500 strings' };
    }
    return { selections: names.map((n) => ({ name: n, sourceNames: [n] })) };
  }

  return { error: 'commit requires either selections or supplierNames' };
}

/** Dedupe key for a catalogue product: its code if it has a real one, else its name. */
function productKey(p) {
  return String(p.itemCode || p.description || '').trim().toLowerCase();
}

async function handleSeedRequest(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = req.body || {};
  const locationId = readLocationId(body);
  if (!locationId) {
    res.status(400).json({ error: 'locationId must be a key-safe string ([A-Za-z0-9_-])' });
    return;
  }
  if (body.action !== 'preview' && body.action !== 'commit') {
    res.status(400).json({ error: 'action must be "preview" or "commit"' });
    return;
  }
  let selections = null;
  if (body.action === 'commit') {
    const parsed = normaliseSelections(body);
    if (parsed.error) { res.status(400).json({ error: parsed.error }); return; }
    selections = parsed.selections;
  }

  const decoded = await authenticate(req, res, 'poSeedFromStock');
  if (!decoded) return;

  const db = getDb();
  if (!(await access.assertLocationAccess(db, locationId, decoded.uid))) {
    res.json(DENIED);
    return;
  }

  try {
    const snap = await db.ref(`locations/${locationId}/stockUsage`)
      .orderByKey().limitToLast(MAX_RECORDS).once('value');
    const records = snap.exists() ? Object.values(snap.val()) : [];
    const derived = deriveCatalogFromStock(records);
    if (!derived.hasData) { res.json(DENIED); return; }

    if (body.action === 'preview') { res.json(derived); return; }

    // COMMIT. Only names present in the DERIVED set are honoured — a name the
    // client invents is ignored rather than trusted (the tool-arg-is-attacker-
    // controlled rule, 2026-06-05 LESSON). The owner may rename freely, but the
    // SOURCE of every imported row must be something the server itself derived.
    const derivedNames = new Set(derived.suppliers.map((s) => s.name));

    // Idempotent on NAME: re-running the import must not duplicate the book.
    const existing = await catalog.listSuppliers(db, locationId, { includeArchived: true });
    const existingByName = new Map(existing.map((s) => [s.name, s.supplierId]));

    const now = Date.now();
    let suppliersCreated = 0;
    let productsCreated = 0;

    for (const sel of selections) {
      const sources = sel.sourceNames.filter((n) => derivedNames.has(n));
      if (!sources.length) continue; // nothing the server actually derived

      let supplierId = existingByName.get(sel.name);
      if (!supplierId) {
        ({ supplierId } = await catalog.saveSupplier(
          db, locationId, decoded.uid, { name: sel.name }, now,
        ));
        suppliersCreated++;
        existingByName.set(sel.name, supplierId);
      }

      // Idempotent on PRODUCTS too, and deduped ACROSS the merged spellings.
      // Seeded from what is already stored, so a second import adds nothing —
      // without this, clicking Import twice doubles the whole catalogue.
      const already = await catalog.listProducts(
        db, locationId, supplierId, { includeArchived: true },
      );
      const seen = new Set(already.map(productKey));

      for (const item of derived.items) {
        if (!sources.includes(item.supplierName)) continue;
        const key = productKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        await catalog.saveProduct(db, locationId, supplierId, {
          description: item.description,
          unit: item.unit,
          itemCode: item.itemCode,
          lastPrice: item.lastPrice === null ? undefined : item.lastPrice,
        }, now);
        productsCreated++;
      }
    }

    res.json({ hasData: true, suppliersCreated, productsCreated });
  } catch (err) {
    console.error('[poSeedFromStock] failed:', err && err.message);
    res.status(500).json({ error: 'Failed to import the supplier book' });
  }
}

const poCatalog = onRequest(
  { maxInstances: 5 },
  (req, res) => cors(req, res, () => handleCatalogRequest(req, res)),
);
const poSeedFromStock = onRequest(
  { maxInstances: 3 },
  (req, res) => cors(req, res, () => handleSeedRequest(req, res)),
);

// ALL exports in ONE assignment — the #188 export-clobber trap.
module.exports = {
  poCatalog, poSeedFromStock,
  handleCatalogRequest, handleSeedRequest,
  CATALOG_ACTIONS,
  __setDbForTests, __setVerifyAuthForTests,
};
