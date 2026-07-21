#!/usr/bin/env node
'use strict';

/**
 * Post-deploy verification probe for the PR-1a RTDB rules tightening.
 *
 * WHY THIS EXISTS: the usual gate (@firebase/rules-unit-testing against the
 * emulator) cannot run in this environment — the RTDB emulator needs Java, which
 * is not installed, and rules-unit-testing is not a dependency. Rather than ship
 * a rules change on reasoning alone (the #125 posture, which is also the PR whose
 * merged plan carried a rule that would have broken prod), this probes the REAL
 * deployed rules over the RTDB REST API and proves accept/reject empirically.
 *
 * It is DELIBERATELY NON-DESTRUCTIVE: it only asserts things that should be
 * REJECTED (which by definition write nothing) plus reads. Accept-path coverage
 * is the manual smoke list in the PR body — a rule that wrongly rejects shows up
 * there immediately, and a probe that writes real data to prod nodes is a worse
 * trade than a two-minute click-through.
 *
 * USAGE
 *   USER_ID_TOKEN=<non-admin id token> ADMIN_ID_TOKEN=<admin id token> \
 *     node scripts/verify-rules-pr1a.js
 *
 * Get a token from the browser console while signed in as that user:
 *   await firebase.auth().currentUser.getIdToken()
 * (or, on the Vue surfaces: (await import('/js/config/firebase-config.js')).auth.currentUser.getIdToken())
 *
 * ADMIN_ID_TOKEN is optional — without it the admin-side checks are skipped and
 * reported as SKIPPED rather than silently passing.
 *
 * Exits 0 only if every executed check matches its expectation.
 */

const DB = process.env.RTDB_URL
  || 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com';

const USER = process.env.USER_ID_TOKEN || '';
const ADMIN = process.env.ADMIN_ID_TOKEN || '';

// A key that is obviously a probe, in case anything ever does land.
const PROBE_KEY = '__rules_probe_do_not_use__';

/** @returns {Promise<number>} HTTP status */
async function attempt(method, path, token, body) {
  const url = `${DB}/${path}.json${token ? `?auth=${encodeURIComponent(token)}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
}

/**
 * @typedef {{name:string, run:() => Promise<number>, expect:'allow'|'deny', needs?:'user'|'admin'}} Check
 */

/** @type {Check[]} */
const CHECKS = [
  // --- CRIT-04 scanningData: writes are now admin-only -----------------------
  { name: 'scanningData root write rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('PATCH', 'scanningData', USER, { [PROBE_KEY]: 1 }) },
  { name: 'scanningData child write rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('PUT', `scanningData/${PROBE_KEY}`, USER, 1) },

  // --- HIGH-04 locations: root write removed, child ownership preserved ------
  { name: 'locations ROOT write rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('PATCH', 'locations', USER, { [PROBE_KEY]: { name: 'probe' } }) },
  { name: 'locations ROOT write rejected even for admin (.write:false)', needs: 'admin', expect: 'deny',
    run: () => attempt('PATCH', 'locations', ADMIN, { [PROBE_KEY]: { name: 'probe' } }) },

  // --- MED-06a whatsapp-message-history: writes are now admin-only ----------
  { name: 'whatsapp-message-history root write rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('PATCH', 'whatsapp-message-history', USER, { [PROBE_KEY]: 1 }) },
  { name: 'whatsapp-message-history child write rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('PUT', `whatsapp-message-history/${PROBE_KEY}`, USER, {
      locationId: 'probe', messageType: 'probe', direction: 'probe', timestamp: 0, phoneNumber: 'probe',
    }) },

  // --- LOW-03 admin-claims: reads are now admin-only ------------------------
  { name: 'admin-claims read rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('GET', 'admin-claims', USER) },
  { name: 'admin-claims read still allowed for admin', needs: 'admin', expect: 'allow',
    run: () => attempt('GET', 'admin-claims', ADMIN) },

  // --- REGRESSION CANARIES: things that must NOT have changed ---------------
  // MED-01a was deliberately dropped from PR-1a because signup reads this
  // pre-auth. If this ever fails, the signup tier picker is broken.
  { name: 'CANARY subscriptionTiers still readable UNAUTHENTICATED (signup)', expect: 'allow',
    run: () => attempt('GET', 'subscriptionTiers', '') },
  { name: 'CANARY customization still readable UNAUTHENTICATED (guest WiFi)', expect: 'allow',
    run: () => attempt('GET', 'customization', '') },
  { name: 'CANARY scanningData still READABLE by authed user (write-only change)', needs: 'user', expect: 'allow',
    run: () => attempt('GET', `scanningData/${PROBE_KEY}`, USER) },
];

function verdict(status, expect) {
  const allowed = status >= 200 && status < 300;
  const denied = status === 401 || status === 403;
  if (expect === 'allow') return allowed ? 'PASS' : 'FAIL';
  if (denied) return 'PASS';
  return allowed ? 'FAIL' : 'FAIL';
}

(async () => {
  if (!USER && !ADMIN) {
    console.error('Set USER_ID_TOKEN (and optionally ADMIN_ID_TOKEN). Nothing to probe.');
    process.exit(2);
  }
  console.log(`Probing ${DB}`);
  console.log(`  user token: ${USER ? 'provided' : 'MISSING → user checks skipped'}`);
  console.log(`  admin token: ${ADMIN ? 'provided' : 'MISSING → admin checks skipped'}\n`);

  let failed = 0;
  let skipped = 0;

  for (const c of CHECKS) {
    if (c.needs === 'user' && !USER) { console.log(`  SKIP  ${c.name}`); skipped++; continue; }
    if (c.needs === 'admin' && !ADMIN) { console.log(`  SKIP  ${c.name}`); skipped++; continue; }
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

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}` +
    (skipped ? ` (${skipped} skipped)` : ''));

  if (failed === 0 && skipped > 0) {
    console.log('Skipped checks are NOT passes — supply the missing token to close the gap.');
  }
  process.exit(failed === 0 ? 0 : 1);
})();
