# H-2 — Cross-Tenant RTDB Read Hardening (Design)

**Status:** Design / awaiting decision on Bucket C approach
**Source:** OWASP audit 2026-05-30 (`owaspaudit20260530.html`), finding H-2
**Author:** security remediation session, 2026-05-30

## Problem

Nine RTDB root nodes are readable by *any* authenticated user — including
anonymous WiFi-login guests:

`guests`, `users`, `subscriptions`, `receipts`, `salesData`, `salesDataIndex`,
`forecasts`, `forecastIndex`, `queue` (+ `queues`, `rewards`).

Each has a root `".read": "auth != null"`. Several have correctly-scoped
per-child rules (`$uid` requires `auth.uid === $uid`, `$salesDataId` checks
`data.child('userId').val() === auth.uid`). **Those child rules are dead** —
in RTDB, read permission *cascades*: a `true` at a parent grants read to the
entire subtree regardless of child rules. So the root `auth != null` exposes
every tenant's PII to every authenticated account.

## The hard constraint (why this isn't a one-line fix)

**RTDB evaluates a query's `.read` at the queried node, and rules cannot
filter query results.** A location-scoped query like:

```js
query(ref(rtdb, 'guests'), orderByChild('locationId'), equalTo(locId))
```

requires `.read` on the **`guests` root**. There is no rule that says "allow
this query only for rows where `locationId` is yours" — RTDB rules are
all-or-nothing per node, they don't post-filter. So any node that is read via
a **root-level query** by non-admin users cannot simply have its root locked
to admin without breaking that read.

This splits the 9 nodes into three buckets with very different fixes.

## Node classification (from consumer mapping, 2026-05-30)

### Bucket A — direct keyed reads only → **safe to lock now**
Data is keyed by owner/location and read by **direct path** (not a root query).
Locking the root and adding a scoped child rule does NOT break clients.

| Node | Non-admin client reads | Fix |
|------|------------------------|-----|
| `users` | `users/${uid}` (user-service) — direct | root → `admin === true`; keep `$uid` child read `auth.uid === $uid \|\| admin` |
| `subscriptions` | `subscriptions/${uid}` (feature-access-control, user-service) — direct | root → `admin === true`; child already scoped |
| `salesDataIndex` | `salesDataIndex/byLocation/${locId}` — direct | root → admin; add `byLocation/$locId` read `root.child('userLocations').child(auth.uid).child($locId).exists() \|\| admin` |
| `forecastIndex` | `forecastIndex/byLocation/${locId}` — direct | same `userLocations` cross-ref pattern |
| `salesData` | `salesData/${id}` — direct (id from index) | root → admin; child `data.child('userId').val() === auth.uid \|\| admin` (already present) |
| `forecasts` | `forecasts/${id}` — direct | same as salesData |

**Blocker for Bucket A:** two non-admin utilities read the *whole* `users` /
`subscriptions` node and would break + are themselves part of the leak:
- `public/js/utils/phone-number-monitoring.js:31` — `PhoneNumberMonitor`
  constructor auto-starts an `onValue` listener on **all** `users`. Guarded
  only by a global `rtdb` check. Must be admin-gated, removed, or confirmed
  dead (it relies on a global `rtdb` that module code may never set) **before**
  locking `users`.
- `public/js/utils/subscription-validation.js:165` — `auditAllSubscriptions()`
  reads all `subscriptions`. Audit utility; gate to admin or route via CF.

### Bucket B — index exists, queries are by location → **lock + child rule**
`salesDataIndex` / `forecastIndex` are technically Bucket A (direct
`byLocation/${locId}` reads), but `salesData`/`forecasts` document reads chain
off them. ROSS detectors (`detectors.js`, `sidebar-detectors.js`) and the
sales-forecasting module read these. All scope through `userLocations/${uid}`
already, so the `userLocations` cross-reference rule works without client
changes. **Folded into Bucket A above.**

### Bucket C — root-level location *queries* → **needs refactor before locking**
Non-admin users read these via a **root query** (`orderByChild('locationId')`
/ `orderByChild('phoneNumber')`), which requires root read. Cannot lock the
root without first changing how the client reads.

| Node | Non-admin root-query readers | Why it can't just be locked |
|------|------------------------------|------------------------------|
| `guests` | `user-dashboard.js:552`, `statistics-service.js:36`, `ross/v2/detectors.js:207`, `sidebar-detectors.js:164` — all `query(guests, orderByChild('locationId'), equalTo(locId))` | root query needs `guests` root read |
| `queue` / `queues` | `queue-management.js:559` `onValue(ref('queues'))` (root listener); `ross/v2/sidebar-detectors.js:43` reads `queue/${locId}/entries` (direct — Bucket A-able) | `queues` root listener needs root read |
| `receipts` | No confirmed non-admin root reads (all readers are admin-dashboard). Likely **Bucket A** — verify then lock. | — |

**Bucket C options (decision needed):**
1. **Location-indexed restructure** — add `guestsIndex/byLocation/${locId}` (like
   `salesDataIndex`) and change the 4 guest readers to read the index by direct
   path. Then lock `guests` root to admin. Most work; cleanest end state; mirrors
   the existing sales-data pattern.
2. **CF-mediated reads** — a `getGuestsByLocation` CF (Admin SDK, scopes to the
   caller's `userLocations`) replaces the 4 client queries. Lock `guests` root.
   Medium work; centralizes authz; adds latency/cost per read.
3. **Keep root readable, accept residual exposure on Bucket C only** — lock
   Buckets A/B now (the bulk of the PII: users, subscriptions, sales, forecasts),
   leave `guests`/`queues` root-readable pending the refactor. Reduces blast
   radius immediately; defers the hardest 2 nodes.

## Recommended sequencing

- **PR 1 (Bucket A/B, low-risk):** lock `users`, `subscriptions`, `salesData`,
  `salesDataIndex`, `forecasts`, `forecastIndex` roots to admin; add
  `userLocations` cross-ref child rules on the two indexes. First resolve the
  two whole-node utilities (`phone-number-monitoring`, `subscription-validation`).
  Validate with `firebase_validate_security_rules` + the emulator + a smoke of
  user-dashboard, feature-access, sales-forecasting, and ROSS detectors.
- **PR 2 (Bucket C):** per the chosen option (1/2/3) for `guests`, `queue`,
  `receipts`. `receipts` likely lockable immediately if the admin-only-reader
  finding holds.

## Verification plan (both PRs)
- `firebase_validate_security_rules` (rtdb) on every change.
- RTDB emulator: as a non-admin user with one owned location, confirm: can read
  own `users/$uid`, own `subscriptions/$uid`, own-location index entries; CANNOT
  read another uid / another location / list the root.
- As admin: all dashboards still load.
- Preview-channel smoke: user-dashboard stats, feature-access gating, sales
  forecasting load, ROSS home + sidebar detectors, admin guest/receipt/sub mgmt.

## Notes
- `rewards` (`.read: auth != null`, audit L-3) and `locations` have the same
  cascade issue; fold `rewards` into PR 1 if low-risk.
- Writes are already admin-scoped on most of these; this design is read-only.
