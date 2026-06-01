# Implementation Plan — ④a PR4: `subscriptions/$uid` Rule Lock (close the High self-grant vuln)

**Date:** 2026-06-01
**Spec:** `docs/plans/2026-05-31-entitlements-addon-layer-design.md` §1, §6, §10
**Build plan parent:** `docs/plans/2026-06-01-phase7-entitlements-build-plan.md` (slices 5–7)
**Predecessors merged:** #116 (resolver + CFs), #118 (catalog), #120 (PR3 server-writer consolidation)
**Status:** READY — #120's CFs deployed 2026-06-01 (prerequisite met); Q1–Q3 settled (§9). Security-reviewer mandatory before merge.

---

## 0. Why this PR is gated on #120's deploy

The whole point is to flip `subscriptions/$uid` `.write` from "owner or admin" to **admin/server-only**, and add a `.validate` that **rejects client-supplied `features`/`limits`**. The moment that rule deploys:

- Any client write to `subscriptions/$uid` by a **non-admin** is blocked.
- Any client write (even admin-token) that includes `features`/`limits` is **rejected by `.validate`** (Admin SDK bypasses `.validate`; browser SDK does not).

So **every remaining client writer must be routed server-side BEFORE the rule deploys**, or it breaks the moment the rule lands. Strict deploy order (2026-05-19 lesson):

```
1. Deploy the new/updated CFs (server writers)        ← must be live first
2. Deploy hosting (client no longer writes the node)  ← then the client
3. Deploy database.rules.json (the lock)              ← rules LAST
```

#120 already did step 1 for the 3 server paths + step 2 for the user-side client writers. PR4 does the **remaining** client writers + the rule.

---

## 1. Full client-writer audit (ground truth — verified file:line)

Writers to `subscriptions/$uid` that still write `features`/`limits` and/or would break under the lock:

