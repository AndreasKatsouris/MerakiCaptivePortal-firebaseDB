# RTDB Rules Batch — PR-1b Build Scope (censused 2026-07-21)

**Closes the two censuses left open by** `docs/plans/2026-07-21-rules-batch-pr1-scope.md` §3
(NEW-CRIT-01 and CRIT-11), which said explicitly: *"Do not fold these into PR-1a on the strength
of this document. Each needs its census closed first."*

**Status:** BUILT — rules changed, probe written, deploy pending.

**Outcome in one line:** NEW-CRIT-01 is rules-only and is **closed**. CRIT-11 is **not** rules-only
— the scope doc's "likely rules-only" guess was wrong — so it is **mitigated, not closed**.

---

## 1. The census contradiction, resolved

PR-1's §3 recorded an unresolved conflict on NEW-CRIT-01:

> my writer regex returned **zero** hits; the 2026-07-19 audit names live writers at
> `admin-dashboard.js:2351-2398,2892-3293`. One of us is wrong.

**The audit was right. The regex was wrong.** It required the write and the `ref()` on one line:

```
(set|update|push|remove)\(\s*ref\((rtdb|database),\s*[^)]*<NODE>
```

The real code splits them across statements:

```js
const numbersRef = ref(rtdb, 'whatsapp-numbers');   // line 2352
const newNumberRef = await push(numbersRef, numberData);  // line 2892 — different function
```

**Heuristic for every future census: grep the NODE NAME, then read each hit.** A regex that
requires the write verb and the path in one expression silently misses the extremely common
`const ref = ...` / `await write(ref, ...)` split, and a zero-hit result reads as "no consumers"
— the most dangerous possible false negative before a rule lock.

---

## 2. NEW-CRIT-01 — `whatsapp-numbers`, `location-whatsapp-mapping` → **CLOSED**

### The actual defect (worse than the audit described)

Both nodes had `"auth != null"` on the root for **both** `.read` and `.write`. RTDB read and write
grants **cascade permissively downward**, so the carefully-written per-child ownership rules —

```jsonc
"$whatsappNumberId": {
  ".read":  "... || data.child('userId').val() === auth.uid",
  ".write": "... || data.child('userId').val() === auth.uid || !data.exists()"
}
```

— were **dead code**. Every authenticated user could enumerate every tenant's WhatsApp numbers and
overwrite any location's routing mapping. The cascade *is* the vulnerability; the child rules only
ever looked like a boundary.

### Census — all consumers

| Site | Node | Operation | Path | Surface |
|---|---|---|---|---|
| `admin-dashboard.js:2352` | whatsapp-numbers | `get` | **root** | Admin SPA |
| `admin-dashboard.js:2892` | whatsapp-numbers | `push` | child (`push` writes at the new key, not the root) | Admin SPA |
| `admin-dashboard.js:2398` | location-whatsapp-mapping | `get` | **root** | Admin SPA |
| `admin-dashboard.js:3256` | location-whatsapp-mapping | `set` | child | Admin SPA |
| `admin-dashboard.js:3293` | location-whatsapp-mapping | `remove` | child | Admin SPA |
| `tools/admin/whatsapp-management.js:671` | location-whatsapp-mapping | `update` | child | Admin tool |
| `tools/admin/whatsapp-management.js:990` | whatsapp-numbers | `update` | child | Admin tool |

**Zero root writes exist** — `push(rootRef, data)` writes at the generated child key. The only root
operations are two admin `get()`s.

**The non-admin path was the thing to check, and it is safe:** the user dashboard shows WhatsApp
mappings but reads them through the **`getUserWhatsAppNumbers` Cloud Function**
(`user-dashboard.js:839`), which uses the Admin SDK and bypasses rules entirely. It never touches
these nodes from the client. (`user-dashboard.js:896,937` link to
`/admin_tools/whatsapp-management.html`, which **does not exist** — a dead 404 button, not a
consumer.)

### Changes

| Node | Rule | Before | After |
|---|---|---|---|
| `whatsapp-numbers` | root `.read` | `auth != null` | `auth != null && auth.token.admin === true` |
| `whatsapp-numbers` | root `.write` | `auth != null` | `auth != null && auth.token.admin === true` |
| `whatsapp-numbers` | `$id .write` | `... \|\| !data.exists()` | create clause dropped → create is admin-only |
| `location-whatsapp-mapping` | root `.read` | `auth != null` | `auth != null && auth.token.admin === true` |
| `location-whatsapp-mapping` | root `.write` | `auth != null` | `auth != null && auth.token.admin === true` |
| `location-whatsapp-mapping` | `$id .write` | `... \|\| !data.exists()` | create clause dropped → create is admin-only |

