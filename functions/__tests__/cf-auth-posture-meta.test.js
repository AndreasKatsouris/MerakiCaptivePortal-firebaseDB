'use strict';

/**
 * CF auth-posture meta-guard — lesson #18 (auth-vs-authz, PRs #89/#91).
 *
 * Shape: (b) meta-test — parse the source of functions/index.js and assert that
 * each CF in the curated ADMIN_ONLY_CFS list contains a `requireAdmin` call in
 * its function body, BEFORE the business logic runs.
 *
 * WHY this shape over per-CF invocation:
 *   - Invoking CFs with firebase-functions-test requires a live Firebase project
 *     or a full emulator — too heavy for a fast unit suite.
 *   - Source-scan is cheap, deterministic, and reliable for a private internal
 *     helper that is ONLY called as an auth gate (no false-positive risk).
 *   - The scan looks for `requireAdmin(req, res)` inside the CF's export block,
 *     which is the actual pattern used consistently in this codebase.
 *
 * WHAT this guards:
 *   The ADMIN_ONLY_CFS list is the curated set of functions that MUST reject
 *   non-admin callers. If a future refactor removes or bypasses `requireAdmin`
 *   in any of these, this test fails — surfacing the regression before merge.
 *
 * SECURITY FINDING PROTOCOL:
 *   If a CF in this list does NOT call requireAdmin, the test failure is a
 *   security finding (auth-vs-authz class). DO NOT fix the CF here — report it
 *   to the operator. The test is intentionally failing-closed.
 *
 * Guard demotes the prose lesson to a code comment.
 * Template: functions/agent/__tests__/tools.test.js:128-153.
 */

const fs = require('fs');
const path = require('path');

// ── curated admin-only CF list ─────────────────────────────────────────────────
// Ground truth: verified by grep + manual read of functions/index.js on 2026-06-07.
// Each entry is the exports.NAME string as it appears in the source file.
// Add a CF here ONLY after confirming it calls requireAdmin in its body.
const ADMIN_ONLY_CFS = [
    'getGoogleConfig',          // billable GCP key
    'addGuestToQueue',          // queue mutator
    'removeGuestFromQueue',     // queue mutator
    'updateQueueEntryStatus',   // queue mutator
    'processQueueMessage',      // queue message
];

// ── source parsing ─────────────────────────────────────────────────────────────

const INDEX_JS = path.resolve(__dirname, '../index.js');

/** Extract the text of a named CF export block from the source. */
function extractCfBody(source, cfName) {
    // Find the start index of "exports.<cfName> =" in the source.
    const escapedName = cfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const startPattern = new RegExp(`exports\\.${escapedName}\\s*=`);
    const startMatch = startPattern.exec(source);
    if (!startMatch) return null;

    // From the start, find the next "exports.<word> =" that starts a new top-level export.
    // We use the position after the start match to slice the remainder.
    const afterStart = source.slice(startMatch.index);
    // Find the second occurrence of "exports." (the first is our CF, the second is the next one).
    const nextExportPattern = /exports\.\w+\s*=/g;
    nextExportPattern.exec(afterStart); // skip the first match (our CF)
    const nextMatch = nextExportPattern.exec(afterStart);

    if (nextMatch) {
        return afterStart.slice(0, nextMatch.index);
    }
    // No next export — take everything to end of file.
    return afterStart;
}

let indexSource;

beforeAll(() => {
    indexSource = fs.readFileSync(INDEX_JS, 'utf8');
});

describe('CF auth-posture meta-guard — curated admin-only CFs call requireAdmin', () => {
    describe('requireAdmin definition: index.js exports the helper used by gated CFs', () => {
        it('index.js defines the requireAdmin helper function', () => {
            expect(indexSource).toMatch(/async function requireAdmin\(req, res\)/);
        });

        it('requireAdmin checks the Firebase Auth custom claim (admin: true)', () => {
            expect(indexSource).toMatch(/decodedToken\.admin !== true/);
        });

        it('requireAdmin checks the RTDB admin-claims node (dual-factor)', () => {
            // Dual-factor: both the custom claim AND the RTDB record must agree.
            // A token-only gate (auth-vs-authz lesson) would skip this RTDB check.
            expect(indexSource).toMatch(/admin-claims\//);
        });

        it('requireAdmin returns 403 for non-admin callers', () => {
            expect(indexSource).toMatch(/status\(403\)/);
        });
    });

    describe('each admin-only CF in the curated list contains a requireAdmin call', () => {
        for (const cfName of ADMIN_ONLY_CFS) {
            it(`${cfName} → body contains requireAdmin(req, res)`, () => {
                const body = extractCfBody(indexSource, cfName);
                expect(body, `Could not locate exports.${cfName} in functions/index.js — has the CF been renamed or removed?`)
                    .not.toBeNull();
                expect(body, `SECURITY FINDING: exports.${cfName} does NOT call requireAdmin — non-admin authenticated callers can reach its business logic (auth-vs-authz class, lesson #18 / PRs #89/#91). Report to operator immediately; do NOT auto-fix here.`)
                    .toMatch(/requireAdmin\(req,\s*res\)/);
            });
        }
    });
});
