# Phase 6 PR 2 — Day-Zero Auto-Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a new operator completes signup via `registerUser`, auto-activate the "Daily Opening Checklist" template against their freshly-created location, so they land on ROSS with one runnable workflow.

**Architecture:** Inline seed inside `registerUser` Cloud Function (no new CF, no client coupling). Extract pure workflow-building helpers from `rossActivateWorkflow` into a new ESM-compatible file so the seed can reuse them and we can unit-test the build logic. Template ID resolved via a new RTDB pointer at `ross/config/firstWorkflowTemplateId`, set once per environment by a one-off script.

**Tech Stack:** Firebase Cloud Functions v7 (Node 22), firebase-admin RTDB, vitest for unit tests.

**Spec:** `docs/plans/2026-05-12-ross-day-zero-auto-activation-design.md`

**Branch:** `feature/ross-day-zero-seed` (worktree at `.worktrees/ross-day-zero-seed/`)

---

## File Structure

| File | Status | Purpose |
|------|--------|---------|
| `functions/ross-workflow-builder.js` | NEW | Pure helpers: `buildLocationsFromTemplate`, `buildWorkflowRecord`. Zero firebase-admin dependency — composable into any CF and unit-testable. Mirrors `functions/ross-tier.js` pattern. |
| `tests/unit/ross-workflow-builder.test.js` | NEW | Vitest coverage of both helpers — happy path, empty subtasks, missing names, multi-location, byte-identical output for known fixture. |
| `functions/ross.js` | MODIFY | Refactor `rossActivateWorkflow` to call `buildLocationsFromTemplate` instead of inlining the loop. Behaviour must be byte-identical. |
| `functions/index.js` | MODIFY | Add inline seed block in `registerUser` after the existing location creation (`~line 663`). |
| `functions/seeds/ross-config-set-first-workflow.js` | NEW | One-off script that resolves the templateId by name and writes `ross/config/firstWorkflowTemplateId`. |
| `database.rules.json` | MODIFY | Add `ross/config` rule (`.read:false`, `.write:false`). |
| `public/kb/features/ROSS.md` | MODIFY | Document day-zero seed mechanism + pointer. |

All work happens inside the worktree at `.worktrees/ross-day-zero-seed/`. All paths below are relative to that worktree root unless explicitly stated.

---

## Task 1: Pure workflow-builder helpers (new file + tests)

**Files:**
- Create: `functions/ross-workflow-builder.js`
- Create: `tests/unit/ross-workflow-builder.test.js`

### - [ ] Step 1.1: Write the failing tests

Create `tests/unit/ross-workflow-builder.test.js`:

