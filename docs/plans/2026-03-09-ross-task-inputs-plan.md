# ROSS Task Input Types — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 10 typed task inputs (photo, text, temperature, etc.) to ROSS workflows, stored per-run so recurring workflows accumulate full history.

**Architecture:** Task objects gain `inputType` + `inputConfig` fields (definition only). Responses live in a new `ross/runs/{uid}/{workflowId}/{locationId}/{runId}` RTDB node — one run per completion cycle. Four new Cloud Functions (`rossCreateRun`, `rossSubmitResponse`, `rossGetRun`, `rossGetRunHistory`) handle the run lifecycle. Existing `checkbox` tasks and `rossCompleteTask` are unchanged for backward compatibility.

**Tech Stack:** Firebase Cloud Functions v2 (Node 22, `onRequest`), Firebase RTDB, Vue 3 CDN Options API, Bootstrap 5, Firebase Storage (photos/signatures), SweetAlert2.

**Testing:** No Jest config exists. Verify each Cloud Function task via `firebase emulators:start` + `curl` / Postman. Verify frontend tasks visually in the browser against the emulator.

---

## Background Reading

Before starting, read:
- `docs/plans/2026-03-09-ross-task-inputs-design.md` — full design doc
- `functions/ross.js` — all existing functions (848 lines)
- `public/js/modules/ross/index.js` — Vue 3 app (1901 lines)
- `public/js/modules/ross/services/ross-service.js` — service client (102 lines)
- `database.rules.json` lines 384–402 — existing `ross` RTDB rules
- `functions/index.js` lines 3112–3127 — existing ROSS exports

**RTDB auth pattern:** All ROSS functions use `onRequest` + `verifyAuthToken` + `verifyAdmin`. Copy this exact pattern for every new function. Do NOT use `onCall`.

**Vue pattern:** This is a Vue 3 CDN Options API app — no `<script setup>`, no build step. All component logic is in the single `Vue.createApp({ ... })` call in `index.js`. Template is an inline string. Use `v-if` / `v-else-if` chains. Never mutate state directly — always use spread (`{ ...obj, key: value }`).

---

## Task 1: RTDB security rules for `ross/runs`

**Files:**
- Modify: `database.rules.json` lines 384–402

The `ross/runs` node must be owner-scoped (same pattern as `ross/workflows`). The Admin SDK bypasses RTDB rules, so these rules are a defence-in-depth layer. Also add `ownerIndex` rule (Admin SDK writes only — deny direct client writes).

**Step 1: Open `database.rules.json` and read lines 384–402**

Confirm the current `ross` block ends at line 402 with `}` closing the `ross` key.

**Step 2: Add `runs` and `ownerIndex` rules inside the `ross` block**

Replace the current `ross` block (lines 384–402):

```json
"ross": {
  "templates": {
    ".read": "auth != null && root.child('admins').child(auth.uid).exists()",
    ".write": "auth != null && root.child('admins').child(auth.uid).child('superAdmin').val() === true"
  },
  "workflows": {
    "$ownerId": {
      ".read": "auth != null && auth.uid === $ownerId && root.child('admins').child(auth.uid).exists()",
      ".write": "auth != null && auth.uid === $ownerId && root.child('admins').child(auth.uid).exists()"
    }
  },
  "runs": {
    "$ownerId": {
      ".read": "auth != null && auth.uid === $ownerId && root.child('admins').child(auth.uid).exists()",
      ".write": "auth != null && auth.uid === $ownerId && root.child('admins').child(auth.uid).exists()"
    }
  },
  "ownerIndex": {
    ".read": "auth != null && root.child('admins').child(auth.uid).exists()",
    ".write": false
  },
  "staff": {
    "$ownerId": {
      ".read": "auth != null && auth.uid === $ownerId && root.child('admins').child(auth.uid).exists()",
      ".write": "auth != null && auth.uid === $ownerId && root.child('admins').child(auth.uid).exists()",
      "$locationId": {}
    }
  }
}
```

**Step 3: Verify rules are valid JSON**

```bash
cd C:\Users\katso\OneDrive\Documents\GitHub\MerakiCaptivePortal-firebaseDB
node -e "JSON.parse(require('fs').readFileSync('database.rules.json','utf8')); console.log('Valid JSON')"
```
Expected: `Valid JSON`

**Step 4: Commit**

```bash
git add database.rules.json
git commit -m "feat(ross): add RTDB security rules for ross/runs and ownerIndex"
```

---

## Task 2: Add input type constants and update `rossManageTask`

**Files:**
- Modify: `functions/ross.js` lines 22–23 (constants) and lines 528–556 (rossManageTask create/update cases)

**Step 1: Add `VALID_INPUT_TYPES` constant after line 23**

After `const VALID_RECURRENCES = [...]` at line 23, add:

```javascript
const VALID_INPUT_TYPES = [
    'checkbox', 'text', 'number', 'temperature',
    'yes_no', 'dropdown', 'timestamp', 'photo', 'signature', 'rating'
];
```

**Step 2: Update `rossManageTask` `create` case (around line 534)**

Find the `case 'create':` block. The current `task` object is:

```javascript
const task = {
    title: taskData.title?.trim() || 'Untitled Task',
    status: 'pending',
    dueDate: taskData.dueDate || null,
    completedAt: null,
    assignedTo: taskData.assignedTo || null,
    order: taskData.order || 1
};
```

Replace it with:

```javascript
const inputType = VALID_INPUT_TYPES.includes(taskData.inputType)
    ? taskData.inputType
    : 'checkbox';
const task = {
    title: taskData.title?.trim() || 'Untitled Task',
    inputType,
    inputConfig: (taskData.inputConfig && typeof taskData.inputConfig === 'object')
        ? taskData.inputConfig
        : {},
    required: taskData.required !== false,
    status: 'pending',
    dueDate: taskData.dueDate || null,
    completedAt: null,
    assignedTo: taskData.assignedTo || null,
    order: taskData.order || 1
};
```

**Step 3: Update `rossManageTask` `update` case — extend `allowedTaskFields`**

Find (around line 551):
```javascript
const allowedTaskFields = ['title', 'status', 'dueDate', 'assignedTo', 'order'];
```

Replace with:
```javascript
const allowedTaskFields = ['title', 'inputType', 'inputConfig', 'required', 'status', 'dueDate', 'assignedTo', 'order'];
```

Also add `inputType` validation after building `updates`:

