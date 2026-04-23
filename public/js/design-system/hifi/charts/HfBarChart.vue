<script setup>
// Column chart with optional accent index, axes, tooltip, ARIA summary.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import HfChartTooltip from './HfChartTooltip.vue'
import { normalize, extent, niceTicks, formatNumber, useResponsiveWidth } from './chart-utils.js'

const props = defineProps({
  data:        { type: Array, required: true },
  height:      { type: Number, default: 160 },
  color:       { type: String, default: 'var(--hf-ink)' },
  accentColor: { type: String, default: 'var(--hf-accent)' },
  accentIndex: { type: Number, default: -1 },
  showAxes:    { type: Boolean, default: true },
  showTooltip: { type: Boolean, default: true },
  yFormat:     { type: Function, default: v => formatNumber(v, { compact: true }) },
  tooltipFormat: { type: Function, default: null },
  title:       { type: String, default: '' },
})

const wrap = ref(null)
const width = ref(320)
const { attach, detach } = useResponsiveWidth(wrap, w => { width.value = w })
onMounted(attach)
onBeforeUnmount(detach)

const points = computed(() => normalize(props.data))
const margin = computed(() => props.showAxes
  ? { top: 8, right: 8, bottom: 24, left: 36 }
  : { top: 4, right: 4, bottom: 4, left: 4 })

const yTicks = computed(() => {
  const [minAuto, maxAuto] = extent(points.value, p => p.y)
  const min = Math.min(0, minAuto)
  return niceTicks(min, maxAuto * 1.05, 4)
})

const geometry = computed(() => {
  const m = margin.value
  const w = Math.max(0, width.value - m.left - m.right)
  const h = Math.max(0, props.height - m.top - m.bottom)
  const n = points.value.length
  const gap = Math.max(2, w * 0.02)
  const bw = n > 0 ? (w - gap * (n - 1)) / n : 0
  const { niceMin, niceMax } = yTicks.value
  const span = (niceMax - niceMin) || 1
  const baseY = m.top + (1 - (0 - niceMin) / span) * h  // y=0 line
  const bars = points.value.map((p, i) => {
    const x = m.left + i * (bw + gap)
    const y = m.top + (1 - (Math.max(p.y, 0) - niceMin) / span) * h
    const barHeight = Math.abs((p.y / span) * h)
    return { x, y, w: bw, h: barHeight, value: p.y, label: p.label, idx: i }
  })
  return { bars, innerW: w, innerH: h, baseY, niceMin, niceMax }
})

const hoverIdx = ref(-1)
function onEnter(i) { hoverIdx.value = i }
function onLeave() { hoverIdx.value = -1 }

const tooltip = computed(() => {
  if (hoverIdx.value < 0) return null
  const b = geometry.value.bars[hoverIdx.value]
  if (!b) return null
  const p = points.value[hoverIdx.value]
  const custom = props.tooltipFormat?.({ point: p, index: hoverIdx.value })
  return {
    x: b.x + b.w / 2,
    y: b.y,
    label: custom?.label ?? p.label,
    value: custom?.value ?? formatNumber(p.y),
    sub:   custom?.sub ?? '',
  }
})

const ariaLabel = computed(() => {
  const pts = points.value
  if (!pts.length) return 'Empty chart'
  const total = pts.reduce((s, p) => s + p.y, 0)
  return `${props.title || 'Bar chart'}: ${pts.length} bars, total ${formatNumber(total)}`
})
</script>

<template>
  <div ref="wrap" class="hf-bar-chart" :style="{ height: `${height}px` }" @pointerleave="onLeave">
    <svg :width="width" :height="height" role="img" :aria-label="ariaLabel">
      <g v-if="showAxes" class="axis">
        <g v-for="t in yTicks.ticks" :key="t">
          <line
            :x1="margin.left" :x2="width - margin.right"
            :y1="margin.top + (1 - (t - geometry.niceMin) / ((geometry.niceMax - geometry.niceMin) || 1)) * geometry.innerH"
            :y2="margin.top + (1 - (t - geometry.niceMin) / ((geometry.niceMax - geometry.niceMin) || 1)) * geometry.innerH"
            stroke="var(--hf-line)" stroke-dasharray="2 3"
          />
          <text
            :x="margin.left - 6"
            :y="margin.top + (1 - (t - geometry.niceMin) / ((geometry.niceMax - geometry.niceMin) || 1)) * geometry.innerH + 3"
            text-anchor="end" class="axis-label"
          >{{ yFormat(t) }}</text>
        </g>
      </g>

      <g>
        <rect
          v-for="b in geometry.bars"
          :key="b.idx"
          :x="b.x" :y="b.y" :width="b.w" :height="b.h"
          rx="1.5"
          :fill="b.idx === accentIndex ? accentColor : color"
          :opacity="hoverIdx < 0 || hoverIdx === b.idx ? 1 : 0.55"
          @pointerenter="onEnter(b.idx)"
          style="transition: opacity 120ms"
        />
      </g>

      <g v-if="showAxes" class="axis">
        <text
          v-for="b in geometry.bars"
          :key="'l'+b.idx"
          v-show="geometry.bars.length <= 14 || b.idx % Math.ceil(geometry.bars.length / 7) === 0 || b.idx === geometry.bars.length - 1"
          :x="b.x + b.w / 2" :y="height - margin.bottom + 14"
          text-anchor="middle" class="axis-label"
        >{{ b.label }}</text>
      </g>
    </svg>

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
.hf-bar-chart { position: relative; width: 100%; }
.hf-bar-chart svg { display: block; width: 100%; }
.axis-label { font-family: var(--hf-font-mono); font-size: 10px; fill: var(--hf-muted); }
</style>
