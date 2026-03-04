# ROSS — Restaurant OS Service
## Design Document
**Date:** 2026-02-25
**Branch:** feature/ross
**Status:** Approved — Ready for Implementation Planning

---

## Overview

ROSS (Restaurant OS Service) is a workflow automation and task management system built for restaurant operators. It provides a library of pre-built operational workflow templates alongside a custom workflow builder, enabling owners to track compliance requirements, operational SOPs, marketing tasks, financial reviews, and growth activities — all with recurring schedules, subtask checklists, configurable reminders, and completion reporting.

ROSS is built and tested inside the admin system first, then released to the user dashboard once stable. It coexists with the existing Super Admin project management tool (internal dev tracker), which remains unchanged.

---

## Goals

- Give restaurant owners a structured system to manage recurring operational obligations
- Surface compliance deadlines (e.g. Certificate of Acceptability renewal) before they become urgent
- Enable consistent execution of operational SOPs through weekly/monthly checklists
- Track goal completion across daily, weekly, monthly, quarterly, and annual periods
- Provide a reporting layer that shows owners how well they are executing against their commitments
- Support multi-location operators with global workflow activation and per-location tracking

---

## Non-Goals (Phase 1)

- WhatsApp/email notifications (in-app only in Phase 1, added in Phase 2)
- User dashboard release (admin only in Phase 1)
- Export to PDF/CSV (Phase 3)
- Integration with other platform modules (Phase 3+)

---

## Architecture Overview

### Tech Stack
- **Frontend:** Vue 3 (consistent with existing modules), Bootstrap 5, Chart.js
- **Backend:** Firebase Cloud Functions (Node.js 22), Firebase RTDB
- **Notifications:** Firebase RTDB (in-app, Phase 1), Twilio WhatsApp (Phase 2), SendGrid Email (Phase 2)
- **Scheduler:** Firebase scheduled Cloud Function (daily at 07:00 SAST)

### New File Locations

```
public/js/modules/ross/
├── index.js                    # Main Vue 3 app — dashboard & tab routing
├── template-library.js         # Browse & activate pre-built templates
├── workflow-builder.js         # Custom workflow creation (step-by-step form)
├── workflow-runner.js          # Active workflow detail — task checklist + history
├── reporting.js                # Goal tracking & completion reports
└── services/
    └── ross-service.js         # Firebase API client (all Cloud Function calls)

functions/
└── ross.js                     # All ROSS Cloud Functions

public/css/
└── ross.css                    # Module styles

KNOWLEDGE BASE/features/
└── ROSS.md                     # Feature documentation (post-implementation)
```

### Firebase RTDB Paths

```
/ross/
├── templates/                          # Super Admin managed template library
│   └── {templateId}/                   # Template definition
├── staff/
│   └── {locationId}/                   # Staff members per location
│       └── {staffId}/                  # Name, role, contact, notificationChannels
├── workflows/
│   └── {ownerId}/
│       └── {workflowId}/               # Global parent workflow (owner-level)
│           ├── meta/                   # Config, schedule, recurrence, notifications
│           ├── locations/              # Per-location activation & tracking
│           │   └── {locationId}/
│           │       ├── status/         # active | paused | completed per location
│           │       ├── tasks/          # Task instances for this location's cycle
│           │       └── history/        # Completion records per cycle
│           └── assignees/             # Staff assigned to tasks per location
```

---

## Data Model

### Workflow Template
Stored at `/ross/templates/{templateId}`. Managed by Super Admins only.

```json
{
  "templateId": "cert_of_acceptability",
  "name": "Certificate of Acceptability",
  "category": "compliance",
  "description": "Annual CoA renewal tracking from application to approval",
  "recurrence": "annually",
  "daysBeforeAlert": [90, 30, 7],
  "subtasks": [
    { "order": 1, "title": "Submit application to local authority", "daysOffset": -90 },
    { "order": 2, "title": "Schedule inspection", "daysOffset": -60 },
    { "order": 3, "title": "Complete inspection requirements", "daysOffset": -30 },
    { "order": 4, "title": "Collect certificate", "daysOffset": 0 }
  ],
  "notificationChannels": ["in_app"],
  "tags": ["compliance", "legal", "annual"],
  "createdAt": 1740441600000,
  "updatedAt": 1740441600000
}
```

### Active Workflow (Global Parent)
Stored at `/ross/workflows/{ownerId}/{workflowId}`. One record per workflow, owned at the global level. Per-location tracking lives under `locations/{locationId}`.

