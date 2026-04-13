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
