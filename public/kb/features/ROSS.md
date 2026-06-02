# ROSS — Restaurant Operations Support System

ROSS is a workflow automation and compliance module built into the Sparks Hospitality admin dashboard. It allows restaurant owners and managers to create, assign, and track recurring operational workflows (opening checklists, closing procedures, hygiene audits, etc.) across one or more locations.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Structure (RTDB)](#database-structure)
4. [Cloud Functions](#cloud-functions)
5. [Frontend Vue Module](#frontend-vue-module)
6. [Admin Dashboard Integration](#admin-dashboard-integration)
7. [Tabs & Features](#tabs--features)
8. [Known Bugs Fixed](#known-bugs-fixed)
9. [Templates & Seed Data](#templates--seed-data)
10. [Deployment Notes](#deployment-notes)

---

## Overview

ROSS provides:
- **Workflow builder** – Create workflows from scratch or from reusable templates
- **Workflow tracker** – View active workflows per location with status and due dates
- **Staff assignment** – Assign individual tasks within a workflow to staff members
- **Template library** – Reusable workflow templates with subtasks, categories, and recurrence
- **Overview stats** – Cards showing active, overdue, and upcoming workflows

---

## v2 mental model — agent governance (locked 2026-04-30)

The v1 admin module is reframed in v2 as **"Ross's playbook" — the rules and procedures the future AI agent runs against**. Workflows + templates aren't operator-facing compliance CRUD; they're the policy the agent will execute (with humans approving / overriding) once the LLM lands.

### Information architecture

The v2 surface is **concierge-first**. The home (`/ross.html`) stays the front door — narrative, "3 things worth your attention", "Ask Ross". Everything else is a deeper governance destination, routed via `?tab=` on the same URL:

| URL | Replaces (v1 tabs) | Mental model |
|-----|---------------------|--------------|
| `/ross.html` | (concierge home — new) | "What should I look at today?" — Ross's voice |
| `/ross.html?tab=playbook` | Workflows + Builder + Templates | "How should Ross behave?" — author rules / templates / triggers / thresholds |
| `/ross.html?tab=activity` | Reports + Run history | "What did Ross do?" — execution log; eventually agent-run + human-run interleaved |
| `/ross.html?tab=people` | Staff | "Who's in the loop?" — staff + (later) approval-step routing |

Six v1 tabs collapse to three v2 destinations + the concierge home. Tab routing is implemented in `public/js/modules/ross/v2/components/RossHome.vue` using `URLSearchParams` + `popstate` listener — no client-side router framework, no full page reloads.

### Backwards compatibility

The v1 admin remains reachable at `admin-dashboard.html#rossContent` for the entire soak period. It's the rollback net. Cloud Functions are unchanged — the v2 surfaces wrap them via thin per-tab service files (e.g. `playbook-service.js`).

### Phase status (as of 2026-05-02)

| Phase | Status |
|-------|--------|
| Home feed (`getHomeFeed`) wired to RTDB detectors | ✅ shipped (PR #19, Phase 2 confirmed) |
| Right-rail + first-run findings | ✅ PR #19 |
| Action handlers + snooze | ✅ PR #20 |
| Playbook tab read-view | ✅ PR #21 |
| Activity tab | ✅ PR #23 (locationName enrichment fix in PR #24) |
| People tab | ✅ PR #25 — first **edit-capable** v2 surface |
| Playbook editing — workflow create / edit / pause / delete | ✅ Phase 4d.1 |
| Playbook editing — template CRUD | ✅ Phase 4d.2 (PR #30, superAdmin) |
| Per-task `inputType` / `inputConfig` editor | ✅ Phase 4e.1 (PR #32) + 4e.2 (PR #35) |
| Phase 5 spec — central-funnel cleanup | ✅ PR #37 |
| Onboarding wired (router + auth gate + helloSeen) | ⏳ Phase 5 PR 1 of 5 |
| `askRoss` LLM | 🔮 separate sprint (Phase 7) |

### Onboarding handoff — `helloSeen` field (Phase 5 PR 1)

The Ross v2 first-run hello (`/onboarding-ross-hello.html`) sits between signup and the business-data wizard. To prevent re-showing it on every login, `RossOnboardingHello.vue.onContinue` writes `helloSeen: true` to `onboarding-progress/{uid}` before redirecting to the wizard. The post-login router (`public/js/auth/post-login-router.js`) reads this field to decide between hello / wizard / ross / legacy-dashboard destinations.

**Field contract:**
- Path: `onboarding-progress/{uid}.helloSeen` (boolean)
- Writer: `RossOnboardingHello.vue` (component) + `signup.js` (initialisation to `false`)
- Reader: `post-login-router.js` (only consumer)
- Backwards-compat: missing field on a `completed: true` node ⇒ router treats as `true` (existing accounts never get shown the hello retroactively)
- Wizard's completion path uses `update()` not `set()` to preserve this field — see `onboarding-wizard.js:381` and the warning in `KNOWLEDGE BASE/architecture/DATA_MODEL.md`

### People tab — patterns established (PR #25)

`?tab=people` is the first v2 surface that mutates RTDB. The patterns landed here become the template for Phase 4d (Builder edit/create):

- **Location picker pills** at the top, auto-hidden when the user has only one location.
- **Inline editor panel** for create + edit (no modals). Opens above the staff list, closes on save/cancel.
- **Two-step inline delete** — `Remove` → row's actions become `Confirm` / `Cancel` in place. No SweetAlert2 modal; matches the inline-editor visual language. (CLAUDE.md's "SweetAlert2 for all notifications" convention was written for v1 surfaces; v2 is establishing its own. An `HfModal`/`HfConfirm` pair may land in the design system later for cases that genuinely need a modal.)
- **Inline error banners** — save errors render in the editor panel; delete errors render scoped under the affected row. Server messages surface verbatim.
- **Phone normalization is client-side.** `rossManageStaff` stores `staffData.phone` raw, so the People store normalizes to E.164 (`+27…` for SA inputs) before calling. SMS routing downstream depends on this — never push a typed `082 555 1234` to the server.

### Playbook tab — patterns established (PR 4d.1)

`?tab=playbook` extends the People-tab inline patterns to a heavier surface (multi-section editor + per-card lifecycle actions). Phase 4d.2 (template CRUD) and 4e (per-task config) inherit these decisions.

- **Single-instance inline editor** — `RossPlaybookWorkflowEditor.vue` mounts above the workflow list, replacing the previous read-only header strip while open. Three modes share one component: `create` (custom workflow), `edit` (existing workflow), `activate` (template instantiation). Mode is derived from store state (`editingWorkflowId`, `activateTemplateId`).
- **Slide-down delete confirm strip** — replaces SweetAlert2 for cases where People's row-inline `Confirm / Cancel` doesn't fit. Renders full-width below the workflow card, warn-tone bordered, with copy that carries the gravity ("Delete X? This removes it from every location and clears its task history."). 30 lines of CSS, no design-system component. `HfModal` is deferred until something needs a true overlay.
- **Field-level locking** — the editor visually disables fields the server won't accept on update. `rossUpdateWorkflow`'s `allowedFields` are limited to `name`, `notificationChannels`, `notifyPhone`, `notifyEmail`, `daysBeforeAlert`, `status`. **Description, category, recurrence, locations, and subtasks are not editable** — to change them the user must delete and recreate. The form shows a `locked` mono-tag next to each disabled field and a passive caption at the top of the editor explaining the limit.
- **Reorder via explicit up/down buttons, not drag-and-drop** — `RossPlaybookSubtaskRow.vue` exposes `↑ / ↓ / ✕`. Keyboard-reachable, mobile-friendly, matches Hi-Fi v2's pointer-and-keyboard minimalism. Drag-and-drop is *not* a goal in v2.
- **Per-task `inputType` / `inputConfig` editor is deferred to Phase 4e.** 4d.1 ships subtasks with `title + daysOffset + order` only; server defaults `inputType: 'checkbox'` (functions/ross.js) which covers the goldenpath. The 11-input-type matrix × per-type config UI is its own design surface.
- **`fetchLocationNames` factor-out** — extracted to `public/js/modules/ross/v2/utils/location-names.js` after this PR's editor became the fourth call-site. Activity / playbook stores swapped to the import; people store will swap on next touch.
- **Server contract mirrors** — `VALID_CATEGORIES` and `VALID_RECURRENCES` are exported from `playbook-store.js` so the editor validates before the round trip. Keep in sync with `functions/ross.js` if the server list changes.

---

## Architecture

```
Admin Dashboard (admin-dashboard.html)
  └── admin-dashboard.js  ← controls section switching; calls initializeRoss()
        └── public/js/modules/ross/index.js  ← Vue 3 CDN app, all ROSS UI
              └── Firebase Cloud Functions (ross.js)
                    └── Firebase RTDB: /ross/...
```

ROSS is implemented as a **Vue 3 CDN global** app mounted on `#ross-app` inside the `rossContent` section panel.

---

## Database Structure

All ROSS data lives under the `/ross` root in Firebase RTDB.

### Workflows

```
ross/
  workflows/
    {uid}/                        ← owner user ID
      {workflowId}/
        workflowId: string
        ownerId: string           ← uid of the owning admin
        templateId: string?       ← null for custom workflows
        name: string
        description: string?
        category: string          ← 'compliance' | 'operations' | 'growth' | 'finance' | 'hr' | 'maintenance'
        recurrence: string        ← 'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
        customInterval: number?   ← positive integer; null otherwise
        notificationChannels: string[]   ← currently always ['in_app'] (Phase 2: phone/email)
        notifyPhone: string?      ← captured but not delivered (Phase 2)
        notifyEmail: string?      ← captured but not delivered (Phase 2)
        daysBeforeAlert: number[] ← positive integers; defaults to [30, 7]
        createdAt: number
        updatedAt: number
        locations/
          {locationId}/
            locationName: string
            locationAssignedTo: string?  ← staff member id or null
            status: string               ← 'active' | 'overdue' | 'completed'
            nextDueDate: string          ← ISO date string
            activatedAt: number
            tasks/
              {taskId}/
                title: string
                status: string           ← 'pending' | 'completed'
                dueDate: number
                completedAt: number?
                assignedTo: string?
                order: number
            history/                     ← written when all required tasks complete
              {historyId}/
                completedAt: number
                ...
```

> **Important — tasks are per-location, not at workflow root.** Each location keeps its own `tasks/` subtree so that location-specific assignment, completion, and history can be tracked independently. The frontend (`rossGetWorkflows` consumer) flattens this into a single workflow view by reading the active location's tasks.

> **Phase 2 fields.** `notifyPhone` / `notifyEmail` are stored but no Twilio/SendGrid delivery is wired yet — only `in_app` reminders fire via `rossScheduledReminder`. `customInterval` is captured and validated but the recurrence engine still uses the discrete `recurrence` string; `customInterval` is reserved for a future custom-cadence engine.

### Templates

```
ross/
  templates/
    {templateId}/
      templateId: string         ← canonical id field (server seed + rossCreateTemplate)
      name: string
      description: string
      category: string             ← compliance | operations | growth | finance | hr | maintenance
      recurrence: string           ← once | daily | weekly | monthly | quarterly | annually
      daysBeforeAlert: number[]    ← e.g. [30, 7]
      subtasks: Subtask[]          ← canonical task list; each { title, daysOffset?, order?, inputType?, inputConfig? } — inputType/inputConfig propagate to per-location tasks at activation time (Phase 4e.2)
      tags: string[]
      notificationChannels: string[]   ← currently always ['in_app']
      createdAt: number
      updatedAt: number
```

> **Task input types.** Workflow tasks (under `ross/workflows/{uid}/{workflowId}/locations/{locationId}/tasks/{taskId}`) and template subtasks both carry `inputType` and `inputConfig` fields. `VALID_INPUT_TYPES = ['checkbox', 'text', 'number', 'temperature', 'yes_no', 'dropdown', 'timestamp', 'photo', 'signature', 'rating']` (functions/ross.js:25-28). Server enum-validates `inputType` at every write path (`rossCreateWorkflow`, `rossCreateTemplate`, `rossUpdateTemplate`, `rossManageTask`); `inputConfig` is stored verbatim. Runtime semantics live in `validateResponseValue` / `isResponseFlagged` (functions/ross.js:1036-1058). `inputConfig` shapes with proven server semantics: `{ min, max, requiredNote, unit }` for `number`/`temperature` (auto-flag breaches, enforce note); `{ options: string[] }` for `dropdown`; `{ scale, requiredNote }` for `rating`. Other types accept advisory keys the runner may use later.
>
> **Subtask → task propagation (Phase 4e.2).** `rossCreateWorkflow` and `rossActivateWorkflow` route every subtask through the shared `buildTaskFromSubtask(subtask, nextDueDate)` helper (functions/ross.js, defined just above WORKFLOW OPERATIONS). The helper carries `inputType` (defensively defaults to `'checkbox'` for legacy subtasks with no value) and `inputConfig` (stored verbatim) into the per-location task object. Centralised so create-from-scratch and activate-from-template never drift apart. Existing in-flight workflow tasks created before 4e.2 simply lack the field; all UI reads use `task.inputType || 'checkbox'`.

### Owner Index (Fan-out)

```
ross/
  ownerIndex/
    {uid}: true                   ← written by rossCreateWorkflow / rossActivateWorkflow
                                  ← removed by rossDeleteWorkflow when last workflow deleted
```

> **Hardening change:** `rossScheduledReminder` previously scanned the entire `/ross/workflows` tree (O(N) over all owners). It now reads `ross/ownerIndex` to enumerate only owners with active workflows, then iterates per-owner.

### Workflows By Location (Reverse Index)

```
ross/
  workflowsByLocation/
    {locationId}/
      {workflowId}: ownerUid           ← string uid of the workflow creator
```

Maintained atomically with the workflow record:
- **Write:** `rossCreateWorkflow` and `rossActivateWorkflow` write one entry per attached locationId in the same multi-path update as the workflow itself.
- **Remove:** `rossDeleteWorkflow` removes every entry for the workflow's locations.

**Why it exists.** Without this index, per-location ROSS functions had no way to know a workflow's owner uid given just `(workflowId, locationId)`. Pre-existing code used the *caller's* uid in the read path, which silently broke for any non-creator user with access to the same location (e.g. a second admin sharing a location, a super admin, a future staff role).

**Read flow.** Every location-scoped read function now resolves the owner first:
```js
const ownerUid = await resolveWorkflowOwner(workflowId, locationId, callerUid);
// then read /ross/workflows/{ownerUid}/{workflowId}/...
```
`resolveWorkflowOwner` returns the indexed owner when present, and falls back to the caller's own tree (transition-period safety for pre-backfill workflows). Functions affected: `rossGetWorkflows`, `rossGetReports`, `rossCompleteTask`, `rossCreateRun`, `rossSubmitResponse`, `rossGetRun`, `rossGetRunHistory`.

**Owner-only operations** (`rossUpdateWorkflow`, `rossManageTask`, `rossDeleteWorkflow`) intentionally do *not* use the index — they continue to scope by `${callerUid}` so only the creator can change workflow metadata or task structure. A non-creator hitting these gets a 404, which is the intended behaviour.

**Backfill.** Existing workflows pre-dating this index need an entry written. Run `node functions/seeds/ross-backfill-workflows-by-location.js` once after deploy. The script is idempotent.

### Task Object

```json
{
  "id": "task-uuid",
  "title": "Check gas valve",
  "description": "Optional detail",
  "required": true,
  "order": 0,
  "inputType": "checkbox",
  "inputConfig": {
    "unit": "°C",
    "max": 5,
    "min": 0,
    "requiredNote": false,
    "options": []
  },
  "assignedTo": "staffMemberId",
  "completedAt": null,
  "completedBy": null
}
```

`inputType` controls the UI control rendered when a staff member executes the workflow. `inputConfig` holds type-specific configuration (unit labels, thresholds, dropdown options, max stars). Both fields are optional — tasks without `inputType` default to `checkbox`.

### Runs

```
ross/
  runs/
    {uid}/                              ← owner user ID (matches workflows scoping)
      {workflowId}/
        {locationId}/
          {runId}/
            runId: string
            workflowId: string
            locationId: string
            startedAt: number
            startedBy: string (uid)
            status: string               ← 'in_progress' | 'completed'
            completedAt: number?
            completedBy: string?
            onTime: boolean?             ← set on completion
            flaggedCount: number?        ← set on completion
            responses/
              {taskId}/
                value: any
                note: string?
                submittedAt: number
                submittedBy: string
                flagged: boolean
                inputType: string
```

> **No `current/history/` split.** Runs are stored flat under `runId`. In-progress and completed runs live side-by-side; consumers filter on `status`. `rossGetRun` returns the latest in-progress run plus the most recent completed run as `previousResponses`. `rossGetRunHistory` lists completed runs newest-first.

### Runs lifecycle

- **`rossCreateRun` is idempotent.** If a run with `status: 'in_progress'` already exists for the workflow+location, it is returned instead of creating a new one. This prevents duplicate runs when a user reloads or clicks "start" twice. The new run is stamped with `startedBy: callerUid` so audits can distinguish runs initiated by the workflow creator from runs started by another admin/staff with location access.
- **`rossSubmitResponse` writes one task response at a time.** It auto-flags responses where `Number(value)` is outside `inputConfig.min`/`inputConfig.max` (applies to `number` and `temperature` input types). When a response is auto-flagged AND the task's `inputConfig.requiredNote === true`, submission is rejected with HTTP **422** until the client sends a non-empty `note`. Frontend must surface the 422 and prompt for the note.
- **Auto-completion.** After every response submission the function checks whether all `required: true` tasks have a response. If so, the run is marked `status: 'completed'`, `completedAt` / `completedBy` are stamped, `onTime` is computed against the location's `nextDueDate`, and `flaggedCount` is summed across responses.

---

## Day-zero auto-activation

A new operator who completes signup via `registerUser` is automatically
opted into one seeded workflow so they land on ROSS with something
runnable. Mechanics:

- Template selection is driven by an RTDB pointer at
  `ross/config/firstWorkflowTemplateId`. The pointer is set once per
  environment by `functions/seeds/ross-config-set-first-workflow.js`,
  which resolves the "Daily Opening Checklist" template by name.
- The seed runs inline inside `registerUser`, immediately after the
  user's first location is created. It writes the workflow, the
  ownerIndex, the per-location index, an `onboarding-progress/{uid}/
  firstWorkflowSeededAt` marker, and an audit-log entry at
  `ross/auditLog/firstWorkflowSeeded/{pushId}` — all in a single
  atomic `update()`.
- Failure is silent and logged. If the pointer is absent, the template
  is missing, the template is misconfigured to All-in, or any RTDB
  call throws, the seed is skipped and the user lands on an empty
  Playbook (same as the pre-day-zero behaviour). `registerUser` itself
  always succeeds.
- Admin-provisioned accounts via `createUserAccount` are NOT seeded —
  that flow has different stakeholders and may already attach workflows.

Operator can swap the seeded template at any time by re-running the
setup script after editing its `SEED_TEMPLATE_NAME` constant, or by
writing the pointer directly via the Firebase Console.

---

## Tier gating (Phase 6 PR 1A — shipped 2026-05-11)

Templates carry a `tier: 'free' | 'all-in'` field (required, `.validate`-enforced).
Users have `users/{uid}/tier` written at signup. Gate fires at three points:

- **Server read (`rossGetTemplates`)**: filter response by user tier. Free users
  receive only `tier: 'free'` templates. SuperAdmin sees all.
- **Server activate (`rossActivateWorkflow`)**: reject 403 if a Free user tries
  to activate an All-in template. Denial logged to
  `ross/auditLog/templateActivationDenials/{pushId}`.
- **Client render (`RossPlaybook.vue`)**: defensive filter — same logic, prevents
  stale-cache flash-of-all-in.

### Tier downgrade policy

**Activation-time gate only.** If an All-in user downgrades to Free with active
workflows from premium templates, those workflows keep running on their own
schedule. They cannot activate *new* All-in workflows post-downgrade, but
existing work is never yanked. This is intentional — don't pull paid work out
from under operators.

### Missing tier fields (fail closed)

The server- and client-side filters treat missing `users/{uid}/tier` as `'free'`
(most-restrictive). Templates missing the `tier` field are excluded from Free
users entirely. Post-backfill (PR 1A migration) every template has `tier` set,
so this only matters during the deploy window.

### Curated tier split (Phase 6 PR 1B, 2026-05-12)

The 13 starter templates ship across two tiers, enforced by the PR 1A gate
mechanism described above.

**Free (5) — "Run your day on ROSS":**

| Template | Cadence | Role |
|---|---|---|
| Daily Opening Checklist | daily | Daily habit anchor |
| Daily Closing Checklist | daily | Daily habit anchor (pair) |
| Weekly Deep Clean Checklist | weekly | Weekly cadence demonstration |
| Monthly Food Cost Review | monthly | Cross-sells the food-cost module |
| Health & Safety Audit | quarterly | SA-locale compliance taste |

**All-in (8) — depth, back-office, high-stakes compliance:**

| Template | Category | Why upgrade-gated |
|---|---|---|
| Certificate of Acceptability | compliance | High-stakes SA regulatory annual |
| Liquor Licence Renewal | compliance | Revenue-blocking if missed |
| Weekly Social Media Campaign | growth | Growth category — ROI conversation |
| Monthly Google Review Campaign | growth | Growth depth |
| Weekly Supplier Payment Run | finance | Back-office finance depth |
| Monthly Staff Meeting | hr | HR entirely behind paywall — for teams |
| Quarterly Staff Performance Review | hr | HR depth |
| Monthly Equipment Service Check | maintenance | Maintenance category — back-office |

**Curation principle:** Free covers the daily habit anchor plus one template
per major cadence (weekly / monthly / quarterly), with one SA-locale
compliance taste. All-in unlocks entire categories (HR, growth, maintenance)
rather than scattered templates, so the upgrade conversation is "unlock the
rest of the playbook" rather than "unlock one more weekly checklist".

**Note on existing workflows:** The activate-time gate only affects *new*
activations. Workflows already activated before the curation flip continue
to run regardless of the source template's current tier. The one-off
update script (`functions/seeds/ross-templates-curate-tiers.js`) only
touches `ross/templates/*/tier`, never `ross/workflows`.

See `docs/plans/2026-05-12-ross-tier-curation-design.md` for the full rationale.

### Locked-card upsell UX (Phase 6 PR 1C, 2026-05-12)

Free users now see all 13 templates in the v2 Playbook tab, not just the
5 Free ones. The 8 All-in templates render as **dimmed cards** (opacity
0.7) with an `All-in` badge top-right and a `Upgrade to All-in` ghost
button instead of the normal `Activate` button. The button routes to
`/upgrade.html?from=template&id=<templateId>` — a Hi-Fi Vue 3 page that
shows a Free vs All-in comparison and an email contact CTA (self-service
checkout is Phase 6 D).

**Server contract:** `rossGetTemplates` accepts an opt-in
`includeLocked: true` request param. When set, Free users receive All-in
templates in the response with `locked: true` stamped on them instead
of being filtered out. v1 admin callers omit the param and continue to
receive the filtered list — no regression.

**Defense in depth:** the client never calls `rossActivateWorkflow` for
locked templates (the upgrade button short-circuits to the upgrade
page). Additionally, `RossPlaybook.vue` filters out any all-in template
that arrives without `locked: true` — defending against a stale-cache
or malformed-server response from rendering a live Activate button.
PR 1A's activate gate remains the security backstop — any direct
attempt to activate a locked template is rejected 403 and logged to
`ross/auditLog/templateActivationDenials/{pushId}`.

See `docs/plans/2026-05-12-ross-tier-gated-template-list-design.md`.

---

## Cloud Functions

All ROSS functions are defined in `functions/ross.js` and exported from `functions/index.js`.

| Function | Auth | Description |
|---|---|---|
| `rossGetWorkflows` | `verifyAdmin` | List all workflows for the current user, flattened with location data |
| `rossCreateWorkflow` | `verifyAdmin` | Create a new workflow, attach to `locationIds[]`, write `ownerIndex`; enum-validates `inputType` on subtasks. **Workflow-cap gated (④a §8):** active count vs `subscriptions/{uid}/limits/maxWorkflows` (active = `status !== 'paused'`) → 403 `WORKFLOW_LIMIT_REACHED` + `upgradeUrl`; superAdmin bypasses; absent/`-1` ⇒ unlimited. Add-on packs sell against it (`deltas.limits.maxWorkflows: +N`) |
| `rossUpdateWorkflow` | `verifyAdmin` | Update workflow metadata; null guard on `updates`; `status` field validated against `['active','paused']`; `daysBeforeAlert` validated to positive integers |
| `rossDeleteWorkflow` | `verifyAdmin` | Delete a workflow (404 if not found); clean up `ownerIndex` when last workflow removed |
| `rossManageTask` | `verifyAdmin` | Create / update / delete a task; `taskData` guard scoped to `create` and `update` only -- delete works without `taskData`; enum-validates `inputType` on update |
| `rossCompleteTask` | `verifyAdmin` | Mark a task complete using RTDB transaction (atomic); returns 404 if task not found; writes history record when all tasks in a location are done |
| `rossActivateWorkflow` | `verifyAdmin` | Attach an existing workflow to additional locations; write `ownerIndex`. Tier-gated (Phase 6 PR 1A): All-in template activation by a Free user returns 403 + audit-log entry. **Workflow-cap gated (④a §8):** same `maxWorkflows` check as `rossCreateWorkflow` → 403 `WORKFLOW_LIMIT_REACHED` |
| `rossSeedFirstWorkflow` | `verifyUserOrAdmin` | Day-zero auto-activation (PR #58). Resolves location from `userLocations/{uid}` and templateId from `ross/config/firstWorkflowTemplateId`; idempotent via `onboarding-progress/{uid}/firstWorkflowSeededAt` marker. Returns `{ skipped: true, reason: 'already_seeded'\|'no_locations' }` or `{ created: true, workflowId, locationId }` |
| `rossGetTemplates` | `verifyAdmin` | List all templates (public + own); filters by user tier (Phase 6 PR 1A); opt-in `includeLocked:true` returns locked All-in templates with `locked:true` for upgrade UI (Phase 6 PR 1C) |
| `rossCreateTemplate` | `verifySuperAdmin` | Create a new template; enum-validates `inputType` on subtasks |
| `rossUpdateTemplate` | `verifySuperAdmin` | Update an existing template; null guard on `updates`; enum-validates `inputType` on subtasks |
| `rossDeleteTemplate` | `verifySuperAdmin` | Delete a template (404 existence check added) |
| `rossGetReports` | `verifyAdmin` | Fetch completion reports across all workflows and locations. Returns `{ workflowId, name, category, recurrence, locationId, locationName, status, nextDueDate, tasksTotal, tasksCompleted, completionRate, history }[]`. **`status` here is `locData.status` — set to `'active'` on activation and never updated.** Use `nextDueDate < today` for derived overdue state, not `status === 'overdue'` (PR #72 lesson; client-side helper at `public/js/modules/ross/v2/workflow-status.js` shipped in PR #86) |
| `rossManageStaff` | `verifyUserOrAdmin` | Create / update / delete a staff member for a location; verifies `verifyLocationAccess` |
| `rossGetStaff` | `verifyAdmin` | List staff members for a location |
| `rossScheduledReminder` | Scheduled (cron `0 5 * * *`) | Fan-out via `ross/ownerIndex` instead of full-tree scan |
| `rossCreateRun` | `verifyAdmin` | Create or return the current in-progress run for a workflow+location (idempotent). **Returns `{ success, runId, run, created }`** — the run object is nested under `.run` (verbatim shape per `functions/ross.js:1388` existing-run path and `:1405` new-run path; copy into vitest mocks rather than reconstruct) |
| `rossSubmitResponse` | `verifyAdmin` | Submit a typed response for a task within a run; auto-flags out-of-range `number`/`temperature` values; enforces `requiredNote` (returns HTTP **422** until note supplied). **Returns `{ success, taskId, flagged, runCompleted }`** — NOT the full responses map |
| `rossGetRun` | `verifyAdmin` | Get the current run and previous responses for a workflow+location |
| `rossGetRunHistory` | `verifyAdmin` | List completed runs (newest first, paginated) for a workflow+location |
| `rossV2Snooze` | `verifyUserOrAdmin` | Snooze a home-feed card by id (PR #20). POST body: `{ cardId, hours }`. Writes to `ross/v2Snoozes/{uid}/{cardId}` with `expiresAt` epoch ms; detectors filter cards whose expiresAt is still in the future |
| `rossGetHomeWorkflowDigest` | `verifyUserOrAdmin` | Read-only digest for `/ross.html` slot 1 (PR #72). Reads `ross/workflows/{uid}` + `ross/runs/{uid}` in parallel; returns `{ hasActiveWorkflows, activeWorkflowCount, upcoming, overdue[], today[], recentCompletions[], generatedAt }`. POST body: `{ data: { clientToday?: 'YYYY-MM-DD' } }`. `overdue[]` carries `daysLate` derived server-side from `nextDueDate < today` |

### Allowed-fields per mutator

Server's `allowedFields` lists are the contract for editor field-locking. Keep client-side `UPDATABLE_FIELDS` constants in sync (currently mirrored in `playbook-store.js`).

| Mutator | `allowedFields` |
|---|---|
| `rossUpdateWorkflow` (functions/ross.js:882) | `name`, `notificationChannels`, `notifyPhone`, `notifyEmail`, `daysBeforeAlert`, `status` |
| `rossUpdateTemplate` (functions/ross.js:530) | `name`, `category`, `tier`, `description`, `recurrence`, `daysBeforeAlert`, `subtasks`, `tags` |
| `rossManageTask` update action (functions/ross.js:1100) | `title`, `inputType`, `inputConfig`, `required`, `status`, `dueDate`, `assignedTo`, `order` |
| `rossManageStaff` update action (functions/ross.js:1697) | `name`, `role`, `phone`, `email`, `notificationChannels` |

> **Field-verify rule (Standard Task Workflow Step 0).** Before reading a workflow / template / task / run field on the client, grep the corresponding `set()` / `update()` / `res.json(...)` call in `functions/ross.js` and confirm the field is actually written there. KB docs lie or lag — the write path is ground truth. Pattern fired as negative confirmation on PR #28 (`t.id` vs `templateId`), PR #72 (`status` field that's never written + `nextDueDate` number-not-string), PR #86 (`status === 'overdue'` filter always 0).

> **Note:** Template CRUD (`rossCreateTemplate`, `rossUpdateTemplate`, `rossDeleteTemplate`) requires `verifySuperAdmin`. The Admin SDK bypasses RTDB security rules, so Cloud Functions must enforce the same superAdmin restriction that the RTDB rules intend.

> **Hardening changes (functions):**
> - `rossCompleteTask` was rewritten to use an RTDB `transaction()` for atomic task completion (prevents race conditions between concurrent completions)
> - `rossUpdateWorkflow` now validates `status` against `['active','paused']` and `daysBeforeAlert` entries against positive integers
> - `rossDeleteWorkflow` and `rossDeleteTemplate` now return 404 if the target does not exist
> - `rossManageTask` moved the `taskData` guard inside only the `create` and `update` cases, allowing `delete` to work without a `taskData` payload
> - `rossScheduledReminder` replaced an O(N) full-tree scan of `/ross/workflows` with a fan-out read from `ross/ownerIndex`
> - `rossCreateWorkflow`, `rossActivateWorkflow`, and `rossDeleteWorkflow` maintain the `ross/ownerIndex/{uid}` fan-out node

### Input Types

| `inputType` | UI Control | `inputConfig` fields |
|---|---|---|
| `checkbox` | Checkbox toggle | _(none)_ |
| `text` | Text input | _(none)_ |
| `number` | Number input | `unit`, `max`, `min`, `requiredNote` |
| `temperature` | Number input with unit | `unit` (e.g. `°C`), `max`, `min`, `requiredNote` |
| `yes_no` | Yes / No buttons | _(none)_ |
| `dropdown` | Select list | `options: string[]` |
| `timestamp` | Datetime-local picker | _(none)_ |
| `photo` | Phase 2 placeholder | _(none)_ |
| `signature` | Phase 2 placeholder | _(none)_ |
| `rating` | Star buttons | `max` (default: 5) |

Values are auto-flagged server-side when `Number(value) > inputConfig.max` or `< inputConfig.min` (currently only `number` and `temperature`). If `inputConfig.requiredNote === true`, the server returns **HTTP 422** until the client submits a non-empty `note` along with the flagged value — the response is not persisted until then. Frontend should render a note textarea on 422 and re-submit with the note.

### Critical API Shape

`rossCreateWorkflow` and `rossActivateWorkflow` require `locationIds` (array), not `locationId` (string):

```js
// CORRECT
{ locationIds: ['loc-abc'], name: 'Opening Checklist', ... }

// WRONG — causes 400 "At least one location ID is required"
{ locationId: 'loc-abc', name: 'Opening Checklist', ... }
```

---

## Frontend Vue Module

### Concierge home active-run surfacing (Phase 6 PR 4, shipped 2026-05-19)

Slot 1 of the 3-card home grid is reserved for a workflow-engagement card
driven by `rossGetHomeWorkflowDigest`. Five variants, picked by priority:

1. **Overdue** — `nextDueDate` < today AND no run started ≥ nextDueDate
2. **In progress (today)** — `nextDueDate === today` AND latest run `status: in_progress`
3. **Due today (pending)** — `nextDueDate === today` AND no run for the current period
4. **Recently completed** — completed run within last 24h, no current obligation
5. **All clear** — user has active workflows but nothing pressing right now

If `hasActiveWorkflows === false` (no active workflows at all), slot 1
falls back to `LEARNING_MODE_WORKFLOW_CARD` ("Your playbook is empty —
activate a starter template").

The detector lives at `public/js/modules/ross/v2/detectors.js` →
`detectActiveWorkflows(ctx)`. Snooze interop via card id
`workflow:{workflowId}:{locationId}` (per-pair, so snoozing one venue
doesn't snooze another). Slots 2-3 remain detector-driven (food-cost /
VIP / revenue) with generic `LEARNING_MODE_CARDS` as last-resort filler.

URL scheme for run CTAs: `/ross.html?tab=run&workflowId=<id>&locationId=<id>`
(matches the param keys read by `RossHome.vue:34-35`).

Scope note: server reads `ross/workflows/{callerUid}` — owner-only view.
Shared-location-admin case is backlog follow-up.

**File:** `public/js/modules/ross/index.js`

This is a self-contained Vue 3 CDN application. It is mounted/unmounted by `admin-dashboard.js`.

### Module Singleton State

```js
const rossState = {
  app: null,              // Vue 3 app instance
  locationId: null,       // selected location (moved here for cross-function access)
  authUnsubscribe: null   // onAuthStateChanged unsubscribe handle
}
```

> **Hardening change:** `locationId` is now initialised from claims/URL in `initializeRoss()` and also stored in Vue `data()` for reactivity. `userId` and `idToken` were removed from the singleton -- the service layer reads the token on demand via `getIdToken()`. `authUnsubscribe` was added so the `onAuthStateChanged` listener can be cleaned up to prevent session bleed.

### Key Component Data Properties

| Property | Purpose |
|---|---|
| `locationId` | Selected location -- now in Vue `data()` for reactivity (was in `rossState`) |
| `tabVersion` | Monotonic counter incremented on every tab switch; guards stale async writes |
| `workflowsLoading` | Per-tab loading flag for Workflows tab |
| `templatesLoading` | Per-tab loading flag for Templates tab |
| `reportsLoading` | Per-tab loading flag for Reports tab |
| `staffLoading` | Per-tab loading flag for Staff tab |
| `workflows` | Array of active workflows (normalised with `status`, `nextDueDate`) |
| `templates` | Array of reusable templates |
| `staffMembers` | Staff for the current location (loaded lazily on staff tab activation) |
| `staffLocationId` | Copy of `locationId` used by staff tab |
| `pickedLocationId` | Two-step location picker value |
| `templateEditor` | `null` = list view; `object` = editor open |
| `templateSaving` | Boolean for save button loading state |

> **Hardening change:** A single `tabLoading` boolean was replaced with per-tab flags (`workflowsLoading`, `templatesLoading`, `reportsLoading`, `staffLoading`). The `tabVersion` counter prevents stale async responses from overwriting state after the user switches tabs. `locationId` moved from `rossState` singleton into Vue `data()` so the UI reacts to location changes.

### Lifecycle

```
initializeRoss()             ← called from admin-dashboard.js on section switch
  ↓
if rossState.app exists → cleanupRoss() first (prevents Vue app leak on double-init)
  ↓
rossState.app = Vue.createApp(...)
  ↓
mount on #ross-app
  ↓
onAuthStateChanged listener registered → auto-cleanup on sign-out
  ↓
mounted(): if locationId → loadOverview(); else → loadAvailableLocations()
  ↓
loadStaff() is NOT called on mount — lazy-loads only when staff tab activated

cleanupRoss()                ← called when navigating away or on sign-out
  ↓
rossState.app.unmount()
rossState.authUnsubscribe() ← unsubscribes onAuthStateChanged listener
rossState.locationId = null
```

> **Important:** The `sectionInitialized.rossContent` guard in `admin-dashboard.js` was **removed** for ROSS. ROSS must re-initialise every time the section is activated because `cleanupRoss` fully unmounts the Vue app.

> **Hardening change:** `initializeRoss()` now calls `cleanupRoss()` if `rossState.app` already exists, preventing Vue app leaks on double-init. An `onAuthStateChanged` listener is registered after mount and unsubscribed in `cleanupRoss()` to prevent session bleed. `loadStaff()` was removed from `mounted()` and is now lazy-loaded only when the staff tab is activated. `loadAvailableLocations()` reads `userLocations/${uid}` (user-scoped) instead of global `/locations`.

### Response Normalisation

`rossGetWorkflows` returns location fields with a `location` prefix. Always normalise when loading:

```js
.map(w => ({
  ...w,
  nextDueDate: w.locationNextDueDate ?? w.nextDueDate,
  status:      w.locationStatus      ?? w.status
}))
```

---

## Admin Dashboard Integration

**File:** `public/js/admin-dashboard.js`

The ROSS section case must always re-initialise (no `sectionInitialized` guard):

```js
case 'rossContent':
    await initializeRoss();
    this.sectionInitialized.rossContent = true;
    break;
```

**File:** `public/admin-dashboard.html`

ROSS sidebar entry:
```html
<li class="nav-item">
    <a href="#" class="nav-link" id="rossMenu" data-section="rossContent">
        <i class="fas fa-robot"></i>
        ROSS
    </a>
</li>
```

Mount point inside content area:
```html
<div id="rossContent" class="content-section" style="display:none">
    <div id="ross-app"></div>
</div>
```

---

## Tabs & Features

### Overview Tab
- 3 stat cards: Active, Overdue, Due Today
- Category breakdown cards
- Workflow list with status badges and due dates

### Workflows Tab
- List of all workflows with status colour coding
- Click to expand workflow → view and manage tasks
- Tasks can be completed/uncompleted and assigned to staff

### Builder Tab
- Create new workflow from scratch OR from a template
- Fields: name, description, category, recurrence, location(s)
- Add/remove/reorder subtasks inline

### Staff Tab
- Location picker → shows staff list
- Assign staff to tasks from within an open workflow
- Staff loaded lazily only when the staff tab is activated (removed from `mounted()`)

### Templates Tab
- Lists all templates (public + own)
- Activate a template → creates a workflow at the selected location
- In-page editor for creating and editing templates
- Fields: name, description, category, recurrence, subtasks
- Super Admin only: create/edit/delete templates requires `verifySuperAdmin`

---

## Known Bugs Fixed

| Bug | Root Cause | Fix |
|---|---|---|
| `rossCreateWorkflow` 400 error | `builderSave` sent `locationId: string` instead of `locationIds: string[]` | Changed to `locationIds: [rossState.locationId]` |
| ROSS blank on second visit | `sectionInitialized.rossContent = true` prevented re-init after `cleanupRoss` | Removed `sectionInitialized` guard for ROSS section |
| "Due in nulld" badge | `rossGetWorkflows` returns `locationNextDueDate`, not `nextDueDate` | Added normalisation in `loadOverview` and `loadWorkflows` |
| Overview cards show 0 | `loadOverview` passed `Object.values({ success, workflows })` = `[true, [...]]` to buildCategoryStats | Fixed response parsing: `Array.isArray(raw?.workflows) ? raw.workflows : []` |
| Staff "No location detected" | `applyPickedLocation` set `rossState.locationId` but not `this.staffLocationId` | Added `this.staffLocationId = this.pickedLocationId` |
| Templates gated to superAdmin | `rossCreateTemplate` / `rossUpdateTemplate` / `rossDeleteTemplate` used `verifySuperAdmin` | Restored to `verifySuperAdmin` — Admin SDK bypasses RTDB rules; Cloud Functions must enforce the same restriction the rules intend |
| Template editor `v-else` chain broken | Editor panel used `v-if` instead of `v-else-if`, breaking the tab loading chain | Changed to `v-else-if="templateEditor"` |
| Vue app leak on double-init | `initializeRoss()` did not check if `rossState.app` already existed | Added guard: if `rossState.app` exists, call `cleanupRoss()` first |
| Session bleed on sign-out | No `onAuthStateChanged` listener to clean up ROSS when user signs out | Added listener in `initializeRoss()`, unsubscribed in `cleanupRoss()` |
| Stale async tab data | Single `tabLoading` flag allowed async responses to write into wrong tab | Replaced with per-tab flags + `tabVersion` counter to discard stale writes |
| `loadAvailableLocations` read global `/locations` | Any admin could see all platform locations | Changed to read `userLocations/${uid}` (user-scoped) |
| `rossCompleteTask` race condition | Non-atomic read-then-write allowed concurrent completions to conflict | Rewritten with RTDB `transaction()` for atomic completion |
| `rossDeleteWorkflow` / `rossDeleteTemplate` no 404 | Deleting a non-existent resource returned 200 | Added existence checks returning 404 |
| `rossManageTask` delete required `taskData` | `taskData` guard was before the switch statement | Moved guard inside `create` and `update` cases only |
| `rossScheduledReminder` O(N) scan | Scanned entire `/ross/workflows` tree for all owners | Replaced with `ross/ownerIndex` fan-out |
| `getIdToken(true)` forced refresh | Service layer called `getIdToken(true)` on every request | Changed to `getIdToken()` (uses cached token) |
| `updateWorkflow` / `deleteWorkflow` unused `locationId` param | Service methods accepted `locationId` that was never used | Removed unused parameter |
| `applyPickedLocation` stale builder state | Location change did not reset builder form | Builder form state reset on location change |

---

## Templates & Seed Data

Template seed script: `functions/seeds/ross-templates.js`

To re-run against production:
```bash
GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json node functions/seeds/ross-templates.js
```

Default templates include:
- Opening Checklist (daily)
- Closing Checklist (daily)
- Weekly Deep Clean (weekly)
- Monthly Stock Audit (monthly)

---

## Deployment Notes

ROSS consists of:
1. **Frontend** – Vue 3 CDN files in `public/js/modules/ross/`
2. **Cloud Functions** – `functions/ross.js` (exported from `functions/index.js`)
3. **RTDB Rules** – `/ross` node rules in `database.rules.json`

Deploy all three:
```bash
firebase deploy --only hosting,functions,database
```

Or just hosting after UI-only changes:
```bash
firebase deploy --only hosting
```
