# Project Backlog — Sparks Hospitality

> Claude reads this file at the start of every session and updates it at the end.
> The Sprint Goal is the contract for the session — don't deviate without explicit user confirmation.

Last updated: 2026-04-30

---

## 🎯 Sprint Goal

**Complete the ROSS core milestone** — wire ROSS workflows into the admin dashboard, confirm end-to-end workflow execution, and reach a shippable v1 state for the ROSS module.

Sprint: 2026-04-30 → until complete

---

## 🔄 In Progress

| Item | Branch | Notes |
|------|--------|-------|
| — | — | ROSS PR #12 merged; no active branch at session start |

---

## ✅ Sprint Tasks

- [ ] Wire ROSS section into `admin-dashboard.html` section switcher (nav link + section ID)
- [ ] Confirm ROSS workflow list loads correctly for location admins
- [ ] End-to-end test: create workflow → assign tasks → mark complete
- [ ] Confirm workflow sharing (non-creator can view via location index PR #12)
- [ ] ROSS v1 smoke test pass — golden path + one error path

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

### Low Priority / Nice-to-Have

7. Subscription admin charts migration (deferred from Chart.js audit, items #7–10)
8. Group overview v2 → v1 promotion
9. Onboarding flow improvements

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
| ROSS location index — non-creators can see shared workflows | #12 | 2026-04-30 |
| ROSS KB sweep — DATA_MODEL, CLOUD_FUNCTIONS_CATALOG, rules line range | #11 | 2026-04-29 |
| ROSS write lock — clients must go through Cloud Functions | #10 | 2026-04-28 |
| ROSS persist documented workflow fields, fix KB drift | #9 | 2026-04-27 |
| ROSS restore workflow nav, relabel Hi-Fi surfaces as ROSS v2 | #8 | 2026-04-26 |

---

## 📝 How to Use This File

**At session start:** Claude reads this, states the Sprint Goal, and confirms whether to stay on track or pivot.

**During session:** If a bug surfaces, it goes in Bug Triage Queue unless it blocks the sprint. If the user pivots, update the Sprint Goal line and note the change.

**At session end:** Claude updates this file — marks sprint tasks done `[x]`, moves completed features to Recently Completed, logs any new bugs discovered, clears the In Progress row if the branch was merged.

**To change sprint focus:** Tell Claude "new sprint goal: [X]" — it will update this file and reorient.
