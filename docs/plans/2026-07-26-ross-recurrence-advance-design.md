# ROSS recurrence advance — nightly `nextDueDate` roll-forward

**Status:** design **v2 — BLOCKED on 4 product decisions.** Do not build v1.
**Date:** 2026-07-26
**v1 verdict:** an adversarial design review refuted the core semantic. v1 would have made the product **quieter**, and one of its load-bearing "ground truth" facts was false. Findings folded below.

---

## 1. The problem, verified

A workflow's `nextDueDate` is written once at create/activate time and **never advances**. The digest (`functions/ross.js:417`) classifies an item overdue only when:

```js
nextDueDate < today && !runCoversCurrentPeriod
// runCoversCurrentPeriod = latestRun.startedAt >= nextDueDate   (ross.js:404-406)
```

Once any run starts on or after `nextDueDate`, that is **permanently true** — the right-hand side never moves. **CONFIRMED by review:** `latestRun` is max-`startedAt` (`ross.js:302-312`) and `nextDueMs` is fixed, so `:417` becomes unreachable and `:419`/`:428` need `=== today`, which a frozen past date never satisfies. Verified live:

| Workflow | recurrence | nextDueDate | latest run startedAt | state |
|---|---|---|---|---|
| `-OuNaBBB_0M5` | monthly | 2026-06-06 | 2026-06-11 (completed) | frozen |
| `-Ouvh8HFaugo` | weekly | 2026-06-17 | 2026-06-17 (**still open**) | frozen |

**Blast radius beyond W2 — CONFIRMED.** Both workflows still set `workflowCountsAsActive` (`ross.js:389`) → `hasActiveWorkflows: true` → `detectors.js:572-573` renders the **All-clear card**. Ross's home surface tells the owner everything is fine today.

## 2. Ground truth (v1 had this WRONG — corrected)

- `nextDueDate` lives **per-location only**: `ross/workflows/{uid}/{wfId}/locations/{locId}/nextDueDate`. **CONFIRMED, census closed:** writers are `ross.js:765`, `ross-workflow-builder.js:60`, `ross.js:968`; `updateWorkflowAsOwner`'s allowlist (`ross.js:845`) can't introduce a root copy; and `database.rules.json:562-567` sets `ross/workflows/$ownerId` `.write: false`, so **there are no client-SDK writers at all**.
- ❌ **v1 CLAIMED "always an epoch-ms NUMBER". FALSE.** The evidence used (`nextDueDate + daysOffset*MS_PER_DAY`) proves nothing — JS `+` is overloaded. **Two `STATUS.READY` agent tools write a STRING:** `functions/agent/tools.js:245-269` takes `nextDueDate: z.string().optional()` and defaults via `defaultDueDate` (`tools.js:291-293`) = `new Date(now).toISOString().slice(0,10)`. Neither `createWorkflowAsOwner` nor `activateWorkflowAsOwner` coerces (`ross.js:736`, `:803` only check truthiness). Existing tests pass `'2026-06-10'` (`ross-workflow-ops.test.js:51`, `:119`), and `workflow-status.js:13-16` documents string values in the wild.
  **Live consequences of the string form, all silent:** `ross.js:1458` `(nextDueDate - now)` → `NaN` → `rossScheduledReminder` never fires; `ross.js:1326`/`:1678` `onTime` always `false`; `ross.js:1169` sort → `NaN`.
- A **third** writer with a different shape: `ross.js:968` (`rossSeedFirstWorkflow`) writes `nextDueDate: now` — a timestamp **with a time-of-day component**, not midnight.
- `recurrence` + `customInterval` at workflow root (`ross.js:778-779`); `customInterval` is `positive int | null`. `VALID_RECURRENCES` (`ross.js:41`) = `once, daily, weekly, monthly, quarterly, annually`. All CONFIRMED.
- Task `dueDate = nextDueDate + daysOffset*MS_PER_DAY` (`ross-workflow-builder.js:28`). CONFIRMED.
- Exclusion set is exactly `once` + `paused` — CONFIRMED, no end-date/archive field exists in `functions/`.

## 3. 🔴 The four decisions that block the build

### D1 — The landing rule. v1's choice defeats the entire purpose.

`functions/agent/sweep/nudge-selector.js:31-48` consumes **only** `digest.overdue` and `digest.today`. **`upcoming` is never read by the nudge.**

v1 said "land on the first occurrence ≥ today". Traced with real numbers (today = 2026-07-26): monthly → **2026-08-06**, weekly → **2026-07-29**. Both land in `upcoming` → `selectFindings` returns `null` → `sweep.js:121` returns `'silent'`. **Still silent** — for 3 and 11 more days — and meanwhile `detectors.js:520-544` renders *"Nothing pressing right now… Next run is 2026-07-29"* for a workflow that has missed two monthly cycles. That is strictly worse than today: passive silence becomes active false reassurance.

- **Option A (recommended): land on the LAST occurrence ≤ today.** Monthly → 2026-07-06 (20 days overdue), weekly → 2026-07-22 (4 days overdue). Both land in `overdue`; the nudge fires the next morning; the home card shows real work. This is the only option that satisfies the stated goal.
- **Option B:** keep skip-forward and add a `missedCycles`-driven finding kind to the selector — more code, changes the nudge contract.

