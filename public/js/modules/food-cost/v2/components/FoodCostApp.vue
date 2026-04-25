<script setup>
// Food Cost — operator cockpit.
// Layout: 220px sidebar + main. Main: header + margin leak callout,
// 4 KPI tiles, Ross diagnosis (dark hero with split-line chart),
// menu cost-drift table, stock runway + 7-day waste log bottom row.
import { onMounted, computed } from 'vue'
import { useFoodCostStore } from '../store.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfLogo, HfNavItem,
  HfSparkline, HfLineChart, HfBarChart,
} from '/js/design-system/hifi/index.js'
import { zar } from '../content.js'

const store = useFoodCostStore()
onMounted(() => { if (!store.data) store.load() })

const data = computed(() => store.data)
const filteredMenu = computed(() => store.filteredMenu)

const nav = [
  { label: 'ROSS v2',    icon: 'bolt',    href: '/ross.html' },
  { label: 'Overview',   icon: 'chart',   href: '/group-overview-v2.html' },
  { label: 'Guests',     icon: 'users',   href: '/guest-management.html' },
  { label: 'Queue',      icon: 'clock',   href: '/queue-management.html' },
  { label: 'Analytics',  icon: 'line',    href: '/analytics.html' },
  { label: 'Food cost',  icon: 'leaf',    active: true },
  { label: 'Campaigns',  icon: 'send',    href: '/campaigns.html' },
  { label: 'Settings',   icon: 'gear',    href: '/admin-dashboard.html' },
]

const tones = { good: 'var(--hf-good)', warn: 'var(--hf-warn)', accent: 'var(--hf-accent)', default: 'var(--hf-ink)' }

function driftClass(drift) {
  if (drift < -1.5) return 'is-bad'
  if (drift > 0)    return 'is-good'
  return ''
}
function formatDrift(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + 'pp' }
function toneForDrift(d) { return d < -1.5 ? tones.warn : d > 0 ? tones.good : tones.default }

function barWidth(days) {
  return Math.min((days / data.value.stock.maxDays) * 100, 100)
}
</script>

