<script setup>
// Sparks Hi-Fi marketing landing — workflow-centric narrative.
//
// PR 3 of Phase 5 (Phase 5 spec §3.3). Replaces the v1-derived "Smart
// Guest WiFi / Real-Time Analytics" feature framing with the
// playbook-as-product story the moonshot mandates. Fake stats + fake
// testimonials + fake success stories deleted; founder quote kept.
//
// Layout classes (.lp-*) live in /css/landing-page-v2.css. Visual
// primitives come from the Hi-Fi Vue component library.
import { ref, onMounted } from 'vue'
import RossOnboardingHello from '/js/modules/ross/v2/components/RossOnboardingHello.vue'
import { PUBLIC_HELLO_FINDINGS } from '../public-hello-content.js'
import { loadTiers } from '/js/services/subscription-tiers.js'

// Three concrete workflow examples — chosen to read as "things Ross
// runs for the operator", not "modules in a feature grid".
const workflows = [
  {
    icon:    'sparkle',
    title:   'Daily Opening Checklist',
    body:    'Temperatures, prep counts, signage, music, deposit float. Ross runs the same playbook every morning and flags anything that drifts before service starts.',
  },
  {
    icon:    'shield',
    title:   'Weekly Compliance Sweep',
    body:    'Cold-chain logs, allergen audits, expiring stock, supplier docs. One run. One paper trail. Ready when the inspector knocks.',
  },
  {
    icon:    'send',
    title:   'Monthly Marketing Push',
    body:    'Pull last month\'s top guests, draft the campaign, schedule the send, follow up on no-replies. The work that always gets postponed — done in twenty minutes.',
  },
]

// Fallback for the pricing section when subscriptionTiers can't be
// loaded (empty node, network error, RTDB rule reject etc). Honest
// shape, no fabricated numbers — the All-in price is genuinely TBD per
// the Phase 5 spec, so the card surfaces 'Pricing announced soon' as
// subtext rather than a bare em-dash. (PR #44 review.)
const FALLBACK_TIERS = [
  { id: 'free',   name: 'Free',   description: 'Start with the playbook. Bring your own data.',         monthlyPrice: 0,    features: {} },
  { id: 'all-in', name: 'All-in', description: 'Everything in Free, plus the full template library.',   monthlyPrice: null, features: {}, priceSubtext: 'Pricing announced soon' },
]

const tiers       = ref([])
const tiersError  = ref(null)
const tiersLoading = ref(true)

onMounted(async () => {
  try {
    const list = await loadTiers()
    tiers.value = list.length > 0 ? list : FALLBACK_TIERS
  } catch (err) {
    console.warn('[landing] tier load failed; using fallback:', err)
    tiers.value = FALLBACK_TIERS
    tiersError.value = err.message
  } finally {
    tiersLoading.value = false
  }
})

function priceLabel(tier) {
  const v = tier.monthlyPrice
  if (v == null || v === '') return '—'
  if (Number(v) === 0) return 'Free'
  return `R${v}`
}