```json
{
  "workflowId": "-Nxabc123",
  "templateId": "cert_of_acceptability",
  "ownerId": "uid_xyz",
  "name": "Certificate of Acceptability",
  "category": "compliance",
  "recurrence": "annually",
  "notificationChannels": ["in_app"],
  "notifyPhone": "+27821234567",
  "notifyEmail": "owner@restaurant.co.za",
  "daysBeforeAlert": [30, 7, 1],
  "createdAt": 1740441600000,
  "updatedAt": 1740441600000,
  "locations": {
    "loc_001": {
      "locationName": "Main Branch",
      "status": "active",
      "nextDueDate": 1767225600000,
      "tasks": {
        "-NxTask1": {
          "title": "Submit application to local authority",
          "status": "completed",
          "dueDate": 1759449600000,
          "completedAt": 1759536000000,
          "assignedTo": "-NxStaff1",
          "order": 1
        },
        "-NxTask2": {
          "title": "Schedule inspection",
          "status": "in_progress",
          "dueDate": 1762041600000,
          "completedAt": null,
          "assignedTo": null,
          "order": 2
        }
      }
    },
    "loc_002": {
      "locationName": "West Branch",
      "status": "active",
      "nextDueDate": 1767225600000,
      "tasks": {}
    }
  }
}
```

### Staff Member
Stored at `/ross/staff/{locationId}/{staffId}`. Staff members are managed per location and can be assigned to workflow tasks.

```json
{
  "staffId": "-NxStaff1",
  "locationId": "loc_001",
  "name": "Sipho Dlamini",
  "role": "Floor Manager",
  "phone": "+27831234567",
  "email": "sipho@restaurant.co.za",
  "notificationChannels": ["whatsapp"],
  "createdAt": 1740441600000
}
```

### Completion Record
Stored at `/ross/locations/{locationId}/workflows/{workflowId}/history/{cycleId}`.

```json
{
  "cycleId": "2025-annual",
  "period": "2025",
  "completedAt": 1767312000000,
  "tasksTotal": 4,
  "tasksCompleted": 4,
  "completionRate": 100,
  "onTime": true
}
```

### Workflow Categories
Expandable list stored as a constant (frontend) and validated server-side:

| Key | Label | Examples |
|-----|-------|---------|
| `compliance` | Compliance | Certifications, licences, legal |
| `operations` | Operations | Daily/weekly SOPs, checklists |
| `growth` | Growth | Marketing, campaigns, reviews |
| `finance` | Finance | Cost reviews, supplier payments |
| `hr` | HR & People | Training, performance reviews |
| `maintenance` | Maintenance | Equipment servicing, deep cleans |

### Recurrence Types
`once` | `daily` | `weekly` | `monthly` | `quarterly` | `annually`

---

## UI Structure

The ROSS module is mounted to `#ross-app` within the admin dashboard. It uses tab-based navigation with 6 views.

```
ROSS
├── 1. Overview          — Active workflows summary, overdue alerts, today's tasks
├── 2. Template Library  — Browse & activate pre-built templates by category
├── 3. My Workflows      — All active workflows, filterable by location/category/status
├── 4. Workflow Builder  — Create custom workflows from scratch
├── 5. Reports           — Goal tracking across daily/weekly/monthly/quarterly/annual
└── 6. Staff             — Manage staff members per location for task assignment
```

### View 1 — Overview Dashboard
- Alert strip: overdue tasks (red) and due-soon tasks (amber) across all active workflows
- Category summary cards: active workflow count + completion % per category
- "Today's Tasks" quick list across all workflows and locations
- Quick-action buttons: Activate Template, Create Workflow

### View 2 — Template Library
- Filter tabs: All | Compliance | Operations | Growth | Finance | HR | Maintenance
- Template cards: name, recurrence badge, subtask count, short description
- "Activate" button → modal to configure: location(s), start date, notification preferences
- Super Admin only: "Edit Templates" button to manage the library (add/edit/delete templates)

### View 3 — My Workflows
- Card grid or list of all active workflows
- Filters: location, category, recurrence, status (active / paused / completed)
- Each card: name, location, next due date, progress bar, overdue indicator
- Click → Workflow Detail view: subtask checklist (mark complete), history tab, settings tab

### View 4 — Workflow Builder
- Step-by-step form:
  1. Name & Category
  2. Recurrence & Due Date
  3. Subtasks (add / reorder / delete, set relative due offsets)
  4. Notification settings (channels, alert days)
  5. Location assignment
- Preview panel: timeline of subtasks with computed due dates
- Save as draft or activate immediately

