# Entitlement Resolver + À-la-carte Add-On Layer — Design Spec (④a)

**Date:** 2026-05-31
**Status:** Draft for review
**Phase:** 7 (askRoss LLM program) — sub-project ④a of the billing/entitlements work
**Author:** Session brainstorm (Andreas + Claude)
**Sibling spec:** `2026-05-31-metering-credit-ledger-design.md` (①)

---

## 0. Program context & build order

Phase 7 decomposed into four components (see the ledger spec §0). This spec covers
**④a — the entitlement resolver + à-la-carte add-on layer**, which a mid-design code
audit promoted ahead of the agent because it also closes a **live access-control
vulnerability** (see §1).

**Revised build order:**
```
① Credit Ledger  →  ④a Resolver + security fix + add-ons  →  ② askRoss Agent
                    (③ Payment Rail and ④b tier 4→2 migration sequenced after)
```

**Distinction from the ledger (they are siblings, not layers):**
- **Ledger** answers *"how much budget is left?"* (metered ZAR balance).
- **Entitlements** answers *"what is this owner allowed to do?"* (features, limits, add-ons).
- The agent consults both independently: entitlements to know *which* tools/templates
  are permitted; ledger to know if there's *budget* to run them.

---

## 1. Headline: the vulnerability this fixes

A code audit (2026-05-31) confirmed a **live privilege-escalation hole** in
`database.rules.json` (line 28):

```json
"subscriptions": {
  "$uid": {
    ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
    ".validate": "!newData.hasChild('tier') || root.child('subscriptionTiers')
                   .child(newData.child('tier').val()).exists()"
  }
}
```

**Any authenticated owner can write their own `subscriptions/{uid}` record from the
browser — including `features` and `limits`.** The only validation is that `tier`
names a real tier; nothing prevents `features/<anyPremiumFlag>: true` or
`limits/maxWorkflows: 99999`. This is **broken access control / entitlement
self-grant**, and it is **actively exercised** by existing client code
(`subscription-service.js` writes `features`/`limits` client-side from a hardcoded,
RTDB-unsynced constant).

**The fix is structural, not a one-line rule patch:** because the client legitimately
writes entitlements today, simply locking `.write` would break signup / tier-change /
trial flows. The correct fix is to **move all entitlement writes server-side behind a
single resolver** and then lock the rule. That is exactly what ④a builds — so the
security fix and the add-on layer are the same work.

Logged in the Bug Triage Queue as **High** (OWASP follow-on the prior audit missed).

---

## 2. Audit findings (ground truth, verified against code)

| # | Finding | Evidence | Implication for ④a |
|---|---------|----------|--------------------|
| A | `subscriptions/{uid}` already stores `features` + `limits` as **materialized objects** copied from the tier at write time | functions/index.js:593-594, 1011-1012; subscription-service.js:180,249,407 | Materializing *merged* entitlements into the same fields **fits the existing pattern** |
| B | Readers check `subscription.features[X]` / `limits[Y]` **first**, then fall back to constants | ross.js:77; queueManagement.js:87-88,114-115; access-control-service.js:244-272 | Materialization is transparent to consumers — **no reader changes needed** |
| C | **Seven divergent writers** of features/limits; server reads live from `subscriptionTiers`, **client writes from a stale hardcoded constant** | index.js:593-594,1011-1012; subscription-service.js:180,249,407; user-subscription.js:682; subscriptionStatusManager.js:60 | Sole-writer consolidation **fixes drift**; requires refactoring client writers (scope) |
| D | Limits go **stale** — never re-synced when a tier definition changes | readers read materialized copy, never live tier | Resolver `recompute` trigger fixes this |
| E | **No existing add-on infrastructure** (`addon`/`add-on` absent from codebase) | grep: 0 hits | Clean design space |
| F | ROSS 2-tier vs platform 4-tier conflict is **live**, not just docs — `ross-tier.js` accepts only `free`/`all-in`; a `starter` user is treated as `free` | ross-tier.js:8,11,20-23 | Reinforces ④b; the resolver papers over it via a tier-map until ④b lands |

---

## 3. Decisions locked during brainstorm

