# Implementation Plan: Phase 7 ② askRoss Agent — Slice 3 (`rossChat` reactive SSE Cloud Function)

**Branch:** `feat/askross-rosschat-sse` (off master `a2be4c16`)
**Worktree:** `C:\dev\MerakiCaptivePortal-firebaseDB\.claude\worktrees\askross-rosschat`
**Spec:** `docs/plans/2026-05-31-askross-agent-design.md` §2, §2.1, §5, §9, §10 slice 3
**Date:** 2026-06-03

## Overview

Build `rossChat`, the v1 reactive engine: an `onRequest` SSE Cloud Function that runs one streaming agent turn over the raw Anthropic Messages API. It wires the already-shipped engine-agnostic core (`functions/agent/{llm-client,tools,execute,policy,prompt,constants}.js`) to four pre-flight gates, the ① ledger debit, and SSE transport. Slice 3 is **server-only** (no client — that's slice 5; no confirm-flow — that's slice 4). Confirm-tier tools are `status:pending` and never exposed, so the loop only ever auto-executes the 4 READY tools — but must defensively refuse any non-`auto` tool rather than assume.

This slice also lands one **billing-module prerequisite** (`recordUsageAndDebit` `requestId` idempotency guard) and one **minimal auth extension** (rossAgent-aware verify) inside their existing modules.

## Requirements (restated)

1. New `rossChat` CF: `onRequest`, SSE (`text/event-stream`), CORS-wrapped, `defineSecret('ANTHROPIC_API_KEY')`.
2. Four pre-flight gates with no LLM spend on failure: (a) global kill switch, (b) per-owner enable, (c) `subscriptions/{uid}/features/rossAgent === true`, (d) `ledger.checkBalance(uid)`. Super-admin short-circuits (c)+(d).
3. Streaming agent loop (Sonnet 4.6): stream text deltas; auto-execute READY/`auto` tools via `executeTool`; feed `tool_result`; loop until no `tool_use`. Defensive refusal of any non-`auto` tool.
4. Accumulate usage per round-trip from each `message_stop` complete `usage` block via `toLedgerUnits`; debit once post-turn with `recordUsageAndDebit({..., requestId})`.
5. Persist the turn to `ross/agentChats/{uid}/{threadId}/turns/{turnId}`; bounded history read (last ~10 turns / ~4k tokens).
6. `ctx.now = Date.now()` server-side — never client-supplied.
7. Extend `recordUsageAndDebit` with an optional `requestId` one-time-consume debit guard at `billing/debitGuard/{uid}/{requestId}`.
8. rossAgent-aware auth helper (extend `verifyUserOrAdmin` or add `verifyRossAgentAccess`) — minimal, no shared-auth-module consolidation.
9. Update both `CLOUD_FUNCTIONS_CATALOG.md` copies — rossChat is the project's first AI-inference CF.
10. TDD, 80%+ coverage, `npm run build` passes. No client deploy.

## Explicit Decisions (with recommendations)

