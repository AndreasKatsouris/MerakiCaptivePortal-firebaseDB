# Lessons Learned

Rolling log of non-obvious discoveries. Max 20 entries — oldest dropped when full.
Updated by agents at session end when a session hits a gotcha, failed approach, or surprise.

## Entry Guidelines

- Only log **non-obvious** lessons — skip things derivable from reading the code
- Include the **module** and **source session** for traceability
- If a lesson leads to a validated optimization pattern, note that in SELF_OPTIMIZATION.md

## Lessons

| Date | Module | Lesson | Source |
|------|--------|--------|--------|
| 2026-04-08 | food-cost | Container ID mismatch: HTML has `food-cost-module-container` but init code referenced `Food-CostApp` — always verify container IDs exist in HTML before writing mount logic | Session: food-cost-perf |
| 2026-04-08 | food-cost | `getRecentStoreContext()` downloaded ALL records to return 1 — use `limitToLast(1)` query instead of client-side slicing | Session: food-cost-perf |
| 2026-04-08 | food-cost | Sequential `for...of` with `await get()` on 10+ locations takes minutes on slow connections — always use `Promise.all()` for independent Firebase reads | Session: food-cost-perf |
| 2026-04-08 | food-cost | Dual initialization paths (stale + current) cause race conditions and error flashes — when refactoring a module entry point, remove the old init path completely | Session: food-cost-perf |
| 2026-04-08 | food-cost | 13 temp/test files (4,168 lines) accumulated unnoticed — periodically audit `tests/` dirs for temp files, HTML runners, and dev servers | Session: food-cost-perf |
| 2026-04-08 | project | CLAUDE.md set to read-only blocked all development work — CLAUDE.md must match the actual agent role, review it when project workflows change | Session: claude-md-rewrite |
| 2026-04-13 | food-cost | LocationService had the same sequential `for...of` + `await get()` pattern we'd already fixed in database-operations.js — when fixing a pattern, grep the entire module for the same anti-pattern | Session: food-cost-deploy |
| 2026-04-13 | food-cost | Version bump is essential after perf fixes — without cache-busting query strings, browsers serve old cached scripts even after deploy | Session: food-cost-deploy |
| 2026-04-13 | food-cost | Version strings were scattered across 6 files (index.js, admin-dashboard.js, refactored-app-component.js, historical-usage-service.js, food-cost-analytics.html, cost-driver.html) — grep for the old version string to catch all occurrences | Session: food-cost-deploy |
| 2026-04-13 | food-cost | Vue watchers on modal open caused cascade: setting 4 params each triggered `regeneratePurchaseOrder()` — use `_initializing` guard when batch-setting values | Session: po-perf |
| 2026-04-13 | food-cost | `clearCache()` before every PO regeneration defeated the service's own 30-min TTL cache — never clear cache unless the underlying data source changes | Session: po-perf |
| 2026-04-13 | food-cost | Dynamic `import('../../config/firebase-config.js')` returned HTML instead of JS module — use already-imported functions from the top-level import, never re-import dynamically | Session: po-perf |
| 2026-04-13 | food-cost | Root `stockUsage/` and `stockData/` legacy reads added ~8s per call with no data found — always verify legacy fallback paths actually have data before keeping them | Session: po-perf |
| 2026-04-13 | food-cost | Initial investigation blamed multi-strategy search loop, but logs proved only 1 strategy ran (name resolution was broken). Always verify assumptions with actual console logs before proposing fixes | Session: po-perf |
| 2026-04-30 | food-cost | `attachItemKeys` only runs in `buildFlagPipelineContext` (post-save). Rows in `editableItems` between CSV upload and save have no `itemKey`, so any pre-save consumer (e.g. `FlagTagModal`) silently fails its precondition check. When adding a new consumer of `itemKey`, prefer the pure `withItemKey(item)` helper so the row in the editable table is not mutated mid-edit | Session: flagtagmodal-itemkey-fix |
| 2026-04-30 | process | Auto-mode "prefer action over planning" is *lower* priority than CLAUDE.md's Standard Task Workflow. Self-classifying a feature-module bugfix as the "trivial exception" to skip KB-read, plan, failing test, immutability, smoke, and preview is corner-cutting — every step is mandatory unless the user explicitly authorizes the skip for that request | Session: flagtagmodal-itemkey-fix |
| 2026-04-30 | functions/deploy | A worktree's `functions/` directory has no `node_modules` until you `npm install` there. `firebase deploy --only functions` from a worktree fails with `MODULE_NOT_FOUND` for sendgridClient (which transitively requires `@sendgrid/mail`). Fix: `cd functions && npm install` once per worktree | Session: ross-v2 sprint (CORS deploy) |
| 2026-04-30 | functions/cors | The Cloud Functions CORS allowlist hardcoded only `merakicaptiveportal-firebasedb.web.app` + `firebaseapp.com`. Preview channels live at `<site>--<channel>-<hash>.web.app` and were rejected by the preflight, so admin login silently failed (`verifyAdminStatus` returned non-OK and the gate showed "not admin"). Use a function-form `origin` callback that accepts a regex for the channel pattern | Session: ross-v2 sprint (PR #17) |
| 2026-04-30 | ross/v1-data | `rossGetWorkflows` and `rossGetReports` return `locationId` as `locationName` when the workflow was created without explicit `locationNames` array (`functions/ross.js:348` fallback). Old workflows are stuck with this. Client must enrich from `locations/{id}/name` per row for display. Helper duplicated in 3 stores so far — factor out planned | Session: ross-v2 sprint (PRs #23 / #24) |
| 2026-04-30 | hifi-design-system | `HfNavItem` renders as `<button>` (non-navigating) unless you bind `:href` to it. Easy to miss in a `v-for` over data that carries `href` if you only bind `:label` and `:icon` and rely on it "just working" | Session: ross-v2 sprint (PR #23 review) |
| 2026-04-30 | conventions | v1 conventions in CLAUDE.md (e.g. "SweetAlert2 for all user notifications") don't automatically apply to v2 surfaces. Hi-Fi v2 has its own visual language; SweetAlert2's rounded-modal Bootstrap-ish look is a clash. Convention update needed: SweetAlert2 is v1-only; v2 uses inline confirms / banners or HfModal (TBD) | Session: ross-v2 sprint (PR #25) |
| 2026-04-30 | git/concurrency | `git fetch origin master` can fail with `cannot lock ref 'refs/remotes/origin/master'` during concurrent worktree operations (likely Firebase deploy or another git op holding the ref). Symptom: stale local view of master. Fix: retry the fetch after a moment; the lock clears | Session: ross-v2 sprint |
| 2026-04-30 | process | The session-end feedback loop (PROJECT_BACKLOG, SELF_OPT, LESSONS, SCORECARD) must be updated *per PR or significant change*, not "at the end of the session". Skipping the per-PR cadence and trying to backfill 9 merges' worth of reflections from memory loses signal — the patterns and gotchas blur together | Session: ross-v2 sprint (this) |
