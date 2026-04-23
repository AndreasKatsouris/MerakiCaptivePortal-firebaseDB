<script setup>
// Editorial line chart. Smooth Catmull-Rom spline, optional area fill,
// x/y axes, hover tooltip that snaps to nearest data point. Fully
// responsive via ResizeObserver; ARIA-summarised for screen readers.
//
// Advanced features (D3.1):
//  • dashFromIndex — render 0..idx solid, idx..end dashed. Used for
//    "historical vs forecast" splits.
//  • confidenceBand — if points carry {lower, upper}, draw a shaded
//    envelope between them (forecast confidence intervals).
//  • xFormat — custom x-axis tick formatter. Receives (p.x, p.label, index)
//    and may return any string. Dates auto-format to SA DD/MM by default.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import HfChartTooltip from './HfChartTooltip.vue'
import { normalize, extent, smoothPath, niceTicks, formatNumber, formatDateTick, useResponsiveWidth } from './chart-utils.js'

const props = defineProps({
  data:       { type: Array, required: true },
  height:     { type: Number, default: 160 },
  stroke:     { type: String, default: 'var(--hf-ink)' },
  fill:       { type: String, default: null },
  dashed:     { type: Boolean, default: false },
  dashFromIndex:   { type: Number, default: null },       // G2
  confidenceBand:  { type: Boolean, default: false },      // G3 — use lower/upper
  confidenceColor: { type: String, default: 'var(--hf-accent)' },
  showDots:   { type: Boolean, default: false },
  showAxes:   { type: Boolean, default: true },
  showTooltip:{ type: Boolean, default: true },
  yFormat:    { type: Function, default: v => formatNumber(v, { compact: true }) },
  xFormat:    { type: Function, default: null },           // G5 — (x, label, i) => string
  tooltipFormat: { type: Function, default: null },
  title:      { type: String, default: '' },
  minY:       { type: Number, default: null },
  maxY:       { type: Number, default: null },
})

const wrap = ref(null)
const width = ref(320)
const { attach, detach } = useResponsiveWidth(wrap, w => { width.value = w })
onMounted(attach)
onBeforeUnmount(detach)

const margin = computed(() => props.showAxes
  ? { top: 8, right: 8, bottom: 24, left: 36 }
  : { top: 4, right: 4, bottom: 4, left: 4 })

const points = computed(() => normalize(props.data))

const yDomain = computed(() => {
  // Include confidence band extremes in the domain so the envelope fits.
  const pool = []
  for (const p of points.value) {
    pool.push(p.y)
    if (props.confidenceBand) {
      if (p.lower != null) pool.push(p.lower)
      if (p.upper != null) pool.push(p.upper)
    }
  }
  const [minAuto, maxAuto] = extent(pool, v => v)
  const min = props.minY ?? minAuto
  const max = props.maxY ?? maxAuto
  const pad = (max - min) * 0.08 || 1
  return [props.minY ?? min - pad, props.maxY ?? max + pad]
})

const yTicks = computed(() => {
  if (!props.showAxes) return { ticks: [], niceMin: yDomain.value[0], niceMax: yDomain.value[1] }
  return niceTicks(yDomain.value[0], yDomain.value[1], 4)
})

function yToPx(v, yMin, yMax, innerH, topOffset) {
  const span = (yMax - yMin) || 1
  return topOffset + (1 - (v - yMin) / span) * innerH
}

const scaled = computed(() => {
  const m = margin.value
  const w = Math.max(0, width.value - m.left - m.right)
  const h = Math.max(0, props.height - m.top - m.bottom)
  const n = points.value.length
  if (n === 0) return { px: [], upper: [], lower: [], innerW: w, innerH: h }
  const [yMin, yMax] = props.showAxes ? [yTicks.value.niceMin, yTicks.value.niceMax] : yDomain.value
  const px = [], upper = [], lower = []
  for (let i = 0; i < n; i++) {
    const p = points.value[i]
    const x = m.left + (n === 1 ? w / 2 : (i / (n - 1)) * w)
    px.push([x, yToPx(p.y, yMin, yMax, h, m.top)])
    if (props.confidenceBand && p.lower != null && p.upper != null) {
      upper.push([x, yToPx(p.upper, yMin, yMax, h, m.top)])
      lower.push([x, yToPx(p.lower, yMin, yMax, h, m.top)])
    }
  }
  return { px, upper, lower, innerW: w, innerH: h, yMin, yMax }
})