```javascript
const updates = {};
allowedTaskFields.forEach(f => { if (taskData[f] !== undefined) updates[f] = taskData[f]; });
if (updates.inputType !== undefined && !VALID_INPUT_TYPES.includes(updates.inputType)) {
    return res.status(400).json({ error: `Invalid inputType. Must be one of: ${VALID_INPUT_TYPES.join(', ')}` });
}
```

**Step 4: Verify ross.js has no syntax errors**

```bash
cd "C:\Users\katso\OneDrive\Documents\GitHub\MerakiCaptivePortal-firebaseDB\functions"
node -e "require('./ross'); console.log('OK')"
```
Expected: `OK`

**Step 5: Commit**

```bash
git add functions/ross.js
git commit -m "feat(ross): add VALID_INPUT_TYPES constant and extend rossManageTask for typed tasks"
```

---

## Task 3: `rossCreateRun` — idempotent run creation

**Files:**
- Modify: `functions/ross.js` — append before the `// STAFF OPERATIONS` comment (~line 760)

**Step 1: Read `functions/ross.js` to find the exact line of the staff operations comment**

Look for `// ============================================\n// STAFF OPERATIONS`.

**Step 2: Insert `rossCreateRun` function**

Add the following block immediately before the `// STAFF OPERATIONS` comment:

```javascript
// ============================================
// RUN OPERATIONS
// ============================================

/**
 * Create or return the current open run for a workflow + location.
 * Idempotent: if an open run already exists, return it.
 * Access: All admins
 */
exports.rossCreateRun = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId } = data;
            if (!workflowId || !locationId) {
                return res.status(400).json({ error: 'workflowId and locationId are required' });
            }

            // Verify workflow + location exist and belong to this owner
            const locSnap = await db.ref(`ross/workflows/${uid}/${workflowId}/locations/${locationId}`).once('value');
            if (!locSnap.exists()) return res.status(404).json({ error: 'Workflow location not found' });

            // Find existing open run
            const runsRef = db.ref(`ross/runs/${uid}/${workflowId}/${locationId}`);
            const existingSnap = await runsRef.orderByChild('completedAt').equalTo(null).limitToFirst(1).once('value');
            if (existingSnap.exists()) {
                const runs = existingSnap.val();
                const runId = Object.keys(runs)[0];
                return res.json({ result: { success: true, runId, run: runs[runId], created: false } });
            }

            // Create new run
            const runId = generateId();
            const now = Date.now();
            const run = {
                id: runId,
                workflowId,
                locationId,
                startedAt: now,
                completedAt: null,
                completedBy: null
            };
            await runsRef.child(runId).set(run);
            res.json({ result: { success: true, runId, run, created: true } });
        } catch (error) {
            console.error('[rossCreateRun] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});
```

**Step 3: Verify no syntax errors**

```bash
cd "C:\Users\katso\OneDrive\Documents\GitHub\MerakiCaptivePortal-firebaseDB\functions"
node -e "require('./ross'); console.log('OK')"
```
Expected: `OK`

**Step 4: Commit**

```bash
git add functions/ross.js
git commit -m "feat(ross): add rossCreateRun — idempotent run creation"
```

---

## Task 4: `rossSubmitResponse` — submit a typed task response

**Files:**
- Modify: `functions/ross.js` — append after `rossCreateRun`

This is the most complex function. It:
1. Validates the response value matches the task's `inputType`
2. Auto-flags if `temperature`/`number` value breaches `inputConfig.max` or `inputConfig.min`
3. Rejects if flagged + `inputConfig.requiredNote === true` + no `note` provided
4. Writes the response to `ross/runs/{uid}/{workflowId}/{locationId}/{runId}/responses/{taskId}`
5. Checks if all `required` tasks now have responses — if so, marks run `completedAt`

**Step 1: Append `rossSubmitResponse` after `rossCreateRun`**

```javascript
/**
 * Submit a typed response for one task within a run.
 * Auto-flags temperature/number breaches. Enforces requiredNote.
 * Marks run complete when all required tasks have responses.
 * Access: All admins
 */
exports.rossSubmitResponse = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId, runId, taskId, value, note } = data;
            if (!workflowId || !locationId || !runId || !taskId) {
                return res.status(400).json({ error: 'workflowId, locationId, runId, and taskId are required' });
            }
            if (value === undefined || value === null) {
                return res.status(400).json({ error: 'value is required' });
            }

            // Verify run exists and is open
            const runRef = db.ref(`ross/runs/${uid}/${workflowId}/${locationId}/${runId}`);
            const runSnap = await runRef.once('value');
            if (!runSnap.exists()) return res.status(404).json({ error: 'Run not found' });
            const run = runSnap.val();
            if (run.completedAt !== null) return res.status(409).json({ error: 'Run is already completed' });

            // Get task definition from workflow
            const locSnap = await db.ref(`ross/workflows/${uid}/${workflowId}/locations/${locationId}`).once('value');
            if (!locSnap.exists()) return res.status(404).json({ error: 'Workflow location not found' });
            const locData = locSnap.val();
            const tasks = locData.tasks || {};
            const taskDef = tasks[taskId];
            if (!taskDef) return res.status(404).json({ error: 'Task not found in workflow' });

            const inputType = taskDef.inputType || 'checkbox';
            const inputConfig = taskDef.inputConfig || {};

            // Auto-flag for temperature and number breaches
            let flagged = false;
            if ((inputType === 'temperature' || inputType === 'number') && typeof value === 'number') {
                if (inputConfig.max !== undefined && value > inputConfig.max) flagged = true;
                if (inputConfig.min !== undefined && value < inputConfig.min) flagged = true;
            }

            // Enforce requiredNote when flagged
            if (flagged && inputConfig.requiredNote === true && (!note || String(note).trim() === '')) {
                return res.status(422).json({
                    error: 'A note is required when the value is out of range',
                    flagged: true
                });
            }

            const now = Date.now();
            const response = {
                taskId,
                inputType,
                value,
                note: (note && String(note).trim()) ? String(note).trim() : null,
                flagged,
                respondedAt: now,
                respondedBy: uid
            };

            await runRef.child(`responses/${taskId}`).set(response);

            // Check if all required tasks now have responses → auto-complete run
            const updatedRunSnap = await runRef.once('value');
            const updatedRun = updatedRunSnap.val();
            const responses = updatedRun.responses || {};

            const requiredTaskIds = Object.entries(tasks)
                .filter(([, t]) => t.required !== false)
                .map(([id]) => id);
            const allRequiredDone = requiredTaskIds.every(id => responses[id] !== undefined);

            if (allRequiredDone) {
                await runRef.update({ completedAt: now, completedBy: uid });
                // Write history record
                const workflowSnap = await db.ref(`ross/workflows/${uid}/${workflowId}`).once('value');
                const workflow = workflowSnap.val() || {};
                const cycleId = `${runId}`;
                const flaggedCount = Object.values(responses).filter(r => r.flagged).length;
                const historyRecord = {
                    cycleId,
                    runId,
                    completedAt: now,
                    completedBy: uid,
                    tasksTotal: Object.keys(tasks).length,
                    tasksRequired: requiredTaskIds.length,
                    flaggedCount,
                    onTime: now <= (locData.nextDueDate || now)
                };
                await db.ref(`ross/workflows/${uid}/${workflowId}/locations/${locationId}/history/${cycleId}`).set(historyRecord);
                await db.ref(`ross/workflows/${uid}/${workflowId}`).update({ updatedAt: now });
            }

            res.json({ result: { success: true, taskId, flagged, runCompleted: allRequiredDone } });
        } catch (error) {
            console.error('[rossSubmitResponse] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});
```

