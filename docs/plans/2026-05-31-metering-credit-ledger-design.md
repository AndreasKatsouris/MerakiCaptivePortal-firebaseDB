# Metering & Credit Ledger — Design Spec

**Date:** 2026-05-31
**Status:** Draft for review
**Phase:** 7 (askRoss LLM program) — sub-project ① of 4
**Author:** Session brainstorm (Andreas + Claude)

---

## 0. Program context (why this exists)

Phase 7 ("askRoss LLM") decomposed during brainstorming from a single feature
into a **four-component program**, because the billing concern turned out to be
shared platform infrastructure rather than an askRoss feature:

```
                 ┌─────────────────────────────────────────┐
   Payment Rail  │  ③ the single "money in" pipe (7B)       │
   ──────────────┤      external long-poles: gateway, KYC,  │
                 │      Anthropic wholesale rate            │
                 └───────┬───────────────────────┬──────────┘
                  top-ups│                recurring charges
        ┌───────────────▼────────┐      ┌────────▼─────────────────┐
        │ ① Credit Ledger        │      │ ④ Subscription/          │
        │   (metered: tokens,    │      │   Entitlements           │
        │    OCR, SMS)           │      │   (recurring: tier,      │
        │   ← THIS SPEC          │      │    workflow add-on packs,│
        └───────────┬────────────┘      │    seats)                │
        checkBalance │ debit            │   seeded by existing     │
        ┌───────────▼────────────┐      │   tier-gating system     │
        │ ② askRoss Agent (7A)   │      └──────────────────────────┘
        │   tools, risk tiers,   │
        │   prompt caching       │
        └────────────────────────┘
```

**Build order:** ① Ledger (this spec, no external deps) → ② Agent → then ③ and ④
(speced separately; ④ is brainstormed immediately after this spec, before any build).

**North star for the whole program (WHY-derived):** *Ross runs the paperwork,
not the restaurant.* The founder's belief — "technology should amplify human
connection, not replace it" — means the agent swallows administrative drudgery
so the operator is freed for the moments that matter. The ledger's job is to make
that affordable and fair: meter what Ross consumes, charge honestly, never let
cost run away.

---

## 1. Purpose & boundaries

A **shared, feature- and provider-agnostic platform service** that meters paid
usage per owner and enforces a prepaid ZAR balance. First consumer is askRoss
(Claude tokens). The same ledger later meters Google Vision OCR (pages) and
Twilio WhatsApp/SMS (messages) with no rework — those consumers just call the
same module with different `units`.

### In scope (v1)
- RTDB ledger schema: credits, immutable usage log, price table, grant audit.
- Internal ledger module (`functions/billing/ledger.js`): `checkBalance`,
  `recordUsageAndDebit`, `grantCredit`, plus read helpers.
- The cost formula (USD rate × FX × markup), with per-record rate snapshot.
- Public CFs: `billingGrantCredit` (superAdmin), `billingGetBalance` and
  `billingGetUsage` (owner-scoped reads).
- Security rules locking `billing/*` to server-only.
- Unit tests to the project's 80%+ bar.

### Out of scope (deferred, with owner)
- Payment gateway / top-up checkout (→ ③ Payment Rail, 7B).
- Auto-reload.
- Monthly free allowance (v1 is **superAdmin-grant-only** — see §8).
- Rich usage dashboard (v1 ships raw paginated rows only).
- Wiring OCR / WhatsApp as live consumers (interface supports them; wiring later).
- Subscription / entitlements / paid workflow add-on packs (→ ④, separate spec).

---

## 2. Decisions locked during brainstorm

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Unit of account | **ZAR cents + immutable usage log** | Mirrors Anthropic's own prepaid-wallet billing; owners are non-technical SA operators who need honest rand; easy reconciliation against the upstream USD invoice |
| Cost basis | USD per-token rate × USD→ZAR FX × markup | Passthrough + markup is the chosen revenue model |
| Rate handling | **Snapshot rate into every usage record** | Historical records never shift when prices/FX/markup change; margin visible per call |
| When charged | **Post-flight, success only** | Matches Anthropic ("only successful calls billed"); exact token counts come from the API response `usage` object — no estimation |
| Concurrency | RTDB `transaction()` on balance | Race-safe across concurrent turns |
| v1 credit seeding | **SuperAdmin grant only** | Tightest cost control for a controlled beta; defers the free-allowance product decision |
| Read CFs in v1 | **Both** balance + minimal usage | Balance is needed for the agent's low-balance UX; usage is needed for support/debugging |
| Security | All `billing/*` server-only; reads via CF | Applies the H-2 lesson — no root-readable money data |

