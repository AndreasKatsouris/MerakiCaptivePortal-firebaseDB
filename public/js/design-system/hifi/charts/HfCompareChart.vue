<script setup>
// Two-series line overlay — "this week vs last week" style. Both series
// share a y-domain. First series renders with optional fill, second on top
// as the accent line. Tooltip shows both values.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import HfChartTooltip from './HfChartTooltip.vue'
import { normalize, extent, smoothPath, niceTicks, formatNumber, useResponsiveWidth } from './chart-utils.js'

const props = defineProps({
  seriesA: { type: Array, required: true },          // primary (ink)
  seriesB: { type: Array, required: true },          // comparison (accent)
  labelA:  { type: String, default: 'Current' },
  labelB:  { type: String, default: 'Previous' },
  colorA:  { type: String, default: 'var(--hf-ink)' },
  colorB:  { type: String, default: 'var(--hf-accent)' },
  height:  { type: Number, default: 180 },
  showAxes:{ type: Boolean, default: true },
  showTooltip:{ type: Boolean, default: true },
  yFormat: { type: Function, default: v => formatNumber(v, { compact: true }) },
  title:   { type: String, default: '' },
})

const wrap = ref(null)
const width = ref(320)
const { attach, detach } = useResponsiveWidth(wrap, w => { width.value = w })
onMounted(attach); onBeforeUnmount(detach)

const a = computed(() => normalize(props.seriesA))
const b = computed(() => normalize(props.seriesB))

const margin = computed(() => props.showAxes
  ? { top: 8, right: 8, bottom: 24, left: 36 }
  : { top: 4, right: 4, bottom: 4, left: 4 })

const yDomain = computed(() => {
  const [minA, maxA] = extent(a.value, p => p.y)
  const [minB, maxB] = extent(b.value, p => p.y)
  return [Math.min(minA, minB), Math.max(maxA, maxB)]
})
const yTicks = computed(() => niceTicks(yDomain.value[0], yDomain.value[1], 4))

const scaled = computed(() => {
  const m = margin.value
  const w = Math.max(0, width.value - m.left - m.right)
  const h = Math.max(0, props.height - m.top - m.bottom)
  const { niceMin, niceMax } = yTicks.value
  const span = (niceMax - niceMin) || 1
  const project = arr => {
    const n = arr.length
    return arr.map((p, i) => [
      m.left + (n === 1 ? w / 2 : (i / (n - 1)) * w),
      m.top + (1 - (p.y - niceMin) / span) * h,
    ])
  }
  return { a: project(a.value), b: project(b.value), innerW: w, innerH: h, niceMin, niceMax }
})

const pathA = computed(() => smoothPath(scaled.value.a))
const pathB = computed(() => smoothPath(scaled.value.b))

const hoverIdx = ref(-1)
function onMove(e) {
  if (!props.showTooltip || !wrap.value) return
  const rect = wrap.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const px = scaled.value.a
  if (!px.length) return
  let best = 0, bestD = Infinity
  for (let i = 0; i < px.length; i++) {
    const d = Math.abs(px[i][0] - x)
    if (d < bestD) { bestD = d; best = i }
  }
  hoverIdx.value = best
}
function onLeave() { hoverIdx.value = -1 }

const tooltip = computed(() => {
  if (hoverIdx.value < 0) return null
  const pa = a.value[hoverIdx.value]
  const pb = b.value[hoverIdx.value]
  const px = scaled.value.a[hoverIdx.value]
  if (!pa || !px) return null
  const delta = pb ? pa.y - pb.y : null
  return {
    x: px[0], y: px[1],
    label: pa.label,
    value: formatNumber(pa.y),
    sub: pb
      ? `${props.labelB} ${formatNumber(pb.y)}  ${delta >= 0 ? '▲' : '▼'} ${formatNumber(Math.abs(delta))}`
      : '',
  }
})