### D1 — Where `rossChat` lives
**Recommend: new `functions/agent/rossChat.js`**, re-exported via `index.js` (`exports.rossChat = require('./agent/rossChat').rossChat`), mirroring the billing module's `cloud-functions.js` pattern. Keeps the reactive *engine* cohesive with its core, leaves `ross.js` (1940 lines) untouched, and respects the §1.1 "engine consumes core" seam.
**Auth dependency:** the file needs `verifyAuthToken` + a rossAgent-aware verify. `ross.js` currently exports only `VALID_INPUT_TYPES` + `buildHomeWorkflowDigest`. **Recommend: export `verifyAuthToken` and the new `verifyRossAgentAccess` from `ross.js`** (two lines at the existing `module.exports.X =` block, line ~1937) and require them in `rossChat.js`. This avoids duplicating token logic and avoids the larger shared-`functions/auth.js` consolidation (backlog #4, out of scope).

### D2 — rossAgent-aware auth approach + gate (c) placement
**Recommend: add a new `verifyRossAgentAccess(decodedToken)` in `ross.js`** rather than mutate `verifyUserOrAdmin` (which other Ross CFs depend on — widening it risks granting non-Ross-entitled users new access). Shape:
- Read `admins/{uid}` → if present, return `{ uid, isAdmin:true, isSuperAdmin }`.
- Else read `subscriptions/{uid}/features` → admit if `rossAgent || rossBasic || rossAdvanced` (rossAgent is the new path; legacy flags preserved for continuity), return `{ uid, isAdmin:false, isSuperAdmin:false }`.
- Else throw `Access denied: Ross agent not available on your subscription`.

**Gate (c) sits *after* auth, *inside* `rossChat`'s pre-flight, and is stricter than auth.** Auth answers "may this person reach the agent endpoint at all" (admits admins + any Ross-entitled user). Gate (c) answers "is *the agent feature* specifically entitled" — it requires `features.rossAgent === true` exactly, with the **super-admin short-circuit** skipping it. This two-layer design is deliberate: a `rossBasic`-only user passes auth (can reach the endpoint) but fails gate (c) (gets a friendly "not entitled for Ross AI" terminal SSE event, no spend) unless they also have `rossAgent`. Super-admins skip (c)+(d).

### D3 — `recordUsageAndDebit` `requestId` guard (exact shape + tests)
Extend the signature to `recordUsageAndDebit({ uid, service, model, units, meta = {}, requestId })`. New behaviour when `requestId` is supplied:
1. Sanitise `requestId` to a safe RTDB key (`replace(/[^a-zA-Z0-9_-]/g,'')`); if empty after sanitising, treat as no guard (fall through to current behaviour).
2. **Before** the balance transaction, read `billing/debitGuard/{uid}/{requestId}`. If it exists, **short-circuit**: return the cached `{ costCents, balanceAfterCents, recordKey }` from the guard node (no transaction, no second usage record).
3. If absent, run the existing flow (rate snapshot → transaction → usage record), then write the guard node `{ costCents, balanceAfterCents, recordKey, at: Date.now() }`.

**Concurrency note:** the in-memory fake's `transaction()` is synchronous read-modify-write — the guard read+write is *not* atomic against a true concurrent double-fire, but RTDB single-doc serialisation + the request-scoped `requestId` (one Cloud Run request id per HTTP turn) makes a real double-fire vanishingly rare; the guard's job is to neutralise *retries* (operator re-invoke / future onSchedule retry), which arrive sequentially. Document this limitation in the JSDoc (matches the existing `setWithRetry` atomicity-contract comment style).

**Test cases (extend `functions/billing/__tests__/ledger.test.js`):**
- `requestId` supplied, guard absent → normal debit + guard node written with cached values.
- Same `requestId` second call → balance unchanged (transaction NOT re-run), returns cached values, no second usage record.
- No `requestId` → unchanged legacy behaviour (existing tests stay green).
- Empty/unsafe `requestId` after sanitising → behaves as no-guard.

### D4 — Owner-context string (prompt block 2)
**Recommend: build it cheaply server-side in `rossChat`, reusing the `getWorkflowDigest` adapter** (already an owner-scoped READY tool) plus two cheap reads. Contents:
- **Workflow digest** — call `REGISTRY.getWorkflowDigest.run(ctx, { clientToday })` directly (NOT via `executeTool` — the context build is not an audited agent action). Render overdue/today/upcoming counts + names.
- **Tier** — `readUserTier(uid)` (already in `ross.js`; export it alongside the auth helpers, or read `users/{uid}/tier` directly in `rossChat`).
- **Locations** — read `ross/staff/{uid}` keys, or a locations node, to list location names (cheap single read; degrade gracefully to "(no locations)").
- **Current SA date** — derive from `clientToday` if supplied, else server date formatted DD/MM/YYYY (Africa/Johannesburg).

Assemble into a plain multi-line string passed as `ownerContext` to `systemBlocks({ mode:'chat', tools: catalogForPrompt(), ownerContext })`. This is the per-session cached block — keep it deterministic so the cache key is stable within a thread.

### D5 — History persistence + bounded read + threadId
**Persistence shape** at `ross/agentChats/{uid}/{threadId}/turns/{turnId}`:
```
{ userMessage:string, assistantBlocks:[...content], usage:{...}, costCents, at:ctx.now }
```
Store the full Anthropic `content` array of the assistant's final message (text + any tool_use/tool_result) so a future resume (slice 4) can replay verbatim, plus the raw user message string.

**Bounded read** for the next turn's suffix: read `ross/agentChats/{uid}/{threadId}/turns` `orderByKey().limitToLast(10)`, then trim oldest-first to a ~4k-token budget (approximate by character count ÷ 4 — exact tokenisation is a v2 refinement per spec §7). Reconstruct Anthropic `messages` array: for each retained turn emit `{role:'user',...}` then `{role:'assistant',...}`, then append the new user message last.

**threadId generation:** if request omits `threadId`, generate `getDb().ref(agentChatsPath(uid,'')).push().key` server-side and return it in the SSE `done` event so the client can continue the thread. `turnId` is likewise a server push key.

### D6 — Test strategy (unit vs deploy-smoke)
**Unit-testable (target ≥80%, in `functions/agent/__tests__/rossChat.test.js`)** using the in-memory `fake-rtdb`, `__setClientForTests` (fake Anthropic), `__setDbForTests` on tools/execute/ledger:
- Pre-flight gate logic — each of (a)/(b)/(c)/(d) fail individually → correct terminal event, **zero** LLM calls (assert fake client never invoked), **zero** debit.
- Super-admin short-circuit — admin lacking rossAgent + zero balance still proceeds.
- Agent loop tool dispatch — fake client returns a `tool_use` for `snoozeCard`, then a no-tool message; assert `executeTool` ran, audit row written, `tool_result` fed back, loop terminated.
- Defensive refusal — if a (hypothetically) non-`auto` tool name appears in `tool_use`, assert it is NOT executed and a refusal `tool_result` is fed.
- Usage accumulation — two round-trips each carrying a **verbatim** `message_stop` `usage` block; assert accumulated `toLedgerUnits` sums correctly and `recordUsageAndDebit` is called once with the sum + `requestId`.
- History reconstruction — seed N turns, assert bounded `messages` shape (oldest dropped, correct role ordering).
- Auth helper `verifyRossAgentAccess` — admin / rossAgent-only / rossBasic-only / no-features paths (extend a ross auth test or co-locate).
- Owner-context builder — assert digest+tier+locations+date string assembled.

**Server-shape mock discipline:** the fake `message_stop` `usage` block must be copied verbatim from a real Anthropic response with a citing comment (per the LESSON + existing `llm-client.test.js:23` pattern). The fake stream mirrors the existing `makeFakeStream` helper (`.on('text',cb)` + `finalMessage()`).

**Deploy-smoke only (manual, post-deploy):** real SSE flush/headers in a browser, real Anthropic streaming call, real secret resolution, real CORS preflight from a hosting origin. Document as a smoke checklist in the PR, not automated.

## Architecture Changes (file-by-file)

| File | Change |
|------|--------|
| `functions/agent/rossChat.js` | **NEW.** The reactive engine: SSE handler + 4 gates + agent loop + ledger debit + persistence. Exports `{ rossChat }` (and small pure helpers for unit tests: `buildHistoryMessages`, `buildOwnerContext`, `runGates`). Lazy-requires `../ross` for auth helpers inside the handler (avoids load-time secret/CF-registration cycle — same lazy pattern `tools.js:77` uses). |
| `functions/billing/ledger.js` | Extend `recordUsageAndDebit` with optional `requestId` debit-guard (D3). Add `debitGuardPath = (uid,rid) => 'billing/debitGuard/${uid}/${rid}'`. |
| `functions/billing/__tests__/ledger.test.js` | Add `requestId` guard test cases (D3). |
| `functions/ross.js` | Add `verifyRossAgentAccess(decodedToken)` (D2). Export `verifyAuthToken`, `verifyRossAgentAccess`, `readUserTier` via the `module.exports.X =` block (~line 1937). No change to existing `verifyUserOrAdmin`. |
| `functions/agent/__tests__/rossChat.test.js` | **NEW.** Unit tests (D6). |
| `functions/index.js` | Add `const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');` near line 14, and `exports.rossChat = require('./agent/rossChat').rossChat;` after the Ross export block (line ~3709). **Recommend `defineSecret` inside `rossChat.js`** so the `onRequest({ secrets:[ANTHROPIC_API_KEY] }, …)` binding lives with the handler; `index.js` only re-exports. |
| `KNOWLEDGE BASE/api/CLOUD_FUNCTIONS_CATALOG.md` | Add `rossChat` entry (first AI-inference CF). |
| `public/kb/.../CLOUD_FUNCTIONS_CATALOG.md` | Mirror the same entry (both copies — Step 11 discipline). |

## Implementation Steps (TDD-ordered)

### Phase 1 — Billing prerequisite (idempotent debit)
1. **RED — `requestId` guard tests** (`functions/billing/__tests__/ledger.test.js`): write the 4 D3 cases; run, confirm fail. Risk: Low.
2. **GREEN — extend `recordUsageAndDebit`** (`functions/billing/ledger.js`): add `requestId` param, `debitGuardPath`, guard read/short-circuit/write. Keep existing atomicity-contract comment style. Risk: Medium (touches a LIVE billing fn — guarded by "no requestId → unchanged" so existing tests must stay green).

### Phase 2 — Auth helper
3. **RED — `verifyRossAgentAccess` tests**: admin / rossAgent-only / legacy-only / denied paths. Risk: Low.
4. **GREEN — add `verifyRossAgentAccess` + exports** (`functions/ross.js`). Do NOT touch `verifyUserOrAdmin`. Risk: Low.

### Phase 3 — Pure helpers for rossChat
5. **RED — `buildHistoryMessages` + `buildOwnerContext` + `runGates` tests** (`functions/agent/__tests__/rossChat.test.js`). Risk: Low.
6. **GREEN — implement the pure helpers** in `rossChat.js` (history reconstruction, owner-context assembly, gate evaluation returning a discriminated result `{ok:true}` | `{ok:false, terminal:'disabled'|'no-credit'|'not-entitled'}`). Risk: Medium (gate ordering + super-admin short-circuit correctness).

### Phase 4 — Agent loop + SSE handler
7. **RED — loop + dispatch + usage-accumulation tests** with fake client + fake-rtdb (D6). Risk: Medium.
8. **GREEN — implement the loop**: `configureClient(process.env.ANTHROPIC_API_KEY)`; build messages (systemBlocks + history + new msg); `streamTurn` with `onText` → SSE `data:` flush; per round-trip inspect `content` for `tool_use`; for each, `effectivePolicy` → `auto` → `executeTool` + stream "✓ …" action event + append `tool_result`; non-`auto` → refusal `tool_result`; accumulate `toLedgerUnits` from each `message_stop` usage; loop until no `tool_use`. Cap iterations (`maxTurns ~5`). Risk: High (streaming + multi-round-trip control flow).
9. **GREEN — SSE transport + CORS + gates wiring**: `onRequest({secrets:[ANTHROPIC_API_KEY]})` → `cors(req,res, async()=>{...})`; POST-only; set SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, flush); auth → gates → loop → debit → persist → `done` event. `ctx.now = Date.now()`. Risk: High.

