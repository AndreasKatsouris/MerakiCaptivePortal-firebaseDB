# Implementation Plan — ① Credit Ledger Build (Phase 7)

**Date:** 2026-05-31
**Spec:** `docs/plans/2026-05-31-metering-credit-ledger-design.md` (merged — implement verbatim, no redesign)
**Branch/worktree:** `feature/phase7-ledger-build` · `.claude/worktrees/phase7-ledger-build`
**Status:** Awaiting operator confirmation before any code

---

## Overview
Build a shared, provider-agnostic prepaid **USD** credit ledger: `functions/billing/ledger.js`
(pure cost formula + transaction debit + grant + read helpers), 3 thin Cloud Functions,
server-only `billing/*` RTDB rules (same commit as the module), a price-table seed, and
TDD unit/integration tests. First consumer is askRoss.

## Ground-truth corrections from planning (vs the spec's sketch)
- **CFs use `onRequest` + CORS + Bearer-token decode**, NOT `onCall` — matches the dominant
  Ross CF pattern (`ross.js:402-436`). Auth helpers `verifyAuthToken` / `verifyUserOrAdmin`
  / `verifySuperAdmin` live in `ross.js:48-90` (module-local). **Decision: export them from
  ross.js and reuse** (avoids divergence) — code-reviewer to confirm.
- **Tests = vitest** (no `include` glob → default `**/*.{test,spec}.js`); co-locate at
  `functions/billing/__tests__/`. `firebase-functions-test` is a devDep; transaction tests
  use the **RTDB emulator** for fidelity.
- **USD-denominated (revised 2026-05-31):** no FX, no `usdToZar`, no `fxStaleWarning`. Balance +
  charges in **USD cents**; each record carries `currency: 'USD'`. ZAR/multi-currency is a future
  ③ Payment Rail layer. The seed needs only Anthropic USD-per-Mtok rates (web-search confirmed
  below) + markup 1.30 — no operator FX input.
- **Worktree gotcha:** `functions/node_modules` is not inherited — `cd functions && npm install`
  before any test/deploy from the worktree.

## Files touched
| File | Change |
|---|---|
| `functions/billing/constants.js` | NEW — `DEFAULT_BALANCE_FLOOR_CENTS=50`, `FX_STALE_MS`, default multipliers (1.25/0.10), `DEFAULT_MARKUP=1.30`, service enum |
| `functions/billing/ledger.js` | NEW — `computeCostCents` (service dispatch, throws on unknown), `checkBalance`, `recordUsageAndDebit`, `grantCredit`, `getBalanceCents`, `getUsage` |
| `functions/billing/cloud-functions.js` | NEW — 3 `onRequest` CFs |
| `functions/billing/__tests__/{cost-formula,dispatch,ledger}.test.js` | NEW — TDD |
| `functions/index.js` | EDIT — require + 3 `exports.*` (~line 3684) |
| `functions/ross.js` | EDIT (preferred) — export the 3 auth helpers for reuse |
| `database.rules.json` | EDIT — `billing` block server-only, **same commit as ledger.js** |
| `functions/seeds/seed-price-table.js` | NEW — admin-SDK seed (rates parameterized) |
| `CLOUD_FUNCTIONS_CATALOG.md` ×2 | EDIT — add the 3 CFs |

## Ordered, testable slices (TDD)
0. **Setup:** `cd functions && npm install` in the worktree; read `vitest.setup.js`.
1. **Constants** (`constants.js`).
2. **Cost formula + dispatch — pure unit, TDD:** write `cost-formula.test.js` + `dispatch.test.js`
   RED (golden vectors incl. cache 0.10×/1.25×, FX, markup 1.30, x.5 rounding; throw-on-unknown-service),
   then implement `computeCostCents` GREEN. Zero Firebase — bulk of coverage, cheap.
3. **Ledger I/O — emulator TDD:** write `ledger.test.js` RED (grant+audit, recordUsageAndDebit happy
   path, **pre-gen-key atomicity + idempotent retry = no double debit**, overspend-once allowed,
   concurrency = no lost debit, `checkBalance` gate, `getBalanceCents` default 0, `getUsage`
   newest-first + `before` pagination), then implement GREEN. Comment the atomicity gap + retry
   contract in code (§11.1).
4. **Cloud Functions** (`cloud-functions.js`): `billingGrantCredit` (superAdmin, validate positive int),
   `billingGetBalance` (userOrAdmin, **uid-scoped**, returns `balanceCents` + `currency`),
   `billingGetUsage` (userOrAdmin, uid-scoped, clamp limit ≤ 100, newest-first). Error block mirrors
   ross.js (403/400/500). Export from `index.js`.
5. **Rules** (`database.rules.json`): `"billing": { ".read": false, ".write": false }` — **co-commit
   with ledger.js** (PR #73-class window otherwise).
6. **Seed** (`seed-price-table.js`): standalone admin-SDK script (pattern: `scripts/grant-super-admin.js`),
   writes `billing/priceTable` = `{ markup:1.30, updatedAt, models:{...} }` (no fx). Rates as
   CLI args / top-of-file config; confirm before running.
7. **Docs:** add 3 CFs to both `CLOUD_FUNCTIONS_CATALOG.md` copies.

## Testing & verification
- Pure unit: formula/rounding/dispatch (most of the 80% bar, no Firebase).
- Emulator/firebase-functions-test: transaction atomicity, idempotent retry, concurrency, grant
  audit, getUsage order/pagination, gate.
- CF-level: auth gates, uid-scoping (read can't be redirected via body uid), validation.
- `cd functions && npm install` → `npx vitest run` green, ≥80% on `functions/billing/*`.
- **Deploy:** rules + functions TOGETHER (`firebase deploy --only functions:billing*,database`), never
  functions-first; `npm install` in worktree first.

## Risks & mitigations
- **RTDB transaction fidelity** → use the emulator for `ledger.test.js`; keep formula pure-tested.
- **Atomicity gap (§11.1)** → pre-gen key + idempotent retry on same key; comment the contract; test
  double-write = no double debit.
- **USD-cents rounding drift** → single final `Math.round`; x.5 golden vectors; independent integer
  rounding of `wholesaleUsdCents` and `costCents`.
- **Rules shipped late** → single co-commit (§11.4).
- **Unknown seed rates** → parameterized + operator-confirmed; never guessed.

## Complexity: Medium-High (dominated by transaction correctness + emulator harness)

## Operator input before the seed runs (not before coding) — now minimal
USD-denominated, so **no FX input needed**. The seed uses only published Anthropic USD rates +
the locked markup:
- **Anthropic USD rates** (web-search 2026-05-31): Sonnet `$3`/`$15` per Mtok in/out; Haiku 4.5
  `$1`/`$5`; cache write 1.25×, cache read 0.10×. Confirm these are the models/rates to seed.
- **Markup** locked at **1.30**. No `usdToZar`, no FX.

## Subagent-driven execution
tdd-guide (slices 2-3) → implementation → security-reviewer (rules + uid-scoping) → code-reviewer
(per GREEN slice; resolves helper export-vs-duplicate) → co-deploy.

**STOP — plan only. No code until operator confirms.**
