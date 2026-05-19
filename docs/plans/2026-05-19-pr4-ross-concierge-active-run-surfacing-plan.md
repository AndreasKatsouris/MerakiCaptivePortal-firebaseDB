# ROSS Concierge Active-Run Surfacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scripted/illustrative slot-1 cards on `/ross.html` with a real-data card driven by the user's activated ROSS workflows (overdue / in-progress / due-today / recent-completion / all-clear) via a new server CF.

**Architecture:** New `rossGetHomeWorkflowDigest` CF (Admin SDK reads `ross/workflows/{uid}` + `ross/runs/{uid}`, returns structured digest). Thin client detector `detectActiveWorkflows` wraps the CF, picks priority, builds card. Existing food-cost / VIP / revenue detectors keep slots 2-3. No new RTDB nodes or schema changes.

**Tech Stack:** Firebase Cloud Functions v7 (Node 22), Vue 3 SFCs + Pinia, Vitest unit tests, Hi-Fi design system tokens.

**Spec:** `docs/plans/2026-05-19-ross-concierge-active-run-surfacing-design.md`

**Branch:** `feature/ross-home-active-run-surfacing` (worktree: `.worktrees/ross-home-active-run-surfacing`)

---

## Pre-flight checklist (do these BEFORE Task 1)

- [ ] **Confirm worktree is current branch.** Run `git -C .worktrees/ross-home-active-run-surfacing rev-parse --abbrev-ref HEAD`. Expect `feature/ross-home-active-run-surfacing`. Confirm `git -C .worktrees/ross-home-active-run-surfacing status --short` shows nothing.

