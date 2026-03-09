# ROSS Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all CRITICAL (excl. C2), HIGH, and MEDIUM issues identified in the ROSS multi-agent review — 23 fixes across backend Cloud Functions, RTDB security rules, and the Vue 3 frontend module.

**Architecture:** Four specialist agents work in two phases — SEC fixes the auth gap first (Phase 2), then BACK and FRONT work in parallel (Phase 3), then QA verifies the combined diff (Phase 4). All agents run in plan-approval mode; COORD approves each plan before code is touched.

**Tech Stack:** Firebase Cloud Functions (Node.js 22), Firebase RTDB, Vue 3 CDN (Options API), `firebase-admin` SDK, `firebase-functions` v7.

---

## Execution Sequence

```
Phase 1 (COORD):   Worktree + comms setup
Phase 2 (SEC):     C3 auth gap — verifyAdmin → verifySuperAdmin on template CRUD
Phase 3a (BACK):   Backend fixes — C4, H1, H5, H6, H7 + medium backend issues   ┐ parallel
Phase 3b (FRONT):  Frontend fixes — C1, C5, H2, H3, H4, H8 + medium frontend    ┘
Phase 4 (QA):      Read-only diff review — verify all fixes, check interactions
```

---

## Phase 1 — Worktree Setup (COORD)

### Task 1: Create worktree and comms

**Files:**
- Create: `.worktrees/ross-fixes/comms.md`

**Step 1: Create worktree**
```bash
git worktree add .worktrees/ross-fixes -b fix/ross-hardening
```

**Step 2: Write comms.md**

Create `.worktrees/ross-fixes/comms.md`:
```markdown
# ROSS Hardening — Agent Comms

| Agent | Status | Files |
|-------|--------|-------|
| SEC   | PENDING | functions/ross.js (template fns), database.rules.json |
| BACK  | PENDING | functions/ross.js |
| FRONT | PENDING | public/js/modules/ross/index.js, ross-service.js |
| QA    | PENDING | All modified files (read-only) |

## Log
_Agents append here._
```

**Step 3: Spawn SEC, then wait for SEC COMPLETE before spawning BACK + FRONT**

---

## Phase 2 — SEC: Template Auth Gap (C3)

### Task 2: Restore verifySuperAdmin on template CRUD functions

**Files:**
- Modify: `functions/ross.js:101, 145, 186`
- Modify: `database.rules.json` (verify rules already match — no change needed)
- Modify: `public/kb/features/ROSS.md` (document the decision)

**Context:**
`rossCreateTemplate` (line 96), `rossUpdateTemplate` (line 140), and `rossDeleteTemplate` (line 181) each call `verifyAdmin()`. The RTDB rules at the `/ross/templates` node require `superAdmin`. Since Cloud Functions use Admin SDK (bypasses RTDB rules), `verifyAdmin()` allows any admin to mutate public templates. The ROSS.md note says this was changed intentionally, but it conflicts with the rules. Resolution: restore `verifySuperAdmin()` in all three functions.

`verifySuperAdmin` is already defined at `ross.js:47` — it calls `verifyAdmin` internally and then checks the superAdmin claim.

**Step 1: Fix `rossCreateTemplate` (line 101)**

Change:
```js
const { uid } = await verifyAdmin(decodedToken);
```
To:
```js
const { uid } = await verifySuperAdmin(decodedToken);
```

**Step 2: Fix `rossUpdateTemplate` (line 145)**

Change:
```js
const { uid } = await verifyAdmin(decodedToken);
```
To:
```js
const { uid } = await verifySuperAdmin(decodedToken);
```

**Step 3: Fix `rossDeleteTemplate` (line 186)**

Change:
```js
const { uid } = await verifyAdmin(decodedToken);
```
To:
```js
const { uid } = await verifySuperAdmin(decodedToken);
```

**Step 4: Update ROSS.md**

In `public/kb/features/ROSS.md`, find the Known Bugs table and update the templates row:
```markdown
| Templates gated to superAdmin | `rossCreateTemplate` / `rossUpdateTemplate` / `rossDeleteTemplate` used `verifySuperAdmin` | Restored to `verifySuperAdmin` — Admin SDK bypasses RTDB rules, so Cloud Functions must enforce the same access level the rules intend |
```

