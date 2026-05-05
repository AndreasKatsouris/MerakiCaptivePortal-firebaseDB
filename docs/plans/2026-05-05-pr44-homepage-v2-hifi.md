# Implementation Plan: PR ~#44 — Homepage v2 Hi-Fi (Promote landing-v2 to /index.html)

**Branch:** `feat/homepage-v2-hifi`
**Worktree:** `C:\dev\MerakiCaptivePortal-firebaseDB\.worktrees\homepage-v2-hifi`
**Phase:** 5a (independent of PR 1/2/4 — can ship anytime)
**Spec:** `docs/superpowers/specs/2026-05-02-ross-central-funnel-cleanup-design.md` §3.3, Appendix A PR 3
**Date:** 2026-05-05

## 1. Requirements Restatement

Promote the existing Hi-Fi `landing-v2` chrome (already at `public/index-v2.html` + `public/js/landing-v2/*`) to be `/index.html` itself, replacing v1 entirely. Simultaneously replace the v1-derived marketing copy with a workflow-centric narrative per spec §3.3:

1. Hero with single primary CTA "Start free", honest "Watch Demo" placeholder
2. "The product is the playbook" workflow-led section (anchor `#features`)
3. Synthetic public hello preview reusing `RossOnboardingHello.vue` (Q4 lock — same component, two data feeds)
4. Two-tier pricing dynamically loaded from `subscriptionTiers` RTDB; cards link to `/signup.html`
5. Founder story (anchor `#about`, real Lakis Katsouris paragraph kept)
6. Footer (existing links + admin entrance)

