#!/usr/bin/env node
'use strict';

/**
 * Post-deploy verification probe for the PR-1b RTDB rules tightening
 * (NEW-CRIT-01 whatsapp-numbers / location-whatsapp-mapping, CRIT-11 rewards).
 *
 * Sibling of scripts/verify-rules-pr1a.js — same contract, same safety guards.
 * Read that file's header first; only the PR-1b-specific notes are repeated here.
 *
 * ⚠️ RUN ONLY AFTER `firebase deploy --only database`. Every reject-check works by
 * ATTEMPTING A WRITE. Before PR-1b all three nodes had `.write: "auth != null"` at
 * the root, which cascades permissively downward — so pre-deploy these probes
 * SUCCEED and write junk into production `rewards` and `whatsapp-numbers`. The
 * PREFLIGHT below refuses to continue in that case, and any write that
 * unexpectedly lands is deleted immediately and reported as FAIL.
 *
 * WHAT IS *NOT* PROBED, AND WHY (the #173 lesson — a check must measure the thing
 * its name claims):
 *
 *   The root `.write` tightening itself is NOT directly probeable. A REST `PATCH`
 *   carrying child keys is evaluated at the CHILD path, never at the root; the only
 *   request that truly exercises a root `.write` is `PUT /<node>.json`, which
 *   REPLACES THE ENTIRE NODE. Against a broken rule that would destroy every reward
 *   and every WhatsApp mapping in production. Not a test worth running.
 *
 *   The assurance for the root is static and sound: the old value was
 *   `"auth != null"` and RTDB write rules cascade PERMISSIVELY DOWNWARD ONLY, so a
 *   root grant silently overrode every per-child ownership rule beneath it — that
 *   cascade IS the vulnerability. Removing the grant cannot re-open anything; a
 *   child rule can never re-grant its parent.
 *
 *   So what these checks actually prove is the thing that matters operationally:
 *   the per-child ownership rules, previously DEAD CODE under the root grant, are
 *   now live and enforcing.
 *
 * USAGE
 *   USER_ID_TOKEN=<non-admin id token> ADMIN_ID_TOKEN=<admin id token> \
 *     node scripts/verify-rules-pr1b.js
 *
 * Get a token from the browser console while signed in as that user:
 *   await firebase.auth().currentUser.getIdToken()
 *   (Vue surfaces: (await import('/js/config/firebase-config.js')).auth.currentUser.getIdToken())
 *
 * Exits 0 only if every executed check matches its expectation.
 */

const DB = process.env.RTDB_URL
  || 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com';

const USER = process.env.USER_ID_TOKEN || '';
const ADMIN = process.env.ADMIN_ID_TOKEN || '';

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
 * Read the uid out of a Firebase ID token WITHOUT verifying it.
 *
 * This is safe here and it matters: the "non-admin cannot create a record even
 * for THEMSELVES" check is only honest if it really carries the caller's own uid.
 * Hardcoding a placeholder would make it pass for the wrong reason (rejected as a
 * foreign uid rather than as a create). No trust decision is made on this value —
 * it only shapes a probe body.
 */
function uidFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
}

const USER_UID = USER ? uidFromToken(USER) : null;

// A reward body that satisfies the .validate hasChildren() list, so that a
// rejection is unambiguously the .write rule and not a malformed payload.
const REWARD_BODY = { metadata: { probe: true }, status: 'approved', value: 1, expiresAt: 0 };

/**
 * @typedef {{name:string, run:() => Promise<number>, expect:'allow'|'deny',
 *            needs?:'user'|'admin'|'user-uid', cleanup?:string}} Check
 */

