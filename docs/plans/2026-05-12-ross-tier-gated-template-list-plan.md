# ROSS Tier-Gated Template List + Upgrade Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the PR #51 silent tier-gate into a visible upsell — render the 8 All-in templates as dimmed/locked cards for Free users (instead of hiding them) and route the "Upgrade" CTA to a substantive `/upgrade.html` comparison page that's structured to swap in a self-service checkout button later (Phase 6 D).

**Architecture:** Server `filterTemplatesByTier` gains an opt-in `includeLocked` param that attaches `locked: true` to All-in templates for Free users instead of dropping them. v2 Playbook tab opts in; v1 admin callers don't (no regression). New `/upgrade.html` Hi-Fi Vue 3 page reads `subscriptionTiers/` via existing `services/subscription-tiers.js`, ships a WhatsApp + email CTA. PR #51's activate gate remains the server-side backstop — client lock-state is UX.

**Tech Stack:** Firebase Cloud Functions (Node 22), Vue 3 + Pinia + Hi-Fi component plugin, Vite 6, RTDB, vitest for server-side unit tests.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `functions/ross-tier.js` | modify | `filterTemplatesByTier` gains `includeLocked` param |
| `tests/unit/ross-tier.test.js` | modify | Add 4 test cases covering the new param |
| `functions/ross.js` | modify | `rossGetTemplates` reads `data.includeLocked` and threads it through |
| `public/js/modules/ross/v2/playbook-service.js` | modify | `getPlaybookTemplates` opts in to `includeLocked` |
| `public/js/modules/ross/v2/components/RossPlaybook.vue` | modify | Locked-card branch (class + badge + button) + click handler |
| `public/js/services/contact.js` | create | One-source contact constants (WhatsApp + email) |
| `public/upgrade.html` | create | Hi-Fi mount shell |
| `public/js/marketing/upgrade/main.js` | create | Vue 3 entry mirroring landing/main.js |
| `public/js/marketing/upgrade/UpgradeApp.vue` | create | Comparison page component |
| `vite.config.js` | modify | Add `upgrade` entry point |
| `public/kb/features/ROSS.md` | modify | Append locked-card UX note inside Tier gating section |

Net new files: 4. Modified: 7.

---

## Task 1: Server — `filterTemplatesByTier` accepts `includeLocked` param

**Files:**
- Modify: `functions/ross-tier.js`
- Modify (tests): `tests/unit/ross-tier.test.js`

**Context:** Current signature is `filterTemplatesByTier(templates, userTier, isSuperAdmin)` and drops All-in templates entirely for Free users. We're adding a 4th param `includeLocked` (default `false`) that — when `true` and the user is Free — keeps the All-in templates in the response but stamps them with `locked: true`.

