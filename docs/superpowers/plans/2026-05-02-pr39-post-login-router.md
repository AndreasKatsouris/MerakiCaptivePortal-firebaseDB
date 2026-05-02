# Implementation Plan: PR #39 — `feat/post-login-router`

**Date:** 2026-05-02
**Spec:** `docs/superpowers/specs/2026-05-02-ross-central-funnel-cleanup-design.md` (§3.1, §3.5, §3.6, §5 row 1, §A "PR 1")
**Branch:** `feat/post-login-router`
**Planner agent:** `a00170329fdf3e2aa`
**Status:** EXECUTED — see PR #39

## Overview

First code PR of the Phase 5 cleanup spec. Builds the single source of truth for post-login routing as a pure decision function + impure wrapper, wires **only** `signup.js` to it (the other five call sites are deferred to PR #42 rollout), gates `/onboarding-ross-hello.html` behind auth, and persists `helloSeen` so returning users don't re-see the hello.

This PR is foundation-laying, not behavioural-replacement. The router exists and is exercised by exactly one path; PR #42 flips the rest.

## Restated requirements

1. New module `public/js/auth/post-login-router.js` with two exports:
   - `resolvePostLoginDestination(user) → Promise<string>` — pure (does RTDB reads, no navigation; returns the path string)
   - `routePostLogin(user, navigate?) → Promise<void>` — thin wrapper that calls the resolver then navigates; `navigate` injectable for testability
2. Decision matrix (8 rows, plus backwards-compat for missing `helloSeen`):

   | Auth state | `onboarding-progress` state | `ROSS_ONBOARDING_HELLO` | `ROSS_IS_HOME` | Destination |
   |---|---|---|---|---|
   | unauthed | — | — | — | `/user-login.html?message=unauthorized` |
   | authed | node missing | — | — | `/onboarding-wizard.html` |
   | authed | `completed: false` | — | — | `/onboarding-wizard.html` |
   | authed | `completed: true`, `helloSeen` missing | on | — | (treat as helloSeen=true → fall through) |
   | authed | `completed: true`, `helloSeen: false` | on | — | `/onboarding-ross-hello.html` |
   | authed | `completed: true`, `helloSeen: false` | off | on | `/ross.html` |
   | authed | `completed: true`, `helloSeen: true` | — | on | `/ross.html` |
   | authed | `completed: true`, `helloSeen: true` | — | off | `/user-dashboard.html` |

3. `/onboarding-ross-hello.html` adopts the `/ross.html` gate pattern (auth-only, no subscription tier check).
4. `RossOnboardingHello.vue.onContinue()` and `onTour()` write `helloSeen: true` to `onboarding-progress/{uid}` **before** redirecting (and tolerate write failure by still redirecting — UX over consistency since this is one-shot).
5. `signup.js` initialises `onboarding-progress/{uid} = { completed: false, helloSeen: false }` at account creation and replaces the hardcoded redirect at line 402 with `routePostLogin(freshUser)`.
6. `session-expiry-handler.js` adds `'onboarding-ross-hello.html'` to `PROTECTED_PAGES`.
7. `database.rules.json` — verified wide-open self-write (lines 52–57): `auth.uid === $uid` write permission, no `.validate` constraints. **No rule change required.**

## Architecture changes

| File | Change |
|------|--------|
| `public/js/auth/post-login-router.js` | NEW — pure resolver + impure wrapper |
| `tests/unit/post-login-router.test.js` | NEW — vitest decision-matrix tests, 100% coverage |
| `public/onboarding-ross-hello.html` | Add gate pattern modelled on `/ross.html` lines 14–77 (without subscription-tier check) |
| `public/js/modules/ross/v2/main-hello.js` | No change — already mounts on `#app` which the gate creates |
| `public/js/modules/ross/v2/components/RossOnboardingHello.vue` | `onContinue` + `onTour` write `helloSeen: true` before redirect |
| `public/js/signup.js` | Add `onboarding-progress/{uid}` init in the user-creation block (~line 392); replace redirect at line 402 with `routePostLogin(freshUser)` (raced with toast via `Promise.all`) |
| `public/js/auth/session-expiry-handler.js` | Add `'onboarding-ross-hello.html'` to `PROTECTED_PAGES` |
| `public/js/onboarding-wizard.js` | **`set()` → `update()`** at line 381 (preserves `helloSeen` written by hello before wizard ran) — pre-flight discovery, see Risks |
| `public/kb/features/ROSS.md` + `KNOWLEDGE BASE/architecture/DATA_MODEL.md` | Document `helloSeen` field contract (writer, reader, backwards-compat rule) — per LESSONS rule, KB lands in same PR as field |
| `database.rules.json` | **No change** — pre-flight verified |

## Server-contract / RTDB invariants verified before code

```bash
# 1. Confirm RTDB rule for onboarding-progress is wide-open self-write
rg -n "onboarding-progress" database.rules.json
# Result: ".write": "auth != null && (auth.uid === $uid || auth.token.admin === true)"
# No .validate clause naming child keys → helloSeen write succeeds.

# 2. Confirm no Cloud Function reads onboarding-progress
rg -n "onboarding-progress|onboardingProgress" functions/
# Result: 1 match — functions/index.js:905 is a `.remove()` on user
# deletion. Benign — full node removal includes helloSeen.

# 3. Confirm users/{uid} writes go through direct client writes (not a CF)
rg -n "users/\$\{.*\.uid\}|set\(userRef|update\(userRef" public/js/signup.js
# Result: existing direct client set/update at lines ~371, 369 — confirms
# client-write pattern; new onboarding-progress init follows same shape.

# 4. Confirm flags exist
rg -n "ROSS_IS_HOME|ROSS_ONBOARDING_HELLO" public/js/config/feature-flags.js
# Result: lines 12, 16. Both default true.

# 5. Defensive-read audit
rg -n "onboarding-progress" public/js/
# Result: onboarding-wizard.js, user-dashboard.js, user-service.js — all
# read .completed only; helloSeen is invisible to them. Safe.
# (Critical follow-up: onboarding-wizard.js writes via SET — see Risks.)
```

## Implementation phases (executed in order)

### Phase A — Pre-flight verification

1. Ran greps 1–5 above. **Found:** `onboarding-wizard.js:381` uses `set()` not `update()` — would silently wipe `helloSeen` after wizard completes. Expanded scope by one line to fix this.
2. Verified vitest is configured (`package.json: "test": "vitest run"`); used vitest, not the planner's fallback "self-contained Node script".
3. Verified `update` is exported from `firebase-config.js:6` along with `ref`, `set`, `get`, `rtdb`.
4. Created worktree: `git worktree add .worktrees/feat-post-login-router -b feat/post-login-router`.

### Phase B — Router module + tests (TDD)

5. Wrote `tests/unit/post-login-router.test.js` first (red): 19 tests covering all 8 matrix rows + edge cases (null user, empty uid, corrupt RTDB data, missing `completed`, missing `helloSeen`) + wrapper happy/error/default-navigator paths.
6. Wrote `public/js/auth/post-login-router.js` (green): pure resolver + impure wrapper with injectable `navigate` for testability. Defaults to `window.location.href`.
7. Mocking: relied on existing global `vitest.setup.js` firebase mock + per-file `vi.mock` for `feature-flags.js`.
8. **Pinned 100% coverage:** 27/27 statements, 21/21 branches, 3/3 functions, 22/22 lines.

### Phase C — Hello page auth gate

9. Replaced `public/onboarding-ross-hello.html` body with `#gate` placeholder + inline `<script type="module">` that mirrors `/ross.html`. Skipped subscription-tier check (onboarding is pre-tier). Inked-background gate styling matches the hello stage for invisible transition.

### Phase D — Hello CTA persists `helloSeen`

10. Added `markHelloSeen()` async helper in `RossOnboardingHello.vue` script setup. Helper checks `auth.currentUser?.uid` first so future public mount (PR 3) safely no-ops.
11. `onContinue` and `onTour` both `await markHelloSeen()` before redirect. Write failures logged but don't block (one-shot, no data loss).
12. Field-contract comment added in component + router pointing back to `public/kb/features/ROSS.md`.

### Phase E — `signup.js` wiring

13. Added `update` to firebase-config import line.
14. Added `routePostLogin` import from new auth module.
15. Inserted `onboarding-progress/{uid}` init in the **new-user branch only** (not the merge branch — race-protection at line 354 means existing accounts must not be reset).
16. Replaced `setTimeout(() => { window.location.href = ... }, 2000)` with `await Promise.all([new Promise(r => setTimeout(r, 2000)), routePostLogin(freshUser)])`. Navigation happens at `max(toast, router)` — never beats the toast.
17. Toast message changed from "Redirecting to setup wizard…" to "Redirecting…" (destination is now dynamic).

### Phase F — Session expiry allowlist

18. Added `'onboarding-ross-hello.html'` to `PROTECTED_PAGES` in `session-expiry-handler.js`.

### Phase G — Wizard `set` → `update` fix

19. Changed `onboarding-wizard.js:381` from `await set(...)` to `await update(...)`. Preserves any prior fields (especially `helloSeen`). Inline comment explains why.

### Phase H — KB doc updates

20. Added field contract block to `public/kb/features/ROSS.md` under Phase 5 PR 1 section.
21. Expanded `KNOWLEDGE BASE/architecture/DATA_MODEL.md`'s `onboarding-progress` entry from one-line to full schema + field-owner table.

### Phase I — Build + smoke + preview

22. `npm run build` passed.
23. Re-ran vitest with coverage: 19/19 pass, 100% coverage.
24. Deployed preview channel: `https://merakicaptiveportal-firebasedb--pr39-post-login-router-f5i3cz3a.web.app` (expires 2026-05-09).

### Phase J — Commit + push + PR

25. Single commit on `feat/post-login-router` with conventional message.
26. Pushed; opened PR #39 with full test plan and preview URL.

## Open questions (resolved during execution)

| # | Question | Resolution |
|---|----------|----------|
| Q1 | Test framework | Vitest (verified in `package.json`); planner's "self-contained Node script" fallback not needed. Added `@vitest/coverage-v8` as devDep for the 100% coverage gate. |
| Q2 | CF for `onboarding-progress` writes vs trust security rules | Trust the rule (current pattern). Adding a CF for `helloSeen` and not for `completed` would create asymmetry. |
| Q3 | Router purity vs `isEnabled()` URL-side-effect | Acceptable. JSDoc'd the soft impurity. |
| Q4 | Hello-write failure UX | Continue to redirect (one-shot, no data loss). Logged. |
| Q5 | Existing-user backfill | Rely on matrix rule (missing `helloSeen` on completed wizard treated as `true`). No backfill script. |
| Q6 | Where in signup.js to init `onboarding-progress` | New-user branch only. |

## Risks (with mitigations applied)

| Severity | Risk | Mitigation applied |
|---|------|---|
| **HIGH (resolved)** | `helloSeen` write could silently fail if rule were stricter than assumed | Pre-flight grep confirmed wide-open self-write. No change needed. |
| **HIGH (resolved)** | `onboarding-wizard.js` uses `set()` which would wipe `helloSeen` after wizard completion | Pre-flight discovery. Fixed in same PR (`set()` → `update()`). Without this, the matrix would mis-route every post-wizard user. |
| HIGH | Router read failure could strand user on signup screen | Wrapper try/catch with fallback to `/user-dashboard.html`. Tested. |
| MED | Test framework choice ships file CI can't auto-run | Vitest already configured; tests run via `npm test` automatically. |
| MED | Field-name drift if a future surface writes `hello_seen` instead of `helloSeen` | Field-contract comments in router + RossOnboardingHello.vue + KB doc anchor the contract. |
| MED | Symmetric-write hole if other code paths set `helloSeen` | Currently only `RossOnboardingHello.vue`. Public mount (PR 3) safely no-ops via `auth.currentUser?.uid` guard. |
| LOW | Hello-page gate adds flash of "Verifying access…" before Vue mounts | Inked-background gate matches the hello stage; near-invisible transition. |
| LOW | Toast disappears before navigation if router read >2s | `Promise.all` race — navigation waits for both toast AND router. |
| LOW | Mid-onboarding user manual-navigates to `/ross.html` and sees broken cards | Pre-existing behaviour. Documented as resolved by PR ≈#42 rollout. |

## Acceptance criteria (all met)

- [x] `npm run build` passes
- [x] `public/js/auth/post-login-router.js` exists with both exports + JSDoc matrix
- [x] `tests/unit/post-login-router.test.js` covers all 8 matrix rows + edge cases; **100% coverage** verified via `@vitest/coverage-v8`
- [x] `/onboarding-ross-hello.html` rejects unauthed visitors → bounces to login
- [x] Authed visitors mount the Vue app via dynamic-import after gate
- [x] `RossOnboardingHello.vue.onContinue/onTour` write `helloSeen: true` before redirect
- [x] `signup.js` initialises `onboarding-progress/{uid}` for new accounts
- [x] `signup.js` uses `routePostLogin(freshUser)` instead of hardcoded redirect
- [x] `onboarding-wizard.js:381` uses `update()` not `set()` (preserves `helloSeen`)
- [x] `session-expiry-handler.js` allowlist contains the hello page
- [x] No CF changes; no rule changes
- [x] Other 5 redirect call sites untouched (deferred to PR ≈#42)
- [x] KB doc (`public/kb/features/ROSS.md` + `DATA_MODEL.md`) documents the `helloSeen` field contract in the same PR
- [x] Preview channel deployed
- [x] PR opened with test plan and preview URL

## Self-double-check (per validated PR-#35-era pattern)

State-combination holes audited; no enum or matrix gap detected. Symmetric write/read paths accounted for: only writer is `RossOnboardingHello.vue`, only reader is `post-login-router.js`. Future public mount safely no-ops. Backwards-compat rule covers existing accounts.

## What this plan does NOT do (deferred to other PRs in the spec)

- Wire the other 5 redirect call sites (`user-login.js` ×2, `onboarding-wizard.js` completion, `user-dashboard.js`, `dashboard.store.js`) — **PR ≈#42**
- Hi-Fi rewrite of any surface — **PR ≈#40 (signup), PR ≈#41 (homepage)**
- Tier collapse (Free/All-in) and `tier` field write — **PR ≈#40**
- ROSS sidebar redesign — **PR ≈#43**
