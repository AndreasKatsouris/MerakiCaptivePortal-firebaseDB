# Sparks Hospitality (MerakiCaptivePortal-firebaseDB)

Multi-tenant restaurant management platform built on Firebase. Integrates WiFi guest capture, queue management, food cost analytics, sales forecasting, ROSS workflows, receipt OCR, rewards/vouchers, campaigns, and WhatsApp automation. Target: restaurant owners and managers in South Africa.

## Role

You are the primary development agent for this project. You have full read/write access to all source code, configuration, and infrastructure.

- Modify, create, and delete source code files
- Run builds, tests, and deployments
- Create and manage git branches, commits, and PRs
- Spawn agent teams for complex multi-module work

## Tech Stack

- **Frontend:** Vanilla JS + Vue 3 (selective migration), Bootstrap 5.3, Tailwind, Chart.js (being retired in favor of Hi-Fi SVG charts — see `KNOWLEDGE BASE/development/CHARTJS_REMOVAL_AUDIT.md`)
- **Build:** Vite 6.0, deploys from `dist/` via `npm run build`
- **State:** Pinia 2.3.1 (Vue pages)
- **Backend:** Firebase Cloud Functions v7 + Express 4.21, Node.js 22
- **Database:** Firebase RTDB (primary), 30+ composite indexes
- **Auth:** Firebase Auth with custom claims, dual admin verification
- **Integrations:** Twilio (WhatsApp/SMS), SendGrid (email), Google Cloud Vision (OCR), Meraki API
- **Hosting:** Firebase Hosting (project: merakicaptiveportal-firebasedb)

## Conventions

- Immutable patterns: spread operators, no mutation
- SweetAlert2 for all user notifications (no native alert/confirm)
- `escapeHtml()` for XSS prevention in innerHTML (not needed in Vue templates — auto-escaped)
- Firebase RTDB index nodes for denormalized queries (e.g. `salesDataIndex/byLocation/{locId}`)
- Atomic deletes via multi-path `update(ref(rtdb), { path1: null, path2: null })`
- Vue 3 modules: Pinia stores, ES module imports, DDD-style structure (services/ + stores/ + components/ + constants/)
- SA date format (DD/MM/YYYY) default for ambiguous dates
- Chart.js uses CategoryScale (not TimeScale) to avoid ESM dual-package hazard
- See: `KNOWLEDGE BASE/development/CODING_STANDARDS.md` for full standards

## Key Paths

| Path | Purpose |
|------|---------|
| `functions/index.js` | 69+ Cloud Functions entry point |
| `functions/ross.js` | ROSS module functions |
| `database.rules.json` | RTDB security rules |
| `public/js/config/firebase-config.js` | Firebase init & exports |
| `public/js/modules/` | Feature modules (food-cost, ross, compliance, etc.) |
| `public/admin-dashboard.html` | Admin SPA (section switching) |
| `public/js/admin-dashboard.js` | Admin section orchestration |
| `scripts/build.js` | Build: copies public/ to dist/, Vite compiles Vue pages |
| `vite.config.js` | Vite 6 config, builds user-dashboard entry point |
| `public/js/design-system/hifi/` | Hi-Fi Vue component library (9 components + SVG charts + plugin) |
| `public/css/hifi-tokens.css`, `public/css/hifi-base.css` | Hi-Fi design tokens + base styles |
| `public/hifi/components.html` | Internal Hi-Fi component reference (no auth) |
| `public/ross.html`, `public/*-v2.html` | Hi-Fi v2 surfaces (Ross home + 7 module v2 pages, flag-ON) |

## Knowledge Base

Primary KB: `KNOWLEDGE BASE/` (project root). Curated subset for UI: `public/kb/`.