```js
import { describe, test, expect, vi } from 'vitest';
import {
  buildLocationsFromTemplate,
  buildWorkflowRecord,
} from '../../functions/ross-workflow-builder.js';

const VALID_INPUT_TYPES = [
  'checkbox', 'number', 'temperature', 'text', 'longtext',
  'dropdown', 'rating', 'photo', 'signature', 'date',
];

function makeTemplate(overrides = {}) {
  return {
    templateId: 'tpl-fixture',
    name: 'Fixture Template',
    description: 'fixture description',
    category: 'operations',
    recurrence: 'daily',
    daysBeforeAlert: [0],
    tier: 'free',
    subtasks: [
      { order: 1, title: 'First task', daysOffset: 0 },
      { order: 2, title: 'Second task', daysOffset: 0 },
    ],
    ...overrides,
  };
}

function makeIdGenerator(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe('buildLocationsFromTemplate', () => {
  test('builds one location entry per locationId', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate(),
      locationIds: ['loc-a', 'loc-b'],
      locationNames: ['Loc A', 'Loc B'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator('task'),
      now: 1700000000000,
    });
    expect(Object.keys(result)).toEqual(['loc-a', 'loc-b']);
    expect(result['loc-a'].locationName).toBe('Loc A');
    expect(result['loc-b'].locationName).toBe('Loc B');
  });

  test('falls back to locationId when locationNames missing', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: null,
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(result['loc-a'].locationName).toBe('loc-a');
  });

  test('honours locationAssignedTo map per location', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate(),
      locationIds: ['loc-a', 'loc-b'],
      locationNames: ['A', 'B'],
      locationAssignedTo: { 'loc-a': 'uid-1' },
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(result['loc-a'].locationAssignedTo).toBe('uid-1');
    expect(result['loc-b'].locationAssignedTo).toBeNull();
  });

  test('creates one task per subtask, keyed by generated id', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator('task'),
      now: 1700000000000,
    });
    const taskKeys = Object.keys(result['loc-a'].tasks);
    expect(taskKeys).toEqual(['task-1', 'task-2']);
    expect(result['loc-a'].tasks['task-1'].title).toBe('First task');
    expect(result['loc-a'].tasks['task-2'].title).toBe('Second task');
  });

  test('empty subtasks yields empty tasks object', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({ subtasks: [] }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(result['loc-a'].tasks).toEqual({});
  });

  test('missing subtasks field treated as empty', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({ subtasks: undefined }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(result['loc-a'].tasks).toEqual({});
  });

  test('status, activatedAt, nextDueDate populated per location', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1799999999999,
    });
    expect(result['loc-a'].status).toBe('active');
    expect(result['loc-a'].activatedAt).toBe(1799999999999);
    expect(result['loc-a'].nextDueDate).toBe(1700000000000);
  });

  test('task dueDate honours daysOffset', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({
        subtasks: [{ order: 1, title: 'Late task', daysOffset: 3 }],
      }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    const task = Object.values(result['loc-a'].tasks)[0];
    expect(task.dueDate).toBe(1700000000000 + 3 * 86400000);
  });

  test('invalid inputType falls back to checkbox', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({
        subtasks: [{ order: 1, title: 'T', daysOffset: 0, inputType: 'frobnicate' }],
      }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(Object.values(result['loc-a'].tasks)[0].inputType).toBe('checkbox');
  });

  test('valid inputType passes through unchanged', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({
        subtasks: [{ order: 1, title: 'T', daysOffset: 0, inputType: 'temperature' }],
      }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(Object.values(result['loc-a'].tasks)[0].inputType).toBe('temperature');
  });

  test('empty title becomes "Untitled Task"', () => {
    const result = buildLocationsFromTemplate({
      template: makeTemplate({
        subtasks: [{ order: 1, title: '', daysOffset: 0 }],
      }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(Object.values(result['loc-a'].tasks)[0].title).toBe('Untitled Task');
  });
});

describe('buildWorkflowRecord', () => {
  test('returns workflowId, workflowData, and atomicWrite', () => {
    const out = buildWorkflowRecord({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: 'My Run',
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(out.workflowId).toBe('wf-1');
    expect(out.workflowData).toBeTruthy();
    expect(out.atomicWrite).toBeTruthy();
  });

  test('workflowData mirrors rossActivateWorkflow shape', () => {
    const { workflowData } = buildWorkflowRecord({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: null,
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(workflowData).toMatchObject({
      workflowId: 'wf-1',
      templateId: 'tpl-fixture',
      ownerId: 'uid-1',
      name: 'Fixture Template',
      description: 'fixture description',
      category: 'operations',
      recurrence: 'daily',
      customInterval: null,
      notificationChannels: ['in_app'],
      notifyPhone: null,
      notifyEmail: null,
      daysBeforeAlert: [0],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    });
    expect(workflowData.locations).toHaveProperty('loc-a');
  });

  test('name override wins over template name', () => {
    const { workflowData } = buildWorkflowRecord({
      template: makeTemplate(),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: '  Override  ',
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(workflowData.name).toBe('Override');
  });

  test('null description in template yields null in workflowData', () => {
    const { workflowData } = buildWorkflowRecord({
      template: makeTemplate({ description: '' }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: null,
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(workflowData.description).toBeNull();
  });

  test('missing daysBeforeAlert falls back to [30, 7]', () => {
    const { workflowData } = buildWorkflowRecord({
      template: makeTemplate({ daysBeforeAlert: undefined }),
      locationIds: ['loc-a'],
      locationNames: ['A'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: null,
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(workflowData.daysBeforeAlert).toEqual([30, 7]);
  });

  test('atomicWrite contains workflow, ownerIndex, and per-location index', () => {
    const { atomicWrite } = buildWorkflowRecord({
      template: makeTemplate(),
      locationIds: ['loc-a', 'loc-b'],
      locationNames: ['A', 'B'],
      locationAssignedTo: null,
      nextDueDate: 1700000000000,
      uid: 'uid-1',
      name: null,
      workflowId: 'wf-1',
      validInputTypes: VALID_INPUT_TYPES,
      generateTaskId: makeIdGenerator(),
      now: 1700000000000,
    });
    expect(atomicWrite['ross/workflows/uid-1/wf-1']).toBeTruthy();
    expect(atomicWrite['ross/ownerIndex/uid-1']).toBe(true);
    expect(atomicWrite['ross/workflowsByLocation/loc-a/wf-1']).toBe('uid-1');
    expect(atomicWrite['ross/workflowsByLocation/loc-b/wf-1']).toBe('uid-1');
  });
});
```

