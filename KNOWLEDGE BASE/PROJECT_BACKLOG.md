# Project Backlog — Sparks Hospitality

> Claude reads this file at the start of every session and updates it at the end.
> The Sprint Goal is the contract for the session — don't deviate without explicit user confirmation.

Last updated: 2026-04-30

---

## 🎯 Sprint Goal

**Effective implementation of Hi-Fi v2, starting with ROSS** — turn the v2 ROSS scaffold into a real, data-wired feature. v2 stays flag-ON behind `/ross.html` until soaked.

**Mental model (locked 2026-04-30):** ROSS v1 isn't operator-facing compliance CRUD; it's the **policy + playbook the future AI agent runs against**. The 6 sibling v1 admin tabs collapse to 3 deeper governance destinations behind the concierge home (**Playbook / Activity / People**). LLM integration (`askRoss`) is now central, not deferred — own sprint.

Sprint: 2026-04-30 → until complete

---

## 🔄 In Progress

| Item | Branch | Notes |
|------|--------|-------|
| Phase 4a — Playbook read-view | `feature/ross-v2-playbook` | PR #21 open. Workflows + templates listing under `/ross.html?tab=playbook`. Edit/create lands in Phase 4d. |

---

## ✅ Sprint Tasks

### Phase 0–3 — Done

- [x] **Phase 0** — Project Status dashboard + sidebar cleanup (PR #16) + CORS fix for preview channels (PR #17)
- [x] **Phase 1** — Gap analysis & spec doc (`docs/plans/2026-04-30-ross-v2-implementation.md`, PR #18)
- [x] **Phase 2** — Right-rail + first-run findings wired (PR #19) — 1 real finding + 2 illustrative
- [x] **Phase 3** — Action handlers + snooze CF deployed (PR #20) — `rossV2Snooze` + `ross/v2Snoozes/{uid}` RTDB node + read-side filter

### Phase 4 — Admin redesign (concierge-first IA) — In progress

- [x] **IA reframe** — v1 = agent's playbook; concierge home stays front door; tabs collapse 6 → 3
- [ ] **Phase 4a** — Playbook tab read-view (this PR #21)
- [ ] **Phase 4b** — Activity tab (run history + reports)
- [ ] **Phase 4c** — People tab (staff assignments)
- [ ] **Phase 4d** — Playbook editing/creation flows (consolidates v1 Builder)

### Phase 5 — Onboarding

- [ ] Wire `/onboarding-ross-hello.html` to real `getFirstRunFindings()` output

### Phase 6 — askRoss LLM (separate sprint)

- [ ] New `rossChat` Cloud Function (Anthropic SDK + prompt caching)
- [ ] Eval harness (20-prompt golden set)
- [ ] Cost cap + secrets management

---

## 📋 Backlog (Prioritized)

### High Priority

1. **Food cost open PR** — review and merge the in-flight food-cost feature branch
2. **Chart.js retirement** — soak ends ~2026-05-07; execute removal per `KNOWLEDGE BASE/development/CHARTJS_REMOVAL_AUDIT.md` (16 of 23 sites have v2 replacements ready)
3. **ROSS obligation templates** — implement per `docs/plans/2026-03-20-obligation-templates-plan.md`

### Medium Priority

4. **Hi-Fi v2 → v1 promotions** — flip flag and promote completed v2 surfaces (guests, queue, analytics, campaigns, receipts) once soaked
5. **WhatsApp template UI polish** — surface improvements from `docs/plans/2026-02-19-whatsapp-template-management.md`
6. **QA cleanup** — execute `docs/plans/qa-cleanup-plan.md` (~65 test artifact files to remove)
7. **Sidebar dedup** — kill duplicate v2/v1 entries once v2 promoted
8. **Project status auto-derive** — read `PROJECT_BACKLOG.md` directly in the dashboard instead of maintaining `project-status.json` separately

### Low Priority / Nice-to-Have

9. Subscription admin charts migration (deferred from Chart.js audit, items #7–10)
10. Group overview v2 → v1 promotion
11. Onboarding flow improvements

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
| ROSS v2 — action handlers + snooze (Phase 3) | #20 | 2026-04-30 |
| ROSS v2 — wire right-rail + first-run findings (Phase 2) | #19 | 2026-04-30 |
| docs(ross-v2) — phase 1 gap analysis & spec | #18 | 2026-04-30 |
| fix(cors) — allow Firebase Hosting preview channels | #17 | 2026-04-30 |
| feat(project-status) — internal dashboard + sidebar cleanup | #16 | 2026-04-30 |

---

## 📝 How to Use This File

**At session start:** Claude reads this, states the Sprint Goal, and confirms whether to stay on track or pivot.

**During session:** If a bug surfaces, it goes in Bug Triage Queue unless it blocks the sprint. If the user pivots, update the Sprint Goal line and note the change.

**At session end:** Claude updates this file — marks sprint tasks done `[x]`, moves completed features to Recently Completed, logs any new bugs discovered, clears the In Progress row if the branch was merged.

**To change sprint focus:** Tell Claude "new sprint goal: [X]" — it will update this file and reorient.

**Two sources of truth, kept in sync:** This markdown is canonical. `public/data/project-status.json` mirrors it for the in-app `Project Status` dashboard — both get updated together until the dashboard auto-derives from this file (item #8 in the backlog).
