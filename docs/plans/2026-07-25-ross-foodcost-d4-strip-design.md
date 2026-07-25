# ROSS-FoodCost-v2 — Deliverable 4: strip-and-harden sweep — Design

**Date:** 2026-07-25
**Status:** Draft v1 (census done; pending adversarial census verification)
**Parent:** `docs/plans/2026-06-22-ross-foodcost-v2-design.md` (§5 D4, G5/G6, H-1/O2)
**Branch:** `feature/ross-foodcost-d4-strip`

## 1. Intent

Close the W1 food-cost track's last deliverable: delete the census-confirmed-dead
v1 code, retire the ghost root `stockUsage` write path, and land the small
hardening items accumulated during D1–D3. **Deletion-heavy PR → the census is the
contract**; every claim below is independently re-verified before any delete lands
(the parent's G5 already caught one "dead" file that was live, and this census
caught another — see §2.4).

## 2. Census (this session, 2026-07-25 — re-verify adversarially)

| # | Claim | Evidence |
|---|-------|----------|
| C1 | `database-operations-v2.js` — ZERO importers | repo-wide grep `database-operations-v2` over js/html/vue: only the file itself |
| C2 | `react-adapter.js` — ZERO importers (it imports firebase-service, nothing imports IT) | grep `react-adapter`: only the file itself |
| C3 | `migration-helpers.js` — ZERO importers (bonus find; not in the parent's G6 list) | grep `migration-helpers`: only the file itself |
| C4 | **`order-calculator-calculus.js` is LIVE — DO NOT DELETE.** Fully wired user-selectable "Calculus" mode in `po-modal.js` (import :9, radio :789-791, generate :228, CSV export :472, insights UI :1131-1282). The parent's "delete if confirmed unwired" is answered: WIRED | `po-modal.js` read this session |
| C5 | `services/firebase-service.js` importers after C2/C3 deletions: ONLY `refactored-app-component.js:58` (`getRecentStoreContext`). (`compliance/index.js` imports its OWN `services/firebase-service.js` — the G6 duplicate-filename trap, different module) | grep this session |
| C6 | **Prod root `stockUsage` is EMPTY** (`shallow=true` → `null`, authed read via throwaway user, 2026-07-25) — the live `getRecentStoreContext` reader is a prod no-op; its consumer (`refactored-app-component.js:1102-1120`) null-guards and falls back to defaults | REST probe this session |
| C7 | ~~Root `stockUsage` writers = `firebase-service.js` only~~ **REFUTED by the census verification, two counts: (1) `database.rules.json:3` carries a GLOBAL root `.write` grant for admin-token users which cascades downward and cannot be revoked at children — the §3.3 edit closes only the NON-ADMIN write arm (admins can still write, schema-free once `.validate` goes); (2) four deployed `tools/dev` HTML diagnostic pages write root `stockUsage` (`test-analytics-admin.html:191`, `test-firebase-rules.html:54-78`, `test-locations.html:68-81`, `test-analytics-with-sales.html:130`) — admin diagnostics, not product flows; they keep working for admins via the root grant, and failing for non-admins is the intended semantics.** Post-deploy write-deny probe MUST use a NON-ADMIN user (an admin probe would succeed and falsely refute the deploy). Bonus census: `all-components.js` + `public/backup/food-cost-refactored.js` are zero-importer dead files carrying root-write code — logged for the post-soak sweep, not this PR | census verification 2026-07-25 |

## 3. Changes

1. **DELETE** (C1–C3): `database-operations-v2.js`, `react-adapter.js`,
   `migration-helpers.js` (all under `public/js/modules/food-cost/`).
2. **STRIP `services/firebase-service.js`** to `getRecentStoreContext` + its
   imports (C5): the root-path write fn and every other now-importer-free export
   go. The kept reader stays byte-identical (live consumer untouched — R4).
3. **Rules: close the NON-ADMIN root `stockUsage` write arm** (H-1/O2, census C7
   as corrected): remove the `$recordId` `.write` grant. **`.validate` is KEPT**
   (build-time deviation, safer direction): the admin root grant means writes
   remain possible for admin-token clients, and the retained `.validate` keeps
   that residual arm schema-constrained instead of schema-free. Honest
   semantics after the edit: **non-admin writes denied everywhere under
   `stockUsage`; admin-token writes remain possible via the GLOBAL root grant at
   `database.rules.json:3`** (cascades downward, not revocable at children —
   closing it is a platform-wide change far outside this PR). **Reads stay**
   (live reader queries the empty node). Post-deploy: **NON-ADMIN** write-attempt
   probe expects deny; v1 surface smoke stays green (reader unaffected).
4. **Console strip** in `data-processor.js` + `services/data-service.js`
   (`console.log/warn` lines only — the D3-accepted tenant-data noise; no logic
   changes; `console.error` in catch blocks stays). These files ARE now v2's
   parse chain, so the noise hits every v2 upload.
5. **v2 store shims removed**: `filter` state + `setFilter` + `filteredMenu`
   getter in `v2/store.js` (unused since T5; grep-verified before removal).
6. **D1 P6 backport** (bug-queue row, security F4): `summariseFoodCost`'s
   `lowStockItems` `itemCode`/`description` get the `sanitizeText` treatment
   (shared with/copied from `suggest.js` with citation) + a control-char test.
   Closes the queue row in the same PR.

## 4. NOT in scope (soak-gated or product decisions)

- `order-calculator-calculus.js` (LIVE — C4). Removing the calculus MODE is a
  product decision, not dead-code cleanup.
- `refactored-app-component.js` + the browser calculator copy + duplicate-modal
  consolidation — parent R4: delete only after the v2 surface soaks (shipped
  2026-07-25; soak just started).
- Root `stockUsage` READ retirement — follows the v1 surface's own retirement.

## 5. Verification

- Adversarial census re-verification (independent agent) BEFORE deletions merge.
- `npm run build` green; full `tests/unit` + `functions/agent` suites green
  (failures = pre-existing baseline only); D1 tool tests still green after §3.6.
- Rules deploy + write-deny probe on root `stockUsage`; v1 admin surface loads
  (reader unaffected) — operator or preview smoke.
