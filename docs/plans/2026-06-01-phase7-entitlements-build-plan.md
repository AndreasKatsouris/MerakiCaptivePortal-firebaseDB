# Implementation Plan — ④a Entitlement Resolver + Add-On Layer Build

**Date:** 2026-06-01
**Spec:** `docs/plans/2026-05-31-entitlements-addon-layer-design.md` (merged — implement verbatim)
**Branch/worktree:** `feature/phase7-entitlements-build`
**Status:** Awaiting operator confirmation (2 gating decisions below) before any code

---

## Overview
A server-side **entitlement resolver** becomes the **sole writer** of materialized
`subscriptions/{uid}/features` + `limits`; route all 7 current writers through it; then
**lock `subscriptions/$uid` `.write`** to close the live browser-side entitlement
self-grant vuln. Adds an à-la-carte add-on layer + superAdmin grant/cancel CFs + daily
expiry recompute + the first enforcement consumer (ROSS `maxWorkflows` cap). No paying
customers ⇒ tier-map drift moot; ④b deferred.

## ⛔ Two gating decisions (need operator sign-off before coding)
1. **Expired-subscription semantics (Step 11):** when a subscription expires, should the
   resolver **strip premium entitlements** (status→tier override → base/free set), or just
   keep whatever the `tierId` maps to? Determines the recompute behaviour on expiry.
2. **Self-serve tier change (Step 12):** `entitlementSetTier` is **superAdmin-only in v1**
   (a self-serve tier-change with no payment gate re-opens the self-upgrade vector). That
   means the client subscribe/upgrade/trial functions (`subscription-service.js`,
   `user-subscription.js`) can no longer self-mutate tiers. Confirm they should **degrade
   to a superAdmin-driven / "contact us" path** rather than function for end users.
   (Note: new-signup tier selection via `registerUser` is unaffected — it's server-side.)

---

## Ground-truth (planner-verified)
All spec claims confirmed: 7 writers (`index.js:593-594` registerUser, `:1011-1012`
createUserAccount; `subscription-service.js:179-180/248-249/406-407`;
`user-subscription.js:682`; `subscriptionStatusManager.js:60`); readers check
`subscription.features[X]` first (materialization is transparent); the vuln is
`database.rules.json:35-38`; CF pattern `ross.js:402-436`. **One harness gap:** the
billing `fake-rtdb.js` `update()` shallow-merges one node — it does NOT model root
multi-path `update({'a/b':v})`; the resolver tests must extend the fake (Step 7).

## Files
NEW `functions/entitlements/{constants,resolver,cloud-functions}.js` + `__tests__/`
(+ extended `helpers/fake-rtdb.js`); NEW `functions/seeds/{seedAddOnCatalog,backfillEntitlements}.js`.
EDIT `functions/index.js`, `functions/subscriptionStatusManager.js`, `functions/ross.js`,
`public/js/modules/access-control/services/subscription-service.js`,
`public/js/modules/user-subscription.js`, `database.rules.json`, docs ×3.

## Slices (TDD, ordered)
0. **Setup:** `cd functions && npm install` in the worktree.
1. **Resolver core** — `constants.js` (`UNLIMITED_SENTINEL=-1`, `mapToBaseTier`); `resolver.js`
   pure `mergeEntitlements(base, addOns, now)` (features OR; limits additive; `-1` overrides;
   exclude cancelled/expired) + `recomputeEntitlements(uid)` (read tier+addOns → atomic
   multi-path write to canonical `features`/`limits` paths) + `getDb()`/`__setDbForTests` seam.
2. **Tests FIRST** — merge golden vectors (OR/additive/sentinel/expired/base-only),
   `recompute` idempotency+materialization, `mapToBaseTier`; **extend fake-rtdb** for root
   multi-path update. ≥80% on resolver+constants.
3. **Writer consolidation (RISKIEST)** — server writers (registerUser, createUserAccount,
   subscriptionStatusManager) call `recomputeEntitlements`; client writers stop writing
   features/limits and route tier changes through `entitlementSetTier`. Each writer verified
   server-side BEFORE the rule lock.
4. **CFs** (`cloud-functions.js`) — `entitlementSetTier` (superAdmin), `entitlementGrantAddOn`
   /`entitlementCancelAddOn` (superAdmin), `entitlementGetEffective` (userOrAdmin self-scoped),
   daily `recomputeExpiringEntitlements` (`onSchedule`). Export from index.js.
5. **Rule lock** (same change-set, strict deploy order: **CFs → client → rules**) —
   `subscriptions/$uid` `.write` → admin/server-only; `.validate` rejects client
   `features`/`limits`. Deploying the rule before writers are server-side breaks signup —
   ordering is critical. Validate rules via `firebase deploy --only database`, not `require()`.
6. **ROSS enforcement** — `maxWorkflows` cap in `rossCreateWorkflow`/`rossActivateWorkflow`
   → 403 + upsell at cap; `-1` = unlimited; superAdmin bypass.
7. **Seeds** — add-on catalog seed (a workflow pack: `deltas.limits.maxWorkflows:+N`);
   one-off backfill `recomputeEntitlements` sweep (run AFTER the rule lock).
8. **Docs** — CLOUD_FUNCTIONS_CATALOG ×2 + ACCESS-TIER-SYSTEM.md.

## Testing
Pure unit (merge, tier-map, cap arithmetic) · RTDB-fake (recompute idempotency, CF inner
logic, cap gate) · emulator/manual (the 7 writer flows, rule-rejection of a simulated client
features write, CORS/Bearer shell, deploy ordering). ≥80% on resolver.

## Risks
Deploy ordering breaking signup (strict CFs→client→rules) · client self-serve flows 403 under
superAdmin-only setTier (decision #2) · materialized write-shape must match canonical paths ·
fake-rtdb root-multipath gap (extend it) · expired-sub semantics (decision #1) ·
last-write-wins concurrency (accepted v1, daily recompute safety net).

## Suggested PR slicing
(PR1) resolver+tests · (PR2) CFs+exports · (PR3) writer consolidation · (PR4) rule lock +
backfill (same change-set, ordered deploy) · (PR5) ROSS cap · (PR6) docs.
PR1/PR2 independently mergeable; PR3→PR4 land + deploy together.

## Complexity: Medium-High (writer consolidation + rule lock + deploy ordering is the hard, regression-prone core).

**STOP — awaiting operator sign-off on the 2 gating decisions before any code.**
