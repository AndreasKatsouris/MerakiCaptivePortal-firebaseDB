# Session Scorecard

Self-evaluation at session end. Rolling last 10 entries — oldest dropped.
Each dimension scored 1-5 (1=poor, 3=adequate, 5=excellent).

## Rubric

| Dimension | 1 (Poor) | 3 (Adequate) | 5 (Excellent) |
|-----------|----------|--------------|----------------|
| **KB Usage** | Ignored routing table | Read relevant docs | Read docs + updated KB |
| **Code Quality** | Introduced bugs or debt | Clean, working code | Clean + improved surrounding code |
| **Performance** | Created perf regressions | No impact | Measurably improved performance |
| **Cleanup** | Left temp files or dead code | No new mess | Reduced existing mess |
| **Agent Efficiency** | Wasted tokens, redundant work | Reasonable token use | Parallel agents, minimal context |
| **Communication** | Unclear updates to user | Clear status updates | Proactive risk flagging |
| **Lessons Captured** | Nothing learned recorded | Obvious lessons noted | Non-obvious gotchas documented |

## How to Score

At session end:
1. Rate each dimension honestly against the rubric
2. Calculate the average (1 decimal place)
3. Add a row to the Scores table below
4. If average < 3.0, note what went wrong in the Notes column

## Scores

| Date | Session | KB | Quality | Perf | Cleanup | Efficiency | Comms | Lessons | Avg | Notes |
|------|---------|----|---------| -----|---------|------------|-------|---------|-----|-------|
| 2026-04-08 | food-cost-perf + CLAUDE.md rewrite | 4 | 4 | 5 | 5 | 4 | 4 | 5 | 4.4 | Reviewed ROSS.md as reference pattern; parallelized 3 agents; cleaned 4,168 lines of dead code; captured 6 lessons |
| 2026-04-30 | flagtagmodal-itemkey-fix | 2 | 4 | 3 | 3 | 2 | 2 | 4 | 2.9 | First attempt skipped KB-read, plan, TDD, immutability, smoke, and preview — self-classified as trivial without authorization. User pushed back. Second attempt did it properly: read KB, wrote failing test first, immutable `withItemKey` helper, preview channel deployed, lessons captured. Quality of the eventual fix is fine; process discipline was the failure |
| 2026-04-30 | session goal protocol + kanban backlog (DX) | 5 | 4 | 4 | 5 | 5 | 5 | 3 | 4.4 | 2 parallel Explore agents gave full picture quickly; surgical 4-insert CLAUDE.md edit; pre-populated backlog from git history; no gotchas hit so lessons score lower |
| 2026-04-30 | ross-v2 sprint (phases 0-4c, PRs #16-#25) | 4 | 4 | 3 | 4 | 4 | 4 | 3 | 3.7 | 9 PRs shipped in one session: project-status dashboard, CORS preview fix, ROSS v2 spec, sidebar wiring, action handlers + snooze CF, Playbook + Activity + People tabs, locationName enrichment, onboarding audit (parallel agent). Got the IA reframe right (v1 = agent's playbook, concierge-first nav) — that was the critical pivot. Misses: didn't update SELF_OPT/LESSONS/SCORECARD per PR, only when user asked retroactively after 9 merges; SweetAlert2/Hi-Fi mismatch flagged by user not me at design time; relied on SweetAlert2 in initial 4c PR before fixing on review. Process discipline was the consistent gap, not code quality |