**Step 5: Commit**
```bash
git add functions/ross.js public/kb/features/ROSS.md
git commit -m "fix(ross): restore verifySuperAdmin on template CRUD functions

Admin SDK bypasses RTDB security rules. rossCreateTemplate,
rossUpdateTemplate, and rossDeleteTemplate must enforce superAdmin
at the function level to match the RTDB rules intent."
```

**Step 6: Signal COORD**
Append to `comms.md`: `### [SEC → COORD] — COMPLETE — C3 fixed. BACK and FRONT may proceed.`

---

## Phase 3a — BACK: Backend Fixes

> Start only after SEC signals COMPLETE in comms.md.

### Task 3: C4 — Null guard on `rossUpdateTemplate` and `rossUpdateWorkflow`

**Files:**
- Modify: `functions/ross.js:154–155` (rossUpdateTemplate)
- Modify: `functions/ross.js:371–374` (rossUpdateWorkflow)

**Context:** `updates.category` access at line 155 throws `TypeError` if `updates` is `null` or `undefined`. Same pattern at `rossUpdateWorkflow` line 371 (`updates[field]`).

**Step 1: Fix `rossUpdateTemplate`**

After line 149 (`if (!templateId)`), add null guard before line 155:
```js
if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates object is required' });
}
```

**Step 2: Fix `rossUpdateWorkflow`**

After line 365 (`if (!workflowId)`), add:
```js
if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'updates object is required' });
}
```

**Step 3: Commit**
```bash
git add functions/ross.js
git commit -m "fix(ross): guard against null updates in rossUpdateTemplate and rossUpdateWorkflow"
```

---

### Task 4: H1 — Pause/resume silently broken (allowedFields missing 'status')

**Files:**
- Modify: `functions/ross.js:371`

**Context:** `pauseResumeWorkflow()` in the frontend sends `{ status: 'paused'|'active' }` but `allowedFields` at line 371 strips `status`. UI shows change; RTDB never persists it. This is the most impactful bug — workflows appear paused but reminders keep firing.

**Step 1: Add 'status' to allowedFields**

Change line 371 from:
```js
const allowedFields = ['name', 'notificationChannels', 'notifyPhone', 'notifyEmail', 'daysBeforeAlert'];
```
To:
```js
const allowedFields = ['name', 'notificationChannels', 'notifyPhone', 'notifyEmail', 'daysBeforeAlert', 'status'];
```

**Step 2: Add status validation after sanitization (after line 376)**
```js
if (sanitized.status !== undefined && !['active', 'paused'].includes(sanitized.status)) {
    return res.status(400).json({ error: "Invalid status value. Use 'active' or 'paused'" });
}
```

**Step 3: Commit**
```bash
git add functions/ross.js
git commit -m "fix(ross): add status to allowedFields in rossUpdateWorkflow

pause/resume was silently discarded — status was stripped by the
allowedFields sanitizer. Workflows appeared paused in the UI but
reminders continued firing against RTDB data."
```

---

### Task 5: H5 — Scheduled reminder O(N) full-tree scan

**Files:**
- Modify: `functions/ross.js:648`

**Context:** `db.ref('ross/workflows').once('value')` loads ALL users' entire workflow trees. As owner count grows this hits Cloud Function memory limits. Fix: maintain a `ross/ownerIndex` node listing active owner UIDs, then fetch per-owner. Update `rossCreateWorkflow` and `rossActivateWorkflow` to write to this index.

**Step 1: Find rossCreateWorkflow — add index write**

In `rossCreateWorkflow` (around line 289), after the workflow is written to RTDB, add:
```js
await db.ref(`ross/ownerIndex/${uid}`).set(true);
```

**Step 2: Find rossActivateWorkflow — add index write**

In `rossActivateWorkflow` (around line 214), after the workflow location is written, add:
```js
await db.ref(`ross/ownerIndex/${uid}`).set(true);
```

**Step 3: Update scheduler to use index**

