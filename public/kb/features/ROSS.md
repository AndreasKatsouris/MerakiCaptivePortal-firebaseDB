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
        id: string
        name: string
        description: string
        category: string          ← 'compliance' | 'operations' | 'growth' | 'finance' | 'hr' | 'maintenance'
        recurrence: string        ← 'once' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually'
        customInterval: number?
        tasks: Task[]
        templateId: string?
        createdAt: number
        updatedAt: number
        locations/
          {locationId}/
            locationId: string
            locationStatus: string    ← 'active' | 'overdue' | 'completed'
            locationNextDueDate: string  ← ISO date string
            locationAssignedTo: string?
            activatedAt: number
```

> **Important:** `rossGetWorkflows` returns location data flattened as `locationStatus` and `locationNextDueDate`. Both the overview and workflow list normalise these to `status` and `nextDueDate` on the frontend.

### Templates

```
ross/
  templates/
    {templateId}/
      id: string
      name: string
      description: string
      category: string
      recurrence: string
      tasks: Task[]
      isPublic: boolean
      createdBy: string     ← uid of creator
      createdAt: number
      updatedAt: number
```

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
    {locationId}/
      {workflowId}/
        current/
          runId: string
          startedAt: number
          startedBy: string (uid)
          status: 'in_progress' | 'completed'
          responses/
            {taskId}/
              value: any
              note: string?
              submittedAt: number
              submittedBy: string
              flagged: boolean
              inputType: string
        history/
          {runId}/
            runId: string
            completedAt: number
            completedBy: string
            onTime: boolean
            flaggedCount: number
            responses: { [taskId]: ResponseObject }
```

---

## Cloud Functions

All ROSS functions are defined in `functions/ross.js` and exported from `functions/index.js`.

| Function | Auth | Description |
|---|---|---|
| `rossGetWorkflows` | `verifyAdmin` | List all workflows for the current user, flattened with location data |
| `rossCreateWorkflow` | `verifyAdmin` | Create a new workflow and attach to `locationIds[]` |
| `rossUpdateWorkflow` | `verifyAdmin` | Update workflow metadata |
| `rossDeleteWorkflow` | `verifyAdmin` | Delete a workflow |
| `rossManageTask` | `verifyAdmin` | Create / update / complete / uncomplete a task; supports `assignedTo` |
| `rossActivateWorkflow` | `verifyAdmin` | Attach an existing workflow to additional locations |
| `rossGetTemplates` | `verifyAdmin` | List all templates (public + own) |
| `rossCreateTemplate` | `verifySuperAdmin` | Create a new template |
| `rossUpdateTemplate` | `verifySuperAdmin` | Update an existing template |
| `rossDeleteTemplate` | `verifySuperAdmin` | Delete a template |
| `rossCreateRun` | `verifyAdmin` | Create or return the current in-progress run for a workflow+location |
| `rossSubmitResponse` | `verifyAdmin` | Submit a typed response for a task within a run; auto-flags out-of-range values |
| `rossGetRun` | `verifyAdmin` | Get the current run and previous responses for a workflow+location |
| `rossGetRunHistory` | `verifyAdmin` | List completed runs (newest first) for a workflow+location |

> **Note:** Template CRUD (`rossCreateTemplate`, `rossUpdateTemplate`, `rossDeleteTemplate`) requires `verifySuperAdmin`. The Admin SDK bypasses RTDB security rules, so Cloud Functions must enforce the same superAdmin restriction that the RTDB rules intend.

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

Values flagged when `Number(value) > inputConfig.max` or `< inputConfig.min`. If `requiredNote: true`, a note textarea is shown when the value is out of range.

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
  initialized: false,
  app: null,
  locationId: null,    // selected location for all operations
  userId: null,
  idToken: null
}
```

### Key Component Data Properties

| Property | Purpose |
|---|---|
| `workflows` | Array of active workflows (normalised with `status`, `nextDueDate`) |
| `templates` | Array of reusable templates |
| `staffMembers` | Staff for the current location (loaded lazily on workflow open) |
| `staffLocationId` | Copy of `rossState.locationId` used by staff tab |
| `pickedLocationId` | Two-step location picker value |
| `templateEditor` | `null` = list view; `object` = editor open |
| `templateSaving` | Boolean for save button loading state |

### Lifecycle

```
initializeRoss()             ← called from admin-dashboard.js on section switch
  ↓
rossState.app = createApp()
  ↓
mountRossApp()
  ↓
loadLocations() → loadOverview() + loadWorkflows()

cleanupRoss()                ← called when navigating away
  ↓
rossState.app.unmount()
rossState.initialized = false
```

> **Important:** The `sectionInitialized.rossContent` guard in `admin-dashboard.js` was **removed** for ROSS. ROSS must re-initialise every time the section is activated because `cleanupRoss` fully unmounts the Vue app.

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
- Staff loaded lazily when a workflow is opened (`loadStaff()` called in `openWorkflow`)

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
