#!/usr/bin/env node
'use strict';

/**
 * Post-deploy verification probe for the D1 `purchasing` rules node
 * (docs/plans/2026-07-28-ross-purchase-orders-design.md §5.1).
 *
 * WHY THIS EXISTS: the RTDB emulator needs Java (unavailable here) and
 * @firebase/rules-unit-testing is not a dependency, so the rules are proven
 * empirically over REST post-deploy.
 *
 * THE TOKEN MUST BE NON-ADMIN. The global root admin `.write`
 * (database.rules.json:3) cascades into `purchasing` and cannot be revoked from
 * below, so an admin token returns 200 on every write check and the probe would
 * report a false failure (the D4 lesson, 2026-07-25).
 *
 * WHAT THIS NODE CLAIMS, precisely:
 *  - non-admin WRITES are denied at every depth (all writes are CF-mediated;
 *    Cloud Functions use the Admin SDK and bypass rules entirely);
 *  - READS are allowed only to admins, and to `userLocations` members / the
 *    location owner WHO ALSO HOLD the `purchaseOrders` entitlement — the read
 *    grant CASCADES to children by design.
 *
 * THE PROBE USER MUST HOLD THE ENTITLEMENT. The rule deliberately mirrors
 * access.js's gate: an earlier version omitted the entitlement term, so the rule
 * was strictly broader than the CF and a non-entitled tenant could read the
 * whole supplier book straight over REST, bypassing the paywall the CF enforces.
 * If the POSITIVE checks below fail, verify
 * `subscriptions/{uid}/features/purchaseOrders === true` before concluding the
 * rules are broken.
 *
 * This does NOT claim the node is closed to admins. It is not, and saying so
 * would be the overclaim the 2026-07-25 census refuted.
 *
 * The `.validate` rules are NOT exercisable by a non-admin here, because the
 * write is denied before validation runs. They constrain only a human admin
 * using the client SDK (design G17); the load-bearing schema check is the CF's
 * Zod boundary in functions/purchase-orders/validate.js.
 *
 * USAGE (post-deploy only):
 *   USER_ID_TOKEN=<non-admin id token> OWNED_LOCATION_ID=<a location that user owns or is a member of> \
 *     node scripts/verify-rules-purchasing.js
 *   Optionally FOREIGN_LOCATION_ID=<a location that user must NOT see>
 *
 * Exits 0 only if every check matches its expectation.
 */

const DB = process.env.RTDB_URL
  || 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com';
const USER = process.env.USER_ID_TOKEN || '';
const OWNED = process.env.OWNED_LOCATION_ID || '';
const FOREIGN = process.env.FOREIGN_LOCATION_ID || '';

const PROBE_ID = `probe_${'ab'.repeat(8)}`;

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

(async () => {
  if (!USER || !OWNED) {
    console.error('Set USER_ID_TOKEN (a NON-admin user) and OWNED_LOCATION_ID.');
    process.exit(2);
  }

  // Preflight: a stale token makes every deny-check a false PASS.
  const pre = await attempt('GET', 'scanningData', USER);
  if (pre === 401 || pre === 403) {
    console.error('PREFLIGHT FAILED — token cannot read an auth-gated node (expired?). Aborting.');
    process.exit(3);
  }

  const supplier = {
    name: 'Probe Supplier',
    email: '',
    active: true,
    createdAt: Date.now(),
    createdBy: 'probe',
    updatedAt: Date.now(),
  };

  const checks = [
    // POSITIVE FIRST — these are what an over-tight rule would break silently.
    // A denial-only probe passes trivially against a rules file that denies
    // everything, which is exactly how the locations/ownerId bug hid for ~7
    // weeks (2026-07-21 lesson).
    {
      name: 'POSITIVE: own-location suppliers node READS (the fails-closed check)',
      expect: 'allow',
      run: () => attempt('GET', `purchasing/${OWNED}/suppliers`, USER),
    },
    {
      name: 'POSITIVE: own-location catalog node READS (read cascades to children)',
      expect: 'allow',
      run: () => attempt('GET', `purchasing/${OWNED}/catalog`, USER),
    },
    {
      name: 'POSITIVE: own-location orders node READS',
      expect: 'allow',
      run: () => attempt('GET', `purchasing/${OWNED}/orders`, USER),
    },

    // The write claim: denied at every depth for a non-admin.
    {
      name: 'non-admin write to own-location supplier DENIED (CF-mediated only)',
      expect: 'deny',
      run: () => attempt('PUT', `purchasing/${OWNED}/suppliers/${PROBE_ID}`, USER, supplier),
    },
    {
      name: 'non-admin DEEP-PATH write (supplier field) DENIED',
      expect: 'deny',
      run: () => attempt('PUT', `purchasing/${OWNED}/suppliers/${PROBE_ID}/name`, USER, 'x'),
    },
    {
      name: 'non-admin write to catalog DENIED',
      expect: 'deny',
      run: () => attempt('PUT', `purchasing/${OWNED}/catalog/${PROBE_ID}/p1`, USER, { description: 'x', unit: 'ea' }),
    },
    {
      name: 'non-admin write to counters DENIED',
      expect: 'deny',
      run: () => attempt('PUT', `purchasing/${OWNED}/counters/purchaseOrder`, USER, 99),
    },
    {
      name: 'non-admin DELETE of own-location suppliers DENIED',
      expect: 'deny',
      run: () => attempt('DELETE', `purchasing/${OWNED}/suppliers`, USER),
    },

    // No cross-location read, and no query across the whole node.
    {
      name: 'unauthenticated read DENIED',
      expect: 'deny',
      run: () => attempt('GET', `purchasing/${OWNED}/suppliers`, ''),
    },
    {
      name: 'read of the purchasing ROOT DENIED (no root .read → no cross-location query)',
      expect: 'deny',
      run: () => attempt('GET', 'purchasing', USER),
    },
  ];

  if (FOREIGN) {
    checks.push({
      name: "another location's suppliers read DENIED",
      expect: 'deny',
      run: () => attempt('GET', `purchasing/${FOREIGN}/suppliers`, USER),
    });
  } else {
    console.log('  NOTE: FOREIGN_LOCATION_ID unset — the cross-tenant READ check was SKIPPED.');
  }

  console.log(`Probing ${DB}`);
  console.log(`  owned location: ${OWNED}\n`);

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
    console.log(`  ${v}  ${c.name}  [expected ${c.expect}, HTTP ${status}]`);
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) {
    console.log('If a POSITIVE check failed: the rules are not deployed yet OR the .read is over-tight — do not ship the UI on top until it passes.');
    console.log('If a DENY check returned 200: confirm the token is NON-admin before concluding the rules are open.');
  }
  process.exit(failed === 0 ? 0 : 1);
})();
