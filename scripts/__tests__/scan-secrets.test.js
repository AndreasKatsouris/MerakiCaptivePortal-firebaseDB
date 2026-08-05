/**
 * Guard for the 2026-08-05 Google API key abuse notification.
 *
 * Google flagged `public/js/config/firebase-config.js`. The follow-up scan found
 * the flagged key was the least of it: 12 further key-shaped literals sat in dead
 * test pages that were being DEPLOYED to production hosting (scripts/build.js
 * copies all of public/ into dist/), each paired with a fabricated
 * messagingSenderId/appId — so those pages could never have worked. The OWASP
 * audit of 2026-05-30 had already reported the duplicate-config problem as
 * finding H-3 and nothing was done, because the finding lived in prose.
 *
 * This test is the mechanization of that finding (CLAUDE.md guard-first default).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scanner = path.join(rootDir, 'scripts/scan-secrets.js');

function runScanner() {
  try {
    return { code: 0, out: execFileSync('node', [scanner], { cwd: rootDir, encoding: 'utf8' }) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('secret scan', () => {
  it('passes on the current tree', () => {
    const { code, out } = runScanner();
    expect(out).toContain('secret scan clean');
    expect(code).toBe(0);
  });

  it('allows the Firebase web API key in the shared config module only', () => {
    // The web API key is public by design and MUST stay readable here — this
    // asserts the allowlist is real, so nobody "fixes" the notification by
    // moving the key to an env var and shipping it in the bundle anyway.
    const config = readFileSync(path.join(rootDir, 'public/js/config/firebase-config.js'), 'utf8');
    expect(config).toMatch(/AIzaSy[A-Za-z0-9_-]{33}/);
  });

  it('finds no Firebase config literal outside the shared module', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: rootDir, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.html') || f.endsWith('.vue'));

    const offenders = tracked.filter((f) => {
      const text = readFileSync(path.join(rootDir, f), 'utf8');
      return /AIzaSy[A-Za-z0-9_-]{33}/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it('tracks no database export', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: rootDir, encoding: 'utf8' }).split('\n');
    expect(tracked.filter((f) => /-default-rtdb\.json$/.test(f))).toEqual([]);
  });
});
