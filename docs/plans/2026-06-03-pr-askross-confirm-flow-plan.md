# Implementation Plan: Phase 7 ② askRoss Agent — Slice 4 (confirm-flow pause/resume + promote 4 confirm-tier tools)

**Date:** 2026-06-03
**Branch:** `feat/askross-confirm-flow` (off master `0f5ba3df`)
**Worktree:** `C:\dev\MerakiCaptivePortal-firebaseDB\.claude\worktrees\askross-confirm`
**Spec:** `docs/plans/2026-05-31-askross-agent-design.md` §2 (turn loop, "Confirm-flow across HTTP", "Resume safety"), §2.1 pt 2 (billed twice), §3 (tiers), §4 (policy), §10 slice 4.

## Overview

Slice 4 makes the reactive engine able to PAUSE mid-loop on a `confirm`-tier tool, persist a server-keyed pending action with an expiry, end the HTTP turn after debiting tokens already spent, and RESUME on the owner's approve/decline POST — executing the tool (audited as `confirmed:`) and continuing the loop. In the same PR, the 4 confirm-tier adapters (`activateTemplate`, `createWorkflow`, `editWorkflow`, `pauseWorkflow`) are promoted from `pending` to `ready` by extracting each CF's inline write-logic into an owner-callable core shared by both the CF handler and the agent adapter.

## Requirements (restated)

**HALF A — confirm-flow machinery (spec §2):**
1. On a `confirm`-tier tool_use: do NOT execute; persist a pending action at `ross/agentPending/{uid}/{turnId}` containing the pending tool_use block (name+args+id), the `messages` accumulated so far (incl. the assistant turn carrying the tool_use), `threadId`, and `expiresAt = now + 10*60*1000`; emit `{type:'confirm', ...}`; end the turn.
2. BILLING (§2.1 pt 2): debit accumulated usage AT THE PAUSE (Request A is billed even if the owner never confirms) and persist the turn.
3. RESUME via POST `{ resumeTurnId, decision: 'approve'|'decline' }`: read pending → expiry check (410 if `now > expiresAt`) → atomic one-time-consume (delete-before-execute) → on approve execute with `confirmedBy` set + feed tool_result + continue loop; on decline feed "declined by owner" tool_result + continue. Resume is a NEW request → new requestId → its own debit (Request B), linked by `meta.turnId`.
4. Resume token is SERVER-issued (the `turnId` push key), never client-controllable; resume authorized as the same owner (`verifyRossAgentAccess` → `principal.uid` must own the pending path).
5. `ctx.confirmedBy = principal.uid` on the resume path so `execute.js` stamps `via: confirmed:<uid>`.

**HALF B — promote 4 confirm-tier adapters (DRY extract-and-share):** extract each CF's inline write-logic into owner-callable cores reused by BOTH the existing CF and the agent adapter; flip the 4 registry entries to `status: READY` with real `run`s that call the cores via lazy-require.

**Conventions:** TDD 80%+, build green, immutable patterns, security-reviewer mandatory (writes + pause/resume + expiry + cross-tenant). `rossChat` is LIVE → redeploy needed (`cd functions && npm install` first in worktree). Slice 7 RTDB rules for `ross/agentPending` still pending — server-only Admin SDK writes work without them; needed before slice 5 client.

## Decisions (with recommendations)

### D1. Entitlement/cap + super-admin bypass for agent-invoked confirm tools
The agent acts AS the owner; `activate`/`create` are tier+cap-gated. **Recommendation: the extracted cores enforce the SAME gates as the CF, with `isSuperAdmin` threaded from the resolved principal into `ctx`.** Thread `isSuperAdmin` into `ctx` at both the chat-loop ctx builder (`runChatRequest`, currently `{uid,turnId,turnSource,now}`) and the resume ctx builder. A gate failure (tier 403 / cap `WORKFLOW_LIMIT_REACHED`) is NOT thrown out of the loop — the adapter `run` throws/returns a structured error that `runAgentLoop` already converts to an `is_error` tool_result the model relays ("I couldn't activate that — you're at your plan's workflow limit"). The cores must signal gate failures distinguishably (throw an `Error` with a `.code`), so the adapter can shape a clean tool_result rather than a 500-flavoured message.
- Implementation note: `ctx` flows `runChatRequest`/resume → `runAgentLoop` → `executeTool(ctx,...)` → `def.run(ctx, args)`. The 4 new adapter `run`s read `ctx.uid` and `ctx.isSuperAdmin`. Update the `execute.js` ctx JSDoc and the §1.1 `ctx` contract doc to add `isSuperAdmin`.