<template>
  <div class="food-cost" v-if="data">
    <aside class="food-cost__sidebar">
      <HfLogo :size="20" />
      <div class="food-cost__nav">
        <HfNavItem v-for="n in nav" :key="n.label"
          :label="n.label" :icon="n.icon" :href="n.href" :active="!!n.active" />
      </div>
    </aside>

    <main class="food-cost__main">
      <!-- Header -->
      <header class="food-cost__header">
        <div>
          <div class="hf-eyebrow">Food cost · {{ data.header.venue }} · {{ data.header.rangeLabel }}</div>
          <h1 class="food-cost__title">
            {{ data.header.headlineLead }}
            <span class="food-cost__title-accent">{{ data.header.headlineAccent }}</span>
          </h1>
        </div>
        <div class="food-cost__actions">
          <HfChip><template #leading><HfIcon name="cal" :size="12" /></template>Last 30 days</HfChip>
          <HfButton variant="ghost" size="sm">Export</HfButton>
          <HfButton size="sm">
            <template #leading><HfIcon name="sparkle" :size="13" /></template>
            Ask Ross
          </HfButton>
        </div>
      </header>

      <!-- KPIs -->
      <div class="food-cost__kpis">
        <HfCard v-for="k in data.kpis" :key="k.key" :padded="false" class="food-cost__kpi">
          <div class="hf-eyebrow">{{ k.label }}</div>
          <div class="food-cost__kpi-value hf-num" :class="{ 'is-warn': k.warn }">{{ k.value }}</div>
          <div class="hf-mono food-cost__kpi-meta" :class="{ 'is-warn': k.warn }">
            {{ k.delta }} · {{ k.meta }}
          </div>
          <div class="food-cost__kpi-spark">
            <HfSparkline :data="k.trend" :height="28"
              :stroke="k.warn ? tones.warn : tones.default"
              :fill="k.warn ? tones.warn : tones.default" />
          </div>
        </HfCard>
      </div>

      <!-- Ross diagnosis -->
      <section class="food-cost__diagnosis">
        <div class="hf-grain" />
        <div class="food-cost__diagnosis-body">
          <div>
            <div class="hf-eyebrow food-cost__diagnosis-eyebrow">
              <HfIcon name="sparkle" :size="11" color="var(--hf-accent)" />
              {{ data.diagnosis.eyebrow }}
            </div>
            <h3 class="food-cost__diagnosis-headline">{{ data.diagnosis.headline }}</h3>
            <p class="food-cost__diagnosis-detail" v-html="data.diagnosis.detail" />
            <div class="food-cost__diagnosis-actions">
              <HfButton
                v-for="a in data.diagnosis.actions" :key="a.id"
                :variant="a.variant" size="sm"
              >{{ a.label }}</HfButton>
            </div>
          </div>
          <div class="food-cost__diagnosis-chart">
            <div class="hf-eyebrow food-cost__diagnosis-chart-eyebrow">{{ data.diagnosis.chart.title }}</div>
            <HfLineChart
              :data="data.diagnosis.chart.series"
              :height="140"
              stroke="var(--hf-accent)"
              fill="var(--hf-accent)"
              :dash-from-index="data.diagnosis.chart.dashFromIndex"
              :show-axes="false"
              :show-tooltip="false"
              title="Weekly margin impact"
            />
            <div class="hf-mono food-cost__diagnosis-chart-caption">{{ data.diagnosis.chart.caption }}</div>
          </div>
        </div>
      </section>

      <!-- Menu drift table -->
      <HfCard :padded="false" class="food-cost__menu">
        <div class="food-cost__menu-head">
          <h3 class="food-cost__panel-title">Menu · cost drift</h3>
          <div class="food-cost__menu-filters">
            <button
              v-for="f in data.menu.filters" :key="f.id"
              :class="['food-cost__filter', { 'is-active': store.filter === f.id }]"
              @click="store.setFilter(f.id)"
              :aria-pressed="store.filter === f.id"
            >{{ f.label }}</button>
          </div>
        </div>
        <div class="food-cost__table-wrap">
          <table class="food-cost__table">
            <thead>
              <tr>
                <th class="hf-eyebrow">Item</th>
                <th class="hf-eyebrow">Category</th>
                <th class="hf-eyebrow">Plate cost</th>
                <th class="hf-eyebrow">Price</th>
                <th class="hf-eyebrow">Margin</th>
                <th class="hf-eyebrow">Drift 30d</th>
                <th class="hf-eyebrow">Volume</th>
                <th class="hf-eyebrow">Ross</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in filteredMenu" :key="r.item">
                <td class="food-cost__td-name">{{ r.item }}</td>
                <td class="food-cost__td-muted">{{ r.category }}</td>
                <td class="food-cost__td-mono">{{ zar(r.plateCost) }}</td>
                <td class="food-cost__td-mono">{{ zar(r.price) }}</td>
                <td class="food-cost__td-mono">{{ r.margin.toFixed(1) }}%</td>
                <td class="food-cost__td-mono" :style="{ color: toneForDrift(r.drift) }">
                  {{ formatDrift(r.drift) }}
                </td>
                <td class="food-cost__td-mono food-cost__td-muted">{{ r.volume }}</td>
                <td>
                  <span v-if="r.rossAction" class="food-cost__ross-tag">
                    <HfIcon name="sparkle" :size="11" color="var(--hf-accent-2)" />
                    {{ r.rossAction }}
                  </span>
                  <span v-else class="food-cost__td-muted">—</span>
                </td>
              </tr>
              <tr v-if="filteredMenu.length === 0">
                <td colspan="8" class="food-cost__empty">No items match this filter.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </HfCard>

      <!-- Stock runway + waste log -->
      <div class="food-cost__row-2">
        <HfCard :padded="false" class="food-cost__panel">
          <h3 class="food-cost__panel-title food-cost__panel-title--sm">Stock runway</h3>
          <div class="hf-mono food-cost__panel-sub">Days until reorder needed</div>
          <ul class="food-cost__stock">
            <li v-for="s in data.stock.rows" :key="s.item">
              <div class="food-cost__stock-name">{{ s.item }}</div>
              <div class="food-cost__stock-bar">
                <div class="food-cost__stock-bar-fill" :style="{ width: `${barWidth(s.daysLeft)}%`, background: tones[s.tone] }" />
              </div>
              <div class="hf-num food-cost__stock-days" :style="{ color: tones[s.tone] }">{{ s.daysLeft }}d</div>
            </li>
          </ul>
        </HfCard>

        <HfCard :padded="false" class="food-cost__panel">
          <h3 class="food-cost__panel-title food-cost__panel-title--sm">Waste log · 7 days</h3>
          <div class="hf-mono food-cost__panel-sub">By day · R cost</div>
          <HfBarChart
            :data="data.waste" :height="120"
            :accent-index="data.waste.findIndex(d => d.accent)"
            :yFormat="v => 'R' + (v >= 1000 ? (v/1000).toFixed(1) + 'k' : v)"
            title="Waste log 7-day"
          />
        </HfCard>
      </div>
    </main>
  </div>

  <div v-else class="food-cost__loading"><div class="hf-eyebrow">Loading…</div></div>
</template>

<style scoped>
.food-cost {
  width: 100%; min-height: 100vh;
  display: grid; grid-template-columns: 220px 1fr;
  background: var(--hf-bg);
}
.food-cost__sidebar {
  background: var(--hf-bg2);
  border-right: 1px solid var(--hf-line);
  padding: 20px 16px;
}
.food-cost__nav { margin-top: 20px; display: flex; flex-direction: column; gap: 2px; }

.food-cost__main { padding: 28px 36px 48px; min-width: 0; }

.food-cost__header {
  display: flex; justify-content: space-between; align-items: flex-end;
  gap: 16px; flex-wrap: wrap;
}
.food-cost__title {
  font-family: var(--hf-font-display);
  font-size: 40px; letter-spacing: -0.015em;
  margin: 4px 0 0; font-weight: 400;
}
.food-cost__title-accent { font-style: italic; color: var(--hf-warn); }
.food-cost__actions { display: flex; gap: 8px; align-items: center; }