The `!data.exists()` removal matters on its own: it let **any** authenticated user create a
`whatsapp-numbers` record naming a *victim's* `phoneNumber` under their *own* `userId` — a hijack
that passed both the old `.write` and the old `.validate`. Both live create sites
(`admin-dashboard.js:2892`, `:3256`) run as admin and are unaffected.

Child `.read` rules are left intact, so a non-admin owner can still read their own record by direct
path if a future surface needs it.

### Field immutability — the hijack that survived the first draft

Locking the root and the create path is **not sufficient**, because non-admins legitimately *own*
mappings: `assignWhatsAppToLocationFunction` (`functions/whatsappManagement.js:210-235`) has no
admin check — only a tier check — and stamps the mapping with `userId = req.user.uid`. It writes via
the Admin SDK, so it bypasses rules and remains the sanctioned create path.

An owner could therefore keep ownership and simply **rewrite the routing field**: `PATCH` their own
mapping with `{"phoneNumber": "<victim tenant's WhatsApp number>", "isActive": true}`. The `.write`
rule reads `data` (the *old* value), so the ownership test still passes; the parent `.validate` only
asserts the five keys are *present*, never that their values are unchanged. Routing resolves by
first phone match in RTDB key order (`functions/utils/whatsappDatabaseSchema.js:384-395`), so a
lexicographically-earlier location id wins and the victim's inbound WhatsApp traffic is handed the
attacker's location context.

Closed by making the two identity fields immutable to non-admins on both nodes:

```jsonc
"phoneNumber": { ".validate": "auth.token.admin === true || newData.val() === data.val()" },
"userId":      { ".validate": "auth.token.admin === true || newData.val() === data.val()" }
```

Child `.validate` is only evaluated for nodes actually present in the written data, so the live
non-admin update paths are untouched — `whatsapp-management.js:671` writes
`{isActive, active, updatedAt, locationName}` and `:990` writes `{displayName}`, neither of which
touches these two fields. Admin full-node `set()`/`push()` passes on the first disjunct.

> Note the asymmetry, since §2's table reads as "creation is admin-only" full stop: creation is
> admin-only **in the rules**, while the CF create path stays open to any entitled user by design.

---

## 3. CRIT-11 — `rewards` → **MITIGATED, NOT CLOSED**

### Why the "likely rules-only" guess was wrong

Locking `rewards .write` **breaks a live non-admin flow**:

- `guest-management.html` is not admin-only. It is a platform feature route
  (`modules/access-control/services/role-access-control.js:121`) and sits in the **user-dashboard**
  nav (`modules/user-dashboard/constants/navigation.constants.js:10`).
- Renaming a guest there fires `cascadeGuestNameUpdate`, which writes
  `rewards/{id}/guestName`, `/updatedAt`, `/lastCascadeUpdate` for every matching reward
  (`guest-management.js:105-116`).
- It is an **atomic multi-path `update(ref(rtdb), …)`**. One rejected path fails the *whole* write
  — the #73 / #120 / #125 pattern, three times learned.
- A non-admin owner authenticates by email/password and has **no `phone_number` claim**, so every
  ownership clause in the rewards rules evaluates false for them.

And there is no way to write an owner-scoped rule instead: **`rewards` records carry no `ownerId`
or `locationId`.** The shapes are `{typeId, guestPhone, guestName, campaignId, status, value,
expiresAt, metadata}` (`reward-management.js:661`) and `{receiptId, campaignId, guestPhoneNumber,
totalAmount, status, createdAt, createdBy}` (`receipt-management.js:952`). There is no field to
scope against.

### What this PR does change

`$rewardId .validate` drops its `!data.exists()` escape hatch **and adds an explicit existence test
on the non-admin branch**:

```diff
- "newData.hasChildren([…]) && (!data.exists() || auth.token.admin === true || (…ownership…))"
+ "newData.hasChildren([…]) && (auth.token.admin === true || (data.exists() && …ownership…))"
```

