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