Replace line 648:
```js
const ownersSnap = await db.ref('ross/workflows').once('value');
const ownerMap = ownersSnap.val() || {};
```
With:
```js
const indexSnap = await db.ref('ross/ownerIndex').once('value');
const ownerMap = {};
if (indexSnap.exists()) {
    const ownerIds = Object.keys(indexSnap.val());
    await Promise.all(ownerIds.map(async (ownerId) => {
        const ownerSnap = await db.ref(`ross/workflows/${ownerId}`).once('value');
        if (ownerSnap.exists()) ownerMap[ownerId] = ownerSnap.val();
    }));
}
```

**Step 4: Commit**
```bash
git add functions/ross.js
git commit -m "fix(ross): replace O(N) scheduler full-tree scan with ownerIndex fan-out

rossScheduledReminder loaded all workflow data for all users into
memory. Now maintains ross/ownerIndex and fetches per-owner."
```

---

### Task 6: H6 — rossManageTask requires taskData for delete

**Files:**
- Modify: `functions/ross.js:482`

**Context:** Line 482 rejects if `!taskData` before the `switch(action)`. Delete only needs `taskId`. The guard must move inside the non-delete cases.

**Step 1: Remove the global taskData guard at line 482**

Delete:
```js
if (!taskData) return res.status(400).json({ error: 'Task data is required' });
```

**Step 2: Add taskData guard inside `case 'create'` and `case 'update'`**

Inside `case 'create':` (before accessing `taskData.title`):
```js
if (!taskData || typeof taskData !== 'object') {
    return res.status(400).json({ error: 'taskData is required for create' });
}
```

Inside `case 'update':` (before the `allowedTaskFields` loop):
```js
if (!taskData || typeof taskData !== 'object') {
    return res.status(400).json({ error: 'taskData is required for update' });
}
```

**Step 3: Commit**
```bash
git add functions/ross.js
git commit -m "fix(ross): allow rossManageTask delete action without taskData"
```

---

### Task 7: H7 — rossCompleteTask race condition

**Files:**
- Modify: `functions/ross.js:549–573`

**Context:** Two concurrent task completions can both trigger (or both miss) the "all tasks complete" history write. Fix: wrap the task update + completion check in an RTDB transaction on the location node.

**Step 1: Replace the sequential read-after-write with a transaction**

Replace lines 544–573 with:
```js
const now = Date.now();
const locationRef = db.ref(`ross/workflows/${uid}/${workflowId}/locations/${locationId}`);

let triggerHistory = false;
let allTasksCount = 0;

await locationRef.transaction(locationData => {
    if (!locationData) return locationData;
    if (!locationData.tasks || !locationData.tasks[taskId]) return locationData;

    // Idempotency: skip if already completed
    if (locationData.tasks[taskId].status === 'completed') return locationData;

    locationData.tasks[taskId].status = 'completed';
    locationData.tasks[taskId].completedAt = now;

    const allTasks = Object.values(locationData.tasks);
    const allDone = allTasks.every(t => t.status === 'completed');
    if (allDone && !locationData._historyCycleWritten) {
        locationData._triggerHistory = true;
        locationData._historyTimestamp = now;
        allTasksCount = allTasks.length;
    }
    return locationData;
}, undefined, false);

// Check if the transaction set the trigger flag
const afterSnap = await locationRef.once('value');
const afterData = afterSnap.val();
if (afterData && afterData._triggerHistory) {
    const workflowSnap = await db.ref(`ross/workflows/${uid}/${workflowId}`).once('value');
    const workflow = workflowSnap.val();
    const cycleId = `${new Date().getFullYear()}-${workflow?.recurrence || 'unknown'}`;
    const historyRecord = {
        cycleId,
        period: String(new Date().getFullYear()),
        completedAt: now,
        tasksTotal: afterData._historyTimestamp ? allTasksCount : Object.values(afterData.tasks || {}).length,
        tasksCompleted: Object.values(afterData.tasks || {}).filter(t => t.status === 'completed').length,
        completionRate: 100,
        onTime: now <= (afterData.locationNextDueDate || now)
    };
    await db.ref(`ross/workflows/${uid}/${workflowId}/locations/${locationId}/history/${cycleId}`).set(historyRecord);
    // Clear the trigger flag
    await locationRef.update({ _triggerHistory: null, _historyTimestamp: null });
}

await db.ref(`ross/workflows/${uid}/${workflowId}`).update({ updatedAt: now });
res.json({ result: { success: true, taskId } });
```