### D2. No-undo audit capture for editWorkflow / pauseWorkflow
`createWorkflow`/`activateTemplate` create records (reversible by delete). `editWorkflow`/`pauseWorkflow` mutate existing fields in place (no native undo). **Recommendation: add `editWorkflow` and `pauseWorkflow` to `NO_UNDO_TOOLS` and extend `snapshotPrev` in `execute.js` with a case that snapshots the prior workflow fields** (the `allowedFields` subset: `name, notificationChannels, notifyPhone, notifyEmail, daysBeforeAlert, status`, plus `updatedAt`). Keep the hardcoded-dispatch in `snapshotPrev` in lockstep with `NO_UNDO_TOOLS` (explicit warning comment in `execute.js`). `prev` is read from `ross/workflows/{uid}/{workflowId}` before the update.

### D3. Confirm-card SSE event shape
**Recommendation:**
```js
{ type: 'confirm',
  turnId,        // server-issued resume token (the pending key)
  tool,          // e.g. 'activateTemplate'
  summary,       // human-readable, e.g. "Activate “Weekly Compliance Sweep” at Harbour Cafe"
  args,          // echo of the tool args (client renders detail / future-proofs)
  expiresAt }    // so the client can show/disable the card after expiry
```
`summary` is built server-side from the tool name + args (small pure `confirmSummary(tool, args)` helper — testable). The client (slice 5) renders an inline confirm-card and on click POSTs `{ resumeTurnId: turnId, decision }`.

