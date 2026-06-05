# Lesson → Guard Coverage Audit

**Date:** 2026-06-05
**Author:** development agent (read-heavy audit, docs-only PR)
**Question:** Should CLAUDE.md Step 11 (Reflect) flip its default so that load-bearing
lessons are promoted into **mechanical guards** (tests / hooks / lint / CI) rather than
terminating in prose?

**Answer:** **YES — flip the default.** Evidence below. The flip is a surgical insert
into the existing Step 11 list; no prose entry is deleted, and lessons that genuinely
resist mechanization stay prose (demoted to the guard's comment where a guard exists).

---

## Why this question, and why now

The feedback corpus (`LESSONS.md`, `SELF_OPTIMIZATION.md`) is the system's real learning
loop, but today it terminates in **text a stateless model must remember to apply at the
right moment**. The recurring SCORECARD failure mode is *"knew the pattern, didn't apply
it"* (H-1 resume-gates, M-1 flag symmetry, the writer-census that missed an HTML file).

The cleanest proof is **PR #140**: Ask Ross 400'd on *every* prod turn despite 139 passing
(mocked) tests and every field-verify lesson loaded. The fix that actually sticks is a
**test**, not a paragraph — and that guard already exists in-repo:

- Guard: [`functions/agent/__tests__/tools.test.js:128-153`](../../functions/agent/__tests__/tools.test.js) — a numeric-`exclusiveMinimum` assertion + a full-tree scan rejecting any draft-4 boolean form (the demoted lesson is the comment at lines 124-127 immediately above).
- Lesson, demoted to a code comment: [`functions/agent/tools.js:255-267`](../../functions/agent/tools.js).

So the mechanism is **already proven in this codebase**. The gap is *default + coverage*,
not *can we do it*.

---

## Infrastructure available for guards (what "cheapest shape" can mean here)

| Mechanism | Status in repo | Evidence |
|-----------|----------------|----------|
| **vitest** unit tests | ✅ Wired, dominant. `npm test` = `vitest run`; suites in `tests/unit/`, `functions/agent/__tests__/`, `functions/billing/__tests__/`, `functions/entitlements/__tests__/` | root `package.json` scripts; `vitest.config.js` |
| **eslint** (flat config) | ✅ Wired. `npm run lint`. `eslint-plugin-vue` + vue parser already configured for `**/*.vue` | `eslint.config.js:66-68`; devDeps |
| **husky + lint-staged** | ⚠️ Present as devDeps but **NOT installed** — no `.husky/`, no `prepare` script, no `lint-staged` config, no active git hook | `package.json` devDeps; no `husky`/`lint-staged` keys |
| **firebase rules-unit-testing** (emulator) | ❌ Absent — no `@firebase/rules-unit-testing`, no `initializeTestEnvironment` anywhere | grep returns nothing |
| **CI test/lint gate** | ❌ **Absent.** The two GitHub workflows run `npm ci && npm run build` then deploy hosting — **neither runs `npm test` or `npm run lint`** | `.github/workflows/firebase-hosting-{merge,pull-request}.yml` |

> **Meta-finding (highest leverage):** even the GUARDED lessons below only fire if a human
> runs `npm test` locally. There is **no CI test gate**. A guard nobody runs is prose with
> extra steps. Standing up `npm test` + `npm run lint` in the PR workflow is the
> single change that makes *every* existing and future guard load-bearing.

---

## Classification — `LESSONS.md` (all 20 entries)

Each entry that describes a defect that **shipped or nearly shipped** is bucketed into
exactly one of: **GUARDED** / **MECHANIZABLE-UNGUARDED** / **INHERENTLY-PROCESS**.
Entries that are operational/tooling knowledge with no repo-defect are marked **N/A
(operational)** and excluded from the decision ratio.

| # | Date / Module | Defect (shipped or near) | Bucket | Evidence + cheapest guard shape |
|---|---------------|--------------------------|--------|----------------------------------|
| 1 | 2026-06-04 `tool-schema-dialect` (#140) | Draft-4 boolean `exclusiveMinimum` → API 400 on every turn (SHIPPED) | **GUARDED** | `functions/agent/__tests__/tools.test.js:128-153` (numeric-form assert + draft-4 tree scan); lesson demoted to `tools.js:255-267`. Template case. |
| 2 | 2026-06-04 `sse-transport` (#139) | `rossChat` reads `req.body` FLAT, not `{data}` — copying the sibling's envelope would silently break every turn (near) | **GUARDED** | `tests/unit/ross-agent-client.test.js:55` `expect(sent.data).toBeUndefined()` locks the flat shape. (The "EventSource can't set auth header" half is a design choice, not a guardable defect.) |
| 3 | 2026-06-04 `vue/escaping` (#139) | `v-html` on agent/server text = stored XSS (near; the rule is "zero `v-html` on agent content") | **MECHANIZABLE-UNGUARDED** | No `no-v-html` rule active. `eslint-plugin-vue` is already configured → enable `vue/no-v-html` (cheapest). **Live instance:** `public/js/modules/ross/v2/components/RossHomeDesktop.vue:203` `v-html="c.detail"` ships today (off-limits to fix here — flagged for follow-up). |
| 4 | 2026-06-03 `lazy-require-scope` (#136) | Function-scoped `require` invisible to sibling → swallowed `ReferenceError`, tool silently never executed (near; caught by one test) | **GUARDED** | The resume-approve unit test in `functions/agent/__tests__/rossChat.test.js` caught it (status assertion). Class-level complement: eslint `no-undef` flags a genuinely-undefined symbol. |
| 5 | 2026-06-03 `session-start` (#134) | Inherited stale worktree → wrong sprint picture (agent-workflow, not a code defect) | **INHERENTLY-PROCESS** | A `SessionStart` hook could `git fetch` + warn-if-behind, but it's advisory (can't fail a build) and guards agent behavior, not a shipped artifact. |
| 6 | 2026-06-03 `billing/idempotency` (#134) | Per-invocation-random key removes dedup + unbounded `debitGuard` growth (design tradeoff) | **INHERENTLY-PROCESS** | The semantic reasoning ("you removed the dedup benefit") isn't a single assertable invariant. The *growth* half is operationally mitigated by `rossAgentPrune` (`functions/agent/__tests__/prune.test.js`). |
| 7 | 2026-06-03 `billing/sdk-shape` (#129) | snake_case API `usage` → camelCase ledger `units` = silent **0 charge** every turn (near; caught at spec time) | **GUARDED** | `toLedgerUnits` mapper unit-tested against a verbatim real `usage` block — `functions/agent/__tests__/llm-client.test.js`. |
| 8 | 2026-06-03 `import-safety` (#130) | Top-level `require('../ross')` would drag CF registration into the core + throw under vitest (near) | **GUARDED** | Implicitly guarded: the agent-core unit suites import `tools.js` with no admin init — if the core stopped being import-cheap they'd fail to load. |
| 9 | 2026-06-02 `rtdb-write-windows` (#127) | How to PATCH RTDB from a Windows box (operational tooling) | **N/A (operational)** | No repo artifact to guard. |
| 10 | 2026-06-02 `rules-validate` (#125) | Parent `!newData.hasChild('X')` `.validate` false-rejects every admin write on already-materialized subs (near; caught at impl time) | **MECHANIZABLE-UNGUARDED** | No rules harness exists. Add `@firebase/rules-unit-testing` emulator test: "admin write to `status` succeeds; client write to `features` fails." |
| 11 | 2026-06-02 `writer-census` (#125) | Writer census grepped `**.js` only, missed an inline `<script>` in `admin_tools/*.html` → atomic `update()` would hard-break the whole admin workflow | **INHERENTLY-PROCESS** | The *judgment* (which nodes to census, how to route each writer) resists a clean guard — this is the canonical process case. **Complement:** a post-lock grep-test asserting *zero* client-SDK writers of node X across `--include=*.js --include=*.html --include=*.vue` is mechanizable and would have caught the miss. |
| 12 | 2026-06-01 `firebase-cli` (ledger deploy) | Unprovisioned `defineSecret` blocks ALL deploys; CLI hangs on Windows (deploy-time operational) | **N/A (operational)** | Complement: a pre-deploy script could census `defineSecret('X')` names vs provisioned secrets — but there is no deploy CI to host it. |
| 13 | 2026-05-31 `git-commit` (#113) | Backticks in `-m "..."` execute as shell substitution (commit hygiene) | **N/A (operational)** | A `commit-msg` hook could catch it; agent-shell behavior, not a shipped artifact. |
| 14 | 2026-05-31 `no-fabrication` (#110) | Agent auto-submitting a measurement value fabricates a compliance record (near; designed out) | **GUARDED** | `isAgentSubmittable` §3.1 gate enforced server-side + asserted in `functions/agent/__tests__/tools.test.js`. |
| 15 | 2026-05-31 `design-audit` (#107) | Auditing live code *at design time* surfaced a privilege-escalation vuln before any code | **INHERENTLY-PROCESS** | A discovery discipline ("audit every writer/reader before writing the spec") — no artifact to assert. |
| 16 | 2026-05-31 `pr-amend` (#106→#108) | Amending an open PR that gets merged orphans the follow-up commit (workflow) | **INHERENTLY-PROCESS** | A `gh pr view --json state` pre-push check is a partial mechanization, but the core is git-workflow judgment. |
| 17 | 2026-05-31 `rules-cascade` (#96) | Root `.read` cascade makes child rules dead; missing `ownerId` fallback (automated review caught as 🔴 must-fix) | **MECHANIZABLE-UNGUARDED** | No rules harness. Emulator rules-test: non-owner read denied; owner-via-`ownerId`-fallback allowed; queried-node auth. Same family as #10 / #11-complement. |
| 18 | 2026-05-30 `auth-vs-authz` (#89/#91) | Token-only gate on a billable-key endpoint leaks to non-admin operators (near; automated review caught 🔴) | **MECHANIZABLE-UNGUARDED** | `firebase-functions-test` is already a devDep. Per-CF auth-posture unit test: admin-only CF + non-admin token → 403. Or a meta-test asserting every CF in an "admin-only" list calls `requireAdmin`. |
| 19 | 2026-05-20 `cross-pr-references` (#87) | Docs PR cited a file an unmerged PR introduced — dangling reference (near; automated review caught 🔴) | **MECHANIZABLE-UNGUARDED** | A docs-link/path-existence check (vitest or CI lint) that greps file paths cited in KB docs and asserts they resolve. (The merge-*order* timing aspect stays process.) |
| 20 | 2026-05-19 `hifi-prototype-debris` (#79) | Hardcoded mock strings ("Target 28% · 3 days running") shipped to preview on the mobile variant (SHIPPED; 2× — also #48 "Maya Alvarez") | **MECHANIZABLE-UNGUARDED** | The lesson's own heuristic is `rg` for proper-noun / scripted-stat strings. A vitest denylist test over `public/js/modules/ross/v2/**` + Hi-Fi components asserting none of a known placeholder set appears. |

### Ratio (defect-bearing entries only — 17 of 20; #9/#12/#13 excluded as operational)

| Bucket | Count | Entries |
|--------|-------|---------|
| **GUARDED** | 6 | #1, #2, #4, #7, #8, #14 |
| **MECHANIZABLE-UNGUARDED** | **6** | **#3, #10, #17, #18, #19, #20** |
| **INHERENTLY-PROCESS** | 5 | #5, #6, #11, #15, #16 |

**MECHANIZABLE-UNGUARDED is 6 of 17 (~35%) — tied with the already-guarded count.**
That is unambiguously non-trivial.

---

## Cross-check — `SELF_OPTIMIZATION.md` Validated table

The validated patterns reinforce the same conclusion (most are workflow/process, but the
two highest-validated *defect* patterns are partially mechanizable and unguarded):

| Validated pattern | Confirmed | Bucket | Note |
|-------------------|-----------|--------|------|
| **Verify field names against server seed / CF write path** (+ lifecycle-marker + type-shape variance) | **5× + 2 negative (PR #72)** — the most-validated defect pattern in the repo | **MECHANIZABLE-UNGUARDED** (partial) | The *mock-vs-server divergence* half is mechanizable: shared response fixtures both the CF (`res.json`) and the vitest mock import, instead of hand-composed mocks. The *field-verify-at-write-time* discipline stays process. |
| **Pre-flight writer census before tightening RTDB `.write`** (HTML-include refinement) | 3× → PROMOTED, in CLAUDE.md 5b(e) | **INHERENTLY-PROCESS** (+ rules-test + zero-writer-grep complements) | Same as lesson #11. |
| Parallelize Firebase reads with `Promise.all()` | 3× | N/A | Perf pattern, not a defect guard. |
| Inline-confirm variants / fold-in scope / `gh pr edit --body` / subagent-driven-dev / read-four-feedback-files | 3–5× | N/A or PROCESS | Workflow patterns; no shippable artifact to assert. |
| `functions/node_modules` not inherited by worktrees | 3× | N/A (operational) | A pre-deploy `node_modules` presence check is mechanizable but operational. |

---

## Decision

**Flip the Step 11 default: a validated or shipped-defect lesson should ship a mechanical
guard by default; prose is demoted to the guard's comment; a lesson that genuinely can't
be mechanized stays prose.**

Justification:
1. **The ratio demands it** — 6 of 17 defect-bearing lessons are mechanizable-but-unguarded, equal to the guarded count. This is a coverage gap, not a fluke.
2. **The mechanism is proven in-repo** — #140's `tools.test.js` guard is the existence proof; the cost was ~25 lines of test.
3. **The cheapest shapes are already wired** — vitest dominates; `eslint-plugin-vue` is configured (enables #3 for ~free). Only the rules-emulator family (#10/#17) needs new harness.
4. **It directly attacks the recurring SCORECARD failure** — "knew it, didn't apply it." A guard fires whether or not the stateless model remembered the lesson.

This is a **default**, not an absolute: INHERENTLY-PROCESS lessons (#5, #6, #11, #15, #16)
correctly stay prose, and the Step 11 text must say so explicitly so the bar doesn't become
"invent a brittle guard for everything."

---

## Out of scope (explicit) — seed backlog for the follow-up

**This PR writes NO guards** and touches no feature code. If the operator accepts the flip,
the MECHANIZABLE-UNGUARDED entries above are the seed backlog for a separate, scoped
follow-up (rough order by cost/leverage):

1. **CI test+lint gate (meta, highest leverage)** — add `npm ci && npm test && npm run lint` to the PR workflow. Without it, *no* guard (existing or new) is enforced. Not a lesson itself — it's what makes lessons 1/2/4/7/8/14 actually load-bearing.
2. **`vue/no-v-html` eslint rule** (#3) — near-free; `eslint-plugin-vue` already configured. Will flag the live `RossHomeDesktop.vue:203` instance (triage that separately).
3. **Prototype-debris denylist test** (#20) — vitest grep over v2 components for a placeholder set. Recurred 2×.
4. **CF auth-posture unit tests** (#18) — `firebase-functions-test` already present; assert admin-only CFs reject non-admin tokens.
5. **RTDB rules-unit-testing harness** (#10, #17, + #11 zero-writer complement) — new `@firebase/rules-unit-testing` suite; highest setup cost, highest security value.
6. **Shared CF-response fixtures** (SELF_OPT field-verify) — replace hand-composed vitest mocks with fixtures imported from the server's `res.json` source of truth.
7. **Docs path-existence check** (#19) — lower value; CI lint that resolves file paths cited in KB docs.