**Step 2: Commit**
```bash
git add functions/ross.js
git commit -m "fix(ross): use RTDB transaction in rossCompleteTask to eliminate race condition

Concurrent task completions could duplicate or drop the 'all tasks
complete' history record. Transaction guarantees atomic read-modify-write."
```

---

### Task 8: Medium backend fixes

**Files:**
- Modify: `functions/ross.js` (multiple locations)

**Step 1: Fix fragile error status code detection**

The pattern `error.message.includes('Admin') ? 403 : 401` appears in every catch block. Replace with consistent 500 for unexpected errors, 403 for auth failures. In every `catch (error)` block across all functions:

Change:
```js
res.status(error.message.includes('Admin') ? 403 : 401).json({ error: error.message });
```
To:
```js
const statusCode = error.code === 'PERMISSION_DENIED' || error.message.includes('Admin') || error.message.includes('Unauthorized') ? 403 : 500;
res.status(statusCode).json({ error: error.message });
```

**Step 2: Validate daysBeforeAlert array contents**

In `rossCreateTemplate` (line 119) and `rossActivateWorkflow`, after accepting `daysBeforeAlert`:
```js
const validatedDays = Array.isArray(daysBeforeAlert)
    ? daysBeforeAlert.filter(d => Number.isInteger(d) && d > 0)
    : [30, 7];
```
Use `validatedDays` instead of the raw value.

**Step 3: Add existence check to rossDeleteTemplate**

In `rossDeleteTemplate`, after line 190 (`if (!templateId)`), add:
```js
const existing = await db.ref(`ross/templates/${templateId}`).once('value');
if (!existing.exists()) return res.status(404).json({ error: 'Template not found' });
```

**Step 4: Add existence check to rossDeleteWorkflow**

In `rossDeleteWorkflow`, after line 399 (`if (!workflowId)`), add:
```js
const existing = await db.ref(`ross/workflows/${uid}/${workflowId}`).once('value');
if (!existing.exists()) return res.status(404).json({ error: 'Workflow not found' });
```

**Step 5: Sync category and recurrence constants with ROSS.md**

At `ross.js:22–23`, the constants are:
```js
VALID_CATEGORIES = ['compliance', 'operations', 'growth', 'finance', 'hr', 'maintenance']
VALID_RECURRENCES = ['once', 'daily', 'weekly', 'monthly', 'quarterly', 'annually']
```

Update `ROSS.md` database structure section to reflect the actual constants (not the stale docs values). Do NOT change the code constants — they are correct; the docs are stale.

**Step 6: Commit**
```bash
git add functions/ross.js public/kb/features/ROSS.md
git commit -m "fix(ross): medium backend hardening — error codes, validation, existence checks, docs sync"
```

**Step 7: Signal COORD**
Append to `comms.md`: `### [BACK → COORD] — COMPLETE — All backend tasks done.`

---

## Phase 3b — FRONT: Frontend Fixes

> Start only after SEC signals COMPLETE in comms.md. Runs parallel to BACK.

### Task 9: C1 — Vue app orphan on double-init

**Files:**
- Modify: `public/js/modules/ross/index.js:100`

**Context:** `initializeRoss()` at line 100 has no guard against `rossState.app` already being non-null. Rapid sidebar clicks orphan the previous Vue instance.

**Step 1: Add guard at top of initializeRoss**

After line 100 (`export async function initializeRoss() {`), add as the first line of the function body:
```js
if (rossState.app) {
    cleanupRoss();
}
```

**Step 2: Commit**
```bash
git add public/js/modules/ross/index.js
git commit -m "fix(ross): guard initializeRoss against double-mount — prevents Vue app leak"
```

