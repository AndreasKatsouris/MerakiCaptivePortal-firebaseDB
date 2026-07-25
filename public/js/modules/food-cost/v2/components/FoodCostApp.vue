<script setup>
// Food Cost — operator cockpit, wired to REAL data (D3 T5, design §4b).
// Layout: 220px sidebar + main. Main: header (venue + location picker +
// upload/Ask-Ross actions), 2 KPI tiles with real sparklines, Ross summary
// hero (D1 summary + D2 top order picks), stock runway bars, order-suggestion
// table. States: loading skeleton, inline error banner, empty ("no stock data
// yet"), no-locations. Data: the §5 foodCostOverview payload via store.load().
// CRITICAL payload note: `order` is POLYMORPHIC — suggestOrder returns bare
// {hasData:false} when nothing is orderable, so every order.* read branches
// on order.hasData first (food-cost-overview.js:201-205).
import { onMounted, ref, computed } from 'vue'
import { useFoodCostStore } from '../store.js'
import { useLocations } from '../use-locations.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfLogo, HfNavItem, HfSelect,
  HfSparkline, HfLineChart,
} from '/js/design-system/hifi/index.js'
import { zar, currentDateLine } from '../content.js'
import FoodCostUploadWizard from './FoodCostUploadWizard.vue'

const store = useFoodCostStore()
const { locations, locationsLoading, locationsError, loadLocations } = useLocations()
const wizardOpen = ref(false)

onMounted(async () => {
  await loadLocations()
  // 1 location → auto-select; many → auto-select the first (picker in header).
  if (locations.value.length && !store.locationId) {
    store.load({ locationId: locations.value[0].id })
  }
})

const selectedLocationId = computed({
  get: () => store.locationId,
  set: (id) => { if (id && id !== store.locationId) store.load({ locationId: id }) },
})
const locationOptions = computed(() =>
  locations.value.map((l) => ({ value: l.id, label: l.name })))
const venueName = computed(() => {
  const loc = locations.value.find((l) => l.id === store.locationId)
  return loc ? loc.name : ''
})

const dateLine = currentDateLine()
const data = computed(() => store.data)
const kpis = computed(() => (data.value && data.value.kpis) || null)
const order = computed(() => (data.value && data.value.order) || null)
const orderHasData = computed(() => !!(order.value && order.value.hasData))
const orderItems = computed(() =>
  (orderHasData.value && Array.isArray(order.value.items)) ? order.value.items : [])
const runway = computed(() =>
  Array.isArray(data.value && data.value.runway) ? data.value.runway : [])

const pageError = computed(() => store.error || locationsError.value)
const initialLoading = computed(() => locationsLoading.value || store.loading)
const noLocations = computed(() =>
  !locationsLoading.value && !locationsError.value && locations.value.length === 0)

function retry() {
  if (!locations.value.length) loadLocations()
  if (store.locationId) store.load()
}

// --- Ask-Ross deep-link (G7): short sanitized seed, venue name only, no
// tenant item strings; consumed by /ross.html#ask= (RossHomeDesktop.vue:32).
const askHref = computed(() => {
  const raw = venueName.value
    ? `How's my food cost at ${venueName.value}?`
    : "How's my food cost looking?"
  // Code-point-safe cap (T5 review N4): a naive .slice can split a surrogate
  // pair at the boundary and encodeURIComponent THROWS on a lone surrogate —
  // a throwing computed would break the whole component render.
  const seed = Array.from(raw).slice(0, 120).join('')
  try {
    return '/ross.html#ask=' + encodeURIComponent(seed)
  } catch {
    return '/ross.html'
  }
})

// --- Header chips ------------------------------------------------------------
const updatedLabel = computed(() => {
  const age = data.value && data.value.dataAgeDays
  if (age === null || age === undefined) return ''
  if (age === 0) return 'Updated today'
  if (age === 1) return 'Updated yesterday'
  return `Updated ${age}d ago`
})
const countsLabel = computed(() => {
  const n = (kpis.value && kpis.value.costPctTrend || []).length
  return n ? `${n} stock count${n === 1 ? '' : 's'}` : ''
})

