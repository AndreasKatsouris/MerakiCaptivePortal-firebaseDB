# ROSS Hardening — Design Document

**Date:** 2026-03-09
**Branch:** `fix/ross-hardening`
**Scope:** All CRITICAL (excl. C2 file refactor), HIGH, and MEDIUM issues identified in the ROSS multi-agent review.

---

## Context

A three-agent review (ARCH, BACK, FRONT) of the ROSS module identified 23 actionable issues across:
- `functions/ross.js` — Cloud Functions
- `public/js/modules/ross/index.js` — Vue 3 CDN frontend
- `public/js/modules/ross/services/ross-service.js` — Service client
- `database.rules.json` — RTDB security rules

C2 (monolithic 1867-line file refactor into components) is explicitly deferred.

---

## Team Structure

| Agent | Files | Responsibility |
|-------|-------|----------------|
| BACK  | `functions/ross.js` | C4, H1, H5, H6, H7 + medium backend fixes |
| FRONT | `index.js`, `ross-service.js` | C1, C5, H2, H3, H4, H8 + medium frontend fixes |
| SEC   | `ross.js`, `database.rules.json` | C3 auth gap (primary owner) |
| QA    | All modified files (read-only) | Verify diffs, catch regressions, edge cases |

All agents run in **plan-approval mode** — COORD approves every plan before implementation begins.

---

## Issues by Agent

### SEC

**C3 — Template CRUD auth gap**
- `functions/ross.js:101,145,186` use `verifyAdmin()` but `database.rules.json:360` requires `superAdmin`
- Admin SDK bypasses RTDB rules — any admin can mutate templates
- Decision: align functions to `verifySuperAdmin()` OR relax RTDB rules to match current intent
- Recommendation: restore `verifySuperAdmin()` on template CRUD functions; document the decision in `ROSS.md`

### BACK

**C4 — `rossUpdateTemplate` null crash**
- `ross.js:155`: add null guard before `updates.category` access
- Same pattern in `rossUpdateWorkflow:371` — fix both

**H1 — Pause/resume silently broken**
- `ross.js:371`: add `'status'` to `allowedFields` with validation against `['active', 'paused']`

**H5 — Scheduled reminder O(N) scan**
- `ross.js:648`: replace full-tree `once('value')` with per-owner iteration or index node

**H6 — `rossManageTask` taskData required for delete**
- `ross.js:482`: move `taskData` guard inside the switch, only require it for non-delete actions

**H7 — `rossCompleteTask` race condition**
- `ross.js:549-553`: wrap "all tasks complete" check in RTDB transaction

**Medium backend:**
- Fragile error status code string matching → custom error codes
- No `daysBeforeAlert` array content validation → validate positive integers
- `rossDeleteTemplate` / `rossDeleteWorkflow` don't check existence before delete
- No idempotency check on task completion (`completedAt` overwritten)
- Category/recurrence constants (`ross.js:22-23`) diverge from docs — sync with `ROSS.md`

### FRONT

**C1 — Vue app orphan on tab switch**
- `index.js:100`: add `if (rossState.app) cleanupRoss()` as first line of `initializeRoss()`

**C5 — `rossState.locationId` persists across auth sessions**
- Attach Firebase `onAuthStateChanged` listener in `initializeRoss()`; call `cleanupRoss()` on user change

**H2 — Shared `tabLoading` race condition**
- Replace single `tabLoading` boolean with per-tab flags: `workflowsLoading`, `templatesLoading`, `reportsLoading`, `staffLoading`

**H3 — `rossState` singleton mutation**
- Fold `locationId` into Vue `data()` — remove from module-level `rossState`; keep only `rossState.app` for cleanup

**H4 — Service client params mismatch**
- `ross-service.js:65-71`: remove unused `locationId` param from `updateWorkflow()` and `deleteWorkflow()`

**H8 — `getIdToken(true)` unnecessary refresh**
- `ross-service.js:15`: change to `getIdToken()` (no `true`)

**Medium frontend:**
- Template editor `v-model` direct mutation → use spread on save
- `loadStaff()` eager on mount → lazy-load only when staff tab is activated
- No debounce/cancellation on `switchTab()` → add version counter or AbortController
- `loadAvailableLocations()` over-fetches entire `/locations` node → filter to current user's locations
- Builder form state persists across location changes → reset builder on location change
- Dead `isSuperAdmin` / `checkSuperAdmin()` code → remove

### QA

After BACK, FRONT, SEC all complete:
- Read all modified files in the worktree
- Verify each fix addresses its stated issue
- Check for regressions (e.g., does H3 locationId move break staff tab sync?)
- Check for interactions between fixes (e.g., C1 guard + C5 auth listener — do they conflict?)
- Flag any new issues introduced

---

## Worktree

- Directory: `.worktrees/ross-fixes`
- Branch: `fix/ross-hardening`
- Communication: `.worktrees/ross-fixes/comms.md`

---

## Success Criteria

- All 23 issues resolved (4 CRITICAL, 8 HIGH, 11 MEDIUM)
- QA finds no regressions
- `ROSS.md` updated to reflect auth decision on C3 and corrected constants
- No new `console.log` statements, no hardcoded values, no mutation patterns
