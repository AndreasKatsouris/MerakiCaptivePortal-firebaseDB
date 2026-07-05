# OWASP Top 10 (2021) Security Audit — 2026-07-04

Standalone scan requested outside sprint work (Sprint Goal: Hi-Fi v2 / ROSS remains unchanged — see `PROJECT_BACKLOG.md`). Performed by a security-auditor subagent with read-only access; no code was modified as part of this audit. Findings logged per the Bug Triage Rule ("log it, don't fix it") since none block the current sprint.

**Scope:** full fresh pass over the askRoss agent (`functions/agent/*`), Payment Rail (`functions/payments/*`), proactive sweep (`functions/agent/sweep/*`) — none of which existed at the time of the 2026-05-30 audit — plus `database.rules.json` (read end-to-end, 606 lines), `storage.rules`, `firebase.json`, a client-side RTDB-writer census, and spot checks confirming previously-closed vulnerabilities are still closed. The existing 2026-06-15 automated audit's 29 findings (logged in `PROJECT_BACKLOG.md`'s Bug Triage Queue) were each independently re-verified against live code rather than re-derived from scratch.

---

## 1. New findings (not on the 2026-05-30 or 2026-06-15 audit lists)

### [CRITICAL] A01 Broken Access Control — `whatsapp-numbers` / `location-whatsapp-mapping` write-cascade bypass enables cross-tenant WhatsApp-channel hijack

**File:** `database.rules.json:325-344`

Both nodes carry a collection-level `".write": "auth != null"` above a child rule that looks ownership-scoped (`data.child('userId').val() === auth.uid || !data.exists()`). Firebase RTDB write-rule cascades are permissive-only: a shallower rule that already grants access cannot be revoked by a deeper, stricter one. Because the collection-level rule already grants any authenticated user unconditional write, the child ownership check is dead code for any *existing* record — and unlike a couple of sibling nodes, there is no compensating `.validate` reasserting `newData.child('userId').val() === auth.uid` (the `.validate` here only checks required fields are present).