---

### Task 10: C5 — rossState.locationId persists across auth sessions

**Files:**
- Modify: `public/js/modules/ross/index.js:13–16, 100, 1855`

**Context:** `rossState` is a module-level singleton. If the Firebase auth user changes without a full page reload, `rossState.locationId` retains the previous user's location. Fix: attach an `onAuthStateChanged` listener in `initializeRoss()` and unsubscribe in `cleanupRoss()`.

**Step 1: Add authUnsubscribe to rossState**

Change the `rossState` object (lines 13–16) from:
```js
const rossState = {
    app: null,
    locationId: null
};
```
To:
```js
const rossState = {
    app: null,
    locationId: null,
    authUnsubscribe: null
};
```

**Step 2: Attach auth state listener in initializeRoss**

At the end of `initializeRoss()`, after `rossState.app.mount(container)` (line 1848), add:
```js
rossState.authUnsubscribe = auth.onAuthStateChanged((user) => {
    if (!user && rossState.app) {
        cleanupRoss();
    }
});
```

**Step 3: Unsubscribe in cleanupRoss**

In `cleanupRoss()` (line 1855), add after `rossState.app = null`:
```js
if (rossState.authUnsubscribe) {
    rossState.authUnsubscribe();
    rossState.authUnsubscribe = null;
}
```

**Step 4: Commit**
```bash
git add public/js/modules/ross/index.js
git commit -m "fix(ross): invalidate rossState on auth user change to prevent session bleed"
```

---

### Task 11: H2 — Shared tabLoading race condition

**Files:**
- Modify: `public/js/modules/ross/index.js:330, 496, 795, 935, 1201, 1213, 1415, 1430, 1620, 1632`

**Context:** All tabs share one `tabLoading` boolean. Rapid tab switches cause the spinner to disappear prematurely. Replace with per-tab flags.

**Step 1: Replace tabLoading in data() (line 935)**

Change:
```js
tabLoading: false,
```
To:
```js
workflowsLoading: false,
templatesLoading: false,
reportsLoading: false,
staffLoading: false,
```

**Step 2: Update template spinner divs**

- Line 330 (templates tab): `v-if="tabLoading"` → `v-if="templatesLoading"`
- Line 496 (workflows tab): `v-if="tabLoading"` → `v-if="workflowsLoading"`
- Line 795 (reports tab): `v-if="tabLoading"` → `v-if="reportsLoading"`

**Step 3: Update loadTemplates (~line 1201)**

Change `this.tabLoading = true/false` to `this.templatesLoading = true/false`.

**Step 4: Update loadWorkflows (~line 1415)**

Change `this.tabLoading = true/false` to `this.workflowsLoading = true/false`.

**Step 5: Update loadReports (~line 1620)**

Change `this.tabLoading = true/false` to `this.reportsLoading = true/false`.

**Step 6: Commit**
```bash
git add public/js/modules/ross/index.js
git commit -m "fix(ross): replace shared tabLoading with per-tab loading flags to eliminate race condition"
```

---

### Task 12: H3 — rossState singleton mutation (locationId)

**Files:**
- Modify: `public/js/modules/ross/index.js` (data(), applyPickedLocation, all rossState.locationId refs in component methods)

**Context:** `rossState.locationId` is mutated from inside the Vue component. Fold it into Vue `data()` so the component owns its own state. Keep `rossState.app` and `rossState.authUnsubscribe` as the sole module-level refs.

**Step 1: Add locationId to data()**

In `data()` (around line 935), add:
```js
locationId: rossState.locationId,
```

**Step 2: Replace all `rossState.locationId` references inside component methods**

Search for `rossState.locationId` in the file. Every occurrence inside the `Vue.createApp({ ... })` block should become `this.locationId`. Occurrences in `initializeRoss()` and `cleanupRoss()` remain as `rossState.locationId`.

Key replacements (verify exact lines in file):
- `computed: { showLocationPicker() { return !rossState.locationId; } }` → `return !this.locationId;`
- All `if (!rossState.locationId)` guards in methods → `if (!this.locationId)`
- All API calls using `rossState.locationId` as argument → `this.locationId`
- `applyPickedLocation()` line 1234: `rossState.locationId = this.pickedLocationId` → `this.locationId = this.pickedLocationId`

