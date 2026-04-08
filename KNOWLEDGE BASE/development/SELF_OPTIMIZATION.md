# Self-Optimization Patterns

Workflow patterns that improve agent efficiency. Reviewed at session start, updated at session end.
Patterns promoted from "observed" to "validated" after 3+ confirmations.
Max 15 patterns — unvalidated patterns older than 30 days are dropped.

## How to Use

1. **Session start:** Scan validated patterns for anything relevant to the current task
2. **During work:** Apply relevant patterns proactively
3. **Session end:** Add new patterns as "observed", increment count on existing ones, promote at 3+

## Validated Patterns

_None yet — patterns below need 2 more confirmations to be promoted._

## Observed Patterns

| Pattern | Why | First Seen | Count |
|---------|-----|------------|-------|
| Parallelize independent Firebase reads with `Promise.all()` | Sequential reads compound latency on slow connections — 10 locations = 10 round trips vs 1 | 2026-04-08 | 1 |
| Use `limitToLast(N)` query instead of fetch-all-then-slice for RTDB | Avoids downloading entire node when only N records needed | 2026-04-08 | 1 |
| Verify HTML container IDs exist before writing mount/init code | Stale container refs cause silent failures and error flashes | 2026-04-08 | 1 |
| Remove stale init paths when a module has been refactored to a new entry point | Dual init causes race conditions — the old path will always fail | 2026-04-08 | 1 |
| Spawn BACK/FRONT/QA agents in parallel for independent workstreams | 3x faster than sequential — each agent works in isolation without blocking others | 2026-04-08 | 1 |
| Audit test directories for temp files during QA cleanup tasks | Temp files accumulate silently — thousands of lines of dead code | 2026-04-08 | 1 |
| Use KB routing table to scope agent prompts with specific doc paths | Agents load only relevant context — saves tokens and improves focus | 2026-04-08 | 1 |
