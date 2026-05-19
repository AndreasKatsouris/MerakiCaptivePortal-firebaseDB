# ROSS concierge home — active-run surfacing (design)

**Date:** 2026-05-19
**Sprint:** Phase 6 PR 4 (next after PR #65 Run execution UI)
**Status:** spec ready for review → writing-plans next

---

## Goal

Replace the scripted / illustrative cards on `/ross.html` slot 1 with a real-data card driven by the user's activated ROSS workflows. Surface the most pressing signal across overdue runs, today's pending tasks, in-progress runs, and recent completions.

This makes ROSS-the-playbook visible on the post-login destination for every user — aligned with the locked sprint goal ("workflows are the product").

## Non-goals

- Replacing the food-cost / VIP / revenue detector cards (they keep slots 2-3).
- Right-rail "Ross suggests" workflow integration (separate slice, its own detectors).
- Shared-location-admin home view (caller-owned workflows only this PR; backlog follow-up).
- LLM / askRoss integration (Phase 7 sprint).
- Granular per-task surfacing — the home card is workflow-level.

## Decisions locked in brainstorming

| Question | Decision |
|---|---|
| Card mix vs existing detectors | Hybrid: slot 1 = workflow card; slots 2-3 = detector cards (food-cost / VIP / revenue) |
| Overdue semantics | `nextDueDate` < clientToday AND no run started ≥ nextDueDate |
| Card priority within workflow signal | Overdue → today/in-progress → today/pending → recent-completion (last 24h) → none (fallback) |
| Read strategy | New dedicated CF `rossGetHomeWorkflowDigest` (not direct RTDB read) |
| Return shape | Structured digest; client builds the card shape |

## Architecture

```
RossHome.vue mounted
  → store.loadHome()
    → getHomeFeed() [ross-service.js]
        → buildContext(auth)
        → Promise.all([
            detectActiveWorkflows(ctx),   // NEW — calls rossGetHomeWorkflowDigest CF
            detectFoodCostDrift(ctx),
            detectLapsedVIPs(ctx),
            detectRevenueTrend(ctx),
            getActiveSnoozes(ctx),
          ])
        → realCards = [workflow, ...others].filter(c => c && !snoozed.has(c.id))
        → padCards(realCards)
            slot 1 fallback: LEARNING_MODE_WORKFLOW_CARD (NEW)
            slots 2-3 fallback: LEARNING_MODE_CARDS (existing)
```

## Files touched

### Server

| File | Change |
|---|---|
| `functions/ross.js` | + `rossGetHomeWorkflowDigest` CF (~50 LOC handler) + `buildHomeWorkflowDigest({ workflows, runs, clientToday, now })` pure helper (~100 LOC) |
| `functions/index.js` | + export the new CF |

### Client

| File | Change |
|---|---|
| `public/js/modules/ross/v2/ross-service.js` | + `getHomeWorkflowDigest()` wrapper (same fetch pattern as `snoozeCard`); modify `getHomeFeed()` to call `detectActiveWorkflows` and prepend to realCards |
| `public/js/modules/ross/v2/detectors.js` | + `detectActiveWorkflows(ctx)` — wraps `getHomeWorkflowDigest()`, applies priority logic, returns card or null |
| `public/js/modules/ross/v2/content.js` | + `LEARNING_MODE_WORKFLOW_CARD` constant |
| `public/js/modules/ross/v2/utils/rel-time.js` | NEW — pure `relTime(ms)` formatter (~30 LOC) |

### Docs

| File | Change |
|---|---|
| `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md` | + entry for `rossGetHomeWorkflowDigest` (table row + payload/response example) |
| `public/kb/features/ROSS.md` | + short section under "Frontend Vue Module" describing the home digest |

### Tests

| File | Change |
|---|---|
| `tests/ross/v2/buildHomeWorkflowDigest.test.js` | NEW — server helper unit tests (12 cases) |
| `tests/ross/v2/detectActiveWorkflows.test.js` | NEW — client priority + card-shape tests (9 cases) |
| `tests/ross/v2/rel-time.test.js` | NEW — `relTime()` formatter tests (5 cases) |

## Server contract: `rossGetHomeWorkflowDigest`

**Auth:** `verifyAdmin`

**Request payload (POST callable):**
```json
{ "data": { "clientToday": "YYYY-MM-DD" } }
```
- `clientToday` (optional) — caller's local-tz date. Client computes via `Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' })`. Server falls back to UTC date if missing.

**Response:**
```json
{
  "success": true,
  "hasActiveWorkflows": true,
  "activeWorkflowCount": 4,
  "upcoming": {
    "workflowId": "...",
    "locationId": "...",
    "name": "Daily Opening Checklist",
    "locationName": "Ocean Club",
    "nextDueDate": "2026-05-20"
  },
  "overdue": [
    {
      "workflowId": "...",
      "locationId": "...",
      "name": "Daily Opening Checklist",
      "locationName": "Ocean Club",
      "nextDueDate": "2026-05-18",
      "daysLate": 1,
      "requiredTaskCount": 7
    }
  ],
  "today": [
    {
      "workflowId": "...",
      "locationId": "...",
      "name": "...",
      "locationName": "...",
      "nextDueDate": "2026-05-19",
      "subState": "in_progress",
      "runId": "...",
      "startedAt": 1747654800000,
      "completedTaskCount": 3,
      "requiredTaskCount": 7
    }
  ],
  "recentCompletions": [
    {
      "workflowId": "...",
      "locationId": "...",
      "name": "...",
      "locationName": "...",
      "runId": "...",
      "completedAt": 1747644000000,
      "onTime": true,
      "flaggedCount": 0
    }
  ],
  "generatedAt": 1747663200000
}
```

### Server algorithm

```
1. uid = verifyAdmin(req)
2. clientToday = body.data.clientToday || todayUTC()
3. workflows = (await get(`ross/workflows/${uid}`)).val() || {}
4. runs     = (await get(`ross/runs/${uid}`)).val() || {}
5. digest = buildHomeWorkflowDigest({ workflows, runs, clientToday, now: Date.now() })
6. return { success: true, ...digest }
```

**`buildHomeWorkflowDigest` (pure):**

For each workflow `w` in `workflows`:
- Skip if `w.status === 'paused'`.
- Skip if `w.locations` missing.

For each `(locationId, loc)` in `w.locations`:
- Skip if `loc.nextDueDate` missing.
- `runs_for_pair = runs[w.workflowId]?.[locationId] || {}`
- `latestRun` = highest `startedAt` in `runs_for_pair`
- `runCoversCurrentPeriod = latestRun && latestRun.startedAt >= toMs(loc.nextDueDate)`
- `requiredTaskCount` = count of `loc.tasks` where `task.required !== false`
- `completedTaskCount` = count of `latestRun?.responses` keys (or 0)
- `daysLate` = dateDiff(`clientToday`, `loc.nextDueDate`)

Bucket assignment:
- `loc.nextDueDate < clientToday` AND `!runCoversCurrentPeriod` → **overdue**
- `loc.nextDueDate === clientToday` AND `latestRun?.status === 'in_progress'` → **today / in_progress**
- `loc.nextDueDate === clientToday` AND `!runCoversCurrentPeriod` → **today / pending**
- `latestRun?.status === 'completed'` AND `(now - latestRun.completedAt) < 86_400_000` (24h strict) → **recentCompletions**
- Otherwise → not surfaced

Sort:
- `overdue` by `daysLate` desc
- `today` by `subState === 'in_progress'` first, then `nextDueDate` asc, then `name` asc
- `recentCompletions` by `completedAt` desc

After bucketing, also compute:
- `hasActiveWorkflows` = true if at least one non-paused workflow with at least one location exists
- `activeWorkflowCount` = count of distinct workflowIds with at least one non-paused, valid-location entry
- `upcoming` = the (workflowId, locationId) with the earliest `nextDueDate > clientToday` (i.e. future-due, not overdue, not today). `null` if no future-due workflows exist. Used by variant E only.

## Client card-shape mapping

`detectActiveWorkflows(ctx)` picks ONE card from the digest using this priority:

1. `overdue[0]` (if any) → variant A
2. `today[0]` with `subState === 'in_progress'` → variant B
3. `today[0]` with `subState === 'pending'` → variant C
4. `recentCompletions[0]` (if any) → variant D
5. None of the above AND `hasActiveWorkflows === true` → variant E ("All clear")
6. None of the above AND `hasActiveWorkflows === false` → return `null` → slot 1 falls back to `LEARNING_MODE_WORKFLOW_CARD` ("Your playbook is empty")

### Variant A — Overdue

```js
{
  id: `workflow:${workflowId}:${locationId}`,
  tone: 'warn',
  eyebrow: `${locationName} · ${daysLate} day${daysLate === 1 ? '' : 's'} late`,
  chip: { tone: 'warn', label: 'Overdue' },
  headline: `${name} is overdue at ${locationName} (${daysLate} day${daysLate === 1 ? '' : 's'} late).`,
  detail: `${requiredTaskCount} tasks pending. Start now to catch up.${aggSuffix}`,
  actions: [
    { id: 'run-workflow', label: 'Start now', variant: 'solid', trailing: 'arrow',
      href: `/ross.html?tab=run&w=${workflowId}&l=${locationId}` },
    { id: 'view-workflow', label: 'View workflow', variant: 'ghost',
      href: `/ross.html?tab=playbook` },
    { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
  ],
  footnote: overdueCount > 1 ? `${overdueCount} workflows overdue` : undefined,
  sidecar: { kind: 'kpi-spark', eyebrow: 'Days late', value: daysLate, unit: 'd',
             target: 'target: 0 overdue', trend: [0,0,0,0,0,0,daysLate], color: 'var(--hf-warn)' },
  _meta: { contextLine: `${name} is ${daysLate} days overdue at ${locationName}.` },
}
```
`aggSuffix` = ` And ${overdueCount - 1} more venue(s) overdue.` when `overdueCount > 1`, else empty.

### Variant B — In progress (today)

```js
{
  id: `workflow:${workflowId}:${locationId}`,
  tone: 'default',
  chip: { tone: 'default', label: 'In progress', icon: 'sparkle' },
  eyebrow: `${locationName} · started ${relTime(startedAt)}`,
  headline: `${name} is half-done — ${pending} of ${total} tasks pending.`,
  detail: `Resume to keep on track today.${aggSuffix}`,
  actions: [
    { id: 'run-workflow', label: 'Resume run', variant: 'solid', trailing: 'arrow',
      href: `/ross.html?tab=run&w=${workflowId}&l=${locationId}` },
    { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
  ],
  sidecar: { kind: 'donut', value: completedTaskCount / requiredTaskCount,
             label: `${pct}%`, sub: `${completedTaskCount}/${requiredTaskCount}`,
             color: 'var(--hf-accent)' },
  _meta: { contextLine: `${name} run in progress at ${locationName}.` },
}
```
`pending = requiredTaskCount - completedTaskCount`, `total = requiredTaskCount`, `pct = Math.round(value * 100)`.

### Variant C — Due today, not started

```js
{
  id: `workflow:${workflowId}:${locationId}`,
  tone: 'default',
  chip: { tone: 'default', label: 'Due today', icon: 'cal' },
  eyebrow: `${locationName} · ${requiredTaskCount} tasks`,
  headline: `${name} is due today at ${locationName}.`,
  detail: `${requiredTaskCount} tasks to run.${aggSuffix}`,
  actions: [
    { id: 'run-workflow', label: 'Start run', variant: 'solid', trailing: 'arrow',
      href: `/ross.html?tab=run&w=${workflowId}&l=${locationId}` },
    { id: 'snooze', label: 'Snooze 24h', variant: 'ghost' },
  ],
  sidecar: { kind: 'kpi-spark', eyebrow: 'Tasks', value: requiredTaskCount, unit: '',
             target: 'due today', trend: [requiredTaskCount,requiredTaskCount,requiredTaskCount,requiredTaskCount,requiredTaskCount,requiredTaskCount,requiredTaskCount],
             color: 'var(--hf-accent)' },
  _meta: { contextLine: `${name} due today at ${locationName}.` },
}
```

### Variant D — Recently completed (last 24h)

```js
{
  id: `workflow:${workflowId}:${locationId}`,
  tone: flaggedCount > 0 ? 'warn' : 'good',
  chip: { tone: flaggedCount > 0 ? 'warn' : 'good',
          label: flaggedCount > 0 ? 'Completed with flags' : 'Just completed',
          icon: flaggedCount > 0 ? 'alert' : 'check' },
  eyebrow: `${locationName} · completed ${relTime(completedAt)}`,
  headline: `${name} completed ${relTime(completedAt)}.`,
  detail: `${onTime ? 'On time.' : 'Completed late.'}` +
          (flaggedCount > 0 ? ` ${flaggedCount} response${flaggedCount === 1 ? '' : 's'} flagged for review.` : ''),
  actions: [
    { id: 'see-report', label: 'See report', variant: 'solid', trailing: 'arrow',
      href: `/ross.html?tab=activity` },
    { id: 'snooze', label: 'Hide', variant: 'ghost' },
  ],
  sidecar: { kind: 'donut', value: 1, label: '100%', sub: 'complete',
             color: flaggedCount > 0 ? 'var(--hf-warn)' : 'var(--hf-good)' },
  _meta: { contextLine: `${name} completed ${relTime(completedAt)} at ${locationName}.` },
}
```

### Variant E — All clear (has workflows, nothing pressing)

```js
{
  id: 'workflow-all-clear',
  tone: 'good',
  eyebrow: 'Your playbook · all clear',
  chip: { tone: 'good', label: 'All clear', icon: 'check' },
  headline: `Nothing pressing right now.`,
  detail: `Your active workflows are on schedule. Next run is ${nextDueLabel}.`,
  actions: [
    { id: 'view-playbook', label: 'View playbook', variant: 'ghost', trailing: 'arrow',
      href: '/ross.html?tab=playbook' },
    { id: 'snooze', label: 'Hide for a day', variant: 'ghost' },
  ],
  footnote: `${activeWorkflowCount} workflow${activeWorkflowCount === 1 ? '' : 's'} running`,
  sidecar: { kind: 'kpi-spark', eyebrow: 'On schedule', value: activeWorkflowCount, unit: '',
             target: 'all on track', trend: [1,1,1,1,1,1,1], color: 'var(--hf-good)' },
}
```

`nextDueLabel` derived from earliest future `nextDueDate` across workflows ("tomorrow" / "in 3 days" / "on YYYY-MM-DD"). Server returns earliest future date in `hasActiveWorkflows` payload as `nextDueDate: string | null` — see "Response" above (updated below).

### Fallback — `LEARNING_MODE_WORKFLOW_CARD` (no workflows at all)

```js
{
  id: 'learning-workflow',
  tone: 'default',
  eyebrow: 'Your playbook · empty',
  chip: { tone: 'default', label: 'Playbook', icon: 'check' },
  headline: 'Your playbook is empty.',
  detail: 'Activate a starter template — Daily Opening Checklist is the most common starting point.',
  actions: [
    { id: 'open-playbook', label: 'Activate a template', variant: 'solid', trailing: 'arrow',
      href: '/ross.html?tab=playbook' },
    { id: 'snooze', label: 'Hide for a day', variant: 'ghost' },
  ],
  footnote: 'No active workflows yet',
  sidecar: { kind: 'kpi-spark', eyebrow: 'Workflows', value: '—', unit: '',
             target: 'none active', trend: [0,0,0,0,0,0,0], color: 'var(--hf-muted)' },
}
```

## `relTime(ms)` helper

Pure formatter in `public/js/modules/ross/v2/utils/rel-time.js`:

| Elapsed | Output |
|---|---|
| `< 60_000` | `'just now'` |
| `< 3_600_000` | `'${n} min ago'` |
| `< 86_400_000` | `'${n} hour${plural} ago'` |
| `< 172_800_000` | `'yesterday'` |
| `< 7 * 86_400_000` | `'${n} days ago'` |
| else | `'on ${YYYY-MM-DD}'` |

## URL param scheme (pre-flight verification)

The "Start run" / "Resume run" / "Start now" actions route to `/ross.html?tab=run&w=<workflowId>&l=<locationId>`. The `RossRun.vue` component already handles `?tab=run` (shipped PR #65). The `w` and `l` query params need confirmation against the actual reader in `RossRun.vue` — if the existing param names differ, the writing-plans phase reconciles before any code lands.

## Error handling

### Server

| Condition | Behaviour |
|---|---|
| `verifyAdmin` rejects | 401, propagated to client |
| `ross/workflows/{uid}` missing | Treat as `{}`, empty digest, 200 |
| `ross/runs/{uid}` missing | Treat as `{}`, 200 |
| Malformed workflow (no `locations`, no `nextDueDate`) | Skip, log `[ross] skipped malformed workflow ${workflowId}`, do not 500 |
| Run with no `responses` map | `completedTaskCount = 0` |
| Internal helper throws | Caught at CF boundary, returns `{ success: false, error }` |

### Client

| Condition | Behaviour |
|---|---|
| Network failure on `getHomeWorkflowDigest()` | `try/catch` → `console.warn` → return `null` (mirrors existing detector pattern) |
| Card-builder throws on one variant | Top-level try/catch returns `null` → LEARNING_MODE fallback |
| Card snoozed via `getActiveSnoozes` | Detector tries next-priority signal; if none, returns null |

## Edge cases

| # | Edge case | Decision |
|---|---|---|
| 1 | Day-zero user, seeded workflow but `nextDueDate` in future | Show variant E ("All clear") with `nextDueLabel` referring to the seeded workflow. NOT the LEARNING_MODE card (which is reserved for "no workflows at all"). |
| 2 | Multi-location workflow: one overdue, another due today | Overdue wins. Due-today venue mentioned in aggSuffix on overdue card. |
| 3 | `status: 'paused'` workflow | Server skips. |
| 4 | In-progress run started yesterday, `nextDueDate` rolled to today | Treat as today/in_progress via `runCoversCurrentPeriod` check. |
| 5 | Recent completion AND new run due today | Today wins. |
| 6 | `completedAt` exactly at 24h boundary | Strict `<24h`. No grace window. |
| 7 | CF cold-start latency | Existing loading state in `RossHomeDesktop.vue:110` covers it. |
| 8 | Clock skew | Client clock for `relTime` rendering; server clock for 24h cutoff. |
| 9 | Caller not owner (shared location) | Out of scope; backlog follow-up. |
| 10 | Audit logging | None — read-only CF. |
| 11 | Malformed workflow record | Server skips silently, logs for observability. |
| 12 | Client card-builder throws | Top-level try/catch returns null. |

## Testing

### Server unit tests — `tests/ross/v2/buildHomeWorkflowDigest.test.js`

| Case | Assertion |
|---|---|
| Empty workflows + empty runs | All buckets empty, `generatedAt` set |
| One workflow, `nextDueDate` yesterday, no run | `overdue.length === 1`, `daysLate === 1` |
| One workflow, `nextDueDate` today, no run | `today[0].subState === 'pending'` |
| One workflow, `nextDueDate` today, in-progress run, 2/5 responded | `today[0].subState === 'in_progress'`, counts correct |
| One workflow, run completed 1h ago, on time, 0 flagged | `recentCompletions.length === 1`, `onTime: true` |
| One workflow, run completed 25h ago | `recentCompletions` empty |
| `status: 'paused'` workflow | Skipped |
| Multi-location: one overdue + one due today | Both buckets populated |
| Malformed workflow (no `locations`) | Skipped, no throw |
| `required: false` task | Excluded from `requiredTaskCount` |
| Run with empty `responses` | `completedTaskCount === 0` |
| `clientToday` missing → UTC fallback | Buckets against UTC midnight |
| Day-zero shape: 1 workflow with `nextDueDate` tomorrow, no run | All buckets empty, `hasActiveWorkflows: true`, `activeWorkflowCount: 1`, `upcoming` populated |
| No workflows at all | `hasActiveWorkflows: false`, `activeWorkflowCount: 0`, `upcoming: null` |
| Workflows exist but all buckets empty | `hasActiveWorkflows: true`, `upcoming` set; client renders variant E |
| No workflows at all | `hasActiveWorkflows: false`, all buckets empty, `upcoming: null`; client returns null → LEARNING_MODE fallback |

### Client unit tests — `tests/ross/v2/detectActiveWorkflows.test.js`

| Case | Assertion |
|---|---|
| Digest with overdue → variant A | `tone: 'warn'`, chip `'Overdue'`, action href `?tab=run` |
| Digest with today/in_progress → variant B | `chip.label === 'In progress'`, donut value correct |
| Digest with today/pending → variant C | `chip.label === 'Due today'` |
| Digest with recentCompletions, 0 flagged → variant D good | `tone: 'good'`, chip `'Just completed'` |
| Digest with recentCompletions, 2 flagged → variant D warn | `tone: 'warn'`, detail mentions "2 responses flagged" |
| Empty buckets + `hasActiveWorkflows: true` → variant E | `chip.label === 'All clear'`, `footnote` mentions active count, `detail` mentions `upcoming.nextDueDate` |
| Empty buckets + `hasActiveWorkflows: false` → returns null | (LEARNING_MODE fallback handled in service) |
| Plural aggregation: overdue.length === 3 | `aggSuffix` "+2 more", footnote "3 workflows overdue" |
| `getHomeWorkflowDigest` throws | Returns null |
| Card id `workflow:${w}:${l}` | Stable |

### Helper unit tests — `tests/ross/v2/rel-time.test.js`

5 cases covering `just now` / `min ago` / `hours ago` / `yesterday` / `N days ago`.

### Operator preview testing

Per validated 2026-05-12 LESSON (operator preview catches what automated review can't), plan for at least one fix cycle after preview:

1. Day-zero scenario: fresh signup → expect LEARNING_MODE workflow card slot 1
2. Flip seeded workflow `nextDueDate` to today via Firebase Console → expect variant C
3. Start run → return to `/ross.html` → expect variant B (correct task counts)
4. Submit all responses → return → expect variant D, verify "See report" routes to `?tab=activity`
5. Multi-venue: attach second location, flip one to yesterday → expect variant A with aggSuffix

### Mock discipline

Per validated 2026-05-13 LESSON: every client mock of the new CF response is copied verbatim from the server's `res.json(...)` line. No shape from working memory.

## Deploy sequencing

Per validated 2026-05-01 LESSON (deploy CFs before merging client):

1. Worktree + branch
2. Implement helper + CF + server tests; `cd functions && npm install` (per 2026-05-12 LESSON)
3. `firebase deploy --only functions:rossGetHomeWorkflowDigest` from worktree
4. Verify deploy with logs grep for sentinel line (per 2026-05-15 LESSON)
5. Implement client + tests
6. Push branch, open PR, deploy hosting to preview channel
7. Operator preview cycle
8. Merge after user approves

## Feature flag

Inherits `ROSS_HOME_REAL_DATA` (already gates the detector path). When OFF, `getHomeFeed()` returns the original scripted feed unchanged — workflow detector not called.

## Out of scope (logged as follow-ups)

- **Shared-location admin home view** — second admin seeing workflows owned by another user. Requires `resolveWorkflowOwner` integration in the digest CF. Backlog entry to be added.
- **Right-rail "Ross suggests" workflow entries** — separate slice, sidebar-detectors.js. Re-evaluate after this PR ships.
- **In-card task-level surfacing** — "next 3 pending tasks for this workflow" on the card detail. Possible enhancement; not in this PR.
- **Snooze persistence across run-state transitions** — if user snoozes the "Due today" card then starts the run, does the snooze auto-clear? Current design: no, snooze persists until expiry. Acceptable for v1.
