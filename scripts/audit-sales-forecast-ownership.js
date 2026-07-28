#!/usr/bin/env node
'use strict';

/**
 * PRE-DEPLOY GATE for the salesData/forecasts write-cascade fix (PR #205).
 *
 * ⚠️ RUN THIS BEFORE `firebase deploy --only database`. READ-ONLY — it never writes.
 *
 * WHY THIS GATE EXISTS
 *
 *   The new rules add, on salesData/$id and forecasts/$id:
 *     ".validate": "newData.hasChildren(['userId','locationId'])
 *                   && (auth.token.admin === true || newData.child('userId').val() === auth.uid)"
 *
 *   `.validate` is CONJUNCTIVE and applies to EVERY write reaching the path — not
 *   just creates. So any EXISTING record missing `userId` or `locationId`, or whose
 *   `userId` belongs to nobody, becomes permanently UN-EDITABLE and UN-ARCHIVABLE
 *   BY ITS OWNER the moment the rules deploy. Every later update (:195, :380, :390,
 *   :598, :623) returns PERMISSION_DENIED.
 *
 *   And it is INVISIBLE TO THE FOUNDER, because the `auth.token.admin === true`
 *   disjunct short-circuits for the only person likely to test it. That is exactly
 *   security/rules-audit-blind-spot (LESSONS 2026-07-21) — the locations/ownerId
 *   bug that hid for ~7 weeks behind an admin bypass and a swallowed console.error.
 *
 *   A non-zero count is EXPECTED, not hypothetical: updateForecast() has been doing
 *   a full set() replace that dropped `userId` for an unknown period (fixed in this
 *   same PR, sales-data-service.js).
 *
 * WHAT IT CHECKS — note it audits BOTH fields, not just userId. The design doc's §5
 * originally said "userId"; the rule requires hasChildren(['userId','locationId']),
 * so a record missing EITHER is equally stuck.
 *
 * RECOVERY HINT (why the audit also reads the byUser index)
 *
 *   `salesDataIndex/byUser/{uid}/{recordId}` and `forecastIndex/byUser/{uid}/{id}`
 *   are write-only dead data — four writers, zero readers. That makes them the
 *   ideal backfill source: for a record whose `userId` was stripped, the byUser
 *   bucket it sits in still names its original owner. This script reports, for each
 *   orphaned record, whether such a bucket exists, so the backfill can be
 *   evidence-based rather than a guess.
 *
 * USAGE
 *   ADMIN_ID_TOKEN=<admin id token> node scripts/audit-sales-forecast-ownership.js
 *
 *   Get a token from the browser console while signed in as an ADMIN:
 *     (await import('/js/config/firebase-config.js')).auth.currentUser.getIdToken()
 *
 *   Admin is required: salesData/.read and forecasts/.read are already admin-only.
 *   (Deliberately NOT gcloud — those tokens expire constantly; LESSONS 2026-07-26.)
 *
 * EXIT CODES
 *   0  clean — every record has both fields and a resolvable owner. Safe to deploy.
 *   1  records would be stranded — BACKFILL FIRST, then re-run. Do not deploy.
 *   2  could not complete the audit (auth/network). State unknown — do not deploy.
 */

const DB = process.env.RTDB_URL
  || 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com';
const ADMIN = process.env.ADMIN_ID_TOKEN || '';