### View 5 — Reports
- Period selector: Daily / Weekly / Monthly / Quarterly / Annually
- Per-category completion rate bars (Chart.js)
- Workflow-by-workflow completion table with on-time %
- Multi-location comparison view for operators with multiple locations
- Export to PDF/CSV (Phase 3)

### View 6 — Staff Management
- List of staff members per location (location selector at top)
- Staff cards: name, role, contact details, assigned notification channels
- Add / Edit / Delete staff members (SweetAlert2 modal)
- Staff members appear in task assignment dropdowns throughout the module

---

## Cloud Functions

All ROSS Cloud Functions live in `functions/ross.js` and use the existing Bearer token + admin verification pattern.

| Function | Method | Purpose |
|----------|--------|---------|
| `rossGetTemplates` | POST | Fetch all templates (with optional category filter) |
| `rossCreateTemplate` | POST | Super Admin: create a new template |
| `rossUpdateTemplate` | POST | Super Admin: update a template |
| `rossDeleteTemplate` | POST | Super Admin: delete a template |
| `rossActivateWorkflow` | POST | Activate a template as a workflow for a location |
| `rossCreateWorkflow` | POST | Create a custom workflow from scratch |
| `rossUpdateWorkflow` | POST | Update workflow settings |
| `rossDeleteWorkflow` | POST | Delete a workflow |
| `rossGetWorkflows` | POST | Fetch all workflows for a location or owner |
| `rossManageTask` | POST | Create/update/delete tasks within a workflow |
| `rossCompleteTask` | POST | Mark a task as complete, record completion timestamp |
| `rossGetReports` | POST | Fetch completion history for reporting view |
| `rossManageStaff` | POST | CRUD for staff members per location (create/update/delete) |
| `rossGetStaff` | POST | Fetch all staff members for a given location |
| `rossScheduledReminder` | SCHEDULED | Daily 07:00 SAST — scan workflows, send in-app alerts |

---

## Notification Engine

### Phase 1 — In-App Only
A Firebase scheduled function runs daily at 07:00 SAST. For each active workflow, it checks if `(nextDueDate - today)` falls within the workflow's `daysBeforeAlert` array. If triggered, it writes a notification record to `/notifications/{ownerId}/`.

```
rossScheduledReminder (daily, 07:00 SAST)
  └── For each active workflow across all locations
        └── Check: (nextDueDate - today) in daysBeforeAlert?
              ├── Yes → write to /notifications/{ownerId}/
              └── No  → skip
```

**In-app notification format:**
```
⚠️ Certificate of Acceptability — Main Branch
   Due in 7 days (3 Mar 2026)
   2 of 4 subtasks remaining
   [View Workflow]
```

### Phase 2 — WhatsApp + Email (Planned)
The scheduler is designed from day one to support multi-channel delivery. In Phase 2, the following are added to the scheduler:
- **WhatsApp:** Twilio integration (existing pattern from whatsapp-management.js)
- **Email:** SendGrid integration (existing pattern)
- Per-workflow `notificationChannels` array controls which channels fire

**WhatsApp message format:**
```
Hi [Owner Name], this is a reminder from ROSS:

📋 *Certificate of Acceptability* is due in 7 days.
📍 Location: Main Branch
✅ Progress: 2 of 4 tasks complete

Log in to complete remaining tasks.
```

---

## Starter Template Library (Phase 1 — 13 Templates)

| Category | Template Name | Recurrence |
|----------|--------------|------------|
| Compliance | Certificate of Acceptability | Annually |
| Compliance | Liquor Licence Renewal | Annually |
| Compliance | Health & Safety Audit | Quarterly |
| Operations | Daily Opening Checklist | Daily |
| Operations | Daily Closing Checklist | Daily |
| Operations | Weekly Deep Clean Checklist | Weekly |
| Growth | Weekly Social Media Campaign | Weekly |
| Growth | Monthly Google Review Campaign | Monthly |
| Finance | Monthly Food Cost Review | Monthly |
| Finance | Weekly Supplier Payment Run | Weekly |
| HR | Monthly Staff Meeting | Monthly |
| HR | Quarterly Staff Performance Review | Quarterly |
| Maintenance | Monthly Equipment Service Check | Monthly |

---

## Security & Access Control

### Phase 1 (Admin)
- **Super Admin:** Full access — manage template library, create/edit/delete any workflow
- **Admin:** Activate templates, create custom workflows, manage own location workflows
- **Database rules:** `/ross/templates/` — Super Admin write only; `/ross/locations/{locId}/` — admin read/write for their own location

