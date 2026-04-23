<script setup>
// Group Overview — daily multi-venue cockpit.
// Layout: 220px sidebar + main. Main holds: header row, 4 KPI tiles,
// split row (30d revenue compare + by-venue list), and 3-tile bottom
// row (floor / menu top 5 / Ross today).
import { onMounted, computed, ref } from 'vue'
import { useGroupOverviewStore } from '../store.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfLogo, HfNavItem,
  HfSparkline, HfCompareChart,
} from '/js/design-system/hifi/index.js'
import { formatKpi, formatDelta } from '../content.js'

const store = useGroupOverviewStore()
onMounted(() => { if (!store.data) store.load() })

const data = computed(() => store.data)

const nav = [
  { label: 'Ross',       icon: 'bolt',    href: '/ross.html' },
  { label: 'Overview',   icon: 'chart',   active: true },
  { label: 'Guests',     icon: 'users',   href: '/guest-management.html' },
  { label: 'Queue',      icon: 'clock',   href: '/queue-management.html' },
  { label: 'Analytics',  icon: 'line',    href: '/analytics.html' },
  { label: 'Food cost',  icon: 'leaf',    href: '/food-cost-analytics.html' },
  { label: 'Campaigns',  icon: 'send',    href: '/campaigns.html' },
  { label: 'Settings',   icon: 'gear',    href: '/admin-dashboard.html' },
]

const ranges = ['D', 'W', 'M', 'Q']
const range = ref('M')
function setRange(r) {
  range.value = r
  // Reload only if the range materially changes what the service returns.
  // Current scripted service ignores range; wired service will use this.
  store.load(r)
}

const tones = { good: 'var(--hf-good)', warn: 'var(--hf-warn)', default: 'var(--hf-ink)' }

const compareKpiToZar = v => 'R' + (v / 1000).toFixed(0) + 'k'
</script>

