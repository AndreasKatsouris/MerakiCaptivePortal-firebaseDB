# Project Backlog — Sparks Hospitality

> Claude reads this file at the start of every session and updates it at the end.
> The Sprint Goal is the contract for the session — don't deviate without explicit user confirmation.

Last updated: 2026-05-13 (housekeeping session — recovered 2 legitimately unmerged commits from old worktrees via cherry-pick PRs #60 (project-status.json sync for PR #58) and #61 (UX fix: snooze + nav hrefs on Ross v2 scripted/learning fallback cards). Also synced `dist/` to prod via `firebase deploy --only hosting`. Tidied repo: PR #62 gitignored `.superpowers/` + `CLAUDE - OLD.md`; PR #63 tightened CLAUDE.md Session Opening Protocol wording (linter edit promoted to canon). Cleaned 9 stale local branches + 4 of 6 merged worktrees (3 disk leftovers still locked by Windows file handles).)

---

## 🎯 Sprint Goal

**Effective implementation of Hi-Fi v2, with ROSS as the central post-login surface for every subscribed user.** Workflows are the product; v1 modules become workflow step types over time.

**Mental model (locked 2026-04-30, refined 2026-05-02):** ROSS v1 isn't operator-facing compliance CRUD; it's the **policy + playbook the future AI agent runs against**. The 6 sibling v1 admin tabs collapse to 3 deeper governance destinations behind the concierge home (**Playbook / Activity / People**). The **playbook is the product** — workflows direct every operation; modules become step types inside workflows, not destinations. **Two tiers only**: Free (full ROSS UI + 5 starter templates) and All-in (full template library). No POS integrations yet — manual entry / file uploads only. LLM integration (`askRoss`) is now central, not deferred — own sprint.

Sprint: 2026-04-30 → until complete

---

## 🔄 In Progress

| Item | Branch | Notes |
|------|--------|-------|
| — | — | Idle. Housekeeping/recovery PRs #60-#63 merged 2026-05-13. Local master = origin/master = prod hosting (`firebase deploy --only hosting` shipped PR #60 + #61 to live). Next: operator-facing Run execution UI honouring all 10 inputTypes, then concierge home active-run surfacing. |

---

## ✅ Sprint Tasks

### Phase 0–3 — Done

- [x] **Phase 0** — Project Status dashboard + sidebar cleanup (PR #16) + CORS fix for preview channels (PR #17)
- [x] **Phase 1** — Gap analysis & spec doc (`docs/plans/2026-04-30-ross-v2-implementation.md`, PR #18)
- [x] **Phase 2** — Right-rail + first-run findings wired (PR #19) — 1 real finding + 2 illustrative
- [x] **Phase 3** — Action handlers + snooze CF deployed (PR #20) — `rossV2Snooze` + `ross/v2Snoozes/{uid}` RTDB node + read-side filter

### Phase 4 — Admin redesign (concierge-first IA) — In progress

- [x] **IA reframe** — v1 = agent's playbook; concierge home stays front door; tabs collapse 6 → 3
- [x] **Phase 4a** — Playbook tab read-view (PR #21) + locationName enrichment fix (PR #24)
- [x] **Phase 4b** — Activity tab (run history + reports) (PR #23)
- [x] **Phase 4c** — People tab — staff CRUD (PR #25). First edit-capable v2 surface; established inline-editor + two-step inline delete + inline error banner patterns + client-side phone normalization.
- [x] **Phase 4d.1** — Playbook tab — workflow create / edit / pause / delete + activate-from-template (PR #28). First edit-capable v2 surface for the workflow data path. Slide-down inline delete confirm. Server's allowedFields limit on `rossUpdateWorkflow` surfaced via locked-field UX.
- [x] **Phase 4d.2** — Template CRUD (superAdmin) (PR #30). Inline `RossPlaybookTemplateEditor` mirrors workflow editor; slide-down delete confirm on cards; `admins/{uid}.superAdmin` probe gates UI (server still enforces `verifySuperAdmin`). Same PR fixed KB doc drift (`templateId`/`subtasks`) and follow-up commit added stable subtask `_uid` keys + empty-`daysBeforeAlert` validator in both editors.
- [x] **Phase 4e.1** — Per-task `inputType` / `inputConfig` editor on existing workflow tasks (PR #32). New `RossPlaybookWorkflowTasksEditor` + `RossPlaybookTaskRow` + `RossPlaybookTaskConfigFields` reachable from each card's "Edit tasks" button. All 10 server input types supported via `constants/input-types.js`. Same PR fixed a latent v2 bug: `playbook-service.getPlaybookWorkflows()` now flattens client-side to one row per (workflowId, locationId), matching what the v2 surface always assumed. Follow-up commit addressed 4 of 5 review findings (alert icon, dead code, `taskSavingTaskId` symmetry, raw-rating-input through validator).
- [x] **Phase 4e.2** — Server propagation + template-level inputType editor (PR #35). Single `buildTaskFromSubtask(subtask, nextDueDate)` helper shared by `rossCreateWorkflow` + `rossActivateWorkflow` keeps create-from-scratch and activate-from-template byte-identical. `validateSubtasksInputTypes` rejects invalid `inputType` enum values upstream at all 4 write paths (`rossCreateWorkflow`, `rossCreateTemplate`, `rossUpdateTemplate`, `rossManageTask`) — closing the validation hole I caught during plan-review (planner had only proposed it for `rossCreateWorkflow`). Subtask row UI gains always-visible type select + collapsed config sub-form, reusing `RossPlaybookTaskConfigFields` from 4e.1. Functions deployed pre-merge to avoid client/server protocol gap.

### Phase 5 — ROSS-as-central-funnel cleanup (LOCKED SPEC 2026-05-02)

Spec: `docs/superpowers/specs/2026-05-02-ross-central-funnel-cleanup-design.md`. Five PRs, sequenced as below. Replaces the original "Phase 5 = onboarding wiring" framing — that was too narrow. The actual work is making ROSS the post-login destination for the first time (`ROSS_IS_HOME` flag has been unread since shipped) and Hi-Fi-rewriting the three v1 surfaces (homepage, signup, wizard) that sit between a visitor and ROSS.

- [x] Audit confirms `getFirstRunFindings()` → store → component is end-to-end functional (PR #22)
- [x] Spec locked + merged (PR #37, 2026-05-02)
- [x] **PR 1 (PR #39)** — `feat/post-login-router`: pure router + 19 tests at 100% coverage; hello auth gate; `helloSeen` field shipped end-to-end (signup init + hello CTA write + wizard `set→update` fix to preserve it + KB doc + matrix backwards-compat). Toast-timing fix landed via deferred-navigator pattern after review caught the `Promise.all` side-effect race.
- [x] **PR 2 (PR #42)** — `feat/signup-v2-hifi`: Hi-Fi Vue 3 rewrite of `/signup.html` (no Pinia, ephemeral form state). Dynamic-tier reframe (operator pivot — admin curates Free/All-in via existing admin-dashboard Tier Management UI rather than hardcoding in code constants). Service layer extracted to `signup-service.js`. `tier` written to `users/{uid}/tier`, `subscriptions/{uid}/tier` (canonical) AND `subscriptions/{uid}/tierId` (legacy compat). `registerUser` CF gap closed: server-side `subscriptionTiers/{tierId}` validation, length-bounds on free-text fields, atomic multi-path `update()` for users + subscriptions + onboarding-progress, idempotent onboarding-progress init. New `.validate` rule on `subscriptions/$uid` rejects unknown tier IDs (defense in depth). Two new Hi-Fi components shipped: `HfSelect` (rebuilt as true custom combobox after operator flagged native dropdown panel ignored design tokens — full WAI-ARIA + keyboard) and `HfCheckbox`. v2 surface uses inline error/success banners (not SweetAlert2 — that util silently no-ops on the Hi-Fi mount shell). Doc housekeeping: 3 plan stragglers relocated `docs/superpowers/plans/` → `docs/plans/` after operator clarified the canonical location; LESSON corrected.
- [x] **PR 3 (PR #44)** — `feat/homepage-v2-hifi`: `/index.html` itself promoted to Hi-Fi mount shell (legacy v1 + index-v2.html chrome stepping-stone + landing-page.css all deleted). Workflow-centric narrative replaces fabricated stats/testimonials/success stories — three concrete workflow cards (Daily Opening Checklist / Weekly Compliance Sweep / Monthly Marketing Push), single primary CTA "Start free", honest tone throughout. Synthetic public hello preview embeds the actual `RossOnboardingHello.vue` (Q4 lock — same component, two data feeds) with a Tannie's-Kitchen Cape Town narrative; CTAs route to `/signup.html`. RossOnboardingHello refactored with three optional props (`findings` / `continueHref` / `tourHref`) — defaults preserve post-signup behavior byte-for-byte. Pricing section reads `subscriptionTiers` via new shared `services/subscription-tiers.js` (extracted from PR 2's signup-service); static Free/All-in fallback if RTDB empty. Founder Lakis Katsouris quote preserved in single-card layout. Hero photo (`/img/ob-bg.jpg`) replaced with typographic workflow-card panel demonstrating the product in miniature. Module rename `landing-v2/` → `marketing/landing/`. SEO preserved (`<title>`, meta description, `#features`/`#about`/`#testimonials` alias). Three review fixes landed in same PR: logo `smoothScroll` always preventDefault, All-in fallback gets "Pricing announced soon" subtext, magic `top:-80px` promoted to `--lp-nav-height` custom property.
- [x] **PR 4 + PR 6 (folded) (PR #46)** — `feat/post-login-router-rollout`: wired the 5 remaining redirect call sites (`user-login.js` ×2, `onboarding-wizard.js` ×2, `user-dashboard.js`, `dashboard.store.js`) to the router; `user-dashboard.html` got a sticky deprecation banner. Review surfaced a real bug — fresh signups (`completed: false && helloSeen: false`) hit the wizard because the router's `!completed` short-circuit fired before the helloSeen branch. Fix folded the PR 6 work in: `resolvePostLoginDestination` rewritten with three explicit helloSeen states — `false` → hello, `true` → home (wizard skipped, PR 6 lock), missing → legacy `!completed`-gated path. Hello component default `continueHref` updated `/onboarding-wizard.html` → `/ross.html`. AUTHENTICATION_FLOW.md gained a Post-Login Routing section. 21/21 router tests pass (was 19 — added fresh-signup + PR 6 cases). The wizard remains reachable by direct URL for legacy use; only fresh signups skip it. **ROSS is now home.**
- [x] **PR 5 (PR #48)** — `feat/ross-sidebar-cleanup`: collapsed sidebar to Today + Ross's brain only (4 sections / 13 items → 2 sections / 4 items). All v1 module deep-links removed from ROSS primary nav (Overview / Queue / Guests / Operations all gone). Mobile bottom nav folded in (Overview / Guests / Queue / You → Playbook / Activity / People). v1 modules remain reachable via `/admin-dashboard.html` per Q3 lock. Operator caught on preview that the footer Profile/Settings block shipped hardcoded prototype data (`Maya Alvarez` / `Group Ops` / `MA`) — my original plan said "footer already serves the role" but conflated structure with content. Fix landed same PR: both desktop footer + mobile topbar now read `auth.currentUser` reactively via `onAuthStateChanged`, with proper unsubscribe in `onUnmounted`. Display shows `displayName` (or email local-part fallback) + email + live initials. Gear icon stays non-interactive — `/profile-settings.html` doesn't exist yet (only `/receipt-settings.html` which is per-restaurant config, different domain). **Phase 5 sprint closed.**

Lower-priority Phase 5 items (deferred to dedicated polish PR after the 5-PR sequence): surface `store.error` in `RossOnboardingHello.vue`; lower `FINDING_MIN_LIFT` threshold; parallelise nested RTDB reads in `detectBestWeekday`; un-hardcode the 3-of-5 step counter.

### Phase 6 — Playbook UX enrichment + template library curation (next sprint after Phase 5 cleanup)

> **Vocabulary anchor (per `public/kb/features/ROSS.md`):** Templates → activated → Workflows (per location) → composed of Tasks → executed via Runs. The Runs server surface (`rossCreateRun`, `rossSubmitResponse`, auto-flag, 422-on-required-note) is already shipped — Phase 6 is the operator-facing UX layer on top, plus content (template curation + tier gating).

- [x] **Tier gating mechanism** (PR #51, 2026-05-12) — `tier:'free'|'all-in'` schema, server filter on `rossGetTemplates`, activate gate on `rossActivateWorkflow` with audit log, symmetric validators on Create/Update Template, editor field, defensive client filter, KB docs. Mechanism complete; gate is inert until PR 1B flips templates.
- [x] **Curate starter library** (PR #53, 2026-05-12) — 5 Free (Daily Opening / Daily Closing / Weekly Deep Clean / Monthly Food Cost Review / Health & Safety Audit) + 8 All-in (CoA / Liquor Licence / Weekly Social / Monthly Google Reviews / Weekly Supplier Pay / Monthly Staff Meeting / Quarterly Performance Review / Monthly Equipment Service). Seed file updated for fresh deploys; one-off update script (`functions/seeds/ross-templates-curate-tiers.js`) ready for prod RTDB. Folded a sibling fix on PR #51's backfill script (legacy databaseURL → canonical `-default-rtdb` form).
- [x] **Tier-gated template list (upgrade affordance)** (PR #55, 2026-05-12) — server's `filterTemplatesByTier` now accepts opt-in `includeLocked:true` (v1 callers untouched); v2 Playbook renders locked All-in templates dimmed + "All-in" badge + ghost "Upgrade to All-in" button → `/upgrade.html`. New Hi-Fi comparison page reads `subscriptionTiers/` via `loadTiers()` with email CTA pre-filled by `?from=template&id=<id>` context. 8 new vitest cases (34/34 passing). 5+ review fixes folded mid-PR including a security finding (CRLF in mailto body via `?id=` query param)
- [x] **Day-zero auto-activation** (PR #58, 2026-05-12) — new `rossSeedFirstWorkflow` CF called from `signup-service.js` after both signup paths (callable + fallback) complete. Server resolves locationId from `userLocations/{uid}` and templateId from `ross/config/firstWorkflowTemplateId` pointer (set per-environment via one-off script). Idempotency marker on `onboarding-progress/{uid}/firstWorkflowSeededAt`; client wraps the call in `Promise.race` with a 1500ms cap so a cold-start CF can't block the post-signup redirect. Also: pure helpers `buildLocationsFromTemplate` + `buildWorkflowRecord` extracted from `rossActivateWorkflow` (17 unit tests). Originally inlined the seed inside `registerUser` — preview testing revealed `registerUser` callable has been throwing `unauthenticated` on every call due to a pre-existing v1-vs-v2 signature bug, and `signup-service.js` silently falls back to direct RTDB writes. Architecture pivot mid-PR to the dedicated CF.
- [ ] **Operator-facing Run execution UI** — richer run-execution surface honouring all 10 `inputType`s (existing UI in v1 admin handles checkbox; v2 needs the full matrix — number/temperature with auto-flag handling + 422 note enforcement, dropdown, rating, photo/signature placeholders, etc.). Extends `?tab=playbook` workflow card → "Start run" → run UI
- [ ] **Concierge home active-run surfacing** — replace the current scripted/illustrative cards on `/ross.html` with real-data cards driven by my activated workflows: today's pending tasks, overdue runs, recent completions. Uses existing `rossGetWorkflows` + `rossGetRun` per active workflow
- [ ] (Stretch) **Compliance Sweep** as the first end-to-end curated template if not already in seed (recommended starter — small `inputType` footprint, strongest SA-locale moat per LESSONS / spec rationale)

### Phase 7 — askRoss LLM (separate sprint)

- [ ] New `rossChat` Cloud Function (Anthropic SDK + prompt caching)
- [ ] Eval harness (20-prompt golden set)
- [ ] Cost cap + secrets management
- [ ] Web-sourced day-zero findings (weather, local events, public holidays, suburb demographics) — surfaced once LLM is live

---

## 📋 Backlog (Prioritized)

### High Priority

1. **Food cost open PR** — review and merge the in-flight food-cost feature branch
2. **Chart.js retirement** — soak ends ~2026-05-07; execute removal per `KNOWLEDGE BASE/development/CHARTJS_REMOVAL_AUDIT.md` (16 of 23 sites have v2 replacements ready)
3. **ROSS obligation templates** — implement per `docs/plans/2026-03-20-obligation-templates-plan.md`

### Medium Priority

4. **Hi-Fi v2 → v1 promotions** — partially superseded by Phase 5 PR 5 (sidebar cleanup removes v2 module deep-links from ROSS nav entirely). v1 modules stay reachable via `admin-dashboard.html` for the operator. Flag-flip to make v2 the canonical surface for guests/queue/analytics/campaigns/receipts can happen any time post-soak — it just doesn't change ROSS nav anymore.
5. **WhatsApp template UI polish** — surface improvements from `docs/plans/2026-02-19-whatsapp-template-management.md`
6. **QA cleanup** — execute `docs/plans/qa-cleanup-plan.md` (~65 test artifact files to remove)
7. **Sidebar dedup** — folded into Phase 5 PR 5
8. **Project status auto-derive** — read `PROJECT_BACKLOG.md` directly in the dashboard instead of maintaining `project-status.json` separately
9. **Factor out `fetchLocationNames` helper** — duplicated across `activity-store.js`, `playbook-store.js`, `people-store.js`. Extract to `public/js/modules/ross/v2/location-names.js`.
10. **`HfModal` / `HfConfirm` design-system components** — v2 needs a Hi-Fi-native modal pattern for cases that genuinely warrant an overlay (bulk-action confirms, multi-step wizards, etc.). PR #25 dropped SweetAlert2 in favour of inline confirms / inline error banners — that works for the People tab's single-row destructive actions but won't scale. Land in `public/js/design-system/hifi/components/` with --hf-* tokens, focus trap, ESC + scrim dismiss, and a worked example in `public/hifi/components.html`. Update CLAUDE.md convention: SweetAlert2 is v1-only.
11. **Fix KB doc field-name drift for ROSS templates** — `public/kb/features/ROSS.md` "Templates" block lists `id: string` but the actual server uses `templateId` (per seed + `rossCreateTemplate`). Same doc says template tasks are at `tasks: Task[]` but server stores `subtasks` (per `rossActivateWorkflow`, seed). Drift directly caused the PR #28 activate-from-template bug. One-line audit + edit. **[Done in PR #30]**
12. **Catalog ROSS Cloud Functions in `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md`** — `functions/ross.js` is missing from the Source File Map and none of the ROSS CFs are documented there (`rossGetTemplates`, `rossCreateTemplate`, `rossUpdateTemplate`, `rossDeleteTemplate`, `rossGetWorkflows`, `rossCreateWorkflow`, `rossUpdateWorkflow`, `rossDeleteWorkflow`, `rossActivateWorkflow`, `rossManageTask`, `rossGetReports`, `rossScheduledReminder`, `rossV2Snooze`). Pre-existing drift surfaced during PR #30 review. Allowed-fields lists for each mutator are the highest-value payload — would have caught the PR #28 `t.id` bug at planning time.
13. **Build `/profile-settings.html` for ROSS user account** — sidebar/topbar footer (PR #48) reads `auth.currentUser` reactively but the gear icon is non-interactive because no settings page exists. Account-scoped (display name, password change, email, notification prefs) — `receipt-settings.html` is per-restaurant config, different domain. Once shipped, wire the footer click (`RossHomeDesktop.vue:118` block + `RossHomeMobile.vue` topbar) to navigate there. Belongs in Phase 6 polish or as standalone follow-up.
14. **Fold `readUserTier` into `verifyUserOrAdmin` — eliminate the extra RTDB read on the hot path for tier-gated handlers.** PR #51 review finding #3. Currently `verifyUserOrAdmin` already reads `admins/{uid}` and possibly `subscriptions/{uid}`; adding `users/{uid}/tier` to the same call would drop one round trip per request. Touches the return shape consumed by 10+ handlers (`rossCreateWorkflow`, `rossUpdateWorkflow`, `rossDeleteWorkflow`, `rossActivateWorkflow`, `rossGetTemplates`, `rossManageTask`, etc.) — broader perf-refactor PR than this branch warranted. Long-term: consider promoting `tier` to a Firebase Auth custom claim so it rides the decoded token at zero RTDB cost.
15. **Backfill script polish (PR 1A follow-up)** — (a) add a pre-flight check warning if `database.rules.json` has been deployed with a `.validate` on `tier` BEFORE the backfill runs (rules+unbackfilled-records gives unpredictable behaviour); (b) pull `databaseURL` from `process.env.FIREBASE_DATABASE_URL` with a fallback, guarded against accidental copy-paste into other Firebase projects. PR #51 review findings #7 and #8. Cheap; bundle into a single script-polish PR.

### Low Priority / Nice-to-Have

13. Subscription admin charts migration (deferred from Chart.js audit, items #7–10)
14. Group overview v2 → v1 promotion
15. Onboarding flow improvements
16. **Edit-mode multi-location pill render** — `RossPlaybookWorkflowEditor` hydrates only the first `locationId` on edit (because `workflowById` flattens by first match in the rossGetWorkflows response). Locked caption already explains it but a future audit could surface all attached locations as read-only pills.

---

## 🐛 Bug Triage Queue

> Bugs discovered during sprint work — log here instead of fixing immediately unless sprint-blocking.

| Bug | Severity | Discovered | Blocking Sprint? |
|-----|----------|------------|-----------------|
| `feature-access-control.js:64` dynamic import with `?v=${Date.now()}` cache-buster — Vite can't statically analyse a runtime-computed path, throws `Unknown variable dynamic import` on every `checkFeatureAccess` call post-build. Fix is one line (drop the `?v=…`; Vite content-hashes outputs natively) but the file is shared infra — every FeatureAccess consumer across the app calls it. Deserves own focused PR with consumer audit, NOT a fold-in. Discovered on PR #48 preview when operator opened `/ross.html` console. | Medium (visible console error, blocks no functionality) | PR #48 review | No |
| **`registerUser` callable throws `unauthenticated` on every call** — `functions/index.js:474` uses v1 callable signature `onCall((data, context) => ...)` but the prod runtime is Gen 2 (Node 22). Auth context arrives as the first arg (`request.auth`), not on a separate `context` param. Result: every fresh signup hits the v1 callable, gets `unauthenticated`, and `signup-service.js:109-111` silently swallows it and runs the Path B fallback. Production has been silently degraded for an unknown amount of time. Fix: migrate the handler to v2 callable signature `onCall((request) => { const { auth, data } = request; ... })`. Touches a 200-line handler with multiple readers; deserves own PR with careful diff. | **HIGH** (silent prod degradation; explains why fallback path keeps getting used) | PR #58 preview test | No (already mitigated by fallback; signup works) |
| **Mobile nav missing Playbook/Activity/People access** — operator flagged on PR #58 preview that the Ross home mobile bottom-nav doesn't expose the three governance destinations from the desktop sidebar. PR #48 noted the mobile topbar was supposed to fold them in. Either pre-existing on master or regression since PR #48. Investigation needed before fix. | Medium | PR #58 preview test | No |
| **Double-seed race on signup retry** — `rossSeedFirstWorkflow`'s idempotency pre-check is not transactional. A user double-clicking signup or hitting a network retry could pass the pre-check in both invocations and produce two seeded workflows. Mitigation options: (a) RTDB `transaction()` on the `firstWorkflowSeededAt` marker, OR (b) deterministic workflow ID per uid (e.g. `seed_{uid}` rather than push key) so duplicate write is overwrite. Exposure small; consequence mild (duplicate workflow, no corruption). | Low | PR #58 final review | No |

---

## 🏁 Recently Completed (last 5)

| Feature | PR | Merged |
|---------|----|--------|
| Housekeeping — gitignore local agent/editor state + Session Opening Protocol clarification + dead-worktree cleanup | #62, #63 | 2026-05-13 |
| Ross v2 fallback cards — snooze + nav hrefs on scripted/learning cards (recovered from `feature/ross-v2-actions` worktree; commit pre-dated PR #20's merge by 1 hour but never opened as own PR) | #61 | 2026-05-13 |
| project-status.json — sync after PR #58 merge (cherry-picked from `docs/post-pr58-reflect` worktree; missed from PR #59 reflect cycle) | #60 | 2026-05-13 |
| ROSS day-zero auto-activation (Phase 6 PR 2) — new `rossSeedFirstWorkflow` CF + client integration in `signup-service.js`; pure `buildLocationsFromTemplate`/`buildWorkflowRecord` helpers extracted from `rossActivateWorkflow` (17 unit tests); RTDB pointer `ross/config/firstWorkflowTemplateId` + one-off setup script. Architecture pivoted mid-PR after preview testing revealed `registerUser` callable bug. | #58 | 2026-05-12 |
| ROSS tier-gated template list + Hi-Fi upgrade page (Phase 6 PR 1C) — server `includeLocked` opt-in, locked card UX, `/upgrade.html` comparison page with email CTA | #55 | 2026-05-12 |

---

## 📝 How to Use This File

**At session start:** Claude reads this, states the Sprint Goal, and confirms whether to stay on track or pivot.

**During session:** If a bug surfaces, it goes in Bug Triage Queue unless it blocks the sprint. If the user pivots, update the Sprint Goal line and note the change.

**At session end:** Claude updates this file — marks sprint tasks done `[x]`, moves completed features to Recently Completed, logs any new bugs discovered, clears the In Progress row if the branch was merged.

**To change sprint focus:** Tell Claude "new sprint goal: [X]" — it will update this file and reorient.

**Two sources of truth, kept in sync:** This markdown is canonical. `public/data/project-status.json` mirrors it for the in-app `Project Status` dashboard — both get updated together until the dashboard auto-derives from this file (item #8 in the backlog).