### Phase 3 (User Dashboard)
- Access gated by subscription tier (Silver+ suggested, TBD)
- Restaurant owners manage their own location workflows only
- Template library is read-only for owners

---

## Phased Rollout

### Phase 1 — Admin MVP
**Goal:** Fully working workflow engine in admin. Core features only. In-app notifications.

**Deliverables:**
- Firebase RTDB schema + security rules
- 13 Cloud Functions (CRUD + scheduler skeleton)
- Vue 3 module with all 5 views
- 13 starter templates seeded
- In-app notification writer

**Agent Assignments:**

| Task | Agent |
|------|-------|
| Firebase RTDB schema, security rules, database indexes | `firebase-backend-dev` |
| Cloud Functions: template CRUD, workflow CRUD, task management | `firebase-backend-dev` |
| Cloud Function: rossScheduledReminder (in-app only) | `firebase-backend-dev` |
| Vue 3 module scaffold, tab routing, ross-service.js | `frontend-developer` |
| View 1: Overview Dashboard + alert strip | `frontend-developer` |
| View 2: Template Library + activation modal | `frontend-developer` |
| View 3: My Workflows + workflow detail/checklist + task assignment | `frontend-developer` |
| View 4: Workflow Builder (step-by-step form + preview) | `frontend-developer` |
| View 5: Reports (basic completion dashboard) | `frontend-developer` |
| View 6: Staff Management (CRUD per location) | `frontend-developer` |
| Seed 13 starter templates | `firebase-backend-dev` |
| Security rules review | `security-auditor` |
| Code review: all Phase 1 output | `code-reviewer` |

---

### Phase 2 — Notifications Layer
**Goal:** Add WhatsApp and email reminders. Per-workflow configurable channels.

**Deliverables:**
- Scheduler upgraded with Twilio WhatsApp delivery
- Scheduler upgraded with SendGrid email delivery
- Notification settings UI per workflow
- Multi-location activation flow

**Agent Assignments:**

| Task | Agent |
|------|-------|
| WhatsApp reminder delivery (Twilio) in scheduler | `firebase-backend-dev` |
| Email reminder delivery (SendGrid) in scheduler | `firebase-backend-dev` |
| Per-workflow notification settings UI | `frontend-developer` |
| Multi-location workflow activation flow | `frontend-developer` |
| Code review | `code-reviewer` |

---

### Phase 3 — Reporting + User Dashboard Release
**Goal:** Full reporting dashboard. Release ROSS to user dashboard with tier gating.

**Deliverables:**
- Advanced reports (Chart.js — completion rates, trends, location comparison)
- Completion history Cloud Function + query layer
- Export to PDF/CSV
- User dashboard integration with subscription tier gating
- QA, E2E tests, documentation

**Agent Assignments:**

| Task | Agent |
|------|-------|
| Reports view (Chart.js, completion rates, trends) | `frontend-developer` |
| Multi-location comparison view | `frontend-developer` |
| Completion history recording + query functions | `firebase-backend-dev` |
| Export to PDF/CSV | `frontend-developer` |
| User dashboard integration + access control tier gating | `module-specialist` |
| QA & E2E tests | `quality-assurance-tester` |
| Documentation + KNOWLEDGE BASE update | `doc-updater` |
| Final code review | `code-reviewer` |

---

## Resolved Design Decisions

1. **Subscription tier gating:** ✅ RESOLVED — ROSS will be gated to the appropriate subscription tier at the time of user dashboard release. TBD per commercial review.
2. **WhatsApp template approval:** ✅ RESOLVED — Meta approval process begins at Phase 2 kickoff. Flag as a dependency before Phase 2 development starts.
3. **Workflow ownership:** ✅ RESOLVED — Global parent workflow record at `/ross/workflows/{ownerId}/{workflowId}` with per-location sub-records under `locations/{locationId}`. Data model updated accordingly.
4. **Task assignment:** ✅ RESOLVED — Tasks are assignable to specific staff members. Staff members are managed per location under `/ross/staff/{locationId}/{staffId}`. Staff management UI (add/edit/delete staff per location) is a Phase 1 dependency added to the UI structure as **View 6 — Staff Management**.

---

## Version History

- **v1.0** (2026-02-25) — Initial design document. Approved and ready for implementation planning.
- **v1.1** (2026-03-03) — Updated data model to global parent workflow with per-location sub-records. Added Staff Management (View 6, `/ross/staff/`, `rossManageStaff`, `rossGetStaff`). Resolved all open questions.