.food-cost__kpis {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 14px; margin-top: 24px;
}
@media (max-width: 960px) { .food-cost__kpis { grid-template-columns: repeat(2, 1fr); } }
.food-cost__kpi { padding: 16px; }
.food-cost__kpi-value { font-size: 30px; line-height: 1; margin: 4px 0 2px; }
.food-cost__kpi-value.is-warn { color: var(--hf-warn); }
.food-cost__kpi-meta { font-size: 11px; color: var(--hf-good); }
.food-cost__kpi-meta.is-warn { color: var(--hf-warn); }
.food-cost__kpi-spark { margin-top: 10px; }

/* Ross diagnosis */
.food-cost__diagnosis {
  background: var(--hf-ink);
  color: var(--hf-bg);
  margin-top: 14px;
  border-radius: var(--hf-radius-md);
  position: relative; overflow: hidden;
}
.food-cost__diagnosis-body {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 32px; padding: 24px;
  position: relative; z-index: 1;
}
@media (max-width: 960px) { .food-cost__diagnosis-body { grid-template-columns: 1fr; } }
.food-cost__diagnosis-eyebrow { color: var(--hf-accent); display: flex; align-items: center; gap: 6px; }
.food-cost__diagnosis-headline {
  font-family: var(--hf-font-display);
  font-size: 28px; line-height: 1.2;
  margin: 8px 0 6px; font-weight: 400;
  color: var(--hf-bg);
}
.food-cost__diagnosis-detail {
  font-size: 14px; line-height: 1.6; color: #c9c4b3; margin: 0;
}
.food-cost__diagnosis-detail :deep(b) { color: #e8e3d5; }
.food-cost__diagnosis-actions { display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
.food-cost__diagnosis-chart-eyebrow { color: #888; }
.food-cost__diagnosis-chart-caption { font-size: 11px; color: #888; margin-top: 4px; }

/* Menu panel */
.food-cost__menu { padding: 20px; margin-top: 14px; }
.food-cost__menu-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.food-cost__panel-title {
  font-family: var(--hf-font-display); font-size: 22px;
  letter-spacing: -0.01em; margin: 0; font-weight: 400;
}
.food-cost__panel-title--sm { font-size: 20px; }
.food-cost__panel-sub { font-size: 11px; color: var(--hf-muted); margin-bottom: 12px; margin-top: 2px; }

.food-cost__menu-filters { display: flex; gap: 6px; }
.food-cost__filter {
  padding: 3px 10px; font-size: 11px;
  border-radius: 999px; border: 1px solid var(--hf-line-2);
  background: var(--hf-paper); color: var(--hf-ink-2);
  cursor: pointer; font-family: var(--hf-font-body);
  transition: background var(--hf-transition), color var(--hf-transition);
}
.food-cost__filter:hover { border-color: var(--hf-ink-2); }
.food-cost__filter.is-active { background: var(--hf-ink); color: var(--hf-bg); border-color: var(--hf-ink); }

.food-cost__table-wrap { overflow-x: auto; }
.food-cost__table { width: 100%; border-collapse: collapse; font-size: 13px; }
.food-cost__table thead tr { border-bottom: 1px solid var(--hf-ink); text-align: left; }
.food-cost__table th { padding: 10px 8px; font-weight: 400; }
.food-cost__table tbody tr { border-bottom: 1px solid var(--hf-line); }
.food-cost__table tbody tr:hover { background: var(--hf-bg); }
.food-cost__table td { padding: 12px 8px; }
.food-cost__td-name { font-weight: 500; }
.food-cost__td-muted { color: var(--hf-muted); }
.food-cost__td-mono { font-family: var(--hf-font-mono); font-feature-settings: "tnum","zero"; }
.food-cost__ross-tag {
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--hf-accent-2); font-size: 12px;
  font-family: var(--hf-font-mono);
}
.food-cost__empty { padding: 24px; text-align: center; color: var(--hf-muted); font-size: 13px; }

/* Bottom row */
.food-cost__row-2 {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 14px; margin-top: 14px;
}
@media (max-width: 960px) { .food-cost__row-2 { grid-template-columns: 1fr; } }
.food-cost__panel { padding: 20px; }

/* Stock runway */
.food-cost__stock { list-style: none; margin: 0; padding: 0; }
.food-cost__stock li {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; border-bottom: 1px solid var(--hf-line);
}
.food-cost__stock li:last-child { border-bottom: none; }
.food-cost__stock-name { flex: 1; font-size: 13px; }
.food-cost__stock-bar { width: 120px; height: 5px; background: var(--hf-line); border-radius: 3px; overflow: hidden; }
.food-cost__stock-bar-fill { height: 100%; transition: width 300ms var(--hf-ease); }
.food-cost__stock-days { font-size: 14px; width: 60px; text-align: right; }

.food-cost__loading {
  min-height: 100vh; display: grid; place-items: center;
  background: var(--hf-bg);
}
</style>
