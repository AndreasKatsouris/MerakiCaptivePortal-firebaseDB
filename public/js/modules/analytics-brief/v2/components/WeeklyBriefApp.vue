<script setup>
// Weekly Brief — editorial narrative layout. Max-width centered column,
// no sidebar. Reads like a printed dossier.
import { onMounted, computed } from 'vue'
import { useWeeklyBriefStore } from '../store.js'
import {
  HfIcon, HfChip, HfCard, HfButton, HfLogo,
  HfMultiLineChart, HfLineChart,
} from '/js/design-system/hifi/index.js'

const store = useWeeklyBriefStore()
onMounted(() => { if (!store.data) store.load() })

const data = computed(() => store.data)

const toneColor = {
  good: 'var(--hf-good)',
  warn: 'var(--hf-warn)',
  ink:  'var(--hf-ink)',
}

// Format the revenue multi-line series with day labels shared across
// every series (HfMultiLineChart aligns by index).
const revenueSeries = computed(() => {
  if (!data.value) return []
  return data.value.hero.series.map(s => ({
    name: s.name,
    color: s.color,
    data: s.data.map((y, i) => ({ x: data.value.hero.days[i], y, label: data.value.hero.days[i] })),
  }))
})

function zarCompact(v) {
  if (Math.abs(v) >= 1_000_000) return 'R' + (v / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(v) >= 1_000)     return 'R' + (v / 1_000).toFixed(0) + 'k'
  return 'R' + new Intl.NumberFormat('en-ZA').format(v)
}

function forecastTooltip({ point }) {
  return {
    label: point.label,
    value: point.displayValue ?? zarCompact(point.y),
    sub: (point.lower != null && point.upper != null)
      ? `${zarCompact(point.lower)} – ${zarCompact(point.upper)}`
      : '',
  }
}
</script>