| Working on...          | Read first                                                   |
|------------------------|--------------------------------------------------------------|
| **Sprint / backlog / project goals** | **`KNOWLEDGE BASE/PROJECT_BACKLOG.md`** — read every session |
| Food cost module       | `KNOWLEDGE BASE/FOOD_COST_MODULE_README.md`                  |
| Food cost flag system  | `KNOWLEDGE BASE/FOOD_COST_FLAG_SYSTEM.md`                    |
| Queue / QMS            | `KNOWLEDGE BASE/queue-system-architecture.md`                |
| ROSS workflows         | `public/kb/features/ROSS.md`                                 |
| WhatsApp integration   | `KNOWLEDGE BASE/WHATSAPP_BOT_SOP.md`                        |
| Receipt processing     | `KNOWLEDGE BASE/RECEIPT_SETTINGS_COMPLETE_IMPLEMENTATION.md` |
| Sales forecasting      | `public/kb/features/SALES_FORECASTING.md`                    |
| Booking system         | `KNOWLEDGE BASE/BOOKING_SYSTEM_GUIDE.md`                     |
| Guest management       | `public/kb/features/GUEST_MANAGEMENT.md`                     |
| Access control / tiers | `KNOWLEDGE BASE/ACCESS-TIER-SYSTEM.md`                       |
| Campaigns & rewards    | `public/kb/features/CAMPAIGNS.md`                            |
| Database schema        | `KNOWLEDGE BASE/architecture/DATA_MODEL.md`                  |
| Security & rules       | `KNOWLEDGE BASE/security/SECURITY_OVERVIEW.md`               |
| DB rules               | `KNOWLEDGE BASE/security/DATABASE_RULES_GUIDE.md`            |
| Auth flow              | `KNOWLEDGE BASE/architecture/AUTHENTICATION_FLOW.md`         |
| Cloud Functions API    | `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md`              |
| Deployment             | `KNOWLEDGE BASE/deployment/DEPLOYMENT_GUIDE.md`              |
| DOM structure          | `KNOWLEDGE BASE/DOM_STRUCTURE_STANDARDS.md`                  |
| Module integration     | `KNOWLEDGE BASE/MODULE_INTEGRATION_SOP.md`                   |
| Phone normalization    | `KNOWLEDGE BASE/PHONE_NUMBER_NORMALIZATION_AUDIT.md`         |
| Hi-Fi design system    | `public/hifi/components.html` (live ref) + `public/js/design-system/hifi/` |
| Chart.js retirement    | `KNOWLEDGE BASE/development/CHARTJS_REMOVAL_AUDIT.md`        |
| Full KB index          | `KNOWLEDGE BASE/README.md`                                   |

## Session Opening Protocol (REQUIRED)

At the start of EVERY session, before any code is written or plan agreed:

1. Read `KNOWLEDGE BASE/PROJECT_BACKLOG.md`
2. State the Sprint Goal in your **first response**:
   > "Current sprint goal: [X]. [N] sprint tasks remain. Is this still the plan, or are we pivoting?"
3. Read `KNOWLEDGE BASE/development/SELF_OPTIMIZATION.md` for relevant patterns
4. If the user's opening message is a bug report or off-topic request, apply the Bug Triage Rule below before acting

Never skip this step. A session that starts without a declared goal will drift into reactive bug-fixing.

## Bug Triage Rule

When a bug or unplanned request surfaces mid-session:

| Situation | Action |
|-----------|--------|
| Bug **blocks** the current sprint task | Fix it immediately, then resume sprint work |
| Bug is real but **not sprint-blocking** | Log it in the Bug Triage Queue in `PROJECT_BACKLOG.md`, stay on sprint |
| User **explicitly pivots** the session | Acknowledge pivot, update Sprint Goal in `PROJECT_BACKLOG.md`, proceed |
| User asks "while you're at it…" | Ask: "Should I add this to the backlog or address it now?" — never auto-expand scope |

**Default: log it, don't fix it.** The sprint goal is the contract for the session.

## Git Workflow (REQUIRED)

**Never commit directly to `master`.** Always work on a feature branch, preferably in an isolated git worktree, then open a PR for review.

- **Default flow:** create a worktree (e.g. `git worktree add .worktrees/<branch-name> -b feature/<branch-name>`), make changes there, commit, push, open PR.
- **Minimum bar:** if a worktree feels like overkill for a tiny change, at least create a feature branch (`git checkout -b fix/<slug>`) — do not commit on `master`.
- **Only exception:** the user explicitly instructs a direct commit to `master` in that session (e.g. "commit this straight to master"). Authorization is per-request; it does not carry over.
- `master` is merge-only. Agents do not merge their own work — the user (or COORD agent) reviews and merges.
- Run `npm run build` on the branch before it's accepted for merge.

### Parallel agent work

Multiple agents editing this codebase concurrently should additionally follow:

- **One worktree + branch per agent.** Each agent gets its own isolated checkout. Use `Agent` tool with `isolation: "worktree"` for dispatched subagents, or `git worktree add` when spinning up separate Claude Code sessions.
- **Disjoint file scopes.** Before spawning, carve the work so no two agents edit the same file. Split by module (`public/js/modules/food-cost/*` vs `public/js/modules/ross/*`) or by layer (`functions/` vs `public/`). Flag shared-config files as single-owner-at-a-time: `database.rules.json`, `functions/index.js`, `firebase.json`, `CLAUDE.md`, `package.json`, `vite.config.js`, index definitions.
- **Self-contained briefs.** Agents don't share context — each needs its own goal, in-scope files, off-limits files, and acceptance check. Never write "based on what the other agent is doing."
- **Serialize merges.** Merge one branch at a time: merge → build + smoke test → merge next. Parallel merges can yield passing-per-branch states that break on master.
- **Rebase siblings after each merge.** `cd .worktrees/<other> && git rebase master` so in-flight branches stay current.
- **Watch for hidden global state.** Only one agent per cycle should touch RTDB schema, security rules, composite indexes, localStorage schema, or feature-flag defaults. Coordinate these explicitly.
- **Port / emulator coordination.** If multiple agents need a dev server or Firebase emulator, assign distinct ports — or serialize the work that needs them.

