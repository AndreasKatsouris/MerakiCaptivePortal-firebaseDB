# Plan — Slice 2: askRoss Engine-Agnostic Core

**Date:** 2026-06-03
**Branch:** `feat/askross-agent-core`
**Spec:** `docs/plans/2026-05-31-askross-agent-design.md` §1.1, §3, §3.1, §4, §5, §10

## Goal
Build `functions/agent/` — the engine-agnostic core both the v1 reactive engine
(raw Messages API, slice 3) and the v2 proactive engine (Agent SDK, later) consume.
Zero hard dependency on either engine. TDD, mirroring `functions/billing` +
`functions/entitlements` conventions (`getDb()` seam, `module.exports={}`, Node 22,
tests in `__tests__/*.test.js` via root vitest, reuse the entitlements `fake-rtdb.js`).

## Scope decision (approved 2026-06-03)
The 16-tool catalog is not uniformly buildable yet (separability audit):
- **Ready now** (self-contained reads/writes): `getWorkflowDigest`, `getStaff`,
  `getRunHistory`, `snoozeCard` → real adapters via the agent `getDb()` seam.
- **Needs extraction** (logic inlined in `ross.js`): `getWorkflows`, `getReports`,
  `createWorkflow` → defer (touches shared `ross.js`).
- **Doesn't exist**: `getFoodCostSummary`/`getGuestsSummary`/`getSalesSummary` (no
  reader CF/schema), `advanceDueDate` (no recurrence logic; overlaps §11 Q4 bug),
  `startRun`/`submitResponse`/`activateTemplate`/`editWorkflow`/`pauseWorkflow`
  (mutation logic best wired in slice 3 / behind the confirm-flow).

**Slice 2 = core machinery + the 4 ready read/write adapters.** All 16 tools are
*defined* in the registry; deferred ones carry `status: 'pending'` (catalog-complete
but never exposed to an engine — `run` throws `AdapterPendingError`). The §3.1
measurement-gate predicate (`isAgentSubmittable`) is built + unit-tested now as a pure
function for slice 3 to wire into `submitResponse`.

## Files
- `functions/agent/constants.js` — tiers/ceilings ranks, MODE/STATUS enums, NO_UNDO set,
  MEASUREMENT_INPUT_TYPES + `isAgentSubmittable` (§3.1), RTDB path helpers.
- `functions/agent/policy.js` — `clampToCeiling` + `effectivePolicy` (tighten-only). Pure.
- `functions/agent/prompt.js` — `systemBlocks({mode, tools, ownerContext})`, two
  `cache_control: ephemeral` breakpoints, mode-aware identity. Pure.
- `functions/agent/tools.js` — Zod registry; `toAnthropicTools` (Zod→JSON schema),
  `toSdkMcpServer` (lazy + `__setSdkForTests` seam → zero engine dep), `enabledTools`,
  `autoAllowlist`, `catalogForPrompt`. `getDb()` seam.
- `functions/agent/execute.js` — `executeTool(ctx,name,args)`: NO_UNDO prev capture →
  `run` → audit write. `getDb()` seam.
- `functions/agent/__tests__/` — policy / prompt / tools / execute suites + copied
  `helpers/fake-rtdb.js`.

## Deps
Add `zod` + `zod-to-json-schema` to `functions/package.json` (+ `npm install` in
`functions/`). Agent SDK NOT added (lazy-required + test-seamed).

## Out of scope (scoped follow-ups, logged to backlog)
3 `ross.js` extraction refactors; 3 reader CFs (food-cost/guests/sales); recurrence
`advanceDueDate`; the mutation adapters' live wiring; `llm-client.js` (slice 1);
`rossChat` (slice 3); confirm-flow (slice 4); client (slice 5); evals (slice 6);
rules (slice 7).
