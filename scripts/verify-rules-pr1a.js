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
 * ⚠️ NON-DESTRUCTIVE ONLY ONCE THE RULES ARE DEPLOYED. The "reject" checks work
 * by ATTEMPTING A WRITE: against the tightened rules they are 401'd and write
 * nothing. Against the OLD rules they SUCCEED — `scanningData`, `locations` and
 * `whatsapp-message-history` all had `.write: "auth != null"` before PR-1a — so
 * running this pre-deploy would write probe keys into three PRODUCTION nodes.
 *
 * Two guards enforce the ordering so safety does not depend on the operator
 * running the runbook steps in sequence:
 *   1. PREFLIGHT — attempts one `scanningData` probe write and ABORTS the entire
 *      run if it succeeds (that means the rules are not deployed yet), cleaning
 *      up the value it just wrote.
 *   2. SELF-CLEANING — any write attempt that unexpectedly succeeds is DELETED
 *      immediately and reported as FAIL, so no probe data survives a surprise.
 *
 * Accept-path coverage is the manual smoke list in the PR body — a rule that
 * wrongly REJECTS legitimate traffic shows up there immediately.
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
 * @typedef {{name:string, run:() => Promise<number>, expect:'allow'|'deny', needs?:'user'|'admin', cleanup?:string}} Check
 */

