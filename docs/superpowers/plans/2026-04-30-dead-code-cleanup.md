# Dead Code & File Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ~160 dead files, orphan HTML pages, unused JS modules, orphan Cloud Functions, and unused npm dependencies from the Sparks Hospitality codebase, in 5 sequenced PRs with build + smoke-test gates between each.

**Architecture:** Delete in waves, lowest-risk first. Each wave is its own feature branch + worktree + PR. The user merges between waves so we can rebase the next wave on a clean master and catch any regressions before piling on more deletions. No batch deletes touch shared-state files (`firebase.json`, `database.rules.json`, `vite.config.js`) without an explicit grep-verification step. Chart.js retirement (Tier 6) is deliberately deferred — soak ends ~2026-05-07.

**Tech Stack:** git worktrees, `gh pr create`, `npm run build` (Vite 6), Firebase Hosting preview channels for any wave that touches HTML.

**Source survey:** Inventory was produced by `refactor-cleaner` agent on 2026-04-30, persisted in conversation history. Categories referenced as Tier 1–7 below match that inventory.

**Pre-flight rule:** Before deleting any file, run `git grep -l "<filename>"` from repo root. If hits exist outside the file itself, downgrade to "investigate" — do NOT delete blindly.

---

## Wave 0: Prep

### Task 0.1: Confirm clean working tree

**Files:** none

- [ ] **Step 1: Verify master is clean and up to date**

Run:
```bash
git checkout master
git pull origin master
git status
```
Expected: `working tree clean`, branch up to date with `origin/master`.

- [ ] **Step 2: Confirm PR #14 status**

Run:
```bash
gh pr view 14 --json state,mergedAt
```
Expected: still OPEN — its worktree (`.worktrees/fix-flagtagmodal-itemkey`) must NOT be deleted in Wave A. If it has merged, it CAN be cleaned up.

- [ ] **Step 3: Snapshot repo size for before/after comparison**

Run:
```bash
du -sh . --exclude=node_modules --exclude=.git --exclude=dist > /tmp/cleanup-size-before.txt
cat /tmp/cleanup-size-before.txt
```
Expected: a single size line. Save the number — Wave A alone should drop ~62 MB.

---

## Wave A: Stale artifacts (Tier 1)

**Risk:** Near-zero. All targets are .bak files, dated scratch folders, untracked zips, top-level RTDB dumps, and merged-PR worktrees. No source code touched.

### Task A.1: Create branch + worktree

**Files:** none

- [ ] **Step 1: Create worktree**

Run:
```bash
git worktree add .worktrees/cleanup-stale-artifacts -b chore/cleanup-stale-artifacts master
cd .worktrees/cleanup-stale-artifacts
```
Expected: new worktree created, branch `chore/cleanup-stale-artifacts` checked out.

### Task A.2: Delete top-level stale artifacts

**Files (delete):**
- `Sparks Hospitality-handoff.zip`
- `merakicaptiveportal-firebasedb-default-rtdb.json` (62 MB RTDB dump)
- `check-admin-users.cjs`
- `check-test-users.cjs`
- `security-remediation-prompt.md`
- `app_spec.txt`

- [ ] **Step 1: Confirm none are referenced**

Run:
```bash
for f in "Sparks Hospitality-handoff.zip" "merakicaptiveportal-firebasedb-default-rtdb.json" "check-admin-users.cjs" "check-test-users.cjs" "security-remediation-prompt.md" "app_spec.txt"; do
  echo "=== $f ==="
  git grep -l "$(basename "$f")" -- ':!documents' ':!KNOWLEDGE BASE' ':!*.md' || echo "  no refs"
done
```
Expected: each prints "no refs" (or only self-references). If any production file references one, STOP and investigate.

- [ ] **Step 2: Delete files**

Run:
```bash
git rm "Sparks Hospitality-handoff.zip" "merakicaptiveportal-firebasedb-default-rtdb.json" "check-admin-users.cjs" "check-test-users.cjs" "security-remediation-prompt.md" "app_spec.txt"
```
Expected: 6 files staged for deletion.

- [ ] **Step 3: Commit**

Run:
```bash
git commit -m "chore: remove top-level stale artifacts (RTDB dump, scratch probes, legacy spec)"
```

### Task A.3: Move or delete top-level seeding scripts

**Files:**
- `seed-subscription-tiers.js` → move to `scripts/seed-subscription-tiers.js`
- `subscription-tiers-import.json` → move to `scripts/subscription-tiers-import.json`