<template>
  <div class="brief" v-if="data">
    <article class="brief__page">
      <!-- Masthead -->
      <header class="brief__masthead">
        <HfLogo :size="22" />
        <span class="hf-mono brief__ribbon">{{ data.masthead.ribbon }}</span>
        <div class="brief__actions">
          <HfButton
            v-for="a in data.masthead.actions" :key="a.id"
            :variant="a.variant" size="sm"
          >{{ a.label }}</HfButton>
        </div>
      </header>

      <!-- Summary -->
      <section class="brief__summary">
        <div class="hf-eyebrow">{{ data.summary.eyebrow }}</div>
        <h1 class="brief__headline">
          {{ data.summary.headlineLead }}
          <span class="brief__headline-accent">{{ data.summary.headlineAccent }}</span>
        </h1>
        <p class="brief__lead">
          <template v-for="(part, i) in data.summary.leadParts" :key="i">
            <strong v-if="part.type === 'strong'">{{ part.value }}</strong>
            <template v-else>{{ part.value }}</template>
          </template>
        </p>
      </section>

      <!-- Hero data row -->
      <section class="brief__hero">
        <HfCard :padded="false" class="brief__hero-chart">
          <div class="brief__hero-head">
            <div>
              <div class="hf-eyebrow">Revenue · week over week</div>
              <div class="hf-num brief__hero-value">{{ data.hero.value }}</div>
              <div class="hf-mono brief__hero-delta" :class="data.hero.good ? 'is-good' : 'is-warn'">
                {{ data.hero.delta }}
              </div>
            </div>
            <div class="brief__hero-chips">
              <span v-for="v in data.hero.venues" :key="v.name" class="brief__hero-chip">
                <span class="brief__hero-dot" :style="{ background: v.color }" />
                {{ v.name }}
              </span>
            </div>
          </div>
          <HfMultiLineChart
            :series="revenueSeries"
            :height="180"
            :y-format="zarCompact"
            :show-legend="false"
            title="Revenue by venue, this week"
          />
        </HfCard>

        <div class="brief__hero-kpis">
          <HfCard
            v-for="k in data.heroKpis" :key="k.key"
            :padded="false" class="brief__kpi"
          >
            <div class="brief__kpi-body">
              <div class="hf-eyebrow">{{ k.label }}</div>
              <div class="hf-num brief__kpi-value">{{ k.value }}</div>
            </div>
            <div class="hf-mono brief__kpi-delta" :class="k.good ? 'is-good' : 'is-warn'">
              {{ k.good ? '↑' : '↓' }} {{ k.delta }}
            </div>
          </HfCard>
        </div>
      </section>

      <!-- Three stories -->
      <section class="brief__stories">
        <div class="brief__stories-head">
          <h2 class="brief__section-title">What Ross noticed.</h2>
          <span class="hf-mono brief__stories-meta">{{ data.stories.meta.count }} STORIES · {{ data.stories.meta.subInsights }} SUB-INSIGHTS</span>
        </div>
        <div class="brief__stories-grid">
          <article v-for="s in data.stories.items" :key="s.n" class="brief__story">
            <div class="hf-mono brief__story-num">{{ s.n }}</div>
            <h3 class="brief__story-title">{{ s.title }}</h3>
            <p class="brief__story-detail">{{ s.detail }}</p>
            <div class="brief__story-metric">
              <span class="hf-num brief__story-value" :style="{ color: toneColor[s.tone] }">{{ s.metric.value }}</span>
              <span class="hf-mono brief__story-caption">{{ s.metric.caption }}</span>
            </div>
            <a class="brief__story-link">
              {{ s.linkLabel }}
              <HfIcon name="arrow" :size="12" color="var(--hf-accent-2)" />
            </a>
          </article>
        </div>
      </section>

      <!-- Forecast -->
      <section class="brief__forecast">
        <div class="brief__forecast-head">
          <h2 class="brief__section-title">Forecast · next 7 days.</h2>
          <span class="hf-mono brief__forecast-meta">
            {{ data.forecast.confidence }} · {{ data.forecast.updated }}
          </span>
        </div>
        <HfCard :padded="false" class="brief__forecast-card">
          <HfLineChart
            :data="data.forecast.series"
            :height="200"
            :confidence-band="true"
            fill="var(--hf-accent)"
            stroke="var(--hf-ink)"
            :y-format="zarCompact"
            :tooltip-format="forecastTooltip"
            title="Next 7 days forecast"
          />
          <div class="brief__forecast-days">
            <div v-for="p in data.forecast.series" :key="p.x" class="brief__forecast-day">
              <div class="hf-mono brief__forecast-day-label">{{ p.x }}</div>
              <div class="hf-num brief__forecast-day-value">{{ p.displayValue }}</div>
            </div>
          </div>
        </HfCard>
        <div class="hf-mono brief__forecast-total">{{ data.forecast.totalLabel }}</div>
      </section>

      <!-- Footer -->
      <footer class="brief__footer">
        <span class="hf-mono">{{ data.footer.left }}</span>
        <span class="hf-mono">{{ data.footer.right }}</span>
      </footer>
    </article>
  </div>

  <div v-else class="brief__loading"><div class="hf-eyebrow">Loading brief…</div></div>
</template>

<style scoped>
.brief {
  width: 100%; min-height: 100vh;
  background: var(--hf-bg);
  overflow: auto;
}
.brief__page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 48px 56px;
}
@media (max-width: 720px) { .brief__page { padding: 24px 20px; } }

/* Masthead */
.brief__masthead {
  display: flex; justify-content: space-between; align-items: baseline;
  border-bottom: 1px solid var(--hf-ink);
  padding-bottom: 14px; gap: 16px;
  flex-wrap: wrap;
}
.brief__ribbon {
  font-size: 11px; color: var(--hf-muted);
  letter-spacing: 0.1em;
}
.brief__actions { display: flex; gap: 8px; }

/* Summary */
.brief__summary { margin-top: 40px; }
.brief__headline {
  font-family: var(--hf-font-display);
  font-size: 68px; line-height: 0.98;
  letter-spacing: -0.025em;
  max-width: 900px;
  margin: 12px 0 8px;
  font-weight: 400;
}
@media (max-width: 720px) { .brief__headline { font-size: 40px; } }
.brief__headline-accent { font-style: italic; color: var(--hf-warn); }
.brief__lead {
  font-size: 17px; color: var(--hf-ink-2);
  line-height: 1.55; max-width: 720px;
  margin: 10px 0 0;
}
.brief__lead strong { color: var(--hf-ink); }

