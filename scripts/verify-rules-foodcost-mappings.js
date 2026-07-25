#!/usr/bin/env node
'use strict';

/**
 * Post-deploy verification probe for the D3 `foodCostMappings` rules node
 * (docs/plans/2026-07-24-ross-foodcost-d3-ui-design.md §4c).
 *
 * WHY THIS EXISTS: same gap as verify-rules-pr1a.js — the RTDB emulator needs
 * Java (unavailable) and @firebase/rules-unit-testing is not a dependency, so
 * the rules are proven empirically over the REST API post-deploy.
 *
 * THE CHECK THAT MATTERS MOST HERE IS THE POSITIVE ONE. This node is ADDITIVE:
 * pre-deploy it has no rule and RTDB default-denies, so (unlike PR-1a) the
 * deny-probes cannot write junk into prod under the old rules. The real risk is
 * the opposite one — an over-tight `.validate` fails CLOSED, looks exactly like
 * correct security, and silently breaks the mapping-memory feature (the
 * 2026-07-21 `locations .validate` lesson: broken for ~7 weeks, masked by an
 * admin bypass). If the POSITIVE check fails, the rules are either not deployed
 * yet or the `.validate` is over-tight — both mean DO NOT ship the UI on top.
 *
 * RTDB-rules limitation (documented here because JSON has no comments): the
 * `mapping/$field` rule bounds values as number in [-1, 60) but cannot enforce
 * integer-ness or bound key cardinality/names — the client-side
 * `validateStoredMapping` (mapping-memory.js) is the load-bearing control for
 * those (18-field whitelist, Number.isInteger). The rules are the outer fence.
 *
 * USAGE (post-deploy only):
 *   USER_ID_TOKEN=<non-admin id token> node scripts/verify-rules-foodcost-mappings.js
 * Optionally USER_UID=<that user's uid> — otherwise it is decoded from the
 * token's JWT payload (no verification needed; the server enforces it).
 *
 * Exits 0 only if every check matches its expectation and cleanup succeeded.
 */

const DB = process.env.RTDB_URL
  || 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com';

const USER = process.env.USER_ID_TOKEN || '';

const PROBE_FP = 'f00d'.repeat(16); // 64 hex chars, obviously a probe

// The 18 detectAndMapHeaders fields (mapping-memory.js KNOWN_MAPPING_FIELDS).
const FIELDS = [
  'itemCode', 'description', 'category', 'unit', 'costCenter',
  'openingQty', 'openingValue', 'purchaseQty', 'purchases',
  'closingQty', 'closingValue', 'unitCost', 'supplierName',
  'stockLevel', 'totalCost', 'openingStockValue', 'closingStockValue',
  'purchaseValue',
];

function representativeRecord() {
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, -1]));
  mapping.itemCode = 0;
  mapping.description = 1;
  mapping.openingQty = 2;
  mapping.closingQty = 3;
  return {
    headersNorm: ['item code', 'description', 'opening qty', 'closing qty'],
    mapping,
    label: 'Probe POS export',
    savedAt: Date.now(),
    useCount: 0,
  };
}

function decodeUidFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.user_id || payload.sub || '';
  } catch {
    return '';
  }
}

async function attempt(method, path, token, body) {
  const url = `${DB}/${path}.json${token ? `?auth=${encodeURIComponent(token)}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
}

function verdict(status, expect) {
  const allowed = status >= 200 && status < 300;
  const denied = status === 401 || status === 403;
  if (expect === 'allow') return allowed ? 'PASS' : 'FAIL';
  return denied ? 'PASS' : 'FAIL';
}

async function cleanup(path, token) {
  try {
    const status = await attempt('DELETE', path, token);
    return status >= 200 && status < 300;
  } catch {
    return false;
  }
}

