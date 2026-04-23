<script setup>
// Storybook-lite: every HiFi component in every state, one scroll.
import { ref } from 'vue'
import {
  HfButton, HfChip, HfCard, HfInput, HfIcon, HfAvatar, HfLogo, HfNavItem, HfKbd,
  HfLineChart, HfBarChart, HfDonut, HfSparkline, HfCompareChart,
  HfPieChart, HfMultiLineChart,
} from '../index.js'

const search = ref('')
const allIcons = ['search','bell','user','users','chart','line','bolt','clock','cal','cart','route','gear','send','plus','arrow','up','down','check','x','star','sparkle','fire','menu','filter','cmd','wine','coffee','bed','phone','mail','dot','ellipsis','leaf']

// Real-ish sample data
const weekLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const revenueThisWeek = weekLabels.map((d, i) => ({ x: i, y: [42100, 38200, 39800, 45200, 58400, 72100, 61300][i], label: d }))
const revenueLastWeek = weekLabels.map((d, i) => ({ x: i, y: [41200, 36800, 40200, 43900, 55200, 68400, 59100][i], label: d }))
const foodCostMargin = [
  { x: 'W12', y: 29.8 }, { x: 'W13', y: 29.4 }, { x: 'W14', y: 28.9 },
  { x: 'W15', y: 28.2 }, { x: 'W16', y: 27.6 }, { x: 'W17', y: 28.4 },
]
const covers = [
  { x: 'Mon', y: 84 }, { x: 'Tue', y: 76 }, { x: 'Wed', y: 82 }, { x: 'Thu', y: 94 },
  { x: 'Fri', y: 138 }, { x: 'Sat', y: 172 }, { x: 'Sun', y: 121 },
]
const spark1 = [4,5,5,6,6,5,6,7,7,8,9,8,10]
const spark2 = [12,10,11,9,8,9,7,6,7,5,4,5,3]

// Forecast series with confidence band + historical/forecast split (index 5 = cut)
const forecastSeries = [
  { x: new Date('2026-04-13'), y: 42100 },
  { x: new Date('2026-04-14'), y: 38200 },
  { x: new Date('2026-04-15'), y: 39800 },
  { x: new Date('2026-04-16'), y: 45200 },
  { x: new Date('2026-04-17'), y: 58400 },
  { x: new Date('2026-04-18'), y: 72100 },
  { x: new Date('2026-04-19'), y: 67800, lower: 61200, upper: 73900 },
  { x: new Date('2026-04-20'), y: 64400, lower: 56500, upper: 72100 },
  { x: new Date('2026-04-21'), y: 48100, lower: 38800, upper: 57200 },
  { x: new Date('2026-04-22'), y: 44700, lower: 34200, upper: 54900 },
]

// Revenue split by channel — pie chart
const channelRevenue = [
  { label: 'Dine-in',  value: 142380 },
  { label: 'Delivery', value:  58200 },
  { label: 'Takeaway', value:  31100 },
  { label: 'Events',   value:  18800 },
  { label: 'Retail',   value:   6200 },
]

// Three forecasting methods — multi-line with legend toggles
const multiSeries = [
  { name: 'Moving avg',      color: 'var(--hf-ink)',    data: [38,41,42,44,47,50,53,55,58,60,58,61] },
  { name: 'Exp. smoothing',  color: 'var(--hf-accent)', data: [39,40,43,45,46,49,52,54,57,61,62,64] },
  { name: 'Linear regression', color: 'var(--hf-good)', data: [40,42,44,46,48,50,52,54,56,58,60,62], dashed: true },
  { name: 'Naive baseline',  color: 'var(--hf-muted)',  data: [40,40,40,40,40,40,40,40,40,40,40,40], dashed: true },
]
</script>

