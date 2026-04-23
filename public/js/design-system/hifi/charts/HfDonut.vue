<script setup>
// Progress donut with center label. Value is 0..1 (ratio) or 0..100 (if max=100).
import { computed } from 'vue'
import { formatNumber } from './chart-utils.js'

const props = defineProps({
  value:  { type: Number, required: true },
  max:    { type: Number, default: 1 },
  size:   { type: Number, default: 96 },
  stroke: { type: Number, default: 8 },
  color:  { type: String, default: 'var(--hf-ink)' },
  track:  { type: String, default: 'var(--hf-line)' },
  label:  { type: String, default: null },     // override center big text
  sub:    { type: String, default: null },     // center small text
  title:  { type: String, default: '' },
})

const pct = computed(() => {
  if (!props.max) return 0
  return Math.max(0, Math.min(1, props.value / props.max))
})
const r = computed(() => 50 - props.stroke / 2)
const c = computed(() => 2 * Math.PI * r.value)
const dash = computed(() => `${(c.value * pct.value).toFixed(2)} ${c.value.toFixed(2)}`)

const autoLabel = computed(() => props.label ?? (props.max === 1 ? `${Math.round(pct.value * 100)}%` : formatNumber(props.value)))
const ariaLabel = computed(() => `${props.title || 'Donut'}: ${autoLabel.value}${props.sub ? ', ' + props.sub : ''}`)
</script>

<template>
  <div class="hf-donut" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="ariaLabel">
    <svg :width="size" :height="size" viewBox="0 0 100 100">
      <circle cx="50" cy="50" :r="r" fill="none" :stroke="track" :stroke-width="stroke" />
      <circle
        cx="50" cy="50" :r="r" fill="none" :stroke="color" :stroke-width="stroke"
        :stroke-dasharray="dash" stroke-linecap="round"
        transform="rotate(-90 50 50)"
        style="transition: stroke-dasharray 400ms var(--hf-ease, cubic-bezier(0.2,0.7,0.3,1))"
      />
    </svg>
    <div class="hf-donut__center">
      <div class="hf-donut__label" :style="{ fontSize: `${size * 0.26}px` }">{{ autoLabel }}</div>
      <div v-if="sub" class="hf-donut__sub">{{ sub }}</div>
    </div>
  </div>
</template>

<style scoped>
.hf-donut { position: relative; display: inline-block; }
.hf-donut__center {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center;
}
.hf-donut__label {
  font-family: var(--hf-font-display);
  font-feature-settings: "tnum", "lnum";
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--hf-ink);
}
.hf-donut__sub {
  font-family: var(--hf-font-mono);
  font-size: 9px;
  color: var(--hf-muted);
  margin-top: 2px;
  letter-spacing: 0.05em;
}
</style>
