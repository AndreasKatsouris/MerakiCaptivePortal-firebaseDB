# askRoss Agent — Design Spec (② / 7A)

**Date:** 2026-05-31
**Status:** Draft for review
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
| Interaction model | **Reactive v1** (owner invokes "Ask Ross"), **proactive-ready architecture** — the turn loop takes a `turnSource` so a v2 cron drives the same agent with no rewrite |
| Tool catalog breadth | **Bands A + B** — read/grounding + workflow/run ops. Outward comms / money / destructive-config (C/D) deferred to v2 |
| Trust model | Graduated-by-risk (`auto` / `confirm` / `off`) defaults + owner overrides clamped by hard ceilings; audit trail; global kill switch |
| Models | **Sonnet 4.6** agent loop, **Haiku 4.5** for the eval judge (and future cheap tasks); behind one swappable `llm-client.js`; **prompt caching** on the stable prefix |
| Transport | **Streaming (SSE)** via `onRequest` from v1 |
| Eval scoring | **Programmatic assertions + Haiku-as-judge rubric** (20-prompt golden set, CI) |
| Billing | Pre-flight `checkBalance`; post-turn `recordUsageAndDebit` with the response's exact `usage` |

---

## 2. Where it runs & the turn loop

A new **`rossChat`** Cloud Function — `onRequest` (for SSE streaming),
`verifyUserOrAdmin`, Anthropic key via `defineSecret('ANTHROPIC_API_KEY')`.

```
rossChat(req) — one turn:
  0. turnSource = 'chat'  (v2: 'scheduled')
  1. PRE-FLIGHT GATES (no LLM call, no charge if any fail):
       a. ross/config/agentKillSwitch !== true
       b. ross/agentConfig/{uid}/enabled !== false
       c. effectiveEntitlements(uid).features.rossAgent === true   (entitlement gate)
       d. ledger.checkBalance(uid, DEFAULT_MIN_BALANCE_CENTS) === true
     → on fail: stream a friendly terminal state (disabled / no-credit / not-entitled)
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
       ledger.recordUsageAndDebit({ uid, service:'askRoss', model, units:usage, meta:{turnId} })
       write ross/agentAudit/{uid}/{turnId} for every executed tool
       persist the turn to ross/agentChats/{uid}/{threadId}
```

**Confirm-flow across HTTP:** a `confirm` action ends the streaming turn with a
`pendingAction` persisted at `ross/agentPending/{uid}/{turnId}` (with an
**expiry**, default 10 min). The client renders a confirm-card; the owner's
click POSTs back to `rossChat` with `{ resumeTurnId, decision }`, which replays
the conversation + the resolved tool_result and continues. (Stateless-friendly:
the agent never holds an open socket waiting for a human.)

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
| `submitResponse` | `rossSubmitResponse` | auto | honours 422 requiredNote |
| `snoozeCard` | `rossV2Snooze` | auto | |
| `advanceDueDate` | (recurrence advance) | auto | the core "paperwork" — rolls nextDueDate |
| `activateTemplate` | `rossActivateWorkflow` | **confirm** | entitlement-gated on `maxWorkflows` |
| `createWorkflow` | `rossCreateWorkflow` | **confirm** | changes the playbook |
| `editWorkflow` | `rossUpdateWorkflow` | **confirm** | changes the playbook |
| `pauseWorkflow` | `rossUpdateWorkflow` (status) | **confirm** | |

> **Tier rationale:** routine *execution* (start/submit/snooze/advance) is auto —
> it's the drudgery Ross exists to absorb, and each is reversible or low-stakes.
> Anything that *authors or changes the playbook itself* (create/edit/activate/pause)
> is confirm — it's the owner's policy. Bands C/D aren't in the registry at all in
> v1 (a tool that doesn't exist can't be called).

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
  `{ tool, args, result, tier, autoExecuted|confirmedBy, at }`.

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
  10 turns / ~4k tokens) in the suffix; older turns summarised or dropped. Keeps the
  uncached tail small (cost) and within window.

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
2. Tool registry + adapters (bands A+B) + policy engine + audit.
3. `rossChat` CF: pre-flight gates → agent loop → ledger debit → SSE.
4. Confirm-flow (pending action + resume).
5. Client: Ask Ross surface (SSE consumer, confirm-cards, terminal states).
6. Eval harness (20-prompt golden set, CI).
7. RTDB rules for the new `ross/agent*` nodes.

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
