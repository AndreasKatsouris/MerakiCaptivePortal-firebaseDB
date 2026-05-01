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
| Launch 2 parallel Explore agents (structure + git history) before planning any CLAUDE.md or protocol change | Gives full picture without gaps — structure agent finds KB/hooks/agents, git agent reveals commit ratio and existing planning docs | 2026-04-30 | 1 |
| Surgical CLAUDE.md edits (4 targeted inserts, nothing removed) beat rewrites | Rewrites risk breaking hook references, agent role descriptions, and KB paths that agents depend on | 2026-04-30 | 1 |
| Spec / gap-analysis PR before any phased build-out — read existing v2 module, v1 CFs, and handoff design side-by-side and produce a single mapping doc | Phase 1 of ROSS v2 sprint revealed home feed was already wired behind a flag; original "Phase 2 wire home feed" was a no-op. Saved a full implementation session | 2026-04-30 | 1 |
| Pause to confirm product purpose with user ("do you understand the purpose of X?") before building a redesign that touches existing IA | The mental-model reframe ("v1 admin = AI agent's playbook, not staff CRUD") collapsed 6 sibling tabs to 3 and reshaped Phase 4 entirely. Building the original 6-tab port would have been wasted | 2026-04-30 | 1 |
| `?tab=<name>` URL-param routing inside a single SPA, with `popstate` listener, beats a router framework for 3-4 tabs | No bundle bloat, browser back/forward works, deep links work, "coming next" stubs let unimplemented tabs ship cleanly | 2026-04-30 | 1 |
| Parallel agent on disjoint scope (Phase 5 audit) while parent thread continues serial work (Phase 4 tabs) | When CLAUDE.md "disjoint file scopes" rule blocks N-way parallelism, find the one slice that's actually disjoint and run that in isolation. Phase 5 touched only onboarding files, parent worked on RossHome.vue + new tab files | 2026-04-30 | 1 |
| Update PROJECT_BACKLOG.md + project-status.json + SELF_OPT + LESSONS + SCORECARD inside the same PR that ships the work, not after merge | User explicitly asked "have you updated…" mid-sprint after 9 merges — the protocol is "after every PR merge or significant change", which means before-the-next-PR-not-after | 2026-04-30 | 1 |
| When user feedback rejects a v1 convention (e.g. SweetAlert2) on a v2 surface, confirm the convention is v1-only and pick a Hi-Fi-native pattern (inline confirms, inline error banners) instead of theming the v1 library | v1 conventions in CLAUDE.md may not survive the v2 redesign. Don't assume — check what fits the current visual language | 2026-04-30 | 1 |
| Verify field names against the actual server seed / CF write path — not the KB doc — when wiring a v2 read or pick-then-act flow | KB docs drift. PR #28's activate-from-template fell into create mode silently because `t.id` was undefined (server uses `templateId`); KB doc said `id: string`. One grep of the seed file would have caught it before merge | 2026-05-01 | 1 |
| Show a read-only preview of the entity being committed inside the editor for any "pick X then act" flow (activate template, attach guest, etc.) | User-asked for it on PR #28; reduces surprise-result bugs (empty templates, wrong selection) and gives the user a chance to back out before the round trip | 2026-05-01 | 1 |
| Inline-confirm pattern variants by destructive scope: row-inline (People delete), slide-down strip on card (Playbook workflow delete), modal (TBD HfConfirm — bulk actions only) | One pattern doesn't fit every destructive action. People's row-inline doesn't fit a workflow card with multiple meta strips; slide-down strip works there. Reserve modals for genuinely overlay-worthy cases | 2026-05-01 | 1 |