### D2 — The stale open run falsifies compliance history.

`rossCreateRun` dedupes on **"any open run"**, not "a run for this period" (`ross.js:1523`, `orderByChild('completedAt').equalTo(null)`). So the weekly workflow's 2026-06-17 run is returned forever, with its June responses pre-filled. On submit, `rossSubmitResponse` writes `onTime: now <= locData.nextDueDate` (`ross.js:1678`) — against the **advanced** date. A run started for the June cycle and finished six weeks late gets stamped **`onTime: true`**.

For a compliance product that is data corruption. Options: close/abandon open runs older than the new `nextDueDate` as part of the advance; or make `onTime` compare against the run's own period; or **refuse to advance a location that has an open run** (simplest, and arguably correct — an unfinished cycle isn't finished).

### D3 — Task completion state is a build blocker, not an open question.

`rossCompleteTask` returns 404 when `task.status === 'completed'` (`ross.js:1299`, `:1311`). After a roll-forward that preserves task status, **every task in the new cycle 404s** on the v1 admin path, while the v2 run flow still works because it reads run responses. The two surfaces then disagree about whether the cycle is done. "Deliberately don't reset" is not shippable.

### D4 — Output must be UTC-midnight, not SAST-midnight.

Every existing writer produces UTC midnight (`RossPlaybookWorkflowEditor.vue:141-145` → `Date.parse('YYYY-MM-DD')`) and every reader slices UTC (`ross.js:340`). Landing on SAST midnight yields `2026-08-06T00:00+02:00` = `2026-08-05T22:00Z` → `_normalizeNextDueDate` returns **`'2026-08-05'`**, one day early — which for a daily workflow is instantly-overdue-every-day. **Restated contract: input and output are UTC-midnight epoch-ms; day/clamping arithmetic uses UTC getters.** SAST matters only for choosing "today", and at 01:00 UTC / 03:00 SAST the two agree.

## 4. Required guards before any `apply` run (v1 was below this repo's own bar)

- **Kill switch** — `ross/config/agentKillSwitch` (`constants.js:55`), honoured by the read-only sweep (`sweep.js:151-153`). A job that *mutates tenant data* must honour it.
- **Global write cap** — mirror `MAX_PRUNE_PATHS = 5000` (`prune.js:26`); v1's 1,000-iteration cap is per-record loop protection, not a write cap.
- **`prev` audit rows** — this codebase already has the primitive *for this exact operation*: `execute.js:37-43` `snapshotPrev` writes `prev: { nextDueDate }` because `advanceDueDate` is in `NO_UNDO_TOOLS` (`constants.js:42`). A log line is not a rollback record.
- **First-`apply` owner allowlist** — one `if`, turns run #1 from "every tenant" into "my own account".
- Dry-run default stays, but it only protects run #1.

## 5. Shape (unchanged — the architecture was fine)

Pure core + thin scheduled shell, mirroring `functions/agent/sweep/`. **`advance-core.js` must be the shared implementation for both this walk and the already-declared `advanceDueDate` agent tool** (`tools.js:238-239`, currently `pending`, dispatch already wired at `execute.js:38-43`) — otherwise the repo ships two divergent recurrence engines. Enumerate owners via `ross/ownerIndex`, as `rossScheduledReminder` already does (`ross.js:1442-1450`). Schedule with the **object form** `onSchedule({ schedule: '0 3 * * *', timeZone: 'Africa/Johannesburg' }, handler)` (`sweep.js:179-181`) — the 3-arg form in v1 is not a valid call and would silently run at 03:00 UTC.

## 6. Test contract

Core: every recurrence; `customInterval` precedence; `'once'` never advances; already-future no-op; **string / ISO / time-of-day / garbage `nextDueDate` inputs** (per §2); month-end clamping; UTC-midnight output; the iteration cap.

**Regression guard must assert against `selectFindings(digest)` returning non-null — NOT against the digest alone.** v1's guard checked `overdue`/`upcoming` and would have gone green on a fix that left the nudge silent. Test the symptom that was reported.

## 7. Deferred / noted

- `missedCycles` + `lastAdvancedAt` currently have **zero readers** repo-wide — either wire them into the nudge or drop the claim they're "preserved".
- Advancing shifts task `dueDate`s, which removes the June tasks from `buildAlerts`/`buildTodayTasks` (`public/js/modules/ross/index.js:1399-1469`) — the one surface still showing the missed work. Correct arithmetic, but in the direction of more silence; pairs with D1.
- Reviving `nextDueDate` also revives `rossScheduledReminder` (`ross.js:1437-1488`), so the first `apply` morning may push notifications for anything landing 30 or 7 days out.
- Cheapest adjacent repair: coerce `nextDueDate` to UTC-midnight epoch-ms in `createWorkflowAsOwner`/`activateWorkflowAsOwner` (one line each + a test), which fixes the string-write class at source.
- Location `status` is checked by `rossScheduledReminder` but **not** by the digest — if the advancer skips non-active locations it diverges from the surface it exists to feed. Latent today (`status` is only ever `'active'`).
