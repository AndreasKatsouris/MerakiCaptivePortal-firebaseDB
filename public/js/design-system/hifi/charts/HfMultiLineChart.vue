<script setup>
// N-series line chart with interactive legend toggles + shared tooltip.
//
// Series shape:
//   { name, data: [{x, y, label?}|number, ...], color?, dashed? }
//
// All series are expected to share the same x-axis index space (they are
// aligned positionally). The shared tooltip shows every visible series'
// value at the hovered x index.
import { ref, computed, onMounted, onBeforeUnmount, reactive } from 'vue'
import { normalize, extent, smoothPath, niceTicks, formatNumber, formatDateTick, useResponsiveWidth } from './chart-utils.js'

const props = defineProps({
  series:      { type: Array, required: true },
  height:      { type: Number, default: 220 },
  showAxes:    { type: Boolean, default: true },
  showLegend:  { type: Boolean, default: true },
  showTooltip: { type: Boolean, default: true },
  yFormat:     { type: Function, default: v => formatNumber(v, { compact: true }) },
  xFormat:     { type: Function, default: null },
  title:       { type: String, default: '' },
})

const palette = ['var(--hf-ink)','var(--hf-accent)','var(--hf-good)','var(--hf-warn)','var(--hf-gold)','var(--hf-ink-2)']

const wrap = ref(null)
const width = ref(360)
const { attach, detach } = useResponsiveWidth(wrap, w => { width.value = w })
onMounted(attach); onBeforeUnmount(detach)

// Per-series visibility — legend toggles mutate this.
const visible = reactive({})
props.series.forEach((s, i) => { visible[s.name ?? `series-${i}`] = true })
function toggle(key) { visible[key] = !visible[key] }

const seriesNorm = computed(() =>
  props.series.map((s, i) => ({
    key: s.name ?? `series-${i}`,
    name: s.name ?? `Series ${i + 1}`,
    data: normalize(s.data),
    color: s.color || palette[i % palette.length],
    dashed: !!s.dashed,
  }))
)

const activeSeries = computed(() => seriesNorm.value.filter(s => visible[s.key]))

const margin = computed(() => props.showAxes
  ? { top: 10, right: 12, bottom: 26, left: 40 }
  : { top: 4, right: 4, bottom: 4, left: 4 })

const yDomain = computed(() => {
  const pool = []
  for (const s of activeSeries.value) for (const p of s.data) pool.push(p.y)
  if (pool.length === 0) return [0, 1]
  const [minAuto, maxAuto] = extent(pool, v => v)
  const pad = (maxAuto - minAuto) * 0.08 || 1
  return [minAuto - pad, maxAuto + pad]
})

const yTicks = computed(() => {
  if (!props.showAxes) return { ticks: [], niceMin: yDomain.value[0], niceMax: yDomain.value[1] }
  return niceTicks(yDomain.value[0], yDomain.value[1], 4)
})

// Longest series defines the x-index space.
const xCount = computed(() => {
  let n = 0
  for (const s of seriesNorm.value) if (s.data.length > n) n = s.data.length
  return n
})

const geometry = computed(() => {
  const m = margin.value
  const w = Math.max(0, width.value - m.left - m.right)
  const h = Math.max(0, props.height - m.top - m.bottom)
  const { niceMin, niceMax } = yTicks.value
  const span = (niceMax - niceMin) || 1
  const n = xCount.value
  const xs = []
  for (let i = 0; i < n; i++) {
    xs.push(m.left + (n === 1 ? w / 2 : (i / (n - 1)) * w))
  }
  // per-series px arrays
  const pxBySeries = seriesNorm.value.map(s => s.data.map((p, i) => [
    xs[i], m.top + (1 - (p.y - niceMin) / span) * h,
  ]))
  return { xs, pxBySeries, innerW: w, innerH: h, niceMin, niceMax }
})

const paths = computed(() =>
  seriesNorm.value.map((s, i) => smoothPath(geometry.value.pxBySeries[i]))
)

const hoverIdx = ref(-1)
function onMove(e) {
  if (!props.showTooltip || !wrap.value) return
  const rect = wrap.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const xs = geometry.value.xs
  if (!xs.length) return
  let best = 0, bestD = Infinity
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i] - x)
    if (d < bestD) { bestD = d; best = i }
  }
  hoverIdx.value = best
}
function onLeave() { hoverIdx.value = -1 }

// First visible series drives the x-label resolution.
function tickLabel(i) {
  const first = seriesNorm.value[0]
  const p = first?.data?.[i]
  if (!p) return ''
  if (props.xFormat) return props.xFormat(p.x, p.label, i)
  return formatDateTick(p.x) ?? p.label
}

const hoverRows = computed(() => {
  if (hoverIdx.value < 0) return []
  return activeSeries.value.map(s => {
    const p = s.data[hoverIdx.value]
    return p ? { name: s.name, color: s.color, value: formatNumber(p.y) } : null
  }).filter(Boolean)
})
const hoverLabel = computed(() => tickLabel(hoverIdx.value))
const hoverX = computed(() => geometry.value.xs[hoverIdx.value] ?? 0)

const ariaLabel = computed(() => {
  const names = seriesNorm.value.map(s => s.name).join(', ')
  return `${props.title || 'Multi-line chart'}: ${seriesNorm.value.length} series — ${names}`
})
</script>

