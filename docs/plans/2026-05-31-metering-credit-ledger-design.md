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
usage per owner and enforces a prepaid USD balance. First consumer is askRoss
(Claude tokens). The same ledger later meters Google Vision OCR (pages) and
Twilio WhatsApp/SMS (messages) with no rework — those consumers just call the
same module with different `units`.

### In scope (v1)
- RTDB ledger schema: credits, immutable usage log, price table, grant audit.
- Internal ledger module (`functions/billing/ledger.js`): `checkBalance`,
  `recordUsageAndDebit`, `grantCredit`, plus read helpers.
- The cost formula (USD rate × markup; **USD-denominated, no FX in v1**), with per-record rate snapshot.
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
| Unit of account | **USD cents + immutable usage log** (revised 2026-05-31) | Mirrors Anthropic's own prepaid-wallet billing **1:1 with zero conversion** (they bill us in USD); no FX layer to maintain; **global-ready** — multi-currency display/collection becomes an additive layer (in ③ Payment Rail), not a refactor. Each record carries `currency: 'USD'` so future records can be other currencies. |
| Cost basis | USD per-token rate × markup (**no FX**) | Passthrough + markup is the chosen revenue model; FX/ZAR conversion deferred to the payment rail (future "go global") |
| Rate handling | **Snapshot rate into every usage record** | Historical records never shift when prices/markup change; margin visible per call |
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
      balanceCents: number        // USD cents; mutated only via transaction()
      currency: string            // 'USD' (v1) — present for future multi-currency
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
          markup: number           // e.g. 1.30
        currency: string           // 'USD' (v1)
        wholesaleUsdCents: number  // our cost (margin = costCents - wholesaleUsdCents)
        costCents: number          // USD cents — what the owner paid (debited)
        balanceAfterCents: number  // running balance snapshot at write time
        meta:                      // free-form context, service-specific
          runId: string|null
          turnId: string|null
          workflowId: string|null
        createdAt: number

  priceTable/                      // single config node; superAdmin-writable (server-side)
    markup: number                 // global multiplier on wholesale cost (1.30)
    updatedAt: number              // when the rate card was last set
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
async function checkBalance(uid, minCents = DEFAULT_BALANCE_FLOOR_CENTS) { ... }

// Post-flight, success-only. Computes cost from the CURRENT price table,
// snapshots the rate, appends an immutable usage record, and debits the
// balance atomically via transaction(). Returns { costCents, balanceAfterCents }.
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

wholesaleUsd      = inToksUsd + outToksUsd + cacheWrUsd + cacheRdUsd
costCents         = round(wholesaleUsd * markup * 100)   // USD cents (no FX in v1)
wholesaleUsdCents = round(wholesaleUsd * 100)
```

**USD-denominated (no FX).** The ledger stores and charges in USD cents — mirroring
Anthropic's own USD billing 1:1, no conversion. ZAR/multi-currency display + collection
is a future "go global" layer in ③ Payment Rail; each record carries `currency: 'USD'`
so the model already supports it.

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

- **Cost-formula golden vectors:** assert `costCents` for known token mixes
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

## 10. Open questions — RESOLVED (2026-05-31, operator delegated "you decide")

1. **Markup value** — **LOCKED at 1.30 (30%).** Covers support cost + buffer. Lives in
   `priceTable/markup` config, so it's a one-edit change with forward-only effect
   (history is rate-snapshotted).
2. **FX source** — **N/A. Ledger is USD-denominated (revised 2026-05-31).** No FX in v1
   — the ledger mirrors Anthropic's USD billing 1:1 with zero conversion. ZAR /
   multi-currency display + collection is a future "go global" layer in ③ Payment Rail;
   records carry `currency: 'USD'` so the model already supports it. (Removes the prior
   `fxStaleWarning` mechanism — there's no FX to go stale.)
3. **`minCents` gate threshold** — **`DEFAULT_BALANCE_FLOOR_CENTS = 50`** (≈ 2–8 typical
   turns of headroom at current Sonnet-4-6 + 30% rates) to avoid mid-conversation
   cut-offs. Exported named constant (not a magic number). **Final value is owned by
   the ② Agent UX spec** — the agent's "low balance" state determines the right
   reserve; this is the safe default until then.
4. **Credit expiry** — **None in v1** (grant-only beta, small user set, trivial to
   re-grant). Mirror Anthropic's 1-year window only when ③ Payment Rail lands and
   owners top up real money.

## 11. Implementation notes (from #106 review — fold into the build PR)

These are build-phase concerns, captured here so they don't surprise the
implementation PR. None change the architecture above.

1. **Atomicity — debit then usage-write.** `transaction()` is single-path; the
   `push()` of the usage record is a second write. To avoid "charged with no audit
   row" if the second write fails: **pre-generate the push key before the
   transaction** (`const recordKey = push(ref(db, \`billing/usage/${uid}\`)).key` —
   local, no I/O), compute `balanceAfterCents` inside the transaction, then write the
   usage record at the known `recordKey` with retry (idempotent on the same key).
   Comment the gap + retry contract in `ledger.js`.
2. **`units` dispatch — throw on unknown service.** The cost formula is token-specific;
   a future `units: { pages: 3 }` would compute `undefined/1e6 = NaN`. Implement
   `computeCostCents(service, units, rateSnapshot)` with a `switch` that **throws on an
   unknown service** rather than silently billing zero. v1 implements only `askRoss`.
3. **`billingGetUsage` newest-first.** RTDB orders ascending — use
   `orderByKey() + endBefore(before) + limitToLast(limit)` then reverse
   (`snap.forEach(c => rows.unshift(...))`). Without this, "newest-first" silently
   returns oldest-first.
4. **Rules in the same commit as `ledger.js`.** Ship the `billing/*` `.read:false /
   .write:false` rules in the **same** commit/deploy as the module — never the module
   first (avoids the PR #73-class window where Admin SDK writes work but the public
   surface isn't yet locked).
5. **Export the 3 CFs** (`billingGrantCredit`, `billingGetBalance`, `billingGetUsage`)
   from `functions/index.js` — easy to miss in a new-module PR.
6. **KB catalog drift** — add the 3 CFs to `CLOUD_FUNCTIONS_CATALOG.md` (both copies)
   in the implementation PR.
```
