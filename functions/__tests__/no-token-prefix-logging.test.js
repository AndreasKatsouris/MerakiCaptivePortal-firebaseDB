import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * L-2 forward guard (guard-first default, CLAUDE.md Step 11).
 *
 * `functions/index.js:3566` logged a 20-char bearer-token prefix
 * (`` `Bearer ${authHeader.substring(7, 27)}...` ``) despite being claimed
 * closed by #98 — reopened by the 2026-07-23 recovered-branch scan
 * (queue card Q10). A token prefix in logs is still a credential fragment;
 * log presence/absence only, never a substring/slice of the header or token.
 */

const FUNCTIONS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'coverage', '.git']);
const SLICE_CALL = /\.(substring|slice|substr)\s*\(/;
const TOKEN_LIKE = /\b(authHeader|Authorization|token|bearerToken|idToken|accessToken)\b/i;

function walkJsFiles(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry)) continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) walkJsFiles(full, out);
        else if (entry.endsWith('.js')) out.push(full);
    }
    return out;
}

describe('L-2 guard: no auth-token substring reaches a console.* call', () => {
    it('no source file logs a slice of authHeader/token via console.*', () => {
        const files = walkJsFiles(FUNCTIONS_ROOT);
        expect(files.length).toBeGreaterThan(50); // the scan is actually scanning

        const offenders = [];
        for (const file of files) {
            const lines = readFileSync(file, 'utf8').split('\n');
            lines.forEach((line, idx) => {
                if (/console\.\w+\(/.test(line) && SLICE_CALL.test(line) && TOKEN_LIKE.test(line)) {
                    offenders.push(`${file}:${idx + 1}: ${line.trim()}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });
});
