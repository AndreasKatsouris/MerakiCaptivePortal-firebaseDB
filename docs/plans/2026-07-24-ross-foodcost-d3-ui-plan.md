# ROSS-FoodCost-v2 D3 — Implementation Plan (subagent-driven TDD)

**Date:** 2026-07-24
**Spec:** `docs/plans/2026-07-24-ross-foodcost-d3-ui-design.md` (v2 — the contract;
§ references point there). Parent: `docs/plans/2026-06-22-ross-foodcost-v2-design.md`.
**Branch:** `feature/ross-foodcost-d3-ui` (this worktree).

## Ground rules (every implementer)

- `functions/` is CJS (`'use strict'`, `require`/`module.exports`); `public/` is
  browser ESM. Vitest invocations root-relative ONLY (`npx vitest run <path>`).
- NEVER edit v1 food-cost files (`refactored-app-component.js`,
  `data-processor.js`, `services/data-service.js`, `database-operations.js`) —
  import from them only, WITHOUT any `?v=` query suffix (§G3).
- Shared files owned by this PR alone: `database.rules.json`, `functions/index.js`.
- Notifications on the v2 surface = inline banners; no SweetAlert2; no `v-html`;
  Hi-Fi `Hf*` components + `--hf-*` tokens for new UI.
- Tests RED first. Each task ends with its suites + `npx vitest run functions/agent`
  (regression) green.

## Tasks (implementers sequential; reviews tiered per D2's validated pattern)

### T1 — Pure client upload utils (`public/js/modules/food-cost/v2/upload/`)

Files: `mapping-memory.js`, `ingest-guards.js` + root-side tests
`tests/unit/food-cost-v2-upload.test.js` (root vitest collects; firebase-config
is globally mocked by `vitest.setup.js`).

- `normalizeHeaders(headers)` (trim/lowercase/collapse-whitespace, order
  preserved), `fingerprintHeaders(headersNorm)` (WebCrypto SHA-256 → hex;
  probe-verified in vitest node env), `validateStoredMapping(stored, headersNorm)`
  (§4c: deep-equal headersNorm + every `mapping` value an integer in
  `[-1, headerCount)`; `-1` legal per the detectAndMapHeaders contract),
  `buildMappingRecord(headersNorm, mapping, label, now)` (shape §4c, length caps
  mirrored client-side).
- `ingest-guards.js`: `checkFileSize(file)` (2 MB, BEFORE read),
  `checkParsedShape({headers, rows})` (5,000 rows / 60 cols, AFTER parse —
  §4d gate placement), typed error results for inline banners.
- Tests: normalization/order-sensitivity, fingerprint determinism, re-validation
  accept/reject lattice (count mismatch, out-of-range, non-integer, `-1` ok,
  headersNorm mismatch), cap fenceposts (exactly 5,000 ok / 5,001 reject; 60/61).

### T2 — CF `foodCostOverview` (`functions/food-cost-overview.js` + registration)

RED: `functions/agent/__tests__/food-cost-overview.test.js` (root vitest collects;
reuse the fake-rtdb + env idioms from `tools.test.js`):
- access trio (attacker / owner-via-ownerId / delegated) + **entitlement gate**
  (authed + location access but `features.foodCost` absent → bare
  `{hasData:false}`; admin bypasses) — all failure shapes DEEP-EQUAL (§4a);
- no-data; payload §5 key-set exactness; trend arrays oldest→newest from record
  history (max 30 points); D1-branch strings sanitized (control chars stripped,
  120-cap — §4a F8); D1-branch item cap applied (oversized latest record → bounded
  work + caveat); `daysToNextDelivery` bounds validation; runway derived from
  daysOfCover with tone thresholds.

GREEN: copy `rossChat.js` conventions (`:23-24` cors, `:589` wrap, `:628-640`
auth via `verifyAuthToken`); reuse `callerHasLocationAccess`
(`require('./agent/tools')`, exported at `:379`); entitlement read mirroring
`ross.js:113-116`; `maxInstances: 5`; single `limitToLast(30)` read; lazy-require
`./agent/food-cost-summary` + `./agent/food-cost/suggest`; sanitize D1 output;
assemble §5 payload. Register `exports.foodCostOverview` in `functions/index.js`
(watch the export-clobber trap — #188's lesson: check for a trailing
`module.exports =` reassignment in the module).