// Split main line into solid + dashed paths if dashFromIndex is set.
const paths = computed(() => {
  const { px } = scaled.value
  if (!px.length) return { solid: '', dashed: '', area: '' }
  const cut = props.dashFromIndex
  let solid = '', dashed = ''
  if (cut != null && cut > 0 && cut < px.length - 1) {
    // Overlap a point so segments visually connect.
    solid  = smoothPath(px.slice(0, cut + 1))
    dashed = smoothPath(px.slice(cut))
  } else {
    if (props.dashed) dashed = smoothPath(px)
    else solid = smoothPath(px)
  }
  const area = (props.fill && px.length > 1)
    ? `${smoothPath(px)} L ${px[px.length - 1][0]} ${margin.value.top + scaled.value.innerH} L ${px[0][0]} ${margin.value.top + scaled.value.innerH} Z`
    : ''
  return { solid, dashed, area }
})

// Confidence envelope path: upper line forward, lower line backward, closed.
const bandPath = computed(() => {
  const { upper, lower } = scaled.value
  if (!upper.length || upper.length !== lower.length) return ''
  const up = smoothPath(upper)
  const down = smoothPath([...lower].reverse())
  // Replace the "M " in the second path with " L " so paths connect.
  return `${up} ${down.replace(/^M /, 'L ')} Z`
})

const gradId = `hf-line-fill-${Math.random().toString(36).slice(2, 9)}`

// Tooltip / hover.
const hoverIdx = ref(-1)
function onMove(e) {
  if (!props.showTooltip || !wrap.value) return
  const rect = wrap.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const { px } = scaled.value
  if (px.length === 0) return
  let best = 0, bestD = Infinity
  for (let i = 0; i < px.length; i++) {
    const d = Math.abs(px[i][0] - x)
    if (d < bestD) { bestD = d; best = i }
  }
  hoverIdx.value = best
}
function onLeave() { hoverIdx.value = -1 }

const tooltip = computed(() => {
  if (hoverIdx.value < 0 || !points.value[hoverIdx.value]) return null
  const p = points.value[hoverIdx.value]
  const px = scaled.value.px[hoverIdx.value]
  const custom = props.tooltipFormat?.({ point: p, index: hoverIdx.value })
  // Default sub: confidence range if present and no custom formatter.
  const defaultSub = !custom && props.confidenceBand && p.lower != null && p.upper != null
    ? `${formatNumber(p.lower, { compact: true })} – ${formatNumber(p.upper, { compact: true })}`
    : ''
  return {
    x: px[0], y: px[1],
    label: custom?.label ?? formatTick(p, hoverIdx.value),
    value: custom?.value ?? formatNumber(p.y),
    sub:   custom?.sub ?? defaultSub,
  }
})

// Resolve an x-axis tick's visible text.
function formatTick(p, i) {
  if (props.xFormat) return props.xFormat(p.x, p.label, i)
  const d = formatDateTick(p.x)
  return d ?? p.label
}

const ariaLabel = computed(() => {
  const pts = points.value
  if (pts.length === 0) return 'Empty chart'
  const first = pts[0], last = pts[pts.length - 1]
  const change = last.y - first.y
  const pct = first.y !== 0 ? (change / first.y * 100).toFixed(1) : '0'
  return `${props.title || 'Line chart'}: ${pts.length} points from ${formatNumber(first.y)} to ${formatNumber(last.y)} (${change >= 0 ? '+' : ''}${pct}%)`
})
</script>

