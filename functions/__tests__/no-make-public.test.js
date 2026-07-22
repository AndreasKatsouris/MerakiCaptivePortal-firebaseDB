import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CRIT-09 forward guard (guard-first default, CLAUDE.md Step 11).
 *
 * `file.makePublic()` writes an `allUsers:READ` object ACL that is served by
 * GCS directly and BYPASSES Firebase Storage rules entirely — it made every
 * WhatsApp receipt image world-readable at an enumerable name for months while
 * `storage.rules` read as locked (LESSONS 2026-07-21 `gcs/public-acl-vs-rules`).
 * PR-B removed both call sites (receiptProcessor.js, receiptTemplateManager.js);
 * this scan keeps the class out. If you genuinely need a publicly fetchable
 * object, use a short-TTL signed URL (`file.getSignedUrl`) or a CF proxy —
 * never a public ACL. Spec: docs/plans/2026-07-22-crit09-receipts-remediation-design.md.
 */

const FUNCTIONS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '__tests__', 'coverage', '.git']);
// Every GCS public-grant pathway we know of (review F4). NOT covered and not
// coverable by a source scan: out-of-band bucket config (defaultObjectAcl,
// IAM console edits) — which is why the archival writes pin predefinedAcl:'private'.
const BANNED = [
    /\.makePublic\s*\(/, // object ACL grant helper (the original CRIT-09 vector)
    /predefinedAcl\s*:\s*['"`](publicRead|authenticatedRead)/i, // public/any-Google-account upload ACLs
    /\.acl\s*\.\s*add\s*\(/, // direct object-ACL entity grants (acl.add({entity:'allUsers',…}))
    /\.acl\s*\.\s*(readers|writers|owners)\s*\.\s*add/, // acl.readers.addAllUsers() family
    /\biam\s*\.\s*setPolicy\s*\(/, // bucket-IAM mutation — no legitimate use in this codebase
];

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

describe('CRIT-09 guard: no public-ACL object publication under functions/', () => {
    it('no source file calls makePublic() or uploads with a public ACL', () => {
        const files = walkJsFiles(FUNCTIONS_ROOT);
        expect(files.length).toBeGreaterThan(50); // the scan is actually scanning

        const offenders = [];
        for (const file of files) {
            const src = readFileSync(file, 'utf8');
            for (const pattern of BANNED) {
                if (pattern.test(src)) offenders.push(`${file} matches ${pattern}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