---

## 3. Data model (RTDB)

All nodes are **server-only** (`.read: false`, `.write: false` — Admin SDK only).

```
billing/
  credits/
    {uid}/
      balanceCents: number        // ZAR cents; mutated only via transaction()
      updatedAt: number

  usage/
    {uid}/
      {recordId}/                 // push key — immutable once written
        service: string            // 'askRoss' | 'ocr' | 'whatsapp' | ...
        model: string|null         // e.g. 'claude-sonnet-4-6' (LLM services only)
        units:                     // generic; shape varies by service
          inputTokens: number
          outputTokens: number
          cacheWriteTokens: number
          cacheReadTokens: number
        rateSnapshot:              // the exact rates used, frozen
          usdPerMtokInput: number
          usdPerMtokOutput: number
          cacheWriteMult: number   // e.g. 1.25
          cacheReadMult: number    // e.g. 0.10
          usdToZar: number
          markup: number           // e.g. 1.3
        wholesaleUsdCents: number  // our cost (margin = costZarCents - wholesaleUsd·fx)
        costZarCents: number       // what the owner paid (debited)
        balanceAfterCents: number  // running balance snapshot at write time
        meta:                      // free-form context, service-specific
          runId: string|null
          turnId: string|null
          workflowId: string|null
        createdAt: number

  priceTable/                      // single config node; superAdmin-writable (server-side)
    fx:
      usdToZar: number
      updatedAt: number
    markup: number                 // global multiplier on wholesale cost
    models/
      {modelId}/                   // e.g. 'claude-sonnet-4-6'
        usdPerMtokInput: number
        usdPerMtokOutput: number
        cacheWriteMult: number     // default 1.25
        cacheReadMult: number      // default 0.10

  grants/
    {uid}/
      {grantId}/                   // audit trail of comp grants
        amountCents: number
        grantedBy: string          // superAdmin uid
        reason: string
        createdAt: number
```

**Why `units` is generic:** OCR will write `units: { pages: N }`, WhatsApp
`units: { messages: N }`. The price table grows a non-model rate section for those
later. v1 implements only the token path, but the record shape and module
interface are already consumer-agnostic.

---

## 4. The ledger module (`functions/billing/ledger.js`)

Internal module — **not** directly exposed as Cloud Functions except via the thin
wrappers in §5. Consumers (rossChat now; OCR/WhatsApp later) import and call it
server-side.

```js
// Pre-flight gate. Cheap single read. Returns boolean.
async function checkBalance(uid, minCents = 1) { ... }

// Post-flight, success-only. Computes cost from the CURRENT price table,
// snapshots the rate, appends an immutable usage record, and debits the
// balance atomically via transaction(). Returns { costZarCents, balanceAfterCents }.
async function recordUsageAndDebit({ uid, service, model, units, meta }) { ... }

// Comp grant. Credits balance + writes grant audit. (superAdmin enforced at CF layer.)
async function grantCredit({ uid, amountCents, grantedBy, reason }) { ... }

// Read helpers (back the read CFs).
async function getBalanceCents(uid) { ... }
async function getUsage(uid, { limit, before }) { ... }   // newest-first, paginated
```

### Cost formula (the heart of the module)

```
inToksUsd    = inputTokens      / 1e6 * usdPerMtokInput
outToksUsd   = outputTokens     / 1e6 * usdPerMtokOutput
cacheWrUsd   = cacheWriteTokens / 1e6 * usdPerMtokInput * cacheWriteMult   // ~1.25×
cacheRdUsd   = cacheReadTokens  / 1e6 * usdPerMtokInput * cacheReadMult    // ~0.10×

wholesaleUsd   = inToksUsd + outToksUsd + cacheWrUsd + cacheRdUsd
costZarCents   = round(wholesaleUsd * usdToZar * markup * 100)
wholesaleUsdCents = round(wholesaleUsd * 100)
```