<template>
  <div ref="wrap" class="hf-line-chart" :style="{ height: `${height}px` }" @pointermove="onMove" @pointerleave="onLeave">
    <svg :width="width" :height="height" role="img" :aria-label="ariaLabel">
      <defs v-if="fill">
        <linearGradient :id="gradId" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" :stop-color="fill" stop-opacity="0.35" />
          <stop offset="1" :stop-color="fill" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- y-axis grid + labels -->
      <g v-if="showAxes" class="axis">
        <g v-for="t in yTicks.ticks" :key="t">
          <line
            :x1="margin.left" :x2="width - margin.right"
            :y1="margin.top + (1 - (t - scaled.yMin) / ((scaled.yMax - scaled.yMin) || 1)) * scaled.innerH"
            :y2="margin.top + (1 - (t - scaled.yMin) / ((scaled.yMax - scaled.yMin) || 1)) * scaled.innerH"
            stroke="var(--hf-line)" stroke-dasharray="2 3"
          />
          <text
            :x="margin.left - 6"
            :y="margin.top + (1 - (t - scaled.yMin) / ((scaled.yMax - scaled.yMin) || 1)) * scaled.innerH + 3"
            text-anchor="end" class="axis-label"
          >{{ yFormat(t) }}</text>
        </g>
      </g>

      <!-- x-axis labels (auto-thinned) -->
      <g v-if="showAxes" class="axis">
        <text
          v-for="(p, i) in points"
          :key="i"
          v-show="points.length <= 12 || i % Math.ceil(points.length / 6) === 0 || i === points.length - 1"
          :x="scaled.px[i]?.[0]"
          :y="height - margin.bottom + 14"
          text-anchor="middle" class="axis-label"
        >{{ formatTick(p, i) }}</text>
      </g>

      <!-- Confidence band (behind everything) -->
      <path v-if="confidenceBand && bandPath" :d="bandPath" :fill="confidenceColor" fill-opacity="0.14" stroke="none" />

      <!-- Area fill under main line -->
      <path v-if="fill" :d="paths.area" :fill="`url(#${gradId})`" />

      <!-- Main line — solid segment -->
      <path
        v-if="paths.solid"
        :d="paths.solid" fill="none" :stroke="stroke" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"
      />
      <!-- Main line — dashed segment -->
      <path
        v-if="paths.dashed"
        :d="paths.dashed" fill="none" :stroke="stroke" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 4"
      />

      <!-- Dot at dashFromIndex boundary so the transition feels intentional -->
      <circle
        v-if="dashFromIndex != null && scaled.px[dashFromIndex]"
        :cx="scaled.px[dashFromIndex][0]" :cy="scaled.px[dashFromIndex][1]"
        r="3" fill="var(--hf-paper)" :stroke="stroke" stroke-width="1.5"
      />

      <!-- Static dots -->
      <circle
        v-for="(p, i) in (showDots ? scaled.px : [])"
        :key="i" :cx="p[0]" :cy="p[1]" r="2.25" :fill="stroke"
      />

      <!-- Hover indicator -->
      <g v-if="hoverIdx >= 0 && scaled.px[hoverIdx]" class="hover">
        <line
          :x1="scaled.px[hoverIdx][0]" :x2="scaled.px[hoverIdx][0]"
          :y1="margin.top" :y2="height - margin.bottom"
          stroke="var(--hf-ink)" stroke-opacity="0.2"
        />
        <circle
          :cx="scaled.px[hoverIdx][0]" :cy="scaled.px[hoverIdx][1]"
          r="4" fill="var(--hf-paper)" :stroke="stroke" stroke-width="1.5"
        />
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
.hf-line-chart { position: relative; width: 100%; }
.hf-line-chart svg { display: block; width: 100%; }
.axis-label { font-family: var(--hf-font-mono); font-size: 10px; fill: var(--hf-muted); }
</style>