<template>
  <div class="hf-multi-line" ref="wrap">
    <ul v-if="showLegend" class="hf-multi-line__legend">
      <li v-for="s in seriesNorm" :key="s.key"
          :class="{ 'is-off': !visible[s.key] }"
          @click="toggle(s.key)"
          role="button" tabindex="0"
          @keydown.enter.prevent="toggle(s.key)"
          @keydown.space.prevent="toggle(s.key)"
          :aria-pressed="visible[s.key]"
          :title="visible[s.key] ? `Click to hide ${s.name}` : `Click to show ${s.name}`"
      >
        <span class="hf-multi-line__swatch" :style="{ background: s.color, borderStyle: s.dashed ? 'dashed' : 'solid' }" />
        <span>{{ s.name }}</span>
      </li>
    </ul>

    <div class="hf-multi-line__chart" :style="{ height: `${height}px` }" @pointermove="onMove" @pointerleave="onLeave">
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

        <g v-if="showAxes" class="axis">
          <text
            v-for="(_, i) in Array(xCount)" :key="i"
            v-show="xCount <= 12 || i % Math.ceil(xCount / 6) === 0 || i === xCount - 1"
            :x="geometry.xs[i]" :y="height - margin.bottom + 14"
            text-anchor="middle" class="axis-label"
          >{{ tickLabel(i) }}</text>
        </g>

        <!-- Series -->
        <path
          v-for="(s, i) in seriesNorm" :key="s.key"
          v-show="visible[s.key]"
          :d="paths[i]" fill="none" :stroke="s.color" stroke-width="1.6"
          stroke-linecap="round" stroke-linejoin="round"
          :stroke-dasharray="s.dashed ? '4 4' : undefined"
        />

        <!-- Hover line + per-series dots -->
        <g v-if="hoverIdx >= 0 && geometry.xs[hoverIdx] != null">
          <line
            :x1="geometry.xs[hoverIdx]" :x2="geometry.xs[hoverIdx]"
            :y1="margin.top" :y2="height - margin.bottom"
            stroke="var(--hf-ink)" stroke-opacity="0.2"
          />
          <template v-for="(s, i) in seriesNorm" :key="'dot'+s.key">
            <circle
              v-if="visible[s.key] && geometry.pxBySeries[i][hoverIdx]"
              :cx="geometry.pxBySeries[i][hoverIdx][0]"
              :cy="geometry.pxBySeries[i][hoverIdx][1]"
              r="4" fill="var(--hf-paper)" :stroke="s.color" stroke-width="1.5"
            />
          </template>
        </g>
      </svg>

      <!-- Shared multi-row tooltip -->
      <div
        v-if="showTooltip && hoverIdx >= 0 && hoverRows.length"
        class="hf-multi-tooltip"
        :class="{ 'is-flip': hoverX > width - 140 }"
        :style="{ left: `${hoverX}px`, top: `${margin.top + 6}px` }"
      >
        <div class="hf-multi-tooltip__label">{{ hoverLabel }}</div>
        <div v-for="r in hoverRows" :key="r.name" class="hf-multi-tooltip__row">
          <span class="hf-multi-tooltip__swatch" :style="{ background: r.color }" />
          <span class="hf-multi-tooltip__name">{{ r.name }}</span>
          <span class="hf-multi-tooltip__value hf-mono">{{ r.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hf-multi-line { width: 100%; }
.hf-multi-line__chart { position: relative; width: 100%; }
.hf-multi-line__chart svg { display: block; width: 100%; }
.axis-label { font-family: var(--hf-font-mono); font-size: 10px; fill: var(--hf-muted); }

.hf-multi-line__legend {
  list-style: none; margin: 0 0 10px; padding: 0;
  display: flex; flex-wrap: wrap; gap: 4px 14px;
  font-family: var(--hf-font-body); font-size: 12px;
  color: var(--hf-ink-2);
}
.hf-multi-line__legend li {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 8px;
  border-radius: var(--hf-radius-sm);
  cursor: pointer;
  user-select: none;
  transition: opacity 120ms, background 120ms;
}
.hf-multi-line__legend li:hover { background: var(--hf-bg); }
.hf-multi-line__legend li:focus-visible { outline: 2px solid var(--hf-accent); outline-offset: 1px; }
.hf-multi-line__legend li.is-off { opacity: 0.4; text-decoration: line-through; }
.hf-multi-line__swatch {
  width: 14px; height: 0; border-top: 2px;
  border-color: currentColor; display: inline-block;
}
/* Swatch rendered as a border slice so dashed/solid reads as a line sample. */
.hf-multi-line__swatch { height: 2px; border: none; border-radius: 1px; }

.hf-multi-tooltip {
  position: absolute;
  transform: translate(8px, 0);
  background: var(--hf-ink);
  color: var(--hf-bg);
  border-radius: var(--hf-radius);
  padding: 8px 10px;
  font-family: var(--hf-font-body);
  font-size: 12px;
  min-width: 140px;
  box-shadow: var(--hf-shadow-3);
  pointer-events: none;
  z-index: 10;
}
.hf-multi-tooltip.is-flip { transform: translate(-100%, 0) translateX(-8px); }
.hf-multi-tooltip__label {
  font-family: var(--hf-font-mono); font-size: 10px;
  letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.6;
  margin-bottom: 4px;
}
.hf-multi-tooltip__row {
  display: grid; grid-template-columns: 10px 1fr auto;
  align-items: center; gap: 8px;
  padding: 1px 0;
}
.hf-multi-tooltip__swatch { width: 10px; height: 2px; border-radius: 1px; }
.hf-multi-tooltip__name { opacity: 0.85; }
.hf-multi-tooltip__value { font-family: var(--hf-font-mono); }
</style>