function smoothScroll(e, selector) {
  // Always preventDefault — even the bare '#' branch should not append a
  // hash to the URL or push a history entry on logo click. (PR #44 review.)
  e.preventDefault()
  if (selector === '#') {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  const target = document.querySelector(selector)
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="lp-shell">
    <!-- Navigation -->
    <nav class="lp-nav">
      <div class="lp-nav__inner">
        <a href="#" class="lp-logo" aria-label="Sparks Hospitality" @click="smoothScroll($event, '#')">
          <svg class="lp-logo__mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="var(--hf-ink)" />
          </svg>
          <span class="lp-logo__text">Sparks</span>
        </a>
        <ul class="lp-nav__menu">
          <li><a href="#features" class="lp-nav__link" @click="smoothScroll($event, '#features')">Workflows</a></li>
          <li><a href="#about"    class="lp-nav__link" @click="smoothScroll($event, '#about')">Story</a></li>
          <li><a href="#pricing"  class="lp-nav__link" @click="smoothScroll($event, '#pricing')">Pricing</a></li>
          <li><a href="/user-login.html" class="lp-nav__link">Login</a></li>
          <li>
            <hf-button as="a" variant="accent" href="/signup.html">Start free</hf-button>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Hero -->
    <section class="lp-hero lp-section">
      <div class="lp-container">
        <div class="lp-hero__inner">
          <div>
            <div class="lp-hero__eyebrow">
              <hf-chip tone="accent">Your restaurant's playbook, run by Ross</hf-chip>
            </div>
            <h1 class="lp-hero__title">
              Workflows are the work.
              <span class="lp-hero__title-accent">Ross runs them.</span>
            </h1>
            <p class="lp-hero__lede">
              Opening checklists. Compliance sweeps. Marketing pushes. The hundred small things
              that keep a restaurant honest &mdash; written down once, run by Ross every day,
              flagged when something drifts.
            </p>
            <div class="lp-hero__ctas">
              <hf-button as="a" variant="accent" href="/signup.html">
                Start free
                <template #trailing>
                  <hf-icon name="arrow" :size="14" />
                </template>
              </hf-button>
              <hf-button as="a" variant="ghost" href="#hello-preview" @click="smoothScroll($event, '#hello-preview')">
                See a sample first
              </hf-button>
            </div>
          </div>
          <!-- Typographic hero panel: a stylised representation of one
               workflow run. The product, in miniature. Aria-hidden
               because everything visible is decorative — the hero copy
               carries the actual narrative for screen readers. -->
          <div class="lp-hero__panel" aria-hidden="true">
            <header class="lp-hero__panel-head">
              <span class="lp-hero__panel-eyebrow">
                <hf-icon name="sparkle" :size="11" />
                Daily Opening Checklist
              </span>
              <span class="lp-hero__panel-time">06:30</span>
            </header>
            <div class="lp-hero__panel-title">Tannie&rsquo;s Kitchen</div>
            <ul class="lp-hero__panel-tasks">
              <li class="lp-hero__panel-task lp-hero__panel-task--done">
                <span class="lp-hero__panel-check" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 8.5 L6.5 12 L13 5" />
                  </svg>
                </span>
                <span class="lp-hero__panel-label">Walk-in fridge temp</span>
                <span class="lp-hero__panel-meta">3&deg;C</span>
              </li>
              <li class="lp-hero__panel-task lp-hero__panel-task--done">
                <span class="lp-hero__panel-check" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 8.5 L6.5 12 L13 5" />
                  </svg>
                </span>
                <span class="lp-hero__panel-label">Front-of-house signage on</span>
                <span class="lp-hero__panel-meta">OK</span>
              </li>
              <li class="lp-hero__panel-task lp-hero__panel-task--done">
                <span class="lp-hero__panel-check" aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 8.5 L6.5 12 L13 5" />
                  </svg>
                </span>
                <span class="lp-hero__panel-label">Cash float counted</span>
                <span class="lp-hero__panel-meta">R2,500</span>
              </li>
              <li class="lp-hero__panel-task lp-hero__panel-task--active">
                <span class="lp-hero__panel-check" aria-hidden="true"></span>
                <span class="lp-hero__panel-label">Music queued</span>
                <span class="lp-hero__panel-meta">…</span>
              </li>
            </ul>
            <footer class="lp-hero__panel-foot">
              <span class="lp-hero__panel-status-dot" aria-hidden="true"></span>
              <span>3 of 4 done &middot; Ross is watching</span>
            </footer>
          </div>
        </div>
      </div>
    </section>

    <!-- Workflows (the product is the playbook) -->
    <section class="lp-section lp-section--paper" id="features">
      <div class="lp-container">
        <header class="lp-section__head">
          <span class="lp-section__eyebrow hf-eyebrow">The product is the playbook</span>
          <h2 class="lp-section__title">Start with three workflows. Ross runs them daily.</h2>
          <p class="lp-section__lede">
            Modules are not destinations &mdash; they're step types inside a workflow. The
            workflow is what Ross runs. Here are three that almost every restaurant needs.
          </p>
        </header>
        <div class="lp-grid">
          <hf-card v-for="w in workflows" :key="w.title">
            <template #header>
              <div class="lp-feature__icon" aria-hidden="true">
                <hf-icon :name="w.icon" :size="20" />
              </div>
              <h3 class="lp-card-title">{{ w.title }}</h3>
            </template>
            <p class="lp-card-body">{{ w.body }}</p>
          </hf-card>
        </div>
      </div>
    </section>

    <!-- Synthetic hello preview -->
    <section class="lp-section lp-section--bleed" id="hello-preview">
      <div class="lp-container lp-container--narrow">
        <header class="lp-section__head">
          <span class="lp-section__eyebrow hf-eyebrow">A sample first look</span>
          <h2 class="lp-section__title">What Ross might tell you on day one.</h2>
          <p class="lp-section__lede">
            Three things worth attending to on a Tuesday morning at a small Cape Town café.
            <strong>None of this is real customer data</strong> &mdash; the cards are tagged
            <em>preview</em> to make that clear. It's a flavour of how the agent thinks.
          </p>
        </header>
      </div>
      <div class="lp-hello-embed">
        <RossOnboardingHello
          :findings="PUBLIC_HELLO_FINDINGS"
          continue-href="/signup.html"
          tour-href="/signup.html"
        />
      </div>
    </section>

    <!-- Pricing -->
    <section class="lp-section" id="pricing">
      <div class="lp-container">
        <header class="lp-section__head">
          <span class="lp-section__eyebrow hf-eyebrow">Two ways to start</span>
          <h2 class="lp-section__title">Free to start. Upgrade when you outgrow it.</h2>
          <p class="lp-section__lede">
            The full ROSS workflow UI ships on every plan. Upgrading widens the template
            library you can pull from.
          </p>
        </header>
        <div v-if="tiersLoading" class="lp-pricing__status hf-eyebrow">Loading plans…</div>
        <div v-else class="lp-grid lp-grid--two">
          <hf-card v-for="t in tiers" :key="t.id">
            <template #header>
              <h3 class="lp-card-title">{{ t.name || 'Plan' }}</h3>
              <p v-if="t.description" class="lp-pricing__desc">{{ t.description }}</p>
            </template>
            <div class="lp-pricing__price">
              <span class="lp-pricing__price-amount">{{ priceLabel(t) }}</span>
              <span v-if="t.monthlyPrice && Number(t.monthlyPrice) !== 0" class="lp-pricing__price-period">/month</span>
            </div>
            <p v-if="t.priceSubtext" class="lp-pricing__price-subtext">{{ t.priceSubtext }}</p>
            <hf-button as="a" variant="accent" href="/signup.html">
              Get started
              <template #trailing><hf-icon name="arrow" :size="14" /></template>
            </hf-button>
          </hf-card>
        </div>
        <p v-if="tiersError" class="lp-pricing__hint">
          Showing default plans. Live pricing will be back shortly.
        </p>
      </div>
    </section>

    <!-- Founder story (also #testimonials alias for SEO compat) -->
    <section class="lp-section lp-section--sand" id="about">
      <a id="testimonials" class="lp-anchor-alias" aria-hidden="true"></a>
      <div class="lp-container">
        <header class="lp-section__head">
          <span class="lp-section__eyebrow hf-eyebrow">Inspired by service</span>
          <h2 class="lp-section__title">A legacy that guides everything we do</h2>
        </header>
        <article class="lp-quote lp-quote--solo">
          <div class="lp-quote__mark" aria-hidden="true">&ldquo;</div>
          <p class="lp-quote__body">
            My father, Lakis Katsouris, served people all his life from a young age. As an
            entrepreneur, he understood that hospitality is about creating moments that matter.
            Sparks Hospitality carries forward his belief that technology should amplify human
            connection, not replace it.
          </p>
          <div class="lp-quote__author">
            <div class="lp-quote__avatar">LK</div>
            <div>
              <p class="lp-quote__name">Founder's Story</p>
              <p class="lp-quote__role">The Katsouris Legacy</p>
            </div>
          </div>
        </article>
      </div>
    </section>

    <!-- CTA -->
    <section class="lp-section lp-section--ink">
      <div class="lp-container">
        <div class="lp-cta">
          <h2 class="lp-cta__title">Ready when you are.</h2>
          <p class="lp-cta__lede">Free to start. Upgrade when you outgrow it. No card up front.</p>
          <hf-button as="a" variant="accent" href="/signup.html">
            Start free
            <template #trailing>
              <hf-icon name="arrow" :size="14" />
            </template>
          </hf-button>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="lp-footer">
      <div class="lp-footer__inner">
        <div class="lp-footer__links">
          <a href="#features" @click="smoothScroll($event, '#features')">Workflows</a>
          <a href="#about"    @click="smoothScroll($event, '#about')">Story</a>
          <a href="#pricing"  @click="smoothScroll($event, '#pricing')">Pricing</a>
          <a href="/terms.html">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/admin-login.html">Admin</a>
        </div>
        <p class="lp-footer__legal">&copy; 2026 Sparks Hospitality &middot; In honour of Lakis Katsouris</p>
      </div>
    </footer>
  </div>
</template>
