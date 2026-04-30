# Self-Optimization Patterns

Workflow patterns that improve agent efficiency. Reviewed at session start, updated at session end.
Patterns promoted from "observed" to "validated" after 3+ confirmations.
Max 15 patterns — unvalidated patterns older than 30 days are dropped.

## How to Use

1. **Session start:** Scan validated patterns for anything relevant to the current task
2. **During work:** Apply relevant patterns proactively
3. **Session end:** Add new patterns as "observed", increment count on existing ones, promote at 3+

## Validated Patterns

| Pattern | Why | Confirmed |
|---------|-----|-----------|
| Parallelize independent Firebase reads with `Promise.all()` | Sequential reads compound latency on slow connections — 10 locations = 10 round trips vs 1 | 3x (2026-04-08 → 2026-04-13) |

## Observed Patterns

| Pattern | Why | First Seen | Count |
|---------|-----|------------|-------|
| ~~Parallelize independent Firebase reads with `Promise.all()`~~ | _Promoted to Validated_ | 2026-04-08 | 3 |
| Use `limitToLast(N)` query instead of fetch-all-then-slice for RTDB | Avoids downloading entire node when only N records needed | 2026-04-08 | 1 |
| Verify HTML container IDs exist before writing mount/init code | Stale container refs cause silent failures and error flashes | 2026-04-08 | 1 |
| Remove stale init paths when a module has been refactored to a new entry point | Dual init causes race conditions — the old path will always fail | 2026-04-08 | 1 |
| Spawn BACK/FRONT/QA agents in parallel for independent workstreams | 3x faster than sequential — each agent works in isolation without blocking others | 2026-04-08 | 1 |
| Audit test directories for temp files during QA cleanup tasks | Temp files accumulate silently — thousands of lines of dead code | 2026-04-08 | 1 |
| Use KB routing table to scope agent prompts with specific doc paths | Agents load only relevant context — saves tokens and improves focus | 2026-04-08 | 1 |
| After fixing a pattern, grep the entire module for the same anti-pattern | Same bug often exists in multiple files — LocationService had the same sequential fetch we'd already fixed in database-operations.js | 2026-04-13 | 1 |
| Prefer a pure `withX(item)` helper alongside any in-place `attachX(items[])` so both immutable consumers (UI rows mid-edit) and pipeline consumers (post-save mutation) can share the same key derivation | The pipeline path mutates for memory efficiency; UI consumers must not. Co-locating the pure variant in the same `services/*-identity.js` file preserves DRY while honoring the project's immutability rule | 2026-04-30 | 1 |
| Read `KNOWLEDGE BASE/<feature>.md` *before* the first edit, not as background reading after the fix is in flight | The KB encodes the intended invariants (e.g. flag pipeline only runs post-save; `itemKey` shape is `code:` or `hash:`). Reading after the fact tends to validate whatever was already coded rather than challenge it | 2026-04-30 | 1 |
| Always bump cache-busting version strings after code changes, grep for old version to find all occurrences | Without version bump, browsers serve stale cached scripts even after Firebase deploy | 2026-04-13 | 1 |
| Guard Vue watchers with `_initializing` flag when batch-setting values | Without guard, each setter triggers its own watcher → cascading calls | 2026-04-13 | 1 |
| Verify legacy fallback reads actually return data before keeping them | Dead legacy paths (Permission denied, no data) add seconds of latency for no benefit | 2026-04-13 | 1 |
| Always double-check investigation findings against actual console logs | Initial analysis may blame the wrong code path — logs reveal the real bottleneck | 2026-04-13 | 1 |
