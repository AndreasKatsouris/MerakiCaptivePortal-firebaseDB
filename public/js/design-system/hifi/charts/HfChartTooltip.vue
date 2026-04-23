<script setup>
// Shared absolutely-positioned tooltip. Hidden by default; parent passes
// `visible` + `x` + `y` in container-local coordinates. The tooltip
// positions itself clear of the pointer and flips to the other side if
// it would overflow the container.
import { computed } from 'vue'

const props = defineProps({
  visible:       { type: Boolean, default: false },
  x:             { type: Number, default: 0 },
  y:             { type: Number, default: 0 },
  containerWidth:{ type: Number, default: 0 },
  label:         { type: String, default: '' },
  value:         { type: String, default: '' },
  sub:           { type: String, default: '' },
})

// Flip horizontally if near the right edge.
const flip = computed(() => props.containerWidth > 0 && props.x > props.containerWidth - 120)
</script>

<template>
  <div
    v-show="visible"
    class="hf-chart-tooltip"
    :class="{ 'hf-chart-tooltip--flip': flip }"
    :style="{ left: `${x}px`, top: `${y}px` }"
    role="status"
    aria-live="polite"
  >
    <div v-if="label" class="hf-chart-tooltip__label">{{ label }}</div>
    <div class="hf-chart-tooltip__value">{{ value }}</div>
    <div v-if="sub" class="hf-chart-tooltip__sub">{{ sub }}</div>
  </div>
</template>

<style scoped>
.hf-chart-tooltip {
  position: absolute;
  transform: translate(-50%, -100%) translateY(-10px);
  background: var(--hf-ink);
  color: var(--hf-bg);
  border-radius: var(--hf-radius);
  padding: 8px 10px;
  font-family: var(--hf-font-body);
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--hf-shadow-3);
  z-index: 10;
  min-width: 80px;
}
.hf-chart-tooltip--flip { transform: translate(-100%, -50%) translateX(-14px); }
.hf-chart-tooltip__label {
  font-family: var(--hf-font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.6;
  margin-bottom: 2px;
}
.hf-chart-tooltip__value {
  font-family: var(--hf-font-display);
  font-size: 18px;
  letter-spacing: -0.01em;
}
.hf-chart-tooltip__sub { font-size: 11px; opacity: 0.7; margin-top: 2px; }
</style>
