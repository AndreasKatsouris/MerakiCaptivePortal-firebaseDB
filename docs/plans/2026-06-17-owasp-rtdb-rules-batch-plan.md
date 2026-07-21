# OWASP RTDB Rules-Batch — Remediation Plan

**Date:** 2026-06-17
**Source findings:** OWASP audit 2026-06-15 — CRIT-04, CRIT-05, HIGH-04, HIGH-05, MED-01, MED-06, LOW-03
**Status:** PLAN (census complete; build pending)

## Why one plan / two PRs

The backlog flags these 7 rules findings as "ship as ONE PR after a full writer
census — an atomic `update()` carrying a now-rejected field fails the WHOLE write"
(the class that bit PRs #73/#120/#125). The census (below) shows they actually
split cleanly into **two risk tiers**, so the right shape is **two sequenced PRs**,
not one:

- **PR 1 — lockable now (Bucket A):** rules-only, zero client changes, low risk.
- **PR 2 — needs client refactor first (Bucket C):** root-level reads/listeners that
  rules cannot filter; each needs a client/CF change *before* the rule can tighten.

This mirrors the H-2 Bucket A/B vs C split (`docs/plans/2026-05-30-h2-cross-tenant-rtdb-design.md`):
a node read/written by **direct keyed path** is lockable now; a node consumed by a
**root-level query/listener** (`onValue(ref(rtdb,'queues'))`, `orderByChild().equalTo()`)
cannot be rule-filtered and needs the consumer refactored first.

## Census result (design-time — MUST be re-run at build time)

> ⚠️ Per CLAUDE.md Step 5b(e), the census below is the **design-time** pass. Before the
> rule deploys, re-run `rg --include=*.js --include=*.html --include=*.vue` for every
> node being tightened (inline `<script>` in HTML are live code). Admin-SDK writers in
> `functions/` are **unaffected** (Admin SDK bypasses rules) — only client-SDK consumers matter.

| Finding | Node | Current | Target | Client consumers | Verdict |
|---------|------|---------|--------|------------------|---------|
| CRIT-04 | `scanningData` | `.write: auth!=null` (root + `$dataId`) | admin-only (root + `$dataId`) | **no client writers**; Meraki webhook = Admin SDK (`index.js:475`) | **PR 1** |
| HIGH-04 | `locations` | root `.write: auth!=null` | root `.write: false` (child ownership remains) | client writes are keyed `locations/${id}` via `location-service.js:75`; CF create = Admin SDK | **PR 1** |
| MED-01a | `subscriptionTiers` | `.read: true` | `.read: "auth != null"` | `services/subscription-tiers.js:16` reads it post-auth (reference table, no PII) | **PR 1** |
| LOW-03 | `admin-claims` | root `.read: auth!=null` | root `.read: admin-only` | readers only in admin tools (`user-management.js:338`, `grant-admin-claims.html`); `.write` already admin-only | **PR 1** |
| MED-06a | `whatsapp-message-history` | `.write: auth!=null` (root + `$messageId`) | admin-only (root + `$messageId`) | **no client writers**; webhook = Admin SDK. Child `.read` already per-tenant | **PR 1 (write)** |
| CRIT-05 | `receipts` | `.read: auth!=null` | per-tenant read | **root read** `get(ref(rtdb,'receipts'))` at `receipt-management.js:1232` (whole-node) | **PR 2** |
| HIGH-05 | `queue` | root+child `.write: auth!=null` | per-location scope | **root listener** `onValue(ref(rtdb,'queues'))` at `queue-management.js:559` | **PR 2** |
| MED-06b | `whatsapp-message-history` (read) | root `.read: auth!=null` | admin/per-tenant | **root query** `orderByChild('timestamp')` at `admin-dashboard.js:2473` | **PR 2** |
| MED-01b | `customization` | `.read: true` | — | `wifi-login.html:312` reads it **pre-auth** (guest splash) | **OUT OF SCOPE — intentionally public** |

## PR 1 — lockable now (rules-only, no client changes)

All five are safe because every affected writer is either Admin-SDK (bypasses rules)
or already admin-gated, and the two read-tightenings touch non-PII reference data /
admin-only tools. **Rules-only diff → no client/CF deploy needed.**

Exact rule changes in `database.rules.json`:

1. **`scanningData`** (lines 107–113) — lock BOTH levels (child currently grants):
   - root `.write` → `"auth != null && auth.token.admin === true"`
   - `$dataId .write` → `"auth != null && auth.token.admin === true"`
   - *(read left as-is; CRIT-04 is write-only)*
2. **`locations`** (line 45) — root `.write` → `false` (child `$locationId` ownership rules at line 49 unchanged → legit per-location writes still pass).
3. **`subscriptionTiers`** (line 9) — `.read: true` → `"auth != null"`.
4. **`admin-claims`** (line 68) — `.read` → `"auth != null && auth.token.admin === true"` (`.write` already admin-only at line 69).
5. **`whatsapp-message-history`** (lines 351, 355) — lock BOTH levels:
   - root `.write` → `"auth != null && auth.token.admin === true"`
   - `$messageId .write` → `"auth != null && auth.token.admin === true"`
   - *(child `.read` at line 354 already per-tenant; root `.read` deferred to PR 2)*

### PR 1 open questions to VERIFY at build time (cheap, but gate the lock)
- **admin-claims self-status read** — confirm NO non-admin client flow reads
  `admin-claims/{uid}` to decide its own admin status (the canonical signal is the
  `auth.token.admin` custom claim, not the RTDB node). The census found only admin-tool
  readers; verify the login/auth flow + `post-login-router` don't read it for non-admins.
- **scanningData `.read`** — left open here; the Meraki scanner POST flow + any analytics
  reader. CRIT-04 is write-only; confirm no regression from leaving read as-is.
- **`locations` child create-path** — the `$locationId .write` includes `!data.exists()`,
  letting any authed user CREATE a location (with `ownerId === self` per `.validate`).
  Out of scope for HIGH-04 (root write) but flag whether client location creation is
  wanted or should be CF-only.

### PR 1 verification + deploy
- Re-run the writer census (Step 5b(e)).
- Emulator / `@firebase/rules-unit-testing` pass on the 5 changed rules (admin write passes,
  non-admin write rejected; authed read of subscriptionTiers passes, unauth rejected).
- Deploy **rules LAST** (no CF/hosting changes in PR 1, so just rules → smoke).
- Post-deploy smoke: a real WhatsApp message still processes (writes go via Admin SDK);
  admin dashboard still loads tiers/locations; a guest WiFi login still loads `customization`.

## PR 2 — needs client refactor first (Bucket C, deferred)

Each needs the consumer changed BEFORE the rule tightens (rules can't filter a root query):

- **CRIT-05 receipts** — `receipt-management.js:1232` does a whole-node `get(ref(rtdb,'receipts'))`.
  Refactor to a CF-mediated, location-scoped fetch (or direct keyed reads), then lock
  `.read` per-tenant. (Prior H-2 doc leaned "receipts may be lockable" — but the root read
  here contradicts that; verify which client actually runs at build.)
- **HIGH-05 queue** — `queue-management.js:559` root `onValue(ref(rtdb,'queues'))`. ⚠️ **Resolve the
  `queue` (singular, in rules) vs `queues` (plural, in the listener) naming first** — the
  listener may target a node the rules don't define. Then scope reads/writes via the
  `userLocations/{uid}` cross-ref pattern + refactor the listener to the owner's locations.
- **MED-06b whatsapp-message-history read** — `admin-dashboard.js:2473` root `orderByChild('timestamp')`.
  Route through an admin-gated CF (`getWhatsAppMessages`) or a location-scoped index, then
  lock root `.read`.

These three are the same architectural class as H-2 Bucket C (guests/queue/receipts) and
should likely fold into that deferred restructure rather than ship piecemeal.

## Sequencing summary

1. **PR 1** (this sprint) — 5 rule tightenings, rules-only, low-risk. Closes CRIT-04, HIGH-04,
   MED-01a, LOW-03, MED-06a (write half).
2. **PR 2** (deferred, with H-2 Bucket C) — receipts/queue/whatsapp-read refactors → CRIT-05,
   HIGH-05, MED-06b.
3. `customization` — no action (intentionally public).
