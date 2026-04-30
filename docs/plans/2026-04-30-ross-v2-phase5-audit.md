# ROSS v2 — Phase 5 audit: onboarding flow

**Status:** audit only — no production behaviour shipped in this PR
**Branch:** current Phase 5 worktree
**Author:** Claude (session 2026-04-30)
**Sprint goal:** Effective implementation of Hi-Fi v2, starting with ROSS

---

## TL;DR

`getFirstRunFindings()` and `RossOnboardingHello.vue` are **technically wired end-to-end** — the store calls the service, the service runs `detectBestWeekday` against RTDB, and the component renders all four finding states correctly. Build passes.

**However, the page is not reachable from any real user journey.** Signup hands off directly to `/onboarding-wizard.html` (the v1 business-data wizard). Nothing in the codebase links to or redirects to `/onboarding-ross-hello.html`. The page is also served without any auth gate — anyone with the URL can hit it. Both gaps should be addressed in a follow-up PR; they are not narrowly Phase 5 scope (Phase 5 was specified as wiring `getFirstRunFindings`, which is done).

This PR ships the audit document only. Phase 5 is otherwise complete; the journey-integration and auth-gate work is logged below as backlog candidates.

---

## 1. Where `/onboarding-ross-hello.html` sits in the user journey

**Intended (per implementation plan §6 Phase 5):** First-run experience after signup. User signs up → lands on the Ross hello page → sees three "surprising findings" → clicks "Show me everything" → hands off to the v1 business-data wizard.

**Actual today:** Not in the journey at all.

| Stage | Code path | Destination |
|-------|-----------|-------------|
| Signup completes | `public/js/signup.js:402` | `/onboarding-wizard.html` (hardcoded redirect) |
| First sign-in if onboarding incomplete | `public/js/user-dashboard.js:42` | `/onboarding-wizard.html` |
| First sign-in via Vue dashboard | `public/js/modules/user-dashboard/stores/dashboard.store.js:95` | `/onboarding-wizard.html` |
| Direct `/onboarding-ross-hello.html` URL hit | the page itself | renders without auth check |

`onboarding-ross-hello.html` exists as a built v2 surface (Vite entry at `vite.config.js:17`), but **no caller redirects to it**. The "Show me everything" CTA inside the page (line 18 of `RossOnboardingHello.vue`) does navigate to `/onboarding-wizard.html`, so once a user *is* on the page the handoff works — they just never arrive.

---

## 2. End-to-end trace

### Path A — new signup
1. User submits signup form → `signup.js:344` creates Firebase Auth user
2. Writes `users/{uid}`, `subscriptions/{uid}`, `userLocations/{uid}/{locId}`
3. Toast: "Account created successfully! Redirecting to setup wizard..."
4. After 2 s timeout: `window.location.href = '/onboarding-wizard.html'` (line 402)
5. **Ross hello page is skipped entirely.**

### Path B — returning user with incomplete onboarding
1. User signs in via `/login.html`
2. Lands on user dashboard (legacy or Vue 3 rewrite)
3. Either dashboard reads `onboarding-progress/{uid}` and redirects to `/onboarding-wizard.html` if `completed !== true`
4. **Ross hello page is skipped entirely.**

### Path C — direct URL
1. User somehow lands on `/onboarding-ross-hello.html`
2. `main-hello.js` mounts the Vue app — **no auth check**, no `onAuthStateChanged` listener
3. `RossOnboardingHello.vue` `onMounted` calls `store.loadFindings()`
4. `loadFindings` calls `getFirstRunFindings()` → calls `buildContext(auth)` → if no `auth.currentUser`, returns `scriptedFindings()` (all three illustrative)
5. Component renders three findings with "preview" tags and `--illustrative` styling.
6. "Show me everything" CTA → `/onboarding-wizard.html`.

### What's missing to make the page reachable

Two changes outside Phase 5 scope:

1. **A redirect at signup completion** — `signup.js:402` should send first-run users to `/onboarding-ross-hello.html` (which then continues to `/onboarding-wizard.html` via its CTA). This is a one-line change but warrants its own PR with smoke-test screenshots and a feature flag to toggle the experience.
2. **Auth gating on the Ross hello page** — the page should require a signed-in admin (mirror the inline gate on `/ross.html` lines 32–40 that imports `AdminClaims` and runs `verifyAdminStatus`). Without this, the URL is publicly hittable and `getFirstRunFindings()` silently degrades to scripted findings for anonymous visitors.

Both belong together in a follow-up "ROSS v2 — onboarding journey integration" PR.

---

## 3. Verification of finding states