**Step 2: Verify no syntax errors**

```bash
cd "C:\Users\katso\OneDrive\Documents\GitHub\MerakiCaptivePortal-firebaseDB\functions"
node -e "require('./ross'); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add functions/ross.js
git commit -m "feat(ross): add rossSubmitResponse — typed task response with auto-flagging and requiredNote"
```

---

## Task 5: `rossGetRun` — get current run with previous run reference

**Files:**
- Modify: `functions/ross.js` — append after `rossSubmitResponse`

**Step 1: Append `rossGetRun`**

```javascript
/**
 * Get the current open run for a workflow + location.
 * Also returns the most recent completed run's responses as previousResponses
 * so the UI can show "Last time: X" hints.
 * Access: All admins
 */
exports.rossGetRun = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId } = data;
            if (!workflowId || !locationId) {
                return res.status(400).json({ error: 'workflowId and locationId are required' });
            }

            const runsRef = db.ref(`ross/runs/${uid}/${workflowId}/${locationId}`);

            // Current open run
            const openSnap = await runsRef.orderByChild('completedAt').equalTo(null).limitToFirst(1).once('value');
            let currentRun = null;
            if (openSnap.exists()) {
                const runs = openSnap.val();
                const runId = Object.keys(runs)[0];
                currentRun = { ...runs[runId], runId };
            }

            // Most recent completed run (for "last time" reference)
            const completedSnap = await runsRef.orderByChild('completedAt').limitToLast(2).once('value');
            let previousResponses = {};
            if (completedSnap.exists()) {
                const allRuns = Object.values(completedSnap.val());
                const completedRuns = allRuns
                    .filter(r => r.completedAt !== null)
                    .sort((a, b) => b.completedAt - a.completedAt);
                if (completedRuns.length > 0) {
                    previousResponses = completedRuns[0].responses || {};
                }
            }

            res.json({ result: { success: true, currentRun, previousResponses } });
        } catch (error) {
            console.error('[rossGetRun] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});
```

**Step 2: Verify no syntax errors**

```bash
node -e "require('./ross'); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add functions/ross.js
git commit -m "feat(ross): add rossGetRun — current run with previous run reference"
```

---

## Task 6: `rossGetRunHistory` — paginated run history for reports

**Files:**
- Modify: `functions/ross.js` — append after `rossGetRun`

**Step 1: Append `rossGetRunHistory`**

```javascript
/**
 * Get paginated list of completed runs for a workflow + location.
 * Powers the Reports tab run history view.
 * Access: All admins
 */
exports.rossGetRunHistory = onRequest(async (req, res) => {
    return cors(req, res, async () => {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        try {
            const decodedToken = await verifyAuthToken(req);
            const { uid } = await verifyAdmin(decodedToken);

            const data = req.body.data || req.body;
            const { workflowId, locationId, limit: rawLimit } = data;
            if (!workflowId || !locationId) {
                return res.status(400).json({ error: 'workflowId and locationId are required' });
            }
            const pageLimit = Math.min(Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 20, 100);

            const runsRef = db.ref(`ross/runs/${uid}/${workflowId}/${locationId}`);
            const snap = await runsRef.orderByChild('completedAt').limitToLast(pageLimit).once('value');

            const runs = snap.exists()
                ? Object.values(snap.val())
                    .filter(r => r.completedAt !== null)
                    .sort((a, b) => b.completedAt - a.completedAt)
                : [];

            res.json({ result: { success: true, runs } });
        } catch (error) {
            console.error('[rossGetRunHistory] Error:', error.message);
            const statusCode = (error.message.includes('Admin') || error.message.includes('Super Admin')) ? 403 : 500;
            res.status(statusCode).json({ error: error.message });
        }
    });
});
```

**Step 2: Verify no syntax errors**

```bash
node -e "require('./ross'); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**

```bash
git add functions/ross.js
git commit -m "feat(ross): add rossGetRunHistory — paginated run history for reports"
```

---

## Task 7: Export new functions from `functions/index.js`

**Files:**
- Modify: `functions/index.js` lines 3112–3127

**Step 1: Find the ROSS exports block (lines 3112–3127)**

It currently ends with:
```javascript
exports.rossGetStaff = ross.rossGetStaff;
```

**Step 2: Add 4 new exports after `exports.rossGetStaff`**

```javascript
exports.rossCreateRun = ross.rossCreateRun;
exports.rossSubmitResponse = ross.rossSubmitResponse;
exports.rossGetRun = ross.rossGetRun;
exports.rossGetRunHistory = ross.rossGetRunHistory;
```

**Step 3: Verify index.js loads without error**

```bash
cd "C:\Users\katso\OneDrive\Documents\GitHub\MerakiCaptivePortal-firebaseDB\functions"
node -e "
  const admin = require('firebase-admin');
  // just require the file, not initialize
  console.log('index.js syntax OK');
" 2>&1 | head -5
```

Actually, `index.js` initialises Firebase on require, so just check for syntax errors:

```bash
node --check index.js && echo "Syntax OK"
```
Expected: `Syntax OK`

**Step 4: Commit**

```bash
git add functions/index.js
git commit -m "feat(ross): export rossCreateRun, rossSubmitResponse, rossGetRun, rossGetRunHistory"
```

---

## Task 8: Add service methods to `ross-service.js`

**Files:**
- Modify: `public/js/modules/ross/services/ross-service.js`

**Step 1: Read the file (102 lines) to find the `// ---- Reports ----` section (~line 86)**