<template>
  <div class="group-overview" v-if="data">
    <!-- Sidebar -->
    <aside class="group-overview__sidebar">
      <HfLogo :size="20" />
      <div class="group-overview__nav">
        <HfNavItem
          v-for="n in nav" :key="n.label"
          :label="n.label" :icon="n.icon"
          :href="n.href" :active="!!n.active"
        />
      </div>
    </aside>

    <!-- Main -->
    <main class="group-overview__main">
      <header class="group-overview__header">
        <div>
          <div class="hf-eyebrow">{{ data.dateLine }}</div>
          <h1 class="group-overview__title">Group overview</h1>
        </div>
        <div class="group-overview__actions">
          <HfChip>
            <template #leading><HfIcon name="filter" :size="12" /></template>
            All venues
          </HfChip>
          <HfChip>
            <template #leading><HfIcon name="cal" :size="12" /></template>
            Today
          </HfChip>
          <HfButton variant="ghost" size="sm">Export</HfButton>
          <HfButton size="sm">
            <template #leading><HfIcon name="sparkle" :size="13" /></template>
            Ask Ross
          </HfButton>
        </div>
      </header>

      <!-- KPI tiles -->
      <div class="group-overview__kpis">
        <HfCard v-for="k in data.kpis" :key="k.key" :padded="false" class="group-overview__kpi">
          <div class="hf-eyebrow">{{ k.label }}</div>
          <div class="hf-num group-overview__kpi-value">{{ formatKpi(k) }}</div>
          <div class="hf-mono group-overview__kpi-delta" :class="k.good ? 'is-good' : 'is-warn'">
            {{ formatDelta(k) }}
          </div>
          <div class="group-overview__kpi-spark">
            <HfSparkline
              :data="k.trend" :height="30"
              :stroke="k.good ? tones.good : tones.warn"
              :fill="k.good ? tones.good : tones.warn"
            />
          </div>
        </HfCard>
      </div>

      <!-- Row: 30d revenue + by-venue -->
      <div class="group-overview__row-2">
        <HfCard :padded="false" class="group-overview__panel">
          <div class="group-overview__panel-head">
            <div>
              <h3 class="group-overview__panel-title">Revenue · 30 days</h3>
              <div class="hf-mono group-overview__panel-sub">vs. previous 30 days</div>
            </div>
            <div class="group-overview__range">
              <button
                v-for="r in ranges" :key="r"
                :class="['group-overview__range-chip', { 'is-active': range === r }]"
                @click="setRange(r)"
                :aria-pressed="range === r"
              >{{ r }}</button>
            </div>
          </div>
          <HfCompareChart
            :seriesA="data.revenue30d.current"
            :seriesB="data.revenue30d.previous"
            labelA="This period"
            labelB="Previous"
            :height="220"
            :showAxes="true"
            :yFormat="compareKpiToZar"
            title="Revenue · 30 days"
          />
          <div class="group-overview__legend-totals">
            <span>
              <i class="group-overview__legend-bar" style="background: var(--hf-ink);" />
              This period · <b>R{{ new Intl.NumberFormat('en-ZA').format(data.revenue30d.currentTotal) }}</b>
            </span>
            <span class="group-overview__legend-prev">
              <i class="group-overview__legend-bar" style="background: var(--hf-accent);" />
              Previous · R{{ new Intl.NumberFormat('en-ZA').format(data.revenue30d.previousTotal) }}
            </span>
          </div>
        </HfCard>

        <HfCard :padded="false" class="group-overview__panel">
          <div class="group-overview__panel-head">
            <div>
              <h3 class="group-overview__panel-title group-overview__panel-title--sm">By venue</h3>
              <div class="hf-mono group-overview__panel-sub">Today · revenue</div>
            </div>
          </div>
          <ul class="group-overview__venues">
            <li v-for="v in data.byVenue" :key="v.name">
              <div class="group-overview__venue-row">
                <span>{{ v.name }}</span>
                <span class="hf-num">R{{ new Intl.NumberFormat('en-ZA').format(v.revenue) }}</span>
              </div>
              <div class="group-overview__venue-bar">
                <div class="group-overview__venue-bar-fill" :style="{ width: `${v.share * 100}%` }" />
              </div>
            </li>
          </ul>
        </HfCard>
      </div>

      <!-- Row: floor / menu top 5 / Ross -->
      <div class="group-overview__row-3">
        <HfCard :padded="false" class="group-overview__panel">
          <div class="group-overview__panel-head group-overview__panel-head--solo">
            <div>
              <h3 class="group-overview__panel-title group-overview__panel-title--sm">Today's floor</h3>
              <div class="hf-mono group-overview__panel-sub">{{ data.floor.venue }} · {{ data.floor.seatedOf.seated }} seated / {{ data.floor.seatedOf.tables }} tables</div>
            </div>
          </div>
          <ul class="group-overview__floor">
            <li v-for="r in data.floor.rows" :key="r.label">
              <span class="group-overview__floor-k">{{ r.label }}</span>
              <span class="hf-num group-overview__floor-v" :style="{ color: tones[r.tone] }">{{ r.value }}</span>
            </li>
          </ul>
        </HfCard>

        <HfCard :padded="false" class="group-overview__panel">
          <div class="group-overview__panel-head group-overview__panel-head--solo">
            <div>
              <h3 class="group-overview__panel-title group-overview__panel-title--sm">Menu · top 5</h3>
              <div class="hf-mono group-overview__panel-sub">Today · by volume</div>
            </div>
          </div>
          <ul class="group-overview__menu">
            <li v-for="m in data.menuTop" :key="m.name">
              <span>{{ m.name }}</span>
              <span class="hf-mono group-overview__menu-count">{{ m.count }}</span>
            </li>
          </ul>
        </HfCard>

        <section class="group-overview__ross">
          <div class="hf-grain" />
          <div class="group-overview__ross-head">
            <HfIcon name="sparkle" :size="13" color="var(--hf-accent)" />
            <span class="hf-eyebrow group-overview__ross-eyebrow">{{ data.rossTile.eyebrow }}</span>
          </div>
          <div class="group-overview__ross-headline">
            {{ data.rossTile.headline }}<br />
            {{ data.rossTile.subline }}
          </div>
          <HfButton variant="accent" size="sm">
            {{ data.rossTile.actionLabel }}
            <template #trailing><HfIcon name="arrow" :size="12" /></template>
          </HfButton>
        </section>
      </div>
    </main>
  </div>

  <div v-else class="group-overview__loading"><div class="hf-eyebrow">Loading…</div></div>
</template>

<style scoped>
.group-overview {
  width: 100%; min-height: 100vh;
  display: grid; grid-template-columns: 220px 1fr;
  background: var(--hf-bg);
}
.group-overview__sidebar {
  background: var(--hf-bg2);
  border-right: 1px solid var(--hf-line);
  padding: 20px 16px;
  display: flex; flex-direction: column;
}
.group-overview__nav { margin-top: 20px; display: flex; flex-direction: column; gap: 2px; }

.group-overview__main {
  padding: 28px 36px 48px;
  min-width: 0;
}

.group-overview__header {
  display: flex; justify-content: space-between; align-items: flex-end;
  gap: 16px; flex-wrap: wrap;
}
.group-overview__title {
  font-family: var(--hf-font-display);
  font-size: 40px; letter-spacing: -0.015em;
  margin: 4px 0 0;
  font-weight: 400;
}
.group-overview__actions {
  display: flex; gap: 8px; align-items: center;
}

