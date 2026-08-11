import { describe, it, expect, vi } from 'vitest';

import {
  parseRemoteBranches,
  parseAheadCount,
  parseChangedFiles,
  parsePrList,
  daysSince,
  findStrandedBranches,
  run,
} from '../../scripts/check-stranded-branches.js';

// ── Parsers ──────────────────────────────────────────────────────────────────

describe('parseRemoteBranches', () => {
  it('parses name|date pairs and drops origin/HEAD + origin/master', () => {
    const raw = [
      'origin/HEAD|2026-08-01T00:00:00+00:00',
      'origin/master|2026-08-09T00:00:00+00:00',
      'origin/feature/queue-q9|2026-07-20T10:00:00+00:00',
      'origin/claude/sleepy-einstein-abc123|2026-08-05T14:30:00+00:00',
    ].join('\n');

    expect(parseRemoteBranches(raw)).toEqual([
      { name: 'origin/feature/queue-q9', lastCommitDate: '2026-07-20T10:00:00+00:00' },
      { name: 'origin/claude/sleepy-einstein-abc123', lastCommitDate: '2026-08-05T14:30:00+00:00' },
    ]);
  });

  it('ignores blank lines', () => {
    const raw = '\norigin/foo|2026-08-01T00:00:00+00:00\n\n';
    expect(parseRemoteBranches(raw)).toEqual([{ name: 'origin/foo', lastCommitDate: '2026-08-01T00:00:00+00:00' }]);
  });
});

describe('parseAheadCount', () => {
  it('parses a bare integer line', () => {
    expect(parseAheadCount('4\n')).toBe(4);
    expect(parseAheadCount('0')).toBe(0);
  });

  it('returns 0 for unparseable output', () => {
    expect(parseAheadCount('')).toBe(0);
    expect(parseAheadCount('not a number')).toBe(0);
  });
});

describe('parseChangedFiles', () => {
  it('splits lines and drops blanks', () => {
    const raw = 'functions/rewardsProcessor.js\npackage.json\n\n';
    expect(parseChangedFiles(raw)).toEqual(['functions/rewardsProcessor.js', 'package.json']);
  });
});

describe('parsePrList', () => {
  it('parses a gh json array', () => {
    expect(parsePrList('[{"number":229,"state":"OPEN"}]')).toEqual([{ number: 229, state: 'OPEN' }]);
  });

  it('returns [] for an empty array or non-array JSON', () => {
    expect(parsePrList('[]')).toEqual([]);
    expect(parsePrList('null')).toEqual([]);
  });
});

describe('daysSince', () => {
  it('computes fractional day age', () => {
    const now = new Date('2026-08-11T00:00:00Z');
    expect(daysSince('2026-08-09T00:00:00Z', now)).toBeCloseTo(2, 5);
    expect(daysSince('2026-08-10T12:00:00Z', now)).toBeCloseTo(0.5, 5);
  });
});

// ── Core detection ───────────────────────────────────────────────────────────