(async () => {
  if (!USER) {
    console.error('Set USER_ID_TOKEN (a NON-admin user). Nothing to probe.');
    process.exit(2);
  }
  const uid = process.env.USER_UID || decodeUidFromToken(USER);
  if (!uid) {
    console.error('Could not determine uid — set USER_UID explicitly.');
    process.exit(2);
  }
  const own = `foodCostMappings/${uid}/${PROBE_FP}`;
  const other = `foodCostMappings/__someone_else__/${PROBE_FP}`;

  console.log(`Probing ${DB}`);
  console.log(`  uid: ${uid}\n`);

  // Token-validity preflight (stale token would make every deny-check a false
  // PASS): scanningData .read is auth != null and unchanged by this PR.
  const tokenCheck = await attempt('GET', 'scanningData', USER);
  if (tokenCheck === 401 || tokenCheck === 403) {
    console.error('PREFLIGHT FAILED — token cannot read an auth-gated node (expired?). Aborting.');
    process.exit(3);
  }

  const rec = representativeRecord();
  const checks = [
    { name: 'POSITIVE: own-uid representative mapping record WRITES (the fails-closed check)',
      expect: 'allow', run: () => attempt('PUT', own, USER, rec) },
    { name: 'POSITIVE: own-uid record reads back',
      expect: 'allow', run: () => attempt('GET', own, USER) },
    { name: "another uid's path write DENIED",
      expect: 'deny', run: () => attempt('PUT', other, USER, rec), cleanupPath: other },
    { name: 'unauthenticated read DENIED',
      expect: 'deny', run: () => attempt('GET', own, '') },
    { name: 'oversized label (101 chars) DENIED by .validate',
      expect: 'deny', run: () => attempt('PUT', own, USER, { ...rec, label: 'x'.repeat(101) }), cleanupPath: own, restore: true },
    { name: 'mapping field value 60 (out of range) DENIED by .validate',
      expect: 'deny', run: () => attempt('PUT', own, USER, { ...rec, mapping: { ...rec.mapping, unit: 60 } }), cleanupPath: own, restore: true },
    { name: 'unknown extra child key DENIED by $other .validate',
      expect: 'deny', run: () => attempt('PUT', own, USER, { ...rec, sneaky: 1 }), cleanupPath: own, restore: true },
    { name: 'headersNorm entry of 121 chars DENIED by .validate',
      expect: 'deny', run: () => attempt('PUT', own, USER, { ...rec, headersNorm: ['y'.repeat(121)], mapping: { itemCode: 0 } }), cleanupPath: own, restore: true },
  ];

  let failed = 0;
  for (const c of checks) {
    let status;
    try {
      status = await c.run();
    } catch (err) {
      console.log(`  ERROR ${c.name} — ${err.code || err.name || 'request failed'}`);
      failed++;
      continue;
    }
    const v = verdict(status, c.expect);
    if (v === 'FAIL') failed++;
    let note = '';
    if (c.expect === 'deny' && status >= 200 && status < 300 && c.cleanupPath) {
      // Self-cleaning (#172 pattern): an unexpected allow wrote something.
      const removed = await cleanup(c.cleanupPath, USER);
      note = removed ? '  (probe write REMOVED)' : '  (⚠ probe write left behind — delete manually)';
      if (c.restore) {
        // The deny-probe targeted the SAME path as the positive record and
        // unexpectedly overwrote it; re-PUT the good record so later checks
        // still exercise real state.
        await attempt('PUT', own, USER, rec);
      }
    }
    console.log(`  ${v}  ${c.name}  [expected ${c.expect}, HTTP ${status}]${note}`);
  }

  // Final cleanup of the positive record — verified, not best-effort.
  const cleaned = await cleanup(own, USER);
  console.log(`\n  cleanup of ${own}: ${cleaned ? 'OK (removed)' : 'FAILED — delete manually'}`);
  if (!cleaned) failed++;

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) {
    console.log('If the POSITIVE check failed: the rules are not deployed yet OR the .validate is over-tight — do not ship the UI on top until it passes.');
  }
  process.exit(failed === 0 ? 0 : 1);
})();