/** @type {Check[]} */
const CHECKS = [
  // --- CRIT-04 scanningData: writes are now admin-only -----------------------
  { name: 'scanningData root write rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('PATCH', 'scanningData', USER, { [PROBE_KEY]: 1 }), cleanup: `scanningData/${PROBE_KEY}` },
  { name: 'scanningData child write rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('PUT', `scanningData/${PROBE_KEY}`, USER, 1), cleanup: `scanningData/${PROBE_KEY}` },

  // --- HIGH-04 locations ----------------------------------------------------
  //
  // ⚠️ HIGH-04's actual fix (root `.write: false`) is NOT LIVE-PROBEABLE. A true
  // root write is `PUT /locations.json`, which REPLACES THE ENTIRE NODE — if the
  // rule were broken, the probe would destroy every location. That is not a test
  // worth running against production.
  //
  // The assurance is static instead, and it is sound: `.write: false` is
  // unconditional, and RTDB write rules cascade PERMISSIVELY DOWNWARD ONLY —
  // a child grant can never re-grant its parent. So root writes are closed by
  // construction.
  //
  // The original two checks here were MISLABELLED. A REST PATCH with child keys
  // is evaluated at the CHILD path (`$locationId`), never at the root, so
  // neither ever exercised `.write: false`:
  //   - the admin one FAILED (HTTP 200) — correct behaviour, wrong expectation:
  //     admins legitimately manage locations via the child rule.
  //   - the non-admin one PASSED, but via the `ownerId` `.validate`, not via
  //     `.write: false` — a green check that was not measuring its own name,
  //     which is the more dangerous of the two mistakes.
  //
  // What remains genuinely worth probing is the CHILD ownership boundary, so
  // that is what these now claim to be:
  { name: 'locations CHILD write rejected for non-admin without ownerId (.validate)', needs: 'user', expect: 'deny',
    run: () => attempt('PATCH', 'locations', USER, { [PROBE_KEY]: { name: 'probe' } }), cleanup: `locations/${PROBE_KEY}` },
  { name: 'locations CHILD write rejected for non-admin claiming ANOTHER uid as ownerId', needs: 'user', expect: 'deny',
    run: () => attempt('PATCH', 'locations', USER, { [PROBE_KEY]: { name: 'probe', ownerId: 'some-other-uid' } }),
    cleanup: `locations/${PROBE_KEY}` },

  // --- MED-06a whatsapp-message-history: writes are now admin-only ----------
  { name: 'whatsapp-message-history root write rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('PATCH', 'whatsapp-message-history', USER, { [PROBE_KEY]: 1 }), cleanup: `whatsapp-message-history/${PROBE_KEY}` },
  { name: 'whatsapp-message-history child write rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('PUT', `whatsapp-message-history/${PROBE_KEY}`, USER, {
      locationId: 'probe', messageType: 'probe', direction: 'probe', timestamp: 0, phoneNumber: 'probe',
    }), cleanup: `whatsapp-message-history/${PROBE_KEY}` },

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
  return denied ? 'PASS' : 'FAIL';
}

/** Best-effort removal of anything a probe write unexpectedly left behind. */
async function cleanup(path, token) {
  try {
    const status = await attempt('DELETE', path, token);
    return status >= 200 && status < 300;
  } catch {
    return false;
  }
}

/**
 * Refuse to run against UN-deployed rules.
 *
 * Pre-PR-1a, `scanningData` root .write was "auth != null", so this write
 * succeeds and tells us the tightening is not live yet — at which point every
 * subsequent reject-check would also write junk into production. Abort instead,
 * after removing the value we just wrote.
 */
async function preflight(token) {
  // (a) TOKEN VALIDITY. An expired or malformed token 401s on everything, which
  // would make every deny-check "PASS" and report a triumphant, meaningless
  // ALL CHECKS PASSED. Firebase ID tokens live ~1 hour, so a stale one is the
  // single most likely operator error. `scanningData` .read is "auth != null"
  // and PR-1a did NOT change it, so a valid token must be able to read it.
  let readStatus;
  try {
    readStatus = await attempt('GET', 'scanningData', token);
  } catch (err) {
    console.error(`PREFLIGHT could not reach the database (${err.code || err.name}). Aborting.`);
    return false;
  }
  if (readStatus === 401 || readStatus === 403) {
    console.error('PREFLIGHT FAILED — the supplied token cannot read an auth-gated node.');
    console.error('  The token is most likely EXPIRED (Firebase ID tokens last ~1 hour) or malformed.');
    console.error('  Every deny-check would 401 and report a FALSE PASS, so this run is aborted.');
    console.error('  Mint a fresh token and re-run.');
    return false;
  }

  // (b) RULES-DEPLOYED. Pre-PR-1a this write succeeded; if it still does, the
  // tightening is not live and every reject-check would write junk to prod.
  const path = `scanningData/${PROBE_KEY}`;
  let status;
  try {
    status = await attempt('PUT', path, token, { preflight: true });
  } catch (err) {
    console.error(`PREFLIGHT could not reach the database (${err.code || err.name}). Aborting.`);
    return false;
  }
  if (status === 401 || status === 403) return true; // rules are live — safe to proceed

  if (status >= 200 && status < 300) {
    const removed = await cleanup(path, token);
    console.error('PREFLIGHT FAILED — the PR-1a rules are NOT deployed yet.');
    console.error(`  A probe write to ${path} SUCCEEDED, which it must not once the rules are live.`);
    console.error(`  Cleanup of that write: ${removed ? 'OK (removed)' : 'FAILED — delete it manually'}.`);
    console.error('  Aborting before the remaining checks write junk into production.');
    console.error('  Run `firebase deploy --only database` first, then re-run this probe.');
    return false;
  }
  console.error(`PREFLIGHT got an unexpected HTTP ${status}. Aborting rather than guessing.`);
  return false;
}

(async () => {
  if (!USER && !ADMIN) {
    console.error('Set USER_ID_TOKEN (and optionally ADMIN_ID_TOKEN). Nothing to probe.');
    process.exit(2);
  }
  console.log(`Probing ${DB}`);
  console.log(`  user token: ${USER ? 'provided' : 'MISSING → user checks skipped'}`);
  console.log(`  admin token: ${ADMIN ? 'provided' : 'MISSING → admin checks skipped'}\n`);

  // Ordering guard: never let reject-probes run against un-deployed rules.
  const probeToken = USER || ADMIN;
  if (!(await preflight(probeToken))) process.exit(3);
  console.log('  preflight OK — tightened rules are live\n');

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
    let note = '';
    // Self-cleaning: a deny-check that unexpectedly succeeded has written
    // something. Remove it now rather than leaving probe data in production.
    if (c.expect === 'deny' && status >= 200 && status < 300 && c.cleanup) {
      const removed = await cleanup(c.cleanup, c.needs === 'admin' ? ADMIN : USER);
      note = removed ? '  (probe write REMOVED)' : '  (⚠ probe write left behind — delete manually)';
    }
    console.log(`  ${v}  ${c.name}  [expected ${c.expect}, HTTP ${status}]${note}`);
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}` +
    (skipped ? ` (${skipped} skipped)` : ''));

  if (failed === 0 && skipped > 0) {
    console.log('Skipped checks are NOT passes — supply the missing token to close the gap.');
  }
  process.exit(failed === 0 ? 0 : 1);
})();