// --- KPI tiles (2 real tiles — waste/menu-margin CUT per D3-1) ---------------
const tones = { good: 'var(--hf-good)', warn: 'var(--hf-warn)', accent: 'var(--hf-accent)', default: 'var(--hf-ink)' }

function fmtPp(v) { return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + 'pp' }

const kpiTiles = computed(() => {
  const k = kpis.value
  if (!k) return []
  const s = data.value.summary || {}
  const warn = s.trend === 'up'
  return [
    {
      key: 'costPct',
      label: 'Food cost',
      value: (Number(k.costPct) || 0).toFixed(1) + '%',
      meta: k.prevCostPct === null || k.prevCostPct === undefined
        ? 'first count — no comparison yet'
        : `${fmtPp(k.costPct - k.prevCostPct)} vs previous count`,
      warn,
      trend: k.costPctTrend || [],
    },
    {
      key: 'spend',
      label: 'Food spend',
      value: zar(k.spend || 0),
      meta: 'cost of usage · latest count',
      warn: false,
      trend: k.spendTrend || [],
    },
  ]
})

// --- Ross summary hero (real D1 + D2 data) -----------------------------------
const heroHeadline = computed(() => {
  const s = data.value && data.value.summary
  if (!s) return ''
  const low = s.lowStockCount || 0
  const stockLine = low > 0
    ? `${low} item${low === 1 ? ' is' : 's are'} running low.`
    : 'Stock levels look healthy.'
  const trendLine = s.trend === 'up' ? 'Food cost is trending up.'
    : s.trend === 'down' ? 'Food cost is trending down.'
      : s.trend === 'flat' ? 'Food cost is holding steady.' : ''
  return `${stockLine} ${trendLine}`.trim()
})
const heroDetail = computed(() => {
  const d = data.value
  if (!d) return ''
  const items = (d.summary && d.summary.itemsAnalysed) || 0
  const age = d.dataAgeDays
  const ageText = age === null || age === undefined ? ''
    : age === 0 ? 'from today'
      : age === 1 ? 'from yesterday' : `${age} days old`
  return `Based on ${items} item${items === 1 ? '' : 's'} in your latest stock count${ageText ? ` (${ageText})` : ''}.`
})
const heroOrderTop = computed(() => orderItems.value.slice(0, 3))
function humanCaveat(c) {
  if (c === 'items-truncated-for-size') return 'item list truncated for size'
  const m = /^costs-unavailable-for-(\d+)-items$/.exec(String(c))
  if (m) return `costs unavailable for ${m[1]} item${m[1] === '1' ? '' : 's'}`
  return String(c)
}
const heroCaveats = computed(() => {
  if (!orderHasData.value || !Array.isArray(order.value.caveats)) return ''
  return order.value.caveats.map(humanCaveat).join(' · ')
})
const heroChartSeries = computed(() => {
  const trend = (kpis.value && kpis.value.costPctTrend) || []
  return trend.length >= 2 ? trend.map((y, i) => ({ x: i + 1, y })) : null
})

// --- Stock runway ------------------------------------------------------------
const STOCK_MAX_DAYS = 14 // bars visually cap here, like the A2 layout
function runwayBarWidth(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return 4 // 'out' stub
  return Math.min((daysLeft / STOCK_MAX_DAYS) * 100, 100)
}
function runwayDaysLabel(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return 'out'
  const n = Number(daysLeft) || 0
  return (n >= 10 ? String(Math.round(n)) : n.toFixed(1)) + 'd'
}

