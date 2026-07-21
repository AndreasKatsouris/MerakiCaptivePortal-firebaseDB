# OWASP Top 10 (2021) Security Audit — 2026-07-05 (re-verification)

Scheduled routine scan. No sprint pivot — Sprint Goal (Hi-Fi v2 / ROSS) unaffected; findings logged per the Bug Triage Rule.

## Housekeeping note: two prior scans never reached the operator

This is the **third consecutive daily scheduled scan** (2026-07-02, 2026-07-04, 2026-07-05). The prior two ran on branches (`claude/sleepy-einstein-0tt4hc`, `claude/sleepy-einstein-jn7bjb`) that were **committed but never opened as a PR** — `origin/master` has not moved since `0a13892` (2026-06-16, CRIT-07 close), so none of the 2026-07-02 corrections (CRIT-06 downgrade, HIGH-08 likely-fixed, new `FoodCostApp.vue` v-html finding) or the 2026-07-04 findings (new Critical, two amplified findings) were ever visible in `PROJECT_BACKLOG.md`/`project-status.json` on a branch the operator would see. This scan **consolidates all three scans' findings into one PR** so they finally land. Flagged as a process gap below.

## Verification method

`git log origin/master --oneline` confirms zero commits since 2026-06-16 — the codebase is **byte-identical** to the state the 2026-07-04 scan audited. Rather than re-deriving a fresh 93-line report from scratch (which would just reproduce `docs/security/owasp-audit-2026-07-04.md`, recovered into this PR from the orphaned branch), this pass:

1. Independently re-read `database.rules.json` end-to-end and hand-verified the three headline 2026-07-04 findings directly (not by trusting the prior report):
   - **`whatsapp-numbers` / `location-whatsapp-mapping` (:325-344)** — confirmed collection-level `.write: "auth != null"` with a child `.validate` that only checks required fields exist (`hasChildren([...])`), never ownership. Cascade means the child `.write` ownership check is unreachable for existing records. **Critical, confirmed.**
   - **`salesData` / `forecasts` (:495-521)** — confirmed same pattern; child `.write` includes `data.child('userId').val() === auth.uid` but is moot once the collection `.write` grants access. **High (raised from Low), confirmed.**
   - **`locations` (:43-51)** — confirmed the child `.validate` only requires `newData.child('ownerId').val() === auth.uid`, which an attacker satisfies trivially by setting `ownerId` to their own uid when overwriting a victim's record. Blast radius (`salesDataIndex`, `forecastIndex`, `stockFlagAudit`, `stockFlagConfig`, `stockItemFlags`, `bookings` all key off `locations/{locId}/ownerId`) confirmed by grep.
2. ~~Re-ran `npm audit` (functions workspace) and confirmed `@grpc/grpc-js` **no longer appears** in the vulnerability list; `package-lock.json` pins it at `1.12.6`. Combined with the 2026-07-02 finding, **HIGH-08 is now formally closed**.~~ **⚠️ RETRACTED 2026-07-21 — this conclusion was WRONG. See the correction note below.** The `uuid`-chain moderate/high findings (via `@google-cloud/firestore`/`gaxios`/`google-gax`/`teeny-request`/`retry-request`) are unchanged and still blocked on the `firebase-admin@13` major upgrade.
3. Confirmed the `test-*.html` production-exposure finding: **21 files** matching `public/test-*.html` still present, `firebase.json`'s hosting `ignore` list still only excludes `firebase.json`/dotfiles/`node_modules` (no `test-*.html` entry), `scripts/build.js:22` still does an unfiltered `cpSync`.
4. Spot-checked no new merges landed anywhere that would touch audited surfaces (`git log origin/master --oneline --since=2026-06-16` → 0 commits). Two unrelated open PRs exist (#166 RTDB-rules-batch plan, #167 food-cost reader) — neither has merged, so neither changes today's live-code state.

## ⚠️ Correction (2026-07-21) — HIGH-08 was never closed

**This report's HIGH-08 closure was wrong, and so was the 2026-07-02 scan's. HIGH-08 remains OPEN.**

Both scans reasoned that a pinned `1.12.6` was "above the patched version." It is not. The advisory range for **both** GHSAs is **`>=1.12.0 <1.12.7`** — `1.12.6` is the *last vulnerable* release; the fix landed in `1.12.7`. Verified live on 2026-07-21 with `npm audit --json` in `functions/`:

```
"@grpc/grpc-js": { "severity": "high", "range": "1.12.0 - 1.12.6",
  "via": [ { "GHSA-5375-pq7m-f5r2": ">=1.12.0 <1.12.7" },
           { "GHSA-99f4-grh7-6pcq": ">=1.12.0 <1.12.7" } ],
  "fixAvailable": true, "effects": [] }
```

**How the error propagated:** the 2026-07-02 scan made the version misread; the 2026-07-05 scan "independently re-confirmed" it without re-checking the advisory range against the pinned version, then cited *two independent scans agreeing* as the strength of the evidence. Two passes of the same unverified inference are one data point, not two. **Process fix: a dependency-CVE closure must quote the advisory's fixed-in version and the installed version side by side — never a bare "npm audit no longer lists it."**

**Good news:** `fixAvailable: true` and `effects: []` mean npm predicts no dependent breakage, so a lockfile-only `npm audit fix` should clear it *without* the `firebase-admin@13` major. Tracked as its own remediation item.

## Status changes this scan

- ~~**HIGH-08 (`@grpc/grpc-js` DoS CVEs) → CLOSED.**~~ **RETRACTED — still open, see the correction above.**
- **CRIT-06 (Meraki validator hardcoded string) → severity confirmed downgraded to Low/Medium** per the 2026-07-02 finding and the original #161 review note. Still present in source (not fixed), just correctly characterized as a public handshake-echo string rather than a credential.
- Everything else from the 2026-06-15 audit, the 2026-05-30 audit's deferred items, and the 2026-07-04 audit's three new/amplified findings: **confirmed still open, no regressions, nothing new found this pass.**

## No new findings

This scan intentionally did not attempt a from-scratch full-surface sweep (the 2026-07-04 pass already did that days after the prior full sweep, and zero commits have landed since). Full re-derivation would be theater, not diligence, given a provably unchanged codebase. The next scan that should do a full fresh sweep is the first one to run **after** any of the open remediation PRs (or #166/#167) merge.

## Priority reminder (unchanged from 2026-07-04)

Ship the RTDB write-cascade family as **one coordinated PR** after a full writer census (CLAUDE.md step 5e): `scanningData`, `locations`, `queue`, `whatsapp-message-history`, `whatsapp-numbers`/`location-whatsapp-mapping` (new), `salesData`/`forecasts` (severity-raised). Plan doc `docs/plans/2026-06-17-owasp-rtdb-rules-batch-plan.md` (PR #166, open) already splits this into a lockable-now tier and a Bucket-C-needs-refactor tier — that plan should unblock the highest-value remediation once reviewed/merged.

Full finding detail: `docs/security/owasp-audit-2026-07-04.md` (recovered into this PR — previously only existed on an unmerged branch).