### Phase 5 — Wiring + docs
10. **index.js**: `defineSecret` + re-export `rossChat`. Risk: Low (but unprovisioned secret blocks ALL deploys — see Risks).
11. **CLOUD_FUNCTIONS_CATALOG.md** (both copies). Risk: Low.

### Phase 6 — Verify
12. `cd functions && npm install` (worktree), `npm test` (agent + billing suites), then `npm run build` at repo root. Risk: Medium.

## SSE / transport specifics
- Event kinds (all `data: {json}\n\n`): `{type:'text', delta}`, `{type:'action', text:'✓ snoozed Daily Opening'}`, `{type:'terminal', reason:'no-credit'|'disabled'|'not-entitled', message}`, `{type:'error', message}`, `{type:'done', threadId, turnId, costCents}`.
- POST body: `{ message, threadId?, clientToday? }`. Validate `message` is a non-empty string ≤ a sane cap (e.g. 4000 chars) → 400 on fail.
- Flush after each write (`res.flush?.()` if available). End the response after `done`/`terminal`/`error`.
- CORS wrap is mandatory for browser SSE (spec review #6).

## Risks & Blockers
- **Unprovisioned `ANTHROPIC_API_KEY` blocks ALL function deploys.** Mitigation: `firebase functions:secrets:set ANTHROPIC_API_KEY` BEFORE any deploy; hard pre-deploy gate (CLAUDE.md deploy order + 2026-06-01 LESSON).
- **Streaming control-flow complexity** (multi-round-trip loop, partial flush, error mid-stream). Mitigation: keep the loop driven by the injected fake client; cap loop iterations (`maxTurns ~5`, spec §2.1) to prevent runaway spend.
- **Touching LIVE `recordUsageAndDebit`.** Mitigation: `requestId`-absent path is byte-for-byte the old behaviour; existing ledger tests must stay green.
- **Worktree CF deps** — `cd functions && npm install` required before build/test in this worktree.
- **Anthropic model ID drift** — `MODELS.AGENT='claude-sonnet-4-6'` has a "VERIFY at deploy time" note; confirm against current IDs before deploy-smoke.
- **`buildHomeWorkflowDigest` lazy-require of `../ross`** pulls a heavy module at first call; acceptable (established pattern) but adds cold-start latency to the first turn.

## Complexity Estimate
**Medium-High.** ~5 files changed + 2 new test files + 2 doc copies. The billing guard and auth helper are small/low-risk; the agent loop + SSE handler is the high-complexity core (Phase 4, steps 7–9). No new npm deps (`@anthropic-ai/sdk` + `zod` already present; Agent SDK NOT needed).

## Success Criteria
- [ ] `recordUsageAndDebit` is idempotent on `requestId`; double-call doesn't double-debit; legacy path unchanged (existing tests green).
- [ ] `verifyRossAgentAccess` admits admins + rossAgent (+ legacy flags), denies un-entitled; `verifyUserOrAdmin` untouched.
- [ ] Each failing gate produces the correct terminal SSE event with **zero** LLM calls and **zero** debit; super-admin skips (c)+(d).
- [ ] Loop auto-executes only `auto`/READY tools, audits each, feeds `tool_result`, refuses non-`auto` defensively, terminates on no `tool_use`.
- [ ] Usage accumulated from verbatim `message_stop` blocks; one `recordUsageAndDebit` call post-turn with `requestId`.
- [ ] Turn persisted to `ross/agentChats/{uid}/{threadId}/turns/{turnId}`; bounded history reconstructed correctly; threadId returned in `done`.
- [ ] `ctx.now` is server `Date.now()`, never client-supplied.
- [ ] Unit coverage ≥80% on `rossChat.js`; `npm run build` passes.
- [ ] Both `CLOUD_FUNCTIONS_CATALOG.md` copies updated.
- [ ] Secret provisioned before deploy; deploy-smoke checklist in PR (real SSE + real Anthropic call + CORS preflight).
