# ROSS Day-Zero Auto-Activation — Design

**Phase:** 6 PR 2
**Status:** Spec
**Date:** 2026-05-12
**Branch:** `feature/ross-day-zero-seed`
**Predecessor PRs:** #51 (tier mechanism), #53 (curation), #55 (locked-card UX + `/upgrade.html`)

## Problem

A new operator who completes signup currently lands on `/ross.html` with an empty Playbook — zero workflows, zero tasks, zero proof that ROSS does anything. The Phase 6 funnel has built tier-gating, curated 13 templates, and shipped the upgrade affordance, but day-one is still a blank slate. The funnel narrative ("workflows are the product") demands that a fresh account arrives with a runnable workflow already attached.

## Goal

At account creation, auto-activate the **Daily Opening Checklist** template against the new user's first location so they land on ROSS with one workflow whose tasks are due today.

Non-goals:
- Multiple seeded workflows (one is enough; more is noise on day-zero)
- Per-user template selection during onboarding (zero choices is the point)
- Re-seeding on workflow deletion or template changes
- Admin-curated UI for the seed pointer (one-off script is sufficient until proven otherwise)
- Seeding for `createUserAccount` (admin-provisioned accounts) — different flow, different stakeholders

## Design

### Hook point — inline in `registerUser` CF

The seed runs **inside `registerUser`** (`functions/index.js` ~line 663, immediately after the existing location creation). Three reasons:

1. **Fresh signups skip the wizard.** Per PR #46 router lock, the wizard is now legacy-only (reached by direct URL or pre-PR-46 accounts). Hooking at wizard completion would miss 100% of new signups.
2. **`registerUser` already creates a location atomically** (lines 660-662). The seed has guaranteed access to a freshly-created `locationId` in the same call frame.
3. **Single transaction.** User, subscription, onboarding-progress, location, userLocations, AND workflow are all written from one call. No client coupling, no extra round-trip, no race between "user lands on ROSS" and "workflow exists".

### Seed-template resolution — RTDB pointer

Template IDs in this codebase are Firebase push keys, not stable slugs (`functions/seeds/ross-templates-seed.js:220`). Hardcoding a templateId would not work — the key differs between local emulator, preview, and prod.

Introduce a new RTDB pointer:
```
ross/config/firstWorkflowTemplateId = "<templateId>"
```

The CF reads this pointer. If absent or stale, it logs a warning and skips seeding — the user lands on ROSS with an empty Playbook (same as today, no regression).

One-off setup script (`functions/seeds/ross-config-set-first-workflow.js`) queries `ross/templates` for the entry whose `name === 'Daily Opening Checklist'` and writes its `templateId` to the pointer. Operator runs this once per environment after deploying functions.

**Why a pointer (vs. name lookup at request time, or `isStarter` flag on the template):**
- Stable across template renames — operator can rename the canonical name without breaking seeding.
- Operator can switch the starter template at any time without a code change.
- Defensive — absent pointer means "no seed", not a crash.
- Sister pattern to `subscriptionTiers/` admin-curated model from PR #42.

### Server flow

Inside `registerUser`, after the existing `userLocations/${userId}/${locationRef.key}` write:

```js
// Day-zero seed — non-blocking, best-effort.
try {
  const pointerSnap = await admin.database().ref('ross/config/firstWorkflowTemplateId').once('value');
  const seedTemplateId = pointerSnap.val();
  if (!seedTemplateId) {
    console.warn('[registerUser] day-zero seed skipped:', { uid: userId, reason: 'pointer_absent' });
  } else {
    const templateSnap = await admin.database().ref(`ross/templates/${seedTemplateId}`).once('value');
    if (!templateSnap.exists()) {
      console.warn('[registerUser] day-zero seed skipped:', { uid: userId, reason: 'template_missing', templateId: seedTemplateId });
    } else {
      const template = templateSnap.val();
      // Defensive: pointer should always reference a Free template.
      // If misconfigured (e.g. pointed at an all-in template), skip.
      if (template.tier && template.tier !== 'free') {
        console.warn('[registerUser] day-zero seed skipped:', { uid: userId, reason: 'tier_mismatch', templateTier: template.tier });
      } else {
        const today = formatSastDate(Date.now()); // YYYY-MM-DD in SAST
        const { workflowId, atomicWrite } = buildWorkflowSeedWrite({
          template,
          locationIds: [locationRef.key],
          locationNames: [businessName],
          nextDueDate: today,
          uid: userId,
          name: template.name,
        });
        // Mark idempotency + audit log in the same atomic write.
        atomicWrite[`onboarding-progress/${userId}/firstWorkflowSeededAt`] = admin.database.ServerValue.TIMESTAMP;
        const auditKey = admin.database().ref('ross/auditLog/firstWorkflowSeeded').push().key;
        atomicWrite[`ross/auditLog/firstWorkflowSeeded/${auditKey}`] = {
          uid: userId,
          templateId: seedTemplateId,
          workflowId,
          locationId: locationRef.key,
          seededAt: admin.database.ServerValue.TIMESTAMP,
        };
        await admin.database().ref().update(atomicWrite);
        console.log('[registerUser] day-zero seed:', { uid: userId, workflowId, templateId: seedTemplateId, locationId: locationRef.key });
      }
    }
  }
} catch (seedError) {
  console.error('[registerUser] day-zero seed failed (non-blocking):', seedError);
  // Do NOT throw — account creation must succeed regardless.
}

return { success: true, userId: userId };
```

