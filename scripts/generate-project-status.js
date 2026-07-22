/**
 * generate-project-status.js
 *
 * Sync the drift-prone fields of `public/data/project-status.json` FROM the
 * canonical `KNOWLEDGE BASE/PROJECT_BACKLOG.md`, so the dashboard data file no
 * longer has to be hand-maintained in lockstep (CLAUDE.md Step 11 — a trap that
 * has silently drifted twice).
 *
 * Usage:
 *   node scripts/generate-project-status.js            # write the synced file
 *   node scripts/generate-project-status.js --check    # exit 1 if out of sync
 *
 * Only these four fields are DERIVED and replaced; every other key (sprint,
 * phases, tasks, inProgress, backlog, security, …) is preserved exactly:
 *   - lastUpdated       ← backlog header-note contract line (group 1)
 *   - lastUpdatedNote   ← backlog header-note contract line (group 2)
 *   - recentlyCompleted ← "## 🏁 Recently Completed" table (merge-preserve by PR)
 *   - bugs              ← "## 🐛 Bug Triage Queue" table ONLY (not OWASP tables)
 *
 * NEVER written by this script (derived client-side, keep hands off):
 *   - `progress` — computed in public/js/modules/project-status/v2/service.js
 *     `normalize()` from `tasks` (done/total/pct). It is not present in the JSON
 *     on disk and must never be added here.
 *   The dashboard component also reads `bug.title`/`bug.severity`/`bug.discovered`
 *   and `r.pr` — none of which are derived, so their shapes are mirrored as-is.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_BACKLOG = resolve(REPO_ROOT, 'KNOWLEDGE BASE', 'PROJECT_BACKLOG.md');
const DEFAULT_STATUS = resolve(REPO_ROOT, 'public', 'data', 'project-status.json');

/** Contract/parse failures exit 2 (loud, never write a degraded file). */
export class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContractError';
    this.exitCode = 2;
  }
}

// ── Markdown helpers ──────────────────────────────────────────────────────────

/** Strip inline markdown (bold/strike/code) and normalise whitespace. */
export function stripInline(text) {
  return String(text)
    .replace(/\\\|/g, '|') // unescape table-escaped pipes
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/~~(.+?)~~/gs, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return the body of a section (lines after the matching heading, up to the
 * next markdown heading), or null if the heading is not found.
 */
function sectionBody(md, headingRegex) {
  const lines = md.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRegex.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

/** Split a markdown table row into trimmed cells, honouring escaped `\|`. */
function splitCells(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim());
}

/**
 * Parse the FIRST contiguous markdown table in a section body into an array of
 * data rows (header + separator dropped). Each row is an array of cell strings.
 */
function parseTable(body) {
  const tableLines = [];
  let started = false;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('|')) {
      tableLines.push(line);
      started = true;
    } else if (started) {
      break; // table ends at the first non-`|` line
    }
  }
  if (tableLines.length < 2) return [];
  return tableLines.slice(2).map(splitCells); // drop header + separator
}