async function get(path, params = '') {
  const url = `${DB}/${path}.json?auth=${encodeURIComponent(ADMIN)}${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

/** Keys only — never pulls record bodies (dailyData can be large). */
const keys = async (path) => Object.keys((await get(path, '&shallow=true')) || {});

async function auditNode(recordNode, indexNode, liveUids) {
  const ids = await keys(recordNode);
  const stranded = [];

  for (const id of ids) {
    // Fetch only the two fields the rule cares about, not the whole record.
    const [userId, locationId] = await Promise.all([
      get(`${recordNode}/${id}/userId`).catch(() => null),
      get(`${recordNode}/${id}/locationId`).catch(() => null),
    ]);

    const reasons = [];
    if (!userId) reasons.push('userId MISSING');
    else if (!liveUids.has(userId)) reasons.push(`userId ORPHAN (${userId} not in users/)`);
    if (!locationId) reasons.push('locationId MISSING');

    if (reasons.length) stranded.push({ id, userId, locationId, reasons });
  }

  // For anything stranded, recover the true owner from the byUser index.
  //
  // ONE request, not (stranded x users). The obvious shape here is a probe of
  // byUser/{uid}/{recordId} for every uid, but that is a sequential round-trip
  // per pair — and parallelising it only trades latency for N concurrent
  // requests per record, which is worse against a growing user base. byUser
  // holds id->true booleans, so the whole subtree stays small even when the
  // record nodes do not: fetch it once and invert to recordId -> uid in memory.
  // Skipped entirely on the clean path, which is the common case.
  if (stranded.length) {
    const byUser = (await get(`${indexNode}/byUser`).catch(() => null)) || {};
    const ownerOf = new Map();
    for (const [uid, entries] of Object.entries(byUser)) {
      for (const id of Object.keys(entries || {})) ownerOf.set(id, uid);
    }
    for (const rec of stranded) rec.recoverableFrom = ownerOf.get(rec.id) || null;
  }

  return { total: ids.length, stranded };
}

function report(label, { total, stranded }) {
  console.log(`\n=== ${label} — ${total} records, ${stranded.length} would be stranded ===`);
  if (!stranded.length) { console.log('  clean'); return; }
  for (const r of stranded) {
    console.log(`  ${r.id}`);
    console.log(`     ${r.reasons.join(' | ')}`);
    console.log(`     recoverable owner from byUser index: ${r.recoverableFrom || 'NONE — needs a manual decision'}`);
  }
}

async function main() {
  if (!ADMIN) {
    console.error('FATAL: ADMIN_ID_TOKEN is required (salesData/forecasts reads are admin-only).');
    process.exit(2);
  }

  console.log('READ-ONLY audit. Nothing is written.\n');

  let liveUids;
  try {
    liveUids = new Set(await keys('users'));
    console.log(`live uids in users/: ${liveUids.size}`);
  } catch (err) {
    console.error(`FATAL: could not read users/ (${err.message}). Audit state unknown.`);
    process.exit(2);
  }

  let sales, forecasts;
  try {
    sales = await auditNode('salesData', 'salesDataIndex', liveUids);
    forecasts = await auditNode('forecasts', 'forecastIndex', liveUids);
  } catch (err) {
    console.error(`FATAL: audit incomplete (${err.message}). Do NOT deploy on a partial result.`);
    process.exit(2);
  }

  report('salesData', sales);
  report('forecasts', forecasts);

  const strandedTotal = sales.stranded.length + forecasts.stranded.length;
  const recoverable = [...sales.stranded, ...forecasts.stranded].filter(r => r.recoverableFrom).length;

  console.log(`\n${'='.repeat(60)}`);
  if (strandedTotal === 0) {
    console.log('CLEAN — every record carries userId + locationId and a resolvable owner.');
    console.log('Safe to deploy the rules.');
    process.exit(0);
  }

  console.log(`${strandedTotal} record(s) would become UN-EDITABLE BY THEIR OWNERS on deploy.`);
  console.log(`${recoverable} of those have a recoverable owner in the byUser index.`);
  console.log('\nDO NOT DEPLOY YET. Options, in order of preference:');
  console.log('  1. Backfill the missing fields (owner from the byUser index above),');
  console.log('     then re-run this audit until it exits 0.');
  console.log('  2. If some records have NO recoverable owner, decide explicitly:');
  console.log('     assign to an admin, or delete them. Do not guess.');
  console.log('  3. Only if a backfill is genuinely impractical: add an explicit');
  console.log('     transitional term to .validate — and test EXISTENCE explicitly');
  console.log('     (data.exists()), never a null comparison. In RTDB rules');
  console.log('     null === null is TRUE, which is how PR #176 shipped a non-fix.');
  process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(2); });