| # | Writer | file:line | Auth context | Breaks under lock because | Fix |
|---|--------|-----------|--------------|----------------------------|-----|
| A | Admin single tier-change | `admin/subscription-status-manager.js:346-353` | admin (browser) | writes `features`/`limits` client-side → `.validate` rejects | Route through `entitlementSetTier({uid,tierId})` CF |
| B | Admin bulk tier-migration | `admin/subscription-status-manager.js:463-470` | admin (browser) | same; loops many users | `entitlementSetTier` per user (or a new bulk CF) |
| C | Admin single tier-update | `admin/enhanced-user-subscription-manager.js:865-870` | admin (browser) | same | `entitlementSetTier` per user |
| D | Admin bulk migration | `admin/enhanced-user-subscription-manager.js:1407-1412` | admin (browser) | same | `entitlementSetTier` per user |
| E | Signup Path-B fallback | `signup/v2/signup-service.js:179-237` | the **new non-admin user** (browser) | writes the WHOLE subscription record → `.write` blocks it entirely | See §3 — this is the hard one |
| F | `locationIds` user writes | `subscription-service.js:533,569`; `user-subscription.js` (if any) | owner (browser) | `.write` blocks any owner write to the node | Route through a CF, or carve `locationIds` to an admin-only sub-path policy |
| G | Dead service writers | `subscription-service.js` createSubscription/updateSubscription/startFreeTrial | n/a (no callers, ⚠ DEAD-marked in #120) | would be blocked, but unused | Leave (already DEAD-marked) — lock makes them fail at rule level, acceptable |

> Other matches from the grep are **reads** (`get(...)`) or `history/` appends. The `history/` appends (A–D, and admin `subscription-status-manager.js:500`) are writes to `subscriptions/$uid/history/...` — **these also break under a blanket `.write` lock**. Decide in §2 whether the lock is at `$uid` (blocks history too) or shaped to allow admin history appends.

---

## 2. The rule change (decision required)

Spec §10 says `.write` admin/server-only + `.validate` rejects client `features`/`limits`. Two shapes:

**Option A — blanket lock at `$uid`:**
```json
"$uid": {
  ".write": "auth != null && auth.token.admin === true",
  ".validate": "!(newData.hasChild('features') || newData.hasChild('limits')) || auth.token.admin === true"
}
```
- Simple. Admin-token browser writes still allowed for non-entitlement fields, BUT the `.validate` above still lets an admin write features/limits from the browser — so to truly force the resolver, the `.validate` must reject features/limits **even for admins** (since admin tier-changes route through the CF/Admin SDK which bypasses `.validate`). Stricter `.validate`:
  ```json
  ".validate": "!newData.hasChild('features') && !newData.hasChild('limits')"
  ```
  This rejects ANY client write (admin or not) that carries features/limits; the resolver (Admin SDK) bypasses it. **Recommended** — it's the real enforcement of "resolver is sole writer."

**Option B — field-level lock:**
```json
"$uid": {
  ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)",
  "features": { ".write": "auth.token.admin === false && false" },  // server-only
  "limits":   { ".write": false },
  ...
}
```
- More surgical (owners keep writing non-entitlement fields like `locationIds`, history), but RTDB field-level `.write: false` under a permissive parent `.write` is the **dead-rule trap** (2026-05-12 lesson): the parent `.write` grants, children can't un-grant via `.write:false` in the way you'd expect — a parent `.write:true` makes the whole subtree writable. Field-level `.write` only **adds** permission, never removes. **So Option B does NOT work for restricting features/limits under a writable parent.** ❌

**Conclusion: Option A with the strict `.validate` (reject features/limits from all client writes) + `.write` admin-only.** This means:
- Owners can no longer write ANY part of `subscriptions/$uid` from the browser (incl. `locationIds`, `history`) → writers E, F, and admin `history` appends must all move server-side.
- Admins can write non-entitlement fields (tier, status, history, locationIds) from the browser, but NOT features/limits (resolver-only).

**Q1 RESOLVED (§9): Option A.** Admins keep browser writes for non-entitlement fields (tier/status/history/locationIds); only the entitlement-bearing writes (A–D) route through the CF. Admin history appends stay (admin-token allowed).

---

## 3. The signup Path-B fallback (writer E) — the hard problem

`signup-service.js` writes the full `users`/`subscriptions`/`onboarding-progress` records client-side as a **fallback** when the `registerUser` callable fails. Under the `.write` lock, this fallback (running as the freshly-created non-admin user) is **fully blocked** → signup breaks for any case where the callable fails.

History (2026-05-12 LESSON): `registerUser` callable was throwing `unauthenticated` for months due to a v1→v2 signature bug; the silent fallback masked it. **#67 fixed the callable signature.** So the callable should now be reliable.

**Options:**
1. **Drop the client fallback entirely**, rely on the (now-fixed) `registerUser` callable. Risk: if the callable fails for any reason, signup hard-fails with no fallback. Mitigation: surface the error properly (the #58/#67 lessons flagged the silent-swallow anti-pattern).
2. **Keep a fallback, but make it a server CF** — a thin `registerUserFallback` CF, or make the client retry the callable. Adds infra.
3. **Verify the callable is reliable first** (`firebase functions:log --only registerUser` for recent successful invocations — the 2026-05-12 "verify CF actually executes" lesson), then do (1).

**Q2 RESOLVED (§9): drop the fallback.** `firebase functions:log --only registerUser` showed no recent invocations (near-zero signup traffic) and #67 already validated the callable end-to-end on prod. PR4 removes the client subscription-write fallback, surfaces callable errors loudly (no silent swallow), and gates merge on a preview-channel signup smoke test. Still the riskiest single change in PR4 — keep it as its own commit with the preview test.

---

## 4. `locationIds` writes (writer F)

`subscription-service.js:533,569` (and any `user-subscription.js`) update `subscriptions/$uid/locationIds` from the owner's browser. Under the lock these break. Options:
- Route through a small `setUserLocations`-style CF (userOrAdmin), OR
- Confirm these are admin-only flows in practice (then admin-token survives), OR
- Confirm they're dead (grep callers — same discipline as the 3 dead writers).

**Action:** grep live callers of `addLocationToSubscription`/`removeLocationFromSubscription` (or whatever wraps :533/:569) at implementation time; route or confirm-dead accordingly.

---

## 5. Backfill

One-off `recomputeEntitlements` sweep over all users (idempotent) AFTER the rule deploys, to re-materialize any client-written drift. Spec §12 Q5. Reuse the `recomputeExpiringEntitlements` cron logic as a script, or trigger it manually. No paying customers → zero migration risk (spec §12 Q4).

---

## 6. Slices (TDD where applicable; deploy order is the spine)

1. **Pre-flight verification** — `firebase functions:log --only registerUser` confirm recent successes (gates §3); grep live callers of writers A–F.
2. **Route admin writers A–D** through `entitlementSetTier` (per user; loop for bulk). **Q3 RESOLVED (§9): relax `entitlementSetTier` superAdmin → admin** (`token.admin === true`), since the admin tier UIs sit behind plain admin access. Keep it NOT `userOrAdmin` (owners can't self-mutate). Add a bulk variant or loop per user for B/D.
3. **Resolve signup fallback (E)** per §3 decision.
4. **Resolve locationIds (F)** per §4.
5. **Deploy CFs** (any new/changed) + **hosting** (client writers gone). Verify each via log sentinel (2026-05-15 lesson).
6. **Rule lock** — `database.rules.json` `subscriptions/$uid` per §2 Option A. Validate via `firebase deploy --only database` (not `require()`), in a preview/emulator first. Deploy LAST.
7. **Backfill sweep** — run after the rule is live.
8. **Security review** — `security-reviewer` agent on the rule + the routed writers (mandatory per spec).
9. **Docs** — `ACCESS-TIER-SYSTEM.md` + note the lock in `DATABASE_RULES_GUIDE.md` (watch the 2026-05-19 doc-vs-LESSON `.validate`/Admin-SDK consistency check).

ROSS `maxWorkflows` cap = **PR5** (separate, spec §8); not in PR4.

## 7. Testing
- Rule-rejection: simulated client write to `subscriptions/$uid/features` is **rejected** (emulator or preview).
- Each routed writer (A–F) verified server-side BEFORE the lock deploys.
- Signup smoke (golden path + simulated callable failure) on a preview channel.
- Admin tier-change smoke (single + bulk).
- Backfill idempotency (run twice → identical).

## 8. Risks
- **Deploy ordering** — rule before CFs/hosting breaks signup + admin tier changes. Spine of the plan.
- **Signup fallback removal** — highest-risk; needs the callable-reliability check + preview signup test (§3).
- **superAdmin vs admin on `entitlementSetTier`** — admin UIs may be used by non-super admins (Q3).
- **history/locationIds owner writes** blocked by the blanket lock (§2/§4) — must be routed or confirmed-dead.
- **`.validate` reject-features/limits must reject admins too** (else the hole stays open for admin-token browser writes) — the dead-rule trap (Option B) does NOT achieve this; Option A does.

## 9. Decisions — SETTLED 2026-06-01 (operator delegated "you decide")

- **Q1 — rule shape: LOCKED → Option A.** `.write` admin-only + `.validate` rejecting any client write carrying `features`/`limits` (admins included; resolver/Admin SDK bypasses `.validate`). Admins keep browser writes for non-entitlement fields (tier/status/history/locationIds); only entitlements are resolver-only. Field-level Option B rejected (dead-rule trap).
- **Q2 — signup Path-B fallback: LOCKED → drop it.** Evidence: `firebase functions:log --only registerUser` shows NO recent invocations (only deploy/startup events) → near-zero live signup traffic, nothing to regress; and #67 already validated the callable end-to-end on prod (fresh signup + invalid-tier negative test). PR4 removes the client subscription-write fallback, surfaces callable errors properly (no silent `console.warn` swallow — 2026-05-12 lesson), and gates merge on a **preview-channel signup smoke test** (golden path). If the callable ever fails post-lock, signup hard-fails loudly rather than silently mis-provisioning.
- **Q3 — `entitlementSetTier` auth: LOCKED → relax superAdmin → admin (`token.admin === true`), NOT `userOrAdmin`.** Evidence: the two admin tier UIs (`subscription-status-manager.js`, `enhanced-user-subscription-manager.js`) have no superAdmin gate — they sit behind plain admin-dashboard access. The spec's superAdmin default (§7/§12 Q3) existed to block *owner self-upgrade* (`userOrAdmin` with no payment gate); an **admin** changing another user's tier is a trusted-operator action, not self-service, so admin-claim is the correct posture. Owners still cannot self-mutate (that needs ③ Payment Rail). `GrantAddOn`/`CancelAddOn` stay superAdmin. Add a bulk variant or loop `entitlementSetTier` per user for the bulk-migration UIs (B, D).

## Complexity: HIGH. The rule lock is one line; making it safe (route 6 writer classes, rework the signup fallback, get the deploy order right) is the work. Security-reviewer mandatory.
