# RTDB Rules Batch — PR-1 Build Scope (re-censused 2026-07-21)

**Supersedes the PR-1 section of** `docs/plans/2026-06-17-owasp-rtdb-rules-batch-plan.md` (#166).
**Status:** SCOPE — build pending.

The #166 plan's census was a **design-time** pass dated 2026-06-17. Per CLAUDE.md Step 5b(e) it
must be re-run before any rule deploys. This document is that re-run. It changes the plan's
conclusions in two places and adds findings from two audits the plan predates (2026-07-04, 2026-07-19).

> This is the **second** time a merged plan in this repo carried a rule change that would have
> broken production (after #125's parent-`hasChild` shape). The re-verify discipline is not
> ceremony — treat a merged plan as a hypothesis, not an instruction.

---

## 1. Census result — what changed vs the #166 plan

### 🔴 REMOVED from PR-1: MED-01a `subscriptionTiers` → `.read: "auth != null"`

**The #166 plan states the reader is post-auth. It is not.**

`public/js/services/subscription-tiers.js` is consumed by two **pre-auth** surfaces — the module's
own header comment says so verbatim: *"Used by the public marketing pricing section AND (eventually)
by the signup tier-select step."*

| Consumer | Auth state | Impact of the lock |
|---|---|---|
| `public/js/modules/signup/v2/components/SignupApp.vue:23` (`loadTiers()` in `onMounted`) | **Unauthenticated** — the account does not exist yet | **Signup tier picker fails.** Revenue path. |
| `public/js/marketing/landing/LandingApp.vue` (`/index.html` pricing) | **Unauthenticated** — public homepage | Silently degrades to the static Free/All-in fallback; pricing goes stale without erroring |

`loadTiers()` **throws** on read failure (`subscription-tiers.js:22`), so the signup surface takes
the error path, not a graceful degrade.

This is the same failure shape as the CRIT-07 lesson: a security tightening that dark-outs a live
channel. **Moved to PR-2**, where it needs one of: a CF-mediated public read, a public-safe
projection of the node (`{id, name, monthlyPrice, features}` only), or accepting the node is
intentionally public like `customization` (it holds no PII — the finding is reconnaissance-only,
Medium).

### ✅ CONFIRMED safe for PR-1 (4 changes)

| Finding | Node | Change | Census evidence |
|---|---|---|---|
| **CRIT-04** | `scanningData` | root + `$dataId` `.write` → admin-only | **Zero** client-SDK consumers of any kind (`*.js`/`*.html`/`*.vue`). Meraki webhook writes via Admin SDK (`functions/index.js:475`), which bypasses rules. |
| **HIGH-04** | `locations` | root `.write` → `false` | 4 client creators (`location-service.js:44`, `onboarding-wizard.js:360`, `user-dashboard.js:679`, `users-locations-management.js:1552`) all `push()` then `set()` at `locations/{pushKey}` — the **child** path. RTDB `.write` cascades *permissively*, so a root `false` does not revoke the child grant at `:49`. Child ownership rule unchanged. |
| **MED-06a** | `whatsapp-message-history` | root + `$messageId` `.write` → admin-only | **Zero** client-SDK writers. Webhook writes via Admin SDK. Child `.read` already per-tenant. |
| **LOW-03** | `admin-claims` | root `.read` → admin-only | Readers confined to admin/dev tools (`tools/admin/admin-phone-mapping.html`, `tools/dev/debug-auth-session.html`, `user-management.js`). `.write` already admin-only. Canonical admin signal is the `auth.token.admin` custom claim, not this node. |

Census command (re-run before deploy):

```
rg -n --glob '!node_modules' --glob '!dist' -g '*.js' -g '*.html' -g '*.vue' \
  "(set|update|push|remove)\(\s*ref\((rtdb|database),\s*[^)]*<NODE>" public admin_tools
```

Inline `<script>` in HTML **is live code** — the #125 miss. Do not narrow to `*.js`.

---

## 2. 🐛 Live bug found during the census (not in any audit)

**Client-side location creation is broken for non-admin users, and has been since PR #100 (2026-05-31).**

`database.rules.json:49` validates:

```
"$locationId": { ".validate": "auth.token.admin === true || newData.child('ownerId').val() === auth.uid" }
```

Of the four client creators, **only `onboarding-wizard.js:369` writes an `ownerId` field**:

| Writer | Surface | Writes `ownerId`? | Result for a non-admin |
|---|---|---|---|
| `onboarding-wizard.js:369` | First-run wizard | ✅ yes | passes |
| `users-locations-management.js:1552` | Admin tool | ❌ no | passes — admin token short-circuits `.validate` |
| `location-service.js:43` ← `dashboard.store.js:186` | **Live Vue user dashboard** | ❌ no (`userId`, `createdBy`) | **REJECTED** |
| `user-dashboard.js:665` | Legacy dashboard (deprecated banner, still reachable) | ❌ no (`userId`) | **REJECTED** |

**Why it stayed hidden:** it works during onboarding and it works for admins/the founder — so every
internal test path passes. It fails only for a non-admin owner adding a *second* location, and the
error surface is a generic `showToast('Error saving location')` with the real reason in
`console.error` only (the 2026-05-12 swallowed-error lesson, again).

**Confirmation (30 seconds, operator):** sign in as a non-admin account and add a location from the
user dashboard; or read any `locations/{id}` created after 2026-05-31 and check for an `ownerId` key.

**Fix options** (own PR — do NOT bundle into the rules batch):
1. Add `ownerId: uid` to both client payloads. Smallest diff; keeps client creation.
2. Route creation through a CF (Admin SDK bypasses `.validate`), which also closes the
   `!data.exists()` any-authed-user-can-create hole the #166 plan flagged as open question 3
   — and is a prerequisite for CRIT-10 (forgeable `userLocations`).

Option 2 is strictly better security but is a bigger change. **Recommend 1 now to stop the bleeding,
2 as part of the CRIT-10 remediation.**

---

## 3. Newer findings — candidates the #166 plan predates

The plan is dated 2026-06-17; audits landed 2026-07-04 and 2026-07-19. Two of their Criticals may be
rules-only, i.e. PR-1-class:

| Finding | Node | Status of census | Verdict |
|---|---|---|---|
| **NEW-CRIT-01 / HIGH-09** (same defect, counted once, treat as Critical) | `whatsapp-numbers`, `location-whatsapp-mapping` | **UNRESOLVED** — my writer regex returned **zero** hits; the 2026-07-19 audit names live writers at `admin-dashboard.js:2351-2398,2892-3293`. One of us is wrong. | **Blocked pending reconciliation.** Read those exact lines before scoping. |
| **CRIT-11** | `rewards` (`.write`/`.validate` only enforce ownership on *update*, so a guest can `set()` a new reward with `status:'approved'`) | Client writers **exist**: `reward-management.js:280,307,679`, `receipt-management.js:566` | Likely rules-only (add create-path ownership/admin check) **but** the admin create path at `:679` must keep working. Needs its own census pass. |

**Do not fold these into PR-1a on the strength of this document.** Each needs its census closed first.

---

## 4. Proposed sequencing

1. **PR-1a — the 4 confirmed rules changes.** Rules-only, no client/CF deploy.
2. **Location `ownerId` fix** — separate, independent of the rules batch, unblocks real users.
3. **PR-1b** — NEW-CRIT-01 + CRIT-11 once their censuses close.
4. **PR-2** — CRIT-05 receipts, HIGH-05 queue, MED-06b, **plus the displaced MED-01a**. All need
   client refactors first (root reads/queries can't be rule-filtered).

Splitting 1a/1b keeps the blast radius small: an atomic multi-path `update()` carrying one
now-rejected field fails the **whole** write (#73/#120/#125).

## 5. PR-1a verification gate

- [ ] Re-run the census command above for all 4 nodes (`*.js` + `*.html` + `*.vue`).
- [ ] Emulator / `@firebase/rules-unit-testing`: admin write passes, non-admin write rejected, on
      each of the 4; `locations` child write by owner still passes with root `.write:false`.
- [ ] Deploy **rules LAST** (no CF/hosting changes in PR-1a).
- [ ] Post-deploy smoke: a real WhatsApp message still processes; admin dashboard loads
      locations; guest WiFi splash still loads `customization`; **signup page still lists tiers**
      (the MED-01a regression canary — should be unaffected now that it is out of scope).
