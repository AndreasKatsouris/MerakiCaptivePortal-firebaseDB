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

### Phase status (as of 2026-05-01)

| Phase | Status |
|-------|--------|
| Home feed (`getHomeFeed`) wired to RTDB detectors | ✅ shipped (PR #19, Phase 2 confirmed) |
| Right-rail + first-run findings | ✅ PR #19 |
| Action handlers + snooze | ✅ PR #20 |
| Playbook tab read-view | ✅ PR #21 |
| Activity tab | ✅ PR #23 (locationName enrichment fix in PR #24) |
| People tab | ✅ PR #25 — first **edit-capable** v2 surface |
| Playbook editing — workflow create / edit / pause / delete | ✅ Phase 4d.1 — first edit-capable v2 surface for the workflow data path |
| Playbook editing — template CRUD | ⏳ Phase 4d.2 (superAdmin) |
| Per-task `inputType` / `inputConfig` editor | ⏳ Phase 4e (deferred from 4d) |
| Onboarding wired | ⏳ Phase 5 |
| `askRoss` LLM | 🔮 separate sprint |

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
      subtasks: Subtask[]          ← canonical task list field; each { title, daysOffset?, order? }
      tags: string[]
      notificationChannels: string[]   ← currently always ['in_app']
      createdAt: number
      updatedAt: number
```

> **Task input types (Phase 4e.1).** Workflow tasks (under `ross/workflows/{uid}/{workflowId}/locations/{locationId}/tasks/{taskId}`) carry `inputType` and `inputConfig` fields. `VALID_INPUT_TYPES = ['checkbox', 'text', 'number', 'temperature', 'yes_no', 'dropdown', 'timestamp', 'photo', 'signature', 'rating']` (functions/ross.js:25-28). Server enum-validates `inputType`; `inputConfig` is stored verbatim. Runtime semantics live in `validateResponseValue` / `isResponseFlagged` (functions/ross.js:1036-1058). `inputConfig` shapes that have proven server semantics: `{ min, max, requiredNote, unit }` for `number`/`temperature` (auto-flag breaches, enforce note); `{ options: string[] }` for `dropdown`; `{ scale }` for `rating`. Other types accept advisory keys the runner may use later.
>
> **Server propagation gap (Phase 4e.2 follow-up).** `rossCreateWorkflow` (line 421) and `rossActivateWorkflow` (line 334) build workflow tasks from incoming subtasks but **strip** `inputType`/`inputConfig` — only `title`/`order`/`dueDate` survive. As of 4e.1 the only path that persists these fields is `rossManageTask` (per-task CRUD on an existing workflow). Setting input types in the workflow editor's create flow or on a template silently drops them. Phase 4e.2 will extend the create/activate CFs to carry the fields through.

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

## Cloud Functions

All ROSS functions are defined in `functions/ross.js` and exported from `functions/index.js`.

| Function | Auth | Description |
|---|---|---|
| `rossGetWorkflows` | `verifyAdmin` | List all workflows for the current user, flattened with location data |
| `rossCreateWorkflow` | `verifyAdmin` | Create a new workflow, attach to `locationIds[]`, write `ownerIndex` |
| `rossUpdateWorkflow` | `verifyAdmin` | Update workflow metadata; null guard on `updates`; `status` field validated against `['active','paused']`; `daysBeforeAlert` validated to positive integers |
| `rossDeleteWorkflow` | `verifyAdmin` | Delete a workflow (404 if not found); clean up `ownerIndex` when last workflow removed |
| `rossManageTask` | `verifyAdmin` | Create / update / delete a task; `taskData` guard scoped to `create` and `update` only -- delete works without `taskData` |
| `rossCompleteTask` | `verifyAdmin` | Mark a task complete using RTDB transaction (atomic); returns 404 if task not found; writes history record when all tasks in a location are done |
| `rossActivateWorkflow` | `verifyAdmin` | Attach an existing workflow to additional locations; write `ownerIndex` |
| `rossGetTemplates` | `verifyAdmin` | List all templates (public + own) |
| `rossCreateTemplate` | `verifySuperAdmin` | Create a new template |
| `rossUpdateTemplate` | `verifySuperAdmin` | Update an existing template; null guard on `updates` before property access |
| `rossDeleteTemplate` | `verifySuperAdmin` | Delete a template (404 existence check added) |
| `rossGetReports` | `verifyAdmin` | Fetch completion reports across all workflows and locations |
| `rossGetStaff` | `verifyAdmin` | List staff members for a location |
| `rossScheduledReminder` | Scheduled (cron `0 5 * * *`) | Fan-out via `ross/ownerIndex` instead of full-tree scan |
| `rossCreateRun` | `verifyAdmin` | Create or return the current in-progress run for a workflow+location (idempotent) |
| `rossSubmitResponse` | `verifyAdmin` | Submit a typed response for a task within a run; auto-flags out-of-range values; enforces `requiredNote` |
| `rossGetRun` | `verifyAdmin` | Get the current run and previous responses for a workflow+location |
| `rossGetRunHistory` | `verifyAdmin` | List completed runs (newest first, paginated) for a workflow+location |

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