**Step 2: Add 4 new methods between the Tasks section and the Reports section**

Find:
```javascript
    // ---- Reports ----
```

Insert before it:

```javascript
    // ---- Runs ----
    async createRun(workflowId, locationId) {
        return this.callFunction('rossCreateRun', { workflowId, locationId });
    }

    async submitResponse(workflowId, locationId, runId, taskId, value, note = null) {
        return this.callFunction('rossSubmitResponse', { workflowId, locationId, runId, taskId, value, note });
    }

    async getRun(workflowId, locationId) {
        return this.callFunction('rossGetRun', { workflowId, locationId });
    }

    async getRunHistory(workflowId, locationId, limit = 20) {
        return this.callFunction('rossGetRunHistory', { workflowId, locationId, limit });
    }

```

**Step 3: Verify no syntax errors**

Open the file in the browser console or run:

```bash
node --input-type=module < "public/js/modules/ross/services/ross-service.js" 2>&1 | head -5
```

If that fails (due to ESM + missing firebase-config import), just visually confirm matching brackets.

**Step 4: Commit**

```bash
git add public/js/modules/ross/services/ross-service.js
git commit -m "feat(ross): add createRun, submitResponse, getRun, getRunHistory service methods"
```

---

## Task 9: Builder UI — input type selector on subtasks

**Files:**
- Modify: `public/js/modules/ross/index.js`

This task adds input type selection in **Step 3 of the Builder** (subtasks step, ~line 726) and in the **Template editor** subtask list (~line 420).

### Part A — Builder Step 3

**Step 1: Find the builder subtask input area (around line 728)**

Look for:
```html
<input class="form-control" v-model="builderSubtaskInput"
    placeholder="Subtask title" @keyup.enter="builderAddSubtask()">
```

**Step 2: Replace the entire subtask builder section (Step 3 block, inside `v-if="builder.step === 3"`) with:**

```html
<div v-if="builder.step === 3">
    <h6 class="mb-3">Subtasks</h6>
    <!-- New subtask form -->
    <div class="card border-0 bg-light p-3 mb-3">
        <div class="row g-2">
            <div class="col-md-6">
                <input class="form-control" v-model="builderSubtaskInput"
                    placeholder="Subtask title" @keyup.enter="builderAddSubtask()">
            </div>
            <div class="col-md-4">
                <select class="form-select" v-model="builderSubtaskInputType">
                    <option value="checkbox">Checkbox (tick to complete)</option>
                    <option value="text">Text input</option>
                    <option value="number">Number</option>
                    <option value="temperature">Temperature reading</option>
                    <option value="yes_no">Yes / No</option>
                    <option value="dropdown">Dropdown list</option>
                    <option value="timestamp">Timestamp</option>
                    <option value="photo">Photo upload</option>
                    <option value="signature">Signature</option>
                    <option value="rating">Star rating</option>
                </select>
            </div>
            <div class="col-md-2">
                <button class="btn btn-outline-primary w-100" @click="builderAddSubtask()">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        </div>
        <!-- Type-specific config (shown after type is chosen) -->
        <div v-if="builderSubtaskInputType === 'temperature' || builderSubtaskInputType === 'number'" class="row g-2 mt-1">
            <div class="col-4">
                <input type="text" class="form-control form-control-sm" v-model="builderSubtaskConfig.unit" placeholder="Unit (e.g. °C)">
            </div>
            <div class="col-4">
                <input type="number" class="form-control form-control-sm" v-model.number="builderSubtaskConfig.max" placeholder="Max threshold">
            </div>
            <div class="col-4">
                <div class="form-check mt-2">
                    <input class="form-check-input" type="checkbox" v-model="builderSubtaskConfig.requiredNote" id="builderRequiredNote">
                    <label class="form-check-label small" for="builderRequiredNote">Require note if flagged</label>
                </div>
            </div>
        </div>
        <div v-if="builderSubtaskInputType === 'dropdown'" class="mt-2">
            <div class="input-group input-group-sm mb-1" v-for="(opt, i) in builderSubtaskConfig.options" :key="i">
                <input type="text" class="form-control" :value="opt"
                    @input="builderUpdateDropdownOption(i, $event.target.value)">
                <button class="btn btn-outline-danger" @click="builderRemoveDropdownOption(i)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <button class="btn btn-sm btn-outline-secondary" @click="builderAddDropdownOption()">
                <i class="fas fa-plus me-1"></i>Add option
            </button>
        </div>
        <div v-if="builderSubtaskInputType === 'rating'" class="row g-2 mt-1">
            <div class="col-4">
                <input type="number" class="form-control form-control-sm" v-model.number="builderSubtaskConfig.max" placeholder="Max stars (e.g. 5)" min="2" max="10">
            </div>
        </div>
    </div>
    <!-- Subtask list -->
    <ul class="list-group">
        <li v-for="(st, i) in builder.subtasks" :key="i"
            class="list-group-item d-flex justify-content-between align-items-center">
            <span>
                <span class="badge bg-secondary me-2">{{ i + 1 }}</span>
                {{ st.title }}
                <span class="badge bg-light text-dark ms-1 small">{{ formatInputType(st.inputType || 'checkbox') }}</span>
            </span>
            <button class="btn btn-sm btn-outline-danger" @click="builderRemoveSubtask(i)">
                <i class="fas fa-times"></i>
            </button>
        </li>
    </ul>
    <p v-if="!builder.subtasks.length" class="text-muted small mt-2">
        No subtasks yet — add at least one.
    </p>
</div>
```

**Step 3: Add new data properties to the Vue `data()` return object**

Find the `data()` return (search for `builderSubtaskInput: ''`). After it, add:

```javascript
builderSubtaskInputType: 'checkbox',
builderSubtaskConfig: { unit: '', max: null, requiredNote: false, options: [] },
```

**Step 4: Update `builderAddSubtask()` method (~line 1576)**

Find:
```javascript
builderAddSubtask() {
    const title = this.builderSubtaskInput.trim();
```