<template>
  <div class="hf-body preview">
    <header>
      <HfLogo :size="28" />
      <div style="flex:1" />
      <span class="hf-eyebrow">Phase D2 · Component library</span>
    </header>

    <section>
      <h2>Buttons</h2>
      <div class="row">
        <HfButton>Send</HfButton>
        <HfButton variant="ghost">Ghost</HfButton>
        <HfButton variant="outline">Outline</HfButton>
        <HfButton variant="accent">Accent</HfButton>
        <HfButton size="sm">Small</HfButton>
        <HfButton variant="outline" size="sm">Small outline</HfButton>
        <HfButton disabled>Disabled</HfButton>
      </div>
      <div class="row">
        <HfButton variant="accent">
          <template #leading><HfIcon name="send" :size="14" /></template>
          Send draft
        </HfButton>
        <HfButton variant="outline">
          <template #trailing><HfIcon name="arrow" :size="14" /></template>
          Continue
        </HfButton>
      </div>
    </section>

    <section>
      <h2>Chips</h2>
      <div class="row">
        <HfChip>Default</HfChip>
        <HfChip tone="solid">Solid</HfChip>
        <HfChip tone="accent">Accent</HfChip>
        <HfChip tone="good">On pace</HfChip>
        <HfChip tone="warn">Margin drift</HfChip>
        <HfChip>
          <template #leading><span class="dot" style="background: var(--hf-good)" /></template>
          Live · 14
        </HfChip>
      </div>
    </section>

    <section>
      <h2>Input</h2>
      <div class="row">
        <HfInput v-model="search" placeholder="Search guests, tables, recipes…">
          <template #leading><HfIcon name="search" :size="14" /></template>
          <template #trailing><HfKbd>⌘ K</HfKbd></template>
        </HfInput>
        <HfInput placeholder="Disabled" disabled />
      </div>
    </section>

    <section>
      <h2>Cards</h2>
      <div class="cards">
        <HfCard eyebrow="Today · Ocean Club" title="Margin holding at 28.4%">
          Sysco produce held; lamb rack up 4.2%. Ross flagged the carbonara.
          <template #footer>
            <HfButton size="sm" variant="outline">Open brief</HfButton>
            <HfButton size="sm" variant="ghost">Dismiss</HfButton>
          </template>
        </HfCard>
        <HfCard title="Elena Foster · VIP">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
            <HfAvatar initials="EF" :size="40" />
            <div>
              <div class="hf-mono" style="font-size: 11px; color: var(--hf-muted);">LAST SEEN 12 DAYS AGO</div>
              <div>Visit cadence dropping — reach out?</div>
            </div>
          </div>
        </HfCard>
        <HfCard eyebrow="Draft" padded>
          <p style="margin:0 0 12px; font-size:14px; line-height:1.5;">"Hi Elena — we missed you last week. Friday 7pm, the terrace is yours. — Ocean Club."</p>
          <HfChip tone="accent">Ross drafted · review before send</HfChip>
        </HfCard>
      </div>
    </section>

    <section>
      <h2>Avatars</h2>
      <div class="row">
        <HfAvatar initials="AK" :size="24" />
        <HfAvatar initials="EF" :size="32" />
        <HfAvatar initials="MR" :size="40" />
        <HfAvatar initials="JS" :size="56" />
      </div>
    </section>

    <section>
      <h2>Nav</h2>
      <div class="sidebar">
        <HfLogo :size="18" />
        <div class="hair"></div>
        <HfNavItem label="Ross" icon="sparkle" active />
        <HfNavItem label="Group Overview" icon="chart" />
        <HfNavItem label="Guests" icon="users" badge="12" />
        <HfNavItem label="Queue" icon="route" badge="3" />
        <HfNavItem label="Food Cost" icon="cart" />
        <HfNavItem label="Campaigns" icon="send" />
        <HfNavItem label="Receipts" icon="mail" />
      </div>
    </section>

    <section>
      <h2>Icons</h2>
      <div class="icons">
        <div v-for="n in allIcons" :key="n" class="icon-tile">
          <HfIcon :name="n" :size="20" />
          <code>{{ n }}</code>
        </div>
      </div>
    </section>

    <section>
      <h2>Keyboard</h2>
      <div class="row">
        <HfKbd>⌘ K</HfKbd>
        <HfKbd>esc</HfKbd>
        <HfKbd keys="Shift + ↵" />
      </div>
    </section>

    <section>
      <h2>Charts</h2>
      <div class="cards">
        <HfCard eyebrow="Line" title="Food cost margin · trend" padded>
          <HfLineChart
            :data="foodCostMargin"
            :height="180"
            fill="var(--hf-accent)"
            title="Food cost margin"
            :yFormat="v => v.toFixed(1) + '%'"
          />
        </HfCard>

        <HfCard eyebrow="Compare" title="Revenue · this week vs last" padded>
          <HfCompareChart
            :seriesA="revenueThisWeek"
            :seriesB="revenueLastWeek"
            labelA="Week 17"
            labelB="Week 16"
            :height="180"
            title="Weekly revenue"
            :yFormat="v => 'R' + (v/1000).toFixed(0) + 'k'"
          />
        </HfCard>

        <HfCard eyebrow="Bar" title="Covers · this week" padded>
          <HfBarChart :data="covers" :height="180" :accentIndex="5" title="Covers by day" />
        </HfCard>

        <HfCard eyebrow="Donut" title="Table utilization" padded>
          <div style="display: flex; gap: 24px; align-items: center;">
            <HfDonut :value="0.68" :size="120" sub="Utilized" title="Table utilization" />
            <HfDonut :value="0.42" :size="96" color="var(--hf-accent)" sub="Booked" />
            <HfDonut :value="0.81" :size="72" color="var(--hf-good)" sub="On-time" />
          </div>
        </HfCard>

        <HfCard eyebrow="Line · split + band" title="Revenue forecast · next 10 days" padded>
          <HfLineChart
            :data="forecastSeries"
            :height="200"
            :dashFromIndex="5"
            :confidenceBand="true"
            fill="var(--hf-accent)"
            title="Revenue forecast"
            :yFormat="v => 'R' + (v/1000).toFixed(0) + 'k'"
          />
        </HfCard>

        <HfCard eyebrow="Pie · multi-segment" title="Revenue by channel" padded>
          <HfPieChart
            :data="channelRevenue"
            :size="160"
            :hollow="0.55"
            title="Revenue by channel"
            :valueFormat="v => 'R' + (v/1000).toFixed(0) + 'k'"
          />
        </HfCard>

        <HfCard eyebrow="Multi-line" title="Forecast methods · compare" padded>
          <HfMultiLineChart
            :series="multiSeries"
            :height="220"
            title="Forecast method comparison"
          />
        </HfCard>

        <HfCard eyebrow="Sparkline" title="Tiny inline charts" padded>
          <div style="display: flex; gap: 24px; align-items: center;">
            <div>
              <div class="hf-eyebrow">GUESTS · 7D</div>
              <div class="hf-display" style="font-size: 28px; line-height: 1;">2,814</div>
              <HfSparkline :data="spark1" :height="28" fill="var(--hf-good)" stroke="var(--hf-good)" />
            </div>
            <div>
              <div class="hf-eyebrow">WAIT · 7D</div>
              <div class="hf-display" style="font-size: 28px; line-height: 1;">6m</div>
              <HfSparkline :data="spark2" :height="28" fill="var(--hf-warn)" stroke="var(--hf-warn)" />
            </div>
          </div>
        </HfCard>
      </div>
    </section>
  </div>
</template>

<style scoped>
.preview { padding: 48px 64px 120px; max-width: 1100px; margin: 0 auto; background: var(--hf-bg2); min-height: 100vh; }
header { display: flex; align-items: center; gap: 16px; margin-bottom: 48px; }
section { margin-bottom: 48px; }
h2 {
  font-family: var(--hf-font-display);
  font-size: 20px;
  font-weight: 400;
  letter-spacing: -0.01em;
  margin: 0 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--hf-line);
  color: var(--hf-ink-2);
}
.row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.sidebar { background: var(--hf-paper); border: 1px solid var(--hf-line); border-radius: var(--hf-radius-md); padding: 12px; width: 240px; display: flex; flex-direction: column; gap: 2px; }
.sidebar .hair { border-top: 1px solid var(--hf-line); margin: 8px 0; }
.icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; }
.icon-tile {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 8px; border: 1px solid var(--hf-line); border-radius: var(--hf-radius); background: var(--hf-paper);
}
.icon-tile code { font-family: var(--hf-font-mono); font-size: 10px; color: var(--hf-muted); }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
</style>