**Concrete failure scenario:** Restaurant B's authenticated owner calls `set()` on `whatsapp-numbers/{restaurantA'sId}` or `location-whatsapp-mapping/{restaurantA'sLocationId}` with fabricated `phoneNumber`/`whatsappNumberId` values. The write succeeds, silently redirecting Restaurant A's inbound/outbound guest WhatsApp channel (vouchers, bookings, receipts) to attacker-controlled configuration.

**Fix direction:** Add a `.validate` mirroring the `rewards` node's pattern — `!data.exists() || auth.token.admin === true || data.child('userId').val() === auth.uid` — so ownership holds regardless of which `.write` branch matched. Bundle into the same coordinated RTDB-rules PR as the other write-cascade items below, behind a full writer census (CLAUDE.md step 5e / `rg --include=*.js --include=*.html --include=*.vue`).

### [HIGH] A01 — `salesData` / `forecasts` write-cascade bypass allows overwriting existing tenant records (amplifies the existing Low-severity bug triage row)

**File:** `database.rules.json:495-521`

Same root cause as above: `.write: "auth != null"` at the collection level, a child ownership check that's dead code for existing records, and no `.validate` reasserting ownership independent of write path. The bug triage queue already tracked a Low-severity version of this ("any authenticated user can still create NEW salesData records under arbitrary keys") — this scan found the more serious variant: **any authenticated tenant can overwrite another tenant's *existing* sales/forecast record wholesale**, corrupting or fabricating financial data feeding forecasting/reporting. Severity raised from Low to High; the existing bug-triage row has been updated in place rather than duplicated.

**Fix direction:** same `.validate` pattern as the `whatsapp-numbers` fix above.

### [HIGH — amplifies existing HIGH-04] A01 — `locations` write-cascade bypass blast radius extends beyond the `locations` node itself

**File:** `database.rules.json:43-51`

HIGH-04 (2026-06-15 audit) already flags that the child ownership check on `locations` is bypassable via the same write-cascade pattern, letting an attacker overwrite an existing location record and reassign its `ownerId` to themselves. This scan traced the *consequences* of that hijack: several other rules key their own tenant boundary off `locations/{locId}/ownerId` — `salesDataIndex:509`, `forecastIndex:527`, `stockFlagAudit:254/257`, `stockFlagConfig:268`, `stockItemFlags:274-275`, `bookings:306/314/318`. Hijacking one `ownerId` field therefore cascades into read/write access over that location's sales index, forecast index, stock-flag audit trail, and bookings. Recommend treating this finding's practical severity as Critical-adjacent given the blast radius, even though the entry point itself is unchanged from the existing HIGH-04 row.

### [LOW-MEDIUM] A05 Security Misconfiguration — internal test/debug HTML pages shipped to production

**Files:** `scripts/build.js:21`, `public/test-*.html` (~20 files, ~6,700 lines total)

`scripts/build.js` copies `public/` to `dist/` with no exclusion filter (`cpSync(publicDir, distDir, { recursive: true })`), and `firebase.json` hosting has no path exclusion for test pages either. Files like `test-subscription-status.html`, `test-professional-tier-limits.html`, `test-tier-gating.html`, `test-subscription-limits.html`, `test-feature-*.html` are hosted at predictable URLs, exposing internal tier-gating/feature-test logic and flows to any internet visitor. Any attempted writes inside them to `subscriptions/{uid}` are blocked by the existing admin-only RTDB rule, so this is disclosure/attack-surface exposure rather than a direct data breach.

**Fix direction:** exclude `test-*.html` from the hosting `ignore` list or move them out of `public/` into a directory the build script doesn't copy.

### Reviewed and confirmed NOT a vulnerability (recorded so it isn't re-flagged by a future scan)

`functions/agent/tools.js:190-221` (`editWorkflow`/`createWorkflow`) accept Zod `.passthrough()` objects (`updates`, `subtasks`) that could in principle carry arbitrary fields from the LLM. Traced the actual write path: `updateWorkflowAsOwner` (`functions/ross.js:837-864`) hard-allowlists `['name','notificationChannels','notifyPhone','notifyEmail','daysBeforeAlert','status']` before writing, and `buildTaskFromSubtask` (`functions/ross-workflow-builder.js:19-35`) constructs a fixed-shape task object field-by-field rather than spreading the input. No mass-assignment path exists today.

---

## 2. Confirmed still-open (2026-06-15 automated audit — 28/29 items re-verified against live code, 2026-07-04)

All re-verified directly against current source. Only CRIT-07 (Twilio webhook signature enforcement) has closed since that audit — confirmed still closed below. No other item from that list has been remediated; none have regressed either. See `PROJECT_BACKLOG.md` Bug Triage Queue § "OWASP Security Audit — 2026-06-15 Findings" for the full table (IDs CRIT-01 through LOW-05) — not reproduced here to avoid drift between two copies. Noteworthy re-verification details:

- **CRIT-03** (migration endpoints) — now performs `admin.auth().verifyIdToken` (token verification exists) but still performs no role/admin check; any authenticated user can trigger a DB migration.
- **CRIT-06** (Meraki validator hardcoded string) — confirmed present, but real auth is a separate `req.body.secret !== sharedSecret` check against a `defineSecret`-backed value (`functions/index.js:463-468`) — severity is overstated as a credential leak; it's a public GET-handshake echo string. This matches the PR #161 review note already on file.
- **MED-05** (`createTestData` CF) — code path is correctly gated behind `ENABLE_TEST_DATA === 'true'`; exploitability depends entirely on whether that env var is ever set in the deployed environment, which cannot be verified from source alone.

## 3. Confirmed still-open (2026-05-30 audit's explicitly deferred items)

- **H-2 Bucket C** (guests/queue/receipts root reads) — confirmed open. Additionally: `guests` root `.read: "auth != null"` (`database.rules.json:16-17`) grants any authenticated user read of the entire guests node — the more specific `$phoneNumber` rule is dead code for restriction purposes, same read-cascade behavior as the project's own documented LESSON.
- **M-3 SRI** — confirmed open: only 3 `integrity=` attributes found across 41 HTML files loading scripts from `cdn.jsdelivr.net`/`unpkg.com`/`cdnjs.cloudflare.com`.
- **M-5/M-7/L-3** (Bucket-C-class root reads) — same family as H-2, confirmed open.
- **M-9 MFA** — confirmed open, no `multiFactor`/`MFA` code found in `public/js` or `functions`.
- **L-4 password policy** — confirmed open, no password-policy/minLength enforcement found in `public/js/auth`.
- **CSP** — confirmed open (same underlying gap as MED-02 in the 2026-06-15 list — one finding surfaced twice).
- **firebase-admin@13 upgrade** — confirmed still blocked; `npm audit` shows the identical uuid-chain vulnerability set (9 moderate + 2 high) as before.

## 4. Verified previously-fixed (spot checks passed, no regression)

- **Operator-precedence admin bypass** — no `admin ==` loose-equality patterns anywhere in `functions/`; `admin !== true` used consistently, including in the newer `functions/entitlements/auth.js`.
- **Hardcoded secrets** — no `Giulietta!16`/`MerakiAdmin2024!`/API-key literals found; `defineSecret` used correctly in `functions/index.js`, `functions/agent/rossChat.js`, `functions/payments/cloud-functions.js`.
- **`subscriptions/$uid` entitlement self-grant lock** — still intact: admin-only write, `features`/`limits` children carry `.validate: false`.
- **CORS allowlist** — `functions/cors-allowlist.js` still origin-restricted, now also backs `rossChat.js` and `payments/cloud-functions.js`.
- **Storage rules** — `/receipts/` write is `false` (Admin-SDK-only), `/receipt-templates/` write is admin-gated — both intact.
- **Security headers** — X-Frame-Options, nosniff, Referrer-Policy, HSTS all present in `firebase.json:79-93`.
- **CRIT-07 (Twilio webhook HMAC)** — `functions/utils/twilio-signature.js` verification in place; per backlog PR #162/#164, deployed with `TWILIO_SIGNATURE_MODE=enforce` and live-verified in prod (code + backlog-record confirmation, not an independent live probe).

## 5. New-surface deep dive: askRoss agent / Payment Rail / proactive sweep — no vulnerabilities found

This was the primary reason for a fresh scan (these surfaces didn't exist at the 2026-05-30 or partially at the 2026-06-15 audit), so recording the positive result explicitly:

- **Tenant isolation** — `ross/agentChats`, `agentAudit`, `agentConfig`, `agentPending`, `proactiveLog` are all `.read: false, .write: false` in RTDB rules (`database.rules.json:585-604`); the Admin SDK bypass used by the agent is the sole tenant boundary, and every tool adapter in `functions/agent/tools.js` scopes reads/writes through the caller's own uid except `getRunHistory`, which has one documented, correctly-implemented cross-owner branch (`resolveWorkflowOwner`, `tools.js:63-75`) gated on `userLocations/{callerUid}/{locationId}` — this is the IDOR closed by PR #144, confirmed still closed.
- **Confirm-flow** (`rossChat.js:470-579`) — fail-closed on missing/non-numeric `expiresAt`, atomic one-time-consume via RTDB transaction, gates re-checked on resume, server-authoritative timestamp throughout.
- **Payment Rail** — `verifyPaystachSignature` uses HMAC-SHA512 + `crypto.timingSafeEqual`; `processChargeSuccess` re-derives the grant amount from the server-side bundle record (only uses the event's `amount` for a match/mismatch check), uses a claim-first RTDB transaction for idempotency, validates all path-interpolated strings against a `SAFE_KEY` allowlist before RTDB path use. No SSRF surface — `paystack-client.js` calls a hardcoded API base only.
- **Proactive sweep** — deliberately logs `err.code` over `err.message` because Twilio errors can embed the recipient phone number; template variables pass through `sanitizeInline` before delivery; kill-switch, per-owner enable, and dedup markers all checked.
- **rossChat auth/billing** — `requestId` is server-generated (`crypto.randomUUID()`) specifically to prevent client replay bypassing the debit guard; auth errors are normalized generically to clients while real errors log server-side only.

No Critical/High/Medium findings identified in this surface area during this pass.

---

## Overall priority recommendation

Ship the RTDB write-cascade family — the new `whatsapp-numbers`/`location-whatsapp-mapping` finding + the amplified `salesData`/`forecasts` finding + the already-known `locations`/`queue`/`scanningData`/`receipts`/`whatsapp-message-history` items — as **one coordinated PR**, per this project's own writer-census discipline (CLAUDE.md step 5e), rather than piecemeal. Several nodes share the exact same root-cause anti-pattern (broad collection `.write` + unenforced child ownership check), and a partial fix risks the same "atomic multi-path update fails whole write" trap the backlog has hit three times before (PR #73/#120/#125).