Replace the whole method:
```javascript
builderAddSubtask() {
    const title = this.builderSubtaskInput.trim();
    if (!title) return;
    const inputType = this.builderSubtaskInputType;
    const config = { ...this.builderSubtaskConfig };
    // Clean config for the type
    let inputConfig = {};
    if (inputType === 'temperature' || inputType === 'number') {
        if (config.unit) inputConfig.unit = config.unit;
        if (config.max !== null && config.max !== '') inputConfig.max = Number(config.max);
        if (config.requiredNote) inputConfig.requiredNote = true;
    } else if (inputType === 'dropdown') {
        inputConfig.options = (config.options || []).filter(o => o.trim());
    } else if (inputType === 'rating') {
        inputConfig.max = Number(config.max) || 5;
    }
    const newSubtasks = [
        ...this.builder.subtasks,
        { title, inputType, inputConfig, required: true, order: this.builder.subtasks.length + 1 }
    ];
    this.builder = { ...this.builder, subtasks: newSubtasks };
    this.builderSubtaskInput = '';
    this.builderSubtaskInputType = 'checkbox';
    this.builderSubtaskConfig = { unit: '', max: null, requiredNote: false, options: [] };
},
```

**Step 5: Add dropdown helper methods** (add alongside `builderAddSubtask`, `builderRemoveSubtask`):

```javascript
builderAddDropdownOption() {
    this.builderSubtaskConfig = {
        ...this.builderSubtaskConfig,
        options: [...(this.builderSubtaskConfig.options || []), '']
    };
},
builderRemoveDropdownOption(index) {
    this.builderSubtaskConfig = {
        ...this.builderSubtaskConfig,
        options: this.builderSubtaskConfig.options.filter((_, i) => i !== index)
    };
},
builderUpdateDropdownOption(index, value) {
    const options = [...this.builderSubtaskConfig.options];
    options[index] = value;
    this.builderSubtaskConfig = { ...this.builderSubtaskConfig, options };
},
```

**Step 6: Add `formatInputType()` helper method** (add to methods):

```javascript
formatInputType(type) {
    const labels = {
        checkbox: 'Checkbox', text: 'Text', number: 'Number',
        temperature: 'Temp', yes_no: 'Yes/No', dropdown: 'Dropdown',
        timestamp: 'Timestamp', photo: 'Photo', signature: 'Signature', rating: 'Rating'
    };
    return labels[type] || type;
},
```

**Step 7: Update `builderSave()` method (~line 1607)** — subtasks already carry `inputType`/`inputConfig` now, no change needed to the save payload since it spreads the subtask object. Verify the spread includes all fields.

**Step 8: Visually verify in browser**

Start the Firebase emulator:
```bash
cd "C:\Users\katso\OneDrive\Documents\GitHub\MerakiCaptivePortal-firebaseDB"
firebase emulators:start --only hosting,functions,database
```

Open `http://localhost:5000/admin-dashboard.html`, navigate to ROSS → Builder → Step 3. Confirm:
- Input type dropdown appears
- Selecting "temperature" shows unit/max/requiredNote config
- Adding a subtask shows the type badge in the list
- Removing a subtask works

**Step 9: Commit**

```bash
git add public/js/modules/ross/index.js
git commit -m "feat(ross): add input type selector to workflow builder subtask step"
```

---

## Task 10: Template editor — input type selector on tasks

**Files:**
- Modify: `public/js/modules/ross/index.js`

The template editor is in the Templates tab (`v-else-if="templateEditor"`). Find the subtask list in the editor and add the same input type controls as the builder.

**Step 1: Grep for the template editor subtask section**

Search for `templateEditor.tasks` in `index.js` to find the template task list rendering.

**Step 2: In the template editor's task list, add an input type badge next to each task title**

Find the task row in the editor and add:
```html
<span class="badge bg-light text-dark ms-1 small">
    {{ formatInputType(task.inputType || 'checkbox') }}
</span>
```

**Step 3: In the "Add task to template" input area inside the editor, add the same input type dropdown as Task 9**

The pattern is identical — an input type `<select>` alongside the task title input, with a data property `templateEditorTaskInputType: 'checkbox'` and `templateEditorTaskConfig: { unit: '', max: null, requiredNote: false, options: [] }`.

Add these to `data()`, then wire the "add task" button to include `inputType` and `inputConfig` in the new task object (same logic as `builderAddSubtask`).

**Step 4: Visually verify**

Open Templates tab → create or edit a template. Confirm input type dropdown appears when adding tasks.

**Step 5: Commit**

```bash
git add public/js/modules/ross/index.js
git commit -m "feat(ross): add input type selector to template editor tasks"
```

---

## Task 11: Workflow execution UI — run-based task forms

**Files:**
- Modify: `public/js/modules/ross/index.js`

This is the largest frontend task. When staff expand a workflow in the Workflows tab, instead of a simple checkbox per task, they see the appropriate input control and submit each response individually.

**Step 1: Add run-related data properties to `data()`**

```javascript
currentRun: null,          // { runId, responses: {} }
previousResponses: {},     // { taskId: { value, inputType } } from last completed run
runSubmitting: {},         // { taskId: boolean } — per-task submit spinner
runValues: {},             // { taskId: any } — current input value per task
runNotes: {},              // { taskId: string } — note per task (for requiredNote)
```

**Step 2: Update `loadWorkflows()` (~line 1432)** — no change needed here.

**Step 3: Add `openWorkflow(wf)` method** — called when staff click a workflow row:

```javascript
async openWorkflow(wf) {
    this.expandedWorkflow = wf;
    this.currentRun = null;
    this.previousResponses = {};
    this.runValues = {};
    this.runNotes = {};
    this.runSubmitting = {};
    try {
        const result = await rossService.createRun(wf.workflowId, this.locationId);
        const runResult = await rossService.getRun(wf.workflowId, this.locationId);
        this.currentRun = runResult.currentRun || null;
        this.previousResponses = runResult.previousResponses || {};
        // Pre-populate runValues from existing responses in current run
        if (this.currentRun && this.currentRun.responses) {
            Object.entries(this.currentRun.responses).forEach(([taskId, resp]) => {
                this.runValues = { ...this.runValues, [taskId]: resp.value };
            });
        }
    } catch (err) {
        console.error('[ROSS] openWorkflow error:', err);
        await Swal.fire('Error', 'Failed to open workflow: ' + err.message, 'error');
    }
},
```

**Step 4: Add `submitTaskResponse(task)` method**:

