<script setup>
// Renders the dynamic `subscriptionTiers` RTDB list. Pricing + features
// come from whatever the admin has configured via admin-dashboard's
// Tier Management UI. The first tier (lowest price) is pre-selected.
import HfButton from '/js/design-system/hifi/components/HfButton.vue'

defineProps({
  tiers:    { type: Array,  required: true },
  selected: { type: String, default: null },
})
const emit = defineEmits(['select'])

function priceDisplay(tier) {
  const v = tier.monthlyPrice
  if (v == null || v === '') return '—'
  if (Number(v) === 0) return 'Free'
  return `R${v}`
}

function featureLines(tier) {
  const lines = []
  const f = tier.features || {}
  if (f.locations)     lines.push(`${f.locations} location${f.locations > 1 ? 's' : ''}`)
  if (f.users)         lines.push(`${f.users} user${f.users > 1 ? 's' : ''}`)
  if (f.guestProfiles) lines.push(`${f.guestProfiles === -1 ? 'Unlimited' : f.guestProfiles} guest profiles`)
  if (f.campaigns)     lines.push(`${f.campaigns === -1 ? 'Unlimited' : f.campaigns} campaign${f.campaigns !== 1 ? 's' : ''}/month`)
  if (f.analytics)     lines.push('Advanced analytics')
  if (f.apiAccess)     lines.push('API access')
  if (f.support)       lines.push(`${f.support} support`)
  return lines
}
</script>

<template>
  <section class="tier-step">
    <div class="tier-step__eyebrow">Step 1 of 2 · Choose your plan</div>
    <div class="tier-grid" :data-count="tiers.length">
      <article
        v-for="tier in tiers"
        :key="tier.id"
        class="tier-card"
        :class="{ 'tier-card--selected': selected === tier.id }"
        @click="emit('select', tier.id)"
      >
        <header class="tier-card__head">
          <h2 class="tier-card__name">{{ tier.name || 'Plan' }}</h2>
          <p v-if="tier.description" class="tier-card__desc">{{ tier.description }}</p>
        </header>

        <div class="tier-card__price">
          <span class="tier-card__price-amount">{{ priceDisplay(tier) }}</span>
          <span v-if="tier.monthlyPrice && Number(tier.monthlyPrice) !== 0"
                class="tier-card__price-period">/month</span>
        </div>

        <ul v-if="featureLines(tier).length" class="tier-card__features">
          <li v-for="line in featureLines(tier)" :key="line">
            <span class="tier-card__check" aria-hidden="true">✓</span>
            <span>{{ line }}</span>
          </li>
        </ul>

        <HfButton
          :variant="selected === tier.id ? 'solid' : 'outline'"
          @click.stop="emit('select', tier.id)"
        >
          {{ selected === tier.id ? `Continue with ${tier.name}` : `Choose ${tier.name}` }}
        </HfButton>
      </article>
    </div>
  </section>
</template>

<style scoped>
.tier-step__eyebrow {
  font-family: var(--hf-font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--hf-muted);
  margin-bottom: 16px;
  text-align: center;
}
.tier-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  max-width: 880px;
  margin: 0 auto;
}
.tier-card {
  background: var(--hf-paper);
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius-md);
  padding: 24px 22px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  cursor: pointer;
  transition: border-color var(--hf-transition), box-shadow var(--hf-transition);
}
.tier-card:hover { border-color: var(--hf-ink-2); }
.tier-card--selected {
  border-color: var(--hf-ink);
  box-shadow: var(--hf-shadow-2);
}
.tier-card__name {
  font-family: var(--hf-font-display);
  font-size: 24px;
  font-weight: 400;
  letter-spacing: -0.01em;
  margin: 0 0 6px;
  line-height: 1.05;
}
.tier-card__desc {
  margin: 0;
  font-size: 13px;
  color: var(--hf-muted);
  line-height: 1.4;
}
.tier-card__price {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.tier-card__price-amount {
  font-family: var(--hf-font-display);
  font-size: 32px;
  letter-spacing: -0.02em;
  color: var(--hf-ink);
}
.tier-card__price-period {
  font-size: 13px;
  color: var(--hf-muted);
}
.tier-card__features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--hf-ink-2);
  flex: 1;
}
.tier-card__features li { display: flex; gap: 8px; align-items: flex-start; }
.tier-card__check { color: var(--hf-accent); font-weight: 600; }
</style>
