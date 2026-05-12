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
      <hf-button as="a" :href="mailtoUrl" variant="solid" size="lg">
        Email us to upgrade
      </hf-button>
      <p class="upgrade__cta-hint">
        Self-service checkout is coming soon — for now a quick email gets you All-in
        within the same business day.
      </p>
    </section>
  </main>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { loadTiers } from '/js/services/subscription-tiers.js'
import { buildMailtoUrl, SPARKS_CONTACT } from '/js/services/contact.js'

const tiers = ref([])

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
  const t = tiers.value.find(x => {
    const id = (x.id || '').toLowerCase()
    return id === 'all-in' || id === 'allin'
  })
  if (!t || !Number(t.monthlyPrice)) return FALLBACK.allInLabel
  return `R${t.monthlyPrice} / month`
})

// Strip control chars (CR, LF, tabs, etc.) before they reach the
// mailto body — prevents header-injection-style payloads in ?id=.
const stripControlChars = (s) => (s || '').replace(/[\x00-\x1F\x7F]/g, '')

const ctaContext = (() => {
  if (typeof window === 'undefined') return { from: '', id: '' }
  const p = new URLSearchParams(window.location.search)
  return {
    from: stripControlChars(p.get('from')).slice(0, 32),
    id: stripControlChars(p.get('id')).slice(0, 64),
  }
})()

const mailtoUrl = computed(() => {
  const subject = 'Upgrade to All-in'
  const body = ctaContext.from === 'template' && ctaContext.id
    ? `Hi ${SPARKS_CONTACT.displayName},\n\nI'd like to upgrade my Sparks account to All-in.\n\nTriggered from template id: ${ctaContext.id}\n\nThanks.`
    : `Hi ${SPARKS_CONTACT.displayName},\n\nI'd like to upgrade my Sparks account to All-in.\n\nThanks.`
  return buildMailtoUrl(subject, body)
})

onMounted(async () => {
  try {
    tiers.value = await loadTiers()
  } catch (err) {
    console.warn('[upgrade] tier load failed; using fallback labels.', err)
  }
})
</script>

<style scoped>
.upgrade {
  max-width: 1024px;
  margin: 0 auto;
  padding: var(--hf-space-7) var(--hf-space-5);
  font-family: var(--hf-font-body);
  color: var(--hf-ink);
}

.upgrade__hero {
  text-align: center;
  margin-bottom: var(--hf-space-8);
}
.upgrade__title {
  font-family: var(--hf-font-display);
  font-size: clamp(2rem, 4vw, 3.25rem);
  line-height: 1.1;
  margin: var(--hf-space-3) 0 var(--hf-space-2);
}
.upgrade__sub {
  font-size: 1.125rem;
  color: var(--hf-muted);
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
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-lg);
  padding: var(--hf-space-5);
  background: var(--hf-paper);
}
.upgrade__col--featured {
  border-color: var(--hf-accent);
  box-shadow: 0 8px 24px -16px var(--hf-accent);
}
.upgrade__col-title {
  font-family: var(--hf-font-display);
  font-size: 1.75rem;
  margin: var(--hf-space-2) 0 var(--hf-space-1);
}
.upgrade__col-price {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--hf-ink);
  margin: 0 0 var(--hf-space-4);
}
.upgrade__list {
  margin: 0;
  padding-left: 1.25em;
  line-height: 1.7;
  color: var(--hf-muted);
}
.upgrade__list li strong { color: var(--hf-ink); font-weight: 600; }

.upgrade__cta {
  text-align: center;
  padding: var(--hf-space-6) 0;
}
.upgrade__cta-hint {
  margin-top: var(--hf-space-4);
  color: var(--hf-muted);
  font-size: 0.95rem;
  max-width: 48ch;
  margin-left: auto;
  margin-right: auto;
}
</style>