/* KPI tiles */
.group-overview__kpis {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 14px; margin-top: 24px;
}
@media (max-width: 960px) {
  .group-overview__kpis { grid-template-columns: repeat(2, 1fr); }
}
.group-overview__kpi { padding: 16px; }
.group-overview__kpi-value { font-size: 32px; margin: 4px 0 2px; line-height: 1; }
.group-overview__kpi-delta { font-size: 11px; }
.group-overview__kpi-delta.is-good { color: var(--hf-good); }
.group-overview__kpi-delta.is-warn { color: var(--hf-warn); }
.group-overview__kpi-spark { margin-top: 10px; }

/* Row: 2 columns */
.group-overview__row-2 {
  display: grid; grid-template-columns: 2fr 1fr;
  gap: 14px; margin-top: 14px;
}
@media (max-width: 960px) {
  .group-overview__row-2 { grid-template-columns: 1fr; }
}

/* Row: 3 columns */
.group-overview__row-3 {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 14px; margin-top: 14px;
}
@media (max-width: 960px) {
  .group-overview__row-3 { grid-template-columns: 1fr; }
}

/* Panels */
.group-overview__panel { padding: 20px; }
.group-overview__panel-head {
  display: flex; justify-content: space-between; align-items: flex-start;
}
.group-overview__panel-head--solo { margin-bottom: 10px; }
.group-overview__panel-title {
  font-family: var(--hf-font-display);
  font-size: 22px; letter-spacing: -0.01em;
  margin: 0; font-weight: 400;
}
.group-overview__panel-title--sm { font-size: 20px; }
.group-overview__panel-sub { font-size: 11px; color: var(--hf-muted); margin-top: 2px; }

/* Range toggle */
.group-overview__range { display: flex; gap: 6px; }
.group-overview__range-chip {
  padding: 2px 10px;
  font-size: 11px;
  border-radius: 999px;
  border: 1px solid var(--hf-line-2);
  background: var(--hf-paper);
  color: var(--hf-ink-2);
  cursor: pointer;
  font-family: var(--hf-font-body);
  transition: background var(--hf-transition), color var(--hf-transition);
}
.group-overview__range-chip:hover { border-color: var(--hf-ink-2); }
.group-overview__range-chip.is-active {
  background: var(--hf-ink); color: var(--hf-bg); border-color: var(--hf-ink);
}

/* Compare chart totals row */
.group-overview__legend-totals {
  display: flex; gap: 16px; margin-top: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}
.group-overview__legend-totals span { display: flex; align-items: center; gap: 6px; }
.group-overview__legend-prev { color: var(--hf-muted); }
.group-overview__legend-bar { width: 14px; height: 2px; display: inline-block; border-radius: 1px; }

/* Venues list */
.group-overview__venues { list-style: none; margin: 14px 0 0; padding: 0; }
.group-overview__venues li {
  padding: 10px 0;
  border-bottom: 1px solid var(--hf-line);
}
.group-overview__venues li:last-child { border-bottom: none; padding-bottom: 0; }
.group-overview__venue-row { display: flex; justify-content: space-between; font-size: 13px; }
.group-overview__venue-bar {
  height: 4px; background: var(--hf-line);
  border-radius: 2px; margin-top: 6px; overflow: hidden;
}
.group-overview__venue-bar-fill {
  height: 100%; background: var(--hf-ink);
  transition: width 300ms var(--hf-ease);
}

/* Floor + menu lists */
.group-overview__floor, .group-overview__menu { list-style: none; margin: 0; padding: 0; }
.group-overview__floor li {
  display: flex; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid var(--hf-line);
}
.group-overview__floor li:last-child { border-bottom: none; }
.group-overview__floor-k { font-size: 13px; color: var(--hf-ink-2); }
.group-overview__floor-v { font-size: 15px; }
.group-overview__menu li {
  display: flex; justify-content: space-between;
  padding: 7px 0; border-bottom: 1px solid var(--hf-line);
  font-size: 13px;
}
.group-overview__menu li:last-child { border-bottom: none; }
.group-overview__menu-count { color: var(--hf-muted); }

/* Ross tile */
.group-overview__ross {
  background: var(--hf-ink);
  color: var(--hf-bg);
  position: relative;
  overflow: hidden;
  padding: 20px;
  border-radius: var(--hf-radius-md);
  border: 1px solid var(--hf-ink);
}
.group-overview__ross-head { display: flex; align-items: center; gap: 6px; }
.group-overview__ross-eyebrow { color: #aaa; }
.group-overview__ross-headline {
  font-family: var(--hf-font-display);
  font-size: 22px; line-height: 1.2;
  margin: 10px 0 12px;
}

/* Loading */
.group-overview__loading {
  min-height: 100vh;
  display: grid; place-items: center;
  background: var(--hf-bg);
}
</style>
