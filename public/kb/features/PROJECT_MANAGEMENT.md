# Project Management

## Purpose

The Project Management module is an internal admin tool for tracking development projects, milestones, and tasks within the Sparks Hospitality platform. It is restricted to Super Admin users and provides a Kanban-style board, timeline view, and detail panels for managing the platform's ongoing development work.

## Key Files

| File | Description |
|------|-------------|
| `public/js/modules/project-management/index.js` | Vue 3 `initializeProjectManagement()` - main UI with Kanban, list, and timeline views |
| `public/js/modules/project-management/index-enhanced.js` | Enhanced version with additional features |
| `public/js/modules/project-management/services/project-service.js` | `projectService` - API client for project CRUD operations |
| `functions/projectManagement.js` | Cloud Functions: `createProject`, `updateProject`, and more |
| `database.rules.json` | Security rules for `admin/projects` and `projects` nodes |

## Data Model (RTDB Paths)

### `admin/projects/{projectId}`

Primary project storage (Super Admin only):

```json
{
  "projectId": "-NxYz789ghi",
  "name": "POS Integration Phase 1",
  "description": "Integrate Pilot POS system with the platform",
  "locationId": "ocean_basket_waterfront",
  "status": "in_progress",
  "priority": "high",
  "createdAt": 1721234567890,
  "updatedAt": 1721234567890,
  "createdBy": "admin-uid",
  "dueDate": 1724000000000,
  "milestones": {
    "-NxMilestone1": {
      "name": "API Research Complete",
      "description": "Complete POS API documentation review",
      "status": "completed",
      "dueDate": 1722000000000,
      "completedAt": 1721900000000,
      "order": 1
    },
    "-NxMilestone2": {
      "name": "Connector Built",
      "description": "Build the universal POS adapter",
      "status": "pending",
      "dueDate": 1723000000000,
      "completedAt": null,
      "order": 2
    }
  },
  "tasks": {
    "-NxTask1": {
      "title": "Research Pilot POS API",
      "status": "done",
      "createdAt": 1721234567890,
      "assignee": "admin-uid",
      "priority": "high"
    },
    "-NxTask2": {
      "title": "Build data mapping layer",
      "status": "in_progress",
      "createdAt": 1721300000000,
      "assignee": "admin-uid",
      "priority": "medium"
    }
  }
}
```

### Status Values

**Project status**: `planning`, `in_progress`, `completed`, `on_hold`

**Task status**: `todo`, `in_progress`, `done`, `blocked` [TODO: verify exact values from frontend]

**Milestone status**: `pending`, `completed`

**Priority**: `low`, `medium`, `high`, `critical`

### `projects/{projectId}` (Legacy)

Older project storage (different status values):

```json
"projects": {
  "$projectId": {
    ".validate": "newData.hasChildren(['name', 'status', 'createdAt'])",
    "status": {
      ".validate": "newData.val().matches(/^(planned|in_progress|completed|blocked)$/)"
    }
  }
}
```

Note the different status values between `admin/projects` and `projects` nodes.

## Cloud Functions

All project Cloud Functions use `onRequest` with Bearer token authentication and Super Admin verification.

### Authentication Flow

```javascript
// 1. Extract Bearer token
const idToken = req.headers.authorization.split('Bearer ')[1];

// 2. Verify ID token
const decodedToken = await admin.auth().verifyIdToken(idToken);

// 3. Verify Super Admin
const userData = await db.ref(`admins/${uid}`).once('value');
if (!userData.val()?.superAdmin) throw new Error('Super Admin access required');
```

### Available Functions

| Function | Method | Description |
|----------|--------|-------------|
| `createProject` | POST | Create project with optional initial milestones |
| `updateProject` | POST | Update project fields |
| [TODO: verify] `deleteProject` | POST | Delete a project |
| [TODO: verify] `createTask` | POST | Add task to a project |
| [TODO: verify] `updateTask` | POST | Update task status/details |

### `createProject` Details

Accepts: `name` (required), `description`, `locationId`, `priority`, `dueDate`, `milestones[]`

Each milestone in the initial array gets:
- Auto-generated push key
- `status: 'pending'`
- `completedAt: null`
- Sequential `order` (1-based)

Returns: `{ success: true, projectId, project: projectData }`

## Frontend Vue App

### Initialization

```javascript
export async function initializeProjectManagement() {
    const container = document.getElementById('project-management-app');
    projectManagementState.app = Vue.createApp({...}).mount(container);
}
```

### Views

1. **List View**: Table of all projects with status badges, priority indicators, progress bars
2. **Kanban View**: Column-based board organized by status (Planning, In Progress, Completed, On Hold)
3. **Timeline View**: Chronological view of milestones and due dates
4. **Detail View**: Expanded project view with tasks, milestones, and activity log

### Helper Functions

| Function | Description |
|----------|-------------|
| `getStatusBadgeClass(status)` | Maps status to Bootstrap badge class |
| `getPriorityBadgeClass(priority)` | Maps priority to Bootstrap badge class |
| `formatDate(timestamp)` | Formats timestamp to `MMM DD, YYYY` |
| `calculateProgress(project)` | `(completed tasks / total tasks) * 100` |

### Status Badge Colors

| Status | Class |
|--------|-------|
| `planning` | `bg-info` |
| `in_progress` | `bg-primary` |
| `completed` | `bg-success` |
| `on_hold` | `bg-warning` |

### Priority Badge Colors

| Priority | Class |
|----------|-------|
| `low` | `bg-secondary` |
| `medium` | `bg-info` |
| `high` | `bg-warning` |
| `critical` | `bg-danger` |

## Security Rules

```json
"admin": {
  ".read": "auth != null && auth.token.admin === true",
  ".write": false,
  "projects": {
    ".read": "auth != null && auth.token.admin === true",
    ".write": "auth != null && auth.token.admin === true",
    ".indexOn": ["status", "priority", "locationId", "createdAt"],
    "$projectId": {
      ".validate": "newData.hasChildren(['name', 'status', 'createdAt'])",
      "status": {
        ".validate": "newData.val().matches(/^(planning|in_progress|completed|on_hold)$/)"
      },
      "priority": {
        ".validate": "newData.val().matches(/^(low|medium|high|critical)$/)"
      },
      "tasks/$taskId": {
        ".validate": "newData.hasChildren(['title', 'status', 'createdAt'])"
      },
      "milestones/$milestoneId": {
        ".validate": "newData.hasChildren(['name', 'status', 'createdAt'])"
      }
    }
  }
}
```

**Note:** The `admin` node has `.write: false` at the root level, but `admin/projects` overrides this with admin-only write access.

## Known Gotchas

1. **Super Admin required**: Both the Cloud Functions and security rules require the user to be a Super Admin (checked via `admins/{uid}/superAdmin: true`). Regular admins cannot access this module.
2. **Two project nodes**: `admin/projects` (new) and `projects` (legacy) have different status value sets. The `admin/projects` path uses `planning`/`on_hold` while `projects` uses `planned`/`blocked`.
3. **Bearer token auth**: Unlike most Cloud Functions that use Firebase `onCall`, project management uses `onRequest` with manual Bearer token verification. This allows REST API access but requires explicit CORS handling.
4. **Milestone validation requires `createdAt`**: Security rules validate that milestones have `name`, `status`, and `createdAt`. The `createProject` function does not currently set `createdAt` on initial milestones - [TODO: verify if this causes write failures].
5. **No real-time sync**: The `projectService` fetches data on demand. There are no `onValue` listeners for real-time project updates.
6. **Location association optional**: Projects can optionally be associated with a `locationId` for location-specific tracking, but this is not required.