**Step 3: Commit**
```bash
git add public/js/modules/ross/index.js
git commit -m "fix(ross): move locationId from rossState singleton into Vue data() — eliminates module-level mutation"
```

---

### Task 13: H4 — Service client params mismatch

**Files:**
- Modify: `public/js/modules/ross/services/ross-service.js:65–71`
- Modify: `public/js/modules/ross/index.js` (callers of updateWorkflow/deleteWorkflow)

**Context:** `updateWorkflow(locationId, workflowId, updates)` and `deleteWorkflow(locationId, workflowId)` pass `locationId` to the Cloud Function which ignores it. Remove the unused param.

**Step 1: Update ross-service.js**

Change:
```js
async updateWorkflow(locationId, workflowId, updates) {
    return this.callFunction('rossUpdateWorkflow', { locationId, workflowId, updates });
}

async deleteWorkflow(locationId, workflowId) {
    return this.callFunction('rossDeleteWorkflow', { locationId, workflowId });
}
```
To:
```js
async updateWorkflow(workflowId, updates) {
    return this.callFunction('rossUpdateWorkflow', { workflowId, updates });
}

async deleteWorkflow(workflowId) {
    return this.callFunction('rossDeleteWorkflow', { workflowId });
}
```

**Step 2: Update callers in index.js**

Search for `rossService.updateWorkflow(` and `rossService.deleteWorkflow(` in `index.js`. Remove the `locationId` first argument from each call site. Key locations:
- Line ~1454: `rossService.updateWorkflow(rossState.locationId, wf.workflowId, 'update', ...)` — but wait, this is actually `manageTask`. Verify exact calls.
- Line ~1509: `rossService.deleteWorkflow(rossState.locationId, workflow.workflowId)` → `rossService.deleteWorkflow(workflow.workflowId)`
- Line ~1522: `rossService.updateWorkflow(rossState.locationId, workflow.workflowId, { status: newStatus })` → `rossService.updateWorkflow(workflow.workflowId, { status: newStatus })`

**Step 3: Commit**
```bash
git add public/js/modules/ross/services/ross-service.js public/js/modules/ross/index.js
git commit -m "fix(ross): remove unused locationId param from updateWorkflow and deleteWorkflow service methods"
```

---

### Task 14: H8 — getIdToken(true) forces unnecessary token refresh

**Files:**
- Modify: `public/js/modules/ross/services/ross-service.js:15`

**Step 1: Remove the force-refresh flag**

Change:
```js
return await user.getIdToken(true);
```
To:
```js
return await user.getIdToken();
```

**Step 2: Commit**
```bash
git add public/js/modules/ross/services/ross-service.js
git commit -m "fix(ross): remove getIdToken(true) force-refresh — eliminates 200-500ms latency per API call"
```

---

### Task 15: Medium frontend fixes

**Files:**
- Modify: `public/js/modules/ross/index.js` (multiple locations)

**Step 1: Remove dead isSuperAdmin code**

Remove `checkSuperAdmin()` method and its call in `mounted()`. Remove `isSuperAdmin: false` from `data()`. The method fetches a value that is never used in any `v-if`.

**Step 2: Fix loadStaff eager call on mount**

In `mounted()` (line 1836), remove `this.loadStaff()`. Staff is already loaded lazily via `loadStaff()` when a workflow is opened (line 1437) and when the staff tab is activated via `switchTab('staff')` (line 1044).

**Step 3: Reset builder form on location change**

In `applyPickedLocation()` (around line 1233), after updating `this.locationId` (per Task 12 change), add:
```js
// Reset builder state so it uses the new location
this.builder = {
    step: 1,
    name: '',
    description: '',
    category: '',
    recurrence: '',
    tasks: []
};
```
Verify that `this.builder` matches the actual data() structure.

**Step 4: Debounce switchTab async loads with a version counter**

In `data()`, add:
```js
tabVersion: 0,
```