- [ ] **Verify Hi-Fi tokens exist** for variant card styling. Run from worktree root: `grep -oE '\-\-hf-[a-z0-9-]+' public/css/hifi-tokens.css | sort -u`. Confirm presence of: `--hf-warn`, `--hf-good`, `--hf-accent`, `--hf-muted`. (Per PR #55 LESSON: never assume token names; verify against source.)

- [ ] **Verify `functions/node_modules` populated** (needed before CF deploy in Task 4). Run `ls functions/node_modules/firebase-functions/package.json` from worktree root. If missing, `cd functions && npm install` (≈53s). Per 2026-05-12 LESSON.

- [ ] **Verify RossRun.vue URL param reader** uses `w` and `l` query params. Run `grep -nE "(workflowId|locationId|searchParams|URLSearchParams)" public/js/modules/ross/v2/components/RossRun.vue | head -20`. Note the exact param names the component reads. If they differ from `w` / `l`, update all `href:` references in Task 7 variant builders to match before writing tests.

- [ ] **Verify server input shapes** match the spec. Run `grep -nE "loc\.tasks|loc\.nextDueDate|run\.responses|run\.status" functions/ross.js | head -20`. Confirm `loc.tasks` exists (per-location tasks object), `loc.nextDueDate` is a string field, runs carry `status`, `startedAt`, `completedAt`, `responses`, `onTime`, `flaggedCount`. Per 2026-05-13 LESSON (copy server shapes verbatim into mocks, never from memory).

- [ ] **Verify CF auth pattern.** Run `grep -nE "^(exports\.|const \w+\s*=\s*onCall)" functions/ross.js | head -20`. Confirm whether existing CFs use callable `onCall` or HTTP. Match the pattern for `rossGetHomeWorkflowDigest`. Note the helper name `verifyAdmin` vs `verifyUserOrAdmin` — use whatever the read-side ROSS CFs use (e.g. `rossGetWorkflows`).

If any check fails, stop and resolve before writing code.

---

## Task 1: Server pure helper — `buildHomeWorkflowDigest`

**Files:**
- Modify: `functions/ross.js` (add helper function, define above the existing WORKFLOW OPERATIONS block per existing convention)
- Create: `tests/unit/buildHomeWorkflowDigest.test.js`

TDD: write the test cases first, then the pure helper. No RTDB / Admin SDK in this task — pure function over plain data.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/buildHomeWorkflowDigest.test.js`:

```js
import { describe, test, expect } from 'vitest'
import { buildHomeWorkflowDigest } from '../../functions/ross.js'

const DAY = 86_400_000
const baseNow = Date.parse('2026-05-19T08:00:00Z')

function mkWorkflow(id, name, locations, status = 'active') {
  return { workflowId: id, name, status, locations }
}

function mkLocation(name, nextDueDate, tasks = {}) {
  return { locationName: name, nextDueDate, tasks }
}

function mkTask(required = true) {
  return { title: 't', required }
}

function mkRun(overrides = {}) {
  return {
    runId: 'r1',
    status: 'in_progress',
    startedAt: baseNow - 3_600_000,
    responses: {},
    ...overrides,
  }
}

describe('buildHomeWorkflowDigest', () => {
  test('empty inputs return empty buckets + hasActiveWorkflows false', () => {
    const d = buildHomeWorkflowDigest({ workflows: {}, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue).toEqual([])
    expect(d.today).toEqual([])
    expect(d.recentCompletions).toEqual([])
    expect(d.hasActiveWorkflows).toBe(false)
    expect(d.activeWorkflowCount).toBe(0)
    expect(d.upcoming).toBeNull()
    expect(d.generatedAt).toBe(baseNow)
  })

  test('workflow with nextDueDate yesterday, no run → overdue', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Daily Opening', {
        locA: mkLocation('Ocean Club', '2026-05-18', { t1: mkTask(), t2: mkTask() }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue).toHaveLength(1)
    expect(d.overdue[0]).toMatchObject({
      workflowId: 'w1',
      locationId: 'locA',
      name: 'Daily Opening',
      locationName: 'Ocean Club',
      nextDueDate: '2026-05-18',
      daysLate: 1,
      requiredTaskCount: 2,
    })
  })

  test('workflow with nextDueDate today, no run → today/pending', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Daily Opening', {
        locA: mkLocation('Ocean Club', '2026-05-19', { t1: mkTask() }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.today).toHaveLength(1)
    expect(d.today[0].subState).toBe('pending')
    expect(d.today[0].requiredTaskCount).toBe(1)
  })

  test('workflow with in-progress run today, 2 of 5 responded → today/in_progress', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Daily Opening', {
        locA: mkLocation('Ocean Club', '2026-05-19', {
          t1: mkTask(), t2: mkTask(), t3: mkTask(), t4: mkTask(), t5: mkTask(),
        }),
      }),
    }
    const runs = {
      w1: {
        locA: {
          r1: mkRun({
            runId: 'r1',
            status: 'in_progress',
            startedAt: baseNow - 1_800_000,
            responses: { t1: { value: 'on' }, t2: { value: 'on' } },
          }),
        },
      },
    }
    const d = buildHomeWorkflowDigest({ workflows, runs, clientToday: '2026-05-19', now: baseNow })
    expect(d.today).toHaveLength(1)
    expect(d.today[0]).toMatchObject({
      subState: 'in_progress',
      runId: 'r1',
      completedTaskCount: 2,
      requiredTaskCount: 5,
    })
  })

  test('completed run 1h ago, on time, 0 flagged → recentCompletions', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Daily Opening', {
        locA: mkLocation('Ocean Club', '2026-05-20', { t1: mkTask() }),
      }),
    }
    const runs = {
      w1: {
        locA: {
          r1: mkRun({
            runId: 'r1',
            status: 'completed',
            startedAt: baseNow - 7_200_000,
            completedAt: baseNow - 3_600_000,
            onTime: true,
            flaggedCount: 0,
            responses: { t1: { value: 'on' } },
          }),
        },
      },
    }
    const d = buildHomeWorkflowDigest({ workflows, runs, clientToday: '2026-05-19', now: baseNow })
    expect(d.recentCompletions).toHaveLength(1)
    expect(d.recentCompletions[0]).toMatchObject({
      runId: 'r1',
      onTime: true,
      flaggedCount: 0,
    })
  })

  test('completed run 25h ago → NOT in recentCompletions', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'X', { locA: mkLocation('L', '2026-05-20', { t1: mkTask() }) }),
    }
    const runs = {
      w1: { locA: { r1: mkRun({
        status: 'completed',
        completedAt: baseNow - 25 * 3_600_000,
        responses: { t1: { value: 'on' } },
      }) } },
    }
    const d = buildHomeWorkflowDigest({ workflows, runs, clientToday: '2026-05-19', now: baseNow })
    expect(d.recentCompletions).toEqual([])
  })

  test('paused workflow is skipped', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'X', { locA: mkLocation('L', '2026-05-18', { t1: mkTask() }) }, 'paused'),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue).toEqual([])
    expect(d.hasActiveWorkflows).toBe(false)
  })

  test('multi-location: one overdue + one due today populates both buckets', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Opening', {
        locA: mkLocation('A', '2026-05-18', { t1: mkTask() }),
        locB: mkLocation('B', '2026-05-19', { t1: mkTask() }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue).toHaveLength(1)
    expect(d.today).toHaveLength(1)
    expect(d.overdue[0].locationId).toBe('locA')
    expect(d.today[0].locationId).toBe('locB')
  })

  test('malformed workflow (no locations) is skipped, no throw', () => {
    const workflows = { w1: { workflowId: 'w1', name: 'X', status: 'active' } }
    expect(() => buildHomeWorkflowDigest({
      workflows, runs: {}, clientToday: '2026-05-19', now: baseNow,
    })).not.toThrow()
  })

  test('task with required: false excluded from requiredTaskCount', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'X', {
        locA: mkLocation('A', '2026-05-19', {
          t1: mkTask(true), t2: mkTask(false), t3: mkTask(true),
        }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.today[0].requiredTaskCount).toBe(2)
  })

  test('run with empty responses → completedTaskCount 0', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'X', {
        locA: mkLocation('A', '2026-05-19', { t1: mkTask() }),
      }),
    }
    const runs = { w1: { locA: { r1: mkRun({ responses: {} }) } } }
    const d = buildHomeWorkflowDigest({ workflows, runs, clientToday: '2026-05-19', now: baseNow })
    expect(d.today[0].completedTaskCount).toBe(0)
  })

  test('clientToday missing → uses UTC date derived from now', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'X', {
        locA: mkLocation('A', '2026-05-18', { t1: mkTask() }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, now: baseNow })
    expect(d.overdue).toHaveLength(1)
  })

  test('day-zero shape: 1 active workflow, nextDueDate tomorrow → all-clear payload', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'Daily Opening', {
        locA: mkLocation('Ocean Club', '2026-05-20', { t1: mkTask() }),
      }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue).toEqual([])
    expect(d.today).toEqual([])
    expect(d.recentCompletions).toEqual([])
    expect(d.hasActiveWorkflows).toBe(true)
    expect(d.activeWorkflowCount).toBe(1)
    expect(d.upcoming).toMatchObject({
      workflowId: 'w1',
      locationId: 'locA',
      name: 'Daily Opening',
      locationName: 'Ocean Club',
      nextDueDate: '2026-05-20',
    })
  })

  test('no workflows at all → hasActiveWorkflows false, upcoming null', () => {
    const d = buildHomeWorkflowDigest({ workflows: {}, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.hasActiveWorkflows).toBe(false)
    expect(d.activeWorkflowCount).toBe(0)
    expect(d.upcoming).toBeNull()
  })

  test('overdue sorted by daysLate desc', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'A', { locA: mkLocation('A', '2026-05-17', { t1: mkTask() }) }),
      w2: mkWorkflow('w2', 'B', { locB: mkLocation('B', '2026-05-15', { t1: mkTask() }) }),
    }
    const d = buildHomeWorkflowDigest({ workflows, runs: {}, clientToday: '2026-05-19', now: baseNow })
    expect(d.overdue.map(o => o.daysLate)).toEqual([4, 2])
  })

  test('today/in_progress sorts before today/pending', () => {
    const workflows = {
      w1: mkWorkflow('w1', 'A', { locA: mkLocation('A', '2026-05-19', { t1: mkTask() }) }),
      w2: mkWorkflow('w2', 'B', { locB: mkLocation('B', '2026-05-19', { t1: mkTask() }) }),
    }
    const runs = {
      w2: { locB: { r1: mkRun({ status: 'in_progress', startedAt: baseNow - 600_000, responses: {} }) } },
    }
    const d = buildHomeWorkflowDigest({ workflows, runs, clientToday: '2026-05-19', now: baseNow })
    expect(d.today[0].subState).toBe('in_progress')
    expect(d.today[0].workflowId).toBe('w2')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/buildHomeWorkflowDigest.test.js`
Expected: all FAIL with "buildHomeWorkflowDigest is not a function" or similar.

- [ ] **Step 3: Implement the helper in `functions/ross.js`**

Find a location above the existing `WORKFLOW OPERATIONS` comment block. Insert the helper. **Also add it to the module exports at the bottom of the file** (look for `module.exports = { ... }` or scan how other helpers are exported — match the existing pattern).

```js
// =====================================================================
//  HOME WORKFLOW DIGEST helper (pure, exported for unit tests)
// =====================================================================

const HOME_DIGEST_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOME_DIGEST_DAY_MS = 24 * 60 * 60 * 1000;

function _todayUTC(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function _dateDiffDays(fromISO, toISO) {
  // positive when toISO > fromISO
  const f = Date.parse(fromISO + 'T00:00:00Z');
  const t = Date.parse(toISO + 'T00:00:00Z');
  if (Number.isNaN(f) || Number.isNaN(t)) return 0;
  return Math.round((t - f) / HOME_DIGEST_DAY_MS);
}

function _latestRun(runsForPair) {
  if (!runsForPair || typeof runsForPair !== 'object') return null;
  let best = null;
  for (const r of Object.values(runsForPair)) {
    if (!r || typeof r !== 'object') continue;
    if (!best || (Number(r.startedAt) || 0) > (Number(best.startedAt) || 0)) {
      best = r;
    }
  }
  return best;
}

function _countRequiredTasks(tasks) {
  if (!tasks || typeof tasks !== 'object') return 0;
  let n = 0;
  for (const t of Object.values(tasks)) {
    if (t && t.required !== false) n++;
  }
  return n;
}

function _countResponses(run) {
  if (!run || !run.responses || typeof run.responses !== 'object') return 0;
  return Object.keys(run.responses).length;
}

function buildHomeWorkflowDigest({ workflows, runs, clientToday, now }) {
  const today = clientToday || _todayUTC(now);
  const safeWorkflows = (workflows && typeof workflows === 'object') ? workflows : {};
  const safeRuns = (runs && typeof runs === 'object') ? runs : {};

  const overdue = [];
  const todayBucket = [];
  const recentCompletions = [];

  const activeWorkflowIds = new Set();
  let upcoming = null; // { workflowId, locationId, name, locationName, nextDueDate }

  for (const [workflowId, w] of Object.entries(safeWorkflows)) {
    if (!w || typeof w !== 'object') continue;
    if (w.status === 'paused') continue;
    if (!w.locations || typeof w.locations !== 'object') {
      console.warn(`[ross] skipped malformed workflow ${workflowId}: no locations`);
      continue;
    }

    let workflowCountsAsActive = false;

    for (const [locationId, loc] of Object.entries(w.locations)) {
      if (!loc || typeof loc !== 'object') continue;
      if (!loc.nextDueDate) {
        console.warn(`[ross] skipped malformed workflow ${workflowId}/${locationId}: no nextDueDate`);
        continue;
      }

      workflowCountsAsActive = true;
      const runsForPair = (safeRuns[workflowId] && safeRuns[workflowId][locationId]) || {};
      const latestRun = _latestRun(runsForPair);
      const requiredTaskCount = _countRequiredTasks(loc.tasks);
      const completedTaskCount = _countResponses(latestRun);

      const nextDueMs = Date.parse(loc.nextDueDate + 'T00:00:00Z');
      const runCoversCurrentPeriod = latestRun
        && Number.isFinite(nextDueMs)
        && Number(latestRun.startedAt) >= nextDueMs;

      const daysLate = _dateDiffDays(loc.nextDueDate, today);
      const name = w.name || 'Workflow';
      const locationName = loc.locationName || 'Venue';

      const baseEntry = {
        workflowId, locationId, name, locationName,
        nextDueDate: loc.nextDueDate,
      };

      if (loc.nextDueDate < today && !runCoversCurrentPeriod) {
        overdue.push({ ...baseEntry, daysLate, requiredTaskCount });
      } else if (loc.nextDueDate === today && latestRun && latestRun.status === 'in_progress') {
        todayBucket.push({
          ...baseEntry,
          subState: 'in_progress',
          runId: latestRun.runId,
          startedAt: Number(latestRun.startedAt) || 0,
          completedTaskCount,
          requiredTaskCount,
        });
      } else if (loc.nextDueDate === today && !runCoversCurrentPeriod) {
        todayBucket.push({
          ...baseEntry,
          subState: 'pending',
          requiredTaskCount,
        });
      } else if (latestRun && latestRun.status === 'completed'
                 && (now - Number(latestRun.completedAt)) < HOME_DIGEST_RECENT_WINDOW_MS) {
        recentCompletions.push({
          ...baseEntry,
          runId: latestRun.runId,
          completedAt: Number(latestRun.completedAt) || 0,
          onTime: latestRun.onTime !== false,
          flaggedCount: Number(latestRun.flaggedCount) || 0,
        });
      }

      // Track upcoming (earliest future-due workflow)
      if (loc.nextDueDate > today) {
        if (!upcoming || loc.nextDueDate < upcoming.nextDueDate) {
          upcoming = { ...baseEntry };
        }
      }
    }

    if (workflowCountsAsActive) activeWorkflowIds.add(workflowId);
  }

  overdue.sort((a, b) => b.daysLate - a.daysLate);
  todayBucket.sort((a, b) => {
    if (a.subState !== b.subState) return a.subState === 'in_progress' ? -1 : 1;
    if (a.nextDueDate !== b.nextDueDate) return a.nextDueDate < b.nextDueDate ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  recentCompletions.sort((a, b) => b.completedAt - a.completedAt);

  return {
    overdue,
    today: todayBucket,
    recentCompletions,
    hasActiveWorkflows: activeWorkflowIds.size > 0,
    activeWorkflowCount: activeWorkflowIds.size,
    upcoming,
    generatedAt: now,
  };
}

module.exports.buildHomeWorkflowDigest = buildHomeWorkflowDigest;
```

If `functions/ross.js` uses ES modules (check the top of the file — `import` vs `require`), change `module.exports.buildHomeWorkflowDigest = ...` to `export { buildHomeWorkflowDigest }` and adjust the test import accordingly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/buildHomeWorkflowDigest.test.js`
Expected: 16 tests PASS.

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/ross-home-active-run-surfacing add tests/unit/buildHomeWorkflowDigest.test.js functions/ross.js
git -C .worktrees/ross-home-active-run-surfacing commit -m "feat(ross): pure helper buildHomeWorkflowDigest for home digest"
```

---

## Task 2: Server CF — `rossGetHomeWorkflowDigest`

**Files:**
- Modify: `functions/ross.js` (add CF handler that wraps the helper)
- Modify: `functions/index.js` (export the new CF)

- [ ] **Step 1: Locate the auth helper used by `rossGetWorkflows`**

Run `grep -nE "exports\.rossGetWorkflows\s*=" functions/ross.js` to find the existing handler. Read 30 lines starting at that match to confirm:
- whether it uses `onCall((request) => ...)` (Gen 2) or `onCall((data, context) => ...)` (Gen 1)
- which auth helper it calls (`verifyAdmin`, `verifyUserOrAdmin`, etc.)
- whether the response wraps in `{ success: true, ... }` directly or returns `{ result: { ... } }`

Use the same patterns for `rossGetHomeWorkflowDigest`.

- [ ] **Step 2: Add the CF handler at the end of `functions/ross.js`**

Insert at the end of the file (before the final `module.exports = {...}` if there is one). Replace `verifyAdmin` and `onCall` import names with whatever pattern matches the rest of the file.

```js
// =====================================================================
//  rossGetHomeWorkflowDigest — concierge home active-run surfacing
// =====================================================================

exports.rossGetHomeWorkflowDigest = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  // If verifyAdmin is required, call it here per the pattern used by
  // rossGetWorkflows. Most read-side ROSS CFs do.
  await verifyAdmin(auth.uid);

  const uid = auth.uid;
  const clientToday = (request.data && typeof request.data.clientToday === 'string')
    ? request.data.clientToday
    : null;

  const db = admin.database();
  const [workflowsSnap, runsSnap] = await Promise.all([
    db.ref(`ross/workflows/${uid}`).get(),
    db.ref(`ross/runs/${uid}`).get(),
  ]);

  console.log(`[rossGetHomeWorkflowDigest] uid=${uid} clientToday=${clientToday || '<utc>'}`);

  const digest = buildHomeWorkflowDigest({
    workflows: workflowsSnap.exists() ? workflowsSnap.val() : {},
    runs: runsSnap.exists() ? runsSnap.val() : {},
    clientToday,
    now: Date.now(),
  });

  return { success: true, ...digest };
});
```

**IMPORTANT:** Match the existing file's import names exactly. If `functions/ross.js` uses `const { onCall, HttpsError } = require('firebase-functions/v2/https')`, those names are correct. If it does `firebase-functions.https.onCall`, adapt. If it has `const verifyAdmin = require('./auth-helpers').verifyAdmin`, that's fine. Read the imports at the top of the file before pasting.

- [ ] **Step 3: Export the CF from `functions/index.js`**

Find the line in `functions/index.js` that re-exports ROSS callables. It will look something like:

```js
exports.rossGetWorkflows = require('./ross').rossGetWorkflows;
```

Or it might be a bulk re-export. Match the pattern. Add the line:

```js
exports.rossGetHomeWorkflowDigest = require('./ross').rossGetHomeWorkflowDigest;
```

- [ ] **Step 4: Verify the file still loads without syntax errors**

Run from worktree root: `node -e "require('./functions/ross.js'); console.log('OK')"` and `node -e "require('./functions/index.js'); console.log('OK')"`.
Expected: `OK` from both.

If you get a `Cannot find module 'firebase-functions'` error, run `cd functions && npm install` first.

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/ross-home-active-run-surfacing add functions/ross.js functions/index.js
git -C .worktrees/ross-home-active-run-surfacing commit -m "feat(ross): rossGetHomeWorkflowDigest CF wrapping the digest helper"
```

---

## Task 3: Deploy the CF to production

Per validated 2026-05-01 LESSON: deploy CFs BEFORE merging client code so there's never a window where the client expects new endpoints that don't exist.

- [ ] **Step 1: Verify functions/node_modules is current**

Run from worktree root: `ls functions/node_modules/firebase-functions/package.json`.
If missing, run `cd functions && npm install` (≈53s). Per 2026-05-12 LESSON: worktrees don't inherit functions/node_modules.

- [ ] **Step 2: Surface deploy intent to operator and request authorization**

The CF deploy modifies production state and is outside auto-mode's default scope. Output to the operator:

> "Ready to deploy `rossGetHomeWorkflowDigest` from the worktree. This is a NEW CF — read-only, no schema changes, no migration. The client wiring (Tasks 4+) depends on it existing in prod. Approve to proceed."

Wait for explicit operator approval. Do not deploy without it.

- [ ] **Step 3: Deploy the CF**

```bash
firebase deploy --only functions:rossGetHomeWorkflowDigest
```

Expected output ends with: `+  functions: Finished running predeploy script.` and `Deploy complete!`.

- [ ] **Step 4: Verify deploy with sentinel log line**

Per 2026-05-15 LESSON, exit-code 0 + hash change is not enough. Confirm the NEW code is actually serving traffic by checking logs for a string unique to the new code:

```bash
firebase functions:log --only rossGetHomeWorkflowDigest -n 20
```

Expected: at least one log line containing `[rossGetHomeWorkflowDigest] uid=` (the sentinel string from the CF body). Since no client calls it yet, this may show no entries on first attempt — that's fine, but log them once client code lands in later tasks.

Note in your reflect notes: deploy confirmed, sentinel grep pending until client call.

- [ ] **Step 5: Commit (no code change, just a marker)**

No commit needed — this task is purely a deploy step.

---

## Task 4: Client utility — `relTime(ms)`

**Files:**
- Create: `public/js/modules/ross/v2/utils/rel-time.js`
- Create: `tests/unit/ross-rel-time.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ross-rel-time.test.js`:

```js
import { describe, test, expect } from 'vitest'
import { relTime } from '../../public/js/modules/ross/v2/utils/rel-time.js'

const now = Date.parse('2026-05-19T12:00:00Z')

describe('relTime', () => {
  test('less than a minute → "just now"', () => {
    expect(relTime(now - 30_000, now)).toBe('just now')
  })
  test('3 minutes ago → "3 min ago"', () => {
    expect(relTime(now - 3 * 60_000, now)).toBe('3 min ago')
  })
  test('1 hour ago → "1 hour ago" (singular)', () => {
    expect(relTime(now - 60 * 60_000, now)).toBe('1 hour ago')
  })
  test('2 hours ago → "2 hours ago" (plural)', () => {
    expect(relTime(now - 2 * 60 * 60_000, now)).toBe('2 hours ago')
  })
  test('24-30 hours ago → "yesterday"', () => {
    expect(relTime(now - 25 * 60 * 60_000, now)).toBe('yesterday')
  })
  test('3 days ago → "3 days ago"', () => {
    expect(relTime(now - 3 * 24 * 60 * 60_000, now)).toBe('3 days ago')
  })
  test('30 days ago → ISO date', () => {
    const result = relTime(now - 30 * 24 * 60 * 60_000, now)
    expect(result).toMatch(/^on \d{4}-\d{2}-\d{2}$/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/ross-rel-time.test.js`
Expected: all FAIL with import error.

- [ ] **Step 3: Implement `relTime`**

Create `public/js/modules/ross/v2/utils/rel-time.js`:

```js
// Pure relative-time formatter for Ross home cards.
//
// relTime(timestampMs, nowMs?) returns a short human-readable phrase
// describing how long ago `timestampMs` was, relative to `nowMs`
// (defaults to Date.now()). Examples:
//   < 60s        → "just now"
//   < 1h         → "5 min ago"
//   < 24h        → "3 hours ago" / "1 hour ago"
//   24-48h       → "yesterday"
//   < 7d         → "5 days ago"
//   else         → "on YYYY-MM-DD"
//
// Pure, no timezone handling (the ISO date fallback uses UTC slice — the
// home card target is recent events, so the fallback rarely fires).

const MIN_MS = 60_000
const HOUR_MS = 60 * MIN_MS
const DAY_MS = 24 * HOUR_MS

export function relTime(timestampMs, nowMs = Date.now()) {
  const elapsed = Math.max(0, nowMs - Number(timestampMs))
  if (elapsed < MIN_MS) return 'just now'
  if (elapsed < HOUR_MS) {
    const n = Math.floor(elapsed / MIN_MS)
    return `${n} min ago`
  }
  if (elapsed < DAY_MS) {
    const n = Math.floor(elapsed / HOUR_MS)
    return `${n} hour${n === 1 ? '' : 's'} ago`
  }
  if (elapsed < 2 * DAY_MS) return 'yesterday'
  if (elapsed < 7 * DAY_MS) {
    const n = Math.floor(elapsed / DAY_MS)
    return `${n} days ago`
  }
  return `on ${new Date(timestampMs).toISOString().slice(0, 10)}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/ross-rel-time.test.js`
Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/ross-home-active-run-surfacing add tests/unit/ross-rel-time.test.js public/js/modules/ross/v2/utils/rel-time.js
git -C .worktrees/ross-home-active-run-surfacing commit -m "feat(ross-v2): relTime formatter for home card timestamps"
```

---

## Task 5: Client service wrapper — `getHomeWorkflowDigest()`

**Files:**
- Modify: `public/js/modules/ross/v2/ross-service.js` (add new exported function)

- [ ] **Step 1: Add the wrapper at the bottom of `ross-service.js`**

Open `public/js/modules/ross/v2/ross-service.js`. Find `snoozeCard` (around line 55) — the new wrapper follows the same pattern. Add after `snoozeCard` definition:

```js
/**
 * Fetch the home workflow digest from rossGetHomeWorkflowDigest CF.
 * Server returns { success, hasActiveWorkflows, activeWorkflowCount,
 * upcoming, overdue, today, recentCompletions, generatedAt }.
 *
 * Throws on auth failure or network error — caller (detectActiveWorkflows)
 * wraps in try/catch + returns null for graceful card-fallback.
 */
export async function getHomeWorkflowDigest() {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  const idToken = await user.getIdToken()

  // Client-local date in SA timezone — server uses it for "today" boundaries.
  const clientToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  const res = await fetch(`${FUNCTIONS_BASE_URL}/rossGetHomeWorkflowDigest`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ data: { clientToday } }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`rossGetHomeWorkflowDigest failed (${res.status}): ${text}`)
  }
  const json = await res.json()
  return json.result || json
}
```

- [ ] **Step 2: Sanity check — no syntax error**

Run from worktree root: `node --check public/js/modules/ross/v2/ross-service.js`.
Expected: no output (file is valid).

- [ ] **Step 3: Commit**

```bash
git -C .worktrees/ross-home-active-run-surfacing add public/js/modules/ross/v2/ross-service.js
git -C .worktrees/ross-home-active-run-surfacing commit -m "feat(ross-v2): getHomeWorkflowDigest service wrapper"
```

---

## Task 6: Client constants — `LEARNING_MODE_WORKFLOW_CARD`

**Files:**
- Modify: `public/js/modules/ross/v2/content.js` (add new exported card constant)

- [ ] **Step 1: Add the constant at the end of `content.js`**

Open `public/js/modules/ross/v2/content.js`. Add at the end, before any existing trailing exports or after `ROSS_SUGGESTIONS`:

```js
// Slot-1 fallback card when the user has NO active workflows at all
// (rossGetHomeWorkflowDigest returns hasActiveWorkflows: false).
// Distinct from the "all clear" variant E, which fires when the user
// HAS workflows but none are pressing today.
export const LEARNING_MODE_WORKFLOW_CARD = {
  id: 'learning-workflow',
  tone: 'default',
  eyebrow: 'Your playbook · empty',
  chip: { tone: 'default', label: 'Playbook', icon: 'check' },
  headline: 'Your playbook is empty.',
  detail:
    'Activate a starter template — Daily Opening Checklist is the most ' +
    'common starting point.',
  actions: [
    { id: 'open-playbook', label: 'Activate a template', variant: 'solid',
      trailing: 'arrow', href: '/ross.html?tab=playbook' },
    { id: 'snooze', label: 'Hide for a day', variant: 'ghost' },
  ],
  footnote: 'No active workflows yet',
  sidecar: {
    kind: 'kpi-spark',
    eyebrow: 'Workflows',
    value: '—',
    unit: '',
    target: 'none active',
    trend: [0, 0, 0, 0, 0, 0, 0],
    color: 'var(--hf-muted)',
  },
}
```

- [ ] **Step 2: Verify no syntax error**

Run: `node --check public/js/modules/ross/v2/content.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git -C .worktrees/ross-home-active-run-surfacing add public/js/modules/ross/v2/content.js
git -C .worktrees/ross-home-active-run-surfacing commit -m "feat(ross-v2): LEARNING_MODE_WORKFLOW_CARD slot-1 fallback"
```

---

## Task 7: Client detector — `detectActiveWorkflows`

**Files:**
- Modify: `public/js/modules/ross/v2/detectors.js` (add new exported function + private variant builders)
- Create: `tests/unit/ross-detect-active-workflows.test.js`

This is the biggest task — 5 variant builders + priority logic. TDD: tests first.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ross-detect-active-workflows.test.js`:

```js
import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock the service module BEFORE importing detectActiveWorkflows.
vi.mock('../../public/js/modules/ross/v2/ross-service.js', () => ({
  getHomeWorkflowDigest: vi.fn(),
}))

import { detectActiveWorkflows } from '../../public/js/modules/ross/v2/detectors.js'
import { getHomeWorkflowDigest } from '../../public/js/modules/ross/v2/ross-service.js'

const baseCtx = { uid: 'u1', locationIds: ['locA'], locations: { locA: 'Ocean Club' }, now: Date.parse('2026-05-19T12:00:00Z') }

function digest(overrides = {}) {
  return {
    success: true,
    hasActiveWorkflows: false,
    activeWorkflowCount: 0,
    upcoming: null,
    overdue: [],
    today: [],
    recentCompletions: [],
    generatedAt: baseCtx.now,
    ...overrides,
  }
}

beforeEach(() => {
  getHomeWorkflowDigest.mockReset()
})

describe('detectActiveWorkflows priority + variants', () => {
  test('overdue → variant A card (tone warn, chip Overdue, run href)', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      overdue: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'Daily Opening', locationName: 'Ocean Club',
        nextDueDate: '2026-05-18', daysLate: 1, requiredTaskCount: 7,
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card).toBeTruthy()
    expect(card.id).toBe('workflow:w1:locA')
    expect(card.tone).toBe('warn')
    expect(card.chip.label).toBe('Overdue')
    const runAction = card.actions.find(a => a.id === 'run-workflow')
    expect(runAction.href).toBe('/ross.html?tab=run&w=w1&l=locA')
    expect(card.headline).toContain('Daily Opening')
    expect(card.headline).toContain('Ocean Club')
    expect(card.headline).toContain('1 day late')
  })

  test('overdue plural daysLate → "days late"', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      overdue: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'X', locationName: 'A',
        nextDueDate: '2026-05-15', daysLate: 4, requiredTaskCount: 3,
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.headline).toContain('4 days late')
  })

  test('overdue plural (3 overdue) → aggSuffix + footnote', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 3,
      overdue: [
        { workflowId: 'w1', locationId: 'locA', name: 'A', locationName: 'X', nextDueDate: '2026-05-15', daysLate: 4, requiredTaskCount: 3 },
        { workflowId: 'w2', locationId: 'locB', name: 'B', locationName: 'Y', nextDueDate: '2026-05-17', daysLate: 2, requiredTaskCount: 1 },
        { workflowId: 'w3', locationId: 'locC', name: 'C', locationName: 'Z', nextDueDate: '2026-05-18', daysLate: 1, requiredTaskCount: 2 },
      ],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.detail).toContain('And 2 more')
    expect(card.footnote).toBe('3 workflows overdue')
  })

  test('today/in_progress → variant B (donut, Resume run)', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      today: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'Daily Opening', locationName: 'Ocean Club',
        nextDueDate: '2026-05-19',
        subState: 'in_progress',
        runId: 'r1', startedAt: baseCtx.now - 3_600_000,
        completedTaskCount: 3, requiredTaskCount: 7,
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('In progress')
    expect(card.sidecar.kind).toBe('donut')
    expect(card.sidecar.value).toBeCloseTo(3 / 7, 5)
    expect(card.sidecar.sub).toBe('3/7')
    const runAction = card.actions.find(a => a.id === 'run-workflow')
    expect(runAction.label).toBe('Resume run')
  })

  test('today/pending → variant C (kpi-spark, Start run)', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      today: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'Daily Opening', locationName: 'Ocean Club',
        nextDueDate: '2026-05-19',
        subState: 'pending', requiredTaskCount: 7,
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('Due today')
    expect(card.sidecar.kind).toBe('kpi-spark')
    expect(card.sidecar.value).toBe(7)
    const runAction = card.actions.find(a => a.id === 'run-workflow')
    expect(runAction.label).toBe('Start run')
  })

  test('recentCompletions 0 flagged → variant D good', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      recentCompletions: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'Daily Opening', locationName: 'Ocean Club',
        runId: 'r1', completedAt: baseCtx.now - 3_600_000,
        onTime: true, flaggedCount: 0, nextDueDate: '2026-05-20',
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.tone).toBe('good')
    expect(card.chip.label).toBe('Just completed')
    expect(card.actions.find(a => a.id === 'see-report').href).toBe('/ross.html?tab=activity')
  })

  test('recentCompletions with flaggedCount > 0 → variant D warn', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      recentCompletions: [{
        workflowId: 'w1', locationId: 'locA',
        name: 'X', locationName: 'Y',
        runId: 'r1', completedAt: baseCtx.now - 3_600_000,
        onTime: true, flaggedCount: 2, nextDueDate: '2026-05-20',
      }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.tone).toBe('warn')
    expect(card.chip.label).toBe('Completed with flags')
    expect(card.detail).toContain('2 responses flagged')
  })

  test('all-clear → variant E (chip All clear, footnote count)', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 3,
      upcoming: {
        workflowId: 'w1', locationId: 'locA',
        name: 'Daily Opening', locationName: 'Ocean Club',
        nextDueDate: '2026-05-20',
      },
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('All clear')
    expect(card.tone).toBe('good')
    expect(card.footnote).toContain('3 workflows running')
    expect(card.detail).toContain('2026-05-20')
  })

  test('no workflows at all → returns null', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: false,
      activeWorkflowCount: 0,
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card).toBeNull()
  })

  test('CF throws → returns null (no exception propagation)', async () => {
    getHomeWorkflowDigest.mockRejectedValue(new Error('network down'))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card).toBeNull()
  })

  test('priority: overdue beats today + recent', async () => {
    getHomeWorkflowDigest.mockResolvedValue(digest({
      hasActiveWorkflows: true,
      activeWorkflowCount: 1,
      overdue: [{ workflowId: 'w1', locationId: 'locA', name: 'A', locationName: 'X', nextDueDate: '2026-05-18', daysLate: 1, requiredTaskCount: 1 }],
      today: [{ workflowId: 'w2', locationId: 'locB', name: 'B', locationName: 'Y', nextDueDate: '2026-05-19', subState: 'pending', requiredTaskCount: 1 }],
      recentCompletions: [{ workflowId: 'w3', locationId: 'locC', name: 'C', locationName: 'Z', runId: 'r9', completedAt: baseCtx.now - 1000, onTime: true, flaggedCount: 0, nextDueDate: '2026-05-20' }],
    }))
    const card = await detectActiveWorkflows(baseCtx)
    expect(card.chip.label).toBe('Overdue')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/ross-detect-active-workflows.test.js`
Expected: all FAIL — `detectActiveWorkflows is not a function` or similar.

- [ ] **Step 3: Implement `detectActiveWorkflows` in `detectors.js`**

Open `public/js/modules/ross/v2/detectors.js`. Add at the bottom (after `buildHeadline`):

```js
// ---------- Card 0: Active workflows (slot 1 — workflow card variants) ----------

import { getHomeWorkflowDigest } from './ross-service.js'
import { relTime } from './utils/rel-time.js'

function _buildOverdueCard(entry, allOverdue) {
  const overdueCount = allOverdue.length
  const daysLateLabel = `${entry.daysLate} day${entry.daysLate === 1 ? '' : 's'} late`
  const aggSuffix = overdueCount > 1
    ? ` And ${overdueCount - 1} more venue${overdueCount - 1 === 1 ? '' : 's'} overdue.`
    : ''
  return {
    id: `workflow:${entry.workflowId}:${entry.locationId}`,
    tone: 'warn',
    eyebrow: `${entry.locationName} · ${daysLateLabel}`,
    chip: { tone: 'warn', label: 'Overdue' },
    headline: `${entry.name} is overdue at ${entry.locationName} (${daysLateLabel}).`,
    detail: `${entry.requiredTaskCount} task${entry.requiredTaskCount === 1 ? '' : 's'} pending. Start now to catch up.${aggSuffix}`,
    actions: [
      { id: 'run-workflow', label: 'Start now', variant: 'solid', trailing: 'arrow',
        href: `/ross.html?tab=run&w=${entry.workflowId}&l=${entry.locationId}` },
      { id: 'view-workflow', label: 'View workflow', variant: 'ghost',
        href: '/ross.html?tab=playbook' },
      { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
    ],
    footnote: overdueCount > 1 ? `${overdueCount} workflows overdue` : undefined,
    sidecar: {
      kind: 'kpi-spark', eyebrow: 'Days late',
      value: entry.daysLate, unit: 'd',
      target: 'target: 0 overdue',
      trend: [0, 0, 0, 0, 0, 0, entry.daysLate],
      color: 'var(--hf-warn)',
    },
    _meta: { contextLine: `${entry.name} is ${entry.daysLate} day${entry.daysLate === 1 ? '' : 's'} overdue at ${entry.locationName}.` },
  }
}

function _buildInProgressCard(entry, allToday) {
  const pending = Math.max(0, entry.requiredTaskCount - entry.completedTaskCount)
  const total = entry.requiredTaskCount
  const pct = total > 0 ? Math.round((entry.completedTaskCount / total) * 100) : 0
  const otherTodayCount = Math.max(0, allToday.length - 1)
  const aggSuffix = otherTodayCount > 0
    ? ` Plus ${otherTodayCount} other workflow${otherTodayCount === 1 ? '' : 's'} due today.`
    : ''
  return {
    id: `workflow:${entry.workflowId}:${entry.locationId}`,
    tone: 'default',
    chip: { tone: 'default', label: 'In progress', icon: 'sparkle' },
    eyebrow: `${entry.locationName} · started ${relTime(entry.startedAt)}`,
    headline: `${entry.name} is half-done — ${pending} of ${total} tasks pending.`,
    detail: `Resume to keep on track today.${aggSuffix}`,
    actions: [
      { id: 'run-workflow', label: 'Resume run', variant: 'solid', trailing: 'arrow',
        href: `/ross.html?tab=run&w=${entry.workflowId}&l=${entry.locationId}` },
      { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
    ],
    sidecar: {
      kind: 'donut',
      value: total > 0 ? entry.completedTaskCount / total : 0,
      label: `${pct}%`,
      sub: `${entry.completedTaskCount}/${total}`,
      color: 'var(--hf-accent)',
    },
    _meta: { contextLine: `${entry.name} run in progress at ${entry.locationName}.` },
  }
}

function _buildPendingTodayCard(entry, allToday) {
  const otherTodayCount = Math.max(0, allToday.length - 1)
  const aggSuffix = otherTodayCount > 0
    ? ` Plus ${otherTodayCount} other workflow${otherTodayCount === 1 ? '' : 's'} due today.`
    : ''
  return {
    id: `workflow:${entry.workflowId}:${entry.locationId}`,
    tone: 'default',
    chip: { tone: 'default', label: 'Due today', icon: 'cal' },
    eyebrow: `${entry.locationName} · ${entry.requiredTaskCount} task${entry.requiredTaskCount === 1 ? '' : 's'}`,
    headline: `${entry.name} is due today at ${entry.locationName}.`,
    detail: `${entry.requiredTaskCount} task${entry.requiredTaskCount === 1 ? '' : 's'} to run.${aggSuffix}`,
    actions: [
      { id: 'run-workflow', label: 'Start run', variant: 'solid', trailing: 'arrow',
        href: `/ross.html?tab=run&w=${entry.workflowId}&l=${entry.locationId}` },
      { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
    ],
    sidecar: {
      kind: 'kpi-spark', eyebrow: 'Tasks',
      value: entry.requiredTaskCount, unit: '',
      target: 'due today',
      trend: Array(7).fill(entry.requiredTaskCount),
      color: 'var(--hf-accent)',
    },
    _meta: { contextLine: `${entry.name} due today at ${entry.locationName}.` },
  }
}

function _buildRecentCompletionCard(entry) {
  const flagged = Number(entry.flaggedCount) || 0
  const tone = flagged > 0 ? 'warn' : 'good'
  const chipLabel = flagged > 0 ? 'Completed with flags' : 'Just completed'
  const chipIcon = flagged > 0 ? 'alert' : 'check'
  const flaggedSuffix = flagged > 0
    ? ` ${flagged} response${flagged === 1 ? '' : 's'} flagged for review.`
    : ''
  return {
    id: `workflow:${entry.workflowId}:${entry.locationId}`,
    tone,
    chip: { tone, label: chipLabel, icon: chipIcon },
    eyebrow: `${entry.locationName} · completed ${relTime(entry.completedAt)}`,
    headline: `${entry.name} completed ${relTime(entry.completedAt)}.`,
    detail: `${entry.onTime ? 'On time.' : 'Completed late.'}${flaggedSuffix}`,
    actions: [
      { id: 'see-report', label: 'See report', variant: 'solid', trailing: 'arrow',
        href: '/ross.html?tab=activity' },
      { id: 'snooze', label: 'Hide', variant: 'ghost' },
    ],
    sidecar: {
      kind: 'donut', value: 1, label: '100%', sub: 'complete',
      color: flagged > 0 ? 'var(--hf-warn)' : 'var(--hf-good)',
    },
    _meta: { contextLine: `${entry.name} completed ${relTime(entry.completedAt)} at ${entry.locationName}.` },
  }
}

function _buildAllClearCard(digest) {
  const count = digest.activeWorkflowCount
  const upc = digest.upcoming
  const nextDueLabel = upc ? `on ${upc.nextDueDate} (${upc.name} at ${upc.locationName})` : 'soon'
  return {
    id: 'workflow-all-clear',
    tone: 'good',
    eyebrow: 'Your playbook · all clear',
    chip: { tone: 'good', label: 'All clear', icon: 'check' },
    headline: 'Nothing pressing right now.',
    detail: `Your active workflows are on schedule. Next run is ${nextDueLabel}.`,
    actions: [
      { id: 'view-playbook', label: 'View playbook', variant: 'ghost', trailing: 'arrow',
        href: '/ross.html?tab=playbook' },
      { id: 'snooze', label: 'Hide for a day', variant: 'ghost' },
    ],
    footnote: `${count} workflow${count === 1 ? '' : 's'} running`,
    sidecar: {
      kind: 'kpi-spark', eyebrow: 'On schedule',
      value: count, unit: '',
      target: 'all on track',
      trend: [1, 1, 1, 1, 1, 1, 1],
      color: 'var(--hf-good)',
    },
    _meta: { contextLine: `${count} active workflows on schedule.` },
  }
}

export async function detectActiveWorkflows(ctx) {
  if (!ctx?.uid) return null
  let digest
  try {
    digest = await getHomeWorkflowDigest()
  } catch (e) {
    console.warn('[ross] active-workflows detector failed', e)
    return null
  }

  try {
    if (digest.overdue && digest.overdue.length > 0) {
      return _buildOverdueCard(digest.overdue[0], digest.overdue)
    }
    if (digest.today && digest.today.length > 0) {
      const first = digest.today[0]
      if (first.subState === 'in_progress') {
        return _buildInProgressCard(first, digest.today)
      }
      return _buildPendingTodayCard(first, digest.today)
    }
    if (digest.recentCompletions && digest.recentCompletions.length > 0) {
      return _buildRecentCompletionCard(digest.recentCompletions[0])
    }
    if (digest.hasActiveWorkflows) {
      return _buildAllClearCard(digest)
    }
    return null
  } catch (e) {
    console.warn('[ross] active-workflows card builder threw', e)
    return null
  }
}
```

**Note:** the `import` statements go at the TOP of `detectors.js`, not inline above the function. Move `import { getHomeWorkflowDigest } from './ross-service.js'` and `import { relTime } from './utils/rel-time.js'` to the existing import block at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/ross-detect-active-workflows.test.js`
Expected: 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git -C .worktrees/ross-home-active-run-surfacing add tests/unit/ross-detect-active-workflows.test.js public/js/modules/ross/v2/detectors.js
git -C .worktrees/ross-home-active-run-surfacing commit -m "feat(ross-v2): detectActiveWorkflows + 5 card variants for home slot 1"
```

---

## Task 8: Wire detector into `getHomeFeed()`

**Files:**
- Modify: `public/js/modules/ross/v2/ross-service.js` (modify `getHomeFeed` to call the new detector and slot it ahead of others; modify `padCards` fallback for slot 1)

- [ ] **Step 1: Add detector import + extend `getHomeFeed`**

Open `public/js/modules/ross/v2/ross-service.js`. In the import block at the top (around lines 28-42), add `detectActiveWorkflows`:

```js
import {
  buildContext,
  buildHeadline,
  detectActiveWorkflows,        // NEW
  detectFoodCostDrift,
  detectLapsedVIPs,
  detectRevenueTrend,
  getActiveSnoozes,
} from './detectors.js'
```

And add the LEARNING_MODE_WORKFLOW_CARD import (around lines 15-25):

```js
import {
  FINDINGS_FIRST_RUN,
  HOME_FEED,
  HOME_HEADLINE,
  QUICK_JUMPS,
  LEARNING_MODE_CARDS,
  LEARNING_MODE_WORKFLOW_CARD,    // NEW
  ASK_ROSS_SAMPLE,
  LIVE_VENUES,
  ROSS_SUGGESTIONS,
  currentDateLine,
} from './content.js'
```

- [ ] **Step 2: Update `padCards` to honor the workflow slot-1 fallback**

Find the existing `padCards` function (around lines 85-90). Replace it with:

```js
function padCards(realCards) {
  if (realCards.length >= 3) return realCards.slice(0, 3)
  const usedIds = new Set(realCards.map((c) => c.id))
  const fillers = LEARNING_MODE_CARDS.filter((c) => !usedIds.has(c.id))
  return [...realCards, ...fillers].slice(0, 3)
}

// Compose the 3-card grid. Slot 1 is reserved for the workflow card:
// if the workflow detector produced a card, it leads. If it didn't AND
// no other detectors fill slot 1 either, we slot a LEARNING_MODE_WORKFLOW_CARD
// there (rather than a generic learning card) so slot 1 always speaks
// workflow language. Slots 2-3 stay detector-driven with generic
// LEARNING_MODE_CARDS as last-resort filler.
function composeFeedCards(workflowCard, otherCards, snoozes) {
  const slot1 = (workflowCard && !snoozes.has(workflowCard.id))
    ? workflowCard
    : (snoozes.has(LEARNING_MODE_WORKFLOW_CARD.id) ? null : LEARNING_MODE_WORKFLOW_CARD)

  const remaining = otherCards.filter((c) => c && !snoozes.has(c.id))
  const head = slot1 ? [slot1] : []
  return padCards([...head, ...remaining])
}
```

- [ ] **Step 3: Update `getHomeFeed` to call the workflow detector**

Find the existing `getHomeFeed` function (around lines 96-127). Replace its body with:

```js
export async function getHomeFeed() {
  if (!isEnabled('ROSS_HOME_REAL_DATA')) {
    await wait()
    return scriptedFeed()
  }

  try {
    const ctx = await buildContext(auth)
    if (!ctx.uid) return scriptedFeed()

    const [workflow, fc, vip, rev, snoozes] = await Promise.all([
      detectActiveWorkflows(ctx).catch((e) => { console.warn('[ross] active-workflows detector failed', e); return null }),
      detectFoodCostDrift(ctx).catch((e) => { console.warn('[ross] food-cost detector failed', e); return null }),
      detectLapsedVIPs(ctx).catch((e) => { console.warn('[ross] lapsed-VIPs detector failed', e); return null }),
      detectRevenueTrend(ctx).catch((e) => { console.warn('[ross] revenue detector failed', e); return null }),
      getActiveSnoozes(ctx).catch((e) => { console.warn('[ross] snoozes read failed', e); return new Set() }),
    ])

    const otherCards = [fc, vip, rev]
    const cards = composeFeedCards(workflow, otherCards, snoozes)
    const realCardsForHeadline = [workflow, fc, vip, rev].filter((c) => c && !snoozes.has(c.id))

    return {
      headline: buildHeadline(ctx, realCardsForHeadline),
      dateLine: currentDateLine(),
      cards,
      quickJumps: QUICK_JUMPS,
    }
  } catch (e) {
    console.error('[ross] getHomeFeed failed, falling back to scripted feed', e)
    return scriptedFeed()
  }
}
```

- [ ] **Step 4: Verify no syntax errors**

Run: `node --check public/js/modules/ross/v2/ross-service.js`
Expected: no output.

- [ ] **Step 5: Run all ross tests**

Run: `npm test -- tests/unit/ross-`
Expected: all PASS (no regressions in detector / rel-time / digest tests).

- [ ] **Step 6: Commit**

```bash
git -C .worktrees/ross-home-active-run-surfacing add public/js/modules/ross/v2/ross-service.js
git -C .worktrees/ross-home-active-run-surfacing commit -m "feat(ross-v2): wire active-workflows detector into getHomeFeed slot 1"
```

---

## Task 9: Reconcile URL param scheme with `RossRun.vue`

The variant builders all link to `/ross.html?tab=run&w=<workflowId>&l=<locationId>`. The pre-flight check in Task 0 surfaced what `RossRun.vue` actually reads. This task makes them match.

- [ ] **Step 1: Locate the URL param reader in `RossRun.vue`**

```bash
grep -nE "(URLSearchParams|searchParams|params\.(workflowId|locationId|w|l)|\?.tab=run)" public/js/modules/ross/v2/components/RossRun.vue
```

Read the surrounding 20 lines around any match. Note the literal query param keys it expects (e.g. `workflowId` + `locationId`, or `w` + `l`, or something else).

- [ ] **Step 2: If RossRun.vue reads `w` and `l` → no change needed.**

Skip to Step 4.

- [ ] **Step 3: If RossRun.vue reads different params (e.g. `workflowId` and `locationId`) → update the variant builders**

In `public/js/modules/ross/v2/detectors.js`, replace all four occurrences of:

```js
href: `/ross.html?tab=run&w=${entry.workflowId}&l=${entry.locationId}`,
```

with the literal param names RossRun.vue reads. Then update the matching test assertion in `tests/unit/ross-detect-active-workflows.test.js`:

```js
expect(runAction.href).toBe('/ross.html?tab=run&w=w1&l=locA')
```

— change `w=w1&l=locA` to match the new scheme.

- [ ] **Step 4: Run the detector tests again**

Run: `npm test -- tests/unit/ross-detect-active-workflows.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit only if changes were made**

```bash
# Only if the param scheme differed and you made edits:
git -C .worktrees/ross-home-active-run-surfacing add public/js/modules/ross/v2/detectors.js tests/unit/ross-detect-active-workflows.test.js
git -C .worktrees/ross-home-active-run-surfacing commit -m "fix(ross-v2): align home card run href to RossRun.vue param scheme"
```

---

## Task 10: KB documentation

**Files:**
- Modify: `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md`
- Modify: `public/kb/features/ROSS.md`

- [ ] **Step 1: Add CF entry to CLOUD_FUNCTIONS_CATALOG.md**

Find the existing ROSS CF table in `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md` (if there is one — per backlog item #12, ROSS CFs may not yet be catalogued; if missing, add a new "ROSS Functions" section).

Add row:

```markdown
| `rossGetHomeWorkflowDigest` | `verifyAdmin` | Returns the concierge home active-run digest: `{ hasActiveWorkflows, activeWorkflowCount, upcoming, overdue[], today[], recentCompletions[], generatedAt }`. Read-only. Optional body param `clientToday` (ISO date in caller's local TZ) used for "today" boundary; falls back to UTC date if missing. |
```

- [ ] **Step 2: Add short section to ROSS.md**

In `public/kb/features/ROSS.md`, find the "Frontend Vue Module" section. Add a sub-section at the end:

```markdown
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

Scope note: server reads `ross/workflows/{callerUid}` — owner-only view.
Shared-location-admin case is backlog follow-up.
```

- [ ] **Step 3: Commit**

```bash
git -C .worktrees/ross-home-active-run-surfacing add "KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md" public/kb/features/ROSS.md
git -C .worktrees/ross-home-active-run-surfacing commit -m "docs(ross): catalog rossGetHomeWorkflowDigest + home active-run surfacing"
```

---

## Task 11: Build verification

- [ ] **Step 1: Run the production build**

From the worktree root:

```bash
npm run build
```

Expected: build completes without error, `dist/` contains updated assets. Watch for the user-dashboard entry compile + any Vue/Vite warnings — none should be fatal.

If the build fails, fix and re-run. Common failure modes:
- Missing import path → check that `utils/rel-time.js` and the new `LEARNING_MODE_WORKFLOW_CARD` export are spelled correctly
- Vite couldn't resolve a relative path → confirm the test file imports use `.js` extensions explicitly

- [ ] **Step 2: Confirm asset hash changed**

Run: `ls dist/assets/ | grep -E "ross-home|user-dashboard" | head -5`
Note the new file hashes; they should differ from any prior build (per the 2026-05-11 worktree-edit-tracker LESSON).

- [ ] **Step 3: Run the full test suite to catch regressions**

```bash
npm test
```

Expected: all PASS. If any pre-existing test fails on master too, note it but don't block on it (out of scope).

- [ ] **Step 4: Commit only if there are leftover changes (e.g. lockfile)**

```bash
git -C .worktrees/ross-home-active-run-surfacing status --short
# If anything is reported, add + commit as 'chore: build artifacts'.
# Usually nothing — npm run build writes to dist/ which is .gitignored.
```

---

## Task 12: Push branch + open PR

- [ ] **Step 1: Push the branch**

```bash
git -C .worktrees/ross-home-active-run-surfacing push -u origin feature/ross-home-active-run-surfacing
```

- [ ] **Step 2: Open the PR with a comprehensive body**

```bash
gh pr create --title "feat(ross-v2): concierge home active-run surfacing (Phase 6 PR 4)" --body "$(cat <<'EOF'
## Summary

Replaces the scripted/illustrative slot-1 card on \`/ross.html\` with a real-data card driven by the user's activated ROSS workflows. Hybrid card mix preserved: workflow card wins slot 1, food-cost/VIP/revenue detectors keep slots 2-3.

**Spec:** \`docs/plans/2026-05-19-ross-concierge-active-run-surfacing-design.md\`
**Plan:** \`docs/plans/2026-05-19-pr4-ross-concierge-active-run-surfacing-plan.md\`

## What landed

- **New CF \`rossGetHomeWorkflowDigest\`** (Admin SDK, read-only). Returns structured digest with \`overdue\`, \`today\`, \`recentCompletions\`, \`upcoming\`, \`hasActiveWorkflows\`, \`activeWorkflowCount\`.
- **Pure server helper \`buildHomeWorkflowDigest\`** (16 unit tests).
- **Client detector \`detectActiveWorkflows\`** wraps the CF, picks priority, builds card (11 unit tests).
- **5 card variants:** Overdue / In progress / Due today / Recently completed / All clear.
- **LEARNING_MODE_WORKFLOW_CARD fallback** for users with zero active workflows.
- **\`relTime\` formatter utility** (7 unit tests).
- **KB docs synced:** CLOUD_FUNCTIONS_CATALOG.md + ROSS.md.

## Test plan

- [ ] **Day-zero scenario** — fresh signup, only seeded Daily Opening Checklist with \`nextDueDate\` tomorrow → expect variant E ("All clear") in slot 1, NOT LEARNING_MODE.
- [ ] **Due today (variant C)** — flip seeded workflow's \`nextDueDate\` to today via Firebase Console → reload \`/ross.html\` → expect "Due today" card with Start run CTA.
- [ ] **In progress (variant B)** — click "Start run" → return to \`/ross.html\` → expect "In progress" card with correct task counts in donut.
- [ ] **Recently completed (variant D)** — submit all responses → return → expect "Just completed" card with 100% donut. Verify "See report" routes to \`?tab=activity\`.
- [ ] **Overdue (variant A)** — flip \`nextDueDate\` to yesterday → expect "Overdue" card with warn tone + daysLate.
- [ ] **Multi-venue aggregation** — attach workflow to a second location, flip one to yesterday → expect aggSuffix in detail line + footnote.
- [ ] **LEARNING_MODE fallback** — delete all workflows → expect "Your playbook is empty" card (only if \`hasActiveWorkflows: false\`).
- [ ] **Snooze interop** — click "Snooze 24h" on the workflow card → reload → expect next-priority signal shown (or fallback if none).
- [ ] **Build green** — \`npm run build\` succeeds.
- [ ] **CF logs** — confirm \`firebase functions:log --only rossGetHomeWorkflowDigest\` shows successful invocations from the preview channel.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Deploy to Firebase Hosting preview channel for operator review**

```bash
firebase hosting:channel:deploy ross-home-active-run-surfacing --only hosting
```

Note the preview URL in the PR comments so the operator can validate.

- [ ] **Step 4: Verify preview URL routes correctly**

Open the preview URL + `/ross.html` in a browser. Confirm slot 1 renders a workflow card (whichever variant matches your test account's current state). Open DevTools Console — look for any errors or `[ross]` warnings.

Per validated 2026-05-12 LESSON: budget for at least one operator preview round-trip. Fixes folded into the PR.

---

## Task 13: Operator preview test cycle + merge

This task is gated on operator action.

- [ ] **Step 1: Surface preview URL + test plan to operator**

Post to PR or surface in chat:

> "Preview channel deployed: <URL>. Test plan in PR body. Please walk through scenarios A-E (Day-zero, Due today, In progress, Recently completed, Overdue) and flag any visual or behavioral issues."

- [ ] **Step 2: Address any preview-driven fixes**

Per validated 2026-05-11 LESSON and 2026-05-12 LESSON, expect at least one round of preview-driven fixes. Common categories:
- Hi-Fi token names (verify against `public/css/hifi-tokens.css` per 2026-05-12 LESSON)
- Card copy adjustments
- Snooze / pending-state edge cases

Fold-in scope rule (validated): same module / same concern / small → FOLD into this PR; different module → BACKLOG.

- [ ] **Step 3: Pre-merge audit per validated 2026-05-15 LESSON**

Before asking the operator to merge:

```bash
# Re-read any automated reviews
gh pr view --json reviews --jq '.reviews[0].body' | head -100
```

For each finding, grep the current branch state and confirm YES/NO/PARTIAL with file:line evidence. Address any unresolved must-fixes.

- [ ] **Step 4: Operator merges**

Operator-driven action. Agent does not self-merge per CLAUDE.md.

- [ ] **Step 5: Post-merge cleanup**

```bash
git fetch origin
git -C .worktrees/ross-home-active-run-surfacing checkout master 2>/dev/null || true
git worktree remove .worktrees/ross-home-active-run-surfacing
git branch -d feature/ross-home-active-run-surfacing
```

(Run from main repo root, not the worktree.)

- [ ] **Step 6: Reflect cycle per CLAUDE.md Step 11**

Update the four feedback files:
- `KNOWLEDGE BASE/PROJECT_BACKLOG.md` — mark Phase 6 active-run surfacing task `[x]`, move feature to Recently Completed, log any new bugs in Bug Triage Queue, clear In Progress row.
- `KNOWLEDGE BASE/development/SELF_OPTIMIZATION.md` — any new pattern emerged or validated this PR?
- `KNOWLEDGE BASE/development/LESSONS.md` — non-obvious gotchas hit during this PR (especially anything from preview cycle).
- `KNOWLEDGE BASE/development/SCORECARD.md` — score this session on the rubric.

Report findings briefly to the user after merge: score + top lesson + any patterns promoted.

---

## Notes on plan execution

- **Per CLAUDE.md Git Workflow:** all commits go to the worktree branch via `git -C .worktrees/ross-home-active-run-surfacing ...` to avoid the block-master-commit hook (validated 2026-05-13 LESSON).
- **CF deploy from worktree:** `cd functions && npm install` is mandatory (2026-05-12 LESSON; close to validated, this would be the 3rd occurrence). Post-deploy: grep logs for sentinel string (2026-05-15 LESSON) — not just exit code 0.
- **Server-shape mocks:** every vitest mock of `getHomeWorkflowDigest` response is shaped against the server's actual `res.json({success, ...digest})` line (2026-05-13 LESSON). If mid-PR the server response shape changes, update mocks verbatim, not from memory.
- **Hi-Fi tokens:** verified in Pre-flight. If new scoped styles are added during preview-fix cycle, re-verify any new `--hf-*` tokens against `public/css/hifi-tokens.css` (2026-05-12 LESSON).
- **Auto-mode classifier:** CF deploy in Task 3 is an explicit pause point with operator authorization. The classifier may not see previous AskUserQuestion answers (2026-05-12 LESSON) — be ready to surface concisely.