The seed is wrapped in its own try/catch. Any failure logs and continues — the user account itself must succeed. Existing `registerUser` behaviour is preserved byte-for-byte on every failure branch.

### Helper extraction (`functions/ross.js`)

The location-loop + workflowData object construction inside `rossActivateWorkflow` (lines ~466-509) is duplicated logic from the seed's perspective. Extract two helpers:

```js
// functions/ross.js — new exports

function buildLocationsFromTemplate(template, locationIds, locationNames, locationAssignedTo, nextDueDate) {
  const now = Date.now();
  const locations = {};
  locationIds.forEach((locationId, idx) => {
    const tasks = {};
    if (Array.isArray(template.subtasks)) {
      template.subtasks.forEach(subtask => {
        const taskId = generateId();
        tasks[taskId] = buildTaskFromSubtask(subtask, nextDueDate);
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

function buildWorkflowSeedWrite({ template, locationIds, locationNames, nextDueDate, uid, name }) {
  const workflowId = generateId();
  const now = Date.now();
  const locations = buildLocationsFromTemplate(template, locationIds, locationNames, null, nextDueDate);
  const workflowData = {
    workflowId,
    templateId: template.templateId,
    ownerId: uid,
    name: (name || template.name).trim(),
    description: (template.description || '').trim() || null,
    category: template.category,
    recurrence: template.recurrence,
    customInterval: null,
    notificationChannels: ['in_app'],
    notifyPhone: null,
    notifyEmail: null,
    daysBeforeAlert: Array.isArray(template.daysBeforeAlert) ? template.daysBeforeAlert : [30, 7],
    createdAt: now,
    updatedAt: now,
    locations,
  };
  const atomicWrite = {
    [`ross/workflows/${uid}/${workflowId}`]: workflowData,
    [`ross/ownerIndex/${uid}`]: true,
    ...locationIndexUpdates(workflowId, uid, locationIds),
  };
  return { workflowId, workflowData, atomicWrite };
}

module.exports.buildLocationsFromTemplate = buildLocationsFromTemplate;
module.exports.buildWorkflowSeedWrite = buildWorkflowSeedWrite;
```

`rossActivateWorkflow` is refactored to call `buildLocationsFromTemplate` for its locations object. The behaviour must be byte-identical — existing rossActivateWorkflow tests pass unchanged. Refactor commit lands separately from the seed integration to make the diff reviewable.

### Idempotency

`onboarding-progress/{uid}/firstWorkflowSeededAt` is the marker. Two guards layered:

1. **Outer** — `registerUser` already short-circuits via `existingOnboardingSnap.exists()`. Re-entering `registerUser` for an existing account does not re-write onboarding-progress, and the seed branch sits inside the new-account path.
2. **Inner** — even if the outer guard is bypassed (future code change), the seed write of `firstWorkflowSeededAt` going to an existing value is a no-op via the atomic merge semantics of `update()`. The audit log push key is unique per attempt, so we'd see double-seeding only as a duplicate audit entry — visible and recoverable.

For first-cut simplicity we rely on the outer guard. If misuse surfaces, add an explicit `firstWorkflowSeededAt` check before the seed read.

### Failure mode — silent log, continue

Day-zero is a delight feature, not a critical path. Every failure branch:
- Logs (level matches severity: `warn` for skip, `error` for exception)
- Does not throw — `registerUser` returns success regardless
- Leaves the user landing on ROSS with an empty Playbook (current production behaviour)
- Operator can manually activate from `/upgrade.html` ← `/ross.html?tab=playbook`

The audit log captures only successful seeds. Skip / failure observability is via Cloud Functions logs (queryable from Firebase Console / `firebase functions:log`).

### One-off setup script