**Delete:** fabricated stats grid, fake testimonials (Maria Rodriguez / James Chen), fake success stories (Ocean Basket / Garden Bistro / Mama's Kitchen), 30-day trial copy.

**Preserve:** `<title>`, `<meta name="description">`, anchor IDs `#features` / `#about` / `#testimonials` (alias).

## 2. Pre-flight findings (applied PR 2 lessons)

- `#testimonials` inbound link audit: only internal references in v1 `index.html` and `landing-v2/LandingApp.vue`. External SEO links can't be audited; preserve as alias on founder story per spec §7.
- No `showToast` / SweetAlert use in `landing-v2/` — PR 2's CDN-deps trap doesn't bite us. Pricing-load failure path uses inline `<HfChip tone="warn">` or muted text fallback, NOT SweetAlert.
- `RossOnboardingHello.vue` findings shape verified: `{ intro: { eyebrow, headline, subline, lead }, findings: [{ id?, headline, detail, accent?, source? }] }`. Per-card `source: 'illustrative'` already drives the "preview" tag + opacity treatment. No new component prop for illustrative needed.
- `markHelloSeen()` already no-ops without auth (line 25 guard) — public mount is safe.
- `loadTiers()` cleanly extractable from `signup-service.js` lines 42–53.

## 3. Open Questions (defaults chosen — operator can override)

1. **Synthetic hello content tone.** Single-venue Cape Town café narrative ("Tannie's Kitchen") with three findings tuned to common SA-restaurant pain: Tuesday lunch margin, missed VIP recognition, weather-driven walk-in pattern. All cards `source: 'illustrative'`. **Default:** ship as described; operator re-tunes copy in review.
2. **`#testimonials` alias strategy.** (a) Put `id="testimonials"` on the founder-story section so old "Case Studies" anchor still scrolls; (b) put it on pricing; (c) drop entirely. **Default:** (a). Update nav: drop "Case Studies" link, add "Pricing" link.
3. **`loadTiers()` extraction vs duplication.** **Default:** extract to `public/js/services/subscription-tiers.js` (5-line shared util). Decouples marketing from signup. signup-service version stays in place; cleanup PR can switch later.
4. **Pricing fallback when `subscriptionTiers` empty/errors.** **Default:** static two-card fallback (Free / All-in) with placeholder copy + "Get started" CTA. Console-warn only.
5. **Module location: `landing-v2/` rename to `marketing/landing/`?** Spec Appendix A PR 3 references `public/js/marketing/main-public-hello.js`. **Default:** rename per spec — gives a home for future marketing surfaces.

## 4. Architecture Decisions

- **Promote (option P):** `public/index.html` becomes the Hi-Fi mount shell. `public/index-v2.html` deleted. Vite entry `index-v2` removed; new `index` entry added.
- **No Pinia store** for marketing — single screen. But `app.use(createPinia())` installed defensively in `main.js` so `RossOnboardingHello.vue`'s `useRossStore()` import doesn't crash even though the prop-driven path bypasses it.
- **Reuse `RossOnboardingHello.vue` via prop refactor (Q4 lock):**
  - Add prop `findings` (Object, default `null`) — takes precedence over `store.findings`.
  - Add prop `continueHref` (String, default `/onboarding-wizard.html`).
  - Add prop `tourHref` (String, default `/onboarding-wizard.html?tour=1`).
  - `data = computed(() => props.findings || store.findings)`.
  - Skip `store.loadFindings()` when `props.findings` provided.
  - **Backwards compatible:** existing `/onboarding-ross-hello.html` mount unchanged.
- **CSS:** `landing-page-v2.css` keeps existing `.lp-*` classes; add `.lp-pricing` + `.lp-hello-embed` blocks. Old `landing-page.css` deleted (after consumer audit).
- **Module structure:**
  ```
  public/js/marketing/
    landing/
      main.js
      LandingApp.vue
    public-hello-content.js
  public/js/services/
    subscription-tiers.js
  ```

## 5. Phases & File List

### Phase A — RossOnboardingHello prop refactor (L)
| Action | File |
|---|---|
| Modify | `public/js/modules/ross/v2/components/RossOnboardingHello.vue` — add `findings/continueHref/tourHref` props, computed-data fallback, skip-load when findings provided |

### Phase B — Synthetic hello content (L)
| Action | File |
|---|---|
| Add | `public/js/marketing/public-hello-content.js` — exports `PUBLIC_HELLO_FINDINGS` |

### Phase C — Marketing module move (L)
| Action | File |
|---|---|
| Move | `public/js/landing-v2/main.js` → `public/js/marketing/landing/main.js` (git mv) |
| Move | `public/js/landing-v2/LandingApp.vue` → `public/js/marketing/landing/LandingApp.vue` (git mv) |

### Phase D — Tier loader extraction (L)
| Action | File |
|---|---|
| Add | `public/js/services/subscription-tiers.js` — `loadTiers()` shared util |

### Phase E — LandingApp.vue content rewrite (M)
| Action | File |
|---|---|
| Modify | `public/js/marketing/landing/LandingApp.vue` — full content rewrite per section breakdown below |
| Modify | `public/js/marketing/landing/main.js` — install Pinia |

**Section breakdown:**
1. Nav — Logo + 3 links (Workflows / Story / Pricing) + Login + Get Started CTA. Drop "Case Studies".
2. Hero — Workflow-centric tagline. Single primary CTA "Start free" → `/signup.html`. Secondary "Watch demo" placeholder.
3. The product is the playbook (`#features`) — Three workflow cards: Daily Opening Checklist, Weekly Compliance Sweep, Monthly Marketing Push.
4. Synthetic hello preview — `<RossOnboardingHello :findings="PUBLIC_HELLO_FINDINGS" continue-href="/signup.html" tour-href="/signup.html" />`. Section header labels as illustrative.
5. Pricing (`#pricing`) — `onMounted` loads tiers via `loadTiers()`; renders cards with "Get started" CTA → `/signup.html`. Static fallback if load fails.
6. Founder story (`#about` + alias `#testimonials`) — Lakis Katsouris quote only. Delete fake testimonials.
7. CTA strip — Honest free-tier copy ("Free to start. Upgrade when you outgrow it.").
8. Footer — Update nav links, drop fake content references.

**Delete from existing LandingApp.vue:** `stats` array, success stories (Ocean Basket / Garden Bistro / Mama's Kitchen), Maria Rodriguez + James Chen quotes, "30-day free trial" copy.

### Phase F — HTML promotion + Vite wiring + cleanup (M)
| Action | File |
|---|---|
| Modify | `public/index.html` — replace with Hi-Fi mount shell, script src → `/js/marketing/landing/main.js`. Preserve `<title>` / `<meta description>`. |
| Delete | `public/index-v2.html` |
| Modify | `vite.config.js` — remove `index-v2` entry, add `index` entry |
| Delete | `public/css/landing-page.css` (after consumer audit — see §8) |

### Phase G — Build + smoke + preview (L)
- `npm run build` passes.
- Manual smoke: `/`, `/onboarding-ross-hello.html` (regression), `/signup.html` (sanity).
- Responsive at 900px + 560px.
- Preview channel deploy.

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| RossOnboardingHello prop refactor breaks `/onboarding-ross-hello.html`. | Defaults preserve current behavior byte-for-byte. Smoke-test before commit. |
| Pinia not installed → `useRossStore()` crash on import. | Install Pinia in `main.js` defensively. Already a project dep. |
| `subscriptionTiers` returns >2 tiers. | Render all sorted by price; section header notes admin curates. |
| `subscriptionTiers` empty/errors. | Static two-card fallback. Console-warn. |
| `landing-page.css` referenced elsewhere. | Pre-flight grep before deletion (§8). |
| Old `#testimonials` 404. | Alias on founder story — zero UI cost. |
| Vite `index` entry collision. | Verified — no existing entry uses `'index'`. |
| `RossOnboardingHello` is full-screen dark — embedding breaks page flow. | Wrap in `.lp-hello-embed` section that respects min-height as intended (full-bleed dark stage between lighter sections). Defer compact-mode prop until visual review demands it. |
| Public hello sounds dishonest. | Per-card `source: 'illustrative'` → "preview" tag visible. Section header labels "Sample, not real data." Operator reviews copy. |

## 7. Test Plan

- **Manual smoke (required):**
  - `/` golden path — scroll all sections, click each CTA, click each anchor, responsive 900/560.
  - `/onboarding-ross-hello.html` — regression check, must render identically.
  - `/signup.html` — sanity, no PR 2 regressions.
- **Build:** `npm run build` passes with new `index` entry and `index-v2` removal.
- **Error path:** force-fail `subscriptionTiers` load; fallback renders.
- **No unit tests** — thin Vue layer over scripted content. `loadTiers()` carries identical contract to PR 2 twin.

## 8. Verification Steps (must run before code)

1. **Audit `landing-page.css` consumers:** `Grep 'landing-page\.css'` over `public/`. If non-`index.html` referrers exist → don't delete file, only remove link from new index.
2. **Audit external `index.html#testimonials` refs:** `Grep 'index\.html#testimonials'` repo-wide.
3. **Verify `firebase.json` rewrites:** `Read firebase.json` — confirm no rewrite redirects `/` or `/index.html`.
4. **Confirm Pinia in `package.json`:** already there per CLAUDE.md.
5. **Confirm `RossOnboardingHello.vue` import path resolves:** `../../modules/ross/v2/components/RossOnboardingHello.vue` from marketing module.

## 9. Commit Strategy

1. `refactor(ross-hello): add findings/continueHref/tourHref props for public reuse` — Phase A.
2. `feat(marketing): add public hello content + tier loader service` — Phase B + D.
3. `refactor(marketing): move landing-v2 to marketing/landing` — Phase C (pure git mv).
4. `feat(marketing): rewrite landing copy to workflow-centric narrative + pricing + hello preview` — Phase E.
5. `feat(marketing): promote landing v2 to /index.html, retire index-v2 + landing-page.css` — Phase F (load-bearing flip).

## 10. Out of Scope

- PR 4 router rollout, PR 5 sidebar redesign, Phase 6 work.
- `signup.js` / `signup-service.js` modifications (signup territory).
- Public hello taking real data.
- New Hi-Fi components (reuse existing kit).
- Workflow runner / template browse UI.
- Migration of v1 surfaces beyond the homepage.

## 11. Success Criteria

- [ ] `/` loads Hi-Fi page (no Bootstrap, no Inter font, no FF6B6B gradient, no fabricated stats).
- [ ] Hero has single primary CTA "Start free" → `/signup.html`.
- [ ] Workflow-led section visible at `#features` with three workflow cards.
- [ ] Synthetic hello embeds the actual `RossOnboardingHello` with three "preview"-tagged findings; CTA → `/signup.html`.
- [ ] Pricing loads from RTDB, renders cards, each links to `/signup.html`.
- [ ] Founder story at `#about` shows only Lakis Katsouris.
- [ ] No success stories section.
- [ ] `/onboarding-ross-hello.html` renders identically (no regression).
- [ ] `/index-v2.html` returns 404.
- [ ] `npm run build` passes.
- [ ] Preview channel deployed for operator review.
