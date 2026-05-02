# Project Backlog — Sparks Hospitality

> Claude reads this file at the start of every session and updates it at the end.
> The Sprint Goal is the contract for the session — don't deviate without explicit user confirmation.

Last updated: 2026-05-02 (post PR #39 — Phase 5 PR 1 of 5 merged)

---

## 🎯 Sprint Goal

**Effective implementation of Hi-Fi v2, with ROSS as the central post-login surface for every subscribed user.** Workflows are the product; v1 modules become workflow step types over time.

**Mental model (locked 2026-04-30, refined 2026-05-02):** ROSS v1 isn't operator-facing compliance CRUD; it's the **policy + playbook the future AI agent runs against**. The 6 sibling v1 admin tabs collapse to 3 deeper governance destinations behind the concierge home (**Playbook / Activity / People**). The **playbook is the product** — workflows direct every operation; modules become step types inside workflows, not destinations. **Two tiers only**: Free (full ROSS UI + 5 starter templates) and All-in (full template library). No POS integrations yet — manual entry / file uploads only. LLM integration (`askRoss`) is now central, not deferred — own sprint.

Sprint: 2026-04-30 → until complete

---

## 🔄 In Progress

| Item | Branch | Notes |
|------|--------|-------|
| Post-merge sync after PR #39 | `docs/post-merge-sync-pr39` | Reflect cycle for Phase 5 PR 1. Once merged, next is PR ≈#41 = `feat/signup-v2-hifi` (Phase 5 PR 2). Note: PR ≈#40 will likely be this docs sync. |

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
- [ ] **PR 2 (≈#41)** — `feat/signup-v2-hifi`: Hi-Fi rewrite of `/signup.html`; tier collapse to Free/All-in; write `tier` to `subscriptions/{uid}` at signup. Depends on PR 1.
- [ ] **PR 3 (≈#42)** — `feat/homepage-v2-hifi`: Hi-Fi rewrite of `/index.html` with workflow-centric copy; embed synthetic public hello via reused `RossOnboardingHello.vue` component (different data feed). Independent of PRs 1/2.
- [ ] **PR 4 (≈#43)** — `feat/post-login-router-rollout`: wire remaining 5 redirect call sites to `routePostLogin`; `user-dashboard.html` gets a deprecation banner. **This is the moment ROSS becomes home.** Depends on PRs 1+2.
- [ ] **PR 5 (≈#44)** — `feat/ross-sidebar-cleanup`: collapse sidebar to just Today + Ross's brain (3 sections). v1 module deep-links removed from ROSS sidebar; operator reaches them via `/admin-dashboard.html`. Depends on PR 4.

Lower-priority Phase 5 items (deferred to dedicated polish PR after the 5-PR sequence): surface `store.error` in `RossOnboardingHello.vue`; lower `FINDING_MIN_LIFT` threshold; parallelise nested RTDB reads in `detectBestWeekday`; un-hardcode the 3-of-5 step counter.

### Phase 6 — Playbook UX enrichment + template library curation (next sprint after Phase 5 cleanup)

> **Vocabulary anchor (per `public/kb/features/ROSS.md`):** Templates → activated → Workflows (per location) → composed of Tasks → executed via Runs. The Runs server surface (`rossCreateRun`, `rossSubmitResponse`, auto-flag, 422-on-required-note) is already shipped — Phase 6 is the operator-facing UX layer on top, plus content (template curation + tier gating).

- [ ] **Curate starter library** — decide which 5 existing templates ship Free; what extends to All-in (existing seed has Opening Checklist, Closing Checklist, Weekly Deep Clean, Monthly Stock Audit per KB; need at least 1 more for free + N for all-in)
- [ ] **Tier-gated template list** — filter the existing Templates list inside the Playbook tab on `users/{uid}/tier` or `subscriptions/{uid}/tier`; gate `rossActivateWorkflow` server-side too (defence in depth)
- [ ] **Day-zero auto-activation** — at account creation (post-onboarding completion), programmatically call `rossActivateWorkflow` for one starter template against the user's default location, so a new operator lands in ROSS with one runnable workflow already attached. May need a new CF (e.g. `rossSeedFirstWorkflow`) or a hook in `signup.js` / wizard completion
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
| — | — | — | — |

---

## 🏁 Recently Completed (last 5)

| Feature | PR | Merged |
|---------|----|--------|
| ROSS v2 — post-login router foundation + hello auth gate (Phase 5 PR 1) | #39 | 2026-05-02 |
| docs(ross-v2) — post-merge sync + reflect cycle after PR #37 | #38 | 2026-05-02 |
| docs(ross-v2) — phase 5 spec: ROSS as central funnel + cleanup plan | #37 | 2026-05-02 |
| docs(ross-v2) — post-merge sync + reflect cycle after PR #35 | #36 | 2026-05-02 |
| ROSS v2 — Subtask→task inputType propagation + template-level editor (Phase 4e.2) | #35 | 2026-05-01 |

---

## 📝 How to Use This File

**At session start:** Claude reads this, states the Sprint Goal, and confirms whether to stay on track or pivot.

**During session:** If a bug surfaces, it goes in Bug Triage Queue unless it blocks the sprint. If the user pivots, update the Sprint Goal line and note the change.

**At session end:** Claude updates this file — marks sprint tasks done `[x]`, moves completed features to Recently Completed, logs any new bugs discovered, clears the In Progress row if the branch was merged.

**To change sprint focus:** Tell Claude "new sprint goal: [X]" — it will update this file and reorient.

**Two sources of truth, kept in sync:** This markdown is canonical. `public/data/project-status.json` mirrors it for the in-app `Project Status` dashboard — both get updated together until the dashboard auto-derives from this file (item #8 in the backlog).
