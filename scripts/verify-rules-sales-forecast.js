#!/usr/bin/env node
'use strict';

/**
 * Post-deploy verification probe for the salesData / forecasts write-cascade fix.
 *
 * Sibling of scripts/verify-rules-pr1a.js and verify-rules-pr1b.js — same contract,
 * same safety guards. Read verify-rules-pr1b.js's header first; only the notes
 * specific to this change are repeated here.
 *
 * ⚠️ RUN ONLY AFTER `firebase deploy --only database`. Every reject-check works by
 * ATTEMPTING A WRITE. Before this change all four nodes had `.write: "auth != null"`
 * at the root, which cascades permissively downward — so pre-deploy these probes
 * SUCCEED and write junk into production. The PREFLIGHT below refuses to continue
 * in that case, and anything that unexpectedly lands is deleted immediately and
 * reported as FAIL.
 *
 * ⚠️ THE PROBE MUST RUN AS A NON-ADMIN. The global root `.write` at
 * database.rules.json:3 grants admins write everywhere and CASCADES; a descendant
 * `false` cannot revoke it. An admin-run probe therefore returns 200 through the
 * root grant and reads as a false FAILURE. This change closes the NON-ADMIN arm
 * only — that is the arm these checks measure. (D4 lesson, 2026-07-25.)
 *
 * WHAT IS *NOT* PROBED, AND WHY (#173 — a check must measure what its name claims):
 *
 *   The root `.write` tightening is not directly probeable. A REST PATCH carrying
 *   child keys is evaluated at the CHILD path, never at the root; the only request
 *   that truly exercises a root `.write` is `PUT /<node>.json`, which REPLACES THE
 *   ENTIRE NODE — against a broken rule that would destroy every tenant's sales
 *   records. Not a test worth running. The static assurance is sound: the old value
 *   was `"auth != null"`, write rules cascade permissively downward only, and a
 *   child rule can never re-grant its parent. What these checks prove is the thing
 *   that matters operationally — the per-child ownership rules, previously DEAD
 *   CODE under the root grant, are now live and enforcing.
 *
 * CHECK 9 SETTLES A GENUINE DISAGREEMENT — DO NOT DELETE IT.
 *
 *   Whether an ancestor `.validate` is evaluated for a write to a path BELOW it is
 *   load-bearing for this fix: 5 of the 12 writers in sales-data-service.js write
 *   below `$id`, and hole B's deep-path create arm depends on it. Three sources
 *   disagreed at design time:
 *     - the pre-build security review said YES (citing the Firebase docs' widget
 *       `hasChildren` example);
 *     - the ground-truth review could not confirm it and asked for evidence;
 *     - scripts/verify-rules-pr1b.js:128-129 asserts the OPPOSITE in prose, for
 *       exactly this shape ("a write to a DESCENDANT path does not evaluate the
 *       `$rewardId` `.validate` above it").
 *   Rather than settle it by argument, check 9 asks production. If it returns
 *   ALLOW, the `.validate` does not reach deep paths, hole B's deep-path arm is
 *   OPEN, and the rules need an additional guard at the deeper level before this
 *   can be called closed. Record the observed result in the design doc §8.
 *
 * CHECK 10 IS THE REGRESSION GUARD FOR A BYPASS THAT WAS ALMOST SHIPPED.
 *
 *   The first draft of this fix scoped index writes on
 *   `root.child('userLocations').child(auth.uid).child($locationId).exists()`,
 *   copied verbatim from the node's own `.read` rule. But `userLocations/$uid` is
 *   SELF-WRITABLE (database.rules.json:57) and a live client path writes it
 *   (access-control/services/subscription-service.js:540), so the predicate is
 *   attacker-controlled: assert membership of a victim's location, then delete
 *   their entire index bucket. Caught by security review before build. Check 10
 *   performs that exact two-step and must be DENIED. If someone later "simplifies"
 *   the index rule back to a userLocations form, this check fails.
 *
 * USAGE
 *   USER_ID_TOKEN=<non-admin id token> [ADMIN_ID_TOKEN=<admin id token>] \
 *   VICTIM_LOCATION_ID=<a location the non-admin does NOT own> \
 *     node scripts/verify-rules-sales-forecast.js
 *
 * Get a token from the browser console while signed in as that user:
 *   (await import('/js/config/firebase-config.js')).auth.currentUser.getIdToken()
 *
 * Exits 0 only if every executed check matches its expectation.
 */

const DB = process.env.RTDB_URL
  || 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com';

