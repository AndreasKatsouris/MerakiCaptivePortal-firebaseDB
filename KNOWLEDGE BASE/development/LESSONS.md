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