```javascript
async submitTaskResponse(task) {
    if (!this.currentRun) return;
    const taskId = task.id || task._taskId;
    const value = this.runValues[taskId];
    if (value === undefined || value === null || value === '') {
        await Swal.fire('Required', 'Please enter a value before submitting.', 'warning');
        return;
    }
    this.runSubmitting = { ...this.runSubmitting, [taskId]: true };
    try {
        const result = await rossService.submitResponse(
            this.expandedWorkflow.workflowId,
            this.locationId,
            this.currentRun.id || this.currentRun.runId,
            taskId,
            value,
            this.runNotes[taskId] || null
        );
        if (result.flagged) {
            await Swal.fire({
                icon: 'warning',
                title: 'Out of range',
                text: 'This reading has been flagged. A note has been recorded.',
                toast: true, position: 'top-end', showConfirmButton: false, timer: 3000
            });
        } else {
            await Swal.fire({
                icon: 'success', title: 'Saved',
                toast: true, position: 'top-end', showConfirmButton: false, timer: 1500
            });
        }
        // Refresh run state
        const runResult = await rossService.getRun(this.expandedWorkflow.workflowId, this.locationId);
        this.currentRun = runResult.currentRun;
        if (result.runCompleted) {
            await Swal.fire({ icon: 'success', title: 'Workflow complete!', text: 'All required tasks have been submitted.' });
            await this.loadWorkflows();
        }
    } catch (err) {
        if (err.message && err.message.includes('note is required')) {
            // Show note field
            this.runSubmitting = { ...this.runSubmitting, [taskId]: false };
            return; // UI should already show note field when flagged
        }
        console.error('[ROSS] submitTaskResponse error:', err);
        await Swal.fire('Error', err.message, 'error');
    } finally {
        this.runSubmitting = { ...this.runSubmitting, [taskId]: false };
    }
},
```

**Step 5: Update the workflow task list template**

Find the task list inside the expanded workflow view (search for `v-for="task in"`). Replace the existing simple "Complete" button row with a per-task input section:

```html
<div v-for="task in expandedTasks" :key="task.id || task._taskId" class="border rounded p-3 mb-2">
    <div class="d-flex justify-content-between align-items-start mb-2">
        <div>
            <strong>{{ task.title }}</strong>
            <span v-if="task.required !== false" class="text-danger ms-1" title="Required">*</span>
            <span class="badge bg-light text-dark ms-2 small">{{ formatInputType(task.inputType || 'checkbox') }}</span>
        </div>
        <!-- Already responded badge -->
        <span v-if="currentRun && currentRun.responses && currentRun.responses[task.id || task._taskId]"
            class="badge bg-success">
            <i class="fas fa-check me-1"></i>Saved
        </span>
    </div>

    <!-- Previous value hint -->
    <div v-if="previousResponses[task.id || task._taskId]" class="text-muted small mb-2">
        Last time: <strong>{{ formatResponseValue(previousResponses[task.id || task._taskId]) }}</strong>
    </div>

    <!-- Input control — varies by inputType -->
    <!-- checkbox -->
    <div v-if="(task.inputType || 'checkbox') === 'checkbox'">
        <button class="btn btn-outline-success btn-sm"
            :disabled="runSubmitting[task.id || task._taskId] || !!(currentRun && currentRun.responses && currentRun.responses[task.id || task._taskId])"
            @click="runValues = {...runValues, [task.id || task._taskId]: true}; submitTaskResponse(task)">
            <span v-if="runSubmitting[task.id || task._taskId]" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="fas fa-check me-1"></i>Mark Complete
        </button>
    </div>

    <!-- text -->
    <div v-else-if="task.inputType === 'text'" class="d-flex gap-2">
        <textarea class="form-control form-control-sm" rows="2"
            v-model="runValues[task.id || task._taskId]"
            :maxlength="task.inputConfig && task.inputConfig.maxLength ? task.inputConfig.maxLength : 1000"
            :placeholder="task.inputConfig && task.inputConfig.placeholder ? task.inputConfig.placeholder : 'Enter your observation...'">
        </textarea>
        <button class="btn btn-primary btn-sm align-self-start"
            :disabled="runSubmitting[task.id || task._taskId]"
            @click="submitTaskResponse(task)">
            <span v-if="runSubmitting[task.id || task._taskId]" class="spinner-border spinner-border-sm"></span>
            <i v-else class="fas fa-save"></i>
        </button>
    </div>

    <!-- number / temperature -->
    <div v-else-if="task.inputType === 'number' || task.inputType === 'temperature'">
        <div class="d-flex gap-2 align-items-center mb-2">
            <input type="number" class="form-control form-control-sm" style="max-width:150px"
                v-model.number="runValues[task.id || task._taskId]"
                :placeholder="task.inputConfig && task.inputConfig.unit ? task.inputConfig.unit : 'Value'">
            <span v-if="task.inputConfig && task.inputConfig.unit" class="text-muted small">{{ task.inputConfig.unit }}</span>
            <span v-if="task.inputConfig && task.inputConfig.max !== undefined" class="text-muted small">
                (max: {{ task.inputConfig.max }})
            </span>
            <button class="btn btn-primary btn-sm"
                :disabled="runSubmitting[task.id || task._taskId]"
                @click="submitTaskResponse(task)">
                <span v-if="runSubmitting[task.id || task._taskId]" class="spinner-border spinner-border-sm"></span>
                <i v-else class="fas fa-save"></i>
            </button>
        </div>
        <!-- requiredNote: show note field if value is out of range -->
        <div v-if="task.inputConfig && task.inputConfig.requiredNote && isValueFlagged(task, runValues[task.id || task._taskId])"
            class="mt-2">
            <div class="alert alert-warning py-1 px-2 small mb-1">
                <i class="fas fa-exclamation-triangle me-1"></i>
                {{ task.inputConfig.failLabel || 'Value is out of range' }} — a note is required.
            </div>
            <textarea class="form-control form-control-sm" rows="2"
                v-model="runNotes[task.id || task._taskId]"
                placeholder="Explain the out-of-range reading...">
            </textarea>
        </div>
    </div>

    <!-- yes_no -->
    <div v-else-if="task.inputType === 'yes_no'" class="d-flex gap-2">
        <button class="btn btn-sm"
            :class="runValues[task.id || task._taskId] === true ? 'btn-success' : 'btn-outline-success'"
            @click="runValues = {...runValues, [task.id || task._taskId]: true}">
            {{ task.inputConfig && task.inputConfig.trueLabel ? task.inputConfig.trueLabel : 'Yes / Pass' }}
        </button>
        <button class="btn btn-sm"
            :class="runValues[task.id || task._taskId] === false ? 'btn-danger' : 'btn-outline-danger'"
            @click="runValues = {...runValues, [task.id || task._taskId]: false}">
            {{ task.inputConfig && task.inputConfig.falseLabel ? task.inputConfig.falseLabel : 'No / Fail' }}
        </button>
        <button class="btn btn-primary btn-sm"
            :disabled="runValues[task.id || task._taskId] === undefined || runValues[task.id || task._taskId] === null || runSubmitting[task.id || task._taskId]"
            @click="submitTaskResponse(task)">
            <span v-if="runSubmitting[task.id || task._taskId]" class="spinner-border spinner-border-sm"></span>
            <i v-else class="fas fa-save"></i>
        </button>
    </div>

    <!-- dropdown -->
    <div v-else-if="task.inputType === 'dropdown'" class="d-flex gap-2">
        <select class="form-select form-select-sm" style="max-width:200px"
            v-model="runValues[task.id || task._taskId]">
            <option value="">Select...</option>
            <option v-for="opt in (task.inputConfig && task.inputConfig.options ? task.inputConfig.options : [])" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <button class="btn btn-primary btn-sm"
            :disabled="!runValues[task.id || task._taskId] || runSubmitting[task.id || task._taskId]"
            @click="submitTaskResponse(task)">
            <span v-if="runSubmitting[task.id || task._taskId]" class="spinner-border spinner-border-sm"></span>
            <i v-else class="fas fa-save"></i>
        </button>
    </div>

    <!-- timestamp -->
    <div v-else-if="task.inputType === 'timestamp'" class="d-flex gap-2">
        <input type="datetime-local" class="form-control form-control-sm" style="max-width:250px"
            v-model="runValues[task.id || task._taskId]">
        <button class="btn btn-primary btn-sm"
            :disabled="!runValues[task.id || task._taskId] || runSubmitting[task.id || task._taskId]"
            @click="submitTaskResponseTimestamp(task)">
            <span v-if="runSubmitting[task.id || task._taskId]" class="spinner-border spinner-border-sm"></span>
            <i v-else class="fas fa-save"></i>
        </button>
    </div>

    <!-- photo -->
    <div v-else-if="task.inputType === 'photo'">
        <p class="text-muted small"><i class="fas fa-camera me-1"></i>Photo upload — coming in Phase 2</p>
    </div>

    <!-- signature -->
    <div v-else-if="task.inputType === 'signature'">
        <p class="text-muted small"><i class="fas fa-signature me-1"></i>Signature — coming in Phase 2</p>
    </div>

    <!-- rating -->
    <div v-else-if="task.inputType === 'rating'" class="d-flex gap-2 align-items-center">
        <div class="d-flex gap-1">
            <button v-for="n in (task.inputConfig && task.inputConfig.max ? task.inputConfig.max : 5)"
                :key="n" class="btn btn-sm p-1"
                :class="runValues[task.id || task._taskId] >= n ? 'btn-warning' : 'btn-outline-warning'"
                @click="runValues = {...runValues, [task.id || task._taskId]: n}">
                <i class="fas fa-star"></i>
            </button>
        </div>
        <button class="btn btn-primary btn-sm"
            :disabled="!runValues[task.id || task._taskId] || runSubmitting[task.id || task._taskId]"
            @click="submitTaskResponse(task)">
            <span v-if="runSubmitting[task.id || task._taskId]" class="spinner-border spinner-border-sm"></span>
            <i v-else class="fas fa-save"></i>
        </button>
    </div>
</div>
```

