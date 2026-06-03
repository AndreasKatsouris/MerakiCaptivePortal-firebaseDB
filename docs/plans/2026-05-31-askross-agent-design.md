# askRoss Agent — Design Spec (② / 7A)

**Date:** 2026-05-31
**Status:** Draft for review
**Revised:** 2026-06-03 — engine-agnostic core (§1.1) + per-engine billing (§2.1)
**Phase:** 7 (askRoss LLM program) — sub-project ② (the agent itself)
**Author:** Session brainstorm (Andreas + Claude)
**Sibling specs (merged):** `2026-05-31-metering-credit-ledger-design.md` (①),
`2026-05-31-entitlements-addon-layer-design.md` (④a)

---

## 0. Program context

Third sub-project of the Phase 7 program (see the ledger spec §0). Depends on the
two merged foundations:
- **① Ledger** — `checkBalance(uid)` pre-flight; `recordUsageAndDebit(...)` post-turn.
- **④a Entitlements** — `effectiveEntitlements(uid)` for the Ross-access gate + the
  `activateTemplate` `maxWorkflows` cap.

**North star:** *Ross runs the paperwork, not the restaurant.* The agent swallows
administrative drudgery (reads + workflow/run ops); guest comms, money, and
destructive/config actions stay the human's — deferred to v2.

---

## 1. Decisions locked during brainstorm

| Decision | Choice |
|----------|--------|
| Interaction model | **Reactive v1** (owner invokes "Ask Ross"), **proactive-ready architecture** — refined to *one engine-agnostic core, two engines* (§1.1): v1 reactive on the raw Messages API, v2 proactive on the Agent SDK, sharing tools/policy/audit/prompt |
| Tool catalog breadth | **Bands A + B** — read/grounding + workflow/run ops. Outward comms / money / destructive-config (C/D) deferred to v2 |
| Trust model | Graduated-by-risk (`auto` / `confirm` / `off`) defaults + owner overrides clamped by hard ceilings; audit trail; global kill switch |
| Models | **Sonnet 4.6** agent loop, **Haiku 4.5** for the eval judge (and future cheap tasks); behind one swappable `llm-client.js`; **prompt caching** on the stable prefix |
| Transport | **Streaming (SSE)** via `onRequest` from v1 |
| Eval scoring | **Programmatic assertions + Haiku-as-judge rubric** (20-prompt golden set, CI) |
| Billing | Pre-flight `checkBalance`; post-spend `recordUsageAndDebit` with the response's exact `usage` (per-engine profile in §2.1) |

---

## 1.1 Engine-agnostic core (refinement, 2026-06-03)

The original "one turn loop, two `turnSource`s" decision is sharpened to **one
engine-agnostic core, two engines.** v1 reactive and v2 proactive want *different
loop engines* — but share the valuable part, so the seam moves up a level.

- **Shared core** (`functions/agent/`): the tool registry + adapters (`tools.js`),
  the audit-wrapped runner (`execute.js`), the policy/tier engine (`policy.js`), and
  the mode-aware system prompt (`prompt.js`). **Zero dependency on either engine.**
  Zod is the single source of truth for each tool's args; `tools.js` projects the
  registry into raw-API JSON schema (`toAnthropicTools`) **and** Agent-SDK in-process
  MCP tools (`toSdkMcpServer`).
- **v1 reactive engine** — `rossChat`, **raw Messages API**. *Owns the loop* because
  it must pause mid-loop for the confirm-flow, debit per HTTP response, and gate
  before the first token (§2).
- **v2 proactive engine** (later) — `rossSweep`, **Claude Agent SDK**. *Rents the
  loop* for an unattended, long-horizon (`maxTurns ~30`) morning sweep with automatic
  context compaction.

**Policy enforcement is the one place the engines diverge** (because proactive has no
human to confirm to): reactive enforces tri-state in the loop
(`auto` / `confirm`-pause / `off`-refuse); proactive **collapses policy to a static
allowlist** — only `auto`-tier tools are handed to the SDK, `confirm`/`off` tools are
physically absent (a tool that doesn't exist can't be called, §3), and a deferred
suggestion is logged to the owner's morning digest via an `auto`-tier `proposeToOwner`
tool.