describe('findStrandedBranches', () => {
  it('flags a branch with commits ahead and no PR ever opened', () => {
    const branches = [{ name: 'origin/claude/orphan-scan', lastCommitDate: '2026-08-05T00:00:00Z' }];
    const result = findStrandedBranches(branches, {
      getAheadCount: () => 3,
      hasPrEverOpened: () => false,
      getChangedFiles: () => ['KNOWLEDGE BASE/PROJECT_BACKLOG.md'],
    });
    expect(result).toEqual([
      {
        name: 'origin/claude/orphan-scan',
        lastCommitDate: '2026-08-05T00:00:00Z',
        aheadCount: 3,
        files: ['KNOWLEDGE BASE/PROJECT_BACKLOG.md'],
      },
    ]);
  });

  it('does NOT flag a squash-merged branch that still shows ahead commits but has a PR on record', () => {
    // The exact false-positive class from LESSONS 2026-07-28: a squash-merged
    // branch is "unmerged" by git ancestry (aheadCount > 0) but its content
    // shipped via a real PR, so it must stay silent.
    const branches = [{ name: 'origin/feature/queue-q10', lastCommitDate: '2026-08-05T00:00:00Z' }];
    const result = findStrandedBranches(branches, {
      getAheadCount: () => 2,
      hasPrEverOpened: () => true, // merged PR #226 exists for this branch
      getChangedFiles: () => ['functions/index.js'],
    });
    expect(result).toEqual([]);
  });

  it('does NOT flag a branch with zero commits ahead of base regardless of PR state', () => {
    const branches = [{ name: 'origin/stale-noop', lastCommitDate: '2026-08-01T00:00:00Z' }];
    const hasPrEverOpened = vi.fn(() => false);
    const result = findStrandedBranches(branches, {
      getAheadCount: () => 0,
      hasPrEverOpened,
      getChangedFiles: () => [],
    });
    expect(result).toEqual([]);
    expect(hasPrEverOpened).not.toHaveBeenCalled(); // short-circuits before the PR lookup
  });

  it('evaluates each branch independently across a mixed set', () => {
    const branches = [
      { name: 'origin/a-stranded', lastCommitDate: '2026-08-01T00:00:00Z' },
      { name: 'origin/b-has-pr', lastCommitDate: '2026-08-01T00:00:00Z' },
      { name: 'origin/c-in-sync', lastCommitDate: '2026-08-01T00:00:00Z' },
    ];
    const aheadByBranch = { 'origin/a-stranded': 1, 'origin/b-has-pr': 5, 'origin/c-in-sync': 0 };
    const prByBranch = { 'origin/a-stranded': false, 'origin/b-has-pr': true, 'origin/c-in-sync': false };

    const result = findStrandedBranches(branches, {
      getAheadCount: name => aheadByBranch[name],
      hasPrEverOpened: name => prByBranch[name],
      getChangedFiles: () => ['x.js'],
    });

    expect(result.map(b => b.name)).toEqual(['origin/a-stranded']);
  });
});

// ── run() orchestration — exec is faked, no real git/gh spawned ─────────────

function makeFakeExec(responses) {
  return vi.fn((cmd, args) => {
    const key = `${cmd} ${args.join(' ')}`;
    for (const [pattern, output] of responses) {
      if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
        return output;
      }
    }
    throw new Error(`no fake response wired for: ${key}`);
  });
}

describe('run', () => {
  it('exits 0 and reports nothing when every ahead branch has a PR', () => {
    const exec = makeFakeExec([
      ['for-each-ref', 'origin/feature/x|2026-08-01T00:00:00Z'],
      [/rev-list/, '2\n'],
      [/gh pr list/, '[{"number":1,"state":"MERGED"}]'],
      [/diff --name-only/, 'a.js\n'],
    ]);
    const log = vi.fn();
    const errorLog = vi.fn();
    const code = run({ exec, log, errorLog, now: new Date('2026-08-11T00:00:00Z') });
    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('No stranded branches found'));
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('exits 1 when a stranded branch is older than the day threshold', () => {
    const exec = makeFakeExec([
      ['for-each-ref', 'origin/claude/orphan-scan|2026-08-01T00:00:00Z'],
      [/rev-list/, '3\n'],
      [/gh pr list/, '[]'],
      [/diff --name-only/, 'KNOWLEDGE BASE/PROJECT_BACKLOG.md\n'],
    ]);
    const log = vi.fn();
    const errorLog = vi.fn();
    const code = run({ exec, days: 2, log, errorLog, now: new Date('2026-08-11T00:00:00Z') });
    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('⚠ STALE'));
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('stranded branch(es) found'));
  });

  it('exits 0 (not 1) when a stranded branch exists but is within the grace period', () => {
    const exec = makeFakeExec([
      ['for-each-ref', 'origin/claude/brand-new|2026-08-10T12:00:00Z'],
      [/rev-list/, '1\n'],
      [/gh pr list/, '[]'],
      [/diff --name-only/, 'foo.js\n'],
    ]);
    const log = vi.fn();
    const errorLog = vi.fn();
    const code = run({ exec, days: 2, log, errorLog, now: new Date('2026-08-11T00:00:00Z') });
    expect(code).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('recent'));
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('exits 2 and reports the error when git fails', () => {
    const exec = vi.fn(() => {
      throw new Error('git not found');
    });
    const errorLog = vi.fn();
    const code = run({ exec, log: vi.fn(), errorLog });
    expect(code).toBe(2);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('ERROR (exit 2)'));
  });
});
