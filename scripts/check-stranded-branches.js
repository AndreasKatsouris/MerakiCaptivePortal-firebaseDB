/**
 * check-stranded-branches.js
 *
 * Mechanizes the 6x-fired LESSONS entry (2026-07-05, broadened 2026-07-28):
 * "a session isn't done until a PR is open." Flags every `origin/*` branch
 * that has commits ahead of master and has NEVER had a PR opened for it —
 * i.e. work that is invisible to the operator without spelunking branch
 * history.
 *
 * Deliberately does NOT use `git branch -r --no-merged` as the stranded
 * signal: a squash-merged branch is reported "unmerged" by git ancestry
 * (its commits never literally land in master's history) even though its
 * content shipped via a real, reviewed PR — that produced ~40 false
 * positives when tried by hand (LESSONS 2026-07-28). The only signal that
 * distinguishes "shipped, just squashed" from "genuinely never seen" is
 * whether a PR was EVER opened for the branch (`gh pr list --state all`),
 * regardless of its merged/closed/open state.
 *
 * Usage:
 *   node scripts/check-stranded-branches.js [--days=2] [--base=origin/master]
 *
 * Exit codes:
 *   0 — no stranded branches, or all found are within the grace period
 *   1 — at least one stranded branch is older than --days
 *   2 — could not run git/gh (see stderr)
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DAYS = 2;
const DEFAULT_BASE = 'origin/master';
const EXCLUDED_BRANCHES = new Set(['origin/HEAD', 'origin/master']);

// ── exec seam ──────────────────────────────────────────────────────────────

/** Real process runner. Tests inject a fake instead of shelling out. */
export function defaultExec(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}

// ── Parsers (pure, unit-testable without any process spawn) ────────────────

/** Parse `git for-each-ref --format=%(refname:short)|%(committerdate:iso-strict)` output. */
export function parseRemoteBranches(raw) {
  return String(raw)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name, lastCommitDate] = line.split('|');
      return { name: name.trim(), lastCommitDate: (lastCommitDate || '').trim() };
    })
    .filter(b => b.name && !EXCLUDED_BRANCHES.has(b.name));
}

/** Parse `git rev-list <base>..<branch> --count` output (a single integer line). */
export function parseAheadCount(raw) {
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Parse `git diff --name-only <base>...<branch>` output into a file list. */
export function parseChangedFiles(raw) {
  return String(raw)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

/** Parse `gh pr list --state all --head <branch> --json number,state` JSON output. */
export function parsePrList(raw) {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

/** Days between `isoDate` and `now` (fractional). */
export function daysSince(isoDate, now) {
  const then = new Date(isoDate).getTime();
  return (now.getTime() - then) / (1000 * 60 * 60 * 24);
}

// ── Core detection ───────────────────────────────────────────────────────────

/**
 * A branch is stranded iff it has commits ahead of base AND no PR was ever
 * opened for it — never by ancestry-merged state, per the module doc above.
 */
export function findStrandedBranches(branches, { getAheadCount, hasPrEverOpened, getChangedFiles }) {
  const stranded = [];
  for (const branch of branches) {
    const aheadCount = getAheadCount(branch.name);
    if (aheadCount <= 0) continue; // nothing diverges from base — not stranded
    if (hasPrEverOpened(branch.name)) continue; // a PR exists (any state) — visible to the operator
    stranded.push({
      name: branch.name,
      lastCommitDate: branch.lastCommitDate,
      aheadCount,
      files: getChangedFiles(branch.name),
    });
  }
  return stranded;
}

// ── Orchestration + CLI ──────────────────────────────────────────────────────

export function run({
  exec = defaultExec,
  days = DEFAULT_DAYS,
  base = DEFAULT_BASE,
  now = new Date(),
  log = console.log,
  errorLog = console.error,
} = {}) {
  let branches;
  try {
    const raw = exec('git', [
      'for-each-ref',
      '--format=%(refname:short)|%(committerdate:iso-strict)',
      'refs/remotes/origin',
    ]);
    branches = parseRemoteBranches(raw);
  } catch (err) {
    errorLog(`ERROR (exit 2): could not list remote branches — ${err.message}`);
    return 2;
  }

  const getAheadCount = name => parseAheadCount(exec('git', ['rev-list', `${base}..${name}`, '--count']));
  const getChangedFiles = name => parseChangedFiles(exec('git', ['diff', '--name-only', `${base}...${name}`]));
  const hasPrEverOpened = name => {
    const shortName = name.replace(/^origin\//, '');
    const raw = exec('gh', ['pr', 'list', '--state', 'all', '--head', shortName, '--json', 'number,state']);
    return parsePrList(raw).length > 0;
  };

  let stranded;
  try {
    stranded = findStrandedBranches(branches, { getAheadCount, hasPrEverOpened, getChangedFiles });
  } catch (err) {
    errorLog(`ERROR (exit 2): could not evaluate branches — ${err.message}`);
    return 2;
  }

  if (stranded.length === 0) {
    log('No stranded branches found — every branch with commits ahead of master has an associated PR.');
    return 0;
  }

  let hasStale = false;
  for (const b of stranded) {
    const age = daysSince(b.lastCommitDate, now);
    const stale = age >= days;
    if (stale) hasStale = true;
    const marker = stale ? '⚠ STALE' : 'recent';
    const fileList = b.files.slice(0, 10).join(', ') + (b.files.length > 10 ? ', …' : '');
    log(
      `[${marker}] ${b.name} — last commit ${b.lastCommitDate} (${age.toFixed(1)}d ago), ` +
        `${b.aheadCount} commit(s) ahead, ${b.files.length} file(s): ${fileList}`
    );
  }

  if (hasStale) {
    errorLog(
      `\n${stranded.length} stranded branch(es) found, at least one older than ${days} day(s). ` +
        'See KNOWLEDGE BASE/development/LESSONS.md (process/session-visibility).'
    );
    return 1;
  }
  log(`\n${stranded.length} stranded branch(es) found, all within the ${days}-day grace period.`);
  return 0;
}

function optValue(args, name, fallback) {
  const prefix = `--${name}=`;
  const hit = args.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const days = parseInt(optValue(args, 'days', String(DEFAULT_DAYS)), 10);
  const base = optValue(args, 'base', DEFAULT_BASE);
  process.exit(run({ days, base }));
}