| Decision | Choice |
|----------|--------|
| Add-on model | À-la-carte add-on layer **on top of** the base tier |
| Add-on unit | **General entitlement deltas** — feature flags + additive limit increases (one mechanism for workflow/location/feature packs) |
| Tier direction | ROSS 2-tier (Free/All-in) is the **end-state**; the 4→2 collapse is **④b**, sequenced separately; the resolver is **tier-count-agnostic** |
| Security | Resolver is the **server-side sole writer** of `features`/`limits`; `subscriptions/$uid` `.write` locked to **admin/server-only** |
| v1 add-on granting | **superAdmin grant only** (no payment rail yet) — symmetric with the ledger's credit bridge |
| Downgrade/cancel policy | **Never yank** active usage; only block new — mirrors the documented ROSS tier-downgrade policy |

---

## 4. Data model (RTDB)

```
addOnCatalog/                      // superAdmin-defined; server-only writes
  {addOnId}/
    name, description
    priceZarCents                  // recurring price (charged by ③ later)
    billingPeriod: 'monthly'|'once'
    deltas/
      features/ {featureKey: true} // flags this add-on enables
      limits/   {limitKey: number} // ADDITIVE deltas; -1 sentinel = unlimited
    active: boolean

subscriptions/{uid}/               // .write now ADMIN/SERVER-ONLY (security fix)
  tier, tierId                     // existing (canonical + legacy mirror)
  status, startDate, trialEndDate  // existing
  features/ {...}                  // MATERIALIZED = base ⊕ add-ons  (resolver = sole writer)
  limits/   {...}                  // MATERIALIZED effective limits  (resolver = sole writer)
  addOns/                          // NEW: this owner's active add-ons
    {addOnId}/
      addOnId
      status: 'active'|'cancelled'
      grantedBy                    // superAdmin uid (v1) | 'payment-rail' (later)
      activatedAt
      expiresAt: number|null
  entitlementsUpdatedAt
```

---

## 5. The resolver (`functions/entitlements/resolver.js`)

`recomputeEntitlements(uid)` — the **single source of truth** and **sole writer** of
`features`/`limits`:

1. Read base tier features+limits from `subscriptionTiers/{tierId}` (via a
   `mapToBaseTier(tierId)` shim so legacy 4-tier IDs resolve until ④b — finding F).
2. Read active, non-expired add-ons from `subscriptions/{uid}/addOns`.
3. **Merge:** `features` = OR across base + every add-on; `limits` = base **+ Σ**
   add-on deltas (with `-1` = unlimited overriding any finite sum).
4. Write materialized `features` + `limits` + `entitlementsUpdatedAt`
   (atomic multi-path `update()`).

**Idempotent.** Triggered on: tier change, add-on grant/cancel, and a **daily
scheduled recompute** (reuse the `rossScheduledReminder` cron pattern) to expire
time-bound add-ons.

**Why materialize, not compute-on-read:** every existing gate reads
`subscriptions/{uid}/features` directly (finding B). Writing the merged result back
into that same shape means **zero consumer changes** — and the resolver becoming the
*only* writer is precisely what lets us lock the rule (§1).

---

## 6. Writer consolidation (the security-mandated refactor)

Every current entitlement writer (finding C) is re-pointed through the resolver:

| Current writer | Change |
|----------------|--------|
| `registerUser` (CF) | After creating the subscription, call `recomputeEntitlements(uid)` instead of inline-copying features/limits |
| `createUserAccount` (CF) | Same |
| `subscription-service.js` `createSubscription`/`updateSubscription`/`startFreeTrial` (CLIENT) | **Stop writing features/limits from the client.** Call a server CF (`entitlementSetTier`) that updates `tier` and recomputes server-side |
| `user-subscription.js` upgrade (CLIENT) | Route tier change through the same `entitlementSetTier` CF |
| `subscriptionStatusManager.js` | Still writes status/paymentStatus, **and now calls `recomputeEntitlements(uid)` directly** in the same execution immediately after writing `status: 'expired'` (synchronous direct call — not left to the daily cron, so an expired subscription loses premium entitlements at expiry, not up to 24h later). |