`ctx = { uid, turnId, turnSource: 'chat' | 'scheduled', confirmedBy?, now }` is the
data contract the core consumes; everything engine-specific lives in `ctx`, so the
core never imports either engine. **Convention (review #4):** an absent `confirmedBy`
means the tool ran in `auto` tier (no human approval needed, or already granted); a
present value names the owner/admin who approved a `confirm`-tier action — `execute.js`
stamps it into the audit row without tracing back here.

---

## 2. Where it runs & the turn loop

A new **`rossChat`** Cloud Function — `onRequest` (for SSE streaming),
Anthropic key via `defineSecret('ANTHROPIC_API_KEY')`.

> **Auth-helper build dependency (review #4):** the existing `verifyUserOrAdmin`
> (`ross.js:66-84`) admits non-admins only on `features.rossBasic ||
> features.rossAdvanced`. ④a's resolver writes `features.rossAgent` — so a
> Ross-entitled user lacking the legacy flags would be **denied at the auth step
> before reaching pre-flight gate (c)**. `rossChat` must use an auth helper that
> recognises `rossAgent` (extend `verifyUserOrAdmin` or add `verifyRossAgentAccess`).
> Build slice 1/2 dependency.

```
rossChat(req) — one turn:
  0. turnSource = 'chat'  (v2: 'scheduled')
  1. PRE-FLIGHT GATES (no LLM call, no charge if any fail):
       a. ross/config/agentKillSwitch !== true
       b. ross/agentConfig/{uid}/enabled !== false
       c. effectiveEntitlements(uid).features.rossAgent === true   (entitlement gate)
       d. ledger.checkBalance(uid, DEFAULT_MIN_BALANCE_CENTS) === true
     → on fail: stream a friendly terminal state (disabled / no-credit / not-entitled)
     → ADMIN SHORT-CIRCUIT (review #5): if isSuperAdmin, skip (c) entitlement +
       (d) balance so Sparks staff can test without comping themselves credit.
       Non-super admins and owners pass all four gates. Make this explicit so the
       implementer neither locks admins out nor adds an unauthenticated bypass.
  2. BUILD MESSAGES:
       [ cached system prefix ] [ cached owner-context ] [ history ] [ new message ]
  3. AGENT LOOP (Sonnet 4.6, streaming):
       stream assistant text tokens to the client as they arrive
       for each tool_use block:
         policy = effectivePolicy(tool, owner)              // §4
         auto    → execute server-side (owner-scoped CF), stream "✓ <did X>",
                   feed tool_result back, continue loop
         confirm → emit a confirm-card event, PAUSE; persist pending action;
                   end this HTTP turn. Owner's click re-enters rossChat with
                   { resumeTurnId, decision } → execute or feed "declined", continue
         off     → feed a refusal tool_result ("needs the owner"), continue
       loop until the model returns no tool_use
  4. POST-TURN:
       ledger.recordUsageAndDebit({ uid, service:'askRoss', model,
                                    units: toLedgerUnits(usage), meta:{turnId} })  // §2.1 req 1 — NOT raw `usage`
       write ross/agentAudit/{uid}/{turnId} for every executed tool
       persist the turn to ross/agentChats/{uid}/{threadId}
```

**Confirm-flow across HTTP:** a `confirm` action ends the streaming turn with a
`pendingAction` persisted at `ross/agentPending/{uid}/{turnId}` (with an
**expiry**, default 10 min). The client renders a confirm-card; the owner's
click POSTs back to `rossChat` with `{ resumeTurnId, decision }`, which replays
the conversation + the resolved tool_result and continues. (Stateless-friendly:
the agent never holds an open socket waiting for a human.)

**Resume safety (review #2 + #3) — RTDB has no native TTL, so enforce both in code:**
1. **Expiry check:** the resume handler reads `agentPending/{uid}/{resumeTurnId}.expiresAt`
   and **rejects with 410 Gone if `now > expiresAt`** before executing the tool —
   otherwise a pending action is valid indefinitely and replayable by anyone holding
   the `turnId`.
2. **One-time use:** on resume, **atomically consume** the pending node
   (`update({ \`ross/agentPending/${uid}/${resumeTurnId}\`: null })` as a guarded
   check-and-delete) *before* executing — so a double-click / replay can't fire the
   tool twice.
Both are explicit acceptance criteria on build slice 4.

---

## 2.1 Billing across the two engines (reactive vs proactive)

Both engines debit the same prepaid ZAR wallet via the ① ledger (`checkBalance`
pre-flight, `recordUsageAndDebit` post-spend), but the **spend profile differs enough
that billing is not identical**:

| Concern | v1 reactive (`rossChat`) | v2 proactive (`rossSweep`) |
|---------|--------------------------|----------------------------|
| Debit granularity | Per **HTTP response** — sum `usage` across every API round-trip in the loop within that response, debit once before returning | Per **run** — debit once at the end from the Agent SDK `result` message's aggregate usage |
| Pre-flight threshold | Small buffer (`DEFAULT_MIN_BALANCE_CENTS`); turns are bounded (`maxTurns ~5`) | Worst-case **sweep estimate** (`maxTurns × SWEEP_TYPICAL_TURN_COST_CENTS`) — it can't pause for low balance interactively, so gate high up front |
| In-run exhaustion | Covered by the min-balance buffer; optionally re-check between loop iterations | A **PreToolUse hook** checks balance before each tool call and **aborts the query** when exhausted — the proactive analog of the reactive between-iteration check; bound by `maxTurns` + a per-day budget cap |
| Who initiated the spend | Owner clicked "Ask Ross" — **explicit consent** | **Ross spends unattended** — needs explicit proactive opt-in + a daily spend cap, or it can drain the wallet overnight |

> **`SWEEP_TYPICAL_TURN_COST_CENTS` (review #3):** the proactive pre-flight estimate
> needs a concrete per-turn cost or the gate is unimplementable. Seed a tunable
> constant (~50¢ ≈ Sonnet 4.6 @ ~800 input + ~200 output tokens with the cache-read
> discount); promote it into the price table / config when the proactive engine
> launches so it tracks real rates.

**Cross-cutting requirements (both engines):**

1. **Cache-aware pricing — already handled by ① ; the work is a field-shape map.**
   ✅ **Verified 2026-06-03 against `functions/billing/ledger.js:50-69`:** the ledger's
   `computeTokenCost` already prices four token classes —
   `inputTokens` (100%), `outputTokens`, `cacheWriteTokens × cacheWriteMult` (~125%),
   `cacheReadTokens × cacheReadMult` (~10%) — with multipliers from the price table.
   No ledger amendment needed. **BUT** the ledger reads **camelCase `units`**
   (`inputTokens`), while the Anthropic API returns **snake_case `usage`**
   (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
   `cache_read_input_tokens`). The §2 shorthand `units: usage` would map every field to
   `undefined → 0` → **a silent zero charge every turn.** So **slice 1 (`llm-client.js`)
   must expose an explicit mapper** `toLedgerUnits(apiUsage)`:
   `{ inputTokens: u.input_tokens, outputTokens: u.output_tokens,
   cacheWriteTokens: u.cache_creation_input_tokens,
   cacheReadTokens: u.cache_read_input_tokens }` — unit-tested against a verbatim copy
   of a real Anthropic `usage` block (per the server-shape-mock lesson). With the §5
   two-breakpoint cache, the bulk of input is *cache reads*, so getting this map right
   is what makes the economics real. The first proactive run of the day pays the
   cache-*write* premium once (cold owner-context cache), then cache-reads across its
   internal turns.
   **Accumulation point (review #1):** in the streaming loop, call `toLedgerUnits` once
   **per API round-trip on the `message_stop` event's complete `usage` block** — *not*
   the incremental `message_delta` token counts — and accumulate `costCents` across the
   loop's round-trips. The unit-test mock copies a verbatim `message_stop` `usage`
   block, not an assembled one.

2. **Confirm-pause is billed twice.** Request A (up to the pause) already spent
   input+output tokens **even if the owner never confirms** — so **debit at pause**,
   not only at logical-turn-complete, or abandoned confirms are free. Request B (the
   resume continuation) debits again. Both linked by `meta.turnId`.

3. **Idempotent debits.** Key each debit by the HTTP-request / run id so a
   `confirm`-resume retry (reactive) or an `onSchedule` retry (proactive) can't
   double-bill. The §2 atomic one-time-consume guards the *tool*, not the *debit*.
   **Ledger-API gap (review #2):** this idempotency is **not achievable today** —
   `recordUsageAndDebit` generates its own `push().key` and runs the balance
   `transaction()` unconditionally (`functions/billing/ledger.js:148,162`); its internal
   `setWithRetry` only guards the *audit record* write, not the debit. So a billing-module
   extension must land **before the slice-3 debit call**: give `recordUsageAndDebit` an
   optional `requestId` that, when supplied, writes a one-time-consume guard at
   `billing/debitGuard/{uid}/{requestId}` **before** the balance transaction and
   short-circuits (returning the cached `{ costCents, balanceAfterCents }`) if it already
   exists — the same guard pattern as the §2 tool-consume. `rossChat` passes its Cloud
   Run request id; `rossSweep` passes the scheduler invocation id. Highest-value for v2
   proactive, where `onSchedule` auto-retries a crashed run.

4. **Attributable spend.** Tag `meta.turnSource` (`chat` vs `scheduled`) — ideally a
   distinct service label (`askRoss:chat` / `askRoss:sweep`) — so the wallet ledger
   shows the owner where their credit went, and surface the sweep's cost in the morning
   digest. Transparency is the antidote to surprise-drain churn.

---

## 3. Tool catalog (v1 — bands A + B)

Every tool is a **thin server-side adapter** over an existing owner-scoped CF /
module function, plus a risk-tier tag in a central registry
(`functions/agent/tools.js`). The agent acts **as the owner** — adapters call the
underlying CF logic with the owner's uid; no cross-tenant access.

| Tool | Adapts | Tier | Notes |
|------|--------|------|-------|
| `getWorkflowDigest` | `rossGetHomeWorkflowDigest` | auto | overdue / today / upcoming |
| `getWorkflows` | `rossGetWorkflows` | auto | |
| `getRunHistory` | `rossGetRunHistory` | auto | |
| `getReports` | `rossGetReports` | auto | completion stats |
| `getStaff` | `rossGetStaff` | auto | |
| `getFoodCostSummary` | food-cost module read | auto | summary only |
| `getGuestsSummary` | guest module read | auto | aggregate counts, no PII dump |
| `getSalesSummary` | sales-forecasting read | auto | |
| `startRun` | `rossCreateRun` | auto | idempotent |
| `submitResponse` | `rossSubmitResponse` | auto* | *measurement-gated — see §3.1; honours 422 requiredNote |
| `snoozeCard` | `rossV2Snooze` | auto | |
| `advanceDueDate` | (recurrence advance) | auto | the core "paperwork" — rolls nextDueDate |
| `activateTemplate` | `rossActivateWorkflow` | **confirm** | entitlement-gated on `maxWorkflows` |
| `createWorkflow` | `rossCreateWorkflow` | **confirm** | changes the playbook |
| `editWorkflow` | `rossUpdateWorkflow` | **confirm** | changes the playbook |
| `pauseWorkflow` | `rossUpdateWorkflow` (status) | **confirm** | |

> **Tier rationale:** routine *execution* (start/snooze/advance) is auto —
> it's the drudgery Ross exists to absorb, and each is reversible or low-stakes.
> Anything that *authors or changes the playbook itself* (create/edit/activate/pause)
> is confirm — it's the owner's policy. Bands C/D aren't in the registry at all in
> v1 (a tool that doesn't exist can't be called).

### 3.1 `submitResponse` is measurement-gated — the agent must never fabricate a record (review #1)

**The hard rule:** Ross has no sensors. It cannot measure a walk-in fridge temperature,
verify a fire extinguisher's date, or count a stock level. Auto-submitting a *value*
for such a task would **fabricate a regulatory-compliance record** — a food-safety /
liability risk, and a direct violation of "amplify, not replace." (The 422
`requiredNote` net stops an *incomplete* submission; it does **not** stop a *fabricated
primary value*.)

So `submitResponse` auto-execution is allowed **only** when the task's `inputType` is a
non-measurement type the agent can legitimately satisfy from the conversation —
`text`, `checkbox`, `signature` — **and** `inputConfig.requiredNote !== true`.

For **any measurement / attestation type** (`temperature`, `number`, `rating`,
`yes_no`, `photo`, or any task with `requiredNote === true`) the agent **must not
submit a value**. Instead it escalates: surface the task to the owner ("I've started
the Compliance Sweep — the fridge temp needs your reading") and let them enter the real
measurement. (Implementation: the `submitResponse` adapter inspects the target task's
`inputType`/`inputConfig` and refuses measurement types server-side — defence that
doesn't depend on the model behaving; codified in the eval harness §6 as a hard
assertion.)

---

## 4. Policy engine (`functions/agent/policy.js`)

```
effectivePolicy(tool, owner):
   ceiling = TOOL_CEILING[tool]            // hardest autonomy a tool may EVER have
   default = TOOL_DEFAULT[tool]            // auto | confirm | off
   override = ross/agentConfig/{uid}/policy/{tool}   // owner may TIGHTEN only
   return clampToCeiling(override ?? default, ceiling)
```

- **Hard ceilings** mean an owner can make a tool *stricter* (auto→confirm→off) but
  never *looser* than its ceiling. v1 ceilings: band-A/run-ops `auto`,
  playbook-ops `confirm`. (When C/D land in v2, guest-comms ceiling = `confirm`,
  POPIA-bulk = `off`.)
- **Global kill switch** `ross/config/agentKillSwitch` — superAdmin, halts all agents.
- **Per-owner enable** `ross/agentConfig/{uid}/enabled`.
- **Audit** every executed tool → `ross/agentAudit/{uid}/{turnId}/{i}`
  `{ tool, args, result, tier, autoExecuted|confirmedBy, at }`. For tools with **no
  native undo** (notably `advanceDueDate`), the audit entry also records the
  **prior value** (`prev: { nextDueDate }`) so an admin can restore it from the log
  if Ross mis-advances a deadline (review #9).

---

## 5. Prompt & caching (`functions/agent/prompt.js`)

Three segments, two cache breakpoints (Anthropic prompt caching):

1. **System prefix — CACHED, stable across all owners/turns:** identity, the
   "paperwork not restaurant" policy, the full tool catalog + per-tool tier rules,
   refusal rules (band C/D → "that's yours"), output/tone guidance (SA locale,
   concise, honest).
2. **Owner context — CACHED per session:** workflow/run digest, tier + effective
   entitlements, location names, current date (SA).
3. **Suffix — UNCACHED:** prior conversation turns (bounded — see §7) + the new
   user message.

Cache hits on (1)+(2) mean we pay full input price only on the small changing
tail — the economics that make a multi-tool agent loop viable (cache reads = 10%
of input price).

---

## 6. Eval harness (`functions/agent/evals/`, 20-prompt golden set)

Run in CI via the eval-harness skill. Each case asserts:
- **Tool selection** (programmatic): right tool(s) called for the intent.
- **Risk-tier respect** (programmatic): a prompt that tempts auto-running a
  `confirm` tool must *propose*, not execute (assert no auto-exec of confirm tools).
- **Refusal** (programmatic): band-C/D asks ("text all my guests a promo",
  "delete the compliance workflow") → refuse, no tool call.
- **Pre-flight states** (programmatic): low-balance / disabled / not-entitled →
  correct terminal state, no LLM spend.
- **Grounding + tone** (Haiku-as-judge rubric): answer is grounded in the tool
  results (no fabrication), SA-locale, concise, honest.

20 cases spanning: grounded Q&A, multi-tool turns, each confirm tool, each refusal
class, entitlement-gated activation, low-balance. Golden answers/assertions stored
alongside; mocked tool results copied verbatim from each CF's `res.json(...)`
(per the server-shape-mock lesson).

---

## 7. Conversation persistence

- Threads at `ross/agentChats/{uid}/{threadId}/turns/{turnId}` (owner-scoped,
  server-only writes; owner reads own via a CF).
- **Bounded context:** include the last N turns up to a token budget (default ~last
  10 turns / ~4k tokens) in the suffix; older turns **dropped** (oldest-first). Keeps
  the uncached tail small (cost) and within window. (Summarising older turns needs a
  second LLM call — **v2 enhancement**, not v1; review #7.)

---

## 8. Surfacing (client)

The existing **"Ask Ross"** panel (`RossHomeDesktop.vue`) + a command-palette modal
on `/ross.html`, replacing the scripted `askRoss()` stub in `ross-service.js`.
- Streams tokens (SSE) into the reply.
- Renders **confirm-cards inline** (the established v2 inline-confirm pattern, not a
  modal) for `confirm` actions; owner clicks resume the turn.
- Shows tool actions live ("✓ snoozed Daily Opening", "proposes: activate
  Compliance Sweep — Confirm / Cancel").
- Terminal states (no-credit → "ask an admin to top up", disabled, not-entitled)
  render as friendly inline banners.

---

## 9. Security

- Agent acts **as the owner**; every tool adapter calls owner-scoped logic with the
  owner's uid via Admin SDK — no cross-tenant reach.
- `ANTHROPIC_API_KEY` via `defineSecret` (never in code/client).
- Four independent pre-flight gates (kill switch, enable, entitlement, balance).
- Bands C/D physically absent from the tool registry in v1.
- Every executed tool audited; confirm actions record who confirmed.
- `ross/agentConfig`, `ross/agentAudit`, `ross/agentChats`, `ross/agentPending`,
  `ross/config/agentKillSwitch`: server-only writes; owner-scoped reads via CF.

---

## 10. Build slices (for the implementation plan)

1. `llm-client.js` (Anthropic SDK + prompt caching + streaming) — isolated, mockable.
2. **Engine-agnostic core** (`functions/agent/`, §1.1): `tools.js` (Zod registry +
   `toAnthropicTools`/`toSdkMcpServer` projections), `execute.js` (audit-wrapped runner
   + no-undo prev capture), `policy.js` (`effectivePolicy` + ceiling clamp),
   `prompt.js` (mode-aware cached system blocks). Built standalone + unit-tested with
   **zero engine dependency** — both v1 reactive and v2 proactive consume it. This is
   the twice-paying investment; build the seam clean, don't weld it to the raw-API loop.
3. `rossChat` CF: pre-flight gates → agent loop → ledger debit → SSE.
   **+ CORS** via the shared `cors-allowlist.js` (PR #94 pattern — `onRequest` SSE is
   browser-blocked without it; review #6). **+ update `CLOUD_FUNCTIONS_CATALOG.md`**
   (both copies) — `rossChat` is the project's first AI-inference CF (review #8).
   **+ the `rossAgent`-aware auth helper** (review #4).
   **+ extend `recordUsageAndDebit` with the optional `requestId` debit-guard**
   (§2.1 Point 3, review #2) — billing-module prerequisite for the debit call.
4. Confirm-flow (pending action + resume) — **incl. `expiresAt` 410 check + atomic
   one-time-use consume** (review #2/#3).
5. Client: Ask Ross surface (SSE consumer, confirm-cards, terminal states).
6. Eval harness (20-prompt golden set, CI).
7. RTDB rules for the new `ross/agent*` nodes.

*(v2, later)* `rossSweep` proactive engine — Agent SDK consuming the **same core**
(slice 2); adds a PreToolUse balance-abort hook + per-day budget cap (§2.1) + the
`proposeToOwner` digest tool (§1.1). Validates the engine-agnostic seam: if slice 2
was built clean, this is additive with no core changes. *(+ update
`CLOUD_FUNCTIONS_CATALOG.md` (both copies) when shipped — review #5.)*

---

## 11. Open questions (with recommendations)

1. **`rossAgent` entitlement feature flag** — gate Ross behind an entitlement
   (`features.rossAgent`) so it's tier/add-on controllable from day one? Recommend
   **yes** — it's free given ④a, and makes "Ross access" a sellable entitlement.
2. **Conversation retention** — prune `ross/agentChats` after N days (cost +
   the unbounded-node lesson)? Recommend a 90-day scheduled prune (reuse the
   retention-policy pattern already in the bug queue).
3. **Confirm-card expiry** — default 10 min for a pending action; tune with UX.
4. **`advanceDueDate` overlap with the recurrence-engine bug** — the Bug Triage
   Queue already has "nextDueDate never advances when a daily workflow goes
   uncompleted." `advanceDueDate` as an agent tool is *adjacent* but not a fix;
   note the dependency so the tool doesn't paper over the underlying engine gap.
5. **Streaming + confirm interplay** — confirm ends the HTTP turn (a tool can't
   block on a human mid-stream); the resume is a fresh request replaying context.
   Confirm this is acceptable UX vs a held connection (recommend the stateless
   resume — simpler, survives reconnects).
6. **Proactive spend cap & consent (§2.1)** — proactive Ross spends the owner's
   prepaid credit *unattended*. Recommend a separate
   `ross/agentConfig/{uid}/proactiveEnabled` opt-in (**default OFF**) + a
   `dailyBudgetCents` cap enforced by the PreToolUse balance-abort hook, with the
   morning digest reporting the run's cost. **Open:** is the default daily cap
   operator-global, or a per-tier entitlement (④a)? *(v2 decision — flagged now so the
   slice-2 core carries the budget field from day one.)*
7. **Cache-token pricing in the ① ledger (§2.1 req 1)** — ✅ **RESOLVED 2026-06-03.**
   Ground-truth check of `functions/billing/ledger.js:50-69` confirms the ledger
   already prices all four token classes (`cacheWrite`/`cacheRead`/`input`/`output`)
   with price-table multipliers — **no ledger change needed.** The residual work moved
   into slice 1: a `toLedgerUnits(apiUsage)` snake→camel mapper (the raw `units: usage`
   shorthand would silently zero-charge). Not a blocker, just a must-not-forget map.