### T3 — Rules node + write-probe script

- `database.rules.json`: the §4c concrete rule block (additive,
  `foodCostMappings/$uid`, `-1`-legal mapping values).
- `scripts/verify-rules-foodcost-mappings.js` (PR-1a REST-probe pattern):
  positive (representative real mapping writes as non-admin) + negatives
  (oversized label / col-index 60 / extra child rejected) + cleanup. Runs
  POST-DEPLOY (operator step; emulator needs Java — unavailable). The probe
  script itself gets a dry syntax run; rules deploy is operator-gated per repo
  convention.

### T4 — v2 service + store rewire

- `v2/service.js`: `getFoodCostOverview({locationId, daysToNextDelivery})` →
  authed `fetch` to the CF (token via `auth.currentUser.getIdToken()`; flat JSON
  body — mirror the client conventions from `ross-agent-client.js`, minus SSE),
  never-throws → `{hasData:false, error}` envelope. Plus
  `loadMapping(fingerprint)` / `saveMapping(record)` / `bumpUseCount` via client
  SDK reads/writes to `foodCostMappings/{uid}/{fp}`.
- `v2/store.js`: overview slice keeps its contract (`load()`); new upload slice
  (status machine: idle→parsed→mapped(auto|manual)→previewed→saving→saved|error,
  fingerprint hit path, M-1 rejection states).
- Tests: `tests/unit/food-cost-v2-store.test.js` — state transitions, one-click
  path (fingerprint hit + valid stored mapping skips the editor), fallback path,
  cap rejections, service error envelope.

### T5 — UI rebuild (`FoodCostApp.vue` + wizard components)

- `FoodCostApp.vue` real-cards layout (§4b, D3-1): KPIs (cost% + spend with real
  sparklines), Ross summary hero (D1/D2 data + Ask-Ross deep-link with sanitized
  bounded seed), order-suggestion table (D2 §5.2 columns; null-cost rendering
  "cost unknown"), stock runway bars (daysOfCover), upload entry + empty state,
  loading skeleton (R-D3-4), inline error banners.
- `upload/FoodCostUploadWizard.vue` (+ small step components as needed, bespoke
  file input + preview table — no Hi-Fi primitives exist for these): file pick →
  guards → parse (`parseCSVData` from `services/data-service.js`, no `?v=`) →
  fingerprint lookup → auto-apply (one-click confirm, preview STILL mandatory —
  F10) or mapping editor (18 fields, `-1` = unmapped, HfSelect) → **value-columns
  warning** when neither openingValue nor closingValue mapped (§4d) → preview
  (Vue `{{ }}` only) → save (`saveStockUsage` import — page-only, never in tests)
  → store mapping + success banner → overview reload.
- No new tests beyond store-level (T4); UI verified by build + preview click-through.

### T6 — Controller verification + preview

1. `npx vitest run tests/unit functions/agent` + full `npm test` delta check
   (failures = pre-existing baseline only); `npm run build` green.
2. CJS byte-check on `functions/` runtime diff; grep the v2 module for `?v=`
   imports (must be none) and `v-html` (must be none).
3. Preview channel deploy (`firebase hosting:channel:deploy foodcost-d3`) for
   operator click-through: golden path (upload → map → save → dashboard), error
   path (oversized file), fingerprint one-click on second upload, mobile
   breakpoint. CF deploy note: `functions:foodCostOverview` needed for the
   preview to work end-to-end — operator-gated or explicit go-ahead.
4. Reviews: T1 combined; T2 full two-stage (security surface); T3 reviewed by
   controller + probe script dry-run; T4 combined; T5 spec-stage (contract) +
   operator preview as the quality stage (the validated preview-catches-what-
   reviews-can't pattern).
5. Pre-push self-review per CLAUDE.md 5b; PR with screenshots + preview URL.

## Out of scope

Menu/waste cards (no data source, D3-1); CSV export (cut, F7); CF-mediated save
(D4); v1 edits incl. its console noise (D4 strip list); `stockUsage` rules
changes (parent H-1, D4).