Non-admin creation is blocked by `data.exists()`. Admin creation still passes on the
`admin === true` branch. This closes the headline fraud path — a guest self-issuing a reward with
`status: 'approved'`.

> #### ⚠️ The `data.exists()` term is load-bearing. This PR got it wrong once.
>
> The first draft simply deleted `!data.exists() ||` and asserted that "a create now has no existing
> `guestPhone` to match, so the clause is false for a non-admin." **That was wrong, and it blocked
> nothing.** On a create, `data.child('guestPhone').val()` is `null` — and
> `auth.token.phone_number` is `null` too, for *every* user of this application:
>
> - there is no phone-based sign-in anywhere in the client (`rg "signInWithPhoneNumber|
>   RecaptchaVerifier|PhoneAuthProvider" public` → zero hits; the only paths are
>   `createUserWithEmailAndPassword` / `signInWithEmailAndPassword`);
> - every `setCustomUserClaims` call writes only `{ admin }` and overwrites the whole claims object
>   (`functions/index.js:782,987,992,1321`).
>
> **RTDB rules evaluate `null === null` as true**, so the ownership clause *granted* on every create.
> The self-issued-voucher path stayed wide open behind a rule that looked tightened.
>
> Caught by security review before deploy. It is recorded here rather than quietly fixed because it
> is precisely the failure this document warns about two paragraphs below — and because the same
> null-equality trap disarms the `guest-rewards` rule (`database.rules.json:88`) and any future rule
> written against `auth.token.phone_number`. **Never rely on a null mismatch to deny; test existence
> explicitly.**

**Zero regression risk on the cascade**, because the cascade is an *update*: `data.exists()` is
true, so the old and new `.validate` reduce to the *identical* expression on that path. The only
behaviour that changes is creation. `.write` is untouched.

### What remains open — do not mark CRIT-11 closed

`rewards .write` is still `"auth != null"`. A write to a **descendant** path
(`rewards/{id}/status`) does not evaluate the `$rewardId` `.validate` above it, so an authenticated
user can still flip a field on an **existing** reward. Voucher fraud via *creation* is closed;
fraud via *mutation* is not.

**Follow-up required (own PR, client work):** route the guest-name cascade through a Cloud Function
(Admin SDK bypasses rules), or add an ownership field to `rewards`, then lock `.write`. Until that
lands, CRIT-11 stays on the open-findings list at reduced severity.

> This is written at length deliberately. #168 had to retract a HIGH that was declared closed on an
> unverified inference, and then "re-confirmed" by a second pass that cited the first. A partial fix
> recorded as a full one is the same failure with a friendlier face.

---

## 4. 🐛 Live bug found during this census (not in any audit)

**`receipt-management.js` reward creation appears to be rejected by `.validate` — and has been since
long before this PR.**

`processRewards` writes (`receipt-management.js:952-964`):

```js
const rewardData = { receiptId, campaignId, guestPhoneNumber, totalAmount, status, createdAt, createdBy };
await update(ref(rtdb, `rewards/${rewardId}`), rewardData);
```

`$rewardId .validate` requires `newData.hasChildren(['metadata', 'status', 'value', 'expiresAt'])`.
That payload has `status` but **no `metadata`, no `value`, no `expiresAt`** — and the `hasChildren`
term is an unconditional AND, so **not even an admin bypasses it**.

Sibling `reward-management.js:661` (manual reward issue) *does* include all four and passes — which
is presumably why this went unnoticed.

**This PR does not cause it and does not change it** (the `.validate` edit only touches the
ownership disjunct, not `hasChildren`). Logged rather than fixed: it is a client payload bug, not a
rules bug, and bundling it would blur a security PR.

**Confirmation (operator, ~1 min):** approve a receipt that should issue a reward and watch the
console for a permission-denied on `rewards/…`; or check whether any `rewards` record exists with a
`receiptId` field.

**It is worse than step one.** The two follow-on writes in the same function fail as well:
`campaign-rewards/{cid}/{rid}` requires admin (`database.rules.json:93,96`), and
`guest-rewards/{phone}/{rid}` requires `auth.token.phone_number === $phoneNumber` (`:88`) — which,
per §3, is `null` for every user. So whichever surface calls `processRewards` has been silently
broken **end to end**, not merely at the first write.

This is the second live bug a rules census has turned up (after the `locations` `ownerId` bug in
PR-1 §2), both hidden behind the same thing: **a client-side `catch` that only `console.error`s.**

