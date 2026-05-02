# Phase 5 Cleanup — ROSS as the Central Funnel (Design Spec)

**Date:** 2026-05-02
**Author:** AI agent (drafted with operator)
**Status:** LOCKED — open questions Q1–Q5 resolved 2026-05-02; ready for PR 1 planning
**Sprint:** "Effective implementation of Hi-Fi v2, starting with ROSS" (continuation)

---

## 0. Why this exists

The locked sprint goal calls ROSS the central point of contact for every subscribed user. The code does not yet enforce that. `ROSS_IS_HOME: true` lives in `feature-flags.js:12` but **no code reads it** — every post-login redirect (signup, login, wizard completion) hardcodes `/user-dashboard.html`. Three v1 surfaces (public homepage, signup, onboarding wizard) sit between a brand-new visitor and ROSS, and all three are pre-Hi-Fi visual artifacts. The ROSS sidebar itself still treats v2 modules as launcher destinations, contradicting the operator's stated mental model that *workflows direct every operation, there theoretically should be no sidebar*.

This spec covers the **house cleanup** — making the funnel from public visitor → ROSS first-class, in Hi-Fi, without the sidebar treating modules as the unit of navigation. Template creation (the next product unlock — workflows that *are* the product) is **out of scope here** and gets its own spec once the funnel is clean.

## 1. Locked product reframes (input to this spec)

Decisions made in conversation, before drafting:

1. **The playbook is the product** (templates → activated workflows → tasks → runs). All four shipped through Phase 4e.2 + the Runs server surface (`rossCreateRun`, `rossSubmitResponse`, etc.). Free vs paid tiers gate **template-library access**, not module features. Per `public/kb/features/ROSS.md`: the Playbook tab is the policy/rules layer the future AI agent runs against.
2. **Two tiers only — Free and All-in.** No tier matrix. Economics TBD; engineering can proceed assuming `tier ∈ {'free', 'all-in'}`.
3. **No POS integrations yet.** All data is manual entry / file upload. Integrations are a deferred unlock surfaced later as new workflow step types.
4. **`/user-dashboard.html` is being deprecated.** Operator (single current user) still uses some v1 modules (notably food-cost) for daily work, so v1 surfaces remain reachable through `admin-dashboard.html` (admin/superAdmin only). They are *not* promoted in the v2 nav and not visible to regular users.
5. **ROSS sidebar should not be a module launcher.** The eventual model is playbook-centric: the concierge home tells the operator what to attend to; the existing Playbook / Activity / People destinations cover authoring, history, and staff. Modules become task input types inside the existing playbook, not destinations.
6. **The captive WiFi portal is a sibling artifact.** It collects guest data but does not feed the operator funnel. Out of scope for this spec.
7. **Public hello content** (`/onboarding-ross-hello.html` + future public landing hello) is **synthetic-but-realistic**, clearly labeled. Real-data hello stays post-signup only — no aggregate-tenant claims without legal review.

## 2. Scope

### In scope

- **5a — Public homepage Hi-Fi rewrite.** `/index.html` becomes a Hi-Fi v2 surface that demonstrates the workflow product (not "10x efficiency, 83% reduction in waste" placeholder stats).
- **5b — Signup Hi-Fi rewrite + tier model collapse to Free/All-in.** `/signup.html` becomes Hi-Fi. Tier selection UI rewritten. Account creation writes `users/{uid}/tier ∈ {'free', 'all-in'}`.
- **5c — Onboarding journey wiring + auth gate.** Make `/onboarding-ross-hello.html` reachable in the signup flow. Add auth gate to `main-hello.js` mirroring the `/ross.html` pattern. Add post-login router that decides destination based on onboarding state.
- **5d — ROSS sidebar redesign.** Strip module-launcher pattern; replace with workflow-centric nav. Module deep-links move out of the sidebar.
- **5e — Deprecation signposting (not deletion).** `user-dashboard.html` stays reachable; banner / nav updates remove it from promoted paths.

### Out of scope (named explicitly)