`getFirstRunFindings()` (`public/js/modules/ross/v2/ross-service.js:207-236`) composes three findings: at most one real (`detectBestWeekday`), padded with `FINDINGS_FIRST_RUN` items tagged `source: 'illustrative'`. The component (`RossOnboardingHello.vue`) renders accordingly.

| State | What triggers it | UI behaviour | Status |
|-------|------------------|--------------|--------|
| **Real finding present** | `detectBestWeekday` returns a card (≥ 14 days of sales data, one weekday ≥ 15 % above mean) | Card shown without `--illustrative` opacity dim or "preview" tag. Two illustrative cards follow. | OK — verified by reading component template lines 51–65 |
| **All illustrative** | No real finding (thin data, no auth, detector throws) | All three cards render with `--illustrative` opacity 0.7 + "preview" tag in mono | OK — `scriptedFindings()` maps every entry with `source: 'illustrative'` |
| **Loading** | `data` computed still null (Pinia state pre-fetch) | "Ross is reading your data…" shown via `v-else` (line 84) | OK |
| **Error** | Service throws unexpected error | `loadFindings` catches into `store.error`; **but** the component never reads `store.error`. Result: page sits on the loading message indefinitely. | **Partial gap** — see §4 |

The "preview" tag styling (lines 173–182) is subtle: `opacity 0.6`, uppercase mono, 9 px. Reads as a discreet badge rather than a banner. Per the Phase 2 design decision ("ship 2 real + 1 banner"), this is the intended UX, so it's correct rather than missing — but worth noting the term in the implementation plan was "banner" while the implementation is a "tag". Cosmetic disagreement, not a defect.

---

## 4. Gaps surfaced (backlog candidates, not for this PR)

Logged here for the parent session to fold into `KNOWLEDGE BASE/PROJECT_BACKLOG.md`:

1. **Page not reachable from signup or first sign-in.** `signup.js`, `user-dashboard.js`, and the Vue user-dashboard store all redirect to `/onboarding-wizard.html`. Wire `/onboarding-ross-hello.html` in front of the wizard, behind a feature flag (`ROSS_V2_ONBOARDING`?) so it can be A/B'd or rolled back.
2. **No auth gate on `/onboarding-ross-hello.html`.** The HTML has no `AdminClaims.verifyAdminStatus` inline script. Anonymous URL visitors get scripted findings and the wizard CTA. Mirror the inline gate from `/ross.html` lines 32–40.
3. **Error-state UX is a dead-end.** If `getFirstRunFindings()` throws (rare — it has an outer try/catch that falls back to scripted, but `store.loadFindings` could still error if the service itself rejects), the component shows the loading message forever. Add a visible error state with a retry button, using `store.error`.
4. **Real-data lift threshold may be too aggressive.** `FINDING_MIN_LIFT = 0.15` and `FINDING_MIN_DAYS = 14` mean most new tenants will see zero real findings on day one. Consider lowering thresholds or adding a "I'm still learning" finding-shaped placeholder for the first 14 days.
5. **`detectBestWeekday` runs sequential RTDB reads in nested `for` loops.** Each `salesDataIndex` entry triggers its own `salesData/{id}/dailyData` read serially. For large tenants this can be slow. Parallelise per-location, or aggregate via a Cloud Function.
6. **Step counter is hard-coded to 3 of 5.** `RossOnboardingHello.vue:14-15`. Once the journey has real steps, derive from a wizard-progress source.

---

## 5. What this PR ships

- This audit document.

What it does **not** ship: any code change to the onboarding flow, journey, signup redirect, or auth gate. Each of those is a separate, smaller PR with its own test plan and (where applicable) preview channel.

---

## 6. Build status

`npm run build` passes on this branch (verified 2026-04-30). The `onboarding-ross-hello` Vite entry compiles to ~3.3 kB gz; no errors or warnings beyond the existing baseline.

---

## 7. References

- `public/onboarding-ross-hello.html` — page shell
- `public/js/modules/ross/v2/main-hello.js` — Vue mount
- `public/js/modules/ross/v2/components/RossOnboardingHello.vue` — single component
- `public/js/modules/ross/v2/store.js` — `loadFindings` action
- `public/js/modules/ross/v2/ross-service.js:207-236` — `getFirstRunFindings`
- `public/js/modules/ross/v2/sidebar-detectors.js:199-281` — `detectBestWeekday`
- `public/js/modules/ross/v2/content.js:10-36` — `FINDINGS_FIRST_RUN` (illustrative)
- `public/js/signup.js:402` — current signup terminal redirect
- `public/js/user-dashboard.js:36-42` — first-sign-in onboarding check
- `docs/plans/2026-04-30-ross-v2-implementation.md` §6 Phase 5 — this phase's spec