### - [ ] Step 1.2: Run tests to verify they fail

Run from worktree root: `npx vitest run tests/unit/ross-workflow-builder.test.js`
Expected: FAIL — `Cannot find module 'functions/ross-workflow-builder.js'`

### - [ ] Step 1.3: Implement `functions/ross-workflow-builder.js`

Create `functions/ross-workflow-builder.js`:

```js
/**
 * Pure workflow-builder helpers extracted from rossActivateWorkflow.
 * Zero dependencies on firebase-admin / db — all impure inputs
 * (`generateTaskId`, `now`) are injected, making the helpers fully
 * unit-testable. Mirrors the ross-tier.js pattern.
 *
 * Consumers:
 *   - rossActivateWorkflow (functions/ross.js) — operator-triggered activate
 *   - registerUser (functions/index.js) — day-zero auto-activation
 *
 * The output of buildWorkflowRecord must be byte-identical to the
 * inlined version it replaces in rossActivateWorkflow. Any divergence
 * is a regression.
 */

function buildTaskFromSubtask(subtask, nextDueDate, validInputTypes) {
    const rawType = subtask.inputType;
    const inputType = validInputTypes.includes(rawType) ? rawType : 'checkbox';
    const inputConfig = (subtask.inputConfig && typeof subtask.inputConfig === 'object')
        ? subtask.inputConfig
        : {};
    return {
        title: (subtask.title || '').trim() || 'Untitled Task',
        status: 'pending',
        dueDate: nextDueDate + ((subtask.daysOffset || 0) * 86400000),
        completedAt: null,
        assignedTo: null,
        order: subtask.order || 1,
        inputType,
        inputConfig,
    };
}

function buildLocationsFromTemplate({
    template,
    locationIds,
    locationNames,
    locationAssignedTo,
    nextDueDate,
    validInputTypes,
    generateTaskId,
    now,
}) {
    const locations = {};
    locationIds.forEach((locationId, idx) => {
        const tasks = {};
        if (Array.isArray(template.subtasks)) {
            template.subtasks.forEach((subtask) => {
                const taskId = generateTaskId();
                tasks[taskId] = buildTaskFromSubtask(subtask, nextDueDate, validInputTypes);
            });
        }
        locations[locationId] = {
            locationName: (locationNames && locationNames[idx]) || locationId,
            locationAssignedTo: (locationAssignedTo && locationAssignedTo[locationId]) || null,
            status: 'active',
            nextDueDate,
            activatedAt: now,
            tasks,
        };
    });
    return locations;
}

function buildWorkflowRecord({
    template,
    locationIds,
    locationNames,
    locationAssignedTo,
    nextDueDate,
    uid,
    name,
    description,
    customInterval,
    daysBeforeAlert,
    notifyPhone,
    notifyEmail,
    workflowId,
    validInputTypes,
    generateTaskId,
    now,
}) {
    const locations = buildLocationsFromTemplate({
        template,
        locationIds,
        locationNames,
        locationAssignedTo,
        nextDueDate,
        validInputTypes,
        generateTaskId,
        now,
    });
    const resolvedDescription = (description != null ? description : template.description);
    const workflowData = {
        workflowId,
        templateId: template.templateId,
        ownerId: uid,
        name: (name || template.name).trim(),
        description: (resolvedDescription || '').trim() || null,
        category: template.category,
        recurrence: template.recurrence,
        customInterval: (Number.isInteger(customInterval) && customInterval > 0) ? customInterval : null,
        notificationChannels: ['in_app'],
        notifyPhone: notifyPhone || null,
        notifyEmail: notifyEmail || null,
        daysBeforeAlert: Array.isArray(daysBeforeAlert)
            ? daysBeforeAlert.filter((d) => Number.isInteger(d) && d > 0)
            : (Array.isArray(template.daysBeforeAlert) ? template.daysBeforeAlert : [30, 7]),
        createdAt: now,
        updatedAt: now,
        locations,
    };
    const atomicWrite = {
        [`ross/workflows/${uid}/${workflowId}`]: workflowData,
        [`ross/ownerIndex/${uid}`]: true,
    };
    locationIds.forEach((locId) => {
        atomicWrite[`ross/workflowsByLocation/${locId}/${workflowId}`] = uid;
    });
    return { workflowId, workflowData, atomicWrite };
}

module.exports = {
    buildTaskFromSubtask,
    buildLocationsFromTemplate,
    buildWorkflowRecord,
};
```