/** `#200` → 200 (Number); `#93–#102` / `#77, #78` → '93–102' / '77, 78' (String). */
export function normalizePr(cell) {
  const cleaned = String(cell).replace(/#/g, '').trim();
  return /^\d+$/.test(cleaned) ? Number(cleaned) : cleaned;
}

/** Normalised comparison key so `168` (num) matches `#168`, `"93–102"` matches `#93–#102`. */
function prKey(pr) {
  return String(pr).replace(/#/g, '').trim();
}

// ── Field parsers ─────────────────────────────────────────────────────────────

export function parseHeaderNote(md) {
  const m = md.match(/^Last updated: (\d{4}-\d{2}-\d{2}) — (.+)$/m);
  if (!m) {
    throw new ContractError(
      'Backlog header-note contract line not found. Expected a line matching: ' +
        '"Last updated: YYYY-MM-DD — <note>" (em-dash separator).'
    );
  }
  return { lastUpdated: m[1], lastUpdatedNote: m[2].trim() };
}

export function parseRecentlyCompleted(md) {
  const body = sectionBody(md, /^##\s+.*Recently Completed/i);
  if (body === null) {
    throw new ContractError(
      'Recently Completed section not found. Expected a "## … Recently Completed" heading.'
    );
  }
  return parseTable(body)
    .filter(cells => cells.length >= 3)
    .map(cells => ({
      title: stripInline(cells[0]),
      pr: normalizePr(cells[1]),
      mergedAt: cells[2].trim(),
    }));
}

/**
 * Merge parsed markdown rows with the existing JSON array. Membership + order
 * follow the markdown (newest-first). For a PR already present in the JSON, the
 * existing object is preserved verbatim (it may carry richer, hand-authored
 * fields we cannot re-derive); genuinely new PRs are generated from markdown.
 */
export function mergeRecentlyCompleted(parsedRows, existing = []) {
  const byKey = new Map(existing.map(e => [prKey(e.pr), e]));
  return parsedRows.map(row => {
    const preserved = byKey.get(prKey(row.pr));
    if (preserved) return preserved;
    return { title: row.title, pr: row.pr, mergedAt: row.mergedAt };
  });
}

/** Leading bold phrase → title; remainder → notes. Fallback: first sentence. */
export function extractTitleAndNotes(bugCell) {
  const s = bugCell.trim();
  const bold = s.match(/\*\*(.+?)\*\*/s);
  if (bold) {
    const title = stripInline(bold[1]);
    const rest = s.slice(bold.index + bold[0].length);
    const notes = stripInline(rest).replace(/^[—–-]\s*/, '').trim();
    return { title, notes };
  }
  const plain = stripInline(s);
  const firstSentence = (plain.split(/(?<=[.!?])\s/)[0] || plain).slice(0, 120).trim();
  return { title: firstSentence, notes: plain };
}

/** Map a Severity cell to the JSON enum (critical/high/medium/low/fixed). */
export function parseSeverity(cell) {
  const s = stripInline(cell).toLowerCase();
  if (s.includes('fixed')) return 'fixed'; // e.g. "~~High~~ FIXED"
  if (/\bcrit/.test(s)) return 'critical';
  if (/\bhigh\b/.test(s)) return 'high';
  if (/\bmed/.test(s)) return 'medium'; // "med" / "medium"
  if (/\blow\b/.test(s)) return 'low';
  return s.split(/[\s(]/)[0] || 'unspecified';
}

/**
 * A "Discovered" cell that starts with a date yields both discoveredAt (the
 * date) and discoveredOn (the first parenthetical, else the remainder). No
 * leading date → no discoveredAt; discoveredOn is the whole cell.
 */
export function parseDiscovered(cell) {
  const text = stripInline(cell);
  const dated = text.match(/^(\d{4}-\d{2}-\d{2})\b\s*(.*)$/);
  if (dated) {
    const rest = dated[2].trim();
    const paren = rest.match(/^\(([^)]*)\)/);
    return { discoveredAt: dated[1], discoveredOn: paren ? paren[1].trim() : rest };
  }
  return { discoveredOn: text };
}

/** "No" → "False", "Yes" → "True" (string, mirroring the newest JSON rows). */
export function parseBlocking(cell) {
  const s = stripInline(cell).toLowerCase();
  if (s.startsWith('no')) return 'False';
  if (s.startsWith('yes')) return 'True';
  return stripInline(cell);
}

export function parseBugs(md) {
  const body = sectionBody(md, /^##\s+.*Bug Triage Queue/i);
  if (body === null) {
    throw new ContractError(
      'Bug Triage Queue section not found. Expected a "## 🐛 Bug Triage Queue" heading.'
    );
  }
  const bugs = [];
  for (const cells of parseTable(body)) {
    if (cells.length < 4) continue;
    if (cells[0].trimStart().startsWith('✅')) continue; // fixed/closed rows
    const { title, notes } = extractTitleAndNotes(cells[0]);
    const severity = parseSeverity(cells[1]);
    const { discoveredAt, discoveredOn } = parseDiscovered(cells[2]);
    const blockingSprint = parseBlocking(cells[3]);

    const bug = { title, severity };
    if (discoveredAt) bug.discoveredAt = discoveredAt;
    bug.discoveredOn = discoveredOn;
    bug.blockingSprint = blockingSprint;
    bug.notes = notes;
    bugs.push(bug);
  }
  return bugs;
}

// ── Assembly + serialisation ──────────────────────────────────────────────────

/** Build the new status object, replacing ONLY the four derived fields. */
export function buildStatus(md, existing) {
  const { lastUpdated, lastUpdatedNote } = parseHeaderNote(md);
  const recentlyCompleted = mergeRecentlyCompleted(
    parseRecentlyCompleted(md),
    Array.isArray(existing.recentlyCompleted) ? existing.recentlyCompleted : []
  );
  const bugs = parseBugs(md);
  // Spread preserves original key order and only overwrites in place.
  return { ...existing, lastUpdated, lastUpdatedNote, recentlyCompleted, bugs };
}

export function detectEol(raw) {
  return raw.includes('\r\n') ? '\r\n' : '\n';
}

export function hasTrailingNewline(raw) {
  return /\n$/.test(raw);
}

export function serialize(obj, { eol = '\n', trailingNewline = true } = {}) {
  let text = JSON.stringify(obj, null, 2);
  if (eol !== '\n') text = text.replace(/\n/g, eol);
  if (trailingNewline) text += eol;
  return text;
}

/** Concise field-level diff summary for the four derived fields. */
export function diffFields(existing, generated) {
  const changes = [];
  if (existing.lastUpdated !== generated.lastUpdated) {
    changes.push(`lastUpdated: ${existing.lastUpdated} → ${generated.lastUpdated}`);
  }
  if (existing.lastUpdatedNote !== generated.lastUpdatedNote) {
    changes.push('lastUpdatedNote changed');
  }
  const rcBefore = (existing.recentlyCompleted || []).length;
  const rcAfter = generated.recentlyCompleted.length;
  if (JSON.stringify(existing.recentlyCompleted) !== JSON.stringify(generated.recentlyCompleted)) {
    changes.push(`recentlyCompleted: ${rcBefore} → ${rcAfter} entries`);
  }
  const bugsBefore = (existing.bugs || []).length;
  const bugsAfter = generated.bugs.length;
  if (JSON.stringify(existing.bugs) !== JSON.stringify(generated.bugs)) {
    changes.push(`bugs: ${bugsBefore} → ${bugsAfter} entries`);
  }
  return changes;
}

/**
 * Compute sync state from the raw current file text + markdown. `matches` is
 * true iff the file already equals the byte-exact generated output.
 */
export function computeSync(rawStatusText, md) {
  const existing = JSON.parse(rawStatusText);
  const generated = buildStatus(md, existing);
  const generatedText = serialize(generated, {
    eol: detectEol(rawStatusText),
    trailingNewline: hasTrailingNewline(rawStatusText),
  });
  return {
    existing,
    generated,
    generatedText,
    matches: generatedText === rawStatusText,
    changes: diffFields(existing, generated),
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function optValue(args, name) {
  const prefix = `--${name}=`;
  const hit = args.find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function runCli(argv) {
  const args = argv.slice(2);
  const checkMode = args.includes('--check');
  const backlogPath = optValue(args, 'backlog') || DEFAULT_BACKLOG;
  const statusPath = optValue(args, 'status') || DEFAULT_STATUS;

  let md;
  let rawStatus;
  try {
    md = readFileSync(backlogPath, 'utf8');
  } catch {
    console.error(`ERROR (exit 2): could not read backlog at ${backlogPath}`);
    return 2;
  }
  try {
    rawStatus = readFileSync(statusPath, 'utf8');
  } catch {
    console.error(`ERROR (exit 2): could not read status JSON at ${statusPath}`);
    return 2;
  }

  let sync;
  try {
    sync = computeSync(rawStatus, md);
  } catch (err) {
    if (err instanceof ContractError) {
      console.error(`ERROR (exit ${err.exitCode}): ${err.message}`);
      return err.exitCode;
    }
    console.error(`ERROR (exit 2): ${err.message}`);
    return 2;
  }

  if (checkMode) {
    if (sync.matches) {
      console.log('project-status.json is in sync with PROJECT_BACKLOG.md.');
      return 0;
    }
    console.error('project-status.json is OUT OF SYNC with PROJECT_BACKLOG.md.');
    const changes = sync.changes.length ? sync.changes : ['formatting / whitespace only'];
    for (const c of changes) console.error(`  - ${c}`);
    console.error('Run `npm run status:sync` to update it.');
    return 1;
  }

  if (sync.matches) {
    console.log('project-status.json already in sync — nothing to write.');
    return 0;
  }
  writeFileSync(statusPath, sync.generatedText, 'utf8');
  const summary = sync.changes.length ? sync.changes.join('; ') : 'formatting only';
  console.log(`Wrote ${statusPath} — ${summary}.`);
  return 0;
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  process.exit(runCli(process.argv));
}
