# ③ Payment Rail — Spec 1: Paystack credit top-ups (PAYG) + free trial

**Date:** 2026-06-07
**Status:** Design (approved in brainstorm; pending written-spec review)
**Component:** Phase 7 ③ Payment Rail (7B). First monetization path for askRoss.
**Predecessors (live):** ① Credit Ledger (`functions/billing/`), ④a Entitlements (`functions/entitlements/`), ② askRoss agent (`functions/agent/`).

> Spec 1 of two. **Spec 1 (this doc)** = Paystack plumbing + one-off credit top-ups + free trial → ships pay-as-you-go end-to-end. **Spec 2 (later)** = recurring All-in subscription, built on Spec 1's proven plumbing.

---

## 1. Why / North star

The askRoss agent is built, live, and eval-passing (21/21) but **cannot take money** — the old "Upgrade Now" was a fake-charge, replaced by a static `/upgrade.html` email CTA. This spec is the first real money path. North star unchanged: *Ross runs the paperwork, not the restaurant* — monetize the agent's usage without putting friction between an owner and trying it.

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
| `paystack-client.js` | Thin wrapper over the Paystack REST API: `initializeTransaction({ email, amountZarCents, currency:'ZAR', metadata })` → `{ authorization_url, reference }`; `verifyTransaction(reference)` (defensive re-check). Lazy/injectable client seam (`__setClientForTests`); reads `PAYSTACK_SECRET_KEY` via `defineSecret`. |
| `bundles.js` | Pure helpers over the bundle table: `resolveBundle(bundleId)` → `{ usdGrantCents, zarChargeCents, label }` or throws; `isActive`. Source of truth for grant amount (server-side; never trust client). |
| `webhook-verify.js` | Pure `verifyPaystackSignature(rawBody, signatureHeader, secret)` — HMAC-SHA512 over the **raw** request body, constant-time compare. |
| `cloud-functions.js` | `paymentsInitTopup` (auth'd) + `paystackWebhook` (onRequest, unauth'd but signature-gated) + `paymentsListBundles` (auth'd, returns active bundles for the UI). |
| `__tests__/` | unit suites (see §9). |

**Reuses (unchanged):** `ledger.grantCredit({ uid, amountCents, grantedBy, reason })` for the actual credit grant; `ledger.getBalanceCents` / `billingGetBalance` for the UI.

## 5. Data model (all server-only writes — `database.rules.json`, like `billing/*`)

```
billing/creditBundles/{bundleId}
  { usdGrantCents: number,   // granted to the ledger 1:1 (USD cents)
    zarChargeCents: number,  // what Paystack charges (ZAR cents / "kobo")
    label: string,           // "R199 — $11 of Ross credit"
    active: boolean,
    sort: number }

billing/paymentEvents/{reference}        // idempotency + audit; reference = Paystack txn ref
  { uid, bundleId, usdGrantCents, zarChargeCents,
    status: 'granted'|'ignored'|'failed',
    grantRecordKey,                       // ledger grant key, for trace
    event: 'charge.success', at }

billing/trialGranted/{uid}               // one-time trial marker
  { at, amountCents }
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
5. Paystack → **`paystackWebhook`** `charge.success`:
   - verify signature (reject if invalid) →
   - idempotency: if `paymentEvents/{reference}` exists, ack 200 + stop →
   - **re-derive** `bundleId` from the event metadata, `resolveBundle()` server-side (ignore any client/amount echoes) →
   - sanity: event `amount` (ZAR) matches `bundle.zarChargeCents` (defense-in-depth; mismatch → status `failed`, alert, no grant) →
   - `ledger.grantCredit({ uid, amountCents: bundle.usdGrantCents, grantedBy:'paystack', reason:'topup:'+reference })` →
   - write `paymentEvents/{reference}` = `granted` → ack 200.
6. Owner returns to the top-up surface → it **polls `billingGetBalance`** (shows "Payment received — updating your balance…" until the new balance lands; the webhook is authoritative, the return page is just UX).

### 6.2 Free trial grant
- On first Ross access (or first top-up-surface visit), a one-time `ledger.grantCredit({ uid, amountCents: TRIAL_CENTS, grantedBy:'trial', reason:'first-run-trial' })`, guarded by `billing/trialGranted/{uid}` (idempotent, one-time).
- `TRIAL_CENTS` config (e.g. 100¢ = ~$1 ≈ 50–100 turns, above the 50¢ floor). Anti-abuse: per-uid marker; the small bounded amount makes multi-signup abuse low-value (note for monitoring, not a hard block in v1).
- Placement: simplest is a tiny `paymentsClaimTrial`-style grant invoked once from the Ask Ross entry path, OR folded into the existing signup/seed path. (Plan decides; both reuse `grantCredit` + the marker.)

### 6.3 rossAgent → Free (D2)
- Add `rossAgent: true` to the **Free tier** `features` in the entitlements config/seed → `recomputeEntitlements` sweep so existing accounts materialize it. No change to `verifyRossAgentAccess` (it already reads `features.rossAgent`); access then hinges on the ledger balance gate, which is exactly PAYG.

## 7. Security (load-bearing)

- **Webhook signature** — HMAC-SHA512 over the raw body vs `x-paystack-signature`, constant-time compare; unsigned/invalid → 401, no side effects. (Requires the raw body — ensure the CF reads the unparsed body for the HMAC.)
- **Idempotency** — `paymentEvents/{reference}` exactly-once; webhook retries never double-grant.
- **No client-trusted amounts** — grant amount is always `resolveBundle(bundleId).usdGrantCents`, server-side; the `paymentsInitTopup` caller cannot set price or uid (both from the token + bundle table).
- **Amount cross-check** — webhook verifies the paid ZAR equals the bundle's `zarChargeCents` before granting.
- **Secret-first deploy** — `PAYSTACK_SECRET_KEY` provisioned via `firebase functions:secrets:set` *before* any deploy (an unprovisioned `defineSecret` blocks ALL function deploys — ledger lesson 2026-06-01).
- **grantCredit stays Admin-SDK-only** (already server-only; rules unchanged).
- **Trial** idempotent + one-time per uid.

## 8. UI

- Replace the `/upgrade.html` stub with a Hi-Fi top-up surface (`Hf*` components + `--hf-*` tokens; `{{ }}` rendering, no `v-html`; inline banners, no SweetAlert2): current balance (`billingGetBalance`), bundle cards (`paymentsListBundles`), "Top up" → `paymentsInitTopup` → redirect; return route shows pending → polls balance.
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

## 11. Open questions (resolve at plan time or with operator)

- Exact bundle set + prices (operator: e.g. R49/$2.50, R199/$11, R499/$30?).
- `TRIAL_CENTS` value (default 100¢ proposed).
- Trial placement: dedicated claim CF vs folded into signup/seed.
- Whether `paymentsInitTopup` is an onCall or onRequest (match the Ask Ross client's transport conventions).

## 12. Out of scope → Spec 2

Recurring All-in subscription (subscribe → `subscription.create`/`charge.success`/`disable` webhooks → `entitlementSetTier` core + lifecycle), refunds/chargebacks, live FX, VAT/invoicing, saved-card re-top-up.
