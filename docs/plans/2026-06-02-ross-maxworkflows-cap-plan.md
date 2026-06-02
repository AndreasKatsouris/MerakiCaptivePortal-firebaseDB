# Implementation Plan — PR5: ROSS `maxWorkflows` cap (entitlements ④a tail)

**Date:** 2026-06-02
**Spec:** `docs/plans/2026-05-31-entitlements-addon-layer-design.md` §8 (first enforcement consumer)
**Predecessor:** #125 (rule lock — resolver is the sole writer of `limits`; deployed)
**Decisions (operator):** Free cap = **5 active workflows**; **ship live** (set the tier value + recompute).

---

## Goal
Enforce `effectiveLimits.maxWorkflows` in the ROSS workflow-creation CFs → **403 + upsell** at cap. This is the limit the future workflow add-on packs sell against (`addOnCatalog` entry `deltas.limits.maxWorkflows: +N`).

## Design (tier-data-agnostic enforcement)
- The cap reads the **materialized** `subscriptions/{uid}/limits/maxWorkflows` (resolver-written). **Absent or `-1` → unlimited** (no cap). So All-in (no `maxWorkflows` def) is unlimited by absence, and the cap is inert for any tier until its limit is set — exactly PR #51's "ship mechanism, curate value."
- **Active count** = entries under `ross/workflows/{uid}` where `status !== 'paused'` (the existing active marker, per `rossGetHomeWorkflowDigest` ross.js:286). Paused workflows don't count toward the cap.
- **SuperAdmin bypasses** (mirrors the existing tier gate).
- Enforced in **both** `rossActivateWorkflow` (from template) and `rossCreateWorkflow` (from scratch), before the write.

## Slices
1. **Pure helper** `functions/ross-workflow-cap.js` — `workflowCapStatus({ maxWorkflows, activeCount, isSuperAdmin }) → { allowed, limit, current }` + `countActiveWorkflows(workflowsObj)` (pure; `status !== 'paused'`). Unit-testable like `ross-workflow-builder.js`.
2. **ross.js wiring** — `readUserMaxWorkflows(uid)` (reads materialized limit) + a shared `enforceWorkflowCap({uid, isSuperAdmin})` that reads limit + counts active + throws a typed cap error. Call it in both CFs before `buildWorkflowRecord`. 403 payload: `{ error, code: 'WORKFLOW_LIMIT_REACHED', limit, current, upgradeUrl: '/upgrade.html' }`. Audit-log via a `logWorkflowCapDenial` (mirrors `logActivationDenial`).
3. **Tier value live** — set `subscriptionTiers/free/limits/maxWorkflows = 5` (CLI) + run `recomputeExpiringEntitlements` to materialize for existing free users. Update the tiers seed for fresh deploys.
4. **Client (v2)** — `playbook-service.js` activate/create catch `WORKFLOW_LIMIT_REACHED` → surface an inline upsell banner linking `/upgrade.html` (no SweetAlert2 on v2).
5. **Tests** — `tests/unit/ross-workflow-cap.test.js`: unlimited (null/-1), at/under/over cap, superAdmin bypass, paused excluded from count.
6. **Docs** — ACCESS-TIER-SYSTEM + ROSS.md note the cap + the add-on-pack hook.

## Deploy order
CFs (`rossActivateWorkflow`/`rossCreateWorkflow`) → hosting → set tier value + recompute. (No rules change.)

## Risks
- A free user already over 5 active workflows when the cap goes live: enforcement only blocks **new** creates (never yanks existing — mirrors the downgrade policy). They stay over-cap until they pause/delete; no new workflows until under 5. Acceptable + documented.