- [ ] **Step 1: Check if either is currently invoked**

Run:
```bash
git grep -l "seed-subscription-tiers" -- 'package.json' 'firebase.json' '.github/'
```
Expected: prints either `package.json` (if it's an npm script) or nothing. Note the result.

- [ ] **Step 2: Move them**

Run:
```bash
git mv seed-subscription-tiers.js scripts/seed-subscription-tiers.js
git mv subscription-tiers-import.json scripts/subscription-tiers-import.json
```

- [ ] **Step 3: Patch any reference**

If Step 1 found an `npm run` script entry, edit `package.json` to update the path. Otherwise skip.

- [ ] **Step 4: Commit**

Run:
```bash
git commit -m "chore: relocate top-level seed scripts under scripts/"
```

### Task A.4: Delete `.bak` and backup folders

**Files (delete):**
- `public/js/auth/admin-claims-bak.js`
- `public/backup/` (whole directory)
- `fixes/29112025/` (whole directory)

- [ ] **Step 1: Confirm `admin-claims-bak.js` has no imports**

Run:
```bash
git grep -l "admin-claims-bak" -- 'public/' 'functions/'
```
Expected: no output (or only the file itself).

- [ ] **Step 2: Confirm `public/backup/` files have no inbound refs**

Run:
```bash
git grep -l "food-cost-refactored-test\|food-cost-test\|food-cost-refactored\.js" -- 'public/' 'functions/' ':!public/backup'
```
Expected: no output. (The orphan `public/js/food-cost-standalone.js` is referenced from inside `public/backup/`, so deleting the backup dir alone is safe.)

- [ ] **Step 3: Delete**

Run:
```bash
git rm public/js/auth/admin-claims-bak.js
git rm -r public/backup
git rm -r fixes/29112025
```

- [ ] **Step 4: Commit**

Run:
```bash
git commit -m "chore: delete backup directories and .bak files"
```

### Task A.5: Delete scratch notes inside `public/js/`

**Files (delete):**
- `public/js/31012025 - new features.txt`
- `public/js/NEW FEATURE CHECKLIST.TXT`

- [ ] **Step 1: Delete**

Run:
```bash
git rm "public/js/31012025 - new features.txt" "public/js/NEW FEATURE CHECKLIST.TXT"
```

- [ ] **Step 2: Commit**

Run:
```bash
git commit -m "chore: delete scratch notes from public/js"
```

### Task A.6: Verify build + open PR

- [ ] **Step 1: Run build**

Run:
```bash
npm run build
```
Expected: build succeeds. Vite output should show same entries as before (Wave A removed no JS that the build references).

- [ ] **Step 2: Push and open PR**

Run:
```bash
git push -u origin chore/cleanup-stale-artifacts
gh pr create --title "chore: cleanup wave A — stale artifacts" --body "$(cat <<'EOF'
## Summary
Wave A of dead-code cleanup (see `docs/superpowers/plans/2026-04-30-dead-code-cleanup.md`). Removes truly stale top-level artifacts and backup folders. No source code touched.

Notable: deletes a 62 MB RTDB dump committed to the repo (`merakicaptiveportal-firebasedb-default-rtdb.json`).

## Test plan
- [x] `npm run build` passes
- [ ] Repo size dropped by ~62 MB
- [ ] No production file references any deleted path

## Files removed
- 6 top-level stale artifacts (zips, RTDB dump, scratch probes, legacy spec)
- `public/js/auth/admin-claims-bak.js`
- `public/backup/` (3 files)
- `fixes/29112025/`
- 2 scratch text files in `public/js/`

## Files moved
- `seed-subscription-tiers.js` → `scripts/`
- `subscription-tiers-import.json` → `scripts/`
EOF
)"
```

- [ ] **Step 3: Wait for user to merge before starting Wave B**

User merges. Then:
```bash
cd ../..
git checkout master
git pull origin master
git worktree remove .worktrees/cleanup-stale-artifacts
git branch -d chore/cleanup-stale-artifacts
```

---

## Wave B: Orphan worktrees + Cloud Functions (Tier 1 + Tier 4)

**Risk:** Very low. Worktrees are local-only. Cloud Functions targets are confirmed orphans (no `require()` from `index.js`).

### Task B.1: Create branch + worktree

- [ ] **Step 1: Create worktree**

Run:
```bash
git worktree add .worktrees/cleanup-functions-and-worktrees -b chore/cleanup-functions-and-worktrees master
cd .worktrees/cleanup-functions-and-worktrees
```

### Task B.2: Remove leftover local worktrees

**Note:** This task does NOT modify any tracked file. Run from the main repo root, not the new worktree.

- [ ] **Step 1: Re-check PR #14 still open**

Run from main repo:
```bash
gh pr view 14 --json state
```
If state is `MERGED` or `CLOSED`, add `.worktrees/fix-flagtagmodal-itemkey` to the removal list. Otherwise leave it.

- [ ] **Step 2: Remove merged-branch worktrees**

Run from main repo (`C:\dev\MerakiCaptivePortal-firebaseDB`):
```bash
git worktree remove .worktrees/index-hifi
git worktree remove .worktrees/ross-fields
git worktree remove .worktrees/ross-loc-index
git worktree remove .worktrees/whatsapp-rebase
git worktree list
```
Expected: list shows main + cleanup worktree only (plus PR #14's if still open).

- [ ] **Step 3: Delete the corresponding local branches**

Run:
```bash
git branch -D index-hifi 2>/dev/null
git branch -D ross-fields 2>/dev/null
git branch -D ross-loc-index 2>/dev/null
git branch -D whatsapp-rebase 2>/dev/null
git branch -d feature/ross-fields-and-kb feature/ross-location-index 2>/dev/null
```
(Some may not exist locally — `2>/dev/null` swallows the error.)

### Task B.3: Delete orphan Cloud Functions files

**Files (delete) — switch back to the cleanup worktree:**
- `functions/debug-mappings.js`
- `functions/fix-guest-names.js`
- `functions/manual-database-repair.js`
- `functions/repair-location-mapping.js`
- `functions/register-compliance-feature.js`

- [ ] **Step 1: Verify no `require()` of any target**

Run from cleanup worktree:
```bash
for f in debug-mappings fix-guest-names manual-database-repair repair-location-mapping register-compliance-feature; do
  echo "=== $f ==="
  git grep -nE "require\(['\"]\\./(${f})['\"]\)" -- 'functions/' || echo "  no require"
done
```
Expected: each prints "no require". If any has a require, STOP and investigate.

- [ ] **Step 2: Verify no dynamic loader pattern**

Run:
```bash
git grep -nE "require\(.*\\\$\\{|require\\(.+\\+|readdirSync.*functions" -- 'functions/' | head
```
Expected: empty or unrelated. (Sanity check that `index.js` doesn't loop-load files in the dir.)

- [ ] **Step 3: Delete files**

Run:
```bash
git rm functions/debug-mappings.js functions/fix-guest-names.js functions/manual-database-repair.js functions/repair-location-mapping.js functions/register-compliance-feature.js
```

- [ ] **Step 4: Verify functions still parses**

Run:
```bash
cd functions && node -e "require('./index.js')" && cd ..
```
Expected: no parse error. (Note: this loads the module, so it requires `node_modules` to exist in `functions/`. If it errors on missing modules, that's pre-existing — what we want is no `Cannot find module './debug-mappings'` style error.)

- [ ] **Step 5: Commit**

Run:
```bash
git commit -m "chore: remove orphan Cloud Functions files (no inbound require)"
```

### Task B.4: Decide on duplicate `remoteconfig.template.json`

**Files:** `functions/remoteconfig.template.json` vs root `remoteconfig.template.json`

- [ ] **Step 1: Diff them**

Run:
```bash
diff remoteconfig.template.json functions/remoteconfig.template.json && echo "IDENTICAL" || echo "DIFFER"
```

- [ ] **Step 2: Find which `firebase.json` references**

Run:
```bash
git grep -n "remoteconfig.template" -- 'firebase.json' '*.json' '*.js'
```
Expected: identifies the canonical path.

- [ ] **Step 3: Delete the non-canonical copy**

If identical AND `firebase.json` references the root copy: `git rm functions/remoteconfig.template.json`. If they differ, downgrade to "investigate" and skip this step — leave a follow-up note.

- [ ] **Step 4: Commit (only if Step 3 deleted something)**

Run:
```bash
git commit -m "chore: remove duplicate remoteconfig.template.json"
```

### Task B.5: Build + PR

- [ ] **Step 1: Build**

Run:
```bash
npm run build
```
Expected: passes.

- [ ] **Step 2: Push and open PR**

Run:
```bash
git push -u origin chore/cleanup-functions-and-worktrees
gh pr create --title "chore: cleanup wave B — orphan Cloud Functions" --body "$(cat <<'EOF'
## Summary
Wave B of dead-code cleanup. Removes 5 orphan files in `functions/` (no `require()` anywhere in the function tree) and (optionally) deduplicates `remoteconfig.template.json`.

Local worktrees from already-merged PRs (`index-hifi`, `ross-fields`, `ross-loc-index`, `whatsapp-rebase`) were also pruned — that change is local-only, not part of this PR.

## Test plan
- [x] `npm run build` passes
- [x] No `require('./<deleted-file>')` exists in `functions/`
- [ ] Cloud Functions deploy still succeeds (verified by user, post-merge)

## Files removed
- `functions/debug-mappings.js`
- `functions/fix-guest-names.js`
- `functions/manual-database-repair.js`
- `functions/repair-location-mapping.js`
- `functions/register-compliance-feature.js`
- (optional) `functions/remoteconfig.template.json` (duplicate)
EOF
)"
```

- [ ] **Step 3: Wait for merge, clean up worktree**

After merge:
```bash
cd ../..
git checkout master
git pull origin master
git worktree remove .worktrees/cleanup-functions-and-worktrees
git branch -d chore/cleanup-functions-and-worktrees
```

---

## Wave C: Orphan HTML pages (Tier 2)

**Risk:** Low–medium. ~92 HTML pages targeted. The risk is that one of the "test" pages is actually used as a hidden admin tool. Mitigated by mandatory grep-verification per page batch.

### Task C.1: Create branch + worktree

- [ ] **Step 1: Create worktree**

Run:
```bash
git worktree add .worktrees/cleanup-orphan-html -b chore/cleanup-orphan-html master
cd .worktrees/cleanup-orphan-html
```

### Task C.2: Verify no references from production entry points

**Production entry points (must be queried):**
- `public/admin-dashboard.html`
- `public/user-dashboard.html`
- `public/index.html` and `public/index-v2.html`
- `public/ross.html`
- `public/admin-dashboard.js`
- `public/js/admin-dashboard.js`
- `firebase.json`
- `vite.config.js`
- `scripts/build.js`

- [ ] **Step 1: List candidate files into a tracking var**

Run:
```bash
ls public/test-*.html public/debug-*.html public/plan.md public/module-placeholder.html 2>/dev/null > /tmp/wave-c-toplevel.txt
ls -1 public/tools/dev/*.html public/tools/archive/*.html >> /tmp/wave-c-toplevel.txt 2>/dev/null
wc -l /tmp/wave-c-toplevel.txt
```
Expected: ~90+ lines.

- [ ] **Step 2: Grep each candidate name against production entry points**

Run:
```bash
hits=0
while read f; do
  base=$(basename "$f")
  if git grep -l "$base" -- 'public/admin-dashboard.html' 'public/user-dashboard.html' 'public/index.html' 'public/index-v2.html' 'public/ross.html' 'public/js/admin-dashboard.js' 'public/admin-dashboard.js' 'firebase.json' 'vite.config.js' 'scripts/build.js' >/dev/null 2>&1; then
    echo "REF: $f"
    hits=$((hits+1))
  fi
done < /tmp/wave-c-toplevel.txt
echo "Total referenced: $hits"
```
Expected: `Total referenced: 0`. Any file with a hit is moved to "investigate" and excluded from Wave C — log it in the PR description as "deferred to Wave D".

### Task C.3: Delete top-level orphan test/debug pages

**Files (delete):** all `public/test-*.html`, `public/debug-*.html`, `public/plan.md`, `public/module-placeholder.html` that survived Task C.2.

- [ ] **Step 1: Delete top-level pages**

Run:
```bash
git rm public/test-*.html public/debug-*.html public/plan.md public/module-placeholder.html 2>/dev/null
```

- [ ] **Step 2: Commit**

Run:
```bash
git commit -m "chore: delete orphan test/debug HTML pages from public/"
```

### Task C.4: Delete `public/tools/dev/` and `public/tools/archive/`

- [ ] **Step 1: Read both READMEs to confirm self-described status**

Run:
```bash
head -40 public/tools/dev/README.md
echo "---"
head -40 public/tools/archive/README.md
```
Expected: both say something like "dev-only" / "archive of deprecated …". If either claims an active production role, STOP.

- [ ] **Step 2: Delete both directories**

Run:
```bash
git rm -r public/tools/dev public/tools/archive
```

- [ ] **Step 3: Commit**

Run:
```bash
git commit -m "chore: delete public/tools/dev and public/tools/archive (self-described dead surfaces)"
```

### Task C.5: Decide on `public/admin_tools/enhanced-user-subscription-manager.html`

**Files:** `public/admin_tools/enhanced-user-subscription-manager.html`

- [ ] **Step 1: Compare with the Vue parallel impl**

Run:
```bash
ls public/js/modules/access-control/admin/
git grep -l "enhanced-user-subscription-manager" -- 'public/' 'functions/' 'firebase.json'
```
Expected: identifies whether the standalone HTML still has any inbound link.

- [ ] **Step 2: If no refs found, delete**

Run:
```bash
git rm public/admin_tools/enhanced-user-subscription-manager.html
git commit -m "chore: delete legacy enhanced-user-subscription-manager.html (superseded by access-control admin module)"
```

If refs exist, skip — log as "Wave D investigation".

### Task C.6: Build + smoke test + PR

- [ ] **Step 1: Build**

Run:
```bash
npm run build
```
Expected: passes.

- [ ] **Step 2: Deploy to preview channel**

Run:
```bash
firebase hosting:channel:deploy cleanup-wave-c --expires 3d
```
Expected: preview URL returned. Save it.

- [ ] **Step 3: Manual smoke test on preview URL**

Click through:
- [ ] Admin dashboard loads, all sections accessible from sidebar
- [ ] User dashboard loads
- [ ] ROSS home (`/ross.html`) loads
- [ ] At least one v2 page loads (`/food-cost-v2.html`)
- [ ] Login flow (`/admin-login.html`) works

If any 404s or breakage, identify which deletion caused it and revert that specific file.

- [ ] **Step 4: Push and open PR**

Run:
```bash
git push -u origin chore/cleanup-orphan-html
gh pr create --title "chore: cleanup wave C — orphan HTML (~90 files)" --body "$(cat <<'EOF'
## Summary
Wave C of dead-code cleanup. Removes ~90 orphan HTML files: top-level test/debug pages, the entirety of `public/tools/dev/` (52 files, self-described dev-only), and `public/tools/archive/` (15 files, self-described archive).

## Pre-deletion verification
- `git grep` against all production entry points (`admin-dashboard.html`, `user-dashboard.html`, `index.html`, `index-v2.html`, `ross.html`, admin/user dashboard JS, `firebase.json`, `vite.config.js`, `scripts/build.js`) returned zero hits for any deleted page.
- Both `tools/dev/README.md` and `tools/archive/README.md` self-describe as dead.

## Test plan
- [x] `npm run build` passes
- [x] Manual smoke test on preview channel: admin dashboard, user dashboard, ross home, food-cost-v2, admin-login all load
- [x] No 404s in network tab on any tested page

Preview: <fill in after deploy>
EOF
)"
```

- [ ] **Step 5: Wait for merge, clean up**

After merge:
```bash
cd ../..
git checkout master
git pull origin master
git worktree remove .worktrees/cleanup-orphan-html
git branch -d chore/cleanup-orphan-html
```

---

## Wave D: Unused JS modules (Tier 3 + parts of Tier 7)

**Risk:** Medium. Some targets have ambiguous loaders (script tags, dynamic imports). Each file gets individual verification.

### Task D.1: Create branch + worktree

- [ ] **Step 1: Create worktree**

Run:
```bash
git worktree add .worktrees/cleanup-unused-js -b chore/cleanup-unused-js master
cd .worktrees/cleanup-unused-js
```

### Task D.2: Delete `public/js/food-cost-standalone.js`

- [ ] **Step 1: Verify no remaining refs (Wave A removed `public/backup/` which referenced it)**

Run:
```bash
git grep -l "food-cost-standalone" -- 'public/'
```
Expected: empty.

- [ ] **Step 2: Delete + commit**

Run:
```bash
git rm public/js/food-cost-standalone.js
git commit -m "chore: delete public/js/food-cost-standalone.js (only consumer was deleted backup HTML)"
```

### Task D.3: Investigate + delete `googleReviews.js` + `googleAPIclient.js`

- [ ] **Step 1: Grep for any HTML or JS that loads them**

Run:
```bash
git grep -l "googleReviews\|googleAPIclient" -- 'public/' ':!public/js/googleReviews.js' ':!public/js/googleAPIclient.js' ':!*.md'
```
Expected: empty (or only references inside KB docs).

- [ ] **Step 2: If empty, delete + commit**

Run:
```bash
git rm public/js/googleReviews.js public/js/googleAPIclient.js
git commit -m "chore: delete unused Google Reviews scripts (no inbound refs)"
```

If non-empty, log as "needs investigation" and skip.

### Task D.4: Investigate `GuestAnalytics.js`

- [ ] **Step 1: Grep for `<script>` tag and dynamic `import`**

Run:
```bash
git grep -nE "GuestAnalytics|guest-analytics" -- 'public/' ':!*.md'
```
Expected: identifies who references it. Note: `guest-management.js` is reported to reference `window.GuestAnalytics`. Find which HTML loads `GuestAnalytics.js`.

- [ ] **Step 2: If no `<script>` tag in any HTML, delete + commit**

Run (only if confirmed orphan):
```bash
git rm public/js/GuestAnalytics.js
git commit -m "chore: delete public/js/GuestAnalytics.js (no script tag loads it; window.GuestAnalytics never bound)"
```

If a `<script>` tag exists, leave it and log as "live but unloaded — investigate why" for follow-up.

### Task D.5: Investigate remaining single-file orphans

For each of:
- `public/js/textParsingStrategies.js`
- `public/js/firebase-init-check.js`
- `public/js/jquery-3.2.1.min.js`
- `public/js/intlTelInput.min.js`

- [ ] **Step 1: Grep**

Run (substituting filename):
```bash
git grep -l "textParsingStrategies" -- 'public/' ':!*.md'
git grep -l "firebase-init-check" -- 'public/'
git grep -l "jquery-3.2.1\|jquery.min\|jQuery" -- 'public/' ':!public/js/jquery*' | head
git grep -l "intlTelInput" -- 'public/' ':!public/js/intlTelInput*'
```

- [ ] **Step 2: For each with empty grep, delete + commit individually**

Run (one commit per file, replace `<f>` with the actual path):
```bash
git rm <f>
git commit -m "chore: delete orphan <basename> (no inbound refs)"
```

If any has refs, leave it and note for follow-up.

### Task D.6: Decide on duplicate Bootstrap copies

**Files:** `public/js/bootstrap.bundle.min.js`, `public/js/bootstrap.min.js`, npm `bootstrap` package

- [ ] **Step 1: Identify which is loaded**

Run:
```bash
git grep -nE "bootstrap\.(min|bundle\.min)\.js" -- 'public/'
```
Expected: identifies which HTML pages use which file. There may be both.

- [ ] **Step 2: Identify if npm `bootstrap` is imported**

Run:
```bash
git grep -nE "from ['\"]bootstrap['\"]|require\(['\"]bootstrap['\"]\)" -- 'public/' 'src/' 'scripts/'
```

- [ ] **Step 3: Decide and act**

Three possible outcomes:
1. **Vendored copy is canonical:** delete unused vendored variant + remove npm `bootstrap` from `package.json`. Defer the npm change to Wave E.
2. **npm copy is canonical:** delete BOTH vendored files. Defer the change.
3. **Mixed:** consolidate to one path. This is a non-trivial decision — log as a follow-up plan, do NOT do it inside Wave D.

If outcome 1 or 2, perform the deletion of the now-clearly-unused file:
```bash
git rm public/js/bootstrap.<unused>.js
git commit -m "chore: delete unused vendored Bootstrap copy"
```

If outcome 3, skip Task D.6 entirely.

### Task D.7: Investigate food-cost duplicates

**Files (do NOT delete blindly):**
- `public/js/modules/food-cost/database-operations.js` vs `database-operations-v2.js`
- `public/js/modules/food-cost/order-calculator.js` vs `order-calculator-advanced.js` vs `order-calculator-calculus.js`
- `public/js/modules/food-cost/food-cost-with-guard.js`

- [ ] **Step 1: For each pair, find the importer**

Run:
```bash
git grep -nE "database-operations(-v2)?" -- 'public/js/modules/food-cost/' | grep -v "^public/js/modules/food-cost/database-operations"
git grep -nE "order-calculator(-advanced|-calculus)?" -- 'public/js/modules/food-cost/' | grep -v "^public/js/modules/food-cost/order-calculator"
git grep -l "food-cost-with-guard" -- 'public/'
```

- [ ] **Step 2: Document findings, do NOT delete in this wave**

Append findings as a comment block in the PR body. Food-cost is the most active module — deletions here need a smoke test of the full upload + flag + save flow, which is too much for this wave.

### Task D.8: Build + smoke test + PR

- [ ] **Step 1: Build**

Run:
```bash
npm run build
```

- [ ] **Step 2: Preview deploy**

Run:
```bash
firebase hosting:channel:deploy cleanup-wave-d --expires 3d
```

- [ ] **Step 3: Smoke test (focus on touched modules)**

- [ ] Admin dashboard loads
- [ ] User dashboard loads
- [ ] Guest management section opens (relevant if `GuestAnalytics.js` was deleted)
- [ ] Phone-input fields work (relevant if `intlTelInput` was deleted)
- [ ] Any page using Bootstrap (most of them) renders correctly

- [ ] **Step 4: Push + PR**

Run:
```bash
git push -u origin chore/cleanup-unused-js
gh pr create --title "chore: cleanup wave D — orphan JS modules" --body "$(cat <<'EOF'
## Summary
Wave D of dead-code cleanup. Removes orphan JS modules in `public/js/` after individual grep-verification per file. Food-cost duplicates are investigated but NOT deleted in this wave (need module-specific smoke test).

## Files deleted
(filled in based on which Task D.* steps confirmed orphan status)

## Files investigated, NOT deleted
- `public/js/modules/food-cost/database-operations-v2.js`
- `public/js/modules/food-cost/order-calculator-advanced.js`, `order-calculator-calculus.js`
- `public/js/modules/food-cost/food-cost-with-guard.js`

## Test plan
- [x] `npm run build` passes
- [x] Smoke test on preview: admin dashboard, user dashboard, guest management, phone inputs

Preview: <fill in>
EOF
)"
```

- [ ] **Step 5: Wait for merge, clean up worktree**

---

## Wave E: npm dependency cleanup (Tier 5)

**Risk:** Medium-high. Removing a dep that's actually used (CDN-via-script-tag is a common pattern in this repo) breaks production. Done last so all preceding cleanups have already run.

### Task E.1: Create branch + worktree

- [ ] **Step 1: Create worktree**

Run:
```bash
git worktree add .worktrees/cleanup-deps -b chore/cleanup-npm-deps master
cd .worktrees/cleanup-deps
```

### Task E.2: Remove deps that belong only in `functions/`

**Targets in root `package.json`:**
- `firebase-functions`
- `express`
- `@google-cloud/vision`
- `twilio`

- [ ] **Step 1: Confirm none are imported from `public/` or `src/` or `scripts/`**

Run:
```bash
for pkg in firebase-functions express @google-cloud/vision twilio; do
  echo "=== $pkg ==="
  git grep -nE "from ['\"]${pkg}['\"]|require\(['\"]${pkg}['\"]\)" -- 'public/' 'src/' 'scripts/' 'vite.config.js' || echo "  not used"
done
```
Expected: each prints "not used".

- [ ] **Step 2: Remove from root `package.json`**

Run:
```bash
npm uninstall firebase-functions express @google-cloud/vision twilio
```

- [ ] **Step 3: Build**

Run:
```bash
npm run build
```
Expected: passes.

- [ ] **Step 4: Commit**

Run:
```bash
git add package.json package-lock.json
git commit -m "chore: remove functions-only deps from root package.json"
```

### Task E.3: Investigate React / Vue scaffolding deps

**Targets:**
- `react`, `react-dom`, `lucide-react`
- `class-variance-authority`, `clsx`
- `@types/google.maps`
- `@fortawesome/fontawesome-free`

- [ ] **Step 1: Grep usage**

Run (per-package):
```bash
for pkg in react react-dom lucide-react class-variance-authority clsx; do
  echo "=== $pkg ==="
  git grep -lE "from ['\"]${pkg}|require\(['\"]${pkg}" -- 'public/' 'src/' 'scripts/' 'vite.config.js' || echo "  not used"
done
```

- [ ] **Step 2: For each "not used" result, uninstall**

Run individually (one commit per logical group):
```bash
npm uninstall <pkg>
npm run build
git add package.json package-lock.json
git commit -m "chore: remove unused dep <pkg>"
```

If any package IS used, leave it.

### Task E.4: Investigate vendored vs npm Bootstrap

(Continuation of Task D.6 if it produced a clear answer.)

- [ ] **Step 1: If npm `bootstrap` is unused, uninstall + commit**

Run (only if Task D.6 outcome 1 confirmed vendored is canonical):
```bash
npm uninstall bootstrap
npm run build
git add package.json package-lock.json
git commit -m "chore: remove unused npm bootstrap (vendored copy is canonical)"
```

### Task E.5: Investigate Tailwind v2 broken script

**Files:** `package.json` script `build-css-v2`, `postcss-v2.config.js`, `tailwind-v2.config.js`

- [ ] **Step 1: Verify the script targets a non-existent path**

Run:
```bash
grep "build-css-v2" package.json
ls postcss-v2.config.js tailwind-v2.config.js 2>/dev/null
ls public/css/dashboard-v2.css PUBLIC/css/dashboard-v2.css 2>/dev/null
```
Expected: confirms whether the script is broken (case-sensitive `PUBLIC/` won't exist on Linux/Mac).

- [ ] **Step 2: If broken AND no consumer, remove script + delete configs + remove deps**

Run:
```bash
# Remove the npm script entry from package.json (manual edit)
git rm postcss-v2.config.js tailwind-v2.config.js 2>/dev/null
npm uninstall @tailwindcss/forms tailwindcss postcss autoprefixer
npm run build
git add package.json package-lock.json
git commit -m "chore: remove broken build-css-v2 pipeline and its deps"
```

If Tailwind is actually used elsewhere (Vue 3 dashboard), STOP — leave deps and configs alone.

### Task E.6: Build + PR

- [ ] **Step 1: Final build**

Run:
```bash
npm run build
```

- [ ] **Step 2: Preview deploy**

Run:
```bash
firebase hosting:channel:deploy cleanup-wave-e --expires 3d
```

- [ ] **Step 3: Smoke test**

Same checklist as Wave C/D. Pay extra attention to anything that might have CDN-loaded a removed dep.

- [ ] **Step 4: PR**

Run:
```bash
git push -u origin chore/cleanup-npm-deps
gh pr create --title "chore: cleanup wave E — npm dep cleanup" --body "$(cat <<'EOF'
## Summary
Wave E (final) of dead-code cleanup. Removes npm dependencies from root `package.json` that are either functions-only, unused after preceding waves, or part of the broken `build-css-v2` pipeline.

## Removed from root package.json
(filled in based on which sub-tasks completed)

## Test plan
- [x] `npm run build` passes
- [x] Smoke test on preview channel (admin, user, ross, login, food-cost)
- [x] Each removed dep has zero `import`/`require` references in non-functions code

Preview: <fill in>
EOF
)"
```

- [ ] **Step 5: After merge, clean up**

```bash
cd ../..
git checkout master
git pull origin master
git worktree remove .worktrees/cleanup-deps
git branch -d chore/cleanup-npm-deps
```

---

## Wave F (FUTURE): Tier 6 Chart.js retirement

**Status:** BLOCKED until ~2026-05-07 per `KNOWLEDGE BASE/development/CHARTJS_REMOVAL_AUDIT.md`. After soak ends, a separate plan should:

1. Verify the 16 v1 call-sites have had their v2 replacements live without regression for the soak window.
2. Delete Chart.js call sites #1–16.
3. Decide whether subscription admin call sites #7–10 (deferred indefinitely) get migrated or stay on Chart.js.
4. If all v1 sites are gone, remove the `chart.js` npm dep.

This is out of scope for this plan. Open a follow-up plan around 2026-05-07.

---

## Wave G (FUTURE): Tier 7 low-confidence investigation

These need real judgment, not deletion-by-checklist. Suggested follow-up ticket per cluster:

1. `public/components/ui/*.vue` (shadcn/CVA scaffolding) — was this ever used? Pre-Hi-Fi or just abandoned?
2. `public/landing-v2/` + `public/js/landing-v2/LandingApp.vue` — not in `vite.config.js`. Promote, delete, or wire up?
3. Multiple login pages (`admin-login.html`, `user-login.html`, `signup.html`) — which is canonical?
4. Two onboarding flows (`onboarding-wizard.html` vs `onboarding-ross-hello.html`) — v1/v2 status?
5. `public/index.html` vs `index-v2.html` — which serves at `/`?
6. **`public/vite.config.js`** — there's a second Vite config inside `public/`. Why?
7. `public/js/dashboard.js` vs `user-dashboard.js` vs `admin-dashboard.js` — three dashboards.
8. `tests/{e2e,integration,monitoring,unit}/` — verify all wired into runners.

Each of these warrants its own brief investigation + decision before any deletion. Out of scope here.

---

## Final Repo Size Check

After Wave E merges:

- [ ] Compare repo size

Run:
```bash
du -sh . --exclude=node_modules --exclude=.git --exclude=dist > /tmp/cleanup-size-after.txt
diff /tmp/cleanup-size-before.txt /tmp/cleanup-size-after.txt
```
Expected: ~62 MB drop from RTDB dump alone, plus tens of MB more from HTML/JS deletions.
