<script setup>
// Mini sparkline — no axes, no tooltip, no labels. For dashboard tiles
// and inline "vibe" visuals. ARIA summary only.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { normalize, extent, smoothPath, formatNumber, useResponsiveWidth } from './chart-utils.js'

const props = defineProps({
  data:    { type: Array, required: true },
  height:  { type: Number, default: 24 },
  stroke:  { type: String, default: 'var(--hf-ink)' },
  strokeWidth: { type: Number, default: 1.4 },
  fill:    { type: String, default: null },
  title:   { type: String, default: '' },
})

const wrap = ref(null)
const width = ref(120)
const { attach, detach } = useResponsiveWidth(wrap, w => { width.value = w })
onMounted(attach); onBeforeUnmount(detach)

const points = computed(() => normalize(props.data))

const path = computed(() => {
  const pts = points.value
  if (pts.length === 0) return { line: '', area: '' }
  const [yMin, yMax] = extent(pts, p => p.y)
  const span = (yMax - yMin) || 1
  const pad = props.strokeWidth
  const h = props.height - pad * 2
  const w = width.value
  const n = pts.length
  const px = pts.map((p, i) => [
    n === 1 ? w / 2 : (i / (n - 1)) * w,
    pad + (1 - (p.y - yMin) / span) * h,
  ])
  const line = smoothPath(px)
  const area = props.fill && px.length > 1
    ? `${line} L ${px[px.length - 1][0]} ${props.height} L ${px[0][0]} ${props.height} Z`
    : ''
  return { line, area }
})

const gradId = `hf-spark-${Math.random().toString(36).slice(2, 9)}`

const ariaLabel = computed(() => {
  const pts = points.value
  if (!pts.length) return 'Empty'
  const first = pts[0].y, last = pts[pts.length - 1].y
  const change = last - first
  return `${props.title || 'Sparkline'}: ${formatNumber(first)} to ${formatNumber(last)} (${change >= 0 ? '+' : ''}${formatNumber(change)})`
})
</script>

<template>
  <div ref="wrap" class="hf-sparkline" :style="{ height: `${height}px` }">
    <svg :width="width" :height="height" role="img" :aria-label="ariaLabel">
      <defs v-if="fill">
        <linearGradient :id="gradId" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" :stop-color="fill" stop-opacity="0.35" />
          <stop offset="1" :stop-color="fill" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path v-if="path.area" :d="path.area" :fill="`url(#${gradId})`" />
      <path :d="path.line" fill="none" :stroke="stroke" :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </div>
</template>

<style scoped>
.hf-sparkline { width: 100%; }
.hf-sparkline svg { display: block; width: 100%; }
</style>