/** @type {Check[]} */
const CHECKS = [
  // --- CRIT-11 rewards: the voucher-fraud create path (PARTIAL) ---------------
  //
  // ⚠️ CRIT-11 is MITIGATED BY THIS PR, NOT CLOSED. Read this before ticking it off.
  //
  // What is fixed: `$rewardId .validate` no longer carries a `!data.exists()`
  // escape hatch, so an authenticated non-admin can no longer CREATE a reward
  // (and therefore cannot self-issue one with `status: 'approved'`). That is the
  // headline fraud path and it is what these two checks prove.
  //
  // What is NOT fixed: `rewards .write` is still `"auth != null"`. That grant
  // cascades, and a write to a DESCENDANT path (e.g. `rewards/{id}/status`) does
  // not evaluate the `$rewardId` `.validate` above it — so flipping a field on an
  // EXISTING reward is still open. Closing it requires locking `.write`, which
  // cannot be done by rules alone: `guest-management.html` is reachable from the
  // NON-admin user-dashboard nav and its rename cascade writes
  // `rewards/{id}/guestName` (guest-management.js:107) as an atomic multi-path
  // update — one rejected path fails the whole write. And `rewards` records carry
  // no ownerId/locationId, so there is no field to scope an owner rule against.
  // The real fix is a CF-mediated cascade or a schema change. Tracked as its own
  // follow-up; see docs/plans/2026-07-21-rules-batch-pr1b-scope.md §3.
  { name: 'rewards CREATE with status:approved rejected for non-admin (CRIT-11)', needs: 'user', expect: 'deny',
    run: () => attempt('PATCH', 'rewards', USER, { [PROBE_KEY]: REWARD_BODY }),
    cleanup: `rewards/${PROBE_KEY}` },
  { name: 'rewards CREATE still allowed for admin (issue-reward path)', needs: 'admin', expect: 'allow',
    run: () => attempt('PATCH', 'rewards', ADMIN, { [PROBE_KEY]: REWARD_BODY }),
    cleanup: `rewards/${PROBE_KEY}` },

  // --- NEW-CRIT-01 whatsapp-numbers: cross-tenant read + hijack ---------------
  // The root `.read: "auth != null"` cascaded over the per-child ownership rule,
  // so every authenticated user could enumerate every tenant's WhatsApp numbers.
  { name: 'whatsapp-numbers ROOT read rejected for non-admin (cross-tenant enumeration)', needs: 'user', expect: 'deny',
    run: () => attempt('GET', 'whatsapp-numbers', USER) },
  { name: 'whatsapp-numbers ROOT read still allowed for admin (admin dashboard)', needs: 'admin', expect: 'allow',
    run: () => attempt('GET', 'whatsapp-numbers', ADMIN) },
  { name: 'whatsapp-numbers CREATE claiming ANOTHER uid rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('PATCH', 'whatsapp-numbers', USER, {
      [PROBE_KEY]: {
        phoneNumber: '+27000000000', displayName: 'probe',
        userId: 'some-other-uid', status: 'probe', createdAt: 0,
      },
    }), cleanup: `whatsapp-numbers/${PROBE_KEY}` },
  // Distinguishes the tightening from the OLD rule: the old `!data.exists()` clause
  // let a non-admin create a record for themselves, which is a hijack vector on its
  // own (claim a victim's phoneNumber under your own userId). Creation is now
  // admin-only, so this must be denied even with the caller's real uid.
  { name: 'whatsapp-numbers CREATE with caller OWN uid also rejected (create is admin-only)', needs: 'user-uid', expect: 'deny',
    run: () => attempt('PATCH', 'whatsapp-numbers', USER, {
      [PROBE_KEY]: {
        phoneNumber: '+27000000000', displayName: 'probe',
        userId: USER_UID, status: 'probe', createdAt: 0,
      },
    }), cleanup: `whatsapp-numbers/${PROBE_KEY}` },

  // --- NEW-CRIT-01 location-whatsapp-mapping ---------------------------------
  { name: 'location-whatsapp-mapping ROOT read rejected for non-admin', needs: 'user', expect: 'deny',
    run: () => attempt('GET', 'location-whatsapp-mapping', USER) },
  { name: 'location-whatsapp-mapping ROOT read still allowed for admin', needs: 'admin', expect: 'allow',
    run: () => attempt('GET', 'location-whatsapp-mapping', ADMIN) },
  { name: 'location-whatsapp-mapping CREATE rejected for non-admin (routing hijack)', needs: 'user', expect: 'deny',
    run: () => attempt('PATCH', 'location-whatsapp-mapping', USER, {
      [PROBE_KEY]: {
        locationId: 'probe', whatsappNumberId: 'probe', phoneNumber: '+27000000000',
        userId: 'some-other-uid', assignedAt: 0,
      },
    }), cleanup: `location-whatsapp-mapping/${PROBE_KEY}` },

  // --- REGRESSION CANARIES: things that must NOT have changed ---------------
  // `rewards` root .read is DELIBERATELY still "auth != null". It is read by
  // root-level QUERIES (campaign.store.js:233, campaign.utils.js:141,
  // reward-management.js:190, receipt-management.js:669) and a query is authorised
  // at the QUERIED node — rules cannot filter its results. Locking it needs a
  // client read-path refactor first, so it is Bucket-C / PR-2. If this ever fails,
  // the campaigns and rewards admin surfaces are broken.
  { name: 'CANARY rewards root still READABLE by authed user (Bucket-C, deferred to PR-2)', needs: 'user', expect: 'allow',
    run: () => attempt('GET', 'rewards', USER) },
  { name: 'CANARY subscriptionTiers still readable UNAUTHENTICATED (signup)', expect: 'allow',
    run: () => attempt('GET', 'subscriptionTiers', '') },
  { name: 'CANARY customization still readable UNAUTHENTICATED (guest WiFi)', expect: 'allow',
    run: () => attempt('GET', 'customization', '') },
];