Token counts come verbatim from the Claude API response `usage` object
(`input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
`cache_read_input_tokens`). No estimation anywhere.

### Concurrency & integrity
- Balance mutations (`recordUsageAndDebit`, `grantCredit`) run inside an RTDB
  `transaction()` on `billing/credits/{uid}/balanceCents`.
- Usage records are push-key appends — no contention, naturally immutable.
- A debit that would take balance below zero is **still written** (we charge
  actuals for a successful turn); the *next* turn's `checkBalance` gate is what
  stops further spend. Worst case overspend = one turn. Acceptable and bounded.

---

## 5. Public Cloud Functions (thin wrappers)

| CF | Auth | Purpose |
|----|------|---------|
| `billingGrantCredit` | `verifySuperAdmin` | Comp a beta owner; calls `grantCredit`; writes audit |
| `billingGetBalance` | `verifyUserOrAdmin` | Owner reads own `balanceCents` |
| `billingGetUsage` | `verifyUserOrAdmin` | Owner reads own usage history, paginated, newest-first |

`recordUsageAndDebit` and `checkBalance` are **never public CFs** — only
server-side consumers call them through the module. This keeps the debit path off
the network surface entirely.

`billingGetUsage` is intentionally bare-bones in v1 (raw rows for support/debug),
no aggregation or charting.

---

## 6. Security

Applies the H-2 cross-tenant lesson (RTDB read rules cascade; root reads can't be
rule-filtered, so don't expose money data at the root):

- `billing/credits`, `billing/usage`, `billing/grants`, `billing/priceTable`:
  `.read: false`, `.write: false`. Admin SDK only.
- Owners reach their balance/usage **exclusively** through `billingGetBalance` /
  `billingGetUsage`, which read via Admin SDK and scope to `auth.uid`.
- Price-table edits are superAdmin-only and happen server-side (script or a future
  admin CF), never from a client.
- No client anywhere can write a balance. The only balance-increasing path in v1
  is `billingGrantCredit` behind `verifySuperAdmin`.

---

## 7. Testing

- **Cost-formula golden vectors:** assert `costZarCents` for known token mixes
  against the live rate card (incl. cache-read/write multipliers). Copy the rate
  card into the test fixture verbatim.
- **Concurrency:** two simultaneous `recordUsageAndDebit` calls → balance is
  internally consistent (no lost debit).
- **Grant audit + immutability:** a grant writes both balance and audit row;
  a written usage record is never mutated.
- **Gate behaviour:** `checkBalance` returns false at/below `minCents`.
- Target the project's 80%+ coverage bar for the new module.

---

## 8. v1 usability bridge (no payment rail yet)

Because ③ Payment Rail doesn't exist in v1, the **only** way an owner gets a
balance is `billingGrantCredit` (superAdmin). Operational flow for beta:
1. You add a beta owner.
2. You run `billingGrantCredit({ uid, amountCents, reason })` to comp them.
3. Ross works until the balance hits zero; then the agent surfaces a
   "credit exhausted — contact your admin" state (UX defined in the ② Agent spec).

When ③ lands, top-ups become self-service and `billingGrantCredit` remains as the
comp/support tool.

---

## 9. Interfaces other components depend on

- **② Agent** depends on: `checkBalance(uid)` before a turn;
  `recordUsageAndDebit(...)` after a successful turn. Nothing else.
- **④ Entitlements** is a **sibling**, not a dependency — it answers "what is this
  owner entitled to?" (tier, workflow packs, seats) via the existing tier system,
  not "how much money is left?" The agent may consult both independently
  (entitlements to know *which* tools/templates are allowed; ledger to know if
  there's *budget* to run them). Their interfaces stay separate.
- **③ Payment Rail** depends on: `grantCredit(...)` (top-ups are just grants with
  a different `grantedBy`/`reason`) and the price table.

---

## 10. Open questions for review

1. **Markup value** — what multiplier? (Placeholder 1.3 / 30%.) Decide before the
   price table is seeded; it lives in config so it's a one-edit change later.
2. **FX source** — manual `usdToZar` in the price table (updated by script), or a
   scheduled FX-fetch CF? v1 recommendation: manual, updated when you top up your
   own Anthropic credit. Revisit in ③.
3. **`minCents` gate threshold** — block a turn at balance ≤ 0, or keep a small
   reserve (e.g. ≤ 50c) to avoid mid-conversation cut-offs? Recommend a small
   reserve; final value set with the ② Agent UX.
4. **Credit expiry** — Anthropic expires credits after 1 year. Mirror that for
   owner credits, or not? Recommend **not** in v1 (grant-only beta); revisit in ③.
```