```js
// functions/seeds/ross-config-set-first-workflow.js
// Run once per environment after deploying ross.js + index.js changes.
// Requires GOOGLE_APPLICATION_CREDENTIALS or use the firebase-CLI patch
// path documented in PR #51 LESSONS (firebase database:get → patch JSON
// → firebase database:update --force) if credentials aren't available.

const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://merakicaptiveportal-firebasedb-default-rtdb.firebaseio.com',
});

const SEED_TEMPLATE_NAME = 'Daily Opening Checklist';

(async () => {
  const snap = await admin.database().ref('ross/templates').once('value');
  const templates = snap.val() || {};
  const match = Object.entries(templates).find(([, t]) => t.name === SEED_TEMPLATE_NAME);
  if (!match) {
    console.error(`No template named "${SEED_TEMPLATE_NAME}" found.`);
    process.exit(1);
  }
  const [templateId, template] = match;
  if (template.tier && template.tier !== 'free') {
    console.error(`Template "${SEED_TEMPLATE_NAME}" has tier="${template.tier}". Seed pointer must reference a Free template.`);
    process.exit(1);
  }
  await admin.database().ref('ross/config/firstWorkflowTemplateId').set(templateId);
  console.log(`Set ross/config/firstWorkflowTemplateId = ${templateId}`);
  process.exit(0);
})().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
```

The script is idempotent — re-running with the same template name produces the same pointer.

### Security rules

`ross/config/` is admin-SDK-only writable; clients have no need to read or write. Add to `database.rules.json`:
```json
"ross": {
  "config": {
    ".read": false,
    ".write": false
  }
}
```
(Admin SDK writes always bypass `.write`. The rule documents that no client should access this node. Per the 2026-05-12 LESSONS entry, we do NOT add `.validate` here because the `.write:false` makes it unreachable.)

### Testing

**Unit (vitest, `functions/test/`):**
- `buildLocationsFromTemplate`: empty subtasks, single subtask, multiple subtasks, missing `locationNames`, missing `locationAssignedTo`
- `buildWorkflowSeedWrite`: output keys match the existing `rossActivateWorkflow` atomic write shape (regression guard for the refactor)

**Refactor safety:**
- Run existing `rossActivateWorkflow` test suite against the helper-using version unchanged. No behaviour change permitted.

**Integration (manual on preview):**
- Fresh signup → land on ROSS → Playbook tab shows seeded Daily Opening Checklist
- Open the workflow → 4 tasks listed (per seed file lines 73-78)
- `nextDueDate` is today's date in SAST
- Audit log entry visible at `ross/auditLog/firstWorkflowSeeded/{pushId}` (read via Firebase Console)
- Pointer absent test: temporarily delete `ross/config/firstWorkflowTemplateId` on preview, signup → no seed, no error, user lands on empty Playbook
- Re-entry test: signup with an email that has an existing account → `existingOnboardingSnap.exists()` short-circuit fires, no duplicate seed

### Rollout sequence

Per PR #51 / #55 LESSONS, deploy CFs **before** declaring preview ready:

1. Merge PR (functions code + helpers + tests)
2. `cd functions && npm install` in worktree (worktrees don't inherit `node_modules` — PR #55 LESSON)
3. `firebase deploy --only functions:registerUser` (and any other touched CFs)
4. Run `functions/seeds/ross-config-set-first-workflow.js` against prod RTDB to set the pointer
5. Manual preview validation (fresh signup test)
6. Watch CF logs for the first ~10 real signups post-rollout

### File diff summary

| File | Change |
|------|--------|
| `functions/ross.js` | Extract `buildLocationsFromTemplate` + `buildWorkflowSeedWrite` helpers; refactor `rossActivateWorkflow` to use them; export both. |
| `functions/index.js` | Add inline seed block in `registerUser` after location creation (~40 lines). Import helpers from `./ross.js`. |
| `functions/seeds/ross-config-set-first-workflow.js` | NEW: one-off script (~40 lines). |
| `functions/test/ross-helpers.test.js` | NEW: unit tests for extracted helpers. |
| `database.rules.json` | Add `ross/config` rule (`.read:false`, `.write:false`). |
| `public/kb/features/ROSS.md` | Document day-zero seed mechanism + pointer. |
| `KNOWLEDGE BASE/PROJECT_BACKLOG.md` | Mark Phase 6 day-zero auto-activation task done after merge. |

### Open questions

None remaining. All architecture decisions locked in this design.

### Decisions log

| Decision | Picked | Why |
|----------|--------|-----|
| Hook point | Inline in `registerUser` CF | Fresh signups skip wizard; registerUser already creates location atomically; single transaction. |
| Seed template | Daily Opening Checklist | Daily recurrence → tasks due today; Free tier → no gating; already in seed library. |
| Template ID resolution | RTDB pointer at `ross/config/firstWorkflowTemplateId` | Push keys aren't stable; pointer is operator-swappable, defensive on absence. |
| Location resolution | The one location `registerUser` just created | Server has the key in scope; no client coupling. |
| Idempotency | `onboarding-progress/{uid}/firstWorkflowSeededAt` + outer guard | Marker is co-located with other onboarding state; outer guard already prevents re-entry. |
| Failure mode | Silent log + continue | Day-zero is delight, not critical path. User has manual activation as fallback. |
| Audit log | `ross/auditLog/firstWorkflowSeeded/{pushId}` | Mirrors PR #51's `templateActivationDenials` pattern. |
| Admin-created users (`createUserAccount`) | NOT seeded | Different flow, different stakeholders. Out of scope. |