/**
 * 400 counts as a denial, deliberately.
 *
 * A `.write` rejection comes back 401 Permission denied, but a `.validate`
 * rejection can surface as 400 — and the rewards half of this PR is enforced
 * ENTIRELY by `.validate` (see the rewards checks below). Treating only 401/403
 * as deny would report a working rule as FAIL. The status is printed on every
 * line so the distinction stays visible rather than being smoothed away.
 */
function verdict(status, expect) {
  const allowed = status >= 200 && status < 300;
  const denied = status === 400 || status === 401 || status === 403;
  if (expect === 'allow') return allowed ? 'PASS' : 'FAIL';
  return denied ? 'PASS' : 'FAIL';
}

/** Best-effort removal of anything a probe write left behind. */
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
 * (a) TOKEN VALIDITY — an expired token 401s on everything, which would make every
 *     deny-check "PASS" and print a triumphant, meaningless ALL CHECKS PASSED.
 *     `rewards` .read is "auth != null" and PR-1b does NOT change it, so a valid
 *     token must be able to read it.
 * (b) RULES-DEPLOYED — pre-PR-1b a non-admin reward CREATE succeeded (the
 *     `!data.exists()` clause). If it still does, the tightening is not live and
 *     every remaining reject-check would write junk into production.
 */
async function preflight(token) {
  let readStatus;
  try {
    readStatus = await attempt('GET', 'rewards', token);
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

  const path = `rewards/${PROBE_KEY}`;
  let status;
  try {
    status = await attempt('PATCH', 'rewards', token, { [PROBE_KEY]: REWARD_BODY });
  } catch (err) {
    console.error(`PREFLIGHT could not reach the database (${err.code || err.name}). Aborting.`);
    return false;
  }
  // 400 included for the same reason as verdict(): this probe is a CREATE, which
  // PR-1b blocks via `.validate`, not `.write`.
  if (status === 400 || status === 401 || status === 403) return true; // rules live — safe to proceed

  if (status >= 200 && status < 300) {
    const removed = await cleanup(path, token);
    console.error('PREFLIGHT FAILED — the PR-1b rules are NOT deployed yet.');
    console.error(`  A probe reward CREATE at ${path} SUCCEEDED, which it must not once the rules are live.`);
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
  console.log(`  admin token: ${ADMIN ? 'provided' : 'MISSING → admin checks skipped'}`);
  if (USER && !USER_UID) {
    console.log('  ⚠ could not decode a uid from USER_ID_TOKEN → the own-uid create check will be skipped');
  }
  console.log('');

  // The preflight MUST use the non-admin token: the whole point is that this write
  // is refused. An admin token is legitimately allowed to create rewards, so it
  // would abort every run with a false "rules not deployed".
  if (!USER) {
    console.error('PREFLIGHT requires USER_ID_TOKEN (a NON-admin token) — an admin is');
    console.error('  legitimately allowed to create rewards, so it cannot detect un-deployed rules.');
    process.exit(2);
  }
  if (!(await preflight(USER))) process.exit(3);
  console.log('  preflight OK — tightened rules are live\n');

  let failed = 0;
  let skipped = 0;

  for (const c of CHECKS) {
    if (c.needs === 'user' && !USER) { console.log(`  SKIP  ${c.name}`); skipped++; continue; }
    if (c.needs === 'admin' && !ADMIN) { console.log(`  SKIP  ${c.name}`); skipped++; continue; }
    if (c.needs === 'user-uid' && !(USER && USER_UID)) { console.log(`  SKIP  ${c.name}`); skipped++; continue; }
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
    const wrote = status >= 200 && status < 300;
    // Self-cleaning, in BOTH directions:
    //  - a deny-check that unexpectedly succeeded has written something (a defect);
    //  - an allow-check that succeeded wrote something ON PURPOSE (the admin
    //    create path) and must still not leave probe data in production.
    if (wrote && c.cleanup) {
      const removed = await cleanup(c.cleanup, c.needs === 'admin' ? ADMIN : USER);
      note = removed
        ? (c.expect === 'deny' ? '  (probe write REMOVED)' : '  (probe cleaned up)')
        : '  (⚠ probe write left behind — delete manually)';
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