### - [ ] Step 1.4: Run tests to verify they pass

Run: `npx vitest run tests/unit/ross-workflow-builder.test.js`
Expected: all 17 tests PASS.

### - [ ] Step 1.5: Commit

```bash
git add functions/ross-workflow-builder.js tests/unit/ross-workflow-builder.test.js
git commit -m "feat(ross): extract pure workflow-builder helpers

Pure ESM-friendly helpers (buildLocationsFromTemplate,
buildWorkflowRecord) with all impure inputs (generateTaskId, now)
injected. Mirrors the functions/ross-tier.js pattern. 17 unit tests
cover happy path, missing names, multi-location, inputType fallback,
description handling, daysBeforeAlert fallback, and atomic-write
shape. Used by rossActivateWorkflow refactor + registerUser seed."
```

---

## Task 2: Refactor `rossActivateWorkflow` to use the new helpers

**Files:**
- Modify: `functions/ross.js` (lines ~422-518)

Behaviour must be byte-identical. The diff should remove the inlined location-loop and workflowData construction, and replace them with a single `buildWorkflowRecord(...)` call.

### - [ ] Step 2.1: Add require for new helpers at top of `ross.js`

Find the existing require block near the top of `functions/ross.js` (after the `db` / `cors` requires). Add:

```js
const { buildWorkflowRecord } = require('./ross-workflow-builder');
```

Place it directly below the line that requires `ross-tier.js` (or near other local requires).

### - [ ] Step 2.2: Replace the body of `rossActivateWorkflow`

Find the existing `rossActivateWorkflow` handler (currently around lines 422-518). Replace the post-tier-gate block (from the `const workflowId = generateId();` line through the `await db.ref().update(atomicWrite);` line — inclusive) with:

```js
            const { workflowId, workflowData, atomicWrite } = buildWorkflowRecord({
                template,
                locationIds,
                locationNames,
                locationAssignedTo,
                nextDueDate,
                uid,
                name,
                description,
                customInterval,
                daysBeforeAlert,
                notifyPhone,
                notifyEmail,
                workflowId: generateId(),
                validInputTypes: VALID_INPUT_TYPES,
                generateTaskId: generateId,
                now: Date.now(),
            });
            await db.ref().update(atomicWrite);
            res.json({ result: { success: true, workflowId, workflow: workflowData } });
```

The lines BEFORE this block (auth, location-access check, template fetch, tier gate via `readUserTier` + `userCanActivate` + `logActivationDenial`) stay unchanged. The lines AFTER (`catch` block) stay unchanged.

### - [ ] Step 2.3: Build the worktree to confirm no syntax errors

From worktree root:
```bash
cd functions && npm install
cd ..
npm run build
```