In `switchTab(tab)` (line 1032), at the start of each async load block:
```js
const version = ++this.tabVersion;
```

In each async load's result handler, add a guard:
```js
if (version !== this.tabVersion) return; // superseded by newer switch
```
Apply to `loadWorkflows`, `loadTemplates`, `loadReports`, `loadStaff` where called from `switchTab`.

**Step 5: Fix loadAvailableLocations over-fetching**

In `loadAvailableLocations()` (line 1217), the current implementation fetches all locations. Filter to only the current user's locations by reading from `admins/${uid}/locations` instead of the global `/locations` node. Read the current implementation to understand the exact path, then scope it.

**Step 6: Commit**
```bash
git add public/js/modules/ross/index.js
git commit -m "fix(ross): medium frontend hardening — remove dead isSuperAdmin, lazy loadStaff, builder reset on location change, tab version counter, scoped location fetch"
```

**Step 7: Signal COORD**
Append to `comms.md`: `### [FRONT → COORD] — COMPLETE — All frontend tasks done.`

---

## Phase 4 — QA: Verify Combined Diff

> Start only after BOTH BACK and FRONT signal COMPLETE in comms.md.

### Task 16: QA review

**Files:**
- Read: `functions/ross.js` (all BACK + SEC changes)
- Read: `public/js/modules/ross/index.js` (all FRONT changes)
- Read: `public/js/modules/ross/services/ross-service.js` (H4, H8 changes)

**Step 1: Verify each fix against its stated issue**

For each issue C3, C4, H1, H5, H6, H7, H8, C1, C5, H2, H3, H4 and all medium fixes:
- Confirm the fix is present and complete
- Confirm no typos or logic errors

**Step 2: Check fix interactions**

Key interactions to verify:
- **C1 + C5**: `cleanupRoss()` now unsubscribes `authUnsubscribe`. The C1 guard calls `cleanupRoss()` if `rossState.app` exists. Confirm `cleanupRoss()` handles the case where `authUnsubscribe` is null (first init).
- **H3 + H4**: `this.locationId` (Task 12) must be passed to `updateWorkflow(workflowId, updates)` (Task 13 removed locationId param). Confirm no call site still passes `this.locationId` as first arg.
- **H3 + H2**: The per-tab flags from Task 11 and the `this.locationId` refs from Task 12 must not conflict in `loadWorkflows`, `loadTemplates`, `loadReports`.
- **Task 9 (C1) + Task 10 (C5)**: Both modify `cleanupRoss` and `initializeRoss`. Confirm no conflicting edits.

**Step 3: Check for regressions**

- Confirm `rossCompleteTask` transaction (H7) still returns `{ success: true, taskId }` on success
- Confirm template CRUD functions now correctly return 403 for non-superAdmin (C3)
- Confirm `deleteWorkflow` / `deleteTemplate` now return 404 for non-existent IDs (medium fix)
- Confirm `rossUpdateWorkflow` now persists `status: 'paused'` (H1) — trace the sanitization loop

**Step 4: Flag any new issues**

If regressions or new issues are found, append to `comms.md` with severity and line reference.

**Step 5: Signal COORD**
Append to `comms.md`:
```
### [QA → COORD] — COMPLETE — Review done
Status: PASS / FAIL (with details)
```

---

## Phase 5 — COORD: Final Commit and Cleanup

### Task 17: Merge and cleanup

**Step 1: Verify comms.md shows all agents COMPLETE**

**Step 2: Verify git log**
```bash
git log --oneline fix/ross-hardening
```

**Step 3: Remove worktree**
```bash
git worktree remove .worktrees/ross-fixes
```

**Step 4: Merge to master**
```bash
git checkout master
git merge fix/ross-hardening --no-ff -m "fix(ross): harden ROSS module — 23 fixes (4 critical, 8 high, 11 medium)"
```

**Step 5: Update ROSS.md Known Bugs table**

Ensure all fixed issues are reflected with their resolutions.

**Step 6: Final commit**
```bash
git add public/kb/features/ROSS.md
git commit -m "docs(ross): update ROSS.md with hardening resolutions"
```