/* Hero */
.brief__hero {
  display: grid; grid-template-columns: 2fr 1fr;
  gap: 24px; margin-top: 40px;
}
@media (max-width: 960px) { .brief__hero { grid-template-columns: 1fr; } }
.brief__hero-chart { padding: 24px; }
.brief__hero-head {
  display: flex; justify-content: space-between; align-items: flex-end;
  gap: 16px; flex-wrap: wrap;
  margin-bottom: 16px;
}
.brief__hero-value { font-size: 44px; margin-top: 4px; line-height: 1; }
.brief__hero-delta { font-size: 12px; }
.brief__hero-delta.is-good { color: var(--hf-good); }
.brief__hero-delta.is-warn { color: var(--hf-warn); }
.brief__hero-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.brief__hero-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px;
  font-size: 11px;
  border-radius: 999px;
  border: 1px solid var(--hf-line-2);
  background: var(--hf-paper);
  color: var(--hf-ink);
  font-family: var(--hf-font-body);
}
.brief__hero-dot { width: 6px; height: 6px; border-radius: 50%; }

.brief__hero-kpis { display: flex; flex-direction: column; gap: 10px; }
.brief__kpi {
  padding: 14px;
  display: flex; align-items: center; gap: 14px;
}
.brief__kpi-body { flex: 1; }
.brief__kpi-value { font-size: 24px; line-height: 1; margin-top: 2px; }
.brief__kpi-delta { font-size: 11px; }
.brief__kpi-delta.is-good { color: var(--hf-good); }
.brief__kpi-delta.is-warn { color: var(--hf-warn); }

/* Section title */
.brief__section-title {
  font-family: var(--hf-font-display);
  font-size: 34px; letter-spacing: -0.02em;
  margin: 0; font-weight: 400;
}

/* Stories */
.brief__stories { margin-top: 56px; }
.brief__stories-head { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
.brief__stories-meta { font-size: 11px; color: var(--hf-muted); }
.brief__stories-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 20px; margin-top: 24px;
}
@media (max-width: 960px) { .brief__stories-grid { grid-template-columns: 1fr; } }
.brief__story {
  padding-top: 14px;
  border-top: 1px solid var(--hf-ink);
}
.brief__story-num { font-size: 11px; color: var(--hf-muted); letter-spacing: 0.14em; }
.brief__story-title {
  font-family: var(--hf-font-display);
  font-size: 24px; line-height: 1.2;
  margin: 10px 0 8px; font-weight: 400;
  letter-spacing: -0.01em;
}
.brief__story-detail {
  font-size: 13.5px; color: var(--hf-ink-2);
  line-height: 1.55; margin: 0;
}
.brief__story-metric {
  display: flex; align-items: baseline; gap: 8px;
  margin-top: 16px;
}
.brief__story-value { font-size: 28px; }
.brief__story-caption { font-size: 10px; color: var(--hf-muted); }
.brief__story-link {
  display: inline-flex; align-items: center; gap: 4px;
  margin-top: 12px; font-size: 12px;
  color: var(--hf-accent-2);
  font-family: var(--hf-font-mono);
  cursor: pointer;
}

/* Forecast */
.brief__forecast { margin-top: 56px; }
.brief__forecast-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.brief__forecast-meta { font-size: 11px; color: var(--hf-muted); }
.brief__forecast-card { padding: 24px; margin-top: 16px; }
.brief__forecast-days {
  display: grid; grid-template-columns: repeat(7, 1fr);
  border-top: 1px solid var(--hf-line);
  margin-top: 14px; padding-top: 12px;
}
@media (max-width: 640px) { .brief__forecast-days { grid-template-columns: repeat(4, 1fr); gap: 8px 0; } }
.brief__forecast-day { text-align: center; }
.brief__forecast-day-label { font-size: 10px; color: var(--hf-muted); }
.brief__forecast-day-value { font-size: 16px; margin-top: 2px; }
.brief__forecast-total {
  font-size: 11px; color: var(--hf-muted);
  margin-top: 10px; text-align: center;
}

/* Footer */
.brief__footer {
  margin-top: 64px; padding-top: 20px;
  border-top: 1px solid var(--hf-line);
  display: flex; justify-content: space-between;
  font-size: 11px; color: var(--hf-muted);
  gap: 16px; flex-wrap: wrap;
}

.brief__loading {
  min-height: 100vh; display: grid; place-items: center;
  background: var(--hf-bg);
}
</style>