The function is pure and lives in `functions/ross-tier.js` with no firebase-admin deps. Existing vitest file at `tests/unit/ross-tier.test.js` exercises the current behavior.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/ross-tier.test.js` (after the existing `describe('filterTemplatesByTier', ...)` block):

```js
describe('filterTemplatesByTier — includeLocked param', () => {
  const templates = [
    { templateId: 't1', name: 'Free A', tier: 'free' },
    { templateId: 't2', name: 'Free B', tier: 'free' },
    { templateId: 't3', name: 'All-in A', tier: 'all-in' },
    { templateId: 't4', name: 'All-in B', tier: 'all-in' },
  ]

  test('Free user with includeLocked:true keeps all-in templates and stamps locked:true', () => {
    const result = filterTemplatesByTier(templates, 'free', false, true)
    expect(result).toHaveLength(4)
    expect(result.find(t => t.templateId === 't1').locked).toBeUndefined()
    expect(result.find(t => t.templateId === 't2').locked).toBeUndefined()
    expect(result.find(t => t.templateId === 't3').locked).toBe(true)
    expect(result.find(t => t.templateId === 't4').locked).toBe(true)
  })

  test('Free user with includeLocked:false (default) drops all-in templates — unchanged behavior', () => {
    const result = filterTemplatesByTier(templates, 'free', false)
    expect(result).toHaveLength(2)
    expect(result.every(t => t.tier === 'free')).toBe(true)
  })

  test('Free user with includeLocked omitted matches includeLocked:false', () => {
    const a = filterTemplatesByTier(templates, 'free', false)
    const b = filterTemplatesByTier(templates, 'free', false, false)
    expect(a).toEqual(b)
  })

  test('All-in user with includeLocked:true returns all templates with no locked flag', () => {
    const result = filterTemplatesByTier(templates, 'all-in', false, true)
    expect(result).toHaveLength(4)
    expect(result.some(t => t.locked === true)).toBe(false)
  })

  test('SuperAdmin with includeLocked:true returns all templates with no locked flag', () => {
    const result = filterTemplatesByTier(templates, 'free', true, true)
    expect(result).toHaveLength(4)
    expect(result.some(t => t.locked === true)).toBe(false)
  })

  test('Missing userTier with includeLocked:true behaves like Free', () => {
    const result = filterTemplatesByTier(templates, null, false, true)
    expect(result).toHaveLength(4)
    expect(result.find(t => t.tier === 'all-in').locked).toBe(true)
  })

  test('Falsy includeLocked values (string "true", 1, etc.) do NOT activate locked mode — strict === true only', () => {
    // Defensive: only literal `true` should opt in
    const result = filterTemplatesByTier(templates, 'free', false, 1)
    expect(result).toHaveLength(2)
  })

  test('Locked flag does not mutate input templates', () => {
    const input = templates.map(t => ({ ...t }))
    filterTemplatesByTier(input, 'free', false, true)
    expect(input.find(t => t.templateId === 't3').locked).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/unit/ross-tier.test.js
```

Expected: 8 new tests FAIL (the param is ignored; behavior matches Free filter-out for all cases).

- [ ] **Step 3: Modify `filterTemplatesByTier`**

In `functions/ross-tier.js`, replace the current function:

```js
function filterTemplatesByTier(templates, userTier, isSuperAdmin, includeLocked) {
    if (!Array.isArray(templates)) return [];
    if (isSuperAdmin) return templates;
    if (userTier === 'all-in') return templates;
    // Free or missing tier
    if (includeLocked !== true) {
        return templates.filter(t => t && t.tier === 'free');
    }
    return templates.map(t => {
        if (!t || typeof t !== 'object') return t;
        if (t.tier === 'free') return t;
        return { ...t, locked: true };
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- tests/unit/ross-tier.test.js
```

Expected: all existing tests still pass, all 8 new tests pass. No regressions.

- [ ] **Step 5: Commit**

```bash
git add functions/ross-tier.js tests/unit/ross-tier.test.js
git commit -m "feat(ross): filterTemplatesByTier supports includeLocked param

When includeLocked:true and the user is Free, All-in templates remain in
the response with locked:true stamped on them — enabling the upsell-card
UX. Default behavior unchanged (filter-out) so v1 callers see no diff.

Phase 6 PR 1C."
```

---

## Task 2: Server — `rossGetTemplates` threads `includeLocked` through

**Files:**
- Modify: `functions/ross.js`

**Context:** The handler currently calls `filterTemplatesByTier(templates, userTier, isSuperAdmin)`. We need it to read `data.includeLocked` from the request and pass it as the 4th arg.

- [ ] **Step 1: Read the current handler**

Read `functions/ross.js` lines 191-222 to confirm the exact shape of the `rossGetTemplates` handler.

- [ ] **Step 2: Modify the handler**

Use Edit. Find this block:

```js
            const data = req.body.data || req.body;
            const { category } = data || {};

            const snapshot = await db.ref('ross/templates').once('value');
            const raw = snapshot.val() || {};
            let templates = Object.values(raw);

            if (category && VALID_CATEGORIES.includes(category)) {
                templates = templates.filter(t => t.category === category);
            }

            // Tier filter — Phase 6 PR 1A. SuperAdmin sees all; All-in sees all;
            // Free + missing-tier-user see only tier === 'free' templates.
            const userTier = await readUserTier(uid);
            templates = filterTemplatesByTier(templates, userTier, isSuperAdmin);
```

Replace with:

```js
            const data = req.body.data || req.body;
            const { category, includeLocked } = data || {};

            const snapshot = await db.ref('ross/templates').once('value');
            const raw = snapshot.val() || {};
            let templates = Object.values(raw);

            if (category && VALID_CATEGORIES.includes(category)) {
                templates = templates.filter(t => t.category === category);
            }

            // Tier filter — Phase 6 PR 1A. SuperAdmin sees all; All-in sees all;
            // Free + missing-tier-user see only tier === 'free' templates.
            // PR 1C: callers can opt in to `includeLocked: true` to receive
            // All-in templates with a `locked: true` flag instead of being
            // filtered out — used by the v2 Playbook tab for the upsell UX.
            const userTier = await readUserTier(uid);
            templates = filterTemplatesByTier(templates, userTier, isSuperAdmin, includeLocked === true);
```

The `includeLocked === true` guard at the call site doubles up the protection from the pure function — explicit at both layers.

- [ ] **Step 3: Syntax check**

```bash
node --check functions/ross.js
```

Expected: silent success.

- [ ] **Step 4: Commit**

```bash
git add functions/ross.js
git commit -m "feat(ross): rossGetTemplates threads includeLocked to tier filter

Phase 6 PR 1C — wires the new filter param to its handler. v1 callers
(which don't pass the field) get the current filter-out behavior; v2
Playbook opts in to receive locked entries."
```

---

## Task 3: Client service — opt in to `includeLocked`

**Files:**
- Modify: `public/js/modules/ross/v2/playbook-service.js`

**Context:** Current `getPlaybookTemplates({category})` posts to `rossGetTemplates` with just `{category}`. We need to add `includeLocked: true` so the v2 Playbook receives locked entries.

- [ ] **Step 1: Modify the function**

Find this block in `public/js/modules/ross/v2/playbook-service.js`:

```js
export async function getPlaybookTemplates({ category } = {}) {
  const args = category ? { category } : {}
  const result = await callFunction('rossGetTemplates', args)
  return Array.isArray(result?.templates) ? result.templates : []
}
```

Replace with:

```js
/**
 * Fetch all templates the user can see (their own + public). Optional
 * category filter is server-side.
 *
 * PR 1C: passes `includeLocked: true` so All-in templates appear in the
 * response with `locked: true` (rather than being filtered out) for Free
 * users. The component renders them as upgrade-affordance cards. The
 * server-side activate gate (PR #51) remains authoritative — locked
 * templates cannot be activated even if a client tries.
 */
export async function getPlaybookTemplates({ category } = {}) {
  const args = { includeLocked: true }
  if (category) args.category = category
  const result = await callFunction('rossGetTemplates', args)
  return Array.isArray(result?.templates) ? result.templates : []
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/modules/ross/v2/playbook-service.js
git commit -m "feat(ross-v2): playbook-service opts in to includeLocked

Phase 6 PR 1C — v2 Playbook will now receive All-in templates with
locked:true for Free users so they can be rendered as upgrade-affordance
cards. Server-side filter from PR 1A still applies if includeLocked is
not sent (preserved for any other caller)."
```

---

## Task 4: Contact constants module

**Files:**
- Create: `public/js/services/contact.js`

**Context:** The upgrade page needs WhatsApp + email contact info. Centralising as a single source so the upgrade page (and future contact CTAs) read from one place. No existing file owns this — `KNOWLEDGE BASE/WHATSAPP_BOT_SOP.md` is documentation, not code config.

Use placeholder values from `KNOWLEDGE BASE/` if available; otherwise commit with the agreed contact numbers (operator to confirm before merge). For now, ship reasonable Sparks Hospitality defaults that the operator can edit in this same PR if needed.

- [ ] **Step 1: Create the file**

```js
/**
 * Centralised contact info for upsell / sales / support CTAs.
 *
 * Used by:
 *  - `/upgrade.html` — All-in upgrade CTA (Phase 6 PR 1C)
 *
 * Future consumers: any "Contact us" button across the app should
 * import from here so a number change is a single-file edit. When the
 * Phase 6 D self-service checkout ships, the WhatsApp/email CTAs become
 * the fallback path for operators who prefer human contact.
 */

export const SPARKS_CONTACT = {
  whatsappE164: '+27123456789',          // operator: replace with the real Sparks sales WhatsApp number
  email: 'hello@sparkshospitality.co.za', // operator: replace with the real Sparks sales inbox
  displayName: 'Sparks Hospitality',
}

/**
 * Build a `wa.me` deep link. `message` is URL-encoded.
 * E164 number is stripped of the leading `+` per wa.me convention.
 */
export function buildWhatsAppUrl(message = '') {
  const n = (SPARKS_CONTACT.whatsappE164 || '').replace(/^\+/, '')
  const text = encodeURIComponent(message)
  return `https://wa.me/${n}${text ? `?text=${text}` : ''}`
}

/**
 * Build a `mailto:` URL.
 */
export function buildMailtoUrl(subject = '', body = '') {
  const s = encodeURIComponent(subject)
  const b = encodeURIComponent(body)
  const qs = [s && `subject=${s}`, b && `body=${b}`].filter(Boolean).join('&')
  return `mailto:${SPARKS_CONTACT.email}${qs ? `?${qs}` : ''}`
}
```

- [ ] **Step 2: Commit**

```bash
git add public/js/services/contact.js
git commit -m "feat(services): central contact info + wa.me/mailto builders

One-source contact constants for upsell + sales CTAs. Consumed first by
the Phase 6 PR 1C upgrade page; future Contact buttons should import
from here. Placeholder number/email — operator to verify the real Sparks
sales WhatsApp + inbox before merge."
```

---

## Task 5: Hi-Fi mount shell for `/upgrade.html`

**Files:**
- Create: `public/upgrade.html`

**Context:** Mirror the `/signup.html` mount shell pattern exactly (Hi-Fi fonts + tokens + base CSS, `#app` div, single Vue entry script).

- [ ] **Step 1: Create the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Upgrade to All-in — Sparks Hospitality</title>
  <meta name="description" content="Unlock the full ROSS playbook with All-in: 13 starter templates across compliance, operations, growth, finance, HR, and maintenance." />
  <link rel="icon" type="image/png" href="img/platfrm_logo.png" />
  <link rel="apple-touch-icon" href="img/platfrm_logo.png" />
  <link rel="stylesheet" href="/css/hifi-fonts.css" />
  <link rel="stylesheet" href="/css/hifi-tokens.css" />
  <link rel="stylesheet" href="/css/hifi-base.css" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: var(--hf-bg); }
    #app { min-height: 100vh; }
  </style>
</head>
<body class="hf-body">
  <div id="app"></div>
  <script type="module" src="/js/marketing/upgrade/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add public/upgrade.html
git commit -m "feat(upgrade): Hi-Fi mount shell for /upgrade.html

Phase 6 PR 1C. Mirrors the /signup.html pattern."
```

---

## Task 6: Vue 3 entry for the upgrade page

**Files:**
- Create: `public/js/marketing/upgrade/main.js`

**Context:** Mirror the landing/main.js pattern. Pinia is installed defensively even if not strictly needed (consistent with the marketing landing — keeps options open).

- [ ] **Step 1: Create the file**

```js
// Sparks Hi-Fi upgrade page — Vue 3 entry.
//
// Mounts the UpgradeApp SFC, installs the Hi-Fi component plugin so
// <hf-button>, <hf-card>, <hf-chip>, <hf-icon> etc. resolve globally,
// and installs Pinia for consistency with the marketing landing app.
//
// Phase 6 PR 1C. Destination of the "Upgrade to All-in" CTA on
// locked template cards inside RossPlaybook.vue.

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import HiFi from '/js/design-system/hifi/index.js'
import UpgradeApp from './UpgradeApp.vue'

createApp(UpgradeApp).use(createPinia()).use(HiFi).mount('#app')
```

- [ ] **Step 2: Commit**

```bash
git add public/js/marketing/upgrade/main.js
git commit -m "feat(upgrade): Vue 3 entry for /upgrade.html

Mirrors marketing/landing/main.js."
```

---

## Task 7: Upgrade page component (`UpgradeApp.vue`)

**Files:**
- Create: `public/js/marketing/upgrade/UpgradeApp.vue`

**Context:** Single-component page. Renders:

1. Hero — "Unlock the full ROSS playbook" + sub-copy
2. Free vs All-in comparison (two columns, reads `loadTiers()` from `services/subscription-tiers.js`; falls back to hardcoded structure if read fails)
3. The All-in template list (hardcoded names + cadences — stable through PR 1C+D)
4. Contact CTA — WhatsApp primary + email fallback; if `?from=template&id=<id>` query params are present, the WhatsApp message is pre-filled with the trigger context.

- [ ] **Step 1: Create the file**

```vue
<template>
  <main class="upgrade">
    <!-- Hero -->
    <section class="upgrade__hero">
      <hf-chip>All-in tier</hf-chip>
      <h1 class="upgrade__title">Unlock the full ROSS playbook</h1>
      <p class="upgrade__sub">
        13 starter templates across compliance, operations, growth, finance, HR, and maintenance —
        all built for South African restaurants.
      </p>
    </section>

    <!-- Comparison -->
    <section class="upgrade__compare">
      <div class="upgrade__col">
        <h2 class="upgrade__col-title">Free</h2>
        <p class="upgrade__col-price">{{ freeLabel }}</p>
        <ul class="upgrade__list">
          <li>5 starter templates</li>
          <li>Daily Opening + Closing checklists</li>
          <li>Weekly Deep Clean</li>
          <li>Monthly Food Cost review</li>
          <li>Quarterly Health &amp; Safety audit</li>
        </ul>
      </div>
      <div class="upgrade__col upgrade__col--featured">
        <hf-chip variant="solid">Recommended</hf-chip>
        <h2 class="upgrade__col-title">All-in</h2>
        <p class="upgrade__col-price">{{ allInLabel }}</p>
        <ul class="upgrade__list">
          <li><strong>All 13 templates</strong></li>
          <li>Certificate of Acceptability — annual</li>
          <li>Liquor Licence Renewal — annual</li>
          <li>Weekly Social Media Campaign</li>
          <li>Monthly Google Review Campaign</li>
          <li>Weekly Supplier Payment Run</li>
          <li>Monthly Staff Meeting</li>
          <li>Quarterly Staff Performance Review</li>
          <li>Monthly Equipment Service Check</li>
          <li>Everything in Free</li>
        </ul>
      </div>
    </section>

    <!-- CTA -->
    <section class="upgrade__cta">
      <hf-button as="a" :href="whatsAppUrl" variant="solid" size="lg">
        Contact us on WhatsApp
      </hf-button>
      <a class="upgrade__mailto" :href="mailtoUrl">…or email us instead</a>
      <p class="upgrade__cta-hint">
        Self-service checkout is coming soon — for now a quick chat gets you All-in
        within the same business day.
      </p>
    </section>

    <p v-if="loadError" class="upgrade__error" role="alert">{{ loadError }}</p>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { loadTiers } from '/js/services/subscription-tiers.js'
import { buildWhatsAppUrl, buildMailtoUrl, SPARKS_CONTACT } from '/js/services/contact.js'

const tiers = ref([])
const loadError = ref('')

// Defaults — used if RTDB read fails or returns nothing.
const FALLBACK = {
  freeLabel: 'R0 / month',
  allInLabel: 'Pricing on request',
}

const freeLabel = computed(() => {
  const t = tiers.value.find(x => (x.id || '').toLowerCase() === 'free')
  if (!t) return FALLBACK.freeLabel
  const p = Number(t.monthlyPrice || 0)
  return p > 0 ? `R${p} / month` : 'R0 / month'
})

const allInLabel = computed(() => {
  const t = tiers.value.find(x => (x.id || '').toLowerCase() === 'all-in' || (x.id || '').toLowerCase() === 'allin')
  if (!t || !Number(t.monthlyPrice)) return FALLBACK.allInLabel
  return `R${t.monthlyPrice} / month`
})

// Query-param-aware CTA pre-fill so sales sees which template triggered.
const ctaContext = (() => {
  if (typeof window === 'undefined') return { from: '', id: '' }
  const p = new URLSearchParams(window.location.search)
  return { from: (p.get('from') || '').slice(0, 32), id: (p.get('id') || '').slice(0, 64) }
})()

const whatsAppUrl = computed(() => {
  const base = `Hi ${SPARKS_CONTACT.displayName}, I'd like to upgrade to All-in.`
  const trail = ctaContext.from === 'template' && ctaContext.id
    ? ` (Triggered from template id: ${ctaContext.id})`
    : ''
  return buildWhatsAppUrl(base + trail)
})

const mailtoUrl = computed(() => {
  const subject = 'Upgrade to All-in'
  const body = ctaContext.from === 'template' && ctaContext.id
    ? `Hi,\n\nI'd like to upgrade my Sparks account to All-in.\n\nTriggered from template id: ${ctaContext.id}\n\nThanks.`
    : `Hi,\n\nI'd like to upgrade my Sparks account to All-in.\n\nThanks.`
  return buildMailtoUrl(subject, body)
})

onMounted(async () => {
  try {
    tiers.value = await loadTiers()
  } catch (err) {
    // Soft-fail — fallback labels render fine.
    loadError.value = ''
    console.warn('[upgrade] tier load failed; using fallback labels.', err)
  }
})
</script>

<style scoped>
.upgrade {
  max-width: 1024px;
  margin: 0 auto;
  padding: var(--hf-space-7) var(--hf-space-5);
  font-family: var(--hf-font-sans);
  color: var(--hf-fg);
}

.upgrade__hero {
  text-align: center;
  margin-bottom: var(--hf-space-8);
}
.upgrade__title {
  font-family: var(--hf-font-serif);
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 1.1;
  margin: var(--hf-space-3) 0 var(--hf-space-2);
}
.upgrade__sub {
  font-size: 1.125rem;
  color: var(--hf-fg-muted);
  max-width: 56ch;
  margin: 0 auto;
}

.upgrade__compare {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--hf-space-5);
  margin-bottom: var(--hf-space-7);
}
@media (min-width: 700px) {
  .upgrade__compare { grid-template-columns: 1fr 1fr; }
}

.upgrade__col {
  border: 1px solid var(--hf-border);
  border-radius: var(--hf-radius-3);
  padding: var(--hf-space-5);
  background: var(--hf-surface);
}
.upgrade__col--featured {
  border-color: var(--hf-accent);
  box-shadow: 0 8px 24px -16px var(--hf-accent);
}
.upgrade__col-title {
  font-family: var(--hf-font-serif);
  font-size: 1.75rem;
  margin: var(--hf-space-2) 0 var(--hf-space-1);
}
.upgrade__col-price {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--hf-fg);
  margin: 0 0 var(--hf-space-4);
}
.upgrade__list {
  margin: 0;
  padding-left: 1.25em;
  line-height: 1.7;
  color: var(--hf-fg-muted);
}
.upgrade__list li strong { color: var(--hf-fg); }

.upgrade__cta {
  text-align: center;
  padding: var(--hf-space-6) 0;
}
.upgrade__mailto {
  display: inline-block;
  margin-top: var(--hf-space-3);
  color: var(--hf-fg-muted);
  text-decoration: underline;
}
.upgrade__cta-hint {
  margin-top: var(--hf-space-4);
  color: var(--hf-fg-muted);
  font-size: 0.95rem;
  max-width: 48ch;
  margin-left: auto;
  margin-right: auto;
}

.upgrade__error {
  margin-top: var(--hf-space-5);
  color: var(--hf-danger);
  text-align: center;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add public/js/marketing/upgrade/UpgradeApp.vue
git commit -m "feat(upgrade): UpgradeApp.vue — comparison page + WhatsApp/email CTA

Reads subscriptionTiers/ via loadTiers() with graceful fallback.
?from=template&id=<id> query params pre-fill the CTA message so sales
knows which template triggered the upgrade interest.

Phase 6 PR 1C."
```

---

## Task 8: Vite entry for upgrade page

**Files:**
- Modify: `vite.config.js`

**Context:** Add `upgrade` alongside the existing entries so `npm run build` emits the page.

- [ ] **Step 1: Modify the config**

In `vite.config.js`, find this block:

```js
        'index':                    resolve(__dirname, 'public/index.html'),
        'signup':                   resolve(__dirname, 'public/signup.html'),
        'project-status':           resolve(__dirname, 'public/project-status.html')
```

Replace with:

```js
        'index':                    resolve(__dirname, 'public/index.html'),
        'signup':                   resolve(__dirname, 'public/signup.html'),
        'upgrade':                  resolve(__dirname, 'public/upgrade.html'),
        'project-status':           resolve(__dirname, 'public/project-status.html')
```

- [ ] **Step 2: Build to verify the entry resolves**

```bash
npm run build
```

Expected: clean build. `dist/upgrade.html` should appear in the output asset list.

- [ ] **Step 3: Commit**

```bash
git add vite.config.js
git commit -m "build: add upgrade.html entry to vite config

Phase 6 PR 1C."
```

---

## Task 9: Locked-card UX in `RossPlaybook.vue`

**Files:**
- Modify: `public/js/modules/ross/v2/components/RossPlaybook.vue`

**Context:** The Templates list inside the Playbook tab is rendered by `RossPlaybook.vue`. We need:
- A new `template-card--locked` class when `template.locked` is true (opacity 0.7 via scoped CSS).
- A `🔒 All-in` badge top-right.
- The primary button changes from "Activate" to "Upgrade to All-in".
- Click on the upgrade button navigates to `/upgrade.html?from=template&id=<templateId>`. Activate is NOT called for locked templates.

The full text of the activate / upgrade region depends on the current markup. Open the file and locate the template card render block first.

- [ ] **Step 1: Read the file and locate the template card block**

Open `public/js/modules/ross/v2/components/RossPlaybook.vue` and find the `<template>` section that renders one template card (look for `template.name`, `template.category`, and the existing "Activate" button).

Identify:
- The wrapping element (e.g. `<div class="hf-card ...">` or similar)
- The current click handler / button (e.g. `<HfButton @click="onActivate(...)`)

- [ ] **Step 2: Add the conditional class and locked-state branches**

Update the wrapping element to add the `template-card--locked` class:

```vue
<div
  class="hf-card template-card"
  :class="{ 'template-card--locked': template.locked }"
>
```

Inside the card, BEFORE the existing card content (so it's the first absolutely-positioned child), add:

```vue
<span v-if="template.locked" class="template-card__lock-badge">🔒 All-in</span>
```

Replace the existing Activate button with a v-if/v-else pair:

```vue
<HfButton
  v-if="!template.locked"
  variant="solid"
  @click="onActivate(template)"
>Activate</HfButton>

<HfButton
  v-else
  variant="ghost"
  @click="onUpgradeClick(template)"
>Upgrade to All-in</HfButton>
```

(Keep the existing button's variant / size attrs on the `v-if` branch; the `v-else` ghost variant signals the upsell affordance.)

- [ ] **Step 3: Add the `onUpgradeClick` handler**

In the `<script setup>` block, add:

```js
function onUpgradeClick(template) {
  const id = encodeURIComponent(template.templateId || '')
  window.location.href = `/upgrade.html?from=template&id=${id}`
}
```

- [ ] **Step 4: Add scoped styles**

Append to the `<style scoped>` block:

```css
.template-card {
  position: relative;
}
.template-card--locked {
  opacity: 0.7;
}
.template-card--locked:hover {
  opacity: 0.85;
}
.template-card__lock-badge {
  position: absolute;
  top: var(--hf-space-3);
  right: var(--hf-space-3);
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: var(--hf-radius-2);
  background: var(--hf-surface-muted);
  color: var(--hf-fg-muted);
  border: 1px solid var(--hf-border);
  font-weight: 500;
  letter-spacing: 0.01em;
}
```

(If the scoped style block already has a `.template-card` rule that sets `position: relative`, omit the duplicate.)

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: clean build; the asset hash on `RossPlaybook` changes.

- [ ] **Step 6: Commit**

```bash
git add public/js/modules/ross/v2/components/RossPlaybook.vue
git commit -m "feat(ross-v2): render locked All-in template cards with upgrade CTA

Free users now see all 13 templates — the 8 All-in entries render dimmed
(0.7) with a 🔒 All-in badge and a 'Upgrade to All-in' ghost button that
routes to /upgrade.html?from=template&id=<id>. The PR #51 server-side
activate gate remains the security backstop — locked cards never call
rossActivateWorkflow.

Phase 6 PR 1C."
```

---

## Task 10: KB doc — append locked-card UX subsection

**Files:**
- Modify: `public/kb/features/ROSS.md`

**Context:** The existing Tier gating section (around line 294) has subsections for "Tier downgrade policy", "Missing tier fields (fail closed)", and (added in PR #53) "Curated tier split". Append a new `### Locked-card upsell UX (Phase 6 PR 1C, 2026-05-12)` subsection inside the same parent section, after the curated-split block.

- [ ] **Step 1: Locate the insertion point**

Read `public/kb/features/ROSS.md` to find the end of the "Curated tier split" subsection (added in PR #53). It should end before the `---` separator that precedes "## Cloud Functions".

- [ ] **Step 2: Append the subsection before the `---` separator**

Use Edit with `old_string` being the last 1-2 lines of the curated-split subsection plus the `---`. Insert this new subsection between them:

```markdown
### Locked-card upsell UX (Phase 6 PR 1C, 2026-05-12)

Free users now see all 13 templates in the v2 Playbook tab, not just the
5 Free ones. The 8 All-in templates render as **dimmed cards** (opacity
0.7) with a `🔒 All-in` badge top-right and a `Upgrade to All-in` ghost
button instead of the normal `Activate` button. The button routes to
`/upgrade.html?from=template&id=<templateId>` — a Hi-Fi Vue 3 page that
shows a Free vs All-in comparison and a WhatsApp + email contact CTA
(self-service checkout is Phase 6 D).

**Server contract:** `rossGetTemplates` accepts an opt-in
`includeLocked: true` request param. When set, Free users receive All-in
templates in the response with `locked: true` stamped on them instead
of being filtered out. v1 admin callers omit the param and continue to
receive the filtered list — no regression.

**Defense in depth:** the client never calls `rossActivateWorkflow` for
locked templates (the upgrade button short-circuits to the upgrade
page), but PR 1A's activate gate remains authoritative — any direct
attempt to activate a locked template is rejected 403 and logged to
`ross/auditLog/templateActivationDenials/{pushId}`.

See `docs/plans/2026-05-12-ross-tier-gated-template-list-design.md`.
```

- [ ] **Step 3: Sanity-check the markdown renders cleanly**

Skim the surrounding section in the editor / markdown previewer.

- [ ] **Step 4: Commit**

```bash
git add public/kb/features/ROSS.md
git commit -m "docs(ross): document locked-card upsell UX

Phase 6 PR 1C."
```

---

## Task 11: Build + push + PR

**Files:** none (verification only)

- [ ] **Step 1: Final build**

```bash
npm run build
```

Expected: clean. Confirm `dist/upgrade.html` is in the output. Confirm `RossPlaybook` and `playbook-service` chunks have new hashes.

- [ ] **Step 2: Run vitest one more time end-to-end**

```bash
npm test
```

Expected: all tests pass (including the 8 new `filterTemplatesByTier` cases).

- [ ] **Step 3: Push branch**

```bash
git push -u origin feature/ross-tier-gated-list
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat(ross): tier-gated template list + upgrade page (Phase 6 PR 1C)" --body "$(cat <<'EOF'
## Summary

- Server: `filterTemplatesByTier` gains opt-in `includeLocked` param — Free users receive All-in templates stamped `locked: true` instead of being filtered out (v1 admin callers untouched)
- Client v2 Playbook tab: locked All-in cards render dimmed (0.7) + `🔒 All-in` badge + `Upgrade to All-in` ghost button
- Upgrade button routes to new `/upgrade.html` — Hi-Fi Vue 3 comparison page with WhatsApp + email contact CTAs; structured to swap in a self-service checkout button later (Phase 6 D)
- 8 new vitest unit tests covering the new param + edge cases
- Defense in depth: PR #51's `rossActivateWorkflow` gate stays as the security backstop — locked cards never call activate

See `docs/plans/2026-05-12-ross-tier-gated-template-list-design.md` for the full rationale and `docs/plans/2026-05-12-ross-tier-gated-template-list-plan.md` for the implementation steps.

## Test plan

- [x] `npm run build` clean; `dist/upgrade.html` present
- [x] `npm test` — all tests pass (8 new in `tests/unit/ross-tier.test.js`)
- [ ] Preview: Free account → 13 cards visible in Playbook, 8 dimmed; click locked → `/upgrade.html?from=template&id=<id>` loads with WhatsApp pre-fill containing the template id
- [ ] Preview: All-in / superAdmin account → 13 unlocked cards; no upgrade button; Activate works
- [ ] Direct nav to `/upgrade.html` (no query params) → page loads, generic CTA copy
- [ ] Defense check: dev console call `rossActivateWorkflow` with a locked template ID as a Free user → 403; audit log entry at `ross/auditLog/templateActivationDenials/{pushId}`

## Out of scope

- Self-service checkout (Phase 6 D)
- Upgrade-request RTDB write path
- Analytics on upgrade page visits
- Verifying the WhatsApp number / email in `services/contact.js` — operator to replace the placeholder values before merge if the defaults aren't right
EOF
)"
```

- [ ] **Step 5: Capture PR URL**

Note the URL returned by `gh pr create`. Hand it back to the operator.

---

## Post-merge (operator)

Per Standard Task Workflow step 11, after PR merge:

1. Verify the WhatsApp number + email in `public/js/services/contact.js` are real Sparks contacts; if not, open a one-line follow-up PR with the corrections (this is the kind of value where placeholder commits get embarrassing if they sit on prod)
2. Reflect cycle: update `KNOWLEDGE BASE/development/SELF_OPTIMIZATION.md`, `LESSONS.md`, `SCORECARD.md`, `PROJECT_BACKLOG.md`
3. Remove worktree: `git worktree remove .claude/worktrees/ross-tier-gated-list`
4. Spot-check `/upgrade.html` on prod — comparison renders, WhatsApp link opens correctly
