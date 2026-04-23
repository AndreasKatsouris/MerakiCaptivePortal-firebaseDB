<script setup>
// Multi-segment pie / donut chart with legend and hover tooltip.
//
// Data: [{ label, value, color? }, ...]
// Pass `hollow > 0` for donut appearance; center slot can render totals.
import { ref, computed } from 'vue'
import HfChartTooltip from './HfChartTooltip.vue'
import { formatNumber } from './chart-utils.js'

const props = defineProps({
  data:        { type: Array, required: true },
  size:        { type: Number, default: 160 },
  hollow:      { type: Number, default: 0.55 },   // 0..1; 0 = pie, 0.55 = donut
  showLegend:  { type: Boolean, default: true },
  legendPosition: { type: String, default: 'right', validator: v => ['right','bottom'].includes(v) },
  showTooltip: { type: Boolean, default: true },
  valueFormat: { type: Function, default: v => formatNumber(v) },
  title:       { type: String, default: '' },
})

// Default palette — cycles through HIFI semantic colors, not rainbow garbage.
const palette = [
  'var(--hf-ink)',
  'var(--hf-accent)',
  'var(--hf-good)',
  'var(--hf-warn)',
  'var(--hf-gold)',
  'var(--hf-accent-2)',
  'var(--hf-ink-2)',
  'var(--hf-muted)',
]

const total = computed(() => props.data.reduce((s, d) => s + Math.max(0, +d.value || 0), 0))

const slices = computed(() => {
  const t = total.value || 1
  let running = 0
  return props.data.map((d, i) => {
    const value = Math.max(0, +d.value || 0)
    const frac = value / t
    const start = running
    const end = running + frac
    running = end
    return {
      label: d.label,
      value,
      frac,
      color: d.color || palette[i % palette.length],
      startAngle: start * Math.PI * 2 - Math.PI / 2,
      endAngle: end * Math.PI * 2 - Math.PI / 2,
    }
  })
})

// Build an SVG `d` attr for a pie slice / donut ring wedge.
function slicePath(s) {
  const cx = 50, cy = 50
  const rOuter = 50
  const rInner = props.hollow > 0 ? 50 * props.hollow : 0
  const { startAngle, endAngle, frac } = s
  if (frac <= 0) return ''
  if (frac >= 1) {
    // Full circle — SVG arcs can't draw 360°; fake it with two half-arcs.
    if (rInner > 0) {
      return `M ${cx - rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 1 ${cx + rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 1 ${cx - rOuter} ${cy} Z
              M ${cx - rInner} ${cy} A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy} A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy} Z`
    }
    return `M ${cx - rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 1 ${cx + rOuter} ${cy} A ${rOuter} ${rOuter} 0 1 1 ${cx - rOuter} ${cy} Z`
  }
  const large = (endAngle - startAngle) > Math.PI ? 1 : 0
  const x1 = cx + Math.cos(startAngle) * rOuter
  const y1 = cy + Math.sin(startAngle) * rOuter
  const x2 = cx + Math.cos(endAngle) * rOuter
  const y2 = cy + Math.sin(endAngle) * rOuter
  if (rInner > 0) {
    const x3 = cx + Math.cos(endAngle) * rInner
    const y3 = cy + Math.sin(endAngle) * rInner
    const x4 = cx + Math.cos(startAngle) * rInner
    const y4 = cy + Math.sin(startAngle) * rInner
    return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`
  }
  return `M ${cx} ${cy} L ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} Z`
}

const hoverIdx = ref(-1)
const wrapEl = ref(null)

function onHover(i, e) {
  hoverIdx.value = i
}
function onLeave() { hoverIdx.value = -1 }

// Tooltip position: midpoint of the slice at radius 0.8.
const tooltip = computed(() => {
  if (hoverIdx.value < 0) return null
  const s = slices.value[hoverIdx.value]
  if (!s) return null
  const mid = (s.startAngle + s.endAngle) / 2
  const r = 50 * (props.hollow > 0 ? (1 + props.hollow) / 2 : 0.7)
  // Convert 0..100 SVG viewBox coords to px within the rendered SVG.
  const cx = Math.cos(mid) * r + 50
  const cy = Math.sin(mid) * r + 50
  return {
    x: (cx / 100) * props.size,
    y: (cy / 100) * props.size,
    label: s.label,
    value: props.valueFormat(s.value),
    sub: `${(s.frac * 100).toFixed(1)}%`,
  }
})

const ariaLabel = computed(() => {
  const bits = slices.value.map(s => `${s.label} ${(s.frac * 100).toFixed(0)}%`).join(', ')
  return `${props.title || 'Pie chart'}: ${bits}`
})
</script>

<template>
  <div class="hf-pie" :class="[`hf-pie--legend-${legendPosition}`]" ref="wrapEl">
    <div class="hf-pie__chart" :style="{ width: `${size}px`, height: `${size}px`, flexShrink: 0 }" @pointerleave="onLeave">
      <svg :width="size" :height="size" viewBox="0 0 100 100" role="img" :aria-label="ariaLabel">
        <path
          v-for="(s, i) in slices" :key="i"
          :d="slicePath(s)"
          :fill="s.color"
          :opacity="hoverIdx < 0 || hoverIdx === i ? 1 : 0.55"
          style="transition: opacity 120ms"
          @pointerenter="onHover(i, $event)"
        />
      </svg>
      <div v-if="$slots.center" class="hf-pie__center"><slot name="center" /></div>
      <HfChartTooltip
        :visible="showTooltip && !!tooltip"
        :x="tooltip?.x ?? 0" :y="tooltip?.y ?? 0"
        :container-width="size"
        :label="tooltip?.label ?? ''"
        :value="tooltip?.value ?? ''"
        :sub="tooltip?.sub ?? ''"
      />
    </div>

    <ul v-if="showLegend" class="hf-pie__legend">
      <li v-for="(s, i) in slices" :key="i"
        @pointerenter="onHover(i)"
        @pointerleave="onLeave"
        :class="{ 'is-active': hoverIdx === i }"
      >
        <span class="hf-pie__swatch" :style="{ background: s.color }" />
        <span class="hf-pie__label">{{ s.label }}</span>
        <span class="hf-pie__value hf-mono">{{ valueFormat(s.value) }}</span>
        <span class="hf-pie__pct hf-mono">{{ (s.frac * 100).toFixed(1) }}%</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.hf-pie { display: flex; align-items: center; gap: 24px; }
.hf-pie--legend-bottom { flex-direction: column; align-items: stretch; }
.hf-pie__chart { position: relative; }
.hf-pie__chart svg { display: block; width: 100%; height: 100%; }
.hf-pie__center {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  pointer-events: none;
}
.hf-pie__legend {
  list-style: none;
  margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 6px;
  font-family: var(--hf-font-body);
  font-size: 12px;
  min-width: 0;
  flex: 1;
}
.hf-pie__legend li {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 4px 6px;
  border-radius: var(--hf-radius-sm);
  color: var(--hf-ink-2);
  cursor: default;
  transition: background 120ms;
}
.hf-pie__legend li:hover, .hf-pie__legend li.is-active { background: var(--hf-bg); }
.hf-pie__swatch { width: 10px; height: 10px; border-radius: 2px; }
.hf-pie__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-pie__value { color: var(--hf-ink); font-size: 11px; }
.hf-pie__pct { color: var(--hf-muted); font-size: 10px; min-width: 38px; text-align: right; }
</style>
