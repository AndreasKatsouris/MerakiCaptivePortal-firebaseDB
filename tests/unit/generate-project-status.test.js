import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseHeaderNote,
  parseRecentlyCompleted,
  mergeRecentlyCompleted,
  parseBugs,
  buildStatus,
  serialize,
  detectEol,
  hasTrailingNewline,
  computeSync,
  diffFields,
  ContractError,
} from '../../scripts/generate-project-status.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '../../scripts/generate-project-status.js');

// ── Fixtures ────────────────────────────────────────────────────────────────
// Em-dash (—) matters: the header-note contract is `Last updated: <date> — <note>`.
const MD = [
  '# Project Backlog',
  '',
  'Last updated: 2026-07-22 — Framework housecleaning: history archived, sync added.',
  '',
  '> note discipline blah blah',
  '',
  '## 🎯 Sprint Goal',
  '',
  'Some goal text.',
  '',
  '## 🐛 Bug Triage Queue',
  '',
  '> Bugs discovered during sprint work — log here.',
  '',
  '| Bug | Severity | Discovered | Blocking Sprint? |',
  '|-----|----------|------------|-----------------|',
  '| 🔓 **A real bug with `pipes` in it** — prose about `x \\|\\| y` being bad and dangerous. | **High** | 2026-07-21 (PR #176 security review) | No |',
  '| ✅ **FIXED thing (#170)** — should be skipped entirely. | ~~High~~ **FIXED** | 2026-07-20 (somewhere) | No |',
  '| **No date bug** — happened during a preview session. | Medium | PR #65 preview | No |',
  '',
  '### 🔐 OWASP Security Audit — 2026-06-15 Findings',
  '',
  '| ID | Finding | Severity | OWASP | File | Model | Blocking? |',
  '|----|---------|----------|-------|------|-------|-----------|',
  '| CRIT-99 | should NOT be parsed as a bug | Critical | A01 | x.js | m | No |',
  '',
  '## 🏁 Recently Completed (last 5)',
  '',
  '| Feature | PR | Merged |',
  '|---------|----|--------|',
  '| **New thing shipped** — did a cool thing with `code`. | #200 | 2026-07-22 |',
  '| **Older preserved** — this markdown title should be ignored in favour of JSON. | #175 | 2026-07-21 |',
  '| **Range PR bundle** — multiple PRs at once. | #93–#102 | 2026-05-31 |',
  '',
  '## 📝 How to Use This File',
  '',
  'Instructions.',
  '',
].join('\n');

function makeExisting() {
  return {
    lastUpdated: '2026-01-01',
    lastUpdatedNote: 'stale note that must be replaced',
    sprint: { goal: 'keep me exactly', started: '2026-04-30' },
    phases: [{ id: 0, name: 'p0', status: 'done' }],
    tasks: [{ id: 't1', done: true }, { id: 't2', done: false }],
    inProgress: [],
    recentlyCompleted: [
      {
        title: 'Older preserved RICH title with lots of detail that must survive verbatim',
        pr: 175,
        mergedAt: '2026-07-21',
      },
    ],
    bugs: [{ title: 'old bug', severity: 'low', discoveredOn: 'PR #1', blockingSprint: false, notes: 'old' }],
    backlog: { high: ['keep this'], medium: [], low: [] },
    security: { audit: 'OWASP', remaining: ['keep'] },
  };
}

// ── parseHeaderNote ───────────────────────────────────────────────────────────
describe('parseHeaderNote', () => {
  it('parses the contract line into date + note', () => {
    expect(parseHeaderNote(MD)).toEqual({
      lastUpdated: '2026-07-22',
      lastUpdatedNote: 'Framework housecleaning: history archived, sync added.',
    });
  });

  it('throws ContractError (exit 2) when the contract line is missing', () => {
    const bad = MD.replace(/Last updated:.*\n/, '');
    expect(() => parseHeaderNote(bad)).toThrow(ContractError);
    try {
      parseHeaderNote(bad);
    } catch (e) {
      expect(e.exitCode).toBe(2);
      expect(e.message).toMatch(/Last updated: YYYY-MM-DD/);
    }
  });
});