**Step 6: Add helper methods**

```javascript
isValueFlagged(task, value) {
    if (value === undefined || value === null || value === '') return false;
    const cfg = task.inputConfig || {};
    if (cfg.max !== undefined && Number(value) > cfg.max) return true;
    if (cfg.min !== undefined && Number(value) < cfg.min) return true;
    return false;
},

formatResponseValue(response) {
    if (!response) return '—';
    const { value, inputType } = response;
    if (inputType === 'yes_no') return value ? 'Yes / Pass' : 'No / Fail';
    if (inputType === 'checkbox') return value ? 'Complete' : 'Incomplete';
    if (inputType === 'timestamp') return value ? new Date(value).toLocaleString() : '—';
    return value !== undefined && value !== null ? String(value) : '—';
},

async submitTaskResponseTimestamp(task) {
    const taskId = task.id || task._taskId;
    const rawValue = this.runValues[taskId];
    if (!rawValue) return;
    // Convert datetime-local string to unix ms
    this.runValues = { ...this.runValues, [taskId]: new Date(rawValue).getTime() };
    await this.submitTaskResponse(task);
},
```

**Step 7: Visually verify in browser**

Open ROSS → Workflows tab → expand an active workflow. Confirm:
- Each task shows its input type control
- Checkbox tasks show "Mark Complete" button
- Temperature tasks show number input + flag alert when over threshold
- `submitTaskResponse` saves to RTDB (check emulator DB viewer)
- "Last time: X" hint appears on second run

**Step 8: Commit**

```bash
git add public/js/modules/ross/index.js
git commit -m "feat(ross): run-based task execution UI with typed input controls"
```

---

## Task 12: Reports tab — run history view

**Files:**
- Modify: `public/js/modules/ross/index.js`

Add a per-workflow "View runs" expandable section in the Reports tab showing completed runs with flagged count.

**Step 1: Add run history data properties to `data()`**

```javascript
expandedReportWorkflow: null,   // workflowId currently expanded in reports
runHistory: [],                 // array of completed runs for expanded workflow
runHistoryLoading: false,
expandedRun: null,              // runId of run expanded to show responses
```

**Step 2: Add `loadRunHistory(workflowId, locationId)` method**

```javascript
async loadRunHistory(workflowId, locationId) {
    this.expandedReportWorkflow = workflowId;
    this.runHistory = [];
    this.expandedRun = null;
    this.runHistoryLoading = true;
    try {
        const result = await rossService.getRunHistory(workflowId, locationId);
        this.runHistory = Array.isArray(result.runs) ? result.runs : [];
    } catch (err) {
        console.error('[ROSS] loadRunHistory error:', err);
        await Swal.fire('Error', err.message, 'error');
    } finally {
        this.runHistoryLoading = false;
    }
},
```

**Step 3: Update the Reports tab template**

Add a "View runs" button to each report row, and below the existing table add the run history panel:

In each `<tr v-for="row in reportData">`, add a new `<td>`:
```html
<td>
    <button class="btn btn-sm btn-outline-secondary"
        @click="loadRunHistory(row.workflowId, row.locationId)">
        <i class="fas fa-history me-1"></i>Runs
    </button>
</td>
```