const USER = process.env.USER_ID_TOKEN || '';
const ADMIN = process.env.ADMIN_ID_TOKEN || '';
const VICTIM_LOCATION_ID = process.env.VICTIM_LOCATION_ID || '';

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

/** Read the uid from an ID token WITHOUT verifying it — see verify-rules-pr1b.js:67. */
function uidFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
}

const USER_UID = USER ? uidFromToken(USER) : null;
const FOREIGN_UID = 'probe_foreign_uid_not_a_real_user';

/**
 * A record body satisfying `.validate`'s hasChildren(['userId','locationId']) list,
 * so a rejection is unambiguously a rule decision and not a malformed payload.
 * `userId` is filled per-check — that field IS the thing under test.
 */
const body = (userId, locationId) => ({
  userId,
  locationId: locationId || 'probe_location',
  uploadedAt: 0,
  summary: { probe: true },
});

/**
 * @typedef {{name:string, run:() => Promise<number>, expect:'allow'|'deny',
 *            needs?:'user'|'admin'|'user-uid'|'victim-loc', cleanup?:string,
 *            note?:string}} Check
 */

/** @type {Check[]} */
const CHECKS = [
  // --- Hole A: overwrite / delete an EXISTING foreign record -------------------
  {
    name: '1. non-admin overwrites a foreign salesData record',
    needs: 'user',
    expect: 'deny',
    run: () => attempt('PUT', `salesData/${PROBE_KEY}_foreign`, USER,
      body(FOREIGN_UID)),
    cleanup: `salesData/${PROBE_KEY}_foreign`,
  },
  {
    name: '2. non-admin deletes a foreign salesData record',
    needs: 'user',
    expect: 'deny',
    // DELETE on a non-existent path can 200 vacuously; PATCH-to-null is the
    // honest form because it is evaluated as a write at the child path.
    run: () => attempt('PATCH', `salesData/${PROBE_KEY}_foreign`, USER,
      { userId: null }),
  },

  // --- Hole B: create with an arbitrary userId ---------------------------------
  {
    name: '3. non-admin creates salesData carrying a FOREIGN userId',
    needs: 'user',
    expect: 'deny',
    run: () => attempt('PUT', `salesData/${PROBE_KEY}_holeB`, USER,
      body(FOREIGN_UID)),
    cleanup: `salesData/${PROBE_KEY}_holeB`,
  },
  {
    name: '4. non-admin creates salesData carrying its OWN userId (no regression)',
    needs: 'user-uid',
    expect: 'allow',
    run: () => attempt('PUT', `salesData/${PROBE_KEY}_own`, USER,
      body(USER_UID)),
    cleanup: `salesData/${PROBE_KEY}_own`,
  },

  // --- Index nodes -------------------------------------------------------------
  {
    name: '5. non-admin writes its OWN record\'s index entry (no regression)',
    needs: 'user-uid',
    expect: 'allow',
    // Depends on check 4 having created the record first — this is the
    // "record first, index second" ordering the rule makes load-bearing.
    run: () => attempt('PUT',
      `salesDataIndex/byLocation/probe_location/${PROBE_KEY}_own`, USER, true),
    cleanup: `salesDataIndex/byLocation/probe_location/${PROBE_KEY}_own`,
  },
  {
    name: '6. non-admin writes an index entry for a record it does NOT own',
    needs: 'user',
    expect: 'deny',
    run: () => attempt('PUT',
      `salesDataIndex/byLocation/probe_location/${PROBE_KEY}_foreign`, USER, true),
    cleanup: `salesDataIndex/byLocation/probe_location/${PROBE_KEY}_foreign`,
  },
  {
    name: '7. non-admin writes another user\'s byUser bucket',
    needs: 'user',
    expect: 'deny',
    run: () => attempt('PUT',
      `salesDataIndex/byUser/${FOREIGN_UID}/${PROBE_KEY}`, USER, true),
    cleanup: `salesDataIndex/byUser/${FOREIGN_UID}/${PROBE_KEY}`,
  },

  // --- The two checks that exist to settle specific disputes -------------------
  {
    name: '9. DEEP-PATH create below $id with NO userId (settles §8 — see header)',
    needs: 'user',
    expect: 'deny',
    note: 'ALLOW here means ancestor .validate does NOT reach deep paths → hole B\'s '
        + 'deep-path arm is OPEN and the fix is incomplete. Record the result in the '
        + 'design doc §8 either way; this is evidence, not a formality.',
    run: () => attempt('PUT',
      `salesData/${PROBE_KEY}_deep/summary/probe`, USER, 1),
    cleanup: `salesData/${PROBE_KEY}_deep`,
  },
  {
    name: '10. userLocations self-grant → foreign index bucket (MUST-FIX 1 guard)',
    needs: 'victim-loc',
    expect: 'deny',
    note: 'Two-step: assert membership of a location you do not own, then write its '
        + 'index bucket. Returns ALLOW under the rejected v1 rule shape.',
    run: async () => {
      // Step 1 is EXPECTED to succeed — userLocations/$uid is self-writable today
      // (that is the underlying finding, logged separately). The probe is whether
      // step 2 rides on it.
      await attempt('PUT',
        `userLocations/${USER_UID}/${VICTIM_LOCATION_ID}`, USER, true);
      const status = await attempt('PUT',
        `salesDataIndex/byLocation/${VICTIM_LOCATION_ID}/${PROBE_KEY}`, USER, true);
      // Undo step 1 regardless of outcome — never leave a fabricated membership.
      await attempt('DELETE',
        `userLocations/${USER_UID}/${VICTIM_LOCATION_ID}`, USER);
      return status;
    },
    cleanup: `salesDataIndex/byLocation/${VICTIM_LOCATION_ID}/${PROBE_KEY}`,
  },

  // --- Positive regression guard ----------------------------------------------
  {
    name: '11. owner partial-update on own record (post-merge .validate guard)',
    needs: 'user-uid',
    expect: 'allow',
    note: 'The :195 updateHistoricalDataMetadata path. Passes only if newData at the '
        + '$id level reflects POST-MERGE state, carrying the existing userId.',
    run: () => attempt('PATCH', `salesData/${PROBE_KEY}_own2`, USER,
      { updatedAt: 1 }),
    cleanup: `salesData/${PROBE_KEY}_own2`,
  },
];

