# ③ Payment Rail — Spec 1: Paystack credit top-ups (PAYG) + free trial

**Date:** 2026-06-07
**Status:** Design (approved in brainstorm; pending written-spec review)
**Component:** Phase 7 ③ Payment Rail (7B). First monetization path for askRoss.
**Predecessors (live):** ① Credit Ledger (`functions/billing/`), ④a Entitlements (`functions/entitlements/`), ② askRoss agent (`functions/agent/`).

> Spec 1 of two. **Spec 1 (this doc)** = Paystack plumbing + one-off credit top-ups + free trial → ships pay-as-you-go end-to-end. **Spec 2 (later)** = recurring All-in subscription, built on Spec 1's proven plumbing.

---

## 1. Why / North star

The askRoss agent is built, live, and eval-passing (21/21) but **cannot take money** — the old "Upgrade Now" was a fake-charge, replaced by a static `/upgrade.html` email CTA. This spec is the first real money path. North star unchanged: *Ross runs the paperwork, not the restaurant* — monetize the agent's usage without putting friction between an owner and trying it.

## 1.1 Launch sequencing — **this ships DORMANT** (2026-06-08)

ROSS is **not launched** (it's still founder-only). A 2026-06-08 effectiveness brainstorm concluded that **launch-readiness = two "wheels"** that are out of scope here: **(W1) capability breadth** — Ross can currently only see workflows/staff/runs; food-cost/guests/sales adapters are stubbed (`AdapterPendingError`) — and **(W2) proactive delivery** — the unattended sweep that reaches the owner unprompted (ideally via the existing Twilio **WhatsApp**), vs the reactive ⌘K chat that's all that's shipped. **Monetization is correctly built-but-dormant until both wheels are on.**

Why build the rail now anyway: **the Paystack account (KYC/verification) is the real long-pole** — start it today, build the rail in parallel. **But the go-live switch stays OFF:** specifically, the **D2 `rossAgent` → Free flip is built but NOT deployed** until launch (deploying it would open Ross to all owners before the wheels exist). The rail code can land on master; the trial-grant, the `rossAgent`-Free recompute, and the live Paystack keys are flipped only at launch.

## 2. Locked decisions (from the 2026-06-07 brainstorm)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Model = PAYG credit, with a free trial taste.** Any owner can use Ross by holding a usable credit balance; All-in (Spec 2) is an upsell for templates/limits, **not** for Ross access. | Maximizes the funnel — every Free user (ROSS is their home screen) can experience the agent. Caps cost via a bounded trial. |
| D2 | **`rossAgent` becomes a Free-tier feature.** | Required so PAYG works for all: access is gated by *balance*, not tier. Config + recompute, no new gate code. |
| D3 | **Gateway = Paystack** (SA-direct, Stripe-owned). | Stripe isn't available to SA-registered businesses; Paystack is the Stripe-family SA-native product (ZAR payouts to a SA bank, subscriptions + one-off, signed webhooks). |
| D4 | **USD is the unit of account; ZAR is the charge.** Bundles grant USD 1:1 to the ledger; Paystack collects ZAR (forced — Paystack-SA cannot charge USD). | Ledger is USD-native (mirrors Anthropic 1:1, no FX). Keeps the grant side FX-free. |
| D5 | **Per-bundle ZAR price** — bundle = `{ usdGrantCents, zarChargeCents }`, both operator-set. **No runtime FX.** | Clean ZAR price points (R49/R199/R499); operator updates prices when forex drifts; matches the ledger's manual-FX stance. |
| D6 | **Build credit-first** (this spec); recurring subscription is Spec 2. | One-off is far simpler than recurring (no renewals/dunning/proration/cancellation state machine). Proves the webhook→grant→idempotency machinery on the easy flow; takes money on day one. |
| D7 | **The webhook is the sole source of truth for granting credit** — never the client redirect. | Standard payment-integrity rule; the redirect is spoofable, the signed webhook is not. |

## 3. Goals / Non-goals

**Goals:** an owner can buy a credit bundle (ZAR via Paystack) and have USD credit land in the ledger, idempotently and securely; a new owner gets a one-time free trial credit; the `/upgrade.html` stub is replaced by a working top-up surface.

**Non-goals (→ Spec 2 / later):** recurring All-in subscription; refunds / chargebacks / disputes; live FX / multi-currency display; VAT invoicing & receipts; saved cards / one-click re-top-up.

## 4. Architecture — new `functions/payments/` module

Mirrors the `billing/` + `entitlements/` shape (pure core + thin CF shells + own db seam + own auth import).

| File | Responsibility |
|------|----------------|
| `paystack-client.js` | Thin wrapper over the Paystack REST API: `initializeTransaction({ email, amountZarCents, currency:'ZAR', metadata })` → `{ authorization_url, reference }`; `verifyTransaction(reference)` — **(review #8) used by the return-page UX for an optional confirm-on-redirect, NOT by the webhook** (the signed webhook is the grant source of truth; `verifyTransaction` never grants). Lazy/injectable `fetch` seam (`__setFetchForTests`); secret passed in per-call from `PAYSTACK_SECRET_KEY.value()`. |
| `bundles.js` | Pure helpers over the bundle table: `resolveBundle(bundleId)` → `{ usdGrantCents, zarChargeCents, label }` or throws; `isActive`. Source of truth for grant amount (server-side; never trust client). |
| `webhook-verify.js` | Pure `verifyPaystackSignature(rawBody, signatureHeader, secret)` — HMAC-SHA512 over the **raw** request body, constant-time compare. |
| `cloud-functions.js` | `paymentsInitTopup` (auth'd) + `paystackWebhook` (onRequest, unauth'd but signature-gated) + `paymentsListBundles` (auth'd, returns active bundles for the UI). |
| `__tests__/` | unit suites (see §9). |

**Reuses (unchanged):** `ledger.grantCredit({ uid, amountCents, grantedBy, reason })` for the actual credit grant; `ledger.getBalanceCents` / `billingGetBalance` for the UI.

## 5. Data model (all server-only writes — `database.rules.json`, like `billing/*`)

```
billing/creditBundles/{bundleId}
  { usdGrantCents: number,   // granted to the ledger 1:1 (USD cents)
    zarChargeCents: number,  // what Paystack charges — ZAR minor unit (cents; ZAR's subunit is "cent", NOT "kobo" which is NGN)
    label: string,           // "R199 — $11 of Ross credit"
    active: boolean,
    sort: number }

billing/paymentEvents/{reference}        // idempotency ANCHOR + audit; reference = Paystack txn ref
  { uid, bundleId,                        // written at CLAIM time (write-before-effect, §6.1)
    status: 'processing'|'granted'|'failed',
    usdGrantCents?, zarChargeCents?,      // filled when granted
    event: 'charge.success', at, grantedAt? }
  // No grantRecordKey: ledger.grantCredit returns only { balanceAfterCents }; the audit
  // link is reason='topup:{reference}' on the ledger grant record (review #2).

billing/trialGranted/{uid}               // one-time trial CLAIM marker (transaction, §6.2)
  { status: 'claiming'|'granted', amountCents?, at, grantedAt? }
```

- `creditBundles` seeded by a one-off script (operator sets the ZAR↔USD pairs), same pattern as the price-table + ross-template seeds.
- `paymentEvents` keyed by Paystack `reference` → an exactly-once guarantee (webhook retries hit the same key).
- Rules: `billing/creditBundles` world-readable? **No** — read via the `paymentsListBundles` CF (Admin SDK) to keep the billing subtree uniformly server-only; the CF returns only active bundles. (Consistent with the billing/* server-only posture.)

## 6. Flows

### 6.1 Top-up (happy path)
1. Owner opens the top-up surface → `paymentsListBundles` → renders bundle cards (label + ZAR price).
2. Owner picks a bundle → client calls **`paymentsInitTopup({ bundleId })`** (auth'd: server derives `uid` + `email` from the token, **never** from the client).
3. Server `resolveBundle(bundleId)` → `paystack.initializeTransaction({ email, amountZarCents: bundle.zarChargeCents, currency:'ZAR', metadata:{ uid, bundleId } })` → returns `authorization_url`.
4. Client redirects to Paystack; owner pays in ZAR.
5. Paystack → **`paystackWebhook`** `charge.success` — **WRITE-BEFORE-EFFECT idempotency (review #1):**
   - verify signature (invalid → 401, no side effects) →
   - **CLAIM the reference**: `paymentEvents/{reference}` via an RTDB **transaction** (`create-if-absent` → `status:'processing'`). A retry/concurrent webhook finds an existing record and ABORTS the write: a `'granted'` record → ack 200 + stop; a `'processing'` record (a crash between claim and grant) → ack 200 but **do NOT re-grant** — flag for manual review (favours never-double-grant over never-under-grant; a stuck `'processing'` is operator-visible, a double-grant is silent money loss) →
   - **re-derive** `bundleId` from the event metadata, `resolveBundle()` server-side (ignore any client/amount echoes) →
   - sanity: event `amount` (ZAR) === `bundle.zarChargeCents` (defense-in-depth; mismatch → `status:'failed'` + ack 200, no grant, no retry) →
   - `ledger.grantCredit({ uid, amountCents: bundle.usdGrantCents, grantedBy:'paystack', reason:'topup:'+reference })` →
   - update `paymentEvents/{reference}.status = 'granted'` → ack 200.
   - **Failure handling (review #5):** a thrown `grantCredit` (RTDB unreachable etc.) → webhook returns **500** so Paystack **retries** (safe — the `'processing'` claim prevents a double-grant; Paystack retries failed deliveries for up to ~72h). A terminal validation failure (unknown/inactive bundle, amount mismatch) → `'failed'` + **200** (never retry an unresolvable event forever).
6. Owner returns to the top-up surface → it **polls `billingGetBalance`** with a **bounded window** (≈10 attempts / 3s = 30s; review #7), then shows "received — check back shortly" rather than spinning forever. The webhook is authoritative; the return page is just UX. _(Optional defense-in-depth: the return page MAY call `paystack.verifyTransaction(reference)` to confirm `status:'success'` before showing success — but the webhook, not the return page, is what grants.)_

### 6.2 Free trial grant
- **Canonical trigger (review #6): the Ask Ross entry path** — a one-time grant fires from the dedicated `paymentsClaimTrial` CF the first time an owner opens Ross. (Folding it into signup is a possible v2 nicety, NOT v1 — one trigger avoids implementation ambiguity.)
- **Claim-first (review #10):** claim `billing/trialGranted/{uid}` via an RTDB **transaction** (`create-if-absent`), then `ledger.grantCredit({ uid, amountCents: TRIAL_CENTS, grantedBy:'trial', reason:'first-run-trial' })`, then mark `'granted'`. The transaction makes two concurrent first-accesses (double-click / two tabs) safe — only the winner grants.
- `TRIAL_CENTS` = 100¢ (~$1 ≈ 50–100 turns, above the 50¢ floor). Anti-abuse: per-uid marker; the bounded amount makes multi-signup abuse low-value (monitor, not a hard block in v1).

### 6.3 rossAgent → Free (D2)
- Add `rossAgent: true` to the **Free tier** `features` in the entitlements config/seed → `recomputeEntitlements` sweep so existing accounts materialize it. No change to `verifyRossAgentAccess` (it already reads `features.rossAgent`); access then hinges on the ledger balance gate, which is exactly PAYG.

## 7. Security (load-bearing)

- **Webhook signature** — HMAC-SHA512 over the raw body vs `x-paystack-signature`, constant-time compare; unsigned/invalid → 401, no side effects. (Requires the raw body — the CF reads `req.rawBody` for the HMAC, not the parsed JSON.)
- **`uid` trust chain (review #3)** — the `uid` in the `charge.success` metadata is trusted **because `paymentsInitTopup` wrote it from the verified Firebase Auth token** (`decoded.uid`), never from `req.body` — Paystack only echoes it back. **Invariant for the implementer: `initializeTransaction`'s `metadata.uid` MUST come from `decoded.uid`, never the request body.** The webhook may trust `metadata.uid` only because of this.
- **Idempotency (write-before-effect)** — `paymentEvents/{reference}` is CLAIMED via an RTDB transaction *before* the grant (§6.1); webhook retries (Paystack retries failed deliveries for ~72h) hit the claim and never double-grant.
- **No client-trusted amounts** — grant amount is always `resolveBundle(bundleId).usdGrantCents`, server-side; the `paymentsInitTopup` caller cannot set price or uid.
- **Amount cross-check** — webhook verifies the paid ZAR === the bundle's `zarChargeCents` before granting.
- **Secret-first deploy** — `PAYSTACK_SECRET_KEY` provisioned via `firebase functions:secrets:set` *before* any deploy (an unprovisioned `defineSecret` blocks ALL function deploys — ledger lesson 2026-06-01).
- **Server-only data** — `grantCredit` + all of `creditBundles` / `paymentEvents` / `trialGranted` live under `billing/` which is already `.read/.write:false` (Admin-SDK-only); **no rules change needed** for the new nodes.
- **Trial** claim-first transaction (§6.2) + one-time per uid.

## 8. UI

- Replace the `/upgrade.html` stub with a Hi-Fi top-up surface (`Hf*` components + `--hf-*` tokens; `{{ }}` rendering, no `v-html`; inline banners, no SweetAlert2): current balance (`billingGetBalance`), bundle cards (`paymentsListBundles`), "Top up" → `paymentsInitTopup` → redirect; return route shows pending → polls balance with a **bounded window (≈10×3s = 30s, review #7)**, then a "received — check back shortly" message rather than spinning forever.
- Wire a "Top up" affordance into the Ask Ross modal's **no-credit terminal banner** + a low-balance nudge (the modal already surfaces cost; extend it).
- Mobile + desktop (the surface is simple enough for one responsive page).

## 9. Testing

Unit (vitest, offline, fake-rtdb + injected Paystack client):
- `verifyPaystackSignature`: valid signature passes; tampered body / wrong secret / missing header → reject.
- Webhook idempotency: two `charge.success` with the same `reference` → exactly one `grantCredit`.
- Bundle resolution: unknown/inactive bundle → no grant; active → grant `usdGrantCents`.
- Amount cross-check: event ZAR ≠ bundle `zarChargeCents` → `failed`, no grant.
- Trial: first call grants once; second call is a no-op (marker present).
- `paymentsInitTopup`: uid/email taken from token, not client; amount taken from bundle.
- Webhook handler driven by a **verbatim Paystack `charge.success` payload** (server-shape-mock lesson — copy a real test-mode event, cite the source).

Deploy-smoke (test-mode Paystack keys): real init → Paystack test card → real webhook → balance updates.

## 10. Deploy prerequisites (operator)

1. Create/verify a **Paystack South Africa** account (ZAR base currency, settlement to the SA bank). USD charging is **not** available for SA merchants — collection is ZAR (D4/D5).
2. `firebase functions:secrets:set PAYSTACK_SECRET_KEY` (test key first, then live).
3. Configure the Paystack **webhook URL** → the deployed `paystackWebhook` endpoint.
4. Run the `creditBundles` seed (operator sets the ZAR↔USD pairs) + the entitlements recompute for D2 (`rossAgent` → Free).
5. Strict deploy order: CFs (secret-first) → rules → hosting → seed/recompute → test-mode smoke → flip to live keys.
6. **FX-drift runbook (review 🟢):** the per-bundle `zarChargeCents` is a fixed manual price — add a recurring calendar reminder (e.g. monthly) to check the live USD/ZAR rate and re-run the `creditBundles` seed if the bundles have drifted from the intended USD value; otherwise the ZAR prices silently diverge from the $20/$99/$200 intent.

## 11. Resolved decisions (2026-06-08)

- **Bundle set (USD grant):** **$20 / $99 / $200** → `usdGrantCents` 2000 / 9900 / 20000. (Substantial "stock the wallet" packs — ~1k / 5k / 10k+ Ross turns each.) The per-bundle `zarChargeCents` is operator-set at seed time (D5) — exact ZAR price points are a seed-config value, not code.
- **`TRIAL_CENTS` = 100** (¢, = $1, ≈ 50–100 turns above the 50¢ floor).
- **Trial placement:** dedicated `paymentsClaimTrial` CF, invoked once on first Ross access (clean + independently testable).
- **CF transport (review #9): `onRequest` + Bearer (`verifyAuthToken`)** for `paymentsInitTopup` / `paymentsListBundles` / `paymentsClaimTrial` — matching the house pattern (`billing/cloud-functions.js`, the ROSS CFs), NOT `onCall`. The earlier "onCall" note is superseded; the client calls via `fetch`+POST as it already does for `rossChat`/billing.

## 12. Out of scope → Spec 2

Recurring All-in subscription (subscribe → `subscription.create`/`charge.success`/`disable` webhooks → `entitlementSetTier` core + lifecycle), refunds/chargebacks, live FX, VAT/invoicing, saved-card re-top-up.