After the closing `</table>`, add:
```html
<!-- Run history panel -->
<div v-if="expandedReportWorkflow" class="card mt-3 border-0 shadow-sm">
    <div class="card-header d-flex justify-content-between align-items-center">
        <h6 class="mb-0"><i class="fas fa-history me-2"></i>Run History</h6>
        <button class="btn btn-sm btn-outline-secondary" @click="expandedReportWorkflow = null">
            <i class="fas fa-times"></i>
        </button>
    </div>
    <div class="card-body p-0">
        <div v-if="runHistoryLoading" class="text-center py-4">
            <div class="spinner-border text-primary spinner-border-sm"></div>
        </div>
        <div v-else-if="!runHistory.length" class="text-center py-4 text-muted">
            No completed runs yet.
        </div>
        <table v-else class="table table-hover mb-0">
            <thead class="table-light">
                <tr>
                    <th>Completed</th>
                    <th>Completed By</th>
                    <th>On Time</th>
                    <th>Flagged</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="run in runHistory" :key="run.runId || run.id">
                    <td>{{ run.completedAt ? new Date(run.completedAt).toLocaleString() : '—' }}</td>
                    <td>{{ run.completedBy || '—' }}</td>
                    <td>
                        <span :class="run.onTime ? 'badge bg-success' : 'badge bg-warning text-dark'">
                            {{ run.onTime ? 'On time' : 'Late' }}
                        </span>
                    </td>
                    <td>
                        <span v-if="run.flaggedCount > 0" class="badge bg-danger">
                            {{ run.flaggedCount }} flagged
                        </span>
                        <span v-else class="badge bg-success">None</span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-secondary"
                            @click="expandedRun = (expandedRun === (run.runId || run.id)) ? null : (run.runId || run.id)">
                            <i class="fas" :class="expandedRun === (run.runId || run.id) ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                        </button>
                    </td>
                </tr>
                <!-- Expanded run responses -->
                <template v-for="run in runHistory" :key="'detail-' + (run.runId || run.id)">
                    <tr v-if="expandedRun === (run.runId || run.id)">
                        <td colspan="5" class="bg-light">
                            <div v-if="!run.responses || !Object.keys(run.responses).length" class="text-muted small p-2">
                                No response details available.
                            </div>
                            <table v-else class="table table-sm mb-0">
                                <tbody>
                                    <tr v-for="(resp, taskId) in run.responses" :key="taskId">
                                        <td class="text-muted small">{{ taskId }}</td>
                                        <td>
                                            <span :class="resp.flagged ? 'text-danger fw-bold' : ''">
                                                {{ formatResponseValue(resp) }}
                                                <i v-if="resp.flagged" class="fas fa-exclamation-triangle text-danger ms-1"></i>
                                            </span>
                                        </td>
                                        <td class="text-muted small">{{ resp.note || '' }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </td>
                    </tr>
                </template>
            </tbody>
        </table>
    </div>
</div>
```

**Step 4: Visually verify**

Open Reports tab → click "Runs" on a workflow → confirm run list appears. Complete a run via the Workflows tab, then return to Reports and confirm the completed run appears.

**Step 5: Commit**

```bash
git add public/js/modules/ross/index.js
git commit -m "feat(ross): add run history view to Reports tab"
```

---

## Task 13: Update `ROSS.md` knowledge base

**Files:**
- Modify: `public/kb/features/ROSS.md`

**Step 1: Update the Task Object section** to reflect the new fields:

```json
{
  "id": "task-uuid",
  "title": "Check fridge temperature",
  "description": "Optional detail",
  "inputType": "temperature",
  "inputConfig": {
    "unit": "°C",
    "max": 4,
    "failLabel": "Too warm — escalate immediately",
    "requiredNote": true
  },
  "required": true,
  "order": 0,
  "assignedTo": "staffMemberId"
}
```

Note: `inputType` defaults to `"checkbox"` for backward compatibility.

**Step 2: Add the `ross/runs` node to the Database Structure section**

```
ross/
  runs/
    {uid}/
      {workflowId}/
        {locationId}/
          {runId}/
            id: string
            workflowId: string
            locationId: string
            startedAt: number
            completedAt: number | null
            completedBy: string | null
            responses/
              {taskId}/
                inputType: string
                value: any
                note: string | null
                flagged: boolean
                respondedAt: number
                respondedBy: string
```

**Step 3: Add 4 new functions to the Cloud Functions table**

| Function | Auth | Description |
|----------|------|-------------|
| `rossCreateRun` | `verifyAdmin` | Create or return the current open run for a workflow + location. Idempotent. |
| `rossSubmitResponse` | `verifyAdmin` | Submit a typed response for one task. Auto-flags threshold breaches. Enforces `requiredNote`. Auto-completes run when all required tasks responded. |
| `rossGetRun` | `verifyAdmin` | Get current open run + previous run's responses as `previousResponses`. |
| `rossGetRunHistory` | `verifyAdmin` | Paginated list of completed runs for a workflow + location. |

**Step 4: Update the Input Types section with the full table from the design doc**

**Step 5: Commit**

```bash
git add public/kb/features/ROSS.md
git commit -m "docs(ross): update KB with task input types and run model"
```

---

## Final Verification Checklist

Before marking the feature complete, confirm all of the following:

- [ ] `database.rules.json` — `ross/runs` and `ownerIndex` rules present, valid JSON
- [ ] `functions/ross.js` — `VALID_INPUT_TYPES` constant defined; `rossManageTask` accepts `inputType`/`inputConfig`; 4 new functions present; `node -e "require('./ross')"` succeeds
- [ ] `functions/index.js` — 4 new functions exported
- [ ] `ross-service.js` — 4 new service methods present
- [ ] Builder Step 3 — input type dropdown + config panel renders; subtask list shows type badge
- [ ] Template editor — same input type dropdown present
- [ ] Workflows tab — expanding a workflow calls `rossCreateRun`; each task shows correct input control; `submitTaskResponse` writes to RTDB; "Last time" hint appears on second run
- [ ] Temperature task with `requiredNote: true` — note textarea required before save when out of range
- [ ] Reports tab — "Runs" button loads run history; completed runs visible with flagged count; expand run shows responses
- [ ] Existing `checkbox` tasks on old workflows still work without data migration
- [ ] No `console.log` in new code
- [ ] No hardcoded values (thresholds come from `inputConfig`, not magic numbers)
- [ ] All new Vue state mutations use spread (`{ ...obj, key: val }`)