- Workflow template creation, template library UI, template content. **Next spec.**
- Workflow runner shell + step type library (option A from the brainstorm). **Next spec.**
- POS / accounting / Meta / Google integrations.
- askRoss LLM (Phase 6, separate sprint).
- Captive WiFi portal v2 redesign.
- Marketing-copy strategy beyond replacing obvious placeholders.
- v1 module deletion (food-cost, queue-management, etc.) — they stay reachable until their workflow-step replacements ship.
- `HfModal` / `HfConfirm` design-system components (backlog item #10) — not blocking this work.
- Subscription pricing, payment integration, billing — assumed to exist for All-in (current Stripe wiring already there per existing `subscriptions/{uid}` writes).

## 3. Architecture

### 3.1 Post-login routing — single source of truth

The current state has redirect logic scattered across `signup.js:402`, `user-login.js:26`, `user-login.js:227`, `onboarding-wizard.js:42`, `user-dashboard.js:42`, and `dashboard.store.js:95` — six call sites, all hardcoding `/user-dashboard.html`. Adding a "go to ROSS" branch to each one perpetuates the sprawl.

**Proposed:** new module `public/js/auth/post-login-router.js` exporting:

```js
// Pure decision: given an authed user, return where they belong.
// Performs reads but no redirects — caller does the navigation.
export async function resolvePostLoginDestination(user) {
  // Priority order:
  // 1. Onboarding wizard incomplete → /onboarding-wizard.html
  // 2. Signup just completed (helloSeen !== true) → /onboarding-ross-hello.html
  // 3. Subscription tier check → /ross.html (all-in / free)
  // 4. Fallback (shouldn't fire) → /ross.html
}

export async function routePostLogin(user) {
  const dest = await resolvePostLoginDestination(user)
  window.location.href = dest
}
```

State the router reads:
- `onboarding-progress/{uid}.completed` — wizard done?
- `onboarding-progress/{uid}.helloSeen` — NEW field, set true when hello CTA fires
- `users/{uid}/tier` or existing `subscriptions/{uid}` shape — for tier-gate decisions later

The six call sites become one-liners that call `routePostLogin(user)`. Eliminates drift class.

The router checks `isEnabled('ROSS_IS_HOME')` before returning `/ross.html`. If false, falls back to `/user-dashboard.html` (legacy path). Default stays `true`. Single flag flip reverts the central-point shift if something goes wrong post-deploy. (Resolution of Q5.)

### 3.2 ROSS sidebar — workflow-centric

Current `RossHomeDesktop.vue:63-85` sidebar:

```
Today      → Ross | Overview (group-overview-v2) | Queue (queue-v2)
Guests     → Profiles (guests-v2) | Segments (guests-v2) | Campaigns (campaigns-v2)
Operations → Analytics | Food cost | Receipts | Forecasting
Ross's brain → Playbook | Activity | People
```

This is a module launcher pretending to be navigation. Three issues:
- "Profiles" and "Segments" both link to the same page (broken).
- "Operations" treats v2 modules as siblings of Ross — they're supposed to be *step types inside workflows*.
- "Ross's brain" is the only section that actually fits the agent metaphor.

**Proposed v2 sidebar shape — corrected against `public/kb/features/ROSS.md` IA table:**

```
Today
  └── Ross (active)            ← concierge home: greeting + 3 story cards (existing)

Ross's brain
  └── Playbook                 ← /ross.html?tab=playbook  (workflows + builder + templates — already covers all three per the IA lock)
  └── Activity                 ← /ross.html?tab=activity  (run history + reports)
  └── People                   ← /ross.html?tab=people    (staff)

[footer]
  └── Profile / Settings
```

That's it. Three sections, all matching the locked v2 IA. The "Workflows" and "Browse templates" sections I drafted earlier were duplicative — the existing Playbook tab already covers workflows, builder, and templates. PR 5 is therefore much smaller than originally drafted: just delete the Operations / Guests / "Today" sub-items from the current sidebar, leave the three Ross's brain destinations as-is.

The operator-facing daily-use additions (active workflows surfaced for me, today's tasks, browse templates with tier gating) are **content changes inside the existing destinations** for Phase 6 (the next spec) — not new sidebar entries:

- "Active workflows for me" + "Today's tasks" → enrich the concierge home cards with real-data driven by my activated workflows (replaces today's scripted/illustrative cards).
- "Browse templates with free/all-in tier gating" → tier check on the existing Templates UI inside the Playbook tab.

**v1 module access is admin-only** (Q3 locked answer). Regular users never see links to `/food-cost-v2.html`, `/group-overview-v2.html`, etc. from ROSS nav. The operator (sole current user) reaches them via `/admin-dashboard.html`, which already gates on admin claims. Once all v1 modules have task-input-type equivalents inside templates, the admin-dashboard links to them can be removed too.

### 3.3 Public homepage Hi-Fi

`/index.html` rebuilt as a Hi-Fi single-page on the existing token system (`hifi-tokens.css` / `hifi-base.css` / `hifi-fonts.css`). No Bootstrap. No FF6B6B/4ECDC4 gradient. No Inter font.

Sections (revised from current):
1. **Hero.** Tagline + single CTA ("Start free"). The "Watch Demo" secondary stays as a placeholder anchor; honest about not having a demo video yet.
2. **The product is the playbook.** Lead with workflows, not "smart guest WiFi / real-time analytics." Concrete examples: "Daily Opening Checklist. Weekly Compliance Sweep. Monthly Marketing Push." This sells what's actually being built.
3. **Hello-style synthetic preview.** A muted version of the post-signup hello — "Here's what Ross might tell a Cape Town café on a Tuesday morning" with clearly-labeled synthetic data. Mirrors the post-signup experience without leaking any tenant data.
4. **Two-tier pricing.** Free vs All-in. Keeps signup-page tier explanation honest.
5. **Founder story.** Existing Lakis Katsouris paragraph preserved — that's a real story and it lands.
6. **Footer.** Existing links + admin entrance.

Removed from current homepage: fabricated stats grid (10x, 83%, 4.8, 52%), fabricated testimonials (Maria Rodriguez / James Chen / Bella Vista / Mama's Kitchen / Ocean Basket Group), "Get Started Free with 30-day trial" if free tier is the actual default. Honesty over aspiration.

### 3.4 Signup Hi-Fi + tier collapse

`/signup.html` rebuilt as Hi-Fi. Two-step structure preserved (tier select → form) but:

- **Tier cards reduced to two**: Free, All-in. Free defaults to selected (lowest friction).
- **Form fields preserved** from current signup (business name, address, franchise toggle, business phone, business type, first/last name, email, password). These map to the existing `users/{uid}` write in `signup.js`.
- **Add `tier` write** at account creation: `users/{uid}/tier = 'free' | 'all-in'`. Update the existing `subscriptions/{uid}` write to match.
- **Initialize `onboarding-progress/{uid}`** with `{ completed: false, helloSeen: false }` at signup so the post-login router has clean state to read.
- **Route on success**: signup → `routePostLogin(user)` → typically lands on `/onboarding-ross-hello.html`.

`signup.js` keeps its current data-write logic; only the visual layer + tier model + final redirect change.

### 3.5 Onboarding journey wiring

Three changes:

1. **`/onboarding-ross-hello.html` auth gate.** Replace bare `<div id="app"></div>` body with the same gate pattern from `/ross.html` (gate placeholder → `onAuthStateChanged` → `'/user-login.html?message=unauthorized'` if no user → swap to `<div id="app"></div>` and dynamic-import `main-hello.js`). No subscription-tier check — onboarding is pre-tier-relevant; logged-in is sufficient.

2. **Hello CTA writes `helloSeen: true`** before redirecting to wizard. Persisted on `onboarding-progress/{uid}`.

3. **Wizard completion routes through `routePostLogin`** instead of hardcoding `/user-dashboard.html` — so the operator lands on `/ross.html` post-onboarding, not the deprecated dashboard.

### 3.6 RTDB shape additions

New field on existing node — no new collections:

```
onboarding-progress/{uid}
  ├── completed: boolean         (existing)
  ├── helloSeen: boolean         (NEW, default false)
  └── … existing wizard fields
```

New field on `users/{uid}` *or* `subscriptions/{uid}` (location TBD during PR 2 — `subscriptions/{uid}` already carries tier-shaped data per existing signup write at `signup.js:380-386`, so adding `tier` there avoids a parallel field):

```
{users|subscriptions}/{uid}/tier: 'free' | 'all-in'   (NEW, written at signup)
```

**Security rules check needed:** verify `database.rules.json` allows the user to write `helloSeen` to their own `onboarding-progress/{uid}` node and `tier` to their own `users/{uid}` node. Audit before code.

## 4. Locked decisions (resolved 2026-05-02)

Each was an open question during draft. Locked answers below.

### Q1 — Free tier scope: **(a) Free = full ROSS UI + 5 starter templates from the existing Templates library.**

All-in unlocks the full template library. Tier gating is a **filter on the existing Templates list** inside the Playbook tab (no new UI), checked against `users/{uid}/tier` or `subscriptions/{uid}/tier`. Free users get the complete UI experience, just with a curated library. The choice of which 5 starter templates ship Free, and the rest of the All-in library, is **decided in the next spec** (Phase 6), not here.

### Q2 — Day-zero ROSS state: **(c) Pre-populated demo workflow.**

A new account lands in ROSS with one starter template auto-activated as a workflow against their default location, so the operator has a concrete workflow with tasks to *do* — not just observe. The Runs server surface (`rossCreateRun`/`rossSubmitResponse`) already supports execution; the operator-facing run UX is Phase 6. Once Phase 7 (askRoss LLM) ships, day-zero ROSS additionally surfaces findings drawn from publicly-available data (weather, local events, public holidays, suburb demographics) so the agent has something intelligent to say even before the user has accumulated activity. This spec **does not** specify which template auto-activates — that's Phase 6's call.

### Q3 — v1 module access during transition: **operator-only via admin-dashboard.**

Sole current user is the operator (admin / superAdmin). v1 surfaces (food-cost-analytics, queue-management, guest-management, etc.) remain reachable through `admin-dashboard.html` — which is already admin-gated. Regular users (when they sign up) see ROSS only. **No "Power tools" dropdown in ROSS primary nav** — simplifies PR 5 substantially. Once each v1 module has a workflow-step equivalent shipped, its admin-dashboard link is removed too.

### Q4 — Hello content for public vs post-signup: **(b) Same component, two data feeds.**

`RossOnboardingHello.vue` is reused for both:
- **Public** (`/index.html` embedded section, or `/hello.html` if separated): mounted via `main-hello-public.js`, fed synthetic findings from a content module. No Firebase reads, no auth required, no tenant data.
- **Post-signup** (`/onboarding-ross-hello.html`): mounted via existing `main-hello.js` (now with auth gate per §3.5), fed real findings via `store.loadFindings()`.

The component already has an `illustrative` flag on cards — the public version sets that flag on every card and decorates them with a "Sample" badge. One component, two data sources, no drift.

### Q5 — `ROSS_IS_HOME` flag: **(a) Wire the router to read it.**

Router checks `isEnabled('ROSS_IS_HOME')` before returning `/ross.html`. If false, falls back to `/user-dashboard.html` for the legacy path. Default stays `true` (already shipped). Per-PR rollback safety: a single flag flip reverts the central-point shift if something goes wrong post-deploy. Flag deletion is a separate follow-up after the new path soaks for one cycle.

## 5. Sequencing & PR plan

Five PRs, each independently mergeable, each on its own worktree. Order matters because later PRs depend on earlier:

| # | Branch | Phase | What | Depends on |
|---|--------|-------|------|------------|
| 1 | `feat/post-login-router` | 5c (foundation) | Build `post-login-router.js`, write tests for the decision matrix, wire **only** `signup.js` to use it (other call sites continue to hardcode). Add `helloSeen` field write to `RossOnboardingHello.vue`. Add auth gate to `/onboarding-ross-hello.html`. | — |
| 2 | `feat/signup-v2-hifi` | 5b | Hi-Fi rewrite of `/signup.html` + tier model collapse to Free/All-in. Writes `users/{uid}/tier` at account creation. | PR 1 (router exists) |
| 3 | `feat/homepage-v2-hifi` | 5a | Hi-Fi rewrite of `/index.html` with workflow-centric copy, two-tier pricing, synthetic hello preview. | — (independent of router work) |
| 4 | `feat/post-login-router-rollout` | 5c (rollout) | Wire remaining call sites (`user-login.js` ×2, `onboarding-wizard.js`, `user-dashboard.js`, `dashboard.store.js`) to `routePostLogin`. This is the moment ROSS becomes home. | PRs 1, 2 |
| 5 | `feat/ross-sidebar-cleanup` | 5d | Redesign `RossHomeDesktop.vue` sidebar to workflow-centric shape from §3.2. Stub workflow nav items pointing to placeholders. **No Power tools dropdown** (Q3 lock — v1 module access is admin-dashboard only). | PR 4 (so the new sidebar reflects "ROSS is home") |

5e (deprecation signposting on `user-dashboard.html`) folds into PR 4 — small banner + nav cleanup.

PR 1 and PR 3 can run in parallel (different scopes). PR 2 depends on PR 1. PRs 4–5 sequential.

## 6. Success criteria

- A new visitor at `/` sees a Hi-Fi homepage that pitches workflows, not feature grids.
- Signup writes `tier` and `onboarding-progress` cleanly; account creation lands on the hello, not the dashboard.
- Hello CTA → wizard → ROSS, with no redirect through `/user-dashboard.html`.
- A returning user typing `/user-login.html` lands on `/ross.html` (assuming onboarding complete), not on the dashboard.
- Anonymous URL hits to `/onboarding-ross-hello.html` get bounced to login.
- ROSS sidebar shows zero links that re-launch v1 module pages from the primary nav. Power tools menu is the only escape hatch.
- `npm run build` passes. Manual smoke test of every redirect path. Preview channel deployed for operator review before merge.

## 7. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Existing accounts have no `helloSeen` field; on next login the post-login router could mistakenly route them to the hello. | Router treats absent `onboarding-progress` node as "wizard not started." If `completed: true` and `helloSeen` is missing, default to `helloSeen: true` (existing user, never showed it before). |
| Tier collapse breaks billing — current `subscriptions/{uid}` schema has more granular tier values. | Map existing tier values to `'free'` or `'all-in'` in code; do NOT migrate stored data in this spec. Migration of existing tier records is a separate spec. |
| Hi-Fi homepage rewrite loses SEO equity from the v1 page. | Preserve `<meta>` description and `<title>`. Keep all anchor IDs (`#features`, `#about`, `#testimonials`) so existing inbound links don't 404. |
| Post-login router hides bugs by silently choosing wrong destination. | Router exports a pure `resolvePostLoginDestination(user)` separate from `routePostLogin(user)`. Pure function gets unit tests covering every state-combination matrix. |
| ROSS sidebar redesign breaks deep links operators have bookmarked (`/group-overview-v2.html`, etc.). | Pages stay reachable by direct URL. Only the *promoted nav* changes. Bookmark behavior unchanged. |
| User typed wrong tier at signup; can't change it. | Out of scope. "Change tier" UX is a separate ticket; for now operator can change manually via admin tools. |
| Compliance / legal exposure of synthetic-but-realistic public hello content. | Content module ships with explicit `source: 'illustrative'` flag on every datum (pattern already used in `RossOnboardingHello.vue`). UI surfaces a "Sample" badge on each card. No tenant data. No "based on real customers" claims. |

## 8. KB / docs touched

- `KNOWLEDGE BASE/PROJECT_BACKLOG.md` — Phase 5 task statuses updated; new tasks added for cleanup PRs; `Phase 6` (template creation) added as next.
- `public/data/project-status.json` — same updates mirrored.
- `KNOWLEDGE BASE/development/SELF_OPTIMIZATION.md` — patterns observed during cleanup (post-login router as anti-sprawl pattern, etc.).
- `KNOWLEDGE BASE/development/LESSONS.md` — gotchas hit.
- `CLAUDE.md` convention update: "post-login destination is `/ross.html` via `routePostLogin`, not hardcoded redirects."

## 9. What this spec does NOT decide

- The actual visual design of homepage, signup, and ROSS sidebar (Hi-Fi tokens are the constraint; layout is implementation detail).
- The starter template library content.
- The day-zero ROSS state UX (covered by Q2).
- The free-tier feature gating beyond template-library scope (covered by Q1).
- Subscription billing flow.
- Migration of existing user records to the two-tier model.

These are explicit follow-ups, each becoming its own spec or PR.

---

## Appendix A — File inventory by PR

### PR 1 — post-login-router + hello auth gate

- **Add:** `public/js/auth/post-login-router.js`
- **Add:** `public/js/auth/post-login-router.test.js` (decision matrix unit tests)
- **Modify:** `public/onboarding-ross-hello.html` (gate pattern)
- **Modify:** `public/js/modules/ross/v2/main-hello.js` (mounted only after gate)
- **Modify:** `public/js/modules/ross/v2/components/RossOnboardingHello.vue` (`onContinue` writes `helloSeen: true`)
- **Modify:** `public/js/signup.js` (replace hardcoded redirect with `routePostLogin(user)`; init `onboarding-progress/{uid}` with `{completed: false, helloSeen: false}`)
- **Modify:** `public/js/auth/session-expiry-handler.js` (add `onboarding-ross-hello.html` to allowed pages)
- **Verify:** `database.rules.json` allows `helloSeen` write under `onboarding-progress/{uid}`

### PR 2 — signup v2 Hi-Fi + tier collapse

- **Modify:** `public/signup.html` (full Hi-Fi rewrite)
- **Modify:** `public/js/signup.js` (write `users/{uid}/tier`; map to existing `subscriptions/{uid}` shape; reduce tier-card data to two)
- **Add:** `public/css/signup-v2.css` if needed beyond `hifi-base.css`
- **Verify:** `database.rules.json` allows `users/{uid}/tier` self-write

### PR 3 — homepage v2 Hi-Fi

- **Modify:** `public/index.html` (full Hi-Fi rewrite)
- **Add:** any homepage-specific Hi-Fi components (likely a hero variant) under `public/js/design-system/hifi/components/`
- **Add:** synthetic public-hello content module (e.g. `public/js/marketing/public-hello-content.js`)
- **Add:** `public/js/marketing/main-public-hello.js` if the public hello mounts on the homepage
- **Modify:** `public/css/landing-page.css` (deprecate or scope to legacy)

### PR 4 — post-login-router rollout

- **Modify:** `public/js/user-login.js` (2 call sites → `routePostLogin`)
- **Modify:** `public/js/onboarding-wizard.js` (completion → `routePostLogin`)
- **Modify:** `public/js/user-dashboard.js` (onboarding-incomplete → `routePostLogin`)
- **Modify:** `public/js/modules/user-dashboard/stores/dashboard.store.js` (same)
- **Modify:** `public/user-dashboard.html` (deprecation banner: "Sparks v2 is at /ross.html — this view is being retired")
- **Modify:** CLAUDE.md (post-login destination convention)

### PR 5 — ROSS sidebar cleanup

- **Modify:** `public/js/modules/ross/v2/components/RossHomeDesktop.vue` (`navSections` shape collapses to just Today + Ross's brain — drop Guests and Operations sections)
- **Modify:** `public/js/modules/ross/v2/components/RossHomeMobile.vue` (mirror)
- **Note:** No new tab routes added — the three existing Ross's brain destinations (`?tab=playbook`, `?tab=activity`, `?tab=people`) already cover all the content. Workflow runner UX, template browsing with tier gating, and surfacing active workflows on the home cards are all **Phase 6** work inside the existing destinations.
- **Note:** v1 module deep-links (`/food-cost-v2.html`, `/group-overview-v2.html`, `/queue-v2.html`, `/guests-v2.html`, etc.) are **removed** from the ROSS sidebar — operator reaches them via `admin-dashboard.html` only.