// ── parseRecentlyCompleted ────────────────────────────────────────────────────
describe('parseRecentlyCompleted', () => {
  it('parses rows newest-first with correct pr types and stripped titles', () => {
    const rows = parseRecentlyCompleted(MD);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      title: 'New thing shipped — did a cool thing with code.',
      pr: 200,
      mergedAt: '2026-07-22',
    });
    // single integer PR → Number
    expect(typeof rows[0].pr).toBe('number');
    // range PR → string, en-dash preserved, '#' stripped
    expect(rows[2].pr).toBe('93–102');
    expect(typeof rows[2].pr).toBe('string');
  });

  it('throws ContractError when the heading is absent', () => {
    const bad = MD.replace(/## 🏁 Recently Completed.*\n/, '## Nope\n');
    expect(() => parseRecentlyCompleted(bad)).toThrow(ContractError);
  });
});

// ── mergeRecentlyCompleted ────────────────────────────────────────────────────
describe('mergeRecentlyCompleted', () => {
  it('preserves existing objects by PR match and generates new ones, newest-first', () => {
    const parsed = parseRecentlyCompleted(MD);
    const existing = makeExisting().recentlyCompleted;
    const merged = mergeRecentlyCompleted(parsed, existing);

    expect(merged).toHaveLength(3);
    // #200 is new → generated from markdown
    expect(merged[0].pr).toBe(200);
    expect(merged[0].title).toBe('New thing shipped — did a cool thing with code.');
    // #175 exists in JSON → preserved verbatim (rich title, not the markdown title)
    expect(merged[1]).toBe(existing[0]);
    expect(merged[1].title).toMatch(/RICH title/);
    // #93–102 is new
    expect(merged[2].pr).toBe('93–102');
  });
});

// ── parseBugs ─────────────────────────────────────────────────────────────────
describe('parseBugs', () => {
  it('parses only the Bug Triage Queue table, skipping ✅ rows and ignoring OWASP tables', () => {
    const bugs = parseBugs(MD);
    expect(bugs).toHaveLength(2); // ✅ row skipped, OWASP row excluded by construction
    expect(bugs.some(b => /should NOT be parsed/.test(b.title))).toBe(false);
    expect(bugs.some(b => /FIXED thing/.test(b.title))).toBe(false);
  });

  it('extracts title from the leading bold phrase and notes from the remainder', () => {
    const [first] = parseBugs(MD);
    expect(first.title).toBe('A real bug with pipes in it');
    // escaped pipes inside the cell must survive splitting and render as literal ||
    expect(first.notes).toContain('x || y');
    expect(first.notes).not.toContain('**');
  });

  it('maps severity, splits Discovered into discoveredAt + discoveredOn, and Blocking to string', () => {
    const [first, second] = parseBugs(MD);
    expect(first.severity).toBe('high');
    expect(first.discoveredAt).toBe('2026-07-21');
    expect(first.discoveredOn).toBe('PR #176 security review');
    expect(first.blockingSprint).toBe('False');

    // no leading date → no discoveredAt key at all
    expect(second.severity).toBe('medium');
    expect(second).not.toHaveProperty('discoveredAt');
    expect(second.discoveredOn).toBe('PR #65 preview');
    expect(second.blockingSprint).toBe('False');
  });

  it('emits keys in the canonical order (discoveredAt only when present)', () => {
    const [first, second] = parseBugs(MD);
    expect(Object.keys(first)).toEqual([
      'title',
      'severity',
      'discoveredAt',
      'discoveredOn',
      'blockingSprint',
      'notes',
    ]);
    expect(Object.keys(second)).toEqual(['title', 'severity', 'discoveredOn', 'blockingSprint', 'notes']);
  });
});

// ── buildStatus (untouched-field preservation) ────────────────────────────────
describe('buildStatus', () => {
  it('replaces only the four derived fields and preserves everything else + key order', () => {
    const existing = makeExisting();
    const before = structuredClone(existing);
    const built = buildStatus(MD, existing);

    // top-level key order unchanged
    expect(Object.keys(built)).toEqual(Object.keys(existing));
    // untouched fields identical (deep)
    expect(built.sprint).toEqual(before.sprint);
    expect(built.phases).toEqual(before.phases);
    expect(built.tasks).toEqual(before.tasks);
    expect(built.backlog).toEqual(before.backlog);
    expect(built.security).toEqual(before.security);
    // input not mutated (immutability)
    expect(existing).toEqual(before);
    // four derived fields replaced
    expect(built.lastUpdated).toBe('2026-07-22');
    expect(built.lastUpdatedNote).toMatch(/Framework housecleaning/);
    expect(built.recentlyCompleted).toHaveLength(3);
    expect(built.bugs).toHaveLength(2);
    // never writes the client-derived `progress` field
    expect(built).not.toHaveProperty('progress');
  });
});