// --- Order table -------------------------------------------------------------
function fmtQty(v) {
  const n = Number(v) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
const statusChips = {
  stockout: { label: 'Stockout', cls: 'is-warn' },
  low: { label: 'Low', cls: 'is-accent' },
  ok: { label: 'OK', cls: 'is-ok' },
}
function statusChip(s) { return statusChips[s] || { label: String(s || '—'), cls: 'is-ok' } }
const orderTotalsLine = computed(() => {
  if (!orderHasData.value || !order.value.totals) return ''
  const t = order.value.totals
  let line = `${t.itemsToOrder} item${t.itemsToOrder === 1 ? '' : 's'} to order · est. ${zar(t.estimatedTotalCost || 0)}`
  if (t.itemsWithUnknownCost > 0) {
    line += ` (excludes ${t.itemsWithUnknownCost} item${t.itemsWithUnknownCost === 1 ? '' : 's'} with unknown cost)`
  }
  return line
})

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
</script>

<template>
  <div class="food-cost">
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
          <div class="hf-eyebrow">Food cost · {{ dateLine }}</div>
          <h1 class="food-cost__title">{{ venueName || 'Food cost' }}</h1>
        </div>
        <div class="food-cost__actions">
          <HfChip v-if="countsLabel">
            <template #leading><HfIcon name="cal" :size="12" /></template>
            {{ countsLabel }}
          </HfChip>
          <div v-if="locationOptions.length > 1" class="food-cost__loc-select">
            <HfSelect v-model="selectedLocationId" :options="locationOptions" placeholder="Location" />
          </div>
          <HfButton variant="ghost" size="sm" as="a" :href="askHref">
            <template #leading><HfIcon name="sparkle" :size="13" /></template>
            Ask Ross
          </HfButton>
          <HfButton size="sm" :disabled="!store.locationId" @click="wizardOpen = true">
            <template #leading><HfIcon name="up" :size="13" /></template>
            Upload stock count
          </HfButton>
        </div>
      </header>

      <!-- Inline error banner -->
      <div v-if="pageError" class="food-cost__banner" role="alert">
        <HfIcon name="alert" :size="14" color="var(--hf-warn)" />
        <span class="food-cost__banner-text">{{ pageError }}</span>
        <HfButton variant="ghost" size="sm" @click="retry">Retry</HfButton>
      </div>

      <!-- Loading skeleton (R-D3-4: the dashboard blocks on the CF) -->
      <div v-if="initialLoading" class="food-cost__skeleton" aria-label="Loading" role="status">
        <div class="food-cost__skeleton-row">
          <div class="food-cost__skeleton-block" style="height: 110px" />
          <div class="food-cost__skeleton-block" style="height: 110px" />
        </div>
        <div class="food-cost__skeleton-block" style="height: 220px" />
        <div class="food-cost__skeleton-block" style="height: 180px" />
      </div>

      <!-- No locations on the account -->
      <HfCard v-else-if="noLocations" class="food-cost__empty-card">
        <h3 class="food-cost__panel-title">No locations yet</h3>
        <p class="food-cost__empty-text">
          Your account has no locations, so there's nowhere to record stock
          counts. Add a location from the admin dashboard first.
        </p>
      </HfCard>

      <!-- Empty state: no stock data for this location -->
      <HfCard v-else-if="store.empty" class="food-cost__empty-card">
        <HfIcon name="leaf" :size="26" color="var(--hf-muted)" />
        <h3 class="food-cost__panel-title">No stock data yet</h3>
        <p class="food-cost__empty-text">
          Upload your first stock count and Ross will track food cost, stock
          runway, and what to order — the numbers on this page come straight
          from your counts.
        </p>
        <HfButton :disabled="!store.locationId" @click="wizardOpen = true">
          <template #leading><HfIcon name="up" :size="13" /></template>
          Upload stock count
        </HfButton>
      </HfCard>

      <!-- Real data -->
      <template v-else-if="data">
        <!-- KPIs -->
        <div class="food-cost__kpis">
          <HfCard v-for="k in kpiTiles" :key="k.key" :padded="false" class="food-cost__kpi">
            <div class="hf-eyebrow">{{ k.label }}</div>
            <div class="food-cost__kpi-value hf-num" :class="{ 'is-warn': k.warn }">{{ k.value }}</div>
            <div class="hf-mono food-cost__kpi-meta" :class="{ 'is-warn': k.warn }">{{ k.meta }}</div>
            <div class="food-cost__kpi-spark">
              <HfSparkline v-if="k.trend.length >= 2" :data="k.trend" :height="28"
                :stroke="k.warn ? tones.warn : tones.default"
                :fill="k.warn ? tones.warn : tones.default" />
            </div>
          </HfCard>
        </div>

        <!-- Ross summary hero -->
        <section class="food-cost__diagnosis">
          <div class="hf-grain" />
          <div class="food-cost__diagnosis-body" :class="{ 'food-cost__diagnosis-body--single': !heroChartSeries }">
            <div>
              <div class="hf-eyebrow food-cost__diagnosis-eyebrow">
                <HfIcon name="sparkle" :size="11" color="var(--hf-accent)" />
                Ross · summary
              </div>
              <h3 class="food-cost__diagnosis-headline">{{ heroHeadline }}</h3>
              <p class="food-cost__diagnosis-detail">{{ heroDetail }}</p>

              <div v-if="orderHasData && heroOrderTop.length" class="food-cost__hero-order">
                <div class="hf-eyebrow food-cost__hero-order-eyebrow">Top order picks</div>
                <ul class="food-cost__hero-order-list">
                  <li v-for="it in heroOrderTop" :key="it.itemCode">
                    <span class="food-cost__hero-order-name">{{ it.description || it.itemCode }}</span>
                    <span class="hf-mono food-cost__hero-order-qty">×{{ fmtQty(it.orderQty) }}</span>
                    <span class="hf-mono food-cost__hero-order-cost">
                      {{ it.estimatedCost === null ? 'cost unknown' : zar(it.estimatedCost) }}
                    </span>
                  </li>
                </ul>
              </div>
              <p v-else class="food-cost__diagnosis-detail food-cost__hero-noorder">
                Nothing needs ordering right now.
              </p>

              <div class="food-cost__diagnosis-actions">
                <HfButton variant="accent" size="sm" as="a" :href="askHref">
                  <template #leading><HfIcon name="sparkle" :size="12" /></template>
                  Ask Ross about this
                </HfButton>
              </div>
              <div v-if="heroCaveats" class="hf-mono food-cost__hero-caveats">{{ heroCaveats }}</div>
            </div>
            <div v-if="heroChartSeries" class="food-cost__diagnosis-chart">
              <div class="hf-eyebrow food-cost__diagnosis-chart-eyebrow">Food cost % · per count</div>
              <HfLineChart
                :data="heroChartSeries"
                :height="140"
                stroke="var(--hf-accent)"
                fill="var(--hf-accent)"
                :show-axes="false"
                :show-tooltip="false"
                title="Food cost percentage per stock count"
              />
              <div class="hf-mono food-cost__diagnosis-chart-caption">
                oldest → newest · last {{ heroChartSeries.length }} counts
              </div>
            </div>
          </div>
        </section>

        <!-- Stock runway -->
        <HfCard :padded="false" class="food-cost__panel">
          <h3 class="food-cost__panel-title food-cost__panel-title--sm">Stock runway</h3>
          <div class="hf-mono food-cost__panel-sub">Days of cover on low-stock items · bars cap at {{ STOCK_MAX_DAYS }}d</div>
          <ul v-if="runway.length" class="food-cost__stock">
            <li v-for="(s, i) in runway" :key="i">
              <div class="food-cost__stock-name">{{ s.item }}</div>
              <div class="food-cost__stock-bar">
                <div class="food-cost__stock-bar-fill"
                  :class="{ 'is-out': s.daysLeft === null || s.daysLeft === undefined }"
                  :style="{ width: `${runwayBarWidth(s.daysLeft)}%`, background: tones[s.tone] || tones.default }" />
              </div>
              <div class="hf-num food-cost__stock-days" :style="{ color: tones[s.tone] || tones.default }">
                {{ runwayDaysLabel(s.daysLeft) }}
              </div>
            </li>
          </ul>
          <div v-else class="food-cost__empty">No items are running low.</div>
        </HfCard>

        <!-- Order suggestions -->
        <HfCard :padded="false" class="food-cost__menu">
          <div class="food-cost__menu-head">
            <h3 class="food-cost__panel-title">Suggested order</h3>
            <div v-if="orderHasData && order.truncated" class="hf-mono food-cost__truncated">
              showing {{ orderItems.length }} of {{ order.truncated.itemCount }}
            </div>
          </div>
          <div v-if="orderItems.length" class="food-cost__table-wrap">
            <table class="food-cost__table">
              <thead>
                <tr>
                  <th class="hf-eyebrow">Item</th>
                  <th class="hf-eyebrow">Supplier</th>
                  <th class="hf-eyebrow">Current stock</th>
                  <th class="hf-eyebrow">Usage/day</th>
                  <th class="hf-eyebrow">Order qty</th>
                  <th class="hf-eyebrow">Est. cost</th>
                  <th class="hf-eyebrow">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in orderItems" :key="r.itemCode">
                  <td class="food-cost__td-name">{{ r.description || r.itemCode }}</td>
                  <td class="food-cost__td-muted">{{ r.supplierName || '—' }}</td>
                  <td class="food-cost__td-mono">{{ fmtQty(r.currentStock) }}</td>
                  <td class="food-cost__td-mono">{{ fmtQty(r.usagePerDay) }}</td>
                  <td class="food-cost__td-mono">{{ fmtQty(r.orderQty) }}</td>
                  <td class="food-cost__td-mono">{{ r.estimatedCost === null ? 'unknown' : zar(r.estimatedCost) }}</td>
                  <td>
                    <span class="food-cost__status" :class="statusChip(r.stockStatus).cls">
                      {{ statusChip(r.stockStatus).label }}
                    </span>
                  </td>
                </tr>
              </tbody>
              <tfoot v-if="orderTotalsLine">
                <tr>
                  <td colspan="7" class="hf-mono food-cost__totals">{{ orderTotalsLine }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div v-else class="food-cost__empty">
            No order suggestions from your latest count — nothing needs ordering right now.
          </div>
        </HfCard>
      </template>
    </main>

    <FoodCostUploadWizard
      v-if="wizardOpen"
      :location-id="store.locationId || ''"
      @close="wizardOpen = false"
    />
  </div>
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
  /* Venue name is a tenant string (T5 review S2): bound it so a long name
     truncates instead of wrapping the whole header. */
  max-width: 640px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.food-cost__actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.food-cost__loc-select { min-width: 180px; }

/* Inline error banner */
.food-cost__banner {
  display: flex; align-items: center; gap: 10px;
  margin-top: 18px; padding: 10px 14px;
  border: 1px solid var(--hf-warn);
  border-radius: var(--hf-radius);
  background: var(--hf-paper);
  font-size: 13px;
}
.food-cost__banner-text { flex: 1; }

/* Loading skeleton */
.food-cost__skeleton { margin-top: 24px; display: flex; flex-direction: column; gap: 14px; }
.food-cost__skeleton-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.food-cost__skeleton-block {
  border-radius: var(--hf-radius-md);
  background: linear-gradient(100deg, var(--hf-bg2) 40%, var(--hf-paper) 50%, var(--hf-bg2) 60%);
  background-size: 200% 100%;
  animation: food-cost-shimmer 1.4s ease infinite;
}
@keyframes food-cost-shimmer {
  0% { background-position: 120% 0; }
  100% { background-position: -80% 0; }
}

/* Empty / no-locations cards */
.food-cost__empty-card {
  margin-top: 24px; padding: 44px 24px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  text-align: center;
}
.food-cost__empty-text { max-width: 460px; font-size: 13.5px; line-height: 1.6; color: var(--hf-ink-2); margin: 0 0 6px; }

/* KPIs */
.food-cost__kpis {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 14px; margin-top: 24px;
}
@media (max-width: 640px) { .food-cost__kpis { grid-template-columns: 1fr; } }
.food-cost__kpi { padding: 16px; }
.food-cost__kpi-value { font-size: 30px; line-height: 1; margin: 4px 0 2px; }
.food-cost__kpi-value.is-warn { color: var(--hf-warn); }
.food-cost__kpi-meta { font-size: 11px; color: var(--hf-muted); }
.food-cost__kpi-meta.is-warn { color: var(--hf-warn); }
.food-cost__kpi-spark { margin-top: 10px; min-height: 28px; }

/* Ross summary hero */
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
.food-cost__diagnosis-body--single { grid-template-columns: 1fr; }
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
.food-cost__hero-noorder { margin-top: 14px; }
.food-cost__diagnosis-actions { display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
.food-cost__diagnosis-chart-eyebrow { color: #888; }
.food-cost__diagnosis-chart-caption { font-size: 11px; color: #888; margin-top: 4px; }

.food-cost__hero-order { margin-top: 16px; }
.food-cost__hero-order-eyebrow { color: #888; margin-bottom: 6px; }
.food-cost__hero-order-list { list-style: none; margin: 0; padding: 0; }
.food-cost__hero-order-list li {
  display: flex; align-items: baseline; gap: 10px;
  padding: 5px 0; font-size: 13.5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.food-cost__hero-order-list li:last-child { border-bottom: none; }
.food-cost__hero-order-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.food-cost__hero-order-qty { font-size: 12px; color: var(--hf-accent); }
.food-cost__hero-order-cost { font-size: 12px; color: #c9c4b3; }
.food-cost__hero-caveats { font-size: 10.5px; color: #888; margin-top: 12px; }

/* Panels */
.food-cost__panel { padding: 20px; margin-top: 14px; }
.food-cost__panel-title {
  font-family: var(--hf-font-display); font-size: 22px;
  letter-spacing: -0.01em; margin: 0; font-weight: 400;
}
.food-cost__panel-title--sm { font-size: 20px; }
.food-cost__panel-sub { font-size: 11px; color: var(--hf-muted); margin-bottom: 12px; margin-top: 2px; }

/* Stock runway */
.food-cost__stock { list-style: none; margin: 0; padding: 0; }
.food-cost__stock li {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; border-bottom: 1px solid var(--hf-line);
}
.food-cost__stock li:last-child { border-bottom: none; }
.food-cost__stock-name { flex: 1; font-size: 13px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.food-cost__stock-bar { width: 120px; height: 5px; background: var(--hf-line); border-radius: 3px; overflow: hidden; }
.food-cost__stock-bar-fill { height: 100%; transition: width 300ms var(--hf-ease); }
.food-cost__stock-bar-fill.is-out { opacity: 0.6; }
.food-cost__stock-days { font-size: 14px; width: 60px; text-align: right; }

/* Order table */
.food-cost__menu { padding: 20px; margin-top: 14px; }
.food-cost__menu-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.food-cost__truncated { font-size: 11px; color: var(--hf-muted); }
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
.food-cost__totals { padding: 12px 8px; font-size: 11.5px; color: var(--hf-muted); }

.food-cost__status {
  display: inline-block; padding: 2px 9px;
  font-size: 11px; border-radius: 999px;
  border: 1px solid var(--hf-line-2); color: var(--hf-muted);
}
.food-cost__status.is-warn { border-color: var(--hf-warn); color: var(--hf-warn); }
.food-cost__status.is-accent { border-color: var(--hf-accent); color: var(--hf-accent-2); }

.food-cost__empty { padding: 24px; text-align: center; color: var(--hf-muted); font-size: 13px; }
</style>