## Standard Task Workflow (REQUIRED)

Every non-trivial change follows these steps in order. No deviation without explicit per-request user authorization.

0. **Read first.** Study the existing surface, the relevant v2 pattern (if UI), and the matching KB entry. Write a one-paragraph brief of what you're about to do. If you can't, you're not ready to code.
1. **Worktree + branch.** `git worktree add .worktrees/<name> -b feature/<name>`. Never edit on `master`.
2. **Decide shape.** For UI changes to existing surfaces, default to a new `*-v2.html` (flag-gated) following the existing v2 pattern — not in-place rewrites.
3. **Plan.** Sketch the file list and the concrete changes. Use `/plan` for anything non-trivial. Skip only for truly small fixes.
4. **Implement.** Follow project conventions: Hi-Fi components (`Hf*`) + `--hf-*` tokens for new UI, Pinia (not Vuex), `escapeHtml()` for innerHTML, SweetAlert2 for notifications, atomic multi-path updates for RTDB deletes, service-shape preservation on v2 surfaces.
5. **Verify.** `npm run build` must pass. For UI: manual smoke test in the browser covering golden path + at least one error path + mobile breakpoint. Do not claim "done" without running the build.
6. **Commit.** Narrow, single-purpose commit message (`feat`, `fix`, `refactor`, etc.). No bundled unrelated cleanup.
7. **Push + PR.** `git push -u origin <branch>`, then `gh pr create` with a test plan. Include screenshots/preview URL for UI work.
8. **Preview.** Deploy UI changes to a Firebase Hosting preview channel so the user can click through before merge.
9. **User merges.** The agent never self-merges to `master`. The user (or a COORD agent) reviews and merges.
10. **Cleanup.** After merge: `git worktree remove .worktrees/<name>` and `git branch -d feature/<name>`. Promotion of v2 → v1 (or flag flip) is a separate PR once soaked.
11. **Reflect.** After every PR merge (or significant code change), update the three feedback files and report findings to the user:
    - `KNOWLEDGE BASE/development/SELF_OPTIMIZATION.md` — did any new pattern emerge or get validated?
    - `KNOWLEDGE BASE/development/LESSONS.md` — any non-obvious gotchas hit during this work?
    - `KNOWLEDGE BASE/development/SCORECARD.md` — score this session on the rubric, summarise out loud
    - `KNOWLEDGE BASE/PROJECT_BACKLOG.md` — mark sprint tasks done, move feature to Recently Completed, log any new bugs

    Report format (always shown to user after a PR/merge): a brief bullet list covering score, top lesson, and any patterns promoted.

**Trivial exception:** a typo or one-line fix can skip v2 pattern, preview, and explicit plan — but still needs a feature branch + PR. No direct master commits under any circumstance without explicit per-request authorization.

**Multi-module change?** Split into one branch per slice, spawn one agent per slice (disjoint scopes — see Parallel Agent Work above), merge sequentially with rebase between.

## Agent Teams

For complex multi-module work, spawn agent teams in isolated worktrees.

### Roles

| Role   | Specialization                                     |
|--------|----------------------------------------------------|
| COORD  | Orchestration, task assignment, plan approval       |
| ARCH   | System design, database schema, API contracts       |
| BACK   | Cloud Functions, database ops, integrations         |
| FRONT  | Vue components, admin dashboard, PWA                |
| MODULE | Feature module development (food-cost, ROSS, etc.)  |
| DEVOPS | Firebase hosting, deployment, CI/CD                 |
| QA     | Testing, cleanup, quality assurance                 |
| SEC    | Security rules, auth, compliance                    |

### Spawn Pattern

1. Create isolated git worktree for the work
2. Assign roles based on task scope (not all roles needed every time)
3. Use Sonnet for teammates, plan mode for approval gates
4. COORD reviews agent output before merging
5. Clean up worktree and team when done

## Agent Feedback Loop

Read at session start, update at session end.

| File | When | Purpose |
|------|------|---------|
| `KNOWLEDGE BASE/PROJECT_BACKLOG.md` | **Start (read) + end (update)** | Sprint goal, task checklist, bug triage queue |
| `KNOWLEDGE BASE/development/SELF_OPTIMIZATION.md` | Start (read) + end (update) | Workflow patterns, promoted after 3x validation |
| `KNOWLEDGE BASE/development/LESSONS.md` | End (if gotchas found) | Rolling log of non-obvious discoveries (max 20) |
| `KNOWLEDGE BASE/development/SCORECARD.md` | End | Self-evaluation against fixed rubric (max 10 entries) |

**Session-end backlog update:** mark completed sprint tasks `[x]`, move finished features to Recently Completed, log newly discovered bugs in Bug Triage Queue, clear the In Progress row if the branch merged.
