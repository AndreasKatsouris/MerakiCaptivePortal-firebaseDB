#!/usr/bin/env node
/**
 * Repo secret scanner.
 *
 * Exists because of the 2026-08-05 Google abuse notification: a Google API key
 * was found in `public/js/config/firebase-config.js` and the scan that followed
 * turned up 12 MORE key-shaped literals across dead test pages, a billable
 * Places API key in `remoteconfig.template.json`, and a tracked RTDB export
 * carrying guest PII and a Twilio Account SID.
 *
 * The OWASP audit of 2026-05-30 had already flagged the duplicate-config problem
 * (finding H-3) and it was never actioned. Prose in a KB file does not stop a
 * regression; a failing check does. That is what this file is.
 *
 * Deliberate policy note — the Firebase WEB API key is NOT treated as a secret.
 * It is public by design and ships in every browser bundle; hiding it would be
 * theatre. What this scanner enforces is narrower and actually true:
 *   1. Exactly ONE Firebase config literal exists, in the shared config module.
 *      Duplicates are how wrong/stale project IDs creep in (H-3).
 *   2. No OTHER Google API key (Places/Maps/server keys) is committed.
 *   3. No database export or provider credential is tracked.
 *
 * Usage: node scripts/scan-secrets.js   (exit 1 on any finding)
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const GOOGLE_KEY = /AIzaSy[A-Za-z0-9_-]{33}/g;

// The one file allowed to carry the public Firebase web API key.
const CONFIG_ALLOWLIST = new Set(['public/js/config/firebase-config.js']);

// Paths that legitimately discuss keys in redacted/prefix form.
const DOC_PATHS = /^(docs\/|KNOWLEDGE BASE\/|public\/kb\/)/;

const CREDENTIAL_PATTERNS = [
  { name: 'Twilio Auth Token / API secret', re: /\bSK[0-9a-f]{32}\b/ },
  { name: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/ },
  // Requires a real base64 body — `-----BEGIN PRIVATE KEY-----\n...\n-----END`
  // placeholders in the setup docs are legitimate and must not trip this.
  { name: 'Private key block', re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----[\s\S]{0,40}?[A-Za-z0-9+/]{40,}/ },
  { name: 'GCP service account JSON', re: /"type"\s*:\s*"service_account"/ },
];

// Tracked files that are database exports / dumps rather than source.
const DUMP_PATH = /(-default-rtdb\.json|firebase-export|\bdb-dump\b|\bbackup.*\.json$)/i;

function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !f.includes('node_modules/') && !f.endsWith('package-lock.json'));
}

const findings = [];

for (const file of trackedFiles()) {
  if (DUMP_PATH.test(file)) {
    findings.push(`${file}: database export is tracked in git — untrack it and add it to .gitignore`);
  }

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // binary or unreadable
  }
  if (text.includes('\0')) continue; // binary

  for (const { name, re } of CREDENTIAL_PATTERNS) {
    if (re.test(text)) findings.push(`${file}: possible ${name} committed`);
  }

  const keys = text.match(GOOGLE_KEY);
  if (!keys) continue;

  if (CONFIG_ALLOWLIST.has(file)) continue;
  if (DOC_PATHS.test(file)) {
    findings.push(
      `${file}: full-length Google API key in documentation — redact it (keep at most a short prefix)`
    );
    continue;
  }
  findings.push(
    `${file}: Google API key literal outside the shared config module ` +
      `(${keys.length} occurrence${keys.length > 1 ? 's' : ''}) — ` +
      `import from public/js/config/firebase-config.js, or move a non-Firebase key to Remote Config / defineSecret`
  );
}

if (findings.length) {
  console.error(`\n✖ secret scan failed — ${findings.length} finding(s):\n`);
  for (const f of findings) console.error(`  • ${f}`);
  console.error('\nSee docs/security/API_KEY_INCIDENT_2026-08-05.md for the policy behind this check.\n');
  process.exit(1);
}

console.log('✔ secret scan clean');