> **Concurrency note (low-risk in v1):** `recomputeEntitlements` reads-then-writes
> without a multi-path transaction, so two simultaneous add-on grants could
> last-write-wins (the second overwrites the first's contribution). Since v1 grants
> are **superAdmin-manual** (near-zero concurrency) and the **daily recompute** is a
> safety net that re-derives the correct merged state from the durable `addOns`
> sub-tree, last-write-wins is acceptable for v1. Revisit with a transaction if
> ③ Payment Rail introduces automated concurrent grants.

Then flip `subscriptions/$uid` `.write` to admin/server-only and add a `.validate`
that rejects client-supplied `features`/`limits`.

---

## 7. Public Cloud Functions

| CF | Auth | Purpose |
|----|------|---------|
| `entitlementSetTier` | **superAdmin** | Change base tier server-side + recompute (replaces client-side tier writes). **v1 = superAdmin-only** (see §12 Q3 — a `userOrAdmin` tier-change with no payment gate would let any owner self-upgrade to `all-in` for free, re-opening the exact vector this spec closes). Becomes `userOrAdmin` in v2 only when ③ Payment Rail enforces the charge before the call. |
| `entitlementGrantAddOn` | superAdmin | Attach add-on + recompute (v1 comp bridge; mirrors `billingGrantCredit`) |
| `entitlementCancelAddOn` | superAdmin | Cancel add-on + recompute |
| `entitlementGetEffective` | userOrAdmin | Owner reads own effective features/limits/add-ons |

Add-on catalog CRUD is superAdmin, script-only in v1 (no admin UI yet).

---

## 8. First enforcement consumer (in ROSS)

`rossCreateWorkflow` / `rossActivateWorkflow` check
`effectiveLimits.maxWorkflows` vs the owner's current active workflow count →
**403 + upsell** at cap. This is the limit the **workflow add-on packs** sell against
(`addOnCatalog` entry: `deltas.limits.maxWorkflows: +N`). Defined here; wired in the
ROSS consumer.

---

## 9. The resolver as the seam for ④b (tier 4→2 migration)

Because every gate reads materialized entitlements and the resolver is the sole
writer, the future 4→2 collapse reduces to: **change the base-tier inputs +
`mapToBaseTier`, then re-run `recomputeEntitlements` for all users.** No gate
rewrites, no consumer changes. The resolver decouples the risky migration from the
entire codebase — the same way the ledger core decouples metering from the payment
rail.

---

## 10. Security (post-fix posture)

- `subscriptions/$uid` `.write`: **admin/server-only**; `.validate` rejects
  client-supplied `features`/`limits`.
- `addOnCatalog`: server-only writes, superAdmin-managed.
- All entitlement mutations flow through CFs using the Admin SDK; owners can **read**
  their own effective entitlements (existing `$uid` read rule) and via
  `entitlementGetEffective`, but can **write nothing**.
- Closes the self-grant vector end to end.

---

## 11. Testing

- Resolver merge golden vectors: feature **OR**, limit **additive**, `-1` unlimited,
  expired add-on excluded.
- `recompute` idempotency (run twice → identical result).
- Writer-consolidation regression: signup / tier-change / trial still produce correct
  materialized entitlements via the server path.
- Security: a simulated client write to `subscriptions/{uid}/features` is rejected by
  rules.
- Cap-enforcement gate: at `maxWorkflows`, activate/create returns 403.
- Target 80%+ on the new resolver module.

---

## 12. Open questions — RESOLVED (2026-05-31, operator delegated "you decide")

1. **Limit merge semantics** — **LOCKED: additive + `-1` sentinel for unlimited**,
   exported as `UNLIMITED_SENTINEL = -1` in `functions/entitlements/constants.js`
   (named constant, not magic-number comparisons).
2. **Add-on expiry without payment rail** — **LOCKED: daily scheduled recompute**
   (reuse the `rossScheduledReminder` cron pattern) expires time-bound add-ons.
3. **`entitlementSetTier` self-serve scope** — **LOCKED: superAdmin-only in v1.**
   A `userOrAdmin` tier-change with no payment gate would let any owner self-upgrade
   to `all-in` for free — the same privilege-escalation class this spec closes. §7
   updated to `superAdmin`. Becomes `userOrAdmin` in v2 when ③ Payment Rail enforces
   the charge before the call.
4. **`mapToBaseTier` table** — **RESOLVED: operationally moot — there are no paying
   customers** (operator confirmed 2026-05-31). No live entitlement records carry
   revenue, so the mapping carries no migration risk. Default: `free → free`,
   `starter → free`, `professional → all-in`, `enterprise → all-in` (sane fallback for
   any stray test records); the backfill recompute (#5) re-materializes everyone
   correctly regardless. **This also de-risks ④b** — the future 4→2 collapse is no
   longer a "carefully migrate live paying records" job; it's effectively a config
   change + a recompute sweep over test data.
5. **Backfill** — **LOCKED:** a one-off `recomputeEntitlements` sweep over all users
   re-materializes correct entitlements post-deploy (idempotent; safe to re-run),
   correcting any client-written drift in existing records.

> **Intentional, not a bug:** `addOns/{addOnId}/addOnId` stores the key inside the
> record (standard RTDB convenience to survive snapshot key-loss).