### D4. Pending payload shape + size
**Recommendation: persist the messages array needed to continue (already bounded by the loop's history limit) plus the pending tool_use block.** Shape at `ross/agentPending/{uid}/{turnId}`:
```js
{ tool, args, toolUseId,    // the paused tool_use (name+input+id)
  messages,                 // convo up to & incl. the assistant turn with the tool_use
  threadId,
  createdAt: now,
  expiresAt: now + PENDING_TTL_MS }   // PENDING_TTL_MS = 10*60*1000
```
`runAgentLoop` already builds `convo` from a history-bounded `messages` (`buildHistoryMessages` caps last-N turns / ~16k chars) plus per-round tool_results — RTDB write size is well within limits. Do NOT use a thread-pointer-and-replay scheme (more code, race-prone). Add a defensive char-guard before persisting.

### D5. What runChatRequest returns on pause + how the handler routes resume
- `runAgentLoop` gains a pause signal: on a `confirm`-tier tool_use it pushes the assistant turn into `convo`, then returns early with `{ paused: true, pendingTool: {name, args, toolUseId}, messages: convo, usage, units, rounds, assistantBlocks, error: null }` (no tool execution). AUTO + `off`-refuse paths unchanged.
- `runChatRequest` detects `loop.paused`: debits accumulated usage (Request A), persists the turn (flagged `pending: true`), writes the pending node, emits `{type:'confirm', ...}`, returns `{ terminated: false, paused: true, threadId, turnId, costCents }`. No `done` on a pause.
- NEW `resumeChatRequest({ uid, isSuperAdmin, resumeTurnId, decision, requestId, emit, now })`: read pending → expiry → consume → rebuild ctx (with `confirmedBy`, `isSuperAdmin`) → execute-or-decline → feed tool_result → continue `runAgentLoop` with the stored `messages` → debit (Request B) → persist completed turn → emit `done`.
- Handler routing: branch on `resumeTurnId` present in the body. `rossChat` validates `resumeTurnId` (key-safe `THREAD_ID_RE`) + `decision ∈ {approve, decline}`; present → `resumeChatRequest`; else `message` path → `runChatRequest`. One endpoint.

### D6. Test strategy
Pure/unit-testable via the existing seams: `llm-client.__setClientForTests` (scripted fake emitting a confirm-tier tool_use), `rossChat/tools/execute/ledger.__setDbForTests` (shared `makeFakeRtdb`). The fake-rtdb supports `transaction()` + multi-path `update()` — sufficient for one-time-consume. The 4 extracted cores get their own unit tests; existing CF-handler tests must stay green (now delegate to cores). Server-shape mocks copied verbatim (reuse existing `USAGE`/`toolMsg` helpers).

## Architecture changes (file-by-file)

**New files:**
- `functions/ross-workflow-ops.js` — the 3 extracted owner-callable cores: `activateWorkflowAsOwner({uid, isSuperAdmin, ...args})`, `createWorkflowAsOwner({uid, isSuperAdmin, ...args})`, `updateWorkflowAsOwner({uid, workflowId, updates})`. Follows the `ross.js` `db`-seam pattern (local `getDb()` + `__setDbForTests`). Validation + gates + atomic write; returns `{ success, workflowId, workflow }` (matching the CF's `res.json({result})` minus the HTTP envelope). Gate failures throw `Error` with `.code` (`TIER_DENIED` / `WORKFLOW_LIMIT_REACHED` / `LOCATION_DENIED` / `NOT_FOUND` / `VALIDATION`). The denial-audit side-effects (`logActivationDenial`, `logWorkflowCapDenial`) move INTO the core so both callers log. Reuses `buildWorkflowRecord` (ross-workflow-builder.js), `userCanActivate` (ross-tier.js), `checkWorkflowCap`/`countActiveWorkflows`/`workflowCapStatus`, `verifyLocationAccess`, `locationIndexUpdates`, `buildTaskFromSubtask`, `VALID_*`, `validateSubtasksInputTypes`, `readUserTier`, `generateId`. **Recommendation: export those helpers from `ross.js`** (smallest diff) and have `ross-workflow-ops.js` lazy-require `ross.js` inside the core functions (mirrors `tools.js`/`execute.js` lazy-require to avoid load-time CF/secret registration).
- `functions/agent/__tests__/ross-workflow-ops.test.js` — unit tests for the 3 cores.

**Modified files:**
- `functions/ross.js` — replace the inline bodies of `rossActivateWorkflow`, `rossCreateWorkflow`, `rossUpdateWorkflow` with thin wrappers (parse body → call core → map `.code`→HTTP status, preserving existing status/error shapes byte-for-byte). Add `module.exports` for the helpers `ross-workflow-ops.js` needs. `rossSeedFirstWorkflow` is OUT OF SCOPE (leave as-is).
- `functions/agent/tools.js` — flip the 4 entries to `status: READY` with real `run`s that lazy-require `../ross-workflow-ops` and call the matching core (passing `ctx.uid`/`ctx.isSuperAdmin`, mapping args; `pauseWorkflow` → `updateWorkflowAsOwner({uid, workflowId, updates:{status:'paused'}})`; `editWorkflow` → `updateWorkflowAsOwner({uid, workflowId, updates})`). Keep the Zod schemas. `enabledToolNames()` auto-includes once READY.
- `functions/agent/constants.js` — add `editWorkflow`, `pauseWorkflow` to `NO_UNDO_TOOLS`; add `PENDING_TTL_MS = 10*60*1000`. (`agentPendingPath` already exists.)
- `functions/agent/execute.js` — extend `snapshotPrev` with an edit/pause case; update ctx JSDoc to include `isSuperAdmin`.
- `functions/agent/rossChat.js` — (a) `runAgentLoop` confirm→pause branch; (b) `runChatRequest` pause handling (debit-at-pause, persist pending + flagged turn, emit `confirm`) + thread `isSuperAdmin` into `ctx`; (c) NEW `resumeChatRequest`; (d) handler resume branch + validation; (e) export `resumeChatRequest`; (f) `confirmSummary(tool,args)` pure helper.
- `functions/agent/__tests__/rossChat.test.js` / `tools.test.js` / `execute.test.js` — new + updated cases (incl. updating the slice-3 "defensively REFUSES activateTemplate" test → confirm now PAUSES; add an `off`-tier fixture to keep refuse coverage).
- `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md` (+ `public/kb` copy) — note `rossChat` now accepts a resume body.
- `KNOWLEDGE BASE/PROJECT_BACKLOG.md` + `public/data/project-status.json` — at session end (Step 11), in lockstep.

**Explicitly NOT in this PR:** `ross/agentPending` RTDB rules (slice 7), the client confirm-card UI (slice 5), the eval harness (slice 6), `rossSeedFirstWorkflow` reroute.

## Implementation Steps (TDD; cores first → machinery → wiring → handler → docs/deploy)

### Phase 0 — Setup
1. `cd functions && npm install`. Confirm `npm run test` green on the branch baseline.

### Phase 1 — Extract the 3 owner-callable cores (HALF B foundation)
2. **RED:** `ross-workflow-ops.test.js` against fake-rtdb. Per core: happy create/activate/update; tier-denied (activate, non-super, gated template) → `.code==='TIER_DENIED'` + denial-audit row; cap-reached → `.code==='WORKFLOW_LIMIT_REACHED'` + denial-audit; location-denied; template-not-found; super-admin bypass (skips tier+cap); update sanitizes to `allowedFields` + validates `status`/`daysBeforeAlert`; update of missing workflow → `.code==='NOT_FOUND'`. Returned payloads copied verbatim from each CF's `res.json({result})`.
3. **GREEN:** Create `ross-workflow-ops.js` lifting logic from `ross.js` (activate ~690–758, create ~887–968, update ~984–1017). Export the needed helpers from `ross.js`. Wire lazy-require + `db` seam.
4. **REFACTOR + keep CFs green:** Replace the 3 CF bodies with thin wrappers calling cores; map `.code`→status (keep 400/403/404/500 + messages identical). Existing `ross-*` + `ross-auth` tests stay green.

### Phase 2 — No-undo audit capture (D2)
5. **RED:** `execute.test.js` — edit/pause write an audit row with a `prev` snapshot of changed fields.
6. **GREEN:** add both to `NO_UNDO_TOOLS`; add the `snapshotPrev` case.

### Phase 3 — Promote the 4 adapters to READY (HALF B completion)
7. **RED:** `tools.test.js` — `enabledToolNames()` includes the 4; each `run` (fake-rtdb seeded) writes/gates; projections expose them. RE-EXAMINE the slice-3 `runAgentLoop` "defensively REFUSES activateTemplate" test (confirm now pauses, not refuses); add an `off`-tier fixture to retain refuse coverage.
8. **GREEN:** flip the 4 registry entries to READY + real `run`s calling cores with `ctx.uid`/`ctx.isSuperAdmin`.

### Phase 4 — Confirm-flow pause (HALF A)
9. **RED:** `runAgentLoop` confirm-pause: scripted client emits a confirm-tier tool_use; assert `{paused:true, pendingTool, messages}` with the assistant turn pushed, NO execution (no audit/write), usage accumulated, single round.
10. **GREEN:** add the `confirm` branch (between AUTO and `off`-refuse).
11. **RED:** `runChatRequest` pause path: debits accumulated usage (Request A balance drop), persists pending node (`expiresAt = now + 600000` + messages + tool/args/toolUseId), persists flagged turn, emits `{type:'confirm', turnId, tool, summary, expiresAt}`, returns `{paused:true}`, no `done`.
12. **GREEN:** implement pause handling + `confirmSummary` + thread `isSuperAdmin` into `ctx`.

### Phase 5 — Resume (approve/decline/expiry/one-time-consume/cross-user)
13. **RED:** `resumeChatRequest` tests: approve → consumes pending + executes with `confirmedBy` (audit `via: confirmed:<uid>`) + feeds tool_result + continues + Request-B debit (distinct requestId, same `meta.turnId`) + persists completed turn + `done`; decline → no execution + declined tool_result + continues + `done`; expiry (`now>expiresAt`) → terminal/expired, NO execution, pending NOT executed; double-resume → second blocked (one-time-consume); cross-user → pending read under `principal.uid` → not found.
14. **GREEN:** implement `resumeChatRequest`: read pending under `principal.uid` → absent→not-found terminal; expired→terminal (no exec); else atomic consume via `transaction()` on the node (prior value null ⇒ already consumed ⇒ blocked); build `ctx = {uid, turnId: resumeTurnId, turnSource:'chat', confirmedBy: principal.uid, isSuperAdmin, now}`; approve→`executeTool`+tool_result, decline→synthetic declined tool_result; push onto stored `messages`; `runAgentLoop` to continue; debit Request B; persist; `done`.

### Phase 6 — Handler routing
15. **RED/GREEN:** SSE handler validates `resumeTurnId` (THREAD_ID_RE) + `decision ∈ {approve,decline}`; branch to `resumeChatRequest`. Fresh `requestId = crypto.randomUUID()` for Request B. Auth unchanged; `principal.uid` scopes the pending read. HTTP/SSE shell deploy-smoke-tested (orchestration covered by `resumeChatRequest` tests).

### Phase 7 — Build, review, docs, deploy
16. `npm run build` green; tests ≥80% on changed files.
17. security-reviewer (mandatory): pause/resume, expiry, one-time-consume, cross-tenant pending scoping, `confirmedBy` provenance, gate parity (cores vs CF), no client-controllable resume token, info-disclosure.
18. Update `CLOUD_FUNCTIONS_CATALOG.md` (both copies). Pre-push self-review (Step 5): mock-vs-server verbatim, shape contradictions vs LESSONS, dead code.
19. Commit (narrow), push, PR with test plan. Deploy `rossChat` (LIVE behavior change; secret provisioned): `cd functions && npm install` then deploy `rossChat` (+ the 3 re-routed ross CFs — verify `index.js` exports/coupling). Note: `ross/agentPending` rules are slice 7.
20. Step 11 reflect: SELF_OPTIMIZATION / LESSONS / SCORECARD / PROJECT_BACKLOG + `public/data/project-status.json` in lockstep.

## Risks & Mitigations
- **Cores drift from CF behavior** (status, messages, audit side-effects) → **NOTE (verified 2026-06-03): there are NO existing tests for `rossActivateWorkflow`/`rossCreateWorkflow`/`rossUpdateWorkflow` — the "existing CF tests stay green" net does NOT exist.** So: (a) the extraction must be a verbatim, behavior-preserving port (read each handler in full; port exactly); (b) the NEW `ross-workflow-ops.test.js` must cover EVERY branch the handlers have (gates, validation, atomic-write shape, error codes) — these tests ARE the regression net; (c) cores own the denial-audit writes; CF wrappers only parse → call core → map `.code`→status, with a couple of thin wrapper tests for the mapping; (d) copy `res.json` payloads verbatim. These three handlers are LIVE (v2 admin UI) — treat the refactor as the riskiest part of the slice.
- **Double-execution on rapid resume** → transaction-based one-time-consume BEFORE execution; explicit double-resume test.
- **Cross-tenant resume** → pending path keyed by server-derived `principal.uid`; never trust client uid; explicit cross-user test.
- **Free abandoned-confirm turns / billing leak** → debit-at-pause (A) + separate resume debit (B), both `meta.turnId`-linked, idempotent on per-request `requestId`. A & B must use DISTINCT requestIds or B is wrongly suppressed by the guard.
- **Stale pending nodes (no native TTL)** → `expiresAt` enforced in code (410, no exec); prune/slice-7 rule as follow-up (not implemented here).
- **`ctx.isSuperAdmin` not threaded** → thread from resolved principal at both ctx builders; unit-test super-admin bypass + non-super gating.
- **Slice-3 confirm-refuse test breaks** → update it (confirm→pause); add `off`-tier fixture to retain refuse coverage.
- **LIVE redeploy of rossChat** → behavior is additive (resume body new; message path unchanged); smoke golden path + one error path post-deploy.

## Complexity estimate
HALF B (extract 3 cores + reroute CFs + promote 4 adapters): **Medium**. HALF A (pause/resume + resume orchestration + handler branch): **Medium-High**. Tests: **Medium** (~20–25 new cases). Overall **Medium-High**, single PR; `ross.js` is solely owned by this branch this cycle.

## Success Criteria
- [ ] 3 cores extracted; CFs delegate; existing CF tests green.
- [ ] 4 confirm-tier tools READY; exposed in projections + prompt catalog.
- [ ] edit/pause capture `prev`; in lockstep with `NO_UNDO_TOOLS`.
- [ ] confirm tool_use pauses (no exec), debits Request A at pause, persists pending(+expiresAt)+turn, emits `confirm`.
- [ ] resume approve executes (confirmedBy audit) + continues + debits Request B; decline feeds declined + continues.
- [ ] expiry → terminal/no-exec; double-resume blocked; cross-user rejected; resume token server-issued.
- [ ] `isSuperAdmin` threaded; cores enforce gates with super-admin bypass; gate failures → is_error tool_result (not thrown turn).
- [ ] build + tests ≥80% green; security-reviewer clean; catalog docs updated; rossChat redeployed; backlog + project-status.json in lockstep.

## Key load-bearing facts (from code)
- `verifyRossAgentAccess` returns `{ uid, isAdmin, isSuperAdmin }` — `isSuperAdmin` already available to thread into `ctx`.
- `runAgentLoop`'s non-AUTO branch currently REFUSES (feeds `is_error`) — the exact seam for the `confirm` pause branch; `off` keeps refusing.
- `ctx` built without `isSuperAdmin` in `runChatRequest` — must add it.
- `recordUsageAndDebit` short-circuits on an existing `requestId` guard returning cached values — Request A and B MUST use distinct `requestId`s (fresh UUID per HTTP request).
- fake-rtdb `transaction(fn)` is a sync read-modify-write returning `{committed, snapshot}` — supports one-time-consume without the emulator.
- `snapshotPrev` carries an explicit lockstep warning with `NO_UNDO_TOOLS` — adding edit/pause touches both.
- `ross.js` uses a `db` Proxy over `getDb()` with `__setDbForTests` — cores should follow the same seam to be fake-rtdb testable.
