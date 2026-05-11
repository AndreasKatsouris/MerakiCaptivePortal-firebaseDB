# Implementation Plan: Phase 5 PR 5 — ROSS Sidebar Cleanup

**Date:** 2026-05-11
**Branch:** `feat/ross-sidebar-cleanup` (worktree `.worktrees/ross-sidebar-cleanup`)
**Spec:** `docs/superpowers/specs/2026-05-02-ross-central-funnel-cleanup-design.md` (§3.2, §6 row 5, Appendix A PR 5)
**Estimated complexity:** Low

## Requirements

- Collapse desktop `navSections` from 4 sections (Today / Guests / Operations / Ross's brain) to 2 sections (Today / Ross's brain) per spec §3.2.
- Remove all v1 module deep-links from the ROSS primary nav (Q3 lock — operator-only access via `/admin-dashboard.html`).
- No new sidebar entries; no new tab routes; no Power tools dropdown.
- Preserve the existing footer Profile block (`ross-home__profile`).
- Keep the surface visually consistent across desktop and mobile breakpoints at the same release.

## Open-question recommendation: FOLD MOBILE IN

Fold `RossHomeMobile.vue` `bottomNav` into this PR. The 2026-05-11 LESSON is explicit: when one PR touches an in-scope file with visible drift in a sibling, fold rather than sequence. The drift here is unambiguous — desktop will lose Overview/Guests/Queue while mobile bottom nav still shows them as labels at the same release, producing inconsistent operator-facing IA. The mobile items have no `href` (decorative `<button>` elements with no click handlers), so this is a label/icon swap with zero routing risk. Spec Appendix A for PR 5 already lists `RossHomeMobile.vue (mirror)` as expected scope.

## File-by-file changes

### Edit: `public/js/modules/ross/v2/components/RossHomeDesktop.vue` (lines 63–85)

**Before:** 4 sections, 13 nav items, 9 of which are v1/v2 module deep-links.
**After:** 2 sections, 4 nav items, zero module deep-links.

```js
const navSections = [
  { eyebrow: 'Today', items: [
    { label: 'Ross', icon: 'bolt', active: true },
  ]},
  { eyebrow: "Ross's brain", items: [
    { label: 'Playbook', icon: 'check', href: '/ross.html?tab=playbook' },
    { label: 'Activity', icon: 'line',  href: '/ross.html?tab=activity' },
    { label: 'People',   icon: 'users', href: '/ross.html?tab=people' },
  ]},
]
```

No other changes to this file. The footer `ross-home__profile` block (lines 118–125) already serves as the Profile/Settings footer — `HfAvatar` + name + role + gear icon, separated by `border-top` and pinned with `margin-top: auto`. Spec §3.2 lists `[footer] Profile / Settings` and the existing markup matches. Wiring the gear icon to a Settings route is Phase 6, not PR 5.

**Scope correction (post-review, 2026-05-11):** Operator caught on preview that the footer shipped hardcoded prototype data (`Maya Alvarez` / `MA` / `Group Ops`). My original assessment ("footer already serves the role") conflated structure with content. Spec §3.2 calls out `[footer] Profile / Settings` as part of PR 5 scope, so the data wiring is in-scope and was a real gap. Fixed in same PR: footer now reads `auth.currentUser` reactively via `onAuthStateChanged`, shows `displayName` (or email local-part fallback), email under the name, and live initials. Gear icon **remains non-interactive** — `/profile-settings.html` doesn't exist yet (only `/receipt-settings.html` which is per-restaurant config, different domain). Logging "build `/profile-settings.html` for ROSS user account" to Phase 6 backlog. Same fix applied to `RossHomeMobile.vue` topbar avatar (was also hardcoded `initials="MA"`).

### Edit: `public/js/modules/ross/v2/components/RossHomeMobile.vue` (lines 16–22)

**Before:** 5 items — Ross / Overview / Guests / Queue / You.
**After:** 4 items mirroring the destinations the operator can actually reach from ROSS today.

```js
const bottomNav = [
  { icon: 'bolt',  active: true, label: 'Ross' },
  { icon: 'check', label: 'Playbook' },
  { icon: 'line',  label: 'Activity' },
  { icon: 'users', label: 'People' },
]
```

Items remain decorative (no `href`, no click handler) — same as today. Wiring is Phase 6.

### No other files touched

No CSS changes. No constants extraction. No store changes. No `ross.html` changes. No `RossHome.vue` switcher changes.

## Verification

1. `npm run build` — must pass.
2. Browser smoke on `/ross.html` desktop (>900px): sidebar shows exactly 2 eyebrows ("Today", "Ross's brain"), 4 nav items, profile footer intact, Playbook/Activity/People links navigate correctly.
3. Resize ≤900px → mobile component mounts. Bottom nav shows 4 icons. No console errors.
4. Visual check that no orphan styling appears where deleted sections used to be.
5. Deploy to Firebase Hosting preview channel; share URL in PR description.

## Out of scope

- Data wiring or Firebase reads.
- Click handlers on mobile `bottomNav` (still decorative).
- The v2 module surfaces themselves — reachable via direct URL and `/admin-dashboard.html`.
- `admin-dashboard.html` nav — unchanged.
- Right rail, story cards, Ask Ross, suggestions — untouched.
- Phase 6 enrichments (active workflows on home cards, tier-gated templates, Settings route wiring).
- Feature flags.
- `CLAUDE.md`, RTDB rules, security rules.

## Risk callouts

- **CSS dependency on section count:** None. The only count-sensitive rule (`.ross-home__nav-eyebrow:not(:first-of-type)`) works for any N≥1.
- **Tests / snapshots:** None exist for `navSections`/`bottomNav` (grep returns only the two component files + the spec).
- **External references to deleted nav items:** None — labels were rendered text, not routed identifiers. Destination URLs remain reachable by direct URL/bookmark per spec §7.
- **User confusion ("where did Overview go?"):** Sole user is the operator who locked Q3 — accepted trade-off.
- **Mobile bottom nav becomes sparser:** 4 icons instead of 5 — `justify-content: space-around` handles it natively.