// ── serialize / EOL handling ──────────────────────────────────────────────────
describe('serialize + EOL detection', () => {
  it('detects CRLF vs LF and trailing newline', () => {
    expect(detectEol('a\r\nb\r\n')).toBe('\r\n');
    expect(detectEol('a\nb\n')).toBe('\n');
    expect(hasTrailingNewline('a\r\nb\r\n')).toBe(true);
    expect(hasTrailingNewline('a\nb')).toBe(false);
  });

  it('round-trips untouched fields byte-for-byte through LF serialize', () => {
    const existing = makeExisting();
    const raw = serialize(existing, { eol: '\n', trailingNewline: true });
    const built = buildStatus(MD, existing);
    const out = serialize(built, { eol: '\n', trailingNewline: true });

    // the sprint block text is identical in both serializations
    const sprintText = JSON.stringify(existing.sprint, null, 2);
    expect(raw.includes(sprintText.replace(/\n/g, '\n  '))).toBe(true);
    // parseable and stable
    expect(JSON.parse(out).sprint).toEqual(existing.sprint);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.includes('\r')).toBe(false);
  });

  it('emits CRLF when asked and honours trailing-newline flag', () => {
    const out = serialize({ a: 1 }, { eol: '\r\n', trailingNewline: true });
    expect(out).toBe('{\r\n  "a": 1\r\n}\r\n');
    const noNl = serialize({ a: 1 }, { eol: '\r\n', trailingNewline: false });
    expect(noNl).toBe('{\r\n  "a": 1\r\n}');
  });
});

// ── computeSync / --check logic ───────────────────────────────────────────────
describe('computeSync (--check core)', () => {
  it('reports NOT in sync against a stale file and lists the changed fields', () => {
    const existing = makeExisting();
    const rawStale = serialize(existing, { eol: '\n', trailingNewline: true });
    const { matches, changes } = computeSync(rawStale, MD);
    expect(matches).toBe(false);
    expect(changes.join(' ')).toMatch(/lastUpdated/);
    expect(changes.join(' ')).toMatch(/bugs/);
    expect(changes.join(' ')).toMatch(/recentlyCompleted/);
  });

  it('reports in sync once the file already equals generated output', () => {
    const existing = makeExisting();
    const synced = computeSync(serialize(existing, { eol: '\n', trailingNewline: true }), MD).generatedText;
    const { matches } = computeSync(synced, MD);
    expect(matches).toBe(true);
  });
});

describe('diffFields', () => {
  it('returns no changes when the four fields are identical', () => {
    const existing = makeExisting();
    const built = buildStatus(MD, existing);
    expect(diffFields(built, built)).toEqual([]);
  });
});

// ── CLI integration (exit codes + write) ──────────────────────────────────────
describe('CLI', () => {
  let dir;
  let mdPath;
  let jsonPath;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'status-sync-'));
    mdPath = join(dir, 'PROJECT_BACKLOG.md');
    jsonPath = join(dir, 'project-status.json');
    writeFileSync(mdPath, MD, 'utf8');
    writeFileSync(jsonPath, serialize(makeExisting(), { eol: '\n', trailingNewline: true }), 'utf8');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function runCli(args) {
    try {
      const stdout = execFileSync(
        process.execPath,
        [SCRIPT, `--backlog=${mdPath}`, `--status=${jsonPath}`, ...args],
        { encoding: 'utf8' }
      );
      return { code: 0, stdout };
    } catch (e) {
      return { code: e.status, stdout: (e.stdout || '') + (e.stderr || '') };
    }
  }

  it('--check exits 1 on a stale file, default writes it, then --check exits 0', () => {
    const stale = runCli(['--check']);
    expect(stale.code).toBe(1);

    const write = runCli([]);
    expect(write.code).toBe(0);
    const written = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(written.lastUpdated).toBe('2026-07-22');
    expect(written.bugs).toHaveLength(2);
    expect(written.sprint.goal).toBe('keep me exactly');

    const clean = runCli(['--check']);
    expect(clean.code).toBe(0);
  });

  it('exits 2 with a loud error when the header-note contract line is missing', () => {
    writeFileSync(mdPath, MD.replace(/Last updated:.*\n/, ''), 'utf8');
    const res = runCli(['--check']);
    expect(res.code).toBe(2);
    expect(res.stdout).toMatch(/Last updated: YYYY-MM-DD/);
  });
});
