# ROSS Tier-Gated Template List + Upgrade Page (Phase 6 PR 1C)

**Date:** 2026-05-12
**Sprint:** Hi-Fi v2 with ROSS as central post-login surface — Phase 6
**Predecessor:** PR #51 (tier-gating mechanism), PR #53 (curated 5 Free / 8 All-in split)
**Successor:** Phase 6 D (self-service checkout — Paystack/Stripe), Day-zero auto-activation

---

## Context

PR #51 shipped the tier-gating mechanism. PR #53 curated the 5 Free / 8 All-in split. Result today: a Free user opening the Templates list inside the Playbook tab sees exactly 5 cards. The other 8 are invisible.

That's correct enforcement but a missed upsell moment. The operator never learns the product has 13 starter templates, doesn't know what All-in includes, has no path to upgrade.

PR 1C converts the silent gate into an upgrade affordance: the 8 All-in templates render as visible-but-locked cards with an "Upgrade to All-in" CTA, and a substantive `/upgrade.html` comparison page becomes the destination. The page is structured to swap in a self-service checkout button (Phase 6 D) without a rewrite.

## Strategic decisions (locked)

| Q | A |
|---|---|
| What does "Upgrade" do today? | Routes to `/upgrade.html` — a real page (not a stub) with Free vs All-in comparison + WhatsApp/email contact CTA. D-ready: page stays, only the CTA swaps to a payment button when checkout ships. |
| How substantive is `/upgrade.html`? | **A — substantive comparison page.** Two-column tier table reading `subscriptionTiers/` via the existing `services/subscription-tiers.js` (extracted in PR #44). Single Contact-us CTA. No write paths, no analytics. |
| How do locked template cards look? | **A — same card, dimmed (opacity 0.7), 🔒 All-in badge top-right, primary button changes from "Activate" to "Upgrade to All-in".** Full template details remain visible — name, category, cadence, subtask count. Showing the template structure IS the upsell. |
| Does this change the v1 admin Templates list? | **No.** Server change is opt-in via `includeLocked: true` request param. v1 callers omit the param → see current "filter-out" behavior unchanged. |

## Architecture

Four units, four files of net new code:

```
┌─────────────────────────────┐         ┌───────────────────────┐
│ RossPlaybook.vue            │ click   │  /upgrade.html        │
│  - renders locked cards     ├────────►│   (Hi-Fi Vue mount)   │
│  - dimmed + 🔒 + Upgrade CTA│         │  - Free vs All-in     │
│  - short-circuits activate  │         │  - WhatsApp + email   │
└──────┬──────────────────────┘         └───────────────────────┘
       │ getPlaybookTemplates({includeLocked: true})
       ▼
┌─────────────────────────────┐
│ playbook-service.js         │
└──────┬──────────────────────┘
       │ POST rossGetTemplates
       ▼
┌─────────────────────────────┐
│ functions/ross.js           │
│  filterTemplatesByTier(     │
│    ..., includeLocked       │  ← new param
│  )                          │
│  - Free + includeLocked:    │
│    returns 13 with          │
│    locked:true on 8 All-in  │
│  - Free + omitted/false:    │
│    returns 5 (current)      │
│  - All-in/SuperAdmin:       │
│    returns 13 no locked flag│
└─────────────────────────────┘
```

## Data flow

**Free user opens the Playbook tab:**
```
RossPlaybook mount
  → playbook-service.getPlaybookTemplates({ includeLocked: true })
  → POST rossGetTemplates { data: { includeLocked: true } }
  → server: verifyUserOrAdmin → readUserTier → filterTemplatesByTier(..., true)
  → returns 13 templates, 8 carrying { ...template, locked: true }
  → playbook-store keeps response shape as-is
  → RossPlaybook.vue v-for renders 13 cards
  → cards with template.locked get hf-card--locked class + badge + Upgrade button
  → click on locked card → window.location.href = '/upgrade.html?from=template&id=<templateId>'
```

**All-in or superAdmin user:**
Same call shape. Server returns 13 templates with NO `locked` flag. Cards render normally; Activate works.

**Defense in depth:**
Even if a Free user crafts an activate request for a locked template (dev console, replay attack), `rossActivateWorkflow` rejects per PR #51 gate. Audit log records the attempt at `ross/auditLog/templateActivationDenials/{pushId}`. Client short-circuit is UX, not security.

## Files touched

| File | Action | Notes |
|---|---|---|
| `functions/ross.js` | modify | `filterTemplatesByTier` gains `includeLocked` param; `rossGetTemplates` reads `data.includeLocked` and threads it through (~10 net new lines) |
| `public/js/modules/ross/v2/playbook-service.js` | modify | Add `includeLocked: true` to the template fetch call |
| `public/js/modules/ross/v2/components/RossPlaybook.vue` | modify | Locked-card branch in template + click handler short-circuit |
| `public/css/hifi-base.css` (or `RossPlaybook.vue` scoped styles) | modify | `.hf-card--locked` rule (opacity, badge positioning) — scoped to the component is fine; not a design-system primitive yet |
| `public/upgrade.html` | create | Hi-Fi mount shell mirroring `index.html` / signup pattern |
| `public/js/modules/marketing/upgrade/main.js` | create | Vue 3 app entry — mirrors `marketing/landing/main.js` |
| `public/js/modules/marketing/upgrade/components/UpgradePage.vue` | create | Comparison page component |
| `public/js/services/contact.js` | create | One-source contact constants (WhatsApp number, email) for upgrade page + future contact CTAs |
| `vite.config.js` | modify | Add `upgrade` entry point alongside existing entries |
| `public/kb/features/ROSS.md` | modify | Append a "Locked-card upsell UX" note inside the existing Tier gating section |

Net new files: 4. Modified: 6 (the CSS line can fold into the .vue if scoped).

## Server-side detail — `filterTemplatesByTier`

Current shape (pseudocode):
```js
function filterTemplatesByTier(templates, userTier, isSuperAdmin) {
  if (isSuperAdmin || userTier === 'all-in') return templates;
  return templates.filter(t => t.tier === 'free');
}
```

New shape:
```js
function filterTemplatesByTier(templates, userTier, isSuperAdmin, includeLocked = false) {
  if (isSuperAdmin || userTier === 'all-in') return templates;
  // Free or missing tier
  if (!includeLocked) {
    return templates.filter(t => t.tier === 'free');
  }
  return templates.map(t =>
    t.tier === 'free' ? t : { ...t, locked: true }
  );
}
```

Tested via 4 unit cases in `functions/__tests__/ross-tier-filter.test.js` if such a test file exists; otherwise create it.

Note: this also affects `rossGetWorkflows` only if it returns templates — it doesn't. The only call site is `rossGetTemplates`. No other handler needs updating.

## Client-side detail — `RossPlaybook.vue` lock state

Card template gains a conditional class and the activate button gets a v-if branch:

```vue
<div
  class="hf-card template-card"
  :class="{ 'template-card--locked': template.locked }"
>
  <!-- existing card content unchanged -->

  <span v-if="template.locked" class="template-card__lock-badge">
    🔒 All-in
  </span>

  <HfButton
    v-if="!template.locked"
    @click="onActivate(template)"
  >Activate</HfButton>

  <HfButton
    v-else
    variant="ghost"
    @click="onUpgradeClick(template)"
  >Upgrade to All-in</HfButton>
</div>
```

Click handler:
```js
function onUpgradeClick(template) {
  window.location.href = `/upgrade.html?from=template&id=${encodeURIComponent(template.templateId)}`;
}
```

Scoped style:
```css
.template-card--locked {
  opacity: 0.7;
}
.template-card__lock-badge {
  position: absolute;
  top: var(--hf-space-3);
  right: var(--hf-space-3);
  /* small pill — reuse HfBadge if a 'muted' variant exists, otherwise inline */
}
```

## `/upgrade.html` page detail

Hi-Fi mount shell. Single Vue component `UpgradePage.vue` rendering:

1. **Hero** — "Unlock the full ROSS playbook" / sub: "13 starter templates, all categories, on-tap"
2. **Comparison table** — two columns, reading `subscriptionTiers/` from RTDB via `services/subscription-tiers.js`:
   - Free: 5 templates, daily operations, one compliance template, one finance template
   - All-in: 13 templates, all categories (compliance, growth, hr, maintenance, finance, operations)
3. **All-in template list** — the 8 unlocked templates by name + cadence (read from tier-filtered `rossGetTemplates` call OR hardcoded list — hardcoded is simpler and the list is stable until PR 1D adds curation)
4. **Contact CTA** — single primary button "Contact us to upgrade" → opens `https://wa.me/<number>?text=...` with operator's account info + the `?from` and `?id` query params if present (so sales rep knows which template triggered)

If `?from=template&id=<id>` is present, the CTA URL pre-fills the WhatsApp message: `"Hi, I'd like to upgrade to All-in. Triggered from template: <name>"`.

D-ready: when Phase 6 D ships, the Contact CTA gets replaced by a `<HfButton @click="startCheckout">` button; the rest of the page is unchanged.

## Error handling / edge cases

- **Server with malformed `includeLocked`**: any falsy value (undefined, null, false, "false" string) falls through to the current filter-out behavior. Only `=== true` activates the new branch.
- **Locked card activate bypass attempt**: PR #51 gate rejects with 403; audit log captures it. Client never reaches that path under normal use.
- **Free user with zero `users/{uid}/tier` field**: `readUserTier` returns `'free'` (PR #51 fail-closed behavior). Sees locked cards correctly.
- **`subscriptionTiers/` RTDB node empty or unreadable on `/upgrade.html`**: fall back to a hardcoded comparison (Free/All-in only, no dynamic feature list) — same fallback pattern as PR #44 landing page.
- **WhatsApp number unavailable**: include an `mailto:` fallback link below the WhatsApp button.
- **`from` / `id` query params malformed**: just don't include them in the WhatsApp pre-fill; the generic message ships.

## Out of scope

- Self-service checkout (Phase 6 D)
- Upgrade-request RTDB write path
- Analytics on upgrade page visits
- Free-tier indicator badge on the operator's own profile/avatar
- A `from=manual` direct-navigation pricing page (the same page handles it — query params are optional)
- Removing the legacy filter-out behavior — kept indefinitely for v1 admin callers

## Risks

- **`includeLocked` proliferation** — once one caller opts in, others may want the same. Mitigation: only v2 Playbook tab uses it; v1 admin templates list stays on filter-out. Future callers should opt in explicitly. Document on `rossGetTemplates` signature.
- **Client/server out of sync during deploy**: if client deploys before server, client requests `includeLocked: true` but server ignores → Free user sees 5 cards (current behavior). Graceful degradation. If server deploys first → no client change yet → still 5 cards. Either order works.
- **Locked card visual confusion**: operators might think "locked" means "broken". Lock badge copy is "🔒 All-in" not "Locked" — frames it as a tier marker, not a defect.

## Verification

1. `npm run build` clean
2. Unit tests for `filterTemplatesByTier` cover all 4 cases (Free+include / Free+omit / All-in / SuperAdmin)
3. Manual preview: Free account → 13 cards (8 dimmed); click locked → `/upgrade.html?from=template&id=X` loads; click contact CTA → WhatsApp opens with pre-fill containing template name
4. Manual preview: All-in account → 13 unlocked cards; no upgrade button anywhere; Activate works as today
5. Direct nav to `/upgrade.html` (no query params) → page loads, generic CTA copy
6. Defense check: dev-console fire `rossActivateWorkflow` with a locked template ID as a Free user → 403 + audit log entry