---

## 5. Verification gate

`scripts/verify-rules-pr1b.js` — same contract and safety guards as the PR-1a probe
(`preflight` refuses to run against un-deployed rules; self-cleaning on any write that lands).

Two PR-1b-specific notes, both learned from #173's mislabelled checks:

1. **The root `.write` tightening is not directly probeable.** A REST `PATCH` with child keys is
   evaluated at the **child** path; only `PUT /<node>.json` exercises a root `.write`, and that
   replaces the entire node — against a broken rule it would destroy every reward and every WhatsApp
   mapping. The static assurance is sound instead: write grants cascade permissively downward only,
   so removing a root grant cannot re-open anything. What the checks *do* prove is the operationally
   important part — the per-child rules that were dead under the cascade are now live.
2. **`.validate` rejections can surface as HTTP 400, not 401.** The rewards half is enforced
   entirely by `.validate`, so `verdict()` counts 400 as a denial; the status is printed on every
   line so the distinction stays visible.

Checklist:

- [ ] Deploy rules LAST — `firebase deploy --only database`. No CF or hosting changes in PR-1b.
- [ ] `USER_ID_TOKEN=<non-admin> ADMIN_ID_TOKEN=<admin> node scripts/verify-rules-pr1b.js` → all pass.
      The preflight **requires** the non-admin token (an admin is legitimately allowed to create
      rewards, so it cannot detect un-deployed rules).
- [ ] Smoke, admin dashboard: WhatsApp section lists numbers and location mappings; assign and
      unassign a number to a location.
- [ ] Smoke, admin dashboard: issue a manual reward (`reward-management`) — still works.
- [ ] Smoke, **non-admin owner**: open guest management from the user dashboard and rename a guest
      with existing rewards — the cascade must still succeed. **This is the regression canary for
      the decision not to lock `rewards .write`.**
- [ ] Smoke, non-admin owner: user dashboard still shows WhatsApp status per location (served by
      `getUserWhatsAppNumbers`, so unaffected — confirms the CF path assumption).
- [ ] Smoke, **non-admin owner with an existing mapping**: toggle WhatsApp on/off from
      `tools/admin/whatsapp-management.html` (that page is *not* admin-gated —
      `whatsapp-management.js:83`). It must still work: it writes `isActive`/`active`/`updatedAt`/
      `locationName`, none of which are the immutable fields.

**Not covered by the probe, deliberately:** the field-immutability rules need a *pre-existing
mapping owned by the probe user*, which the probe cannot create (creation is now admin-only). Rather
than have it mint fixture data in production, that boundary is the manual smoke step above plus its
negative twin — an owner attempting `PATCH location-whatsapp-mapping/{their-own-id}` with a changed
`phoneNumber` must be rejected. Stating this explicitly so the gap is visible rather than implied:
an uncovered case named is worth more than a green run that quietly skipped it.

---

## 6. Remaining in this family

| Item | Status |
|---|---|
| CRIT-11 `rewards` `.write` lock | **Open** — needs CF-mediated cascade or a `rewards` ownership field (§3) |
| **NEW — `whatsapp-message-history` root `.read`** | **Open, Medium/POPIA.** Same cascade pathology this PR just fixed one node over: root `.read: "auth != null"` (`database.rules.json:349`) makes the per-child rule at `:354` dead, so any authenticated user reads every tenant's `{locationId, phoneNumber, content, …}` — guest phone numbers and **full message bodies**, cross-tenant. PR-1a locked this node's `.write` only. Not a NEW-CRIT-01 bypass (the `phoneNumber` here is the *guest's*, not the routing number), so it is out of scope for this PR, but it needs a read census of its own. Surfaced by the PR-1b security review. |
| **NEW — null-equality audit of `auth.token.phone_number` rules** | **Open.** No user carries a `phone_number` claim (§3), so every rule comparing it to a possibly-null `data` value grants instead of denies. `guest-rewards/$phoneNumber` (`database.rules.json:88`) is written against the same claim and should be re-derived under this light. |
| `locations` `!data.exists()` create hole | Open — folds into CRIT-10 (forgeable `userLocations`) |
| `receipt-management` reward-create payload | Open — live bug, §4 |
| PR-2 | CRIT-05 receipts, HIGH-05 queue, MED-06b, displaced MED-01a — all need client refactors first |