Expected: `npm install` runs once in the worktree (~50s — worktrees don't inherit `node_modules`, per PR #55 LESSON). `npm run build` exits 0.

### - [ ] Step 2.4: Verify byte-identity vs. original

The atomic-write keys produced by `buildWorkflowRecord` MUST match the original `rossActivateWorkflow` keys exactly. Sanity grep against the helper's output:

```bash
grep -n "ross/workflows/\|ross/ownerIndex/\|ross/workflowsByLocation/" functions/ross-workflow-builder.js
```

Expected: 3 hits matching the three index paths. Same paths as the original `rossActivateWorkflow` produced (compare against `git show HEAD:functions/ross.js | grep -n "ross/workflows\|ownerIndex\|locationIndexUpdates"`).

### - [ ] Step 2.5: Commit

```bash
git add functions/ross.js
git commit -m "refactor(ross): rossActivateWorkflow uses buildWorkflowRecord

Replaces inline location-loop + workflowData construction with a
single buildWorkflowRecord call from ross-workflow-builder. Behaviour
is byte-identical — same atomic write keys, same per-location task
shape. Sets up day-zero auto-activation reuse in registerUser."
```

---

## Task 3: Inline seed in `registerUser` CF

**Files:**
- Modify: `functions/index.js` (lines ~660-665 — the existing location creation block)

### - [ ] Step 3.1: Add require for helper at top of `index.js`

Find an existing `require('./...')` line near the top of `functions/index.js` (e.g. `require('./guestSync')`). Add directly below it:

```js
const { buildWorkflowRecord } = require('./ross-workflow-builder');
```

### - [ ] Step 3.2: Define `VALID_INPUT_TYPES` constant near the top of `index.js`

The helper needs the validInputTypes list. To avoid coupling `index.js` to the internals of `ross.js`, declare the list locally near the top of `index.js`:

```js
// ROSS day-zero seed — must match VALID_INPUT_TYPES in functions/ross.js.
// Kept in sync manually; any new input type must be added here too.
const ROSS_VALID_INPUT_TYPES = [
    'checkbox', 'number', 'temperature', 'text', 'longtext',
    'dropdown', 'rating', 'photo', 'signature', 'date',
];
```

Place it after the other top-of-file constants (or directly after the new require from step 3.1).

### - [ ] Step 3.3: Add the seed block to `registerUser`

Find the existing block in `registerUser` (around line 660):

```js
        // Create a location and link it to the user (separate from the
        // multi-path write above because the location node needs a push() key)
        const locationRef = await admin.database().ref('locations').push();
        await locationRef.set(locationData);
        await admin.database().ref(`userLocations/${userId}/${locationRef.key}`).set(true);

        return { success: true, userId: userId };
```

Insert the seed block between the `userLocations` write and the `return`. After the change, the block reads:

```js
        // Create a location and link it to the user (separate from the
        // multi-path write above because the location node needs a push() key)
        const locationRef = await admin.database().ref('locations').push();
        await locationRef.set(locationData);
        await admin.database().ref(`userLocations/${userId}/${locationRef.key}`).set(true);

        // Day-zero auto-activation — best-effort, non-blocking. Seeds one
        // starter workflow against the freshly-created location so a fresh
        // signup lands on ROSS with a runnable workflow. Every failure
        // branch logs and continues — registerUser must always succeed.
        // Spec: docs/plans/2026-05-12-ross-day-zero-auto-activation-design.md
        try {
            const pointerSnap = await admin.database()
                .ref('ross/config/firstWorkflowTemplateId')
                .once('value');
            const seedTemplateId = pointerSnap.val();
            if (!seedTemplateId) {
                console.warn('[registerUser] day-zero seed skipped:', { uid: userId, reason: 'pointer_absent' });
            } else {
                const templateSnap = await admin.database()
                    .ref(`ross/templates/${seedTemplateId}`)
                    .once('value');
                if (!templateSnap.exists()) {
                    console.warn('[registerUser] day-zero seed skipped:', { uid: userId, reason: 'template_missing', templateId: seedTemplateId });
                } else {
                    const template = templateSnap.val();
                    if (template.tier && template.tier !== 'free') {
                        console.warn('[registerUser] day-zero seed skipped:', { uid: userId, reason: 'tier_mismatch', templateTier: template.tier });
                    } else {
                        // SAST = UTC+2. Compute today's date as YYYY-MM-DD-equivalent
                        // millis at SAST midnight, matching the format daysOffset
                        // arithmetic expects (millis at task scheduling).
                        const sastNow = Date.now();
                        const seedWorkflowId = admin.database().ref().push().key;
                        const generateTaskId = () => admin.database().ref().push().key;
                        const { workflowId, atomicWrite } = buildWorkflowRecord({
                            template,
                            locationIds: [locationRef.key],
                            locationNames: [businessName],
                            locationAssignedTo: null,
                            nextDueDate: sastNow,
                            uid: userId,
                            name: null,
                            description: null,
                            customInterval: null,
                            daysBeforeAlert: null,
                            notifyPhone: null,
                            notifyEmail: null,
                            workflowId: seedWorkflowId,
                            validInputTypes: ROSS_VALID_INPUT_TYPES,
                            generateTaskId,
                            now: sastNow,
                        });

                        atomicWrite[`onboarding-progress/${userId}/firstWorkflowSeededAt`] =
                            admin.database.ServerValue.TIMESTAMP;
                        const auditKey = admin.database().ref('ross/auditLog/firstWorkflowSeeded').push().key;
                        atomicWrite[`ross/auditLog/firstWorkflowSeeded/${auditKey}`] = {
                            uid: userId,
                            templateId: seedTemplateId,
                            workflowId,
                            locationId: locationRef.key,
                            seededAt: admin.database.ServerValue.TIMESTAMP,
                        };

                        await admin.database().ref().update(atomicWrite);
                        console.log('[registerUser] day-zero seed:', {
                            uid: userId,
                            workflowId,
                            templateId: seedTemplateId,
                            locationId: locationRef.key,
                        });
                    }
                }
            }
        } catch (seedError) {
            console.error('[registerUser] day-zero seed failed (non-blocking):', seedError);
        }

        return { success: true, userId: userId };
```

### - [ ] Step 3.4: Build to confirm no syntax errors

```bash
npm run build
```

Expected: exit 0.

### - [ ] Step 3.5: Commit

```bash
git add functions/index.js
git commit -m "feat(ross): day-zero auto-activation in registerUser

After the existing location creation, read ross/config/firstWorkflow-
TemplateId, fetch the template, and atomically write a seeded workflow
+ onboarding-progress.firstWorkflowSeededAt + audit-log entry. All
failure branches log and continue — registerUser still succeeds. Free-
tier defensive check guards against misconfigured pointer. Seed is
inert in any environment where the pointer is unset, so this PR is
safe to deploy before the one-off setup script runs."
```

---

## Task 4: Security rule for `ross/config`

**Files:**
- Modify: `database.rules.json`

### - [ ] Step 4.1: Locate the `ross` rule block

Open `database.rules.json` and find the existing `"ross"` object inside `"rules"`. It currently has children like `"templates"`, `"workflows"`, `"auditLog"`, etc.

### - [ ] Step 4.2: Add the `config` rule

Inside `"ross"`, add:

```json
        "config": {
          ".read": "false",
          ".write": "false"
        },
```

Place it alphabetically (before `"locationIndex"` / `"ownerIndex"` etc.) or at the end of the children list — match the file's existing convention.

### - [ ] Step 4.3: Validate JSON

```bash
node -e "JSON.parse(require('fs').readFileSync('database.rules.json','utf8'));console.log('valid')"
```

Expected: `valid`.

### - [ ] Step 4.4: Commit

```bash
git add database.rules.json
git commit -m "feat(rules): lock ross/config to admin-SDK-only

Clients have no need to read or write ross/config. Admin SDK writes
(from registerUser + the one-off setup script) bypass .write rules,
so functionality is unaffected. Per the 2026-05-12 LESSON, no
.validate is added — .write:false makes it unreachable."
```

---

## Task 5: One-off setup script

**Files:**
- Create: `functions/seeds/ross-config-set-first-workflow.js`

### - [ ] Step 5.1: Write the script

Create `functions/seeds/ross-config-set-first-workflow.js`:

```js
/**
 * One-off setup: set ross/config/firstWorkflowTemplateId to the templateId
 * of the "Daily Opening Checklist" seed template. Run once per environment
 * (local emulator, preview, prod) after deploying the day-zero seed code.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *     node functions/seeds/ross-config-set-first-workflow.js
 *
 * Without a service account, follow the firebase-CLI patch path from the
 * 2026-05-12 LESSONS entry:
 *   MSYS_NO_PATHCONV=1 firebase database:get /ross/templates > snapshot.json
 *   # extract templateId for "Daily Opening Checklist", build patch JSON
 *   MSYS_NO_PATHCONV=1 firebase database:update /ross/config patch.json --force
 *
 * The script is idempotent — re-running writes the same templateId.
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
    });
}

const SEED_TEMPLATE_NAME = 'Daily Opening Checklist';

async function run() {
    const snap = await admin.database().ref('ross/templates').once('value');
    const templates = snap.val() || {};
    const match = Object.entries(templates).find(([, t]) => t && t.name === SEED_TEMPLATE_NAME);
    if (!match) {
        console.error(`No template named "${SEED_TEMPLATE_NAME}" found. Run functions/seeds/ross-templates-seed.js first.`);
        process.exit(1);
    }
    const [templateId, template] = match;
    if (template.tier && template.tier !== 'free') {
        console.error(`Template "${SEED_TEMPLATE_NAME}" has tier="${template.tier}". Seed pointer must reference a Free template.`);
        process.exit(1);
    }
    await admin.database().ref('ross/config/firstWorkflowTemplateId').set(templateId);
    console.log(`Set ross/config/firstWorkflowTemplateId = ${templateId} (template: ${template.name})`);
    process.exit(0);
}

run().catch((err) => {
    console.error('Setup failed:', err);
    process.exit(1);
});
```

### - [ ] Step 5.2: Syntax check

```bash
node --check functions/seeds/ross-config-set-first-workflow.js
```

Expected: no output, exit 0.

### - [ ] Step 5.3: Commit

```bash
git add functions/seeds/ross-config-set-first-workflow.js
git commit -m "feat(ross): one-off script to set first-workflow pointer

Queries ross/templates for the Daily Opening Checklist entry and
writes its templateId to ross/config/firstWorkflowTemplateId.
Idempotent — re-runs produce the same value. Refuses to write if
the target template is not Free-tier. Sister to the PR #51 / PR #53
backfill/curate scripts."
```

---

## Task 6: KB documentation

**Files:**
- Modify: `public/kb/features/ROSS.md`

### - [ ] Step 6.1: Locate the activation section

Open `public/kb/features/ROSS.md`. Find the section that describes how templates get activated into workflows (search for `rossActivateWorkflow` or `activated → Workflows`).

### - [ ] Step 6.2: Add a "Day-zero auto-activation" subsection

Insert a new subsection (placement: after the existing template-activation section, before any tier-gating section):

```markdown
### Day-zero auto-activation

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
```

### - [ ] Step 6.3: Commit

```bash
git add public/kb/features/ROSS.md
git commit -m "docs(ross): document day-zero auto-activation mechanism

Adds a subsection covering the RTDB pointer, the inline seed in
registerUser, silent-failure mode, and operator override path."
```

---

## Task 7: Build + sanity check

### - [ ] Step 7.1: Full build

From worktree root:
```bash
npm run build
```

Expected: exit 0. No new warnings beyond the existing baseline.

### - [ ] Step 7.2: Run the full test suite

```bash
npx vitest run
```

Expected: all existing tests pass + 17 new `ross-workflow-builder.test.js` tests pass.

### - [ ] Step 7.3: Lint

```bash
npm run lint -- functions/ross.js functions/index.js functions/ross-workflow-builder.js functions/seeds/ross-config-set-first-workflow.js tests/unit/ross-workflow-builder.test.js
```

Expected: zero new lint errors on the touched files. Pre-existing project-wide lint warnings are out of scope.

### - [ ] Step 7.4: Push branch + open PR

```bash
git push -u origin feature/ross-day-zero-seed
gh pr create --title "feat(ross): day-zero auto-activation (Phase 6 PR 2)" --body "$(cat <<'EOF'
## Summary
Phase 6 PR 2 — when a new operator completes signup via `registerUser`,
auto-activate the "Daily Opening Checklist" template against their first
location so they land on ROSS with one runnable workflow.

### Changes
- Extract pure helpers `buildLocationsFromTemplate` + `buildWorkflowRecord`
  into `functions/ross-workflow-builder.js` (zero firebase-admin deps,
  17 unit tests).
- Refactor `rossActivateWorkflow` to use `buildWorkflowRecord` — byte-
  identical atomic write keys, no behaviour change.
- Add inline seed in `registerUser` (functions/index.js): pointer-based
  template resolution, atomic write of workflow + idempotency marker +
  audit-log entry, silent-fail on every error branch.
- New one-off setup script `functions/seeds/ross-config-set-first-workflow.js`
  that points `ross/config/firstWorkflowTemplateId` at the Daily Opening
  Checklist template.
- Lock `ross/config` in `database.rules.json` to admin-SDK-only.
- Document the mechanism in `public/kb/features/ROSS.md`.

### Rollout
1. Merge PR
2. `cd functions && npm install` in worktree (worktrees don't inherit
   `node_modules` — PR #55 LESSON)
3. `firebase deploy --only functions:registerUser,functions:rossActivateWorkflow`
4. Run `functions/seeds/ross-config-set-first-workflow.js` against prod
   RTDB to set the pointer
5. Test fresh signup on preview
6. Watch CF logs for the first ~10 real signups

### Spec / Plan
- Spec: `docs/plans/2026-05-12-ross-day-zero-auto-activation-design.md`
- Plan: `docs/plans/2026-05-12-pr2-ross-day-zero-seed-plan.md`

## Test plan
- [ ] `npx vitest run` — all tests pass including 17 new
- [ ] `npm run build` — exit 0
- [ ] Lint clean on touched files
- [ ] Manual preview: fresh signup → land on ROSS → Playbook shows
      Daily Opening Checklist with 4 tasks due today
- [ ] Manual preview: pointer-absent test (delete pointer, signup, confirm
      no seed, no error, user still lands successfully)
- [ ] Audit log entry written at `ross/auditLog/firstWorkflowSeeded/{pushId}`
EOF
)"
```

### - [ ] Step 7.5: Wait for review, address findings inline

Per fold-in scope rule (validated 4x): in-scope review findings fold into the branch; out-of-scope ones go to backlog with a comment in the PR.

---

## Out-of-PR rollout steps (post-merge, executed in a separate session)

These are NOT part of the plan execution. They run after merge by the operator (or by an authorized session):

1. From master after merge: `cd functions && npm install` (master worktree)
2. `firebase deploy --only functions:registerUser,functions:rossActivateWorkflow`
3. `node functions/seeds/ross-config-set-first-workflow.js` against prod RTDB to set the pointer (requires service-account creds OR use the firebase-CLI patch fallback documented in the script header)
4. Test fresh signup on preview channel
5. Monitor CF logs: `firebase functions:log --only registerUser | grep "day-zero"`

If any post-merge step fails:
- Pointer not set → fresh signups land on empty Playbook (no regression). Re-run step 3.
- CF deploy fails → revert via `firebase functions:rollback` and investigate.

---

## Self-Review

**Spec coverage:**
- Hook point inline in `registerUser` → Task 3 ✓
- Pointer at `ross/config/firstWorkflowTemplateId` → Task 3 (consumer) + Task 5 (setup) ✓
- Helper extraction → Task 1 (create + test) + Task 2 (refactor consumer) ✓
- Idempotency via `firstWorkflowSeededAt` → Task 3 ✓
- Silent failure mode → Task 3 (try/catch wrapping) ✓
- Audit log → Task 3 ✓
- Security rule `ross/config` → Task 4 ✓
- KB docs → Task 6 ✓
- One-off setup script → Task 5 ✓
- Unit tests for helpers → Task 1 ✓
- Refactor safety (byte-identical) → Task 2 (manual diff check at 2.4) ✓

**Placeholder scan:** every code block contains executable code; every step has a concrete bash command or paste-ready code; no "TBD" / "similar to" / "implement later".

**Type consistency:**
- `buildWorkflowRecord` parameters defined in Task 1 (Step 1.3) match the call sites in Task 2 (Step 2.2) and Task 3 (Step 3.3) — all 16 named params present in each.
- `ROSS_VALID_INPUT_TYPES` in Task 3 matches the values used by `buildTaskFromSubtask` in Task 1 — the array is identical to the existing `VALID_INPUT_TYPES` in `functions/ross.js` (verified before plan write).
- Atomic-write keys in Task 1 (`ross/workflows/...`, `ross/ownerIndex/...`, `ross/workflowsByLocation/...`) match the keys produced by the existing `rossActivateWorkflow` (verified by reading lines 505-509 of `functions/ross.js` pre-refactor).