const ariaLabel = computed(() => {
  if (!a.value.length) return 'Empty compare chart'
  const lastA = a.value[a.value.length - 1].y
  const lastB = b.value[b.value.length - 1]?.y
  return `${props.title || 'Comparison'}: ${props.labelA} ${formatNumber(lastA)}${lastB != null ? `, ${props.labelB} ${formatNumber(lastB)}` : ''}`
})
</script>

<template>
  <div ref="wrap" class="hf-compare-chart" :style="{ height: `${height}px` }" @pointermove="onMove" @pointerleave="onLeave">
    <svg :width="width" :height="height" role="img" :aria-label="ariaLabel">
      <g v-if="showAxes" class="axis">
        <g v-for="t in yTicks.ticks" :key="t">
          <line
            :x1="margin.left" :x2="width - margin.right"
            :y1="margin.top + (1 - (t - yTicks.niceMin) / ((yTicks.niceMax - yTicks.niceMin) || 1)) * scaled.innerH"
            :y2="margin.top + (1 - (t - yTicks.niceMin) / ((yTicks.niceMax - yTicks.niceMin) || 1)) * scaled.innerH"
            stroke="var(--hf-line)" stroke-dasharray="2 3"
          />
          <text
            :x="margin.left - 6"
            :y="margin.top + (1 - (t - yTicks.niceMin) / ((yTicks.niceMax - yTicks.niceMin) || 1)) * scaled.innerH + 3"
            text-anchor="end" class="axis-label"
          >{{ yFormat(t) }}</text>
        </g>
      </g>

      <!-- Previous period (dashed) -->
      <path :d="pathB" fill="none" :stroke="colorB" stroke-width="1.4" stroke-dasharray="3 3" stroke-linecap="round" stroke-linejoin="round" opacity="0.8" />
      <!-- Current period (solid) -->
      <path :d="pathA" fill="none" :stroke="colorA" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />

      <g v-if="hoverIdx >= 0 && scaled.a[hoverIdx]" class="hover">
        <line
          :x1="scaled.a[hoverIdx][0]" :x2="scaled.a[hoverIdx][0]"
          :y1="margin.top" :y2="height - margin.bottom"
          stroke="var(--hf-ink)" stroke-opacity="0.2"
        />
        <circle
          :cx="scaled.a[hoverIdx][0]" :cy="scaled.a[hoverIdx][1]"
          r="4" fill="var(--hf-paper)" :stroke="colorA" stroke-width="1.5"
        />
        <circle
          v-if="scaled.b[hoverIdx]"
          :cx="scaled.b[hoverIdx][0]" :cy="scaled.b[hoverIdx][1]"
          r="3" fill="var(--hf-paper)" :stroke="colorB" stroke-width="1.3"
        />
      </g>
    </svg>

    <!-- legend -->
    <div class="legend" v-if="showAxes">
      <span><i :style="{ background: colorA }" /> {{ labelA }}</span>
      <span><i :style="{ background: colorB }" class="dashed" /> {{ labelB }}</span>
    </div>

    <HfChartTooltip
      :visible="!!tooltip"
      :x="tooltip?.x ?? 0" :y="tooltip?.y ?? 0"
      :container-width="width"
      :label="tooltip?.label ?? ''"
      :value="tooltip?.value ?? ''"
      :sub="tooltip?.sub ?? ''"
    />
  </div>
</template>

<style scoped>
.hf-compare-chart { position: relative; width: 100%; }
.hf-compare-chart svg { display: block; width: 100%; }
.axis-label { font-family: var(--hf-font-mono); font-size: 10px; fill: var(--hf-muted); }
.legend {
  position: absolute; top: 0; right: 0;
  display: flex; gap: 14px;
  font-family: var(--hf-font-mono); font-size: 10px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--hf-muted);
}
.legend i { display: inline-block; width: 12px; height: 2px; vertical-align: middle; margin-right: 5px; border-radius: 1px; }
.legend i.dashed { background-image: linear-gradient(to right, currentColor 50%, transparent 50%); background-size: 6px 2px; }
</style>
