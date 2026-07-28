# Sales / Forecast Write-Cascade Remediation — Design v2

**Date:** 2026-07-28
**Findings:** Bug-triage row "salesData/forecasts `.write` root cascade bypass" (**High**, raised 2026-07-04); originally 2026-05-31 (PR #111 review, create-only variant)
**Status:** DESIGN v2 — revised after two adversarial pre-build reviews (security + ground-truth)
**Scope:** `database.rules.json` (4 nodes) + 3 small client fixes in `sales-data-service.js` + a probe script.

> **v1 → v2.** v1's index rule was **bypassable** and its §4 closure claim was **false**; two factual
> claims (§5's "highest-risk call site", §7's "invisible to the founder") were **wrong**; the census
> was **materially incomplete**. All folded below. v1 is in git history — the diff is the record.

---

## 1. The defect, verified against live rules

`database.rules.json:499-534`:

```jsonc
"salesData": {
  ".read":  "auth != null && auth.token.admin === true",
  ".write": "auth != null",                                     // ← the bug
  "$salesDataId": {
    ".write": "auth != null && (auth.token.admin === true || !data.exists() || data.child('userId').val() === auth.uid)"
  }
}
```

Same on `forecasts` (`:519`). `salesDataIndex` (`:510`) and `forecastIndex` (`:528`) carry the same root grant and define **only `.read`** on their children.

**Mechanism.** `.write` is a permissive union down the tree: an ancestor grant is satisfied before any descendant rule is consulted, and a descendant cannot revoke it. The root `"auth != null"` therefore satisfies every authenticated write anywhere under these nodes, and the `$id` ownership checks are **dead code**.

**Impact — worse than the row states.** A single `PUT /salesData.json` by any authenticated user **replaces the entire node**. This is whole-node cross-tenant destruction in one request, not per-record tampering. Reads are already admin-or-owner scoped, so this is a **write-integrity** finding, not disclosure.

### 1.1 Two holes

| # | Hole | Closed by removing the root grant alone? |
|---|------|------------------------------------------|
| A | Overwrite / delete an **existing** foreign record | **Yes** — the child rule keys on `data.child('userId')` (pre-write), so a non-owner is denied on update *and* delete. Security review constructed four bypass attempts (direct overwrite, `$id` delete, subtree delete, root multi-path delete); all denied. |
| B | **Create** under an arbitrary key with an arbitrary `userId` | **No** — `!data.exists()` grants any authenticated create, and nothing constrains the `userId` written. |

`.validate` **does not run on delete**, so a validate-only remedy would leave A's delete arm open while looking like a fix. Both halves are required.

---

## 2. Census v2 (corrected — v1's was incomplete)

Grepped by **node name**, reading every hit. Re-derived independently by the ground-truth reviewer.

**Writers of the four in-scope nodes — `sales-data-service.js` only** (confirmed by both reviewers). v1's table listed 6 sites; the true set is 12:

| Line | Operation | Level written |
|---|---|---|
| 54, 84 | `push('salesData')` → `set` — carries `userId` (:74) | `$id` |
| 455, 502 | `push('forecasts')` → `set` — carries `userId` (:479) | `$id` |
| 195 | `update(dataRef, …)` whitelisted merge | `$id` |
| **868** | **`set(forecastRef, updatePayload)` — FULL REPLACE, omits `userId`** | `$id` |
| 380 | `update('forecasts/$id/metadata', …)` | **below `$id`** |
| 390-393 | root multi-path — `forecasts/$id/status`, `updatedAt` | **below `$id`** |
| 598-608 | root multi-path — `forecasts/$id/predictions/$date/adjusted` | **below `$id`** |
| 623-632 | root multi-path — status + `forecastIndex/…/status` | **below `$id`** |
| 219-226 | multi-path delete: record + `byLocation` + `byUser`, then `remove()` | mixed |
| 418-427 | same shape for forecasts | mixed |
| 1011-1014 | `updateSalesDataIndex` → `byLocation/$loc/$id`, `byUser/$uid/$id` | index |
| 1023-1032 | `updateForecastIndex` → same shape (**missed entirely in v1**) | index |

**Corrections to v1:**
- **`forecast-analytics.js` is NOT read-only.** It writes `forecastActuals/$id` (:101), `forecastAnalytics/byLocation/$loc` (:318), `forecastAnalytics/systemWide` (:406). It does not touch the four in-scope nodes, so it does not change this PR's rules — but the v1 claim was false and it makes `forecastActuals` a **two-writer** node (§7).
- **`public/tools/admin/sales-forecasting.html` is a live NON-ADMIN writer surface** (`:1141` — *"Always allow access - this is now a user-facing tool"*, `admin-verified` set unconditionally; `:1132` constructs `SalesDataService(user.uid)`). Its location picker (`:1172-1207`) reads the **whole `locations` root** and offers every tenant's location. Inline `<script>` — the #125 lesson class, missed by a `.js`-module census.
- **`functions/` has ZERO references** to any of these nodes. "Admin-SDK writers unaffected" is *vacuously* true — there is no server-side writer, hence no CF repair path if this breaks the client.
- `tests/integration/sales-forecasting/sales-data-service.test.js` is a client-SDK writer outside `public/**` (emulator-targeted; its `testUserId` is not a uid, so the new `.validate` would reject it if ever pointed at real rules).

### 2.1 The load-bearing census finding

The index nodes have **no child `.write` rules**; their writes are authorised *solely* by the root grant being removed. Setting root `.write: false` without adding child rules **breaks every client index write** — and because `:219-226` / `:418-427` are **atomic multi-path** updates spanning record *and* index, a missed index rule breaks **deletion**, not merely indexing (#125).

---

## 3. Proposed change

### 3.1 Record nodes — `salesData` / `forecasts`

- Root `.write` → **`false`**
- On `$salesDataId` / `$forecastId`:
  ```jsonc
  ".validate": "newData.hasChildren(['userId','locationId']) && (auth.token.admin === true || newData.child('userId').val() === auth.uid)"
  ```

**Why the `hasChildren` term (MUST-FIX 2).** v1 justified the `admin` disjunct by claiming `.validate` "constrains the residual admin arm." With `auth.token.admin === true ||` leading, it short-circuits and constrains admins *not at all* — the claim was **logically false**. The `hasChildren` conjunct is what makes it true, and it also blocks the deep-path create in hole B by requiring `userId` to materialise. This mirrors the D4/`stockUsage` precedent properly (`:248`), which schema-constrains admins with no escape hatch.

`auth.uid` is never null for an authenticated write, so `newData.child('userId').val() === auth.uid` cannot degenerate into the `null === null` grant that defeated #176.

### 3.2 Index nodes — keyed on RECORD ownership, not `userLocations` (MUST-FIX 1)

```jsonc
"salesDataIndex": {
  ".write": false,
  "byLocation": { "$locationId": { "$salesDataId": {
    ".write": "auth != null && (auth.token.admin === true || root.child('salesData').child($salesDataId).child('userId').val() === auth.uid)" } } },
  "byUser": { "$userId": {
    ".write": "auth != null && (auth.token.admin === true || $userId === auth.uid)" } } }
```

**Why v1's `userLocations` form was rejected.** `userLocations/$uid .write` is **self-writable** (`:57`) and a live client path does exactly that (`subscription-service.js:540`). So the predicate was attacker-controlled:

1. `PUT userLocations/{me}/{victimLocationId}` → allowed today
2. `DELETE salesDataIndex/byLocation/{victimLocationId}` → allowed by v1's rule
3. Victim's saved-data list vanishes (`getHistoricalDataList` reads only the index, `:107-114`); or poison instead — inject a foreign `$salesDataId`, the victim's `get()` on it is denied by the `$id .read`, and the loop throws at `:139-141`, **permanently breaking their list view**.

v1's stated justification — *"copied verbatim from the node's own `.read` so scoping cannot drift"* — was **provenance offered as correctness**. The expression is a *capability*, not an ownership proof; promoting a self-assertable capability from read scope to write scope is exactly where it stops being adequate.

Record-ownership keying is not self-assertable. Verified against every call path:
- **create** works — the record `set()` (`:84`, `:502`) precedes the index write (`:87`, `:505`), so `root` already carries `userId`;
- **delete** works — `root` is the **pre-write** snapshot, so the record is still present during the atomic multi-path delete;
- **archive** (`:630`, writes `.../$fid/status`) is granted by cascade from the `$forecastId` level.

> ⚠️ **This makes "record first, index second" load-bearing.** Add a code comment at `:87` and `:505`.

**`byUser` is write-only dead data** — four writers, zero readers. Rule added for minimality rather than deleting the writes; logged as cleanup (§7).

### 3.3 Client fixes required in this PR (it is no longer rules-only)

1. **`:868` `updateForecast` omits `userId`** (ground-truth). Today it *strips* ownership off the record (after which the owner's own `.read`/`.write` arms deny them, and `.indexOn:["userId"]` indexes nothing); under the new `.validate` it is **rejected outright** for non-admins. Fix: carry `userId` through the payload. In-scope per the 2026-05-15 inverse rule — this change makes a latent bug reachable. *(Likely dead today: its guard at `html:3959-3963` compares `metadata.createdBy`, which no writer ever sets — `saveForecast` writes `metadata.savedBy`. Fix it anyway; it is wired to a live button.)*
2. **Unguarded `locationId` interpolation** at `:219-223` (`deleteHistoricalData`) and `:630` (`archiveForecast`) → `byLocation/undefined/{id}`, denied under any new child rule, and because the update is atomic **the user can no longer delete their own record**. `deleteForecast` already guards correctly (`:422`) — mirror it. Without this, the fix *introduces* a regression.
3. **`byUser` mis-attribution** at `:222` / `:420`: both write `byUser/${this.userId}` — the **deleter's** uid, not the record owner's — so an admin deleting a user's record orphans the owner's index row. Pre-existing, but §3.2's rule would *codify* it. Fix to the record's owner, or leave and document; **decide at build, do not ship silently.**

---

## 4. What this does NOT close — stated honestly

1. **The admin arm stays open.** The global root `".write": "auth != null && auth.token.admin === true"` (`:3`) cascades; a descendant `false` **cannot** revoke it. Honest claim: *the non-admin cross-tenant write arm is closed, and admin writes are now schema-constrained by `.validate`.* **An admin probe would return 200 and read as a false failure** — the probe MUST be non-admin (§6).
2. **Reads untouched** — already admin-or-owner. Out of scope.
3. **`forecastActuals` / `forecastAnalytics`** — separate finding, §7.
4. **Sibling nodes with the identical cascade shape are NOT fixed here** — §7.

---

## 5. Pre-deploy data audit — REQUIRED before the rule ships (MUST-FIX 3)

Because `.validate` applies to **every** write reaching the path, any existing `salesData`/`forecasts` record whose `userId` is **missing or foreign** becomes permanently **un-editable and un-archivable by its own user** — every subsequent update (`:195`, `:380`, `:390`, `:598`, `:623`) returns PERMISSION_DENIED.

**And it is invisible to the founder**, because the `admin === true` disjunct short-circuits for the only person likely to test it. This is precisely `security/rules-audit-blind-spot` (2026-07-21) — the `locations`/`ownerId` bug that hid ~7 weeks behind an admin bypass and a swallowed `console.error`. Note `:202`/`:398` are `console.error`-then-rethrow and `:1003` swallows outright.

**Gate:** read-only admin-token REST audit counting records under `salesData` + `forecasts` where `userId` is absent or matches no live uid. **Non-zero ⇒ the design needs a backfill or an explicit transitional term** (existence-tested, never a null comparison — #176). `:868` has been stripping `userId` for an unknown period, so a non-zero count is *expected*, not hypothetical.

---

## 6. Verification — non-admin REST probe

Emulator unavailable (`@firebase/rules-unit-testing` absent; no `java` on PATH). **Copy the established safety pattern from `scripts/verify-rules-pr1b.js:11-18`**: pre-flight refusing to run pre-deploy, `__rules_probe_do_not_use__` sentinel keys, immediate deletion of anything that unexpectedly lands, explicit exit-code contract. v1's §6 wrote to production with none of this.

| # | Actor | Operation | Expect |
|---|---|---|---|
| 1 | non-admin A | overwrite `salesData/{foreign}` | 403 |
| 2 | non-admin A | delete `salesData/{foreign}` | 403 |
| 3 | non-admin A | create with `userId: B` | 403 |
| 4 | non-admin A | create with `userId: A` | **200** (no regression) |
| 5 | non-admin A | write `salesDataIndex/byLocation/{own}` | **200** (no regression) |
| 6 | non-admin A | write `salesDataIndex/byLocation/{foreign}` | 403 |
| 7 | non-admin A | full delete flow on own record | **200** (guards the #125 atomic break) |
| 8 | admin | any of the above | 200 — documents the residual arm |
| **9** | non-admin A | **deep-path create `salesData/{new}/someField`, no `userId`** | **403 — settles the ancestor-`.validate` question empirically (§8)** |
| **10** | non-admin A | `PUT userLocations/{A}/{foreignLoc}`, then `DELETE salesDataIndex/byLocation/{foreignLoc}` | **403** — proof of MUST-FIX 1 (returns 200 under v1) |
| **11** | non-admin owner | partial `update` on own record (`:195` path) | **200** — post-merge `.validate` regression guard |

Cases 4/5/7/11 are the **positive** no-regression checks; a denial-only probe passes trivially against a rules file that denies everything — the over-tight trap that hid the `locations` bug.

**Deploy is operator-gated.** This PR ships rules + client fixes + probe; the deploy is yours.

---

## 7. Spun out — logged, not bundled

- **`forecastActuals` AND `forecastAnalytics` have no rules entry at all.** Both inherit root: `.write` admin-only, **no `.read` for anyone** (there is no root `.read`). Both are written client-side from non-admin surfaces (`sales-data-service.js:706`; `forecast-analytics.js:101,318,406`). **v1's claim that this is "invisible to the founder because admin bypasses" was FALSE** — admin bypasses the *write* only; the read half is broken for the founder too, so the defect is larger than predicted. The write error is surfaced (`:713` rethrows); the **read** error is swallowed (`html:2740-2748` → renders "no actuals"; `forecast-analytics.js:34-36` → renders default zeros). *Design constraint for the fix:* `getActuals` (`:725-730`) does `orderByChild('forecastId')` against the **root**, which authorizes at the queried node and cannot be rule-filtered (2026-05-31 lesson) — a keyed-path `.read` will not work.
- **Class sweep — the same root-grant shape exists on three more nodes** (2026-07-21 "CLASS not one bug"):
  - **`receipts` (`:134`) — root `.write: "auth != null"` with NO child rules whatsoever.** `PUT /receipts.json` replaces every tenant's receipts. **Strictly worse than the four nodes in scope → Critical.** Not folded in: 28 client files in that family and no child rules to fall back on, so tightening the root without a full census would break every client receipt write (#125).
  - `rewards` (`:77`) — child ownership at `:80` is dead under the root grant. Also note `.validate` does not run on delete here (2026-07-28 scan). Tightening would re-break the receipt reward flow **just repaired in #202** — needs its writers routed first.
  - `queue` (`:365,369,375,381`).
- **`userLocations` self-grant (`:57`)** — no `.validate`; any user asserts membership of any location. It currently backs **four other `.write` rules**: `stockFlagConfig/$locationId` (`:267`), `stockItemFlags/$locationId` (`:274`), `bookings` (`:317`, `:321`), plus the `stockFlagAudit` read (`:253`). Own row.
- **Cleanup:** `byUser` is write-only dead data; `new SalesDataService(null)` at `tools/admin/sales-forecasting.html:1137` throws in the constructor, so that "guest mode" branch is already dead.

---

## 8. Open question, deliberately left to empirical resolution

The two reviewers **disagreed** on whether an ancestor `.validate` fires for a write to a path *below* it — material because 5 of the 12 writers write below `$id`, and because hole B's deep-path create depends on it. Security review verified "yes" against the official Firebase docs (the widget `hasChildren` example); ground-truth could not confirm and flagged it as needing empirical evidence.

**Resolution: probe case 9 settles it against live rules.** Per this project's repeated experience, neither documentation nor reasoning is accepted where live evaluation is available. If case 9 returns 200, hole B's deep-path arm is open and §3.1 needs an additional guard at the deeper level before this ships.

---

## 9. Rollback

Rules revert = restore four `.write` values, drop the added `.validate` and index child rules (prior text recoverable from `.settings/rules.json` readback and git). Client fixes are independently revertable and safe to leave in place.