const ALLOWED = (s) => s >= 200 && s < 300;

async function preflight() {
  if (!USER) {
    console.error('FATAL: USER_ID_TOKEN is required (must be a NON-admin user).');
    process.exit(2);
  }
  if (!USER_UID) {
    console.error('FATAL: could not decode a uid from USER_ID_TOKEN.');
    process.exit(2);
  }
  // Refuse to run pre-deploy. Under the OLD rules the root grant makes a foreign
  // write succeed; running the full suite then would spray junk into production.
  const canary = await attempt('PUT', `salesData/${PROBE_KEY}_preflight`, USER,
    body(FOREIGN_UID));
  if (ALLOWED(canary)) {
    await attempt('DELETE', `salesData/${PROBE_KEY}_preflight`, USER);
    console.error(
      'FATAL: a foreign-userId write SUCCEEDED (status ' + canary + ').\n' +
      '       The rules are not deployed yet, or the fix did not take.\n' +
      '       The probe wrote and then removed one sentinel record. Refusing to continue.');
    process.exit(2);
  }
  console.log(`preflight OK — foreign write denied (${canary}); rules appear deployed.\n`);
}

async function main() {
  await preflight();

  let failures = 0;
  let skipped = 0;

  for (const check of CHECKS) {
    if (check.needs === 'admin' && !ADMIN) { console.log(`SKIP  ${check.name} (no ADMIN_ID_TOKEN)`); skipped++; continue; }
    if (check.needs === 'victim-loc' && !VICTIM_LOCATION_ID) { console.log(`SKIP  ${check.name} (no VICTIM_LOCATION_ID)`); skipped++; continue; }

    let status;
    try {
      status = await check.run();
    } catch (err) {
      console.log(`ERROR ${check.name} — ${err.message}`);
      failures++;
      continue;
    }

    const allowed = ALLOWED(status);
    const ok = check.expect === 'allow' ? allowed : !allowed;

    console.log(`${ok ? 'PASS ' : 'FAIL '} ${check.name}  [${status}, expected ${check.expect}]`);
    if (!ok && check.note) console.log(`      ↳ ${check.note}`);
    if (!ok) failures++;

    // Delete anything that landed, whether or not it was supposed to.
    if (check.cleanup && allowed) {
      const del = await attempt('DELETE', check.cleanup, USER);
      if (!ALLOWED(del)) {
        console.log(`      ⚠ could not clean up ${check.cleanup} (${del}) — remove it manually`);
      }
    }
  }

  console.log(`\n${CHECKS.length - skipped - failures}/${CHECKS.length - skipped} passed`
    + (skipped ? `, ${skipped} skipped` : ''));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(2); });
